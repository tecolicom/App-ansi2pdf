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
  const two = await pdf(text, { lines: 30, up: 2, border: true, header: true, title: 't' });
  assert.deepStrictEqual([two.info.pages, two.sheets], [4, 2]);
  const grid = await pdf(text, { lines: 10, grid: '3x2' });
  assert.deepStrictEqual([grid.info.pages, grid.sheets], [10, 2]);
});

test('unsupported up count', { skip: !FONT && 'font not found' }, async () => {
  await assert.rejects(pdf(text, { up: 5 }), /unsupported --up 5/);
});
