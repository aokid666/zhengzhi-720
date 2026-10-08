/* 背诵手册：原图与定位文字共用原页坐标，专项内容按原书框线限定。 */
window.MANUAL = (() => {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BASE = {upper:'https://aokid666.github.io/zz-manual-upper/',lower:'https://aokid666.github.io/zz-manual-lower/'};
  let data, questions, matches, study, byPage, byBlock, ctx, current, storageKey, viewBox, scope, activeBlock, activePlan='exam', mode='read', ro, generation=0;
  const history = new Map(), revealed = new Set(), listPages = new Map();
  const studyState = {query:'',kind:'',module:'',ids:null};
  const topicState = {query:'',module:'',open:null};
  const bookState = {query:'',volume:''};
  const label = p => '背诵手册 · '+(p.vol==='upper'?'上册':'下册')+' '+(p.bookPage>0?'P'+p.bookPage:'PDF P'+p.page);
  const src = id => { const p=byPage[id]; return BASE[p.vol]+'img/'+String(p.page).padStart(3,'0')+'.'+p.ext; };
  const key = id => '_manual_'+id;
  const inside = (b,box) => b[0]>=box[0]-2 && b[1]>=box[1]-2 && b[0]+b[2]<=box[0]+box[2]+2 && b[1]+b[3]<=box[1]+box[3]+2;
  function masks() {
    if(!current)return [];
    const p=byPage[current],saved=ZS.data.edit[storageKey];
    const custom=activePlan==='custom' && saved && Array.isArray(saved.masks);
    let list=custom?saved.masks:activeBlock?(activeBlock.masksByPage[current]||[]):(p.maskCandidates||p.masks);
    list=list.filter(m=>inside(m.b,viewBox)&&(!scope || (m.b[1]>=scope[0] && m.b[1]+m.b[3]<=scope[1])));
    return custom?list:list.slice(0,{core:1,exam:3,more:6}[activePlan]||3);
  }
  async function load() {
    const result=await Promise.all(['manual-index','manual-questions','manual-matches','manual-study'].map(async n => {
      const r=await fetch('data/'+n+'.json?v=118'); if(!r.ok) throw new Error('背诵手册数据加载失败'); return r.json();
    }));
    [data,questions,matches,study]=result;
    byPage=Object.fromEntries(data.pages.map(p=>[p.id,p]));byBlock=Object.fromEntries(study.blocks.map(b=>[b.id,b]));return questions;
  }
  function leave() {
    generation++;if(ro){ro.disconnect();ro=null;}
    if(storageKey)ZS.endEdit('edit',storageKey);
    current=null;storageKey=null;activeBlock=null;scope=null;mode='read';
  }
  function pdf(id) {
    const p=byPage[id];return '<a class="btn tiny" target="_blank" rel="noopener" href="https://aokid666.github.io/zz-pdf/pdf/'+encodeURIComponent(p.pdf)+'#page='+p.localPdfPage+'&zoom=page-width">打开手册原 PDF</a>';
  }
  // CSS clips the original PNG at native coordinates; no derived images.
  function imageStyle(p,b) {return 'width:'+p.width/b[2]*100+'%;left:'+(-b[0]/b[2]*100)+'%;top:'+(-b[1]/b[3]*100)+'%;';}
  function pageHtml(id, annoId='_lec', area='m-img-'+id) {
    const p=byPage[id];if(!p)return '';
    return '<div class="pgwrap m-source" data-id="'+annoId+'" data-tgt="m-img" data-anno="'+annoId+'|'+area+'"><img loading="lazy" src="'+src(id)+'" alt="'+esc(label(p))+'" data-label="'+esc(label(p))+'" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)"><span class="pgno">'+esc(label(p))+'</span><button class="annobtn" onclick="ZS_ANNO(\''+annoId+'\',\''+area+'\')">✍️</button></div><div class="acts"><button class="btn tiny" onclick="ZS_ZOOMSRC(\''+src(id)+'\')">放大原图</button>'+pdf(id)+'<button class="btn tiny" onclick="ZS_GO(\'sprint/page/'+id+'\')">进入本页挖空背诵</button></div><details><summary>本页文字</summary><div class="txt m-plain">'+esc(p.text)+'</div></details>';
  }
  function blockHtml(block,annoId='_lec') {
    const images=block.refs.map((r,i)=>{
      const p=byPage[r.page],area=annoId==='_lec'?'m-block-'+block.id+'-'+r.page:'a-img-'+i;
      return '<div class="pgwrap m-source m-clip m-evidence" style="height:0;padding-top:'+r.b[3]/r.b[2]*100+'%" data-id="'+annoId+'" data-tgt="'+(annoId==='_lec'?'m-img':'a-img')+'" data-anno="'+annoId+'|'+area+'"><img loading="eager" decoding="async" width="'+p.width+'" height="'+p.height+'" src="'+src(r.page)+'" style="'+imageStyle(p,r.b)+'" alt="'+esc(block.kind+'原文片段 '+(i+1))+'" data-label="'+esc(label(p))+'" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)"><button class="annobtn" onclick="ZS_ANNO(\''+annoId+'\',\''+area+'\')">✍️</button></div>';
    }).join('');
    const originals=block.refs.map(r=>'<div class="m-original-row"><span>'+esc(label(byPage[r.page]))+'</span><div class="acts"><button class="btn tiny" onclick="ZS_ZOOMSRC(\''+src(r.page)+'\')">查看完整原图</button>'+pdf(r.page)+'</div></div>').join('');
    const text=block.refs.map(r=>r.lines.map(l=>l.t).join('\n')).join('\n');
    return '<section class="m-evidence-group"><div class="tiny m-source-label">'+esc(block.kind+' · '+block.refs.map(r=>label(byPage[r.page])).join(' / '))+'</div><div class="m-evidence-stack">'+images+'</div><div class="m-evidence-tools"><div class="acts"><button class="btn tiny" onclick="ZS_GO(\'sprint/block/'+block.id+'/'+block.refs[0].page+'\')">本片段挖空背诵</button></div><details><summary>完整原图与原 PDF'+(block.refs.length>1?' · '+block.refs.length+' 页':'')+'</summary>'+originals+'</details><details><summary>本片段文字</summary><div class="txt m-plain">'+esc(text)+'</div></details></div></section>';
  }
  function questionPages(q,which) {
    if(q.blockId&&byBlock[q.blockId])return blockHtml(byBlock[q.blockId],q.id);
    return ((which==='key'?q.keyRefs:q.qRefs)||[]).map((id,i)=>pageHtml(id,q.id,'a-img-'+i)).join('');
  }
  function questionPdf(q,which) {if(q.blockId&&which==='key')return '';return ((which==='key'?q.keyRefs:q.qRefs)||[]).map(pdf).join('');}
  function paintQuestion(q) {
    const box=document.getElementById('lectM');if(!box)return;
    if(!data){box.innerHTML='<div class="hint">背诵手册加载失败，请刷新重试。</div>';return;}
    if(q.blockId&&byBlock[q.blockId]){box.innerHTML=blockHtml(byBlock[q.blockId]);return;}
    const refs=(['m','p'].includes(q.source)?q.mRefs:(matches[q.id]||[]).map(h=>h.page))||[];
    const ids=Array.from(new Set((q.source==='m'?q.qRefs:[]).concat(refs)));
    box.innerHTML=ids.length?'<div class="tiny muted">'+(refs.length?'相关内容按文字匹配定位，请结合原页核对。':'本题原页如下；没找到对应的理论讲解页。')+'</div>'+ids.map(id=>pageHtml(id)).join(''):'<div class="hint">没找到背诵手册中的相应内容。</div>';
  }
  function badge(q) {
    const p=ctx.P(q.id);return (ctx.isWrongNow(q.id)?'❌ 错题 · ':'')+(ctx.flag(q.id,'star')?'★ 收藏 · ':'')+'已做 '+(p&&p.tries||0)+' 次';
  }
  function frame(html){ctx.showQNav(false);ctx.shell(html);}
  function render(h,c) {
    ctx=c;if(!data){frame('<div class="empty">背诵手册未能加载，请刷新重试。</div>');return;}
    const parts=h.split('/');
    if(parts[1]==='topics')return topicLibrary(parts[2]);
    if(parts[1]==='questions')return listQuestions(parts[2]||'all');
    if(parts[1]==='judgements')return listQuestions(parts[2]||'all',true,parts[3]);
    if(parts[1]==='block'){
      const b=byBlock[parts[2]];return b?reader(parts[3]||b.refs[0].page,b.refs.map(r=>r.page),b.kind+' · '+(b.topic||b.module),null,b):studyLibrary();
    }
    if(parts[1]==='topic'){const t=data.topics.find(t=>t.id===parts[2]);return t?reader(parts[3]||t.pages[0],t.pages,t.title,t.id):home();}
    if(parts[1]==='page')return reader(parts[2]||'u009',data.pages.map(p=>p.id),'背诵手册原页',null);
    if(parts[1]==='points')return studyLibrary();
    if(parts[1]==='book')return library();
    return home();
  }
  function home() {
    const lastId=ZS.data.session&&ZS.data.session.last,last=lastId&&ctx.S.byId[lastId];
    const sprintIds=Array.from(new Set(Object.values(ctx.S.byId).filter(q=>['m','p'].includes(q.source)).map(q=>q.id).concat(Object.keys(ZS.data.progress),Object.keys(ZS.data.flags)))).filter(id=>/^(pr-|ms\d|mj)/.test(id));
    const learned=sprintIds.filter(id=>ctx.isDone(id)).length,wrong=sprintIds.filter(id=>ctx.isWrongNow(id)).length,starred=sprintIds.filter(id=>ctx.flag(id,'star')).length;
    const overview='<div class="sprint-overview"><div><strong>'+learned+'</strong><span>已练习</span></div><div><strong>'+wrong+'</strong><span>冲刺错题</span></div><div><strong>'+starred+'</strong><span>冲刺收藏</span></div></div>';
    const resume=last&&['m','p'].includes(last.source)?'<a class="sprint-resume card" href="#/q/'+lastId+'"><span><small>继续上次学习</small><b>'+esc(last.module+' · '+last.chapter)+'</b></span><span aria-hidden="true">继续 →</span></a>':'';
    const entries=[
      ['sprint/topics','背诵','专题挖空背诵',data.topics.length+' 个专题','按模块选专题，在原图或定位文字上挖空。'],
      ['sprint/practice','练习','选择题与逐题笔记','10 份资料','乘风笔记、连线练习与每日真题，先练再复盘。'],
      ['sprint/questions','真题型练习','背诵手册 · 习题190',questions.length+' 道题','保留原书题号，做完对照解析与三份资料。'],
      ['sprint/points','辨析','点拨与易混考点',study.blocks.length+' 个片段','点拨、命题分析、干扰项，结合原文辨析。']
    ];
    frame('<div class="sprint-page sprint-dashboard"><div class="hero sprint-hero"><span class="sprint-eyebrow">最后一轮 · 系统复习</span><h1>冲刺板块</h1><p>把知识记牢，把易错点练透。</p>'+overview+'</div>'+resume+'<div class="sprint-section-head"><h2>开始学习</h2><span>背诵 · 练习 · 辨析</span></div><div class="sprint-entry-grid">'+entries.map(([route,tag,title,count,desc],i)=>'<a class="card sprint-entry" href="#/'+route+'"><div class="sprint-entry-top"><span class="sprint-kind">'+tag+'</span><span>'+count+'</span></div><span class="sprint-entry-mark" aria-hidden="true">'+['记','练','题','辨'][i]+'</span><h2>'+title+'</h2><p>'+desc+'</p><span class="sprint-entry-action">进入学习 <span aria-hidden="true">↗</span></span></a>').join('')+'</div><div class="sprint-section-head"><h2>快速查找与复习</h2></div><div class="sprint-quick"><a href="#/sprint/judgements"><b>概念辨析判断题</b><span>'+study.questions.length+' 道 · 查漏补缺 →</span></a><a href="#/sprint/book"><b>背诵手册全文搜索</b><span>查词语、找原页 →</span></a></div><p class="sprint-footnote">原图、解析、资料对照和学习记录，随题目与专题一起保留。</p></div>');
  }
  function topicLibrary(moduleIndex) {
    const modules=Array.from(new Set(data.topics.map(t=>t.module)));
    frame('<div class="sprint-page"><a class="sprint-back" href="#/sprint">‹ 冲刺板块</a><div class="hero sprint-hero"><span class="sprint-eyebrow">背诵手册</span><h1>专题挖空背诵</h1><p>'+data.topics.length+' 个专题，按模块展开选择。</p></div><div class="sprint-filter card"><label>查找专题<input id="mTopicSearch" type="search" placeholder="输入专题名称或知识点"></label><label>学习模块<select id="mTopicModule"><option value="">全部模块</option>'+modules.map((m,i)=>'<option value="'+i+'">'+esc(m)+'</option>').join('')+'</select></label></div><div id="mTopicResults"></div><p class="sprint-footnote">推荐挖空保留完整考点和上下文，也可自行选词或在截图上框选。</p></div>');
    const select=document.getElementById('mTopicModule');select.value=moduleIndex!=null&&modules[Number(moduleIndex)]?moduleIndex:topicState.module;document.getElementById('mTopicSearch').value=topicState.query;
    const update=()=>{
      const query=document.getElementById('mTopicSearch').value.trim(),chosen=select.value;
      const changed=query!==topicState.query||chosen!==topicState.module;topicState.query=query;topicState.module=chosen;if(changed)topicState.open=null;
      const groups=modules.map((m,i)=>({module:m,index:i,topics:data.topics.filter(t=>t.module===m&&t.pages.length&&(!query||t.title.includes(query)))})).filter(g=>g.topics.length&&(chosen===''||String(g.index)===chosen));
      document.getElementById('mTopicResults').innerHTML='<div class="sprint-result-count">'+groups.reduce((n,g)=>n+g.topics.length,0)+' 个专题</div>'+groups.map((g,i)=>'<details class="card sprint-topic-group" '+((topicState.open?topicState.open.includes(g.module):query||chosen!==''||i===0)?'open':'')+'><summary><span>'+esc(g.module)+'</span><small>'+g.topics.length+' 个专题</small></summary><div class="m-topics">'+g.topics.map(t=>'<button class="btn" onclick="ZS_GO(\'sprint/topic/'+t.id+'\')"><span>'+esc(t.title)+'</span><small>'+t.pages.length+' 页 <span aria-hidden="true">›</span></small></button>').join('')+'</div></details>').join('')+(groups.length?'':'<div class="empty">没有找到该专题，试试其他关键词。</div>');
      document.querySelectorAll('.sprint-topic-group').forEach(el=>el.ontoggle=()=>{topicState.open=Array.from(document.querySelectorAll('.sprint-topic-group[open] summary>span')).map(s=>s.textContent);});
    };document.getElementById('mTopicSearch').oninput=update;select.onchange=update;update();
  }
  function listQuestions(filter,judge=false,blockId) {
    const pool=judge?study.questions:questions;
    const qs=pool.filter(q=>(!blockId||q.blockId===blockId)&&(filter==='wrong'?ctx.isWrongNow(q.id):filter==='star'?ctx.flag(q.id,'star'):filter==='undone'?!ctx.isDone(q.id):true));
    ctx.S.manualJudgeIds=judge&&blockId?qs.map(q=>q.id):null;
    const route=judge?'sprint/judgements/':'sprint/questions/',stateKey=route+(filter||'all')+'/'+(blockId||'');let page=listPages.get(stateKey)||1;const size=20;
    frame('<div class="sprint-page"><a class="sprint-back" href="#/sprint">‹ 冲刺板块</a><div class="hero sprint-hero"><span class="sprint-eyebrow">背诵手册</span><h1>'+(judge?'概念辨析判断练习':'习题190')+'</h1><p>'+(judge?'根据原书干扰项与辨析练习，提交后核对原文。':'原书实际收录193题，保留原编号；提交后查看解析与资料对照。')+'</p></div><div class="sprint-list-tools">'+[['all','全部'],['wrong','错题'],['star','收藏'],['undone','未做']].map(([k,v])=>'<button class="btn '+(filter===k?'main':'')+'" onclick="ZS_GO(\''+route+k+(blockId?'/'+blockId:'')+'\')">'+v+'</button>').join('')+'<a href="#/sprint/points">点拨与易混考点 →</a></div><div id="mQuestionList"></div></div>');
    const update=()=>{
      page=Math.min(page,Math.max(1,Math.ceil(qs.length/size)));listPages.set(stateKey,page);
      const pages=Math.max(1,Math.ceil(qs.length/size)),start=(page-1)*size,visible=qs.slice(start,start+size);
      document.getElementById('mQuestionList').innerHTML='<div class="sprint-result-count">'+qs.length+' 道练习'+(qs.length?' · 显示 '+(start+1)+'–'+(start+visible.length):'')+'</div>'+visible.map(q=>'<button class="card pad m-qrow" onclick="ZS_GO(\'q/'+q.id+'\')"><b>'+esc(judge?q.chapter:q.module+' · '+q.section+' · 原题 '+q.no)+'</b><span>'+esc(q.stem)+'</span><small>'+badge(q)+'</small></button>').join('')+(qs.length>size?'<div class="sprint-pager"><button class="btn" id="mPrevList" '+(page<=1?'disabled':'')+'>上一页</button><span>'+page+' / '+pages+' 页</span><button class="btn" id="mNextList" '+(page>=pages?'disabled':'')+'>下一页</button></div>':'')+(qs.length?'':'<div class="empty">这里还没有题目。</div>');
      const prev=document.getElementById('mPrevList'),next=document.getElementById('mNextList');if(prev)prev.onclick=()=>{page--;update();document.getElementById('mQuestionList').scrollIntoView({block:'start',behavior:'smooth'});};if(next)next.onclick=()=>{page++;update();document.getElementById('mQuestionList').scrollIntoView({block:'start',behavior:'smooth'});};
    };update();
  }
  function excerpt(b) {
    return b.text.split('\n').filter(t=>!/(命题分析|考查频率|^点拨$)/.test(t)).join('').replace(/^经典干扰项[：:]/,'').slice(0,160);
  }
  function studyLibrary() {
    const modules=Array.from(new Set(study.blocks.map(b=>b.module)));
    frame('<div class="sprint-page"><a class="sprint-back" href="#/sprint">‹ 冲刺板块</a><div class="hero sprint-hero"><span class="sprint-eyebrow">辨析 · 查漏补缺</span><h1>点拨与易混考点</h1><p>点拨、命题分析、干扰项。读原文、练判断，再核对依据。</p><a class="sprint-hero-link" href="#/sprint/judgements">全部判断练习 · '+study.questions.length+' 题 →</a></div><div class="sprint-filter card m-study-filter"><label class="m-filter-query">查找考点<input id="mSearch" type="search" placeholder="搜索知识点或原文"></label><label>内容类型<select id="mKind"><option value="">全部类型</option>'+['点拨','命题分析','干扰项'].map(k=>'<option>'+k+'</option>').join('')+'</select></label><label>学习模块<select id="mModule"><option value="">全部模块</option>'+modules.map(m=>'<option>'+esc(m)+'</option>').join('')+'</select></label></div><div id="mResults" class="m-study-grid"></div></div>');
    document.getElementById('mSearch').value=studyState.query;document.getElementById('mKind').value=studyState.kind;document.getElementById('mModule').value=studyState.module;
    const update=()=>{
      const query=document.getElementById('mSearch').value.trim(),kind=document.getElementById('mKind').value,mod=document.getElementById('mModule').value;
      Object.assign(studyState,{query,kind,module:mod});
      const found=study.blocks.filter(b=>(!kind||b.kind===kind)&&(!mod||b.module===mod)&&(!query||b.text.includes(query)));
      studyState.ids=found.map(b=>b.id);
      document.getElementById('mResults').innerHTML='<div class="sprint-result-count">'+found.length+' 个原文片段</div>'+found.map(b=>'<article class="card pad m-study-card"><span class="sprint-kind">'+esc(b.kind)+'</span><b>'+esc(b.topic||'经典干扰项总结')+'</b><div class="tiny m-source-label">'+esc(b.module+' · '+b.refs.map(r=>label(byPage[r.page])).join(' / '))+'</div><p>'+esc(excerpt(b))+'</p><div class="acts"><button class="btn" onclick="ZS_GO(\'sprint/block/'+b.id+'\')">读原文 / 挖空</button>'+(b.questionIds.length?'<button class="btn main" onclick="ZS_GO(\'sprint/judgements/all/'+b.id+'\')">判断练习 · '+b.questionIds.length+' 题</button>':'')+'</div></article>').join('')+(found.length?'':'<div class="empty">没有找到匹配的片段，试试其他筛选条件。</div>');
    };['mSearch','mKind','mModule'].forEach(id=>document.getElementById(id)[id==='mSearch'?'oninput':'onchange']=update);update();
  }
  function library() {
    frame('<div class="hero sprint-hero"><h1>背诵手册全文搜索</h1><p>搜索手册原文，结果定位到原页。</p></div><div class="m-toolbar"><button class="btn" onclick="ZS_GO(\'sprint\')">专题目录</button><input id="mSearch" type="search" placeholder="输入词语，搜索本书原文"><select id="mVolume"><option value="">上下册</option><option value="upper">上册</option><option value="lower">下册</option></select></div><div id="mResults"></div>');
    document.getElementById('mSearch').value=bookState.query;document.getElementById('mVolume').value=bookState.volume;
    const update=()=>{
      const query=document.getElementById('mSearch').value.trim(),vol=document.getElementById('mVolume').value;
      Object.assign(bookState,{query,volume:vol});
      const found=data.pages.filter(p=>(!vol||p.vol===vol)&&(!query||p.text.includes(query)));
      document.getElementById('mResults').innerHTML='<div class="tiny muted">'+found.length+'页</div>'+found.map(p=>{
        const pos=query?p.text.indexOf(query):0,snippet=p.text.slice(Math.max(0,pos-35),Math.max(0,pos-35)+160),t=data.topics.find(t=>t.pages.includes(p.id));
        return '<button class="card pad m-qrow" onclick="ZS_GO(\'sprint/page/'+p.id+'\')"><b>'+esc(label(p))+'</b><small>'+esc(t?t.module+' · '+t.title:'')+'</small><span>'+esc(snippet)+'</span></button>';
      }).join('');
    };document.getElementById('mSearch').oninput=update;document.getElementById('mVolume').onchange=update;update();fitBar(document.querySelector('.m-toolbar'));
  }
  function fitBar(bar) {
    const top=document.getElementById('topbar'),fit=()=>{if(bar.isConnected)bar.style.top=((top?top.getBoundingClientRect().height:80)+6)+'px';};fit();
    if(window.ResizeObserver){ro=new ResizeObserver(fit);if(top)ro.observe(top);}
  }
  function reader(id,ids,title,topic,block=null) {
    if(!ids.includes(id))id=ids[0];const page=byPage[id];if(!page)return frame('<div class="empty">页面不存在</div>');
    const reference=block?block.refs.find(r=>r.page===id):null,box=reference?reference.b:[0,0,page.width,page.height],area=block?'m-block-'+block.id+'-'+id:'m-img-'+id;
    const i=ids.indexOf(id),route=n=>block?'sprint/block/'+block.id+'/'+n:topic?'sprint/topic/'+topic+'/'+n:'sprint/page/'+n;
    const blockIds=block?(studyState.ids?.includes(block.id)?studyState.ids:study.blocks.map(b=>b.id)):[],blockIndex=block?blockIds.indexOf(block.id):-1;
    const blockNav=block?'<nav class="m-block-nav" aria-label="原文片段切换"><button class="btn" id="mPrevBlock" '+(blockIndex===0?'disabled':'')+'>‹ 上一个片段</button><span><b>'+(blockIndex+1)+' / '+blockIds.length+'</b><small>'+(studyState.ids?.includes(block.id)?'当前筛选结果':'全部片段')+'</small></span><button class="btn main" id="mNextBlock" '+(blockIndex===blockIds.length-1?'disabled':'')+'>下一个片段 ›</button></nav>':'';
    const text=reference?reference.lines.map(l=>l.t).join('\n'):page.text;
    frame('<div class="m-toolbar" id="manualBar"><div class="acts"><button class="btn" onclick="ZS_GO(\''+(block?'sprint/points':'sprint/topics')+'\')">目录</button><button class="btn" onclick="ZS_GO(\'sprint/book\')">搜索</button><button class="btn" id="mCollapse">收回工具栏</button></div>'+blockNav+'<div id="mTools"><b>'+esc(title)+'</b><div class="acts"><button class="btn" '+(i<=0?'disabled':'')+' onclick="ZS_GO(\''+route(ids[Math.max(0,i-1)])+'\')">上一页</button><span>'+esc(label(page))+' · '+(i+1)+'/'+ids.length+'</span><button class="btn" '+(i>=ids.length-1?'disabled':'')+' onclick="ZS_GO(\''+route(ids[Math.min(ids.length-1,i+1)])+'\')">下一页</button></div><div class="acts"><label for="mPlan">挖空方案</label><select id="mPlan"><option value="core">核心 · 1 个必背点</option><option value="exam">考点 · 推荐（最多 3 处）</option><option value="more">加强 · 最多 6 处</option><option value="custom">我的挖空</option></select><button class="btn main" data-mode="read">背诵 / 阅读</button><button class="btn" data-mode="text">选择文字挖空</button><button class="btn" data-mode="image">截图框选挖空</button><button class="btn" id="mReveal">全部揭晓</button><button class="btn" id="mUndo">撤销挖空</button><button class="btn" id="mClear">清空挖空</button><button class="btn" id="mDefault">采用推荐挖空</button></div><div class="acts"><button class="btn" id="mPen">✍️ 手写标注</button><button class="btn" onclick="ZS_ZOOMSRC(\''+src(id)+'\')">放大完整原图</button>'+pdf(id)+(block&&block.questionIds.length?'<button class="btn" onclick="ZS_GO(\'sprint/judgements/all/'+block.id+'\')">本片段判断练习</button>':'')+'</div></div></div><div class="tiny m-mode-hint" id="mModeHint"></div><section class="m-cloze-guide" id="mClozeGuide" aria-live="polite"></section><div class="pgwrap m-sheet '+(block?'m-clip':'')+'" id="manualSheet" data-mode="read" data-id="_lec" data-tgt="m-img" data-anno="_lec|'+area+'" style="aspect-ratio:'+box[2]+'/'+box[3]+'"><img src="'+src(id)+'" '+(block?'style="'+imageStyle(page,box)+'"':'')+' alt="'+esc(block?block.kind+'原文片段':label(page))+'" data-label="'+esc(label(page))+'" onload="ZS_ANNOSYNC()"><div id="mWords"></div><div id="mMasks"></div><div id="mDraft" hidden></div></div><details class="card pad"><summary>'+(block?'本片段':'本页')+'文字（复制用）</summary><div class="txt m-plain">'+esc(text)+'</div></details>');
    if(block){document.getElementById('mPrevBlock').onclick=()=>{if(blockIndex>0)ZS_GO('sprint/block/'+blockIds[blockIndex-1]);};document.getElementById('mNextBlock').onclick=()=>{if(blockIndex<blockIds.length-1)ZS_GO('sprint/block/'+blockIds[blockIndex+1]);};}
    current=id;storageKey=block?key(block.id+'_'+id):key(id);viewBox=box;activeBlock=block;scope=topic?data.topics.find(t=>t.id===topic).regions[id]:null;mode='read';revealed.clear();
    const saved=ZS.data.edit[storageKey];activePlan=saved&&Array.isArray(saved.masks)?'custom':'exam';ZS.beginEdit('edit',storageKey,['masks']);drawMasks();
    fitBar(document.getElementById('manualBar'));
    document.getElementById('mCollapse').onclick=()=>{const t=document.getElementById('mTools');t.hidden=!t.hidden;document.getElementById('mCollapse').textContent=t.hidden?'展开工具栏':'收回工具栏';};
    document.getElementById('mPlan').onchange=e=>{activePlan=e.target.value;revealed.clear();drawMasks();};
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
    document.getElementById('mReveal').onclick=()=>{const all=masks().every(m=>revealed.has(m.id));masks().forEach(m=>all?revealed.delete(m.id):revealed.add(m.id));drawMasks();};
    document.getElementById('mUndo').onclick=()=>{const stack=history.get(storageKey)||[];if(stack.length)saveMasks(stack.pop(),false);else ZS.toast('没有可撤销的挖空');};
    document.getElementById('mClear').onclick=()=>saveMasks([]);
    document.getElementById('mDefault').onclick=()=>ZS.confirm('采用当前片段的推荐考点挖空？此处自选挖空会被替换。',()=>{activePlan='exam';saveMasks(masks());});
    document.getElementById('mPen').onclick=()=>{setMode('read');ZS_ANNO('_lec',area);};
    const stamp=generation;
    fetch(BASE[page.vol]+'pages/'+String(page.page).padStart(3,'0')+'.json').then(r=>{if(!r.ok)throw new Error('定位文字加载失败');return r.json();}).then(raw=>{
      if(stamp!==generation||current!==id)return;
      const words=[];raw.lines.forEach((l,li)=>(l.words||[]).forEach(w=>{if(inside(w.b,box))words.push({t:w.t,b:w.b,line:li});}));
      const sheet=document.getElementById('manualSheet');sheet._words=words;
      document.getElementById('mWords').innerHTML=words.map((w,i)=>'<span data-word="'+i+'" style="'+position(w.b)+'font-size:'+w.b[3]/box[2]*100+'cqw">'+esc(w.t)+'</span>').join('');
    }).catch(e=>{if(stamp===generation)ZS.toast(e.message+'，仍可在截图上框选挖空');});
    bindPointer(id);ANNO.renderScope();
  }
  function position(b){return 'left:'+(b[0]-viewBox[0])/viewBox[2]*100+'%;top:'+(b[1]-viewBox[1])/viewBox[3]*100+'%;width:'+b[2]/viewBox[2]*100+'%;height:'+b[3]/viewBox[3]*100+'%;';}
  function modeHint() {
    const el=document.getElementById('mModeHint');if(!el)return;
    if(mode==='text'){el.textContent='按原书位置拖选完整字词，松开后挖空；排版保留原页位置。';return;}
    if(mode==='image'){el.textContent='在截图上框选要隐藏的区域，松开后挖空。';return;}
    const list=masks(),tested=list.filter(m=>m.questionIds&&m.questionIds.length).length;
    el.textContent=(list.length?'当前 '+list.length+' 处挖空'+(activePlan!=='custom'?'；'+tested+' 处题库同源，其余只保留易偷换的限定、条件和对应关系':'')+'。先看考法提示回忆，再点提示或遮罩揭晓。':'当前片段没有足够可靠的自动挖空；宁可留空，也不拿普通正文凑数。你仍可手动选择完整考点。');
  }
  function setMode(next) {
    if(ANNO.on)ANNO.close();mode=next;const sheet=document.getElementById('manualSheet');if(!sheet)return;
    sheet.dataset.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('main',b.dataset.mode===mode));modeHint();window.getSelection()?.removeAllRanges();
  }
  function drawMasks() {
    if(!current)return;const root=document.getElementById('mMasks');if(!root)return;const list=masks();
    root.innerHTML=list.map(m=>'<button class="m-mask '+(revealed.has(m.id)?'revealed':'')+'" data-mask="'+esc(m.id)+'" aria-label="'+esc(revealed.has(m.id)?'收起答案：'+(m.text||'框选内容'):'揭晓挖空答案')+'" style="'+position(m.b)+'"></button>').join('');
    const toggle=id=>{revealed.has(id)?revealed.delete(id):revealed.add(id);drawMasks();};
    root.querySelectorAll('button').forEach(b=>b.onclick=()=>toggle(b.dataset.mask));
    const guide=document.getElementById('mClozeGuide');
    if(guide){
      guide.innerHTML=list.length?'<div class="m-guide-head"><b>本页怎么考</b><small>提示保留上下文，不直接泄露答案</small></div><div class="m-cue-list">'+list.map((m,i)=>{const open=revealed.has(m.id),prompt=m.examPrompt?(m.examPrompt.split('｜').slice(1).join('｜')||m.examPrompt):'按原图上下文回忆这一处';const tag=m.examTag||'我的挖空',linked=m.questionCount||((m.questionIds||[]).length);return '<button class="m-cue '+(open?'revealed':'')+'" data-mask="'+esc(m.id)+'"><span class="m-cue-top"><i>'+(i+1)+'</i><b>'+esc(tag)+'</b>'+(linked?'<small>题库同源 '+linked+' 题</small>':'')+'</span><span class="m-cue-prompt">'+esc(prompt)+'</span><span class="m-cue-answer">'+(open?'答案：'+esc(m.text||'已框选区域'):'先回忆，再点此揭晓')+'</span></button>';}).join('')+'</div>':'';
      guide.querySelectorAll('[data-mask]').forEach(b=>b.onclick=()=>toggle(b.dataset.mask));
    }
    document.getElementById('mReveal').textContent=list.length&&list.every(m=>revealed.has(m.id))?'全部隐藏':'全部揭晓';document.getElementById('mPlan').value=activePlan;modeHint();
  }
  function saveMasks(next,remember=true) {
    if(!current)return;const old=masks();
    if(remember){const stack=history.get(storageKey)||[];stack.push(JSON.parse(JSON.stringify(old)));if(stack.length>40)stack.shift();history.set(storageKey,stack);}
    const e=ZS.data.edit[storageKey]||{},outside=Array.isArray(e.masks)?e.masks.filter(m=>!inside(m.b,viewBox)||(scope&&(m.b[1]<scope[0]||m.b[1]+m.b[3]>scope[1]))):[];
    e.masks=JSON.parse(JSON.stringify(outside.concat(next)));e.ts=Date.now();ZS.data.edit[storageKey]=e;activePlan='custom';ZS.save();revealed.clear();drawMasks();
  }
  function add(b,text=''){saveMasks(masks().concat([{id:current+'-custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),b,text}]));}
  function bindPointer(id) {
    const sheet=document.getElementById('manualSheet');let start=null;
    const coord=e=>{const r=sheet.getBoundingClientRect();return [viewBox[0]+Math.max(0,Math.min(viewBox[2],(e.clientX-r.left)/r.width*viewBox[2])),viewBox[1]+Math.max(0,Math.min(viewBox[3],(e.clientY-r.top)/r.height*viewBox[3]))];};
    sheet.onpointerdown=e=>{if(mode!=='image'||e.button!==0)return;e.preventDefault();start=coord(e);sheet.setPointerCapture(e.pointerId);};
    sheet.onpointermove=e=>{if(!start)return;const end=coord(e),b=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])],d=document.getElementById('mDraft');d.hidden=false;d.style.cssText=position(b);};
    sheet.onpointercancel=()=>{start=null;document.getElementById('mDraft').hidden=true;};
    sheet.onpointerup=e=>{
      if(mode==='image'&&start){const end=coord(e),b=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])];start=null;document.getElementById('mDraft').hidden=true;if(b[2]>5&&b[3]>5)add(b);return;}
      if(mode==='text')setTimeout(()=>{
        if(current!==id||mode!=='text')return;const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;const range=sel.getRangeAt(0),groups=new Map();
        sheet.querySelectorAll('[data-word]').forEach(el=>{if(range.intersectsNode(el)){const w=sheet._words[+el.dataset.word],g=groups.get(w.line)||[];g.push(w);groups.set(w.line,g);}});
        const next=masks().slice();groups.forEach(ws=>{const x=Math.min(...ws.map(w=>w.b[0])),y=Math.min(...ws.map(w=>w.b[1])),r=Math.max(...ws.map(w=>w.b[0]+w.b[2])),b=Math.max(...ws.map(w=>w.b[1]+w.b[3]));next.push({id:id+'-custom-'+Date.now()+'-'+next.length,b:[x,y,r-x,b-y],text:ws.map(w=>w.t).join('')});});
        if(groups.size)saveMasks(next);sel.removeAllRanges();
      },0);
    };
  }
  return {load,render,leave,pageHtml,questionPages,questionPdf,paintQuestion,src,get questions(){return questions;},get judgements(){return study?study.questions:[];},get study(){return study;},get data(){return data;}};
})();
