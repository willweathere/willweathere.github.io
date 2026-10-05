/**
 * HR Starter Pack — "get your HR foundations in place" (owned by /hr-starter-pack/).
 *
 * The seven items begin as a neat cascade (the pack) standing inside the empty outline of the HCLabs doorway.
 * As the page scrolls, each item rises, turns to face you (its own micro-animation plays), then is set into its
 * place in the doorway. When all seven are in place the doorway is complete and the person rises inside it: the
 * logo, built from the pack.
 *
 * Every item is its own object with its own micro-animation:
 *   01 Employee Handbook — a bound book; the cover opens on its spine
 *   02 Essential HR Policies — a set of sheets that fans out
 *   03 Disciplinary & Grievance Procedures — three step tabs slide out in order
 *   04 Absence Management Documentation — a clipboard calendar; a marker moves to the next day
 *   05 Family Leave Policies — two figures in a doorway; the little one grows and the grown-up turns to it
 *   06 Manager Guidance Documents — the terracotta line draws the path to the goal
 *   07 HR Templates and Forms — a pad of forms; the top form lifts away to reveal the next
 * Faces are drawn in canvas from the same drawings as the page's SVG illustrations (×5), never fake copy.
 *
 * sceneOptions (getters are read live):
 *   layout: 'story' | 'story-stacked' | 'static' | 'static-stacked'
 *   heroFloor: 0..1 — (story-stacked) viewport fraction where the hero copy ends; the doorway waits below it
 *   t: initial progress (0 = the pack, 1..7 = item presented, 8 = the doorway complete)
 * api: setProgress(t), setHover(source, index), select(index), pick(clientX, clientY) → index, count
 * Budget (high tier): ≈ 41 draw calls, ≈ 30k triangles, 9 face textures (1024², 512² on low).
 */
import { createKit, COLORS, HEX, ease, clamp01, lerp, damp, segment, shiftView, FONT_SANS, FONT_SERIF, roundRectShape, archShape, extrude } from '../kit.js';

export const DOCS = [
  { n: '01', title: 'Employee Handbook', kind: 'book', depth: 0.15, tone: 'creamBright' },
  { n: '02', title: 'Essential HR Policies', kind: 'policies', depth: 0.028, tone: 'paper' },
  { n: '03', title: 'Disciplinary & Grievance Procedures', kind: 'steps', depth: 0.05, tone: 'creamBright' },
  { n: '04', title: 'Absence Management Documentation', kind: 'calendar', depth: 0.07, tone: 'sand' },
  { n: '05', title: 'Family Leave Policies', kind: 'family', depth: 0.04, tone: 'paper' },
  { n: '06', title: 'Manager Guidance Documents', kind: 'guide', depth: 0.06, tone: 'creamBright' },
  { n: '07', title: 'HR Templates and Forms', kind: 'forms', depth: 0.03, tone: 'paper' },
];
const N = DOCS.length;
const W = 1, L = 1.414;               // A-series document
const RC = 2.1, LEG = 3.0;            // doorway centreline: the logo's proportions (band = one document wide)
const TARGET_Y = 2.75;

/* ---------------------------------------------------------------------------------------------- canvas faces */
const DW = 600, DH = 848, M = 52;
const FACE_BG = { creamBright: '#FCF8F2', paper: HEX.paper, sand: HEX.sand };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const NAVY = HEX.navy;
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const track = (g, px) => { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; };
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
/** Arch-topped shape (SVG units ×5): from (x0, yb) up to yt, semicircle, down to (x1, yb). */
function archPath(g, x0, x1, yt, yb) {
  const r = (x1 - x0) / 2;
  g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, yt); g.arc(x0 + r, yt, r, Math.PI, 0); g.lineTo(x1, yb); g.closePath();
}
function drawMark(g, x, y, h, frame = NAVY) {
  const s = h / 56;
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = frame;
  g.beginPath(); g.moveTo(0, 56); g.lineTo(0, 26); g.arc(26, 26, 26, Math.PI, 0); g.lineTo(52, 56); g.lineTo(42, 56); g.lineTo(42, 26);
  g.arc(26, 26, 16, 0, Math.PI, true); g.lineTo(10, 56); g.closePath(); g.fill();
  g.fillStyle = HEX.sage; archPath(g, 14, 38, 50, 56); g.fill();
  g.fillStyle = HEX.terracotta; g.beginPath(); g.arc(26, 27, 6, 0, Math.PI * 2); g.fill();
  g.restore();
}
function bar(g, x0, x1, y, w, a = 0.16) { g.strokeStyle = rgba(NAVY, a); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }

function faceBase(g, d, radius, x0 = M) {
  g.clearRect(0, 0, DW, DH);
  g.fillStyle = FACE_BG[d.tone]; rr(g, 0, 0, DW, DH, radius); g.fill();
  const sh = g.createLinearGradient(0, 0, DW * 0.4, DH);          // paper catching the light, top-left
  sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, rgba(NAVY, 0.035));
  g.fillStyle = sh; rr(g, 0, 0, DW, DH, radius); g.fill();
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  // numeral + title (the part of the face that peeks out of the cascade)
  g.fillStyle = HEX.clay;
  g.font = `italic 400 128px ${FONT_SERIF}`;
  g.fillText(d.n, x0 - 6, 150);
  const tx = x0 + g.measureText(d.n).width + 16;
  g.font = `720 33px ${FONT_SANS}`; track(g, -0.7);
  const lines = wrap(g, d.title, DW - M - 54 - tx).slice(0, 3);
  const lh = 38;
  let y = 116 - ((lines.length - 1) * lh) / 2;
  g.fillStyle = NAVY;
  for (const l of lines) { g.fillText(l, tx, y); y += lh; }
  track(g, 0);
  drawMark(g, DW - M - 38, 44, 42);
  g.fillStyle = rgba(NAVY, 0.1); g.fillRect(x0, 197, DW - M - x0, 2);
  g.fillStyle = HEX.terracotta; rr(g, x0, 194, 74, 7, 3.5); g.fill();
  // footer
  g.font = `650 17px ${FONT_SANS}`; track(g, 3.2); g.fillStyle = HEX.sageDeep;
  g.fillText('HR STARTER PACK', x0, DH - 50);
  track(g, 0.4); g.font = `600 17px ${FONT_SANS}`; g.fillStyle = rgba(NAVY, 0.42); g.textAlign = 'right';
  g.fillText(`${d.n} / 07`, DW - M, DH - 50);
  g.textAlign = 'left'; track(g, 0);
}

const ILLUSTRATE = {
  book(g) { /* the inner first page (revealed when the cover opens) */
    const rows = [[270, 0.92], [305, 0.86], [340, 0.9], [375, 0.55], [440, 0.9], [475, 0.94], [510, 0.8], [545, 0.62], [610, 0.88], [645, 0.9], [680, 0.48]];
    for (const [y, w] of rows) bar(g, M, M + (DW - 2 * M) * w, y, 13, 0.14);
  },
  cover(g, radius) { /* the cover: a sage spine band, the doorway and the person inside */
    g.save(); rr(g, 0, 0, DW, DH, radius); g.clip();
    g.fillStyle = HEX.sageShape; g.fillRect(0, 0, 66, DH);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(58, 0, 3, DH);
    g.restore();
    g.fillStyle = NAVY; archPath(g, 190, 470, 480, 730); g.fill();
    g.fillStyle = HEX.sage; archPath(g, 260, 400, 690, 730); g.fill();
    g.fillStyle = HEX.terracotta; g.beginPath(); g.arc(330, 570, 35, 0, Math.PI * 2); g.fill();
    g.strokeStyle = HEX.terracotta; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(110, 790); g.bezierCurveTo(230, 810, 400, 800, 540, 750); g.stroke();
  },
  endpaper(g, radius) { /* the inside of the cover (seen as it opens): sage endpaper, a quiet field of doorways, a bookplate */
    g.clearRect(0, 0, DW, DH);
    g.fillStyle = HEX.sage; rr(g, 0, 0, DW, DH, radius); g.fill();
    g.save(); rr(g, 0, 0, DW, DH, radius); g.clip();
    const sh = g.createLinearGradient(DW, 0, DW * 0.35, DH);
    sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(1, rgba(NAVY, 0.06));
    g.fillStyle = sh; g.fillRect(0, 0, DW, DH);
    g.strokeStyle = rgba(HEX.cream, 0.34); g.lineWidth = 4;
    for (let r = 0, y = 26; y < DH; r++, y += 92) {
      for (let x = (r % 2 ? 72 : 30); x < DW; x += 84) { archPath(g, x - 17, x + 17, y + 17, y + 54); g.stroke(); }
    }
    g.restore();
    g.fillStyle = '#FCF8F2'; rr(g, 140, 292, 320, 264, 20); g.fill();
    g.strokeStyle = rgba(NAVY, 0.1); g.lineWidth = 2; rr(g, 154, 306, 292, 236, 13); g.stroke();
    drawMark(g, 274, 332, 56);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = HEX.clay; g.font = `italic 400 92px ${FONT_SERIF}`; g.fillText('01', 300, 478);
    g.font = `650 16px ${FONT_SANS}`; track(g, 3.4); g.fillStyle = HEX.sageDeep; g.fillText('HR STARTER PACK', 300, 518);
    track(g, 0); g.textAlign = 'left';
  },
  policies(g) {
    g.fillStyle = HEX.sage;
    for (const y of [330, 420, 510]) { g.beginPath(); g.arc(90, y, 27.5, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = NAVY; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const y of [330, 420, 510]) { g.beginPath(); g.moveTo(76.5, y + 1); g.lineTo(86.5, y + 11); g.lineTo(104.5, y - 9); g.stroke(); }
    g.strokeStyle = rgba(NAVY, 0.28); g.lineWidth = 6;
    for (const y of [600, 690]) { g.beginPath(); g.arc(90, y, 25, 0, Math.PI * 2); g.stroke(); }
    [[330, 505], [420, 445], [510, 525], [600, 405], [690, 475]].forEach(([y, x1]) => bar(g, 155, x1, y, 22));
  },
  steps(g) {
    g.strokeStyle = HEX.clay; g.lineWidth = 7; g.setLineDash([10, 15]); g.lineCap = 'round';
    g.beginPath(); g.moveTo(100, 400); g.lineTo(100, 470); g.moveTo(100, 560); g.lineTo(100, 630); g.stroke(); g.setLineDash([]);
    [[340, HEX.terracotta], [500, HEX.sage], [660, HEX.sand]].forEach(([y, c], j) => {
      g.fillStyle = c; archPath(g, 55, 145, y, y + 60); g.fill();
      g.fillStyle = NAVY; g.font = `750 44px ${FONT_SANS}`; g.textAlign = 'center'; g.fillText(String(j + 1), 100, y + 45); g.textAlign = 'left';
    });
    [[340, 495], [380, 415], [500, 525], [540, 395], [660, 475], [700, 355]].forEach(([y, x1]) => bar(g, 185, x1, y, 20));
  },
  calendar(g) {
    g.fillStyle = rgba(NAVY, 0.1); rr(g, 55, 275, 490, 55, 17); g.fill();
    const marked = new Set(['2,0', '3,0', '4,0', '3,1']);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) {
      if ((r === 4 && c > 2) || (r === 2 && c === 5)) continue;   // month end · the marked day (ring below)
      g.fillStyle = marked.has(`${c},${r}`) ? HEX.sageShape : rgba(NAVY, 0.08);
      rr(g, 65 + c * 70, 365 + r * 70, 50, 50, 12); g.fill();
    }
    g.strokeStyle = HEX.terracotta; g.lineWidth = 8; rr(g, 419, 509, 42, 42, 10); g.stroke();
  },
  family(g) {
    g.fillStyle = rgba(HEX.sage, 0.32); archPath(g, 130, 470, 460, 730); g.fill();
    g.strokeStyle = HEX.sageShape; g.lineWidth = 7; archPath(g, 130, 470, 460, 730); g.stroke();
    g.strokeStyle = rgba(NAVY, 0.18); g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(80, 730); g.lineTo(520, 730); g.stroke();
  },
  guide(g) {
    g.strokeStyle = rgba(NAVY, 0.22); g.lineWidth = 8; g.setLineDash([10, 20]); g.lineCap = 'round';
    g.beginPath(); g.moveTo(130, 660); g.bezierCurveTo(200, 620, 210, 510, 300, 480); g.bezierCurveTo(390, 450, 460, 420, 480, 330); g.stroke(); g.setLineDash([]);
    g.strokeStyle = HEX.terracotta; g.lineWidth = 8; g.beginPath(); g.arc(480, 330, 37, 0, Math.PI * 2); g.stroke();
    g.fillStyle = HEX.terracotta; g.beginPath(); g.arc(480, 330, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = HEX.sage; archPath(g, 70, 160, 705, 730); g.fill();
    g.fillStyle = HEX.terracotta; g.beginPath(); g.arc(115, 650, 25, 0, Math.PI * 2); g.fill();
  },
  forms(g) {
    bar(g, 55, 185, 290, 16, 0.22); bar(g, 55, 225, 420, 16, 0.22); bar(g, 55, 165, 550, 16, 0.22);
    for (const y of [315, 445, 575]) { g.fillStyle = '#FCF8F2'; rr(g, 55, y, 490, 60, 15); g.fill(); g.strokeStyle = rgba(NAVY, 0.2); g.lineWidth = 5; g.stroke(); }
    g.fillStyle = HEX.terracotta; rr(g, 55, 670, 40, 40, 10); g.fill();
    g.strokeStyle = rgba(NAVY, 0.3); g.lineWidth = 5; rr(g, 305, 672, 35, 35, 9); g.stroke();
    bar(g, 120, 250, 690, 16); bar(g, 365, 495, 690, 16);
    g.strokeStyle = rgba(NAVY, 0.25); g.lineWidth = 4.5; g.beginPath(); g.moveTo(360, 752); g.lineTo(545, 752); g.stroke();
    g.strokeStyle = HEX.clay; g.lineWidth = 6.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(375, 737); g.bezierCurveTo(395, 702, 410, 752, 430, 729); g.bezierCurveTo(450, 707, 460, 707, 480, 732); g.bezierCurveTo(500, 752, 505, 717, 520, 727); g.stroke();
  },
};

/* ---------------------------------------------------------------------------------------------- the doorway */
function slotPoses() {
  const P = 2 * LEG + Math.PI * RC, out = [];
  for (let k = 0; k < N; k++) {
    const s = ((k + 0.5) * P) / N;
    let x, y, r;
    if (s < LEG) { x = -RC; y = s; r = 0; }
    else if (s < LEG + Math.PI * RC) {
      const f = (s - LEG) / RC;
      x = -RC * Math.cos(f); y = LEG + RC * Math.sin(f);
      r = f < Math.PI / 2 - 1e-4 ? -f : Math.PI - f;      // the keystone reads upwards, like a spine
    } else { x = RC; y = LEG - (s - LEG - Math.PI * RC); r = 0; }
    out.push({ x, y, z: 0, r });
  }
  return out;
}
const easeOutBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  await kit.ready;                                   // canvas faces need the brand fonts
  const q = ctx.quality;
  const low = q.tier === 'low';
  const opts = ctx.options;
  const layout = () => opts.layout || 'story';
  const stacked = () => /stacked/.test(layout());

  kit.environment({ intensity: 0.5 });
  const lights = kit.lights({ key: 2.15, rim: 1.5, fill: 0.5, keyPos: [-4, 6, 8], rimPos: [5, 3, -5], glow: 8, glowPos: [0.2, 2.6, 6], glowFollow: [3, 2] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  const track = (o) => ctx.track(o);
  const geoCache = new Map();
  const cardGeo = (depth, w = W, h = L, r = 0.055) => {
    const k = `${w}|${h}|${depth}|${r}`;
    if (!geoCache.has(k)) geoCache.set(k, track(extrude(roundRectShape(w, h, r), { depth, bevel: Math.min(depth * 0.4, 0.016), bevelSegments: low ? 2 : 3, curveSegments: low ? 5 : 8 })));
    return geoCache.get(k);
  };
  const planeGeo = (w, h) => {
    const k = `p|${w.toFixed(4)}|${h.toFixed(4)}`;
    if (!geoCache.has(k)) geoCache.set(k, track(new THREE.PlaneGeometry(w, h)));
    return geoCache.get(k);
  };
  const faceMat = (draw) => {
    const tex = kit.canvasTexture(DW, DH, draw, { maxSize: q.textureSize });
    return track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0, alphaTest: 0.5, alphaToCoverage: !!q.antialias, envMapIntensity: 0.9 }));
  };
  const face = (mat, depth, w = W, h = L) => {
    const inset = Math.min(depth * 0.4, 0.016);
    const m = new THREE.Mesh(planeGeo(w - 2 * inset, h - 2 * inset), mat);
    m.position.z = depth / 2 + 0.0015;
    return m;
  };
  const radiusPx = (depth, w = W) => { const inset = Math.min(depth * 0.4, 0.016); return ((0.055 - inset) / (w - 2 * inset)) * DW; };
  /** face design px → card-local coords */
  const local = (px, py, depth, out) => {
    const inset = Math.min(depth * 0.4, 0.016), fw = W - 2 * inset, fh = L - 2 * inset;
    return out.set((px / DW - 0.5) * fw, (0.5 - py / DH) * fh, depth / 2);
  };
  const white = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 }));
  const _v = new THREE.Vector3();

  /* ---- the seven objects ---- */
  const docs = DOCS.map((d, i) => {
    const holder = new THREE.Group();   // timeline pose (cascade → presented → in place)
    const tilt = new THREE.Group();     // hover / pointer: lift, straighten, turn
    holder.add(tilt);
    world.add(holder);
    const body = new THREE.Mesh(cardGeo(d.depth), kit.paper(FACE_BG[d.tone === 'sand' ? 'sand' : d.tone === 'paper' ? 'paper' : 'creamBright'], { roughness: 0.86 }));
    const main = new THREE.Group();     // the document itself (the forms pad moves only its top sheet)
    main.add(body, face(faceMat((g) => { faceBase(g, d, radiusPx(d.depth)); ILLUSTRATE[d.kind](g); }), d.depth));
    tilt.add(main);
    const doc = { d, i, holder, tilt, main, depth: d.depth, m: 0, h: 0, sel: 0, micro: null };

    if (d.kind === 'book') {
      // the page block sits a touch smaller than the boards; the cover is hinged on the spine
      body.material = kit.paper(HEX.paper, { roughness: 0.9 });
      const cw = W + 0.03, ch = L + 0.03, cd = 0.022;
      const pivot = new THREE.Group();
      pivot.position.set(-W / 2 - 0.015, 0, d.depth / 2 + cd / 2 + 0.002);
      const cover = new THREE.Mesh(cardGeo(cd, cw, ch, 0.06), kit.paper('#FCF8F2', { roughness: 0.78 }));
      cover.position.x = cw / 2;
      const coverR = ((0.06 - 0.0088) / (cw - 0.0176)) * DW;
      const coverFace = face(faceMat((g) => { faceBase(g, d, coverR, M + 50); ILLUSTRATE.cover(g, coverR); }), cd, cw, ch);
      coverFace.position.x = cw / 2;
      // the endpaper on the inside of the cover, facing the first page (only seen as the cover opens)
      const endpaper = face(faceMat((g) => ILLUSTRATE.endpaper(g, coverR)), cd, cw, ch);
      endpaper.rotation.y = Math.PI;
      endpaper.position.set(cw / 2, 0, -cd / 2 - 0.0004);
      pivot.add(endpaper);
      const back =new THREE.Mesh(cardGeo(cd, cw, ch, 0.06), kit.paper(HEX.sageShape, { roughness: 0.8 }));
      back.position.set(0, 0, -d.depth / 2 - cd / 2 - 0.002);
      pivot.add(cover, coverFace);
      main.add(pivot, back);
      doc.micro = (m) => { pivot.rotation.y = -ease.inOutCubic(m) * 1.9; };
    } else if (d.kind === 'policies') {
      const sheets = [0, 1].map((j) => {
        const s = new THREE.Mesh(cardGeo(0.018), kit.paper(j ? HEX.sand : '#FCF8F2', { roughness: 0.88 }));
        tilt.add(s);
        return s;
      });
      doc.micro = (m) => {
        const e = ease.outCubic(m);
        sheets[0].position.set(0.035 + e * 0.2, -0.02 - e * 0.03, -0.03);
        sheets[0].rotation.z = -0.035 - e * 0.09;
        sheets[1].position.set(0.065 + e * 0.4, -0.045 - e * 0.07, -0.055);
        sheets[1].rotation.z = -0.07 - e * 0.19;
      };
    } else if (d.kind === 'steps') {
      const tabGeo = track(extrude(archShape({ width: 0.17, height: 0.22, bottom: 0 }), { depth: 0.03, bevel: 0.008, bevelSegments: 2, curveSegments: low ? 10 : 18 }));
      const tabs = new THREE.InstancedMesh(tabGeo, white, 3);
      tabs.frustumCulled = false;
      [COLORS.terracotta, COLORS.sage, COLORS.sand].forEach((c, j) => tabs.setColorAt(j, c));
      tilt.add(tabs);
      const ys = [370, 530, 690].map((py) => local(0, py, d.depth, _v).y);
      const q4 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
      const p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), mat4 = new THREE.Matrix4();
      doc.micro = (m) => {
        for (let j = 0; j < 3; j++) {
          const u = easeOutBack(segment(m, j * 0.17, j * 0.17 + 0.5));
          p3.set(W / 2 - 0.19 + 0.04 + u * 0.14, ys[j], -d.depth / 2 - 0.018);
          mat4.compose(p3, q4, s3); tabs.setMatrixAt(j, mat4);
        }
        tabs.instanceMatrix.needsUpdate = true;
      };
    } else if (d.kind === 'calendar') {
      const marker = new THREE.Mesh(track(new THREE.CylinderGeometry(0.036, 0.036, 0.022, low ? 16 : 28)), kit.clay('terracotta', { roughness: 0.45, emissive: 0.12 }));
      marker.rotation.x = Math.PI / 2;
      tilt.add(marker);
      const a = local(440, 530, d.depth, new THREE.Vector3()), b = local(510, 530, d.depth, new THREE.Vector3());
      doc.micro = (m) => {
        const u = ease.inOutCubic(segment(m, 0.1, 0.8));
        marker.position.set(lerp(a.x, b.x, u), a.y, a.z + 0.02 + Math.sin(Math.PI * u) * 0.09);
      };
    } else if (d.kind === 'family') {
      const base = local(245, 730, d.depth, new THREE.Vector3()), kid = local(365, 730, d.depth, new THREE.Vector3());
      const people = kit.people({ items: [
        { p: [base.x, base.y, base.z + 0.03], height: 0.3, ry: 0.25, head: 'terracotta', body: 'sageBrand' },
        { p: [kid.x, kid.y, kid.z + 0.03], height: 0.19, ry: -0.3, head: 'terracotta', body: 'sageBrand' },
      ], depth: 8 });
      tilt.add(people.group);
      doc.micro = (m) => {
        const e = ease.outCubic(m);
        people.setScale(1, 0.62 + 0.38 * e);
        people.setPosition(1, kid.x - e * 0.03, kid.y + Math.sin(Math.PI * segment(m, 0.35, 0.85)) * 0.05, kid.z + 0.03);
        people.ry[0] = 0.25 + e * 0.35; people.ry[1] = -0.3 - e * 0.25;
        people.update();
      };
    } else if (d.kind === 'guide') {
      const pts = [[130, 660], [175, 625], [215, 540], [300, 480], [400, 452], [462, 395], [480, 330]].map(([x, y]) => { const v = local(x, y, d.depth, new THREE.Vector3()); v.z += 0.014; return v; });
      const line = kit.flowLine({ points: pts, radius: 0.011, taper: [0.06, 0.02], tubularSegments: low ? 60 : 110, radialSegments: 8, emissive: 0.25, tip: false });
      const goal = new THREE.Mesh(track(new THREE.SphereGeometry(0.03, 16, 12)), kit.clay('terracotta', { roughness: 0.45, emissive: 0.2 }));
      goal.position.copy(pts[pts.length - 1]).setZ(pts[pts.length - 1].z + 0.01);
      tilt.add(line.group, goal);
      doc.micro = (m) => {
        const p = 0.24 + 0.76 * ease.inOutCubic(segment(m, 0.05, 0.85));
        line.setProgress(p);
        goal.scale.setScalar(Math.max(0.001, easeOutBack(segment(m, 0.78, 1))));
      };
    } else if (d.kind === 'forms') {
      const under = [0, 1].map((j) => {
        const s = new THREE.Mesh(cardGeo(0.02), kit.paper(j ? HEX.sand : HEX.paper, { roughness: 0.88 }));
        s.position.set(0.018 * (j + 1), -0.024 * (j + 1), -0.028 * (j + 1));
        s.rotation.z = -0.018 * (j + 1);
        tilt.add(s);
        return s;
      });
      under[0].add(face(main.children[1].material, 0.02));   // the next form on the pad
      doc.micro = (m) => {
        const e = ease.inOutCubic(m);
        main.position.set(-e * 0.05, e * 0.34, e * 0.07);
        main.rotation.set(-e * 0.14, 0, e * 0.06);
      };
    }
    holder.traverse((o) => { o.userData.doc = i; });
    return doc;
  });

  /* ---- soft paper-layer shadows: one instanced draw for all seven ---- */
  const shTpl = kit.softShadow({ shape: 'roundRect', width: W, height: L, blur: 0.09, opacity: 0.44 });
  const shadows = new THREE.InstancedMesh(shTpl.geometry, shTpl.material, N);
  shadows.renderOrder = -1;
  shadows.frustumCulled = false;
  world.add(shadows);

  /* ---- the doorway, waiting: seven dashed places ---- */
  const slots = slotPoses();
  const outline = (() => {
    const pts = [], seg = 5, hw = W / 2 + 0.035, hh = L / 2 + 0.035, r = 0.08;
    const ring = [];
    const corner = (cx, cy, a0) => { for (let s = 0; s <= seg; s++) { const a = a0 + (s / seg) * (Math.PI / 2); ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI); corner(hw - r, -hh + r, Math.PI * 1.5);
    for (const sp of slots) {
      const c = Math.cos(sp.r), s = Math.sin(sp.r);
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length];
        pts.push(sp.x + ax * c - ay * s, sp.y + ax * s + ay * c, -0.04, sp.x + bx * c - by * s, sp.y + bx * s + by * c, -0.04);
      }
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = track(new THREE.LineDashedMaterial({ color: COLORS.cream, dashSize: 0.055, gapSize: 0.045, transparent: true, opacity: 0.3, depthWrite: false }));
    const ls = new THREE.LineSegments(g, mat);
    ls.computeLineDistances();
    ls.frustumCulled = false;
    world.add(ls);
    return ls;
  })();

  /* ---- the person, who rises inside the finished doorway ---- */
  const person = kit.figure({ height: 2.75, depth: 9 });
  person.group.position.set(0, 0.06, -0.12);
  world.add(person.group);
  const personShadow = kit.softShadow({ shape: 'arch', width: 1.95, height: 2.85, blur: 0.12, opacity: 0.38 });
  personShadow.position.set(0.1, 1.32, -0.4);
  world.add(personShadow);

  /* ---- brand forms: the disc, the line, the dust ---- */
  const discRig = new THREE.Group();
  discRig.position.set(3.95, 5.55, -3.4);
  discRig.rotation.set(0.04, -0.18, 0);
  const disc = kit.disc({ radius: 2.35, thickness: 0.2, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 4.7, height: 4.7, blur: 0.11, opacity: 0.55 });
  discShadow.position.set(0.14, -0.3, -0.16);
  discRig.add(discShadow, disc);
  world.add(discRig);
  const line = kit.flowLine({
    points: [[-8.2, -2.6, 0.4], [-4.8, -1.35, 1.2], [-2.3, -0.6, 1.55], [0, -0.36, 1.65], [2.5, -0.14, 1.4], [4.4, 0.72, 0.35], [6, 2.4, -1.1], [7.6, 4.7, -2.7]],
    radius: 0.026, taper: [0.2, 0.06], tubularSegments: low ? 220 : 420, emissive: 0.22,
  });
  world.add(line.group);
  const dust = low ? null : kit.particles({ count: 200, box: [15, 9, 7], center: [0.8, 3, -1.5], size: 0.026, opacity: 0.34, drift: 0.16, fade: [8, 30], speed: 0.6 });
  if (dust) world.add(dust);

  /* ---- timeline poses ---- */
  const cascade = DOCS.map((_, i) => ({ x: 0, y: 0.97 + i * 0.275, z: 1.0 - i * 0.3, s: 1.18, rz: [0.012, -0.018, 0.01, -0.012, 0.016, -0.008, 0.012][i] }));
  const present = { x: 0, y: 2.55, z: 2.7, s: 1.5 };
  const setPresent = () => {
    if (stacked()) { present.y = 2.75; present.z = 3.3; present.s = 1.95; }
    else { present.y = 2.55; present.z = 2.7; present.s = 1.5; }
  };

  /* ---- state ---- */
  let tTarget = Number.isFinite(opts.t) ? opts.t : 0, tNow = tTarget;
  const hover = { pointer: -1, dom: -1 };
  let selected = -1;

  /* ---- camera framing ---- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const view = { H: 7.5, nx: 0.3, ny: 0 };
  const frameFor = (t, out) => {
    const lay = layout(), a = ctx.size.aspect;
    if (lay === 'static') { out.H = Math.max(7.3, 6.9 / Math.max(0.6, a * 0.62)); out.nx = 0.36; out.ny = -0.04; return out; }
    if (lay === 'static-stacked') { out.H = Math.max(6.9, 6.3 / a); out.nx = 0; out.ny = -0.04; return out; }
    if (lay === 'story') {
      const hero = smoothstepT(t, 0, 0.9), end = smoothstepT(t, 7.2, 8);
      const Hmin = 6.9 / Math.max(0.6, a * 0.64);          // keep the doorway inside the right-hand ~60%
      out.H = Math.max(lerp(lerp(7.05, 7.55, hero), 7.8, end), Hmin);
      out.nx = lerp(0.37, 0.31, hero);
      out.ny = lerp(-0.04, -0.03, hero);
      return out;
    }
    // story-stacked: the doorway lives in the band between the header and the caption cards; at the finale it is framed
    // whole in the band above the arriving outro card (opts.endBand = [top, bottom] viewport fractions)
    const H = Math.max(9.6, 6.4 / a);
    const hero = smoothstepT(t, 0, 0.9);
    const floor = clamp01(Number(opts.heroFloor) || 0.72);
    const nyHero = 1 - 2 * (floor + 0.03) - 3.0 / (H / 2);
    out.H = H; out.nx = 0; out.ny = lerp(nyHero, 0.17, hero);
    const band = opts.endBand, end = smoothstepT(t, 7.05, 8);
    if (band && end > 0) {
      const f = Math.max(0.24, band[1] - band[0]);
      const Hend = Math.max(H, 6.1 / f);                         // the doorway + the person ≈ 5.7 units tall, with a margin
      const nyEnd = 1 - (band[0] + band[1]) - 0.2 / Hend;        // band centre; the doorway's centre sits 0.1 above the target
      out.H = lerp(H, Hend, end);
      out.ny = lerp(out.ny, nyEnd, end);
    }
    return out;
  };
  function smoothstepT(t, a, b) { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); }

  function resize() { setPresent(); }

  /* ---- per-frame ---- */
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), pC = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
  const bez = (a, c, b, u, out) => { const v = 1 - u; return out.set(v * v * a.x + 2 * v * u * c.x + u * u * b.x, v * v * a.y + 2 * v * u * c.y + u * u * b.y, v * v * a.z + 2 * v * u * c.z + u * u * b.z); };

  function update(c) {
    const settled = c.settled || c.static;
    const dt = settled ? 1 : c.delta;
    tNow = settled ? tTarget : damp(tNow, tTarget, 5.5, dt);
    if (Math.abs(tNow - tTarget) < 1e-4) tNow = tTarget;
    const t = tNow;
    const time = settled ? 0 : c.time;
    const px = c.pointer.x, py = c.pointer.y;
    const hv = hover.dom >= 0 ? hover.dom : hover.pointer;

    for (let i = 0; i < N; i++) {
      const doc = docs[i], C = cascade[i], S = slots[i];
      const r = ease.inOutCubic(segment(t, i + 0.3, i + 0.88));
      const dd = ease.inOutCubic(segment(t, i + 1.18, i + 1.74));
      const intro = kit.intro(0.35 + (N - 1 - i) * 0.08, 1.15, ease.outExpo);
      const h = holderPose(doc, C, S, r, dd, intro, time);
      const pr = r * (1 - dd);                                  // presented-ness
      // hover / selection: lift out, straighten, turn gently to the pointer
      doc.h = settled ? (hv === i ? 1 : 0) : damp(doc.h, hv === i ? 1 : 0, 8, dt);
      doc.sel = settled ? (selected === i ? 1 : 0) : damp(doc.sel, selected === i ? 1 : 0, 6, dt);
      const lift = Math.max(doc.h * (1 - pr), doc.sel);
      const tl = doc.tilt;
      tl.position.set(0, lift * 0.06, lift * (0.42 + doc.sel * 0.35));
      tl.rotation.set(-py * 0.14 * Math.max(pr, lift), px * 0.26 * Math.max(pr, lift), -h.rz * 0.94 * lift);
      tl.scale.setScalar(1 + lift * 0.1);
      // micro-animation: plays while presented, on hover and while its details are open
      const mt = Math.max(pr, doc.h, doc.sel);
      doc.m = settled ? mt : damp(doc.m, mt, 4.2, dt);
      doc.micro?.(doc.m);
      // shadow instance (world-consistent offset: down-right and behind)
      doc.holder.updateMatrix(); tl.updateMatrix();
      _m.multiplyMatrices(doc.holder.matrix, tl.matrix).decompose(_p, _q, _s);
      _n.set(0, 0, -1).applyQuaternion(_q);
      const fl = Math.max(pr, lift);
      _p.addScaledVector(_n, doc.depth / 2 + 0.035 + fl * 0.3);
      _p.x += 0.05 + fl * 0.1; _p.y -= 0.09 + fl * 0.26;
      _s.multiplyScalar(1 + fl * 0.06);
      _m.compose(_p, _q, _s);
      shadows.setMatrixAt(i, _m);
    }
    shadows.instanceMatrix.needsUpdate = true;

    // the doorway outline: appears with the pack, quietens once everything is in place
    const outlineIn = kit.intro(0.1, 1.4, ease.outCubic);
    outline.material.opacity = 0.3 * outlineIn * (1 - 0.8 * smoothstepT(t, 7.3, 8));

    // the person rises into the finished doorway: shoulders first, then the head lands
    const rise = ease.outExpo(segment(t, 7.35, 7.9));
    const land = easeOutBack(segment(t, 7.55, 8));
    person.body.scale.setScalar(Math.max(0.001, rise));
    person.head.position.y = 29 + (1 - land) * 16;
    person.head.scale.setScalar(Math.max(0.001, Math.min(1, segment(t, 7.55, 7.68))));
    person.group.visible = rise > 0.002;
    personShadow.visible = person.group.visible;
    personShadow.material.opacity = 0.38 * rise;

    // the line grows as the pack is put in place
    const lineIn = kit.intro(0.15, 2.2, ease.inOutCubic);
    line.setProgress(lineIn * (0.34 + 0.66 * ease.inOutSine(segment(t, 0.2, 7.9))));
    // static-stacked (the doorway as a block under the copy): the disc sits lower and smaller so the block's top edge never
    // slices it flat; it is cropped by the screen's right edge instead
    const discIn = kit.intro(0, 1.8, ease.outExpo);
    const ss = layout() === 'static-stacked';
    discRig.position.set((ss ? 4.6 : 3.95) + (1 - discIn) * 1.2, ss ? 4.5 : 5.55, -3.4);
    discRig.scale.setScalar(ss ? 0.78 : 1);

    // camera: frame the doorway for the layout, follow the pointer a little
    frameFor(t, view);
    const D = view.H / (2 * tanHalf);
    const st = stacked();
    camera.position.set(px * (st ? 0.15 : 0.32), TARGET_Y + D * 0.09 + py * (st ? 0.1 : 0.2), D);
    camera.lookAt(0, TARGET_Y, 0);
    camera.near = 0.1; camera.far = D + 30;
    camera.updateProjectionMatrix();
    shiftView(camera, view.nx, view.ny, c.size.width, c.size.height);
    world.rotation.y = px * 0.05;
    world.rotation.x = -py * 0.025;
    kit.updateFloaters(time, settled ? 0 : 1);
    if (dust) dust.update(c);
    lights.update(c);
  }

  /** Place a document on its path: cascade → presented → in place. Returns its current z-rotation. */
  const _rz = { rz: 0 };
  function holderPose(doc, C, S, r, dd, intro, time) {
    const hol = doc.holder;
    let s, rx, ry, rz;
    if (dd > 0) {
      pA.set(present.x, present.y, present.z); pB.set(S.x, S.y, S.z);
      pC.set((pA.x + pB.x) / 2, (pA.y + pB.y) / 2 + 0.55, Math.max(pA.z, pB.z) + 0.9);
      bez(pA, pC, pB, dd, hol.position);
      s = lerp(present.s, 1, dd);
      rz = lerp(0, S.r, dd);
      ry = Math.sin(Math.PI * dd) * 0.45 * Math.sign(S.x || 1);
      rx = -Math.sin(Math.PI * dd) * 0.12;
    } else {
      pA.set(C.x, C.y + (1 - intro) * 2.4, C.z); pB.set(present.x, present.y, present.z);
      pC.set(0.55, (pA.y + pB.y) / 2 + 0.35, (pA.z + pB.z) / 2 + 0.6);
      bez(pA, pC, pB, r, hol.position);
      s = lerp(C.s, present.s, r);
      rz = lerp(C.rz + (1 - intro) * 0.25, 0, r);
      ry = Math.sin(Math.PI * r) * -0.4;
      rx = lerp(-0.07, 0, r);
      if (r > 0.999) hol.position.y += Math.sin(time * 0.8 + doc.i) * 0.025;   // a gentle float while presented
    }
    hol.rotation.set(rx, ry, rz);
    hol.scale.setScalar(s);
    _rz.rz = rz;
    return _rz;
  }

  /* ---- picking (the page asks on pointer move / click) ---- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = [];
  const holders = docs.map((d) => d.holder);
  function pick(clientX, clientY) {
    const rect = ctx.container.getBoundingClientRect();
    if (!rect.width || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return -1;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    hits.length = 0;
    ray.intersectObjects(holders, true, hits);
    for (const h of hits) { if (h.object.visible && h.object.userData.doc != null) return h.object.userData.doc; }
    return -1;
  }

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    degrade() { if (dust) dust.visible = false; },
    api: {
      count: N,
      setProgress(t) { tTarget = Math.max(0, Math.min(8, +t || 0)); ctx.invalidate(); },
      setHover(source, i) { hover[source] = i ?? -1; ctx.invalidate(); },
      select(i) { selected = i ?? -1; ctx.invalidate(); },
      pick,
    },
  };
}
