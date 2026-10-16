import fs from 'node:fs';
import { chromium } from 'playwright-core';

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
export async function exportPdf(html, options, origin) {
  if (active >= 2) { const error = new Error('当前正在导出其他文档，请稍后重试。'); error.status = 429; throw error; }
  active++;
  let context;
  try {
    const b = await browser();
    context = await b.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === origin && /^\/api\/font\/[a-f0-9]{20}$/.test(url.pathname) ? route.continue() : route.abort();
    });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    return await page.pdf({ format: options.paper, margin: { top: `${options.margin}mm`, right: `${options.margin}mm`, bottom: `${options.margin}mm`, left: `${options.margin}mm` },
      printBackground: true, preferCSSPageSize: true, displayHeaderFooter: options.pageNumbers,
      headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;text-align:center;font:9px Arial;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', timeout: 30000 });
  } finally { await context?.close(); active--; }
}
export async function closeBrowser() { if (browserPromise) await (await browserPromise).close(); }
