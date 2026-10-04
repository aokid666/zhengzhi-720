const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');

function appWithData(data) {
  const saves = [];
  const ZS = { data, save: () => saves.push(JSON.parse(JSON.stringify(data))), recordAnswer() {} };
  const window = { ZS };
  const context = {
    window, ZS, document: { addEventListener() {} },
    localStorage: { getItem() { return null; } }, Date, console
  };
  // Load the real app functions while leaving DOMContentLoaded untriggered.
  const instrumented = app.replace(/\}\)\(\);\s*$/, 'window.__answers = { savedSelection, setProg }; })();');
  assert.notEqual(instrumented, app);
  vm.runInNewContext(instrumented, context);
  return { ...window.__answers, saves };
}

test('submitting a multiple-choice answer saves the chosen options with question progress', () => {
  const data = { progress: {}, flags: {}, hist: {} };
  const app = appWithData(data);
  app.setProg('q1', false, false, ['B', 'D']);
  assert.equal(data.progress.q1.s, 'wrong');
  assert.deepEqual(Array.from(data.progress.q1.sel), ['B', 'D']);
  assert.deepEqual(Array.from(app.savedSelection('q1', data.progress.q1)), ['B', 'D']);
  assert.equal(app.saves.length, 1);
});

test('earlier answers recover only from the matching history attempt', () => {
  const t = Date.now();
  const data = {
    progress: { q1: { ts: t, s: 'wrong' } }, flags: {},
    hist: { q1: [{ t: t - 86400000, r: 0, s: 'A' }, { t: t + 12, r: 0, s: 'BD' }] }
  };
  const app = appWithData(data);
  assert.deepEqual(Array.from(app.savedSelection('q1', data.progress.q1)), ['B', 'D']);
  data.progress.q1.ts = t + 10000;
  assert.equal(app.savedSelection('q1', data.progress.q1), null);
});
