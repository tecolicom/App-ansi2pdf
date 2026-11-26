'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { emulate } = require('../src/emulate');
const { render } = require('../src/render');
const { placeholder } = require('../src/image');

const FONT = [path.join(os.homedir(), 'Library/Fonts/BIZUDGothic-Regular.ttf'),
              '/Library/Fonts/BIZUDGothic-Regular.ttf'].find((f) => fs.existsSync(f));

// a PNG of 1 x 1 pixel
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ansi2pdf-'));
const PNG = path.join(dir, 'a.png');
fs.writeFileSync(PNG, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'));

// The combining characters for the numbers 0, 1, 2 and 34, 35 (which
// are not combining in the Unicode 6 table of xterm.js)
const D = { 0: '̅', 1: '̍', 2: '̎', 34: '҇', 35: '֒' };
const ID = 0x123456;
const color = `\x1b[38;2;${ID >> 16};${(ID >> 8) & 255};${ID & 255}m`;
const osc = (file, cols, rows) => `\x1b]7771;i=${ID},c=${cols},r=${rows};${file}\x1b\\`;
const row = (r, cols) => color + cols.map((c) => '\u{10eeee}' + D[r] + D[c]).join('') + '\x1b[39m';

async function pdf(input) {
  const screen = await emulate(input);
  const out = new PassThrough();
  const chunks = [];
  out.on('data', (c) => chunks.push(c));
  const done = new Promise((r) => out.on('end', r));
  const info = render(screen, out, { font: FONT });
  await done;
  const body = Buffer.concat(chunks).toString('latin1');
  // the alpha channel of a PNG is an image of its own (/SMask)
  const count = (re) => (body.match(re) || []).length;
  return { screen, info, images: count(/\/Subtype \/Image\b/g) - count(/\/SMask\b/g) };
}

test('the OSC tells the file and the size of an id', async () => {
  const screen = await emulate(osc(PNG, 3, 2) + row(0, [0, 1, 2]) + '\n');
  assert.deepStrictEqual(screen.images.get(ID), { file: PNG, cols: 3, rows: 2 });
});

test('a placeholder cell: the id, the row and the column', async () => {
  const screen = await emulate(row(34, [0, 34, 35]) + '|\n');
  const cells = screen.lines[0];
  assert.deepStrictEqual(cells.slice(0, 3).map(placeholder),
    [0, 34, 35].map((col) => ({ id: ID, row: 34, col })));
  assert.strictEqual(cells[3].ch, '|', 'one cell each, with combining characters after Unicode 6');
});

test('the image is drawn in its cells', { skip: !FONT && 'font not found' }, async () => {
  const whole = await pdf('text\n' + [0, 1].map((r) => osc(PNG, 3, 2) + row(r, [0, 1, 2]) + '\n').join(''));
  assert.strictEqual(whole.images, 1, 'the image');
  assert.strictEqual(whole.info.missing.size, 0, 'the placeholders are not drawn as text');
  const part = await pdf(osc(PNG, 3, 2) + row(1, [0, 1, 2]) + '\n');
  assert.strictEqual(part.images, 1, 'a part of the image');
  const unknown = await pdf(row(0, [0, 1, 2]) + '\n');
  assert.strictEqual(unknown.images, 0, 'no image for an unknown id');
  assert.strictEqual(unknown.info.missing.size, 0, 'and its cells are left empty');
});
