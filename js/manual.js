/* 背诵手册：保留原图，文字定位、遮罩与手写记录共用原页坐标。 */
window.MANUAL = (() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data, questions, matches, byPage, ctx, current, mode='read', ro, generation=0;
  const history = new Map(), revealed = new Set();
  const BASE = {upper:'https://aokid666.github.io/zz-manual-upper/',lower:'https://aokid666.github.io/zz-manual-lower/'};
  const label = p => '背诵手册 · '+(p.vol==='upper'?'上册':'下册')+' '+(p.bookPage>0?'P'+p.bookPage:'PDF P'+p.page);
  const src = id => { const p=byPage[id]; return BASE[p.vol]+'img/'+String(p.page).padStart(3,'0')+'.'+p.ext; };
  const key = id => '_manual_'+id;
  const masks = id => { const e=ZS.data.edit[key(id)]; return e && Array.isArray(e.masks) ? e.masks : byPage[id].masks; };
  async function load() {
    const result=await Promise.all(['manual-index','manual-questions','manual-matches'].map(async n => {
      const r=await fetch('data/'+n+'.json?v=110'); if(!r.ok) throw new Error('背诵手册数据加载失败'); return r.json();
    }));
    [data,questions,matches]=result; byPage=Object.fromEntries(data.pages.map(p=>[p.id,p])); return questions;
  }
  function leave() {
    generation++; if(ro) {ro.disconnect();ro=null;}
    if(current) ZS.endEdit('edit',key(current)); current=null; mode='read';
  }
  function pdf(id) {
    const p=byPage[id]; return '<a class="btn tiny" target="_blank" rel="noopener" href="https://aokid666.github.io/zz-pdf/pdf/'+encodeURIComponent(p.pdf)+'#page='+p.localPdfPage+'&zoom=page-width">打开手册原 PDF</a>';
  }
  function pageHtml(id, annoId='_lec', area='m-img-'+id) {
    const p=byPage[id]; if(!p) return '';
    return '<div class="pgwrap m-source" data-id="'+annoId+'" data-tgt="m-img" data-anno="'+annoId+'|'+area+'"><img loading="lazy" src="'+src(id)+'" alt="'+esc(label(p))+'" data-label="'+esc(label(p))+'" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)"><span class="pgno">'+esc(label(p))+'</span><button class="annobtn" onclick="ZS_ANNO(\''+annoId+'\',\''+area+'\')">✍️</button></div><div class="acts"><button class="btn tiny" onclick="ZS_ZOOMSRC(\''+src(id)+'\')">放大原图</button>'+pdf(id)+'<button class="btn tiny" onclick="ZS_GO(\'sprint/page/'+id+'\')">进入本页挖空背诵</button></div><details><summary>本页文字</summary><div class="txt m-plain">'+esc(p.text)+'</div></details>';
  }
  function questionPages(q,which) {
    const ids=which==='key'?q.keyRefs:q.qRefs;
    return (ids||[]).map((id,i)=>pageHtml(id,q.id,'a-img-'+i)).join('');
  }
  function questionPdf(q,which) {return (which==='key'?q.keyRefs:q.qRefs).map(pdf).join('');}
  function paintQuestion(q) {
    const box=document.getElementById('lectM'); if(!box) return;
    if(!data) {box.innerHTML='<div class="hint">背诵手册加载失败，请刷新重试。</div>';return;}
    const refs=(q.source==='m'?q.mRefs:(matches[q.id]||[]).map(h=>h.page))||[];
    let ids=Array.from(new Set((q.source==='m'?q.qRefs:[]).concat(refs)));
    box.innerHTML=ids.length?'<div class="tiny muted">'+(refs.length?'相关内容按文字匹配定位，请结合原页核对。':'本题原页如下；没找到对应的理论讲解页。')+'</div>'+ids.map(id=>pageHtml(id)).join(''):'<div class="hint">没找到背诵手册中的相应内容。</div>';
  }
  function badge(q) {
    const p=ctx.P(q.id); return (ctx.isWrongNow(q.id)?'❌ 错题 · ':'')+(ctx.flag(q.id,'star')?'★ 收藏 · ':'')+'已做 '+(p&&p.tries||0)+' 次';
  }
  function frame(html) {ctx.showQNav(false);ctx.shell(html);}
  function render(h,c) {
    ctx=c;
    if(!data) {frame('<div class="empty">背诵手册未能加载，请刷新重试。</div>');return;}
    const parts=h.split('/');
    if(parts[1]==='questions') return listQuestions(parts[2]||'all');
    if(parts[1]==='topic') {const t=data.topics.find(t=>t.id===parts[2]); return t?reader(parts[3]||t.pages[0],t.pages,t.title,t.id):home();}
    if(parts[1]==='page') return reader(parts[2]||'u009',data.pages.map(p=>p.id),'背诵手册原页',null);
    if(parts[1]==='points') return library(true);
    if(parts[1]==='book') return library(false);
    return home();
  }
  function home() {
    const modules=Array.from(new Set(data.topics.map(t=>t.module)));
    frame('<div class="hero"><h1>冲刺板块</h1><p>背诵手册 · 专题挖空 · 点拨与干扰项 · 习题190</p></div><div class="acts"><button class="btn main" onclick="ZS_GO(\'sprint/questions\')">习题190 · '+questions.length+'题</button><button class="btn" onclick="ZS_GO(\'sprint/points\')">点拨 / 命题分析 / 干扰项</button><button class="btn" onclick="ZS_GO(\'sprint/book\')">目录与手册全文搜索</button></div><div class="hint">文字挖空：按原书位置选择字词；截图挖空：在原图上框选。点击遮罩即可揭晓答案，挖空和手写记录会随学习数据同步。</div>'+modules.map(m=>'<details class="card pad" open><summary>'+esc(m)+'</summary><div class="m-topics">'+data.topics.filter(t=>t.module===m).map(t=>'<button class="btn" onclick="ZS_GO(\'sprint/topic/'+t.id+'\')">'+esc(t.title)+'</button>').join('')+'</div></details>').join(''));
  }
  function listQuestions(filter) {
    const qs=questions.filter(q=>filter==='wrong'?ctx.isWrongNow(q.id):filter==='star'?ctx.flag(q.id,'star'):filter==='undone'?!ctx.isDone(q.id):true);
    frame('<div class="hero"><h1>背诵手册 · 习题190</h1><p>原书实际收录46道单选、147道多选，共193题，保留原编号。</p></div><div class="acts">'+[['all','全部'],['wrong','错题'],['star','收藏'],['undone','未做']].map(([k,v])=>'<button class="btn '+(filter===k?'main':'')+'" onclick="ZS_GO(\'sprint/questions/'+k+'\')">'+v+'</button>').join('')+'</div>'+qs.map(q=>'<button class="card pad m-qrow" onclick="ZS_GO(\'q/'+q.id+'\')"><b>'+q.section+' '+q.no+'</b><span>'+esc(q.stem.slice(0,90))+'</span><small>'+badge(q)+'</small></button>').join('')+(qs.length?'':'<div class="empty">这里还没有题目。</div>'));
  }
  function library(points) {
    const ps=data.pages.filter(p=>!points||p.tags.length);
    frame('<div class="hero"><h1>'+(points?'点拨、命题分析与干扰项':'背诵手册全文搜索')+'</h1><p>搜索手册原文，结果定位到原页。</p></div><div class="m-toolbar"><button class="btn" onclick="ZS_GO(\'sprint\')">专题目录</button><input id="mSearch" type="search" placeholder="输入词语，搜索本书原文"><select id="mVolume"><option value="">上下册</option><option value="upper">上册</option><option value="lower">下册</option></select></div><div id="mResults"></div>');
    const update=()=>{
      const query=document.getElementById('mSearch').value.trim(),vol=document.getElementById('mVolume').value;
      const found=ps.filter(p=>(!vol||p.vol===vol)&&(!query||p.text.includes(query)));
      document.getElementById('mResults').innerHTML='<div class="tiny muted">'+found.length+'页</div>'+found.map(p=>{
        const pos=query?p.text.indexOf(query):0; const snippet=p.text.slice(Math.max(0,pos-35),Math.max(0,pos-35)+160);
        const t=data.topics.find(t=>t.pages.includes(p.id));
        return '<button class="card pad m-qrow" onclick="ZS_GO(\'sprint/page/'+p.id+'\')"><b>'+esc(label(p))+'</b><small>'+esc(t?t.module+' · '+t.title:'')+'</small><span>'+esc(snippet)+'</span><small>'+esc(p.tags.join(' · '))+'</small></button>';
      }).join('');
    };document.getElementById('mSearch').oninput=update;document.getElementById('mVolume').onchange=update;update();
  }
  function reader(id,ids,title,topic) {
    const p=byPage[id]; if(!p) return frame('<div class="empty">页面不存在</div>');
    if(!ids.includes(id)) ids=[id].concat(ids);
    const i=ids.indexOf(id), route=n=>topic?'sprint/topic/'+topic+'/'+n:'sprint/page/'+n;
    frame('<div class="m-toolbar" id="manualBar"><div class="acts"><button class="btn" onclick="ZS_GO(\'sprint\')">目录</button><button class="btn" onclick="ZS_GO(\'sprint/book\')">搜索</button><button class="btn" id="mCollapse">收回工具栏</button></div><div id="mTools"><b>'+esc(title)+'</b><div class="acts"><button class="btn" '+(i<=0?'disabled':'')+' onclick="ZS_GO(\''+route(ids[Math.max(0,i-1)])+'\')">上一页</button><span>'+esc(label(p))+' · '+(i+1)+'/'+ids.length+'</span><button class="btn" '+(i>=ids.length-1?'disabled':'')+' onclick="ZS_GO(\''+route(ids[Math.min(ids.length-1,i+1)])+'\')">下一页</button></div><div class="acts"><button class="btn main" data-mode="read">背诵 / 阅读</button><button class="btn" data-mode="text">选择文字挖空</button><button class="btn" data-mode="image">截图框选挖空</button><button class="btn" id="mReveal">全部揭晓</button><button class="btn" id="mUndo">撤销挖空</button><button class="btn" id="mClear">清空挖空</button><button class="btn" id="mDefault">恢复默认挖空</button></div><div class="acts"><button class="btn" id="mPen">✍️ 手写标注</button><button class="btn" onclick="ZS_ZOOMSRC(\''+src(id)+'\')">放大原图</button>'+pdf(id)+'</div></div></div><div class="tiny muted" id="mModeHint">点击遮罩揭晓答案；可用上方按钮添加挖空。</div><div class="pgwrap m-sheet" id="manualSheet" data-id="_lec" data-tgt="m-img" data-anno="_lec|m-img-'+id+'" style="aspect-ratio:'+p.width+'/'+p.height+'"><img src="'+src(id)+'" alt="'+esc(label(p))+'" data-label="'+esc(label(p))+'" onload="ZS_ANNOSYNC()"><div id="mWords"></div><div id="mMasks"></div><div id="mDraft" hidden></div></div><details class="card pad"><summary>本页文字（复制用）</summary><div class="txt m-plain">'+esc(p.text)+'</div></details>');
    current=id; mode='read'; revealed.clear(); ZS.beginEdit('edit',key(id),['masks']); drawMasks();
    const bar=document.getElementById('manualBar'),top=document.getElementById('topbar');
    const fit=()=>{if(bar.isConnected)bar.style.top=((top?top.getBoundingClientRect().height:80)+6)+'px';}; fit();
    if(window.ResizeObserver){ro=new ResizeObserver(fit);if(top)ro.observe(top);}
    document.getElementById('mCollapse').onclick=()=>{const t=document.getElementById('mTools');t.hidden=!t.hidden;document.getElementById('mCollapse').textContent=t.hidden?'展开工具栏':'收回工具栏';};
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
    document.getElementById('mReveal').onclick=()=>{const all=masks(id).every(m=>revealed.has(m.id));masks(id).forEach(m=>all?revealed.delete(m.id):revealed.add(m.id));drawMasks();};
    document.getElementById('mUndo').onclick=()=>{const stack=history.get(id)||[];if(stack.length)saveMasks(stack.pop(),false);else ZS.toast('没有可撤销的挖空');};
    document.getElementById('mClear').onclick=()=>saveMasks([]);
    document.getElementById('mDefault').onclick=()=>ZS.confirm('恢复本页默认挖空？自选挖空会被替换。',()=>saveMasks(p.masks));
    document.getElementById('mPen').onclick=()=>{setMode('read');ZS_ANNO('_lec','m-img-'+id);};
    const stamp=generation;
    fetch(BASE[p.vol]+'pages/'+String(p.page).padStart(3,'0')+'.json').then(r=>{if(!r.ok)throw new Error('定位文字加载失败');return r.json();}).then(page=>{
      if(stamp!==generation||current!==id)return;
      const words=[];page.lines.forEach((l,li)=>(l.words||[]).forEach(w=>words.push({t:w.t,b:w.b,line:li})));
      const sheet=document.getElementById('manualSheet');sheet._words=words;
      document.getElementById('mWords').innerHTML=words.map((w,i)=>'<span data-word="'+i+'" style="'+position(w.b,p)+'font-size:'+w.b[3]/p.width*100+'cqw">'+esc(w.t)+'</span>').join('');
    }).catch(e=>{if(stamp===generation)ZS.toast(e.message+'，仍可在截图上框选挖空');});
    bindPointer(id);ANNO.renderScope();
  }
  function position(b,p) {return 'left:'+b[0]/p.width*100+'%;top:'+b[1]/p.height*100+'%;width:'+b[2]/p.width*100+'%;height:'+b[3]/p.height*100+'%;';}
  function setMode(next) {
    if(ANNO.on)ANNO.close();mode=next;
    const sheet=document.getElementById('manualSheet'); if(!sheet)return;
    sheet.dataset.mode=mode; document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('main',b.dataset.mode===mode));
    document.getElementById('mModeHint').textContent=mode==='text'?'按原书位置拖选字词，松开后挖空；文字保留原页排版。':mode==='image'?'在截图上拖动框选要隐藏的区域，松开后挖空。':'点击遮罩揭晓答案；可用上方按钮添加挖空。';
    window.getSelection()?.removeAllRanges();
  }
  function drawMasks() {
    if(!current)return;const p=byPage[current],root=document.getElementById('mMasks');if(!root)return;
    root.innerHTML=masks(current).map(m=>'<button class="m-mask '+(revealed.has(m.id)?'revealed':'')+'" data-mask="'+esc(m.id)+'" aria-label="'+(revealed.has(m.id)?'收起答案':'揭晓挖空答案')+'" style="'+position(m.b,p)+'"></button>').join('');
    root.querySelectorAll('button').forEach(b=>b.onclick=()=>{revealed.has(b.dataset.mask)?revealed.delete(b.dataset.mask):revealed.add(b.dataset.mask);drawMasks();});
    document.getElementById('mReveal').textContent=masks(current).length && masks(current).every(m=>revealed.has(m.id))?'全部隐藏':'全部揭晓';
  }
  function saveMasks(next,remember=true) {
    if(!current)return;const id=current;
    if(remember){const stack=history.get(id)||[];stack.push(JSON.parse(JSON.stringify(masks(id))));if(stack.length>40)stack.shift();history.set(id,stack);}
    const e=ZS.data.edit[key(id)]||{};e.masks=JSON.parse(JSON.stringify(next));e.ts=Date.now();ZS.data.edit[key(id)]=e;ZS.save();revealed.clear();drawMasks();
  }
  function add(b,text='') {saveMasks(masks(current).concat([{id:current+'-custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),b,text}]));}
  function bindPointer(id) {
    const sheet=document.getElementById('manualSheet'),p=byPage[id]; let start=null;
    const coord=e=>{const r=sheet.getBoundingClientRect();return [Math.max(0,Math.min(p.width,(e.clientX-r.left)/r.width*p.width)),Math.max(0,Math.min(p.height,(e.clientY-r.top)/r.height*p.height))];};
    sheet.onpointerdown=e=>{if(mode!=='image'||e.button!==0)return;e.preventDefault();start=coord(e);sheet.setPointerCapture(e.pointerId);};
    sheet.onpointermove=e=>{if(!start)return;const end=coord(e),b=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])];const d=document.getElementById('mDraft');d.hidden=false;d.style.cssText=position(b,p);};
    sheet.onpointercancel=()=>{start=null;document.getElementById('mDraft').hidden=true;};
    sheet.onpointerup=e=>{
      if(mode==='image'&&start){const end=coord(e),b=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])];start=null;document.getElementById('mDraft').hidden=true;if(b[2]>5&&b[3]>5)add(b);return;}
      if(mode==='text')setTimeout(()=>{
        if(current!==id||mode!=='text')return;const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;const range=sel.getRangeAt(0),groups=new Map();
        sheet.querySelectorAll('[data-word]').forEach(el=>{if(range.intersectsNode(el)){const w=sheet._words[+el.dataset.word],g=groups.get(w.line)||[];g.push(w);groups.set(w.line,g);}});
        const next=masks(id).slice();groups.forEach(ws=>{const x=Math.min(...ws.map(w=>w.b[0])),y=Math.min(...ws.map(w=>w.b[1])),r=Math.max(...ws.map(w=>w.b[0]+w.b[2])),b=Math.max(...ws.map(w=>w.b[1]+w.b[3]));next.push({id:id+'-custom-'+Date.now()+'-'+next.length,b:[x,y,r-x,b-y],text:ws.map(w=>w.t).join('')});});
        if(groups.size)saveMasks(next);sel.removeAllRanges();
      },0);
    };
  }
  return {load,render,leave,pageHtml,questionPages,questionPdf,paintQuestion,src,get questions(){return questions;},get data(){return data;}};
})();
