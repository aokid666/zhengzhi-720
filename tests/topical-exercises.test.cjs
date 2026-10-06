const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const questions = require('../data/topical-exercises.json');
const lecture = require('../data/lecture-s.json');
const checklist = require('../data/lecture-k.json');

test('both original lecture exercise sets have complete answers and linked source pages', () => {
  assert.equal(questions.length, 48);
  assert.equal(questions.filter(q => q.chapter === '重点会议').length, 33);
  assert.equal(questions.filter(q => q.chapter === '土地政策').length, 15);
  assert.equal(new Set(questions.map(q => q.id)).size, 48);
  for (const q of questions) {
    assert.deepEqual(Object.keys(q.options), ['A', 'B', 'C', 'D'], q.id);
    assert.ok(q.stem.length > 10 && Object.values(q.options).every(s => s.length > 0), q.id);
    assert.match(q.answer, /^[ABCD]+$/, q.id);
    assert.ok(q.analysis[0].t.length > 15, q.id);
    assert.ok(q.qPages.every(n => lecture[n]), q.id + ': question image');
    assert.ok(q.aPages.every(n => lecture[n]), q.id + ': analysis image');
    assert.equal(q.aCrops.length, q.aPages.length, q.id + ': cropped analysis images');
    assert.ok(q.sPages.every(n => lecture[n]), q.id + ': topic summary');
    assert.ok(q.kPages.every(n => checklist[n]), q.id + ': checklist');
    assert.ok(q.aPages.some(n => lecture[n].includes(`<${q.no}>`)), q.id + ': source answer location');
    assert.ok(!Object.values(q.options).some(s => /[一二]、多项选择题|习题解析/.test(s)), q.id);
  }
});

test('homepage and answer panel use the topical source images', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /重点会议习题检测练习/);
  assert.match(app, /土地政策习题检测练习/);
  assert.match(app, /q\.source === 's'/);
  assert.match(app, /topical-exercises\.json/);
});
