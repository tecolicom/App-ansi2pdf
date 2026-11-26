'use strict';
// Images by the Unicode placeholders of the kitty graphics protocol.
//
// Each cell of an image is U+10EEEE with two combining characters, the
// row and the column of the cell in the image, and the id of the image
// as its 24-bit foreground color.  The image itself is not in the text:
// a private OSC, which terminals ignore, tells the file of an id and
// the size of the image in cells:
//
//   ESC ] 7771 ; i=ID,c=COLS,r=ROWS ; FILE ST
//
// The image is fit into its COLS x ROWS cells keeping its shape, and
// only the cells that are there are drawn, so a part of an image shows
// that part.

const IMAGE_OSC = 7771;
const PLACEHOLDER = 0x10eeee;

// The row and column numbers, from 0, as the kitty protocol defines them
// (the same list as in Text::ANSI::Image::kitty).
const DIACRITICS = `
  0305 030D 030E 0310 0312 033D 033E 033F 0346 034A 034B 034C
  0350 0351 0352 0357 035B 0363 0364 0365 0366 0367 0368 0369
  036A 036B 036C 036D 036E 036F 0483 0484 0485 0486 0487 0592
  0593 0594 0595 0597 0598 0599 059C 059D 059E 059F 05A0 05A1
  05A8 05A9 05AB 05AC 05AF 05C4 0610 0611 0612 0613 0614 0615
  0616 0617 0657 0658 0659 065A 065B 065D 065E 06D6 06D7 06D8
  06D9 06DA 06DB 06DC 06DF 06E0 06E1 06E2 06E4 06E7 06E8 06EB
  06EC 0730 0732 0733 0735 0736 073A 073D 073F 0740 0741 0743
  0745 0747 0749 074A 07EB 07EC 07ED 07EE 07EF 07F0 07F1 07F3
  0816 0817 0818 0819 081B 081C 081D 081E 081F 0820 0821 0822
  0823 0825 0826 0827 0829 082A 082B 082C 082D 0951 0953 0954
  0F82 0F83 0F86 0F87 135D 135E 135F 17DD 193A 1A17 1A75 1A76
  1A77 1A78 1A79 1A7A 1A7B 1A7C 1B6B 1B6D 1B6E 1B6F 1B70 1B71
  1B72 1B73 1CD0 1CD1 1CD2 1CDA 1CDB 1CE0 1DC0 1DC1 1DC3 1DC4
  1DC5 1DC6 1DC7 1DC8 1DC9 1DCB 1DCC 1DD1 1DD2 1DD3 1DD4 1DD5
  1DD6 1DD7 1DD8 1DD9 1DDA 1DDB 1DDC 1DDD 1DDE 1DDF 1DE0 1DE1
  1DE2 1DE3 1DE4 1DE5 1DE6 1DFE 20D0 20D1 20D4 20D5 20D6 20D7
  20DB 20DC 20E1 20E7 20E9 20F0 2CEF 2CF0 2CF1 2DE0 2DE1 2DE2
  2DE3 2DE4 2DE5 2DE6 2DE7 2DE8 2DE9 2DEA 2DEB 2DEC 2DED 2DEE
  2DEF 2DF0 2DF1 2DF2 2DF3 2DF4 2DF5 2DF6 2DF7 2DF8 2DF9 2DFA
  2DFB 2DFC 2DFD 2DFE 2DFF A66F A67C A67D A6F0 A6F1 A8E0 A8E1
  A8E2 A8E3 A8E4 A8E5 A8E6 A8E7 A8E8 A8E9 A8EA A8EB A8EC A8ED
  A8EE A8EF A8F0 A8F1 AAB0 AAB2 AAB3 AAB7 AAB8 AABE AABF AAC1
  FE20 FE21 FE22 FE23 FE24 FE25 FE26 10A0F 10A38 1D185 1D186 1D187
  1D188 1D189 1D1AA 1D1AB 1D1AC 1D1AD 1D242 1D243 1D244
`.trim().split(/\s+/).reduce((m, h, i) => m.set(parseInt(h, 16), i), new Map());

// The OSC handler: record the file and the size of each id in `images`.
function handler(images) {
  return (data) => {
    const m = /^([^;]*);(.*)$/s.exec(data);
    if (!m) return true;
    const p = Object.fromEntries(m[1].split(',').map((kv) => kv.split('=')));
    const id = Number(p.i), cols = Number(p.c), rows = Number(p.r);
    if (id > 0 && cols > 0 && rows > 0 && m[2]) images.set(id, { file: m[2], cols, rows });
    return true;
  };
}

// The id, row and column of a placeholder cell, or null.
function placeholder(cell) {
  const cps = [...(cell.ch || '')].map((c) => c.codePointAt(0));
  if (cps[0] !== PLACEHOLDER || !cell.fg || cell.fg.mode !== 'rgb') return null;
  const row = DIACRITICS.get(cps[1]), col = DIACRITICS.get(cps[2]);
  if (row === undefined || col === undefined) return null;
  return { id: cell.fg.value, row, col };
}

// The parts of images on a page: for each id and place of the image
// (the cell where its top left would be), the rows and columns of the
// page it takes.
function parts(page) {
  const found = new Map();
  page.forEach((cells, y) => cells.forEach((cell, x) => {
    const p = placeholder(cell);
    if (!p) return;
    const key = `${p.id}:${y - p.row}:${x - p.col}`;
    const a = found.get(key);
    if (a) {
      a.y0 = Math.min(a.y0, y); a.y1 = Math.max(a.y1, y);
      a.x0 = Math.min(a.x0, x); a.x1 = Math.max(a.x1, x);
    } else {
      found.set(key, { id: p.id, top: y - p.row, left: x - p.col, y0: y, y1: y, x0: x, x1: x });
    }
  }));
  return [...found.values()];
}

// Draw the images of a page.  An image whose file is not known or
// cannot be read leaves its cells empty.
function drawImages(doc, page, images, origin, L) {
  for (const a of parts(page)) {
    const img = images.get(a.id);
    if (!img) continue;
    const box = [origin.x + a.left * L.cw, origin.y + a.top * L.ch, img.cols * L.cw, img.rows * L.ch];
    doc.save();
    doc.rect(origin.x + a.x0 * L.cw, origin.y + a.y0 * L.ch,
             (a.x1 - a.x0 + 1) * L.cw, (a.y1 - a.y0 + 1) * L.ch).clip();
    try {
      doc.image(img.file, box[0], box[1], { fit: [box[2], box[3]], align: 'center', valign: 'center' });
    } catch (e) {
      if (!img.warned) {
        process.stderr.write(`ansi2pdf: ${img.file}: ${e.message}\n`);
        img.warned = true;
      }
    }
    doc.restore();
  }
}

module.exports = { IMAGE_OSC, handler, placeholder, drawImages };
