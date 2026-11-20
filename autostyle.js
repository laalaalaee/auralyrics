/* Context-aware lyric style picker ("Auto").
   Reads the song's lyrics (pace, line length, the kind of words) and the time of day, scores every style in the pool
   and picks one at random, weighted by how well it fits. So a fast, short-lined track leans kinetic, a slow one calm,
   a chatty one a message thread, a song about money or a city the matching Native Design screen, and so on, but it is
   never fixed: a weaker fit can still win, and the style on screen is never repeated. */

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// How much each style likes each signal (0..1). Keyword signals count for more than pace signals.
const TRAITS = {
  ship: { fast: .9, short: .6 }, fisheye: { fast: .8, short: .8 }, visual: { fast: .5, short: .5, long: .2 }, fisheyeVisual: { fast: .7, short: .7 },
  codestyle: { fast: .7, short: .3 }, codestyleVisual: { fast: .6, short: .4 },
  branches: { slow: .7, long: .3, night: .5 }, web: { slow: .6, long: .5 }, constellation: { slow: .6, night: 1, sky: 1 },
  messages: { short: 1, talk: 1 }, money: { money: 1, short: .3 }, map: { place: 1, slow: .3 }, notifications: { short: .7, talk: .7 },
  stack: { long: .8, slow: .5 }, karaoke: { fast: .4, long: .4 }, minimal: { slow: .9, night: 1, long: .5 }, poster: { slow: .7, long: .4, night: .6 }
};
const KEYWORD = { money: 1, place: 1, sky: 1, talk: 1 };
const WORDS = {
  money: /\b(money|cash|bank|bands?|racks?|rich|dollars?|bills|paid|pay|gold|diamonds?|million|millions|worth|broke|expensive|spend|spent|wallet|designer|gucci|prada|chanel|rolex|\$)/i,
  place: /\b(city|streets?|roads?|driv(?:e|ing)|highway|miles?|home|town|downtown|avenue|block|airport|flight|plane|train|taxi|uber|west|east|north|south|california|york|angeles|paris|london|tokyo|miami|vegas|beach|ocean|bridge)\b/i,
  sky: /\b(stars?|moon|night|midnight|sky|dark|dreams?|sleep|galaxy|universe|space|sun|sunrise|sunset|heaven|angels?|lights?)\b/i,
  talk: /\b(text(?:ed|ing)?|call(?:ed|ing)?|phone|messages?|dm|answer|reply|hey|hello|miss|babe|baby|boo|tell|told|talk(?:ing)?|whisper|ghost(?:ed|ing)?|read|typing)\b/i
};

// Turn the lyrics into 0..1 signals. `lines` are {t, text}; `durMs` is the track length when known.
function signals(lines, durMs, hour) {
  const rows = (lines || []).map(l => String(l.text || '').trim()).filter(t => /[\p{L}\p{N}]/u.test(t));
  const n = rows.length;
  const night = hour >= 22 || hour < 5 ? 1 : hour < 7 || hour >= 20 ? .5 : 0;
  if (!n) return { n, night };
  const last = lines[lines.length - 1].t || 0, min = Math.max(1, (durMs || last) / 60000);
  const lpm = n / min, wpl = rows.reduce((a, t) => a + t.split(/\s+/).length, 0) / n;
  const out = { n, night, lpm, wpl,
    fast: clamp((lpm - 16) / 14), slow: clamp((16 - lpm) / 8), short: clamp((6 - wpl) / 2.5), long: clamp((wpl - 6) / 3) };
  for (const k of Object.keys(WORDS)) out[k] = clamp(rows.filter(t => WORDS[k].test(t)).length / n / .12);
  return out;
}

// Pick a style from `pool`, never `current`. `rand` is injectable so tests are deterministic.
function pickStyle({ lines, durMs, hour = new Date().getHours(), pool, current, rand = Math.random }) {
  const opts = pool.filter(k => TRAITS[k] && k !== current);
  if (!opts.length) return { style: current, reason: 'no other style in the pool' };
  const sig = signals(lines, durMs, hour);
  const scored = opts.map(k => {
    let s = 0; for (const [t, w] of Object.entries(TRAITS[k])) s += w * (sig[t] || 0) * (KEYWORD[t] ? 4 : 1.6);
    return { k, w: Math.pow(.6 + s, 2) };                 // squaring sharpens the lean without ever zeroing a style
  });
  let r = rand() * scored.reduce((a, x) => a + x.w, 0), style = scored[scored.length - 1].k;
  for (const x of scored) { if ((r -= x.w) <= 0) { style = x.k; break; } }
  const why = sig.n ? ['fast', 'slow', 'short', 'long', 'money', 'place', 'sky', 'talk'].filter(k => sig[k] > .5).concat(sig.night ? ['night'] : []) : ['no lyrics'];
  return { style, reason: why.join(' + ') || 'balanced', signals: sig };
}

module.exports = { pickStyle, signals, TRAITS };
