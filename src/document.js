import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { parse as parseYaml } from 'yaml';
import { annotateLanguages, withCover } from './language.js';

const md = new MarkdownIt({ html: true, linkify: true, breaks: true, typographer: false });
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export const isImageData = value => typeof value === 'string' && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value);

export function settings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  return { paper: ['A4', 'A5', 'Letter'].includes(input.paper) ? input.paper : 'A4',
    fontSize: number(input.fontSize, 12, 8, 32), lineHeight: number(input.lineHeight, 2, 1.4, 3),
    margin: number(input.margin, 18, 8, 40), rubySize: number(input.rubySize, 0.5, 0.35, 0.8),
    fontId: typeof input.fontId === 'string' ? input.fontId : '',
    zhFontId: typeof input.zhFontId === 'string' ? input.zhFontId : (typeof input.fontId === 'string' ? input.fontId : ''),
    jaFontId: typeof input.jaFontId === 'string' ? input.jaFontId : (typeof input.fontId === 'string' ? input.fontId : ''), pageNumbers: input.pageNumbers !== false,
    forceFont: input.forceFont !== false };
}
export function parseDocument(source, assets = {}, { coverImage = '' } = {}) {
  if (coverImage && (!isImageData(coverImage) || coverImage.length > 17 * 1024 * 1024)) {
    const error = new Error('头图必须为不超过 12 MB 的 PNG、JPEG、WebP 或 GIF 图片。'); error.status = 400; throw error;
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
  return { ...annotated, text, title: typeof meta.title === 'string' ? meta.title : 'Markdown 文档', warnings: [...warnings], meta };
}

export function buildHtml(doc, options, faces = [], origin = '') {
  const s = settings(options);
  const mm = s.paper === 'A5' ? [148, 210] : s.paper === 'Letter' ? [215.9, 279.4] : [210, 297];
  const groups = Array.isArray(faces) ? { zh: faces, ja: faces } : faces;
  const fontFaces = ['zh', 'ja'].flatMap(lang => (groups[lang] || []).map(f => `@font-face{font-family:Export${lang};src:local(${JSON.stringify(f.postscript)}),local(${JSON.stringify(f.name)}),url("${origin}/api/font/${f.id}");font-weight:${f.weight};font-style:${f.style};font-display:block;}`)).join('\n');
  const stacks = { zh: `${groups.zh?.length ? 'Exportzh,' : ''}"Microsoft YaHei","Noto Sans CJK SC",sans-serif`, ja: `${groups.ja?.length ? 'Exportja,' : ''}"Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif` };
  const fallback = stacks.zh;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(doc.title)}</title><style>
${fontFaces}
@page{size:${s.paper};margin:${s.margin}mm}
*{box-sizing:border-box}html{background:#e9ebe9}body{margin:0;color:#20272b;font-family:${fallback};font-size:${s.fontSize}pt;line-height:${s.lineHeight};overflow-wrap:anywhere}
.document{width:${mm[0]}mm;min-height:${mm[1]}mm;margin:20px auto;background:white;padding:${s.margin}mm;box-shadow:0 5px 32px #182c3320}
${s.forceFont ? `.document{font-family:${fallback}!important}` : ''}
.document [lang|="zh"]:not(code):not(pre){font-family:${stacks.zh}${s.forceFont ? '!important' : ''}}
.document [lang|="ja"]:not(code):not(pre){font-family:${stacks.ja}${s.forceFont ? '!important' : ''}}
h1,h2,h3,h4,h5,h6{line-height:1.6;break-after:avoid;margin:1em 0 .6em}h1{font-size:1.85em}h2{font-size:1.5em}h3{font-size:1.2em}h4{font-size:1em}p{margin:.65em 0;orphans:2;widows:2}p:has(>strong:only-child){break-after:avoid}center{display:block;text-align:center}
ruby{ruby-position:over;ruby-align:center}rt{font-size:${s.rubySize}em;line-height:1;letter-spacing:0}ruby,rt{break-inside:avoid}
img{max-width:100%;height:auto;object-fit:contain;max-height:230mm;break-inside:avoid}a{color:#246b63;text-decoration:underline}blockquote{border-left:3px solid #8aa99e;margin:1em 0;padding:.2em 1em;background:#f6f8f6}
.cover-image{margin:0 0 1em;text-align:center;break-inside:avoid}.cover-image img,img.cover-image{display:block;margin-left:auto;margin-right:auto;max-height:60mm;max-width:100%;width:auto;height:auto}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f3;padding:12px;border-radius:5px}code{font-family:Consolas,"Courier New",monospace;font-size:.9em}p code{background:#f2f4f3;padding:.1em .3em}
table{border-collapse:collapse;width:100%;font-size:.92em;table-layout:fixed}th,td{border:1px solid #d4dad7;padding:.4em .6em;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}th{background:#f0f4f1}ul,ol{text-align:start;padding-left:1.8em}li{margin:.3em 0}hr{border:0;border-top:1px solid #d5dcd8;margin:1.5em 0}
.missing-image,.media-note{color:#748079;font-size:.85em}input{accent-color:#347e68}details{display:block}details>*{display:block}summary{font-weight:bold}
@media print{html{background:#fff}.document{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit}p,li{orphans:2;widows:2}}
</style></head><body><main class="document">${doc.html}</main></body></html>`;
}
