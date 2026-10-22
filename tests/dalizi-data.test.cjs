const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const read=f=>JSON.parse(fs.readFileSync(__dirname+'/../data/'+f+'.json','utf8'));
test('Dalizi import pairs every year and question with original answers and complete image evidence',()=>{
 const bank=read('practice/dalizi-true'),index=read('practice-index'),b=index.books.find(b=>b.id==='dalizi-true'),report=read('dalizi-build-report');
 assert.equal(bank.questions.length,363);assert.equal(bank.pages.length,280);assert.equal(b.kind,'pastpaper');assert.equal(b.sourceBase,'https://aokid666.github.io/zz-dalizi-2027/');assert.equal(b.readSections.length,15);assert.equal(report.imageCount,280);
 for(let year=2015;year<=2025;year++){
  const qs=bank.questions.filter(q=>q.examYear===String(year));assert.equal(qs.length,33);assert.deepEqual(qs.map(q=>q.originalNo),Array.from({length:33},(_,i)=>i+1));
  for(const q of qs){assert(q.id.endsWith(year+'-'+String(q.originalNo).padStart(2,'0')));assert.equal(q.multi,q.originalNo>16);assert.deepEqual(Object.keys(q.options).sort(),['A','B','C','D']);assert(q.qRefs.every(r=>r.page<q.keyRefs[0].page));assert(q.analysis.some(a=>a.t.trim()));assert(!/【答案】|【刷题笔记】|【真题思维点拨】/.test(q.stem));}
 }
 assert.equal(bank.questions[0].answer,'B');assert.equal(bank.questions.at(-1).answer,'ABC');assert(bank.questions.at(-1).sourceWarning.includes('坚持开'));assert.equal(report.anomalies.length,1);assert.equal(report.pdfSha256,b.sha256);
 const docs={k:read('lecture-k'),s:read('lecture-s')},manual=new Set(read('manual-index').pages.map(p=>p.id));for(const q of bank.questions){for(const p of q.kPages)assert(docs.k[p]);for(const p of q.sPages)assert(docs.s[p]);for(const id of q.mRefs)assert(manual.has(id));}
});
