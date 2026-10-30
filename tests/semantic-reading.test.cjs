const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=__dirname+'/../',read=p=>JSON.parse(fs.readFileSync(root+p,'utf8'));
const manifest=read('scripts/semantic-reference-reviewed.json');
const questions=new Map(read('data/practice/tuijie8.json').questions.map(q=>[q.id,q]));
const corrections=new Map(manifest.moduleCorrections.map(c=>[c.id,c]));
const ctx={window:{},console};vm.runInNewContext(fs.readFileSync(root+'js/lecture-links.js','utf8'),ctx);
const signature=ctx.window.LECTURE_LINKS.signature;
test('reading decisions remain bound to exactly the reviewed stems, options, keys and analyses',()=>{
 for(const row of [...manifest.questions,...manifest.moduleCorrections]){
  const q=questions.get(row.id),c=corrections.get(row.id);assert(q);
  const original={...q,...(c?{module:c.from}:{})};assert.equal(signature(original),row.sig,row.id);
  for(const e of row.references||[])assert([...e.covers].every(k=>q.answer.includes(k)),row.id);
 }
});
test('mixed papers classify actual question content instead of using fixed question-number ranges',()=>{
 for(const c of manifest.moduleCorrections)assert.equal(questions.get(c.id).module,c.to,c.id);
 for(const n of [6,7,8]){
  assert.equal(questions.get(`pr-tuijie8-choice-${n}-13`).module,'思想道德与法治');
  assert.equal(questions.get(`pr-tuijie8-choice-${n}-10`).module,'中国近现代史纲要');
 }
});
test('published reading references preserve source passages and keep partial option coverage explicit',()=>{
 const native=read('data/lecture-links/tuijie8.json'),extra=read('data/extra-links/tuijie8.json');
 const sources={k:read('data/lecture-k.json'),s:read('data/lecture-s.json'),m:Object.fromEntries(read('data/manual-index.json').pages.map(p=>[p.id,p.text]))};
 let partial=0;
 for(const row of manifest.questions){
  const q=questions.get(row.id);for(const e of row.references){
   const kind=e.kind,proof=sources[kind]?native.items[row.id]?.[kind]?.find(x=>x.page===e.page&&x.quote===e.quote):extra.items[row.id]?.refs.find(x=>String(x.page)===e.page&&x.quote===e.quote);
   if(!proof){assert(q[{k:'kPages',s:'sPages',m:'mRefs'}[kind]]?.length,row.id);continue;}
   assert.equal((sources[kind]?native:extra).items[row.id].sig,signature(q));
   if(sources[kind])assert(sources[kind][e.page].includes(e.quote),row.id);
   if(proof.partial){partial++;assert(proof.note.includes('尚未完整展开'),row.id);}
  }
 }
 assert(partial>0,'partial source coverage must not be mislabeled as a full explanation');
});

test('a table header is context, and a negative question cites the correction instead of endorsing the false option',()=>{
 const native=read('data/lecture-links/tuijie8.json');
 const table=native.items['pr-tuijie8-choice-2-09'].s;
 const header=table.find(e=>e.contextOnly);assert(header);assert.equal(header.covers,'');assert(header.note.includes('不单独用于判定答案'));
 assert(table.some(e=>e.covers.includes('B')));
 const correction=native.items['pr-tuijie8-choice-4-14'].k.find(e=>e.method==='question-reviewed-reading');
 assert(correction.note.includes('选错题的纠正依据'));assert(correction.note.includes('纠正A项'));
 const total=native.items['pr-tuijie8-choice-8-19'].s;
 assert.equal(new Set(total.map(e=>e.page)).size,total.length,'the same page image must not be repeated');
 assert(total.some(e=>e.note.includes('原理应用依据')));
});

test('close reading distinguishes local participation, complete enumerations and cross-page economic theory',()=>{
 const n=read('data/lecture-links/tuijie8.json'),x=read('data/extra-links/tuijie8.json');
 const refs=(id,kind)=>n.items['pr-tuijie8-choice-'+id]?.[kind]?.filter(e=>e.method==='question-reviewed-reading')||[];
 assert.equal(refs('3-30','k').map(e=>e.covers).join(''),'ABCD');
 assert.equal(refs('6-20','s').map(e=>e.covers).join(''),'ABCD');
 const local=x.items['pr-tuijie8-choice-7-24'].refs.filter(e=>e.method==='question-reviewed-reading');
 assert(local.every(e=>e.partial&&!e.covers.includes('D')),'local participation must not imply unproven democratic literacy');
 const money=refs('8-04','k');assert(money.some(e=>e.page==='114'));assert(money.some(e=>e.page==='164'));
 const ai=refs('6-02','m');assert(ai.some(e=>e.page==='u015'));assert(ai.some(e=>e.page==='u016'));
 assert(refs('8-24','k').every(e=>e.covers==='B'&&e.partial));
 const modern=refs('3-19','k');assert(modern.some(e=>e.page==='181'&&e.covers==='C'));
});
