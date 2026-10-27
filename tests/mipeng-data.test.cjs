const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=n=>JSON.parse(fs.readFileSync(__dirname+'/../data/'+n+'.json','utf8'));
const bank=read('practice/mipeng6'),index=read('practice-index'),report=read('mipeng-build-report'),book=index.books.find(b=>b.id==='mipeng6');
test('six complete mock papers preserve all choices and material analysis',()=>{
 assert.equal(bank.questions.length,228);assert.equal(book.count,228);assert.equal(book.kind,'mock');assert.equal(book.chapters.length,6);
 for(let s=1;s<=6;s++){const qs=bank.questions.filter(q=>q.examSet===s);assert.deepEqual(qs.map(q=>q.originalNo),Array.from({length:38},(_,i)=>i+1));assert.equal(qs.filter(q=>q.type==='choice').length,33);assert.equal(qs.filter(q=>q.type==='written').length,5);assert.equal(qs[0].qRefs[0].page,[7,20,33,46,59,73][s-1]);for(const q of qs){assert(q.analysis.some(a=>a.t.trim()));assert(q.qRefs.length&&q.keyRefs.length);assert(q.keyRefs.every(r=>r.page>=94));if(q.type==='choice'){assert.deepEqual(Object.keys(q.options).sort(),['A','B','C','D']);assert.equal(q.multi,q.originalNo>=17);assert(q.multi?q.answer.length>=2:q.answer.length===1);}else assert.equal(q.answer,'');}}
 assert(bank.questions[0].stem.includes('景德镇'));assert.equal(bank.questions[0].answer,'D');
});
test('both original PDFs and all original scans have verified source identities',()=>{
 const m=read('practice-sources').find(x=>x.id==='mipeng6');assert.equal(m.pages.length,182);assert(m.pages.every(p=>p.ext==='png'&&p.bytes>0&&p.sha256.length===64));assert.equal(m.pdfs.length,2);assert.deepEqual(m.pdfs.map(p=>p.pages),[88,94]);assert.equal(book.sha256,m.pdfSha256);assert.equal(book.pdfParts[0].lastPage,88);assert.equal(book.pdfParts[1].firstPage,89);assert(book.pdfParts[0].url.endsWith('/questions.pdf'));assert(book.pdfParts[1].url.endsWith('/answers.pdf'));
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.quickKeyGroups,[33,33,33,33,33,33]);assert.equal(report.single,96);assert.equal(report.multiple,102);assert.equal(report.written,30);
});
