/* Vertical practice uses the same question IDs, drafts and progress as single-question practice. */
window.ZS_PAPER = (() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const button = (label, action, primary = false) =>
    '<button type="button" class="btn'+(primary ? ' main' : '')+'" data-action="'+action+'">'+label+'</button>';
  const assessment = () => button('自评：已掌握','mastered',true)+button('自评：仍需复习','review');
  const explanation = html => html ? '<details class="paper-explanation"><summary>查看文字解析</summary>'+html+'</details>' : '';

  function choice(card, q, c, state) {
    const {p, answered, revealed} = state;
    const saved = answered ? c.savedSelection(q.id,p) || [] : c.S['sel_'+q.id] || [];
    const options = Object.entries(q.options).sort(([a],[b]) => a.localeCompare(b));
    card.innerHTML = '<div class="paper-options">'+options.map(([key,value]) => {
      const selected = saved.includes(key);
      const style = revealed ? (q.answer.includes(key) ? ' right' : selected ? ' wrong' : '') : selected ? ' sel' : '';
      return '<button type="button" class="opt'+style+'" data-option="'+escape(key)+'" aria-pressed="'+selected+'"'+(revealed ? ' disabled' : '')+'><span class="k">'+escape(key)+'</span><span class="v">'+escape(value)+'</span></button>';
    }).join('')+'</div>'+
      (q.source==='p' && /下图|漫画|图示|如图|下表|表中/.test(q.stem) && q.qRefs?.length
        ? '<details><summary>查看题目原图</summary>'+PRACTICE.questionPages(q,'question')+'</details>' : '')+
      (revealed
        ? '<p class="res '+(answered ? (p.s==='right'?'ok':'bad') : '')+'">'+(answered ? (p.s==='right'?'✔ 做对了 · ':'✘ 做错了 · ') : '')+'正确答案：'+escape(q.answer)+(saved.length ? ' · 你的选择：'+escape(saved.join('')) : '')+'</p>'+explanation(c.analysis(q))
        : '<div class="acts">'+button('提交答案','submit',true)+button('直接看答案','reveal')+button('清除选择','clear')+'</div>');
    card.querySelectorAll('[data-option]').forEach(option => {
      option.onclick = () => {
        const key = option.dataset.option;
        const current = c.S['sel_'+q.id] || [];
        const next = current.includes(key) ? current.filter(k=>k!==key) : q.multi ? [...current,key] : [key];
        c.S['sel_'+q.id] = next;
        card.querySelectorAll('[data-option]').forEach(el => {
          const selected = next.includes(el.dataset.option);
          el.classList.toggle('sel',selected);
          el.setAttribute('aria-pressed',String(selected));
        });
        c.setLastQ(q.id);
      };
    });
    return {
      submit: () => {
        const selection = c.S['sel_'+q.id] || [];
        if (!selection.length) return ZS.toast('先选一个答案');
        state.record([...selection].sort().join('') === [...q.answer].sort().join(''), selection);
      },
      clear: () => { c.S['sel_'+q.id]=[]; state.paint(); }
    };
  }

  function saveDraft(id, key, value) {
    const edit = ZS.data.edit[id] ||= {};
    edit[key] = value;
    edit.ts = Date.now();
    ZS.save();
  }

  function matching(card, q, c, state) {
    const {p, answered, revealed} = state;
    const pairs = answered ? PRACTICE.decode(p) : ZS.data.edit[q.id]?.practiceMatch || {};
    card.innerHTML = '<ol class="paper-match-choices">'+q.right.map(item =>
      '<li><b>'+escape(item.key)+'</b> '+escape(item.text)+'</li>').join('')+'</ol>'+
      q.left.map(item => '<label class="paper-match-row"><span>'+escape(item.originalLabel)+' '+escape(item.text)+'</span><input type="text" inputmode="'+(q.multiMatch ? 'text' : 'numeric')+'" value="'+escape((pairs[item.key]||[]).join(','))+'" placeholder="'+(q.multiMatch?'例如 1,3':'填写序号')+'"'+(revealed?' readonly':'')+'>'+
      (revealed ? '<span>正确序号：'+escape(q.matchMap[item.key].join(','))+'</span>' : '')+'</label>').join('')+
      (revealed ? (answered ? '<p class="res '+(p.s==='right'?'ok':'bad')+'">'+(p.s==='right'?'✔ 全部配对正确':'✘ 有配对需要订正')+'</p>' : '')+explanation(c.analysis(q)) :
        '<div class="acts">'+button('提交配对','submit',true)+button('直接看答案','reveal')+button('清除配对','clear')+'</div>');
    const inputs = [...card.querySelectorAll('input')];
    const read = () => q.left.map((item,i) => [item.key,PRACTICE.parsed(inputs[i].value)]);
    const save = rows => saveDraft(q.id,'practiceMatch',Object.fromEntries(rows.filter(([,value])=>value!==null)));
    inputs.forEach(input => input.oninput = () => save(read()));
    return {
      submit: () => {
        const rows = read();
        if (rows.some(([,values])=>!values?.length || (!q.multiMatch&&values.length!==1) ||
          values.some(k=>!q.right.some(item=>item.key===k)))) return ZS.toast('请填写每项的有效序号');
        save(rows);
        state.record(rows.every(([key,values])=>PRACTICE.equal(values,q.matchMap[key])),['match:'+JSON.stringify(Object.fromEntries(rows))]);
      },
      clear: () => { save([]); state.paint(); }
    };
  }

  function written(card, q, c, state) {
    const {p, answered, revealed} = state;
    const value = answered ? (p.sel?.[0]||'').replace(/^written:/,'') : ZS.data.edit[q.id]?.practiceText || '';
    const original = q.source==='p' && q.qRefs?.length ?
      '<details class="paper-source"><summary>查看原始题面</summary><div></div></details>' : '';
    card.innerHTML = original+'<label class="paper-written">我的作答<textarea rows="5"'+(answered?' readonly':'')+'>'+escape(value)+'</textarea></label>'+
      (revealed ? '<div class="paper-answer">'+c.analysis(q)+'</div><div class="acts">'+
        (answered ? '<span role="status">'+(p.s==='right'?'已掌握':'仍需复习')+'</span>' : assessment())+'</div>'
        : '<div class="acts">'+button('展开参考答案','reveal',true)+'</div>');
    const source = card.querySelector('.paper-source');
    if (source) source.ontoggle = () => {
      const content = source.querySelector('div');
      if (source.open && !content.hasChildNodes()) content.innerHTML = PRACTICE.questionPages(q,'question');
    };
    const input = card.querySelector('textarea');
    input.oninput = () => saveDraft(q.id,'practiceText',input.value);
    const assess = right => {
      if (!input.value.trim()) return ZS.toast('先填写自己的作答，再进行自评');
      state.record(right,['written:'+input.value]);
    };
    return {mastered:()=>assess(true),review:()=>assess(false)};
  }

  function cloze(card, q, c, state) {
    const masks = q.cloze.masks;
    const saved = c.S['hat_'+q.id] ||= {open:[],mode:localStorage.getItem('zz720.hatMode')||'image'};
    const open = new Set(saved.open);
    if (state.answered && !saved.initialized) {
      masks.forEach(mask=>open.add(mask.id));
      saved.initialized = true;
    }
    saved.open = [...open];
    const book = PRACTICE.index.books.find(item=>item.id===q.bookId);
    const sheets = q.qRefs.map(ref => {
      const [x,y,w,h] = ref.b;
      const page = book.pageSizes[ref.page-1];
      const src = book.pageUrls?.[ref.page-1] || (book.sourceBase||PRACTICE.index.sourceBase)+'img/'+book.id+'/'+String(ref.page).padStart(3,'0')+'.png';
      const covers = masks.flatMap((mask,i) => mask.rects.filter(rect=>rect.page===ref.page).map(rect =>
        '<button type="button" class="hat-mask'+(open.has(mask.id)?' revealed':'')+'" data-mask="'+i+'" aria-pressed="'+open.has(mask.id)+'" aria-label="第 '+(i+1)+' 处挖空" style="left:'+((rect.b[0]-x)/w*100)+'%;top:'+((rect.b[1]-y)/h*100)+'%;width:'+(rect.b[2]/w*100)+'%;height:'+(rect.b[3]/h*100)+'%"><span>'+(i+1)+'</span></button>')).join('');
      return '<div class="hat-sheet hat-image" style="aspect-ratio:'+w+'/'+h+'"><img loading="lazy" class="hat-original-image" src="'+escape(src)+'" alt="挖空原题" style="width:'+page.width/w*100+'%;left:'+(-x/w*100)+'%;top:'+(-y/h*100)+'%">'+covers+'</div>';
    });
    card.innerHTML = '<div class="hat-pages">'+sheets.join('')+'</div><div class="acts">'+
      button(open.size===masks.length?'全部遮挡':'全部揭晓','toggle')+
      (state.answered ? '<span role="status">'+(state.p.s==='right'?'已掌握':'仍需复习')+'</span>' :
        open.size===masks.length ? assessment() : '<span>已揭晓 '+open.size+' / '+masks.length+' 处</span>')+'</div>';
    card.querySelectorAll('[data-mask]').forEach(el => el.onclick = () => {
      const id = masks[Number(el.dataset.mask)].id;
      open.has(id) ? open.delete(id) : open.add(id);
      saved.open = [...open];
      state.paint();
      card.querySelector('[data-mask="'+el.dataset.mask+'"]')?.focus({preventScroll:true});
    });
    const assess = right => state.record(right,['cloze:'+JSON.stringify({open:[...open]})]);
    return {
      toggle: () => { saved.open = open.size===masks.length ? [] : masks.map(mask=>mask.id); state.paint(); },
      mastered:()=>assess(true),review:()=>assess(false)
    };
  }

  function question(q, c) {
    const article = document.createElement('article');
    article.className = 'card pad paper-question';
    article.innerHTML = '<header class="paper-question-header"><h2>'+escape(q.originalNo || q.no || '')+
      ' <span>'+escape(q.section || '')+'</span></h2><div class="muted tiny">'+escape([q.module,q.chapter].filter(Boolean).join(' · '))+'</div></header>'+
      '<div class="stem">'+escape(q.stem)+'</div><div class="paper-body"></div>'+
      '<div class="acts paper-question-footer"><a class="btn tiny" href="#/q/'+encodeURIComponent(q.id)+'">逐题查看 / 笔记</a></div>';
    const body = article.querySelector('.paper-body');
    const footer = article.querySelector('.paper-question-footer');
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'btn tiny';
    const updateStar = () => {
      const marked = !!c.flag(q.id,'star');
      star.textContent = marked?'★ 已收藏':'☆ 收藏';
      star.setAttribute('aria-pressed',String(marked));
    };
    updateStar();
    star.onclick = () => { c.toggleFlag(q.id,'star'); updateStar(); };
    footer.append(star);
    function paint() {
      const p = c.P(q.id);
      const answered = !!p?.s && !c.S['redo_'+q.id];
      const revealed = answered || !!c.S['rev_'+q.id];
      const state = {p,answered,revealed,paint,record(right,selection) {
        c.setLastQ(q.id);
        c.setProg(q.id,right,false,selection);
        paint();
      }};
      const render = q.type==='cloze' ? cloze : q.type==='matching' ? matching :
        Object.keys(q.options||{}).length ? choice : written;
      const actions = render(body,q,c,state);
      actions.reveal = () => { c.S['rev_'+q.id] = true; c.setLastQ(q.id); paint(); };
      actions.redo = () => c.reset(q.id,paint);
      if (revealed || (q.type==='cloze' && c.S['hat_'+q.id]?.open.length)) body.insertAdjacentHTML('beforeend','<div class="acts">'+button('重做本题','redo')+'</div>');
      body.querySelectorAll('[data-action]').forEach(el => { el.onclick=actions[el.dataset.action]; });
    }
    paint();
    return article;
  }

  function render(root, questions, c, first) {
    const list = root.querySelector('.paper-list');
    const more = root.querySelector('.paper-more');
    const status = root.querySelector('.paper-loaded');
    const jump = root.querySelector('.paper-jump');
    const help = root.querySelector('.paper-sentinel');
    let loaded = 0;
    const chunk = 16;
    const append = (limit = loaded+chunk) => {
      const end = Math.min(questions.length,limit);
      const nodes = document.createDocumentFragment();
      while (loaded<end) nodes.append(question(questions[loaded++],c));
      list.append(nodes);
      status.textContent = '已显示 '+loaded+' / '+questions.length+' 题';
      more.hidden = loaded===questions.length;
      if (more.hidden) observer?.disconnect();
    };
    const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
      if (!root.isConnected) return observer.disconnect();
      if (entries.some(entry=>entry.isIntersecting)) append();
    },{rootMargin:'400px'}) : null;
    function locate(index) {
      if (index>=loaded) append(index+chunk);
      c.stopRestore();
      list.children[index]?.scrollIntoView({block:'start'});
    }
    more.onclick = () => append();
    jump.onsubmit = event => { event.preventDefault(); locate(Number(jump.elements.position.value)-1); };
    append();
    if (!more.hidden) observer?.observe(help);
    if (first>0) requestAnimationFrame(()=>{if(root.isConnected)locate(first);});
    return () => observer?.disconnect();
  }
  return {render};
})();
