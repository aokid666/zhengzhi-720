/* 720题 主应用 */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { qs: [], byId: {}, lk: {}, ls: {}, route: '', cur: null, searchQ: '', lastPos: {} };

  /* ---------- 数据 ---------- */
  async function boot() {
    try {
      const r = await fetch('data/questions.json');
      S.qs = await r.json();
    } catch (e) { document.body.innerHTML = '<div class="empty">题库加载失败：' + esc(e.message) + '</div>'; return; }
    S.qs.forEach(q => S.byId[q.id] = q);
    ZS.load();
    window.addEventListener('hashchange', route);
    route();
    if (ZS.cfg().token) { ZS.pull(true).then(() => render()); }
    document.addEventListener('zs-synced', () => { /* no-op */ });
    document.addEventListener('visibilitychange', () => { if (document.hidden) ZS.push(true); });
  }

  async function needLect() {
    if (Object.keys(S.lk).length) return;
    try { S.lk = await (await fetch('data/lecture-k.json')).json(); } catch (e) { S.lk = {}; }
    try { S.ls = await (await fetch('data/lecture-s.json')).json(); } catch (e) { S.ls = {}; }
  }

  /* ---------- 进度 ---------- */
  const P = id => ZS.data.progress[id] || null;
  const isDone = id => { const p = P(id); return !!(p && p.s); };
  function setProg(id, right, guess) {
    ZS.data.progress[id] = { s: right ? 'right' : 'wrong', guess: !!guess, ts: Date.now() };
    ZS.save();
  }
  function toggleFlag(id, k) {
    const f = ZS.data.flags[id] = ZS.data.flags[id] || { ts: 0 };
    f[k] = !f[k]; f.ts = Date.now(); ZS.save();
  }
  const flag = (id, k) => (ZS.data.flags[id] || {})[k];

  /* ---------- 路由 ---------- */
  function route() {
    let h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { }
    S.route = h;
    const [p, a] = h.split('/');
    if (p === 'l' && a) return renderChapter(a);
    if (p === 'q' && a) return renderQuestion(a);
    if (p === 's') return renderSearch();
    if (p === 'me') return renderMe();
    return renderHome();
  }
  const go = h => { location.hash = '#/' + h; };

  function shell(inner) {
    $('#view').innerHTML = inner;
    window.scrollTo(0, 0);
  }

  function showQNav(on, idx) {
    const bar = document.getElementById('qnav');
    if (!bar) return;
    bar.classList.toggle('show', !!on);
    document.body.classList.toggle('hasqnav', !!on);
    const info = document.getElementById('qnavInfo');
    if (info) info.textContent = on ? (idx + 1) + ' / ' + S.qs.length : '';
    const pv = document.getElementById('qnavPrev'), nx = document.getElementById('qnavNext');
    if (pv) pv.disabled = !on || idx <= 0;
    if (nx) nx.disabled = !on || idx >= S.qs.length - 1;
  }
  window.ZS_QNAV = d => {
    const i = qIndexOf(S.curId);
    if (i < 0) return;
    const n = i + d;
    if (n < 0) return ZS.toast('已经是第一题');
    if (n >= S.qs.length) return ZS.toast('已经是最后一题');
    go('q/' + S.qs[n].id);
  };

  /* ---------- 首页 ---------- */
  function chapters() {
    const map = new Map();
    S.qs.forEach(q => {
      const k = q.moduleIdx + '|' + q.chapter;
      if (!map.has(k)) map.set(k, { mi: q.moduleIdx, mod: q.module, ch: q.chapter, title: q.chapterTitle, ids: [] });
      map.get(k).ids.push(q.id);
    });
    return Array.from(map.values());
  }
  function statOf(ids) {
    let done = 0, right = 0, guess = 0;
    ids.forEach(id => { const p = P(id); if (p && p.s) { done++; if (p.s === 'right') right++; if (p.guess) guess++; } });
    return { done, right, wrong: done - right, guess, total: ids.length };
  }
  function renderHome() {
    showQNav(false);
    const chs = chapters();
    const all = S.qs.map(q => q.id);
    const st = statOf(all);
    const wrongIds = all.filter(id => { const p = P(id); return p && p.s === 'wrong'; });
    const guessIds = all.filter(id => flag(id, 'guess'));
    const starIds = all.filter(id => flag(id, 'star'));
    const last = localStorage.getItem('zz720.last');
    let h = `
      <div class="hero">
        <div class="ring"></div>
        <h1>考研政治 · 全真模拟 785 题</h1>
        <p>题目 · 解析 · 讲义 · 手写笔记 · 云端同步</p>
        <div class="prog">
          <div><b>${st.done}</b><span>已做 / ${st.total}</span></div>
          <div><b>${st.right}</b><span>做对</span></div>
          <div><b>${st.wrong}</b><span>做错</span></div>
        </div>
        <div class="bar"><i style="width:${(st.done / st.total * 100).toFixed(1)}%"></i></div>
      </div>
      <div class="acts">
        ${last ? `<button class="btn main" onclick="ZS_GO('q/${last}')">继续上次 (${last.replace('q', '')})</button>` : ''}
        <button class="btn" onclick="ZS_GO('l/first')">从头开始</button>
        <button class="btn" onclick="ZS_GO('s')">🔍 搜索</button>
      </div>
      <div class="acts">
        <button class="btn warn" onclick="ZS_RUN('wrong')">错题重做 (${wrongIds.length})</button>
        <button class="btn guess" onclick="ZS_RUN('guess')">蒙对复习 (${guessIds.length})</button>
        <button class="btn" onclick="ZS_RUN('star')">收藏 (${starIds.length})</button>
      </div>
      <div class="sec-title">分模块练习</div>`;
    const mods = new Map();
    chs.forEach(c => { if (!mods.has(c.mi)) mods.set(c.mi, []); mods.get(c.mi).push(c); });
    mods.forEach((list, mi) => {
      const ids = list.flatMap(c => c.ids);
      const s = statOf(ids);
      h += `<div class="card mod">
        <div class="modhd" onclick="this.nextElementSibling.classList.toggle('open')">
          <span>${esc(list[0].mod)}</span>
          <span class="sp" style="flex:1"></span>
          <span class="n">${s.done}/${s.total}</span>
          <span class="mini"><i style="width:${(s.done / s.total * 100).toFixed(0)}%"></i></span>
        </div><div class="chaps">`;
      list.forEach(c => {
        const cs = statOf(c.ids);
        h += `<div class="chap" onclick="ZS_GO('l/${c.mi}-${c.ch}')">
          <span class="t">${esc(c.ch)} ${esc(c.title)}</span>
          <span class="n">${cs.done}/${cs.total}</span>
          <span class="mini"><i style="width:${(cs.done / cs.total * 100).toFixed(0)}%"></i></span>
        </div>`;
      });
      h += `</div></div>`;
    });
    h += `<div class="sec-title">云端同步</div>
      <div class="card pad">
        <div class="tiny muted">笔记、做题记录、手写标注都会保存到你自己的 GitHub 仓库，换设备打开也能看到。</div>
        <div class="acts"><button class="btn" onclick="ZS_SYNC()">☁️ 立即同步</button>
        <button class="btn" onclick="ZS_CFG()">设置</button>
        <span class="tiny muted" id="syinfo" style="align-self:center">${ZS.cfg().token ? (ZS.lastSync ? '上次 ' + ZS.fmt(ZS.lastSync) : '尚未同步') : '未配置令牌'}</span></div>
      </div>`;
    shell(h);
    $$('#view .modhd').forEach((_, i) => { });
  }

  /* ---------- 章节列表 ---------- */
  function renderChapter(key) {
    showQNav(false);
    let list;
    if (key === 'first') { list = S.qs; key = S.qs[0].moduleIdx + '-' + S.qs[0].chapter; }
    else { const [mi, ch] = key.split('-'); list = S.qs.filter(q => q.moduleIdx == mi && q.chapter === ch); }
    if (!list.length) { shell('<div class="empty">没找到这个章节<br><br><button class="btn main" onclick="ZS_GO(\'\')">回到首页</button></div>'); return; }
    const first = S.qs.indexOf(list[0]);
    let h = `<div class="sec-title">${esc(list[0].module)} · ${esc(list[0].chapter)} ${esc(list[0].chapterTitle || '')}</div>
      <div class="acts"><button class="btn main" onclick="ZS_GO('q/${list[0].id}')">开始做题</button>
      <button class="btn" onclick="ZS_LIST('${key}','wrong')">只看错题</button>
      <button class="btn" onclick="ZS_LIST('${key}','undone')">只看未做</button></div>
      <div class="card pad" style="margin-top:12px"><div style="display:flex;flex-wrap:wrap;gap:7px">`;
    list.forEach(q => {
      const p = P(q.id);
      const cls = !p || !p.s ? '' : (p.s === 'right' ? 'ok' : 'bad');
      h += `<span class="chip ${p && p.s ? cls : ''}" style="min-width:38px;text-align:center;cursor:pointer;padding:6px 9px;font-size:13.5px"
        onclick="ZS_GO('q/${q.id}')">${q.no}${flag(q.id, 'star') ? '★' : ''}${p && p.guess ? '蒙' : ''}</span>`;
    });
    h += `</div></div>`;
    shell(h);
  }

  /* ---------- 题目 ---------- */
  function qIndexOf(id) { return S.qs.findIndex(q => q.id === id); }

  function renderQuestion(id) {
    const q = S.byId[id];
    if (!q) { shell('<div class="empty">题目不存在</div>'); return; }
    S.cur = q; S.curId = id;
    localStorage.setItem('zz720.last', id);
    showQNav(true, qIndexOf(id));
    const p = P(id);
    const revealed = !!(p && p.s) || !!S['rev_' + id];
    if (revealed) { needLect().then(() => { if (S.cur === q && !q._lectDone) { q._lectDone = 1; paintLect(q); } }); }
    const sel = S['sel_' + id] || [];
    const idx = qIndexOf(id);
    let h = `<div class="card" style="margin-top:12px">
      <div class="qhd">
        <button class="iconbtn" onclick="ZS_GO('l/${q.moduleIdx}-${q.chapter}')">☰</button>
        <span class="idx">${esc(q.chapter)} 第 ${q.no} 题</span>
        <span class="chip">${esc(q.section)}</span>
        <span class="sp"></span>
        ${revealed ? `<button class="iconbtn" onclick="ZS_GONOTE('${id}')">📝</button>` : ''}
        <button class="iconbtn ${flag(id, 'star') ? 'on' : ''}" onclick="ZS_FLAG('${id}','star')">★</button>
      </div>
      <div class="qbody">
        <div id="qbox" data-anno="${id}|q-txt">
        <div class="stem">${esc(q.stem)}</div>
        <div id="opts">`;
    ['A','B','C','D'].forEach(k => {
      const v = q.options[k];
      let cls = 'opt';
      if (!revealed && sel.includes(k)) cls += ' sel';
      if (revealed) {
        const isRight = q.answer.includes(k), chose = sel.includes(k);
        if (isRight) cls += ' right';
        else if (chose) cls += ' wrong';
      }
      h += `<div class="${cls}" onclick="ZS_SEL('${id}','${k}')">
        <span class="k">${k}</span><span class="v">${esc(v)}</span>
        ${revealed ? `<span class="mk" style="color:${q.answer.includes(k) ? 'var(--ok)' : '#bbb'}">${q.answer.includes(k) ? '✔' : ''}</span>` : ''}
      </div>`;
    });
    h += `</div></div>`;
    if (revealed) {
      h += `<div class="acts" style="margin-top:0"><button class="btn" onclick="ZS_ANNO('${id}','q-txt')">✍️ 在题目与选项上做笔记</button>
        ${pdfLink('q', [q.qPage + PAGE_OFF.q], '打开《试题册》PDF')}</div>`;
    }
    if (!revealed) {
      h += `<div class="acts">
        <button class="btn main" onclick="ZS_SUBMIT('${id}')">提交答案</button>
        <button class="btn" onclick="ZS_REVEAL('${id}')">直接看答案</button>
        <button class="btn" onclick="ZS_CLR('${id}')">清除选择</button>
      </div>`;
    } else {
      const right = p.s === 'right';
      h += `<div class="res ${right ? 'ok' : 'bad'}">${right ? '✔ 做对了' : '✘ 做错了'} —— 正确答案：${esc(q.answer)}${sel.length ? '，你选了 ' + esc(sel.join('')) : ''}</div>
        <div class="acts">
          <button class="btn guess ${p.guess ? 'on' : ''}" onclick="ZS_GUESS('${id}')">${p.guess ? '已标记：蒙对的' : '标记为「蒙对」'}</button>
          <button class="btn" onclick="ZS_REDO('${id}')">重做本题</button>
        </div>`;
    }
    h += `</div></div>`;

    if (revealed) {
      h += `<div class="acc open" id="accA">
        <div class="hd" onclick="ZS_ACC(this)">📖 解析（对应解析册原页）<span class="arw">›</span></div>
        <div class="bd">
          <div class="pages" id="aPages">${aBoxHtml(q)}</div>
          <div class="acts"><button class="btn" onclick="ZS_ANNO('${id}','a-img')">✍️ 在解析截图上做笔记</button>
          <button class="btn" onclick="ZS_ANNO('${id}','a-txt')">✍️ 在解析文字上做笔记</button>
          ${pdfLink('a', S['pg_a_' + id] ? shiftList(q.aPages, S['pg_a_' + id]) : q.aPages, '打开《解析册》PDF')}</div>
          <div class="acc" style="margin-top:10px"><div class="hd" onclick="ZS_ACC(this)">解析文字（点开查看 · 可编辑）<span class="arw">›</span></div>
            <div class="bd" id="aText">
              <div class="txt" data-anno="${id}|a-txt" data-editkey="a">${editHtml(id, 'a', analysisHtml(q))}</div>
              ${edTools(id, 'a')}
            </div></div>
        </div></div>`;

      h += `<div class="acc" id="accL">
        <div class="hd" onclick="ZS_ACC(this)">📚 讲义对照<span class="arw">›</span></div>
        <div class="bd">
          <div class="tabs">
            <span class="tab on" data-t="k" onclick="ZS_TAB(this,'k')">知识清单</span>
            <span class="tab" data-t="s" onclick="ZS_TAB(this,'s')">速成班讲义</span>
          </div>
          <div id="lectK" class="lectbox"></div>
          <div id="lectS" class="lectbox" style="display:none"></div>
        </div></div>`;

      h += `<div id="noteSection"></div>`;
    } else {
      h += `<div class="card pad" style="margin-top:12px;text-align:center;color:var(--ink3)" class="tiny">
        🔒 做完本题后才会显示解析、讲义与你的笔记</div>`;
    }
    shell(h);
    if (revealed) {
      q._lectDone = 0;
      needLect().then(() => { paintLect(q); ANNO.renderScope(); });
      renderNote(id);
      ANNO.renderScope();
    }
  }

  function editHtml(id, key, fallback) {
    const e = ZS.data.edit[id];
    return (e && e[key] != null) ? e[key] : fallback;
  }
  function edTools(id, key) {
    const edited = !!(ZS.data.edit[id] && ZS.data.edit[id][key] != null);
    return `<div class="acts edacts">
      <button class="btn" id="edb-${id}-${key}" onclick="ZS_EDIT('${id}','${key}')">✏️ 编辑文字</button>
      <span class="edtools" id="edt-${id}-${key}" style="display:none">
        <button class="btn" onmousedown="event.preventDefault()" onclick="ZS_FMT('bold')"><b>B</b></button>
        <button class="btn" onmousedown="event.preventDefault()" onclick="ZS_FMT('hiliteColor','#ffe066')" style="background:#fff8dc">高亮</button>
        <button class="btn" onmousedown="event.preventDefault()" onclick="ZS_FMT('foreColor','#d0342c')" style="color:#d0342c">红字</button>
        <button class="btn" onmousedown="event.preventDefault()" onclick="ZS_FMT('removeFormat')">清格式</button>
        <button class="btn" onclick="ZS_EDRESET('${id}','${key}')">还原原文</button>
      </span>
      ${edited ? '<span class="chip warn">已修改</span>' : ''}
    </div>`;
  }
  window.ZS_EDIT = (id, key) => {
    const el = document.querySelector('[data-anno="' + id + '|' + key + '-txt"]');
    const btn = document.getElementById('edb-' + id + '-' + key);
    const tools = document.getElementById('edt-' + id + '-' + key);
    if (!el) return;
    if (el.isContentEditable) {
      el.contentEditable = 'false';
      el.classList.remove('editing');
      const e = ZS.data.edit[id] = ZS.data.edit[id] || { ts: 0 };
      e[key] = el.innerHTML; e.ts = Date.now();
      ZS.save();
      if (btn) btn.textContent = '✏️ 编辑文字';
      if (tools) tools.style.display = 'none';
      ZS.toast('已保存修改 ✓');
    } else {
      el.contentEditable = 'true';
      el.classList.add('editing');
      el.focus();
      if (btn) btn.textContent = '✓ 完成编辑';
      if (tools) tools.style.display = '';
      ZS.toast('可以直接改文字；选中后用 B / 高亮 标记重点');
    }
  };
  window.ZS_FMT = (cmd, val) => { try { document.execCommand(cmd, false, val || null); } catch (e) { } };
  window.ZS_EDRESET = (id, key) => {
    ZS.confirm('还原为原始讲义文字？（你改过的内容会丢失）', () => {
      if (ZS.data.edit[id]) { delete ZS.data.edit[id][key]; if (!Object.keys(ZS.data.edit[id]).length) delete ZS.data.edit[id]; }
      ZS.save(true); renderQuestion(id); ZS.toast('已还原');
    });
  };

  function analysisHtml(q) {
    const parts = (q.analysis || []).map(p => `<div style="margin-bottom:8px"><span class="lbl">${esc(p.k)}</span>${esc(p.t)}</div>`).join('');
    return parts || esc(q.analysisRaw || '');
  }

  const PAGE_OFF = { a: 4, k: 8, s: 9, q: 6 };
  const PAGE_NAME = { a: '解析册', k: '知识清单', s: '速成班讲义', q: '试题册' };
  const PDFFILE = { a: '解析册', k: '知识清单', s: '速成班讲义', q: '试题册' };
  const PDFCHUNK = { a: 40, k: 40, q: 0, s: 0 };     // 0 = 不分卷
  const PDFTOTAL = { a: 460, k: 326, q: 164, s: 197 };
  const pad3 = n => String(n).padStart(3, '0');
  function chunkOf(kind, page) {
    const cs = PDFCHUNK[kind];
    if (!cs) return { file: PDFFILE[kind] + '.pdf', page: page };
    const idx = Math.floor((page - 1) / cs);
    const start = idx * cs + 1;
    const end = Math.min(start + cs - 1, PDFTOTAL[kind]);
    return { file: PDFFILE[kind] + '-P' + pad3(start) + '-' + pad3(end) + '.pdf', page: page - start + 1 };
  }
  /* 为一组页生成 PDF 跳转按钮（跨卷时给出多个按钮） */
  function pdfLink(kind, pages, label) {
    if (!pages || !pages.length) return '';
    const off = PAGE_OFF[kind] || 0;
    const seen = {}, list = [];
    pages.forEach(n => {
      const c = chunkOf(kind, n);
      if (seen[c.file]) { seen[c.file].cnt++; return; }
      seen[c.file] = { file: c.file, page: c.page, first: n, cnt: 1 };
      list.push(seen[c.file]);
    });
    return list.map(c => `<a class="btn pdflink" target="_blank" rel="noopener"
      href="pdf/${encodeURIComponent(c.file)}#page=${c.page}&zoom=page-width">📄 ${label}${c.cnt > 1 ? ' +' : ''}<span class="tiny muted">（第 ${c.first - off} 页）</span></a>`).join('');
  }
  /* 解析区：直接显示「按本题裁切」的高清解析图 */
  function aBoxHtml(q) {
    const has = (q.aCrops || []).length;
    if (!has) {
      return `<div class="hint" style="padding:14px">本题解析图尚未生成，可点下方「解析册 PDF」查看。</div>`;
    }
    const inner = q.aCrops.map((src, i) =>
      `<div class="pgwrap crop" data-tgt="a-img" data-id="${q.id}">
        <img loading="lazy" src="img/ac/${src}" alt="本题解析 ${i + 1}" onclick="ZS_ZOOM(this)">
      </div>`).join('');
    const more = q.aCrops.length > 1
      ? `<span class="tiny muted" style="align-self:center">本题解析共 ${q.aCrops.length} 张（跨页）</span>` : '';
    return inner + `<div class="pager">${more}
      <span class="tiny muted" style="align-self:center">点击图片可放大</span>
    </div>`;
  }
  window.ZS_AMODE = () => {};

  function pagesHtml(pages, kind, id, label) {
    if (!pages || !pages.length) return '<div class="tiny muted">未匹配到对应页</div>';
    const cur = S['pg_' + kind + '_' + id];
    if (cur && pages.indexOf(cur) < 0) pages = pages.concat([cur]).sort((x, y) => x - y);
    return pages.map(n => {
      const nn = String(n).padStart(4, '0');
      const off = PAGE_OFF[kind] || 0;
      return `<div class="pgwrap" data-tgt="${kind}-img" data-id="${id}">
        <img loading="lazy" src="img/${kind}/${nn}.webp" alt="${label} 第${n}页" onclick="ZS_ZOOM(this)">
        <span class="pgno">${PAGE_NAME[kind] || ''} P${n - off}</span>
      </div>`;
    }).join('') + `<div class="pager">
      <button class="btn tiny" onclick="ZS_PG('${id}','${kind}',-1)">◀ 上一页</button>
      <button class="btn tiny" onclick="ZS_PG('${id}','${kind}',1)">下一页 ▶</button>
      <span class="tiny muted" style="align-self:center">共 ${pages.length} 页 · 可翻页找相邻内容</span>
    </div>`;
  }

  function paintLect(q) {
    ['k', 's'].forEach(t => {
      const box = $('#lect' + t.toUpperCase());
      if (!box) return;
      const pages = t === 'k' ? q.kPages : q.sPages;
      const dict = t === 'k' ? S.lk : S.ls;
      let txt = (pages || []).map(n => dict[n] || '').join('\n').trim();
      if (!txt) txt = '（未检索到对应讲义文字，请以截图为准）';
      box.innerHTML = `<div class="pages">${pagesHtml(pages, t, q.id, t === 'k' ? '知识清单' : '速成班讲义')}</div>
        <div class="acts"><button class="btn" onclick="ZS_ANNO('${q.id}','${t}-img')">✍️ 在讲义截图上做笔记</button>
        <button class="btn" onclick="ZS_ANNO('${q.id}','${t}-txt')">✍️ 在讲义文字上做笔记</button>
        ${pdfLink(t, S['pg_' + t + '_' + q.id] ? shiftList(pages, S['pg_' + t + '_' + q.id]) : pages, '打开《' + (t === 'k' ? '知识清单' : '速成班讲义') + '》PDF')}</div>
        <div class="acc" style="margin-top:10px"><div class="hd" onclick="ZS_ACC(this)">讲义文字（点开查看 · 可编辑）<span class="arw">›</span></div>
          <div class="bd" id="${t}Text">
            <div class="txt" data-anno="${q.id}|${t}-txt" data-editkey="${t}">${editHtml(q.id, t, esc(txt))}</div>
            ${edTools(q.id, t)}
          </div></div>`;
    });
  }

  /* ---------- 笔记区 ---------- */
  const NC = ['#1f6feb', '#d0342c', '#1f8a5b', '#111111', '#d89055', '#8e44ad'];
  const NW = [0.45, 0.65, 0.9, 1.2, 1.6, 2.1, 2.8, 3.8];
  let nd = null;                       // 笔记手写状态

  function renderNote(id) {
    const box = $('#noteSection'); if (!box) return;
    const n = ZS.data.notes[id] || { text: '', strokes: [], pics: [] };
    box.innerHTML = `<div class="card pad" id="noteCard">
      <div class="notehd">
        <b>📝 本题笔记区</b><span class="sp"></span>
        <button class="iconbtn" onclick="ZS_NOTEOPEN('${id}')" id="noteToggle">打开</button>
      </div>
      <div class="tiny muted" id="noteSum">${noteSummary(n)}</div>
      <div id="noteBox"></div>
    </div>`;
  }
  function noteSummary(n) {
    const t = (n.text || '').replace(/<[^>]+>/g, '').trim();
    const bits = [];
    if (t) bits.push('文字 ' + t.length + ' 字');
    if ((n.strokes || []).length) bits.push('手写 ' + n.strokes.length + ' 笔');
    if ((n.pics || []).length) bits.push('图片 ' + n.pics.length + ' 张');
    return bits.length ? '已保存：' + bits.join(' · ') + '（' + ZS.fmt(n.ts) + '）' : '还没有笔记';
  }
  function openNote(id, force) {
    const box = $('#noteBox'); if (!box) return;
    const tg = $('#noteToggle');
    if (!force && box.innerHTML.trim()) {
      box.innerHTML = '';
      if (tg) tg.textContent = '打开';
      if (nd && nd.id === id) nd = null;
      return;
    }
    if (tg) tg.textContent = '收起';
    const n = ZS.data.notes[id] || (ZS.data.notes[id] = { text: '', strokes: [], pics: [], ts: Date.now() });
    if (!n.strokes) n.strokes = [];
    if (!n.pics) n.pics = [];
    box.innerHTML = `<div id="notearea">
      <div class="nhd"><span class="tiny muted">文字 · 手写 · 图片</span><span class="sp"></span>
        <button class="iconbtn" onclick="ZS_NOTESAVE('${id}')">💾 保存</button>
        <button class="iconbtn" onclick="ZS_NOTEDEL('${id}')">🗑 删除本条</button></div>
      <div class="nbd">
        <div id="noteText" contenteditable="true" data-ph="在这里输入文字笔记…"></div>
        <div class="ntools">
          <button class="iconbtn" onclick="document.getElementById('picIn').click()">🖼 插图</button>
          <input type="file" id="picIn" accept="image/*" style="display:none">
          <button class="iconbtn" id="btnDraw" onclick="ZS_NOTEDRAW('${id}')">✍️ 手写板</button>
          <span class="sp" style="flex:1"></span>
        </div>
        <div class="ntools" id="drawTools" style="display:none">
          <button class="iconbtn" id="noteMode" onclick="ZS_NOTETOOL('mode')"></button>
          <span class="colors" id="nColors"></span>
          <button class="iconbtn" data-n="pen">✏️ 笔</button>
          <button class="iconbtn" data-n="eraser">🧽 橡皮</button>
          <button class="iconbtn" data-n="thin">－ 细</button>
          <button class="iconbtn" data-n="bold">＋ 粗</button>
          <span class="sp" style="flex:1"></span>
          <button class="iconbtn" data-n="undo">↶ 撤销</button>
          <button class="iconbtn" data-n="clear">🗑 清空</button>
        </div>
        <div class="notepics" id="notePics"></div>
        <div class="ncanvas" id="noteCv" style="display:none"><canvas></canvas></div>
      </div></div>`;
    $('#noteText').innerHTML = n.text || '';
    $('#noteText').addEventListener('input', () => {
      n.text = $('#noteText').innerHTML; n.ts = Date.now(); ZS.save();
      $('#noteSum').textContent = noteSummary(n);
    });
    $('#picIn').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      shrinkImg(f, d => { n.pics.push(d); n.ts = Date.now(); ZS.save(); drawPics(id); $('#noteSum').textContent = noteSummary(n); });
      e.target.value = '';
    });
    drawPics(id);
    if (n.strokes.length) noteDrawOn(id, true);
  }
  function drawPics(id) {
    const n = ZS.data.notes[id] || {}; const box = $('#notePics'); if (!box) return;
    box.innerHTML = (n.pics || []).map((p, i) =>
      `<figure><img src="${p}" onclick="ZS_ZOOMSRC(this.src)"><button class="del" onclick="ZS_PICDEL('${id}',${i})">×</button></figure>`).join('');
  }
  function shrinkImg(file, cb) {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const max = 1400, sc = Math.min(1, max / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/jpeg', 0.78));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* 笔记区手写板：与标注引擎同一套笔画格式（归一化 + 平滑） */
  function noteDrawOn(id, silent) {
    const wrap = $('#noteCv'); if (!wrap) return;
    wrap.style.display = '';
    const dt = $('#drawTools'); if (dt) dt.style.display = '';
    const bd = $('#btnDraw'); if (bd) bd.classList.add('on');
    const cv = wrap.querySelector('canvas');
    const n = ZS.data.notes[id];
    nd = nd && nd.id === id ? nd : { id: id, wi: 3, color: NC[0], mode: 'pen', scroll: false, cur: null, dirty: false };
    nd.strokes = n.strokes;

    cv.style.pointerEvents = nd.scroll ? 'none' : 'auto';
    cv.style.touchAction = nd.scroll ? 'pan-y' : 'none';
    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      ANNO.paintOn(cv, nd.strokes.concat(nd.cur ? [nd.cur] : []), w, h);
    };
    resize();
    if (nd.ro) nd.ro.disconnect();
    nd.ro = new ResizeObserver(resize); nd.ro.observe(wrap);

    const colors = $('#nColors');
    if (colors && !colors.dataset.done) {
      colors.dataset.done = '1';
      NC.forEach((c, i) => {
        const b = document.createElement('span');
        b.className = 'sw' + (i === 0 ? ' on' : '');
        b.style.background = c;
        b.onclick = () => {
          nd.color = c; nd.mode = 'pen';
          colors.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); b.classList.add('on');
          noteToolSync();
        };
        colors.appendChild(b);
      });
      $('#drawTools').querySelectorAll('[data-n]').forEach(btn => btn.onclick = () => ZS_NOTETOOL(btn.dataset.n));
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    cv.onpointerdown = e => {
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) { }
      nd.cur = { c: nd.mode === 'eraser' ? '#000' : nd.color,
                 w: NW[nd.wi] * (nd.mode === 'eraser' ? 8 : 1),
                 e: nd.mode === 'eraser' ? 1 : 0, p: [pos(e)] };
      resize();
    };
    cv.onpointermove = e => {
      if (!nd.cur) return; e.preventDefault();
      let evs = []; try { evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch (_) { }
      if (!evs || !evs.length) evs = [e];
      for (const ev of evs) {
        const q = pos(ev), l = nd.cur.p[nd.cur.p.length - 1];
        if (l && Math.abs(q[0] - l[0]) < 0.0012 && Math.abs(q[1] - l[1]) < 0.0012) continue;
        nd.cur.p.push(q);
      }
      resize();
    };
    const end = () => {
      if (!nd.cur) return;
      nd.strokes.push(nd.cur); nd.cur = null;
      n.strokes = nd.strokes; n.ts = Date.now(); ZS.save();
      $('#noteSum').textContent = noteSummary(n);
      resize();
    };
    cv.onpointerup = end; cv.onpointercancel = end; cv.onpointerleave = end;
    noteToolSync();
    if (!silent) ZS.toast('手写板已打开；想滑动页面时点「✍️ 书写中」切到滚动', 2600);
  }
  function noteToolSync() {
    const dt = $('#drawTools'); if (!dt || !nd) return;
    const mb = dt.querySelector('#noteMode');
    if (mb) {
      mb.textContent = nd.scroll ? '🖐 滚动中（点此书写）' : '✍️ 书写中（点此滚动）';
      mb.classList.toggle('on', nd.scroll);
    }
    ['pen', 'eraser'].forEach(m => {
      const b = dt.querySelector('[data-n="' + m + '"]');
      if (b) b.classList.toggle('on', nd.mode === m);
    });
  }

  /* ---------- 搜索 ---------- */
  function bigrams(t) { t = (t || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, ''); const s = []; for (let i = 0; i < t.length - 1; i++) s.push(t.slice(i, i + 2)); return s; }
  async function renderSearch() {
    showQNav(false);
    await needLect();
    shell(`<div id="searchbox"><input id="sq" placeholder="搜索题目 / 解析 / 讲义 / 笔记" value="${esc(S.searchQ)}">
      <button class="btn main" onclick="ZS_DOSEARCH()">搜索</button></div>
      <div id="sres"></div>`);
    const inp = $('#sq');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    inp.addEventListener('input', debounce(() => doSearch(), 350));
    if (S.searchQ) doSearch(); else $('#sres').innerHTML = '<div class="empty">输入关键词开始搜索<br><span class="tiny">例：空想社会主义 / 生产力 / 矛盾</span></div>';
    setTimeout(() => inp.focus(), 80);
  }
  function debounce(f, ms) { let t; return function () { clearTimeout(t); t = setTimeout(f, ms); }; }
  function doSearch() {
    const kw = ($('#sq') || {}).value || '';
    S.searchQ = kw;
    const res = $('#sres'); if (!res) return;
    const k = kw.trim();
    if (k.length < 1) { res.innerHTML = ''; return; }
    const out = [];
    const push = (q, src, text, field) => out.push({ q: q, src: src, text: text, field: field });
    S.qs.forEach(q => {
      const parts = [];
      if (q.stem.includes(k)) parts.push(['题干', q.stem]);
      ['A','B','C','D'].forEach(x => { if ((q.options[x] || '').includes(k)) parts.push(['选项' + x, q.options[x]]); });
      parts.forEach(p => push(q, p[0], highlight(p[1], k), 'q'));
      const aRaw = q.analysisRaw || '';
      if (aRaw.includes(k)) push(q, '解析', highlight(cut(aRaw, k), k), 'a');
      (q.kPages || []).forEach(n => { const t = S.lk[n]; if (t && t.includes(k)) push(q, '知识清单 P' + n, highlight(cut(t, k), k), 'k:' + n); });
      (q.sPages || []).forEach(n => { const t = S.ls[n]; if (t && t.includes(k)) push(q, '速成班 P' + n, highlight(cut(t, k), k), 's:' + n); });
      const nt = ZS.data.notes[q.id];
      if (nt && stripTags(nt.text || '').includes(k)) push(q, '我的笔记', highlight(cut(stripTags(nt.text), k), k), 'n');
    });
    // 去重：同题同来源只留第一条
    const seen = new Set(), list = [];
    out.forEach(o => { const key = o.q.id + '|' + o.src; if (seen.has(key)) return; seen.add(key); list.push(o); });
    const head = `<div class="tiny muted" style="margin:6px 2px 10px">找到 ${list.length} 条结果${list.length > 300 ? '（只显示前 300 条）' : ''}</div>`;
    res.innerHTML = head + `<div class="card">` + list.slice(0, 300).map(o =>
      `<div class="hit" onclick="ZS_GO('q/${o.q.id}')">
        <div class="h">${esc(o.q.chapter)} 第 ${o.q.no} 题 · ${esc(o.src)}</div>
        <div class="s">${o.text}</div></div>`).join('') + `</div>`;
  }
  const stripTags = h => String(h || '').replace(/<[^>]+>/g, ' ');
  function cut(t, k) {
    const i = t.indexOf(k);
    if (i < 0) return t.slice(0, 160);
    return (i > 40 ? '…' : '') + t.slice(Math.max(0, i - 40), i + 140) + '…';
  }
  function highlight(t, k) {
    return esc(t).split(esc(k)).join('<mark>' + esc(k) + '</mark>');
  }

  /* ---------- 我的 ---------- */
  function renderMe() {
    showQNav(false);
    const all = S.qs.map(q => q.id), st = statOf(all);
    const cfg = ZS.cfg();
    const sz = (JSON.stringify(ZS.data).length / 1024).toFixed(0);
    shell(`<div class="sec-title">学习统计</div>
      <div class="card pad">
        <div class="prog" style="color:var(--ink)">
          <div style="background:#f1f5f4"><b>${st.done}</b><span>已做</span></div>
          <div style="background:#f1f5f4"><b>${st.right}</b><span>做对</span></div>
          <div style="background:#f1f5f4"><b>${st.wrong}</b><span>做错</span></div>
        </div>
        <div class="tiny muted" style="margin-top:10px">正确率 ${st.done ? (st.right / st.done * 100).toFixed(1) : '—'}%　蒙对 ${st.guess} 题　收藏 ${all.filter(id => flag(id, 'star')).length} 题</div>
      </div>
      <div class="sec-title">云端同步</div>
      <div class="card pad">
        <div class="tiny muted">数据仓库：${esc(cfg.owner)}/${esc(cfg.repo)} · 文件 ${esc(cfg.file)}<br>
        本地数据量约 ${sz} KB　${ZS.lastSync ? '上次同步 ' + ZS.fmt(ZS.lastSync) : '尚未同步'}</div>
        <div class="acts">
          <button class="btn main" onclick="ZS_SYNC()">☁️ 立即同步</button>
          <button class="btn" onclick="ZS_CFG()">设置令牌</button>
          <button class="btn" onclick="ZS_EXPORT()">导出备份</button>
        </div>
      </div>
      <div class="sec-title">使用帮助</div>
      <div class="card pad tiny muted" style="line-height:1.9">
        <b>三种做笔记的方式</b><br>
        ① 题目下方「✍️ 在题目与选项上做笔记」（题干与四个选项在同一张画布上）<br>
        ② 解析、讲义区里的「✍️ 在截图上/文字上做笔记」<br>
        ③ 题目右上 <b>📝</b>（或底部「打开笔记」）→ 文字 + 手写 + 插图<br>
        工具条：六色笔 / 荧光 / 橡皮 / 粗细 / 撤销 / 清空 / 完成。笔画按比例保存，换设备不错位。<br>
        写完点「✓ 完成」后，<b>笔记会一直显示在原文上</b>；想临时看清原文，点顶栏的 <b>👁</b> 一键隐藏/显示全部笔记。<br><br>
        <b>做题与标记</b><br>
        提交后自动判卷；「直接看答案」不计入记录；答对但其实是蒙的，点「标记为蒙对」，首页可专门复习。<br>
        <b>笔记可见性</b>：没做题之前，解析、讲义和你的笔记都锁着，做完才出现。<br>
        <b>搜索</b>：一次搜题干 / 选项 / 解析 / 两份讲义 / 你自己的笔记。<br>
        <b>讲义翻页</b>：自动匹配的是最相关那一页，若想找相邻内容，用「◀ 上一页 / 下一页 ▶」。
      </div>
      <div class="sec-title">关于</div>
      <div class="card pad tiny muted">
        题库来源：《考研政治全真模拟 720 题》试题册 + 解析册（共 785 题，含单选 386 / 多选 399）。<br>
        讲义：①《考研政治知识清单》②《速成班知识点一遍过讲义（大李子）》。<br>
        解析与讲义截图版权归原作者所有，仅供个人学习查阅，请勿传播。
      </div>`);
  }

  /* ---------- 对外接口 ---------- */
  window.ZS_GO = h => go(h);
  window.ZS_ACC = el => el.parentElement.classList.toggle('open');
  window.ZS_TAB = (el, t) => {
    el.parentElement.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    el.classList.add('on');
    $('#lectK').style.display = t === 'k' ? '' : 'none';
    $('#lectS').style.display = t === 's' ? '' : 'none';
  };
  window.ZS_SEL = (id, k) => {
    const q = S.byId[id]; const sel = S['sel_' + id] = S['sel_' + id] || [];
    const i = sel.indexOf(k);
    if (i >= 0) sel.splice(i, 1);
    else { if (!q.multi) sel.length = 0; sel.push(k); }
    renderQuestion(id);
  };
  window.ZS_CLR = id => { S['sel_' + id] = []; renderQuestion(id); };
  window.ZS_SUBMIT = id => {
    const q = S.byId[id], sel = S['sel_' + id] || [];
    if (!sel.length) return ZS.toast('先选一个答案');
    const ok = sel.slice().sort().join('') === q.answer.split('').sort().join('');
    setProg(id, ok, false);
    renderQuestion(id);
    ZS.toast(ok ? '✔ 做对了' : '✘ 答案：' + q.answer);
    const r = document.querySelector('#view .res');
    if (r) setTimeout(() => r.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };
  window.ZS_REVEAL = id => { S['rev_' + id] = true; renderQuestion(id); };
  window.ZS_REDO = id => { delete ZS.data.progress[id]; delete S['rev_' + id]; ZS.save(); S['sel_' + id] = []; renderQuestion(id); };
  window.ZS_GUESS = id => { const p = P(id); if (p) { p.guess = !p.guess; p.ts = Date.now(); ZS.save(); } renderQuestion(id); };
  window.ZS_FLAG = (id, k) => { toggleFlag(id, k); renderQuestion(id); };
  window.ZS_LIST = (key, f) => {
    const [mi, ch] = key.split('-');
    let list = S.qs.filter(q => q.moduleIdx == mi && q.chapter === ch);
    if (f === 'wrong') list = list.filter(q => { const p = P(q.id); return p && p.s === 'wrong'; });
    if (f === 'undone') list = list.filter(q => !isDone(q.id));
    if (!list.length) return ZS.toast('没有符合条件的题目');
    go('q/' + list[0].id);
  };
  window.ZS_RUN = f => {
    let list = S.qs;
    if (f === 'wrong') list = list.filter(q => { const p = P(q.id); return p && p.s === 'wrong'; });
    if (f === 'guess') list = list.filter(q => flag(q.id, 'guess'));
    if (f === 'star') list = list.filter(q => flag(q.id, 'star'));
    if (!list.length) return ZS.toast('没有符合条件的题目');
    go('q/' + list[0].id);
  };
  window.ZS_ANNO = (id, tgt) => {
    const key = id + '|' + tgt;
    let host = document.querySelector('[data-anno="' + key + '"]');
    if (!host && tgt.endsWith('-img')) host = $(`.pgwrap[data-tgt="${tgt}"][data-id="${id}"]`);
    if (!host && tgt === 'a-img') host = $(`.pgwrap[data-tgt="a-imgfull"][data-id="${id}"]`);
    if (!host) return ZS.toast('找不到可标注的区域');
    // 自动展开祖先折叠块
    let p = host;
    while (p && p !== document.body) { if (p.classList && p.classList.contains('acc')) p.classList.add('open'); p = p.parentElement; }
    if (ANNO.on) ANNO.close();
    if (!host.clientWidth || !host.clientHeight) host.style.minHeight = '120px';
    ANNO.open(host, key);
    ZS.toast('书写中：直接涂画；要滑页面就点工具条上的「✍️ 书写中」切换', 2600);
    setTimeout(() => host.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };
  window.ZS_NOTEOPEN = id => openNote(id);
  window.ZS_GONOTE = id => {
    const box = $('#noteBox');
    if (!box || !box.innerHTML.trim()) openNote(id, true);
    setTimeout(() => { const a = document.getElementById('notearea'); if (a) a.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
  };
  window.ZS_NOTESAVE = id => { const n = ZS.data.notes[id] || {}; n.ts = Date.now(); ZS.data.notes[id] = n; ZS.save(true); ZS.toast('笔记已保存 ✓'); };
  window.ZS_NOTEDRAW = id => {
    const w = $('#noteCv'); if (!w) return;
    if (w.style.display === 'none') noteDrawOn(id);
    else {
      w.style.display = 'none';
      const dt = $('#drawTools'); if (dt) dt.style.display = 'none';
      const bd = $('#btnDraw'); if (bd) bd.classList.remove('on');
      if (nd) { const n = ZS.data.notes[id]; n.strokes = nd.strokes; n.ts = Date.now(); ZS.save(); }
    }
  };
  window.ZS_NOTETOOL = a => {
    if (!nd) return;
    if (a === 'mode') {
      nd.scroll = !nd.scroll;
      const wrap = $('#noteCv'), cv = wrap && wrap.querySelector('canvas');
      if (cv) {
        cv.style.pointerEvents = nd.scroll ? 'none' : 'auto';
        cv.style.touchAction = nd.scroll ? 'pan-y' : 'none';
      }
      noteToolSync();
      return ZS.toast(nd.scroll ? '已切到滚动：手指可自由滑页面' : '已切到书写：可以直接写', 1600);
    }
    if (a === 'pen') nd.mode = 'pen';
    else if (a === 'eraser') nd.mode = 'eraser';
    else if (a === 'thin') { nd.wi = Math.max(0, nd.wi - 1); ZS.toast('笔宽 ' + (nd.wi + 1) + '/' + NW.length, 900); }
    else if (a === 'bold') { nd.wi = Math.min(NW.length - 1, nd.wi + 1); ZS.toast('笔宽 ' + (nd.wi + 1) + '/' + NW.length, 900); }
    else if (a === 'undo') { if (nd.strokes.length) { nd.strokes.pop(); noteRepaint(); ZS.toast('撤销一笔', 900); } else ZS.toast('没有可撤销的笔画'); }
    else if (a === 'clear') {
      if (!nd.strokes.length) return ZS.toast('手写板还没有内容');
      ZS.confirm('清空本题的手写笔记？', () => {
        nd.strokes.length = 0;
        const n = ZS.data.notes[nd.id];
        if (n) { n.strokes = nd.strokes; n.ts = Date.now(); ZS.save(); $('#noteSum').textContent = noteSummary(n); }
        noteRepaint(); ZS.toast('已清空');
      });
    }
    noteToolSync();
  };
  function noteRepaint() {
    const wrap = $('#noteCv'); if (!wrap || !nd) return;
    const cv = wrap.querySelector('canvas');
    const n = ZS.data.notes[nd.id];
    if (n) { n.strokes = nd.strokes; n.ts = Date.now(); ZS.save(); }
    ANNO.paintOn(cv, nd.strokes, wrap.clientWidth, wrap.clientHeight);
  }
  window.ZS_NOTEDEL = id => {
    ZS.confirm('删除本题的全部笔记（文字 + 手写 + 图片）？', () => {
      delete ZS.data.notes[id];
      if (nd && nd.id === id) nd = null;
      ZS.save(true); renderNote(id); ZS.toast('已删除');
    });
  };
  window.ZS_PICDEL = (id, i) => {
    ZS.confirm('删除这张图片？', () => {
      const n = ZS.data.notes[id]; n.pics.splice(i, 1); n.ts = Date.now(); ZS.save(); drawPics(id);
    });
  };
  window.ZS_DOSEARCH = doSearch;
  window.ZS_PG = (id, kind, d) => {
    const q = S.byId[id];
    const pages = kind === 'a' ? q.aPages : (kind === 'k' ? q.kPages : q.sPages);
    let cur = S['pg_' + kind + '_' + id] || (pages && pages[0]) || 0;
    const all = (pages || []).slice();
    if (all.indexOf(cur) < 0) all.push(cur);
    let i = all.indexOf(cur) + d;
    if (i < 0) i = 0;
    if (i > all.length - 1) { i = all.length - 1; }
    S['pg_' + kind + '_' + id] = all[i];
    if (kind === 'a') {
      const box = $('#aPages'); if (box) box.innerHTML = aBoxHtml(q);
      ANNO.renderScope(box || document.getElementById('view'));
    } else {
      q._lectDone = 1; paintLect(q);
    }
    ZS.toast(PAGE_NAME[kind] + ' 第 ' + (all[i] - (PAGE_OFF[kind] || 0)) + ' 页');
  };
  function shiftList(pages, n) {
    const s = new Set(pages || []); s.add(n); return Array.from(s).sort((a, b) => a - b);
  }
  window.ZS_ZOOM = img => {
    let m = document.getElementById('modal');
    m.innerHTML = `<div id="zoomBox">
      <div id="zoomBar">
        <button class="iconbtn" onclick="ZS_ZOOMSET('fit')">适应宽度</button>
        <button class="iconbtn" onclick="ZS_ZOOMSET('100')">原始大小</button>
        <button class="iconbtn" onclick="ZS_ZOOMSET('200')">放大 2×</button>
        <span style="flex:1"></span>
        <button class="iconbtn" onclick="ZS_CFGCLOSE()">✕ 关闭</button>
      </div>
      <div id="zoomScroll"><img id="zoomImg" src="${img.src}" alt=""></div>
    </div>`;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    window.__zoomSrc = img.src;
    ZS_ZOOMSET(localStorage.getItem('zz720.zoom') || 'fit');
  };
  window.ZS_ZOOMSRC = src => {
    let m = document.getElementById('modal');
    m.innerHTML = `<div id="zoomBox"><div id="zoomBar">
      <span style="flex:1"></span><button class="iconbtn" onclick="ZS_CFGCLOSE()">✕ 关闭</button></div>
      <div id="zoomScroll"><img id="zoomImg" src="${src}"></div></div>`;
    m.classList.add('show');
    ZS_ZOOMSET('fit');
  };
  window.ZS_ZOOMSET = mode => {
    const im = document.getElementById('zoomImg'); if (!im) return;
    localStorage.setItem('zz720.zoom', mode);
    if (mode === 'fit') im.style.width = '100%';
    else im.style.width = mode === '100' ? im.naturalWidth + 'px' : (im.naturalWidth * 2) + 'px';
    im.style.maxWidth = 'none';
  };

  window.ZS_SYNC = async () => {
    const c = ZS.cfg();
    if (!c.token) return ZS_CFG();
    ZS.toast('同步中…');
    await ZS.pull(true); render();
    await ZS.push();
  };
  window.ZS_CFG = () => {
    const c = ZS.cfg();
    let m = document.getElementById('modal');
    m.innerHTML = `<div class="box">
      <h3>☁️ 云端同步设置</h3>
      <div class="tiny muted" style="margin-bottom:10px">填入 GitHub 个人访问令牌（只需勾选 repo 权限）。令牌只保存在这台设备的浏览器里。
      数据文件：<b>${esc(c.owner)}/${esc(c.repo)}</b> → <b>${esc(c.file)}</b></div>
      <div class="fld"><label>GitHub 令牌</label><input id="cfgToken" type="password" placeholder="ghp_..." value="${esc(c.token || '')}"></div>
      <div class="fld"><label>仓库（owner/repo）</label><input id="cfgRepo" value="${esc(c.owner + '/' + c.repo)}"></div>
      <div class="fld"><label>文件路径</label><input id="cfgFile" value="${esc(c.file)}"></div>
      <div class="acts"><button class="btn main" onclick="ZS_CFGSAVE()">保存并同步</button>
      <button class="btn" onclick="ZS_CFGCLOSE()">取消</button></div>
      <div class="tiny muted" style="margin-top:10px">还没有令牌？<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank">点这里创建</a></div>
    </div>`;
    m.classList.add('show');
  };
  window.ZS_CFGCLOSE = () => {
    const m = document.getElementById('modal');
    m.classList.remove('show'); m.innerHTML = '';
    document.body.style.overflow = '';
  };
  window.ZS_CFGSAVE = async () => {
    const t = $('#cfgToken').value.trim();
    const rp = $('#cfgRepo').value.split('/');
    ZS.setCfg({ token: t, owner: rp[0] || 'aokid666', repo: rp[1] || 'zhengzhi-720', file: $('#cfgFile').value.trim() || 'data/userdata.json' });
    ZS_CFGCLOSE();
    await ZS.pull(true); await ZS.push(); render();
  };
  window.ZS.confirm = (msg, cb) => {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="box" style="max-width:380px">
      <div style="font-size:15px;line-height:1.75;margin-bottom:16px">${esc(msg)}</div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn" onclick="ZS_CFGCLOSE()">取消</button>
        <button class="btn main" id="cfmOk">确定</button>
      </div></div>`;
    m.classList.add('show');
    document.getElementById('cfmOk').onclick = () => { ZS_CFGCLOSE(); try { cb(); } catch (e) { } };
  };
  window.ZS_EXPORT = () => {
    const blob = new Blob([JSON.stringify(ZS.data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'zhengzhi720-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  };

    window.ZS_ANNOVIS = () => {
    ANNO.setVisible(!ANNO.visible);
    const b = document.getElementById('annoVis');
    if (b) { b.classList.toggle('on', ANNO.visible); b.textContent = ANNO.visible ? '👁' : '🚫'; }
    ZS.toast(ANNO.visible ? '已显示笔记' : '已隐藏笔记');
  };
  document.addEventListener('DOMContentLoaded', () => {
    boot();
    const b = document.getElementById('annoVis');
    if (b) { b.classList.toggle('on', ANNO.visible); b.textContent = ANNO.visible ? '👁' : '🚫'; }
  });
})();
