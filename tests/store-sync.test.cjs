// node --test tests/store-sync.test.cjs — no credentials or network required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../js/store.js', 'utf8');
const clone = o => JSON.parse(JSON.stringify(o));
const blank = () => ({ v: 1, updated: 0, progress: {}, notes: {}, annos: {}, flags: {}, edit: {} });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let clientId = 0;
function server(data = blank()) { return { data: clone(data), sha: 1, uploads: [], reads: 0, errors: [], hook: null, large: false }; }
function client(cloud, initial = blank(), options = {}) {
  const prefix = 'client-' + ++clientId;
  const kv = options.kv || new Map([
    ['zz720.v1.data', JSON.stringify(initial)],
    ['zz720.v1.cfg', JSON.stringify({ token: 'synthetic-test-token' })]
  ]);
  let now = options.now || Date.parse('2026-10-04T04:00:00Z'), timerId = 0, uid = 0;
  const timers = new Map(), events = [], windowListeners = new Map(), docListeners = new Map();
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const response = (status, value, headers = {}) => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: key => headers[key] || null },
    json: async () => clone(value), text: async () => typeof value === 'string' ? value : JSON.stringify(value)
  });
  const addListener = map => (key, fn) => { if (!map.has(key)) map.set(key, []); map.get(key).push(fn); };
  const document = {
    hidden: false, addEventListener: addListener(docListeners),
    dispatchEvent(event) { events.push(event); for (const fn of docListeners.get(event.type) || []) fn(event); },
    getElementById() { return null; }
  };
  const navigator = { onLine: options.online !== false };
  const context = {
    window: { addEventListener: addListener(windowListeners) }, document, navigator,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    localStorage: {
      getItem: k => kv.get(k) || null,
      setItem(k, value) { if (options.quota && k === 'zz720.v1.data') throw new Error('QuotaExceededError'); kv.set(k, value); },
      removeItem: k => kv.delete(k)
    },
    setTimeout(fn, ms) { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn, ms) { timers.set(++timerId, { fn, at: now + ms, interval: ms }); return timerId; },
    clearInterval: id => timers.delete(id),
    TextEncoder, TextDecoder, Uint8Array, AbortController, btoa, atob, Date: FakeDate,
    crypto: { randomUUID: () => prefix + '-' + ++uid },
    fetch: async (url, opt = {}) => {
      if (cloud.hang) return new Promise((_, reject) => opt.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      if (cloud.errors.length) { const error = cloud.errors.shift(); if (error instanceof Error) throw error; return response(error.status, { message: error.message }, error.headers); }
      if (opt.method === 'PUT') {
        const body = JSON.parse(opt.body), data = JSON.parse(Buffer.from(body.content, 'base64').toString());
        if (cloud.hook) await cloud.hook(data, body);
        if (body.sha && body.sha !== 'sha-' + cloud.sha) return response(409, { message: 'conflict' });
        cloud.uploads.push(clone(data)); cloud.data = data; cloud.sha++;
        return response(200, {});
      }
      cloud.reads++;
      if (cloud.data === null) return response(404, {});
      if ((opt.headers.Accept || '').includes('raw')) return response(200, JSON.stringify(cloud.data));
      return response(200, {
        sha: 'sha-' + cloud.sha, size: JSON.stringify(cloud.data).length,
        encoding: cloud.large ? 'none' : 'base64',
        content: cloud.large ? '' : Buffer.from(JSON.stringify(cloud.data)).toString('base64')
      });
    }
  };
  vm.runInNewContext(source, context);
  const ZS = context.window.ZS; ZS.load();
  async function microtasks() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
  return {
    ZS, kv, timers, events, navigator, document, options,
    emitWindow(type, event = {}) { (windowListeners.get(type) || []).forEach(fn => fn(event)); },
    async advance(ms) {
      now += ms;
      for (let count = 0; count < 40; count++) {
        const due = [...timers].filter(([, value]) => value.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, value] = due; timers.delete(id);
        if (value.interval) timers.set(id, { ...value, at: now + value.interval });
        const result = value.fn(); await microtasks();
        // Scheduled work can wait on other timers; don't block this virtual clock.
        if (result && result.catch) result.catch(() => {});
      }
      await microtasks();
    },
    microtasks, day: () => {
      const d = new Date(now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  };
}
const note = text => ({ text, strokes: [], pics: [], ts: 10 });

test('deletions propagate and stale devices cannot resurrect notes', async () => {
  const d = blank(); d.notes.q1 = note('中文笔记');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  delete a.ZS.data.notes.q1; a.ZS.save(); await a.ZS.push(true);
  assert.equal(cloud.data.notes.q1, undefined);
  await b.ZS.sync(true); assert.equal(b.ZS.data.notes.q1, undefined);
  await a.ZS.sync(true); assert.equal(a.ZS.data.notes.q1, undefined);
});

test('explicit recreation after learning of a deletion is retained', async () => {
  const d = blank(); d.notes.q1 = note('old');
  const cloud = server(d), a = client(cloud, d);
  delete a.ZS.data.notes.q1; a.ZS.save(); await a.ZS.push(true);
  a.ZS.data.notes.q1 = note('intentionally recreated'); a.ZS.save(); await a.ZS.push(true);
  assert.equal(cloud.data.notes.q1.text, 'intentionally recreated');
});

test('offline changes survive reload and upload automatically upon reconnection', async () => {
  const cloud = server(), a = client(cloud, blank(), { online: false });
  a.ZS.data.notes.q1 = note('offline edit'); a.ZS.save();
  const b = client(cloud, blank(), { kv: a.kv, online: false });
  assert.equal(b.ZS.dirty, true); b.ZS.startSync(); await b.microtasks();
  assert.equal(cloud.uploads.length, 0);
  b.navigator.onLine = true; b.emitWindow('online'); await b.microtasks();
  assert.equal(cloud.data.notes.q1.text, 'offline edit'); assert.equal(b.ZS.dirty, false);
});

test('an upload only acknowledges its own revision', async () => {
  const cloud = server(), entered = deferred(), hold = deferred();
  cloud.hook = async () => { entered.resolve(); await hold.promise; };
  const a = client(cloud); a.ZS.data.notes.q1 = note('before'); a.ZS.save();
  const upload = a.ZS.push(true); await entered.promise;
  a.ZS.data.notes.q1.text = 'during'; a.ZS.save(); hold.resolve(); await upload;
  assert.equal(a.ZS.dirty, true); assert.equal(cloud.data.notes.q1.text, 'before');
  cloud.hook = null; await a.advance(300);
  assert.equal(cloud.data.notes.q1.text, 'during'); assert.equal(a.ZS.dirty, false);
});

test('text and handwriting on separate devices merge independently', async () => {
  const d = blank(); d.notes.q1 = note('old text');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  a.ZS.data.notes.q1.text = 'new text'; a.ZS.save();
  b.ZS.data.notes.q1.strokes.push({ p: [[0,0],[1,1]] }); b.ZS.save();
  await a.ZS.push(true); await b.ZS.push(true); await a.ZS.pull(true);
  assert.equal(a.ZS.data.notes.q1.text, 'new text');
  assert.equal(a.ZS.data.notes.q1.strokes.length, 1);
  assert.equal(Object.keys(a.ZS.data.sync.conflicts).length, 0);
});

test('concurrent edits to the same text keep both versions and converge', async () => {
  const d = blank(); d.notes.q1 = note('base');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  a.ZS.data.notes.q1.text = 'version A'; a.ZS.save();
  b.ZS.data.notes.q1.text = 'version B'; b.ZS.save();
  await a.ZS.push(true); await b.ZS.push(true); await a.ZS.sync(true);
  assert.equal(a.ZS.data.notes.q1.text, b.ZS.data.notes.q1.text);
  const values = [a.ZS.data.notes.q1.text, ...Object.values(a.ZS.data.sync.conflicts).map(x => x.value)];
  assert.ok(values.includes('version A') && values.includes('version B'));
});

test('sequential edits do not produce spurious conflicts', async () => {
  const d = blank(); d.notes.q1 = note('base');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  a.ZS.data.notes.q1.text = 'first'; a.ZS.save(); await a.ZS.push(true);
  await b.ZS.pull(true); b.ZS.data.notes.q1.text = 'second'; b.ZS.save(); await b.ZS.push(true);
  await a.ZS.pull(true); assert.equal(a.ZS.data.notes.q1.text, 'second');
  assert.equal(Object.keys(a.ZS.data.sync.conflicts).length, 0);
});

test('an editor opened before a remote change preserves its original ancestry', async () => {
  const d = blank(); d.notes.q1 = note('base');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  a.ZS.beginEdit('notes', 'q1', ['text']);
  b.ZS.data.notes.q1.text = 'remote'; b.ZS.save(); await b.ZS.push(true); await a.ZS.pull(true);
  a.ZS.data.notes.q1.text = 'editor draft'; a.ZS.save(); await a.ZS.push(true);
  const values = [a.ZS.data.notes.q1.text, ...Object.values(a.ZS.data.sync.conflicts).map(x => x.value)];
  assert.ok(values.includes('editor draft') && values.includes('remote'));
});

test('an old open editor cannot undo a remote deletion; draft is kept as a conflict', async () => {
  const d = blank(); d.notes.q1 = note('base');
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  a.ZS.beginEdit('notes', 'q1', ['text']);
  delete b.ZS.data.notes.q1; b.ZS.save(); await b.ZS.push(true); await a.ZS.pull(true);
  a.ZS.data.notes.q1 = note('unfinished draft'); a.ZS.save(); await a.ZS.push(true);
  assert.equal(cloud.data.notes.q1, undefined);
  assert.ok(Object.values(a.ZS.data.sync.conflicts).some(x => x.value && x.value.text === 'unfinished draft'));
});

test('new daily and per-question counters sum across devices and repeated pulls do not double count', async () => {
  const d = blank(); d.daily = { '2026-10-03': { n: 5, r: 4 } };
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  for (const [env, count] of [[a,10],[b,8]]) {
    env.ZS.data.progress.q1 = { tries: 0, rights: 0, s: 'right', ts: 10 };
    for (let i = 0; i < count; i++) env.ZS.recordAnswer('q1', true, ['A']);
    env.ZS.save();
  }
  await a.ZS.push(true); await b.ZS.push(true); await a.ZS.pull(true); await a.ZS.pull(true);
  assert.equal(a.ZS.data.daily[a.day()].n, 18); assert.equal(a.ZS.data.progress.q1.tries, 18);
  assert.equal(a.ZS.data.hist.q1.length, 18); assert.equal(a.ZS.data.daily['2026-10-03'].n, 5);
});

test('existing counts migrate once and remain after new answers', async () => {
  const d = blank(); d.progress.q1 = { tries: 7, rights: 4, s: 'wrong', ts: 10 };
  const cloud = server(d), a = client(cloud, d);
  a.ZS.recordAnswer('q1', true, ['A']); a.ZS.save(); await a.ZS.push(true); await a.ZS.sync(true);
  assert.equal(a.ZS.data.progress.q1.tries, 8); assert.equal(a.ZS.data.progress.q1.rights, 5);
});

test('history events with matching milliseconds still have distinct identifiers', async () => {
  const cloud = server(), a = client(cloud), b = client(cloud);
  for (const env of [a,b]) { env.ZS.data.progress.q1 = { ts:10 }; env.ZS.recordAnswer('q1',true,['A']); env.ZS.save(); }
  await a.ZS.push(true); await b.ZS.push(true); await a.ZS.pull(true);
  assert.equal(a.ZS.data.hist.q1.length, 2);
});

test('no-op syncs read cloud without uploading identical data', async () => {
  const cloud = server(), a = client(cloud);
  await a.ZS.sync(true); await a.ZS.sync(true); await a.ZS.push(true);
  assert.equal(cloud.uploads.length, 0);
  const loaded = client(cloud, blank(), { kv: a.kv });
  assert.ok(loaded.ZS.lastOkAt > 0); assert.equal(loaded.ZS.status().state, 'synced');
});

test('removing a single edited field propagates without deleting unrelated fields', async () => {
  const d = blank(); d.edit.q1 = { a:'edited A', b:'edited B', ts:10 };
  const cloud = server(d), a = client(cloud, d), b = client(cloud, d);
  delete a.ZS.data.edit.q1.a; a.ZS.save(); await a.ZS.push(true); await b.ZS.sync(true);
  assert.equal(b.ZS.data.edit.q1.a, undefined); assert.equal(b.ZS.data.edit.q1.b,'edited B');
});

test('large Contents responses use authenticated raw fallback', async () => {
  const d = blank(); d.notes.q1 = note('large file');
  const cloud = server(d); cloud.large = true;
  const a = client(cloud); await a.ZS.pull(true);
  assert.equal(a.ZS.data.notes.q1.text,'large file'); assert.equal(cloud.reads,2);
});

test('invalid remote data never gets overwritten', async () => {
  const cloud = server({ unexpected:'format' }), a = client(cloud);
  a.ZS.data.notes.q1 = note('local'); a.ZS.save(); assert.equal(await a.ZS.push(true),false);
  assert.equal(cloud.uploads.length,0); assert.match(a.ZS.lastErr,/格式异常/);
});

test('HTTP 401 does not schedule blind retries', async () => {
  const cloud = server(), a = client(cloud); cloud.errors.push({status:401,message:'Bad credentials'});
  a.ZS.data.notes.q1 = note('local'); a.ZS.save(); await a.ZS.push(true);
  assert.match(a.ZS.lastErr,/令牌/); assert.equal(a.timers.size,0);
});

test('rate-limit responses respect Retry-After', async () => {
  const cloud = server(), a = client(cloud);
  cloud.errors.push({status:429,message:'rate limit',headers:{'retry-after':'120'}});
  a.ZS.data.notes.q1 = note('local'); a.ZS.save(); await a.ZS.push(true);
  const timer = [...a.timers.values()][0]; assert.ok(timer.at - Date.parse('2026-10-04T04:00:00Z') >= 120000);
});

test('transient failures automatically retry and clear the error', async () => {
  const cloud = server(), a = client(cloud); cloud.errors.push(new Error('connection lost'));
  a.ZS.data.notes.q1 = note('retry'); a.ZS.save(); await a.ZS.push(true); assert.equal(a.ZS.dirty,true);
  await a.advance(6000); assert.equal(cloud.data.notes.q1.text,'retry'); assert.equal(a.ZS.lastErr,'');
});

test('requests time out instead of locking sync forever', async () => {
  const cloud = server(), a = client(cloud); cloud.hang = true;
  a.ZS.data.notes.q1 = note('pending'); a.ZS.save(); const work = a.ZS.push(true);
  await a.microtasks(); await a.advance(15001); assert.equal(await work,false); assert.match(a.ZS.lastErr,/超时/);
  cloud.hang = false; await a.ZS.push(true); assert.equal(a.ZS.dirty,false);
});

test('a conflict can be restored while the current version remains recoverable', async () => {
  const d = blank(); d.notes.q1 = note('base');
  const cloud = server(d), a = client(cloud,d), b = client(cloud,d);
  a.ZS.data.notes.q1.text='A';a.ZS.save();b.ZS.data.notes.q1.text='B';b.ZS.save();
  await a.ZS.push(true);await b.ZS.push(true);await a.ZS.sync(true);
  const [id, entry] = Object.entries(a.ZS.data.sync.conflicts)[0], before=a.ZS.data.notes.q1.text;
  assert.equal(a.ZS.restoreConflict(id),true);await a.ZS.push(true);
  assert.equal(a.ZS.data.notes.q1.text,entry.value);
  assert.ok(Object.values(a.ZS.data.sync.conflicts).some(x=>x.value===before));
});

test('storage quota errors keep changes pending and report that local saving failed', async () => {
  const cloud=server(),a=client(cloud);a.options.quota=true;
  a.ZS.data.notes.q1=note('unsaved');a.ZS.save();assert.equal(a.ZS.dirty,true);assert.match(a.ZS.lastErr,/本机保存失败/);
});

test('corrupt local storage blocks uploads instead of clearing the original', async () => {
  const cloud=server(),kv=new Map([['zz720.v1.data','{broken'],['zz720.v1.cfg',JSON.stringify({token:'synthetic'})]]);
  const a=client(cloud,blank(),{kv});await a.ZS.sync(true);
  assert.equal(kv.get('zz720.v1.data'),'{broken');assert.equal(cloud.uploads.length,0);
});

test('constant edits are uploaded by the maximum-wait deadline', async () => {
  const cloud=server(),a=client(cloud);
  for(let i=0;i<8;i++){a.ZS.data.notes.q1=note('edit '+i);a.ZS.save();await a.advance(2000);}
  assert.ok(cloud.uploads.length>=1);
});
