/**
 * Homepage hero world — "the logo transformed into a world". The homepage's own art-directed fork of scenes/hero.js.
 *
 * Anchor: the 3D doorway arch + figure. Around it: frosted glass Starter Pack documents floating in depth (each one is
 * a real link to its document on /hr-starter-pack/ — hover lifts it, click opens it), the terracotta disc and the
 * cream-rimmed sage arch as background forms with soft paper-layer shadows, the flowing terracotta line sweeping
 * through, a quiet constellation of connected nodes, and fine particles. Every glass document sits on navy — never
 * over the disc or the arch — so its cream type stays legible.
 *
 * sceneOptions:
 *   focus:    'right' | 'top' | 'center' | 'bottom' | 'auto'
 *             right  — world right of the headline copy (desktop / landscape)
 *             top    — a wide band ABOVE the copy (phones + portrait tablets): arch left of centre, disc entering
 *                      from the top-right, two documents pulled inside the frame, no rimmed arch
 *             center — world centred in its own stage box
 *             bottom — full-bleed behind copy, world low and smaller
 *             auto   — right for landscape boxes, center for portrait boxes
 *   density:  'auto' | 'full' | 'light'
 *   avoid:    element | selector   the headline copy block (right focus frames the world in the free space beside it)
 *   floor:    element | selector   the next section (its domed edge): the rimmed arch rises clear of it
 *   safeLeft, anchor, scale, intro (default true), scroll (default true), introDelay, introSpeed
 *   link:     (index, doc) => void   called when a document is clicked (the page navigates through its transition)
 *
 * Emits on the container: hc3d:panel-hover { index, href } (index -1 when nothing is under the pointer).
 * api: { setFocus(focus), setPaused(bool), hovered() }
 * Review helper (screenshots only): ?shot=1&intro-t=<seconds> renders the intro frame at that time.
 */
import { createKit, COLORS, ease, clamp01, shiftView, layouts, damp } from '../kit.js';

const QS = new URLSearchParams(location.search);
const PREVIEW_T = QS.has('shot') && QS.has('intro-t') ? Math.max(0, +QS.get('intro-t') || 0) : null;
// gentle overshoot for the head landing in the doorway (the one "spring" in the world)
const outBack = (t) => { const c1 = 1.45, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// Starter Pack documents (exact titles from the brief) → their anchors on /hr-starter-pack/
const DOCS = [
  { number: '01', title: 'Employee Handbook', variant: 'cover', href: '/hr-starter-pack/#doc-01' },
  { number: '02', title: 'Essential HR Policies', variant: 'cover', href: '/hr-starter-pack/#doc-02' },
  { number: '03', title: 'Disciplinary & Grievance Procedures', variant: 'cover', href: '/hr-starter-pack/#doc-03' },
];

// World-local composition (the arch is the origin). Units ≈ metres at a 14m camera distance.
const L = {
  arch: { height: 2.8, rotY: -0.08, rotX: 0.02 },
  disc: { pos: [3.6, 2.95, -4.2], radius: 2.95, thickness: 0.24 },
  // the cream-rimmed sage arch: lower-left of the world, tucked behind the doorway's left leg (as in the profile art)
  rim: { pos: [-1.95, -3.3, -2.2], width: 1.55, height: 1.05, below: 6, rim: 0.11, depth: 0.2 },
  panels: [
    // pos, size [w,h], rot [x,y,z], doc index, parallax weight, kept in light density
    { pos: [-2.2, 0.72, 0.9], size: [1.0, 1.36], rot: [0.03, 0.5, -0.045], doc: 0, w: 1.0, keep: true },
    { pos: [2.2, -1.08, 1.25], size: [0.94, 1.28], rot: [-0.04, -0.52, 0.04], doc: 1, w: 1.15, keep: true },
    { pos: [-1.25, 2.72, -2.4], size: [1.0, 1.36], rot: [0.04, 0.22, 0.06], doc: 2, w: 0.45, keep: false },
  ],
  // starts hidden behind the rimmed arch, skims under the mark, leaves past the disc's lower rim
  line: [
    [-3.2, -2.3, -2.6], [-2.2, -2.15, -2.2], [-1.05, -2.02, -1.6], [0.1, -1.85, -0.6],
    [1.4, -1.6, 0.1], [2.55, -0.95, 0.3], [3.6, 0.15, -0.2], [4.8, 1.1, -1.0], [6.6, 1.75, -1.8], [9, 2.2, -2.4],
  ],
  extent: { w: 7.6, h: 5.8 },
};

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  const q = ctx.quality;
  const opts = { focus: 'auto', density: 'auto', anchor: null, scale: 1, intro: true, scroll: true, ...ctx.options };
  await kit.ready;

  kit.environment({ intensity: 0.5 });
  scene.fog = new THREE.Fog(COLORS.navy, 16, 34);
  await ctx.yield?.();

  const lights = kit.lights({
    key: 2.0, rim: 1.9, fill: 0.42, keyPos: [-4.5, 5.5, 8], rimPos: [4.5, 3, -5.5], follow: [2.4, 1.6],
    glow: 18, glowPos: [0.4, 1.2, 4.2], glowFollow: [3.6, 2.4],
  });
  scene.add(lights.group);
  const glowBase = lights.point ? lights.point.intensity : 0;
  const keyBase = lights.key.intensity;

  const world = new THREE.Group();      // pointer rotation + framing scale
  const back = new THREE.Group();       // disc, rimmed arch
  const mid = new THREE.Group();        // arch mark, line, network
  const front = new THREE.Group();      // glass panels
  world.add(back, mid, front);
  scene.add(world);

  let light = false;
  let focusNow = 'right';
  const applyDensity = () => {
    const portrait = ctx.size.aspect < 0.95;
    light = opts.density === 'light' || (opts.density === 'auto' && (portrait || focusNow === 'top' || q.tier === 'low'));
  };

  /* ---- background forms ------------------------------------------------------------------------ */
  const disc = kit.disc({ radius: L.disc.radius, thickness: L.disc.thickness, emissive: 0.1 });
  const discRig = new THREE.Group();
  discRig.position.set(...L.disc.pos);
  discRig.add(disc);
  const discShadow = kit.softShadow({ shape: 'circle', width: L.disc.radius * 2, height: L.disc.radius * 2, blur: 0.11, opacity: 0.7 });
  discShadow.position.set(0.1, -0.32, -0.16);
  discRig.add(discShadow);
  back.add(discRig);

  const rim = kit.rimmedArch({ width: L.rim.width, height: L.rim.height, below: L.rim.below, rim: L.rim.rim, depth: L.rim.depth, emissive: 0.14 });
  const rimRig = new THREE.Group();
  rimRig.position.set(...L.rim.pos);
  rimRig.rotation.y = 0.16;
  rimRig.add(rim.group);
  const rimShadow = kit.softShadow({ shape: 'arch', width: L.rim.width, height: L.rim.height + L.rim.below, blur: 0.07, opacity: 0.5 });
  rimShadow.position.set(0.1, (L.rim.height - L.rim.below) / 2 - 0.16, -0.2);
  rimRig.add(rimShadow);
  back.add(rimRig);
  await ctx.yield?.();

  /* ---- the mark: doorway arch + figure --------------------------------------------------------- */
  const mark = kit.archMark({ height: L.arch.height, depth: 12 });
  const markRig = new THREE.Group();
  markRig.rotation.set(L.arch.rotX, L.arch.rotY, 0);
  markRig.add(mark.group);
  const markShadow = kit.softShadow({ shape: 'arch', width: mark.width, height: L.arch.height, blur: 0.12, opacity: 0.42 });
  markShadow.position.set(0.16, -0.2, -0.75);
  const markHolder = new THREE.Group();
  markHolder.add(markShadow, markRig);
  mid.add(markHolder);
  kit.floater(markRig, { amp: 0.035, speed: 0.42, rot: 0.012 });

  /* ---- flowing line ----------------------------------------------------------------------------- */
  let line = null, lineLift = null;
  const LINE_W = [1, 0.8, 0.45, 0.12];
  const makeLine = (lift) => {
    if (line && Math.abs(lift - lineLift) < 0.06) return;
    const pts = L.line.map((p, i) => [p[0], p[1] + lift * (LINE_W[i] || 0), p[2]]);
    const prog = line ? line.progress : 0;
    if (line) kit.release(line.group);
    line = kit.flowLine({ points: pts, radius: 0.024, taper: [0.2, 0.05], tubularSegments: 480 });
    line.setProgress(prog);
    mid.add(line.group);
    lineLift = lift;
  };
  makeLine(0);

  /* ---- people / organisation constellation ----------------------------------------------------- */
  const net = layouts.constellation({
    count: Math.round(26 * q.nodeScale), radius: [4.6, 2.9, 0.9], center: [0.7, 0.45, -2.9],
    seed: 21, k: 2, minDist: 0.7, size: [0.022, 0.05], palette: ['cream', 'sage', 'sage', 'cream', 'sage', 'terracotta'],
    reject: (p) => (p[0] > 1.7 && p[1] > 0.3) || (p[0] > -1.5 && p[0] < 1.5 && p[1] < -1.2),
  });
  const network = kit.network({ nodes: net.nodes, links: net.links, lineColor: 'sage', lineOpacity: 0.2, shading: 'flat' });
  mid.add(network.group);
  await ctx.yield?.();

  /* ---- glass document panels ------------------------------------------------------------------- */
  const panels = [];
  const glassOpts = { roughness: 0.32, opacity: 0.2, thickness: 0.35 };
  for (const p of L.panels) {
    const doc = DOCS[p.doc];
    const card = kit.card({
      width: p.size[0], height: p.size[1], depth: 0.035, radius: 0.07, style: 'glass',
      face: { ...doc, kicker: 'HR Starter Pack', seed: p.doc * 7 + 3, titleScale: 0.095 },
      glass: glassOpts,
      textureSize: 512, // panels are small on screen: 512² faces are ample
    });
    const rig = new THREE.Group();
    rig.position.set(...p.pos);
    rig.rotation.set(...p.rot);
    rig.add(card.group);
    front.add(rig);
    kit.floater(card.group, { amp: 0.05, speed: 0.33 + panels.length * 0.04, rot: 0.02 });
    card.body.userData.panel = panels.length;
    if (card.face) card.face.userData.panel = panels.length;
    panels.push({ rig, card, cfg: p, doc, base: new THREE.Vector3(...p.pos), scale: 1, show: true, hover: 0 });
    await ctx.yield?.();
  }

  /* ---- particles --------------------------------------------------------------------------------- */
  const dust = kit.particles({ count: 380, box: [12, 9, 8], center: [1.6, 0.4, -1.8], size: 0.028, opacity: 0.45, drift: 0.2, fade: [9, 30], speed: 0.8 });
  mid.add(dust);

  /* ---- picking: documents are links ---------------------------------------------------------------- */
  const pickTargets = panels.map((p) => p.card.body);
  const picker = kit.picker(pickTargets, { every: 6 });
  const tapRay = new THREE.Raycaster(), tapNdc = new THREE.Vector2();
  let hovered = -1;

  /* ---- framing ----------------------------------------------------------------------------------- */
  const frame = { dist: 14, anchorX: 0.34, anchorY: 0.0, H: 7 };
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const avoidEl = typeof opts.avoid === 'string' ? document.querySelector(opts.avoid) : opts.avoid || null;
  const range = avoidEl ? document.createRange() : null;
  const hiddenText = (n) => { const p = n.parentElement; return !p || !!p.closest('.sr-only, [hidden]'); };
  const copyRight = () => {
    if (!avoidEl || !avoidEl.isConnected) return null;
    const cr = ctx.container.getBoundingClientRect();
    let right = -Infinity, top = Infinity, bottom = -Infinity;
    const add = (r) => { if (r.width < 1 || r.height < 1) return; right = Math.max(right, r.right); top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); };
    const walker = document.createTreeWalker(avoidEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || hiddenText(n)) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }
    for (const el of avoidEl.querySelectorAll('a, button')) add(el.getBoundingClientRect());
    if (right === -Infinity || bottom < cr.top + 40 || top > cr.bottom - 40) return null;
    return right - cr.left;
  };
  const SPAN_L = 3.05, SPAN_R = 2.45;
  const discBase = new THREE.Vector3(...L.disc.pos);
  let discScale = 1;

  // The rimmed sage arch rises from the lower-left, behind the doorway's left leg. Beside the copy its crown is kept
  // clear of the next section's domed edge (≥ 24px plus the stage's bottom fade), so the two cream forms never touch.
  const floorEl = typeof opts.floor === 'string' ? document.querySelector(opts.floor) : opts.floor || null;
  const _p = new THREE.Vector3();
  let rimLift = 0;
  const fitRim = (c) => {
    rimLift = 0;
    if (focusNow !== 'right' || !floorEl || !floorEl.isConnected) return;
    const cr = ctx.container.getBoundingClientRect();
    const fr = floorEl.getBoundingClientRect();
    const W = c.size.width, Hh = c.size.height;
    let floorPx = fr.top - cr.top;
    if (floorPx > Hh + 8 || floorPx < Hh * 0.35) return;
    camera.position.set(0, 0, frame.dist); camTarget.set(0, 0, 0); camera.lookAt(camTarget); camera.updateMatrixWorld();
    const top = L.rim.pos[1] + L.rim.height;
    _p.set(L.rim.pos[0], top, L.rim.pos[2]).project(camera);
    const topPx = (1 - _p.y) * 0.5 * Hh, xPx = (_p.x + 1) * 0.5 * W;
    _p.set(L.rim.pos[0], top - 1, L.rim.pos[2]).project(camera);
    const unitPx = (1 - _p.y) * 0.5 * Hh - topPx;
    if (!(unitPx > 0)) return;
    const brv = getComputedStyle(floorEl).borderTopLeftRadius.split(' ');
    const dome = parseFloat(brv[1] || brv[0]) || 0;
    const dx = Math.min(1, Math.abs((cr.left + xPx - fr.left) / Math.max(1, fr.width) - 0.5) * 2);
    floorPx += dome * (1 - Math.sqrt(1 - dx * dx));
    // crown at ≈ 70% of the stage (and never within a rim-width of the floor): the stage's bottom fade dissolves its
    // sides into navy well before the section edge, so the sage form never meets the next ground
    const want = Math.min(Hh * 0.6, floorPx - Math.max(dome * 1.15 + 24, L.rim.width * unitPx * 1.1));
    rimLift = Math.max(-4, Math.min(1.6, (topPx - want) / unitPx));
  };
  const fitRimAndLine = (c) => { fitRim(c); makeLine(rimLift); };

  const layout = () => {
    const a = ctx.size.aspect;
    const portrait = a < 0.95;
    const focus = opts.focus === 'auto' ? (portrait ? 'center' : 'right') : opts.focus;
    focusNow = focus;
    const E = L.extent;
    let H;
    if (focus === 'right') {
      const W = ctx.size.width, Hp = ctx.size.height;
      let safe = copyRight();
      if (safe == null) safe = opts.safeLeft != null ? (opts.safeLeft <= 1 ? opts.safeLeft * W : opts.safeLeft) : W * 0.42;
      else safe += W * 0.025;
      const avail = Math.max(1, W * 0.985 - safe);
      const ppu = Math.max((Hp * 0.26) / L.arch.height, Math.min((Hp * 0.38) / L.arch.height, avail / (SPAN_L + SPAN_R)));
      const slack = Math.max(0, avail - (SPAN_L + SPAN_R) * ppu);
      const archX = safe + slack * 0.4 + SPAN_L * ppu;
      frame.anchorX = Math.min(0.72, (archX / W) * 2 - 1);
      frame.anchorY = -0.02;
      H = Hp / ppu;
    } else if (focus === 'top') {
      // a wide band above the copy: the arch ≈ 56% of the band, left of centre; everything else fits inside
      H = Math.max(L.arch.height / 0.56, (E.w * 0.5) / a);
      frame.anchorX = a > 1.9 ? -0.3 : -0.22;
      frame.anchorY = -0.04;
    } else if (focus === 'bottom') {
      const byWidth = (E.w * 0.86) / a;
      H = Math.max(byWidth, L.arch.height / 0.24);
      frame.anchorX = -0.04;
      frame.anchorY = -0.42;
    } else {
      const byWidth = (E.w * 0.62) / a;
      H = Math.max(byWidth, L.arch.height / 0.4);
      frame.anchorX = portrait ? -0.06 : 0;
      frame.anchorY = -0.04;
    }
    if (opts.anchor) { frame.anchorX = opts.anchor[0]; frame.anchorY = opts.anchor[1]; }
    H /= opts.scale || 1;
    frame.H = H;
    frame.dist = H / (2 * tanHalf);
    scene.fog.near = frame.dist + 2.5;
    scene.fog.far = frame.dist + 22;

    // Frame edges in the z = 0 plane, relative to the arch (the origin); `at(X, Y, z)` gives the world point at depth z
    // that appears at (X, Y) of that plane — so forms at other depths can be placed against the frame edges exactly.
    const halfH = H / 2, halfW = halfH * a;
    const fL = (-1 - frame.anchorX) * halfW, fR = (1 - frame.anchorX) * halfW;
    const fB = (-1 - frame.anchorY) * halfH, fT = (1 - frame.anchorY) * halfH;
    const depthK = (z) => (frame.dist - z) / frame.dist;
    // disc: beside the copy it enters from the top-right corner; in the phone band it is a quarter disc entering from
    // the band's top-right corner (as in the email-banner art), above everything else
    let discR = 0;                                   // the disc's apparent radius in the z = 0 plane (phone band)
    if (focus === 'right') { discBase.set(L.disc.pos[0], L.disc.pos[1], L.disc.pos[2]); discScale = 1; }
    else if (focus === 'top') {
      const z = -1.4, k = depthK(z);
      discScale = 0.56;
      discR = (L.disc.radius * discScale) / k;
      discBase.set((fR - 0.05) * k, (fT - 0.1) * k, z);
    } else { discBase.set(3.05, 0.95, L.disc.pos[2]); discScale = 0.74; }
    rimRig.visible = focus !== 'top';

    applyDensity();
    // documents: in the band they are pulled inside the frame (whole, never cut by an edge), a little smaller, kept
    // ≥ 0.4 units clear of the arch and below the disc; a document with no room is simply not shown
    for (const p of panels) {
      p.show = !light || p.cfg.keep;
      if (focus === 'top') {
        p.scale = 0.72;
        const z = p.cfg.doc === 0 ? 0.4 : 0.3, k = depthK(z);
        const pw = (p.cfg.size[0] * p.scale) / k, ph = (p.cfg.size[1] * p.scale) / k;   // apparent size in the plane
        const m = halfW * 0.06, gap = 0.4, fadeTop = fB + H * 0.28;                        // band's bottom fade (home.css)
        let lo, hi, Y;
        if (p.cfg.doc === 0) { lo = fL + m + pw / 2; hi = -1.3 - gap - pw / 2; Y = 0.45; }
        else if (p.cfg.doc === 1) {
          lo = 1.3 + gap + pw / 2; hi = fR - m - pw / 2;
          const discBottom = fT - 0.1 - discR;
          Y = Math.min(discBottom - 0.3 - ph / 2, Math.max(fadeTop + ph / 2, -0.35));
          if (Y - ph / 2 < fadeTop - 0.05) p.show = false;
        } else { lo = 1; hi = 0; Y = 0; }
        if (lo > hi) p.show = false;
        const X = p.cfg.doc === 0 ? (lo + hi) / 2 : Math.min(hi, (lo + hi) / 2 + (hi - lo) * 0.2);
        p.base.set(X * k, Y * k, z);
      } else {
        p.scale = 1;
        p.base.set(...p.cfg.pos);
      }
    }
  };

  /* ---- state --------------------------------------------------------------------------------------- */
  const camTarget = new THREE.Vector3();
  let paused = false, disposed = false;
  const I = (d, dur, fn) => (opts.intro ? kit.intro(d, dur, fn) : 1);

  function update(c) {
    const t = c.time;
    const settled = c.settled || c.static;
    const px = c.pointer.x, py = c.pointer.y;
    const sc = opts.scroll ? c.scroll.exit : 0;
    const dt = settled ? 1 : c.delta;

    // Intro (all 1 when settled / intro:false): the doorway rises and turns to face you · the person arrives — head
    // and shoulders together, the head landing a beat later with one small spring (never a headless figure) · the
    // disc and the rimmed arch slide in · the line draws through · the documents drift forward · the network lights.
    const iArch = I(0.0, 1.7, ease.outExpo);
    const iTurn = I(0.0, 2.3, ease.outCubic);
    const iBody = I(0.35, 1.0, ease.outExpo);
    const iHead = I(0.3, 0.9, outBack);
    const iDisc = I(0.1, 2.3, ease.outExpo);
    const iRim = I(0.3, 2.2, ease.outExpo);
    const iLine = I(0.75, 2.5, ease.inOutCubic);
    const iNet = I(1.35, 2.0, ease.outCubic);
    const iLight = I(0.0, 2.6, ease.inOutSine);

    const s = ease.inOutSine(clamp01(sc));
    camera.position.set(px * 0.35, py * 0.22 + s * 1.3, frame.dist * (1 - s * 0.2));
    camTarget.set(0, s * 0.9, 0);
    camera.lookAt(camTarget);

    world.rotation.y = px * 0.13 + (1 - iTurn) * -0.1;
    world.rotation.x = -py * 0.06;

    discRig.position.set(discBase.x + (1 - iDisc) * 1.7 - px * 0.12, discBase.y + (1 - iDisc) * 1.25 + s * 1.1 - py * 0.06, discBase.z);
    discRig.scale.setScalar(discScale);
    discRig.rotation.set(0.05 + py * 0.03, -0.18 + px * 0.05, 0);
    rimRig.position.set(L.rim.pos[0] - px * 0.1, L.rim.pos[1] + rimLift - (1 - iRim) * 2.4 - s * 0.9, L.rim.pos[2]);

    markHolder.position.set(0, (1 - iArch) * -1.15, (1 - iArch) * -0.6);
    markHolder.rotation.y = (1 - iTurn) * -0.42;
    markHolder.scale.setScalar(0.9 + 0.1 * iArch);
    if (mark.body) { mark.body.scale.set(1, Math.max(0.001, iBody), 1); mark.body.visible = iBody > 0.02; }
    if (mark.head) { mark.head.scale.setScalar(Math.max(0.001, iHead)); mark.head.visible = iHead > 0.02 || iBody > 0.02; }
    kit.updateFloaters(settled ? 0 : t, settled ? 0 : 1);

    // pointer over a document: it lifts toward you and turns to face you (it is a link)
    const hit = !settled && c.pointer.inside && !c.pointer.touch ? picker.pick() : null;
    let hi = hit ? (hit.object.userData.panel ?? -1) : -1;
    if (hi >= 0 && !panels[hi].rig.visible) hi = -1;   // the raycaster does not skip hidden objects
    if (hi !== hovered) {
      hovered = hi;
      c.emit('panel-hover', { index: hi, href: hi >= 0 ? panels[hi].doc.href : null });
    }

    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const ip = I(0.55 + i * 0.16, 2.1, ease.outExpo);
      p.hover = settled ? 0 : damp(p.hover, i === hovered ? 1 : 0, 9, dt);
      const w = p.cfg.w;
      const dir = Math.sign(p.base.x) || 1;
      const out = 1 - ip;
      p.rig.position.set(
        p.base.x + px * 0.18 * w + dir * s * 0.7 * w + dir * out * 0.55,
        p.base.y + py * 0.1 * w - out * 0.7 + s * 0.4 * w + p.hover * 0.08,
        p.base.z - out * 3.2 + s * 0.8 * w + p.hover * 0.45,
      );
      p.rig.rotation.set((p.cfg.rot[0] + out * 0.35) * (1 - p.hover * 0.7), (p.cfg.rot[1] + dir * out * 0.5) * (1 - p.hover * 0.55), p.cfg.rot[2] * (1 - p.hover));
      p.rig.scale.setScalar(p.scale * (1 + p.hover * 0.04));
      p.rig.visible = ip > 0.002 && p.show;
    }

    line.setProgress(iLine);

    network.drift(settled ? 0 : t, 0.07, 0.3);
    for (let i = 0; i < network.count; i++) network.mult[i] = Math.max(0.001, clamp01(iNet * 1.6 - (i / network.count) * 0.6));
    network.update();
    network.lines.material.opacity = 0.2 * iNet;

    dust.update(c);
    dust.material.uniforms.uOpacity.value = 0.45 * I(0.4, 2.6, ease.outCubic) * (light ? 0.7 : 1);
    lights.update(c);
    if (lights.point) {
      lights.point.intensity = glowBase * (0.3 + 0.7 * iLight);
      lights.point.position.x -= (1 - iLight) * 3.4;
    }
    lights.key.intensity = keyBase * (0.55 + 0.45 * iLight);
  }

  function resize(c) {
    layout();
    shiftView(camera, frame.anchorX, frame.anchorY, c.size.width, c.size.height);
    fitRimAndLine(c);
  }

  resize(ctx);
  update(ctx);
  if (avoidEl && document.fonts) document.fonts.ready.then(() => { if (!disposed) { resize(ctx); ctx.invalidate(); } });

  const introDelay = +opts.introDelay || 0;
  const introSpeed = +opts.introSpeed || 1;
  const staticDesc = Object.getOwnPropertyDescriptor(ctx, 'static');
  const timed = (c) => {
    if (PREVIEW_T != null && (c.settled || c.static)) {
      const t = c.time, s = c.settled;
      Object.defineProperty(c, 'static', { get: () => false, configurable: true });
      c.settled = false; c.time = PREVIEW_T;
      try { update(c); } finally { c.time = t; c.settled = s; if (staticDesc) Object.defineProperty(c, 'static', staticDesc); }
      return;
    }
    if (!c.settled && (introDelay || introSpeed !== 1)) {
      const t = c.time;
      c.time = Math.max(0, (t - introDelay) * introSpeed);
      try { update(c); } finally { c.time = t; }
      return;
    }
    update(c);
  };

  return {
    update: (c) => { if (!paused) timed(c); },
    resize,
    // slow frames: frosted transmission glass → the cheap fresnel glass, and the dust goes
    degrade() {
      dust.visible = false;
      const cheap = kit.glass({ ...glassOpts, transmission: false });
      for (const p of panels) p.card.body.material = cheap;
    },
    dispose() { disposed = true; },
    api: {
      setFocus(f) { opts.focus = f; resize(ctx); ctx.invalidate(); },
      setPaused(v) { paused = !!v; },
      hovered: () => (hovered >= 0 ? panels[hovered].doc : null),
      /** The document under a viewport point (taps have no hover), or null. */
      pickAt(cx, cy) {
        const r = ctx.container.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        tapNdc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
        tapRay.setFromCamera(tapNdc, camera);
        const hits = tapRay.intersectObjects(pickTargets, true);
        for (const h of hits) { const i = h.object.userData.panel ?? -1; if (i >= 0 && panels[i].rig.visible) return panels[i].doc; }
        return null;
      },
    },
  };
}
