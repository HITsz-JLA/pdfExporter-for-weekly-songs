import fs from 'node:fs/promises';
import { app } from '../src/server.js';
import { closeBrowser } from '../src/pdf.js';

// Run from the project directory with PNG watermark and cover paths as arguments.
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const { fonts } = await (await fetch(base + '/api/fonts')).json();
  const chinese = fonts.find(f => f.postscript === 'LXGWWenKai-Medium');
  const japanese = fonts.find(f => f.postscript === 'UDDigiKyokashoN');
  const markdown = await fs.readFile('examples/masukatto.md', 'utf8');
  const watermarkImage = `data:image/png;base64,${(await fs.readFile(process.argv[2])).toString('base64')}`;
  const coverImage = `data:image/png;base64,${(await fs.readFile(process.argv[3])).toString('base64')}`;
  for (const [filename, changes] of [['preview-fixed', {}], ['preview-center', {watermarkX: 105, watermarkY: 148.5, watermarkWidth: 80, watermarkOpacity: 12}],
    ['preview-a5', {paper: 'A5'}]]) {
    const data = { markdown, watermarkImage, coverImage, options: { zhFontId: chinese.id, jaFontId: japanese.id, headerFontId: chinese.id,
      headerEnabled: true, headerText: '@ HITSZ日语社 每周一曲 2026/10/16', headerX: 22.5, headerY: 8, headerFontSize: 11,
      headerColor: '#69776e', watermarkX: 15, watermarkY: 10, watermarkWidth: 15, watermarkOpacity: 100, ...changes } };
    const result = await fetch(base + '/api/export', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (!result.ok) throw new Error(await result.text());
    await fs.writeFile(`output/${filename}.pdf`, Buffer.from(await result.arrayBuffer()));
    const preview = await (await fetch(base + '/api/preview', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })).json();
    await fs.writeFile(`output/${filename}.html`, preview.html);
    console.log(`已导出 ${filename}`);
  }
} finally { await closeBrowser(); await new Promise(resolve => server.close(resolve)); }
