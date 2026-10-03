/**
 * Who it's for — hero world: FOUR DOORWAYS.
 * The logo's doorway, four times, standing in a row on the navy ground, each framing its situation:
 *   0 employing staff for the first time → one person about to step through
 *   1 growing your team                  → three people, small to large (two more join on focus)
 *   2 updating HR documentation          → a small stack of documents (fans out on focus)
 *   3 employment-related challenges      → two people facing each other, joined by an arc
 * The brand's terracotta line weaves through every threshold (behind them, in front between them) and rises
 * off to the right; the terracotta disc sits where the page's CSS disc is.
 *
 * Layout is owned by the DOM: every doorway is aligned (by unprojection onto its floor plane) to the box of its
 * link's `.who-door__space`, so the accessible links and the 3D doors always coincide, at any size, in one row
 * (desktop) or two (phones). Hover/focus of a link calls api.setFocus(i): that doorway steps forward, the light
 * moves to it and its small story plays. Pointer: every doorway turns a little toward the cursor.
 *
 * sceneOptions: { anchors(): [{ cx, top, bottom }] in stage px, disc(): { cx, cy, r } | null, intro: boolean }
 * api: { setFocus(i | -1), relayout(), setPaused(bool) }
 * Budget: ~26 draw calls (4 arches, 4 shadows, 3 × people (2 each), 3 cards (2 each), arc + dot, 1–2 lines,
 * disc + shadow, particles). No per-frame allocation.
 */
import { createKit, ease, clamp01, damp, archRingShape, extrude } from '../kit.js';

const outBack = (t) => { const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  await kit.ready;                       // card faces use the brand fonts

  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({ key: 2.05, rim: 1.7, fill: 0.46, keyPos: [-4, 5, 8], rimPos: [5, 3, -5], follow: [2.2, 1.2] });
  scene.add(lights.group);
  const glow = new THREE.PointLight(new THREE.Color().setStyle('#FFF5EC', THREE.SRGBColorSpace), 0, 0, 2);
  scene.add(glow);

  const world = new THREE.Group();
  scene.add(world);
  const seg = (n) => Math.max(6, Math.round(n * ctx.quality.segmentScale));

  /* ---------------------------------------------------------------- the four doorways */
  const archGeo = extrude(archRingShape(), { depth: 11, bevel: 1.7, bevelSegments: seg(5), curveSegments: seg(40) });
  ctx.track(archGeo);
  const baseClay = kit.clay('cream', { roughness: 0.58 });

  const doors = [0, 1, 2, 3].map((i) => {
    const rig = new THREE.Group();          // base point on the floor; turns with the pointer
    const fit = new THREE.Group();          // scale = door height in world units (door model is 1 unit tall)
    rig.add(fit);
    const mat = baseClay.clone();
    ctx.track(mat);
    const arch = new THREE.Mesh(archGeo, mat);
    arch.scale.setScalar(1 / 56);
    const shadow = kit.softShadow({ shape: 'arch', width: 52 / 56, height: 1, blur: 0.12, opacity: 0.42 });
    shadow.position.set(0.05, 0.5 - 0.075, -0.3);
    const motif = new THREE.Group();
    fit.add(shadow, arch, motif);
    world.add(rig);
    return { i, rig, fit, arch, mat, shadow, motif, s: 1, row: 0, baseRy: 0, on: 0, x: 0, y: 0 };
  });

  /* 0 · one person, about to step through */
  const m0 = kit.people({ items: [{ p: [-0.6, 0, 0.2], height: 0.3, ry: 0.35 }] });
  doors[0].motif.add(m0.group);

  /* 1 · the team: three people small → large, two more join on focus */
  const TEAM = [
    { p: [-0.202, 0, -0.06], height: 0.179 }, { p: [-0.043, 0, -0.06], height: 0.241 }, { p: [0.159, 0, -0.06], height: 0.304 },
    { p: [-0.6, 0, 0.26], height: 0.2, ry: 0.3 }, { p: [0.6, 0, 0.26], height: 0.2, ry: -0.3 },
  ];
  const m1 = kit.people({ items: TEAM });
  doors[1].motif.add(m1.group);

  /* 2 · documents */
  const cardOpts = { width: 18 / 56, height: 25 / 56, depth: 0.012, radius: 0.028, textureSize: 512 };
  const DOCS = [
    { face: { variant: 'text', seed: 4, lines: 7 }, style: 'cream', rz: -0.175, rzOn: -0.33, x: -0.02, xOn: -0.075, z: -0.075 },
    { face: { variant: 'text', seed: 9, lines: 7 }, style: 'paper', rz: -0.07, rzOn: -0.155, x: -0.008, xOn: -0.035, z: -0.045 },
    { face: { variant: 'checklist', seed: 2, lines: 4, checked: 4 }, style: 'cream', rz: 0.07, rzOn: 0.14, x: 0, xOn: 0.035, z: -0.015 },
  ];
  const cards = DOCS.map((dcfg) => {
    const c = kit.card({ ...cardOpts, style: dcfg.style, face: { ...dcfg.face, mark: true } });
    const pivot = new THREE.Group();        // rotate about the card's bottom centre
    c.group.position.y = 25 / 56 / 2;
    pivot.add(c.group);
    pivot.position.set(dcfg.x, 1 / 56, dcfg.z);
    doors[2].motif.add(pivot);
    return { ...dcfg, pivot, card: c };
  });
  { // the front document is signed off: a sage seal with a navy tick (as in the static art)
    const front = cards[2].card.group;
    const seal = new THREE.Group();
    const sealDisc = kit.disc({ radius: 0.05, thickness: 0.012, color: 'sage', emissive: 0.08 });
    const tick = new THREE.CurvePath();
    const a = new THREE.Vector3(-0.022, 0.001, 0.009), b = new THREE.Vector3(-0.006, -0.016, 0.009), e = new THREE.Vector3(0.025, 0.02, 0.009);
    tick.add(new THREE.LineCurve3(a, b)); tick.add(new THREE.LineCurve3(b, e));
    const tickGeo = ctx.track(new THREE.TubeGeometry(tick, 24, 0.0055, 6, false));
    seal.add(sealDisc, new THREE.Mesh(tickGeo, kit.clay('navy', { roughness: 0.6, sheen: 0 })));
    seal.position.set(0.098, -0.162, 0.02);
    front.add(seal);
  }

  /* 3 · two people facing each other, joined by an arc */
  const m3 = kit.people({ items: [{ p: [-0.132, 0, -0.03], height: 0.321, ry: 0.55 }, { p: [0.132, 0, -0.03], height: 0.321, ry: -0.55 }] });
  doors[3].motif.add(m3.group);
  const arcPts = [];
  { // sample the static art's cubic (M18.6 36.4 C19.8 24.4 32.2 24.4 33.4 36.4, logo units) into door space
    const P = [[18.6, 36.4], [19.8, 24.4], [32.2, 24.4], [33.4, 36.4]];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0];
      const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1];
      arcPts.push(new THREE.Vector3((x - 26) / 56, (56 - y) / 56, -0.03));
    }
  }
  const lineMat = kit.clay('terracotta', { roughness: 0.5, emissive: 0.22, sheen: 0 });
  const arcCurve = new THREE.CatmullRomCurve3(arcPts, false, 'centripetal');
  const ARC_T = seg(80), ARC_R = 8;
  const arcGeo = ctx.track(new THREE.TubeGeometry(arcCurve, ARC_T, 0.0115, ARC_R, false));
  const arc = new THREE.Mesh(arcGeo, lineMat);
  const dotGeo = ctx.track(new THREE.SphereGeometry(0.024, 16, 12));
  const arcDot = new THREE.Mesh(dotGeo, lineMat);
  arcDot.position.set(0, (56 - 27.4) / 56, -0.03);
  doors[3].motif.add(arc, arcDot);
  const setArc = (p) => { const n = Math.round(clamp01(p) * ARC_T); arcGeo.setDrawRange(0, n >= ARC_T ? Infinity : n * ARC_R * 6); };

  /* ---------------------------------------------------------------- disc, particles, light */
  const discRig = new THREE.Group();
  const disc = kit.disc({ radius: 1, thickness: 0.12, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 2, height: 2, blur: 0.11, opacity: 0.55 });
  discShadow.position.set(0.05, -0.14, -0.08);
  discRig.add(discShadow, disc);
  discRig.visible = false;
  world.add(discRig);
  const discAt = { x: 0, y: 0, z: -1.6, r: 1, on: false };

  let dust = null;

  /* ---------------------------------------------------------------- the line (rebuilt on layout) */
  const lines = [];
  const LINE_T = seg(360), LINE_R = 10;
  function buildLine(points, radius) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, LINE_T, radius, LINE_R, false);
    const pos = g.attributes.position, ring = LINE_R + 1, v = new THREE.Vector3();
    for (let i = 0; i <= LINE_T; i++) {                  // taper both ends
      const u = i / LINE_T;
      let f = 1;
      if (u < 0.06) f = ease.outSine(u / 0.06);
      if (u > 0.94) f = Math.min(f, ease.outSine((1 - u) / 0.06));
      f = Math.max(0.05, f);
      if (f >= 1) continue;
      curve.getPointAt(u, v);
      for (let j = 0; j < ring; j++) {
        const k = i * ring + j;
        pos.setXYZ(k, v.x + (pos.getX(k) - v.x) * f, v.y + (pos.getY(k) - v.y) * f, v.z + (pos.getZ(k) - v.z) * f);
      }
    }
    pos.needsUpdate = true;
    const mesh = new THREE.Mesh(g, lineMat);
    world.add(mesh);
    return { mesh, geo: g };
  }
  const setLine = (l, p) => { const n = Math.round(clamp01(p) * LINE_T); l.geo.setDrawRange(0, n >= LINE_T ? Infinity : n * LINE_R * 6); };

  /* ---------------------------------------------------------------- layout: align everything to the DOM */
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  function hit(px, py, planeZ, out) {                  // stage px → point on the plane z = planeZ
    const W = ctx.size.width, H = ctx.size.height;
    _o.copy(camera.position);
    _d.set((px / W) * 2 - 1, 1 - (py / H) * 2, 0.5).unproject(camera).sub(_o).normalize();
    const t = (planeZ - _o.z) / _d.z;
    return out.copy(_o).addScaledVector(_d, t);
  }
  let laidOut = false, avgS = 1, pivotY = 0, walkX = -0.6, walkZ = 0.2;
  function layout() {
    const A = typeof ctx.options.anchors === 'function' ? ctx.options.anchors() : null;
    if (!A || A.length < 4) return;
    const W = ctx.size.width, H = ctx.size.height;
    const doorPx = Math.max(40, (A[0].bottom - A[0].top) * 0.92);
    // keep the world scale steady across sizes: the doors are always ~1.5 units tall
    const dist = (1.5 * H) / (doorPx * 2 * tanHalf);
    camera.near = 0.1; camera.far = dist + 60;
    camera.position.set(0, dist * 0.11, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    let sum = 0;
    doors.forEach((dr, i) => {
      const a = A[i];
      const base = hit(a.cx, a.bottom, 0, _a);
      const top = hit(a.cx, a.bottom - (a.bottom - a.top) * 0.92, 0, _b);
      dr.s = Math.max(0.05, top.y - base.y);
      dr.x = base.x; dr.y = base.y;
      dr.rig.position.set(base.x, base.y, 0);
      dr.fit.scale.setScalar(dr.s);
      dr.baseRy = Math.atan2(-base.x, camera.position.z) * 0.45;   // turned a little toward the viewer
      sum += dr.s;
    });
    avgS = sum / 4;
    // rows (one on desktop, two on phones)
    const rows = [];
    doors.forEach((dr) => {
      let r = rows.find((row) => Math.abs(row.y - dr.y) < avgS * 0.3);
      if (!r) { r = { y: dr.y, doors: [] }; rows.push(r); }
      r.doors.push(dr);
    });
    rows.forEach((r) => r.doors.sort((p, q) => p.x - q.x));
    pivotY = rows[0].y;
    { // the first person waits beside door 01 — as far out as the stage edge allows (never cropped by the screen)
      const d0 = doors[0], edge = hit(Math.min(24, W * 0.04), A[0].bottom, 0, _a).x;
      const room = (edge - d0.x) / d0.s + 0.115;         // person half-width ≈ 0.105 door units
      walkX = Math.min(-0.36, Math.max(-0.6, room));
      walkZ = walkX > -0.5 ? 0.3 : 0.2;                 // tight: step forward, in front of the door's leg
    }

    // the line: rebuild per row
    for (const l of lines) { world.remove(l.mesh); l.geo.dispose(); }
    lines.length = 0;
    const leftX = hit(-W * 0.08, 0, 0, _a).x, rightX = hit(W * 1.08, 0, 0, _b).x;
    rows.forEach((r, ri) => {
      const s = r.doors[0].s, y = r.y + 0.012 * s, pts = [];
      const first = r.doors[0], last = r.doors[r.doors.length - 1];
      pts.push(new THREE.Vector3(Math.min(leftX, first.x - 2 * s), y + 0.02 * s, 0.22 * s));
      pts.push(new THREE.Vector3(first.x - 0.95 * s, y + 0.005 * s, 0.14 * s));
      r.doors.forEach((dr, k) => {
        pts.push(new THREE.Vector3(dr.x, y, 0.07 * dr.s));
        const nx = r.doors[k + 1];
        if (nx) pts.push(new THREE.Vector3((dr.x + nx.x) / 2, y + 0.035 * s, 0.3 * s));   // in front between doors (kept clear of the labels)
      });
      const last2 = ri === rows.length - 1;
      pts.push(new THREE.Vector3(last.x + 0.85 * s, y + 0.03 * s, 0.22 * s));
      pts.push(new THREE.Vector3(Math.max(rightX, last.x + 2 * s), y + (last2 ? 0.55 : 0.12) * s, last2 ? -0.35 * s : 0.1 * s));
      lines.push(buildLine(pts, 0.0095 * s));
    });

    // disc: where the page's CSS disc is (on a plane behind the doors)
    const D = typeof ctx.options.disc === 'function' ? ctx.options.disc() : null;
    discAt.on = !!(D && D.r > 4);
    discRig.visible = discAt.on;
    if (discAt.on) {
      const c = hit(D.cx, D.cy, discAt.z, _a);
      const e = hit(D.cx + D.r, D.cy, discAt.z, _b);
      discAt.x = c.x; discAt.y = c.y; discAt.r = e.distanceTo(c);
      disc.scale.setScalar(discAt.r); discShadow.scale.setScalar(discAt.r);
    }

    // particles fill the visible volume once
    if (!dust) {
      const c = hit(W / 2, H / 2, -1, _a);
      const vh = 2 * tanHalf * (dist + 1), vw = vh * (W / H);
      dust = kit.particles({ count: 170, box: [vw * 1.1, vh * 1.1, 5], center: [c.x, c.y, -1.5], size: 0.024 * avgS / 1.5 * 1.5, opacity: 0.36, drift: 0.14, fade: [dist * 0.6, dist + 12], speed: 0.7 });
      world.add(dust);
    }
    laidOut = true;
  }

  /* ---------------------------------------------------------------- state */
  let focus = -1, paused = false;
  const walk = { t: 0 };                // door 0: the person steps through (0 outside → 1 inside)
  const team = new Float32Array(2);     // door 1: the two who join
  const fan = { t: 0 };                 // door 2
  const pair = { t: 0, draw: 1, redraw: 0 };  // door 3

  function update(c) {
    if (!laidOut) layout();
    if (!laidOut) return;
    const settled = c.settled || c.static;
    const dt = settled ? 1 : c.delta;
    const t = settled ? 0 : c.time;
    const snap = settled;
    const k = (lambda) => (snap ? 1 : 1 - Math.exp(-lambda * dt));
    const intro = ctx.options.intro !== false;
    const I = (d0, dur, fn = ease.outExpo) => (intro ? kit.intro(d0, dur, fn) : 1);

    // doorways: rise in, step forward when focused, turn toward the pointer
    for (const dr of doors) {
      const on = dr.i === focus ? 1 : 0;
      dr.on += (on - dr.on) * k(6);
      const rise = I(0.12 + dr.i * 0.11, 1.25);
      const s = dr.s;
      dr.rig.position.set(dr.x, dr.y - (1 - rise) * 0.32 * s + dr.on * 0.015 * s, dr.on * 0.22 * s - (focus >= 0 && !on ? 0.06 * s : 0));
      dr.rig.rotation.set(-c.pointer.y * 0.035, dr.baseRy + c.pointer.x * 0.16 + (1 - rise) * 0.5, 0);
      const op = clamp01(rise * 1.6);
      if (op < 0.999) { dr.mat.transparent = true; dr.mat.opacity = op; dr.shadow.material.opacity = 0.42 * op; }
      else if (dr.mat.transparent) { dr.mat.transparent = false; dr.mat.opacity = 1; dr.shadow.material.opacity = 0.42; }
      dr.motif.visible = rise > 0.2;
    }

    // 0 · the first person steps through the door
    const wT = focus === 0 ? 1 : 0;
    walk.t += (wT - walk.t) * k(2.6);
    {
      const pop = outBack(I(0.75, 0.7, ease.linear));
      const w = ease.inOutSine(walk.t);
      const bob = settled ? 0 : Math.abs(Math.sin(walk.t * Math.PI * 3)) * 0.018 * (walk.t > 0.02 && walk.t < 0.98 ? 1 : 0);
      m0.setPosition(0, walkX - w * walkX, bob, walkZ - w * (walkZ + 0.05));
      m0.ry[0] = 0.35 + Math.sin(w * Math.PI) * 0.7 - w * 0.35;
      m0.setScale(0, Math.max(0.001, pop));
      m0.update();
    }

    // 1 · the team: grows, and two more join
    {
      const on = focus === 1 ? 1 : 0;
      for (let j = 0; j < 3; j++) {
        const pop = outBack(I(0.8 + j * 0.09, 0.7, ease.linear));
        m1.setScale(j, Math.max(0.001, pop * (1 + doors[1].on * 0.06 * (j + 1) / 3)));
        m1.setPosition(j, TEAM[j].p[0], doors[1].on * 0.012 * (j + 1), TEAM[j].p[2]);
      }
      for (let j = 0; j < 2; j++) {
        team[j] += (on - team[j]) * k(on ? 5 - j * 1.4 : 7);
        m1.setScale(3 + j, Math.max(0.001, outBack(clamp01(team[j]))));
      }
      m1.update();
    }

    // 2 · the documents fan out
    {
      const on = focus === 2 ? 1 : 0;
      fan.t += (on - fan.t) * k(5);
      const f = ease.inOutSine(clamp01(fan.t));
      cards.forEach((cd, j) => {
        const pop = outBack(I(0.85 + j * 0.08, 0.7, ease.linear));
        cd.pivot.scale.setScalar(Math.max(0.001, pop));
        cd.pivot.position.set(cd.x + (cd.xOn - cd.x) * f, 1 / 56 + (j === 2 ? f * 0.03 : 0), cd.z + (j === 2 ? f * 0.05 : 0));
        cd.pivot.rotation.set(0, (j === 2 ? -0.12 : 0.08) * f, cd.rz + (cd.rzOn - cd.rz) * f);
      });
    }

    // 3 · two people and the arc between them (re-draws on focus)
    {
      const on = focus === 3 ? 1 : 0;
      pair.t += (on - pair.t) * k(4);
      if (on && pair.redraw === 0) pair.redraw = 0.0001;
      if (!on) pair.redraw = 0;
      if (pair.redraw > 0 && !settled) pair.redraw = Math.min(1, pair.redraw + dt / 1.0);
      const drawIntro = I(1.05, 1.1, ease.inOutCubic);
      const draw = pair.redraw > 0 && !settled ? ease.inOutCubic(pair.redraw) : drawIntro;
      setArc(draw);
      arcDot.scale.setScalar(Math.max(0.001, outBack(clamp01((draw - 0.8) / 0.2))));
      const close = ease.inOutSine(clamp01(pair.t)) * 0.022;
      for (let j = 0; j < 2; j++) {
        const pop = outBack(I(0.8 + j * 0.1, 0.7, ease.linear));
        m3.setScale(j, Math.max(0.001, pop));
        m3.setPosition(j, (j ? 0.132 - close : -0.132 + close), 0, -0.03);
      }
      m3.update();
    }

    // the line draws through every threshold
    const lp = I(0.45, 2.1, ease.inOutCubic);
    lines.forEach((l, j) => setLine(l, clamp01(lp * 1.05 - j * 0.05)));

    // scroll: as the hero leaves, the row lifts a little and leans back, the disc drifts at its own depth
    const ex = settled ? 0 : ease.inOutSine(clamp01(c.scroll.exit * 1.4));
    world.position.y = ex * 0.16 * avgS;
    world.rotation.x = -ex * 0.1;

    // the disc slides in from the edge
    if (discAt.on) {
      const d = I(0.1, 1.8);
      discRig.position.set(discAt.x + (1 - d) * discAt.r * 0.9 + c.pointer.x * 0.06 * avgS, discAt.y + (1 - d) * discAt.r * 0.35 + c.pointer.y * 0.04 * avgS + ex * 0.45 * avgS, discAt.z);
      discRig.rotation.set(c.pointer.y * 0.04, -0.12 + c.pointer.x * 0.08, 0);
    }

    // idle life
    if (!settled) {
      doors[1].motif.position.y = Math.sin(t * 0.9) * 0.004;
      arcDot.position.y = (56 - 27.4) / 56 + Math.sin(t * 1.6) * 0.006;
    }

    // light: follows the pointer, then settles on the focused doorway
    lights.update(c);
    const fd = focus >= 0 ? doors[focus] : null;
    const gx = fd ? fd.x : c.pointer.x * 2.2 * avgS, gy = (fd ? fd.y : pivotY) + 1.1 * avgS, gz = 2.6 * avgS;
    if (snap) glow.position.set(gx, gy, gz);
    else { glow.position.x = damp(glow.position.x, gx, 4, dt); glow.position.y = damp(glow.position.y, gy, 4, dt); glow.position.z = gz; }
    const gi = (fd ? 7 : 3.5) * avgS * avgS;
    glow.intensity = snap ? gi : damp(glow.intensity, gi, 4, dt);

    if (dust) { dust.update(c); dust.material.uniforms.uOpacity.value = 0.36 * I(0.6, 1.6, ease.outCubic); }
    kit.updateFloaters(t);
  }

  function resize(c) { layout(); update(c); }

  ctx.onDispose(() => { for (const l of lines) l.geo.dispose(); lines.length = 0; });
  layout();
  update(ctx);

  return {
    update, resize,
    degrade() { if (dust) dust.visible = false; },
    api: {
      setFocus(i) { focus = typeof i === 'number' && i >= 0 && i < 4 ? i : -1; ctx.invalidate(); },
      relayout() { layout(); ctx.invalidate(); },
      setPaused(v) { paused = !!v; },
      get focus() { return focus; },
    },
  };
}
