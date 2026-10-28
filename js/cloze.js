/* Source-coordinate blue-answer cloze; one recall group may cover several wrapped lines. */
window.HAT_CLOZE=(()=>{
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=s=>document.querySelector(s);
 function render(q,c){
  const p=c.P(q.id),answered=!!p?.s&&!c.S['redo_'+q.id];
  const state=c.S['hat_'+q.id]||(c.S['hat_'+q.id]={open:[],mode:localStorage.getItem('zz720.hatMode')||'image'});
  if(answered&&!state.initialized){state.open=q.cloze.masks.map(m=>m.id);state.initialized=true;}
  const open=new Set(state.open),masks=q.cloze.masks;let mode=state.mode;
  c.shell('<div class="card hat-header"><div class="qhd"><button class="iconbtn" onclick="ZS_GO(\'sprint/practice/'+q.bookId+'\')">☰</button><span class="idx">'+esc(q.module+' · '+q.chapter)+'</span><span class="sp"></span><button class="iconbtn '+(c.flag(q.id,'star')?'on':'')+'" onclick="ZS_FLAG(\''+q.id+'\',\'star\')">★</button></div><div class="pad"><div class="hat-eyebrow">肖帽子题 · 蓝色考点</div><h1>'+esc(q.stem)+'</h1><p class="tiny muted">只遮蓝色答案，设问中的蓝色提示保留。跨行的同一词组一并揭晓。</p><div class="acts"><button class="btn tiny" id="hatImage">原图挖空</button><button class="btn tiny" id="hatText">原位文字</button><span class="sp"></span><button class="btn tiny" id="hatAll">全部揭晓</button></div><div id="hatStatus" class="tiny muted" aria-live="polite"></div></div></div><div id="hatPages" class="hat-pages"></div><div class="card pad"><div id="hatAssessment" class="acts"></div><div id="hatGrade" class="tiny muted"></div><details class="hat-original"><summary>查看完整原页与 PDF（含答案）</summary>'+PRACTICE.questionPages(q,'question')+PRACTICE.questionPdf(q,'question')+'</details></div><div id="hatRelated"></div>');
  c.showQNav(true,c.qIndexOf(q.id));
  function paint(){
   state.open=[...open];state.mode=mode;
   $('#hatImage').classList.toggle('main',mode==='image');$('#hatText').classList.toggle('main',mode==='text');
   $('#hatAll').textContent=open.size===masks.length?'全部遮挡':'全部揭晓';$('#hatStatus').textContent='已回忆 '+open.size+' / '+masks.length+' 处 · 点击遮挡揭晓，再次点击可收回';
   $('#hatPages').innerHTML=q.qRefs.map(r=>{
    const [x,y,w,h]=r.b,book=PRACTICE.index.books.find(b=>b.id===q.bookId),page=book.pageSizes[r.page-1];
    const content=mode==='image'?'<img class="hat-original-image" loading="eager" src="'+book.sourceBase+'img/'+q.bookId+'/'+String(r.page).padStart(3,'0')+'.png" style="width:'+page.width/w*100+'%;left:'+(-x/w*100)+'%;top:'+(-y/h*100)+'%" alt="本题原始版面">':'<svg class="hat-positioned-text" viewBox="'+r.b[0]+' '+r.b[1]+' '+r.b[2]+' '+r.b[3]+'" aria-label="原文定位文字">'+q.cloze.spans.filter(s=>s.page===r.page).map(s=>'<text x="'+s.x+'" y="'+s.y+'" font-size="'+s.size+'" textLength="'+(s.b[2]-s.b[0])+'" lengthAdjust="spacingAndGlyphs" fill="'+(s.color===0x1f497d?'var(--hat-blue)':'var(--ink)')+'">'+esc(s.text)+'</text>').join('')+'</svg>';
    const covers=masks.flatMap((m,i)=>m.rects.filter(z=>z.page===r.page).map(z=>'<button class="hat-mask'+(open.has(m.id)?' revealed':'')+'" data-mask="'+m.id+'" aria-label="'+esc(open.has(m.id)?'收回答案：'+m.text:'揭晓第'+(i+1)+'处答案')+'" aria-pressed="'+open.has(m.id)+'" style="left:'+((z.b[0]-x)/w*100)+'%;top:'+((z.b[1]-y)/h*100)+'%;width:'+(z.b[2]/w*100)+'%;height:'+(z.b[3]/h*100)+'%"><span>'+(i+1)+'</span></button>')).join('');
    return '<section class="hat-sheet '+(mode==='image'?'hat-image':'hat-text')+'" style="aspect-ratio:'+w+'/'+h+'">'+content+covers+'</section>';
   }).join('');
   $('#hatPages').querySelectorAll('[data-mask]').forEach(b=>b.onclick=()=>{const id=b.dataset.mask;open.has(id)?open.delete(id):open.add(id);paint();});
   $('#hatAssessment').innerHTML=answered?'<button class="btn" onclick="ZS_REDO(\''+q.id+'\')">重新背诵</button>':open.size===masks.length?'<button class="btn main" id="hatMastered">自评：已掌握</button><button class="btn" id="hatReview">自评：仍需复习</button>':'<span class="tiny muted">先逐处回忆，全部揭晓后记录掌握情况。</span>';
   $('#hatGrade').textContent=answered?'已记录：'+(p.s==='right'?'已掌握':'仍需复习')+' · 已练 '+p.tries+' 次':'挖空背诵由本人自评，不自动判分。';
   const assess=right=>{c.setProg(q.id,right,false,['cloze:'+JSON.stringify({open:[...open]})]);state.initialized=true;c.renderQuestion(q.id);};
   if($('#hatMastered'))$('#hatMastered').onclick=()=>assess(true);if($('#hatReview'))$('#hatReview').onclick=()=>assess(false);
  }
  $('#hatImage').onclick=()=>{mode='image';localStorage.setItem('zz720.hatMode',mode);paint();};$('#hatText').onclick=()=>{mode='text';localStorage.setItem('zz720.hatMode',mode);paint();};$('#hatAll').onclick=()=>{if(open.size===masks.length)open.clear();else masks.forEach(m=>open.add(m.id));paint();};paint();
  if(answered){$('#hatRelated').innerHTML='<div class="acc" id="accL"><div class="hd" onclick="ZS_ACC(this)">讲义对照与笔记<span class="arw">›</span></div><div class="bd"><div class="tabs"><span class="tab on" onclick="ZS_TAB(this,\'k\')">知识清单</span><span class="tab" onclick="ZS_TAB(this,\'s\')">速成班讲义</span><span class="tab" onclick="ZS_TAB(this,\'m\')">背诵手册</span></div><div id="lectK" class="lectbox"></div><div id="lectS" class="lectbox" style="display:none"></div><div id="lectM" class="lectbox" style="display:none"></div></div></div><div id="noteSection"></div>';c.needLect().then(()=>{if(c.S.cur===q)c.paintLect(q);});c.renderNote(q.id);ANNO.renderScope();}
 }
 function reset(id,S){delete S['hat_'+id];}
 return {render,reset};
})();
