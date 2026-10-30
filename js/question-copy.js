/* Copy one question for consultation without changing answers or learning records. */
window.QUESTION_COPY=(()=>{
 'use strict';
 const analysisText=q=>(q.analysis||[]).map(a=>(a.k?'【'+a.k+'】\n':'')+(a.t||'')).filter(Boolean).join('\n\n');
 function text(q,context={}){
  const lines=[];if(context.bookTitle)lines.push('题库：'+context.bookTitle);
  const where=[q.subject||q.module,q.chapter,'原题 '+(q.originalNo||q.no||'')].filter(Boolean).join(' · ');if(where)lines.push(where);
  lines.push('','题目：',q.stem||'');
  if(q.type==='matching'){
   lines.push('','左侧：',...(q.left||[]).map(i=>i.key+'. '+i.text),'','右侧：',...(q.right||[]).map(i=>i.key+'. '+i.text),'','正确对应：');
   const right=Object.fromEntries((q.right||[]).map(i=>[i.key,i.text]));
   for(const i of q.left||[])lines.push(i.key+' → '+(q.matchMap?.[i.key]||[]).map(k=>k+'. '+right[k]).join('；'));
  }else if(q.type==='cloze'&&q.cloze){
   const maskAt=new Map(),seen=new Set();(q.cloze.masks||[]).forEach((m,n)=>(m.indices||[]).forEach(i=>maskAt.set(i,n+1)));
   const source=Array.from(q.cloze.text||'').map((ch,i)=>{const n=maskAt.get(i);if(!n)return ch;if(seen.has(n))return '';seen.add(n);return '【第'+n+'空】';}).join('');
   lines.push('',source,'','正确答案：',...(q.cloze.masks||[]).map((m,i)=>(i+1)+'. '+m.text));
  }else{
   const options=Object.keys(q.options||{}).sort();if(options.length)lines.push('','选项：',...options.map(k=>k+'. '+q.options[k]));
   const keys=Array.from(q.answer||'');lines.push('',keys.length?'正确答案：'+keys.map(k=>q.options?.[k]?k+'. '+q.options[k]:k).join('；'):'参考答案：请结合下方解析或原文核对（本题采用自评）。');
  }
  lines.push('','解析：',context.analysis||analysisText(q)||'暂无解析文字，请结合原页截图核对。');
  if(q.sourceWarning)lines.push('','原题说明：'+q.sourceWarning);
  return lines.join('\n').trim();
 }
 async function copy(value){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true;}}catch(e){}
  const active=document.activeElement,box=document.createElement('textarea');box.value=value;box.setAttribute('readonly','');box.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';document.body.appendChild(box);
  let copied=false;try{box.focus({preventScroll:true});box.select();box.setSelectionRange(0,value.length);copied=!!document.execCommand?.('copy');}catch(e){}finally{box.remove();active?.focus?.({preventScroll:true});}
  if(copied)return true;
  const modal=document.getElementById('modal');if(modal){const panel=document.createElement('div');panel.className='box';const title=document.createElement('h3');title.textContent='题目内容（可全选复制）';const input=document.createElement('textarea');input.value=value;input.readOnly=true;input.rows=12;input.style.cssText='width:100%;min-height:240px;';const close=document.createElement('button');close.className='btn';close.textContent='关闭';close.onclick=()=>modal.classList.remove('show');panel.append(title,input,close);modal.replaceChildren(panel);modal.classList.add('show');input.focus();input.select();input.setSelectionRange(0,value.length);}
  return false;
 }
 function mount(q){
  const host=document.querySelector('#view .qbody')||document.querySelector('#view .hat-header .pad');if(!host)return;
  document.getElementById('copyQuestion')?.remove();const row=document.createElement('div');row.className='acts';const button=document.createElement('button');button.id='copyQuestion';button.className='btn tiny';button.textContent='一键复制';button.title='复制题目、选项、正确答案和解析';button.onclick=async()=>{
   const context={bookTitle:window.PRACTICE?.index?.books.find(b=>b.id===q.bookId)?.title};
   const edited=window.ZS?.data?.edit?.[q.id]?.a;if(edited!=null){const template=document.createElement('template');template.innerHTML=String(edited).replace(/<br\s*\/?>|<\/(?:p|div|h[1-6])>/gi,'\n');context.analysis=template.content.textContent;}
   const ok=await copy(text(q,context));window.ZS?.toast(ok?'已复制题目、正确答案和解析':'请在弹出的内容中全选复制');
  };row.append(button);host.prepend(row);
 }
 return {text,copy,mount};
})();
