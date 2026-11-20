/* Shared screen-edge glow renderer (used by the desktop overlay and the full-screen lyrics view).
   const g = Glow(hostElement); g.set(settingsState); g.level(0..1)
   Modes: default (flows around the edge), music (follows the beat), idle (steady breathing), none (static).
   Styles (glowStyle): rim (whole edge) · corners (four corner blooms) · orbit (one comet circling the edge) ·
   twin (two comets) · bars (top and bottom only). Every size is relative to the screen: the host is a size
   container (cqmin) and thickness is scaled by the screen's short side, so a phone-shaped window, a laptop,
   an ultrawide and a 4K monitor all get the same look.

   Performance: nothing here repaints per frame. The colours live in a tiny canvas that is drawn only
   when colours change; the compositor scales it up and rotates it (transform), and the shape is a
   static mask that fades softly inward. Per frame we only touch transform + opacity. */
(function () {
  // Edge masks are built here so each style can reuse them. soft = the wide bloom, core = the thin bright line.
  const fadeTo = (dir, w, soft) => soft
    ? `linear-gradient(${dir}, #000, rgba(0,0,0,.55) calc(${w} * .22), rgba(0,0,0,.16) calc(${w} * .6), transparent ${w})`
    : `linear-gradient(${dir}, #000, #000 calc(${w} * .5), transparent ${w})`;
  const edges = (dirs, soft) => dirs.map(d => fadeTo(d, soft ? 'var(--gw)' : 'var(--gt)', soft)).join(',');
  const RIM = ['to right', 'to left', 'to bottom', 'to top'], BARS = ['to bottom', 'to top'];
  const CORNERS = ['0 0', '100% 0', '0 100%', '100% 100%'];
  const corners = soft => CORNERS.map(p => soft
    ? `radial-gradient(circle at ${p}, #000, rgba(0,0,0,.5) calc(var(--gr) * .3), rgba(0,0,0,.14) calc(var(--gr) * .62), transparent var(--gr))`
    : `radial-gradient(circle at ${p}, #000, #000 calc(var(--gr) * .06), transparent calc(var(--gr) * .5))`).join(',');
  const css = `
  .glow-host { pointer-events: none; container-type: size; --gr: calc(var(--gw) * 2.2 + 9cqmin); }
  .glow-ring { position: absolute; inset: 0; overflow: hidden; pointer-events: none; opacity: 0; will-change: opacity;
    -webkit-mask-image: var(--gm); mask-image: var(--gm); -webkit-mask-composite: source-over; mask-composite: add; }
  .glow-ring canvas { position: absolute; left: 50%; top: 50%; width: 150cqmax; height: 150cqmax; margin: -75cqmax 0 0 -75cqmax;
    will-change: transform; image-rendering: auto; }
  .glow-ring.soft { --gm: ${edges(RIM, true)}; }
  .glow-ring.core { --gm: ${edges(RIM, false)}; }
  .gs-bars .glow-ring.soft { --gm: ${edges(BARS, true)}; }
  .gs-bars .glow-ring.core { --gm: ${edges(BARS, false)}; }
  .gs-corners .glow-ring.soft { --gm: ${corners(true)}; }
  .gs-corners .glow-ring.core { --gm: ${corners(false)}; }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const hex = h => { h = String(h || '#ffffff').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgb = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;
  const rgba = (c, a) => `rgba(${c.map(v => Math.round(v)).join(',')},${a})`;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const SIZE = 128;
  const STYLES = ['rim', 'corners', 'orbit', 'twin', 'bars'];

  window.Glow = function (host) {
    host.classList.add('glow-host', 'gs-rim');
    const mk = cls => { const ring = document.createElement('div'); ring.className = 'glow-ring ' + cls;
      const cv = document.createElement('canvas'); cv.width = cv.height = SIZE; ring.appendChild(cv); host.appendChild(ring);
      return { ring, cv, ctx: cv.getContext('2d') }; };
    const soft = mk('soft'), core = mk('core');
    const hs = host.style;

    let s = null, target = 0, lvl = 0, angle = 0, last = performance.now(), fade = 0, style = 'rim';
    // colour transition (replaces the old 1.4 s CSS custom-property transition)
    let from = [hex('#ff3d81'), hex('#4d7cff')], to = from, cur = from, tStart = 0, split = 60, drawnKey = '';
    const TRANS = 1400;

    function draw(c1, c2) {
      const key = rgb(c1) + rgb(c2) + split + style; if (key === drawnKey) return; drawnKey = key;
      const a = rgb(c1), b = rgb(c2), m = rgb(mix(c1, c2, .5)), q = split / 400;
      for (const L of [soft, core]) {
        const ctx = L.ctx; ctx.clearRect(0, 0, SIZE, SIZE);
        const g = ctx.createConicGradient(0, SIZE / 2, SIZE / 2);
        if (style === 'orbit' || style === 'twin') {
          // comets: a tail that grows out of nothing in c2, ends in a bright c1 head, then a soft cut-off
          const n = style === 'twin' ? 2 : 1, len = style === 'twin' ? .22 : .38;
          for (let i = 0; i < n; i++) { const o = i / n;
            g.addColorStop(o, rgba(c2, 0)); g.addColorStop(o + len * .5, rgba(c2, .45)); g.addColorStop(o + len * .82, rgba(mix(c2, c1, .6), .85));
            g.addColorStop(o + len, rgba(c1, 1)); g.addColorStop(o + len + .015, rgba(c1, 0)); }
          g.addColorStop(1, rgba(c2, 0));
        } else {
          // c1 peaks at 0/.5, c2 at .25/.75; the 50/50 blend sits at the split boundary so c1 really owns
          // `split`% of the rim (at 50 this is exactly the even c1,c2,c1,c2,c1 gradient).
          g.addColorStop(0, a); g.addColorStop(q, m); g.addColorStop(.25, b); g.addColorStop(.5 - q, m); g.addColorStop(.5, a);
          g.addColorStop(.5 + q, m); g.addColorStop(.75, b); g.addColorStop(1 - q, m); g.addColorStop(1, a);
        }
        ctx.fillStyle = g; ctx.fillRect(0, 0, SIZE, SIZE);
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
        const orb = style === 'orbit' || style === 'twin';              // comets always travel, even when idle
        let spin = 0, o = s.idleBrightness, boost = 0;
        if (mode === 'music') {
          spin = react ? 18 + lvl * 140 : (orb ? 24 : 10);
          o = react ? s.idleBrightness * 0.7 + lvl * 0.45 : s.idleBrightness + Math.sin(now / 1800) * 0.06;
          boost = react ? lvl : 0;
        } else if (mode === 'default') { spin = orb ? 40 : 24; o = s.idleBrightness + Math.sin(now / 2400) * 0.05; }
        else if (mode === 'idle') { o = s.idleBrightness * (0.85 + Math.sin(now / 2600) * 0.15); if (orb) spin = 14; }
        else { o = s.idleBrightness; }
        angle = (angle + spin * s.speed * dt) % 360;
        const glowAmt = Math.min(1, (s.glow || 0) / 60);
        paint(angle, o * fade * (0.35 + glowAmt * 0.55 + boost * 0.5), o * fade);
      }
      requestAnimationFrame(frame);                                     // paced to the display's refresh
    }
    requestAnimationFrame(frame);

    // Sizes follow the screen: 1080 px on the short side is the reference, clamped so a small laptop barely changes
    // and a 4K screen at 100 % scaling doesn't get a hairline. Re-run whenever the window/display size changes.
    let lastV = null;
    const kOf = () => { const m = Math.min(host.clientWidth || innerWidth, host.clientHeight || innerHeight); return Math.max(.85, Math.min(2, m / 1080)); };
    function sizes() {
      if (!lastV) return; const k = kOf(), th = Math.max(2, +lastV.thickness || 0);
      // an invalid length would void the mask and flood the whole window, so always write a number
      const gt = (th * k).toFixed(1) + 'px', gw = Math.round((th + (+lastV.glow || 0) * 1.6) * k) + 'px';
      if (gt !== lastGt) { lastGt = gt; hs.setProperty('--gt', gt); }   // set() runs ~80x/s during slider drags
      if (gw !== lastGw) { lastGw = gw; hs.setProperty('--gw', gw); }
    }
    if (window.ResizeObserver) new ResizeObserver(sizes).observe(host);
    return {
      set(v) {
        const first = !s; s = v; lastV = v;
        const nsty = STYLES.includes(v.glowStyle) ? v.glowStyle : 'rim';
        if (nsty !== style) { host.classList.remove('gs-' + style); style = nsty; host.classList.add('gs-' + style); drawnKey = ''; if (!first) draw(cur[0], cur[1]); }
        const nt = [hex(v.c1), hex(v.c2)], ns = v.glowColors === 1 ? 50 : Math.max(5, Math.min(95, +v.glowSplit || 60));
        if (first) { from = to = cur = nt; split = ns; draw(nt[0], nt[1]); }
        else {
          if (ns !== split) { split = ns; drawnKey = ''; draw(cur[0], cur[1]); }
          if (rgb(nt[0]) + rgb(nt[1]) !== rgb(to[0]) + rgb(to[1])) { from = cur; to = nt; cur = from.slice(); tStart = performance.now(); }
        }
        sizes();
      },
      level(v) { target = v; }
    };
  };
})();
