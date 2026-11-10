---
title: ANSI2PDF
section: 1
header: User Commands
footer: ansi2pdf 0.1.0
---

# NAME

ansi2pdf - render terminal output with ANSI sequences to PDF

# SYNOPSIS

**ansi2pdf** [*options*] [*file* ...] **>** *out.pdf*

*command* **|** **ansi2pdf** [*options*] **-o** *out.pdf*

# DESCRIPTION

**ansi2pdf** reads the output of a command, as it would be shown on a
terminal, and prints it to a PDF file.  Colors, bold, faint, italic,
underlines of every style and color, reverse video, strikethrough and
overline are kept.  Box drawing characters are drawn as lines, and block
elements (U+2580 to U+259F) as filled rectangles, so that tables and
borders are connected on paper.

The input is interpreted by a terminal emulator (xterm.js, the engine of
the Visual Studio Code terminal), so cursor movement, erasing to the end
of the line with a background color (**ESC [ K**), wide characters and
line wrapping come out as they do on a terminal.

By default, two logical pages of 60 lines are printed side by side on a
landscape A4 sheet, each with a border.

The font size is decided by the number of lines on a page, as when text
is printed on a printer.  The terminal is run with the number of columns
that fit the width of a logical page, and longer lines wrap as they do
on a terminal.  The length of the lines does not change the font size,
unless **--width** is given.

A form feed (**^L**) starts a new page.  Consecutive form feeds make a
blank page.  Clearing the screen (**ESC [ 2 J**, as by **clear**(1))
also starts a new page, keeping what was on the screen before it.
Clearing the scrollback (**ESC [ 3 J**) is ignored.

Files are read in order and concatenated.  Without files, the standard
input is read.  The PDF is written to the standard output, or to the
file given by **--output**; it is not written to a terminal.

# OPTIONS

**-o**, **--output** *FILE*
:   Write the PDF to *FILE*, and print a summary of the layout to the
    standard error.

**-C**, **--pane** *C*[**.***R*]
:   Arrange logical pages on a sheet in *C* columns and *R* rows.
    **-C 2** prints two pages side by side, and **-C 2.2** prints four
    pages in two columns and two rows.  The number of columns cannot be
    omitted.  Default is **2**.

**-L**, **--landscape**
:   Use the paper in landscape orientation.

**-P**, **--portrait**
:   Use the paper in portrait orientation.  Without **-L** or **-P**,
    the paper is landscape when **-C** has more columns than rows.
    When both are given, the last one is used.

**-p**, **--paper** *NAME*
:   Paper size: **a3**, **a4**, **a5**, **b4**, **b5**, **letter** or
    **legal**.  Default is **a4**.

**-l**, **--lines** *N*
:   Number of lines on a logical page.  The font size is chosen to fit
    them.  Default is **60**.

**-w**, **--width** *N*
:   Run the terminal with *N* columns.  Lines longer than that wrap, and
    the font is made smaller if *N* columns do not fit the page.
    Default is as many columns as fit the page.

**-B**, **--border**, **--no-border**
:   Draw a border around each logical page.  The border has the size of
    the logical page, as in n-up printing by a printer driver.  Default
    is on.

**-H**, **--header**
:   Print a header above each logical page, with the title and the page
    number.

**-t**, **--title** *TEXT*
:   Title in the header.  Default is the file name when one file is
    given.

**--gap** *MM*
:   Space between logical pages in millimeters.  Default is **6**.

**-m**, **--margin** *MM*
:   Margin of the sheet in millimeters.  Default is **10**.

**-s**, **--font-size** *PT*
:   Font size in points, instead of fitting **--lines** to the page.

**--line-height** *R*
:   Line height relative to the font size.  Default is **1.2**.

**--font** *FILE*
:   TrueType or OpenType font file.  Default is BIZ UDGothic.

**--bold-font** *FILE*
:   Font file for bold text.  Default is BIZ UDGothic Bold, when
    **--font** is not given.

**--fallback-font** *FILE*
:   Font file for characters that the main font does not have.  It can
    be repeated, and the fonts are tried in order before the default
    ones described in FONTS.

**--geometry**
:   Print the number of columns and lines of a logical page for the
    given options, as "*COLS* *LINES*", and exit without reading the
    input.  A program that formats text for the page, such as
    **nup**(1), uses it to know the size to format for.

**-h**, **--help**
:   Show a summary of the options.

# FONTS

The font must be monospaced, with half-width characters of half the
width of full-width characters.  The default is BIZ UDGothic, which
covers Japanese, and is available from Google Fonts under the SIL Open
Font License.  **BIZUDGothic-Regular.ttf** and **BIZUDGothic-Bold.ttf**
are looked for in these directories:

    ~/Library/Fonts
    /Library/Fonts
    /usr/share/fonts/truetype
    /usr/local/share/fonts

With Homebrew, **brew install --cask font-biz-udgothic** installs them.
When they are not found and **--font** is not given, Menlo or DejaVu
Sans Mono is used in their place, so that the command works without
them.  These fonts do not have Japanese.

Other fonts can be given by **--font** and **--bold-font**.  Only the
glyphs used are embedded in the PDF.

Characters that the main font does not have are drawn with a fallback
font: those given by **--fallback-font**, then Noto Sans Mono
(**NotoSansMono-Regular.ttf** or its variable font, in the directories
above), Menlo (**/System/Library/Fonts/Menlo.ttc**) and DejaVu Sans Mono
(**/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf**), whichever are
found.  A glyph wider than a cell is narrowed to fit.  Characters that
no font has are reported on the standard error, and are left blank.

# EXAMPLES

Print a colored diff:

    git diff --color | ansi2pdf -o diff.pdf

Print the result of a search with the matches highlighted:

    greple --color=always pattern *.c | ansi2pdf -o found.pdf

Print short lines in six columns on a sheet:

    seq 1000 | ansi2pdf -C 6 -o numbers.pdf

Print one page on each landscape sheet:

    some-command | ansi2pdf -LC1 -o slide.pdf

Print a man page with a header, without borders:

    man -P cat ls | ansi2pdf -H -t ls --no-border -o ls.pdf

# LIMITATIONS

Output that redraws the whole screen is interpreted on a terminal of 24
lines, and may differ from what was seen on the real terminal.

Italic is drawn by slanting the regular font.  Rapid blink (**ESC [ 6 m**)
is ignored.  Images (SIXEL, iTerm2 inline images) are not supported.

The default foreground and background are black on white paper.
Colors of the 16-color palette are those of xterm.js, so white text
may be hard to read on paper.

# COMPATIBILITY

The version is before 1.0.  Options, defaults and the output may change
in ways that are not compatible with earlier versions, until version
1.0 is released.

# SEE ALSO

**ansicolumn**(1), **ansifold**(1), **nup**(1), **greple**(1)

# AUTHOR

Kazumasa Utashiro

# LICENSE

MIT License.
