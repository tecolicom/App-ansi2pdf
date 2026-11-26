'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { drawBox, lineSet } = require('../src/boxdraw');

// a doc that records the paths it is asked to stroke
function fakeDoc() {
  const calls = [];
  const doc = {};
  for (const name of ['save', 'restore', 'lineCap', 'dash', 'undash']) doc[name] = () => doc;
  doc.strokeColor = (c) => (calls.push(['color', c]), doc);
  doc.lineWidth = (w) => (calls.push(['width', w]), doc);
  doc.moveTo = (x, y) => (calls.push(['moveTo', x, y]), doc);
  doc.lineTo = (x, y) => (calls.push(['lineTo', x, y]), doc);
  doc.stroke = () => (calls.push(['stroke']), doc);
  return { doc, calls };
}

test('lines of the cells in a column are stroked as one line', () => {
  const { doc, calls } = fakeDoc();
  const lines = lineSet();
  for (let row = 0; row < 3; row++) drawBox(doc, '│', 0, row * 10, 5, 10, 1, '#000', lines);
  drawBox(doc, '│', 0, 50, 5, 10, 1, '#000', lines);   // apart from them
  assert.ok(!calls.some((c) => c[0] === 'stroke'), 'nothing is stroked before draw');
  lines.draw(doc);
  const path = calls.filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo');
  assert.deepStrictEqual(path, [
    ['moveTo', 2.5, 0], ['lineTo', 2.5, 30],
    ['moveTo', 2.5, 50], ['lineTo', 2.5, 60],
  ]);
  assert.strictEqual(calls.filter((c) => c[0] === 'stroke').length, 1, 'one stroke');
});

test('lines of different colors or widths are stroked apart', () => {
  const { doc, calls } = fakeDoc();
  const lines = lineSet();
  drawBox(doc, '─', 0, 0, 5, 10, 1, '#000', lines);
  drawBox(doc, '─', 5, 0, 5, 10, 1, '#f00', lines);
  drawBox(doc, '━', 10, 0, 5, 10, 1, '#000', lines);
  lines.draw(doc);
  assert.strictEqual(calls.filter((c) => c[0] === 'stroke').length, 3);
});

test('dashed lines are drawn in their cells', () => {
  const { doc, calls } = fakeDoc();
  const lines = lineSet();
  drawBox(doc, '┆', 0, 0, 5, 10, 1, '#000', lines);
  assert.strictEqual(calls.filter((c) => c[0] === 'stroke').length, 2, 'the upper and the lower arm');
});
