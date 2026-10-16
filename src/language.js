import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';

const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const blocks = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'blockquote', 'figcaption', 'summary']);
const escaped = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const textOf = node => node.type === 'text' ? node.data : (node.children || []).map(textOf).join('');
const hasRuby = node => node.name === 'ruby' || (node.children || []).some(hasRuby);
const language = lang => /^ja(?:-|$)/i.test(lang || '') ? 'ja' : /^zh(?:-|$)/i.test(lang || '') ? 'zh-CN' : null;
const chineseExplanation = text => /歌词中|可引申|相当于|构成|意为|[：:]\s*(?:由|动词|复合|名词|副词|形容|他动)|(?:动词|名词)[，,：:]|表示[“「某相光用]|(?:专辑|作曲|作词|编曲|词汇)[：:]/u.test(text);

// This is a structural classifier for bilingual lyric documents, not a general language model.
export function annotateLanguages(html, { lyrics = false } = {}) {
  const dom = parseDocument(html);
  const texts = { zh: [], ja: [] };
  function collect(text, lang) { texts[lang === 'ja' ? 'ja' : 'zh'].push(text); }
  function walk(node, inherited = 'zh-CN', explicitContext = false, centered = false) {
    if (node.type === 'text') { collect(node.data, inherited); return [node]; }
    if (!node.name) {
      node.children = (node.children || []).flatMap(child => walk(child, inherited, explicitContext, centered));
      return [node];
    }
    if (node.name === 'pre' || node.name === 'code') return [node];
    const explicit = language(node.attribs.lang);
    const locked = explicitContext || Boolean(explicit);
    let lang = explicit || inherited;
    const text = textOf(node).trim();
    const children = (node.children || []).filter(n => n.type !== 'text' || n.data.trim());
    const boldLine = node.name === 'p' && children.length === 1 && children[0].name === 'strong';
    if (!explicit && ['ruby', 'rt', 'rp', 'rb', 'rtc'].includes(node.name)) lang = 'ja';
    if (!locked) {
      if (node.name === 'ruby' || node.name === 'rt' || node.name === 'rp' || node.name === 'rb' || node.name === 'rtc') lang = 'ja';
      else if (blocks.has(node.name)) lang = !chineseExplanation(text) && (kana.test(text) || hasRuby(node) || ((lyrics || centered) && boldLine)) ? 'ja' : 'zh-CN';
      else if (node.name === 'strong' && !chineseExplanation(text) && (kana.test(text) || hasRuby(node))) lang = 'ja';
    }
    node.attribs.lang = lang;
    node.children = (node.children || []).flatMap(child => {
      if (child.type !== 'text' || lang !== 'zh-CN' || locked) return walk(child, lang, locked, centered || node.name === 'center');
      // In Chinese explanations, recognize quoted Japanese phrases and kana runs.
      const pattern = /「[^「」\n]*[\p{Script=Hiragana}\p{Script=Katakana}][^「」\n]*」|[\p{Script=Hiragana}\p{Script=Katakana}ーゝゞヽヾ]+/gu;
      const parts = [];
      let cursor = 0;
      for (const match of child.data.matchAll(pattern)) {
        if (match.index > cursor) { const value = child.data.slice(cursor, match.index); collect(value, lang); parts.push(...parseDocument(escaped(value)).children); }
        collect(match[0], 'ja');
        parts.push(...parseDocument(`<span lang="ja">${escaped(match[0])}</span>`).children);
        cursor = match.index + match[0].length;
      }
      if (!cursor) return walk(child, lang, locked, centered || node.name === 'center');
      if (cursor < child.data.length) { const value = child.data.slice(cursor); collect(value, lang); parts.push(...parseDocument(escaped(value)).children); }
      for (const part of parts) part.parent = node;
      return parts;
    });
    return [node];
  }
  walk(dom);
  const textByLanguage = { zh: texts.zh.join(''), ja: texts.ja.join('') };
  return { html: render(dom, { encodeEntities: 'utf8' }), textByLanguage,
    languageStats: { zh: [...textByLanguage.zh.replace(/\s/g, '')].length, ja: [...textByLanguage.ja.replace(/\s/g, '')].length } };
}

export function withCover(html, image) {
  if (!image) return html;
  const dom = parseDocument(html);
  const first = dom.children.find(n => n.type !== 'comment' && (n.type !== 'text' || n.data.trim()));
  const images = [];
  function findImages(node) { if (node.name === 'img') images.push(node); for (const child of node.children || []) findImages(child); }
  if (first) findImages(first);
  if (first && ['p', 'img', 'figure'].includes(first.name) && !textOf(first).trim() && images.length === 1) {
    images[0].attribs.src = image;
    first.attribs.class = [first.attribs.class, 'cover-image'].filter(Boolean).join(' ');
    return render(dom, { encodeEntities: 'utf8' });
  }
  return `<figure class="cover-image"><img src="${image}" alt="头图"></figure>\n${html}`;
}
