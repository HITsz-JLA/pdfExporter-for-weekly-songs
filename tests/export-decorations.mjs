// Generates a real multi-page QA artifact. Supply a PNG watermark fixture as argv[2].
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
  const choose = pattern => fonts.find(f => pattern.test(f.family) && f.weight === 400 && f.style === 'normal') || fonts[0];
  const chinese = choose(/Microsoft YaHei|微软雅黑/);
  const japanese = choose(/Yu Gothic|游ゴシック/);
  const headerFont = choose(/^(SimSun|宋体)$/);
  const watermarkImage = `data:image/png;base64,${(await fs.readFile(process.argv[2])).toString('base64')}`;
  const markdown = await fs.readFile(path.join(root, 'examples/masukatto.md'), 'utf8');
  const options = { zhFontId: chinese.id, jaFontId: japanese.id, headerFontId: headerFont.id,
    headerEnabled: true, headerText: 'HITSZ 日语学习笔记 · 日本語\n仅供学习交流', headerFontSize: 9, headerX: 18, headerY: 5,
    watermarkX: 105, watermarkY: 148.5, watermarkWidth: 80, watermarkOpacity: 12, pageNumbers: false };
  const post = (route, data) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  for (const [paper, filename] of [['A4', 'masukatto-decorated.pdf'], ['A5', 'decorations-a5.pdf']]) {
    const data = { markdown, watermarkImage, options: { ...options, paper, ...(paper === 'A5' ? { watermarkX: 74, watermarkY: 105, watermarkWidth: 55, headerX: 12, headerY: 6 } : {}) } };
    const response = await post('/api/export', data);
    if (!response.ok) throw new Error(await response.text());
    await fs.mkdir(path.join(root, 'output'), { recursive: true });
    await fs.writeFile(path.join(root, 'output', filename), Buffer.from(await response.arrayBuffer()));
    console.log(JSON.stringify({ paper, filename, headerFont: headerFont.name, coverage: await (await post('/api/coverage', data)).json() }));
  }
} finally { await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
