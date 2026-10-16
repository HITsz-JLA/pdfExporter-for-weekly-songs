import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import * as fontkit from 'fontkit';

let catalogue;
export async function getFonts(refresh = false) {
  if (!catalogue || refresh) catalogue = scan();
  return catalogue;
}
async function scan() {
  const roots = process.platform === 'win32'
    ? [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Microsoft', 'Windows', 'Fonts')]
    : process.platform === 'darwin'
      ? ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts')]
      : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.local/share/fonts'), path.join(os.homedir(), '.fonts')];
  if (process.env.FONT_DIR) roots.push(...process.env.FONT_DIR.split(path.delimiter));
  const files = [];
  async function walk(dir, depth = 0) {
    if (depth > 6) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (/\.(ttf|otf|ttc|otc|woff2?)$/i.test(entry.name)) files.push(full);
    }
  }
  for (const dir of roots) await walk(dir);
  const fonts = new Map();
  for (const file of [...new Set(files)]) {
    try {
      const opened = await fontkit.open(file);
      for (const face of opened.fonts || [opened]) {
        const id = crypto.createHash('sha256').update(file + ':' + face.postscriptName).digest('hex').slice(0, 20);
        const weight = face['OS/2']?.usWeightClass || (/bold/i.test(face.subfamilyName) ? 700 : 400);
        fonts.set(id, { id, family: face.familyName || face.fullName, name: face.fullName, postscript: face.postscriptName,
          weight, style: /italic|oblique/i.test(face.subfamilyName) ? 'italic' : 'normal', file });
      }
    } catch { /* Skip unsupported or unreadable system fonts. */ }
  }
  return fonts;
}
export function publicFont({ file, ...font }) { return font; }
export async function coverage(font, text) {
  const opened = await fontkit.open(font.file);
  const face = opened.fonts?.find(f => f.postscriptName === font.postscript) || opened;
  const chars = [...new Set([...text].filter(c => !/[\s\p{Cc}\p{Cf}]/u.test(c)))];
  const missing = chars.filter(c => !face.hasGlyphForCodePoint(c.codePointAt(0)));
  return { total: chars.length, missingCount: missing.length, missing: missing.slice(0, 150) };
}
