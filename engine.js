/* Glowrim lyrics engine — one renderer for the floating lyrics, Stage mode and the live preview.
   new LyricsView(el, { scale, style, demo }) then feed it setSettings / setNow / setTime / setLyrics / level. */
(function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- word icons for the "Visual" styles ----------
  const ICONS = {};
  `love,heart:❤️ fire,burn,burning,flame,lit,hot:🔥 money,cash,dollar,dollars,bands,racks,paid,pay:💵 rich,diamond,diamonds,ice:💎 gold,golden:🥇
   night,tonight,moon,midnight:🌙 sun,sunshine,day,morning:☀️ star,stars:⭐ light,lights,shine,glow,flashing:✨ rain,raining:🌧️ storm,thunder,lightning,electric:⚡
   snow,winter,cold,freeze,frozen:❄️ water,tears,tear,cry,crying:💧 ocean,sea,wave,waves,river:🌊 beach,summer:🏖️ city,town,streets,street:🏙️ car,drive,driving,ride,riding:🚗
   road,highway:🛣️ plane,fly,flying,airport:✈️ sky,heaven,heavens:🌌 cloud,clouds:☁️ world,earth,globe:🌍 home,house:🏠 door,doors:🚪 phone,call,calling:📱
   text,message,texts:💬 time,clock,minute,minutes,hour,hours,watch:⏰ wait,waiting,late,forever:⏳ smile,smiling,happy:😊 laugh,laughing:😂 sad,lonely,alone:😔
   kiss,lips:💋 eyes,eye,look,looking,see,seen:👀 hand,hands:🙌 run,running:🏃 dance,dancing:💃 party:🎉 drink,drinking,wine:🍷 bottle,champagne:🍾
   music,song,songs,melody:🎵 sing,singing,mic:🎤 radio:📻 guitar:🎸 piano:🎹 crown,king,queen:👑 god,pray,praying,lord:🙏 angel:😇 devil,demon,demons:😈
   gun,shoot:🔫 blood,bleed:🩸 die,dead,death,kill:💀 ghost:👻 flower,flowers,bloom:🌸 rose,roses:🌹 tree,trees,forest:🌳 bird,birds:🐦 dog:🐶 cat:🐱
   baby,babe:👶 friend,friends:🤝 key,keys:🔑 lock,locked:🔒 chain,chains:⛓️ ring,rings,wedding,marry:💍 paper,letter,letters:✉️ book,books,read:📖
   game,games,play:🎮 win,winning,won:🏆 broken,break,heartbreak:💔 bed,sleep,sleeping:😴 dream,dreams,dreaming,think,thinking,mind:💭 crazy,insane:🤪
   high,rocket,space,moonwalk:🚀 fast,speed:⚡ slow:🐢 wind:🌬️ fall,falling,autumn:🍂 coffee:☕ sweet,sugar,candy:🍬 cake,birthday:🎂 gift,present:🎁
   picture,photo,camera:📸 movie,movies,film:🎬 shoes,sneakers:👟 bag,prada,gucci:👜 dress:👗 coin,coins,lucky:🪙 magic:🪄 butterfly,butterflies:🦋
   devil:😈 sea:🌊 mountain,mountains:⛰️ island:🏝️ map,lost:🗺️ heartbeat,beat:💓 bullet,bullets:🔫 smoke,smoking:💨 pill,pills:💊 hospital:🏥 school:🏫`
    .trim().split(/\s+/).forEach(pair => { const [ws, ic] = pair.split(':'); if (ic) ws.split(',').forEach(w => ICONS[w] = ic); });
  function iconFor(word) {
    const k = String(word).toLowerCase().replace(/[^a-z']/g, '').replace(/'s$/, '').replace(/'/g, '');
    return ICONS[k] || ICONS[k.replace(/(ing|ed|es|s)$/, '')] || '';
  }

  // ---------- timing ----------
  // Real per-word timing when the lyrics have it (enhanced LRC), otherwise an estimate weighted by word length.
  function timeWords(line, nextT) {
    if (line._w) return line._w;
    if (line.words && line.words.length) {
      line._w = line.words.map((w, k, a) => ({ w: w.w, t0: w.t, t1: a[k + 1] ? a[k + 1].t : (nextT != null ? Math.min(nextT, w.t + 1500) : w.t + 600) }));
      return line._w;
    }
    const parts = (line.text || '').split(/\s+/).filter(Boolean);
    const span = Math.max(300, (nextT != null ? nextT : line.t + 4000) - line.t);
    const sung = Math.min(span * 0.9, Math.max(parts.length * 420, span * 0.55));
    const wts = parts.map(p => p.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
    const tot = wts.reduce((a, b) => a + b, 0) || 1; let acc = 0;
    line._w = parts.map((w, k) => { const t0 = line.t + acc / tot * sung; acc += wts[k]; return { w, t0, t1: line.t + acc / tot * sung }; });
    return line._w;
  }
  function indexAt(ls, p, key = 't') {
    let lo = 0, hi = ls.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ls[m][key] <= p) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  const wState = (w, p) => p >= w.t1 ? 2 : p >= w.t0 ? 1 : 0;
  const wProg = (w, p) => clamp((p - w.t0) / Math.max(1, w.t1 - w.t0));

  function wordsHTML(ws, icons) {
    return ws.map((w, k) => { const ic = icons ? iconFor(w.w) : ''; return `<span class="w" data-k="${k}">${esc(w.w)}${ic ? `<i class="ic">${ic}</i>` : ''}</span>`; }).join(' ');
  }
  function light(box, ws, p) {
    const sp = box._sp || (box._sp = box.querySelectorAll('.w'));
    for (let k = 0; k < sp.length; k++) {
      const w = ws[k]; if (!w) continue; const s = sp[k], st = wState(w, p);
      if (s._st !== st) { s._st = st; s.classList.toggle('on', st > 0); s.classList.toggle('now', st === 1); }
      if (st === 1) s.style.setProperty('--wp', wProg(w, p).toFixed(3));
    }
  }

  // Original demo lyrics so the preview plays with no music on.
  const DEMO = ['City lights are humming low', 'Wait another minute in the rain', 'Every clock in town slows down', 'Fire in the sky tonight',
    'Hold the phone, I\'m driving home', 'Stars fall where the river goes', 'Dance until the morning sun', 'Your love is all I need tonight']
    .map((text, i) => ({ t: 600 + i * 3200, text }));
  const DEMO_LEN = 600 + DEMO.length * 3200;

  const SF = ['Market St', 'Valencia St', 'Hayes St', 'The Embarcadero', 'Lombard St', 'Mission St', 'Castro St', 'Haight St', 'Divisadero St',
    'Columbus Ave', 'Geary Blvd', 'Fillmore St', 'Grant Ave', 'Polk St', 'Folsom St', 'Dolores St', 'Bay St', 'Fulton St', 'Van Ness Ave', 'Clement St'];
  const PLACES = ['Brooklyn Bridge, New York', 'Marina Bay, Singapore', 'Shibuya Crossing, Tokyo', 'Shoreditch, London', 'Le Marais, Paris',
    'Venice Beach, Los Angeles', 'Gangnam, Seoul', 'Kreuzberg, Berlin', 'Bandra, Mumbai', 'Copacabana, Rio de Janeiro', 'Dhanmondi, Dhaka',
    'Downtown, Dubai', 'Navigli, Milan', 'Bondi Beach, Sydney', 'Kensington Market, Toronto'];
  // A tiny stylised street map for the Maps cards.
  function miniMap(R) {
    let s = `<svg viewBox="0 0 300 110" preserveAspectRatio="xMidYMid slice"><rect width="300" height="110" fill="#26332b"/>`;
    s += `<path d="M0,${70 + R() * 30} C80,${50 + R() * 40} 180,${90 + R() * 20} 300,${60 + R() * 30} L300,110 L0,110Z" fill="#1d3a55"/>`;
    for (let k = 0; k < 3; k++) s += `<rect x="${R() * 260}" y="${R() * 60}" width="${30 + R() * 50}" height="${18 + R() * 24}" rx="5" fill="#2f4a33"/>`;
    for (let k = 0; k < 7; k++) { const x = R() * 300; s += `<line x1="${x}" y1="-10" x2="${x + (R() - .5) * 120}" y2="120" stroke="#4a5560" stroke-width="${R() > .7 ? 4 : 2}"/>`; }
    for (let k = 0; k < 4; k++) { const y = R() * 110; s += `<line x1="-10" y1="${y}" x2="310" y2="${y + (R() - .5) * 60}" stroke="#4a5560" stroke-width="2"/>`; }
    return s + `<circle cx="150" cy="52" r="14" fill="#5e5ce6" opacity=".35"/><circle cx="150" cy="52" r="7" fill="#5e5ce6" stroke="#fff" stroke-width="2.5"/></svg>`;
  }
  const PEOPLE = ['Maya', 'Jordan', 'Ava', 'Leo', 'Nina', 'Theo', 'Zara', 'Kai', 'Iris', 'Omar', 'Luca', 'Ruby'];
  const APPS = [['Messages', '💬', '#34c759'], ['Mail', '✉️', '#0a84ff'], ['Calendar', '📅', '#ff3b30'], ['Photos', '🌸', '#ff9f0a'],
    ['Music', '🎵', '#ff2d55'], ['Reminders', '✅', '#5e5ce6'], ['Weather', '⛅', '#32ade6'], ['Notes', '📝', '#ffcc00']];

  // ================= styles =================
  const STYLES = {};
  const def = (key, meta, impl) => STYLES[key] = Object.assign({ key }, meta, impl);

  // ---- Classic ----
  def('stack', { family: 'Classic', name: 'Stack', desc: 'A scrolling column; the sung line glows, word by word.', grad: ['#2b2f4a', '#ff3d81'] }, {
    mount(r, v) { r.innerHTML = '<div class="track"></div>'; const t = r.firstChild;
      t.innerHTML = v.lines().map((l, i) => `<div class="l" data-i="${i}">${l.text ? wordsHTML(v.words(i)) : '♪'}</div>`).join(''); },
    line(c) { const t = c.root.firstChild, els = t.children; if (!els.length) return;
      [...els].forEach((e, k) => { e.classList.toggle('cur', k === c.i); e.classList.toggle('near', Math.abs(k - c.i) === 1); e.classList.toggle('done', k < c.i); });
      const tg = els[Math.max(0, c.i)]; t.style.transform = `translateY(${-(tg.offsetTop + tg.offsetHeight / 2)}px)`; },
    frame(c) { const e = c.root.firstChild.children[c.i]; if (e) light(e, c.ws, c.p); }
  });
  def('karaoke', { family: 'Classic', name: 'Karaoke', desc: 'One big line that fills with colour as it is sung.', grad: ['#3a1c4a', '#ffb347'] }, {
    mount(r) { r.innerHTML = '<div class="cur"></div><div class="nx"></div>'; },
    line(c) { const [cu, nx] = c.root.children; cu.innerHTML = c.line && c.line.text ? wordsHTML(c.ws) : '♪'; cu._sp = null; nx.textContent = c.next ? c.next.text : ''; },
    frame(c) { light(c.root.firstChild, c.ws, c.p); }
  });
  def('minimal', { family: 'Classic', name: 'Minimal', desc: 'A single quiet line at a time.', grad: ['#1b1b22', '#9aa7ff'] }, {
    mount(r) { r.innerHTML = '<div class="m"></div>'; },
    line(c) { const m = c.root.firstChild; m.classList.add('out'); const ws = c.ws, has = c.line && c.line.text;
      setTimeout(() => { m.innerHTML = has ? wordsHTML(ws) : '♪'; m._sp = null; m.classList.remove('out'); }, 170); },
    frame(c) { light(c.root.firstChild, c.ws, c.p); }
  });

  // ---- Kinetic type ----
  def('ship', { family: 'Kinetic type', name: 'Ship', desc: 'Words land one by one on a wall that drifts in 3D.', grad: ['#123a6b', '#ff9966'] }, {
    mount(r) { r.innerHTML = '<div class="persp"><div class="wall"></div></div>'; },
    line(c) { const wall = c.root.querySelector('.wall'); if (c.jump) wall.innerHTML = '';
      wall.querySelectorAll('.row').forEach(x => x.classList.add('old'));
      const row = el('div', 'row', c.line && c.line.text ? wordsHTML(c.ws) : '<span class="w on">♪</span>'); wall.appendChild(row);
      while (wall.children.length > 5) wall.firstChild.remove();
      requestAnimationFrame(() => { wall.style.setProperty('--y', -(row.offsetTop + row.offsetHeight / 2) + 'px'); }); },
    frame(c) { const wall = c.root.querySelector('.wall'), row = wall.lastChild; if (row) light(row, c.ws, c.p);
      const t = performance.now(); wall.style.setProperty('--ry', (Math.sin(t / 4200) * 16).toFixed(2) + 'deg'); wall.style.setProperty('--rx', (Math.cos(t / 5300) * 9 + 6).toFixed(2) + 'deg'); }
  });
  function fisheye(icons) {
    return {
      mount(r) { r.innerHTML = '<div class="lens"></div><div class="slot a"></div><div class="slot b"></div><div class="slot c"></div>'; this.g = -9; },
      frame(c) { const fw = c.v.flat(), g = indexAt(fw, c.p, 't0'); if (g === c.st.g) return; c.st.g = g;
        const [, a, b, cc] = c.root.children, txt = k => { const w = fw[k]; if (!w) return ''; const ic = icons ? iconFor(w.w) : ''; return esc(w.w) + (ic ? ` <i class="ic">${ic}</i>` : ''); };
        a.innerHTML = txt(g - 1); b.innerHTML = g < 0 ? '♪' : txt(g); cc.innerHTML = txt(g + 1);
        b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    };
  }
  def('fisheye', { family: 'Kinetic type', name: 'Fisheye', desc: 'A tight stack of three words, bulging through a lens.', grad: ['#4a1a6b', '#ff7a59'] }, fisheye(false));
  def('visual', { family: 'Kinetic type', name: 'Visual', desc: 'A centred stack, with an icon for every word that has one.', grad: ['#0f4d4a', '#e2c86b'] }, {
    mount(r) { r.innerHTML = '<div class="vs"></div>'; },
    line(c) { const box = c.root.firstChild; box.classList.add('out');
      const rows = []; let row = [], len = 0;
      c.ws.forEach((w, k) => { if (row.length && len + w.w.length > 11) { rows.push(row); row = []; len = 0; } row.push(k); len += w.w.length + 1; });
      if (row.length) rows.push(row);
      const html = rows.length ? rows.map(rw => `<div class="vr">${rw.map(k => { const ic = iconFor(c.ws[k].w); return `<span class="w" data-k="${k}">${ic ? `<i class="ic">${ic}</i>` : ''}${esc(c.ws[k].w)}</span>`; }).join(' ')}</div>`).join('') : '<div class="vr"><span class="w on">♪</span></div>';
      setTimeout(() => { box.innerHTML = html; box._sp = null; box.classList.remove('out'); }, 150); },
    frame(c) { light(c.root.firstChild, c.ws, c.p); }
  });
  def('fisheyeVisual', { family: 'Kinetic type', name: 'Fisheye Visual', desc: 'Fisheye, with icons beside the words that have one.', grad: ['#5a1a3a', '#ffb38a'] }, fisheye(true));

  // ---- Motion scenes ----
  const CODE_TPL = [
    t => `<k>sing</k>(<s>"${t}`, t => `<k>const</k> <v>line</v> = <s>"${t}`, t => `<k>await</k> <f>say</f>(<s>"${t}`,
    t => `<v>verse</v>.<f>push</f>(<s>"${t}`, t => `<k>return</k> <s>"${t}`];
  const CODE_END = ['"</s>);', '"</s>;', '"</s>);', '"</s>);', '"</s>;'];
  function codestyle(icons) {
    return {
      mount(r) { r.innerHTML = '<div class="ed"><div class="bar"><i></i><i></i><i></i><span>lyrics.js</span></div><div class="code"></div></div>'; },
      line(c) { const code = c.root.querySelector('.code');
        if (c.jump) code.innerHTML = '';
        const prev = code.lastChild; if (prev && prev._done) prev.innerHTML = prev._done;
        const n = c.i + 1, tpl = hash(String(c.i)) % CODE_TPL.length;
        const row = el('div', 'cl'); row._n = n; row._tpl = tpl; row._key = '';
        if (!c.line || !c.line.text) { row.innerHTML = `<b>${n}</b><c>// ♪ instrumental</c>`; row._done = row.innerHTML; }
        code.appendChild(row);
        while (code.children.length > 9) code.firstChild.remove(); },
      frame(c) { const row = c.root.querySelector('.code').lastChild; if (!row || !c.line || !c.line.text) return;
        let out = '', plain = '';
        for (const w of c.ws) { const st = wState(w, c.p); if (st === 0) break;
          const part = st === 2 ? w.w : w.w.slice(0, Math.ceil(w.w.length * wProg(w, c.p)));
          out += (out ? ' ' : '') + esc(part) + (st === 2 && icons && iconFor(w.w) ? ' ' + iconFor(w.w) : ''); plain += part + ' '; if (st === 1) break; }
        const key = out; if (row._key === key) return; row._key = key;
        const allDone = c.ws.length && wState(c.ws[c.ws.length - 1], c.p) === 2;
        const head = `<b>${row._n}</b>` + CODE_TPL[row._tpl](out);
        row.innerHTML = head + (allDone ? CODE_END[row._tpl] : '</s>') + '<u class="cur"></u>';
        const full = c.ws.map(w => esc(w.w) + (icons && iconFor(w.w) ? ' ' + iconFor(w.w) : '')).join(' ');
        row._done = `<b>${row._n}</b>` + CODE_TPL[row._tpl](full) + CODE_END[row._tpl]; }
    };
  }
  def('codestyle', { family: 'Motion scenes', name: 'Codestyle', desc: 'The lyric typed out as code, under a blinking red cursor.', grad: ['#161a2b', '#ff4d4d'] }, codestyle(false));
  def('codestyleVisual', { family: 'Motion scenes', name: 'Codestyle Visual', desc: 'Codestyle, with icons beside the words that have one.', grad: ['#1e1a36', '#ff5c8a'] }, codestyle(true));

  function newScene(c, viewBox) {
    const s = c.root.querySelector('svg.scene');
    s.querySelectorAll('g.ln').forEach(g => { g.classList.add('out'); setTimeout(() => g.remove(), 900); });
    const g = svg('g', { class: 'ln' }); s.appendChild(g); return g;
  }
  const fsU = c => 30 * c.v.sz(); // svg text size in viewBox units
  def('branches', { family: 'Motion scenes', name: 'Branches', desc: 'A line draws itself, and each word lights a node on it.', grad: ['#0e3a2a', '#7be08a'] }, {
    mount(r) { r.innerHTML = '<svg class="scene" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet"></svg>'; },
    line(c) { const g = newScene(c); c.st.parts = []; if (!c.ws.length) return;
      const R = rng(hash(c.line.text + c.i)), n = c.ws.length, pts = [];
      for (let k = 0; k <= n; k++) pts.push([60 + (880 * k) / n, 200 + (k === 0 ? 0 : (R() - 0.5) * 190)]);
      for (let k = 1; k <= n; k++) {
        const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], mx = (x0 + x1) / 2;
        const seg = svg('path', { d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`, class: 'seg' }); g.appendChild(seg);
        if (R() > 0.55) { const tw = svg('path', { d: `M${x1},${y1} q${(R() - .5) * 60},${(R() > .5 ? -1 : 1) * (30 + R() * 40)} ${(R() - .2) * 70},${(R() > .5 ? -1 : 1) * (40 + R() * 40)}`, class: 'twig' }); g.appendChild(tw); }
        const node = svg('circle', { cx: x1, cy: y1, r: 7, class: 'node' }); g.appendChild(node);
        const up = k % 2 ? -1 : 1, tx = svg('text', { x: x1, y: y1 + up * (fsU(c) * 0.95) + (up > 0 ? fsU(c) * 0.35 : 0), class: 'lbl', 'text-anchor': 'middle', 'font-size': fsU(c) });
        tx.textContent = c.ws[k - 1].w; g.appendChild(tx);
        const L = seg.getTotalLength(); seg.style.strokeDasharray = L; seg.style.strokeDashoffset = L;
        c.st.parts.push({ seg, L, node, tx });
      }
      g.prepend(svg('circle', { cx: pts[0][0], cy: pts[0][1], r: 5, class: 'node on' })); },
    frame(c) { (c.st.parts || []).forEach((pt, k) => { const w = c.ws[k]; if (!w) return; const f = wProg(w, c.p);
      pt.seg.style.strokeDashoffset = pt.L * (1 - f); const on = f > 0.7; if (pt.on !== on) { pt.on = on; pt.node.classList.toggle('on', on); pt.tx.classList.toggle('on', on); } }); }
  });
  def('web', { family: 'Motion scenes', name: 'Web', desc: 'Each line spun into a spider\'s web, a strand for every word.', grad: ['#3d1e0a', '#ff9a3c'] }, {
    mount(r) { r.innerHTML = '<svg class="scene" viewBox="-500 -200 1000 400" preserveAspectRatio="xMidYMid meet"></svg>'; },
    line(c) { const g = newScene(c); c.st.parts = []; c.st.rings = []; if (!c.ws.length) return;
      const R = rng(hash(c.line.text + c.i)), n = c.ws.length, ends = [];
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k / n) * Math.PI * 2 + (R() - 0.5) * (Math.PI / n) * 0.6, len = 0.75 + R() * 0.25;
        ends.push([Math.cos(a) * 330 * len, Math.sin(a) * 150 * len, a]);
      }
      [0.33, 0.6, 0.86].forEach(fr => { for (let k = 0; k < n; k++) { const a = ends[k], b = ends[(k + 1) % n];
        const ln = svg('path', { d: `M${a[0] * fr},${a[1] * fr} Q${(a[0] + b[0]) * fr * 0.42},${(a[1] + b[1]) * fr * 0.42} ${b[0] * fr},${b[1] * fr}`, class: 'ring' });
        g.appendChild(ln); c.st.rings.push({ ln, k: (k + 1) % n === 0 ? n - 1 : k + 1, on: false }); } });
      ends.forEach(([x, y, a], k) => {
        const st = svg('line', { x1: 0, y1: 0, x2: x, y2: y, class: 'strand' }); g.appendChild(st);
        const L = Math.hypot(x, y); st.style.strokeDasharray = L; st.style.strokeDashoffset = L;
        const cos = Math.cos(a), tx = svg('text', { x: x + cos * 14, y: y + Math.sin(a) * 18 + fsU(c) * 0.3, class: 'lbl', 'font-size': fsU(c) * 0.9,
          'text-anchor': Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end' });
        tx.textContent = c.ws[k].w; g.appendChild(tx); c.st.parts.push({ st, L, tx });
      });
      g.appendChild(svg('circle', { cx: 0, cy: 0, r: 6, class: 'hub' })); },
    frame(c) { (c.st.parts || []).forEach((pt, k) => { const w = c.ws[k]; if (!w) return; const f = wProg(w, c.p);
        pt.st.style.strokeDashoffset = pt.L * (1 - f); const on = f > 0.6; if (pt.on !== on) { pt.on = on; pt.tx.classList.toggle('on', on); } });
      (c.st.rings || []).forEach(r => { const w = c.ws[r.k]; const on = w && wState(w, c.p) === 2; if (on !== r.on) { r.on = on; r.ln.classList.toggle('on', on); } }); }
  });
  def('constellation', { family: 'Motion scenes', name: 'Constellation', desc: 'Each line traced as a constellation, star by star.', grad: ['#0b1030', '#8f7bff'] }, {
    mount(r) { r.innerHTML = '<svg class="scene" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet"><g class="sky"></g></svg>';
      const sky = r.querySelector('.sky'), R = rng(7);
      for (let k = 0; k < 160; k++) sky.appendChild(svg('circle', { cx: R() * 1800 - 400, cy: R() * 900 - 250, r: R() * 1.4 + 0.3, class: 'dust', style: `animation-delay:${(R() * 4).toFixed(2)}s` })); },
    line(c) { const g = newScene(c); c.st.parts = []; if (!c.ws.length) return;
      const R = rng(hash(c.line.text + c.i)), n = c.ws.length, pts = [];
      for (let k = 0; k < n; k++) pts.push([110 + (780 * (k + 0.5)) / n + (R() - 0.5) * 50, 80 + R() * 240]);
      pts.forEach(([x, y], k) => {
        let seg = null, L = 0;
        if (k) { const [px, py] = pts[k - 1]; seg = svg('line', { x1: px, y1: py, x2: x, y2: y, class: 'cline' }); g.appendChild(seg); L = Math.hypot(x - px, y - py); seg.style.strokeDasharray = L; seg.style.strokeDashoffset = L; }
        const star = svg('circle', { cx: x, cy: y, r: 4, class: 'star' }); g.appendChild(star);
        const up = y > 200 ? -1 : 1, tx = svg('text', { x, y: y + up * 22 + (up > 0 ? fsU(c) * 0.6 : 0), class: 'lbl', 'text-anchor': 'middle', 'font-size': fsU(c) * 0.85 });
        tx.textContent = c.ws[k].w; g.appendChild(tx); c.st.parts.push({ seg, L, star, tx });
      }); },
    frame(c) { (c.st.parts || []).forEach((pt, k) => { const w = c.ws[k]; if (!w) return; const f = wProg(w, c.p);
      if (pt.seg) pt.seg.style.strokeDashoffset = pt.L * (1 - f);
      const on = c.p >= w.t0; if (pt.on !== on) { pt.on = on; pt.star.classList.toggle('on', on); pt.tx.classList.toggle('on', on); } }); }
  });

  // ---- Native Design (iPhone screens, keep their own colours) ----
  const initials = s => (s || '♪').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  def('messages', { family: 'Native Design', native: true, name: 'Native Design', desc: 'The song as a message thread, a bubble for every line.', grad: ['#1d4fa8', '#7fb6ff'] }, {
    mount(r, v) { r.innerHTML = `<div class="phone"><div class="hd"><div class="av">${esc(initials(v.N.artist))}</div><div><b>${esc(v.N.artist || 'Glowrim')}</b><small>iMessage</small></div></div><div class="th"></div></div>`; },
    line(c) { const th = c.root.querySelector('.th'); if (c.jump) th.innerHTML = '';
      th.querySelector('.typing')?.remove(); th.querySelector('.dl')?.remove();
      th.querySelectorAll('.bb').forEach(b => b.classList.remove('tail'));
      if (c.line && c.line.text) {
        // Mix: most lines are bubbles; some arrive as a shared Maps location card.
        const R = rng(hash(c.line.text + c.i)), prev = th.lastElementChild;
        const asMap = c.i > 0 && c.line.text.length > 14 && R() < 0.24 && !(prev && prev.classList.contains('mcard'));
        const b = asMap
          ? el('div', 'mcard lit', `<div class="mm">${miniMap(R)}<span>⊙ Maps</span></div><div class="mb"><b>${wordsHTML(c.ws)}</b><small>⤴ ${PLACES[Math.floor(R() * PLACES.length)]}</small></div>`)
          : el('div', 'bb me tail lit', wordsHTML(c.ws));
        th.appendChild(b); th.appendChild(el('div', 'dl', 'Delivered'));
      }
      while (th.children.length > 8) th.firstChild.remove(); },
    frame(c) { const th = c.root.querySelector('.th'), mine = th.querySelectorAll('.lit'), b = mine[mine.length - 1]; if (b) light(b, c.ws, c.p);
      const gap = c.next ? c.next.t - c.p : 0, since = c.line ? c.p - c.line.t : c.p;
      const want = c.playing && c.next && gap > 900 && since > 1800 && c.next.t - (c.line ? c.line.t : 0) > 3500, has = th.querySelector('.typing');
      if (want && !has) th.appendChild(el('div', 'bb them typing', '<i></i><i></i><i></i>')); if (!want && has) has.remove(); }
  });
  def('money', { family: 'Native Design', native: true, name: 'Native Design Money', desc: 'The song as a run of payments, one for every line.', grad: ['#0d3b1e', '#9be15d'] }, {
    mount(r) { r.innerHTML = '<div class="phone"><div class="bal"><small>Balance</small><b>$0.00</b></div><div class="list"></div></div>'; this.bal = 0; },
    line(c) { const list = c.root.querySelector('.list'); if (c.jump) list.innerHTML = '';
      if (!c.line || !c.line.text) return;
      const R = rng(hash(c.line.text + c.i)), inc = R() > 0.35, amt = (Math.round(R() * 18000) / 100 + 4).toFixed(2), who = PEOPLE[Math.floor(R() * PEOPLE.length)];
      const hue = Math.floor(R() * 360);
      const row = el('div', 'pay', `<div class="pv" style="background:hsl(${hue} 55% 42%)">${who[0]}</div><div class="pm"><b>${inc ? who : 'You'} <span>${inc ? 'sent you' : 'paid ' + who}</span></b><div class="memo">${wordsHTML(c.ws)}</div><small>Just now</small></div><div class="amt ${inc ? 'in' : ''}">${inc ? '+' : '−'}$${amt}</div>`);
      list.prepend(row); while (list.children.length > 5) list.lastChild.remove();
      c.st.bal = (c.st.bal || 1240) + (inc ? 1 : -1) * +amt; c.root.querySelector('.bal b').textContent = '$' + c.st.bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    frame(c) { const m = c.root.querySelector('.pay .memo'); if (m) light(m, c.ws, c.p); }
  });
  def('map', { family: 'Native Design', native: true, name: 'Native Design Map', desc: 'A walk across San Francisco, with a pin for every line.', grad: ['#1e2c3e', '#d8b97a'] }, {
    mount(r, v) {
      r.innerHTML = '<div class="phone"><svg class="mapv" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><g class="cam"><g class="land"></g><polyline class="walk" points=""/><g class="pin"><path d="M0,-26 C-11,-26 -16,-17 -16,-11 C-16,0 0,10 0,10 C0,10 16,0 16,-11 C16,-17 11,-26 0,-26Z"/><circle cy="-12" r="5"/></g></g></svg><div class="card"><small>📍 Maps</small><div class="ly"></div><span class="loc"></span></div></div>';
      const land = r.querySelector('.land'), R = rng(hash(v.N.title || 'sf'));
      land.appendChild(svg('rect', { x: -2000, y: -2000, width: 4000, height: 4000, class: 'ground' }));
      land.appendChild(svg('path', { d: 'M-2000,900 C-600,700 400,1200 2000,800 L2000,2000 L-2000,2000Z', class: 'water' }));
      for (let k = 0; k < 14; k++) land.appendChild(svg('rect', { x: (R() - 0.5) * 3000, y: (R() - 0.5) * 2400, width: 80 + R() * 200, height: 60 + R() * 160, rx: 10, class: 'park' }));
      for (let k = -30; k <= 30; k++) { land.appendChild(svg('line', { x1: k * 70, y1: -2000, x2: k * 70 + 300, y2: 2000, class: k % 5 ? 'rd' : 'rd big' }));
        land.appendChild(svg('line', { x1: -2000, y1: k * 60, x2: 2000, y2: k * 60 - 200, class: k % 6 ? 'rd' : 'rd big' })); }
      land.appendChild(svg('line', { x1: -2000, y1: 1400, x2: 2000, y2: -1200, class: 'rd main' }));
      this.walk = null;
    },
    line(c) { const R = rng(hash(c.line ? c.line.text + c.i : 'x' + c.i));
      const st = c.st; if (!st.pts || c.jump) st.pts = [[0, 0]];
      if (c.line && c.line.text) { const [x, y] = st.pts[st.pts.length - 1]; st.pts.push([x + (R() - 0.3) * 160, y + (R() - 0.5) * 140]); }
      while (st.pts.length > 12) st.pts.shift();
      const [px, py] = st.pts[st.pts.length - 1];
      c.root.querySelector('.walk').setAttribute('points', st.pts.map(p => p.join(',')).join(' '));
      c.root.querySelector('.pin').setAttribute('transform', `translate(${px},${py})`);
      c.root.querySelector('.cam').style.transform = `translate(${200 - px}px, ${170 - py}px)`;
      const card = c.root.querySelector('.card'); card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
      const ly = card.querySelector('.ly'); ly.innerHTML = c.line && c.line.text ? wordsHTML(c.ws) : '♪'; ly._sp = null;
      card.querySelector('.loc').textContent = '⤴ ' + SF[hash(String(c.i)) % SF.length] + ', San Francisco'; },
    frame(c) { light(c.root.querySelector('.ly'), c.ws, c.p); }
  });
  def('notifications', { family: 'Native Design', native: true, name: 'Native Design Notifications', desc: 'Lines arrive as lock-screen notifications, stacks and widgets.', grad: ['#2c1a5c', '#f0a56b'] }, {
    mount(r) { r.innerHTML = '<div class="phone"><div class="clk"><small></small><b></b></div><div class="stk"></div></div>'; },
    line(c) { const stk = c.root.querySelector('.stk'); if (c.jump) stk.innerHTML = '';
      if (!c.line || !c.line.text) return;
      if (c.i > 0 && c.i % 7 === 0 && c.v.N.title) {
        stk.prepend(el('div', 'nt wid', `<div class="wa" style="background-image:url('${c.v.N.art || ''}')"></div><div><small>NOW PLAYING</small><b>${esc(c.v.N.title)}</b><span>${esc(c.v.N.artist)}</span></div>`));
      }
      const R = rng(hash(c.line.text + c.i)), [app, ic, col] = APPS[Math.floor(R() * APPS.length)];
      const who = app === 'Messages' || app === 'Mail' ? PEOPLE[Math.floor(R() * PEOPLE.length)] : app === 'Calendar' ? 'Up next' : app;
      stk.prepend(el('div', 'nt', `<div class="ai" style="background:${col}">${ic}</div><div class="nb"><div class="nh"><b>${who}</b><small>now</small></div><div class="nl">${wordsHTML(c.ws)}</div></div>`));
      [...stk.children].forEach((n, k) => { n.style.setProperty('--k', k); n.classList.toggle('back', k >= 3); });
      while (stk.children.length > 6) stk.lastChild.remove(); },
    frame(c) { const nl = c.root.querySelector('.nt .nl'); if (nl) light(nl, c.ws, c.p);
      if (!c.st.ct || performance.now() - c.st.ct > 5000) { c.st.ct = performance.now(); const d = new Date();
        c.root.querySelector('.clk b').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
        c.root.querySelector('.clk small').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); } }
  });

  const ORDER = ['ship', 'fisheye', 'visual', 'fisheyeVisual', 'codestyle', 'codestyleVisual', 'branches', 'web', 'constellation',
    'messages', 'money', 'map', 'notifications', 'stack', 'karaoke', 'minimal'];

  // ================= view =================
  class LyricsView {
    constructor(root, opt = {}) {
      this.root = root; this.opt = opt; root.classList.add('gl-root');
      this.S = null; this.N = { title: '', artist: '', art: '' }; this.T = { pos: 0, dur: 0, upd: 0, status: 'None' };
      this.L = { key: '', state: 'none', lines: [] }; this.idx = -2; this.beat = 0; this.styleKey = null; this.demoOn = null;
      this.stage = el('div', 'gl-stage'); this.pillEl = el('div', 'gl-pill'); root.append(this.stage, this.pillEl);
      this.demoStart = performance.now();
      const loop = () => { try { this.frame(); } catch (e) { console.error(e); } this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
      if (window.ResizeObserver) new ResizeObserver(() => this.idx = -2).observe(root);
    }
    // --- inputs ---
    setSettings(S) {
      const prev = this.S; this.S = S; const r = this.root.style;
      const c1 = S.lc1 || S.c1, c2 = S.lc2 || S.c2;
      r.setProperty('--c1', c1); r.setProperty('--c2', c2);
      const match = S.lyricMatchAlbum, col = S.lyricColors || {};
      r.setProperty('--tx', match ? '#f6f6f8' : col.text || '#f2f2f2');
      r.setProperty('--hl', match ? c1 : col.hl || '#ff7a7a');
      r.setProperty('--sec', match ? c2 : col.sec || '#ffffff');
      r.setProperty('--fs', (34 * (S.lyricScale || 100) / 100 * (this.opt.scale || 1)).toFixed(1) + 'px');
      r.setProperty('--font', `'${S.lyricFont}', 'Segoe UI Variable Display', 'Segoe UI', sans-serif`);
      const st = this.opt.style || S.lyricStyle;
      if (st !== this.styleKey || (prev && (prev.lyricScale !== S.lyricScale || prev.lyricFont !== S.lyricFont))) this.useStyle(st);
      this.pill();
    }
    setStyle(st) { this.opt.style = st; this.useStyle(st); }
    setNow(N) { const ch = N.title !== this.N.title || N.artist !== this.N.artist; this.N = N; if (ch && this.styleKey) this.useStyle(this.styleKey); }
    setTime(T) { this.T = T; this.root.classList.toggle('paused', T.status !== 'Playing'); }
    setLyrics(L) { const ch = L.key !== this.L.key || L.state !== this.L.state || (L.lines || []).length !== (this.L.lines || []).length;
      this.L = L; this._flat = null; if (ch && this.styleKey) this.useStyle(this.styleKey); this.pill(); }
    level(v) { if (v > this.beat) this.beat = v; }
    // --- helpers used by styles ---
    real() { return this.L.state === 'synced' && this.L.lines && this.L.lines.length; }
    demo() { return this.opt.demo && !this.real(); }
    lines() { return this.demo() ? DEMO : (this.real() ? this.L.lines : []); }
    words(i) { const ls = this.lines(); return ls[i] ? timeWords(ls[i], ls[i + 1] ? ls[i + 1].t : null) : []; }
    flat() { if (!this._flat || this._flatDemo !== this.demo()) { this._flatDemo = this.demo(); this._flat = []; this.lines().forEach((l, i) => this.words(i).forEach(w => this._flat.push(w))); } return this._flat; }
    sz() { return (this.S ? this.S.lyricScale || 100 : 100) / 100; }
    pos() {
      if (this.demo()) return (performance.now() - this.demoStart) % DEMO_LEN;
      const T = this.T, run = T.status === 'Playing' ? Math.max(0, Date.now() - T.upd) : 0;
      const p = T.pos + run + ((this.S ? this.S.lyricOffset : 0) + (this.S ? this.S.songNudge || 0 : 0)) * 1000;
      return T.dur ? Math.min(p, T.dur) : p;
    }
    useStyle(st) {
      this.styleKey = st; this.impl = STYLES[st] || STYLES.stack; this.st = {};
      this.stage.className = 'gl-stage st-' + this.impl.key + (this.impl.native ? ' native' : '');
      this.stage.innerHTML = ''; this.impl.mount(this.stage, this); this.idx = -2; this.lastP = null;
    }
    pill() {
      if (this.opt.demo) { this.pillEl.classList.remove('show'); return; }
      const m = { loading: 'Finding lyrics…', none: `No lyrics found${this.N.title ? ' · ' + this.N.title : ''}`, plain: 'Lyrics found, but not time-synced',
        instrumental: '♪ Instrumental', offline: 'Lyrics unavailable (offline?)' };
      const t = this.real() || !this.N.title ? '' : m[this.L.state] || '';
      this.pillEl.textContent = t; this.pillEl.classList.toggle('show', !!t);
    }
    frame() {
      if (this.S && this.impl) {
        const demo = this.demo();
        if (demo !== this.demoOn) { this.demoOn = demo; this.demoStart = performance.now(); this.useStyle(this.styleKey); }
        const ls = this.lines();
        if (ls.length) {
          const p = this.pos(), i = indexAt(ls, p);
          const looped = this.lastP != null && p < this.lastP - 1500; this.lastP = p;
          const c = { p, i, v: this, root: this.stage, st: this.st, line: ls[i], ws: this.words(i), next: ls[i + 1], playing: demo || this.T.status === 'Playing' };
          if (i !== this.idx || looped) { c.jump = looped || this.idx === -2 || i < this.idx || i - this.idx > 1; this.idx = i; this.impl.line && this.impl.line(c); }
          this.impl.frame && this.impl.frame(c);
        }
      }
      this.beat *= 0.9; this.root.style.setProperty('--beat', this.beat.toFixed(3));
    }
  }
  window.LyricsView = LyricsView;
  window.LYRIC_STYLES = ORDER.map(k => ({ key: k, family: STYLES[k].family, name: STYLES[k].name, desc: STYLES[k].desc, grad: STYLES[k].grad, native: !!STYLES[k].native }));
})();
