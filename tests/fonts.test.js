import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fontNames } from '../src/font-names.js';
import { getFonts, coverage } from '../src/fonts.js';

test('优先中文字体名，同时保留英文和繁体别名用于搜索', () => {
  const face = { familyName: 'LXGW WenKai', fullName: 'LXGW WenKai', postscriptName: 'LXGWWenKai-Regular',
    name: { records: { fontFamily: { en: 'LXGW WenKai', zh: '霞鹜文楷', 'zh-TW': '霞鶩文楷' } } } };
  const info = fontNames(face);
  assert.equal(info.displayFamily, '霞鹜文楷');
  assert.equal(info.displayName, '霞鹜文楷');
  assert.equal(info.category, 'zh');
  assert.ok(info.searchNames.includes('LXGW WenKai'));
  assert.ok(info.searchNames.includes('霞鶩文楷'));
  assert.equal(face.familyName, 'LXGW WenKai', '显示名称不能修改排版使用的内部字体名');
});
test('日文字体显示本地名称；细体和中等字重翻译为易读名称', () => {
  const ja = fontNames({ familyName: 'Yu Gothic', fullName: 'Yu Gothic Regular', name: { records: {
    fontFamily: { en: 'Yu Gothic', ja: '游ゴシック' }, fullName: { ja: '游ゴシック Regular' }
  } } });
  assert.equal(ja.displayFamily, '游ゴシック');
  assert.equal(ja.displayName, '游ゴシック 常规');
  assert.equal(ja.category, 'ja');
  const light = fontNames({ familyName: 'LXGW WenKai Light', name: { records: { fontFamily: { zh: '霞鹜文楷 Light' } } } });
  assert.equal(light.displayFamily, '霞鹜文楷 细体');
});
test('没有本地名称的字体保留原名，不虚构中文译名', () => {
  const info = fontNames({ familyName: 'Consolas', fullName: 'Consolas', name: { records: { fontFamily: { en: 'Consolas' } } } });
  assert.equal(info.displayFamily, 'Consolas');
  assert.equal(info.category, 'other');
});
test('Windows 已安装的霞鹜文楷可扫描、按中文检索且覆盖中日文样例', {
  skip: process.platform !== 'win32' || !fs.existsSync('C:/Windows/Fonts/LXGWWenKai-Regular.ttf')
}, async () => {
  const fonts = await getFonts(true);
  const font = [...fonts.values()].find(f => f.postscript === 'LXGWWenKai-Regular');
  assert.ok(font);
  assert.equal(font.displayFamily, '霞鹜文楷');
  assert.ok(font.searchNames.join(' ').includes('霞鹜'));
  const result = await coverage(font, '中文字体霞鹜文楷日本語あいうえお');
  assert.equal(result.missingCount, 0);
});
