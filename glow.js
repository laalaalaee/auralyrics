/* Shared screen-edge glow renderer (used by the desktop overlay and the full-screen lyrics view).
   const g = Glow(hostElement); g.set(settingsState); g.level(0..1)
   Modes: default (flows around the edge), music (follows the beat), idle (steady breathing), none (static).

   Performance: nothing here repaints per frame. The colours live in a tiny canvas that is drawn only
   when colours change; the compositor scales it up and rotates it (transform), and the rim shape is a
   static mask that fades softly inward. Per frame we only touch transform + opacity. */
(function () {
  const css = `
  .glow-host { pointer-events: none; }
  .glow-ring { position: absolute; inset: 0; overflow: hidden; pointer-events: none; opacity: 0; will-change: opacity;
    -webkit-mask-image: var(--gm); mask-image: var(--gm); -webkit-mask-composite: source-over; mask-composite: add; }
  .glow-ring canvas { position: absolute; left: 50%; top: 50%; width: 150vmax; height: 150vmax; margin: -75vmax 0 0 -75vmax;
    will-change: transform; image-rendering: auto; }
  .glow-ring.soft { --gm: linear-gradient(to right, #000, rgba(0,0,0,.55) calc(var(--gw) * .22), rgba(0,0,0,.16) calc(var(--gw) * .6), transparent var(--gw)),
    linear-gradient(to left, #000, rgba(0,0,0,.55) calc(var(--gw) * .22), rgba(0,0,0,.16) calc(var(--gw) * .6), transparent var(--gw)),
    linear-gradient(to bottom, #000, rgba(0,0,0,.55) calc(var(--gw) * .22), rgba(0,0,0,.16) calc(var(--gw) * .6), transparent var(--gw)),
    linear-gradient(to top, #000, rgba(0,0,0,.55) calc(var(--gw) * .22), rgba(0,0,0,.16) calc(var(--gw) * .6), transparent var(--gw)); }
  .glow-ring.core { --gm: linear-gradient(to right, #000, #000 calc(var(--gt) * .5), transparent var(--gt)),
    linear-gradient(to left, #000, #000 calc(var(--gt) * .5), transparent var(--gt)),
    linear-gradient(to bottom, #000, #000 calc(var(--gt) * .5), transparent var(--gt)),
    linear-gradient(to top, #000, #000 calc(var(--gt) * .5), transparent var(--gt)); }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const hex = h => { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const SIZE = 128;

  window.Glow = function (host) {
    host.classList.add('glow-host');
    const mk = cls => { const ring = document.createElement('div'); ring.className = 'glow-ring ' + cls;
      const cv = document.createElement('canvas'); cv.width = cv.height = SIZE; ring.appendChild(cv); host.appendChild(ring);
      return { ring, cv, ctx: cv.getContext('2d') }; };
    const soft = mk('soft'), core = mk('core');
    const hs = host.style;

    let s = null, target = 0, lvl = 0, angle = 0, last = performance.now(), fade = 0;
    // colour transition (replaces the old 1.4 s CSS custom-property transition)
    let from = [hex('#ff3d81'), hex('#4d7cff')], to = from, cur = from, tStart = 0, split = 60, drawnKey = '';
    const TRANS = 1400;

    function draw(c1, c2) {
      const key = rgb(c1) + rgb(c2) + split; if (key === drawnKey) return; drawnKey = key;
      // c1 peaks at 0/.5, c2 at .25/.75; the 50/50 blend sits at the split boundary so c1 really owns
      // `split`% of the rim (at 50 this is exactly the even c1,c2,c1,c2,c1 gradient).
      const a = rgb(c1), b = rgb(c2), m = rgb(mix(c1, c2, .5)), q = split / 400;
      for (const L of [soft, core]) {
        const g = L.ctx.createConicGradient(0, SIZE / 2, SIZE / 2);
        g.addColorStop(0, a); g.addColorStop(q, m); g.addColorStop(.25, b); g.addColorStop(.5 - q, m); g.addColorStop(.5, a);
        g.addColorStop(.5 + q, m); g.addColorStop(.75, b); g.addColorStop(1 - q, m); g.addColorStop(1, a);
        L.ctx.fillStyle = g; L.ctx.fillRect(0, 0, SIZE, SIZE);
      }
    }
    let lastT = '', lastSo = '', lastCo = '', lastGt = '', lastGw = '';
    function paint(a, oSoft, oCore) {
      const so = Math.max(0, Math.min(1, oSoft)).toFixed(3), co = Math.max(0, Math.min(1, oCore)).toFixed(3);
      const t = `rotate(${a.toFixed(2)}deg)`;                        // fully faded out: don't keep the compositor busy
      if (t !== lastT && (so !== '0.000' || co !== '0.000')) { lastT = t; soft.cv.style.transform = t; core.cv.style.transform = t; }
      if (so !== lastSo) { lastSo = so; soft.ring.style.opacity = so; }
      if (co !== lastCo) { lastCo = co; core.ring.style.opacity = co; }
    }
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      // colour cross-fade
      if (cur !== to) { const k = Math.max(0, Math.min(1, (now - tStart) / TRANS)), e = ease(k);
        const c = [mix(from[0], to[0], e), mix(from[1], to[1], e)]; draw(c[0], c[1]); if (k >= 1) cur = to; else cur = c; }
      // on/off fade
      const want = s && s.enabled ? 1 : 0; fade += (want - fade) * Math.min(1, dt * 6); if (Math.abs(want - fade) < .002) fade = want;
      if (s) {
        const mode = s.glowMode, react = mode === 'music' && s.playing;
        const goal = react ? Math.min(1.5, target * s.intensity) : 0;
        // frame-rate independent fast attack / slow release
        lvl += (goal - lvl) * (1 - Math.pow(goal > lvl ? 0.45 : 0.92, dt * 60));
        let spin = 0, o = s.idleBrightness, boost = 0;
        if (mode === 'music') {
          spin = react ? 18 + lvl * 140 : 10;
          o = react ? s.idleBrightness * 0.7 + lvl * 0.45 : s.idleBrightness + Math.sin(now / 1800) * 0.06;
          boost = react ? lvl : 0;
        } else if (mode === 'default') { spin = 24; o = s.idleBrightness + Math.sin(now / 2400) * 0.05; }
        else if (mode === 'idle') { o = s.idleBrightness * (0.85 + Math.sin(now / 2600) * 0.15); }
        else { o = s.idleBrightness; }
        angle = (angle + spin * s.speed * dt) % 360;
        const glowAmt = Math.min(1, (s.glow || 0) / 60);
        paint(angle, o * fade * (0.35 + glowAmt * 0.55 + boost * 0.5), o * fade);
      }
      requestAnimationFrame(frame);                                     // paced to the display's refresh
    }
    requestAnimationFrame(frame);
    return {
      set(v) {
        const first = !s; s = v;
        const nt = [hex(v.c1), hex(v.c2)], ns = v.glowColors === 1 ? 50 : Math.max(5, Math.min(95, +v.glowSplit || 60));
        if (first) { from = to = cur = nt; split = ns; draw(nt[0], nt[1]); }
        else {
          if (ns !== split) { split = ns; drawnKey = ''; draw(cur[0], cur[1]); }
          if (rgb(nt[0]) + rgb(nt[1]) !== rgb(to[0]) + rgb(to[1])) { from = cur; to = nt; cur = from.slice(); tStart = performance.now(); }
        }
        // an invalid length would void the mask and flood the whole window, so always write a number
        const th = Math.max(2, +v.thickness || 0), gt = th + 'px', gw = Math.round(th + (+v.glow || 0) * 1.6) + 'px';
        if (gt !== lastGt) { lastGt = gt; hs.setProperty('--gt', gt); }   // set() runs ~80x/s during slider drags
        if (gw !== lastGw) { lastGw = gw; hs.setProperty('--gw', gw); }
      },
      level(v) { target = v; }
    };
  };
})();
