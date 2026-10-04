/* 本地 + 云端存储层
   云端：GitHub Contents API 读写 userdata.json（放在独立的 userdata 分支，避免每次同步触发 Pages 重建）
   token 只存在本机 localStorage */
window.ZS = (function () {
  const P = 'zz720.v1.';
  const OWNER = 'aokid666', REPO = 'zhengzhi-720', BRANCH = 'userdata', FILE = 'userdata.json';
  const K = { data: P + 'data', cfg: P + 'cfg', meta: P + 'syncmeta', device: P + 'device' };
  const MAPS = ['progress', 'notes', 'annos', 'flags', 'edit'];
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const safeKey = k => !['__proto__', 'constructor', 'prototype'].includes(k);
  const stable = o => JSON.stringify(o, function (k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = {}; Object.keys(v).filter(safeKey).sort().forEach(x => { out[x] = v[x]; }); return out;
    }
    return v;
  });
  const equal = (a, b) => stable(a) === stable(b);
  const syncBlank = () => ({ v: 2, fields: {}, deleted: {}, conflicts: {}, daily: {}, attempts: {} });
  const blank = () => ({ v: 2, updated: 0, progress: {}, notes: {}, annos: {}, flags: {}, edit: {}, sync: syncBlank() });
  let data = blank(), observed = clone(data);
  let dirty = false, pushTimer = null, maxTimer = null, retryTimer = null, syncing = false, lastSync = 0;
  let lastErr = '', lastErrAt = 0, lastOkAt = 0, failCount = 0, corruptLocal = false;
  let meta = { rev: 0, ack: 0, lastOkAt: 0 }, clock = 0, serial = Promise.resolve(), running = false;
  const randomId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() :
                         Date.now().toString(36) + Math.random().toString(36).slice(2));
  let device;
  try { device = localStorage.getItem(K.device) || randomId(); localStorage.setItem(K.device, device); }
  catch (e) { device = randomId(); }
  // 每个标签页一个写入者，避免同机多标签页的计数混在同一个桶里。
  const writer = device + ':' + randomId();
  const editors = new Map();
  const editorKey = (group, key) => group + '\u0000' + key;
  function beginEdit(group, key, fields) {
    const id = editorKey(group, key); if (editors.has(id)) return;
    const stamps = {};
    fields.forEach(field => { stamps[field] = clone(fieldStamp(data, group, key, field)); });
    stamps.$deleted = clone((data.sync.deleted[group] || {})[key]);
    editors.set(id, stamps);
  }
  function endEdit(group, key) { editors.delete(editorKey(group, key)); }

  function normalize(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('数据格式不正确');
    d.v = 2;
    d.daily = d.daily || {}; d.hist = d.hist || {};
    MAPS.forEach(g => { if (!d[g] || typeof d[g] !== 'object' || Array.isArray(d[g])) d[g] = {}; });
    d.sync = Object.assign(syncBlank(), d.sync || {});
    ['fields', 'deleted', 'conflicts', 'daily', 'attempts'].forEach(g => { if (!d.sync[g]) d.sync[g] = {}; });
    // 在任何修改前固定老字段的版本；不能让一次文字编辑把旧手写也标成新版本。
    for (const g of MAPS) {
      const fields = d.sync.fields[g] = d.sync.fields[g] || {};
      d.sync.deleted[g] = d.sync.deleted[g] || {};
      for (const k of Object.keys(d[g]).filter(safeKey)) {
        const row = d[g][k]; if (!row || typeof row !== 'object') throw new Error('记录格式不正确');
        const stamps = fields[k] = fields[k] || {};
        Object.keys(row).filter(f => safeKey(f) && f !== 'ts' && !(g === 'progress' && ['tries', 'rights'].includes(f)))
          .forEach(f => { if (!own(stamps, f)) stamps[f] = legacy(row); });
      }
    }
    if (d.session && !d.sync.session) d.sync.session = legacy(d.session);
    // 老记录只迁一次到 legacy 桶；新作答按写入者计数，合并时不会重复相加。
    Object.keys(d.daily || {}).filter(safeKey).forEach(day => {
      if (!d.sync.daily[day]) d.sync.daily[day] = { legacy: clone(d.daily[day]) };
    });
    Object.keys(d.progress).filter(safeKey).forEach(id => {
      if (!d.sync.attempts[id]) d.sync.attempts[id] = { legacy: {
        n: d.progress[id].tries || 0, r: d.progress[id].rights || 0 } };
    });
    return d;
  }
  function readMeta() {
    try { return Object.assign({ rev: 0, ack: 0, lastOkAt: 0 }, JSON.parse(localStorage.getItem(K.meta) || '{}')); }
    catch (e) { return { rev: 0, ack: 0, lastOkAt: 0 }; }
  }
  function emit(type, detail) {
    try { document.dispatchEvent(new CustomEvent(type, { detail: detail })); } catch (e) { }
  }
  function persistMeta() {
    const other = readMeta();
    meta.rev = Math.max(meta.rev, other.rev); meta.ack = Math.max(meta.ack, other.ack);
    meta.lastOkAt = lastOkAt; meta.lastErr = lastErr; meta.lastErrAt = lastErrAt;
    localStorage.setItem(K.meta, JSON.stringify(meta));
    dirty = meta.rev > meta.ack;
  }
  function persist() {
    try {
      // 先写待同步标记，防止在两次写入之间关闭页面导致队列消失。
      persistMeta(); localStorage.setItem(K.data, JSON.stringify(data));
      observed = clone(data); emit('zs-state'); return true;
    } catch (e) {
      dirty = meta.rev > meta.ack;
      setErr('本机保存失败：存储空间不足或浏览器限制。请先导出备份，勿关闭页面。');
      return false;
    }
  }
  function pending() {
    meta.rev = Math.max(meta.rev, readMeta().rev) + 1; dirty = true;
  }
  function load() {
    meta = readMeta(); lastOkAt = meta.lastOkAt || 0; lastSync = lastOkAt;
    lastErr = meta.lastErr || ''; lastErrAt = meta.lastErrAt || 0;
    try {
      const raw = localStorage.getItem(K.data);
      data = normalize(Object.assign(blank(), JSON.parse(raw || '{}')));
      if (!localStorage.getItem(K.meta) && raw && hasRecords(data)) pending();
      clock = data.updated || 0;
    } catch (e) {
      // 不自动清掉损坏的原数据，更不能拿空白记录覆盖云端。
      corruptLocal = true; setErr('本机记录无法读取，已停止上传。请先导出原始数据或检查备份。');
    }
    dirty = dirty || meta.rev > meta.ack; observed = clone(data); emit('zs-state');
    return data;
  }
  function hasRecords(d) {
    return MAPS.some(g => Object.keys(d[g] || {}).length) || !!d.session || Object.keys(d.hist || {}).length > 0;
  }
  function vectors(stamp) { return stamp && stamp.vv || { legacy: stamp && stamp.t || 0 }; }
  function dominates(a, b) {
    const av = vectors(a), bv = vectors(b);
    return Object.keys(bv).every(k => (av[k] || 0) >= (bv[k] || 0));
  }
  function compare(a, b) {
    return (a.t || 0) - (b.t || 0) || String(a.d || '').localeCompare(String(b.d || '')) ||
           (a.c || 0) - (b.c || 0);
  }
  function legacy(row) { const ts = row && row.ts || 0; return { t: ts, c: 0, d: 'legacy', vv: { legacy: ts } }; }
  function fieldStamp(d, g, k, f) {
    return ((d.sync.fields[g] || {})[k] || {})[f] || legacy(d[g] && d[g][k]);
  }
  function newStamp(previous) {
    const vv = {};
    (previous || []).forEach(s => { Object.keys(vectors(s)).forEach(k => { vv[k] = Math.max(vv[k] || 0, vectors(s)[k]); }); });
    vv[writer] = meta.rev;
    clock = Math.max(clock, Date.now(), ...(previous || []).map(s => s && s.t || 0));
    return { t: clock, c: meta.rev, d: writer, vv: vv };
  }
  function fieldMeta(g, k) {
    const group = data.sync.fields[g] = data.sync.fields[g] || {};
    return group[k] = group[k] || {};
  }
  function captureChanges() {
    let changed = false;
    for (const g of MAPS) {
      const before = observed[g] || {}, after = data[g] || {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (!safeKey(k)) continue;
        const old = before[k], row = after[k];
        if (old && !row) {
          const prev = Object.values(fieldMeta(g, k)).concat(legacy(old));
          const gone = data.sync.deleted[g] = data.sync.deleted[g] || {};
          gone[k] = newStamp(prev); changed = true; continue;
        }
        if (!row) continue;
        for (const f of new Set([...Object.keys(old || {}), ...Object.keys(row)])) {
          if (!safeKey(f) || f === 'ts' || (g === 'progress' && ['tries', 'rights'].includes(f))) continue;
          if (!equal((old || {})[f], row[f])) {
            const deletion = (data.sync.deleted[g] || {})[k];
            const editor = editors.get(editorKey(g, k));
            const current = fieldStamp(observed, g, k, f), base = editor && editor[f] || current;
            if (editor && !dominates(base, current)) keepConflict(g, k, f, (old || {})[f], current);
            const stamp = newStamp([base, editor ? editor.$deleted : deletion].filter(Boolean));
            fieldMeta(g, k)[f] = stamp; row.ts = stamp.t; changed = true;
            if (editor) editor[f] = clone(stamp);
          }
        }
      }
    }
    if (!equal(observed.session, data.session)) {
      data.sync.session = newStamp([observed.sync.session || legacy(observed.session)]); changed = true;
    }
    if (!equal(observed.hist, data.hist) || !equal(observed.sync.daily, data.sync.daily) ||
        !equal(observed.sync.attempts, data.sync.attempts) || !equal(observed.sync.conflicts, data.sync.conflicts)) changed = true;
    return changed;
  }
  function schedule(delay) {
    if (!cfg().auto || !cfg().token || meta.blocked) return;
    clearTimeout(pushTimer); pushTimer = setTimeout(() => push(true), delay == null ? 3000 : delay);
    // 连续打字/手写也最多等 15 秒，不一直重置上传倒计时。
    if (!maxTimer) maxTimer = setTimeout(() => { maxTimer = null; push(true); }, 15000);
  }
  function clearPushTimers() { clearTimeout(pushTimer); clearTimeout(maxTimer); pushTimer = maxTimer = null; }
  function save(now) {
    if (corruptLocal) return false;
    const previousRev = meta.rev;
    meta.rev = Math.max(meta.rev, readMeta().rev) + 1;
    if (!captureChanges()) { meta.rev = Math.max(previousRev, readMeta().rev); return now ? sync(false) : true; }
    // 另一个标签页可能已经保存；先合并，再落盘，不能整份盖掉它的改动。
    try {
      const latest = localStorage.getItem(K.data);
      if (latest && !equal(JSON.parse(latest), observed)) merge(JSON.parse(latest));
    } catch (e) { setErr('其他标签页的记录无法合并，请先导出备份'); }
    data.updated = Math.max(Date.now(), clock); dirty = true;
    persist();
    if (now) return push();
    schedule(); return true;
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
  function setCfg(c) {
    const before = cfg(), next = Object.assign({}, before, c);
    localStorage.setItem(K.cfg, JSON.stringify(next));
    clearTimeout(retryTimer); retryTimer = null; failCount = 0;
    meta.blocked = false;
    if (before.token !== next.token) lastErr = '';
    if (['owner', 'repo', 'branch', 'file'].some(k => before[k] !== next[k])) { pending(); persist(); }
    emit('zs-state');
  }

  function hdr(c) { return { 'Authorization': 'token ' + c.token, 'Accept': 'application/vnd.github+json' }; }
  async function api(c, path, opt) {
    const url = 'https://api.github.com/repos/' + c.owner + '/' + c.repo + '/' + path;
    opt = opt || {};
    opt.headers = Object.assign(hdr(c), opt.headers || {});
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try { return await fetch(url, Object.assign({}, opt, { signal: ctl.signal, cache: 'no-store' })); }
    catch (e) {
      if (e.name === 'AbortError') throw Object.assign(new Error('请求超时，联网后会自动重试'), { retryable: true });
      throw Object.assign(new Error('网络连接失败：' + e.message), { retryable: true });
    } finally { clearTimeout(timer); }
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
    if (g.status !== 404) await checkResponse(g);
    const m = await api(c, 'git/ref/heads/main', { headers: hdr(c) });
    if (!m.ok) await checkResponse(m);
    const sha = (await m.json()).object.sha;
    const p = await api(c, 'git/refs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'refs/heads/' + c.branch, sha: sha }),
    });
    if (p.ok) return true;
    if (p.status === 422) {
      const created = await api(c, 'git/ref/heads/' + c.branch);
      if (created.ok) return true;
    }
    await checkResponse(p);
  }

  function putField(row, field, value) {
    if (value === undefined) { delete row[field]; return; }
    if (Array.isArray(row[field]) && Array.isArray(value)) {
      const copied = clone(value); row[field].length = 0; copied.forEach(item => row[field].push(item));
    }
    else row[field] = clone(value);
  }
  function conflictId(value) {
    const text = stable(value); let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16);
  }
  function keepConflict(group, key, field, value, stamp) {
    const entry = { group: group, key: key, field: field, value: clone(value), absent: value === undefined, stamp: clone(stamp) };
    data.sync.conflicts[conflictId(entry)] = entry;
  }
  function mergeCounters(target, remote) {
    for (const key of Object.keys(remote || {}).filter(safeKey)) {
      const buckets = target[key] = target[key] || {};
      for (const id of Object.keys(remote[key]).filter(safeKey)) {
        const a = buckets[id] || {}, b = remote[key][id] || {};
        buckets[id] = { n: Math.max(a.n || 0, b.n || 0), r: Math.max(a.r || 0, b.r || 0) };
      }
    }
  }
  function counterTotal(buckets) {
    return Object.values(buckets || {}).reduce((sum, x) => ({ n: sum.n + (x.n || 0), r: sum.r + (x.r || 0) }), { n: 0, r: 0 });
  }
  function recount() {
    data.daily = data.daily || {};
    Object.keys(data.sync.daily).forEach(day => { data.daily[day] = counterTotal(data.sync.daily[day]); });
    Object.keys(data.sync.attempts).forEach(id => {
      if (data.progress[id]) {
        const total = counterTotal(data.sync.attempts[id]);
        data.progress[id].tries = total.n; data.progress[id].rights = total.r;
      }
    });
  }
  function recordAnswer(id, right, sel) {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    for (const [group, key] of [['daily', day], ['attempts', id]]) {
      const buckets = data.sync[group][key] = data.sync[group][key] || {};
      const count = buckets[writer] = buckets[writer] || { n: 0, r: 0 };
      count.n++; if (right) count.r++;
    }
    const hist = data.hist = data.hist || {}, list = hist[id] = hist[id] || [];
    list.push({ id: writer + ':' + randomId(), t: Date.now(), r: right ? 1 : 0, s: (sel || []).join('') });
    if (list.length > 30) list.splice(0, list.length - 30);
    recount();
  }

  // 字段分别合并；向量版本能区分“先后修改”和“各自在旧版本上修改”。
  // 后者保留输掉的版本，避免把同一题的文字/手写编辑静默丢掉。
  function merge(input) {
    const remote = normalize(clone(input));
    for (const [id, value] of Object.entries(remote.sync.conflicts)) if (safeKey(id)) data.sync.conflicts[id] = value;
    for (const g of MAPS) {
      const rm = remote[g], lm = data[g];
      const rFields = remote.sync.fields[g] || {}, lFields = data.sync.fields[g] || {};
      for (const k of new Set([...Object.keys(rm), ...Object.keys(rFields)])) {
        if (!safeKey(k)) continue;
        const r = rm[k] || {}, l = lm[k] = lm[k] || {};
        const stamps = fieldMeta(g, k);
        const fields = new Set([...Object.keys(r), ...Object.keys(rFields[k] || {})]);
        for (const f of fields) {
          if (!safeKey(f) || f === 'ts' || (g === 'progress' && ['tries', 'rights'].includes(f))) continue;
          const a = fieldStamp(data, g, k, f), b = fieldStamp(remote, g, k, f);
          const known = own(l, f) || own(lFields[k], f);
          const aAfter = dominates(a, b), bAfter = dominates(b, a);
          const same = equal(l[f], r[f]);
          const concurrent = known && !same && ((!aAfter && !bAfter) || (aAfter && bAfter));
          let useRemote = !known || (bAfter && !aAfter);
          if (known && ((!aAfter && !bAfter) || (aAfter && bAfter))) {
            useRemote = compare(b, a) > 0 || (compare(b, a) === 0 && String(stable(r[f])) > String(stable(l[f])));
          }
          if (concurrent) keepConflict(g, k, f, useRemote ? l[f] : r[f], useRemote ? a : b);
          if (useRemote) { putField(l, f, r[f]); stamps[f] = clone(b); }
          else if (!own(stamps, f)) stamps[f] = clone(a);
          clock = Math.max(clock, a.t || 0, b.t || 0);
        }
        l.ts = Math.max(l.ts || 0, r.ts || 0);
      }
      const gone = data.sync.deleted[g] = data.sync.deleted[g] || {};
      for (const k of Object.keys(remote.sync.deleted[g] || {}).filter(safeKey)) {
        const r = remote.sync.deleted[g][k], l = gone[k];
        if (!l || (dominates(r, l) && !dominates(l, r)) || (!dominates(l, r) && compare(r, l) > 0)) gone[k] = clone(r);
      }
      for (const k of Object.keys(gone)) {
        const row = lm[k]; if (!row) continue;
        const tombstone = gone[k], stamps = Object.values(fieldMeta(g, k));
        // 只有明确基于删除版本进行的重新创建，才能重新出现。
        const recreated = stamps.some(s => dominates(s, tombstone) && !dominates(tombstone, s));
        if (!recreated) {
          if (stamps.some(s => !dominates(tombstone, s))) keepConflict(g, k, '$record', row, legacy(row));
          delete lm[k];
        }
      }
    }
    mergeCounters(data.sync.daily, remote.sync.daily);
    mergeCounters(data.sync.attempts, remote.sync.attempts);
    recount();
    if (remote.hist) {
      const hist = data.hist = data.hist || {};
      Object.keys(remote.hist).filter(safeKey).forEach(k => {
        const seen = new Map();
        const id = x => x.id || 'legacy:' + x.t + ':' + x.r + ':' + x.s;
        (hist[k] || []).concat(remote.hist[k] || []).forEach(x => { seen.set(id(x), clone(x)); });
        hist[k] = Array.from(seen.values()).sort((a, b) => a.t - b.t || String(a.id || '').localeCompare(String(b.id || ''))).slice(-30);
      });
    }
    if (remote.session) {
      const a = data.sync.session || legacy(data.session), b = remote.sync.session || legacy(remote.session);
      const aAfter = dominates(a, b), bAfter = dominates(b, a);
      const chooseRemote = (!aAfter && !bAfter) || (aAfter && bAfter);
      if (!data.session || (bAfter && !aAfter) || (chooseRemote && (compare(b, a) > 0 ||
          (compare(b, a) === 0 && String(stable(remote.session)) > String(stable(data.session)))))) {
        data.session = clone(remote.session); data.sync.session = clone(b);
      }
    }
    data.updated = Math.max(data.updated || 0, remote.updated || 0);
    return remote;
  }
  function applyRemote(input) {
    const before = stable(data), remote = merge(typeof input === 'string' ? JSON.parse(input) : input);
    const differs = !equal(data, remote);
    if (differs && !dirty) pending();
    persist();
    if (before !== stable(data)) emit('zs-remote');
    return { remote: remote, differs: differs };
  }
  function restoreConflict(id) {
    const entry = data.sync.conflicts[id]; if (!entry) return false;
    if (!MAPS.includes(entry.group) || !safeKey(entry.key)) return false;
    const group = data[entry.group]; if (!group) return false;
    if (entry.field === '$record') {
      if (group[entry.key]) keepConflict(entry.group, entry.key, '$record', group[entry.key], legacy(group[entry.key]));
      group[entry.key] = clone(entry.value);
    }
    else {
      const row = group[entry.key] = group[entry.key] || {};
      keepConflict(entry.group, entry.key, entry.field, row[entry.field], fieldStamp(data, entry.group, entry.key, entry.field));
      putField(row, entry.field, entry.absent ? undefined : entry.value);
    }
    save(); return true;
  }

  function requestError(r, message) {
    const remaining = r.headers && r.headers.get('x-ratelimit-remaining');
    const retryAfter = Number(r.headers && r.headers.get('retry-after')) || 0;
    const rateLimit = r.status === 429 || (r.status === 403 && (remaining === '0' || retryAfter || /rate limit/i.test(message || '')));
    const reset = Number(r.headers && r.headers.get('x-ratelimit-reset')) || 0;
    return Object.assign(new Error(explain(r.status) + (message ? '（' + message + '）' : '')), {
      status: r.status, retryable: rateLimit || r.status >= 500 || r.status === 409,
      retryAfter: rateLimit ? Math.max(60000, retryAfter * 1000, remaining === '0' ? reset * 1000 - Date.now() : 0) : 0
    });
  }
  async function checkResponse(r) {
    const detail = await r.json().catch(() => ({})); throw requestError(r, detail.message);
  }
  const contentPath = c => 'contents/' + c.file.split('/').map(encodeURIComponent).join('/');
  async function readRemote(c, ref) {
    const path = contentPath(c) + '?ref=' + encodeURIComponent(ref || c.branch);
    const r = await api(c, path, { headers: { Accept: 'application/vnd.github.object+json' } });
    if (r.status === 404) return { exists: false, sha: null, data: null };
    if (!r.ok) await checkResponse(r);
    const j = await r.json(); let text;
    if (j.encoding === 'base64' || (typeof j.content === 'string' && j.content && !j.encoding)) text = b64dec(j.content);
    else {
      // Contents JSON 对大于 1 MB 的文件可能不再返回 Base64，仍从鉴权 API 读取原文。
      const raw = await api(c, path, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!raw.ok) await checkResponse(raw);
      text = await raw.text();
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !MAPS.some(g => own(parsed, g))) throw new Error('invalid');
      normalize(clone(parsed));
    } catch (e) { throw Object.assign(new Error('云端文件格式异常，已停止上传以保护记录'), { retryable: false }); }
    return { exists: true, sha: j.sha, data: parsed };
  }
  function acknowledge(revision) {
    meta.ack = Math.max(meta.ack, revision); lastSync = lastOkAt = Date.now(); lastErr = '';
    failCount = 0; meta.blocked = false; clearTimeout(retryTimer); retryTimer = null;
    persist(); emit('zs-synced');
  }
  function online() { return typeof navigator === 'undefined' || navigator.onLine !== false; }
  function retry(error) {
    if (!error.retryable || !cfg().auto || !online()) return;
    failCount++;
    const delay = Math.max(error.retryAfter || 0, Math.min(300000, 5000 * Math.pow(2, Math.min(failCount - 1, 6)))) +
                  Math.floor(Math.random() * 1000);
    clearTimeout(retryTimer); retryTimer = setTimeout(() => { retryTimer = null; sync(true); }, delay);
  }
  function enqueue(work) {
    const next = serial.catch(() => {}).then(async () => {
      running = true;
      try { return await work(); } finally { running = false; emit('zs-state'); }
    });
    serial = next; return next;
  }
  async function doPush(silent, force, reconcile) {
    const c = cfg();
    if (!c.token || corruptLocal) { if (!silent) toast(corruptLocal ? lastErr : '还没填 GitHub 令牌'); return false; }
    if (silent && meta.blocked) return false;
    if (!online()) { emit('zs-state'); return false; }
    if (!dirty && !force && !reconcile) return true;
    clearPushTimers(); syncing = true; emit('zs-state');
    try {
      for (let round = 1; round <= 4; round++) {
        const remote = await readRemote(c);
        const result = remote.exists && !force ? applyRemote(remote.data) : null;
        if (remote.exists && !force && !result.differs) {
          acknowledge(meta.rev);
          if (!silent) toast('已同步到云端 ✓');
          return true;
        }
        if (!remote.exists && !hasRecords(data)) { acknowledge(meta.rev); return true; }
        if (!remote.exists && !(await ensureBranch(c))) throw new Error('无法创建分支 ' + c.branch);
        const revision = meta.rev, snapshot = JSON.stringify(data);
        const body = { message: 'sync ' + new Date().toISOString().slice(0, 19), branch: c.branch, content: b64enc(snapshot) };
        if (remote.sha) body.sha = remote.sha;
        const response = await api(c, contentPath(c), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (response.ok) {
          acknowledge(revision);
          // 请求发出去以后新增的修改，不能被这次响应误标为“已同步”。
          if (dirty) schedule(250);
          if (!silent) toast(dirty ? '本次已上传，新修改正在补传…' : '已同步到云端 ✓');
          return true;
        }
        if (response.status === 409 && round < 4) {
          await new Promise(resolve => setTimeout(resolve, 500 * round + Math.floor(Math.random() * 500)));
          continue;
        }
        await checkResponse(response);
      }
      throw Object.assign(new Error('多设备同时更新，稍后会自动重试'), { retryable: true });
    } catch (e) {
      if (e.retryable === false || e.status === 401 || e.status === 422 || (e.status === 403 && !e.retryable)) meta.blocked = true;
      setErr(e.message || String(e)); retry(e);
      if (!silent) toast('同步失败：' + e.message, 3600);
      return false;
    } finally { syncing = false; emit('zs-state'); }
  }
  function push(silent, force) { return enqueue(() => doPush(silent, force, false)); }
  function sync(silent) { return enqueue(() => doPush(silent, false, true)); }
  function pull(silent) {
    return enqueue(async () => {
      const c = cfg(); if (!c.token || !online() || corruptLocal) return null;
      syncing = true; emit('zs-state');
      try {
        const remote = await readRemote(c); if (!remote.exists) return null;
        const result = applyRemote(remote.data);
        if (!result.differs) acknowledge(meta.rev); else schedule(250);
        return result.remote;
      } catch (e) {
        setErr('拉取失败：' + e.message); retry(e);
        if (!silent) toast('拉取失败：' + e.message);
        return null;
      } finally { syncing = false; emit('zs-state'); }
    });
  }
  function status() {
    let state = !cfg().token ? 'unconfigured' : !online() ? 'offline' : syncing ? 'syncing' :
                lastErr ? 'error' : dirty ? 'pending' : lastOkAt ? 'synced' : 'pending';
    return { state: state, dirty: dirty, lastOkAt: lastOkAt, error: lastErr,
             conflicts: Object.keys(data.sync.conflicts).length };
  }
  let started = false, pollTimer = null;
  function startSync() {
    if (started) return; started = true;
    const resume = () => { emit('zs-state'); if (cfg().auto && cfg().token && !meta.blocked) sync(true); };
    window.addEventListener('online', resume);
    window.addEventListener('offline', () => emit('zs-state'));
    window.addEventListener('storage', e => {
      if (e.key !== K.data || !e.newValue || corruptLocal) return;
      try {
        const before = stable(data); merge(JSON.parse(e.newValue)); meta = readMeta();
        dirty = meta.rev > meta.ack; observed = clone(data);
        emit('zs-state'); if (before !== stable(data)) emit('zs-remote');
        if (dirty) schedule(250);
      } catch (error) { setErr('其他标签页的记录无法读取'); }
    });
    pollTimer = setInterval(() => {
      if (!document.hidden && cfg().auto && cfg().token && !meta.blocked) sync(true);
    }, 45000);
    resume();
  }

  function setErr(msg) {
    lastErr = String(msg).slice(0, 200); lastErrAt = Date.now();
    try { persistMeta(); } catch (e) { }
    try { document.dispatchEvent(new CustomEvent('zs-error', { detail: lastErr })); } catch (e) { }
    emit('zs-state');
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
    const result = await readRemote(c, sha);
    if (!result.exists) throw new Error('找不到这一版记录');
    return result.data;
  }
  /* 把某一版合并回本地再上传（只增不减，所以不会把现有数据弄丢） */
  async function restore(ver) {
    const old = normalize(clone(ver));
    for (const g of MAPS) {
      for (const k of Object.keys(old[g]).filter(safeKey)) {
        if (!data[g][k]) data[g][k] = clone(old[g][k]);
        else if (!equal(data[g][k], old[g][k]) && ['notes', 'annos', 'edit'].includes(g)) {
          keepConflict(g, k, '$record', old[g][k], legacy(old[g][k]));
        }
      }
    }
    save();
    return await sync(true);
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
    load, save, cfg, setCfg, pull, push, sync, startSync, status, recordAnswer, restoreConflict,
    beginEdit, endEdit, toast, fmt, ensureBranch,
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
    reset() { data = blank(); observed = clone(data); meta = { rev: 0, ack: 0, lastOkAt: 0 }; dirty = false;
              localStorage.removeItem(K.data); localStorage.removeItem(K.meta); clearPushTimers(); },
  };
})();
