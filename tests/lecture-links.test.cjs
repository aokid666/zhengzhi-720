const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../js/lecture-links.js','utf8');
test('lecture supplement respects original links, rejects stale text, escapes evidence and never changes progress',async()=>{
 const q={id:'proof',module:'马原',stem:'第一次合作的著作',answer:'A',options:{A:'神圣家族'},kPages:[99],sPages:[],mRefs:[]};let overlay;
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>overlay})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 overlay={items:{proof:{sig:api.signature(q),k:[{page:'13',quote:'existing stays'}],s:[{page:'11',quote:'<原文>&'}],m:[{page:'u010',quote:'手册原文'}]}}};
 await api.apply([q]);assert.equal(q.kPages[0],99);assert.equal(q.sPages[0],11);assert.equal(q.mRefs[0],'u010');assert(api.evidence(q,'s').includes('&lt;原文&gt;&amp;'));assert(!q.progress);assert(!q.lectureEvidence.k);
 const edited={...q,stem:'其他题目',sPages:[],mRefs:[]};await api.apply([edited]);assert.equal(edited.sPages.length,0);
});
