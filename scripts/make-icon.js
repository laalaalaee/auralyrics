'use strict';
// Draws the Auralyrics app icon (a twin-colour glow ring on a dark tile) and writes build/icon.ico.
// Run it again after changing the drawing:  node scripts/make-icon.js
// Optional: node scripts/make-icon.js some/where/preview.png  also writes a 256 px PNG to look at.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PINK = [0xff, 0x3d, 0x81], BLUE = [0x4d, 0x7c, 0xff], TILE = [0x0d, 0x0d, 0x16];
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 4;                                   // samples per axis per pixel, for smooth edges

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// colour and alpha (0..1) of the icon at (x, y), both in 0..1
function sample(x, y) {
  // rounded tile
  const r = 0.22, dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  const inTile = Math.hypot(dx, dy) <= r;
  if (!inTile) return [0, 0, 0, 0];
  let col = mix(TILE, [0x1a, 0x14, 0x2e], (x + y) / 2);          // faint violet lift towards the corner
  const d = Math.hypot(x - 0.5, y - 0.5), ring = 0.285, half = 0.052;
  const g = mix(PINK, BLUE, Math.min(1, Math.max(0, (x - y) * 0.9 + 0.5)));   // pink top-left, blue bottom-right
  const halo = Math.exp(-Math.pow(Math.max(Math.abs(d - ring) - half, 0) / 0.07, 1.4)) * 0.45;
  col = mix(col, g, halo);
  const solid = 1 - smooth(half - 0.004, half + 0.004, Math.abs(d - ring));
  col = mix(col, g, solid);
  const dot = 1 - smooth(0.075 - 0.004, 0.075 + 0.004, d);
  col = mix(col, mix(g, [255, 255, 255], 0.35), dot);
  return [col[0], col[1], col[2], 1];
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let pxl = 0; pxl < size; pxl++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const [cr, cg, cb, ca] = sample((pxl + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
      r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
    }
    const i = (py * size + pxl) * 4, n = SS * SS;
    px[i] = a ? Math.round(r / a) : 0; px[i + 1] = a ? Math.round(g / a) : 0; px[i + 2] = a ? Math.round(b / a) : 0; px[i + 3] = Math.round(255 * a / n);
  }
  return px;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function ico(images) {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12); offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...dir, ...images.map(i => i.data)]);
}

const images = SIZES.map(size => ({ size, data: png(size, render(size)) }));
const out = path.join(__dirname, '..', 'build', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico(images));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
if (process.argv[2]) { fs.writeFileSync(process.argv[2], images[images.length - 1].data); console.log('preview', process.argv[2]); }
