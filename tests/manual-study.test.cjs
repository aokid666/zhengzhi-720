const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => JSON.parse(fs.readFileSync(__dirname + '/../data/' + name + '.json', 'utf8'));
const study = read('manual-study'), index = read('manual-index');
const blocks = Object.fromEntries(study.blocks.map(b => [b.id,b]));
const pages = Object.fromEntries(index.pages.map(p => [p.id,p]));

test('special cards are bounded original excerpts, not whole pages with a keyword', () => {
  assert.equal(study.blocks.length,197);
  assert.equal(study.blocks.filter(b=>b.kind==='干扰项').length,54);
  assert.ok(!study.blocks.some(b=>b.kind==='点拨' && b.refs.some(r=>r.page==='u010')));
  const continued=blocks['命题分析-u013-1310'];
  assert.deepEqual(continued.refs.map(r=>r.page),['u013','u014']);
  assert.match(continued.text,/经典干扰项/);
  assert.doesNotMatch(continued.text,/高级动物也有感觉/);
  assert.doesNotMatch(blocks['d-1-1'].text,/干扰项2/);
  for(const b of study.blocks) {
    assert.doesNotMatch(b.text,/郑重声明|购买渠道|出版社|微信号/,b.id);
    for(const r of b.refs) {
      assert.ok(pages[r.page],b.id);
      assert.ok(r.b[3]<pages[r.page].height,b.id);
      assert.ok(r.lines.length,b.id);
    }
  }
});

test('judgments have explicit source evidence, true counterparts, and no commentary in stems', () => {
  assert.equal(study.questions.length,264);
  assert.equal(new Set(study.questions.map(q=>q.id)).size,264);
  assert.equal(study.questions.filter(q=>q.answer==='A').length,91);
  for(const q of study.questions) {
    assert.deepEqual(q.options,{A:'正确',B:'错误'});
    const b=blocks[q.blockId];assert.ok(b.questionIds.includes(q.id));
    assert.ok(q.analysis[0].t.trim());
    assert.deepEqual(q.keyRefs,b.refs.map(r=>r.page));
    assert.doesNotMatch(q.stem,/命题特点|经典干扰项|考查频率|比如|中国4共产党/);
    assert.equal(q.answer,['原书干扰项及辨析','原书×','原书x','原书X'].includes(q.sourceVerdict)?'B':'A');
  }
  assert.equal(study.questions.find(q=>q.stem==='精神的力量可以代替物质的力量').answer,'B');
  assert.ok(study.questions.some(q=>q.blockId==='d-1-1'&&q.answer==='A'));
  assert.equal(study.questions.find(q=>q.stem==='时空是一切运动的观念载体').answer,'B');
  // Ambiguous blank OCR verdicts are never assigned a guessed answer.
  assert.ok(!study.questions.some(q=>q.stem==='非公有制经济是为社会主义服务的经济成分'));
});

test('recommended clozes use complete exam facts and precise bounded rectangles', () => {
  const filler=/^(作为|相对的|绝对的|无条件的|有条件的|必然性|偶然性|假象|首要任务)$/;
  const broken=/(命题特点|考查频率|本专题|高频考点|分析题|选择题|可以是|也可以|虽然不$|与一$|在经济$|和生产$)/;
  for(const id of ['u001','u238','u239','l001','l167','l168'])assert.deepEqual(pages[id].masks,[]);
  for(const t of index.topics)for(const id of t.pages)assert.ok(!['u072','u096','u150','u201','u238','u239','l167','l168'].includes(id));
  for(const p of index.pages) {
    assert.ok(p.masks.length<=3,p.id);
    assert.ok(p.maskSets.core.length<=1,p.id);
    assert.ok(p.maskSets.exam.length<=3,p.id);
    assert.ok(p.maskSets.more.length<=6,p.id);
    const seen=[];
    for(const m of p.maskCandidates) {
      assert.ok(m.text.trim(),p.id);
      assert.ok(['题目考查','概念辨析','结构考点'].includes(m.reason),p.id+' '+m.text);
      assert.ok(['question','term','relation'].includes(m.source),p.id+' '+m.text);
      assert.doesNotMatch(m.text,/考查频率|^专题|^第.*部分/,p.id);
      assert.doesNotMatch(m.text,filler,p.id);
      assert.doesNotMatch(m.text,broken,p.id+' '+m.text);
      assert.ok(m.b[0]>=0&&m.b[1]>=0&&m.b[2]>0&&m.b[3]>0,p.id);
      assert.ok(m.b[0]+m.b[2]<=p.width+4&&m.b[1]+m.b[3]<=p.height+4,p.id);
      const n=m.text.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g,'');
      assert.ok(!seen.some(x=>x.includes(n)||n.includes(x)),p.id+' duplicate '+m.text);
      seen.push(n);
      if(m.reason==='题目考查')assert.ok(m.questionIds.length,p.id);
    }
  }
  assert.deepEqual(pages.u011.masks.map(m=>m.text),['不依赖于人类的意识而存在','客观实在性','主观唯心主义和客观唯心主义']);
  assert.deepEqual(pages.l140.masks.map(m=>m.text),['资本积累','剩余价值','物质交往']);
  assert.ok(!pages.u012.maskCandidates.some(m=>m.text==='个别与一'));
  assert.ok(!pages.l100.maskCandidates.some(m=>/金融寡头在经济|科学技术的进步和生产/.test(m.text)));
  for(const b of study.blocks)for(const list of Object.values(b.masksByPage||{}))for(const m of list){assert.doesNotMatch(m.text,filler,b.id);assert.doesNotMatch(m.text,broken,b.id+' '+m.text);}
  assert.equal(read('questions').length+read('topical-exercises').length,833);
  assert.equal(read('manual-questions').length,193);
});

test('judgment navigation stays inside the selected source block and keeps the original pools', () => {
  const app=fs.readFileSync(__dirname+'/../js/app.js','utf8');
  const ZS={},window={ZS},context={window,ZS,document:{addEventListener(){}},localStorage:{getItem(){return null;}},console,Date};
  vm.runInNewContext(app.replace(/\}\)\(\);\s*$/,'window.__manualQA={S,qPool};})();'),context);
  const {S,qPool}=window.__manualQA;
  S.qs=[{id:'old',source:'q'}];S.sprintQs=[{id:'ms001',source:'m'}];S.judgeQs=study.questions;
  S.byId=Object.fromEntries(S.qs.concat(S.sprintQs,S.judgeQs).map(q=>[q.id,q]));
  assert.equal(qPool('old'),S.qs);assert.equal(qPool('ms001'),S.sprintQs);
  const blockQs=study.questions.filter(q=>q.blockId==='d-1-1');
  assert.equal(qPool(blockQs[0].id),S.judgeQs);
  S.manualJudgeIds=blockQs.map(q=>q.id);
  assert.deepEqual(Array.from(qPool(blockQs[0].id),q=>q.id),S.manualJudgeIds);
});
