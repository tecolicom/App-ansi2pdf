'use strict';
// Box drawing characters (U+2500..) as line segments instead of font glyphs.
//
// Each character is described by its arms [up, right, down, left], where
// 0 = none, 1 = light, 2 = heavy, 3 = double, and an optional dash count.

const L = 1, H = 2, D = 3;
const BOX = new Map();
const def = (chars, arms, dash = 0) => {
  for (const ch of chars) BOX.set(ch, { arms, dash });
};

// straight lines
def('─', [0, L, 0, L]); def('━', [0, H, 0, H]); def('═', [0, D, 0, D]);
def('│', [L, 0, L, 0]); def('┃', [H, 0, H, 0]); def('║', [D, 0, D, 0]);
// corners
def('┌╭', [0, L, L, 0]); def('┐╮', [0, 0, L, L]); def('└╰', [L, L, 0, 0]); def('┘╯', [L, 0, 0, L]);
def('┏', [0, H, H, 0]); def('┓', [0, 0, H, H]); def('┗', [H, H, 0, 0]); def('┛', [H, 0, 0, H]);
def('╔', [0, D, D, 0]); def('╗', [0, 0, D, D]); def('╚', [D, D, 0, 0]); def('╝', [D, 0, 0, D]);
// tees and crosses
def('├', [L, L, L, 0]); def('┤', [L, 0, L, L]); def('┬', [0, L, L, L]); def('┴', [L, L, 0, L]); def('┼', [L, L, L, L]);
def('┣', [H, H, H, 0]); def('┫', [H, 0, H, H]); def('┳', [0, H, H, H]); def('┻', [H, H, 0, H]); def('╋', [H, H, H, H]);
def('╠', [D, D, D, 0]); def('╣', [D, 0, D, D]); def('╦', [0, D, D, D]); def('╩', [D, D, 0, D]); def('╬', [D, D, D, D]);
// half lines
def('╴', [0, 0, 0, L]); def('╵', [L, 0, 0, 0]); def('╶', [0, L, 0, 0]); def('╷', [0, 0, L, 0]);
def('╸', [0, 0, 0, H]); def('╹', [H, 0, 0, 0]); def('╺', [0, H, 0, 0]); def('╻', [0, 0, H, 0]);
// dashed lines
def('┄', [0, L, 0, L], 3); def('┅', [0, H, 0, H], 3); def('┈', [0, L, 0, L], 4); def('┉', [0, H, 0, H], 4);
def('╌', [0, L, 0, L], 2); def('╍', [0, H, 0, H], 2);
def('┆', [L, 0, L, 0], 3); def('┇', [H, 0, H, 0], 3); def('┊', [L, 0, L, 0], 4); def('┋', [H, 0, H, 0], 4);
def('╎', [L, 0, L, 0], 2); def('╏', [H, 0, H, 0], 2);

function isBox(ch) {
  return BOX.has(ch);
}

// Draw box character ch in the cell (x, y, w, h) with pdfkit doc.
// lw: light line width.
function drawBox(doc, ch, x, y, w, h, lw, color) {
  const box = BOX.get(ch);
  if (!box) return false;
  const [up, right, down, left] = box.arms;
  const cx = x + w / 2, cy = y + h / 2;
  const d = lw * 1.5;                          // half gap of double lines
  doc.save();
  doc.strokeColor(color).lineCap('butt');
  if (box.dash) {
    const len = (box.arms[1] ? w : h) / box.dash;
    doc.dash(len * 0.6, { space: len * 0.4, phase: -len * 0.2 });
  }
  const seg = (x1, y1, x2, y2, weight) => {
    doc.lineWidth(weight === H ? lw * 2.2 : lw).moveTo(x1, y1).lineTo(x2, y2).stroke();
  };
  // extension at the center so that perpendicular arms join without a notch
  const ext = (a, b) => (Math.max(a, b) === H ? lw * 1.1 : Math.max(a, b) ? lw / 2 : 0);
  const vext = ext(up, down), hext = ext(left, right);

  // single (light/heavy) arms
  if (right && right !== D) seg(cx - vext, cy, x + w, cy, right);
  if (left && left !== D) seg(x, cy, cx + vext, cy, left);
  if (up && up !== D) seg(cx, y, cx, cy + hext, up);
  if (down && down !== D) seg(cx, cy - hext, cx, y + h, down);

  // double arms: two parallel lines, cut so that crossings leave gaps
  const U = up === D, R = right === D, Dn = down === D, Lf = left === D;
  if (R) {
    seg(U ? cx + d : Dn ? cx - d : cx, cy - d, x + w, cy - d, L);
    seg(Dn ? cx + d : U ? cx - d : cx, cy + d, x + w, cy + d, L);
  }
  if (Lf) {
    seg(x, cy - d, U ? cx - d : Dn ? cx + d : cx, cy - d, L);
    seg(x, cy + d, Dn ? cx - d : U ? cx + d : cx, cy + d, L);
  }
  if (U) {
    seg(cx - d, y, cx - d, Lf ? cy - d : R ? cy + d : cy, L);
    seg(cx + d, y, cx + d, R ? cy - d : Lf ? cy + d : cy, L);
  }
  if (Dn) {
    seg(cx - d, Lf ? cy + d : R ? cy - d : cy, cx - d, y + h, L);
    seg(cx + d, R ? cy + d : Lf ? cy - d : cy, cx + d, y + h, L);
  }
  doc.restore();
  return true;
}

// Block elements (U+2580..U+259F) as rectangles in a cell, in fractions
// of the cell: [x0, y0, x1, y1].  Shades are a full cell with a density.
const BLOCK = new Map();
{
  const q = { UL: [0, 0, 0.5, 0.5], UR: [0.5, 0, 1, 0.5], LL: [0, 0.5, 0.5, 1], LR: [0.5, 0.5, 1, 1] };
  const set = (cp, rects, shade = 1) => BLOCK.set(String.fromCodePoint(cp), { rects, shade });
  set(0x2580, [[0, 0, 1, 0.5]]);
  for (let n = 1; n <= 8; n++) set(0x2580 + n, [[0, 1 - n / 8, 1, 1]]);   // lower n/8, 2588 is full
  for (let n = 7; n >= 1; n--) set(0x2589 + 7 - n, [[0, 0, n / 8, 1]]);   // left n/8
  set(0x2590, [[0.5, 0, 1, 1]]);
  set(0x2591, [[0, 0, 1, 1]], 0.25);
  set(0x2592, [[0, 0, 1, 1]], 0.5);
  set(0x2593, [[0, 0, 1, 1]], 0.75);
  set(0x2594, [[0, 0, 1, 1 / 8]]);
  set(0x2595, [[7 / 8, 0, 1, 1]]);
  const quads = ['LL', 'LR', 'UL', 'UL LL LR', 'UL LR', 'UL UR LL', 'UL UR LR', 'UR', 'UR LL', 'UR LL LR'];
  quads.forEach((s, i) => set(0x2596 + i, s.split(' ').map((k) => q[k])));
}

function blockOf(ch) {
  return BLOCK.get(ch) ?? null;
}

module.exports = { isBox, drawBox, blockOf };
