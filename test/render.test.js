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
  const both = g({ width: 300, lines: 20 });
  assert.deepStrictEqual([both.cols, both.lines], [300, 20]);
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

test('variation selectors are not missing glyphs', { skip: !FONT && 'font not found' }, async () => {
  // an ideographic variation sequence, and a variation selector of emoji style
  const { info } = await pdf('\u{845b}\u{e0100} \u{8fbb}\u{e0101} \u{2460}\u{fe0e}\n', {});
  assert.deepStrictEqual([...info.missing], []);
});

test('paper name with orientation', () => {
  const { parsePaper } = require('../src/render');
  const P = (paper, landscape, margin) => ({ paper, landscape, margin });
  assert.deepStrictEqual(parsePaper('a4'), P('a4'));
  assert.deepStrictEqual(parsePaper('a4p'), P('a4', false));
  assert.deepStrictEqual(parsePaper('a4l'), P('a4', true));
  assert.deepStrictEqual(parsePaper('A4L'), P('a4', true));
  assert.deepStrictEqual(parsePaper('letter-p'), P('letter', false));
  assert.deepStrictEqual(parsePaper('b5-l'), P('b5', true));
  // a name that ends with "l" is not taken as landscape
  assert.deepStrictEqual(parsePaper('legal'), P('legal'));
  assert.deepStrictEqual(parsePaper('legall'), P('legal', true));
  // the margin in mm after a colon
  assert.deepStrictEqual(parsePaper('a4:m5'), P('a4', undefined, 5));
  assert.deepStrictEqual(parsePaper('a4p:m3'), P('a4', false, 3));
  assert.deepStrictEqual(parsePaper('A3L:M0'), P('a3', true, 0));
  assert.deepStrictEqual(parsePaper('letter-l:m2.5'), P('letter', true, 2.5));
  for (const name of ['a9', 'a4r', 'a4-', 'p', 'a4pl', '', 'a4:', 'a4:5', 'a4:m', 'a4:mx', 'a4:m5,', 'a4:x5', ':m5', 'a4:m5:m3']) {
    assert.strictEqual(parsePaper(name), null, name);
  }
});

test('lines are as thick to the characters at any size', { skip: !FONT && 'font not found' }, () => {
  const { geometry } = require('../src/render');
  const ratio = (fontSize) => geometry({ font: FONT, fontSize }).lineWidth / fontSize;
  assert.ok(Math.abs(ratio(1.5) - ratio(10)) < 1e-9, `${ratio(1.5)} ${ratio(10)}`);
});

test('the shape of a display', () => {
  const { parsePaper, paperSize } = require('../src/render');
  const P = (paper, landscape, margin) => ({ paper, landscape, margin });
  assert.deepStrictEqual(parsePaper('16x9'), P('16x9', true));
  assert.deepStrictEqual(parsePaper('1080X1920'), P('1080x1920', false));
  assert.deepStrictEqual(parsePaper('1x1'), P('1x1'));
  assert.deepStrictEqual(parsePaper('16x9:m0'), P('16x9', true, 0));
  for (const name of ['0x9', '16x', 'x9', '16x9l', '16x9p']) {
    assert.strictEqual(parsePaper(name), null, name);
  }
  // the long side is that of A4, short side first as a paper
  assert.deepStrictEqual(paperSize('16x9'), [841.89 * (9 / 16), 841.89]);
  assert.deepStrictEqual(paperSize('1920x1080'), paperSize('16x9'));
  assert.deepStrictEqual(paperSize('3x4'), [841.89 * (3 / 4), 841.89]);
  assert.deepStrictEqual(paperSize('a4'), [595.28, 841.89]);
});

test('the last of -L, -P and the paper decides the orientation', { skip: !FONT && 'font not found' }, () => {
  const { execFileSync } = require('child_process');
  const bin = path.join(__dirname, '../bin/ansi2pdf.js');
  const geom = (...args) => execFileSync(process.execPath, [bin, '--geometry', '-C1', ...args], { encoding: 'utf8' });
  const land = geom('-L'), port = geom('-P');
  assert.notStrictEqual(land, port);
  assert.strictEqual(geom('-p', 'a4l'), land);
  assert.strictEqual(geom('-p', 'a4p'), port);
  assert.strictEqual(geom('-p', 'a4'), port);          // -C1 is portrait by itself
  assert.strictEqual(geom('-L', '-p', 'a4p'), port);
  assert.strictEqual(geom('-p', 'a4p', '-L'), land);
  assert.strictEqual(geom('-L', '-p', 'a4'), land);    // a bare name leaves the orientation
  assert.throws(() => geom('-p', 'a4r'), /unknown paper/);
});

test('the last of -m and the paper decides the margin', { skip: !FONT && 'font not found' }, () => {
  const { execFileSync } = require('child_process');
  const bin = path.join(__dirname, '../bin/ansi2pdf.js');
  const geom = (...args) => execFileSync(process.execPath, [bin, '--geometry', '-C1', '-L', ...args], { encoding: 'utf8' });
  const m5 = geom('-m', '5'), m10 = geom('-m', '10'), m0 = geom('-m', '0');
  assert.notStrictEqual(m5, m10);
  assert.strictEqual(geom(), m5);                        // the default is 5 mm
  assert.strictEqual(geom('-p', 'a4:m10'), m10);
  assert.strictEqual(geom('-p', 'a4l:m0'), m0);
  assert.strictEqual(geom('-m', '10', '-p', 'a4:m0'), m0);
  assert.strictEqual(geom('-p', 'a4:m0', '-m', '10'), m10);
  assert.strictEqual(geom('-m', '10', '-p', 'a4'), m10);  // a bare name leaves the margin
  assert.throws(() => geom('-p', 'a4:5'), /unknown paper/);
});

test('block elements join the background of their color', async () => {
  const { fills } = require('../src/render');
  const green = '\x1b[38;2;30;77;43m', board = '\x1b[38;5;231;48;2;30;77;43m', off = '\x1b[m';
  // a board: text on a background, with a border of half blocks in the
  // same color as the foreground, and a block that has its own background
  const screen = await emulate(`${green}▐${off}${board}ab${off}${green}▌${off} `
                               + `\x1b[31;44m▄${off}\n`);
  const L = { cw: 10, ch: 20 };
  const { backgrounds, blocks } = fills(screen.lines[0], 0, { x: 0, y: 0 }, L);
  // the border is in the same path as the board, not painted on its own
  assert.deepStrictEqual(backgrounds.get('#1e4d2b').map((r) => r[0]).sort((a, b) => a - b),
                         [5, 10, 30]);
  // a block on a background is painted over it
  assert.deepStrictEqual([...blocks.keys()].length, 1);
  assert.deepStrictEqual([...blocks.values()][0].map((r) => r.slice(0, 2)), [[50, 10]]);
});

test('glyphs next to each other are drawn in a string', () => {
  const { glyphRuns } = require('../src/render');
  const g = (col, o = {}) => ({ row: 0, col, width: 1, font: 'R', fg: '#000000', italic: false,
                                sx: 1, tc: 0, single: false, ...o });
  const cols = (runs) => runs.map((r) => r.map((x) => x.col));
  // wide and narrow glyphs that fit their cells go together
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { width: 2 }), g(3)])), [[0, 1, 3]]);
  // a gap, another line, color, font, slant, placing and a single glyph break a string
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(2)])), [[0], [2]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { row: 1 })])), [[0], [1]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { fg: '#ff0000' })])), [[0], [1]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { font: 'B' })])), [[0], [1]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { italic: true })])), [[0], [1]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { sx: 0.8 })])), [[0], [1]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0, { tc: 1 }), g(1, { tc: 1 }), g(2, { width: 2, tc: 2 })])),
                         [[0, 1], [2]]);
  assert.deepStrictEqual(cols(glyphRuns([g(0), g(1, { single: true }), g(2)])), [[0], [1], [2]]);
});

test('underlines that touch are joined', () => {
  const { joinUnderlines } = require('../src/render');
  const u = (x, o = {}) => ({ style: 1, color: '#000000', x, y: 10, w: 5, ...o });
  const spans = (list) => joinUnderlines(list).map((s) => [s.x, s.w]);
  assert.deepStrictEqual(spans([u(5), u(0), u(10, { w: 10 })]), [[0, 20]]);
  assert.deepStrictEqual(spans([u(0), u(6)]), [[0, 5], [6, 5]]);
  assert.deepStrictEqual(spans([u(0), u(5, { color: '#ff0000' })]), [[0, 5], [5, 5]]);
  assert.deepStrictEqual(spans([u(0), u(5, { style: 3 })]), [[0, 5], [5, 5]]);
  assert.deepStrictEqual(spans([u(0), u(5, { y: 30 })]), [[0, 5], [5, 5]]);
});
