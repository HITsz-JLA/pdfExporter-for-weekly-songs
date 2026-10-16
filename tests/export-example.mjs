import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from '../src/server.js';
import { closeBrowser } from '../src/pdf.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const { fonts } = await (await fetch(base + '/api/fonts')).json();
  const selected = fonts.find(f => /Microsoft YaHei|微软雅黑/.test(f.family) && f.weight === 400 && f.style === 'normal') || fonts[0];
  const japanese = fonts.find(f => /Yu Gothic|游ゴシック/.test(f.family) && f.weight === 400 && f.style === 'normal') || selected;
  const markdown = await fs.readFile(path.join(root, 'examples/masukatto.md'), 'utf8');
  const coverImage = process.argv[2] ? `data:image/png;base64,${(await fs.readFile(process.argv[2])).toString('base64')}` : '';
  const data = { markdown, coverImage, options: { zhFontId: selected.id, jaFontId: japanese.id, pageNumbers: true } };
  const post = route => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const preview = await (await post('/api/preview')).json();
  const coverage = await (await post('/api/coverage')).json();
  const result = await post('/api/export');
  if (!result.ok) throw new Error(await result.text());
  await fs.mkdir(path.join(root, 'output'), { recursive: true });
  const output = coverImage ? 'output/masukatto-with-cover.pdf' : 'output/masukatto.pdf';
  await fs.writeFile(path.join(root, output), Buffer.from(await result.arrayBuffer()));
  console.log(JSON.stringify({ fontFaces: fonts.length, chineseFont: selected.name, japaneseFont: japanese.name, coverage,
    languageStats: preview.languageStats, rubyCount: (preview.html.match(/<ruby\b/g) || []).length, warnings: preview.warnings, output }, null, 2));
} finally {
  await closeBrowser();
  await new Promise(resolve => server.close(resolve));
}
