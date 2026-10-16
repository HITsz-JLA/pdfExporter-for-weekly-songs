import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getFonts, publicFont, coverage } from './fonts.js';
import { parseDocument, buildHtml, settings } from './document.js';
import { exportPdf, browserPath, closeBrowser, prepareWeeklyPreview } from './pdf.js';
import { isWeeklySong } from './weekly.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const app = express();
app.disable('x-powered-by');
// No cookies or remote web origins may invoke the local service.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({ error: '仅允许同源请求。' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '拒绝跨站请求。' });
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: '请使用 JSON 请求。' });
  next();
});
app.use(express.json({ limit: '35mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, browser: browserPath() ? '已找到本机浏览器' : '使用 Playwright Chromium（需要先安装）' }));
app.get('/api/fonts', async (req, res) => {
  const fonts = await getFonts(true);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ fonts: [...fonts.values()].map(publicFont).sort((a, b) => a.displayFamily.localeCompare(b.displayFamily, 'zh-CN')),
    note: '已重新扫描服务电脑的系统字体和当前用户字体。优先显示本地名称，中英文名称均可搜索。' });
});
app.get('/api/font/:id', async (req, res) => {
  const font = (await getFonts()).get(req.params.id);
  if (!font) return res.status(404).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(font.file);
});
async function prepare(body, origin) {
  if (!body || typeof body.markdown !== 'string' || body.markdown.length > 2_000_000) {
    const error = new Error('请提供不超过 200 万字符的 Markdown 正文。'); error.status = 400; throw error;
  }
  if (body.assets !== undefined && (!body.assets || typeof body.assets !== 'object' || Array.isArray(body.assets)
      || Object.values(body.assets).some(value => typeof value !== 'string'))) {
    const error = new Error('图片资源格式不正确。'); error.status = 400; throw error;
  }
  const options = settings({ ...body.options, sourceName: body.sourceName || body.options?.sourceName || '' });
  const fonts = await getFonts();
  const selected = { zh: fonts.get(options.zhFontId), ja: fonts.get(options.jaFontId), header: fonts.get(options.headerFontId) };
  if ((options.zhFontId && !selected.zh) || (options.jaFontId && !selected.ja) || (options.headerFontId && !selected.header)) { const error = new Error('所选字体已不存在，请刷新字体列表。'); error.status = 400; throw error; }
  // Chromium's native header uses installed font families, independently of the document CSS.
  if (body.coverImage !== undefined && typeof body.coverImage !== 'string') { const error = new Error('头图格式不正确。'); error.status = 400; throw error; }
  if (body.watermarkImage !== undefined && typeof body.watermarkImage !== 'string') { const error = new Error('水印图片格式不正确。'); error.status = 400; throw error; }
  const doc = parseDocument(body.markdown, body.assets || {}, { coverImage: body.coverImage || '', watermarkImage: body.watermarkImage || '' });
  const weekly = isWeeklySong(doc, options);
  if (!selected.header && !weekly) selected.header = selected.zh;
  options.headerFontFamily = selected.header?.family || 'Microsoft YaHei';
  const defaults = { running: 'YouYuan', latin: 'Arial Rounded MT Bold' };
  const faces = Object.fromEntries(['zh', 'ja', 'header', 'running', 'latin'].map(lang => {
    const family = selected[lang]?.family || (weekly && defaults[lang]);
    return [lang, family ? [...fonts.values()].filter(f => f.family === family) : []];
  }));
  return { doc, options, selected, html: buildHtml(doc, options, faces, origin) };
}
app.post('/api/preview', async (req, res) => {
  const address = req.socket.localAddress?.includes(':') ? `[${req.socket.localAddress}]` : req.socket.localAddress;
  const origin = `http://${address}:${req.socket.localPort}`;
  const result = await prepare(req.body, origin);
  const preview = isWeeklySong(result.doc, result.options) ? await prepareWeeklyPreview(result.html, origin) : { html: result.html };
  // The browser may reach us via localhost, a hostname or a LAN address. Keep
  // preview font URLs relative to that origin (and its CSP), after measurement.
  preview.html = preview.html.replaceAll(`${origin}/api/font/`, '/api/font/');
  res.json({ ...preview, title: result.doc.title, warnings: result.doc.warnings, characters: [...result.doc.text].length, languageStats: result.doc.languageStats });
});
app.post('/api/coverage', async (req, res) => {
  const result = await prepare(req.body, '');
  if (!result.selected.zh && !result.selected.ja && !(result.options.headerEnabled && result.selected.header)) return res.status(400).json({ error: '请先选择中文、日文或页眉字体。' });
  const languages = {};
  for (const lang of ['zh', 'ja']) {
    languages[lang] = result.selected[lang] ? { font: result.selected[lang].displayName || result.selected[lang].name, ...await coverage(result.selected[lang], result.doc.textByLanguage[lang]) } : { skipped: true };
  }
  if (result.options.headerEnabled && result.options.headerText.trim()) languages.header = result.selected.header
    ? { font: result.selected.header.displayName || result.selected.header.name, ...await coverage(result.selected.header, result.options.headerText) } : { skipped: true };
  // Keep the original aggregate fields for callers using the old single-font API.
  res.json({ languages, total: Object.values(languages).reduce((n, r) => n + (r.total || 0), 0),
    missingCount: Object.values(languages).reduce((n, r) => n + (r.missingCount || 0), 0), missing: [...new Set(Object.values(languages).flatMap(r => r.missing || []))].slice(0, 150) });
});
app.post('/api/export', async (req, res) => {
  const address = req.socket.localAddress?.includes(':') ? `[${req.socket.localAddress}]` : req.socket.localAddress;
  const origin = `http://${address}:${req.socket.localPort}`;
  const result = await prepare(req.body, origin);
  const weeklySong = isWeeklySong(result.doc, result.options);
  const pdf = await exportPdf(result.html, result.options, origin, { weeklySong });
  const filename = result.doc.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'document';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`);
  res.send(pdf);
});
app.use(express.static(path.join(root, 'public'), { setHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-src 'self' about:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
} }));
app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(error.status || 500).json({ error: error.type === 'entity.too.large' ? '文件和图片合计过大，请控制在 35 MB 内。' : error.message || '处理失败，请重试。' });
});
export function start() {
  const port = Number(process.env.PORT || 3210);
  const host = process.env.HOST || '127.0.0.1';
  const server = app.listen(port, host, () => {
    console.log(`MD Exporter 已启动：http://${host}:${port}`);
    getFonts().then(fonts => console.log(`已检测 ${fonts.size} 个字体字面。`)).catch(console.error);
  });
  server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { server.close(); await closeBrowser(); process.exit(0); });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
