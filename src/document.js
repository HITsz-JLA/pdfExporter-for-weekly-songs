import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { parse as parseYaml } from 'yaml';
import { annotateLanguages, withCover } from './language.js';

const md = new MarkdownIt({ html: true, linkify: true, breaks: true, typographer: false });
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export const isImageData = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value);
export const paperSize = paper => paper === 'A5' ? [148, 210] : paper === 'Letter' ? [215.9, 279.4] : [210, 297];

export function settings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const [width, height] = paperSize(input.paper);
  return { paper: ['A4', 'A5', 'Letter'].includes(input.paper) ? input.paper : 'A4',
    fontSize: number(input.fontSize, 12, 8, 32), lineHeight: number(input.lineHeight, 2, 1.4, 3),
    margin: number(input.margin, 18, 8, 40), rubySize: number(input.rubySize, 0.5, 0.35, 0.8),
    fontId: typeof input.fontId === 'string' ? input.fontId : '',
    zhFontId: typeof input.zhFontId === 'string' ? input.zhFontId : (typeof input.fontId === 'string' ? input.fontId : ''),
    jaFontId: typeof input.jaFontId === 'string' ? input.jaFontId : (typeof input.fontId === 'string' ? input.fontId : ''), pageNumbers: input.pageNumbers !== false,
    forceFont: input.forceFont !== false,
    headerEnabled: input.headerEnabled === true, headerText: typeof input.headerText === 'string' ? input.headerText.slice(0, 2000) : '',
    headerFontId: typeof input.headerFontId === 'string' ? input.headerFontId : '', headerFontSize: number(input.headerFontSize, 10, 6, 48),
    headerX: number(input.headerX, 18, 0, width), headerY: number(input.headerY, 8, 0, height),
    headerAlign: ['left', 'center', 'right'].includes(input.headerAlign) ? input.headerAlign : 'left',
    headerColor: /^#[a-f\d]{6}$/i.test(input.headerColor || '') ? input.headerColor : '#69776e', headerBold: input.headerBold === true,
    headerExtraTop: number(input.headerExtraTop, 10, 0, 40),
    watermarkEnabled: input.watermarkEnabled !== false, watermarkX: number(input.watermarkX, width / 2, 0, width),
    watermarkY: number(input.watermarkY, height / 2, 0, height), watermarkWidth: number(input.watermarkWidth, 60, 5, width),
    watermarkOpacity: number(input.watermarkOpacity, 12, 0, 100) };
}
export function pageMargins(options = {}) {
  const s = settings(options);
  return { top: s.margin + (s.headerEnabled && s.headerText.trim() ? s.headerExtraTop : 0), right: s.margin, bottom: s.margin, left: s.margin };
}
export function parseDocument(source, assets = {}, { coverImage = '', watermarkImage = '' } = {}) {
  if (coverImage && (!isImageData(coverImage) || coverImage.length > 17 * 1024 * 1024)) {
    const error = new Error('头图必须为不超过 12 MB 的 PNG、JPEG、WebP 或 GIF 图片。'); error.status = 400; throw error;
  }
  if (watermarkImage && (!isImageData(watermarkImage) || watermarkImage.length > 17 * 1024 * 1024)) {
    const error = new Error('水印必须为不超过 12 MB 的 PNG、JPEG、WebP 或 GIF 图片。'); error.status = 400; throw error;
  }
  let body = source.replace(/^\uFEFF/, '');
  let meta = {};
  const warnings = new Set();
  const front = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (front) {
    try {
      const parsed = parseYaml(front[1], { maxAliasCount: 20 });
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed;
    } catch { warnings.add('YAML 元信息无法解析，已跳过；正文仍可导出。'); }
    body = body.slice(front[0].length);
  }
  const cleanPath = value => {
    try { return decodeURIComponent(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, ''); }
    catch { return value; }
  };
  const imageFor = src => {
    if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(src)) return src;
    const key = cleanPath(src);
    const entries = Object.entries(assets);
    let matches = entries.filter(([name]) => cleanPath(name) === key || cleanPath(name).endsWith('/' + key));
    if (!matches.length) matches = entries.filter(([name]) => cleanPath(name).split('/').pop() === key.split('/').pop());
    if (matches.length === 1 && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(matches[0][1])) return matches[0][1];
    warnings.add(`图片${matches.length > 1 ? '匹配到多个文件' : '未提供'}：${src}。请导入对应图片或资源文件夹。`);
    return null;
  };
  const html = sanitizeHtml(withCover(md.render(body), coverImage), {
    allowedTags: [...new Set([...sanitizeHtml.defaults.allowedTags, 'center', 'ruby', 'rt', 'rp', 'rb', 'rtc', 'img', 'del', 's', 'sub', 'sup', 'br', 'hr', 'details', 'summary', 'input'])],
    allowedAttributes: { '*': ['style', 'class', 'id', 'title', 'lang', 'dir'], a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan', 'align'], th: ['colspan', 'rowspan', 'align'], ol: ['start'], input: ['type', 'checked', 'disabled'], details: ['open'] },
    allowedSchemes: ['http', 'https', 'mailto'], allowedSchemesByTag: { img: ['data'] },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/], 'font-family': [/^[\w\s,"'\-\u0080-\uffff]+$/],
      color: [/^#[\da-f]{3,8}$/i, /^[a-z]+$/i], 'background-color': [/^#[\da-f]{3,8}$/i],
      'font-size': [/^\d{1,2}(\.\d+)?(px|pt|em|rem|%)$/], 'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-style': [/^(normal|italic)$/], 'text-decoration': [/^(underline|line-through|none)$/], 'vertical-align': [/^(top|middle|bottom|super|sub)$/] } },
    transformTags: {
      img: (tag, attrs) => {
        const src = imageFor(attrs.src || '');
        return src ? { tagName: 'img', attribs: { ...attrs, src } }
          : { tagName: 'span', attribs: { class: 'missing-image' }, text: `[图片未导入：${attrs.alt || attrs.src || '图片'}]` };
      },
      audio: () => { warnings.add('PDF 不支持播放音频，音频控件已替换为文字提示。'); return { tagName: 'p', attribs: { class: 'media-note' }, text: '音频（仅供网页播放）' }; },
      video: () => { warnings.add('PDF 不支持播放视频，视频控件已替换为文字提示。'); return { tagName: 'p', attribs: {}, text: '[视频内容]' }; },
      input: (tag, attrs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: '', ...(Object.hasOwn(attrs, 'checked') ? { checked: '' } : {}) } })
    }
  });
  const text = md.utils.unescapeAll(sanitizeHtml(html.replace(/<rt[^>]*>/g, ' '), { allowedTags: [], allowedAttributes: {} }));
  const annotated = annotateLanguages(html, { lyrics: meta.type === 'lyrics' });
  return { ...annotated, watermarkImage, text, title: typeof meta.title === 'string' ? meta.title : 'Markdown 文档', warnings: [...warnings], meta };
}

export function buildHtml(doc, options, faces = [], origin = '') {
  const s = settings(options);
  const mm = paperSize(s.paper);
  const margins = pageMargins(s);
  const marginCss = margins.top === s.margin ? `${s.margin}mm` : `${margins.top}mm ${s.margin}mm ${s.margin}mm ${s.margin}mm`;
  const groups = Array.isArray(faces) ? { zh: faces, ja: faces } : faces;
  const fontFaces = ['zh', 'ja', 'header'].flatMap(lang => (groups[lang] || []).map(f => `@font-face{font-family:Export${lang};src:local(${JSON.stringify(f.postscript)}),local(${JSON.stringify(f.name)}),url("${origin}/api/font/${f.id}");font-weight:${f.weight};font-style:${f.style};font-display:block;}`)).join('\n');
  const stacks = { zh: `${groups.zh?.length ? 'Exportzh,' : ''}"Microsoft YaHei","Noto Sans CJK SC",sans-serif`, ja: `${groups.ja?.length ? 'Exportja,' : ''}"Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif` };
  const fallback = stacks.zh;
  const headerFont = `${groups.header?.length ? 'Exportheader,' : ''}${stacks.zh},${stacks.ja}`;
  const header = s.headerEnabled && s.headerText.trim() ? `<div class="page-overlay header-overlay" aria-hidden="true"><div class="page-header-text">${escapeHtml(s.headerText)}</div></div>` : '';
  const watermark = s.watermarkEnabled && doc.watermarkImage ? `<div class="page-overlay watermark-overlay" aria-hidden="true"><img class="page-watermark" src="${doc.watermarkImage}" alt=""></div>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title><style>
${fontFaces}
@page{size:${s.paper};margin:${marginCss}}
*{box-sizing:border-box}html{background:#e9ebe9}body{margin:0;color:#20272b;font-family:${fallback};font-size:${s.fontSize}pt;line-height:${s.lineHeight};overflow-wrap:anywhere}
.document{position:relative;isolation:isolate;width:${mm[0]}mm;min-height:${mm[1]}mm;margin:20px auto;background:white;padding:${marginCss};box-shadow:0 5px 32px #182c3320}
.document-content{position:relative;z-index:1}
.page-overlay{position:absolute;left:0;top:0;width:${mm[0]}mm;height:${mm[1]}mm;overflow:hidden;pointer-events:none}
.watermark-overlay{z-index:0}.header-overlay{z-index:2}
.page-header-text{position:absolute;left:${s.headerX}mm;top:${s.headerY}mm;width:${Math.max(1, mm[0] - s.headerX - s.margin)}mm;font-family:${headerFont};font-size:${s.headerFontSize}pt;font-weight:${s.headerBold ? 700 : 400};line-height:1.3;text-align:${s.headerAlign};white-space:pre-wrap;overflow-wrap:anywhere;color:${s.headerColor}}
img.page-watermark{position:absolute;left:${s.watermarkX}mm;top:${s.watermarkY}mm;transform:translate(-50%,-50%);width:${s.watermarkWidth}mm;height:auto;max-width:none;max-height:${mm[1]}mm;object-fit:contain;opacity:${s.watermarkOpacity / 100};margin:0}
${s.forceFont ? `.document{font-family:${fallback}!important}` : ''}
.document [lang|="zh"]:not(code):not(pre){font-family:${stacks.zh}${s.forceFont ? '!important' : ''}}
.document [lang|="ja"]:not(code):not(pre){font-family:${stacks.ja}${s.forceFont ? '!important' : ''}}
h1,h2,h3,h4,h5,h6{line-height:1.6;break-after:avoid;margin:1em 0 .6em}h1{font-size:1.85em}h2{font-size:1.5em}h3{font-size:1.2em}h4{font-size:1em}p{margin:.65em 0;orphans:2;widows:2}p:has(>strong:only-child){break-after:avoid}center{display:block;text-align:center}
.document-content p[lang="ja"]:has(>strong:only-child):has(+p[lang="zh-CN"]){margin-bottom:0}
.document-content p[lang="ja"]:has(>strong:only-child)+p[lang="zh-CN"]{margin-top:0;margin-bottom:1.15em}
.document-content p[lang="ja"]:has(>strong:only-child)+p[lang="zh-CN"]+p[lang="ja"]:has(>strong:only-child){margin-top:1.15em}
ruby{ruby-position:over;ruby-align:center}rt{font-size:${s.rubySize}em;line-height:1;letter-spacing:0}ruby,rt{break-inside:avoid}
img{max-width:100%;height:auto;object-fit:contain;max-height:230mm;break-inside:avoid}a{color:#246b63;text-decoration:underline}blockquote{border-left:3px solid #8aa99e;margin:1em 0;padding:.2em 1em;background:#f6f8f6}
.cover-image{margin:0 0 1em;text-align:center;break-inside:avoid}.cover-image img,img.cover-image{display:block;margin-left:auto;margin-right:auto;max-height:60mm;max-width:100%;width:auto;height:auto}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f3;padding:12px;border-radius:5px}code{font-family:Consolas,"Courier New",monospace;font-size:.9em}p code{background:#f2f4f3;padding:.1em .3em}
table{border-collapse:collapse;width:100%;font-size:.92em;table-layout:fixed}th,td{border:1px solid #d4dad7;padding:.4em .6em;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}th{background:#f0f4f1}ul,ol{text-align:start;padding-left:1.8em}li{margin:.3em 0}hr{border:0;border-top:1px solid #d5dcd8;margin:1.5em 0}
.missing-image,.media-note{color:#748079;font-size:.85em}input{accent-color:#347e68}details{display:block}details>*{display:block}summary{font-weight:bold}
@media print{html{background:transparent}.document{position:static;isolation:auto;background:transparent;width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.page-overlay{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit}p,li{orphans:2;widows:2}}
</style></head><body><main class="document">${watermark}${header}<div class="document-content">${doc.html}</div></main></body></html>`;
}
