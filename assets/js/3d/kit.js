/**
 * HCLabs 3D scene kit — the logo's design language as reusable three.js builders.
 *
 *   import { createKit, COLORS, ease } from '../kit.js';
 *   export default async function create(ctx) {
 *     const kit = createKit(ctx);              // bound to this canvas: tier-aware, auto-disposed
 *     await kit.ready;                          // fonts loaded (only needed before drawing text)
 *     kit.environment();                        // soft brand PMREM environment (built once per renderer)
 *     const mark = kit.archMark({ height: 2 }); // the logo as an object
 *     ctx.scene.add(mark.group);
 *     return { update(ctx) { kit.updateFloaters(ctx.time); } };
 *   }
 *
 * Every builder returns plain three.js objects (Mesh / Group / InstancedMesh / Points) plus a few
 * helpers. Nothing allocates per frame. See README.md for the full API.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

export { THREE };

/* ================================================================================================
 * Palette (sRGB hex from the logo → linear THREE.Color via ColorManagement)
 * ============================================================================================== */

export const HEX = Object.freeze({
  navy: '#1A2842', navyDeep: '#131F36', navyInk: '#0E1628', navySoft: '#24344F', navyLine: '#4A5B78',
  cream: '#F8F2EA', paper: '#F1E9DF', sand: '#E3D5C4',
  sage: '#A3BDB9', sageBrand: '#86A09D', sageShape: '#93AFAB', sageDeep: '#5F807C',
  terracotta: '#DE9F7C', terracottaShape: '#D8997A', clay: '#B97A5C',
  shadow: '#0A1120',
});

/** Linear-space brand colours. Treat as read-only; use color(name) for a mutable copy. */
export const COLORS = Object.freeze(Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, new THREE.Color().setStyle(v, THREE.SRGBColorSpace)]),
));

/** Brand name | '#hex' | 0xhex | THREE.Color → new linear THREE.Color. */
export function color(c) {
  if (c && c.isColor) return c.clone();
  if (typeof c === 'number') return new THREE.Color().setHex(c, THREE.SRGBColorSpace);
  if (HEX[c]) return COLORS[c].clone();
  return new THREE.Color().setStyle(String(c), THREE.SRGBColorSpace);
}
/** CSS string for a brand colour (for canvas drawing). */
const css = (c, a = 1) => {
  const hex = HEX[c] || c;
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ================================================================================================
 * Math, easing, randomness
 * ============================================================================================== */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapRange = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing. */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
/** Progress of a window [a,b] within a 0..1 timeline, clamped. */
export const segment = (t, a, b) => clamp01((t - a) / (b - a));

export const ease = Object.freeze({
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
});

/** Deterministic PRNG (mulberry32) → () => [0,1). Same seed ⇒ same layout ⇒ stable screenshots. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ================================================================================================
 * Camera framing helpers
 * ============================================================================================== */

/** World-space visible height/width of a perspective camera at `distance`. */
export function visibleHeight(camera, distance) { return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance; }
export function visibleWidth(camera, distance) { return visibleHeight(camera, distance) * camera.aspect; }

/**
 * Off-axis framing: move what the camera looks at to NDC (ndcX, ndcY) without perspective skew
 * (e.g. ndcX = 0.35 puts the subject right of centre, leaving space for a left-hand headline).
 */
export function shiftView(camera, ndcX, ndcY, width, height) {
  if (!ndcX && !ndcY) { camera.clearViewOffset(); return; }
  camera.setViewOffset(width, height, (-ndcX * width) / 2, (ndcY * height) / 2, width, height);
}

/* ================================================================================================
 * Fonts (canvas text needs the real faces loaded first)
 * ============================================================================================== */

const FONT_DIR = new URL('../../fonts/', import.meta.url);
const FONT_FACES = [
  ['Plus Jakarta Sans', 'PlusJakartaSans-var.woff2', { weight: '200 800', style: 'normal' }],
  ['Instrument Serif', 'InstrumentSerif-italic.woff2', { weight: '400', style: 'italic' }],
  ['Instrument Serif', 'InstrumentSerif-regular.woff2', { weight: '400', style: 'normal' }],
];
export const FONT_SANS = '"Plus Jakarta Sans", system-ui, sans-serif';
export const FONT_SERIF = '"Instrument Serif", Georgia, serif';
let _fonts = null;
/** Resolves once Plus Jakarta Sans + Instrument Serif are usable by canvas (registers them if the page CSS hasn't). */
export function ensureFonts() {
  if (_fonts) return _fonts;
  _fonts = (async () => {
    if (!document.fonts) return;
    const has = (family, style) => {
      let ok = false;
      document.fonts.forEach((f) => { if (f.family.replace(/["']/g, '') === family && f.style === style) ok = true; });
      return ok;
    };
    for (const [family, file, desc] of FONT_FACES) {
      if (!has(family, desc.style)) {
        try { document.fonts.add(new FontFace(family, `url(${new URL(file, FONT_DIR).href}) format("woff2")`, desc)); } catch (e) { /* ignore */ }
      }
    }
    const loads = Promise.all([
      document.fonts.load(`800 64px ${FONT_SANS}`), document.fonts.load(`700 64px ${FONT_SANS}`),
      document.fonts.load(`600 24px ${FONT_SANS}`), document.fonts.load(`italic 400 64px ${FONT_SERIF}`),
    ]).catch(() => {});
    await Promise.race([loads, new Promise((r) => setTimeout(r, 3000))]);
  })();
  return _fonts;
}

/* ================================================================================================
 * Shapes (logo geometry, y-up, base on y = 0)
 * ============================================================================================== */

// Note: never lineTo() an arc's start point before absarc(): sin(π) ≈ 1e-16 leaves a near-duplicate
// vertex whose bevel direction is garbage (a visible notch). absarc() adds the exact joining line itself.

/** The logo's arch ring ("∩" band) as a single closed contour. Logo units: 52 × 56, band 10. */
export function archRingShape({ width = 52, height = 56, thickness = 10, bottom = 0 } = {}) {
  const R = width / 2, r = R - thickness, cy = height - R;
  const s = new THREE.Shape();
  s.moveTo(-R, bottom);
  s.lineTo(-r, bottom);
  s.absarc(0, cy, r, Math.PI, 0, true);   // up the inner left leg, over the inner arch
  s.lineTo(r, bottom);
  s.lineTo(R, bottom);
  s.absarc(0, cy, R, 0, Math.PI, false);  // up the outer right leg, over the outer arch
  s.closePath();
  return s;
}

/** A solid arch (semicircle on vertical sides). `height` is the top above y = 0; `bottom` may be negative. */
export function archShape({ width = 2, height = 2, bottom = 0 } = {}) {
  const R = width / 2, cy = height - R;
  const s = new THREE.Shape();
  s.moveTo(-R, bottom);
  s.lineTo(R, bottom);
  s.absarc(0, cy, R, 0, Math.PI, false);
  s.closePath();
  return s;
}

/** Rounded rectangle centred on the origin. */
export function roundRectShape(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const x = -w / 2, y = -h / 2, s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** ExtrudeGeometry centred on z with the bevel kept INSIDE the contour (proportions stay true). */
export function extrude(shape, { depth = 1, bevel = 0.1, bevelSegments = 3, curveSegments = 24 } = {}) {
  const b = Math.min(bevel, depth * 0.49);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, depth - 2 * b), curveSegments, steps: 1,
    bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments,
  });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  g.computeBoundingSphere();
  return g;
}

/**
 * Soffits and side walls of an extruded form take a darker, warmer value than its front face (vertex colours),
 * so the doorway reads as a deep, clean opening instead of one flat cream value that notches at the shoulder.
 * The bevel's front half keeps the face value, which leaves a crisp light edge on the silhouette.
 * `far` is the multiplier at full shade (a THREE.Color, linear); `wall` / `down` weight side walls / downward faces.
 */
export function shadeWalls(geo, far, { wall = 0.55, down = 0.45, up = -0.08 } = {}) {
  const n = geo.attributes.normal, cnt = n.count;
  const col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const nz = Math.abs(n.getZ(i)), ny = n.getY(i);
    const w = 1 - smoothstep(0.32, 0.82, nz);
    const k = clamp01(w * (wall + down * Math.max(0, -ny) + up * Math.max(0, ny)));
    col[i * 3] = 1 + (far.r - 1) * k;
    col[i * 3 + 1] = 1 + (far.g - 1) * k;
    col[i * 3 + 2] = 1 + (far.b - 1) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* ================================================================================================
 * Canvas drawing (document faces, labels, shadows)
 * ============================================================================================== */

const ceilPow2 = (v) => Math.pow(2, Math.ceil(Math.log2(Math.max(1, v))));

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** The mark drawn in 2D (logo units 52×56, top-left origin), for document faces. */
function drawMark2D(g, x, y, h, cream, sage, terra) {
  const s = h / 56;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = cream;
  g.beginPath();
  g.moveTo(0, 56); g.lineTo(0, 26); g.arc(26, 26, 26, Math.PI, 0); g.lineTo(52, 56); g.lineTo(42, 56); g.lineTo(42, 26);
  g.arc(26, 26, 16, 0, Math.PI, true); g.lineTo(10, 56); g.closePath(); g.fill();
  g.fillStyle = sage; g.beginPath(); g.moveTo(14, 56); g.lineTo(14, 50); g.arc(26, 50, 12, Math.PI, 0); g.lineTo(38, 56); g.closePath(); g.fill();
  g.fillStyle = terra; g.beginPath(); g.arc(26, 27, 6, 0, Math.PI * 2); g.fill();
  g.restore();
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function setTracking(g, px) { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; }

/** Document face themes. */
const FACE_THEMES = {
  paper: { bg: HEX.paper, ink: HEX.navy, muted: css('navy', 0.13), kicker: HEX.sageDeep, accent: HEX.clay, num: HEX.clay, rule: HEX.terracotta, markCream: HEX.navy, field: css('navy', 0.16) },
  cream: { bg: HEX.cream, ink: HEX.navy, muted: css('navy', 0.12), kicker: HEX.sageDeep, accent: HEX.clay, num: HEX.clay, rule: HEX.terracotta, markCream: HEX.navy, field: css('navy', 0.15) },
  dark:  { bg: HEX.navySoft, ink: HEX.cream, muted: css('cream', 0.16), kicker: HEX.sage, accent: HEX.terracotta, num: HEX.terracotta, rule: HEX.terracotta, markCream: HEX.cream, field: css('cream', 0.2) },
  glass: { bg: null, ink: HEX.cream, muted: css('cream', 0.26), kicker: HEX.sage, accent: HEX.terracotta, num: HEX.terracotta, rule: HEX.terracotta, markCream: HEX.cream, field: css('cream', 0.3) },
};

/**
 * Draw an editorial "document" face into a 2D context sized W×H design px.
 * face: { number, kicker, title, variant: 'text'|'form'|'checklist'|'cover', lines, seed, mark, align }
 */
export function drawDocumentFace(g, W, H, face = {}, theme = 'paper', radius = 36) {
  const T = FACE_THEMES[theme] || FACE_THEMES.paper;
  const R = rng(face.seed ?? 7);
  const M = Math.round(W * 0.095);
  g.clearRect(0, 0, W, H);
  if (T.bg) { g.fillStyle = T.bg; rrect(g, 0, 0, W, H, radius); g.fill(); }
  else if (face.sheen !== 0) {
    // lit frosted glass: a soft diagonal sheen, brightest top-left
    const s = face.sheen ?? 1;
    const gr = g.createLinearGradient(0, 0, W * 0.9, H);
    gr.addColorStop(0, css('cream', 0.2 * s)); gr.addColorStop(0.4, css('cream', 0.06 * s)); gr.addColorStop(1, css('cream', 0.0));
    g.fillStyle = gr; rrect(g, 0, 0, W, H, radius); g.fill();
    // light-catching inner edge, bright at the top-left, fading around the card
    const lw = Math.max(1.5, W * 0.004);
    const eg = g.createLinearGradient(0, 0, W, H);
    eg.addColorStop(0, css('cream', 0.55 * s)); eg.addColorStop(0.35, css('cream', 0.14 * s)); eg.addColorStop(0.7, css('cream', 0.06 * s)); eg.addColorStop(1, css('cream', 0.2 * s));
    g.strokeStyle = eg; g.lineWidth = lw; rrect(g, lw, lw, W - 2 * lw, H - 2 * lw, Math.max(0, radius - lw)); g.stroke();
  }
  g.textBaseline = 'alphabetic';

  // header: mark + kicker
  let y = M;
  if (face.mark !== false) drawMark2D(g, M, y, W * 0.058, T.markCream, HEX.sage, HEX.terracotta);
  if (face.kicker) {
    g.fillStyle = T.kicker;
    g.font = `650 ${Math.round(W * 0.03)}px ${FONT_SANS}`;
    setTracking(g, W * 0.0045);
    g.fillText(String(face.kicker).toUpperCase(), M + (face.mark !== false ? W * 0.082 : 0), y + W * 0.047);
    setTracking(g, 0);
  }
  // number (serif italic numeral)
  if (face.number) {
    g.fillStyle = T.num;
    g.font = `italic 400 ${Math.round(W * 0.2)}px ${FONT_SERIF}`;
    g.textAlign = 'right';
    g.fillText(String(face.number), W - M, y + W * 0.17);
    g.textAlign = 'left';
  }
  // title
  y = face.number ? M + W * 0.36 : M + W * 0.24;
  if (face.title) {
    const size = Math.round(W * (face.titleScale || 0.085));
    g.fillStyle = T.ink;
    g.font = `750 ${size}px ${FONT_SANS}`;
    setTracking(g, -size * 0.022);
    const lines = wrap(g, face.title, W - 2 * M).slice(0, 4);
    for (const l of lines) { g.fillText(l, M, y); y += size * 1.1; }
    setTracking(g, 0);
    y += size * 0.25;
  }
  const variant = face.variant || 'text';
  if (variant === 'cover') {
    // a branded cover (no faux body copy): one terracotta swoosh under the title, like the logo's flowing line
    g.strokeStyle = T.rule; g.lineCap = 'round'; g.lineWidth = Math.max(2.5, W * 0.009);
    const x0 = M, y0 = y + W * 0.03, sw = W * 0.5;
    g.beginPath();
    g.moveTo(x0, y0 + W * 0.02);
    g.bezierCurveTo(x0 + sw * 0.3, y0 + W * 0.04, x0 + sw * 0.62, y0 + W * 0.03, x0 + sw, y0 - W * 0.012);
    g.stroke();
    g.fillStyle = T.rule;
    g.beginPath(); g.arc(x0 + sw, y0 - W * 0.012, Math.max(3, W * 0.013), 0, Math.PI * 2); g.fill();
    y += W * 0.1;
  } else {
    // accent rule
    g.fillStyle = T.rule;
    rrect(g, M, y, W * 0.11, Math.max(3, W * 0.008), W * 0.004); g.fill();
    y += W * 0.075;
  }

  const bottom = H - M;
  const barH = Math.max(4, W * 0.017), gap = W * 0.041;
  if (variant === 'form') {
    const rows = face.lines ?? 4;
    for (let i = 0; i < rows && y + W * 0.13 < bottom; i++) {
      g.fillStyle = T.muted; rrect(g, M, y, W * (0.22 + R() * 0.12), barH * 0.8, barH / 2); g.fill();
      y += W * 0.035;
      g.strokeStyle = T.field; g.lineWidth = Math.max(1.5, W * 0.004);
      rrect(g, M, y, W - 2 * M, W * 0.075, W * 0.018); g.stroke();
      y += W * 0.12;
    }
  } else if (variant === 'checklist') {
    const rows = face.lines ?? 5;
    for (let i = 0; i < rows && y + gap < bottom; i++) {
      const r0 = W * 0.022;
      g.strokeStyle = i < (face.checked ?? 3) ? T.accent : T.field; g.lineWidth = Math.max(1.5, W * 0.0045);
      g.beginPath(); g.arc(M + r0, y + r0 * 0.6, r0, 0, Math.PI * 2); g.stroke();
      if (i < (face.checked ?? 3)) {
        g.beginPath(); g.moveTo(M + r0 * 0.55, y + r0 * 0.65); g.lineTo(M + r0 * 0.9, y + r0); g.lineTo(M + r0 * 1.5, y + r0 * 0.15); g.stroke();
      }
      g.fillStyle = T.muted; rrect(g, M + W * 0.08, y + r0 * 0.6 - barH / 2, (W - 2 * M - W * 0.08) * (0.55 + R() * 0.4), barH, barH / 2); g.fill();
      y += gap * 1.55;
    }
  } else if (variant !== 'cover') {
    const rows = face.lines ?? 8;
    for (let i = 0; i < rows && y + barH < bottom; i++) {
      const para = i > 0 && i % 4 === 3;
      const w = para ? 0.35 + R() * 0.25 : 0.78 + R() * 0.22;
      g.fillStyle = T.muted; rrect(g, M, y, (W - 2 * M) * w, barH, barH / 2); g.fill();
      y += para ? gap * 1.7 : gap;
    }
  }
  if (face.footer) {
    g.fillStyle = T.kicker;
    g.font = `600 ${Math.round(W * 0.026)}px ${FONT_SANS}`;
    setTracking(g, W * 0.002);
    g.fillText(face.footer, M, H - M * 0.8);
    setTracking(g, 0);
  }
}

/** Soft blurred silhouette (for "paper layer" shadows) drawn with the shadowBlur trick (works everywhere). */
function drawShadowSilhouette(g, S, shape, aspect, blurPx, pad) {
  const w = S - 2 * pad, h = (S - 2 * pad);
  const off = 10000;
  g.clearRect(0, 0, S, S);
  g.save();
  g.shadowColor = '#fff';
  g.shadowBlur = blurPx;
  g.shadowOffsetX = off;
  g.fillStyle = '#fff';
  g.translate(-off, 0);
  g.beginPath();
  if (shape === 'circle' || shape === 'ellipse') {
    g.ellipse(S / 2, S / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'arch') {
    // arch in a w×h box (x from pad, top from pad); radius = w/2
    const r = w / 2;
    g.moveTo(pad, pad + h); g.lineTo(pad, pad + r); g.arc(pad + r, pad + r, r, Math.PI, 0); g.lineTo(pad + w, pad + h); g.closePath();
  } else {
    const rad = shape === 'rect' ? 0 : Math.min(w, h) * 0.08;
    rrect(g, pad, pad, w, h, rad);
  }
  g.fill();
  g.restore();
}

/* ================================================================================================
 * Shaders
 * ============================================================================================== */

const PARTICLE_VERT = /* glsl */`
uniform float uTime;
uniform float uSize;
uniform float uScale;
uniform float uDrift;
uniform float uFadeNear;
uniform float uFadeFar;
attribute float aSeed;
attribute float aSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  float t = uTime + aSeed * 43.0;
  p.x += sin(t * 0.31 + aSeed * 11.0) * uDrift;
  p.y += sin(t * 0.23 + aSeed * 17.0) * uDrift * 0.8 + sin(t * 0.07) * uDrift * 0.3;
  p.z += cos(t * 0.19 + aSeed * 5.0) * uDrift * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = max(1.0, uSize * aSize * uScale / d);
  vAlpha = (1.0 - smoothstep(uFadeNear, uFadeFar, d)) * (0.55 + 0.45 * sin(t * 0.9 + aSeed * 30.0));
}`;

const PARTICLE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c)) * uOpacity * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

// Full-screen quad at the far plane; only writes colour inside the transmission pass (see glass()).
const BACKDROP_VERT = /* glsl */`void main(){ gl_Position = vec4(position.xy * 2.0, 0.99999, 1.0); }`;
const BACKDROP_FRAG = /* glsl */`uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }`;

/** Adds a view-angle fresnel rim (brighter + more opaque at grazing angles) to a standard material. */
function addFresnel(mat, { rimColor, power = 2.4, strength = 0.5, edgeAlpha = 0.45 }) {
  const u = {
    uRimColor: { value: rimColor }, uRimPower: { value: power },
    uRimStrength: { value: strength }, uEdgeAlpha: { value: edgeAlpha },
  };
  mat.userData.fresnel = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\nuniform float uEdgeAlpha;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  float hcF = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), uRimPower);
  gl_FragColor.rgb += uRimColor * hcF * uRimStrength;
  gl_FragColor.a = mix(gl_FragColor.a, 1.0, hcF * uEdgeAlpha);`);
  };
  mat.customProgramCacheKey = () => 'hc-fresnel';
  return mat;
}

/* ================================================================================================
 * Environment (built once per renderer)
 * ============================================================================================== */

const _env = new WeakMap();

/**
 * Soft studio PMREM from three's RoomEnvironment, re-lit in brand tones: navy walls, warm cream
 * soft-boxes from the front/top/left, a sage-tinted box from the right. Cached per renderer.
 */
export function brandEnvironment(renderer, { tint = true, sigma = 0.04 } = {}) {
  const hit = _env.get(renderer);
  if (hit) { hit.users++; return hit.rt.texture; }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  if (tint) {
    const warm = color('#FFF3E6'), cool = color('#DCEBE8');
    room.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.isMeshBasicMaterial) {
        const k = m.color.r;
        m.color.copy(o.position.x > 10 ? cool : warm).multiplyScalar(k);
      } else if (m.side === THREE.BackSide) {
        m.color.copy(COLORS.navySoft).lerp(COLORS.sand, 0.12);
      } else {
        m.color.copy(COLORS.navy);
      }
    });
  }
  const rt = pmrem.fromScene(room, sigma);
  room.dispose();
  pmrem.dispose();
  _env.set(renderer, { rt, users: 1 });
  return rt.texture;
}
function releaseEnvironment(renderer) {
  const hit = _env.get(renderer);
  if (!hit) return;
  if (--hit.users <= 0) { hit.rt.dispose(); _env.delete(renderer); }
}

/* ================================================================================================
 * Layout generators (for node networks)
 * ============================================================================================== */

export const layouts = {
  /**
   * Organic constellation: `count` nodes in an ellipsoid, each linked to its k nearest neighbours.
   * → { nodes: [{p:[x,y,z], r, color}], links: [[i,j]] }
   */
  constellation({ count = 24, radius = [3, 2, 1.5], center = [0, 0, 0], seed = 3, k = 2, minDist = 0.35, size = [0.03, 0.075], palette = ['cream', 'sage', 'sage', 'cream', 'terracotta'], reject = null } = {}) {
    const R = rng(seed), nodes = [];
    let guard = 0;
    while (nodes.length < count && guard++ < count * 60) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.cbrt(R());
      const s = Math.sqrt(1 - u * u);
      const p = [center[0] + radius[0] * rr * s * Math.cos(th), center[1] + radius[1] * rr * u, center[2] + radius[2] * rr * s * Math.sin(th)];
      if ((reject && reject(p)) || nodes.some((n) => Math.hypot(n.p[0] - p[0], n.p[1] - p[1], n.p[2] - p[2]) < minDist)) continue;
      nodes.push({ p, r: lerp(size[0], size[1], Math.pow(R(), 2)), color: palette[Math.floor(R() * palette.length)] });
    }
    return { nodes, links: nearestLinks(nodes, k) };
  },
  /**
   * Organisational chart: levels = nodes per tier (top → bottom), each linked to the nearest
   * node in the tier above. Great for the About "organisational structure" scene.
   */
  orgChart({ levels = [1, 3, 6], width = 4, height = 3, depth = 0.8, seed = 5, jitter = 0.12, size = [0.11, 0.05], palette = ['terracotta', 'sage', 'cream'] } = {}) {
    const R = rng(seed), nodes = [], links = [], tiers = [];
    levels.forEach((n, li) => {
      const y = height / 2 - (li / Math.max(1, levels.length - 1)) * height;
      const tier = [];
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -width / 2 + (i / (n - 1)) * width;
        const z = (R() * 2 - 1) * depth * (li / levels.length);
        tier.push(nodes.length);
        nodes.push({ p: [x + (R() * 2 - 1) * jitter, y + (R() * 2 - 1) * jitter, z], r: lerp(size[0], size[1], li / Math.max(1, levels.length - 1)), color: palette[Math.min(li, palette.length - 1)], level: li });
      }
      if (li > 0) {
        for (const ci of tier) {
          let best = -1, bd = Infinity;
          for (const pi of tiers[li - 1]) { const d = Math.abs(nodes[pi].p[0] - nodes[ci].p[0]); if (d < bd) { bd = d; best = pi; } }
          links.push([best, ci]);
        }
      }
      tiers.push(tier);
    });
    return { nodes, links, tiers };
  },
  /**
   * Ecosystem ring: a hub (index 0) with `count` satellites on a tilted ring, linked to the hub
   * and to their neighbours. Satellite i is node i + 1 (e.g. the 9 services).
   */
  ring({ count = 9, radius = 2.2, tilt = 0.35, hub = true, hubSize = 0.16, size = 0.075, neighbours = true, palette = ['sage', 'cream'], hubColor = 'terracotta', phase = -Math.PI / 2 } = {}) {
    const nodes = [], links = [];
    if (hub) nodes.push({ p: [0, 0, 0], r: hubSize, color: hubColor, hub: true });
    const off = hub ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * Math.PI * 2;
      nodes.push({ p: [Math.cos(a) * radius, Math.sin(a) * radius * Math.cos(tilt), Math.sin(a) * radius * Math.sin(tilt)], r: size, color: palette[i % palette.length] });
      if (hub) links.push([0, i + off]);
      if (neighbours) links.push([i + off, ((i + 1) % count) + off]);
    }
    return { nodes, links };
  },
};

function nearestLinks(nodes, k) {
  const links = [], seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const d = [];
    for (let j = 0; j < nodes.length; j++) if (j !== i) {
      const a = nodes[i].p, b = nodes[j].p;
      d.push([Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), j]);
    }
    d.sort((x, y) => x[0] - y[0]);
    for (let n = 0; n < Math.min(k, d.length); n++) {
      const j = d[n][1], key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) { seen.add(key); links.push([i, j]); }
    }
  }
  return links;
}

/* ================================================================================================
 * createKit(ctx) — builders bound to one mounted scene
 * ============================================================================================== */

const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _c = new THREE.Color();

export function createKit(ctx) {
  const { renderer, scene } = ctx;
  const q = ctx.quality;
  const tier = q.tier;
  const high = tier === 'high', low = tier === 'low';
  const seg = (n) => Math.max(6, Math.round(n * q.segmentScale));
  const owned = new Set();
  const own = (o) => { owned.add(o); return o; };
  const matCache = new Map();
  const geoCache = new Map();
  const texCache = new Map();
  const floaters = [];
  let backdrop = null;
  let envTex = null;

  const kit = {
    ctx, THREE, COLORS, HEX, tier, quality: q, ease, rng, layouts,
    /** Resolves when brand fonts are ready for canvas text. */
    ready: ensureFonts(),

    /* ---- environment & lights --------------------------------------------------------------- */

    /** Assign the soft brand environment to the scene. intensity ≈ 0.3–0.8. */
    environment({ intensity = 0.55, tint = true } = {}) {
      if (!envTex) envTex = brandEnvironment(renderer, { tint });
      scene.environment = envTex;
      scene.environmentIntensity = intensity;
      return envTex;
    },

    /**
     * Premium soft lighting: warm key (follows the pointer gently), cool rim from behind, navy/cream
     * hemisphere fill. Returns { key, rim, fill, update(ctx) }.
     */
    lights({ key = 2.4, rim = 1.6, fill = 0.35, keyPos = [-4, 5, 7], rimPos = [5, 2.5, -6], follow = [2.5, 1.6], target = [0, 0, 0], glow = 0, glowPos = [0, 0.6, 4.5], glowFollow = [3.5, 2.4], glowColor = '#FFF5EC', keyColor = '#FFFBF6', rimColor = '#E6F1EF' } = {}) {
      const g = new THREE.Group();
      const k = new THREE.DirectionalLight(color(keyColor), key);
      k.position.set(...keyPos);
      const r = new THREE.DirectionalLight(color(rimColor), rim);
      r.position.set(...rimPos);
      const h = new THREE.HemisphereLight(COLORS.cream, COLORS.navyDeep, fill);
      const t = new THREE.Object3D(); t.position.set(...target);
      k.target = t; r.target = t;
      g.add(k, r, h, t);
      // Optional soft point light near the viewer: its falloff paints gentle gradients across flat
      // faces (discs, arch fronts) and it drifts with the cursor — "light follows the pointer".
      let p = null;
      if (glow > 0) {
        p = new THREE.PointLight(color(glowColor), glow, 0, 2);
        p.position.set(...glowPos);
        g.add(p);
      }
      const base = new THREE.Vector3(...keyPos);
      const pb = new THREE.Vector3(...glowPos);
      return {
        group: g, key: k, rim: r, fill: h, point: p,
        update(c) {
          k.position.set(base.x + c.pointer.x * follow[0], base.y + c.pointer.y * follow[1], base.z);
          if (p) p.position.set(pb.x + c.pointer.x * glowFollow[0], pb.y + c.pointer.y * glowFollow[1], pb.z);
        },
      };
    },

    /* ---- materials (cached per kit) ---------------------------------------------------------- */

    /** Matte "clay" (arch, figure, disc, line). Sheen on the high tier for a soft velvet edge. */
    clay(c = 'cream', { roughness = 0.62, sheen = high ? 0.35 : 0, emissive = 0, envMapIntensity = 1, vertexColors = false } = {}) {
      const key = `clay|${c}|${roughness}|${sheen}|${emissive}|${envMapIntensity}|${vertexColors}`;
      if (matCache.has(key)) return matCache.get(key);
      const col = color(c);
      const params = { color: col, roughness, metalness: 0, envMapIntensity, vertexColors };
      if (emissive) { params.emissive = col.clone(); params.emissiveIntensity = emissive; }
      const m = sheen
        ? new THREE.MeshPhysicalMaterial({ ...params, sheen, sheenRoughness: 0.7, sheenColor: color('cream').multiplyScalar(0.6) })
        : new THREE.MeshStandardMaterial(params);
      matCache.set(key, own(m));
      return m;
    },

    /** Matte paper for document cards. */
    paper(c = 'paper', { roughness = 0.82 } = {}) {
      const key = `paper|${c}|${roughness}`;
      if (matCache.has(key)) return matCache.get(key);
      const m = own(new THREE.MeshStandardMaterial({ color: color(c), roughness, metalness: 0 }));
      matCache.set(key, m);
      return m;
    },

    /**
     * Premium translucent glass. High tier: MeshPhysicalMaterial transmission (frosted refraction of
     * whatever is behind). Other tiers: a cheap convincing alternative — transparent standard
     * material + fresnel rim/edge opacity + environment reflections.
     * opts: { tint, roughness, opacity (cheap), thickness, transmission (force true/false), rim }
     */
    glass({ tint = '#EEF4F2', roughness = 0.32, opacity = 0.08, thickness = 0.3, transmission = q.transmission, rim = 0.5, frost = 0.022, frostColor = 'sage', ground = 'navy' } = {}) {
      const key = `glass|${tint}|${roughness}|${opacity}|${thickness}|${transmission}|${rim}|${frost}|${frostColor}`;
      if (matCache.has(key)) return matCache.get(key);
      let m;
      if (transmission) {
        kit.transmissionBackdrop(ground);
        m = new THREE.MeshPhysicalMaterial({
          color: color(tint), roughness, metalness: 0, transmission: 1, thickness, ior: 1.3,
          specularIntensity: 0.35, envMapIntensity: 0.8,
          clearcoat: 0.45, clearcoatRoughness: 0.42, // satin skin over a frosted body (broad, soft highlights)
          emissive: color(frostColor), emissiveIntensity: frost, // faint tinted frost so panels hold over navy
        });
        // Linear output keeps the transmitted navy identical to the CSS ground behind the canvas.
        m.toneMapped = false;
        addFresnel(m, { rimColor: color('cream'), power: 3.2, strength: rim * 0.6, edgeAlpha: 0 });
      } else {
        m = new THREE.MeshStandardMaterial({
          color: color(tint), roughness: Math.min(roughness, 0.26), metalness: 0, transparent: true, opacity,
          depthWrite: false, envMapIntensity: 1.3, side: THREE.FrontSide,
          emissive: color(frostColor), emissiveIntensity: frost * 2.4,
        });
        addFresnel(m, { rimColor: color('cream'), power: 2.6, strength: rim * 0.8, edgeAlpha: 0.55 });
      }
      matCache.set(key, own(m));
      return m;
    },

    /**
     * Transmission renders the scene's opaque objects into an offscreen target that three clears to
     * white@50% on a transparent canvas (milky glass). This far-plane quad writes the ground colour
     * into that pass only (colorWrite off in the visible pass), so glass reads correctly on navy.
     */
    transmissionBackdrop(ground = 'navy') {
      if (backdrop) return backdrop;
      const mat = own(new THREE.ShaderMaterial({
        uniforms: { uColor: { value: color(ground) } }, vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG,
        depthWrite: false, depthTest: true, toneMapped: false,
      }));
      backdrop = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), mat);
      backdrop.frustumCulled = false;
      backdrop.renderOrder = -1000;
      backdrop.onBeforeRender = (r) => { mat.colorWrite = r.getRenderTarget() !== null; };
      scene.add(backdrop);
      return backdrop;
    },

    /* ---- the logo as objects ----------------------------------------------------------------- */

    /**
     * The doorway ARCH mark + FIGURE (terracotta head sphere, sage shoulder arch) = the logo as an object.
     * opts: { height (world units, default 2), depth (logo units, 11), figure (true), anchor: 'center'|'base',
     *         colors: { arch, head, body }, thickness (band, logo units 10) }
     * → { group, arch, head, body, width, height, unit }
     */
    archMark({ height = 2, depth = 11, thickness = 10, figure = true, anchor = 'center', colors = {}, roughness = 0.58 } = {}) {
      const s = height / 56;
      const group = new THREE.Group();
      const inner = new THREE.Group();
      inner.scale.setScalar(s);
      inner.position.y = anchor === 'center' ? -28 * s : 0;
      group.add(inner);
      // crisp front bevel (≈1.2 logo units, ≥4 segments) + soffit/wall shading toward sand
      const archGeo = own(extrude(archRingShape({ thickness }), { depth, bevel: 1.2, bevelSegments: Math.max(4, seg(5)), curveSegments: seg(48) }));
      const archCol = color(colors.arch || 'cream');
      const sandK = color('sand');
      shadeWalls(archGeo, new THREE.Color(sandK.r / archCol.r * 0.97, sandK.g / archCol.g * 0.96, sandK.b / archCol.b * 0.95), { wall: 0.62, down: 0.38 });
      const arch = new THREE.Mesh(archGeo, kit.clay(colors.arch || 'cream', { roughness: roughness + 0.04, vertexColors: true }));
      inner.add(arch);
      let head = null, body = null;
      if (figure) {
        const bodyGeo = own(extrude(archShape({ width: 24, height: 18 }), { depth: depth * 0.62, bevel: 1.2, bevelSegments: Math.max(4, seg(4)), curveSegments: seg(32) }));
        shadeWalls(bodyGeo, new THREE.Color(0.8, 0.82, 0.82), { wall: 0.5, down: 0.3 });
        body = new THREE.Mesh(bodyGeo, kit.clay(colors.body || 'sage', { roughness, vertexColors: true }));
        const headGeo = own(new THREE.SphereGeometry(6, seg(48), seg(32)));
        head = new THREE.Mesh(headGeo, kit.clay(colors.head || 'terracotta', { roughness: roughness - 0.04 }));
        head.position.set(0, 29, 0);
        inner.add(body, head);
      }
      return { group, inner, arch, head, body, width: 52 * s, height, unit: s };
    },

    /** Terracotta DISC with a soft rounded edge, facing +Z. opts: { radius, thickness, color } */
    disc({ radius = 1, thickness = 0.14, color: c = 'terracottaShape', roughness = 0.66, emissive = 0 } = {}) {
      const e = thickness / 2, pts = [];
      pts.push(new THREE.Vector2(0, -e));
      const arc = seg(10);
      for (let i = 0; i <= arc; i++) {
        const a = -Math.PI / 2 + (i / arc) * Math.PI;
        pts.push(new THREE.Vector2(radius - e + Math.cos(a) * e, Math.sin(a) * e));
      }
      pts.push(new THREE.Vector2(0, e));
      const g = own(new THREE.LatheGeometry(pts, seg(112)));
      g.rotateX(Math.PI / 2);
      return new THREE.Mesh(g, kit.clay(c, { roughness, emissive }));
    },

    /**
     * SAGE ARCH with a CREAM RIM rising from an edge (the brand's layered form). The cream frame sits
     * behind; the sage panel is inset by `rim` and stands slightly proud (paper layers).
     * opts: { width, height (top above y=0), below (extension below y=0), rim, depth, colors: {rim, fill} }
     */
    rimmedArch({ width = 2.4, height = 2.6, below = 3, rim = 0.14, depth = 0.16, colors = {}, emissive = 0 } = {}) {
      const group = new THREE.Group();
      const back = new THREE.Mesh(
        own(extrude(archShape({ width, height, bottom: -below }), { depth, bevel: Math.min(0.05, rim * 0.4), bevelSegments: seg(3), curveSegments: seg(56) })),
        kit.clay(colors.rim || 'paper', { roughness: 0.7, emissive }),
      );
      const fd = depth * 0.7;
      const fill = new THREE.Mesh(
        own(extrude(archShape({ width: width - 2 * rim, height: height - rim, bottom: -below }), { depth: fd, bevel: Math.min(0.04, rim * 0.3), bevelSegments: seg(3), curveSegments: seg(56) })),
        kit.clay(colors.fill || 'sageShape', { roughness: 0.68, emissive }),
      );
      fill.position.z = depth / 2 - fd / 2 + depth * 0.22;
      group.add(back, fill);
      return { group, rim: back, fill };
    },

    /**
     * The flowing terracotta LINE: a tube along a smooth centripetal Catmull-Rom curve, tapered at the
     * ends, with optional animated draw (setProgress 0..1 — uses drawRange, no rebuild).
     * opts: { points: [[x,y,z]...], radius, color, taper: [start, end] (fractions), tubularSegments, emissive }
     */
    flowLine({ points, radius = 0.022, color: c = 'terracotta', taper = [0.12, 0.08], tubularSegments = 420, radialSegments = 10, emissive = 0.22, tip = true } = {}) {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal');
      const T = seg(tubularSegments), Rs = Math.max(6, Math.round(radialSegments * (low ? 0.7 : 1)));
      const g = own(new THREE.TubeGeometry(curve, T, radius, Rs, false));
      // taper: pull each ring toward the curve near the ends
      const pos = g.attributes.position;
      const ringLen = Rs + 1;
      for (let i = 0; i <= T; i++) {
        const u = i / T;
        let f = 1;
        if (taper[0] > 0 && u < taper[0]) f = ease.outSine(u / taper[0]);
        if (taper[1] > 0 && u > 1 - taper[1]) f = Math.min(f, ease.outSine((1 - u) / taper[1]));
        f = Math.max(0.04, f);
        if (f >= 1) continue;
        curve.getPointAt(u, _v3);
        for (let j = 0; j < ringLen; j++) {
          const idx = i * ringLen + j;
          pos.setXYZ(idx, _v3.x + (pos.getX(idx) - _v3.x) * f, _v3.y + (pos.getY(idx) - _v3.y) * f, _v3.z + (pos.getZ(idx) - _v3.z) * f);
        }
      }
      pos.needsUpdate = true;
      const mat = kit.clay(c, { roughness: 0.5, emissive, sheen: 0 });
      const mesh = new THREE.Mesh(g, mat);
      const group = new THREE.Group();
      group.add(mesh);
      let tipMesh = null;
      if (tip) {
        tipMesh = new THREE.Mesh(own(new THREE.SphereGeometry(radius, 12, 8)), mat);
        tipMesh.visible = false;
        group.add(tipMesh);
      }
      const perSeg = Rs * 6;
      const api = {
        group, mesh, curve, tip: tipMesh, progress: 1,
        /** 0..1 draw-on (only the visible part is rasterised). */
        setProgress(p) {
          p = clamp01(p);
          api.progress = p;
          const n = Math.round(p * T);
          g.setDrawRange(0, n >= T ? Infinity : n * perSeg);
          if (tipMesh) {
            tipMesh.visible = p > 0.001 && p < 0.999;
            if (tipMesh.visible) { curve.getPointAt(p, tipMesh.position); }
          }
        },
      };
      return api;
    },

    /* ---- documents & text ------------------------------------------------------------------- */

    /**
     * Crisp canvas texture (power-of-two, mipmapped, anisotropic, premultiplied alpha).
     * draw(g, W, H) draws in design px (W×H keep the object's aspect); the canvas is pow2 and the
     * drawing is scaled non-uniformly into it so glyphs land undistorted on the mesh.
     */
    canvasTexture(W, H, draw, { maxSize = q.textureSize, key } = {}) {
      if (key && texCache.has(key)) return texCache.get(key);
      const aspect = W / H;
      let th = maxSize, tw = Math.min(maxSize, ceilPow2(maxSize * aspect));
      if (aspect > 1) { tw = maxSize; th = Math.min(maxSize, ceilPow2(maxSize / aspect)); }
      const cv = makeCanvas(tw, th), g = cv.getContext('2d');
      g.setTransform(tw / W, 0, 0, th / H, 0, 0);
      draw(g, W, H);
      const t = own(new THREE.CanvasTexture(cv));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = q.maxAnisotropy || 1;
      t.premultiplyAlpha = true;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.userData.redraw = (fn = draw) => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, tw, th); g.setTransform(tw / W, 0, 0, th / H, 0, 0); fn(g, W, H); t.needsUpdate = true; };
      if (key) texCache.set(key, t);
      return t;
    },

    /**
     * Rounded DOCUMENT CARD / panel with a crisp text face.
     * opts: { width, height, depth, radius, style: 'paper'|'cream'|'dark'|'glass', material (override body),
     *         face: { number, kicker, title, variant: 'text'|'form'|'checklist'|'cover', lines, seed, footer } | null,
     *         glass: {...glass opts} }
     * → { group, body, face, texture, width, height, redraw(face) }
     * Group.renderOrder can be set by the scene (glass panels sort as a unit).
     */
    card({ width = 1, height = 1.414, depth = 0.028, radius = 0.06, style = 'paper', material = null, face = null, glass = {}, textureSize = q.textureSize } = {}) {
      const gkey = `card|${width}|${height}|${depth}|${radius}`;
      let geo = geoCache.get(gkey);
      if (!geo) {
        geo = own(extrude(roundRectShape(width, height, radius), { depth, bevel: Math.min(depth * 0.45, 0.018), bevelSegments: seg(3), curveSegments: seg(8) }));
        geoCache.set(gkey, geo);
      }
      const isGlass = style === 'glass';
      const bodyMat = material || (isGlass ? kit.glass(glass) : kit.paper(style === 'dark' ? 'navySoft' : style === 'cream' ? 'cream' : 'paper'));
      const body = new THREE.Mesh(geo, bodyMat);
      const group = new THREE.Group();
      group.add(body);
      let faceMesh = null, texture = null;
      const inset = Math.min(depth * 0.45, 0.018);
      const fw = width - inset * 2, fh = height - inset * 2;
      const W = 600, H = Math.round(600 * (fh / fw));
      const rad = (radius - inset) / fw * W;
      const drawFace = (f) => (g) => drawDocumentFace(g, W, H, f, style, rad);
      if (face) {
        texture = kit.canvasTexture(W, H, drawFace(face), { maxSize: textureSize });
        const pkey = `plane|${fw}|${fh}`;
        let pg = geoCache.get(pkey);
        if (!pg) { pg = own(new THREE.PlaneGeometry(fw, fh)); geoCache.set(pkey, pg); }
        const fm = isGlass
          ? own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false, color: color('#ffffff').multiplyScalar(0.92) }))
          : own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0, alphaTest: 0.5, alphaToCoverage: !!q.antialias, premultipliedAlpha: true }));
        faceMesh = new THREE.Mesh(pg, fm);
        // Sits just proud of the body so back-to-front sorting always draws it after its own glass.
        faceMesh.position.z = depth / 2 + 0.0015;
        group.add(faceMesh);
      }
      return {
        group, body, face: faceMesh, texture, width, height,
        redraw(f) { if (texture) { texture.userData.redraw(drawFace(f)); ctx.invalidate(); } },
      };
    },

    /**
     * Flat typographic plane ("floating typography"): { text, height (world, cap-ish), font: 'sans'|'serif',
     * weight, italic, color, tracking (em) }. → Mesh (anchored centre).
     */
    textPlane({ text, height = 0.3, font = 'sans', weight = 750, italic = font === 'serif', color: c = 'cream', tracking = -0.02, opacity = 1 } = {}) {
      const px = 256, fam = font === 'serif' ? FONT_SERIF : FONT_SANS;
      const probe = makeCanvas(8, 8).getContext('2d');
      probe.font = `${italic ? 'italic ' : ''}${weight} ${px}px ${fam}`;
      setTracking(probe, tracking * px);
      const w = Math.ceil(probe.measureText(text).width + px * 0.3), h = Math.ceil(px * 1.35);
      const tex = kit.canvasTexture(w, h, (g) => {
        g.font = probe.font; setTracking(g, tracking * px);
        g.fillStyle = css(c); g.textBaseline = 'middle'; g.fillText(text, px * 0.15, h * 0.54);
      }, { maxSize: Math.min(2048, q.textureSize * 2) });
      const aspect = w / h;
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(height * aspect * 1.35, height * 1.35)),
        own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, premultipliedAlpha: true, depthWrite: false, opacity, toneMapped: false })));
      return m;
    },

    /* ---- people / organisation --------------------------------------------------------------- */

    /**
     * Instanced NODE NETWORK: spheres (one draw call) + connecting lines (one draw call).
     * opts: { nodes: [{p:[x,y,z], r, color}], links: [[i,j]], lineColor, lineOpacity, detail, roughness, emissive }
     * → { group, mesh, lines, count, base, pos, scale, update(), setPosition(i,x,y,z), setScale(i,s),
     *     setColor(i,c), drift(time, amp, speed), nodes, links }
     */
    network({ nodes, links = [], lineColor = 'sage', lineOpacity = 0.32, detail = low ? 1 : 2, roughness = 0.6, emissive = 0.12, shading = 'lit', hideBehindGlass = shading === 'flat', showNodes = true } = {}) {
      const n = nodes.length;
      const geo = own(new THREE.IcosahedronGeometry(1, shading === 'flat' ? 1 : detail));
      // 'lit': soft clay spheres (hoverable ecosystems). 'flat': crisp unlit brand dots (constellations).
      const mat = own(shading === 'flat'
        ? new THREE.MeshBasicMaterial({ color: 0xffffff })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0, emissive: color('cream').multiplyScalar(0.25), emissiveIntensity: emissive }));
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const base = new Float32Array(n * 3), pos = new Float32Array(n * 3), scale = new Float32Array(n), mult = new Float32Array(n).fill(1);
      nodes.forEach((nd, i) => {
        base[i * 3] = pos[i * 3] = nd.p[0]; base[i * 3 + 1] = pos[i * 3 + 1] = nd.p[1]; base[i * 3 + 2] = pos[i * 3 + 2] = nd.p[2];
        scale[i] = nd.r ?? 0.05;
        mesh.setColorAt(i, color(nd.color || 'cream'));
      });
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      const lp = new Float32Array(Math.max(1, links.length) * 6);
      const lg = own(new THREE.BufferGeometry());
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage));
      const lm = own(new THREE.LineBasicMaterial({ color: color(lineColor), transparent: true, opacity: lineOpacity, depthWrite: false }));
      const lines = new THREE.LineSegments(lg, lm);
      lines.frustumCulled = false;
      mesh.frustumCulled = false;
      if (hideBehindGlass) {
        // Tiny bright dots magnify into blobs behind frosted transmission glass; keep them out of
        // the transmission pass (they still draw normally everywhere else).
        mesh.onBeforeRender = (r) => { const main = r.getRenderTarget() === null; mat.colorWrite = main; mat.depthWrite = main; };
      }
      const group = new THREE.Group();
      group.add(lines, mesh);
      mesh.visible = showNodes; // showNodes:false → links only (e.g. joining kit.people figures)
      const api = {
        group, mesh, lines, count: n, base, pos, scale, mult, nodes, links,
        setPosition(i, x, y, z) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; },
        setScale(i, s) { mult[i] = s; },
        setColor(i, c) { mesh.setColorAt(i, c.isColor ? c : _c.copy(COLORS[c] || color(c))); mesh.instanceColor.needsUpdate = true; },
        /** Gentle organic drift around the base layout (no allocation). */
        drift(time, amp = 0.06, speed = 0.35) {
          for (let i = 0; i < n; i++) {
            const k = i * 1.618;
            pos[i * 3] = base[i * 3] + Math.sin(time * speed + k * 2.1) * amp;
            pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * speed * 0.8 + k * 3.7) * amp;
            pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * speed * 0.6 + k * 1.3) * amp * 0.6;
          }
        },
        /** Push pos/scale into the instance matrices and line buffer. */
        update() {
          for (let i = 0; i < n; i++) {
            const s = scale[i] * mult[i];
            _m4.makeScale(s, s, s).setPosition(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            mesh.setMatrixAt(i, _m4);
          }
          mesh.instanceMatrix.needsUpdate = true;
          for (let l = 0; l < links.length; l++) {
            const a = links[l][0] * 3, b = links[l][1] * 3, o = l * 6;
            lp[o] = pos[a]; lp[o + 1] = pos[a + 1]; lp[o + 2] = pos[a + 2];
            lp[o + 3] = pos[b]; lp[o + 4] = pos[b + 1]; lp[o + 5] = pos[b + 2];
          }
          lg.attributes.position.needsUpdate = true;
        },
      };
      api.update();
      mesh.computeBoundingSphere();
      return api;
    },

    /**
     * A standalone FIGURE (the logo's person: terracotta head sphere + sage shoulder arch), base on y = 0.
     * opts: { height (world, default 0.6), colors: { head, body }, depth (logo units, 7) } → { group, head, body, height }
     */
    figure({ height = 0.6, colors = {}, depth = 7, roughness = 0.58 } = {}) {
      const s = height / 35;
      const group = new THREE.Group();
      const inner = new THREE.Group();
      inner.scale.setScalar(s);
      group.add(inner);
      const bodyGeo = geoCache.get(`fig-body|${depth}`) || own(extrude(archShape({ width: 24, height: 18 }), { depth, bevel: 1.4, bevelSegments: seg(4), curveSegments: seg(28) }));
      geoCache.set(`fig-body|${depth}`, bodyGeo);
      const headGeo = geoCache.get('fig-head') || own(new THREE.SphereGeometry(6, seg(40), seg(28)));
      geoCache.set('fig-head', headGeo);
      const body = new THREE.Mesh(bodyGeo, kit.clay(colors.body || 'sage', { roughness }));
      const head = new THREE.Mesh(headGeo, kit.clay(colors.head || 'terracotta', { roughness: roughness - 0.04 }));
      head.position.y = 29;
      inner.add(body, head);
      return { group, head, body, height };
    },

    /**
     * PEOPLE: many figures in two instanced draw calls (heads + bodies). Ideal for organisation
     * charts, teams, "growing your team" motifs. Pair with network({ showNodes: false }) for links.
     * items: [{ p: [x,y,z] (base point), height, ry (turn), head, body (brand colour names) }]
     * → { group, heads, bodies, count, pos, height, ry, mult, setPosition(i,x,y,z), setScale(i,s),
     *     setColors(i, head, body), update() }
     */
    people({ items, height = 0.5, depth = 7, roughness = 0.58 } = {}) {
      const n = items.length;
      const bodyGeo = geoCache.get(`fig-body|${depth}`) || own(extrude(archShape({ width: 24, height: 18 }), { depth, bevel: 1.4, bevelSegments: seg(4), curveSegments: seg(28) }));
      geoCache.set(`fig-body|${depth}`, bodyGeo);
      const headGeo = geoCache.get('fig-head-lo') || own(new THREE.SphereGeometry(6, seg(28), seg(20)));
      geoCache.set('fig-head-lo', headGeo);
      const mat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0 }));
      const bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
      const heads = new THREE.InstancedMesh(headGeo, mat, n);
      const pos = new Float32Array(n * 3), h = new Float32Array(n), ry = new Float32Array(n), mult = new Float32Array(n).fill(1);
      items.forEach((it, i) => {
        pos[i * 3] = it.p[0]; pos[i * 3 + 1] = it.p[1]; pos[i * 3 + 2] = it.p[2];
        h[i] = (it.height ?? height) / 35; ry[i] = it.ry ?? 0;
        bodies.setColorAt(i, COLORS[it.body || 'sage'] || color(it.body));
        heads.setColorAt(i, COLORS[it.head || 'terracotta'] || color(it.head));
      });
      bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bodies.frustumCulled = false; heads.frustumCulled = false;
      const group = new THREE.Group();
      group.add(bodies, heads);
      const q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
      const api = {
        group, heads, bodies, count: n, pos, height: h, ry, mult,
        setPosition(i, x, y, z) { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; },
        setScale(i, s) { mult[i] = s; },
        setColors(i, head, body) {
          if (head) { heads.setColorAt(i, head.isColor ? head : COLORS[head] || color(head)); heads.instanceColor.needsUpdate = true; }
          if (body) { bodies.setColorAt(i, body.isColor ? body : COLORS[body] || color(body)); bodies.instanceColor.needsUpdate = true; }
        },
        update() {
          for (let i = 0; i < n; i++) {
            const s = h[i] * mult[i];
            q4.setFromAxisAngle(up, ry[i]);
            sc.set(s, s, s);
            p3.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            _m4.compose(p3, q4, sc); bodies.setMatrixAt(i, _m4);
            p3.y += 29 * s;
            _m4.compose(p3, q4, sc); heads.setMatrixAt(i, _m4);
          }
          bodies.instanceMatrix.needsUpdate = true;
          heads.instanceMatrix.needsUpdate = true;
        },
      };
      api.update();
      return api;
    },

    /* ---- atmosphere --------------------------------------------------------------------------- */

    /**
     * Fine PARTICLES (one Points draw call, drift animated on the GPU). Count scales with tier.
     * opts: { count (at high tier), box: [w,h,d], center, size (world diameter), color, opacity, drift, fade: [near, far], seed }
     * → Points with .update(ctx) (sets time + pixel scale).
     */
    particles({ count = 500, box = [14, 8, 8], center = [0, 0, -1], size = 0.03, color: c = 'cream', opacity = 0.55, drift = 0.18, speed = 1, fade = [6, 26], seed = 11 } = {}) {
      const n = Math.max(12, Math.round(count * q.particleScale));
      const R = rng(seed);
      const p = new Float32Array(n * 3), sd = new Float32Array(n), sz = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        p[i * 3] = center[0] + (R() - 0.5) * box[0];
        p[i * 3 + 1] = center[1] + (R() - 0.5) * box[1];
        p[i * 3 + 2] = center[2] + (R() - 0.5) * box[2];
        sd[i] = R();
        sz[i] = 0.45 + Math.pow(R(), 3) * 1.4;
      }
      const g = own(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      const m = own(new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uSize: { value: size }, uScale: { value: 400 }, uDrift: { value: drift },
          uColor: { value: color(c) }, uOpacity: { value: opacity }, uFadeNear: { value: fade[0] }, uFadeFar: { value: fade[1] },
        },
        vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
        transparent: true, depthWrite: false,
      }));
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      pts.update = (c2) => {
        m.uniforms.uTime.value = c2.time * speed;
        const cam = c2.camera;
        m.uniforms.uScale.value = (c2.size.height * c2.size.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 30) / 2));
      };
      return pts;
    },

    /**
     * Soft "paper layer" shadow: a blurred silhouette texture on a plane (no shadow maps).
     * opts: { shape: 'circle'|'ellipse'|'arch'|'roundRect'|'rect', width, height, blur (0..0.5 of size), opacity, color }
     * The shape's footprint is width×height; the plane is larger to hold the blur.
     */
    softShadow({ shape = 'ellipse', width = 1, height = 1, blur = 0.12, opacity = 0.5, color: c = 'shadow' } = {}) {
      const S = low ? 128 : 256;
      const padF = Math.min(0.45, blur * 2.2);
      const key = `shadow|${shape}|${padF.toFixed(3)}|${S}`;
      let tex = texCache.get(key);
      if (!tex) {
        const pad = Math.round(S * padF / (1 + 2 * padF));
        const cv = makeCanvas(S, S), g = cv.getContext('2d');
        drawShadowSilhouette(g, S, shape, 1, pad * 0.75, pad);
        tex = own(new THREE.CanvasTexture(cv));
        tex.premultiplyAlpha = true;
        texCache.set(key, tex);
      }
      const mat = own(new THREE.MeshBasicMaterial({ map: tex, color: color(c), transparent: true, opacity, depthWrite: false, toneMapped: false, premultipliedAlpha: true }));
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(width * (1 + 2 * padF), height * (1 + 2 * padF))), mat);
      m.renderOrder = -1;
      return m;
    },

    /* ---- motion helpers ---------------------------------------------------------------------- */

    /**
     * Register gentle idle float for an object (its current transform is the rest pose).
     * opts: { amp (world), speed, rot (radians), phase }
     */
    floater(obj, { amp = 0.05, speed = 0.4, rot = 0.03, phase = floaters.length * 1.7 } = {}) {
      floaters.push({ obj, amp, speed, rot, phase, p: obj.position.clone(), r: obj.rotation.clone() });
      return obj;
    },
    /** Apply all floats for `time` (seconds). Pass the same time when settled for a stable pose. */
    updateFloaters(time, strength = 1) {
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i], t = time * f.speed + f.phase, o = f.obj;
        o.position.set(f.p.x + Math.sin(t * 0.9) * f.amp * 0.35 * strength, f.p.y + Math.sin(t) * f.amp * strength, f.p.z + Math.cos(t * 0.7) * f.amp * 0.25 * strength);
        o.rotation.set(f.r.x + Math.sin(t * 0.8) * f.rot * strength, f.r.y + Math.cos(t * 0.6) * f.rot * strength, f.r.z + Math.sin(t * 0.5) * f.rot * 0.5 * strength);
      }
    },
    /** Update a floater's rest pose after moving the object deliberately. */
    setRest(obj) { const f = floaters.find((x) => x.obj === obj); if (f) { f.p.copy(obj.position); f.r.copy(obj.rotation); } },

    /**
     * Intro progress helper: 0→1 eased over [delay, delay+duration] seconds of scene time;
     * returns 1 immediately when settled (reduced motion / ?shot=1).
     */
    intro(delay = 0, duration = 1.2, fn = ease.outExpo) {
      if (ctx.settled || ctx.static) return 1;
      return fn(clamp01((ctx.time - delay) / duration));
    },

    /** Pointer parallax: ease `obj` rotation toward the smoothed pointer. opts: { rx, ry, x, y } */
    parallax(obj, { rx = 0.06, ry = 0.12, x = 0, y = 0, base = null } = {}) {
      const b = base || { rx: obj.rotation.x, ry: obj.rotation.y, x: obj.position.x, y: obj.position.y };
      return {
        base: b,
        update(c) {
          obj.rotation.x = b.rx - c.pointer.y * rx;
          obj.rotation.y = b.ry + c.pointer.x * ry;
          if (x) obj.position.x = b.x + c.pointer.x * x;
          if (y) obj.position.y = b.y + c.pointer.y * y;
        },
      };
    },

    /**
     * Hover picking against meshes / instanced meshes using the canvas-local pointer.
     * Raycasts only when the pointer has moved (or every `every` frames while the scene animates),
     * otherwise returns the previous hit — hover costs nothing while the cursor rests.
     * → { pick() → { object, instanceId, point, distance } | null }
     */
    picker(objects, { every = 8 } = {}) {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const hits = [];
      const list = Array.isArray(objects) ? objects : [objects];
      let lx = NaN, ly = NaN, lastFrame = -1e9, last = null;
      return {
        pick() {
          const p = ctx.pointer;
          if (!p.inside) { last = null; lx = NaN; return null; }
          if (p.clientX === lx && p.clientY === ly && ctx.frame - lastFrame < every) return last;
          lx = p.clientX; ly = p.clientY; lastFrame = ctx.frame;
          ndc.set(p.local.x, p.local.y);
          ray.setFromCamera(ndc, ctx.camera);
          hits.length = 0;
          ray.intersectObjects(list, true, hits);
          last = hits.length ? hits[0] : null;
          return last;
        },
      };
    },

    /**
     * Document STACK for "collection" scenes (e.g. the Starter Pack): cards morph between a neat
     * cascade (every card's header visible, like a file stack) and a fanned arc, with one value.
     * items: [{ number, title, kicker, variant, lines }]
     * opts: { width, height, depth, style, cascade: [dx, dy, dz] per card, spreadX, arc, fanAngle, face (defaults), shadow }
     * → { group, cards, layout(spread 0..1, focus index | -1, dt) } — call layout() every frame
     *   (focus eases in/out with dt; pass dt = 1 to snap).
     */
    stack(items, { width = 1, height = 1.414, depth = 0.028, style = 'paper', cascade = [0.0, 0.21, -0.24], spreadX = 1.12, arc = 0.32, fanAngle = 0.1, face = {}, shadow = true } = {}) {
      const group = new THREE.Group();
      const n = items.length;
      const cards = items.map((it, i) => {
        const cd = kit.card({ width, height, depth, style, face: { kicker: 'HR Starter Pack', seed: i + 3, ...face, ...it } });
        cd.index = i;
        cd.focus = 0;
        const holder = new THREE.Group();
        holder.add(cd.group);
        if (shadow) {
          const sh = kit.softShadow({ shape: 'roundRect', width, height, blur: 0.08, opacity: 0.38 });
          sh.position.set(0.04, -0.07, -depth * 2.5);
          holder.add(sh);
          cd.shadow = sh;
        }
        cd.holder = holder;
        group.add(holder);
        return cd;
      });
      return {
        group, cards,
        layout(spread = 0, focus = -1, dt = 1) {
          const s = ease.inOutCubic(clamp01(spread));
          for (let i = 0; i < n; i++) {
            const c = cards[i], k = i - (n - 1) / 2;
            c.focus = dt >= 1 ? (i === focus ? 1 : 0) : damp(c.focus, i === focus ? 1 : 0, 9, dt);
            // cascade: card 0 at the front, each later card one step back and up (its header peeks out)
            const cx = cascade[0] * i, cy = cascade[1] * (i - (n - 1) / 2), cz = cascade[2] * i;
            // fan: an arc facing the viewer
            const fx = k * spreadX, fy = -Math.abs(k) * 0.035 * spreadX, fz = -Math.abs(k) * Math.abs(k) * arc * 0.18;
            c.holder.position.set(lerp(cx, fx, s), lerp(cy, fy, s) + c.focus * 0.16, lerp(cz, fz, s) + c.focus * 0.3);
            c.holder.rotation.set(lerp(-0.08, 0, s), -k * fanAngle * s, lerp(0, -k * 0.018, s));
          }
        },
      };
    },

    /** Release one kit-built object early (e.g. a line rebuilt on resize): disposes its geometries and detaches it. */
    release(obj) {
      if (!obj) return;
      obj.traverse?.((o) => { if (o.geometry) { o.geometry.dispose(); owned.delete(o.geometry); for (const [k, g] of geoCache) if (g === o.geometry) geoCache.delete(k); } });
      obj.parent?.remove(obj);
    },

    /** Release everything this kit created (called automatically on teardown). */
    dispose() {
      for (const o of owned) { try { o.dispose?.(); } catch (e) { /* ignore */ } }
      owned.clear(); matCache.clear(); geoCache.clear(); texCache.clear(); floaters.length = 0;
      if (backdrop) { scene.remove(backdrop); backdrop = null; }
      if (envTex) { if (scene.environment === envTex) scene.environment = null; releaseEnvironment(renderer); envTex = null; }
    },
  };
  ctx.onDispose(() => kit.dispose());
  return kit;
}
