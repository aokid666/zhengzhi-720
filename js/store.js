/* 本地 + 云端存储层
   云端：GitHub Contents API 读写 userdata.json（放在独立的 userdata 分支，避免每次同步触发 Pages 重建）
   token 只存在本机 localStorage */
window.ZS = (function () {
  const P = 'zz720.v1.';
  const OWNER = 'aokid666', REPO = 'zhengzhi-720', BRANCH = 'userdata', FILE = 'userdata.json';
  const K = { data: P + 'data', cfg: P + 'cfg' };

  const blank = () => ({ v: 1, updated: 0, progress: {}, notes: {}, annos: {}, flags: {}, edit: {} });

  let data = blank();
  let dirty = false, pushTimer = null, syncing = false, lastSync = 0;
  let lastErr = '', lastErrAt = 0, lastOkAt = 0;

  function load() {
    try { data = Object.assign(blank(), JSON.parse(localStorage.getItem(K.data) || '{}')); }
    catch (e) { data = blank(); }
    if (!data.progress) data.progress = {};
    if (!data.notes) data.notes = {};
    if (!data.annos) data.annos = {};
    if (!data.flags) data.flags = {};
    if (!data.edit) data.edit = {};
    return data;
  }
  function save(now) {
    data.updated = Date.now();
    localStorage.setItem(K.data, JSON.stringify(data));
    dirty = true;
    if (now) return push();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push(true), 12000);
  }
  /* ---------- 登录密码：用密码加密令牌，密文放仓库里 ----------
     密文公开无所谓，没有密码解不开；密码不上传、不进代码、不进聊天。 */
  const LOGIN = 'login.json';
  const ITER = 310000;

  const ab2b64 = ab => {
    const b = new Uint8Array(ab); let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  };
  const b642ab = t => {
    const bin = atob(t); const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  };
  async function deriveKey(user, pass, salt, iter) {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(user + '\u0000' + pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  /* 密文放在 main 分支的 login.json，由 Pages 同源提供
     （raw.githubusercontent.com 在国内被墙，不能用） */
  async function fetchLogin() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(LOGIN + '?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } finally { clearTimeout(timer); }
  }
  /* 双层密钥：密码只用来包裹「数据密钥 DEK」，令牌用 DEK 加密。
     好处：以后换令牌，只要本机还留着 DEK，不用再输密码就能更新密文。 */
  const DK = P + 'dek';
  const getDek = () => { try { const t = localStorage.getItem(DK); return t ? b642ab(t) : null; } catch (e) { return null; } };
  const setDek = d => { try { localStorage.setItem(DK, ab2b64(d)); } catch (e) { } };
  function forgetDek() { try { localStorage.removeItem(DK); } catch (e) { } }

  async function makeLogin(user, pass, tokenIn) {
    const token = tokenIn || cfg().token;
    if (!token) throw new Error('本机还没有令牌，先设置令牌再设密码');
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    const tiv = crypto.getRandomValues(new Uint8Array(12));
    const kek = await deriveKey(user, pass, salt, ITER);
    const wrap = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, kek, dek);
    const dk = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: tiv }, dk,
                                            new TextEncoder().encode(token));
    setDek(dek);
    return { v: 2, kdf: 'PBKDF2-SHA256', iter: ITER,
             salt: ab2b64(salt), wiv: ab2b64(wiv), wrap: ab2b64(wrap),
             tiv: ab2b64(tiv), ct: ab2b64(ct), hint: user, ts: Date.now() };
  }

  /* 换令牌后自动更新密文（用本机 DEK，不需要再输密码）
     返回 'updated' / 'no-login'（还没设过密码）/ 'no-dek'（本机没有 DEK，要重设密码） */
  async function refreshLogin(tokenIn) {
    const token = tokenIn || cfg().token;
    const dek = getDek();
    if (!dek) return 'no-dek';
    if (!token) return 'no-token';
    let blob = null;
    try { blob = await fetchLogin(); } catch (e) { return 'error'; }
    if (!blob) return 'no-login';
    if (blob.v !== 2) return 'old-format';
    const tiv = crypto.getRandomValues(new Uint8Array(12));
    const dk = await crypto.subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: tiv }, dk,
                                            new TextEncoder().encode(token));
    blob.tiv = ab2b64(tiv); blob.ct = ab2b64(ct); blob.ts = Date.now();
    await saveLogin(blob);
    return 'updated';
  }

  async function saveLogin(blob) {
    const c = cfg();
    let sha = null;
    const g = await api(c, 'contents/' + LOGIN + '?ref=main', { headers: hdr(c) });
    if (g.ok) sha = (await g.json()).sha;
    const body = { message: '更新登录密码', branch: 'main',
                   content: b64enc(JSON.stringify(blob)) };
    if (sha) body.sha = sha;
    const p = await api(c, 'contents/' + LOGIN, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!p.ok) { const e = await p.json().catch(() => ({})); throw new Error(e.message || ('HTTP ' + p.status)); }
    return true;
  }

  /* 把老格式密文升级成 v2。必须在 setCfg({token}) 之后调用，否则没有鉴权写不上去 */
  async function upgradeLogin(user, pass, tokenIn) {
    const token = tokenIn || cfg().token;
    if (!token || !cfg().token) return false;
    let blob = null;
    try { blob = await fetchLogin(); } catch (e) { return false; }
    if (!blob || blob.v === 2) return false;
    await saveLogin(await makeLogin(user, pass, token));
    return true;
  }

  async function unlock(user, pass) {
    const blob = await fetchLogin();
    if (!blob) throw new Error('云端还没有设置登录密码');
    const kek = await deriveKey(user, pass, b642ab(blob.salt), blob.iter || ITER);
    if (blob.v !== 2) {
      /* 老格式（v1）：密码直接加密令牌，没有数据密钥 */
      try {
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b642ab(blob.iv) }, kek, b642ab(blob.ct));
        return new TextDecoder().decode(pt);
      } catch (e) { throw new Error('账号或密码不对'); }
    }
    let dekRaw;
    try {
      dekRaw = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b642ab(blob.wiv) }, kek, b642ab(blob.wrap)));
    } catch (e) { throw new Error('账号或密码不对'); }
    const dk = await crypto.subtle.importKey('raw', dekRaw, { name: 'AES-GCM' }, false, ['decrypt']);
    let pt;
    try {
      pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b642ab(blob.tiv) }, dk, b642ab(blob.ct));
    } catch (e) { throw new Error('密文已损坏，请用令牌进入后重设密码'); }
    setDek(dekRaw);
    return new TextDecoder().decode(pt);
  }

  function cfg() {
    const def = { owner: OWNER, repo: REPO, branch: BRANCH, file: FILE, auto: true };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(K.cfg) || '{}')); }
    catch (e) { return def; }
  }
  function setCfg(c) { localStorage.setItem(K.cfg, JSON.stringify(Object.assign(cfg(), c))); }

  function hdr(c) { return { 'Authorization': 'token ' + c.token, 'Accept': 'application/vnd.github+json' }; }
  function api(c, path, opt) {
    const url = 'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/' + path;
    opt = opt || {};
    opt.headers = Object.assign(hdr(c), opt.headers || {});
    return fetch(url, opt);
  }

  function b64enc(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ''; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function b64dec(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* userdata 分支不存在时，从 main 建一个 */
  async function ensureBranch(c) {
    if (!c.branch || c.branch === 'main') return true;
    const g = await api(c, 'git/ref/heads/' + c.branch, { headers: hdr(c) });
    if (g.ok || g.status === 200) return true;
    const m = await api(c, 'git/ref/heads/main', { headers: hdr(c) });
    if (!m.ok) return false;
    const sha = (await m.json()).object.sha;
    const p = await api(c, 'git/refs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/' + c.branch, sha: sha }),
    });
    return p.ok || p.status === 422;
  }

  /* 把云端文本并进本地（只增不减：远端条目更新才覆盖本地） */
  function applyRemote(txt) {
    const remote = JSON.parse(txt);
    merge(remote);
    localStorage.setItem(K.data, JSON.stringify(data));
    return remote;
  }

  async function pull(silent) {
    const c = cfg();
    if (!c.token) { if (!silent) toast('还没填 GitHub 令牌'); return null; }
    try {
      const r = await api(c, 'contents/' + c.file + '?ref=' + c.branch, { headers: hdr(c) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      return applyRemote(b64dec(j.content));
    } catch (e) { setErr('拉取失败：' + e.message); if (!silent) toast('拉取失败：' + e.message); return null; }
  }

  async function push(silent, force) {
    const c = cfg();
    if (!c.token) { if (!silent) toast('还没填 GitHub 令牌'); return false; }
    if (syncing) return false;
    syncing = true;
    try {
      let sha = null;
      const g = await api(c, 'contents/' + c.file + '?ref=' + c.branch, { headers: hdr(c) });
      if (g.ok) {
        const j = await g.json();
        sha = j.sha;
        /* 关键：上传前先把云端并进来。
           上传是「全量覆盖」，不先合并的话，本机这份（比如换设备后还没拉到的空数据）
           会把别的设备的记录整份抹掉。合并只会把云端多出来的条目补进本地，不会删本地任何东西。 */
        if (!force) {
          try { applyRemote(b64dec(j.content)); }
          catch (e) { if (!silent) toast('云端文件异常，已取消上传以保护记录', 3600); syncing = false; return false; }
        }
      } else if (g.status !== 404) {
        throw new Error('读取云端失败 HTTP ' + g.status);
      } else if (!(await ensureBranch(c))) {
        throw new Error('无法创建分支 ' + c.branch);
      }
      const body = {
        message: 'sync ' + new Date().toISOString().slice(0, 19),
        branch: c.branch, content: b64enc(JSON.stringify(data)),
      };
      if (sha) body.sha = sha;
      const p = await api(c, 'contents/' + c.file, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!p.ok) { const e = await p.json().catch(() => ({})); throw new Error(explain(p.status) + (e.message ? '（' + e.message + '）' : '')); }
      dirty = false; lastSync = Date.now(); lastOkAt = Date.now(); lastErr = '';
      if (!silent) toast('已同步到云端 ✓');
      document.dispatchEvent(new CustomEvent('zs-synced'));
      return true;
    } catch (e) {
      setErr(e.message || String(e));
      if (!silent) toast('同步失败：' + e.message, 3600);
      return false;
    }
    finally { syncing = false; }
  }

  /* 合并云端数据进本地。**只增不减**：本机已有的东西不会因为云端没有就被删掉。
     - MAPS  按 key 逐条比 ts，谁新用谁
     - daily 计数类，取最大值（同一天在两台设备各做了几题）
     - hist  作答历史是数组，按时间戳并集去重
     - ONES  整体对象比 ts（队列会话这种"最新一次状态"） */
  const MAPS = ['progress', 'notes', 'annos', 'flags', 'edit'];
  const ONES = ['session'];

  function merge(remote) {
    if (!remote) return;
    for (const g of MAPS) {
      const r = remote[g] || {}, l = data[g] || {};
      for (const k in r) if (!l[k] || (r[k].ts || 0) > (l[k].ts || 0)) l[k] = r[k];
      data[g] = l;
    }
    if (remote.daily) {
      const l = data.daily = data.daily || {};
      for (const k in remote.daily) {
        const r = remote.daily[k], o = l[k];
        if (!o) l[k] = r;
        else { o.n = Math.max(o.n || 0, r.n || 0); o.r = Math.max(o.r || 0, r.r || 0); }
      }
    }
    if (remote.hist) {
      const l = data.hist = data.hist || {};
      for (const k in remote.hist) {
        const r = remote.hist[k] || [];
        if (!l[k]) { l[k] = r.slice(); continue; }
        const seen = {};
        l[k].forEach(x => { seen[x.t] = 1; });
        r.forEach(x => { if (!seen[x.t]) { l[k].push(x); seen[x.t] = 1; } });
        l[k].sort((a, b) => a.t - b.t);
        if (l[k].length > 30) l[k].splice(0, l[k].length - 30);
      }
    }
    for (const g of ONES) {
      const r = remote[g];
      if (r && (!data[g] || (r.ts || 0) > (data[g].ts || 0))) data[g] = r;
    }
    data.updated = Math.max(data.updated || 0, remote.updated || 0);
  }

  function setErr(msg) {
    lastErr = String(msg).slice(0, 200); lastErrAt = Date.now();
    try { document.dispatchEvent(new CustomEvent('zs-error', { detail: lastErr })); } catch (e) { }
  }
  /* 401/403 基本就是令牌失效或权限不够 */
  function explain(status) {
    if (status === 401) return '令牌无效或已过期 —— 请到「我的 → 设置令牌」重新填一个';
    if (status === 403) return '令牌权限不够（需要 repo 权限）或触发了限流';
    if (status === 404) return '找不到仓库/分支/文件 —— 检查「设置令牌」里的仓库和路径';
    if (status === 409) return '版本冲突 —— 再点一次「立即同步」通常就好';
    if (status === 422) return '请求被拒绝 —— 可能是文件太大或分支有问题';
    return 'HTTP ' + status;
  }

  /* ---------- 云端历史版本（每次同步都是一个 git 提交）---------- */
  async function history(limit) {
    const c = cfg();
    const r = await api(c, 'commits?sha=' + encodeURIComponent(c.branch) +
                          '&path=' + encodeURIComponent(c.file) + '&per_page=' + (limit || 30));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }
  async function fetchVersion(sha) {
    const c = cfg();
    const r = await api(c, 'contents/' + c.file + '?ref=' + encodeURIComponent(sha));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return JSON.parse(b64dec(j.content));
  }
  /* 把某一版合并回本地再上传（只增不减，所以不会把现有数据弄丢） */
  async function restore(ver) {
    merge(ver);
    localStorage.setItem(K.data, JSON.stringify(data));
    return await push(true);
  }
  function summarize(v) {
    const n = o => Object.keys(o || {}).length;
    return { progress: n(v.progress), notes: n(v.notes), annos: n(v.annos),
             flags: n(v.flags), hist: n(v.hist), daily: n(v.daily),
             queue: (v.session && v.session.list) ? v.session.list.length : 0 };
  }

  let toastT = null;
  function toast(msg, ms) {
    if (!msg) return;
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms || 2200);
  }
  function fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts), n = new Date();
    const p = x => String(x).padStart(2, '0');
    return (d.toDateString() === n.toDateString() ? '今天 ' : '') +
      p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  return {
    load, save, cfg, setCfg, pull, push, toast, fmt, ensureBranch,
    forcePush: silent => push(silent, true),   // 跳过合并，直接用本机数据覆盖云端
    history, fetchVersion, restore, summarize,
    get lastErr() { return lastErr; },
    get lastErrAt() { return lastErrAt; },
    get lastOkAt() { return lastOkAt; },
    explain,
    fetchLogin, makeLogin, saveLogin, unlock, upgradeLogin, refreshLogin, forgetDek,
    get data() { return data; },
    get dirty() { return dirty; },
    get lastSync() { return lastSync; },
    reset() { data = blank(); localStorage.removeItem(K.data); },
  };
})();
