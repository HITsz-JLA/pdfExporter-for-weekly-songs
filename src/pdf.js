import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import { escapeHtml, pageMargins, paperSize, settings } from './document.js';
import { paginateWeeklyDocument } from './weekly.js';

export function printHeader(options) {
  const s = settings(options);
  if (!s.headerEnabled || !s.headerText.trim()) return '<span></span>';
  const [width] = paperSize(s.paper);
  const family = escapeHtml(JSON.stringify(options.headerFontFamily || 'Microsoft YaHei'));
  return `<div style="position:absolute;left:${s.headerX}mm;top:${s.headerY}mm;width:${Math.max(1, width - s.headerX - s.margin)}mm;font-family:${family},'Yu Gothic',sans-serif;font-size:${s.headerFontSize}pt;font-weight:${s.headerBold ? 700 : 400};line-height:1.3;color:${s.headerColor};-webkit-print-color-adjust:exact;print-color-adjust:exact;text-align:${s.headerAlign};white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(s.headerText)}</div>`;
}

export async function addWatermark(pdfBytes, raster, options) {
  const s = settings(options);
  if (!s.watermarkEnabled || !raster || s.watermarkOpacity === 0) return pdfBytes;
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const image = await pdf.embedPng(Buffer.from(raster.data.split(',')[1], 'base64'));
  const mm = 72 / 25.4;
  const [, paperHeight] = paperSize(s.paper);
  const scale = Math.min(s.watermarkWidth * mm / image.width, paperHeight * mm / image.height);
  const width = image.width * scale, height = image.height * scale;
  for (const page of pdf.getPages()) {
    page.drawImage(image, { x: s.watermarkX * mm - width / 2, y: page.getHeight() - s.watermarkY * mm - height / 2,
      width, height, opacity: s.watermarkOpacity / 100 });
    // Keep the new drawing stream before the original page, so text, cover images and links stay intact.
    const streams = page.node.Contents();
    const watermarkStream = streams.get(streams.size() - 1);
    streams.remove(streams.size() - 1);
    streams.insert(0, watermarkStream);
  }
  return Buffer.from(await pdf.save());
}

let browserPromise;
export function browserPath() {
  const candidates = [process.env.BROWSER_PATH,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return candidates.find(p => p && fs.existsSync(p));
}
async function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, executablePath: browserPath() }).then(b => {
      b.on('disconnected', () => { browserPromise = undefined; });
      return b;
    }).catch(error => { browserPromise = undefined; throw new Error(`无法启动 PDF 排版引擎。请安装 Chrome / Edge，或运行 npm run install:browser。${error.message}`); });
  }
  return browserPromise;
}
let active = 0;
async function loadPage(context, html, origin) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && /^\/api\/font\/[a-f0-9]{20}$/.test(url.pathname) ? route.continue() : route.abort();
  });
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
  });
  return page;
}

export async function prepareWeeklyPreview(html, origin) {
  const context = await (await browser()).newContext({ javaScriptEnabled: false });
  try {
    const page = await loadPage(context, html, origin);
    const pageCount = await page.evaluate(paginateWeeklyDocument);
    return { html: await page.content(), pageCount };
  } finally { await context.close(); }
}

export async function exportPdf(html, options, origin, { weeklySong = false } = {}) {
  if (active >= 2) { const error = new Error('当前正在导出其他文档，请稍后重试。'); error.status = 429; throw error; }
  active++;
  let context;
  try {
    const b = await browser();
    context = await b.newContext({ javaScriptEnabled: false });
    const page = await loadPage(context, html, origin);
    if (weeklySong) {
      try {
        await page.evaluate(async () => { for (const img of document.querySelectorAll('img.page-watermark')) await img.decode(); });
      } catch { const error = new Error('水印图片无法读取，请重新上传有效图片。'); error.status = 400; throw error; }
      await page.evaluate(paginateWeeklyDocument);
      return await page.pdf({ format: options.paper, margin: { top: 0, bottom: 0, left: 0, right: 0 }, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, timeout: 30000 });
    }
    let watermark;
    if (options.watermarkEnabled && options.watermarkOpacity > 0) {
      try {
        watermark = await page.evaluate(async () => {
          const image = document.querySelector('img.page-watermark');
          if (!image) return null;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          return { data: canvas.toDataURL('image/png') };
        });
      } catch { const error = new Error('水印图片无法读取，请重新上传有效图片。'); error.status = 400; throw error; }
    }
    if (watermark) {
      const session = await context.newCDPSession(page);
      await session.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 255, g: 255, b: 255, a: 0 } });
    }
    const margins = Object.fromEntries(Object.entries(pageMargins(options)).map(([side, value]) => [side, `${value}mm`]));
    const bytes = await page.pdf({ format: options.paper, margin: margins,
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: options.pageNumbers || (options.headerEnabled && Boolean(options.headerText.trim())),
      headerTemplate: printHeader(options),
      footerTemplate: options.pageNumbers ? '<div style="width:100%;text-align:center;font:9px Arial;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' : '<span></span>', timeout: 30000 });
    return await addWatermark(bytes, watermark, options);
  } finally { await context?.close(); active--; }
}
export async function closeBrowser() { if (browserPromise) await (await browserPromise).close(); }
