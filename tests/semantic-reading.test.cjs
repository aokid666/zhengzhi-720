const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=__dirname+'/../',read=p=>JSON.parse(fs.readFileSync(root+p,'utf8'));
const manifest=read('scripts/semantic-reference-reviewed.json');
const questions=new Map(read('data/practice/tuijie8.json').questions.map(q=>[q.id,q]));
const corrections=new Map(manifest.moduleCorrections.map(c=>[c.id,c]));
const ctx={window:{},console};vm.runInNewContext(fs.readFileSync(root+'js/lecture-links.js','utf8'),ctx);
const signature=ctx.window.LECTURE_LINKS.signature;
test('Marxism review separates structural levels, economic causes and exact cross-page support',()=>{
 const row=id=>manifest.questions.find(q=>q.id==='pr-tuijie8-choice-'+id);
 const refs=(id,k)=>row(id).references.filter(e=>e.kind===k);
 const structure=refs('1-10','k');assert(structure.some(e=>e.page==='65'&&e.covers==='A'&&e.quote.includes('国家政权是核心')));
 const truth=refs('1-08','m');assert(truth.some(e=>e.page==='u033'&&e.quote.includes('不是相互转化')));assert.equal(row('1-08').evidenceMode,'principle-application');
 assert(row('1-15').references.every(e=>e.kind==='k'&&e.page==='109'&&e.quote.includes('超巨型')),'a generic international-finance heading is insufficient for the specific company-chain example');
 assert(refs('1-26','m').some(e=>e.covers==='CD'&&e.quote.includes('客观后果')));
 const wage=refs('1-27','tj-u');assert(wage.some(e=>e.page==='46'&&e.covers==='BC'&&e.quote.includes('劳动力的价值或价格')));
 const turnover=refs('1-28','m');assert(turnover.some(e=>e.page==='u059'&&e.covers==='AC'&&e.quote.includes('固定资本和')));
 const crisis=refs('1-29','k');assert(crisis.some(e=>e.page==='92'&&e.covers==='C'));assert(crisis.some(e=>e.page==='94'&&e.covers==='AB'));assert(crisis.some(e=>e.page==='95'&&e.covers==='D'));
 assert(refs('1-30','s').every(e=>e.covers==='ABD'),'state redistribution alone does not explicitly elaborate national-income source C');
 const political=refs('1-31','k');assert(political.some(e=>e.page==='108'&&e.covers==='B'));assert(political.some(e=>e.page==='109'&&e.covers==='AC'));assert(!political.some(e=>e.quote.includes('社会阶层和阶级结构的变化')));
 const twentyFirst=refs('1-32','k');assert(twentyFirst.some(e=>e.page==='110'&&e.covers==='A'));assert(twentyFirst.some(e=>e.page==='109'&&e.covers==='BCD'));
 assert(row('1-33').references.every(e=>e.covers==='AB'),'long development processes must not silently include the unelaborated worldwide option D');
 assert(refs('1-05','tj-u').some(e=>e.page==='36'&&e.contextOnly&&e.covers===''));assert(refs('1-05','tj-u').some(e=>e.page==='37'&&e.covers==='C'));
});
test('Mao and Xi reading distinguishes exact hats, feasibility, significance and incomplete option support',()=>{
 const row=id=>manifest.questions.find(q=>q.id==='pr-tuijie8-choice-'+id);
 const refs=(id,k)=>row(id).references.filter(e=>e.kind===k);
 const agriculture=refs('2-08','tj-u');assert(agriculture.some(e=>e.page==='93'&&e.covers==='B'&&e.quote.includes('遵循的原则')));
 const ransom=row('2-25');assert(ransom.references.every(e=>e.kind==='k'&&e.page==='147'&&e.covers==='ABCD'));assert(ransom.references[0].quote.includes('方式的意义'));assert(!ransom.references[0].quote.includes('方式的原因'));
 assert(refs('2-21','k').some(e=>e.covers==='BCD'));assert(refs('2-21','m').every(e=>e.covers==='D'));
 assert(refs('3-07','tj-u').some(e=>e.page==='147'&&e.covers==='C'&&e.quote.includes('主力军')));assert(!row('3-07').references.some(e=>['k','s','m'].includes(e.kind)),'a list of strategic science forces does not identify the main force of basic research');
 assert(refs('3-10','tj-u').some(e=>e.page==='150'&&e.quote.includes('历史责任')));
 assert(refs('3-02','k').some(e=>e.page==='180'&&e.covers==='B'));assert(refs('3-03','k').some(e=>e.page==='183'&&e.covers==='A'));
 assert(refs('6-23','m').every(e=>e.covers==='BD'));assert(refs('7-23','m').some(e=>e.covers==='ACD'));assert(refs('7-23','s').every(e=>e.covers==='AC'));assert(refs('7-23','tj-u').every(e=>e.covers==='AD'));
 assert(refs('2-28','s').some(e=>e.page==='169'&&e.covers==='A'));assert(refs('2-28','s').some(e=>e.page==='170'&&e.contextOnly));
 const modern=refs('3-20','m');assert(modern.some(e=>e.page==='u104'&&e.covers==='AB'));assert(modern.some(e=>e.page==='u105'&&e.covers==='D'));
 const dates=refs('2-30','tj-u');assert.equal(new Set(dates.map(e=>e.page)).size,dates.length);assert(dates.some(e=>e.page==='102'&&e.covers==='AC'&&e.quote.includes('党的十四大')));
});
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

test('close reading corrects the two legal soul concepts and preserves rights subcategories',async()=>{
 const n=read('data/lecture-links/tuijie8.json'),x=read('data/extra-links/tuijie8.json');
 const qid='pr-tuijie8-choice-5-06',native=n.items[qid],extra=x.items[qid];
 assert.deepEqual(native.clear.k.expected,[320]);assert.deepEqual(native.clear.m.expected,['u229']);
 assert(!native.k.length&&!native.s.length&&!native.m.length);assert(!extra.refs.some(e=>e.source==='tuijie-manual-upper'&&e.page===236));
 assert(extra.refs.some(e=>e.source==='tuijie-manual-upper'&&e.page===239&&e.quote.includes('社会主义核心价值观')));
 assert(x.items['pr-tuijie8-choice-5-12'].refs.some(e=>e.source==='tuijie-manual-upper'&&e.page===236),'the same page remains valid for the distinct leadership question');
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>n})};vm.runInNewContext(fs.readFileSync(root+'js/lecture-links.js','utf8'),ctx);
 const q=structuredClone(questions.get(qid));await ctx.window.LECTURE_LINKS.apply([q]);assert.equal(q.kPages.length,0);assert.equal(q.mRefs.length,0);assert.equal(questions.get(qid).kPages[0],320,'bank data is preserved');
 const poet=n.items['pr-tuijie8-choice-7-30'].m;assert(!poet.some(e=>e.page==='u209'));assert(poet.some(e=>e.page==='u220'&&e.covers==='BC'));
 const rights=x.items['pr-tuijie8-choice-5-30'].refs;assert(rights.some(e=>e.source==='tuijie-manual-upper'&&e.page===243&&e.covers==='AD'));
 const moral=x.items['pr-tuijie8-choice-5-04'].refs;assert(moral.some(e=>e.source==='tuijie-manual-upper'&&e.page===228&&e.quote.includes('学校')));
 const fair=n.items['pr-tuijie8-choice-6-31'].m;assert(fair.some(e=>e.page==='u234'&&e.covers==='ABC'));assert(!fair.some(e=>e.method==='question-reviewed-reading'&&e.covers.includes('D')));
});
