const $ = id => document.getElementById(id);
const sample = `---
title: "日文注音 · 排版示例"
type: lyrics
---

<center style="font-family: 'Yu Gothic', sans-serif;">

## 言葉のノート
#### 语言与文字的练习

**<ruby>春<rt>はる</rt></ruby>の<ruby>風<rt>かぜ</rt></ruby>が<ruby>吹<rt>ふ</rt></ruby>いている**

春风轻轻吹拂

**<ruby>新<rt>あたら</rt></ruby>しい<ruby>言葉<rt>ことば</rt></ruby>を<ruby>覚<rt>おぼ</rt></ruby>えよう**

一起学习新的词语吧

**<ruby>空<rt>そら</rt></ruby>を<ruby>見上<rt>みあ</rt></ruby>げて**

抬头仰望天空

</center>

---

### 词汇笔记

| 单词 | 读音 | 含义 |
| --- | --- | --- |
| 春 | はる | 春天 |
| 言葉 | ことば | 语言、词语 |
| 見上げる | みあげる | 抬头看 |

> 保留 **加粗**、居中排版、表格与 HTML 注音。

1. 导入 Markdown 文档。
2. 选择本机字体，检查是否缺字。
3. 调整版式，导出 PDF。
`;
let assets = Object.create(null);
let coverImage = '';
let watermarkImage = '';
let fonts = [];
let title = '日文注音 · 排版示例';
let timer;
let previewSequence = 0;
let coverageSequence = 0;
const optionIds = ['zh-font', 'ja-font', 'fontSize', 'lineHeight', 'margin', 'rubySize', 'paper', 'pageNumbers', 'forceFont',
  'headerEnabled', 'headerText', 'header-font', 'headerAlign', 'headerColor', 'headerBold', 'watermarkEnabled'];
function payload() {
  return { markdown: $('editor').value, assets, coverImage, watermarkImage, options: {
    zhFontId: $('zh-font').value, jaFontId: $('ja-font').value, fontSize: Number($('fontSize').value), lineHeight: Number($('lineHeight').value),
    margin: Number($('margin').value), rubySize: Number($('rubySize').value), paper: $('paper').value,
    pageNumbers: $('pageNumbers').checked, forceFont: $('forceFont').checked,
    headerEnabled: $('headerEnabled').checked, headerText: $('headerText').value, headerFontId: $('header-font').value,
    headerFontSize: Number($('headerFontSize').value), headerX: Number($('headerX').value), headerY: Number($('headerY').value),
    headerAlign: $('headerAlign').value, headerColor: $('headerColor').value, headerBold: $('headerBold').checked, headerExtraTop: Number($('headerExtraTop').value),
    watermarkEnabled: $('watermarkEnabled').checked, watermarkX: Number($('watermarkX').value), watermarkY: Number($('watermarkY').value),
    watermarkWidth: Number($('watermarkWidth').value), watermarkOpacity: Number($('watermarkOpacity').value)
  } };
}
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function fitPreview() {
  const page = $('preview').contentDocument?.querySelector('.document');
  if (!page) return;
  const width = $('paper').value === 'A5' ? 148 : $('paper').value === 'Letter' ? 215.9 : 210;
  page.style.zoom = Math.min(1, Math.max(0.25, ($('preview').clientWidth - 32) / (width * 96 / 25.4)));
}
$('preview').addEventListener('load', fitPreview);
new ResizeObserver(fitPreview).observe($('preview'));
async function api(url, data) {
  const res = await fetch(url, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  if (!res.ok) { let error; try { error = (await res.json()).error; } catch {} throw new Error(error || `请求失败 (${res.status})`); }
  return res;
}
function invalidateCoverage() { coverageSequence++; $('coverage-result').textContent = '字体或文档已更改，可重新检查缺字。'; }
function schedule() { clearTimeout(timer); invalidateCoverage(); timer = setTimeout(preview, 450); }
async function preview() {
  clearTimeout(timer);
  const sequence = ++previewSequence;
  status('正在更新预览…');
  $('ruby-value').value = Math.round(Number($('rubySize').value) * 100) + '%';
  $('paper-label').textContent = $('paper').selectedOptions[0].textContent;
  try {
    const result = await (await api('/api/preview', payload())).json();
    if (sequence !== previewSequence) return;
    $('preview').srcdoc = result.html;
    title = result.title;
    $('char-count').textContent = result.characters.toLocaleString() + ' 字符';
    $('language-stats').textContent = `已识别：中文 ${result.languageStats.zh} 字符 · 日文 ${result.languageStats.ja} 字符（含注音）`;
    $('warnings').replaceChildren(...(result.warnings.length ? result.warnings : ['格式检查通过，可导出 PDF。']).map(text => {
      const li = document.createElement('li'); li.textContent = text; return li;
    }));
    status('预览已更新 · 自动分页结果以 PDF 为准');
  } catch (error) { if (sequence === previewSequence) status(error.message, true); }
}
function showFonts() {
  const terms = $('font-search').value.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const families = new Map();
  for (const f of fonts) {
    const previous = families.get(f.family);
    if (!previous || (f.style === 'normal' && Math.abs(f.weight - 400) < Math.abs(previous.weight - 400))) families.set(f.family, f);
  }
  for (const [id, label] of [['zh-font', '中文系统默认字体'], ['ja-font', '日文系统默认字体'], ['header-font', '跟随中文字体']]) {
    const old = $(id).value;
    const visible = [...families.values()].filter(f => terms.every(term => (f.searchNames || [f.family, f.name]).join(' ').normalize('NFKC').toLowerCase().includes(term)) || f.id === old);
    const groups = (id === 'ja-font' ? ['ja', 'zh', 'other'] : ['zh', 'ja', 'other']).map(category => {
      const group = document.createElement('optgroup');
      group.label = { zh: '中文字体', ja: '日文字体', other: '其他字体' }[category];
      for (const font of visible.filter(f => (f.category || 'other') === category).sort((a, b) => (a.displayFamily || a.family).localeCompare(b.displayFamily || b.family, 'zh-CN'))) {
        const readable = font.displayFamily || font.family;
        const option = new Option(readable === font.family ? font.family : `${readable}（${font.family}）`, font.id);
        option.title = option.textContent; group.append(option);
      }
      return group;
    }).filter(group => group.children.length);
    $(id).replaceChildren(new Option(label, ''), ...groups);
    $(id).value = visible.some(f => f.id === old) ? old : '';
    $(id).title = $(id).selectedOptions[0]?.textContent || label;
  }
  $('font-count').textContent = `· ${families.size} 种`;
}
async function loadFonts(refresh = false) {
  $('scan-fonts').disabled = true;
  try {
    fonts = (await (await api('/api/fonts' + (refresh ? '?refresh=1' : ''))).json()).fonts;
    showFonts();
    if (!refresh) for (const [id, pattern] of [['zh-font', /^(Microsoft YaHei|微软雅黑|Noto Sans CJK SC)$/i], ['ja-font', /^(Yu Gothic|游ゴシック|Meiryo|Noto Sans CJK JP)$/i]]) {
      const preferred = fonts.find(f => pattern.test(f.family) && f.weight === 400 && f.style === 'normal');
      if (preferred && !$(id).value) $(id).value = preferred.id;
    }
    invalidateCoverage();
    await preview();
  } catch (error) { status('字体检测失败：' + error.message, true); }
  finally { $('scan-fonts').disabled = false; }
}
async function readMarkdown(file) {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) return status('请选择 .md、.markdown 或 .txt 文件。', true);
  if (file.size > 4 * 1024 * 1024) return status('Markdown 文件过大，请控制在 4 MB 内。', true);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    assets = Object.create(null); updateAssetCount(); setCover('');
    $('editor').value = text; $('filename').textContent = file.name; $('filename').title = file.name;
    invalidateCoverage(); await preview();
  } catch (error) { status('无法导入，请确认文档使用 UTF-8 编码：' + error.message, true); }
}
function updateAssetCount() { $('asset-count').textContent = `${Object.keys(assets).length} 张图片`; }
function setCover(data, name = '') {
  coverImage = data;
  $('cover-name').textContent = name || '未选择'; $('cover-name').title = name;
  $('cover-preview').hidden = !data; $('clear-cover').disabled = !data;
  if (data) $('cover-preview').src = data; else $('cover-preview').removeAttribute('src');
}
function checkImageBudget(nextAssets, nextCover, nextWatermark = watermarkImage) {
  if (JSON.stringify(nextAssets).length + nextCover.length + nextWatermark.length > 30 * 1024 * 1024) throw new Error('头图、水印与配套图片总量过大，请控制图片合计在约 22 MB 内。');
}
function updateDecorationControls() {
  $('header-fields').disabled = !$('headerEnabled').checked;
  $('watermark-fields').disabled = !watermarkImage || !$('watermarkEnabled').checked;
}
function setWatermark(data, name = '') {
  watermarkImage = data; $('watermark-name').textContent = name || '未选择图片'; $('watermark-name').title = name;
  $('watermark-preview').hidden = !data; $('clear-watermark').disabled = !data;
  if (data) { $('watermark-preview').src = data; $('watermarkEnabled').checked = true; }
  else $('watermark-preview').removeAttribute('src');
  updateDecorationControls();
}
function syncPair(id, normalize = false) {
  const input = $(id); const range = $(id + '-range');
  if (normalize) input.value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) || 0));
  if (input.value !== '' && Number.isFinite(Number(input.value))) range.value = input.value;
}
function updatePageLimits() {
  const [width, height] = $('paper').value === 'A5' ? [148, 210] : $('paper').value === 'Letter' ? [215.9, 279.4] : [210, 297];
  for (const [id, max] of [['headerX', width], ['headerY', height], ['watermarkX', width], ['watermarkY', height], ['watermarkWidth', width]]) {
    $(id).max = max; $(id + '-range').max = max; syncPair(id, true);
  }
}
async function imageData(file) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('请选择 PNG、JPEG、WebP 或 GIF 图片。');
  if (file.size > 12 * 1024 * 1024) throw new Error(`图片 ${file.name} 超过 12 MB，请压缩后导入。`);
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); });
}
async function importImages(files) {
  const candidates = [...files].filter(file => /\.(png|jpe?g|gif|webp)$/i.test(file.name));
  if (!candidates.length) return status('未找到 PNG、JPEG、WebP 或 GIF 图片。', true);
  try {
    const next = { ...assets };
    let ignored = 0;
    for (const file of candidates) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { ignored++; continue; }
      const data = await imageData(file);
      next[file.webkitRelativePath || file.name] = data;
    }
    checkImageBudget(next, coverImage);
    assets = next; updateAssetCount(); await preview();
    if (ignored) status(`已导入图片，跳过 ${ignored} 个不支持的文件。`);
  } catch (error) { status(error.message || '图片导入失败。', true); }
}
$('editor').value = sample;
$('editor').addEventListener('input', schedule);
for (const id of optionIds) $(id).addEventListener('input', schedule);
for (const id of ['zh-font', 'ja-font', 'header-font']) $(id).addEventListener('change', () => { $(id).title = $(id).selectedOptions[0]?.textContent || ''; });
for (const range of document.querySelectorAll('input[data-number]')) {
  const id = range.dataset.number;
  range.addEventListener('input', () => { $(id).value = range.value; schedule(); });
  $(id).addEventListener('input', () => { syncPair(id); schedule(); });
  $(id).addEventListener('change', () => { syncPair(id, true); schedule(); });
}
$('paper').addEventListener('input', updatePageLimits);
$('headerEnabled').addEventListener('input', updateDecorationControls);
$('watermarkEnabled').addEventListener('input', updateDecorationControls);
$('refresh').onclick = preview;
$('sample').onclick = () => { $('editor').value = sample; $('filename').textContent = '排版示例.md'; assets = Object.create(null); updateAssetCount(); setCover(''); invalidateCoverage(); preview(); };
$('dropzone').onclick = () => $('file').click();
$('dropzone').onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('file').click(); } };
$('file').onchange = event => { if (event.target.files[0]) readMarkdown(event.target.files[0]); event.target.value = ''; };
for (const type of ['dragenter', 'dragover']) $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.add('drag'); });
for (const type of ['dragleave', 'drop']) $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.remove('drag'); });
$('dropzone').addEventListener('drop', event => { if (event.dataTransfer.files[0]) readMarkdown(event.dataTransfer.files[0]); });
$('pick-images').onclick = () => $('images').click(); $('pick-folder').onclick = () => $('folder').click();
$('images').onchange = event => { importImages(event.target.files); event.target.value = ''; };
$('folder').onchange = event => { importImages(event.target.files); event.target.value = ''; };
$('clear-assets').onclick = () => { assets = Object.create(null); updateAssetCount(); preview(); };
$('pick-cover').onclick = () => $('cover-file').click();
$('clear-cover').onclick = () => { setCover(''); invalidateCoverage(); preview(); };
$('cover-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try { const data = await imageData(file); checkImageBudget(assets, data); setCover(data, file.name); invalidateCoverage(); await preview(); }
  catch (error) { status(error.message, true); }
};
$('font-search').oninput = showFonts;
$('pick-watermark').onclick = () => $('watermark-file').click();
$('clear-watermark').onclick = () => { setWatermark(''); preview(); };
$('watermark-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try { const data = await imageData(file); checkImageBudget(assets, coverImage, data); setWatermark(data, file.name); await preview(); }
  catch (error) { status(error.message, true); }
};
$('center-watermark').onclick = () => {
  $('watermarkX').value = Number($('watermarkX').max) / 2; $('watermarkY').value = Number($('watermarkY').max) / 2;
  syncPair('watermarkX'); syncPair('watermarkY'); preview();
};
$('scan-fonts').onclick = () => loadFonts(true);
$('coverage').onclick = async () => {
  if (!$('zh-font').value && !$('ja-font').value && !($('headerEnabled').checked && $('header-font').value)) { $('coverage-result').textContent = '请先选择中文、日文或页眉字体。'; return; }
  const sequence = ++coverageSequence;
  $('coverage').disabled = true; $('coverage-result').textContent = '正在检查所选字体的字符覆盖…';
  try {
    const result = await (await api('/api/coverage', payload())).json();
    if (sequence !== coverageSequence) return;
    $('coverage-result').replaceChildren(...Object.entries(result.languages).map(([lang, data]) => {
      const line = document.createElement('div'); const label = { zh: '中文', ja: '日文', header: '页眉' }[lang];
      line.textContent = data.skipped ? `${label}：使用系统默认字体，未检查。` : data.missingCount ? `${label}（${data.font}）：缺少 ${data.missingCount} 个字符：${data.missing.join(' ')}${data.missingCount > 150 ? ' …' : ''}。建议更换对应字体。` : `${label}（${data.font}）：${data.total} 个不同字符全部覆盖。`;
      return line;
    }));
  } catch (error) { if (sequence === coverageSequence) $('coverage-result').textContent = error.message; }
  finally { $('coverage').disabled = false; }
};
$('export').onclick = async () => {
  if (!$('editor').value.trim()) return status('请先导入或输入 Markdown 文档。', true);
  $('export').disabled = true; status('正在排版并生成 PDF，请稍候…');
  try {
    const res = await api('/api/export', payload());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    const match = res.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''(.+)$/);
    a.download = match ? decodeURIComponent(match[1]) : title + '.pdf';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    status('PDF 已生成并下载。');
  } catch (error) { status('导出失败：' + error.message, true); }
  finally { $('export').disabled = false; }
};
updatePageLimits(); updateDecorationControls(); preview(); loadFonts();
