import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName } from 'pdf-lib';
import { addWatermark, printHeader } from '../src/pdf.js';

const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGN8xsX1nwEJMCFziBMAAIJkAgFn8uu7AAAAAElFTkSuQmCC';
test('页顶水印在每页正确定位、位于正文下方且保留原始链接', async () => {
  const source = await PDFDocument.create();
  source.setTitle('Original title');
  for (let n = 0; n < 2; n++) {
    const page = source.addPage([595, 842]); page.drawText('Body text');
    const link = source.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 50, 20], A: { Type: 'Action', S: 'URI', URI: 'https://example.org' } });
    page.node.set(PDFName.of('Annots'), source.context.obj([source.context.register(link)]));
  }
  const result = await addWatermark(await source.save(), { data }, { watermarkX: 15, watermarkY: 10, watermarkWidth: 15, watermarkOpacity: 100 });
  const pdf = await PDFDocument.load(result);
  assert.equal(pdf.getPageCount(), 2); assert.equal(pdf.getTitle(), 'Original title');
  for (const page of pdf.getPages()) {
    const stream = pdf.context.lookup(page.node.Contents().get(0));
    const ops = inflateSync(stream.getContents()).toString();
    const transform = ops.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) cm/);
    assert.ok(transform, '背景绘图流应在原正文流之前');
    assert.ok(Math.abs(Number(transform[1]) - 7.5 * 72 / 25.4) < 0.001);
    assert.ok(Math.abs(Number(transform[2]) - (842 - 17.5 * 72 / 25.4)) < 0.001);
    assert.equal(page.node.Annots().size(), 1);
    assert.match(ops, /\/Image-[^ ]+ Do/);
  }
});
test('页眉模板明确使用原始颜色而不采用打印省墨调色', () => {
  const template = printHeader({ headerEnabled: true, headerText: '页眉 <safe>', headerColor: '#69776e' });
  assert.match(template, /color:#69776e/);
  assert.match(template, /-webkit-print-color-adjust:exact/);
  assert.match(template, /print-color-adjust:exact/);
  assert.match(template, /页眉 &lt;safe&gt;/);
});
