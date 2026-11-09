'use strict';
// Interpret terminal output with headless xterm.js and return a grid of cells.

const { Terminal } = require('@xterm/headless');

const MAX_COLS = 2000;
const COLOR_MODE = { 0: 'default', 16777216: 'p16', 33554432: 'p256', 50331648: 'rgb' };

function color(mode, value) {
  const m = COLOR_MODE[mode] ?? 'default';
  return m === 'default' ? null : { mode: m, value };
}

function cellOf(c) {
  const a = {
    ch: c.getChars(),
    width: c.getWidth(),
    fg: color(c.getFgColorMode(), c.getFgColor()),
    bg: color(c.getBgColorMode(), c.getBgColor()),
    bold: !!c.isBold(),
    dim: !!c.isDim(),
    italic: !!c.isItalic(),
    inverse: !!c.isInverse(),
    invisible: !!c.isInvisible(),
    strike: !!c.isStrikethrough(),
    overline: !!c.isOverline(),
    underline: 0,
    ulcolor: null,
  };
  if (c.isUnderline()) {
    // Not in the public typings, but the returned cell is the internal CellData.
    a.underline = typeof c.getUnderlineStyle === 'function' ? c.getUnderlineStyle() || 1 : 1;
    if (typeof c.getUnderlineColorMode === 'function') {
      a.ulcolor = color(c.getUnderlineColorMode(), c.getUnderlineColor());
    }
  }
  return a;
}

function write(term, data) {
  return new Promise((resolve) => term.write(data, resolve));
}

async function run(input, cols) {
  const term = new Terminal({
    cols, rows: 24, scrollback: 1e7, convertEol: true, allowProposedApi: true,
  });
  await write(term, input);
  return term;
}

// Rightmost column that holds a visible character, over all lines.
function usedWidth(term) {
  const buf = term.buffer.active;
  let max = 0;
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    for (let x = term.cols - 1; x >= max; x--) {
      const c = line.getCell(x);
      const ch = c && c.getChars();
      if (ch && ch !== ' ') { max = x + c.getWidth(); break; }
    }
  }
  return max;
}

function grid(term) {
  const buf = term.buffer.active;
  const lines = [];
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    const cells = [];
    for (let x = 0; x < term.cols; x++) cells.push(cellOf(line.getCell(x)));
    lines.push(cells);
  }
  // drop trailing lines that have nothing to draw
  const blank = (cells) => cells.every((c) => (!c.ch || c.ch === ' ') && !c.bg && !c.inverse);
  while (lines.length && blank(lines[lines.length - 1])) lines.pop();
  return lines;
}

// options.cols: number of columns, or 0/undefined to measure from the input
async function emulate(input, options = {}) {
  let cols = options.cols;
  if (!cols) {
    cols = Math.max(1, usedWidth(await run(input, MAX_COLS)));
  }
  const term = await run(input, cols);
  return { cols, lines: grid(term) };
}

module.exports = { emulate };
