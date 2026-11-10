'use strict';
// Render a grid of terminal cells to PDF with pdfkit.

const PDFDocument = require('pdfkit');
const { isBox, drawBox, blockOf } = require('./boxdraw');

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

// Logical pages on a sheet, given as "C" or "C.R": C columns and R rows.
function parsePane(v) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v));
  const [c, r] = m ? [Number(m[1]), Number(m[2] ?? 1)] : [0, 0];
  if (!(c >= 1 && r >= 1)) throw new Error(`bad pane: ${v}`);
  return [c, r];
}

// The sheet is landscape when there are more columns than rows.
function sheetLayout(opt) {
  const [gc, gr] = parsePane(opt.pane ?? 1);
  const land = opt.landscape ?? gc > gr;
  let [w, h] = PAPER[(opt.paper || 'a4').toLowerCase()] ?? PAPER.a4;
  if (land) [w, h] = [h, w];
  return { gc, gr, size: [w, h] };
}

// Compute the font size, the cell size and the position of each logical page.
// The font size comes from the lines per page, as in printing text on a
// printer, and the width of a logical page gives the number of columns.
// When opt.width is given, the font is made smaller to fit that many columns.
function layout(doc, opt) {
  const { gc, gr, size: [pw, ph] } = sheetLayout(opt);
  const margin = (opt.margin ?? 10) * MM;
  const gap = (opt.gap ?? 6) * MM;
  const pad = opt.border ? (opt.padding ?? 2) * MM : 0;
  const lineHeight = opt.lineHeight ?? 1.2;

  // slot: area of one logical page, including its header and border
  const slotW = (pw - margin * 2 - gap * (gc - 1)) / gc;
  const slotH = (ph - margin * 2 - gap * (gr - 1)) / gr;
  const headerFs = opt.header ? Math.min(10, Math.max(6, slotH / 60)) : 0;
  const headerH = opt.header ? headerFs * 1.8 : 0;
  // text area inside the border
  const textW = slotW - pad * 2, textH = slotH - headerH - pad * 2;

  doc.font('R').fontSize(1000);
  const half = doc.widthOfString('M') / 1000;
  const { ascender, descender } = doc._font;

  let fs = opt.fontSize;
  if (!fs) {
    fs = opt.lines ? textH / (opt.lines * lineHeight) : opt.maxFontSize ?? 12;
    if (opt.width) fs = Math.min(fs, textW / (opt.width * half));
  }
  const cw = fs * half, ch = fs * lineHeight;
  const cols = opt.width || Math.max(1, Math.floor(textW / cw + 1e-6));
  const perPage = opt.lines || Math.max(1, Math.floor(textH / ch));
  const boxH = (ascender - descender) * fs / 1000;

  const slots = [];
  for (let r = 0; r < gr; r++) {
    for (let c = 0; c < gc; c++) {
      const x = margin + c * (slotW + gap), y = margin + r * (slotH + gap);
      // the border is the whole slot, like a page reduced by a printer driver;
      // smaller text leaves space inside it
      const bw = Math.max(slotW, cols * cw + pad * 2);
      const bh = Math.max(slotH - headerH, perPage * ch + pad * 2);
      slots.push({
        header: { x, y, w: bw, h: headerH, fs: headerFs },
        border: { x, y: y + headerH, w: bw, h: bh },
        text: { x: x + pad, y: y + headerH + pad },
      });
    }
  }
  return {
    size: [pw, ph], slots, fs, cw, ch, cols, perPage,
    lw: Math.max(0.3, fs * 0.07),
    base: (ch - boxH) / 2 + ascender * fs / 1000,     // baseline offset in a cell
  };
}

// number of columns of a logical page, to run the terminal emulator with
function columns(opt) {
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.registerFont('R', opt.font);
  return layout(doc, opt).cols;
}

// Choose the font for a character: the main font if it has the glyph,
// otherwise the first fallback font that has it.  Characters that no font
// has are counted in `missing` and drawn with the main font.
function fontPicker(doc, fallbacks = []) {
  const names = fallbacks.map((f, i) => {
    doc.registerFont(`F${i}`, f.src, f.family);
    return `F${i}`;
  });
  const has = (name, cps) => {
    doc.font(name);
    return cps.every((cp) => doc._font.font.hasGlyphForCodePoint(cp));
  };
  const cache = new Map(), missing = new Map();
  return {
    missing,
    pick(text, bold) {
      const main = bold ? 'B' : 'R', key = main + text;
      if (!cache.has(key)) {
        // variation selectors and joiners are not glyphs to look for
        const cps = [...text].map((c) => c.codePointAt(0))
          .filter((cp) => !(cp >= 0xfe00 && cp <= 0xfe0f) && cp !== 0x200d);
        cache.set(key, has(main, cps) ? main : names.find((n) => has(n, cps)) ?? null);
      }
      const name = cache.get(key);
      if (name === null) missing.set(text, (missing.get(text) ?? 0) + 1);
      return name ?? main;
    },
  };
}

function render(screen, out, opt = {}) {
  const doc = new PDFDocument({ margin: 0, autoFirstPage: false });
  doc.pipe(out);
  doc.registerFont('R', opt.font);
  doc.registerFont('B', opt.boldFont || opt.font);
  const fonts = fontPicker(doc, opt.fallbackFonts);

  const L = layout(doc, opt);
  L.fonts = fonts;
  const lines = screen.lines.length ? screen.lines : [[]];
  const total = Math.ceil(lines.length / L.perPage);
  for (let n = 0; n < total; n++) {
    const slot = L.slots[n % L.slots.length];
    if (n % L.slots.length === 0) doc.addPage({ size: L.size, margin: 0 });
    drawPage(doc, lines.slice(n * L.perPage, (n + 1) * L.perPage), slot.text, L);
    if (opt.border) {
      const b = slot.border;
      doc.save().lineWidth(Math.max(0.5, L.lw)).strokeColor(INK_COLOR)
        .rect(b.x, b.y, b.w, b.h).stroke().restore();
    }
    if (opt.header) drawHeader(doc, slot.header, opt.title ?? '', `${n + 1} / ${total}`);
  }
  doc.end();
  return {
    fontSize: L.fs, linesPerPage: L.perPage, pages: total,
    sheets: Math.ceil(total / L.slots.length),
    missing: fonts.missing,
  };
}

function drawPage(doc, page, origin, L) {
  const m = { fs: L.fs, ch: L.ch, lw: L.lw, base: L.base, fonts: L.fonts };
  // Backgrounds first, so that glyphs and lines are drawn over them.
  // Runs of a color are filled as one path per color: filling cells one by
  // one leaves faint seams between them in reduced views.
  const runs = new Map();
  page.forEach((cells, row) => {
    let run = null;
    cells.forEach((cell, col) => {
      if (cell.width === 0) return;
      const { bg } = colors(cell);
      if (run && run.bg === bg && run.end === col) {
        run.end = col + cell.width;
      } else {
        run = { bg, row, start: col, end: col + cell.width };
        if (bg) (runs.get(bg) ?? runs.set(bg, []).get(bg)).push(run);
      }
    });
  });
  for (const [bg, list] of runs) {
    for (const r of list) {
      doc.rect(origin.x + r.start * L.cw, origin.y + r.row * L.ch,
               (r.end - r.start) * L.cw + 0.1, L.ch + 0.1);
    }
    doc.fill(bg);
  }
  // Block elements are filled as rectangles, as terminals do, also as one
  // path per color.  Font glyphs of them do not fill the cell.
  const blocks = new Map();
  page.forEach((cells, row) => {
    cells.forEach((cell, col) => {
      const b = cell.width && !cell.invisible && blockOf(cell.ch);
      if (!b) return;
      const { fg, bg } = colors(cell);
      const color = b.shade < 1 ? mix(bg ?? PAPER_COLOR, fg, b.shade) : fg;
      const x = origin.x + col * L.cw, y = origin.y + row * L.ch, w = L.cw * cell.width;
      const list = blocks.get(color) ?? blocks.set(color, []).get(color);
      // extend edges on the cell boundary a little, to join the next cell
      for (const [x0, y0, x1, y1] of b.rects) {
        list.push([x + x0 * w, y + y0 * L.ch, (x1 - x0) * w + (x1 === 1 ? 0.1 : 0),
                   (y1 - y0) * L.ch + (y1 === 1 ? 0.1 : 0)]);
      }
    });
  });
  for (const [color, list] of blocks) {
    for (const r of list) doc.rect(...r);
    doc.fill(color);
  }
  page.forEach((cells, row) => {
    const y = origin.y + row * L.ch;
    cells.forEach((cell, col) => {
      if (cell.width === 0) return;
      // A glyph wider than its cell may extend over a blank cell next to it,
      // as terminals do, such as an ambiguous-width character followed by a
      // space to keep its room.
      const next = cells[col + cell.width];
      const room = next && next.width === 1 && (!next.ch || next.ch === ' ' || next.ch === '\u00a0') ? L.cw : 0;
      drawCell(doc, cell, origin.x + col * L.cw, y, L.cw * cell.width, m, room);
    });
  });
}

function drawHeader(doc, h, left, right) {
  const y = h.y + (h.h - h.fs) / 2;
  doc.save().font('B').fontSize(h.fs).fillColor(INK_COLOR);
  doc.text(left, h.x, y, { lineBreak: false });
  doc.font('R').text(right, h.x + h.w - doc.widthOfString(right), y, { lineBreak: false });
  doc.restore();
}

function drawCell(doc, cell, x, y, w, m, room = 0) {
  const { fg } = colors(cell);
  const text = cell.ch;
  if (text && text !== ' ' && !cell.invisible && !blockOf(text)) {
    if (!(isBox(text) && drawBox(doc, text, x, y, w, m.ch, m.lw, fg))) {
      drawGlyph(doc, cell, text, x, y, w, m, fg, room);
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

// Glyphs narrower than this ratio of the room are shrunk keeping the shape,
// to this ratio of the room in width.
const MIN_SQUEEZE = 0.75;
const OVERFLOW = 1.2;

function drawGlyph(doc, cell, text, x, y, w, m, fg, room = 0) {
  doc.font(m.fonts.pick(text, cell.bold)).fontSize(m.fs).fillColor(fg);
  const adv = doc.widthOfString(text);
  const avail = w + room;
  const skew = cell.italic ? 0.2 : 0;
  doc.save();
  if (adv <= avail * 1.01) {
    doc.transform(1, 0, -skew, 1, x, y + m.base);   // origin at the baseline
  } else if (adv * MIN_SQUEEZE <= avail) {
    // a little wider than the room: squeeze horizontally
    doc.transform(avail / adv, 0, -skew, 1, x, y + m.base);
  } else {
    // much wider, such as a full-width glyph in one cell: shrink in both
    // directions to keep the shape, centered on the line; it may extend a
    // little over the cells on both sides not to be too small
    // around the middle of the capital height, to line up with letters
    const s = avail * OVERFLOW / adv;
    const mid = (doc._font.capHeight || 700) * m.fs / 1000 / 2;
    doc.transform(s, 0, -skew * s, s, x + avail * (1 - OVERFLOW) / 2,
                  y + m.base - mid * (1 - s));
  }
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

module.exports = { render, columns, PAPER };
