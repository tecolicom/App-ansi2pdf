'use strict';
// Render a grid of terminal cells to PDF with pdfkit.

const PDFDocument = require('pdfkit');
const { isBox, drawBox } = require('./boxdraw');

const MM = 72 / 25.4;
const PAPER = {
  a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28],
  b4: [728.5, 1031.81], b5: [515.91, 728.5], letter: [612, 792], legal: [612, 1008],
};

// xterm.js default palette for the 16 colors
const ANSI16 = [
  '#2e3436', '#cc0000', '#4e9a06', '#c4a000', '#3465a4', '#75507b', '#06989a', '#d3d7cf',
  '#555753', '#ef2929', '#8ae234', '#fce94f', '#729fcf', '#ad7fa8', '#34e2e2', '#eeeeec',
];
const PAPER_COLOR = '#ffffff';
const INK_COLOR = '#000000';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function paletteColor(n) {
  if (n < 16) return ANSI16[n];
  if (n < 232) {
    const lv = [0, 95, 135, 175, 215, 255];
    n -= 16;
    return hex((lv[Math.floor(n / 36)] << 16) | (lv[Math.floor(n / 6) % 6] << 8) | lv[n % 6]);
  }
  const g = 8 + (n - 232) * 10;
  return hex((g << 16) | (g << 8) | g);
}

function resolve(c) {
  if (!c) return null;
  return c.mode === 'rgb' ? hex(c.value) : paletteColor(c.value);
}

function mix(a, b, t) {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.substr(i, 2), 16));
  const [x, y] = [p(a), p(b)];
  return hex(x.map((v, i) => Math.round(v * (1 - t) + y[i] * t)).reduce((s, v) => (s << 8) | v, 0));
}

// foreground and background colors of a cell, taking inverse and dim into account
function colors(cell) {
  let fg = resolve(cell.fg) ?? INK_COLOR;
  let bg = resolve(cell.bg);
  if (cell.inverse) [fg, bg] = [bg ?? PAPER_COLOR, fg];
  if (cell.dim) fg = mix(fg, bg ?? PAPER_COLOR, 0.5);
  return { fg, bg };
}

function pageSize(opt) {
  let [w, h] = PAPER[(opt.paper || 'a4').toLowerCase()] ?? PAPER.a4;
  if (opt.landscape) [w, h] = [h, w];
  return [w, h];
}

function render(screen, out, opt = {}) {
  const doc = new PDFDocument({ size: pageSize(opt), margin: 0, autoFirstPage: false });
  doc.pipe(out);
  doc.registerFont('R', opt.font);
  doc.registerFont('B', opt.boldFont || opt.font);

  const [pw, ph] = pageSize(opt);
  const margin = (opt.margin ?? 10) * MM;
  const lineHeight = opt.lineHeight ?? 1.2;
  const availW = pw - margin * 2, availH = ph - margin * 2;

  // advance of a half-width character, relative to the font size
  doc.font('R').fontSize(1000);
  const half = doc.widthOfString('M') / 1000;
  const { ascender, descender } = doc._font;

  const cols = screen.cols;
  let fs = opt.fontSize;
  if (!fs) {
    fs = availW / (cols * half);
    if (opt.lines) fs = Math.min(fs, availH / (opt.lines * lineHeight));
    else fs = Math.min(fs, opt.maxFontSize ?? 12);
  }
  const cw = fs * half, ch = fs * lineHeight;
  const perPage = opt.lines || Math.max(1, Math.floor(availH / ch));
  const lw = Math.max(0.3, fs * 0.07);
  // baseline offset from the top of a cell: center the font box vertically
  const boxH = (ascender - descender) * fs / 1000;
  const base = (ch - boxH) / 2 + ascender * fs / 1000;
  // align the grid to the left-top of the printable area
  const ox = margin, oy = margin;

  const lines = screen.lines.length ? screen.lines : [[]];
  for (let p = 0; p < lines.length; p += perPage) {
    doc.addPage();
    const page = lines.slice(p, p + perPage);
    // backgrounds first, so that glyphs and lines are drawn over them
    page.forEach((cells, row) => {
      const y = oy + row * ch;
      cells.forEach((cell, col) => {
        if (cell.width === 0) return;
        const { bg } = colors(cell);
        if (bg) doc.rect(ox + col * cw, y, cw * cell.width + 0.1, ch + 0.1).fill(bg);
      });
    });
    page.forEach((cells, row) => {
      const y = oy + row * ch;
      cells.forEach((cell, col) => {
        if (cell.width === 0) return;
        drawCell(doc, cell, ox + col * cw, y, cw * cell.width, { fs, ch, lw, base });
      });
    });
  }
  doc.end();
  return { fontSize: fs, linesPerPage: perPage, pages: Math.ceil(lines.length / perPage) };
}

function drawCell(doc, cell, x, y, w, m) {
  const { fg } = colors(cell);
  const text = cell.ch;
  if (text && text !== ' ' && !cell.invisible) {
    if (!(isBox(text) && drawBox(doc, text, x, y, w, m.ch, m.lw, fg))) {
      drawGlyph(doc, cell, text, x, y, w, m, fg);
    }
  }
  const line = (yy, color, width) => {
    doc.save().lineWidth(width).strokeColor(color).moveTo(x, yy).lineTo(x + w, yy).stroke().restore();
  };
  if (cell.underline) {
    drawUnderline(doc, cell.underline, x, y + m.base + m.fs * 0.15, w, m.lw,
                  resolve(cell.ulcolor) ?? fg);
  }
  if (cell.strike) line(y + m.base - m.fs * 0.3, fg, m.lw);
  if (cell.overline) line(y + m.lw, fg, m.lw);
}

function drawGlyph(doc, cell, text, x, y, w, m, fg) {
  doc.font(cell.bold ? 'B' : 'R').fontSize(m.fs).fillColor(fg);
  const adv = doc.widthOfString(text);
  const sx = adv > w * 1.01 ? w / adv : 1;      // squeeze glyphs wider than the cell
  const skew = cell.italic ? 0.2 : 0;
  doc.save();
  doc.transform(sx, 0, -skew, 1, x, y + m.base);   // origin at the baseline
  doc.text(text, 0, 0, { lineBreak: false, baseline: 'alphabetic' });
  doc.restore();
}

// style: 1 single, 2 double, 3 curly, 4 dotted, 5 dashed
function drawUnderline(doc, style, x, y, w, lw, color) {
  doc.save().lineWidth(lw).strokeColor(color);
  if (style === 2) {
    doc.moveTo(x, y - lw).lineTo(x + w, y - lw).stroke();
    doc.moveTo(x, y + lw).lineTo(x + w, y + lw).stroke();
  } else if (style === 3) {
    const n = Math.max(1, Math.round(w / (lw * 8))), step = w / n, a = lw * 1.5;
    doc.moveTo(x, y);
    for (let i = 0; i < n; i++) {
      const x0 = x + i * step;
      doc.bezierCurveTo(x0 + step / 3, y - a, x0 + step * 2 / 3, y + a, x0 + step, y);
    }
    doc.stroke();
  } else {
    if (style === 4) doc.dash(lw, { space: lw * 1.5 });
    if (style === 5) doc.dash(lw * 4, { space: lw * 2 });
    doc.moveTo(x, y).lineTo(x + w, y).stroke();
  }
  doc.restore();
}

module.exports = { render, PAPER };
