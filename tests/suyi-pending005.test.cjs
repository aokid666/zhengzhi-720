const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => JSON.parse(fs.readFileSync(__dirname + '/../' + p));

test('fifth batch reviews 500 fresh pending questions and retains real gaps', () => {
  const batch = read('data/suyi-reading-batch-005.json');
  const audit = read('data/suyi-all-pairing-report.json');
  const manual = read('scripts/suyi-additional-reviewed.json');
  const seen = new Set([2, 3, 4].flatMap(n => read(`data/suyi-reading-batch-00${n}.json`).items.map(x => x.id)));
  const byId = new Map(audit.items.map(x => [x.id, x]));
  assert.equal(batch.items.length, 500);
  assert.equal(new Set(batch.items.map(x => x.id)).size, 500);
  assert.equal(batch.located, 412);
  assert.equal(batch.stillUnconfirmed, 88);
  assert.equal(batch.complete, 176);
  assert.equal(batch.related, 236);
  assert.equal(batch.unconfirmedBefore - batch.unconfirmedAfter, 412);
  assert(audit.summary.unconfirmed <= batch.unconfirmedAfter);
  const counts = { complete: 0, related: 0, unconfirmed: 0 };
  for (const row of batch.items) {
    assert(!seen.has(row.id));
    assert.equal(row.before, 'unconfirmed');
    const published = byId.get(row.id);
    assert.equal(row.sig, published.sig);
    counts[published.status]++;
    if (row.decision === 'located') {
      const decision = manual.questions.find(x => x.id === row.id && x.concept.startsWith('pending500-005-'));
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
  assert.deepEqual(counts, { complete: 176, related: 236, unconfirmed: 88 });
});


test('source distinctions and derived calculations stay explicit', () => {
  const rows = read('data/suyi-reading-batch-005.json').items;
  for (const i of [51, 153, 232]) {
    assert.equal(rows[i].status, 'complete');
    assert.match(rows[i].reason, /[=/]/);
    assert.match(rows[i].reason, /150%|200%|300%/);
  }
  assert.equal(rows[177].page, 100);
  assert.equal(rows[177].status, 'complete');
  assert.equal(rows[242].page, 209);
  assert.equal(rows[92].page, 106);
  assert.equal(rows[294].decision, 'unconfirmed');
  for (const i of [100, 283, 319, 362, 365, 384, 431, 446, 464]) {
    assert.equal(rows[i].status, 'related');
    assert.deepEqual(rows[i].covers, []);
  }
});
