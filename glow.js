/* Shared screen-edge glow renderer (used by the desktop overlay and the full-screen lyrics view).
   const g = Glow(hostElement); g.set(settingsState); g.level(0..1)
   Modes: default (flows around the edge), music (follows the beat), idle (steady breathing), none (static). */
(function () {
  const css = `
  @property --gc1 { syntax: '<color>'; inherits: true; initial-value: #ff3d81; }
  @property --gc2 { syntax: '<color>'; inherits: true; initial-value: #4d7cff; }
  .glow-host { transition: --gc1 1.4s ease, --gc2 1.4s ease; }
  .glow-ring { position: absolute; inset: 0; box-sizing: border-box; pointer-events: none;
    border: var(--gt) solid transparent;
    background: conic-gradient(from var(--ga), var(--gc1), var(--gc2), var(--gc1), var(--gc2), var(--gc1)) border-box;
    -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0) border-box;
    -webkit-mask-composite: xor; mask-composite: exclude; opacity: var(--go); transition: opacity .4s }
  .glow-ring.soft { filter: blur(var(--gg)); border-width: calc(var(--gt) * 1.6); opacity: calc(var(--go) * .95) }
  .glow-ring.core { filter: saturate(1.2) }
  .glow-host.off .glow-ring { opacity: 0 }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.Glow = function (host) {
    host.classList.add('glow-host');
    host.insertAdjacentHTML('beforeend', '<div class="glow-ring soft"></div><div class="glow-ring core"></div>');
    const r = host.style;
    let s = null, target = 0, lvl = 0, angle = 0, last = performance.now(), lastPaint = '';
    function paint(a, o, g) {
      const key = `${a.toFixed(1)}|${o.toFixed(3)}|${g.toFixed(1)}`; if (key === lastPaint) return; lastPaint = key;
      r.setProperty('--ga', a.toFixed(1) + 'deg'); r.setProperty('--go', Math.max(0, Math.min(1, o)).toFixed(3)); r.setProperty('--gg', g.toFixed(1) + 'px');
    }
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (s && s.glowMode !== 'none') {
        const mode = s.glowMode, react = mode === 'music' && s.playing;
        const goal = react ? Math.min(1.5, target * s.intensity) : 0;
        lvl += (goal - lvl) * (goal > lvl ? 0.55 : 0.08);              // fast attack, slow release
        let spin = 0, o = s.idleBrightness, g = s.glow;
        if (mode === 'music') {
          spin = react ? 18 + lvl * 140 : 10;
          o = react ? s.idleBrightness * 0.65 + lvl * 0.6 : s.idleBrightness + Math.sin(now / 1800) * 0.06;
          g = s.glow * (1 + lvl * 0.9);
        } else if (mode === 'default') { spin = 24; o = s.idleBrightness + Math.sin(now / 2400) * 0.05; }
        else if (mode === 'idle') { o = s.idleBrightness * (0.85 + Math.sin(now / 2600) * 0.15); }
        angle = (angle + spin * s.speed * dt) % 360;
        paint(angle, o, g);
      }
      requestAnimationFrame(frame);                                     // paced to the display's refresh
    }
    requestAnimationFrame(frame);
    return {
      set(v) {
        s = v;
        r.setProperty('--gc1', v.c1); r.setProperty('--gc2', v.c2); r.setProperty('--gt', v.thickness + 'px');
        host.classList.toggle('off', !v.enabled);
        if (v.glowMode === 'none') { lastPaint = ''; paint(0, v.idleBrightness, v.glow); }
      },
      level(v) { target = v; }
    };
  };
})();
