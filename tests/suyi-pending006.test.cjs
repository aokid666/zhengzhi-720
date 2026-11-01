const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => JSON.parse(fs.readFileSync(__dirname + '/../' + p));

test('sixth batch reviews 500 fresh pending questions and retains real gaps', () => {
  const batch = read('data/suyi-reading-batch-006.json');
  const audit = read('data/suyi-all-pairing-report.json');
  const manual = read('scripts/suyi-additional-reviewed.json');
  const seen = new Set([2, 3, 4, 5].flatMap(n => read(`data/suyi-reading-batch-00${n}.json`).items.map(x => x.id)));
  const byId = new Map(audit.items.map(x => [x.id, x]));
  assert.equal(batch.items.length, 500);
  assert.equal(new Set(batch.items.map(x => x.id)).size, 500);
  assert.equal(batch.located, 423);
  assert.equal(batch.stillUnconfirmed, 77);
  assert.equal(batch.complete, 149);
  assert.equal(batch.related, 274);
  assert.equal(batch.unconfirmedBefore - batch.unconfirmedAfter, 423);
  assert(audit.summary.unconfirmed <= batch.unconfirmedAfter);
  const counts = { complete: 0, related: 0, unconfirmed: 0 };
  for (const row of batch.items) {
    assert(!seen.has(row.id));
    assert.equal(row.before, 'unconfirmed');
    const published = byId.get(row.id);
    assert.equal(row.sig, published.sig);
    counts[published.status]++;
    if (row.decision === 'located') {
      const decision = manual.questions.find(x => x.id === row.id && x.concept.startsWith('pending500-006-'));
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
  assert.deepEqual(counts, { complete: 149, related: 274, unconfirmed: 77 });
});


test('scope and neighboring topics do not create false complete matches', () => {
 const rows = read('data/suyi-reading-batch-006.json').items;
 const manual = read('scripts/suyi-additional-reviewed.json').questions;
 for (const i of [422, 465, 481, 476]) {
  assert.equal(rows[i].status, 'related');
  assert.deepEqual(rows[i].covers, []);
 }
 for (const i of [55, 89, 124, 160, 284, 393, 403, 472]) {
  assert.equal(rows[i].decision, 'unconfirmed');
 }
 assert.match(rows[422].reason, /小国大国/);
 assert.match(rows[481].reason, /中高速/);
 assert.match(rows[465].reason, /青年团/);
 assert.equal(rows[395].page, 103);
 assert.equal(rows[395].status, 'complete');
 for (const i of [70, 486]) {
  const decision = manual.find(x => x.id === rows[i].id && x.concept.startsWith('pending500-006-'));
  assert.equal(rows[i].status, 'complete');
  assert(decision.references.some(x => x.page === (i === 70 ? 118 : 49)));
 }
});
