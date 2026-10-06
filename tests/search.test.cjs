const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
const lectureK = require('../data/lecture-k.json');
const lectureS = require('../data/lecture-s.json');

function harness() {
  const input = { value: '' }, results = { innerHTML: '' };
  const data = { progress: {}, flags: {}, notes: {} };
  const ZS = { data };
  const window = { ZS };
  const document = {
    addEventListener() {},
    querySelector(s) { return s === '#sq' ? input : s === '#sres' ? results : null; }
  };
  const source = app.replace(/\}\)\(\);\s*$/, 'window.__search = { S, doSearch, docPageResults }; })();');
  assert.notEqual(source, app);
  vm.runInNewContext(source, { window, ZS, document, localStorage: { getItem() { return null; } }, Date, console });
  return { ...window.__search, input, results, data };
}

test('document search indexes every page separately in each lecture', () => {
  const h = harness();
  h.S.lk = lectureK; h.S.ls = lectureS;
  const keyword = '土地政策';
  const k = h.docPageResults('k', keyword);
  const s = h.docPageResults('s', keyword);
  assert.ok(k.length > 0 && s.length > 0);
  assert.ok(k.every(hit => lectureK[hit.n].includes(keyword)));
  assert.ok(s.every(hit => lectureS[hit.n].includes(keyword)));
  assert.notDeepEqual(Array.from(k, hit => hit.n), Array.from(s, hit => hit.n));
});

test('question-linked lecture results show chapter and personal state', () => {
  const h = harness();
  h.S.qs = [{ id: 'q1', moduleIdx: 2, module: '中国近现代史纲要', chapter: '第一章', chapterTitle: '进入近代后中华民族的磨难与抗争', no: 5,
    stem: '题目', options: { A: '甲', B: '乙', C: '丙', D: '丁' }, kPages: [277], sPages: [130] }];
  h.S.lk = { 277: '古田会议确立思想建党、政治建军原则' };
  h.S.ls = { 130: '古田会议召开' };
  h.data.progress.q1 = { s: 'wrong', tries: 3 };
  h.data.flags.q1 = { star: true };
  h.S.searchScope = 'lk'; h.S.searchMode = 'questions'; h.input.value = '古田会议';
  h.doSearch();
  assert.match(h.results.innerHTML, /中国近现代史纲要 · 第一章 进入近代后中华民族的磨难与抗争 · 第 5 题/);
  assert.match(h.results.innerHTML, /错题/);
  assert.match(h.results.innerHTML, /已收藏/);
  assert.match(h.results.innerHTML, /已做 3 次/);
  assert.match(h.results.innerHTML, /知识清单 P269/);
  assert.doesNotMatch(h.results.innerHTML, /速成班讲义 P/);
});

test('document search finds pages beyond any question association', () => {
  const h = harness();
  h.S.searchMode = 'documents'; h.S.searchDocKind = 's';
  h.S.ls = { 10: '没有关联题目的一页讲义：特有检索词', 20: '其他内容' };
  h.S.qs = [];
  h.input.value = '特有检索词'; h.doSearch();
  assert.match(h.results.innerHTML, /1 页命中，1 处匹配/);
  assert.match(h.results.innerHTML, /ZS_OPENLECHIT\('s',10\)/);
  assert.doesNotMatch(h.results.innerHTML, /去题目/);
});
