'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { emulate } = require('../src/emulate');

const at = (screen, y, x) => screen.lines[y][x];

test('measures columns from the input', async () => {
  const s = await emulate('abc\n漢字xy\n');
  assert.strictEqual(s.cols, 6);
  assert.strictEqual(s.lines.length, 2);
  assert.strictEqual(at(s, 1, 0).width, 2);
});

test('colors', async () => {
  const s = await emulate('\x1b[31;48;5;224ma\x1b[38;2;255;128;0mb\x1b[m');
  assert.deepStrictEqual(at(s, 0, 0).fg, { mode: 'p16', value: 1 });
  assert.deepStrictEqual(at(s, 0, 0).bg, { mode: 'p256', value: 224 });
  assert.deepStrictEqual(at(s, 0, 1).fg, { mode: 'rgb', value: 0xff8000 });
});

test('underline style and color', async () => {
  const s = await emulate('\x1b[4:3;58:2::255:0:0ma\x1b[m');
  assert.strictEqual(at(s, 0, 0).underline, 3);
  assert.deepStrictEqual(at(s, 0, 0).ulcolor, { mode: 'rgb', value: 0xff0000 });
});

test('attribute reset by 22 and 24', async () => {
  const s = await emulate('\x1b[1;2;4ma\x1b[22mb\x1b[24mc\x1b[m');
  assert.ok(at(s, 0, 0).bold && at(s, 0, 0).dim && at(s, 0, 0).underline);
  assert.ok(!at(s, 0, 1).bold && !at(s, 0, 1).dim && at(s, 0, 1).underline);
  assert.ok(!at(s, 0, 2).underline);
});

test('erase line fills the rest of the line with background', async () => {
  const s = await emulate('xxxxxxxx\n\x1b[44mab\x1b[K\x1b[m\n', { cols: 8 });
  assert.deepStrictEqual(at(s, 1, 7).bg, { mode: 'p16', value: 4 });
});
