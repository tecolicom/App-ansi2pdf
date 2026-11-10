# ansi2pdf

Render terminal output with ANSI sequences to PDF.

```sh
git diff --color | ansi2pdf -o diff.pdf
```

Text files can be printed from an editor, but colored output of
commands cannot.  `ansi2pdf` prints it as it is seen on a terminal:
colors, bold, faint, italic, underlines of every style and color,
reverse video, strikethrough, overline, and box drawing characters drawn
as connected lines.

The input is interpreted by [xterm.js](https://xtermjs.org/), the
terminal engine of Visual Studio Code, so cursor movement, background
filled by `ESC [ K`, wide characters and line wrapping are handled as on
a terminal.  The result is drawn with [PDFKit](https://pdfkit.org/).

By default, two pages of 60 lines are printed side by side on a
landscape A4 sheet.  The font size is decided by the number of lines,
and long lines wrap as on a terminal, as when text is printed on a
printer.

## Requirements

- Node.js 20.16 or later
- A monospaced font.  The default is
  [BIZ UDGothic](https://fonts.google.com/specimen/BIZ+UDGothic)
  (`BIZUDGothic-Regular.ttf` and `BIZUDGothic-Bold.ttf`), looked for in
  `~/Library/Fonts`, `/Library/Fonts`, `/usr/share/fonts/truetype` and
  `/usr/local/share/fonts`.  Other fonts can be given by `--font`.
- Characters the main font does not have are drawn with a fallback
  font: Noto Sans Mono, Menlo or DejaVu Sans Mono if found, or one
  given by `--fallback-font`.  Characters no font has are reported.

## Installation

From a clone of this repository:

```sh
npm install
npm install -g .
```

`npm install -g .` links the global command to this directory, so
changes to the source take effect without reinstalling.  The manual is
installed as `ansi2pdf(1)`; if `man ansi2pdf` does not find it, add
`$(npm prefix -g)/share/man` to `MANPATH`.

To uninstall:

```sh
npm uninstall -g ansi2pdf
```

With nodenv, run `nodenv rehash` after installing or uninstalling.

## Usage

```
ansi2pdf [options] [file ...] > out.pdf
command | ansi2pdf [options] -o out.pdf
```

| Option | Meaning | Default |
|---|---|---|
| `-o FILE` | output file | stdout |
| `-C C[.R]` | logical pages on a sheet: `2`, `2.2`, ... | `2` |
| `-L`, `-P` | landscape, portrait | landscape when more columns than rows |
| `-p NAME` | paper: a3, a4, a5, b4, b5, letter, legal | `a4` |
| `-l N` | lines per page | `60` |
| `-w N` | columns of the terminal | as many as fit the page |
| `-B`, `--no-border` | border around each page | on |
| `-H`, `-t TEXT` | header with title and page number | off |

See `ansi2pdf --help` and `man ansi2pdf` for all options.

Examples:

```sh
greple --color=always pattern *.c | ansi2pdf -o found.pdf
seq 1000 | ansi2pdf -C 6 -o numbers.pdf      # six columns of short lines
some-command | ansi2pdf -LC1 -o slide.pdf    # one page on each landscape sheet
```

## Development

```sh
npm test          # run tests
npm run man       # build man/ansi2pdf.1 from man/ansi2pdf.md (needs pandoc)
```

The plan and design notes are in [PLAN.md](PLAN.md) (in Japanese).

## License

MIT License.  See [LICENSE](LICENSE).
