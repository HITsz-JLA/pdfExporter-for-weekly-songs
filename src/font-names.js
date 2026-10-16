// Display names are independent of the names used to load and embed font files.
const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const clean = text => typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
const styleNames = { 'Extra Light': '特细', ExtraLight: '特细', 'Ultra Light': '极细', UltraLight: '极细',
  Semilight: '半细', Light: '细体', Medium: '中等', Semibold: '半粗', 'Semi Bold': '半粗',
  Bold: '粗体', Black: '特粗', Italic: '斜体', Oblique: '倾斜', Regular: '常规' };
function readableStyle(name) {
  return name.replace(/\b(Extra Light|ExtraLight|Ultra Light|UltraLight|Semi Bold|Semilight|Semibold|Light|Medium|Bold|Black|Italic|Oblique|Regular)\b/g, value => styleNames[value]);
}
function localized(records, keys, locales) {
  for (const locale of locales) for (const key of keys) {
    const value = clean(records[key]?.[locale]);
    if (value && cjk.test(value)) return value;
  }
  return '';
}

export function fontNames(face) {
  const records = face.name?.records || {};
  const family = clean(face.familyName || face.fullName || face.postscriptName);
  const name = clean(face.fullName || family);
  const zh = ['zh-CN', 'zh-Hans', 'zh', 'zh-SG', 'zh-TW', 'zh-Hant', 'zh-HK', 'zh-MO'];
  const ja = ['ja', 'ja-JP'];
  const chinese = localized(records, ['fontFamily', 'preferredFamily'], zh);
  const japanese = localized(records, ['fontFamily', 'preferredFamily'], ja);
  const displayFamily = readableStyle(chinese || japanese || family);
  const displayName = readableStyle(localized(records, ['fullName', 'fontFamily', 'preferredFamily'], zh)
    || localized(records, ['fullName', 'fontFamily', 'preferredFamily'], ja) || name);
  const category = japanese && (!chinese || /(?:CJK JP|Japanese|Gothic|Mincho|Meiryo)/i.test(family)) ? 'ja' : chinese ? 'zh' : 'other';
  const searchNames = [...new Set([family, name, displayFamily, displayName, face.postscriptName,
    ...['fontFamily', 'preferredFamily', 'fullName', 'fontSubfamily', 'preferredSubfamily'].flatMap(key => Object.values(records[key] || {}))].map(clean).filter(Boolean))];
  return { displayFamily, displayName, category, searchNames };
}
