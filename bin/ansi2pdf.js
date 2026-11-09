#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs } = require('util');
const { emulate } = require('../src/emulate');
const { render, PAPER } = require('../src/render');

const USAGE = `Usage: ansi2pdf [options] [file ...] > out.pdf

  -o, --output FILE      output file (default: stdout)
  -c, --cols N           columns (default: measured from input)
  -l, --lines N          lines per page (default: fit to the paper)
  -p, --paper NAME       paper size: ${Object.keys(PAPER).join(', ')} (default: a4)
  -L, --landscape        landscape orientation
  -U, --up N             logical pages per sheet: 1, 2, 3, 4, 6, 8, 9 (default: 1)
      --grid CxR         arrange logical pages in C columns and R rows
  -B, --border           draw a border around each logical page
  -H, --header           print a header with the title and page number
  -t, --title TEXT       title in the header (default: file name)
      --gap MM           space between logical pages in mm (default: 6)
  -s, --font-size PT     font size (default: fit to the paper)
  -m, --margin MM        margin in mm (default: 10)
      --line-height R    line height relative to the font size (default: 1.2)
      --font FILE        font file (default: BIZ UDGothic)
      --bold-font FILE   bold font file
  -h, --help             show this help
`;

const FONT_DIRS = [
  path.join(os.homedir(), 'Library/Fonts'), '/Library/Fonts',
  '/usr/share/fonts/truetype', '/usr/local/share/fonts',
];

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
    options: {
      output: { type: 'string', short: 'o' },
      cols: { type: 'string', short: 'c' },
      lines: { type: 'string', short: 'l' },
      paper: { type: 'string', short: 'p', default: 'a4' },
      landscape: { type: 'boolean', short: 'L' },
      up: { type: 'string', short: 'U' },
      grid: { type: 'string' },
      border: { type: 'boolean', short: 'B' },
      header: { type: 'boolean', short: 'H' },
      title: { type: 'string', short: 't' },
      gap: { type: 'string' },
      'font-size': { type: 'string', short: 's' },
      margin: { type: 'string', short: 'm' },
      'line-height': { type: 'string' },
      font: { type: 'string' },
      'bold-font': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (o.help) { process.stdout.write(USAGE); return; }
  if (!PAPER[o.paper.toLowerCase()]) throw new Error(`unknown paper: ${o.paper}`);

  const font = o.font ?? findFont('BIZUDGothic-Regular.ttf');
  if (!font) throw new Error('font not found; specify --font');
  const boldFont = o['bold-font'] ?? (o.font ? null : findFont('BIZUDGothic-Bold.ttf'));

  const input = files.length
    ? files.map((f) => fs.readFileSync(f, 'utf8')).join('')
    : fs.readFileSync(0, 'utf8');

  const num = (v) => (v === undefined ? undefined : Number(v));
  const screen = await emulate(input, { cols: num(o.cols) });

  if (!o.output && process.stdout.isTTY) throw new Error('refusing to write PDF to a terminal; use -o');
  const out = o.output ? fs.createWriteStream(o.output) : process.stdout;
  const info = render(screen, out, {
    paper: o.paper, landscape: o.landscape, lines: num(o.lines),
    up: num(o.up), grid: o.grid, border: o.border, header: o.header, gap: num(o.gap),
    title: o.title ?? (files.length === 1 ? path.basename(files[0]) : ''),
    fontSize: num(o['font-size']), margin: num(o.margin), lineHeight: num(o['line-height']),
    font, boldFont,
  });
  if (o.output) {
    await new Promise((r) => out.on('finish', r));
    process.stderr.write(`${o.output}: ${screen.cols} cols, ${info.linesPerPage} lines/page, `
      + `${info.pages} page(s) on ${info.sheets} sheet(s), ${info.fontSize.toFixed(2)}pt\n`);
  }
}

main().catch((e) => { process.stderr.write(`ansi2pdf: ${e.message}\n`); process.exit(1); });
