/* Supplement missing references only; never replace questions or saved user state. */
window.LECTURE_LINKS=(()=>{
 'use strict';const pending=new Map();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function signature(q){let a=[q.module||'',q.stem||'',q.answer||'',q.cloze?.text||''];Object.keys(q.options||{}).sort().forEach(k=>a.push(k+':'+q.options[k]));['left','right'].forEach(s=>(q[s]||[]).forEach(i=>a.push(i.key+':'+i.text)));(q.analysis||[]).forEach(i=>a.push('analysis:'+(i.k||'')+'='+(i.t||'')));Object.keys(q.matchMap||{}).sort().forEach(k=>a.push('map:'+k+'='+q.matchMap[k].join(',')));let h=2166136261;const text=a.join('\x1f');for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');}
 const group=q=>q.bookId||(q.source==='m'?'manual':'original');
 async function load(key){if(!pending.has(key))pending.set(key,fetch('data/lecture-links/'+encodeURIComponent(key)+'.json?v=143').then(r=>{if(!r.ok)throw Error('补充讲义定位加载失败');return r.json();}).catch(e=>{pending.delete(key);console.warn(e.message);return {items:{},loadFailed:true};}));return pending.get(key);}
 async function apply(qs){
  const entries=await Promise.all([...new Set(qs.map(group))].map(async key=>[key,await load(key)])),data=Object.fromEntries(entries);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const q of qs){
   q._lectureLinkError=!!data[group(q)].loadFailed;
   const row=data[group(q)].items[q.id];if(!row||row.sig!==signature(q))continue;
   for(const [kind,field] of [['k','kPages'],['s','sPages'],['m','mRefs']]){
    const cleared=row.clear?.[kind];
    if(cleared){
     if(same(q[field]||[],cleared.expected)||!(q[field]||[]).length){
      q[field]=[];
      if(q.lectureEvidence)delete q.lectureEvidence[kind];
      (q.lectureCorrections||(q.lectureCorrections={}))[kind]=cleared.reason;
     }
     continue;
    }
    if(!row[kind]?.length)continue;
    const pages=row[kind].map(e=>kind==='m'?e.page:Number(e.page)),current=q[field]||[],original=row.extend?.[kind];
    if(Array.isArray(original)){
     // Add only to the reviewed original list; a second application stays stable.
     const combined=[...new Set([...original,...pages])];
     if(!same(current,original)&&!same(current,combined))continue;
     q[field]=combined;
    }else{
     const expected=row.replace?.[kind];
     if(expected?!same(current,expected):current.length)continue;
     q[field]=pages;
    }
    (q.lectureEvidence||(q.lectureEvidence={}))[kind]=row[kind];
   }
  }
  await window.EXTRA_LECTURES?.apply(qs);return qs;
 }

 function pageLabel(e,kind){if(kind!=='m')return (kind==='k'?'知识清单':'速成班讲义')+' · PDF 第 '+e.page+' 页';const p=window.MANUAL?.data?.pages?.find(p=>p.id===e.page);return '背诵手册 · '+(e.page[0]==='u'?'上册':'下册')+' '+(p?.bookPage>0?'P'+p.bookPage:'PDF 第 '+Number(e.page.slice(1))+' 页');}
 function evidence(q,kind){const list=q.lectureEvidence?.[kind];if(!list?.length)return '';return '<details class="lecture-proof"><summary>本题考点对应原文 · '+list.length+' 处'+(list.some(e=>e.partial)?' · 部分选项依据':'')+'</summary>'+list.map(e=>'<blockquote>'+(e.note?'<p class="lecture-proof-note">'+esc(e.note)+'</p>':'')+'<p>'+esc(e.quote)+'</p><small>'+esc(pageLabel(e,kind))+'</small></blockquote>').join('')+'</details>';}
 function query(q){
  const values=Array.from(q.answer||'').map(k=>q.options?.[k]||'').filter(Boolean);let value=values[0]||q.cloze?.masks?.[0]?.text||q.left?.[0]?.text||q.stem||'';
  if(/^[①-⑳、，,；;和与及 ]+$/.test(value)){const label=value.match(/[①-⑳]/)?.[0],start=(q.stem||'').indexOf(label);if(start>=0)value=(q.stem||'').slice(start+1).split(/[①-⑳]/)[0];}
  const title=value.match(/《([^》]+)》/);if(title)return title[1];value=value.split(/——|\n|【/)[0].replace(/^[“”"' ]+|[“”"'。； ]+$/g,'').replace(/^(必须)?坚持/,'');
  if(value.length<=16)return value;
  for(const term of ['社会主义核心价值观','新民主主义革命','马克思主义中国化','社会主要矛盾','主观能动性','资本价值构成','感性认识','理性认识','物质运动','劳动生产率','共同富裕','中国式现代化','实践','矛盾','真理','价值'])if(value.includes(term))return term;
  return value.slice(0,16);
 }
 function missing(q,label,extra=false){const failed=extra?q._extraLectureError:q._lectureLinkError,kind={'知识清单':'k','速成班讲义':'s','背诵手册':'m','腿姐背诵手册':'tj','史纲专题资料':'history'}[label];return '<div class="hint">'+(failed?esc(label)+'定位数据加载失败，请重试。<button class="btn tiny" data-q="'+esc(q.id)+'" onclick="ZS_RETRYLECTURES(this.dataset.q)">重新加载</button>':(q.lectureCorrections?.[kind]?esc(q.lectureCorrections[kind])+' ':'')+'尚未自动确认'+esc(label)+'的对应页。可按本题考点检索整本资料。'+(kind?'<div class="acts"><button class="btn tiny" data-q="'+esc(q.id)+'" data-kind="'+kind+'" onclick="ZS_FINDQLECTURE(this.dataset.q,this.dataset.kind)">在这份讲义中查找本题考点</button></div>':''))+'</div>';}
 return {apply,evidence,signature,missing,query};
})();
