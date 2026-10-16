import fs from 'node:fs';
import { parseDocument as parseHtml } from 'htmlparser2';
import render from 'dom-serializer';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const serialize = node => render(node, { encodeEntities: 'utf8' });
const textOf = node => node.type === 'text' ? node.data : (node.children || []).filter(n => n.name !== 'rt').map(textOf).join('');
const meaningful = nodes => nodes.filter(n => n.type !== 'comment' && (n.type !== 'text' || n.data.trim()));
const imageData = (path, mime) => `data:image/${mime};base64,${fs.readFileSync(new URL(path, import.meta.url)).toString('base64')}`;
const bundledCover = imageData('../examples/masukatto.jpg', 'jpeg');
const clubLogo = imageData('../public/assets/club-logo.png', 'png');

export const isWeeklySong = (doc, options = {}) => options.theme === 'weekly' || (options.theme !== 'plain' && doc.meta.type === 'lyrics');

// Only known, packaged examples are resolved; Markdown can never read arbitrary local files.
export function exampleImage(src) {
  return /^\/?(?:image\/)?masukatto\.jpg$/i.test(src.replace(/\\/g, '/')) ? bundledCover : null;
}

export function removeRedundantRuby(html) {
  const dom = parseHtml(html);
  function visit(node) {
    if (node.name === 'pre' || node.name === 'code') return;
    node.children = (node.children || []).flatMap(child => {
      if (child.name === 'ruby' && !/\p{Script=Han}/u.test(textOf(child))) {
        return (child.children || []).filter(n => !['rt', 'rp', 'rtc'].includes(n.name));
      }
      visit(child); return [child];
    });
  }
  visit(dom); return serialize(dom);
}

export function weeklyInfo(doc, sourceName = '') {
  const dom = parseHtml(doc.html);
  // Keep inherited inline fonts when flattening layout containers. forceFont
  // still overrides these when the corresponding checkbox is enabled.
  function inheritFont(node, inherited = '') {
    const style = node.attribs?.style || '';
    const font = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(style)?.[1] || inherited;
    if (node.attribs && font && !/(?:^|;)\s*font-family\s*:/i.test(style)) node.attribs.style = `${style};font-family:${font}`;
    for (const child of node.children || []) inheritFont(child, font);
  }
  inheritFont(dom);
  const nodes = [];
  const flatten = node => {
    if (['center', 'div', 'section'].includes(node.name) && !/music-buttons/.test(node.attribs?.class || '')) {
      meaningful(node.children || []).forEach(flatten);
    } else nodes.push(node);
  };
  meaningful(dom.children).forEach(flatten);
  const credits = {};
  const blocks = [];
  let title = doc.title, cover = '', seenLyrics = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], text = textOf(node).trim();
    const children = meaningful(node.children || []);
    if (!seenLyrics && ['p', 'figure'].includes(node.name) && children.length === 1 && children[0].name === 'img') {
      cover = serialize(children[0]); continue;
    }
    if (!seenLyrics && node.name === 'img') { cover = serialize(node); continue; }
    if (!seenLyrics && ['h1', 'h2'].includes(node.name)) { title = text; continue; }
    const credit = /^\s*(专辑|作曲|作词|编曲)[：:]\s*(.*)$/.exec(text);
    if (!seenLyrics && /^h[1-6]$/.test(node.name || '') && credit) { credits[credit[1]] = credit[2]; continue; }
    if (/music-buttons|media-note/.test(node.attribs?.class || '') || node.name === 'br' || (node.name === 'p' && children.every(n => n.name === 'br'))) continue;
    const next = nodes[i + 1];
    if (node.name === 'p' && children.length === 1 && children[0].name === 'strong' && next?.name === 'p' && !meaningful(next.children || []).some(n => n.name === 'strong')) {
      seenLyrics = true;
      blocks.push({ kind: 'lyric', html: `<div class="lyric-pair"><div class="lyric-jp" lang="ja">${serialize(children[0])}</div><div class="lyric-cn" lang="zh-CN">${serialize(next)}</div></div>` });
      i++; continue;
    }
    if (node.name === 'ol' && meaningful(node.children || []).every(n => n.name === 'li')) {
      let n = Number(node.attribs.start) || 1;
      for (const item of meaningful(node.children)) {
        const parts = meaningful(item.children || []);
        // markdown-it wraps list paragraphs when the list contains blank lines.
        const first = parts[0]?.name === 'p' ? meaningful(parts[0].children) : parts;
        if (first[0]?.name === 'strong') {
          const term = serialize(first[0].children);
          const body = serialize(first.slice(1)).replace(/^\s*[：:]\s*/, '');
          const rest = parts[0]?.name === 'p' ? serialize(parts.slice(1)) : '';
          blocks.push({ kind: 'vocab', html: `<div class="vocab-entry"><div class="vocab-term"><span class="vocab-number">${n++}</span><strong lang="ja">${term}</strong></div><div class="vocab-body" lang="zh-CN">${body}${rest}</div></div>` });
        } else blocks.push({ kind: 'other', html: `<ol start="${n++}">${serialize(item)}</ol>` });
      }
      continue;
    }
    if (/^h[1-6]$/.test(node.name || '') && /词汇/.test(text)) {
      blocks.push({ kind: 'notes-title', html: `<div class="notes-heading">${escape(text.replace(/[：:]$/, ''))}</div>` }); continue;
    }
    blocks.push({ kind: 'other', html: serialize(node) });
  }
  const slug = String(doc.meta.slug || sourceName.replace(/\.[^.]+$/, '') || '').trim();
  const explicit = doc.meta.weekly_url || doc.meta.url;
  const url = typeof explicit === 'string' && /^https?:\/\//.test(explicit) ? explicit
    : `http://jpa.guramod.club/lyrics/${slug && !/[\\/#?]/.test(slug) ? encodeURIComponent(slug) + '/' : ''}`;
  return { title, shortTitle: title.replace(/\s+-\s+/g, ' / '), cover, credits, blocks, url };
}

// Exact geometry and preblended colors from the reusable LaTeX edition.
export function pageBackground(width, height) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#cbb693"/>`;
  for (let x = 0; x <= width; x += 2) svg += `<path d="M${x} 0V${height}" stroke="#d3c1a3" stroke-width=".65"/><path d="M${x} 0V${height}" stroke="#c4ae8d" stroke-width=".1"/>`;
  for (let y = 0; y <= height; y += 24) svg += `<path d="M0 ${y}H${width}" stroke="#c0aa8a" stroke-width=".15"/>`;
  svg += `<rect x="12" y="11" width="${width - 24}" height="${height - 22}" fill="#f8ebd6"/>`;
  for (let y = 11; y <= height - 11; y += 2) svg += `<path d="M12 ${y}H${width - 12}" stroke="#f5e7d1" stroke-width=".1"/>`;
  svg += `<rect x="12" y="11" width="${width - 24}" height="${height - 22}" fill="none" stroke="#bc9474" stroke-width=".35"/><rect x="13.3" y="12.3" width="${width - 26.6}" height="${height - 24.6}" fill="none" stroke="#bd965a" stroke-width=".12"/>`;
  for (const x of [15, width - 19]) {
    svg += `<defs><clipPath id="edge${x}"><rect x="${x}" y="16" width="4" height="${height - 32}"/></clipPath></defs><rect x="${x}" y="16" width="4" height="${height - 32}" fill="#a24f40"/><g clip-path="url(#edge${x})" fill="none" stroke="#b48c50" stroke-width=".13">`;
    for (let y = 16; y <= height; y += 6) for (let r = 1; r <= 4; r++) {
      svg += `<path d="M${x - 2 - r} ${y}a${r} ${r} 0 0 1 ${r * 2} 0 M${x + 4 - r} ${y + 3}a${r} ${r} 0 0 1 ${r * 2} 0"/>`;
    }
    svg += '</g>';
  }
  return svg + `<path d="M21.5 26.5H${width - 21.5}M21.5 ${height - 22.5}H${width - 21.5}" stroke="#bc9474" stroke-width=".18"/></svg>`;
}

export function buildWeeklyHtml(doc, s, groups, origin, sourceName = '') {
  const info = weeklyInfo(doc, sourceName);
  const [width, height] = s.paper === 'A5' ? [148, 210] : s.paper === 'Letter' ? [215.9, 279.4] : [210, 297];
  const fontFaces = ['zh', 'ja', 'header', 'running', 'latin'].flatMap(lang => (groups[lang] || []).map(f => `@font-face{font-family:Export${lang};src:local(${JSON.stringify(f.postscript)}),local(${JSON.stringify(f.name)}),url("${origin}/api/font/${f.id}");font-weight:${f.weight};font-style:${f.style};font-display:block;}`)).join('\n');
  const zh = `${groups.zh?.length ? 'Exportzh,' : ''}"Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
  const ja = `${groups.ja?.length ? 'Exportja,' : ''}"Meiryo","Noto Sans CJK JP",sans-serif`;
  const running = `${groups.header?.length ? 'Exportheader,' : ''}${groups.running?.length ? 'Exportrunning,' : ''}"YouYuan","Microsoft YaHei",sans-serif`;
  const latin = `${groups.header?.length ? 'Exportheader,' : ''}${groups.latin?.length ? 'Exportlatin,' : ''}"Arial Rounded MT Bold",sans-serif`;
  const scale = s.fontSize / 12, leading = s.lineHeight / 2;
  const margin = s.margin + 6;
  const headerSpace = s.headerEnabled && s.headerText.trim() ? s.headerExtraTop : 0;
  const top = 29 + headerSpace;
  const background = `data:image/svg+xml;base64,${Buffer.from(pageBackground(width, height)).toString('base64')}`;
  const heading = `<div class="weekly-song-heading"><div class="weekly-title" lang="ja">${escape(info.title)}</div><div class="weekly-song-meta"><div class="weekly-cover">${info.cover || '<div class="cover-placeholder">专辑封面</div>'}</div><div class="weekly-credits" lang="zh-CN">${['专辑', '作曲', '作词', '编曲'].map(k => `<div>${k}：${escape(info.credits[k] || '')}</div>`).join('')}</div><div class="weekly-charms"><img class="club-logo" src="${clubLogo}" alt="HITsz 日语社鸟居社徽"><div class="weekly-sticker" lang="ja">純喫茶<br>レコード</div></div></div></div>`;
  const customHeader = s.headerEnabled && s.headerText.trim() ? `<div class="custom-header" style="left:${s.headerX}mm;top:${s.headerY}mm;width:${Math.max(1, width - s.headerX - s.margin)}mm;font-size:${s.headerFontSize}pt;text-align:${s.headerAlign};font-weight:${s.headerBold ? 700 : 400};color:${s.headerColor}">${escape(s.headerText)}</div>` : '';
  const watermark = s.watermarkEnabled && doc.watermarkImage ? `<img class="page-watermark" src="${doc.watermarkImage}" alt="" style="left:${s.watermarkX}mm;top:${s.watermarkY}mm;width:${s.watermarkWidth}mm;opacity:${s.watermarkOpacity / 100}">` : '';
  const page = `<section class="song-page"><div class="page-art" style="background-image:url('${background}')"></div>${watermark}<header class="song-header"><div class="running-top"><span>每周一曲　 /　 日语社</span><span class="song-short" lang="ja">${escape(info.shortTitle)}</span></div><div class="online-listen">在线收听：<a href="${escape(info.url)}">日语社每周一曲　<span class="url">${escape(info.url)}</span></a></div></header>${customHeader}<div class="page-content"></div><footer class="song-footer"><span>HITsz JLA　 ·　 <span class="footer-english">WEEKLY SONG</span></span>${s.pageNumbers ? '<span class="page-number"></span>' : ''}</footer></section>`;
  const blocks = info.blocks.map(b => `<div data-block-kind="${b.kind}">${b.html}</div>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(info.title)}</title><style>
${fontFaces}
@page{size:${s.paper};margin:0}
*{box-sizing:border-box}html{background:#e9ebe9}body{margin:0;font-family:${zh};color:#53382e;font-size:${10.4 * scale}pt;line-height:${19 * scale * leading}pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.document{width:${width}mm;margin:20px auto}.song-page{position:relative;isolation:isolate;width:${width}mm;height:${height}mm;margin-bottom:20px;break-after:page;box-shadow:0 5px 32px #182c3320;overflow:hidden}.song-page:last-child{break-after:auto}
.page-art{position:absolute;inset:0;background-size:100% 100%;z-index:-3}.page-watermark{position:absolute;z-index:-2;transform:translate(-50%,-50%);height:auto;max-height:${height}mm;object-fit:contain;pointer-events:none}
.song-header,.song-footer,.custom-header{position:absolute;z-index:2;font-family:${running};font-weight:700;line-height:1.25}.song-header{left:21.5mm;right:21.5mm;top:15.2mm}.running-top{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;color:#963c2c;font-size:11pt}.song-short{font-family:${groups.header?.length ? 'Exportheader,' : ''}${ja};color:#294e58;text-align:right;font-weight:700}.online-listen{font-size:9pt;color:#89695b;line-height:1.3;margin-top:1.2mm;font-weight:400}.online-listen a{color:inherit;text-decoration:none}.online-listen .url{font-family:${latin};font-size:8.5pt}
.song-footer{left:21.5mm;right:21.5mm;bottom:15.4mm;display:flex;justify-content:space-between;color:#294e58;font-family:${latin};font-size:11pt}.footer-english{letter-spacing:.05em}.page-number{color:#963c2c}.custom-header{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.3}
.page-content{position:absolute;left:${margin}mm;right:${margin}mm;top:${top}mm;height:${height - top - 23}mm}.weekly-song-heading{text-align:center;padding:0 0 4mm;border-bottom:.4pt solid #bc9474;margin:0 0 5mm}.weekly-title{font-family:${ja};color:#294e58;font-size:${22 * scale}pt;font-weight:700;line-height:28pt;margin:0 0 4mm}.weekly-song-meta{display:grid;grid-template-columns:28% 48% 20%;gap:2%;align-items:center;min-height:41mm}.weekly-cover{display:flex;justify-content:center;align-items:center}.weekly-cover img{display:block;width:40.7mm;height:40.7mm;object-fit:contain;padding:1mm;border:.12mm solid #bc9474}.cover-placeholder{width:40mm;height:40mm;border:1px solid #bc9474;display:grid;place-items:center}.weekly-credits{font-size:${10 * scale}pt;line-height:${17 * scale}pt}.weekly-charms{display:grid;justify-items:center;gap:1mm}.club-logo{width:24mm;height:auto}.weekly-sticker{font-family:${ja};transform:rotate(10deg);padding:1.4mm 3mm;border:.5mm double #bc9474;background:#e2ca9e;color:#89695b;font-size:9pt;line-height:13pt;margin-top:1mm}
.lyrics-label{text-align:center;color:#963c2c;font-size:8pt;line-height:10pt;margin:0 0 4mm}.lyric-pair{text-align:center;break-inside:avoid;padding-bottom:${2.1 * leading}mm}.lyric-jp{font-family:${ja};font-size:${12.5 * scale}pt;line-height:${5 * scale * leading}mm;font-weight:700;color:#294e58;padding-top:${2.1 * scale}mm;min-height:${7.1 * scale * leading}mm}.lyric-cn{font-family:${zh};font-size:${10.2 * scale}pt;line-height:${15 * scale * leading}pt;margin-top:${2.4 * leading}mm}
${s.forceFont ? `.page-content [lang|="zh"]:not(pre):not(code){font-family:${zh}!important}.page-content [lang|="ja"]:not(pre):not(code){font-family:${ja}!important}` : ''}
.ruby-word{display:inline-block;vertical-align:baseline;text-align:center;position:relative}.ruby-base{display:block}.ruby-reading{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-family:${ja};font-weight:400;font-size:${11.6 * scale * s.rubySize}pt;line-height:1;letter-spacing:0;color:#89695b;white-space:nowrap;padding-bottom:1.6pt}.vocab-body .ruby-reading{font-size:${11.6 * scale * s.rubySize}pt}
.notes-heading{font-size:${19 * scale}pt;line-height:25pt;font-weight:700;color:#294e58;border-bottom:.4pt solid #bc9474;padding-bottom:2mm;margin-bottom:4mm}.vocab-entry{padding-bottom:3.7mm;text-align:left;break-inside:avoid}.vocab-term{font-family:${ja};font-size:${12 * scale}pt;line-height:${20 * scale * leading}pt;color:#294e58;padding-top:${1 * scale}mm}.vocab-number{font-size:9pt;color:#963c2c;margin-right:3mm;font-weight:400}.vocab-body{font-family:${zh};font-size:${10.4 * scale}pt;line-height:${19 * scale * leading}pt;margin-top:1mm;overflow-wrap:anywhere}.vocab-body p{margin:0}.notes-continuation{margin-bottom:4mm;color:#963c2c;font-size:8pt}
.lyric-cn p{margin:0}p{margin:.5em 0}img{max-width:100%;height:auto}a{color:#294e58}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#efe5d4;padding:3mm}code{font-family:Consolas,monospace}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bc9474;padding:1mm}ul,ol{padding-left:6mm}h1,h2,h3,h4,h5,h6{color:#294e58;line-height:1.5}.missing-image{color:#963c2c}
#weekly-source{position:absolute;visibility:hidden;left:-10000px;top:0;width:${width - margin * 2}mm}#weekly-source [data-block-kind]{display:flow-root}
@media print{html{background:transparent}.document{margin:0}.song-page{margin:0;box-shadow:none}#weekly-source{display:none}}
</style></head><body><main class="document"><section class="weekly-song-theme"><div id="weekly-pages">${page}</div><div id="weekly-source"><div id="weekly-heading">${heading}</div>${blocks}</div></section></main></body></html>`;
}

// Runs in Chromium for both preview and export: measure actual chosen fonts, then
// move indivisible lyric pairs / entries onto full pages. Large paragraphs can split.
export function paginateWeeklyDocument() {
  const source = document.querySelector('#weekly-source');
  if (!source) return 0;
  for (const ruby of source.querySelectorAll('ruby')) {
    const reading = ruby.querySelector('rt')?.textContent || '';
    const word = document.createElement('span'); word.className = 'ruby-word'; word.lang = 'ja';
    const base = document.createElement('span'); base.className = 'ruby-base';
    for (const child of [...ruby.childNodes]) if (!['RT', 'RP', 'RTC'].includes(child.nodeName)) base.append(child.cloneNode(true));
    const rt = document.createElement('span'); rt.className = 'ruby-reading'; rt.textContent = reading;
    word.append(base, rt); ruby.replaceWith(word);
    // Reserve space only when the reading is wider than the written word.
    word.style.minWidth = `${Math.max(base.getBoundingClientRect().width, rt.getBoundingClientRect().width)}px`;
  }
  const pages = document.querySelector('#weekly-pages');
  const template = pages.firstElementChild.cloneNode(true);
  pages.replaceChildren();
  const heading = source.querySelector('#weekly-heading');
  const blocks = [...source.querySelectorAll(':scope > [data-block-kind]')];
  let page, content, notes = false, lyricPage = 0;
  function newPage(kind = 'lyric', first = false) {
    page = template.cloneNode(true); pages.append(page); content = page.querySelector('.page-content');
    if (first) content.append(...heading.childNodes);
    if (kind === 'lyric') {
      const label = document.createElement('div'); label.className = 'lyrics-label';
      label.textContent = lyricPage++ ? 'LYRICS / 歌词 · 续' : 'LYRICS / 歌词'; content.append(label);
    } else if (kind === 'notes-continuation') {
      const label = document.createElement('div'); label.className = 'notes-continuation'; label.textContent = '词汇用法 · 续'; content.append(label);
    }
  }
  function fits() {
    const last = content.lastElementChild;
    return !last || last.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + .6;
  }
  newPage('lyric', true);
  for (const block of blocks) {
    const kind = block.dataset.blockKind;
    if (kind === 'notes-title') { notes = true; newPage('notes'); }
    content.append(block);
    if (!fits() || (kind === 'lyric' && lyricPage === 1 && content.querySelectorAll('.lyric-pair').length > 9)) {
      block.remove(); newPage(notes ? 'notes-continuation' : 'lyric'); content.append(block);
      // A single oversized block must remain readable. Browser fragmentation is
      // handled below by text splitting rather than clipping it to the paper.
      if (!fits()) {
        let target = block.querySelector('.vocab-body') || block;
        const continuation = block.cloneNode(true);
        if (target !== block) continuation.querySelector('.vocab-term')?.remove();
        const nextTarget = node => node.querySelector('.vocab-body') || node;
        nextTarget(continuation).replaceChildren();
        let remaining = document.createDocumentFragment();
        remaining.append(...target.childNodes);
        // Range preserves nested inline markup while splitting text. Each fitted
        // prefix stays on its page; only the remaining suffix moves forward.
        function splitAt(fragment, offset) {
          const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (offset <= node.length) break;
            offset -= node.length;
          }
          const prefix = document.createRange(); prefix.selectNodeContents(fragment);
          if (node) prefix.setEnd(node, offset);
          const suffix = document.createRange(); suffix.selectNodeContents(fragment);
          if (node) suffix.setStart(node, offset); else suffix.collapse(false);
          return [prefix.cloneContents(), suffix.cloneContents()];
        }
        while (remaining.childNodes.length) {
          target.replaceChildren(remaining.cloneNode(true));
          if (fits()) break;
          const offsets = [0];
          for (const char of remaining.textContent) offsets.push(offsets.at(-1) + char.length);
          let low = 0, high = offsets.length - 1;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            target.replaceChildren(splitAt(remaining, offsets[middle])[0]);
            if (fits()) low = middle; else high = middle - 1;
          }
          if (!low) throw new Error('当前字号、边距或内容超出纸张可用区域，请减小字号或边距。');
          const [prefix, suffix] = splitAt(remaining, offsets[low]);
          target.replaceChildren(prefix); remaining = suffix;
          newPage(notes ? 'notes-continuation' : 'lyric');
          const next = continuation.cloneNode(true); content.append(next); target = nextTarget(next);
        }
      }
    }
  }
  source.remove();
  const all = [...pages.children];
  all.forEach((p, i) => { const n = p.querySelector('.page-number'); if (n) n.textContent = `${i + 1} / ${all.length}`; });
  document.documentElement.dataset.pageCount = all.length;
  return all.length;
}
