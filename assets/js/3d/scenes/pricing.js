/**
 * Pricing — the two packages as objects in the HCLabs world (one module, three pages).
 *
 *  mode 'compare' (/pricing/): two doorways (the logo's arch) standing on one terracotta threshold line.
 *    Package one holds the HR Starter Pack — seven paper documents cascaded inside the doorway.
 *    Package two holds the same pack AND the brand's person at the threshold, inside a terracotta ring of time
 *    (the 60 minute consultation). Each doorway stands over its DOM package column (options.anchors), so the
 *    real links sit on top of the objects. api.setHover(i) lifts a doorway and opens its documents;
 *    api.select(i) carries the chosen doorway forward into the page transition.
 *  mode 'pack' | 'plus' (package pages): one large doorway. api.setState({ spread, focus }) fans the documents out
 *    through the doorway and presents one (focus 0–6; in 'plus', focus 7 = the consultation: the person steps
 *    forward and the ring completes). options.arrive = true starts inside the doorway and pulls back (continuity
 *    with the selection on /pricing/).
 *
 * Brand materials only (matte clay, paper, soft paper-layer shadows); no transmission glass, so it stays cheap:
 * compare ≈ 40 draw calls, package ≈ 26. Nothing allocates per frame. Settled frames (reduced motion, ?shot=1)
 * are complete compositions.
 */
import { createKit, ease, clamp01, lerp, damp, archRingShape, extrude } from '../kit.js';

const DOCS = [
  { number: '01', title: 'Employee Handbook', variant: 'text' },
  { number: '02', title: 'Essential HR Policies', variant: 'checklist' },
  { number: '03', title: 'Disciplinary & Grievance Procedures', variant: 'text', titleScale: 0.078 },
  { number: '04', title: 'Absence Management Documentation', variant: 'form', titleScale: 0.078 },
  { number: '05', title: 'Family Leave Policies', variant: 'checklist' },
  { number: '06', title: 'Manager Guidance Documents', variant: 'text' },
  { number: '07', title: 'HR Templates and Forms', variant: 'form' },
];
const N = DOCS.length;
const DOOR_H = 3;                 // doorway height (rig units)
const U = DOOR_H / 66;            // logo units → rig units (arch ring 52 wide, 66 tall, band 7)
const DOOR_W = 52 * U;            // ≈ 2.36
const OPEN_HALF = 19 * U;         // inner opening half-width ≈ 0.86
let CW = 0.9, CH = CW * 1.414;    // document size (larger on the package pages)
const TAU = Math.PI * 2;

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const opts = ctx.options || {};
  const mode = opts.mode || 'compare';
  const compare = mode === 'compare';
  if (!compare) { CW = 1.0; CH = CW * 1.414; }
  const q = ctx.quality;
  const seg = (n) => Math.max(6, Math.round(n * q.segmentScale));
  const kit = createKit(ctx);
  await kit.ready;

  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({
    key: 2.2, rim: 1.7, fill: 0.46, keyPos: [-4, 5, 8], rimPos: [5, 3, -6],
    glow: compare ? 8 : 10, glowPos: [0, 1.2, 5.5], glowFollow: [3, 2],
  });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  /* ---------------------------------------------------------------- shared resources */
  const doorGeo = extrude(archRingShape({ width: 52, height: 66, thickness: 7 }), { depth: 9, bevel: 1.5, bevelSegments: seg(5), curveSegments: seg(48) });
  doorGeo.scale(U, U, U);
  ctx.track(doorGeo);
  const doorMat = kit.clay('cream', { roughness: 0.56 });
  const faceSize = 512;              // cards are never more than ~300 device px wide: 512² faces stay crisp and save ~30 MB
  const srcCards = DOCS.map((d, i) => kit.card({
    width: CW, height: CH, depth: 0.022, radius: 0.04, style: 'paper', textureSize: faceSize,
    face: { kicker: 'HR Starter Pack', seed: i + 3, lines: d.variant === 'text' ? 7 : undefined, ...d },
  }));
  const dotGeo = new THREE.SphereGeometry(1, 18, 12);
  ctx.track(dotGeo);
  const terraDot = kit.clay('terracotta', { roughness: 0.5, emissive: 0.2, sheen: 0 });

  /* ---------------------------------------------------------------- a package rig */
  function makeRig({ plus, turn, shared }) {
    const rig = new THREE.Group();    // at the doorway's base centre (the threshold); scaled to its anchor
    const body = new THREE.Group();   // hover / select motion
    rig.add(body);

    const doorRig = new THREE.Group();
    const door = new THREE.Mesh(doorGeo, doorMat);
    const doorShadow = kit.softShadow({ shape: 'arch', width: DOOR_W, height: DOOR_H, blur: 0.1, opacity: 0.55 });
    doorShadow.position.set(0.2, DOOR_H / 2 - 0.2, -1.25);
    doorRig.add(doorShadow, door);
    body.add(doorRig);

    // documents: cascaded inside the doorway (the pack) → fanned out in front of it
    const stackX = plus ? (turn > 0 ? -0.3 : -0.4) : (turn > 0 ? 0.1 : -0.1);
    const stackShadow = kit.softShadow({ shape: 'roundRect', width: CW * 1.05, height: CH * 1.1, blur: 0.1, opacity: 0.5 });
    stackShadow.position.set(stackX + 0.1, CH / 2 + 0.2, -1.05);
    body.add(stackShadow);
    const holders = srcCards.map((c, i) => {
      const h = new THREE.Group();
      h.add(shared ? c.group.clone() : c.group);
      body.add(h);
      return { h, i, f: 0 };
    });

    let figure = null, ring = null, ringDot = null, ringShadow = null;
    if (plus) {
      figure = kit.figure({ height: 1.02 });
      figure.group.position.set(0.52, 0, 0.62);
      figure.group.rotation.y = -0.18;
      const figShadow = kit.softShadow({ shape: 'arch', width: 0.72, height: 1.0, blur: 0.12, opacity: 0.4 });
      figShadow.position.set(0.1, 0.44, -0.1);
      figure.group.add(figShadow);
      body.add(figure.group);
      // the ring of time: one terracotta line drawn right round, starting and ending at twelve o'clock
      const R = 0.56, pts = [];
      for (let k = 0; k <= 28; k++) {
        const a = Math.PI / 2 - (k / 28) * TAU;
        pts.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
      }
      ring = kit.flowLine({ points: pts, radius: 0.013, taper: [0.06, 0.02], tubularSegments: 220, tip: false });
      ring.R = R;
      body.add(ring.group);
      ringDot = new THREE.Mesh(dotGeo, terraDot);
      ringDot.scale.setScalar(0.042);
      ring.group.add(ringDot);
    }

    return {
      rig, body, doorRig, door, doorShadow, stackShadow, holders, figure, ring, ringDot, ringShadow, plus, turn, stackX,
      base: new THREE.Vector3(), s: 1, hov: 0, tHov: 0, sel: 0, tSel: 0, lose: 0, tLose: 0,
      spread: 0, tSpread: 0, focus: -1, fig: 0, tFig: 0,
    };
  }

  const rigs = compare
    ? [makeRig({ plus: false, turn: 0.2, shared: false }), makeRig({ plus: true, turn: -0.2, shared: true })]
    : [makeRig({ plus: mode === "plus", turn: -0.22, shared: false })];
  rigs.forEach((r) => world.add(r.rig));

  /* ---------------------------------------------------------------- brand forms */
  // package two's colour is the terracotta disc (the human, the consultation); package one's is the sage arch
  const disc = kit.disc({ radius: 1.6, thickness: 0.18, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 3.2, height: 3.2, blur: 0.11, opacity: 0.58 });
  const discRig = new THREE.Group();
  discShadow.position.set(0.1, -0.26, -0.15);
  discRig.add(discShadow, disc);
  const showDisc = mode !== 'pack';
  if (showDisc) world.add(discRig);

  const ARCH_H = 1.75;
  const arch = kit.rimmedArch({ width: 1.95, height: ARCH_H, below: 0.02, rim: 0.12, depth: 0.16, emissive: 0.08 });
  const archShadow = kit.softShadow({ shape: 'arch', width: 1.95, height: ARCH_H, blur: 0.1, opacity: 0.5 });
  archShadow.position.set(0.12, ARCH_H / 2 - 0.14, -0.2);
  const archRig = new THREE.Group();
  archRig.add(archShadow, arch.group);
  const showArch = mode !== 'plus';
  if (showArch) world.add(archRig);

  const dust = kit.particles({ count: compare ? 160 : 130, box: [12, 5, 5], center: [0, 1.2, -2.2], size: 0.024, opacity: 0.34, drift: 0.14, fade: [8, 30], speed: 0.6, seed: 23 });
  world.add(dust);

  /* ---------------------------------------------------------------- the threshold line (rebuilt on layout) */
  let line = null, lineKey = '';
  function buildLine(points, radius) {
    const key = points.map((p) => p.map((v) => v.toFixed(2)).join(',')).join('|') + radius.toFixed(3);
    if (key === lineKey) return;
    lineKey = key;
    if (line) { world.remove(line.group); line.mesh.geometry.dispose(); }
    line = kit.flowLine({ points, radius, taper: [0.08, 0.14], tubularSegments: 380, tip: false });
    world.add(line.group);
  }

  /* ---------------------------------------------------------------- layout (anchors → world) */
  const container = ctx.container;
  const anchors = compare ? (opts.anchors || []) : [];
  let D = 14, stacked = false, layoutW = 1, fanK = 1;   // fanK: fan width scale so the open hand of documents always fits the canvas
  const tmpBox = { x: 0, y: 0, w: 0, h: 0 };
  function relBox(el, out) {
    // offset-based (ignores CSS transforms from reveals/hover)
    let x = 0, y = 0, n = el;
    while (n && n !== container) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    if (n !== container) { // container isn't an offsetParent of el: fall back to rects
      const a = el.getBoundingClientRect(), b = container.getBoundingClientRect();
      x = a.left - b.left; y = a.top - b.top;
    }
    out.x = x; out.y = y; out.w = el.offsetWidth; out.h = el.offsetHeight;
    return out;
  }

  let camZ = 14, camY = 0, lookY = 0;
  const pkg = { x: 0, y: 0, s: 1 };   // package-page framing
  function resize(c) {
    const W = c.size.width, H = c.size.height;
    if (compare) {
      camera.fov = H / W > 1.2 ? 18 : 26;
      camera.updateProjectionMatrix();
      D = 14; camZ = D; camY = 0; lookY = 0;
      const visH = 2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const wpp = visH / H;
      layoutW = W * wpp;
      stacked = false;
      const bases = [];
      rigs.forEach((r, i) => {
        const a = anchors[i];
        if (!a) return;
        const b = relBox(a, tmpBox);
        const cx = b.x + b.w / 2, by = b.y + b.h;
        const s = Math.max(0.05, Math.min((b.h * 0.9 * wpp) / DOOR_H, (b.w * 0.86 * wpp) / 2.6));
        r.s = s;
        r.base.set((cx - W / 2) * wpp, -(by - H / 2) * wpp, 0);
        bases.push(r.base);
      });
      if (bases.length === 2) stacked = Math.abs(bases[0].y - bases[1].y) > 0.5 * rigs[0].s;
      const s0 = rigs[0].s, b0 = rigs[0].base, b1 = rigs[1].base, s1 = rigs[1].s;
      const halfW = layoutW / 2 + 0.6;
      // the terracotta disc behind package two, up and to the right (kept inside the stage: no hard crop)
      discRig.position.set(b1.x + 1.3 * s1, b1.y + 1.95 * s1, -1.6 * s1);
      discRig.scale.setScalar(s1 * 0.75);
      // the sage arch stands on the threshold behind package one, to its left
      archRig.position.set(b0.x - 1.25 * s0, b0.y, -1.75 * s0);
      archRig.scale.setScalar(s0 * 0.95);
      if (!stacked) {
        // one line along both thresholds: in from the left, under door one, a small rise between, under door two, out rising
        const y0 = b0.y, y1 = b1.y, s = (s0 + s1) / 2;
        buildLine([
          [-halfW, y0 + 0.5 * s, -0.4], [b0.x - 1.7 * s, y0 + 0.02 * s, 0.25 * s], [b0.x, y0 - 0.1 * s, 0.9 * s],
          [(b0.x + b1.x) / 2, y0 + 0.08 * s, 0.7 * s], [b1.x - 0.2 * s, y1 - 0.1 * s, 1.0 * s],
          [b1.x + 1.7 * s, y1 + 0.35 * s, 0.4 * s], [halfW, y1 + 1.6 * s, -0.6],
        ], 0.018 * s);
      } else {
        // stacked (phones): the line threads down through both thresholds
        const s = (s0 + s1) / 2;
        // (between the doorways it runs off-screen to the right, so it never crosses the copy)
        buildLine([
          [-halfW - 0.3, b0.y + 0.55 * s, -0.4], [b0.x - 0.8 * s, b0.y - 0.06 * s, 0.9 * s], [b0.x + 0.9 * s, b0.y - 0.02 * s, 0.8 * s],
          [halfW + 0.9, b0.y + 0.15 * s, 0.2], [halfW + 1.8, (b0.y + b1.y) / 2, 0], [halfW + 0.9, b1.y + 0.7 * s, 0.2],
          [b1.x + 0.9 * s, b1.y + 0.02 * s, 0.9 * s], [b1.x - 0.7 * s, b1.y - 0.08 * s, 0.9 * s], [-halfW - 0.3, b1.y + 0.45 * s, -0.4],
        ], 0.02 * s);
      }
    } else {
      // package page: frame the doorway + its fan in any aspect (portrait sticky column on desktop, landscape on phones)
      const a = c.size.aspect;
      camera.fov = 28; camera.updateProjectionMatrix();
      const visH = Math.max(5.4, 4.6 / a);
      D = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      camZ = D; camY = 1.35; lookY = 1.25;
      layoutW = visH * a;
      const r = rigs[0];
      r.s = 1; r.base.set(mode === 'plus' ? -0.12 : 0, 0, 0);
      discRig.position.set(1.25, 2.95, -2.1); discRig.scale.setScalar(0.7);
      archRig.position.set(-1.35, 0, -1.75); archRig.scale.setScalar(1.05);
      // desktop: the stage bleeds past its column to the viewport edge; keep the doorway centred over the column
      let shift = 0;
      const vis = container.parentElement;
      if (vis) {
        const vr = vis.getBoundingClientRect(), sr = container.getBoundingClientRect();
        if (sr.width > 0 && c.size.height > 0) shift = ((vr.left + vr.width / 2) - (sr.left + sr.width / 2)) * (visH / c.size.height);
      }
      // wide screens (large bleed): never push the leftmost form (the sage arch / the doorway) past the canvas edge mask
      // (arch: left edge -2.37 at z -1.75 → ≈ -2.05 projected, + its shadow; package two: the doorway ≈ -1.35)
      shift = Math.max(shift, (showArch ? 2.2 : 1.45) - (layoutW / 2 - 0.25));
      world.position.x = shift;
      // the fan opens left of the doorway: narrow it (never below 0.6) so its outermost document stays inside the
      // canvas (and clear of the 5% edge mask) — perspective brings the fanned cards forward, hence the 1.16
      const reach = ((N - 1) / 2 * (r.plus ? 0.36 : 0.4) + (r.plus ? 0.5 : 0) + CW / 2) * 1.16;
      fanK = Math.min(1, Math.max(0.6, (layoutW / 2 - 0.3 + r.base.x + shift) / reach));
      const hw = layoutW / 2 + 0.8 + Math.abs(shift);
      buildLine([[-hw, 0.85, -0.9], [-1.7, 0.06, 0.2], [-0.3, -0.03, 0.55], [1.1, 0.0, 0.5], [2.0, 0.4, 0.1], [hw, 1.6, -0.9]], 0.02);
    }
  }

  /* ---------------------------------------------------------------- per-frame pose */
  const jitter = [-0.03, 0.025, -0.018, 0.03, -0.022, 0.02, -0.03];
  function layoutCards(r, spread, focus, dt, settled, introT) {
    const sinT = Math.sin(r.turn), cosT = Math.cos(r.turn);
    const gap = (r.plus ? 0.36 : 0.4) * fanK;
    for (let k = 0; k < N; k++) {
      // the documents are dealt out one after another (front card first), each arcing forward over the rest
      const sk = clamp01((spread - k * 0.05) / 0.7);
      const s = ease.inOutCubic(sk);
      const turn = lerp(r.turn, 0, s);
      const plusShift = r.plus ? 0.5 * s * fanK : 0;   // package two: the fan opens to the left, leaving the threshold to the person
      const hd = r.holders[k];
      const tf = k === focus ? 1 : 0;
      hd.f = settled ? tf : damp(hd.f, tf, 8, dt);
      const f = ease.outCubic(hd.f);
      // cascade (inside the doorway): card 0 in front and lowest, each later card one step back and up
      const d = k * 0.095;
      const cx = r.stackX - sinT * d, cy = CH / 2 + 0.04 + k * 0.1, cz = -0.22 - cosT * d;
      // fan (in front of the doorway): an open hand of documents facing the viewer
      const j = k - (N - 1) / 2;
      const fx = j * gap - plusShift, fy = CH / 2 + 0.38 - Math.abs(j) * 0.07, fz = 0.95 - j * j * 0.045;
      let x = lerp(cx, fx, s), y = lerp(cy, fy, s), z = lerp(cz, fz, s) + Math.sin(s * Math.PI) * 0.4;
      let ry = lerp(turn, -j * 0.1, s), rz = lerp(jitter[k] * 0.5, -j * 0.04, s), rx = lerp(-0.04, 0, s);
      // presented: lifts forward and turns to face you
      x = lerp(x, lerp(r.stackX + 0.1, fx * 0.55, s), f * 0.35);
      y += f * (0.2 + 0.1 * s);
      z += f * (0.55 + 0.25 * s);
      ry = lerp(ry, 0, f); rz = lerp(rz, 0, f); rx = lerp(rx, 0, f);
      // intro: documents are dealt into the doorway one by one
      const p = introT[k];
      if (p < 1) {
        const e = 1 - p;
        x -= e * 1.6; y += e * 0.9; z += e * 1.6; ry += e * 0.9; rz += e * 0.35;
      }
      hd.h.position.set(x, y, z);
      hd.h.rotation.set(rx, ry, rz);
      const sc = Math.max(0.001, p < 1 ? ease.outCubic(p) : 1) * (1 + f * 0.06);
      hd.h.scale.setScalar(sc);
    }
  }

  const introCards = new Float32Array(N);
  const phase = new Float32Array(2);
  let camPull = opts.arrive && !ctx.static ? 1 : 0;
  function update(c) {
    const settled = c.settled || c.static;
    const dt = settled ? 1 : c.delta;
    const t = settled ? 0 : c.time;
    const px = c.pointer.x, py = c.pointer.y;
    const arrive = !!opts.arrive && !settled;
    const intro = (d, dur, fn) => (arrive ? 1 : kit.intro(d, dur, fn));

    rigs.forEach((r, ri) => {
      const delay = ri * 0.16;
      // hover / select state
      r.hov = settled ? r.tHov : damp(r.hov, r.tHov, 6.5, dt);
      r.sel = settled ? r.tSel : damp(r.sel, r.tSel, 5.2, dt);
      r.lose = settled ? r.tLose : damp(r.lose, r.tLose, 5.2, dt);
      r.spread = settled ? r.tSpread : damp(r.spread, r.tSpread, 4.2, dt);
      r.fig = settled ? r.tFig : damp(r.fig, r.tFig, 6, dt);
      const hov = ease.outCubic(r.hov), sel = ease.inOutCubic(r.sel), lose = ease.inOutCubic(r.lose);

      // placement: anchor base, pointer turn, perspective compensation; select → forward, centred on its opening
      const s = r.s;
      const bx = r.base.x, by = r.base.y;
      const other = rigs[1 - ri];
      const away = other ? (bx >= other.base.x ? 1 : -1) : 1;
      const tx = lerp(bx, 0, sel) + away * lose * 2.2 * s;
      const ty = lerp(by, -1.45 * s, sel) - lose * 0.2 * s;
      r.rig.position.set(tx, ty, sel * 9 - lose * 1.4 * s);
      r.rig.scale.setScalar(s * (1 + hov * 0.035 - lose * 0.15));
      const comp = compare ? 0.7 * (1 - sel) : 0;
      r.rig.rotation.set(
        Math.atan2(r.base.y + DOOR_H * 0.5 * s, D) * comp - py * 0.045,
        -Math.atan2(r.base.x, D) * comp + px * 0.14 + (compare ? (ri ? -1 : 1) * 0.04 * (1 - hov) : 0),
        0,
      );
      r.body.position.z = hov * 0.32;
      r.body.position.y = hov * 0.04;

      // doorway rises from its threshold
      const rise = intro(0.05 + delay, 1.05, ease.outExpo);
      r.doorRig.scale.set(1, Math.max(0.001, rise), 1);

      // documents
      for (let k = 0; k < N; k++) introCards[k] = intro(0.45 + delay + k * 0.075, 0.75, ease.outCubic);
      // package two: when the consultation is presented, the documents settle back into the doorway (the pack in place)
      // and the person steps forward to the threshold
      const figF = r.plus ? ease.outCubic(r.fig) : 0;
      const spread = compare ? hov * 0.3 : r.spread * (1 - figF);
      const focus = compare ? -1 : r.focus;
      layoutCards(r, spread, focus, dt, settled, introCards);
      r.stackShadow.scale.setScalar(Math.max(0.001, introCards[N - 1]));
      r.stackShadow.position.x = r.stackX + 0.1 + (compare ? 0 : ease.inOutCubic(spread) * (r.plus ? -0.45 : 0));

      // the person + the ring of time (package two)
      if (r.plus) {
        const fig = ease.outCubic(r.fig);
        const bodyIn = intro(0.95 + delay, 0.8, ease.outExpo);
        const headIn = intro(1.2 + delay, 0.7, ease.outCubic);
        r.figure.body.scale.set(1, Math.max(0.001, bodyIn), 1);
        const bounce = headIn < 1 ? Math.sin(headIn * Math.PI) * 0.35 : 0;
        r.figure.head.scale.setScalar(Math.max(0.001, headIn));
        r.figure.head.position.y = 29 + bounce * 8;
        const fs = ease.inOutCubic(compare ? 0 : spread);
        // presented (the consultation): the person steps forward onto the threshold and grows, the ring of time widens
        r.figure.group.position.set(lerp(lerp(0.52, 1.38, fs), 0.4, fig), 0, lerp(0.62, 1.05, fs) + fig * 0.85 + hov * 0.1);
        r.figure.group.scale.setScalar(1 + fig * 0.28);
        r.figure.group.rotation.y = lerp(-0.18, -0.34, fs) + fig * 0.18 - px * 0.1;
        const drawn = intro(1.25 + delay, 1.4, ease.inOutCubic);
        r.ring.setProgress(drawn);
        const fp = r.figure.group.position;
        r.ring.group.position.set(fp.x, 0.66 * (1 + fig * 0.28), fp.z - 0.18);
        r.ring.group.scale.setScalar(1 + fig * 0.4 + hov * 0.05);
        // a dot keeps time around the ring (twelve o'clock when settled)
        phase[ri] = settled ? 0 : (phase[ri] + dt * (0.12 + hov * 0.35 + fig * 0.45)) % TAU;
        const ang = Math.PI / 2 - phase[ri];
        r.ringDot.position.set(Math.cos(ang) * r.ring.R, Math.sin(ang) * r.ring.R, 0.012);
        r.ringDot.scale.setScalar(drawn >= 0.98 ? 0.042 * (1 + hov * 0.25 + fig * 0.35) : 0.001);
      }
    });

    // brand forms
    const discIn = intro(0, 1.6, ease.outExpo);
    disc.position.set((1 - discIn) * 1.2, (1 - discIn) * 0.6, 0);
    discShadow.position.set(0.1 + (1 - discIn) * 1.2, -0.26 + (1 - discIn) * 0.6, -0.15);
    const archIn = Math.max(0.001, intro(0.1, 1.5, ease.outExpo));
    arch.group.scale.y = archIn;
    archShadow.scale.y = archIn;
    archShadow.position.y = (ARCH_H / 2 - 0.14) * archIn;
    if (line) line.setProgress(intro(0.15, 2.1, ease.inOutCubic));

    // camera
    if (compare) {
      camera.position.set(px * 0.22, py * 0.12, camZ);
      camera.lookAt(0, 0, 0);
    } else {
      if (camPull > 0 && !settled) camPull = Math.max(0, camPull - dt / 1.35);
      const pull = ease.inOutCubic(camPull);
      const r = rigs[0];
      // arriving: starts inside the doorway (as the selection on /pricing/ ended) and steps back out
      camera.position.set(px * 0.3 + (r.base.x + world.position.x) * pull, camY + py * 0.18 - pull * 0.35, lerp(camZ, 2.2, pull));
      camera.lookAt((r.base.x + world.position.x) * pull, lookY - pull * 0.2, 0);
    }
    kit.updateFloaters(settled ? 0 : t, settled ? 0 : 1);
    dust.update(c);
    lights.update(c);
  }

  /* ---------------------------------------------------------------- api (DOM → scene) */
  const api = {
    /** compare: -1 | 0 | 1 */
    setHover(i) { rigs.forEach((r, k) => { r.tHov = k === i && !rigs.some((x) => x.tSel) ? 1 : 0; }); ctx.invalidate(); },
    /** compare: carry doorway i forward (page transition follows) */
    select(i) { rigs.forEach((r, k) => { r.tSel = k === i ? 1 : 0; r.tLose = k === i ? 0 : 1; r.tHov = k === i ? 1 : 0; }); ctx.invalidate(); },
    /** compare: undo a selection (e.g. back/forward cache restore) */
    reset() { rigs.forEach((r) => { r.tSel = 0; r.tLose = 0; r.tHov = 0; r.sel = 0; r.lose = 0; }); ctx.invalidate(); },
    /** package pages: spread 0..1 (cascade → fan), focus -1..6 (7 = the consultation in 'plus') */
    setState({ spread, focus }) {
      const r = rigs[0];
      if (spread != null) r.tSpread = clamp01(spread);
      if (focus != null) {
        r.focus = focus >= 0 && focus < N ? focus : -1;
        r.tFig = r.plus && focus === N ? 1 : 0;
      }
      ctx.invalidate();
    },
    relayout() { resize(ctx); ctx.invalidate(); },
  };

  resize(ctx);
  update(ctx);
  return {
    update, resize, api,
    degrade() { dust.visible = false; },
  };
}
