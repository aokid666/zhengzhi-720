/* 手写标注引擎
   - 编辑模式：open(host,key) 画布可交互
   - 阅读模式：renderScope() 把已保存的笔画以「只读」画布叠在原文上，随时可见
   笔画以 0~1 归一化坐标存储，跨设备等比缩放 */
window.ANNO = (function () {
  const COLORS = ['#d0342c', '#1f6feb', '#1f8a5b', '#111111', '#d89055', '#8e44ad'];
  const HL = '#ffd640';
  const st = {
    on: false, color: COLORS[0], width: 2.2, mode: 'pen',
    host: null, key: null, strokes: [], cv: null, drawing: false, cur: null, dirty: false
  };
  const seen = new WeakSet();
  let obsList = [];
  let visible = localStorage.getItem('zz720.annoOn') !== '0';

  function ensure(host) {
    host.classList.add('annohost');
    let cv = null;
    for (const c of host.children) if (c.classList && c.classList.contains('anno-cv')) cv = c;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'anno-cv';
      host.appendChild(cv);
    }
    cv.style.pointerEvents = 'none';
    cv.classList.remove('editing');
    return cv;
  }

  function fit(host, cv) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return false;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function paint(cv, strokes, w, h) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      const pts = s.p; if (!pts || !pts.length) continue;
      ctx.strokeStyle = s.c;
      ctx.globalAlpha = s.a == null ? 1 : s.a;
      ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
      ctx.lineWidth = Math.max(1, (s.w / 100) * w);
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0] * w, pts[0][1] * h, ctx.lineWidth / 2, 0, 6.283);
        ctx.fillStyle = s.c; ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  let ro = null;
  function redraw() {
    if (!st.host || !st.cv) return;
    if (!fit(st.host, st.cv)) return;
    paint(st.cv, st.strokes, st.host.clientWidth, st.host.clientHeight);
  }

  /* ---------- 只读渲染：把已有笔记画到页面上，一直可见 ---------- */
  function renderOne(host, tries) {
    const key = host.getAttribute('data-anno');
    if (!key) return;
    if (!host.offsetParent && host.offsetWidth === 0) return;   // 折叠中，展开后会重画
    const rec = ZS.data.annos[key];
    const has = rec && rec.strokes && rec.strokes.length;
    if (!has || !visible) {
      const c = host.querySelector(':scope > canvas.anno-cv');
      if (c) c.remove();
      return;
    }
    if (st.on && st.host === host) return;      // 正在编辑，不动它
    const cv = ensure(host);
    cv.style.pointerEvents = 'none';
    cv.classList.remove('editing');
    if (!fit(host, cv)) {                       // 尺寸还没出来（图片未加载）
      tries = tries || 0;
      if (tries < 8) setTimeout(() => renderOne(host, tries + 1), 350);
      return;
    }
    paint(cv, rec.strokes, host.clientWidth, host.clientHeight);
    if (ro) { }
    if (!seen.has(host)) {
      seen.add(host);
      const ob = new ResizeObserver(() => {
        const c = host.querySelector(':scope > canvas.anno-cv');
        if (!c || (st.on && st.host === host)) return;
        if (!fit(host, c)) return;
        paint(c, (ZS.data.annos[key] || {}).strokes || [], host.clientWidth, host.clientHeight);
      });
      ob.observe(host);
      obsList.push(ob);
    }
  }

  function renderScope(scope) {
    obsList.forEach(o => { try { o.disconnect(); } catch (e) { } });
    obsList = [];
    const root = scope || document.getElementById('view') || document;
    root.querySelectorAll('[data-anno]').forEach(renderOne);
  }

  function setVisible(v) {
    visible = !!v;
    localStorage.setItem('zz720.annoOn', visible ? '1' : '0');
    renderScope();
    if (!visible) {
      document.querySelectorAll('canvas.anno-cv').forEach(c => { if (!(st.on && c.parentElement === st.host)) c.remove(); });
    }
    document.dispatchEvent(new CustomEvent('anno-visibility'));
  }

  /* ---------- 编辑 ---------- */
  function bind(cv) {
    const host = st.host;
    const pos = e => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    cv.onpointerdown = e => {
      if (!st.on) return;
      e.preventDefault(); e.stopPropagation();
      st.drawing = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      st.cur = mkStroke();
      st.cur.p.push(pos(e));
      paint(cv, st.strokes.concat([st.cur]), host.clientWidth, host.clientHeight);
    };
    cv.onpointermove = e => {
      if (!st.on || !st.drawing || !st.cur) return;
      e.preventDefault();
      let evs = [];
      try { evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch (_) { evs = []; }
      if (!evs || !evs.length) evs = [e];
      for (const ev of evs) st.cur.p.push(pos(ev));
      if (st.cur.p.length < 6 || st.cur.p.length % 3 === 0)
        paint(cv, st.strokes.concat([st.cur]), host.clientWidth, host.clientHeight);
    };
    const up = e => {
      if (!st.drawing) return;
      st.drawing = false;
      if (st.cur && st.cur.p.length) { st.strokes.push(st.cur); markDirty(); }
      st.cur = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
      redraw();
    };
    cv.onpointerup = up; cv.onpointercancel = up; cv.onpointerleave = up;
  }

  function mkStroke() {
    if (st.mode === 'eraser') return { c: '#000', w: st.width * 4.5, e: 1, p: [] };
    if (st.mode === 'hl') return { c: HL, w: st.width * 6.5, a: .38, p: [] };
    return { c: st.color, w: st.width, p: [] };
  }

  let saveT = null;
  function markDirty() {
    st.dirty = true;
    clearTimeout(saveT);
    saveT = setTimeout(flush, 1200);
    document.dispatchEvent(new CustomEvent('anno-change'));
  }
  function flush() {
    if (!st.dirty || !st.key) return;
    ZS.data.annos[st.key] = { ts: Date.now(), strokes: JSON.parse(JSON.stringify(st.strokes)) };
    ZS.save();
    st.dirty = false;
  }

  function open(host, key) {
    if (!host) return false;
    if (st.on) close();
    let p = host;
    while (p && p !== document.body) {
      if (p.classList && p.classList.contains('acc')) p.classList.add('open');
      p = p.parentElement;
    }
    if (!host.clientHeight) host.style.minHeight = '140px';
    st.host = host; st.key = key;
    st.cv = ensure(host);
    st.cv.style.pointerEvents = 'auto';
    if (!fit(host, st.cv)) setTimeout(() => redraw(), 300);
    bind(st.cv);
    const rec = ZS.data.annos[key];
    st.strokes = rec && rec.strokes ? JSON.parse(JSON.stringify(rec.strokes)) : [];
    st.on = true;
    redraw();
    document.body.classList.add('annomode');
    if (!window._annoWin) { window._annoWin = redraw; window.addEventListener('resize', redraw); }
    showBar();
    return true;
  }

  function close() {
    flush();
    if (st.host) {
      const cv = st.host.querySelector(':scope > canvas.anno-cv');
      if (cv) { cv.style.pointerEvents = 'none'; cv.classList.remove('editing'); }
      st.host.style.minHeight = '';
      const h = st.host;
      setTimeout(() => { if (!st.on) renderOne(h); }, 60);
    }
    st.on = false; st.host = null; st.cv = null;
    document.body.classList.remove('annomode');
    hideBar();
  }

  function showBar() {
    const bar = document.getElementById('annobar');
    if (!bar) return;
    bar.classList.add('show');
    bar.innerHTML =
      '<div class="r1"><span class="colors" id="annoColors"></span></div>' +
      '<div class="r1">' +
      '<button class="iconbtn" data-a="pen">✏️ 笔</button>' +
      '<button class="iconbtn" data-a="hl">🖍 荧光</button>' +
      '<button class="iconbtn" data-a="eraser">🧽 擦</button>' +
      '<span style="width:1px;height:18px;background:var(--line)"></span>' +
      '<button class="iconbtn" data-a="thin">细</button>' +
      '<button class="iconbtn" data-a="bold">粗</button>' +
      '<span style="flex:1"></span>' +
      '<button class="iconbtn" data-a="undo">↶</button>' +
      '<button class="iconbtn" data-a="clear">🗑</button>' +
      '<button class="iconbtn" data-a="close" style="background:var(--teal);color:#fff;border-color:var(--teal)">✓ 完成</button>' +
      '</div>';
    const cs = bar.querySelector('#annoColors');
    COLORS.forEach(c => {
      const b = document.createElement('span');
      b.className = 'sw' + (c === st.color ? ' on' : '');
      b.style.background = c;
      b.onclick = () => {
        st.color = c;
        if (st.mode === 'eraser' || st.mode === 'hl') st.mode = 'pen';
        bar.querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); syncBar();
      };
      cs.appendChild(b);
    });
    const hb = document.createElement('span');
    hb.className = 'sw hl'; hb.title = '荧光笔';
    hb.onclick = () => { st.mode = 'hl'; syncBar(); };
    cs.appendChild(hb);
    bar.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
    syncBar();
  }
  function hideBar() { const b = document.getElementById('annobar'); if (b) b.classList.remove('show'); }
  function syncBar() {
    const bar = document.getElementById('annobar'); if (!bar) return;
    ['pen', 'hl', 'eraser'].forEach(m => {
      const b = bar.querySelector('[data-a="' + m + '"]');
      if (b) b.classList.toggle('on', st.mode === m);
    });
  }
  function act(a) {
    if (a === 'pen') st.mode = 'pen';
    else if (a === 'hl') st.mode = 'hl';
    else if (a === 'eraser') st.mode = 'eraser';
    else if (a === 'thin') st.width = Math.max(1.2, st.width - 1);
    else if (a === 'bold') st.width = Math.min(8, st.width + 1);
    else if (a === 'undo') { if (st.strokes.length) { st.strokes.pop(); markDirty(); redraw(); } }
    else if (a === 'clear') {
      if (st.strokes.length && confirm('清空本区域的全部手写笔记？')) { st.strokes = []; markDirty(); redraw(); }
    } else if (a === 'close') { close(); }
    syncBar();
  }

  document.addEventListener('click', e => {
    const hd = e.target.closest && e.target.closest('.acc > .hd');
    if (hd) setTimeout(() => renderScope(hd.closest('.acc') || document), 120);
  }, true);

  return {
    open, close, renderScope, renderOne, setVisible,
    get on() { return st.on; },
    get visible() { return visible; },
    COLORS
  };
})();
