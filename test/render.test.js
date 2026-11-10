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
  const grid = await pdf(text, { lines: 10, pane: '3.2' });
  assert.deepStrictEqual([grid.info.pages, grid.sheets], [10, 2]);
});

test('panes and rows', { skip: !FONT && 'font not found' }, async () => {
  const four = await pdf(text, { lines: 10, pane: 4 });
  assert.deepStrictEqual([four.info.pages, four.sheets], [10, 3]);
  const grid = await pdf(text, { lines: 10, pane: '2.2' });
  assert.deepStrictEqual([grid.info.pages, grid.sheets], [10, 3]);
  for (const bad of ['.2', '2.', '2x2', '0', '2.0']) {
    await assert.rejects(pdf(text, { pane: bad }), /bad pane/);
  }
});
