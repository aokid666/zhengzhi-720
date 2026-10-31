const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../js/lecture-links.js','utf8');
test('lecture supplement respects original links, rejects stale text, escapes evidence and never changes progress',async()=>{
 const q={id:'proof',module:'马原',stem:'第一次合作的著作',answer:'A',options:{A:'神圣家族'},kPages:[99],sPages:[],mRefs:[]};let overlay;
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>overlay})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 overlay={items:{proof:{sig:api.signature(q),k:[{page:'13',quote:'existing stays'}],s:[{page:'11',quote:'<原文>&'}],m:[{page:'u010',quote:'手册原文'}]}}};
 await api.apply([q]);assert.equal(q.kPages[0],99);assert.equal(q.sPages[0],11);assert.equal(q.mRefs[0],'u010');assert(api.evidence(q,'s').includes('&lt;原文&gt;&amp;'));assert(!q.progress);assert(!q.lectureEvidence.k);
 const edited={...q,stem:'其他题目',sPages:[],mRefs:[]};await api.apply([edited]);assert.equal(edited.sPages.length,0);
});

test('confirmed wrong page correction requires both the same question and the same prior references',async()=>{
 const q={id:'policy',module:'新思想',stem:'八项规定',answer:'B',options:{B:'落实中央八项规定'},mRefs:['l053','l009']};let row;
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>({items:{policy:row}})})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 row={sig:api.signature(q),replace:{m:['l053','l009']},m:[{page:'l015',quote:'改进作风的切入口'}]};
 const changed={...q,mRefs:['u100']};await api.apply([changed]);assert.equal(changed.mRefs[0],'u100');
 await api.apply([q]);assert.equal(q.mRefs[0],'l015');assert.equal(q.mRefs.length,1);
});

test('failed reference download is distinct from an unmatched passage and can be retried',async()=>{
 let failed=true;const q={id:'retry-test',module:'马原',stem:'意识的含义',answer:'A',options:{A:'人脑的机能'},kPages:[],sPages:[],mRefs:[]};const ctx={window:{},console:{warn(){}},fetch:async()=>({ok:!failed,json:async()=>({items:{'retry-test':{sig:ctx.window.LECTURE_LINKS.signature(q),k:[{page:'18',quote:'意识是人脑的机能和属性'}]}}})})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 await api.apply([q]);assert.equal(q._lectureLinkError,true);assert(api.missing(q,'知识清单').includes('加载失败'));assert(api.missing(q,'知识清单').includes('重新加载'));assert(!api.missing(q,'知识清单').includes('暂未定位'));
 failed=false;await api.apply([q]);assert.equal(q._lectureLinkError,false);assert.equal(q.kPages[0],18);assert(api.missing(q,'速成班讲义').includes('尚未自动确认'));assert(!api.missing(q,'速成班讲义').includes('加载失败'));
});

test('unmatched references offer source-specific full-book lookup with a useful query',()=>{
 const ctx={window:{},console};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS,q={id:'lookup',answer:'B',options:{B:'《关于费尔巴哈的提纲》'},stem:'首次提出科学实践观的著作'};
 assert.equal(api.query(q),'关于费尔巴哈的提纲');const html=api.missing(q,'腿姐背诵手册',true);assert(html.includes('data-kind="tj"'));assert(html.includes('ZS_FINDQLECTURE'));assert(html.includes('查找本题考点'));assert.equal(api.query({answer:'A',options:{A:'必须坚持自信自立'}}),'自信自立');
});

test('a passage covering only some correct options is visibly labeled before expanding it',()=>{
 const ctx={window:{},console};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 const html=api.evidence({lectureEvidence:{k:[{page:'17',quote:'原文',partial:true,note:'尚未完整展开B'}]}},'k');
 assert(html.slice(0,html.indexOf('</summary>')).includes('部分选项依据'));
 assert(!api.evidence({lectureEvidence:{k:[{page:'17',quote:'原文'}]}},'k').includes('部分选项依据'));
});

test('reviewed additions keep original pages, reject independent page edits and remain idempotent',async()=>{
 const q={id:'cross-page',module:'马原',stem:'两个阶段的共同点',answer:'D',options:{D:'利用市场'},kPages:[114]};let row;
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>({items:{'cross-page':row}})})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 row={sig:api.signature(q),extend:{k:[114]},k:[{page:'114',quote:'列宁原文'},{page:'164',quote:'邓小平原文'}]};
 const changed={...q,kPages:[199]};await api.apply([changed]);assert.deepEqual(changed.kPages,[199]);assert(!changed.lectureEvidence);
 const stale={...q,stem:'别人修改后的题干'};await api.apply([stale]);assert.deepEqual(stale.kPages,[114]);assert(!stale.lectureEvidence);
 await api.apply([q]);assert.equal(JSON.stringify(q.kPages),'[114,164]');assert(api.evidence(q,'k').includes('邓小平原文'));
 await api.apply([q]);assert.equal(JSON.stringify(q.kPages),'[114,164]');assert.equal(q.lectureEvidence.k.length,2);
 assert(!q.progress);assert.equal(q.stem,'两个阶段的共同点');
});

test('audited mismatches clear only the original page list, expose the reason and leave independent edits intact',async()=>{
 const q={id:'soul',module:'思修',stem:'社会主义法治建设的灵魂',answer:'A',options:{A:'社会主义核心价值观'},kPages:[320],mRefs:['u229'],sPages:[]};let row;
 const ctx={window:{},console,fetch:async()=>({ok:true,json:async()=>({items:{soul:row}})})};vm.runInNewContext(src,ctx);const api=ctx.window.LECTURE_LINKS;
 row={sig:api.signature(q),clear:{k:{expected:[320],reason:'原文讲党的领导，不是本题的核心价值观。'},m:{expected:['u229'],reason:'旧页概念不同。'}}};
 const independent={...q,kPages:[312],mRefs:['u214']};await api.apply([independent]);assert.deepEqual(independent.kPages,[312]);assert.deepEqual(independent.mRefs,['u214']);assert(!independent.lectureCorrections);
 const stale={...q,stem:'其他人修改后的题目'};await api.apply([stale]);assert.deepEqual(stale.kPages,[320]);
 q.lectureEvidence={k:[{page:'320',quote:'旧定位'}]};await api.apply([q]);assert.equal(q.kPages.length,0);assert.equal(q.mRefs.length,0);assert(!q.lectureEvidence.k);assert(api.missing(q,'知识清单').includes('原文讲党的领导'));
 await api.apply([q]);assert.equal(q.kPages.length,0);assert(api.missing(q,'知识清单').includes('尚未自动确认'));assert(!q.progress);
});

test('the visible reference for a duplicate original page prefers explicit reviewed option coverage',()=>{
 const ctx={window:{},console};vm.runInNewContext(fs.readFileSync(__dirname+'/../js/extra-lectures.js','utf8'),ctx);
 const old={source:'upper',page:226,quote:'关系介绍',method:'statement'},reviewed={source:'upper',page:226,quote:'精读关系',method:'question-reviewed-reading',partial:true,covers:'AD'},other={source:'lower',page:226,quote:'另一册'};
 const input=[old,other,reviewed],before=JSON.stringify(input),picked=ctx.window.EXTRA_LECTURES.selectReferences(input);
 assert.equal(picked.length,2);assert.equal(picked[0],reviewed);assert.equal(picked[1],other);assert.equal(JSON.stringify(input),before,'selection must preserve stored reference history');
 assert.equal(ctx.window.EXTRA_LECTURES.selectReferences([reviewed,old])[0],reviewed);
 const x=JSON.parse(fs.readFileSync(__dirname+'/../data/extra-links/tuijie8.json','utf8'));
 const visible=ctx.window.EXTRA_LECTURES.selectReferences(x.items['pr-tuijie8-choice-5-24'].refs).find(e=>e.source==='tuijie-manual-upper'&&e.page===226);
 assert(visible.partial&&visible.covers==='AD');assert(visible.note.includes('尚未完整展开选项B'));
});
