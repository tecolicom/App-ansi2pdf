'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { emulate } = require('../src/emulate');
const { render } = require('../src/render');

const FONT = [path.join(os.homedir(), 'Library/Fonts/BIZUDGothic-Regular.ttf'),
              '/Library/Fonts/BIZUDGothic-Regular.ttf'].find((f) => fs.existsSync(f));

async function pdf(input, opt) {
  const screen = await emulate(input);
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => out.on('end', r));
  const info = render(screen, out, { font: FONT, ...opt });
  await done;
  const body = Buffer.concat(chunks).toString('latin1');
  return { info, sheets: (body.match(/\/Type \/Page\b/g) || []).length };
}

const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

test('pages and sheets', { skip: !FONT && 'font not found' }, async () => {
  const one = await pdf(text, { lines: 30 });
  assert.deepStrictEqual([one.info.pages, one.sheets], [4, 4]);
  const two = await pdf(text, { lines: 30, pane: 2, border: true, header: true, title: 't' });
  assert.deepStrictEqual([two.info.pages, two.sheets], [4, 2]);
  const grid = await pdf(text, { lines: 10, pane: '3,2' });
  assert.deepStrictEqual([grid.info.pages, grid.sheets], [10, 2]);
});

test('lines, width and font size', { skip: !FONT && 'font not found' }, () => {
  const { geometry } = require('../src/render');
  const g = (opt) => geometry({ font: FONT, pane: '2', border: true, ...opt });
  const base = g({});
  assert.strictEqual(base.lines, 60);
  // more lines make the font smaller, and more columns fit
  const tall = g({ lines: 80 });
  assert.ok(tall.lines === 80 && tall.cols > base.cols);
  // the lines follow the width
  const wide = g({ width: base.cols * 2 });
  assert.ok(wide.cols === base.cols * 2 && wide.lines > 60);
  const narrow = g({ width: Math.floor(base.cols / 2) });
  assert.ok(narrow.lines < 60);
  // both are kept
  assert.deepStrictEqual(g({ width: 300, lines: 20 }), { cols: 300, lines: 20 });
  // the lines and the columns follow the font size
  const big = g({ fontSize: 12 }), small = g({ fontSize: 6 });
  assert.ok(big.lines < small.lines && big.cols < small.cols);
  assert.strictEqual(g({ fontSize: 12, lines: 10 }).lines, 10);
});

test('form feeds start new pages', { skip: !FONT && 'font not found' }, async () => {
  const r = await pdf('a\nb\n\fc\n\f\fd\n', { lines: 30 });
  assert.deepStrictEqual([r.info.pages, r.sheets], [4, 4]);
});

test('panes and rows', { skip: !FONT && 'font not found' }, async () => {
  const four = await pdf(text, { lines: 10, pane: 4 });
  assert.deepStrictEqual([four.info.pages, four.sheets], [10, 3]);
  const grid = await pdf(text, { lines: 10, pane: '2,2' });
  assert.deepStrictEqual([grid.info.pages, grid.sheets], [10, 3]);
  for (const bad of [',2', '2,', '2.2', '2x2', '0', '2,0']) {
    await assert.rejects(pdf(text, { pane: bad }), /bad pane/);
  }
});

const FALLBACK = ['/System/Library/Fonts/Menlo.ttc'].find((f) => fs.existsSync(f));

test('fallback font and missing glyphs', { skip: !(FONT && FALLBACK) && 'font not found' }, async () => {
  const input = 'a‣b ก\n';
  const none = await pdf(input, {});
  assert.deepStrictEqual([...none.info.missing], [['‣', 1], ['ก', 1]]);
  const fb = await pdf(input, { fallbackFonts: [{ src: FALLBACK, family: 'Menlo-Regular' }] });
  assert.deepStrictEqual([...fb.info.missing], [['ก', 1]]);
});
