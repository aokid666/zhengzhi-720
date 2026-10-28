/* Supplement missing references only; never replace questions or saved user state. */
window.LECTURE_LINKS=(()=>{
 'use strict';let pending;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function signature(q){let a=[q.module||'',q.stem||'',q.answer||'',q.cloze?.text||''];Object.keys(q.options||{}).sort().forEach(k=>a.push(k+':'+q.options[k]));['left','right'].forEach(s=>(q[s]||[]).forEach(i=>a.push(i.key+':'+i.text)));let h=2166136261;const text=a.join('\x1f');for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619)>>>0;return h.toString(16).padStart(8,'0');}
 async function load(){if(!pending)pending=fetch('data/lecture-links.json?v=128').then(r=>{if(!r.ok)throw Error('补充讲义定位加载失败');return r.json();}).catch(e=>{pending=null;console.warn(e.message);return {items:{}};});return pending;}
 async function apply(qs){const data=await load();for(const q of qs){const row=data.items[q.id];if(!row||row.sig!==signature(q))continue;for(const [kind,field] of [['k','kPages'],['s','sPages'],['m','mRefs']]){if(!row[kind]?.length||q[field]?.length)continue;q[field]=row[kind].map(e=>kind==='m'?e.page:Number(e.page));(q.lectureEvidence||(q.lectureEvidence={}))[kind]=row[kind];}}return qs;}
 function evidence(q,kind){const list=q.lectureEvidence?.[kind];if(!list?.length)return '';return '<details class="lecture-proof"><summary>本题考点对应原文 · '+list.length+' 处</summary>'+list.map(e=>'<blockquote><p>'+esc(e.quote)+'</p><small>'+esc(kind==='m'?'背诵手册 '+e.page:(kind==='k'?'知识清单':'速成班讲义')+' · PDF 第 '+e.page+' 页')+'</small></blockquote>').join('')+'</details>';}
 return {apply,evidence,signature};
})();
