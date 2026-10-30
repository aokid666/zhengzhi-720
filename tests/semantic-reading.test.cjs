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
 const money=n.items['pr-tuijie8-choice-8-04'].k;assert(money.some(e=>e.page==='114'));assert(money.some(e=>e.page==='164'));
 const ai=n.items['pr-tuijie8-choice-6-02'].m;assert(ai.some(e=>e.page==='u015'));assert(ai.some(e=>e.page==='u016'));
 const reform=refs('8-24','k');assert.equal([...new Set(reform.flatMap(e=>[...e.covers]))].sort().join(''),'ABC');assert(reform.every(e=>!e.partial&&e.note.includes('原理应用依据')));
 const modern=refs('3-19','k');assert(modern.some(e=>e.page==='181'&&e.covers==='C'));
});

test('separate examination categories have precise passages and remaining gaps stay explicit',()=>{
 const native=read('data/lecture-links/tuijie8.json'),extra=read('data/extra-links/tuijie8.json');
 const proofs=(id,k)=>native.items['pr-tuijie8-choice-'+id][k];
 const economic=proofs('8-20','s').find(e=>e.method==='question-reviewed-reading');
 assert.equal(economic.covers,'BCD');assert(!economic.partial);assert(economic.quote.includes('福利风险'));assert(!economic.quote.includes('社会极端思潮'));
 const labor=proofs('6-19','k').find(e=>e.method==='question-reviewed-reading');assert.equal(labor.covers,'AB');assert(labor.quote.includes('劳动的成果或者产品全部归资本家所有'));
 const investigation=proofs('8-17','k');assert(investigation.some(e=>e.page==='23'&&e.covers==='A'));assert(investigation.some(e=>e.page==='46'&&e.quote.includes('投身实践')));
 const historical=proofs('7-19','m').filter(e=>e.method==='question-reviewed-reading');assert(historical.every(e=>e.partial&&!e.covers.includes('D')));
 const modern=extra.items['pr-tuijie8-choice-3-19'].refs.filter(e=>e.method==='question-reviewed-reading');assert(modern.some(e=>e.page===116&&e.covers==='D'));assert(modern.every(e=>!e.partial));
 const market=extra.items['pr-tuijie8-choice-8-22'].refs.filter(e=>e.method==='question-reviewed-reading');assert(market.some(e=>e.source==='tuijie-manual-lower'&&e.page===16&&e.covers==='AB'));
});

test('history review keeps complete distinctions, partial textbook coverage and split-page context',()=>{
 const n=read('data/lecture-links/tuijie8.json'),x=read('data/extra-links/tuijie8.json');
 const item=id=>n.items['pr-tuijie8-choice-'+id];
 const row=id=>manifest.questions.find(q=>q.id==='pr-tuijie8-choice-'+id);
 const get=(id,k)=>item(id)[k];
 const dispute=row('4-03');assert(dispute.references.some(e=>e.kind==='m'&&e.page==='u158'&&e.quote.includes('第一次正面交锋')));
 const land=row('4-08');assert(land.references.some(e=>e.kind==='m'&&e.quote.includes('只有使用权，没有所有权')));
 const co=get('4-28','s').find(e=>e.method==='question-reviewed-reading');assert.equal(co.covers,'AB');assert(!co.partial);
 assert(get('4-28','m').some(e=>e.partial&&e.covers==='B'));
 const movement=x.items['pr-tuijie8-choice-4-24'].refs.filter(e=>e.method==='question-reviewed-reading');
 assert(movement.some(e=>e.source==='tuijie-manual-lower'&&e.page===27&&e.contextOnly&&e.covers===''));
 assert(movement.some(e=>e.source==='tuijie-manual-lower'&&e.page===28&&e.covers==='ABC'&&!e.partial));
 const theory=get('4-20','k');assert(theory.some(e=>e.page==='256'));assert(theory.some(e=>e.page==='257'));
 const government=get('4-21','m');assert(government.some(e=>e.page==='u161'));assert(government.some(e=>e.page==='u162'));
 const method=row('4-31');assert(method.references.every(e=>e.covers==='BCD'&&e.quote.includes('思想方法')));
 assert(get('4-24','s').some(e=>e.partial&&e.covers==='BC'));
});
