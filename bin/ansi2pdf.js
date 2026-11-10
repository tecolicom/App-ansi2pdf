#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('util');
const { emulate } = require('../src/emulate');
const { render, geometry, PAPER } = require('../src/render');

const USAGE = `Usage: ansi2pdf [options] [file ...] > out.pdf

  -o, --output FILE      output file (default: stdout)
  -l, --lines N          lines per page (default: 60, or as many as fit the
                         page when -w or -s is given)
  -w, --width N          columns of a line; longer lines are wrapped as on a
                         terminal (default: as many as fit the page)
  -p, --paper NAME       paper size: ${Object.keys(PAPER).join(', ')} (default: a4)
  -L, --landscape        landscape orientation
  -P, --portrait         portrait orientation
                         (default: landscape when -C has more columns than rows)
  -C, --pane C[,R]       logical pages on a sheet in C columns and R rows,
                         as 2 or 2,2 (default: 2)
  -B, --[no-]border      draw a border around each logical page (default: on)
  -H, --header           print a header with the title and page number
  -t, --title TEXT       title in the header (default: file name)
      --gap MM           space between logical pages in mm (default: 6)
  -s, --font-size PT     font size (default: the size for the lines and the
                         columns to fill the page)
  -m, --margin MM        margin in mm (default: 10)
      --line-height R    line height relative to the font size (default: 1.2)
      --font FILE        font file (default: BIZ UDGothic)
      --bold-font FILE   bold font file
      --fallback-font FILE
                         font for characters the main font does not have;
                         can be repeated, and is tried before the default
                         ones (Noto Sans Mono, Menlo, DejaVu Sans Mono)
      --geometry         print the columns and lines of a logical page for
                         the given options, as "COLS LINES", and exit
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

// Monospaced fonts used in place of BIZ UDGothic when it is not found, so
// that the command works without it.  They do not have Japanese.
const DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono';
const SUBSTITUTE_FONTS = [
  { src: '/System/Library/Fonts/Menlo.ttc', family: 'Menlo-Regular',
    bold: { src: '/System/Library/Fonts/Menlo.ttc', family: 'Menlo-Bold' } },
  { src: `${DEJAVU}.ttf`, bold: { src: `${DEJAVU}-Bold.ttf` } },
];
const FONT_HINT = 'install BIZ UDGothic (https://fonts.google.com/specimen/BIZ+UDGothic, '
  + 'or "brew install --cask font-biz-udgothic"), or specify --font';

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
  const { values: o, positionals: files, tokens } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    tokens: true,
    options: {
      output: { type: 'string', short: 'o' },
      width: { type: 'string', short: 'w' },
      lines: { type: 'string', short: 'l' },
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
      geometry: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (o.help) { process.stdout.write(USAGE); return; }
  // the last of -L, -P and --no-landscape decides the orientation
  const last = tokens
    .filter((t) => t.kind === 'option' && ['landscape', 'portrait'].includes(t.name)).pop();
  const landscape = last && (last.name === 'landscape') !== last.rawName.startsWith('--no-');
  if (!PAPER[o.paper.toLowerCase()]) throw new Error(`unknown paper: ${o.paper}`);

  let font = o.font ?? findFont('BIZUDGothic-Regular.ttf');
  let boldFont = o['bold-font'] ?? (o.font ? null : findFont('BIZUDGothic-Bold.ttf'));
  let substitute = null;
  if (!font) {
    substitute = SUBSTITUTE_FONTS.find((f) => fs.existsSync(f.src));
    if (!substitute) throw new Error(`font not found; ${FONT_HINT}`);
    font = substitute;
    boldFont = o['bold-font'] ?? (fs.existsSync(substitute.bold.src) ? substitute.bold : null);
  }

  const num =(v) => (v === undefined ? undefined : Number(v));
  const opt = {
    paper: o.paper, landscape, lines: num(o.lines), width: num(o.width),
    pane: o.pane, border: o.border, header: o.header, gap: num(o.gap),
    title: o.title ?? (files.length === 1 ? path.basename(files[0]) : ''),
    fontSize: num(o['font-size']), margin: num(o.margin), lineHeight: num(o['line-height']),
    font, boldFont, fallbackFonts: fallbackFonts(o['fallback-font']),
  };
  const geom = geometry(opt);
  // tell the size of a logical page to a program that formats the input
  if (o.geometry) { process.stdout.write(`${geom.cols} ${geom.lines}\n`); return; }

  const input = files.length
    ? files.map((f) => fs.readFileSync(f, 'utf8')).join('')
    : fs.readFileSync(0, 'utf8');
  // run the terminal with the width of a logical page, so that long lines wrap
  const screen = await emulate(input, { cols: geom.cols });

  if (!o.output && process.stdout.isTTY) throw new Error('refusing to write PDF to a terminal; use -o');
  const out = o.output ? fs.createWriteStream(o.output) : process.stdout;
  const info = render(screen, out, opt);
  for (const [ch, n] of info.missing) {
    const code = [...ch].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    process.stderr.write(`ansi2pdf: no font has "${ch}" (${code.join(' ')}), ${n} time(s)\n`);
  }
  if (substitute && info.missing.size) {
    process.stderr.write(`ansi2pdf: ${path.basename(substitute.src)} is used in place of `
      + `BIZ UDGothic, which is not found; ${FONT_HINT}\n`);
  }
  if (o.output) {
    await new Promise((r) => out.on('finish', r));
    process.stderr.write(`${o.output}: ${screen.cols} cols, ${info.linesPerPage} lines/page, `
      + `${info.pages} page(s) on ${info.sheets} sheet(s), ${info.fontSize.toFixed(2)}pt\n`);
  }
}

// end quietly when the reader of the output goes away, as in "ansi2pdf | head"
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

main().catch((e) => { process.stderr.write(`ansi2pdf: ${e.message}\n`); process.exit(1); });
