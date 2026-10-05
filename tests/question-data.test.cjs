const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const questions = JSON.parse(fs.readFileSync(__dirname + '/../data/questions.json', 'utf8'));
const byId = Object.fromEntries(questions.map(q => [q.id, q]));

test('every question has four nonempty choices and answer keys remain valid', () => {
  assert.equal(questions.length, 785);
  for (const q of questions) {
    assert.deepEqual(Object.keys(q.options).sort(), ['A', 'B', 'C', 'D'], q.id);
    for (const key of 'ABCD') {
      const choice = q.options[key];
      assert.ok(typeof choice === 'string' && choice.trim(), q.id + ' ' + key);
      assert.doesNotMatch(choice, /[\u0000-\u001f]|[ＡＢＣＤ][．.]/, q.id + ' ' + key);
      assert.ok(choice.split('').filter(c => c === '（' || c === '(').length >=
        choice.split('').filter(c => c === '）' || c === ')').length, q.id + ' ' + key);
    }
    assert.match(q.answer, /^[ABCD]{1,4}$/, q.id);
  }
});

test('merged and unlabeled options match the original booklet', () => {
  assert.equal(byId.q472.options.B, '农民阶级与地主阶级的矛盾');
  assert.equal(byId.q472.options.C, '帝国主义和中华民族的矛盾');
  assert.equal(byId.q026.options.C, '必然性通过偶然性开辟道路');
  assert.equal(byId.q177.options.B, '职工终身雇佣制度');
  assert.equal(byId.q219.options.D, '新民主主义革命的正确道路');
  assert.equal(byId.q739.options.A, '法律规范具有必须遵守的性质');
  assert.equal(byId.q399.options.D, '践行全过程人民民主的生动范例');
  assert.equal(byId.q647.options.D, '党永葆先进性和纯洁性、始终走在时代前列的根本途径');
});
