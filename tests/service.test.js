import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/server.js';
import { closeBrowser } from '../src/pdf.js';

let server, base, fontId, jaFontId;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await closeBrowser(); await new Promise(resolve => server.close(resolve)); });
const post = (endpoint, data, extra = {}) => fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) });
test('服务返回界面、健康状态及本机字体', async () => {
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await (await fetch(base + '/api/health')).json()).ok, true);
  const fontsResponse = await fetch(base + '/api/fonts');
  assert.equal(fontsResponse.headers.get('cache-control'), 'no-store');
  const { fonts } = await fontsResponse.json();
  assert.ok(fonts.length > 0, '本机至少需要一种字体用于测试');
  assert.equal(fonts[0].file, undefined);
  assert.ok(fonts.every(f => f.displayFamily && f.displayName && Array.isArray(f.searchNames)));
  const yahei = fonts.find(f => f.family === 'Microsoft YaHei');
  if (yahei) assert.equal(yahei.displayFamily, '微软雅黑');
  fontId = (fonts.find(f => /Microsoft YaHei|微软雅黑/.test(f.family) && f.weight === 400) || fonts[0]).id;
  jaFontId = (fonts.find(f => /Yu Gothic|游ゴシック/.test(f.family) && f.weight === 400) || fonts[0]).id;
  assert.equal((await fetch(base + '/api/font/' + fontId)).status, 200);
  assert.equal((await fetch(base + '/api/font/not-a-font')).status, 404);
});
test('非法请求和跨站来源被拒绝', async () => {
  assert.equal((await post('/api/preview', { markdown: 12 })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello', options: { fontId: 'unknown' } })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/preview', { markdown: '# hello', coverImage: 'not-image' })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello', options: { jaFontId: 'unknown' } })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello', watermarkImage: 'not-image' })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello', watermarkImage: {} })).status, 400);
  assert.equal((await post('/api/preview', { markdown: '# hello', options: { headerFontId: 'unknown' } })).status, 400);
});
test('页眉使用独立字体检测缺字，预览包含真实参数和水印', async () => {
  const data = { markdown: '正文', watermarkImage: 'data:image/png;base64,iVBORw0KGgo=', options: {
    zhFontId: fontId, jaFontId, headerFontId: jaFontId, headerEnabled: true, headerText: '日本語 ABC',
    headerX: 24, headerY: 7, headerFontSize: 11, watermarkX: 70, watermarkY: 80, watermarkWidth: 40, watermarkOpacity: 25
  } };
  const checked = await (await post('/api/coverage', data)).json();
  assert.equal(checked.languages.header.missingCount, 0);
  assert.equal(checked.languages.header.total, 6);
  assert.equal(checked.languages.header.font, checked.languages.ja.font);
  const preview = await (await post('/api/preview', data)).json();
  assert.match(preview.html, /left:24mm;top:7mm/);
  assert.match(preview.html, /opacity:0\.25/);
  assert.match(preview.html, /class="page-header-text">日本語 ABC/);
  assert.match(preview.html, /class="page-watermark"/);
});
test('独立头图和分语言缺字检测使用不同字体及不同正文', async () => {
  const data = { markdown: '<p lang="zh-CN">中文</p>\n\n<p lang="ja">日本語の文</p>',
    options: { zhFontId: fontId, jaFontId }, coverImage: 'data:image/png;base64,iVBORw0KGgo=' };
  const preview = await (await post('/api/preview', data)).json();
  assert.match(preview.html, /cover-image/);
  assert.equal(preview.languageStats.zh, 2);
  assert.equal(preview.languageStats.ja, 5);
  const checked = await (await post('/api/coverage', data)).json();
  assert.equal(checked.languages.zh.total, 2);
  assert.equal(checked.languages.ja.total, 5);
  assert.equal(checked.languages.zh.missingCount, 0);
  assert.equal(checked.languages.ja.missingCount, 0);
  assert.notEqual(checked.languages.zh.font, checked.languages.ja.font);
});
test('实际缺字检查区分字体已覆盖字符和罕见字符', async () => {
  const res = await post('/api/coverage', { markdown: 'ABC\u{10ffff}', options: { fontId } });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.ok(result.missing.includes('\u{10ffff}'));
  assert.ok(!result.missing.includes('A'));
});
test('排版引擎实际生成带注音的 PDF 字节', async () => {
  const res = await post('/api/export', { markdown: '---\ntitle: 导出测试\n---\n\n<center>\n\n## 测试\n\n**<ruby>春<rt>はる</rt></ruby>**\n\n中文译文\n\n</center>', options: { zhFontId: fontId, jaFontId, pageNumbers: true, headerEnabled: true, headerText: '测试页眉', headerFontId: fontId }, coverImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yB9sAAAAASUVORK5CYII=' });
  if (!res.ok) assert.fail(await res.text());
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 5000);
});
