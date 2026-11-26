'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { emulate } = require('../src/emulate');
const { readingOrder } = require('../src/render');

// ansicolumn --pane-osc puts a private OSC where the text of each pane
// starts.  The text is drawn pane by pane, in the order of the panes,
// so that a viewer selects the text of a pane, not a line of the sheet.
const P = '\x1b]7772;\x1b\\';

// the characters of a page in the order they are drawn
const text = (page) => readingOrder(page).map(([r, c]) => page[r][c].ch).join('').replace(/\s+/g, '');

test('the start of a pane is marked on its cell', async () => {
  const screen = await emulate(`|${P}a1 |${P}b1\n|a2 |b2\n`);
  const marked = screen.lines.flatMap((cells, r) => cells.flatMap((c, x) => (c.paneStart ? [[r, x]] : [])));
  assert.deepStrictEqual(marked, [[0, 1], [0, 5]]);
});

test('the text is drawn pane by pane', async () => {
  const screen = await emulate(`|${P}a1 |${P}b1\n|a2 |b2\n`);
  assert.strictEqual(text(screen.lines), '||a1|a2|b1b2');
});

test('panes in rows: a row of panes after another', async () => {
  const screen = await emulate(`${P}a1 ${P}b1\na2 b2\n${P}c1 ${P}d1\nc2 d2\n`);
  assert.strictEqual(text(screen.lines), 'a1a2b1b2c1c2d1d2');
});

test('without the marks, line by line', async () => {
  const screen = await emulate('a1 b1\na2 b2\n');
  assert.strictEqual(text(screen.lines), 'a1b1a2b2');
});

test('a mark is not taken as text', async () => {
  const screen = await emulate(`${P}a\n`);
  assert.strictEqual(screen.lines[0][0].ch, 'a');
});
