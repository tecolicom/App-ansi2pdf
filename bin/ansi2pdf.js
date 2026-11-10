#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('util');
const { emulate } = require('../src/emulate');
const { render, columns, PAPER } = require('../src/render');

const USAGE = `Usage: ansi2pdf [options] [file ...] > out.pdf

  -o, --output FILE      output file (default: stdout)
  -w, --width N          columns of a line; longer lines are wrapped as on a
                         terminal (default: as many as fit the page)
  -l, --lines N          lines per page (default: 60)
  -p, --paper NAME       paper size: ${Object.keys(PAPER).join(', ')} (default: a4)
  -L, --landscape        landscape orientation
  -P, --portrait         portrait orientation
                         (default: landscape when -C has more columns than rows)
  -C, --pane C[.R]       logical pages on a sheet in C columns and R rows,
                         as 2 or 2.2 (default: 2)
  -B, --[no-]border      draw a border around each logical page (default: on)
  -H, --header           print a header with the title and page number
  -t, --title TEXT       title in the header (default: file name)
      --gap MM           space between logical pages in mm (default: 6)
  -s, --font-size PT     font size (default: fit to the paper)
  -m, --margin MM        margin in mm (default: 10)
      --line-height R    line height relative to the font size (default: 1.2)
      --font FILE        font file (default: BIZ UDGothic)
      --bold-font FILE   bold font file
      --fallback-font FILE
                         font for characters the main font does not have;
                         can be repeated, and is tried before the default
                         ones (Noto Sans Mono, Menlo, DejaVu Sans Mono)
  -h, --help             show this help
`;

const FONT_DIRS = [
  path.join(os.homedir(), 'Library/Fonts'), '/Library/Fonts',
  '/usr/share/fonts/truetype', '/usr/local/share/fonts',
];

// Fonts for characters the main font does not have, tried in order.
const FALLBACK_FONTS = [
  ...['NotoSansMono-Regular.ttf', 'NotoSansMono[wdth,wght].ttf',
      'NotoSansMono-VariableFont_wdth,wght.ttf'].map((name) => ({ name })),
  { src: '/System/Library/Fonts/Menlo.ttc', family: 'Menlo-Regular' },
  { src: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf' },
];

function fallbackFonts(given = []) {
  const found = [];
  for (const f of FALLBACK_FONTS) {
    const src = f.src ?? findFont(f.name);
    if (src && fs.existsSync(src) && !found.some((x) => x.src === src)) found.push({ ...f, src });
  }
  // the first of the variable and static Noto Sans Mono is enough
  const noto = found.filter((f) => f.name);
  return [...given.map((src) => ({ src })), ...found.filter((f) => !f.name || f === noto[0])];
}

function findFont(name) {
  for (const dir of FONT_DIRS) {
    const f = path.join(dir, name);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function main() {
  const { values: o, positionals: files } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
      output: { type: 'string', short: 'o' },
      width: { type: 'string', short: 'w' },
      lines: { type: 'string', short: 'l', default: '60' },
      paper: { type: 'string', short: 'p', default: 'a4' },
      landscape: { type: 'boolean', short: 'L' },
      portrait: { type: 'boolean', short: 'P' },
      pane: { type: 'string', short: 'C', default: '2' },
      border: { type: 'boolean', short: 'B', default: true },
      header: { type: 'boolean', short: 'H' },
      title: { type: 'string', short: 't' },
      gap: { type: 'string' },
      'font-size': { type: 'string', short: 's' },
      margin: { type: 'string', short: 'm' },
      'line-height': { type: 'string' },
      font: { type: 'string' },
      'bold-font': { type: 'string' },
      'fallback-font': { type: 'string', multiple: true },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (o.help) { process.stdout.write(USAGE); return; }
  if (o.landscape && o.portrait) throw new Error('-L and -P cannot be used together');
  if (!PAPER[o.paper.toLowerCase()]) throw new Error(`unknown paper: ${o.paper}`);

  const font = o.font ?? findFont('BIZUDGothic-Regular.ttf');
  if (!font) throw new Error('font not found; specify --font');
  const boldFont = o['bold-font'] ?? (o.font ? null : findFont('BIZUDGothic-Bold.ttf'));

  const input = files.length
    ? files.map((f) => fs.readFileSync(f, 'utf8')).join('')
    : fs.readFileSync(0, 'utf8');

  const num = (v) => (v === undefined ? undefined : Number(v));
  const opt = {
    paper: o.paper, landscape: o.portrait ? false : o.landscape, lines: num(o.lines), width: num(o.width),
    pane: o.pane, border: o.border, header: o.header, gap: num(o.gap),
    title: o.title ?? (files.length === 1 ? path.basename(files[0]) : ''),
    fontSize: num(o['font-size']), margin: num(o.margin), lineHeight: num(o['line-height']),
    font, boldFont, fallbackFonts: fallbackFonts(o['fallback-font']),
  };
  // run the terminal with the width of a logical page, so that long lines wrap
  const screen = await emulate(input, { cols: columns(opt) });

  if (!o.output && process.stdout.isTTY) throw new Error('refusing to write PDF to a terminal; use -o');
  const out = o.output ? fs.createWriteStream(o.output) : process.stdout;
  const info = render(screen, out, opt);
  for (const [ch, n] of info.missing) {
    const code = [...ch].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    process.stderr.write(`ansi2pdf: no font has "${ch}" (${code.join(' ')}), ${n} time(s)\n`);
  }
  if (o.output) {
    await new Promise((r) => out.on('finish', r));
    process.stderr.write(`${o.output}: ${screen.cols} cols, ${info.linesPerPage} lines/page, `
      + `${info.pages} page(s) on ${info.sheets} sheet(s), ${info.fontSize.toFixed(2)}pt\n`);
  }
}

main().catch((e) => { process.stderr.write(`ansi2pdf: ${e.message}\n`); process.exit(1); });
