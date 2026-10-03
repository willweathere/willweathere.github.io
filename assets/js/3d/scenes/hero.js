/**
 * Homepage hero world — "the logo transformed into a world".
 *
 * Anchor: the 3D doorway arch + figure. Around it: frosted glass document panels (the Starter Pack
 * documents) floating in depth, the terracotta disc and the cream-rimmed sage arch as large
 * background forms with soft paper-layer shadows, the flowing terracotta line sweeping through,
 * a quiet constellation of connected people/organisation nodes, and fine particles.
 *
 * sceneOptions:
 *   focus:    'auto' | 'right' | 'center' | 'bottom'
 *             right  — world right of centre, clean space for a left-hand headline (desktop)
 *             center — world centred in its own stage box (e.g. a block under the copy on phones)
 *             bottom — full-bleed behind the copy on portrait screens; world sits low and smaller
 *             auto   — right for landscape boxes, center for portrait boxes
 *   density:  'auto' | 'full' | 'light'     (light: fewer panels/nodes/particles; auto = light on portrait/low tier)
 *   avoid:    element | selector            the headline copy block; in 'right' focus the world frames itself
 *                                           in the free space right of its rendered text (re-measured on resize)
 *   safeLeft: px | fraction                 fallback reserved width on the left when no `avoid` (default 0.42)
 *   anchor:   [ndcX, ndcY]                  override where the arch sits in the frame
 *   scale:    number                         extra size multiplier for the whole world (default 1)
 *   intro:    boolean                        play the entrance choreography (default true)
 *   scroll:   boolean                        camera dolly/lift while the hero scrolls out (default true)
 *
 * api: { setFocus(focus), setPaused(bool) }
 */
import { createKit, COLORS, ease, clamp01, shiftView, layouts } from '../kit.js';

// Starter Pack documents (exact titles from the brief).
const DOCS = [
  { number: '01', title: 'Employee Handbook', variant: 'text', lines: 9 },
  { number: '02', title: 'Essential HR Policies', variant: 'checklist', lines: 5, checked: 3 },
  { number: '03', title: 'Disciplinary & Grievance Procedures', variant: 'text', lines: 7 },
  { number: '06', title: 'Manager Guidance Documents', variant: 'text', lines: 8 },
  { number: '07', title: 'HR Templates and Forms', variant: 'form', lines: 3 },
];

// World-local composition (the arch is the origin). Units ≈ metres at a 14m camera distance.
// Mirrors the brand artwork: disc entering from the top-right, the cream-rimmed sage arch rising
// from the bottom-left, and the line rising from behind the sage form, passing under the mark and
// leaving past the disc's rim.
const L = {
  arch: { height: 2.8, rotY: -0.14, rotX: 0.02 },
  disc: { pos: [3.6, 2.95, -4.2], radius: 2.95, thickness: 0.24 },
  rim: { pos: [-2.35, -4.1, -2.8], width: 3.1, height: 1.9, below: 6, rim: 0.15, depth: 0.22 },
  panels: [
    // pos, size [w,h], rot [x,y,z], doc index, parallax weight, kept in light density
    { pos: [-2.15, 0.66, 0.9], size: [1.0, 1.36], rot: [0.03, 0.5, -0.045], doc: 0, w: 1.0, keep: true },
    { pos: [1.95, -0.7, 1.25], size: [0.94, 1.28], rot: [-0.04, -0.52, 0.04], doc: 1, w: 1.15, keep: true },
    { pos: [1.3, 1.42, -1.95], size: [1.1, 1.5], rot: [0.04, -0.26, 0.05], doc: 2, w: 0.55, keep: true },
    { pos: [-3.0, 2.05, -2.6], size: [0.9, 1.22], rot: [0.02, 0.36, 0.05], doc: 4, w: 0.45, keep: false },
  ],
  // starts hidden behind the rimmed arch, skims under the mark, leaves past the disc's lower rim
  line: [
    [-3.6, -2.75, -3.6], [-2.3, -2.45, -3.35], [-1.05, -2.2, -2.7], [0.1, -1.95, -1.1],
    [1.4, -1.62, 0.1], [2.55, -0.95, 0.3], [3.6, 0.15, -0.2], [4.8, 1.1, -1.0], [6.6, 1.75, -1.8], [9, 2.2, -2.4],
  ],
  // composition extents for framing (local units)
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

  const lights = kit.lights({
    key: 2.0, rim: 1.9, fill: 0.42, keyPos: [-4.5, 5.5, 8], rimPos: [4.5, 3, -5.5], follow: [2.4, 1.6],
    glow: 18, glowPos: [0.4, 1.2, 4.2], glowFollow: [3.6, 2.4],
  });
  scene.add(lights.group);

  // Layers (for per-layer parallax + scroll)
  const world = new THREE.Group();      // pointer rotation + framing scale
  const back = new THREE.Group();       // disc, rimmed arch
  const mid = new THREE.Group();        // arch mark, line, network
  const front = new THREE.Group();      // glass panels
  world.add(back, mid, front);
  scene.add(world);

  let light = false;
  const applyDensity = () => {
    const portrait = ctx.size.aspect < 0.95;
    light = opts.density === 'light' || (opts.density === 'auto' && (portrait || q.tier === 'low'));
  };
  applyDensity();

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
  const line = kit.flowLine({ points: L.line, radius: 0.024, taper: [0.2, 0.05], tubularSegments: 480 });
  mid.add(line.group);

  /* ---- people / organisation constellation ----------------------------------------------------- */
  const net = layouts.constellation({
    count: Math.round((light ? 18 : 30) * q.nodeScale), radius: [4.6, 2.9, 0.9], center: [0.7, 0.45, -2.9],
    seed: 21, k: 2, minDist: 0.7, size: [0.022, 0.05], palette: ['cream', 'sage', 'sage', 'cream', 'sage', 'terracotta'],
    reject: (p) => (p[0] > 1.7 && p[1] > 0.3) || (p[0] > -1.5 && p[0] < 1.5 && p[1] < -1.2), // keep the disc face and the line's path clear
  });
  const network = kit.network({ nodes: net.nodes, links: net.links, lineColor: 'sage', lineOpacity: 0.2, shading: 'flat' });
  mid.add(network.group);

  /* ---- glass document panels ------------------------------------------------------------------- */
  const panels = [];
  for (const p of L.panels) {
    const doc = DOCS[p.doc];
    const card = kit.card({
      width: p.size[0], height: p.size[1], depth: 0.035, radius: 0.07, style: 'glass',
      face: { ...doc, kicker: 'HR Starter Pack', seed: p.doc * 7 + 3, titleScale: 0.095 },
      glass: { roughness: 0.32, opacity: 0.12, thickness: 0.35 },
      textureSize: 512, // panels are small on screen: 512² faces are ample (1.4 MB each with mips)
    });
    const rig = new THREE.Group();
    rig.position.set(...p.pos);
    rig.rotation.set(...p.rot);
    rig.add(card.group);
    front.add(rig);
    kit.floater(card.group, { amp: 0.05, speed: 0.33 + panels.length * 0.04, rot: 0.02 });
    panels.push({ rig, card, cfg: p, base: new THREE.Vector3(...p.pos) });
  }

  /* ---- particles --------------------------------------------------------------------------------- */
  const dust = kit.particles({ count: light ? 220 : 420, box: [12, 9, 8], center: [1.6, 0.4, -1.8], size: 0.028, opacity: 0.45, drift: 0.2, fade: [9, 30], speed: 0.8 });
  mid.add(dust);

  const applyVisibility = () => {
    for (const p of panels) p.rig.visible = !light || p.cfg.keep;
    network.group.visible = true;
  };
  applyVisibility();

  /* ---- framing ----------------------------------------------------------------------------------- */
  const frame = { dist: 14, anchorX: 0.34, anchorY: 0.0, scale: 1 };
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  // Where the headline copy ends (px from the stage's left), measured from its rendered text boxes.
  const avoidEl = typeof opts.avoid === 'string' ? document.querySelector(opts.avoid) : opts.avoid || null;
  const range = avoidEl ? document.createRange() : null;
  const copyRight = () => {
    if (!avoidEl || !avoidEl.isConnected) return null;
    range.selectNodeContents(avoidEl);
    const r = range.getBoundingClientRect(), cr = ctx.container.getBoundingClientRect();
    if (!r.width || r.bottom < cr.top + 40 || r.top > cr.bottom - 40) return null; // copy not beside the stage
    return r.right - cr.left;
  };
  // Screen-space extents of the composition around the arch at z = 0 (perspective included).
  const SPAN_L = 2.95, SPAN_R = 2.45;

  const layout = () => {
    const a = ctx.size.aspect;
    const portrait = a < 0.95;
    const focus = opts.focus === 'auto' ? (portrait ? 'center' : 'right') : opts.focus;
    const E = L.extent;
    let H;
    if (focus === 'right') {
      // Frame inside the space right of the copy: arch ≈ 38% of the height when there is room,
      // shrinking (to a floor of 26%) when the free width is narrow (e.g. 1024×768).
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
    } else if (focus === 'bottom') {
      // full-bleed behind copy on portrait screens: world low and quieter, text keeps the top
      const byWidth = (E.w * 0.86) / a;
      H = Math.max(byWidth, L.arch.height / 0.24);
      frame.anchorX = -0.04;
      frame.anchorY = -0.42;
    } else {
      // centred in its own stage box: arch ≈ 40% of the box, outer forms crop at the edges
      const byWidth = (E.w * 0.62) / a;
      H = Math.max(byWidth, L.arch.height / 0.4);
      frame.anchorX = portrait ? -0.06 : 0;
      frame.anchorY = -0.04;
    }
    if (opts.anchor) { frame.anchorX = opts.anchor[0]; frame.anchorY = opts.anchor[1]; }
    H /= opts.scale || 1;
    frame.dist = H / (2 * tanHalf);
    scene.fog.near = frame.dist + 2.5;
    scene.fog.far = frame.dist + 22;
    applyDensity();
    applyVisibility();
  };

  /* ---- state --------------------------------------------------------------------------------------- */
  const camTarget = new THREE.Vector3();
  let paused = false, disposed = false;
  const I = (d, dur, fn) => (opts.intro ? kit.intro(d, dur, fn) : 1); // intro progress (created once)

  function update(c) {
    const t = c.time;
    const settled = c.settled || c.static;
    const px = c.pointer.x, py = c.pointer.y;   // engine supplies 0 (or a preview) when settled
    const sc = opts.scroll ? c.scroll.exit : 0;

    // intro choreography (all 1 when settled, or when sceneOptions.intro === false)
    const iArch = I(0.05, 1.9, ease.outExpo);
    const iHead = I(0.45, 1.6, ease.outExpo);
    const iDisc = I(0.0, 2.4, ease.outExpo);
    const iRim = I(0.15, 2.4, ease.outExpo);
    const iLine = I(0.25, 2.8, ease.inOutCubic);
    const iNet = I(0.6, 2.2, ease.outCubic);

    // camera: dolly in + lift as the hero scrolls away
    const s = ease.inOutSine(clamp01(sc));
    camera.position.set(px * 0.35, py * 0.22 + s * 1.3, frame.dist * (1 - s * 0.2));
    camTarget.set(0, s * 0.9, 0);
    camera.lookAt(camTarget);

    // pointer: whole world turns subtly; layers counter-drift for depth
    world.rotation.y = px * 0.13 + (1 - iArch) * -0.08;
    world.rotation.x = -py * 0.06;

    // background forms
    discRig.position.set(L.disc.pos[0] + (1 - iDisc) * 0.9 - px * 0.12, L.disc.pos[1] + (1 - iDisc) * 0.7 + s * 1.1 - py * 0.06, L.disc.pos[2]);
    discRig.rotation.set(0.05 + py * 0.03, -0.18 + px * 0.05, 0);
    rimRig.position.set(L.rim.pos[0] - px * 0.1, L.rim.pos[1] - (1 - iRim) * 1.4 - s * 0.9, L.rim.pos[2]);

    // arch mark
    markHolder.position.set(0, (1 - iArch) * -0.35, 0);
    markHolder.scale.setScalar(0.94 + 0.06 * iArch);
    if (mark.head) mark.head.scale.setScalar(Math.max(0.001, iHead));
    kit.updateFloaters(settled ? 0 : t, settled ? 0 : 1);

    // glass panels: pointer parallax weighted by layer, spread slightly on scroll
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const ip = I(0.35 + i * 0.12, 2.0, ease.outExpo);
      const w = p.cfg.w;
      const dir = Math.sign(p.base.x) || 1;
      p.rig.position.set(
        p.base.x + px * 0.18 * w + dir * s * 0.7 * w,
        p.base.y + py * 0.1 * w - (1 - ip) * 0.5 + s * 0.4 * w,
        p.base.z - (1 - ip) * 1.2 + s * 0.8 * w,
      );
    }

    // line
    line.setProgress(iLine);

    // network: drift + staggered scale-in
    network.drift(settled ? 0 : t, 0.07, 0.3);
    for (let i = 0; i < network.count; i++) network.mult[i] = Math.max(0.001, clamp01(iNet * 1.6 - (i / network.count) * 0.6));
    network.update();
    network.lines.material.opacity = 0.2 * iNet;

    dust.update(c);
    dust.material.uniforms.uOpacity.value = 0.45 * I(0.2, 2.5, ease.outCubic);
    lights.update(c);
  }

  function resize(c) {
    layout();
    shiftView(camera, frame.anchorX, frame.anchorY, c.size.width, c.size.height);
  }

  resize(ctx);
  update(ctx);
  // Headline metrics change once webfonts land: re-frame.
  if (avoidEl && document.fonts) document.fonts.ready.then(() => { if (!disposed) { resize(ctx); ctx.invalidate(); } });

  return {
    update: (c) => { if (!paused) update(c); },
    resize,
    degrade() { dust.visible = false; },
    dispose() { disposed = true; },
    api: {
      setFocus(f) { opts.focus = f; resize(ctx); ctx.invalidate(); },
      setPaused(v) { paused = !!v; },
    },
  };
}
