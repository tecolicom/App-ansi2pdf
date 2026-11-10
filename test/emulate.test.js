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

test('form feeds are page breaks', async () => {
  const rows = (s) => s.lines.map((l) => l.map((c) => c.ch || ' ').join('').trimEnd());
  const a = await emulate('a\nb\n\fc\nd\n', { cols: 10 });
  assert.deepStrictEqual([rows(a), a.breaks], [['a', 'b', 'c', 'd'], [2]]);
  const b = await emulate('a\nb\fc\n', { cols: 10 });
  assert.deepStrictEqual([rows(b), b.breaks], [['a', 'b', 'c'], [2]]);
  const c = await emulate('\fa\n\f\fb\n\f', { cols: 10 });
  assert.deepStrictEqual([rows(c), c.breaks], [['a', 'b'], [1, 1]]);
});

test('clearing the screen starts a new page', async () => {
  const rows = (s) => s.lines.map((l) => l.map((c) => c.ch || ' ').join('').trimEnd());
  const clear = '\x1b[3J\x1b[H\x1b[2J';
  const many = Array.from({ length: 30 }, (_, i) => `L${i + 1}`).join('\n') + '\n';
  const a = await emulate(many + clear + 'c\n', { cols: 10 });
  assert.deepStrictEqual([a.lines.length, rows(a)[0], rows(a)[30], a.breaks], [31, 'L1', 'c', [30]]);
  const b = await emulate(clear + 'a\n' + clear + 'b\n' + clear + '\fc\n', { cols: 10 });
  assert.deepStrictEqual([rows(b), b.breaks], [['a', 'b', 'c'], [1, 2]]);
});
