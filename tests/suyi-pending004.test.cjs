const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => JSON.parse(fs.readFileSync(__dirname + '/../' + p));

test('fourth batch reviews 500 fresh pending questions and retains real gaps', () => {
  const batch = read('data/suyi-reading-batch-004.json');
  const audit = read('data/suyi-all-pairing-report.json');
  const manual = read('scripts/suyi-additional-reviewed.json');
  const seen = new Set([2, 3].flatMap(n => read(`data/suyi-reading-batch-00${n}.json`).items.map(x => x.id)));
  const byId = new Map(audit.items.map(x => [x.id, x]));
  assert.equal(batch.items.length, 500);
  assert.equal(new Set(batch.items.map(x => x.id)).size, 500);
  assert.equal(batch.located, 404);
  assert.equal(batch.stillUnconfirmed, 96);
  assert.equal(batch.complete, 194);
  assert.equal(batch.related, 210);
  assert.equal(batch.unconfirmedBefore - batch.unconfirmedAfter, 404);
  assert(audit.summary.unconfirmed <= batch.unconfirmedAfter);
  const counts = { complete: 0, related: 0, unconfirmed: 0 };
  for (const row of batch.items) {
    assert(!seen.has(row.id));
    assert.equal(row.before, 'unconfirmed');
    const published = byId.get(row.id);
    assert.equal(row.sig, published.sig);
    counts[published.status]++;
    if (row.decision === 'located') {
      const decision = manual.questions.find(x => x.id === row.id && x.concept.startsWith('pending500-004-'));
      assert(decision);
      assert.equal(published.status, row.status);
      assert(decision.references.some(r => r.page === row.page));
      if (row.status === 'complete') {
        assert(published.units.length > 0);
        assert.deepEqual(new Set(published.covered), new Set(published.units.map(u => u.id)));
      } else {
        assert.deepEqual(published.covered, []);
        assert(decision.references.every(r => r.covers.length === 0));
      }
    } else {
      assert.equal(published.status, 'unconfirmed');
      assert.equal(row.checkedCandidates.length, 2);
      assert.equal(published.references.length, 0);
    }
  }
  assert.deepEqual(counts, { complete: 194, related: 210, unconfirmed: 96 });
});

test('calculation derivations and the value-standard ambiguity are explicit', () => {
  const rows = read('data/suyi-reading-batch-004.json').items;
  for (const order of [254, 255, 278, 458, 482]) {
    const row = rows[order - 1];
    assert.equal(row.status, 'complete');
    assert.match(row.reason, /万元|小时/);
    assert.match(row.reason, /[=×]/);
  }
  assert.equal(rows[489].status, 'related');
  assert.match(rows[489].reason, /根本尺度/);
  assert.match(rows[489].reason, /未修改原题答案/);
});
