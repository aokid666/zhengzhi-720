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
  if(options.indexedDB)context.indexedDB=options.indexedDB;
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

test('the selected options travel with the latest answer to another device', async () => {
  const cloud = server(), a = client(cloud), b = client(cloud);
  a.ZS.data.progress.q1 = { s: 'wrong', sel: ['B', 'D'], ts: Date.now(), tries: 1, rights: 0 };
  a.ZS.recordAnswer('q1', false, ['B', 'D']);
  a.ZS.save(); await a.ZS.push(true); await b.ZS.sync(true);
  assert.deepEqual(Array.from(b.ZS.data.progress.q1.sel), ['B', 'D']);
  assert.equal(b.ZS.data.progress.q1.s, 'wrong');
  const reloaded = client(cloud, blank(), { kv: b.kv });
  assert.deepEqual(Array.from(reloaded.ZS.data.progress.q1.sel), ['B', 'D']);
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


test('matching pairs and multiline material answers sync with their saved selections and drafts', async () => {
  const cloud = server(), a = client(cloud), b = client(cloud);
  const records = [
    ['pr-match', 'match:{"A":["1","3"],"B":["3"]}'],
    ['pr-written', 'written:第一问：实践决定认识。\n第二问：认识反作用于实践。']
  ];
  for (const [id, answer] of records) {
    a.ZS.data.progress[id] = { tries: 0, rights: 0, s: 'right', ts: 10, sel: [answer] };
    a.ZS.recordAnswer(id, true, [answer]);
  }
  a.ZS.data.edit['pr-match'] = { practiceMatch: { A: ['1','3'], B: ['3'] }, ts: 10 };
  a.ZS.save(); await a.ZS.push(true); await b.ZS.pull(true);
  for (const [id, answer] of records) {
    assert.equal(b.ZS.data.progress[id].sel[0], answer);
    assert.equal(b.ZS.data.hist[id][0].s, answer);
    assert.equal(b.ZS.data.progress[id].tries, 1);
  }
  assert.equal(JSON.stringify(b.ZS.data.edit['pr-match'].practiceMatch), '{"A":["1","3"],"B":["3"]}');
});


// Real IndexedDB request/transaction scheduling, with isolated databases per test.
function databaseFactory(options={}) {
  const {IDBFactory}=require('fake-indexeddb'),factory=new IDBFactory();
  return {open(...args){const request=factory.open(...args);request.addEventListener('success',()=>{
    const db=request.result,transaction=db.transaction.bind(db);
    db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);
      tx.objectStore=(...args)=>{const store=objectStore(...args),put=store.put.bind(store),get=store.get.bind(store);
        store.put=(...args)=>{const r=put(...args);r.addEventListener('success',()=>{if(options.onPut)options.onPut();if(options.abortWrites)tx.abort();});return r;};
        store.get=(...args)=>{const r=get(...args);r.addEventListener('success',()=>{if(options.abortReads&&tx.mode==='readonly')tx.abort();});return r;};return store;};return tx;};
  });return request;}};
}

test('large legacy records migrate atomically and reload offline without using the small-quota slot',async()=>{
  const d=blank();d.notes.q1={text:'完整笔记'.repeat(200000),strokes:[[{x:0.123,y:0.456,p:0.7}]],pics:['data:image/png;base64,AAA'],ts:10};
  for(let i=0;i<72;i++)d.progress['q'+i]={s:'right',sel:['A','C'],tries:2,rights:1,ts:10};
  const cloud=server(),indexedDB=databaseFactory(),a=client(cloud,d,{indexedDB});a.kv.set('other-app','keep');a.options.quota=true;
  assert.equal(await a.ZS.ready(),true);assert.equal(a.ZS.status().local.backend,'indexedDB');assert.equal(a.kv.has('zz720.v1.data'),false);
  assert.equal(a.kv.get('other-app'),'keep');assert(a.kv.has('zz720.v1.cfg'));
  const b=client(cloud,blank(),{indexedDB,kv:a.kv,online:false});await b.ZS.ready();
  assert.equal(b.ZS.data.notes.q1.text,d.notes.q1.text);assert.equal(JSON.stringify(b.ZS.data.notes.q1.strokes),JSON.stringify(d.notes.q1.strokes));
  assert.equal(Object.keys(b.ZS.data.progress).length,72);assert.equal(b.ZS.data.progress.q71.sel.join(''),'AC');assert.equal(cloud.uploads.length,0);
});

test('database writes retain later edits and answer selections across an offline reload',async()=>{
  const cloud=server(),indexedDB=databaseFactory(),a=client(cloud,blank(),{indexedDB,online:false});await a.ZS.ready();
  a.ZS.data.notes.q1=note('first');a.ZS.save();a.ZS.data.notes.q1.text='second';a.ZS.save();
  a.ZS.data.progress.q2={s:'right',sel:['B'],tries:0,rights:0,ts:10};a.ZS.recordAnswer('q2',true,['B']);a.ZS.save();await a.ZS.flushLocal();
  const b=client(cloud,blank(),{indexedDB,kv:a.kv,online:false});await b.ZS.ready();assert.equal(b.ZS.data.notes.q1.text,'second');assert.equal(b.ZS.data.progress.q2.tries,1);assert.equal(b.ZS.data.progress.q2.sel[0],'B');
});

test('an aborted transaction preserves the old copy even after a successful put request',async()=>{
  const faults={abortWrites:true},indexedDB=databaseFactory(faults),cloud=server(),a=client(cloud,{...blank(),notes:{q1:note('original')}},{indexedDB});
  const original=a.kv.get('zz720.v1.data');assert.equal(await a.ZS.ready(),false);assert.equal(a.kv.get('zz720.v1.data'),original);assert.match(a.ZS.lastErr,/本机保存失败/);
  faults.abortWrites=false;assert.equal(await a.ZS.flushLocal(),true);assert.equal(a.kv.has('zz720.v1.data'),false);assert.equal(a.ZS.lastErr,'');
});

test('a local database failure still allows a cloud backup and never reports local success',async()=>{
  const faults={abortWrites:true},indexedDB=databaseFactory(faults),cloud=server(),a=client(cloud,blank(),{indexedDB});await a.ZS.ready();a.options.quota=true;
  a.ZS.data.notes.q1=note('protect this');a.ZS.save();assert.equal(await a.ZS.push(true),true);await a.ZS.flushLocal();
  assert.equal(cloud.data.notes.q1.text,'protect this');assert(a.ZS.lastOkAt>0);assert.equal(a.ZS.status().state,'local-error');assert.match(a.ZS.lastErr,/本机保存失败/);
  faults.abortWrites=false;await a.ZS.flushLocal();assert.equal(a.ZS.lastErr,'');assert.equal(a.ZS.status().local.error,'');
});

test('overlapping tabs merge their independent records inside the database transaction',async()=>{
  const indexedDB=databaseFactory(),cloud=server(),a=client(cloud,blank(),{indexedDB});await a.ZS.ready();
  const b=client(cloud,blank(),{indexedDB,kv:a.kv});await b.ZS.ready();a.ZS.data.notes.q1=note('tab A');a.ZS.save();b.ZS.data.notes.q2=note('tab B');b.ZS.save();
  await Promise.all([a.ZS.flushLocal(),b.ZS.flushLocal()]);const c=client(cloud,blank(),{indexedDB,kv:a.kv});await c.ZS.ready();assert.equal(c.ZS.data.notes.q1.text,'tab A');assert.equal(c.ZS.data.notes.q2.text,'tab B');
});

test('a stale database tab cannot resurrect a deleted note while adding another record',async()=>{
  const indexedDB=databaseFactory(),cloud=server(),d=blank();d.notes.q1=note('delete me');const a=client(cloud,d,{indexedDB});await a.ZS.ready();
  const b=client(cloud,blank(),{indexedDB,kv:a.kv});await b.ZS.ready();delete a.ZS.data.notes.q1;a.ZS.save();await a.ZS.flushLocal();b.ZS.data.notes.q2=note('keep me');b.ZS.save();await b.ZS.flushLocal();
  const c=client(cloud,blank(),{indexedDB,kv:a.kv});await c.ZS.ready();assert.equal(c.ZS.data.notes.q1,undefined);assert.equal(c.ZS.data.notes.q2.text,'keep me');
});

test('an inaccessible primary database blocks blank uploads and keeps the saved records',async()=>{
  const faults={},indexedDB=databaseFactory(faults),cloud=server(),a=client(cloud,{...blank(),notes:{q1:note('database only')}},{indexedDB});await a.ZS.ready();
  faults.abortReads=true;const b=client(cloud,blank(),{indexedDB,kv:a.kv});assert.equal(await b.ZS.sync(true),false);assert.match(b.ZS.lastErr,/数据库无法读取/);assert.equal(cloud.uploads.length,0);
  faults.abortReads=false;const c=client(cloud,blank(),{indexedDB,kv:a.kv});await c.ZS.ready();assert.equal(c.ZS.data.notes.q1.text,'database only');
});

test('corrupt legacy storage is not replaced during database initialization',async()=>{
  const indexedDB=databaseFactory(),cloud=server(),kv=new Map([['zz720.v1.data','{broken'],['zz720.v1.cfg',JSON.stringify({token:'synthetic'})]]);
  const a=client(cloud,blank(),{indexedDB,kv});assert.equal(await a.ZS.sync(true),false);assert.equal(kv.get('zz720.v1.data'),'{broken');assert.equal(cloud.uploads.length,0);
});

test('reset invalidates pending database writes and does not restore the previous snapshot',async()=>{
  const indexedDB=databaseFactory(),cloud=server(),a=client(cloud,{...blank(),notes:{q1:note('old')}},{indexedDB});await a.ZS.ready();a.ZS.data.notes.q2=note('pending');a.ZS.save();await a.ZS.reset();await a.ZS.flushLocal();
  const b=client(cloud,blank(),{indexedDB,kv:a.kv});await b.ZS.ready();assert.equal(Object.keys(b.ZS.data.notes).length,0);
});

test('an edit during a database-backed upload remains pending after the older revision is acknowledged',async()=>{
  const indexedDB=databaseFactory(),cloud=server(),a=client(cloud,blank(),{indexedDB});await a.ZS.ready();a.ZS.data.notes.q1=note('first');a.ZS.save();
  const sent=deferred(),finish=deferred();cloud.hook=async()=>{sent.resolve();await finish.promise;};const upload=a.ZS.push(true);await sent.promise;
  a.ZS.data.notes.q1.text='later';a.ZS.save();await a.ZS.flushLocal();finish.resolve();await upload;assert.equal(a.ZS.dirty,true);cloud.hook=null;await a.ZS.push(true);await a.ZS.flushLocal();assert.equal(cloud.data.notes.q1.text,'later');assert.equal(a.ZS.dirty,false);
});


test('a legacy tab writing during migration keeps its copy until it is durably merged',async()=>{
  const faults={},indexedDB=databaseFactory(faults),cloud=server(),d=blank();d.notes.q1=note('before');const a=client(cloud,d,{indexedDB});
  faults.onPut=()=>{faults.onPut=null;const next=clone(d);next.notes.q2=note('written by an older tab');a.kv.set('zz720.v1.data',JSON.stringify(next));};
  await a.ZS.ready();assert(a.kv.has('zz720.v1.data'));await a.ZS.flushLocal();assert.equal(a.kv.has('zz720.v1.data'),false);
  const b=client(cloud,blank(),{indexedDB,kv:a.kv});await b.ZS.ready();assert.equal(b.ZS.data.notes.q1.text,'before');assert.equal(b.ZS.data.notes.q2.text,'written by an older tab');
});
