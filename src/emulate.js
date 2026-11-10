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

// Form feeds are page breaks.  xterm.js takes FF as a line feed and
// leaves no trace of it, so a private OSC is put before each FF to record
// the row where it is.  A new page starts at the next row.  When FF is at
// the beginning of a line, the line it leaves empty is dropped.
const FF_OSC = 7770;

// Clearing the screen (ED2, \e[2J) also starts a new page: what was on
// the screen is pushed up and kept (scrollOnEraseInDisplay), and the new
// screen starts on a new page.  Clearing the scrollback (ED3, \e[3J) is
// ignored, not to lose the output on paper.
async function run(input, cols) {
  const term = new Terminal({
    cols, rows: 24, scrollback: 1e7, convertEol: true, allowProposedApi: true,
    scrollOnEraseInDisplay: true,
  });
  // breaks: { start: row where a new page starts, drop: row to remove }
  const breaks = [];
  term.parser.registerOscHandler(FF_OSC, () => {
    const buf = term.buffer.active;
    const row = buf.baseY + buf.cursorY;
    breaks.push({ start: row + 1, drop: buf.cursorX === 0 ? row : null, ff: true });
    return true;
  });
  term.parser.registerCsiHandler({ final: 'J' }, (params) => {
    if (params[0] === 3) return true;
    if (params[0] === 2) {
      // the erased text is pushed up to the last row that has something
      const buf = term.buffer.active;
      let last = term.rows - 1;
      while (last >= 0 && !buf.getLine(buf.baseY + last).translateToString(true)) last--;
      if (last >= 0) breaks.push({ start: buf.baseY + last + 1, drop: null, ff: false });
    }
    return false;
  });
  await write(term, input.replace(/\f/g, `\x1b]${FF_OSC};\x07\f`));
  term.breaks = breaks;
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
  let lines = grid(term);
  // drop the rows left empty by form feeds, and find where pages start
  const drop = new Set(term.breaks.filter((b) => b.drop !== null).map((b) => b.drop));
  const dropped = (row) => [...drop].filter((r) => r < row).length;
  // consecutive form feeds make a blank page, but a break by clearing the
  // screen at the same place as another break is the same break
  const breaks = [];
  let prev = null;
  for (const b of term.breaks) {
    const start = b.start - dropped(b.start);
    if (prev && prev.start === start && !(prev.ff && b.ff)) continue;
    breaks.push(start);
    prev = { start, ff: b.ff };
  }
  lines = lines.filter((_, row) => !drop.has(row));
  return { cols, lines, breaks: breaks.filter((r) => r > 0 && r < lines.length) };
}

module.exports = { emulate };
