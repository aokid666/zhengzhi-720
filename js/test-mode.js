/* Objective tests: drafts stay separate from scored progress until one settlement. */
window.TEST_MODE=(()=>{
 'use strict';
 const KEY='zz720.testSession.v1',PREF='zz720.testMode';let ctx,active=null,review=null,finishing=false;
 const copy=x=>JSON.parse(JSON.stringify(x));
 const enabled=()=>!!active||localStorage.getItem(PREF)==='1';
 const eligible=q=>!!q&&q.type!=='cloze'&&q.type!=='written'&&(q.type==='matching'||Object.keys(q.options||{}).length>0)&&!ctx?.sandbox?.(q.id);
 const isReview=id=>!!review?.ids.includes(id);
 const testing=q=>enabled()&&eligible(q)&&!isReview(q.id)&&(!ctx?.progress?.(q.id)?.s||!!active?.drafts[q.id]);
 function persist(){try{sessionStorage.setItem(KEY,JSON.stringify({active,review}));}catch(e){ZS.toast('测试暂存空间不足，请及时提交本次测试。');}}
 function prepare(q){
  if(review&&!review.ids.includes(q.id)){review=null;persist();}
  if(!eligible(q)){if(active)finish(true);return false;}
  if(!testing(q))return false;
  if(review){review=null;}
  if(!active)active={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),order:[],drafts:{}};
  persist();return true;
 }
 const draft=id=>copy(active?.drafts[id]?.sel||[]);
 function validity(q,sel){
  if(q.type!=='matching')return sel.length>0&&sel.every(k=>Object.hasOwn(q.options,k));
  try{const map=JSON.parse((sel[0]||'').slice(6));return q.left.every(i=>Array.isArray(map[i.key])&&map[i.key].length>0&&(q.multiMatch||map[i.key].length===1)&&new Set(map[i.key]).size===map[i.key].length&&map[i.key].every(k=>q.right.some(r=>r.key===k)));}catch(e){return false;}
 }
 function stage(q,sel){
  if(!testing(q))return false;if(!active)prepare(q);
  if(!active.order.includes(q.id))active.order.push(q.id);
  active.drafts[q.id]={sel:copy(sel),valid:validity(q,sel)};persist();status();return true;
 }
 const count=()=>active?active.order.filter(id=>active.drafts[id]?.valid).length:0;
 function correct(q,sel){
  if(q.type!=='matching')return [...sel].sort().join('')===q.answer.split('').sort().join('');
  const map=JSON.parse(sel[0].slice(6));return q.left.every(i=>JSON.stringify([...map[i.key]].sort())===JSON.stringify([...q.matchMap[i.key]].sort()));
 }
 function report(){
  if(!review)return;let el=document.getElementById('testReport');if(!el){el=document.createElement('div');el.id='testReport';el.className='test-dialog';document.body.appendChild(el);}
  const snapshot=review,s=snapshot.summary;el.hidden=false;el.innerHTML='<section class="test-report-box" role="dialog" aria-modal="true" aria-labelledby="testReportTitle"><h2 id="testReportTitle">本次测试已提交</h2><div class="test-score-grid"><div><strong>'+s.total+'</strong><span>完成题数</span></div><div><strong>'+s.right+'</strong><span>答对</span></div><div><strong>'+s.wrong+'</strong><span>答错</span></div><div><strong>'+s.rate+'%</strong><span>正确率</span></div></div>'+(s.incomplete?'<p class="tiny muted">另有 '+s.incomplete+' 道连线题未完成，未计入成绩。</p>':'')+'<div class="acts"><button class="btn" id="testReportClose">关闭</button><button class="btn main" id="testReportReview" '+(!s.total?'disabled':'')+'>从第一题开始复习</button></div></section>';
  el.querySelector('#testReportClose').onclick=()=>{el.hidden=true;};el.querySelector('#testReportReview').onclick=()=>{el.hidden=true;review=snapshot;active=null;persist();ctx.go('q/'+snapshot.ids[0]);};el.querySelector('#testReportClose').focus();el.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();el.hidden=true;}};
 }
 function finish(show=true){
  if(!active||finishing)return false;if(!active.order.length){active=null;persist();return false;}if(active.order.some(id=>active.drafts[id]?.valid&&!ctx.getQ(id))){ZS.toast('测试记录已暂存，请待题库加载完成后再提交');return false;}finishing=true;
  const batch=active;active=null;const ids=batch.order.filter(id=>batch.drafts[id]?.valid&&ctx.getQ(id));
  const rows={};for(const id of ids){const sel=batch.drafts[id].sel;rows[id]={sel,right:correct(ctx.getQ(id),sel),attempt:batch.id+':'+id,committed:false};}
  const right=ids.filter(id=>rows[id].right).length;
  review={ids,rows,summary:{total:ids.length,right,wrong:ids.length-right,rate:ids.length?Math.round(right/ids.length*10000)/100:0,incomplete:batch.order.filter(id=>!batch.drafts[id].valid&&ctx.getQ(id)?.type==='matching').length}};
  persist();for(const id of ids){const row=rows[id];ctx.commit(id,row.right,row.sel,row.attempt);row.committed=true;persist();}
  finishing=false;if(show)report();return true;
 }
 function submit(id){if(!count())return ZS.toast('请先完成至少一道题');if(finish(true))ctx.render(id);}
 function leave(route){const id=route.startsWith('q/')?route.slice(2):null;const q=id&&ctx.getQ(id);if(!id||(q&&!eligible(q))){if(active)finish(true);if(review){review=null;persist();}}}
 function exitReview(q){review=null;persist();ctx.go(ctx.directory(q));}
 function decorateDirectory(){
  const view=document.getElementById('view');if(!view||view.querySelector('.test-mode-switch'))return;
  const el=document.createElement('div');el.className='test-mode-bar';el.innerHTML='<div class="test-mode-switch" role="group" aria-label="做题模式"><button class="btn tiny '+(!enabled()?'main':'')+'" id="testPractice" aria-pressed="'+!enabled()+'">练习模式</button><button class="btn tiny '+(enabled()?'main':'')+'" id="testEnable" aria-pressed="'+enabled()+'">测试模式</button></div><p>测试模式下，新作答的题目提交后统一公布结果；已做题保留原有状态与解析。材料题、挖空背诵和重做区沿用原流程。</p>';
  (view.querySelector('.sprint-page')||view).prepend(el);
  const select=value=>{if(active)finish(true);review=null;localStorage.setItem(PREF,value);persist();el.remove();decorateDirectory();};
  el.querySelector('#testPractice').onclick=()=>select('0');el.querySelector('#testEnable').onclick=()=>select('1');
 }
 function status(){const el=document.getElementById('testCount');if(el)el.textContent='已答 '+count()+' 题 · 提交前可修改';}
 function decorate(q){
  if(!q||!document.querySelector('#view .qhd'))return;
  if(!testing(q)&&!isReview(q.id))return;
  const el=document.createElement('div');el.className='test-mode-bar';el.innerHTML=testing(q)?'<div class="test-mode-state"><span>测试模式 · </span><span id="testCount"></span><button class="btn tiny main" id="testFinish">提交测试</button></div><p>先作答，提交测试或离开题目页后统一显示答案、解析和成绩。</p>':'<div class="test-mode-state"><span>复习本次 '+review.ids.length+' 题</span><button class="btn tiny" id="testExitReview">退出复习</button><button class="btn tiny" id="testLastReport">查看成绩</button></div>';
  document.getElementById('view').prepend(el);
  if(el.querySelector('#testExitReview'))el.querySelector('#testExitReview').onclick=()=>exitReview(q);
  if(el.querySelector('#testFinish'))el.querySelector('#testFinish').onclick=()=>submit(q.id);
  if(el.querySelector('#testLastReport'))el.querySelector('#testLastReport').onclick=report;status();
 }
 async function init(context){
  ctx=context;try{const data=JSON.parse(sessionStorage.getItem(KEY)||'null');if(data){active=data.active;review=data.review;}}catch(e){}
  const ids=[...new Set([...(active?.order||[]),...(review?.ids||[])])];try{await ctx.ensure(ids);}catch(e){ZS.toast('测试草稿已保留，请加载相应题库后继续');}
  if(review)for(const id of review.ids){const row=review.rows[id];if(!row.committed){ctx.commit(id,row.right,row.sel,row.attempt);row.committed=true;}}
  persist();window.addEventListener('pagehide',persist);
 }
 function forget(id){if(review){delete review.rows[id];review.ids=review.ids.filter(k=>k!==id);}if(active){delete active.drafts[id];active.order=active.order.filter(k=>k!==id);}persist();}
 const result=id=>isReview(id)?copy(review.rows[id]):null;
 const pool=id=>isReview(id)?review.ids.map(ctx.getQ).filter(Boolean):null;
 return {init,prepare,testing,eligible,draft,stage,leave,decorate,decorateDirectory,finish,submit,forget,result,pool,isReview,count};
})();
