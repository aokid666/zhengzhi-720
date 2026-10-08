/* 720题 主应用 */
const DATA_VER = 43;
const TOC_VER = 2;      // 目录数据单独计数，改动目录不必让题库重新下载
const QUESTION_VER = 45; // 修订选项文字时只刷新题库，不重新下载讲义文字
const APP_VER = 115;     // 每次改动前端都 +1，和 index.html 的 ?v= 保持一致
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { qs: [], byId: {}, lk: {}, ls: {}, route: '', cur: null, searchQ: '', lastPos: {},
              q: null, sb: null, qlist: [], back: [] };
  /* 队列：可同时保存多个。S.qlist = [{id,mode,title,ids,i,sb,ts}]，S.q 指向"当前活动"的那个 */
  const QMODES = { view: '📖 复习', redo: '🔄 原题重做', sb: '🧪 重做区', mock: '🎯 模拟考试' };
  function saveSession() {
    if (S.q) { S.q.sb = S.sb || S.q.sb || null; S.q.ts = Date.now(); }
    try {
      const o = { ts: Date.now(), list: S.qlist || [], cur: S.q ? S.q.id : null,
                  last: localStorage.getItem('zz720.last') || '' };
      localStorage.setItem('zz720.session', JSON.stringify(o));
      ZS.data.session = o;                 // 跟着云端一起同步，换设备能接着上次继续
      ZS.save();
    } catch (e) { }
  }
  function loadSession() {
    try {
      /* 优先用云端合并后的会话（最新的那台设备为准），没有才退回本地 */
      const o = ZS.data.session || JSON.parse(localStorage.getItem('zz720.session') || 'null');
      if (o && Array.isArray(o.list)) {
        S.qlist = o.list;
        const cur = o.list.filter(x => x.id === o.cur)[0] || null;
        S.q = cur; S.sb = cur ? (cur.sb || null) : null;
        if (o.last) localStorage.setItem('zz720.last', o.last);
        localStorage.setItem('zz720.session', JSON.stringify(o));
      }
    } catch (e) { }
    updateQBadge();
  }
  /* 「上次做到哪题」也进同步包 */
  function setLastQ(id) {
    try {
      if (lastQId() === id) return;
      localStorage.setItem('zz720.last', id);
      ZS.data.session = Object.assign({}, ZS.data.session || {}, { last: id, ts: Date.now() });
      ZS.save();
    } catch (e) { }
  }
  const lastQId = () => (ZS.data.session && ZS.data.session.last) ||
                        (localStorage.getItem('zz720.last') || '');
  function updateQBadge() {
    const b = document.getElementById('qbadge');
    if (!b) return;
    const n = (S.qlist || []).length;
    b.textContent = n ? String(n) : '';
    b.style.display = n ? 'block' : 'none';
  }
  function parkQ() {
    if (!S.q && !S.sb) return;
    if (S.q) { S.q.sb = S.sb || S.q.sb; if (S.curId) { const k = S.q.ids.indexOf(S.curId); if (k >= 0) S.q.i = k; } }
    S.q = null; S.sb = null; saveSession(); updateQBadge();
  }
  window.ZS_QGO = id => {
    const q = (S.qlist || []).filter(x => x.id === id)[0];
    if (!q) return;
    if (S.q && S.q.id !== id) parkQ();
    S.q = q; S.sb = q.sb || null; saveSession(); updateQBadge();
    go('q/' + q.ids[Math.min(q.i || 0, q.ids.length - 1)]);
  };
  window.ZS_QDEL = id => {
    const q = (S.qlist || []).filter(x => x.id === id)[0];
    if (!q) return;
    const done = q.sb ? Object.keys(q.sb).length : 0;
    ZS.confirm('结束这个队列吗？\n「' + q.title + '」共 ' + q.ids.length + ' 题'
      + (done ? '\n重做区里还有 ' + done + ' 题未同步，结束后会丢弃。' : ''), () => {
      S.qlist = S.qlist.filter(x => x.id !== id);
      if (S.q && S.q.id === id) { S.q = null; S.sb = null; }
      saveSession(); updateQBadge();
      ZS.toast('已结束该队列');
      if (S.route === 'queue') renderQueues(); else route();
    });
  };
  /* 返回上一页（页内历史栈） */
  window.ZS_BACK = () => {
    if (S.back.length > 1) { S.back.pop(); go(S.back[S.back.length - 1]); }
    else ZS.toast('已经是最开始了');
  };
  const inQ = id => !!(S.q && S.q.ids && S.q.ids.indexOf(id) >= 0);
  const inSb = id => !!(S.q && S.q.mode === 'sb' && inQ(id));

  /* ---------- 数据 ---------- */
  /* 兼容老数据：以前「蒙对」存在 progress[id].guess，统一搬到 flags */
  function migrateGuess() {
    let m = 0;
    Object.keys(ZS.data.progress || {}).forEach(id => {
      if (ZS.data.progress[id] && ZS.data.progress[id].guess) {
        const f = ZS.data.flags[id] = ZS.data.flags[id] || { ts: 0 };
        if (!f.guess) { f.guess = true; f.ts = Date.now(); m++; }
        delete ZS.data.progress[id].guess;
      }
    });
    if (m) { ZS.save(); console.log('已迁移 %d 条蒙对标记', m); }
    /* 老数据补艾宾浩斯计划：以前只存了 s/ts，没有 due */
    let b = 0;
    Object.keys(ZS.data.progress || {}).forEach(id => {
      const p = ZS.data.progress[id];
      if (p && p.s && !p.due) {
        p.tries = p.tries || 1;
        p.rights = p.rights || (p.s === 'right' ? 1 : 0);
        p.rv = p.s === 'right' ? 1 : 0;
        p.due = (p.ts || Date.now()) + DAY;
        b++;
      }
    });
    if (b) { ZS.save(); console.log('已为 %d 道老题补上复习计划', b); }
    return m + b;
  }

  /* 老标注是按「题|区域」存的，多张图共用一份 → 迁到具体第一张的 key */
  function migrateAnnoKeys() {
    const A = ZS.data.annos || {};
    let m = 0;
    Object.keys(A).forEach(k => {
      const mm = /^(q\d+)\|(a-img|k-img|s-img)$/.exec(k);
      if (!mm) return;
      const q = S.byId[mm[1]];
      let sfx = '0';
      if (q) {
        if (mm[2] === 'k-img' && q.kPages && q.kPages.length) sfx = String(q.kPages[0]);
        if (mm[2] === 's-img' && q.sPages && q.sPages.length) sfx = String(q.sPages[0]);
      }
      A[k + '-' + sfx] = A[k];
      delete A[k];
      m++;
    });
    /* 讲义截图：过去笔记绑在题目上（q090|k-img-59）→ 迁成按页共享（_lec|k-img-59）
       这样在「缩略讲义」里写的和在题目里写的是同一份；同一页有多份就合并笔画 */
    Object.keys(A).forEach(k => {
      const mm = /^q\d+\|([ks])-img-(\d+)$/.exec(k);
      if (!mm) return;
      const src = A[k];
      if (!src) return;
      const nk = LECID + '|' + mm[1] + '-img-' + mm[2];
      if (A[nk] && A[nk].strokes) {
        const have = new Set(A[nk].strokes.map(s => JSON.stringify(s.p)));
        (src.strokes || []).forEach(s => {
          const sig = JSON.stringify(s.p);
          if (!have.has(sig)) { A[nk].strokes.push(s); have.add(sig); }
        });
        A[nk].ts = Math.max(A[nk].ts || 0, src.ts || 0);
      } else {
        A[nk] = { ts: src.ts || Date.now(), strokes: (src.strokes || []).slice() };
      }
      delete A[k];
      m++;
    });
    if (m) { ZS.save(); }
  }

  /* ---------- 夜间模式 ---------- */
  const THEMES = { auto: '跟随系统', light: '浅色', dark: '深色' };
  const themePref = () => { try { return localStorage.getItem('zz720.theme') || 'auto'; } catch (e) { return 'auto'; } };
  const systemDark = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  function applyTheme() {
    const t = themePref();
    const dark = t === 'dark' || (t === 'auto' && systemDark());
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const b = document.getElementById('themeBtn');
    if (b) b.textContent = dark ? '☀️' : '🌙';
    applyInvert();
  }
  window.ZS_THEME = v => {
    if (v) { try { localStorage.setItem('zz720.theme', v); } catch (e) { } }
    applyTheme();
    if (v) ZS.toast('外观：' + THEMES[v], 1500);
    if (S.qs.length) route();
  };
  /* 顶栏那个按钮：浅色↔深色 直接切（想跟随系统去「我的」页选） */
  window.ZS_THEMESWAP = () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark';
    ZS_THEME(cur ? 'light' : 'dark');
  };

  /* 截图反转偏好：auto 跟随外观 / on 反转 / off 不反转 */
  const INVERTS = { auto: '跟随外观', on: '反转', off: '不反转' };
  const invPref = () => { try { return localStorage.getItem('zz720.invert') || 'auto'; } catch (e) { return 'auto'; } };
  function applyInvert() {
    const t = invPref();
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const on = t === 'on' || (t === 'auto' && dark);
    document.documentElement.setAttribute('data-invert', on ? 'on' : 'off');
    /* 笔色是按页面明暗换的，切换后要把已画的笔迹重绘一遍 */
    try { if (window.ANNO && ANNO.repaintAll) ANNO.repaintAll(); } catch (e) { }
  }
  window.ZS_INVERT = v => {
    if (v) { try { localStorage.setItem('zz720.invert', v); } catch (e) { } }
    applyInvert();
    if (v) ZS.toast('截图反转：' + INVERTS[v], 1500);
    if (S.qs.length) route();
  };


  /* ---------- 同步诊断 ---------- */
  window.ZS_DIAG = async () => {
    const c = ZS.cfg();
    const m = document.getElementById('modal');
    const rows = [];
    const add = (k, v) => rows.push([k, v]);
    const tok = (c.token || '').trim();
    m.innerHTML = '<div class="box"><h3>🩺 同步诊断</h3><div class="tiny muted">检查中…</div></div>';
    m.classList.add('show');
    const msg = ZS.lastErr || '';

    add('版本', '前端 v' + APP_VER + ' · 题库 v' + QUESTION_VER + ' · 讲义 v' + DATA_VER);
    add('令牌', tok ? '已配置（' + esc(tok.slice(0, 7)) + '…）' : '❌ <b>没配置</b>');
    add('仓库', esc(c.owner) + '/' + esc(c.repo) + ' @ ' + esc(c.branch));
    add('数据文件', esc(c.file));
    add('本机记录', Object.keys(ZS.data.progress || {}).length + ' 题');
    add('最近成功', ZS.lastOkAt ? esc(ZS.fmt(ZS.lastOkAt)) : '<span style="color:var(--warn)">从未</span>');
    add('最近失败', msg ? '<span style="color:var(--bad)">' + esc(msg) + '</span>' +
        (ZS.lastErrAt ? '<br><span class="tiny muted">' + esc(ZS.fmt(ZS.lastErrAt)) + '</span>' : '')
      : '<span class="tiny muted">无</span>');

    if (!tok) {
      add('结论', '👉 这台设备<b>没有令牌</b>，所以完全不会同步。点下面「重新设置令牌」或「用账号密码登录」。');
    } else {
      const hdr = { Authorization: 'token ' + tok, Accept: 'application/vnd.github+json' };
      const api = 'https://api.github.com/repos/' + c.owner + '/' + c.repo;
      try {
        const r = await fetch('https://api.github.com/user', { headers: hdr });
        if (r.status === 200) { const u = await r.json(); add('① 令牌验证', '✅ 有效（账号 ' + esc(u.login) + '）'); }
        else add('① 令牌验证', '❌ ' + esc(ZS.explain(r.status)));
      } catch (e) { add('① 令牌验证', '❌ 网络不通：' + esc(e.message)); }
      try {
        const r = await fetch(api, { headers: hdr });
        if (r.ok) { const d = await r.json(); add('② 仓库读取', '✅ 可访问（' + (d.private ? '私有' : '公开') + '）'); }
        else add('② 仓库读取', '❌ ' + esc(ZS.explain(r.status)));
      } catch (e) { add('② 仓库读取', '❌ ' + esc(e.message)); }
      try {
        const r = await fetch(api + '/contents/' + c.file + '?ref=' + c.branch, { headers: hdr });
        if (r.ok) {
          const j = await r.json();
          let info = '✅ 存在（' + Math.round(j.size / 1024) + ' KB）';
          try {
            const bin = atob((j.content || '').replace(/\s/g, ''));
            const by = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i);
            const remote = JSON.parse(new TextDecoder().decode(by));
            info += '<br><span class="tiny muted">云端 ' + Object.keys(remote.progress || {}).length +
              ' 题有记录，最后更新 ' + esc(ZS.fmt(remote.updated)) + '</span>';
          } catch (e) { }
          add('③ 云端数据', info);
        } else if (r.status === 404) add('③ 云端数据', '⚠️ 还没有（第一次同步会自动创建）');
        else add('③ 云端数据', '❌ ' + esc(ZS.explain(r.status)));
      } catch (e) { add('③ 云端数据', '❌ ' + esc(e.message)); }
      add('结论', '三项全 ✅ 却还不同步，把这一页截图发我。');
    }

    m.innerHTML = '<div class="box"><h3>🩺 同步诊断</h3>' +
      '<div style="max-height:58vh;overflow:auto">' +
      rows.map(r => '<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px;line-height:1.6">' +
        '<div style="flex:0 0 76px;color:var(--ink3)">' + r[0] + '</div><div style="flex:1;word-break:break-all">' + r[1] + '</div></div>').join('') +
      '</div><div class="acts"><button class="btn main" onclick="ZS_SYNC()">立即同步</button>' +
      '<button class="btn" onclick="ZS_CFG()">重新设置令牌</button>' +
      '<button class="btn" onclick="ZS_CFGCLOSE()">关闭</button></div></div>';
  };

  /* ---------- 登录门禁 ---------- */
  const needGate = () => !ZS.cfg().token && ZS.cfg().gate !== '0';

  async function showGate() {
    const g = document.getElementById('gate');
    document.body.classList.add('gated');
    g.classList.add('show');
    g.innerHTML = '<div class="gatebox"><div class="lock">🔒</div><h3>检查中…</h3></div>';
    let blob = null;
    try { blob = await ZS.fetchLogin(); } catch (e) { }
    if (!blob) {
      g.innerHTML = `<div class="gatebox">
        <div class="lock">🔒</div>
        <h3>这台设备还没配置</h3>
        <div class="tiny muted" style="text-align:center;line-height:1.8">
          云端还没有「登录密码」。<br>可以先用 GitHub 令牌进，进后再设置登录密码。</div>
        <div class="acts" style="margin-top:14px;justify-content:center">
          <button class="btn main" onclick="ZS_CFG()">用令牌进入</button></div>
      </div>`;
      return;
    }
    g.innerHTML = `<div class="gatebox">
      <div class="lock">🔒</div>
      <h3>请输入账号密码</h3>
      <div class="fld"><label>账号</label>
        <input id="gUser" autocapitalize="off" autocorrect="off" autocomplete="username" value="${esc(blob.hint || '')}"></div>
      <div class="fld"><label>密码</label>
        <input id="gPass" type="password" autocomplete="current-password"></div>
      <div class="acts" style="margin-top:16px;justify-content:center">
        <button class="btn main" id="gGo">进入</button></div>
      <div class="tiny muted" id="gMsg" style="text-align:center;margin-top:10px;min-height:20px"></div>
      <div class="acts" style="justify-content:center;margin-top:14px">
        <button type="button" class="btn" id="gEsc" style="font-size:13px">忘了密码？改用 GitHub 令牌进入</button>
      </div>
    </div>`;
    const go = () => ZS_UNLOCK();
    document.getElementById('gGo').onclick = go;
    document.getElementById('gPass').onkeydown = e => { if (e.key === 'Enter') go(); };
    document.getElementById('gUser').onkeydown = e => { if (e.key === 'Enter') go(); };
    const esc2 = document.getElementById('gEsc');
    if (esc2) esc2.onclick = () => ZS_CFG();
  }

  window.ZS_UNLOCK = async () => {
    const u = document.getElementById('gUser').value.trim();
    const p = document.getElementById('gPass').value;
    const msg = document.getElementById('gMsg');
    if (!u || !p) { msg.textContent = '账号和密码都要填'; return; }
    if (!window.crypto || !crypto.subtle) { msg.textContent = '此浏览器不支持加密，请用 Safari 打开'; return; }
    msg.textContent = '正在解锁…';
    try {
      const token = await ZS.unlock(u, p);
      ZS.setCfg({ token: token });
      /* 令牌已就位，这时才能把老格式密文升级成 v2 */
      try { await ZS.upgradeLogin(u, p, token); } catch (e) { }
      msg.textContent = '✅ 成功，正在载入…';
      setTimeout(() => location.reload(), 400);
    } catch (e) { msg.textContent = '❌ ' + e.message; }
  };

  function passVeryWeak(p) { return p.length < 12; }
  function passScore(p) {
    let s = 0;
    if (p.length >= 12) s++;
    if (p.length >= 16) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }
  window.ZS_SETPASS = () => {
    const c = ZS.cfg();
    if (!c.token) return ZS_CFG();
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="box">
      <h3>🔐 设置登录密码</h3>
      <div class="tiny muted" style="margin-bottom:10px">
        密码只在本机用来<b>加密令牌</b>，不会上传、我也看不到。<br>
        之后任何设备输入这个账号密码，就能自动拿到令牌、不用再贴长串令牌。</div>
      <div class="fld"><label>账号（自己起个名，比如 aokid）</label>
        <input id="spUser" value="${esc((ZS.data.session && ZS.data.session.user) || 'aokid')}" autocapitalize="off"></div>
      <div class="fld"><label>密码（至少 12 位，建议大小写+数字+符号）</label>
        <input id="spPass" type="password"></div>
      <div class="fld"><label>再输一次</label><input id="spPass2" type="password"></div>
      <div class="acts"><button class="btn main" onclick="ZS_DOSETPASS()">加密并上传</button>
      <button class="btn" onclick="ZS_CFGCLOSE()">取消</button></div>
      <div class="tiny muted" id="spMsg" style="margin-top:8px;min-height:20px"></div>
    </div>`;
    m.classList.add('show');
  };
  window.ZS_DOSETPASS = async () => {
    const u = document.getElementById('spUser').value.trim();
    const p = document.getElementById('spPass').value;
    const p2 = document.getElementById('spPass2').value;
    const msg = document.getElementById('spMsg');
    if (!u) { msg.textContent = '账号不能空'; return; }
    if (passVeryWeak(p)) { msg.textContent = '❌ 密码太短：至少 12 位（密文是公开的，短密码会被爆破）'; return; }
    if (passScore(p) < 3) { msg.textContent = '❌ 密码太简单：至少要 3 类字符（大小写 / 数字 / 符号）'; return; }
    if (p !== p2) { msg.textContent = '❌ 两次输入不一样'; return; }
    if (!crypto.subtle) { msg.textContent = '此浏览器不支持加密'; return; }
    msg.textContent = '正在加密并上传…';
    try {
      const blob = await ZS.makeLogin(u, p);
      await ZS.saveLogin(blob);
      msg.textContent = '✅ 设置成功！以后新设备输这个账号密码就能进。';
      setTimeout(() => ZS_CFGCLOSE(), 1400);
    } catch (e) { msg.textContent = '❌ ' + e.message; }
  };
  window.ZS_LOGOUT = () => {
    ZS.confirm('退出登录？\n\n会清掉这台设备上保存的令牌，之后打开会要求输账号密码。\n本地记录和云端数据都不动。', () => {
      try { ZS.setCfg({ token: '' }); ZS.forgetDek(); } catch (e) { }
      setTimeout(() => location.reload(), 200);
    });
  };

  const SYNC_LABELS = { unconfigured: '☁️ 本机保存 · 尚未连接云端', offline: '📴 离线 · 联网后自动同步',
    syncing: '☁️ 同步中…', error: '⚠️ 同步需要处理', pending: '☁️ 本机已保存 · 等待同步', synced: '☁️ 已同步' };
  function updateSyncStatus() {
    const status = ZS.status(), label = SYNC_LABELS[status.state];
    const time = status.lastOkAt ? new Date(status.lastOkAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const el = $('#syncStatus');
    if (el) {
      el.dataset.state = status.state;
      el.textContent = label + (status.state === 'synced' && time ? ' · ' + time : '');
      el.title = status.error || (status.lastOkAt ? '最近成功：' + ZS.fmt(status.lastOkAt) : '点击查看同步设置');
    }
    const info = $('#mySyncState');
    if (info) info.textContent = label + (status.lastOkAt ? ' · 最近成功 ' + ZS.fmt(status.lastOkAt) : '');
    const error = $('#mySyncError'); if (error) { error.textContent = status.error; error.hidden = !status.error; }
    const homeInfo = $('#syinfo'); if (homeInfo) homeInfo.textContent = label;
  }
  function flushEditors() {
    if (window.ANNO && ANNO.flush) ANNO.flush();
    if (nd && nd.cur) {
      nd.strokes.push(nd.cur); nd.cur = null;
      const note = ZS.data.notes[nd.id];
      if (note) { note.strokes = nd.strokes; note.ts = Date.now(); ZS.save(); }
    }
  }
  function applyRemoteView() {
    updateSyncStatus();
    // 当前题目与讲义保持原位；下一次主动导航时再装配新数据。
    if (S.route.startsWith('q/') || S.route.startsWith('lect/')) {
      S.remotePending = true;
      const hint = $('#syncRemoteHint'); if (hint) hint.hidden = false;
      return;
    }
    const y = window.scrollY;
    loadSession(); route(); window.scrollTo(0, y);
  }

  async function boot() {
    /* 没登录 → 只显示门禁，不加载任何内容 */
    applyTheme();
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { } }
    if (needGate()) { showGate(); return; }
    try {
      const r = await fetch('data/questions.json?v=' + QUESTION_VER);
      S.qs = await r.json();
      const topicalResponse = await fetch('data/topical-exercises.json?v=' + QUESTION_VER);
      if (!topicalResponse.ok) throw new Error('速成班专题题库加载失败');
      S.qs.push(...await topicalResponse.json());
    } catch (e) { document.body.innerHTML = '<div class="empty">题库加载失败：' + esc(e.message) + '</div>'; return; }
    S.qs.forEach(q => S.byId[q.id] = q);
    try { S.sprintQs = await MANUAL.load(); S.judgeQs = MANUAL.judgements; S.sprintQs.concat(S.judgeQs).forEach(q => S.byId[q.id] = q); }
    catch(e) { S.sprintQs = []; S.judgeQs = []; console.error(e); }
    ZS.load();
    loadSession();
    if (lastQId() && lastQId().startsWith('pr-')) { try { await PRACTICE.ensureQuestion(lastQId(),S); } catch(e) { console.error(e); } }
    migrateGuess();
    migrateAnnoKeys();
    window.addEventListener('hashchange', route);
    route();
    document.addEventListener('zs-state', updateSyncStatus);
    document.addEventListener('zs-synced', updateSyncStatus);
    document.addEventListener('zs-remote', applyRemoteView);
    updateSyncStatus();
    ZS.startSync();
    /* 自动同步失败不再静默：弹一次提示，引导去诊断 */
    let lastErrToast = 0;
    document.addEventListener('zs-error', () => {
      if (Date.now() - lastErrToast < 60000) return;
      lastErrToast = Date.now();
      ZS.toast('⚠️ 云同步失败，去「我的 → 🩺 同步诊断」看看原因', 4200);
    });
    /* 切走时推送；切回来时自动拉一次，保证换设备后接着用 */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { flushEditors(); ZS.push(true); return; }
      if (ZS.cfg().token) ZS.sync(true);
    });
    /* 安卓上 pagehide 比 visibilitychange 更可靠（切后台/锁屏/回桌面都可能只触发它） */
    window.addEventListener('pagehide', () => { flushEditors(); ZS.push(true); });
  }

  async function needLect() {
    if (Object.keys(S.lk).length) return;
    try { S.lk = await (await fetch('data/lecture-k.json?v=' + DATA_VER)).json(); } catch (e) { S.lk = {}; }
    try { S.ls = await (await fetch('data/lecture-s.json?v=' + DATA_VER)).json(); } catch (e) { S.ls = {}; }
  }

  /* ---------- 进度 ---------- */
  const P = id => ZS.data.progress[id] || null;
  const isDone = id => { const p = P(id); return !!(p && p.s); };
  function savedSelection(id, p) {
    if (!p) return null;
    if (Array.isArray(p.sel)) return p.sel;
    // v99 及更早版本只在作答历史里保存选择。仅当时间和对错与当前进度匹配时恢复，
    // 避免多次作答或跨设备同步后把另一轮的选项当成当前选项。
    const matching = (ZS.data.hist[id] || []).filter(x => typeof x.s === 'string' &&
      /^[ABCD]+$/.test(x.s) && Math.abs((x.t || 0) - (p.ts || 0)) <= 2000 &&
      !!x.r === (p.s === 'right'));
    if (!matching.length) return null;
    return matching.sort((a, b) => b.t - a.t)[0].s.split('');
  }
  /* 艾宾浩斯复习间隔（天）：答对进下一档，答错回到第 1 档 */
  const EB = [1, 2, 4, 7, 15, 30];
  const DAY = 86400000;
  const fmtDur = ms => {
    const s2 = Math.floor(ms / 1000);
    return Math.floor(s2 / 60) + ' 分 ' + String(s2 % 60).padStart(2, '0') + ' 秒';
  };
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function setProg(id, right, guess, sel) {
    const p = ZS.data.progress[id] = ZS.data.progress[id] || { tries: 0, rights: 0, rv: 0 };
    p.tries = (p.tries || 0) + 1;
    if (right) p.rights = (p.rights || 0) + 1;
    p.s = right ? 'right' : 'wrong';
    p.sel = (sel || []).slice();
    p.guess = !!guess;
    p.ts = Date.now();
    if (right && !p.guess) { p.rv = Math.min((p.rv || 0) + 1, EB.length); p.due = Date.now() + EB[p.rv - 1] * DAY; }
    else if (right) { p.due = Date.now() + EB[0] * DAY; }
    else { p.rv = 0; p.due = Date.now() + DAY / 2; }
    if (!right && autoStar()) { const f = ZS.data.flags[id] = ZS.data.flags[id] || { ts: 0 }; f.star = true; f.ts = Date.now(); }
    delete S['redo_' + id];
    // 新作答按设备/标签页计数，历史记录使用唯一编号，跨设备合并不重复、不少算。
    ZS.recordAnswer(id, right, sel);
    ZS.save();
  }
  const dueNow = id => { const p = P(id); return !p || !p.due || p.due <= Date.now(); };
  /* 错题 / 已订正 */
  const isWrongNow = id => { const p = P(id); return !!(p && p.s === 'wrong'); };
  const isFixed = id => { const p = P(id); return !!(p && p.s === 'right' && (p.tries || 0) > (p.rights || 0)); };
  /* 「错题&蒙对」复习时是否把「已订正」也带上 */
  /* 讲义/解析截图：直读整页 还是 缩略图预览 */
  const thumbMode = () => localStorage.getItem('zz720.thumb') === '1';
  window.ZS_THUMB = () => {
    localStorage.setItem('zz720.thumb', thumbMode() ? '0' : '1');
    ZS.toast(thumbMode() ? '已切到「直读整页」' : '已切到「缩略图预览」（点图放大看原页）');
    route();
  };
  const incFix = () => localStorage.getItem('zz720.incfix') === '1';
  window.ZS_INCFIX = () => {
    localStorage.setItem('zz720.incfix', incFix() ? '0' : '1');
    ZS.toast(incFix() ? '本次复习会带上「已订正」' : '本次复习只看「错题 & 蒙对」');
    route();
  };
  /* 做错自动收藏 */
  const autoStar = () => localStorage.getItem('zz720.autostar') === '1';
  window.ZS_AUTOSTAR = () => {
    localStorage.setItem('zz720.autostar', autoStar() ? '0' : '1');
    ZS.toast(autoStar() ? '已开启：以后做错的题自动加入收藏' : '已关闭：做错自动收藏');
    route();
  };
  function dueText(p) {
    if (!p || !p.due) return '';
    const d = Math.ceil((p.due - Date.now()) / DAY);
    return d > 0 ? ` · 下次复习 ${d} 天后` : ' · 现在可复习';
  }
  function toggleFlag(id, k) {
    const f = ZS.data.flags[id] = ZS.data.flags[id] || { ts: 0 };
    f[k] = !f[k]; f.ts = Date.now(); ZS.save();
  }
  const flag = (id, k) => (ZS.data.flags[id] || {})[k];

  // Keep browsing positions across routes; loading placeholders must not replace them.
  if(window.history && 'scrollRestoration' in window.history)window.history.scrollRestoration='manual';
  const browsePositions = new Map();
  let renderedRoute = null, stopRestore = () => {};
  function restoreBrowsing(y) {
    stopRestore();
    let cancelled = false;
    const view = $('#view'), apply = () => { if(!cancelled)window.scrollTo(0, y); };
    const cancel = () => { cancelled = true; observer?.disconnect(); view.removeEventListener('load', apply, true); ['wheel','touchstart','pointerdown','keydown'].forEach(k=>window.removeEventListener(k,cancel)); clearTimeout(timer); };
    const observer = window.ResizeObserver ? new ResizeObserver(apply) : null;
    if(observer)observer.observe(view);
    view.addEventListener('load', apply, true);
    ['wheel','touchstart','pointerdown','keydown'].forEach(k=>window.addEventListener(k,cancel,{passive:true}));
    const timer = setTimeout(cancel, 2500);
    stopRestore = cancel;
    apply();
    requestAnimationFrame(()=>{if(renderedRoute===S.route)apply();});
  }
  /* ---------- 路由 ---------- */
  function route() {
    let h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) { }
    if (S.remotePending) loadSession();
    if (h !== S.route) {
      if(renderedRoute === S.route)browsePositions.set(S.route, window.scrollY);
      stopRestore();
      if(browsePositions.size>80)browsePositions.delete(browsePositions.keys().next().value);
    }
    S.route = h;
    S.remotePending = false;
    const remoteHint = $('#syncRemoteHint'); if (remoteHint) remoteHint.hidden = true;
    const [p, a] = h.split('/');
    /* 页面历史栈（供返回按钮用） */
    if (S.back[S.back.length - 1] !== h) {
      const previous = S.back.lastIndexOf(h);
      if(previous >= 0) S.back.splice(previous + 1); else S.back.push(h);
    }
    if (S.back.length > 40) S.back.splice(0, S.back.length - 40);
    /* 离开题目页 → 队列「暂存」，可随时从「队列」页继续 */
    if (p !== 'q') parkQ();
    if (p === 'sprint' && a === 'practice') return PRACTICE.render(h, {shell,showQNav,P,flag,isWrongNow,isDone,S});
    if (p === 'sprint' || (p === 'l' && a && /^[78]-/.test(a))) return MANUAL.render(p === 'l' ? (a.startsWith('8-') ? 'sprint/judgements' : 'sprint/questions') : h, {shell,showQNav,P,flag,isWrongNow,isDone,S});
    if (p === 'l' && a) return renderChapter(a);
    if (p === 'q' && a) return renderQuestion(a);
    if (p === 's') return renderSearch();
    if (p === 'me') return renderMe();
    if (p === 'queue') return renderQueues();
    if (p === 'lect' && a) return renderLectAll(a, h.split('/')[2]);
    if (p === 'stat') return renderStat();
    if (p === 'notes') return renderNotes();
    return renderHome();
  }
  const go = h => { location.hash = '#/' + h; };

  function shell(inner, loading = false) {
    const y = renderedRoute === S.route ? window.scrollY : (browsePositions.get(S.route) || 0);
    stopRestore();
    MANUAL.leave();
    PRACTICE.leave();
    flushEditors();
    if (ANNO.on) ANNO.close();
    if (S.lectbarObserver) { S.lectbarObserver.disconnect(); S.lectbarObserver = null; }
    if (S.openNoteId) { ZS.endEdit('notes', S.openNoteId); S.openNoteId = null; }
    if (nd && nd.ro) nd.ro.disconnect(); nd = null;
    document.body.classList.remove('notedraw');
    $('#view').innerHTML = inner;
    S.remotePending = false;
    const hint = $('#syncRemoteHint'); if (hint) hint.hidden = true;
    updateSyncStatus();
    if(loading) { browsePositions.set(S.route,y); renderedRoute=null; }
    else { renderedRoute = S.route; restoreBrowsing(y); }
  }

  function showQNav(on, idx) {
    const bar = document.getElementById('qnav');
    if (!bar) return;
    bar.classList.toggle('show', !!on);
    document.body.classList.toggle('hasqnav', !!on);
    const info = document.getElementById('qnavInfo');
    const Q = S.q;
    const qk = Q ? Q.ids.indexOf(S.curId) : -1;
    if (info) info.textContent = on ? (qk >= 0 ? (qk + 1) + ' / ' + Q.ids.length : (idx + 1) + ' / ' + qPool(S.curId).length) : '';
    const pv = document.getElementById('qnavPrev'), nx = document.getElementById('qnavNext');
    const atFirst = qk >= 0 ? qk <= 0 : idx <= 0;
    const atLast = qk >= 0 ? qk >= Q.ids.length - 1 : idx >= qPool(S.curId).length - 1;
    if (pv) pv.disabled = !on || atFirst;
    if (nx) nx.disabled = !on || atLast;
    const rd = document.getElementById('qnavRedo');
    if (rd) rd.disabled = !on;
    /* 右侧悬浮翻页球 */
    const fab = document.getElementById('qfab');
    if (fab) fab.classList.toggle('show', !!on);
    const fp = document.getElementById('qfabPrev'), fn = document.getElementById('qfabNext');
    if (fp) fp.disabled = !on || atFirst;
    if (fn) fn.disabled = !on || atLast;
  }
  window.ZS_QNAV = d => {
    if (S.q) {
      const k = S.q.ids.indexOf(S.curId);
      const m = (k < 0 ? 0 : k) + d;
      if (m < 0) return ZS.toast('这是本队列的第一题');
      if (m >= S.q.ids.length) return ZS.toast('这是本队列的最后一题');
      go('q/' + S.q.ids[m]);
      return;
    }
    const i = qIndexOf(S.curId);
    if (i < 0) return;
    const n = i + d;
    if (n < 0) return ZS.toast('已经是第一题');
    const pool = qPool(S.curId);
    if (n >= pool.length) return ZS.toast('已经是最后一题');
    go('q/' + pool[n].id);
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
    ids.forEach(id => { const p = P(id); if (p && p.s) { done++; if (p.s === 'right') right++; } if (flag(id, 'guess')) guess++; });
    return { done, right, wrong: done - right, guess, total: ids.length };
  }
  function renderHome() {
    showQNav(false);
    const chs = chapters();
    const all = S.qs.map(q => q.id);
    const st = statOf(all);
    const wrongIds = all.filter(isWrongNow);
    const fixedIds = all.filter(isFixed);
    const guessIds = all.filter(id => flag(id, 'guess'));
    const wgIds = all.filter(id => isWrongNow(id) || flag(id, 'guess'));
    const wgShowIds = all.filter(id => isWrongNow(id) || flag(id, 'guess') || (incFix() && isFixed(id)));
    const starIds = all.filter(id => flag(id, 'star'));
    const doneIds = all.filter(id => isDone(id));
    const dueAll = doneIds.filter(dueNow);
    const dueWrong = wrongIds.filter(dueNow);
    const dueFixed = fixedIds.filter(dueNow);
    const dueStar = starIds.filter(dueNow);
    const last = lastQId();
    const lastQ = last ? S.byId[last] : null;
    let h = `
      <div class="hero">
        <div class="ring"></div>
        <h1>考研政治 · 全真模拟 785 题 + 速成班专题 48 题</h1>
        <p>题目 · 解析 · 讲义 · 手写笔记 · 云端同步</p>
        <div class="prog">
          <div><b>${st.done}</b><span>已做 / ${st.total}</span></div>
          <div><b>${st.right}</b><span>做对</span></div>
          <div><b>${st.wrong}</b><span>做错</span></div>
        </div>
        <div class="bar"><i style="width:${(st.done / st.total * 100).toFixed(1)}%"></i></div>
      </div>
      ${lastQ ? `<div class="tiny muted" style="margin:14px 4px -6px">上次做到：<b style="color:var(--teal)">${esc(lastQ.module)}</b> · ${esc(lastQ.chapter)} 第 ${lastQ.no} 题</div>` : ''}
      <div class="acts">
        ${lastQ ? `<button class="btn main" onclick="ZS_GO('q/${last}')">继续上次</button>` : ''}
        <button class="btn" onclick="ZS_GO('l/first')">从头开始</button>
        <button class="btn" onclick="ZS_GO('s')">🔍 搜索</button>
        <button class="btn" onclick="ZS_LECTPICK()">📚 缩略讲义</button>
      </div>
      <div class="acts">
        <button class="btn warn" onclick="ZS_PICK('wg','错题 & 蒙对')">❌ 错题 &amp; 蒙对 (${wgShowIds.length})</button>
        <button class="btn" onclick="ZS_PICK('star','收藏')">★ 收藏 (${starIds.length})</button>
        <button class="btn ${incFix() ? 'main' : ''}" onclick="ZS_INCFIX()">${incFix() ? '☑' : '☐'} 含已订正 (${fixedIds.length})</button>
      </div>
      <div class="sec-title">📚 速成班讲义 · 习题检测练习</div>
      <div class="card pad">
        <div class="acts">
          <button class="btn main" onclick="ZS_GO('l/5-重点会议')">重点会议习题检测练习 · 33 题</button>
          <button class="btn main" onclick="ZS_GO('l/6-土地政策')">土地政策习题检测练习 · 15 题</button>
        </div>
        <div class="tiny muted">逐题附原讲义解析、对应知识清单和速成班讲义的文字与原页截图。</div>
      </div>
      <div class="sec-title">🚀 冲刺板块</div>
      <div class="card sprint-home"><div class="sprint-home-heading"><b>背诵、练题与易混点复盘</b><a href="#/sprint">查看全部 →</a></div><div class="sprint-home-links"><a href="#/sprint/topics"><b>专题挖空</b><span>123 个专题 →</span></a><a href="#/sprint/practice"><b>选择题 / 笔记</b><span>1389 道练习 →</span></a><a href="#/sprint/questions"><b>手册习题190</b><span>193 道题 →</span></a></div></div>
      <div class="sec-title">🔄 艾宾浩斯复习</div>
      <div class="card pad">
        <div class="tiny muted" style="margin-bottom:6px">答对：复习间隔按 1 / 2 / 4 / 7 / 15 / 30 天递增；答错：回到第 1 档，半天后再来。</div>
        <div class="ebrow"><span class="ebl">全部题目</span><span class="ebc">待复习 <b>${dueAll.length}</b> / 已练 ${doneIds.length}</span><button class="btn tiny" onclick="ZS_PICK('due_all','全部题目 · 今日待复习')">开始复习</button></div>
        <div class="ebrow"><span class="ebl">错题 &amp; 蒙对</span><span class="ebc">待复习 <b>${dueWrong.length}</b> / 共 ${wrongIds.length}</span><button class="btn tiny" onclick="ZS_PICK('due_wgr','错题 & 蒙对 · 今日待复习')">开始复习</button></div>
        <div class="ebsub">
          <button class="chk ${incFix() ? 'on' : ''}" onclick="ZS_INCFIX()">${incFix() ? '✓' : ''}</button>
          <span>本次也把 <b>已订正</b>（${fixedIds.length} 题）一起做</span>
          <span class="tiny muted">待复习 ${dueFixed.length}</span>
        </div>
        <div class="ebrow"><span class="ebl">收藏</span><span class="ebc">待复习 <b>${dueStar.length}</b> / 收藏 ${starIds.length}</span><button class="btn tiny" onclick="ZS_PICK('due_star','收藏 · 今日待复习')">开始复习</button></div>
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
      <div class="acts">
        <button class="btn warn" onclick="ZS_REDO_SET('ch','${key}')">🔄 重做本章（${list.length} 题）</button>
        <button class="btn warn" onclick="ZS_REDO_SET('mi','${list[0].moduleIdx}')">🔄 重做本模块（${
          S.qs.filter(q => String(q.moduleIdx) === String(list[0].moduleIdx)).length} 题）</button>
      </div>
      <div class="card pad" style="margin-top:12px"><div style="display:flex;flex-wrap:wrap;gap:7px">`;
    list.forEach(q => {
      const p = P(q.id);
      const cls = !p || !p.s ? '' : (p.s === 'right' ? 'ok' : 'bad');
      h += `<span class="chip ${p && p.s ? cls : ''}" style="min-width:38px;text-align:center;cursor:pointer;padding:6px 9px;font-size:13.5px"
        onclick="ZS_GO('q/${q.id}')">${q.no}${flag(q.id, 'star') ? '★' : ''}${flag(q.id, 'guess') ? '蒙' : ''}</span>`;
    });
    h += `</div></div>`;
    shell(h);
  }

  /* ---------- 题目 ---------- */
  function qPool(id) { const q=S.byId[id]; return q && q.source === 'p' ? PRACTICE.pool(id) : q && q.exerciseKind === 'judgement' ? (S.manualJudgeIds && S.manualJudgeIds.includes(id) ? S.manualJudgeIds.map(k=>S.byId[k]).filter(Boolean) : (S.judgeQs || [])) : q && q.source === 'm' ? (S.sprintQs || []) : S.qs; }
  function qIndexOf(id) { return qPool(id).findIndex(q => q.id === id); }

  function renderQuestion(id) {
    const q = S.byId[id];
    if (!q && id.startsWith('pr-')) {
      shell('<div class="empty">正在加载本题资料…</div>', true);
      PRACTICE.ensureQuestion(id,S).then(() => { if (S.route === 'q/'+id) { if (S.byId[id]) renderQuestion(id); else shell('<div class="empty">题目不存在</div>'); } }).catch(e => { if(S.route==='q/'+id) shell('<div class="empty">'+esc(e.message)+'，请刷新重试。</div>'); }); return;
    }
    if (!q) { shell('<div class="empty">题目不存在</div>'); return; }
    S.cur = q; S.curId = id;
    setLastQ(id);
    if (q.source === 'p' && q.type !== 'choice') { clearInterval(S._mt); return PRACTICE.renderQuestion(q, {shell,showQNav,P,flag,isWrongNow,isDone,setProg,qIndexOf,renderQuestion,renderNote,paintLect,needLect,S}); }
    showQNav(true, qIndexOf(id));
    const p = P(id);
    const sbRec = inSb(id) ? (S.sb && S.sb[id]) : null;
    const answered = inSb(id) ? !!sbRec : (!!(p && p.s) && !S['redo_' + id]);
    const revealed = answered || !!S['rev_' + id];
    if (revealed) { needLect().then(() => { if (S.cur === q && !q._lectDone) { q._lectDone = 1; paintLect(q); } }); }
    const saved = answered && !sbRec ? savedSelection(id, p) : null;
    const sel = sbRec ? sbRec.sel : answered ? (saved || []) : (S['sel_' + id] || []);
    /* 模拟考计时器 */
    clearInterval(S._mt);
    if (S.q && S.q.mode === 'mock' && S.q.start) {
      const tick = () => {
        const el = document.getElementById('mockTime');
        if (!el) { clearInterval(S._mt); return; }
        const s2 = Math.floor((Date.now() - S.q.start) / 1000);
        el.textContent = String(Math.floor(s2 / 60)).padStart(2, '0') + ':' + String(s2 % 60).padStart(2, '0');
      };
      tick(); S._mt = setInterval(tick, 1000);
    }
    const idx = qIndexOf(id);
    let h = `<div class="card" style="margin-top:12px">
      <div class="qhd">
        <button class="iconbtn" onclick="ZS_GO('${q.source === 'p' ? 'sprint/practice/'+q.bookId : 'l/'+q.moduleIdx+'-'+q.chapter}')">☰</button>
        <span class="idx">${q.source === 'p' ? esc(q.module+' · '+q.chapter)+' · 原题 '+q.originalNo : esc(q.chapter)+' 第 '+q.no+' 题'}</span>
        <span class="chip">${esc(q.section)}</span>
        ${S.q ? `<span class="qchip">${QMODES[S.q.mode] || '📖 复习'} ${S.q.ids.indexOf(id) + 1}/${S.q.ids.length}${S.q.mode === 'mock' ? ' · <b id="mockTime">00:00</b>' : ''}<button onclick="ZS_QEXIT()" title="离开队列（可在底部「队列」继续）">✕</button></span>` : ''}
        <span class="sp"></span>
        ${revealed ? `<button class="iconbtn" onclick="ZS_GONOTE('${id}')">📝</button>` : ''}
        <button class="iconbtn ${flag(id, 'star') ? 'on' : ''}" onclick="ZS_FLAG('${id}','star')">★</button>
      </div>
      <div class="qbody">
        <div id="qbox" data-anno="${id}|q-txt">
        ${q.source === 'p' ? '<p class="tiny muted">'+esc(PRACTICE.index.books.find(b=>b.id===q.bookId).title)+(q.extractionNote?' · '+esc(q.extractionNote):'')+'</p>' : ''}
        <div class="stem">${esc(q.stem)}</div>
        <div id="opts">`;
    Object.keys(q.options).sort().forEach(k => {
      const v = q.options[k];
      let cls = 'opt';
      if (!revealed && sel.includes(k)) cls += ' sel';
      if (revealed) {
        const isRight = q.answer.includes(k), chose = sel.includes(k);
        if (isRight) cls += ' right';
        else if (chose) cls += ' wrong';
        if (chose) cls += ' chosen';
      }
      h += `<div class="${cls}"${revealed ? '' : ` onclick="ZS_SEL('${id}','${k}')"`}>
        <span class="k">${k}</span><span class="v">${esc(v)}</span>
        ${revealed ? `<span class="mk">${sel.includes(k) ? '你选' : ''}${q.answer.includes(k) ? ' ✔' : ''}</span>` : ''}
      </div>`;
    });
    h += `</div></div>`;
    if (revealed) {
      h += `<div class="acts" style="margin-top:0"><button class="btn" onclick="ZS_ANNO('${id}','q-txt')">✍️ 在题目与选项上做笔记</button>
        ${q.source === 'p' ? PRACTICE.questionPdf(q, 'question') : q.source === 'm' ? MANUAL.questionPdf(q, 'question') : q.source === 's' ? pdfLink('s', q.qPages, '打开原讲义题目页') : pdfLink('q', [q.qPage + PAGE_OFF.q], '打开《试题册》PDF')}</div>`;
    }
    if (!revealed) {
      h += `<div class="acts">
        <button class="btn main" onclick="ZS_SUBMIT('${id}')">提交答案</button>
        <button class="btn" onclick="ZS_REVEAL('${id}')">直接看答案</button>
        <button class="btn" onclick="ZS_CLR('${id}')">清除选择</button>
      </div>`;
    } else if (answered) {
      const right = sbRec ? !!sbRec.right : (p && p.s === 'right');
      if (sbRec) {
        const left = S.q.ids.length - S.q.ids.indexOf(id) - 1;
        h += `<div class="res ${right ? 'ok' : 'bad'}">${right ? '✔ 做对了' : '✘ 做错了'} —— 正确答案：${esc(q.answer)}${sel.length ? '，你选了 ' + esc(sel.join('')) : ''}</div>
          <div class="tiny muted" style="margin:8px 2px 0">🧪 这是重做区的作答，<b>暂未</b>写入原记录；本队列还剩 ${left} 题</div>
          <div class="acts">
            <button class="btn main" onclick="ZS_SB_NEXT()">${left ? '下一题 ▸' : '完成并处理'}</button>
            <button class="btn" onclick="ZS_SB_END()">结束并处理</button>
          </div>`;
      } else {
        h += `<div class="res ${right ? 'ok' : 'bad'}">${right ? '✔ 做对了' : '✘ 做错了'} —— 正确答案：${esc(q.answer)}${sel.length ? '，你选了 ' + esc(sel.join('')) : '，此前作答选项未记录'}</div>
          <div class="tiny muted" style="margin:8px 2px 0">📊 这题已做 <b>${p.tries || 1}</b> 次，做对 <b>${p.rights || 0}</b> 次${dueText(p)}</div>
          <div class="acts">
            <button class="btn guess ${flag(id, 'guess') ? 'on' : ''}" onclick="ZS_GUESS('${id}')">${flag(id, 'guess') ? '已标记：蒙对的' : '标记为「蒙对」'}</button>
            <button class="btn" onclick="ZS_REDO('${id}')">重做本题</button>
          </div>`;
      }
    } else {
      h += `<div class="res" style="background:#f2f6f5;color:#45605d">本题未计入记录（直接看了答案）。这题其实是蒙的？标记一下，首页可专门复习。</div>
        ${p && p.tries ? `<div class="tiny muted" style="margin:8px 2px 0">📊 这题已做 <b>${p.tries}</b> 次，做对 <b>${p.rights || 0}</b> 次${dueText(p)}</div>` : ''}
        <div class="acts">
          <button class="btn guess ${flag(id, 'guess') ? 'on' : ''}" onclick="ZS_GUESS('${id}')">${flag(id, 'guess') ? '已标记：蒙对的' : '标记为「蒙对」'}</button>
          <button class="btn" onclick="ZS_REDO('${id}')">重做本题</button>
        </div>`;
    }
    h += `</div></div>`;

    if (revealed) {
      h += `<div class="acc open" id="accA">
        <div class="hd" onclick="ZS_ACC(this)">📖 解析（${q.source === 'p' ? '冲刺资料答案与批注原页' : q.source === 'm' ? '背诵手册参考答案原页' : q.source === 's' ? '速成班讲义原页' : '对应解析册原页'}）<span class="arw">›</span></div>
        <div class="bd">
          <div class="pages" id="aPages">${aBoxHtml(q)}</div>
          <div class="acts"><button class="btn" onclick="ZS_ANNO('${id}','a-img-0')">✍️ 在解析截图上做笔记</button>
          <button class="btn" onclick="ZS_ANNO('${id}','a-txt')">✍️ 在解析文字上做笔记</button>
          ${q.source === 'p' ? PRACTICE.questionPdf(q, 'key') : q.source === 'm' ? MANUAL.questionPdf(q, 'key') : q.source === 's' ? pdfLink('s', q.aPages, '打开讲义解析原页') : pdfLink('a', S['pg_a_' + id] ? shiftList(q.aPages, S['pg_a_' + id]) : q.aPages, '打开《解析册》PDF')}</div>
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
            <span class="tab" data-t="m" onclick="ZS_TAB(this,'m')">背诵手册</span>
          </div>
          <div id="lectK" class="lectbox"></div>
          <div id="lectS" class="lectbox" style="display:none"></div>
          <div id="lectM" class="lectbox" style="display:none"></div>
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
  /* 讲义截图笔记用「共享键」：不绑题目，只绑讲义页，题目里和缩略讲义里看到的是同一份 */
  const LECID = '_lec';
  const PAGE_NAME = { a: '解析册', k: '知识清单', s: '速成班讲义', q: '试题册' };
  const PDFFILE = { a: '解析册', k: '知识清单', s: '速成班讲义', q: '试题册' };
  const IMGEXT = { a: 'webp', k: 'jpg', s: 'jpg' };
  /* 图片 / PDF 放在独立仓库（各自 1GB 额度），同源 aokid666.github.io，可直接引用 */
  const IMGBASE = 'https://aokid666.github.io/zz-img/';   // 速成班讲义 s（原 JPG）
  const KBASE   = 'https://aokid666.github.io/zz-k/';     // 知识清单 k · 原格式 JPEG
  const ACBASE  = 'https://aokid666.github.io/zz-ac/';    // 解析裁切图 · 原格式 JPEG
  const PDFBASE = 'https://aokid666.github.io/zz-pdf/';
  const KINDBASE = { s: IMGBASE, k: KBASE };
  /* 解析裁切图已改为原格式 JPEG（不做格式转码），数据里的文件名仍带 .webp，这里替换扩展名 */
  const acSrc = f => String(f).replace(/\.webp$/i, '.jpg');
  const PDFCHUNK = { a: 20, k: 10, q: 0, s: 0 };     // 0 = 不分卷
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
      href="${PDFBASE}pdf/${encodeURIComponent(c.file)}#page=${c.page}&zoom=page-width">📄 ${label}${c.cnt > 1 ? ' +' : ''}<span class="tiny muted">（第 ${c.first - off} 页）</span></a>`).join('') + jumpBox(kind);
  }

  /* 跳页：输入书上的页码 → 自动选对分卷并打开 */
  function jumpBox(kind) {
    const off = PAGE_OFF[kind] || 0, max = PDFTOTAL[kind] - off;
    return `<span class="pdfjump">跳到第
      <input type="number" inputmode="numeric" min="1" max="${max}" placeholder="__">
      页<button class="btn tiny" onclick="ZS_PDFJ('${kind}', this.previousElementSibling, ${max})">开</button></span>`;
  }
  window.ZS_PDFJ = function (kind, el, max) {
    const n = parseInt((el.value || '').trim(), 10);
    if (!n || n < 1 || n > max) return ZS.toast('请输入 1–' + max + ' 之间的书页码');
    const c = chunkOf(kind, n + (PAGE_OFF[kind] || 0));
    const a = document.createElement('a');
    a.href = PDFBASE + 'pdf/' + encodeURIComponent(c.file) + '#page=' + c.page + '&zoom=page-width';
    a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    ZS.toast('已打开《' + PDFFILE[kind] + '》第 ' + n + ' 页');
  };
  /* 解析区：直接显示「按本题裁切」的高清解析图 */
  function aBoxHtml(q) {
    if (q.source === 'p') return PRACTICE.questionPages(q, 'key');
    if (q.source === 'm') return MANUAL.questionPages(q, 'key');
    if (q.source === 's') {
      return (q.aCrops || []).map((src, i) => `<div class="pgwrap${thumbMode() ? ' thumb' : ''}" data-tgt="a-img" data-id="${q.id}" data-anno="${q.id}|a-img-${i}">
        <img loading="lazy" src="${ACBASE}img/topical/${src}" alt="速成班讲义第 ${q.no} 题解析裁图 ${i + 1}" data-label="速成班讲义 第 ${q.no} 题解析（${i + 1}/${q.aCrops.length}）" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)">
        <button class="annobtn" onclick="ZS_ANNO('${q.id}','a-img-${i}')" title="在解析截图上做笔记">✍️</button>
      </div>`).join('') + '<div class="tiny muted">按题裁切自速成班讲义原页，可点击放大核对。</div>';
    }
    const has = (q.aCrops || []).length;
    if (!has) {
      return `<div class="hint" style="padding:14px">本题解析图尚未生成，可点下方「解析册 PDF」查看。</div>`;
    }
    const inner = q.aCrops.map((src, i) =>
      `<div class="pgwrap crop${thumbMode() ? ' thumb' : ''}" data-tgt="a-img" data-id="${q.id}" data-anno="${q.id}|a-img-${i}">
        <img loading="lazy" src="${ACBASE}img/ac/${acSrc(src)}" alt="本题解析 ${i + 1}" data-label="解析册 第 ${q.aPages[i] - PAGE_OFF.a} 页（本题裁切 ${i + 1}/${q.aCrops.length}）" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)">
        <button class="annobtn" onclick="ZS_ANNO('${q.id}','a-img-${i}')" title="在这一张上做笔记">✍️</button>
      </div>`).join('');
    const more = q.aCrops.length > 1
      ? `<span class="tiny muted" style="align-self:center">本题解析共 ${q.aCrops.length} 张（跨页）</span>` : '';
    return inner + `<div class="pager">${more}
      <span class="tiny muted" style="align-self:center">点击图片可放大</span>
    </div>`;
  }
  window.ZS_AMODE = () => {};

  function pagesHtml(pages, kind, id, label) {
    if (!pages || !pages.length) return '<div class="tiny muted">没找到对应内容。</div>';
    const cur = S['pg_' + kind + '_' + id];
    const off = PAGE_OFF[kind] || 0;
    if (cur && pages.indexOf(cur) < 0) pages = pages.concat([cur]).sort((x, y) => x - y);
    return pages.map(n => {
      const nn = String(n).padStart(4, '0');
      const ext = IMGEXT[kind] || 'webp';
      const pn = n - off;
      const lb = (PAGE_NAME[kind] || label) + (pn >= 1 ? ' 第 ' + pn + ' 页' : ' PDF 第 ' + n + ' 页');
      return `<div class="pgwrap${thumbMode() ? ' thumb' : ''}" data-tgt="${kind}-img" data-id="${LECID}" data-anno="${LECID}|${kind}-img-${n}">
        <img loading="lazy" src="${KINDBASE[kind] || IMGBASE}img/${kind}/${nn}.${ext}" alt="${label} 第${n}页" data-label="${esc(lb)}" onload="ZS_ANNOSYNC()" onclick="ZS_ZOOM(this)">
        <span class="pgno">${PAGE_NAME[kind] || ''} P${n - off >= 1 ? n - off : n}</span>
        <button class="annobtn" onclick="ZS_ANNO('${LECID}','${kind}-img-${n}')" title="在这一页上做笔记（与「缩略讲义」同一份）">✍️</button>
      </div>`;
    }).join('') + `<div class="pager">
      <button class="btn tiny" onclick="ZS_PG('${id}','${kind}',-1)">◀ 上一页</button>
      <button class="btn tiny" onclick="ZS_PG('${id}','${kind}',1)">下一页 ▶</button>
      <button class="btn tiny" onclick="ZS_THUMB()">${thumbMode() ? '📖 直读整页' : '🔳 缩略图预览'}</button>
      <button class="btn tiny" onclick="ZS_GO('lect/${kind}/${Math.max(1, pages[0] - off)}')">📚 浏览整本</button>
      <span class="tiny muted" style="align-self:center">共 ${pages.length} 页 · 可翻页找相邻内容</span>
    </div>`;
  }

  function paintLect(q) {
    MANUAL.paintQuestion(q);
    ['k', 's'].forEach(t => {
      const box = $('#lect' + t.toUpperCase());
      if (!box) return;
      const pages = t === 'k' ? q.kPages : q.sPages;
      if (['m','p'].includes(q.source) && (!pages || !pages.length)) { box.innerHTML = '<div class="hint">没找到'+(t === 'k' ? '知识清单' : '速成班讲义')+'中的相应内容。</div>'; return; }
      const dict = t === 'k' ? S.lk : S.ls;
      let txt = (pages || []).map(n => dict[n] || '').join('\n').trim();
      if (!txt) txt = '（未检索到对应讲义文字，请以截图为准）';
      box.innerHTML = `<div class="pages">${pagesHtml(pages, t, q.id, t === 'k' ? '知识清单' : '速成班讲义')}</div>
        <div class="acts"><button class="btn" onclick="ZS_ANNO('${LECID}','${t}-img-${(t === 'k' ? q.kPages : q.sPages)[0]}')">✍️ 在讲义截图上做笔记</button>
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
  const NW = [0.18, 0.25, 0.34, 0.45, 0.6, 0.8, 1.05, 1.4];   // 同 ANNO.WIDTHS
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
      flushEditors(); ZS.endEdit('notes', id); S.openNoteId = null;
      box.innerHTML = '';
      if (tg) tg.textContent = '打开';
      if (nd && nd.id === id) nd = null;
      document.body.classList.remove('notedraw');
      return;
    }
    if (tg) tg.textContent = '收起';
    const n = ZS.data.notes[id] || (ZS.data.notes[id] = { text: '', strokes: [], pics: [], ts: 0 });
    ZS.beginEdit('notes', id, ['text', 'strokes', 'pics']); S.openNoteId = id;
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
      const current = ZS.data.notes[id] || (ZS.data.notes[id] = n);
      current.text = $('#noteText').innerHTML; current.ts = Date.now(); ZS.save();
      $('#noteSum').textContent = noteSummary(current);
    });
    $('#picIn').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      shrinkImg(f, d => {
        const current = ZS.data.notes[id] || (ZS.data.notes[id] = n);
        current.pics.push(d); current.ts = Date.now(); ZS.save(); drawPics(id); $('#noteSum').textContent = noteSummary(current);
      });
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
      const current = ZS.data.notes[id] || (ZS.data.notes[id] = n);
      current.strokes = nd.strokes; current.ts = Date.now(); ZS.save();
      $('#noteSum').textContent = noteSummary(current);
      resize();
    };
    cv.onpointerup = end; cv.onpointercancel = end; cv.onpointerleave = end;
    noteToolSync();
    if (!silent) ZS.toast('手写板已打开；想滑动页面时点「✍️ 书写中」切到滚动', 2600);
  }
  function noteToolSync() {
    const dt = $('#drawTools'); if (!dt || !nd) return;
    document.body.classList.toggle('notedraw', !nd.scroll && $('#noteCv').style.display !== 'none');
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
    if (S.route !== 's') return;
    if (S.searchScope === 'l') S.searchScope = 'all';
    const mi = S.searchMi === undefined ? '' : S.searchMi;
    const sc = S.searchScope || 'all';
    const mode = S.searchMode || 'questions';
    const dk = S.searchDocKind || 'k';
    shell(`<div class="acts search-modes" role="tablist" aria-label="搜索方式">
      <button role="tab" aria-selected="${mode === 'questions'}" class="btn ${mode === 'questions' ? 'main' : ''}" onclick="ZS_SEARCHMODE('questions')">📝 题目与关联讲义</button>
      <button role="tab" aria-selected="${mode === 'documents'}" class="btn ${mode === 'documents' ? 'main' : ''}" onclick="ZS_SEARCHMODE('documents')">📚 整本讲义内搜索</button>
    </div>
    <div class="tiny muted search-help">${mode === 'documents' ? '像在文档里查找：搜索整本讲义的文字，按命中页定位原页，与题目无关。' : '查找题目、解析、笔记，或仅查与题目关联的讲义页。'}</div>
    <div id="searchbox"><input id="sq" aria-label="搜索关键词" placeholder="${mode === 'documents' ? '输入讲义中的词语' : '搜索题目 / 解析 / 关联讲义 / 笔记'}" value="${esc(mode === 'documents' ? (S.docSearchQ || '') : (S.searchQ || ''))}">
      <button class="btn main" onclick="ZS_DOSEARCH()">搜索</button></div>
    ${mode === 'documents' ? `<div class="acts search-filters" aria-label="选择讲义">
      <button class="btn tiny ${dk === 'k' ? 'main' : ''}" onclick="ZS_SEARCHSET('doc','k')">知识清单</button>
      <button class="btn tiny ${dk === 's' ? 'main' : ''}" onclick="ZS_SEARCHSET('doc','s')">速成班讲义</button>
    </div>` : `
      <div class="acts" style="gap:6px;margin:8px 2px 2px">
        ${['all:全部', 'q:题干选项', 'a:解析', 'lk:关联知识清单', 'ls:关联速成班讲义', 'n:我的笔记'].map(x => {
          const k = x.split(':')[0];
          return `<button class="btn tiny ${sc === k ? 'main' : ''}" onclick="ZS_SEARCHSET('scope','${k}')">${x.split(':')[1]}</button>`;
        }).join('')}
      </div>
      <div class="acts" style="gap:6px;margin:6px 2px 2px">
        <button class="btn tiny ${mi === '' ? 'main' : ''}" onclick="ZS_SEARCHSET('mi','')">全部模块</button>
        ${Array.from(new Set(S.qs.map(q => q.moduleIdx))).map(m => {
          const first = S.qs.find(q => q.moduleIdx == m) || {};
          const nm = first.moduleIdx >= 5 ? first.chapter : first.module;
          return `<button class="btn tiny ${String(mi) === String(m) ? 'main' : ''}" onclick="ZS_SEARCHSET('mi','${m}')">${esc((nm || '').slice(0, 9))}</button>`;
        }).join('')}
      </div>`}
      <div id="sres"></div>`);
    const inp = $('#sq');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    inp.addEventListener('input', debounce(() => doSearch(), 350));
    if (inp.value.trim()) doSearch(); else $('#sres').innerHTML = '<div class="empty">输入关键词开始搜索<br><span class="tiny">例：空想社会主义 / 生产力 / 矛盾</span></div>';
    setTimeout(() => inp.focus(), 80);
  }
  function debounce(f, ms) { let t; return function () { clearTimeout(t); t = setTimeout(f, ms); }; }
  function docPageResults(kind, keyword) {
    if (!keyword) return [];
    const dict = kind === 'k' ? S.lk : S.ls;
    return Object.keys(dict).map(Number).sort((a, b) => a - b).flatMap(n => {
      const t = dict[n] || '';
      const count = t.split(keyword).length - 1;
      return count ? [{ n, count, text: t }] : [];
    });
  }
  window.ZS_SEARCHMODE = mode => {
    const inp = $('#sq');
    if (inp) {
      if ((S.searchMode || 'questions') === 'documents') S.docSearchQ = inp.value;
      else S.searchQ = inp.value;
    }
    S.searchMode = mode;
    S.searchLimit = 80;
    renderSearch();
  };
  window.ZS_SEARCHMORE = () => {
    S.searchLimit = (S.searchLimit || 80) + 80;
    doSearch();
  };
  window.ZS_OPENLECHIT = (kind, page) => {
    S.docFind = { kind, keyword: (S.docSearchQ || '').trim(), page };
    go('lect/' + kind + '/' + (page - (PAGE_OFF[kind] || 0)));
  };
  function doSearch() {
    const kw = ($('#sq') || {}).value || '';
    const res = $('#sres'); if (!res) return;
    const k = kw.trim();
    if ((S.searchMode || 'questions') === 'documents') {
      S.docSearchQ = kw;
      const kind = S.searchDocKind || 'k';
      if (!k) { res.innerHTML = '<div class="empty">输入关键词查找整本讲义</div>'; return; }
      const hits = docPageResults(kind, k);
      const occurrences = hits.reduce((sum, hit) => sum + hit.count, 0);
      const off = PAGE_OFF[kind] || 0, name = PAGE_NAME[kind];
      res.innerHTML = `<div class="tiny muted search-count">${esc(name)} · ${hits.length} 页命中，${occurrences} 处匹配</div>` +
        (hits.length ? `<div class="card">${hits.slice(0, S.searchLimit || 80).map(hit => `<div class="hit doc-hit" onclick="ZS_OPENLECHIT('${kind}',${hit.n})">
          <div class="h">${esc(name)} · 第 ${hit.n - off > 0 ? hit.n - off : hit.n} 页 <span class="tiny muted">${hit.count} 处匹配</span></div>
          <div class="s">${highlight(cut(hit.text, k), k)}</div>
        </div>`).join('')}</div>${hits.length > (S.searchLimit || 80) ? `<button class="btn search-more" onclick="ZS_SEARCHMORE()">显示更多（剩余 ${hits.length - (S.searchLimit || 80)} 页）</button>` : ''}`
        : '<div class="empty">这本讲义没有找到匹配的文字</div>');
      return;
    }
    S.searchQ = kw;
    if (!k) { res.innerHTML = '<div class="empty">输入关键词搜索题目</div>'; return; }
    const out = [];
    const push = (q, src, text, field) => out.push({ q: q, src: src, text: text, field: field });
    const SC = S.searchScope || 'all', MI = (S.searchMi === undefined ? '' : S.searchMi);
    const want = f => SC === 'all' || SC === f;
    S.qs.forEach(q => {
      if (MI !== '' && String(q.moduleIdx) !== String(MI)) return;
      if (want('q')) {
        const parts = [];
        if (q.stem.includes(k)) parts.push(['题干', q.stem]);
        ['A','B','C','D'].forEach(x => { if ((q.options[x] || '').includes(k)) parts.push(['选项' + x, q.options[x]]); });
        parts.forEach(p => push(q, p[0], highlight(p[1], k), 'q'));
      }
      if (want('a')) {
        const aRaw = q.analysisRaw || (q.analysis || []).map(part => part.t || '').join('\n');
        if (aRaw.includes(k)) push(q, '解析', highlight(cut(aRaw, k), k), 'a');
      }
      if (want('lk') || want('ls')) {
        /* n 是图片序号，页码显示和跳转都用「书页码」（= n - PAGE_OFF） */
        if (want('lk')) (q.kPages || []).forEach(n => {
          const t = S.lk[n], bp = n - (PAGE_OFF.k || 0);
          if (t && t.includes(k)) push(q, '知识清单 P' + bp, highlight(cut(t, k), k), 'k:' + bp);
        });
        if (want('ls')) (q.sPages || []).forEach(n => {
          const t = S.ls[n], bp = n - (PAGE_OFF.s || 0);
          if (t && t.includes(k)) push(q, '速成班讲义 P' + bp, highlight(cut(t, k), k), 's:' + bp);
        });
      }
      if (want('n')) {
        const nt = ZS.data.notes[q.id];
        if (nt && stripTags(nt.text || '').includes(k)) push(q, '我的笔记', highlight(cut(stripTags(nt.text), k), k), 'n');
      }
    });
    // 去重：同题同来源只留第一条
    const seen = new Set(), list = [];
    out.forEach(o => { const key = o.q.id + '|' + o.src; if (seen.has(key)) return; seen.add(key); list.push(o); });
    const head = `<div class="tiny muted" style="margin:6px 2px 10px">找到 ${list.length} 条结果${list.length > 300 ? '（只显示前 300 条）' : ''}</div>`;
    res.innerHTML = head + `<div class="card">` + list.slice(0, 300).map(o => {
      const related = /^([ks]):(\d+)$/.exec(o.field || '');
      const p = P(o.q.id);
      const status = related ? `<div class="search-status">${isWrongNow(o.q.id) ? '<span class="search-badge bad">错题</span>' : ''}${flag(o.q.id, 'star') ? '<span class="search-badge">★ 已收藏</span>' : ''}<span class="search-badge">已做 ${p && p.tries || 0} 次</span></div>` : '';
      const chapter = [o.q.chapter, o.q.chapterTitle].filter(Boolean).join(' ');
      const body = `<div class="h">${esc(o.q.module)} · ${esc(chapter)} · 第 ${o.q.no} 题 · ${esc(o.src)}</div>
        ${status}
        <div class="s">${o.text}</div>`;
      if (!related) return `<div class="hit" onclick="ZS_GO('q/${o.q.id}')">${body}</div>`;
      const kind = related[1], pg = related[2];
      return `<div class="hit">
        <div onclick="ZS_GO('q/${o.q.id}')">${body}</div>
        <div class="hitnav">
          <button class="btn tiny main" onclick="ZS_GO('q/${o.q.id}')">📝 去题目</button>
          <button class="btn tiny" onclick="ZS_GO('lect/${kind}/${pg}')">📚 去讲义 P${pg}</button>
        </div></div>`;
    }).join('') + `</div>`;
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
  function renderStat() {
    showQNav(false);
    const all = S.qs.map(q => q.id), st = statOf(all);
    const chs = chapters().map(c => {
      const done = c.ids.filter(isDone).length;
      const right = c.ids.filter(id => { const p = P(id); return p && p.s === 'right'; }).length;
      const wrong = c.ids.filter(isWrongNow).length;
      return { ...c, done: done, right: right, wrong: wrong,
               acc: done ? right / done : -1,
               tries: c.ids.reduce((a, id) => a + (((P(id) || {}).tries) || 0), 0) };
    });
    const weak = chs.filter(c => c.done >= 2 && c.acc < 1).sort((a, b) => a.acc - b.acc).slice(0, 10);
    const daily = ZS.data.daily || {};
    const days = Object.keys(daily).sort();
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const k = dayKey(Date.now() - i * 86400000);
      if (daily[k]) streak++; else if (i > 0) break;
    }
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const ts = Date.now() - (29 - i) * 86400000, k = dayKey(ts);
      const e = daily[k] || { n: 0, r: 0 };
      return { k: k, n: e.n, r: e.r };
    });
    const mx = Math.max(1, ...last30.map(d => d.n));
    const today = daily[dayKey(Date.now())] || { n: 0, r: 0 };
    let h = `<div class="sec-title">📊 学习统计</div>
      <div class="card pad">
        <div class="prog stat-prog">
          <div><b>${st.done}</b><span>已做</span></div>
          <div><b>${st.right}</b><span>做对</span></div>
          <div><b>${st.wrong}</b><span>做错</span></div>
        </div>
        <div class="tiny muted" style="margin-top:10px">正确率 <b>${st.done ? (st.right / st.done * 100).toFixed(1) : '—'}%</b>　
          累计作答 <b>${all.reduce((a, id) => a + (((P(id) || {}).tries) || 0), 0)}</b> 次<br>
          今天做了 <b>${today.n}</b> 题（对 ${today.r}）　连续打卡 <b>${streak}</b> 天</div>
      </div>
      <div class="sec-title">📅 最近 30 天</div>
      <div class="card pad"><div class="bars">${last30.map(d =>
        `<div class="bar" title="${d.k}：${d.n} 题"><i style="height:${Math.round(d.n / mx * 100)}%"></i><em></em></div>`).join('')}</div>
        <div class="tiny muted" style="margin-top:6px">峰值 ${mx} 题/天　柱子越高做得越多</div></div>`;
    if (weak.length) {
      h += `<div class="sec-title">🎯 最该补的章节（正确率最低）</div><div class="card pad">` +
        weak.map(c => `<div class="ebrow">
          <span class="ebl" style="min-width:0;flex:1">${esc(c.ch)} <span class="tiny muted">${esc(c.mod)}</span></span>
          <span class="ebc">正确率 <b style="color:var(--bad)">${(c.acc * 100).toFixed(0)}%</b><br>做过 ${c.done}/${c.ids.length} · 错题 ${c.wrong}</span>
          <button class="btn tiny main" onclick="ZS_GO('l/${c.mi}-${encodeURIComponent(c.ch)}')">去看</button>
        </div>`).join('') + `</div>`;
    }
    const mods = new Map();
    chs.forEach(c => { if (!mods.has(c.mi)) mods.set(c.mi, []); mods.get(c.mi).push(c); });
    h += `<div class="sec-title">📚 全部章节进度</div>`;
    mods.forEach((list, mi) => {
      const tot = list.reduce((a, c) => a + c.ids.length, 0);
      const dn = list.reduce((a, c) => a + c.done, 0);
      h += `<div class="card pad" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <b style="color:var(--teal);font-size:15px">${esc(list[0].mod)}</b>
          <span class="sp" style="flex:1"></span>
          <span class="tiny muted">${dn}/${tot}</span></div>` +
        list.map(c => `<div class="ch-row" onclick="ZS_GO('l/${c.mi}-${encodeURIComponent(c.ch)}')">
          <span class="cn">${esc(c.ch)}</span>
          <span class="cbar"><i style="width:${c.ids.length ? Math.round(c.done / c.ids.length * 100) : 0}%"></i></span>
          <span class="tiny muted" style="min-width:76px;text-align:right">${c.done}/${c.ids.length}${
            c.wrong ? ` · 错<b style="color:var(--bad)">${c.wrong}</b>` : ''}${c.acc >= 0 ? ` · ${(c.acc * 100).toFixed(0)}%` : ''}</span>
        </div>`).join('') + `</div>`;
    });
    shell(h);
  }

  function renderNotes() {
    showQNav(false);
    const anBy = {};
    Object.keys(ZS.data.annos || {}).forEach(k => {
      const qid = k.split('|')[0];
      anBy[qid] = (anBy[qid] || 0) + (((ZS.data.annos[k] || {}).strokes) || []).length;
    });
    const rows = [];
    S.qs.forEach(q => {
      const nt = ZS.data.notes[q.id] || {};
      const txt = stripTags(nt.text || '').trim();
      const strokes = (nt.strokes || []).length;
      const pics = (nt.pics || []).length;
      const an = anBy[q.id] || 0;
      if (txt || strokes || pics || an) rows.push({ q: q, txt: txt, an: an, strokes: strokes, pics: pics });
    });
    let h = `<div class="sec-title">📝 笔记总览（${rows.length} 题）</div>`;
    if (!rows.length) h += `<div class="card pad"><div class="tiny muted">还没有笔记。在题目里点「✍️ 在题目与选项上做笔记」「📝 本题笔记区」或解析/讲义上的「✍️ 做笔记」都可以。</div></div>`;
    else h += `<div class="card pad">` + rows.map(r => `<div class="ebrow" style="cursor:pointer" onclick="ZS_GO('q/${r.q.id}')">
      <span class="ebl" style="min-width:0;flex:1">${esc(r.q.chapter)} 第 ${r.q.no} 题<br>
        <span class="tiny muted" style="font-weight:400">${esc(r.txt.slice(0, 34))}${r.txt.length > 34 ? '…' : ''}</span></span>
      <span class="ebc" style="flex:0 0 auto">${r.an ? `✍️${r.an} ` : ''}${r.strokes ? `🖊${r.strokes} ` : ''}${r.pics ? `🖼${r.pics}` : ''}</span>
    </div>`).join('') + `</div>`;
    /* 讲义截图批注：按「页」共享，不属于任何一题，单独列出来方便回看 */
    const lecRows = [];
    Object.keys(ZS.data.annos || {}).forEach(k => {
      const mm = /^_lec\|([ks])-img-(\d+)$/.exec(k);
      if (!mm) return;
      const st = ((ZS.data.annos[k] || {}).strokes) || [];
      if (st.length) lecRows.push({ kind: mm[1], n: +mm[2], cnt: st.length });
    });
    lecRows.sort((a, b) => a.kind === b.kind ? a.n - b.n : (a.kind === 'k' ? -1 : 1));
    if (lecRows.length) {
      h += `<div class="sec-title">📚 讲义截图批注（${lecRows.length} 页）</div>
        <div class="card pad">` + lecRows.map(r => {
        const bp = r.n - (PAGE_OFF[r.kind] || 0);
        return `<div class="ebrow" style="cursor:pointer" onclick="ZS_GO('lect/${r.kind}/${bp}')">
          <span class="ebl" style="flex:1">${PAGE_NAME[r.kind]} 第 ${bp} 页</span>
          <span class="ebc" style="flex:0 0 auto">✍️ ${r.cnt} 笔</span></div>`;
      }).join('') + `</div>`;
    }
    h += `<div class="sec-title">🖨 错题本</div>
      <div class="card pad"><div class="tiny muted" style="line-height:1.8;margin-bottom:10px">把当前所有错题整理成一份可打印 / 存 PDF 的清单。</div>
        <div class="acts"><button class="btn main" onclick="ZS_PRINT()">生成错题本</button></div></div>`;
    shell(h);
  }

  /* 错题本：打开可打印的清单 */
  window.ZS_PRINT = () => {
    const list = S.qs.filter(q => isWrongNow(q.id));
    if (!list.length) return ZS.toast('目前没有错题');
    const grp = new Map();
    list.forEach(q => {
      const k = q.module + ' ／ ' + q.chapter;
      if (!grp.has(k)) grp.set(k, []);
      grp.get(k).push(q);
    });
    let body = `<h1>考研政治 错题本</h1><div class="sub">共 ${list.length} 题 · 导出于 ${new Date().toLocaleString('zh-CN')}</div>`;
    grp.forEach((qs, k) => {
      body += `<h2>${esc(k)}</h2>`;
      qs.forEach(q => {
        const p = P(q.id) || {};
        const chosen = savedSelection(q.id, p);
        body += `<div class="q"><div class="stem">${esc(q.no)}. ${esc(q.stem)}</div>
          <div class="opts">${['A', 'B', 'C', 'D'].map(x => q.options[x] ? `<div>${x}. ${esc(q.options[x])}</div>` : '').join('')}</div>
          <div class="ans">你的作答：<b>${chosen && chosen.length ? esc(chosen.join('')) : '此前未记录'}</b>　正确答案：<b>${esc(q.answer)}</b>　（做过 ${p.tries || 0} 次，对 ${p.rights || 0} 次）</div>
          <div class="an">${esc((q.analysisRaw || '').slice(0, 260))}</div></div>`;
      });
    });
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>考研政治 错题本（${list.length} 题）</title>
      <style>body{font:15px/1.85 -apple-system,"PingFang SC",sans-serif;max-width:820px;margin:0 auto;padding:22px;color:#1d2b2a}
      h1{font-size:22px;color:#0c514e;margin:0 0 4px}.sub{color:#6b7c7a;font-size:13px;margin-bottom:18px}
      h2{font-size:16px;color:#0c514e;border-left:4px solid #0c514e;padding-left:8px;margin:24px 0 10px}
      .q{margin-bottom:18px;padding-bottom:14px;border-bottom:1px dashed #dbe4e2;page-break-inside:avoid}
      .stem{font-weight:600}.opts{margin:6px 0 6px 14px;color:#33454a;font-size:14px}
      .ans{color:#0c514e;font-size:13.5px}.an{color:#5a6b69;font-size:13px;margin-top:5px;white-space:pre-wrap}
      @media print{body{padding:0}h2{page-break-after:avoid}}</style></head><body>${body}
      <div style="margin-top:26px;text-align:center"><button onclick="window.print()" style="font-size:16px;padding:10px 22px;border-radius:10px;border:1px solid #0c514e;background:#0c514e;color:#fff">🖨 打印 / 存为 PDF</button></div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    else {
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '错题本-' + dayKey(Date.now()) + '.html';
      document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 3000);
      ZS.toast('已生成错题本文件');
    }
  };

  let TOC = null;
  async function needToc() {
    if (TOC) return TOC;
    try { TOC = await (await fetch('data/toc.json?v=' + TOC_VER)).json(); }
    catch (e) { TOC = { k: [], s: [] }; }
    return TOC;
  }

  /* 浏览整本讲义：页内滚动跳转 + 目录 */
  async function renderLectAll(kind, startPage) {
    showQNav(false);
    const name = PAGE_NAME[kind] || kind;
    const ext = IMGEXT[kind] || 'webp';
    const total = { k: 326, s: 197 }[kind] || 0;
    const off = PAGE_OFF[kind] || 0;
    const lastP = total - off;
    const toc = (await needToc())[kind] || [];
    if (S.route.split('/')[0] !== 'lect') return;
    const find = S.docFind && S.docFind.kind === kind ? S.docFind : null;
    const collapsed = localStorage.getItem('zz720.lectbarCollapsed') === '1';
    let h = `<div class="sec-title">📚 ${esc(name)} · 全 ${total} 页</div>
      <div class="card pad lectbar${collapsed ? ' collapsed' : ''}" id="lectbar">
        <div class="lectbar-head"><strong>📚 ${esc(name)} · 工具栏</strong>
          <button class="btn tiny" id="lectbarToggle" aria-expanded="${!collapsed}" aria-controls="lectbarBody" onclick="ZS_LECTBAR()">${collapsed ? '展开工具栏 ▾' : '收起工具栏 ▴'}</button></div>
        <div id="lectbarBody" class="lectbar-body">
        <div class="acts" style="gap:7px;align-items:center;margin:0;flex-wrap:wrap">
          <button class="btn tiny" onclick="ZS_TOC()">📑 目录（${toc.length}）</button>
          <span class="tiny" style="display:inline-flex;align-items:center;gap:5px">跳到第
            <input id="lpIn" type="number" inputmode="numeric" min="1" max="${lastP}" placeholder="__"
              onkeydown="if(event.key==='Enter')ZS_LPJUMP('${kind}')">页
            <button class="btn tiny main" onclick="ZS_LPJUMP('${kind}')">跳转</button></span>
          <span style="flex:1"></span>
          <button class="btn tiny" onclick="ZS_THUMB()">${thumbMode() ? '📖 直读整页' : '🔳 缩略图'}</button>
        </div>
        <div class="lect-find">
          <input id="lectFindInput" aria-label="在本讲义中搜索" placeholder="在这本讲义中查找" value="${esc(find ? find.keyword : '')}" onkeydown="if(event.key==='Enter')ZS_LECTFIND('${kind}')">
          <button class="btn tiny main" onclick="ZS_LECTFIND('${kind}')">查找</button>
          <button class="btn tiny" onclick="ZS_DOCNAV(-1)">上一个</button>
          <button class="btn tiny" onclick="ZS_DOCNAV(1)">下一个</button>
        </div>
        <div id="lectFindStatus" class="tiny muted" aria-live="polite"></div>
        <div id="tocBox" class="tocbox" style="display:none">
          ${toc.length ? toc.map(t => `<div class="tocrow${t.mod ? ' mod' : ''}" onclick="ZS_LPJUMP('${kind}',${t.page})">
            <b>${esc(t.label)}</b><span>${esc(t.title)}</span><em>P${t.page}</em></div>`).join('')
            : '<div class="tiny muted" style="padding:8px">这本没有目录数据</div>'}
        </div>
        </div>
      </div>
      <div class="pages">` +
      Array.from({ length: total }, (_, i) => i + 1).map(pg => {
        const pn = pg - off;
        const nn = String(pg).padStart(4, '0');
        const lb = esc(name) + (pn >= 1 ? ' 第 ' + pn + ' 页' : ' PDF 第 ' + pg + ' 页');
        return `<div class="pgwrap${thumbMode() ? ' thumb' : ''}" id="lp${pg}"
            data-tgt="${kind}-img" data-id="${LECID}" data-anno="${LECID}|${kind}-img-${pg}">
          <img loading="lazy" style="aspect-ratio:${kind === 's' ? '2068/2924' : '2552/3438'}"
            src="${KINDBASE[kind] || IMGBASE}img/${kind}/${nn}.${ext}" data-label="${lb}"
            onclick="ZS_ZOOM(this)">
          <span class="pgno">${esc(name)} P${pn >= 1 ? pn : pg}</span>
          <button class="annobtn" onclick="ZS_ANNO('${LECID}','${kind}-img-${pg}')" title="在这一页上做笔记">✍️</button></div>`;
      }).join('') + `</div>`;
    shell(h);
    updateLectLayout();
    if (window.ResizeObserver) {
      S.lectbarObserver = new ResizeObserver(updateLectLayout);
      S.lectbarObserver.observe(document.getElementById('topbar'));
      S.lectbarObserver.observe(document.getElementById('lectbar'));
    }
    if (find && find.keyword) updateDocFind(kind, find.page || Number(startPage) + off);
    /* 批注层：图片加载完再画。用 JS 绑定而不是内联 onload——
       这一页有 300 多张图，内联处理器会引发一串 WebKit 的「Script error」 */
    ZS_ANNOSYNC();
    $$('#view .pgwrap img').forEach(im => {
      if (im.complete) return;
      im.addEventListener('load', () => ZS_ANNOSYNC(), { once: true });
    });
    if (startPage) {
      /* 图片是懒加载的，页面高度会边加载边变，得多定位几次。参数用「书页码」 */
      const sp = Number(startPage) + off;
      let tries = 0, done = 0;
      const jump = () => {
        tries++;
        const el = document.getElementById('lp' + sp);
        if (el) {
          const top = el.getBoundingClientRect().top;
          if (Math.abs(top - lectOffset()) > 12) el.scrollIntoView({ block: 'start' });
          else done++;              /* 连续几次都在位才算稳（图片加载会让高度变化） */
        }
        /* 到位后再复查几次；一直没到位就多试（图片慢时页面高度不够，滚动会被截断） */
        if (done < 3 && tries < 45) setTimeout(jump, 350);
      };
      setTimeout(jump, 250);
    }
  }

  function updateLectLayout() {
    const top = document.getElementById('topbar');
    const bar = document.getElementById('lectbar');
    document.documentElement.style.setProperty('--topbar-height', (top ? top.getBoundingClientRect().height : 76) + 'px');
    document.documentElement.style.setProperty('--lectbar-height', (bar ? bar.getBoundingClientRect().height : 0) + 'px');
  }
  function lectOffset() {
    const top = document.getElementById('topbar');
    const bar = document.getElementById('lectbar');
    return (top ? top.getBoundingClientRect().height : 76) + (bar ? bar.getBoundingClientRect().height : 0) + 16;
  }
  window.ZS_LECTBAR = () => {
    const bar = document.getElementById('lectbar');
    const button = document.getElementById('lectbarToggle');
    if (!bar || !button) return;
    const collapsed = bar.classList.toggle('collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? '展开工具栏 ▾' : '收起工具栏 ▴';
    localStorage.setItem('zz720.lectbarCollapsed', collapsed ? '1' : '0');
    updateLectLayout();
  };

  window.ZS_TOC = () => {
    const b = document.getElementById('tocBox');
    if (!b) return;
    b.style.display = b.style.display === 'none' ? 'block' : 'none';
    updateLectLayout();
  };
  window.ZS_LPJUMP = (kind, v) => {
    const off = PAGE_OFF[kind] || 0;
    const inp = document.getElementById('lpIn');
    let n = (v === undefined) ? parseInt((inp && inp.value) || '', 10) : Number(v);
    if (!n || n < 1) return ZS.toast('请输入页码');
    const el = document.getElementById('lp' + (n + off));
    if (!el) return ZS.toast('没有第 ' + n + ' 页');
    const b = document.getElementById('tocBox'); if (b) b.style.display = 'none';
    updateLectLayout();
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    const pg = el.querySelector('.pgno');
    if (pg) ZS.toast('已跳到 ' + pg.textContent, 1400);
    if (S.docFind && S.docFind.kind === kind) updateDocFind(kind, n + off);
  };

  function updateDocFind(kind, page) {
    const find = S.docFind;
    const box = $('#lectFindStatus');
    if (!box || !find || find.kind !== kind || !find.keyword) return;
    const hits = docPageResults(kind, find.keyword);
    const index = hits.findIndex(hit => hit.n === page);
    find.page = page;
    const old = $('#view .doc-current'); if (old) old.classList.remove('doc-current');
    const current = document.getElementById('lp' + page);
    if (index >= 0 && current) current.classList.add('doc-current');
    const occurrences = hits.reduce((sum, hit) => sum + hit.count, 0);
    box.innerHTML = hits.length
      ? `${hits.length} 页命中 · ${occurrences} 处匹配 · ${index >= 0 ? `第 ${index + 1}/${hits.length} 个命中页（本页 ${hits[index].count} 处）<div class="lect-find-snippet">${highlight(cut(hits[index].text, find.keyword), find.keyword)}</div>` : '当前页未命中，可点上一个或下一个'}`
      : '这本讲义没有找到匹配的文字';
  }
  window.ZS_LECTFIND = kind => {
    const keyword = (($('#lectFindInput') || {}).value || '').trim();
    S.docFind = { kind, keyword, page: 0 };
    S.docSearchQ = keyword; S.searchDocKind = kind;
    if (!keyword) {
      const old = $('#view .doc-current'); if (old) old.classList.remove('doc-current');
      const box = $('#lectFindStatus'); if (box) box.textContent = '输入关键词开始查找';
      return;
    }
    const hits = docPageResults(kind, keyword);
    if (!hits.length) { updateDocFind(kind, 0); return; }
    ZS_LPJUMP(kind, hits[0].n - (PAGE_OFF[kind] || 0));
  };
  window.ZS_DOCNAV = d => {
    const find = S.docFind;
    if (!find || !find.keyword) return ZS.toast('先输入关键词');
    const hits = docPageResults(find.kind, find.keyword);
    if (!hits.length) return ZS.toast('没有匹配页');
    const index = hits.findIndex(hit => hit.n === find.page);
    const next = index < 0 ? (d > 0 ? 0 : hits.length - 1) : (index + d + hits.length) % hits.length;
    ZS_LPJUMP(find.kind, hits[next].n - (PAGE_OFF[find.kind] || 0));
  };

  /* 缩略讲义：从首页一键进入整本讲义（缩略图浏览） */
  window.ZS_LECTPICK = () => {
    const m = document.getElementById('modal');
    if (!m) return;
    const items = [['k', '知识清单', 326], ['s', '速成班讲义', 197]];
    m.innerHTML = `<div class="box" style="max-width:400px">
      <div style="font-size:15.5px;font-weight:600;margin-bottom:4px">📚 缩略讲义</div>
      <div class="tiny muted" style="margin-bottom:12px">整本翻页浏览，点图可放大看原页</div>
      ${items.map(([k, nm, tot]) => `<div class="lecrow" onclick="ZS_GO('lect/${k}/1');ZS_CFGCLOSE()">
        <img loading="lazy" src="${KINDBASE[k] || IMGBASE}img/${k}/0001.${IMGEXT[k] || 'webp'}" alt="">
        <div><b>${esc(nm)}</b><span>全 ${tot} 页</span></div>
        <em>›</em></div>`).join('')}
      <div class="acts" style="justify-content:flex-end;margin-top:14px">
        <button class="btn" onclick="ZS_CFGCLOSE()">关闭</button>
      </div></div>`;
    m.classList.add('show');
  };

  function renderQueues() {
    showQNav(false);
    const list = S.qlist || [];
    let h = `<div class="sec-title">🗂 我的队列</div>`;
    if (!list.length) {
      h += `<div class="card pad"><div class="tiny muted" style="line-height:1.9">还没有进行中的队列。<br>
        从首页的「错题 & 蒙对」「艾宾浩斯复习」按钮开始，或在下方开一场模拟考试 —— 中途离开也不会丢，随时能回来继续。</div></div>`;
    } else {
      h += `<div class="card pad">` + list.map(q => {
        const done = q.sb ? Object.keys(q.sb).length : 0;
        const cur = S.q && S.q.id === q.id;
        const at = Math.min((q.i || 0) + 1, q.ids.length);
        return `<div class="ebrow">
          <span class="ebl">${QMODES[q.mode] || '队列'}</span>
          <span class="ebc">${esc(q.title)}<br>第 ${at} / ${q.ids.length} 题${done ? ` · 重做区已做 <b>${done}</b>` : ''}${cur ? ' · <b style="color:var(--teal)">进行中</b>' : ''}</span>
          <button class="btn tiny ${cur ? '' : 'main'}" onclick="ZS_QGO('${q.id}')">${cur ? '回到' : '继续'}</button>
          <button class="btn tiny" onclick="ZS_QDEL('${q.id}')">结束</button>
        </div>`;
      }).join('') + `</div>`;
    }
    h += `<div class="sec-title">🎯 模拟考试</div>
      <div class="card pad">
        <div class="tiny muted" style="line-height:1.8;margin-bottom:10px">随机抽题、计时作答，交卷后统一给分。作答只记在重做区，交卷时再决定是否同步到原题。</div>
        <div class="acts">
          <button class="btn main" onclick="ZS_MOCK(33)">33 题（真题题量）</button>
          <button class="btn" onclick="ZS_MOCK(16)">16 题快测</button>
          <button class="btn" onclick="ZS_MOCK(50)">50 题</button>
        </div>
      </div>
      <div class="sec-title">快捷入口</div>
      <div class="card pad"><div class="acts">
        <button class="btn" onclick="ZS_GO('stat')">📊 学习统计 / 薄弱章节</button>
        <button class="btn" onclick="ZS_GO('notes')">📝 笔记总览</button>
      </div></div>`;
    shell(h);
  }

  /* 模拟考试：随机抽题 → 重做区队列 */
  window.ZS_MOCK = n => {
    const pool = S.qs.filter(q => !isDone(q.id));
    let src = pool.length >= n ? pool : S.qs;
    const picked = src.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(n, src.length));
    if (!picked.length) return ZS.toast('没有可用的题目');
    if (S.q) parkQ();
    const nq = { id: 'M' + Date.now().toString(36), mode: 'mock', title: '模拟考试 ' + picked.length + ' 题',
                 ids: picked.map(q => q.id), i: 0, sb: {}, ts: Date.now(), start: Date.now() };
    S.qlist = S.qlist || []; S.qlist.unshift(nq);
    S.q = nq; S.sb = nq.sb;
    saveSession(); updateQBadge();
    go('q/' + nq.ids[0]);
    ZS.toast('模拟考试开始：' + picked.length + ' 题，交卷后统一给分', 3000);
  };

  function conflictSection() {
    const entries = Object.entries(ZS.data.sync.conflicts || {}).filter(([id]) => /^[a-f0-9]+-[a-f0-9]+$/.test(id));
    if (!entries.length) return '';
    const names = { notes: '笔记', annos: '手写批注', edit: '讲义修改', flags: '标记', progress: '做题状态' };
    return '<div class="sec-title">保留的冲突版本 · ' + entries.length + '</div><div class="card pad">' +
      '<div class="tiny muted">不同设备修改了同一处内容，另一份已保留。查看后可以恢复；恢复时也会保留当前版本。</div>' +
      entries.slice(-20).reverse().map(([id, value]) => '<div style="padding-top:10px">' +
        '<span class="tiny">' + esc(names[value.group] || '记录') + ' · ' + esc(value.key) + ' · ' +
        esc(ZS.fmt(value.stamp && value.stamp.t)) + '</span> ' +
        '<button class="btn" onclick="ZS_CVIEW(\'' + id + '\')">查看副本</button></div>').join('') +
      (entries.length > 20 ? '<p class="tiny muted">这里显示最近 20 份，全部副本包含在导出备份中。</p>' : '') + '</div>';
  }
  window.ZS_CVIEW = id => {
    const value = ZS.data.sync.conflicts[id]; if (!value) return;
    const record = value.field === '$record' ? value.value || {} : { [value.field]: value.value };
    const m = $('#modal');
    const text = record.text || (value.group === 'edit' ? value.value : '');
    m.innerHTML = '<div class="box"><h3>保留的副本 · ' + esc(value.key) + '</h3><div style="max-height:56vh;overflow:auto">' +
      (text ? '<p style="white-space:pre-wrap">' + esc(String(text).replace(/<[^>]*>/g, '')) + '</p>' : '') +
      (record.strokes ? '<canvas id="conflictCanvas" style="width:100%;height:240px"></canvas>' : '') +
      (record.pics || []).filter(p => typeof p === 'string' && p.startsWith('data:image/')).map(p => '<img src="' + esc(p) + '">').join('') +
      (!text && !record.strokes && !(record.pics || []).length ? '<p>' + esc(value.absent ? '这个版本移除了该项内容。' : JSON.stringify(value.value)) + '</p>' : '') +
      '</div><div class="acts"><button class="btn main" onclick="ZS_CRESTORE(\'' + id + '\')">恢复这个副本</button>' +
      '<button class="btn" onclick="ZS_CFGCLOSE()">关闭</button></div></div>';
    m.classList.add('show');
    const canvas = $('#conflictCanvas');
    if (canvas) ANNO.paintOn(canvas, record.strokes, canvas.clientWidth || 300, 240);
  };
  window.ZS_CRESTORE = id => {
    ZS.confirm('恢复这个副本？当前内容也会保留为副本，恢复后自动同步。', () => {
      if (ZS.restoreConflict(id)) { ZS_CFGCLOSE(); route(); ZS.toast('已恢复副本，正在同步'); }
    });
  };

  function renderMe() {
    showQNav(false);
    const all = S.qs.map(q => q.id), st = statOf(all);
    const cfg = ZS.cfg();
    const sz = (JSON.stringify(ZS.data).length / 1024).toFixed(0);
    shell(`<div class="sec-title">学习统计</div>
      <div class="card pad">
        <div class="prog stat-prog">
          <div><b>${st.done}</b><span>已做</span></div>
          <div><b>${st.right}</b><span>做对</span></div>
          <div><b>${st.wrong}</b><span>做错</span></div>
        </div>
        <div class="tiny muted" style="margin-top:10px">正确率 ${st.done ? (st.right / st.done * 100).toFixed(1) : '—'}%　蒙对 ${st.guess} 题　收藏 ${all.filter(id => flag(id, 'star')).length} 题<br>
          累计作答 <b>${all.reduce((a, id) => a + (((P(id) || {}).tries) || 0), 0)}</b> 次　今日待复习 <b>${all.filter(id => isDone(id) && dueNow(id)).length}</b> 题</div>
      </div>
      <div class="sec-title">答题偏好</div>
      <div class="card pad">
        <div class="ebrow"><span class="ebl">做错自动收藏</span>
          <span class="ebc">${autoStar() ? '已开启：做错的题会自动加进收藏' : '关闭中：做错不会自动收藏'}</span>
          <button class="btn tiny ${autoStar() ? 'main' : ''}" onclick="ZS_AUTOSTAR()">${autoStar() ? '已开启' : '去开启'}</button></div>
        <div class="ebrow"><span class="ebl">重置全部</span>
          <span class="ebc">清空所有做题记录，重新来过（笔记与手写标注保留）</span>
          <button class="btn tiny" onclick="ZS_REDO_SET('all')">重置</button></div>
      </div>
      <div class="sec-title">数据备份</div>
      <div class="card pad">
        <div class="tiny muted" style="line-height:1.8;margin-bottom:10px">做题记录、笔记、手写标注<b>只存在本机浏览器里</b>。清理浏览器数据或换设备都会丢，建议定期导出一份。</div>
        <div class="acts">
          <button class="btn main" onclick="ZS_EXPORT()">⬇️ 导出备份文件</button>
          <button class="btn" onclick="ZS_IMPORTBOX()">⬆️ 从备份恢复</button>
          <button class="btn" onclick="ZS_COPY()">📋 复制到剪贴板</button>
        </div>
      </div>
      <div class="sec-title">关于</div>
      <div class="card pad">
        <div class="tiny muted">当前版本 <b style="color:var(--teal)">v${APP_VER}</b>（前端）
        · 题库数据 v${QUESTION_VER}<br>
        如果功能跟预期不一致，多半是浏览器拿的是缓存版本 —— 用带 <code>?n=99</code> 的网址打开一次即可。</div>
      </div>

      <div class="sec-title">外观</div>
      <div class="card pad">
        <div class="acts">
          ${['auto', 'light', 'dark'].map(k => `<button class="btn${themePref() === k ? ' main' : ''}"
            onclick="ZS_THEME('${k}')">${k === 'auto' ? '🌗 跟随系统' : k === 'light' ? '☀️ 浅色' : '🌙 深色'}</button>`).join('')}
        </div>
        <div class="tiny muted" style="margin:10px 0 6px">讲义 / 解析截图</div>
        <div class="acts">
          ${['auto', 'on', 'off'].map(k => `<button class="btn${invPref() === k ? ' main' : ''}"
            onclick="ZS_INVERT('${k}')">${k === 'auto' ? '🌗 跟随外观' : k === 'on' ? '🌓 反转成深色' : '📄 保持原样'}</button>`).join('')}
        </div>
      </div>
      <div class="sec-title">云端同步</div>
      <div class="card pad">
        <div class="tiny muted">数据仓库：${esc(cfg.owner)}/${esc(cfg.repo)} · 文件 ${esc(cfg.file)}<br>
        本地数据量约 ${sz} KB<br><span id="mySyncState"></span><br>
        <span id="mySyncError" style="color:var(--bad)" hidden></span></div>
        <div class="acts">
          <button class="btn main" onclick="ZS_SYNC()">☁️ 立即同步</button>
          <button class="btn" onclick="ZS_CFG()">设置令牌</button>
          <button class="btn" onclick="ZS_FORCE()">高级：以本机覆盖云端</button>
          <button class="btn" onclick="ZS_HIST()">🕘 历史版本</button>
          <button class="btn" onclick="ZS_SETPASS()">🔐 设置登录密码</button>
          <button class="btn" onclick="ZS_LOGOUT()">🚪 退出登录</button>
          <button class="btn" onclick="ZS_DIAG()">🩺 同步诊断</button>
        </div>
      </div>
      ${conflictSection()}
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
    const manualBox = $('#lectM'); if(manualBox) manualBox.style.display = t === 'm' ? '' : 'none';
  };
  window.ZS_SEL = (id, k) => {
    /* 已经作答 / 已经看过答案的题，不允许再改选项，以免改掉「你选了 X」的记录 */
    if (inSb(id)) {
      if (S.sb && S.sb[id]) return ZS.toast('本题已在重做区作答，点「重做本题」可重做');
    } else {
      const pp = P(id);
      if ((pp && pp.s && !S['redo_' + id]) || S['rev_' + id]) return ZS.toast('本题已作答，点「重做本题」可以重做');
    }
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
    if (inSb(id)) {
      S.sb = S.sb || {}; S.sb[id] = { sel: sel.slice(), right: ok };
      saveSession(); renderQuestion(id);
      ZS.toast(ok ? '✔ 做对了（重做区，未写入原记录）' : '✘ 答案：' + q.answer);
      return;
    }
    setProg(id, ok, false, sel);
    renderQuestion(id);
    ZS.toast(ok ? '✔ 做对了' : '✘ 答案：' + q.answer);
    const r = document.querySelector('#view .res');
    if (r) setTimeout(() => r.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };
  window.ZS_REVEAL = id => { S['rev_' + id] = true; renderQuestion(id); };
  /* 重做：保留历史次数与复习进度，只把本题切回「待作答」状态 */
  function doRedo(id) {
    if (S.byId[id] && S.byId[id].source === 'p') PRACTICE.reset(id);
    S['redo_' + id] = true; delete S['rev_' + id]; S['sel_' + id] = [];
    if ((ZS.data.flags[id] || {}).guess) { ZS.data.flags[id].guess = false; ZS.data.flags[id].ts = Date.now(); ZS.save(); }
    renderQuestion(id);
    ZS.toast('已重置本题，可以重做（累计次数保留）');
  }
  window.ZS_REDO = id => {
    if (inSb(id)) {
      delete S.sb[id]; delete S['sel_' + id]; saveSession();
      return renderQuestion(id);
    }
    const p = P(id);
    const msg = p && p.s
      ? '确定重做本题吗？\n（会清掉本题这次的作答结果，累计做了几次/对几次仍然保留）'
      : '确定重做本题吗？\n（会清掉当前选择）';
    ZS.confirm(msg, () => doRedo(id));
  };
  window.ZS_QNAVREDO = () => { if (S.curId) ZS_REDO(S.curId); };

  /* 批量重做：kind = 'ch' 本章 / 'mi' 本模块 / 'all' 全部 */
  window.ZS_REDO_SET = (kind, key) => {
    let list, label;
    if (kind === 'ch') {
      const [mi, ch] = key.split('-');
      list = S.qs.filter(q => q.moduleIdx == mi && q.chapter === ch);
      label = '本章《' + ch + '》';
    } else if (kind === 'mi') {
      list = S.qs.filter(q => String(q.moduleIdx) === String(key));
      label = '本模块《' + (list[0] ? list[0].module : '') + '》';
    } else {
      list = S.qs; label = '全部 ' + list.length + ' 题';
    }
    const done = list.filter(q => isDone(q.id)).length;
    ZS.confirm('确定要重做' + label + '吗？\n共 ' + list.length + ' 题，其中已做 ' + done + ' 题。\n（已做的结果会重置，累计次数、笔记和手写标注都保留）', () => {
      list.forEach(q => {
        const p = ZS.data.progress[q.id];
        if (p) { delete p.s; delete p.guess; p.ts = Date.now(); }
        S['redo_' + q.id] = true; S['sel_' + q.id] = [];
      });
      ZS.save();
      ZS.toast('已重置 ' + list.length + ' 题，可以重新做一遍');
      route();
    });
  };
  window.ZS_GUESS = id => { toggleFlag(id, 'guess'); renderQuestion(id); };
  window.ZS_FLAG = (id, k) => { toggleFlag(id, k); renderQuestion(id); };
  window.ZS_LIST = (key, f) => {
    const [mi, ch] = key.split('-');
    let list = S.qs.filter(q => q.moduleIdx == mi && q.chapter === ch);
    if (f === 'wrong') list = list.filter(q => isWrongNow(q.id));
    if (f === 'fixed') list = list.filter(q => isFixed(q.id));
    if (f === 'undone') list = list.filter(q => !isDone(q.id));
    if (!list.length) return ZS.toast('没有符合条件的题目');
    go('q/' + list[0].id);
  };
  function pickList(f) {
    let list = S.qs;
    if (f === 'wrong') list = list.filter(q => isWrongNow(q.id));
    if (f === 'fixed') list = list.filter(q => isFixed(q.id));
    if (f === 'guess') list = list.filter(q => flag(q.id, 'guess'));
    if (f === 'star') list = list.filter(q => flag(q.id, 'star'));
    if (f === 'due_all') list = list.filter(q => isDone(q.id) && dueNow(q.id));
    if (f === 'due_wrong') list = list.filter(q => isWrongNow(q.id) && dueNow(q.id));
    if (f === 'due_fixed') list = list.filter(q => isFixed(q.id) && dueNow(q.id));
    if (f === 'wg') list = list.filter(q => isWrongNow(q.id) || flag(q.id, 'guess') || (incFix() && isFixed(q.id)));
    if (f === 'due_wgr') list = list.filter(q => (isWrongNow(q.id) || flag(q.id, 'guess') || (incFix() && isFixed(q.id))) && dueNow(q.id));
    if (f === 'due_star') list = list.filter(q => flag(q.id, 'star') && dueNow(q.id));
    if (f.startsWith('due_')) list = list.slice().sort((a, b) => ((P(a.id) || {}).due || 0) - ((P(b.id) || {}).due || 0));
    return list;
  }
  window.ZS_RUN = f => {
    const list = pickList(f);
    if (!list.length) return ZS.toast('没有符合条件的题目');
    go('q/' + list[0].id);
  };

  const PICK_TITLE = {
    wg: '错题 & 蒙对', due_wgr: '错题 & 蒙对 · 今日待复习', wrong: '错题', fixed: '已订正',
    guess: '蒙对', star: '收藏', due_all: '全部题目 · 今日待复习', due_wrong: '错题 · 今日待复习',
    due_fixed: '已订正 · 今日待复习', due_star: '收藏 · 今日待复习'
  };

  /* 选择复习方式：先按 模块 > 章节 勾选范围，再选 复习 / 原题重做 / 重做区 */
  let PICK = null;   // { scope, title, list }
  const pickKey = q => q.moduleIdx + '|' + q.chapter;

  function buildPickTree() {
    const mods = new Map();
    PICK.list.forEach(q => {
      if (!mods.has(q.moduleIdx)) mods.set(q.moduleIdx, { name: q.module, chs: new Map() });
      const m = mods.get(q.moduleIdx);
      if (!m.chs.has(q.chapter)) m.chs.set(q.chapter, 0);
      m.chs.set(q.chapter, m.chs.get(q.chapter) + 1);
    });
    return Array.from(mods).map(([mi, m]) => `
      <div class="pkgrp">
        <label class="pk mod"><input type="checkbox" class="pkmi" data-mi="${mi}" checked onchange="ZS_PK_MOD(this)">
          <b>${esc(m.name)}</b><span class="tiny muted">${Array.from(m.chs.values()).reduce((a, b) => a + b, 0)} 题</span></label>
        ${Array.from(m.chs).map(([ch, c]) => `<label class="pk ch"><input type="checkbox" class="pkch" data-mi="${mi}" data-ch="${esc(ch)}" checked onchange="ZS_PK_CH(this)">
          <span>${esc(ch)}</span><span class="tiny muted">${c}</span></label>`).join('')}
      </div>`).join('');
  }
  function pickedCount() {
    const set = new Set(Array.from(document.querySelectorAll('#modal .pkch:checked')).map(c => c.getAttribute('data-mi') + '|' + c.getAttribute('data-ch')));
    return PICK.list.filter(q => set.has(pickKey(q))).length;
  }
  function refreshPicked() {
    const el = document.getElementById('pkCount');
    if (el && PICK) el.textContent = pickedCount();
    document.querySelectorAll('#modal .pkmi').forEach(mi => {
      const own = Array.from(document.querySelectorAll('#modal .pkch[data-mi="' + mi.getAttribute('data-mi') + '"]'));
      mi.checked = own.every(c => c.checked);
      mi.indeterminate = !mi.checked && own.some(c => c.checked);
    });
  }
  window.ZS_PK_MOD = el => {
    document.querySelectorAll('#modal .pkch[data-mi="' + el.getAttribute('data-mi') + '"]').forEach(c => c.checked = el.checked);
    refreshPicked();
  };
  window.ZS_PK_CH = () => refreshPicked();
  window.ZS_PK_ALL = v => {
    document.querySelectorAll('#modal .pkch').forEach(c => c.checked = v);
    document.querySelectorAll('#modal .pkmi').forEach(m => { m.checked = v; m.indeterminate = false; });
    refreshPicked();
  };
  window.ZS_SHUFFLE = () => {
    S.shuffle = !S.shuffle;
    const b = Array.from(document.querySelectorAll('#modal .btn.tiny')).find(x => /打乱顺序/.test(x.textContent));
    if (b) b.className = 'btn tiny' + (S.shuffle ? ' main' : '');
    ZS.toast(S.shuffle ? '本次会打乱顺序' : '本次按原顺序');
  };

  window.ZS_PICK = (scope, title) => {
    const list = pickList(scope);
    const t = title || PICK_TITLE[scope] || '复习';
    if (!list.length) return ZS.toast('「' + t + '」目前没有题目');
    /* 已有队列不再拦人：重做区里有没同步的才问一句 */
    if (S.q) {
      const sb = S.sb ? Object.keys(S.sb).length : 0;
      if (sb) return ZS.confirm('重做区里还有 ' + sb + ' 题没同步。\n确定＝丢弃它们并开始新的队列；取消＝回去先处理。', () => {
        S.q = null; S.sb = null; saveSession(); ZS_PICK(scope, title);
      });
      S.q = null; S.sb = null; saveSession();
    }
    PICK = { scope: scope, title: t, list: list };
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="box" style="max-width:460px">
      <h3>${esc(t)} · 共 ${list.length} 题</h3>
      <div class="tiny muted" style="margin-bottom:8px">勾选这次要处理的模块 / 章节</div>
      <div class="acts" style="gap:6px;margin-bottom:8px">
        <button class="btn tiny" onclick="ZS_PK_ALL(1)">全选</button>
        <button class="btn tiny" onclick="ZS_PK_ALL(0)">全不选</button>
        <button class="btn tiny ${S.shuffle ? 'main' : ''}" onclick="ZS_SHUFFLE()">🔀 打乱顺序</button>
        <span class="tiny muted" style="align-self:center">已选 <b id="pkCount">${list.length}</b> 题</span>
      </div>
      <div class="pktree">${buildPickTree()}</div>
      <div class="tiny muted" style="margin:12px 0 8px">选一种方式</div>
      <div class="acts" style="flex-direction:column;align-items:stretch;gap:9px">
        <button class="btn" style="text-align:left;padding:12px 14px" onclick="ZS_SESSION('view')">📖 <b>复习</b><br><span class="tiny muted">逐题看题目与解析，不改动任何记录</span></button>
        <button class="btn" style="text-align:left;padding:12px 14px" onclick="ZS_SESSION('redo')">🔄 <b>原题重做</b><br><span class="tiny muted">就在原题上重做，做对会覆盖本题这次结果</span></button>
        <button class="btn main" style="text-align:left;padding:12px 14px" onclick="ZS_SESSION('sb')">🧪 <b>重做区</b><br><span class="tiny muted">在新区域作答，不影响原记录，做完再选是否同步</span></button>
      </div>
      <div class="acts" style="justify-content:flex-end;margin-top:8px"><button class="btn" onclick="ZS_CFGCLOSE()">取消</button></div>
    </div>`;
    m.classList.add('show');
    refreshPicked();
  };

  window.ZS_SESSION = mode => {
    if (!PICK) return;
    const scope = PICK.scope;
    const set = new Set(Array.from(document.querySelectorAll('#modal .pkch:checked')).map(c => c.getAttribute('data-mi') + '|' + c.getAttribute('data-ch')));
    let list = PICK.list.filter(q => set.has(pickKey(q)));
    if (S.shuffle) list = list.slice().sort(() => Math.random() - 0.5);
    ZS_CFGCLOSE();
    if (!list.length) return ZS.toast('至少要勾选一个章节');
    const nq = { id: 'Q' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36),
                 mode: mode, title: PICK.title, ids: list.map(x => x.id), i: 0,
                 sb: mode === 'sb' ? {} : null, ts: Date.now() };
    S.qlist = S.qlist || [];
    S.qlist.unshift(nq);
    S.q = nq; S.sb = nq.sb;
    if (mode === 'redo') list.forEach(q => { S['redo_' + q.id] = true; S['sel_' + q.id] = []; });
    saveSession(); updateQBadge();
    go('q/' + S.q.ids[0]);
    ZS.toast(mode === 'sb' ? ('已进入重做区：' + list.length + ' 题，作答不影响原记录')
      : (mode === 'redo' ? ('已进入原题重做：共 ' + list.length + ' 题') : ('已进入复习：共 ' + list.length + ' 题')), 2600);
    PICK = null;
  };

  /* ✕ = 离开队列（暂存起来，之后可从「队列」页继续），不销毁 */
  window.ZS_QEXIT = () => {
    const t = S.q ? S.q.title : '';
    parkQ();
    ZS.toast('已离开「' + t + '」，可在底部「队列」里继续', 2600);
    go('');
  };

  /* 重做区：结算 */
  window.ZS_SB_END = () => {
    const ids = S.sb ? Object.keys(S.sb) : [];
    if (!ids.length) { S.q = null; S.sb = null; saveSession(); return route(); }
    const right = ids.filter(id => S.sb[id].right).length;
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="box" style="max-width:430px">
      <h3>本次重做区结果</h3>
      <div style="font-size:15px;line-height:1.9;margin-bottom:14px">
        共做 <b>${ids.length}</b> 题，做对 <b style="color:var(--ok)">${right}</b> 题，做错 <b style="color:#c0392b">${ids.length - right}</b> 题。
        ${S.q && S.q.start ? `<br>用时 <b>${fmtDur(Date.now() - S.q.start)}</b>，得分 <b>${ids.length ? Math.round(right / ids.length * 100) : 0}</b> 分（百分制）` : ''}
      </div>
      <div class="tiny muted" style="margin-bottom:12px">同步会把这次的作答计入原题的做题次数与艾宾浩斯复习计划。</div>
      <div class="acts" style="flex-direction:column;align-items:stretch;gap:9px">
        <button class="btn main" onclick="ZS_SB_APPLY(1)">✅ 同步到原题（${ids.length} 题）</button>
        <button class="btn" onclick="ZS_SB_APPLY(0)">🗑 丢弃本次结果，不同步</button>
        <button class="btn" onclick="ZS_CFGCLOSE()">继续做（返回）</button>
      </div>
    </div>`;
    m.classList.add('show');
  };
  window.ZS_SB_APPLY = apply => {
    ZS_CFGCLOSE();
    const ids = S.sb ? Object.keys(S.sb) : [];
    if (apply) ids.forEach(id => setProg(id, S.sb[id].right, false, S.sb[id].sel));
    const qid = S.q ? S.q.id : null;
    S.qlist = (S.qlist || []).filter(x => x.id !== qid);
    S.q = null; S.sb = null; saveSession(); updateQBadge();
    ZS.toast(apply ? '已把 ' + ids.length + ' 题的结果同步到原题' : '已丢弃本次结果', 2600);
    go('');
  };
  window.ZS_SB_NEXT = () => {
    const k = S.q ? S.q.ids.indexOf(S.curId) : -1;
    if (!S.q || k < 0) return;
    if (k >= S.q.ids.length - 1) return ZS_SB_END();
    go('q/' + S.q.ids[k + 1]);
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
      document.body.classList.remove('notedraw');
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
      document.body.classList.remove('notedraw');
      ZS.save(true); renderNote(id); ZS.toast('已删除');
    });
  };
  window.ZS_PICDEL = (id, i) => {
    ZS.confirm('删除这张图片？', () => {
      const n = ZS.data.notes[id]; n.pics.splice(i, 1); n.ts = Date.now(); ZS.save(); drawPics(id);
    });
  };
  window.ZS_DOSEARCH = doSearch;
  window.ZS_SEARCHSET = (k, v) => {
    const inp = $('#sq');
    if (inp) {
      if ((S.searchMode || 'questions') === 'documents') S.docSearchQ = inp.value;
      else S.searchQ = inp.value;
    }
    if (k === 'mi') S.searchMi = v;
    else if (k === 'doc') S.searchDocKind = v;
    else S.searchScope = v;
    renderSearch();
  };
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
  let ZL = null, ZI = 0;
  function openZoom(list, i) {
    ZL = list; ZI = i;
    const cur = list[i] || { src: '', label: '' };
    const m = document.getElementById('modal');
    m.innerHTML = `<div id="zoomBox">
      <div id="zoomBar">
        ${list.length > 1 ? `<button class="iconbtn" onclick="ZS_ZNAV(-1)" ${i <= 0 ? 'disabled' : ''}>‹ 上一页</button>` : ''}
        <span id="zoomTitle">${esc(cur.label || '')}${list.length > 1 ? `　(${i + 1}/${list.length})` : ''}</span>
        <span style="flex:1"></span>
        <button class="iconbtn" onclick="ZS_ZOOMSET('fit')">适应宽度</button>
        <button class="iconbtn" onclick="ZS_ZOOMSET('100')">原始</button>
        <button class="iconbtn" onclick="ZS_ZOOMSET('200')">2×</button>
        ${list.length > 1 ? `<button class="iconbtn" onclick="ZS_ZNAV(1)" ${i >= list.length - 1 ? 'disabled' : ''}>下一页 ›</button>` : ''}
        <button class="iconbtn" onclick="ZS_CFGCLOSE()">✕</button>
      </div>
      <div id="zoomScroll"><img id="zoomImg" src="${cur.src}" alt="" onload="ZS_ZOOMSET(localStorage.getItem('zz720.zoom') || 'fit')"></div>
    </div>`;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    window.__zoomSrc = cur.src;
    ZS_ZOOMSET(localStorage.getItem('zz720.zoom') || 'fit');
    const sc = document.getElementById('zoomScroll'); if (sc) sc.scrollTop = 0;
  }
  window.ZS_ZNAV = d => {
    if (!ZL) return;
    const k = ZI + d;
    if (k < 0 || k >= ZL.length) return;
    openZoom(ZL, k);
  };
  let _annoT = null;
  window.ZS_ANNOSYNC = () => {
    clearTimeout(_annoT);
    _annoT = setTimeout(() => { try { ANNO.renderScope(); } catch (e) { } }, 140);
  };

  window.ZS_ZOOM = img => {
    const box = img.closest('.pages') || img.parentElement;
    const all = Array.from(box.querySelectorAll('img')).map(x => ({ src: x.getAttribute('src'), label: x.getAttribute('data-label') || '' }));
    let i = all.map(o => o.src).indexOf(img.getAttribute('src'));
    if (i < 0) { all.length = 0; all.push({ src: img.getAttribute('src'), label: img.getAttribute('data-label') || '' }); i = 0; }
    openZoom(all, i);
  };
  window.ZS_ZOOMSRC = src => { openZoom([{ src: src, label: '' }], 0); };
  window.ZS_ZOOMSET = mode => {
    const im = document.getElementById('zoomImg'); if (!im) return;
    localStorage.setItem('zz720.zoom', mode);
    if (mode === 'fit') im.style.width = '100%';
    else im.style.width = mode === '100' ? im.naturalWidth + 'px' : (im.naturalWidth * 2) + 'px';
    im.style.maxWidth = 'none';
  };

  /* 手动拉取后把队列会话重新装配一遍（换设备时用得到） */
  window.ZS_RELOAD = () => { loadSession(); route(); updateQBadge(); };
  /* ---------- 云端历史版本 ---------- */
  const snapLine = s => `已做 ${s.progress} 题 · 笔记 ${s.notes} · 批注 ${s.annos} · 收藏 ${s.flags} · 打卡 ${s.daily} 天 · 队列 ${s.queue}`;
  const ago = t => {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  };
  window.ZS_HIST = async () => {
    const c = ZS.cfg();
    if (!c.token) return ZS_CFG();
    const m = document.getElementById('modal');
    const box = t => '<div class="box"><h3>🕘 云端历史版本</h3><div class="tiny muted">' + t +
      '</div><div class="acts"><button class="btn" onclick="ZS_CFGCLOSE()">关闭</button></div></div>';
    m.innerHTML = box('正在读取…'); m.classList.add('show');
    let list;
    try { list = await ZS.history(30); }
    catch (e) { m.innerHTML = box('读取失败：' + esc(e.message)); return; }
    if (!list.length) { m.innerHTML = box('还没有历史版本。'); return; }
    m.innerHTML = `<div class="box">
      <h3>🕘 云端历史版本</h3>
      <div class="tiny muted" style="margin-bottom:8px">每次同步都会存一版，共 ${list.length} 版。
      「恢复」是把那一版**并回**本机（只增不减，不会弄丢现在的数据）。</div>
      <div style="max-height:52vh;overflow:auto">
      ${list.map((x, i) => {
        const t = Date.parse(x.commit.committer.date);
        return `<div style="padding:9px 0;border-top:1px solid var(--line)">
          <div><b>${esc(ZS.fmt(t))}</b> <span class="tiny muted">${esc(ago(t))}</span></div>
          <div class="tiny muted" id="hs${i}" style="margin-top:2px"></div>
          <div class="acts" style="margin-top:5px">
            <button class="btn" style="padding:5px 10px;font-size:13px" onclick="ZS_HVIEW('${x.sha}',${i})">查看内容</button>
            <button class="btn main" style="padding:5px 10px;font-size:13px" onclick="ZS_HRESTORE('${x.sha}',${i})">恢复这一版</button>
          </div></div>`;
      }).join('')}
      </div>
      <div class="acts"><button class="btn" onclick="ZS_CFGCLOSE()">关闭</button></div></div>`;
  };
  window.ZS_HVIEW = async (sha, i) => {
    const el = document.getElementById('hs' + i);
    if (!el) return;
    el.textContent = '读取中…';
    try { el.textContent = snapLine(ZS.summarize(await ZS.fetchVersion(sha))); }
    catch (e) { el.textContent = '读取失败：' + e.message; }
  };
  window.ZS_HRESTORE = (sha, i) => {
    ZS.confirm('把这一版合并回本机，并同步到云端？\n\n只会补上本机目前没有的记录，不会删掉任何现有数据。', async () => {
      ZS.toast('恢复中…');
      try {
        const ver = await ZS.fetchVersion(sha);
        const b = ZS.summarize(ZS.data);
        const ok = await ZS.restore(ver);
        const a = ZS.summarize(ZS.data);
        ZS.toast(ok ? `已恢复：进度 +${a.progress - b.progress}，笔记 +${a.notes - b.notes}，批注 +${a.annos - b.annos}，收藏 +${a.flags - b.flags}` : '恢复失败', 4000);
        ZS_RELOAD();
      } catch (e) { ZS.toast('恢复失败：' + e.message, 3600); }
    });
  };

  window.ZS_SYNC = async () => {
    const c = ZS.cfg();
    if (!c.token) return ZS_CFG();
    ZS.toast('同步中…');
    flushEditors();
    await ZS.sync(false);
    updateSyncStatus();
  };
  /* 应急：跳过合并，直接用本机这份把云端覆盖掉。
     只在你「故意在本机删了东西、想让云端也跟着删」时才用。 */
  window.ZS_FORCE = () => {
    const c = ZS.cfg();
    if (!c.token) return ZS_CFG();
    ZS.confirm('⚠️ 会用**本机**的数据覆盖云端。\n\n如果另一台设备上有本机没有的记录，那些会被删掉。\n\n平时不要用，只有在你想让「删除」也同步过去时才用。确定吗？', async () => {
      ZS.toast('正在覆盖云端…');
      const ok = await ZS.forcePush();
      ZS.toast(ok ? '已用本机数据覆盖云端 ✓' : '覆盖失败，看提示', 3000);
      route();
    });
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
    ZS.setCfg({ token: t, owner: rp[0] || 'aokid666', repo: rp[1] || 'zhengzhi-720', file: $('#cfgFile').value.trim() || 'userdata.json' });
    ZS_CFGCLOSE();
    /* 换令牌时，若本机还留着数据密钥，顺手把登录密文也更新掉 */
    let st = '';
    try { st = await ZS.refreshLogin(); } catch (e) { st = 'error'; }
    if (document.body.classList.contains('gated')) {
      ZS.toast(st === 'updated' ? '令牌已更新，登录密文也同步更新了 ✓'
                              : '令牌已保存，正在载入…', 2600);
      setTimeout(() => location.reload(), 700);
      return;
    }
    await ZS.sync(false); loadSession(); route(); updateSyncStatus();
    if (st === 'updated') ZS.toast('✅ 令牌已更新，登录密文也一起更新了', 3200);
    else if (st === 'old-format') ZS.toast('⚠️ 检测到旧格式的登录密文，换令牌后请到「🔐 设置登录密码」重设一次，以后就能自动更新了', 7000);
    else if (st === 'no-dek') ZS.toast('⚠️ 令牌换了，但登录密文没更新：请到「🔐 设置登录密码」重设一次，否则新设备会解锁出旧令牌', 7000);
    else if (st === 'error') ZS.toast('⚠️ 令牌已保存，但登录密文更新失败，建议去「🔐 设置登录密码」重设一次', 6000);
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
    a.href = URL.createObjectURL(blob);
    a.download = 'zhengzhi720-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    ZS.toast('已导出备份文件', 2200);
  };
  window.ZS_COPY = async () => {
    const data = JSON.stringify(ZS.data);
    try {
      await navigator.clipboard.writeText(data);
      ZS.toast('已复制备份内容到剪贴板（' + (data.length / 1024).toFixed(0) + ' KB）', 2600);
    } catch (e) {
      document.getElementById('modal').innerHTML = '<div class="box" style="max-width:520px"><h3>备份内容（请手动全选复制）</h3><textarea rows="8" style="width:100%;font-size:11px">' + esc(data) + '</textarea><div class="acts" style="justify-content:flex-end;margin-top:10px"><button class="btn" onclick="ZS_CFGCLOSE()">关闭</button></div></div>';
      document.getElementById('modal').classList.add('show');
    }
  };
  window.ZS_IMPORTBOX = () => {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="box" style="max-width:540px">
      <h3>从备份恢复</h3>
      <div class="tiny muted" style="margin-bottom:10px;line-height:1.8">选择之前导出的备份文件，或把备份 JSON 粘到下面。<br>恢复会<b>覆盖</b>本机现有的做题记录、笔记与手写标注。</div>
      <div class="fld"><label>① 选择备份文件</label><input type="file" id="impFile" accept=".json,application/json,text/plain"></div>
      <div class="fld"><label>② 或粘贴备份内容</label><textarea id="impText" rows="5" placeholder="在此粘贴备份 JSON…"></textarea></div>
      <div class="acts" style="justify-content:flex-end">
        <button class="btn" onclick="ZS_CFGCLOSE()">取消</button>
        <button class="btn main" onclick="ZS_DOIMPORT()">恢复</button>
      </div></div>`;
    m.classList.add('show');
    const f = document.getElementById('impFile');
    f.onchange = () => {
      const file = f.files && f.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => { document.getElementById('impText').value = fr.result; ZS.toast('已读取文件：' + file.name, 2000); };
      fr.readAsText(file);
    };
  };
  window.ZS_DOIMPORT = () => {
    const t = (document.getElementById('impText').value || '').trim();
    if (!t) return ZS.toast('请先选择文件或粘贴备份内容');
    let d;
    try { d = JSON.parse(t); } catch (e) { return ZS.toast('备份内容无法解析，请检查是否完整'); }
    if (!d || typeof d !== 'object' || (!d.progress && !d.notes && !d.annos && !d.flags)) return ZS.toast('这似乎不是本题库的备份');
    const np = Object.keys(d.progress || {}).length, nn = Object.keys(d.notes || {}).length, na = Object.keys(d.annos || {}).length;
    ZS.confirm('确定恢复这份备份吗？\n（做题记录 ' + np + ' 题 · 笔记 ' + nn + ' 条 · 手写标注 ' + na + ' 处）\n会覆盖本机现有数据。', () => {
      ZS.data.progress = d.progress || {};
      ZS.data.notes = d.notes || {};
      ZS.data.annos = d.annos || {};
      ZS.data.flags = d.flags || {};
      ZS.data.edit = d.edit || {};
      ZS.save();
      ZS_CFGCLOSE();
      ZS.toast('已恢复备份：做题记录 ' + np + ' 题', 2600);
      route();
    });
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
