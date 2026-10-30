/* 做题 / 整本讲义双栏。讲义使用独立浏览上下文，滚动、目录和搜索互不影响。 */
window.ZS_SPLIT = (() => {
  'use strict';
  if (window.ZS_READER_MODE) return null;
  const KEY='zz720.splitPrefs', names={k:'知识清单',s:'速成班讲义',m:'肖秀荣背诵手册',tj:'腿姐背诵手册'};
  let prefs={side:'right',kind:'k',ratio:50};
  try {const p=JSON.parse(localStorage.getItem(KEY)||'{}');if(['left','right'].includes(p.side))prefs.side=p.side;if(names[p.kind])prefs.kind=p.kind;if(Number.isFinite(p.ratio))prefs.ratio=p.ratio;} catch(e){}
  let ctx,question,opened=false,kind=prefs.kind,frame,ready=false,loadTimer,resizeObserver,request=0,drag=null,allowUnmatched=false;
  const $=id=>document.getElementById(id), view=()=>$('view');
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}};
  const limits=()=>{const min=Math.min(40,Math.max(20,220/window.innerWidth*100));return [min,100-min];};
  function ratio(value,remember=false){const [min,max]=limits();prefs.ratio=Math.max(min,Math.min(max,Number(value)||50));document.documentElement.style.setProperty('--study-ratio',prefs.ratio+'%');const bar=$('studyDivider');if(bar){bar.setAttribute('aria-valuenow',String(Math.round(prefs.ratio)));bar.setAttribute('aria-valuemin',String(Math.ceil(min)));bar.setAttribute('aria-valuemax',String(Math.floor(max)));}if(remember)save();}
  function layout(){const top=$('topbar'),bottom=$('tabbar'),nav=$('qnav');document.documentElement.style.setProperty('--study-qnav-height',((nav?nav.getBoundingClientRect().height:48)+16)+'px');document.documentElement.style.setProperty('--study-top',(top?top.getBoundingClientRect().bottom:0)+'px');document.documentElement.style.setProperty('--study-bottom',(bottom?bottom.getBoundingClientRect().height:64)+'px');ratio(prefs.ratio);if(opened)ctx.reflow();}
  function init(context){if(ctx)return;ctx=context;
    const button=document.createElement('button');button.id='studySplitToggle';button.className='study-split-toggle';button.hidden=true;button.type='button';button.setAttribute('aria-controls','studyReader');button.onclick=toggle;document.body.appendChild(button);
    const pane=document.createElement('aside');pane.id='studyReader';pane.hidden=true;pane.setAttribute('aria-label','整本讲义分屏');pane.innerHTML='<div class="study-reader-head"><label class="study-reader-title" for="studyReaderKind">对照讲义</label><select id="studyReaderKind" aria-label="选择分屏讲义">'+Object.entries(names).map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select><button class="btn tiny" id="studyLocate" title="跳回本题对应页">定位本题</button><button class="iconbtn" id="studyClose" title="关闭分屏" aria-label="关闭分屏">×</button></div><div id="studyReaderStatus" class="study-reader-status" role="status"></div><div id="studyReaderContent"></div>';document.body.appendChild(pane);
    $('studyReaderKind').onchange=e=>{kind=e.target.value;locate();};$('studyLocate').onclick=()=>locate();$('studyClose').onclick=()=>close();
    const bar=document.createElement('div');bar.id='studyDivider';bar.hidden=true;bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-label','调整左右区域宽度');bar.setAttribute('aria-orientation','vertical');bar.setAttribute('aria-controls','view studyReader');bar.title='拖动调整宽度，双击恢复对半；方向键微调';bar.innerHTML='<span></span>';document.body.appendChild(bar);
    bar.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();ctx.beforeLayout();drag=e.pointerId;bar.setPointerCapture(e.pointerId);document.body.classList.add('study-resizing');};
    bar.onpointermove=e=>{if(drag!==e.pointerId)return;ratio(e.clientX/window.innerWidth*100);};
    const end=e=>{if(drag===null||e.pointerId!==drag)return;drag=null;document.body.classList.remove('study-resizing');save();ctx.reflow();};bar.onpointerup=end;bar.onpointercancel=end;bar.onlostpointercapture=end;
    bar.ondblclick=()=>{ratio(50,true);ctx.reflow();};bar.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();ratio(e.key==='Home'?50:prefs.ratio+(e.key==='ArrowLeft'?-2:2),true);ctx.reflow();};
    window.addEventListener('resize',layout);window.visualViewport?.addEventListener('resize',layout);
    if(window.ResizeObserver){resizeObserver=new ResizeObserver(layout);['topbar','tabbar','qnav'].forEach(id=>{if($(id))resizeObserver.observe($(id));});}
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flushReader();});layout();updateButton();
  }
  function updateButton(){const b=$('studySplitToggle');if(!b)return;b.dataset.side=prefs.side;b.hidden=!question;b.setAttribute('aria-expanded',String(opened));b.setAttribute('aria-label',opened?'收起讲义分屏':'打开讲义分屏');b.title=opened?'收起讲义分屏':'分屏浏览'+names[prefs.kind];b.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M10 3v14"/></svg><span>'+(opened?'收起':'分屏')+'</span>';b.classList.toggle('on',opened);}
  function update(q){const changed=question?.id!==q?.id;question=q||null;if(!question&&opened)close();updateButton();if(opened&&changed)locate();}
  function status(text,missing=false){const box=$('studyReaderStatus');box.textContent=text;box.classList.toggle('missing',missing);}
  function flushReader(){try{const w=frame?.contentWindow;w?.ANNO?.flush();return w?.ZS?.flushLocal()||Promise.resolve();}catch(e){return Promise.resolve();}}
  function createFrame(target){const previous=frame;ready=false;const f=document.createElement('iframe');frame=f;f.title='整本'+names[kind];f.id='studyReaderFrame';const url=new URL(location.href);url.search='?n=141&reader=1';url.hash=kind==='tj'?'/extra/'+(target===1?'tuijie-manual-upper/1':target):'/lect/'+kind+'/'+target;f.src=url.href;$('studyReaderContent').replaceChildren(f);
    if(previous)previous.remove();clearTimeout(loadTimer);loadTimer=setTimeout(()=>{if(frame===f&&!ready)status('讲义加载较慢，请检查网络，或点击“定位本题”重试。',true);},20000);
    f.addEventListener('load',()=>{try{if(f===frame&&f.contentWindow.ZS_READERGO)readerReady();}catch(e){status('讲义未能加载，请点击“定位本题”重试。',true);}});
  }
  async function locate(fromStart=false){const token=++request;if(!opened||!question)return;const q=question,selected=kind;$('studyReaderKind').value=kind;status('正在定位'+names[kind]+'…');
    const target=ctx.target(q,kind);const found=target!==null&&target!==undefined;allowUnmatched=!found&&fromStart;
    await flushReader();if(token!==request||!opened||question!==q||selected!==kind)return;
    if(!found&&!fromStart){if(frame){frame.hidden=true;}status('本题没找到'+names[kind]+'对应页。');const b=document.createElement('button');b.className='btn tiny';b.textContent='从开头浏览';b.onclick=()=>locate(true);$('studyReaderStatus').appendChild(b);return;}
    const page=found?target:1;
    if(frame&&ready&&typeof frame.contentWindow.ZS_READERGO==='function'){frame.hidden=false;frame.title='整本'+names[kind];frame.contentWindow.ZS_READERGO(kind,page);status(found?'已定位本题对应页 · 两侧可独立滚动':'从开头浏览 · 本题暂无匹配页');}
    else{status('正在加载'+names[kind]+'…');createFrame(page);}
  }
  function readerReady(){if(!opened||!frame||typeof frame.contentWindow.ZS_READERGO!=='function')return;ready=true;clearTimeout(loadTimer);const target=ctx.target(question,kind);if(target===null||target===undefined){frame.hidden=!allowUnmatched;if(allowUnmatched)status('从开头浏览 · 本题暂无匹配页');return;}frame.hidden=false;frame.contentWindow.ZS_READERGO(kind,target);status('已定位本题对应页 · 两侧可独立滚动');}
  function toggle(){if(opened)return close();if(!ctx||!question)return;const y=window.scrollY;ctx.beforeLayout();opened=true;kind=prefs.kind;document.body.classList.add('study-split');$('studyReader').hidden=false;$('studyDivider').hidden=false;layout();view().scrollTop=y;updateButton();locate();requestAnimationFrame(()=>ctx.reflow());}
  function close(){if(!opened)return;const y=view().scrollTop;ctx.beforeLayout();opened=false;request++;clearTimeout(loadTimer);document.body.classList.remove('study-split','study-resizing');drag=null;$('studyReader').hidden=true;$('studyDivider').hidden=true;window.scrollTo(0,y);updateButton();const old=frame;flushReader().finally(()=>{if(!opened&&frame===old){old?.remove();frame=null;ready=false;}});ctx.reflow();}
  function setPreference(key,value){if(key==='side'&&['left','right'].includes(value))prefs.side=value;else if(key==='kind'&&names[value])prefs.kind=value;else return;save();updateButton();document.querySelectorAll('[data-split-pref="'+key+'"]').forEach(b=>{const on=b.dataset.value===value;b.classList.toggle('main',on);b.setAttribute('aria-pressed',String(on));});}
  function settingsHtml(){return '<div class="sec-title">讲义分屏</div><div class="card pad study-preferences"><p>做题时点侧边“分屏”，左侧做题，右侧浏览整本讲义。拖动中间竖杠调整宽度，双击恢复对半。</p>'+[['side','侧边按钮位置',{left:'左侧边',right:'右侧边'}],['kind','默认打开的讲义',names]].map(([key,label,choices])=>'<div class="study-preference"><span>'+label+'</span><div class="acts">'+Object.entries(choices).map(([v,n])=>'<button class="btn tiny'+(prefs[key]===v?' main':'')+'" data-split-pref="'+key+'" data-value="'+v+'" aria-pressed="'+(prefs[key]===v)+'" onclick="ZS_SPLIT.setPreference(\''+key+'\',\''+v+'\')">'+n+'</button>').join('')+'</div></div>').join('')+'</div>';}
  function theme(){try{frame?.contentWindow.ZS_READER_THEME?.();}catch(e){}}
  return {init,update,toggle,close,readerReady,setPreference,settingsHtml,theme,get active(){return opened;},scrollY:()=>opened?view().scrollTop:window.scrollY,scrollTo:y=>{if(opened)view().scrollTop=y;else window.scrollTo(0,y);}};
})();
