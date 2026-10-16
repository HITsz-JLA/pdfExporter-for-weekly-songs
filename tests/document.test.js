import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, buildHtml, pageMargins, settings } from '../src/document.js';

test('YAML、center 内 Markdown 和 ruby 注音同时保留', () => {
  const doc = parseDocument('---\ntitle: 测试\ntype: lyrics\n---\n\n<center style="font-family: Yu Gothic; text-align: center">\n\n## 标题\n\n**<ruby>春<rt>はる</rt></ruby>**\n\n中文歌词\n\n</center>');
  assert.equal(doc.title, '测试');
  assert.match(doc.html, /<h2 lang="zh-CN">标题<\/h2>/);
  assert.match(doc.html, /<strong lang="ja"><ruby lang="ja">春<rt lang="ja">はる<\/rt><\/ruby><\/strong>/);
  assert.match(doc.html, /<center style="font-family:Yu Gothic;text-align:center"/);
  assert.doesNotMatch(doc.html, /type: lyrics/);
});
test('头图替换文首图片且不出现缺图警告；无原图时前置头图', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const replaced = parseDocument('---\ntitle: 标题\n---\n\n![原封面](/image/a.jpg)\n\n## 正文', {}, { coverImage: image });
  assert.equal((replaced.html.match(/<img /g) || []).length, 1);
  assert.match(replaced.html, /class="cover-image"/);
  assert.equal(replaced.warnings.length, 0);
  assert.doesNotMatch(replaced.html, /原封面.*image\/a.jpg/);
  const added = parseDocument('## 正文\n\n![正文图](/b.png)', {}, { coverImage: image });
  assert.ok(added.html.indexOf('cover-image') < added.html.indexOf('<h2'));
  assert.ok(added.warnings.some(w => w.includes('/b.png')));
  assert.throws(() => parseDocument('# test', {}, { coverImage: 'https://example.org/a.png' }), /头图必须/);
});
test('中文译文、全汉字加粗歌词和注音分用语言；中文讲解保留中文主体', () => {
  const doc = parseDocument('---\ntype: lyrics\n---\n\n<center>\n\n**愛**\n\n爱\n\n**<ruby>溢<rt>あふ</rt></ruby>れそう**\n\n情感即将满溢\n\n</center>\n\n1. **<ruby>溢<rt>あふ</rt></ruby>れそう**：由动词「溢れる」构成，表示情感积蓄。');
  assert.match(doc.html, /<p lang="ja"><strong lang="ja">愛/);
  assert.match(doc.html, /<p lang="zh-CN">爱/);
  assert.match(doc.html, /<li lang="zh-CN">/);
  assert.ok(doc.textByLanguage.ja.includes('「溢れる」'));
  assert.ok(doc.textByLanguage.zh.includes('构成，表示情感积蓄'));
  assert.ok(!doc.textByLanguage.ja.includes('情感积蓄'));
});
test('显式 lang 可纠正纯汉字识别；代码不参与语言字体检查', () => {
  const doc = parseDocument('<p lang="ja">東京</p>\n\n<p lang="zh-CN">加粗的中文 <strong>上海</strong></p>\n\n`const codeOnly = 1`');
  assert.match(doc.html, /<p lang="ja">東京/);
  assert.match(doc.html, /<strong lang="zh-CN">上海/);
  assert.ok(doc.textByLanguage.ja.includes('東京'));
  assert.ok(doc.textByLanguage.zh.includes('上海'));
  assert.ok(!doc.textByLanguage.zh.includes('codeOnly'));
});
test('中日字体分别生成字体规则，兼容旧单字体参数', () => {
  const fake = id => ({ id, postscript: id, name: id, weight: 400, style: 'normal' });
  const html = buildHtml(parseDocument('中文\n\n日本語の文'), {}, { zh: [fake('chinese')], ja: [fake('japanese')] });
  assert.match(html, /font-family:Exportzh;.*\/api\/font\/chinese/);
  assert.match(html, /font-family:Exportja;.*\/api\/font\/japanese/);
  assert.equal(settings({ fontId: 'legacy' }).zhFontId, 'legacy');
  assert.equal(settings({ fontId: 'legacy' }).jaFontId, 'legacy');
});
test('移除脚本、事件和危险 CSS，并保留代码块里的 HTML 字面文本', () => {
  const doc = parseDocument('<script>alert(1)</script>\n\n<img src="file:///c:/secret" onerror="alert(1)">\n\n<span style="background-image:url(http://evil);color:#123">正常</span>\n\n```html\n<ruby>春<rt>はる</rt></ruby>\n```');
  assert.doesNotMatch(doc.html, /<script|onerror|src="file:|background-image/);
  assert.match(doc.html, /color:#123/);
  assert.match(doc.html, /&lt;ruby&gt;/);
  assert.equal(doc.warnings.length, 1);
});
test('图片匹配资源目录，不静默选择同名冲突图片', () => {
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  const doc = parseDocument('![封面](/image/a.png)', { 'site/image/a.png': img });
  assert.match(doc.html, /<img src="data:image\/png/);
  assert.equal(doc.warnings.length, 0);
  const single = parseDocument('![封面](/image/a.png)', { 'a.png': img });
  assert.match(single.html, /<img src="data:image\/png/);
  assert.equal(single.warnings.length, 0);
  const collision = parseDocument('![](/image/a.png)', { 'a/image/a.png': img, 'b/image/a.png': img });
  assert.match(collision.warnings[0], /多个文件/);
});
test('音频用文字提示，超链接保留，字符检测解码实体', () => {
  const doc = parseDocument('<audio controls src="/music/test.mp3"></audio>\n\n[A & B](https://example.org)');
  assert.match(doc.html, /音频/);
  assert.match(doc.warnings[0], /音频/);
  assert.match(doc.html, /href="https:\/\/example.org"/);
  assert.match(doc.text, /A & B/);
});
test('数字设置限制范围；字体覆盖和纸张设置生效', () => {
  assert.equal(settings({ fontSize: 999 }).fontSize, 32);
  assert.equal(settings({ margin: -9 }).margin, 8);
  assert.equal(settings({ lineHeight: 'oops' }).lineHeight, 2);
  assert.equal(settings({ paper: 'evil' }).paper, 'A4');
  assert.equal(settings(null).paper, 'A4');
  const html = buildHtml(parseDocument('# Test'), { paper: 'A5', margin: 20 });
  assert.match(html, /@page\{size:A5;margin:20mm\}/);
  assert.match(html, /font-family:.*!important/);
});
test('页眉和水印受纸张边界及字号限制，文字按纯文本转义', () => {
  const opts = settings({ paper: 'A5', headerEnabled: true, headerText: '<script>alert(1)</script>\n学习笔记',
    headerX: 999, headerY: -1, headerFontSize: 999, headerColor: 'red; display:none',
    watermarkX: 999, watermarkY: -5, watermarkWidth: 999, watermarkOpacity: 150 });
  assert.equal(opts.headerX, 148); assert.equal(opts.headerY, 0); assert.equal(opts.headerFontSize, 48);
  assert.equal(opts.headerColor, '#69776e'); assert.equal(opts.watermarkX, 148); assert.equal(opts.watermarkY, 0);
  assert.equal(opts.watermarkWidth, 148); assert.equal(opts.watermarkOpacity, 100);
  const doc = parseDocument('正文', {}, { watermarkImage: 'data:image/png;base64,iVBORw0KGgo=' });
  const html = buildHtml(doc, opts);
  assert.match(html, /class="page-header-text">&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /class="page-watermark"/);
  assert.match(html, /\.page-overlay\{display:none\}/);
  assert.match(html, /width:148mm;height:auto/);
});
test('页眉与水印可以分别关闭；不影响原有头图', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const doc = parseDocument('正文', {}, { coverImage: image, watermarkImage: image });
  const html = buildHtml(doc, { headerText: '隐藏页眉', headerEnabled: false, watermarkEnabled: false });
  assert.doesNotMatch(html, /class="page-header-text"|class="page-watermark"/);
  assert.match(html, /class="cover-image"/);
  assert.throws(() => parseDocument('test', {}, { watermarkImage: 'file:///local.png' }), /水印必须/);
});
test('仅在有页眉文字时增加上边距，预览与打印使用同一留白', () => {
  assert.equal(pageMargins({}).top, 18);
  assert.equal(pageMargins({ headerEnabled: true, headerText: '' }).top, 18);
  assert.equal(pageMargins({ headerEnabled: true, headerText: '页眉' }).top, 28);
  assert.equal(pageMargins({ headerEnabled: true, headerText: '页眉', headerExtraTop: 16 }).top, 34);
  assert.equal(pageMargins({ headerEnabled: true, headerText: '页眉' }).bottom, 18);
  const html = buildHtml(parseDocument('正文'), { headerEnabled: true, headerText: '页眉' });
  assert.match(html, /@page\{size:A4;margin:28mm 18mm 18mm 18mm\}/);
  assert.match(html, /padding:28mm 18mm 18mm 18mm/);
});
