#!/usr/bin/env perl
# Generate a sample of terminal output for ansi2pdf
use v5.14;
use utf8;
use Term::ANSIColor::Concise qw(ansi_color ansi_color_24);
binmode STDOUT, ':utf8';

say "16 colors: ", join ' ', map { ansi_color($_, $_) } qw(K R G Y B M C W);
say "bright:    ", join ' ', map { ansi_color("${_}D", $_) } qw(K R G Y B M C W);
say "background:", join ' ', map { ansi_color("W/$_", " $_ ") } qw(K R G Y B M C);
say "256: ", join '', map { ansi_color("/$_", ' ') } qw(500 510 520 530 540 550 450 350 250 150 050 051 052 053 054 055 045 035 025 015 005);
say "gray: ", join '', map { ansi_color(sprintf("/L%02d", $_), ' ') } 1 .. 24;
say "24bit: ", ansi_color_24('#ff8000', 'orange'), ' ', ansi_color_24('W/#102060', ' navy ');
say "effects: ", join ' ', map { ansi_color($_->[0], $_->[1]) }
    [D => 'bold'], [P => 'faint'], [I => 'italic'], [U => 'underline'],
    [S => 'reverse'], [X => 'strike'], [DI => 'bold-italic'];
say "underline: ", join ' ', map { ansi_color($_->[0], $_->[1]) }
    ['U:2' => 'double'], ['U:3' => 'curly'], ['U:4' => 'dotted'], ['U:5' => 'dashed'],
    ['{SGR(4:3,58:2::255:0:0)}' => 'red-curly'];
say "日本語: ", ansi_color('R', '赤い文字'), ' と ', ansi_color('DB', '太字の青'), '、全角ｶﾅ混じり';
say ansi_color('W/BE', 'E: rest of the line is filled');
say "┌──────┬──────┐ ┏━━━━━━┓ ╔══════╦══════╗ ╭──────╮";
say "│ box  │ ok   │ ┃heavy ┃ ║double║  ok  ║ │round │";
say "├──────┼──────┤ ┗━━━━━━┛ ╠══════╬══════╣ ╰──────╯";
say "└──────┴──────┘          ╚══════╩══════╝ ┄┄┄ ┆ ╌╌╌";
say ansi_color('R', '┌─ colored ─┐'), ' ', ansi_color('B', '│x│');
