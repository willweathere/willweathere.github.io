/**
 * Service pages — "the service's world inside the doorway". One module, nine motifs (sceneOptions.motif), all built
 * only from the brand kit: the doorway arch, the person, the terracotta disc, the cream-rimmed sage arch, the flowing
 * line, paper documents, glass. Visual metaphors only — never invented deliverables.
 *
 *   motif        service (slug)                  what you see
 *   audit        hr-audits                       a cascade of documents; a glass lens reviews the front checklist,
 *                                                ticking rows as it passes and resting on the first open one (a gap)
 *   handbook     policies                        Starter Pack documents placed one by one into a neat cascade that
 *                                                breathes open into a fan; hover lifts a document
 *   dialogue     employee-relations              two people facing each other inside a rimmed arch, the line drawn
 *                                                between them meets at a terracotta point
 *   progress     performance                     three arch pillars grow in turn, a person on the tallest, the line rising past
 *   calm         absence-wellbeing               a person resting inside the rimmed arch, a low sun behind; very slow
 *   rows         workforce-planning              a planned team in three staggered rows seen from a lifted camera (camY), figures
 *                                                arriving one by one; the open places marked by sage rings
 *   restructure  organisational-change           an organisation of people easing between two structures
 *   advice       ad-hoc-hr                       a person and a cream note ("HR advice"); the line sweeps beneath the person and
 *                                                up to the note
 *   orbit        retained-support                the doorway mark with a ring of support circling it, continuously
 *
 * Framing: a 4.1 × 4.95 world box (the 5 : 6 doorway) centred on the origin; the top of the box is cut by the arch, so
 * big forms sit low or tuck into the curve like the brand art. Settled frame (reduced motion / ?shot=1) = the composed
 * end state of each motif. Pointer turns the world a little and moves the soft light; the hero leaving dollies in.
 * Budget per motif: ≤ ~25 draw calls, one card texture ≤ 1024², no per-frame allocation.
 * A motif builder returns { update(c, s), lookY?, tilt?, camY?, degrade? } — see docs/SERVICE_TEMPLATE.md §5.
 */
import { createKit, ease, clamp01, segment, lerp, layouts, extrude, archShape } from '../kit.js';

const FW = 4.1, FH = 4.95;

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const opts = { motif: 'audit', ...ctx.options };
  const kit = createKit(ctx);
  await kit.ready;                                   // canvas text (document faces) needs the brand fonts
  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({ key: 2.25, rim: 1.7, fill: 0.46, keyPos: [-4, 5, 7], rimPos: [5, 3, -5], glow: 8.5, glowPos: [0.3, 0.9, 4.6], glowFollow: [2.4, 1.8] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);
  const segs = (n) => Math.max(8, Math.round(n * ctx.quality.segmentScale));
  const S = { t: 0, settled: false, px: 0, py: 0, enter: 1, exit: 0, delta: 0.016 };
  const intro = (delay, dur, fn = ease.outExpo) => kit.intro(delay, dur, fn);
  const B = { THREE, kit, ctx, world, segs, intro };

  const build = MOTIFS[opts.motif] || MOTIFS.audit;
  const m = build(B);

  const dust = kit.particles({ count: 110, box: [5.2, 6, 4], center: [0, 0.2, -1.4], size: 0.024, opacity: 0.4, drift: 0.14, fade: [8, 22], speed: 0.6, seed: 7 });
  world.add(dust);

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist = 10;
  function resize(c) {
    const H = Math.max(FH, FW / Math.max(0.4, c.size.aspect));
    dist = H / (2 * tanHalf);
    camera.near = 0.1; camera.far = dist + 40; camera.updateProjectionMatrix();
  }

  function update(c) {
    S.settled = c.settled || c.static;
    S.t = S.settled ? 0 : c.time;
    S.delta = S.settled ? 1 : c.delta;
    S.px = c.pointer.x; S.py = c.pointer.y;
    S.enter = S.settled ? 1 : c.scroll.enter;
    S.exit = S.settled ? 0 : c.scroll.exit;
    m.update(c, S);
    const e = ease.inOutSine(clamp01(S.exit));
    camera.position.set(S.px * 0.22, 0.28 + (m.camY || 0) + S.py * 0.14 - e * 0.25, dist * (1 - e * 0.1));
    camera.lookAt(0, m.lookY ?? -0.12, 0);
    world.rotation.set(-S.py * 0.05 + (m.tilt || 0), S.px * 0.16 + e * 0.12, 0);
    kit.updateFloaters(S.t, S.settled ? 0 : 1);
    dust.update(c);
    lights.update(c);
  }

  resize(ctx);
  update(ctx);
  return { update, resize, degrade() { dust.visible = false; m.degrade?.(); } };
}

/* ------------------------------------------------------------------------------------------------ shared pieces */

/** Brand disc with its soft paper-layer shadow, in a rig (so it can slide in). */
function discRig(B, { r = 1.5, color = 'terracottaShape', at = [1.5, 1.6, -2.6], ry = -0.18 } = {}) {
  const { THREE, kit } = B;
  const rig = new THREE.Group();
  rig.position.set(...at);
  rig.rotation.set(0.04, ry, 0);
  const disc = kit.disc({ radius: r, thickness: 0.2, color, emissive: 0.1 });
  const sh = kit.softShadow({ shape: 'circle', width: r * 2, height: r * 2, blur: 0.11, opacity: 0.6 });
  sh.position.set(0.1, -0.24, -0.16);
  rig.add(sh, disc);
  rig.userData.base = rig.position.clone();
  return rig;
}
/** The flowing terracotta line (drawn on with progress). */
function line(B, points, o = {}) {
  return B.kit.flowLine({ points, radius: 0.026, taper: [0.2, 0.08], tubularSegments: 320, ...o });
}
function dot(B, r = 0.08, c = 'terracotta') {
  const { THREE, kit, segs } = B;
  return new THREE.Mesh(new THREE.SphereGeometry(r, segs(22), segs(16)), kit.clay(c, { roughness: 0.5, emissive: 0.18 }));
}
const pop = (v) => Math.max(0.0001, v);
const outBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);   // a small spring (lens, dots)

/* ------------------------------------------------------------------------------------------------ motifs */
const MOTIFS = {

  /* 01 · HR audits & compliance reviews — the lens reviews a checklist */
  audit(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.45, color: 'sageShape', at: [1.7, 1.78, -2.8], ry: -0.22 });
    world.add(sun);

    const W = 1.72, H = W * 1.414;
    const docs = new THREE.Group();
    docs.position.set(-0.1, -0.5, 0);
    world.add(docs);
    const mk = (face, style, textureSize) => kit.card({ width: W, height: H, style, face, textureSize });
    // the documents under review show only their left and top strips, so they carry no title (a clipped "Essen…"
    // reads as a glitch): mark, kicker, serif numeral, rule and text bars only
    const back = mk({ number: '01', kicker: 'HR Starter Pack', variant: 'text', lines: 11, seed: 4 }, 'paper', 512);
    const mid = mk({ number: '02', kicker: 'HR Starter Pack', variant: 'text', lines: 10, seed: 6 }, 'paper', 512);
    const face = { kicker: 'HR audit', title: 'Compliance review', titleScale: 0.075, variant: 'checklist', lines: 9, checked: 0, seed: 9 };
    const front = mk(face, 'cream');
    const place = [
      [back, [-0.72, 0.64, -0.95], [0.02, 0.24, 0.075]],
      [mid, [-0.37, 0.31, -0.48], [0.0, 0.14, 0.03]],
      [front, [0.16, -0.12, 0], [-0.03, -0.1, -0.05]],
    ];
    const rigs = place.map(([cd, p, r]) => {
      const rig = new THREE.Group();
      rig.position.set(...p); rig.rotation.set(...r);
      const sh = kit.softShadow({ shape: 'roundRect', width: W, height: H, blur: 0.09, opacity: 0.42 });
      sh.position.set(0.07, -0.12, -0.05);
      rig.add(sh, cd.group);
      rig.userData.base = rig.position.clone();
      docs.add(rig);
      return rig;
    });

    // the lens: glass in a cream ring, riding just above the front document
    const lens = new THREE.Group();
    const glassDisc = kit.disc({ radius: 0.44, thickness: 0.06 });
    // high tier: frosted transmission (the rows show through, softly refracted); other tiers: a clean pale pane
    const gm = B.ctx.quality.transmission
      ? kit.glass({ roughness: 0.16, frost: 0.01, rim: 0.55, thickness: 0.18 })
      : new THREE.MeshBasicMaterial({ color: kit.COLORS.cream, transparent: true, opacity: 0.1, depthWrite: false });
    if (gm.transmission) gm.envMapIntensity = 0.5;   // a flat pane facing the viewer would mirror the whole soft-box
    glassDisc.material = gm;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.034, B.segs(14), B.segs(72)), kit.clay('cream', { roughness: 0.46 }));
    lens.add(glassDisc, ring);
    const lensShadow = kit.softShadow({ shape: 'circle', width: 0.96, height: 0.96, blur: 0.18, opacity: 0.2 });
    front.group.add(lensShadow, lens);

    // checklist rows on the front face, from kit's face layout (600 px wide face; one-line title at scale .075):
    // row i centre ≈ 315 + 38.1·i px down; face plane = card − 2·inset
    const inset = 0.0126, fw = W - 2 * inset, fh = H - 2 * inset, px = fw / 600, fhPx = Math.round(600 * fh / fw);
    const rowY = (i) => (fhPx / 2 - 315 - 38.13 * i) * px;
    const colX = (70 + 90 - 300) * px;   // over the tick and the start of the row
    const LAST = 6;                       // ticks 0‥5; the lens rests on row 6, the first open one (a gap)
    let checked = -1;

    const l = line(B, [[-3.2, -1.95, 0.3], [-1.6, -2.22, 0.6], [0.1, -2.02, 0.72], [1.35, -1.62, 0.5], [2.2, -0.95, -0.2], [2.9, -0.1, -1.2]]);
    world.add(l.group);

    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        for (let i = 0; i < rigs.length; i++) {
          const rig = rigs[i], ai = intro(0.08 * i, 1.25, ease.outExpo);
          rig.position.set(rig.userData.base.x, rig.userData.base.y - (1 - ai) * 1.3, rig.userData.base.z);
        }
        sun.position.x = sun.userData.base.x + (1 - a) * 0.8;
        l.setProgress(intro(0.3, 2.2, ease.inOutCubic));
        const scan = s.settled ? 1 : ease.inOutSine(segment(s.t, 0.9, 4.6));
        const idle = s.settled ? 0 : Math.sin(Math.max(0, s.t - 4.6) * 0.5) * 0.22 * segment(s.t, 4.6, 6);
        const row = scan * LAST + idle;
        const n = s.settled ? LAST : Math.min(LAST, Math.floor(scan * LAST + 0.35));
        if (n !== checked) { checked = n; face.checked = n; front.redraw(face); }
        const lx = colX + Math.sin(s.t * 0.6) * 0.05 + s.px * 0.1;
        const ly = rowY(row) + s.py * 0.05;
        const la = pop(intro(0.7, 0.9, outBack));
        lens.position.set(lx, ly, 0.3 + (1 - la) * 0.6);
        lens.scale.setScalar(la);
        lens.rotation.set(0.12 - s.py * 0.1, -0.16 + s.px * 0.12, 0);
        lensShadow.position.set(lx + 0.12, ly - 0.17, 0.02);
        lensShadow.material.opacity = 0.2 * Math.min(1, la);
      },
    };
  },

  /* 02 · Policy & handbook updates — documents put back in order: a leaning cascade in which every document behind
     shows its full header (mark, kicker, serif numeral); it breathes, lifts a document on hover and fans on scroll.
     Geometry (card width Wc): the face's header ends ≈ 0.39·Wc below the top edge and the title's cap line starts
     ≈ 0.39·Wc + 0.18 below it, so a 0.44 step shows each header whole and never a title line; the lean step (0.05 rad
     about the bottom edge) plus the rig's turn expose at most ≈ 0.11 at the right edge, inside the 0.095·Wc face margin
     (0.139), so no clipped title text peeks past the document in front. */
  handbook(B) {
    const { THREE, kit, world, intro, ctx } = B;
    const sun = discRig(B, { r: 1.3, color: 'terracottaShape', at: [-1.62, 1.72, -2.8], ry: 0.2 });
    world.add(sun);
    const items = [   // front → back
      { number: '01', title: 'Employee Handbook', variant: 'text', lines: 9 },
      { number: '02', title: 'Essential HR Policies', variant: 'checklist', lines: 6, checked: 6 },
      { number: '05', title: 'Family Leave Policies', variant: 'text', lines: 8 },
      { number: '06', title: 'Manager Guidance Documents', variant: 'text', lines: 7 },
    ];
    const n = items.length, Wc = 1.46, Hc = Wc * 1.414;
    const STEP_Y = 0.44, STEP_Z = -0.24, LEAN0 = 0.075, LEAN_STEP = -0.05;
    const rig = new THREE.Group();
    rig.position.set(-0.08, -1.98, 0);            // the front document's bottom edge
    rig.rotation.set(-0.04, -0.12, 0);
    world.add(rig);
    const cards = items.map((it, i) => {
      // only the front face is read at size; the documents behind show their header strip (512² is plenty)
      const cd = kit.card({ width: Wc, height: Hc, style: 'paper', face: { kicker: 'HR Starter Pack', seed: i + 3, ...it }, textureSize: i ? 512 : ctx.quality.textureSize });
      const pivot = new THREE.Group();           // pivot = the document's bottom-centre, so the lean fans the tops
      cd.group.position.set(0, Hc / 2, 0);
      const sh = kit.softShadow({ shape: 'roundRect', width: Wc, height: Hc, blur: 0.08, opacity: 0.4 });
      sh.position.set(0.05, Hc / 2 - 0.09, -0.06);
      pivot.add(sh, cd.group);
      rig.add(pivot);
      cd.group.traverse((o) => { o.userData.card = i; });
      return { cd, pivot, focus: 0 };
    });
    const picker = kit.picker(cards.map((k) => k.cd.group));
    let hovered = -1;
    const l = line(B, [[-3.2, -2.28, 0.5], [-1.9, -2.02, 0.72], [-0.7, -2.34, 0.8], [0.5, -1.98, 0.74], [1.5, -2.26, 0.55], [2.9, -1.5, -0.2]]);
    world.add(l.group);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x - (1 - a) * 0.8;
        if (!s.settled && !c.pointer.touch) {
          const hit = picker.pick();
          hovered = hit ? hit.object.userData.card ?? -1 : -1;
        }
        // breathing: the cascade opens a touch and settles, slowly (a still, composed cascade when settled)
        const br = s.settled ? 0 : (0.5 - 0.5 * Math.cos(Math.max(0, s.t - 1.8) * 0.45));
        const fan = ease.inOutCubic(clamp01(s.exit * 1.6));      // scrolling the hero away fans the documents
        for (let i = 0; i < n; i++) {
          const k = cards[i], kk = i - (n - 1) / 2;
          // placed back to front, like pages being put in order
          const ki = intro(0.12 + (n - 1 - i) * 0.16, 1.1, ease.outExpo);
          k.focus = s.settled ? 0 : lerp(k.focus, hovered === i ? 1 : 0, 1 - Math.exp(-9 * s.delta));
          const cy = STEP_Y * i + br * 0.05 * i, cz = STEP_Z * i;
          const lean = LEAN0 + (LEAN_STEP - br * 0.008) * i;
          const fx = kk * 0.6, fy = 0.28 - Math.abs(kk) * 0.07, fz = -kk * kk * 0.07 + STEP_Z * 0.3 * i;
          k.pivot.position.set(
            lerp(0, fx, fan) + (1 - ki) * 0.5,
            lerp(cy, fy, fan) + (1 - ki) * 1.5 + k.focus * 0.16,
            lerp(cz, fz, fan) + k.focus * 0.32,
          );
          k.pivot.rotation.set(0, 0, lerp(lean, -kk * 0.1, fan) * (1 - k.focus * 0.6) + (1 - ki) * -0.3);
        }
        l.setProgress(intro(0.5, 2.2, ease.inOutCubic));
      },
    };
  },

  /* 03 · Employee relations & workplace issues — two people, one line between them */
  dialogue(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.05, color: 'terracottaShape', at: [1.5, 1.5, -3.1], ry: -0.2 });
    world.add(sun);
    const arch = kit.rimmedArch({ width: 2.55, height: 2.7, below: 3.2, rim: 0.14, depth: 0.2, emissive: 0.1 });
    arch.group.position.set(0.05, -1.55, -2.3);
    const archSh = kit.softShadow({ shape: "arch", width: 2.55, height: 2.7, blur: 0.1, opacity: 0.5 });
    archSh.position.set(0.18, -1.55 + 1.25, -2.45);
    world.add(archSh, arch.group);

    const hgt = 1.12, baseY = -1.95;
    const mkFig = (x, ry, colors) => {
      const f = kit.figure({ height: hgt, colors });
      f.group.position.set(x, baseY, 0.25);
      f.group.rotation.y = ry;
      const sh = kit.softShadow({ shape: 'ellipse', width: 1.05, height: 0.32, blur: 0.2, opacity: 0.55 });
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x + 0.06, baseY + 0.005, 0.2);
      world.add(sh, f.group);
      f.group.userData.x = x;
      return f;
    };
    const a1 = mkFig(-0.8, 0.46, { head: 'terracotta', body: 'sage' });
    const a2 = mkFig(0.8, -0.46, { head: 'terracotta', body: 'cream' });
    const headY = baseY + hgt * (29 / 35);
    const apex = [0, 0.02, 0.42];
    const l = line(B, [[-0.72, headY + 0.3, 0.3], [-0.46, -0.22, 0.38], apex, [0.46, -0.22, 0.38], [0.72, headY + 0.3, 0.3]], { taper: [0.06, 0.06], radius: 0.024, tubularSegments: 260 });
    world.add(l.group);
    const meet = dot(B, 0.085);
    meet.position.set(...apex);
    world.add(meet);
    const floor = line(B, [[-3.2, -2.18, 0.5], [-1.6, -1.98, 0.6], [0, -2.05, 0.7], [1.6, -1.96, 0.6], [3.2, -2.3, 0.4]], { radius: 0.02, tubularSegments: 200 });
    world.add(floor.group);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x + (1 - a) * 0.7;
        arch.group.position.y = -1.55 - (1 - intro(0, 1.4, ease.outExpo)) * 1.4;
        for (let i = 0; i < 2; i++) {
          const f = i ? a2 : a1, k = intro(0.25 + i * 0.18, 1.1, ease.outExpo);
          const talk = s.settled ? 0 : Math.sin(s.t * 0.9 + i * Math.PI) * 0.035;
          f.group.position.set(f.group.userData.x * (1 + (1 - k) * 0.5), baseY, 0.25);
          f.group.scale.setScalar(pop(k));
          f.group.rotation.z = talk * (i ? -1 : 1);
          f.head.position.y = 29 + (s.settled ? 0 : Math.sin(s.t * 1.3 + i * 2) * 0.5);
        }
        const dp = intro(1.0, 1.6, ease.inOutCubic);
        l.setProgress(dp);
        meet.scale.setScalar(pop(ease.outCubic(clamp01((dp - 0.5) / 0.2))) * (1 + (s.settled ? 0 : Math.sin(s.t * 1.6) * 0.06)));
        floor.setProgress(intro(0.2, 2, ease.inOutCubic));
      },
    };
  },

  /* 04 · Performance & capability management — pillars grow, the line rises */
  progress(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.2, color: 'sageShape', at: [-1.55, 1.55, -3], ry: 0.2 });
    world.add(sun);
    const base = -2.05, w = 0.8;
    const specs = [[-1.2, 1.1, 'paper'], [0, 1.75, 'sageShape'], [1.2, 2.45, 'terracottaShape']];
    const pillars = specs.map(([x, h, col]) => {
      const g = extrude(archShape({ width: w, height: h, bottom: 0 }), { depth: 0.34, bevel: 0.04, bevelSegments: 3, curveSegments: B.segs(28) });
      const mesh = new THREE.Mesh(g, kit.clay(col, { emissive: 0.06 }));
      const holder = new THREE.Group();
      holder.position.set(x, base, 0);
      const sh = kit.softShadow({ shape: 'arch', width: w, height: h, blur: 0.12, opacity: 0.45 });
      sh.position.set(0.1, h / 2 - 0.1, -0.22);
      holder.add(sh, mesh);
      world.add(holder);
      return { holder, h };
    });
    const top = [1.2, base + 2.45];
    const fig = kit.figure({ height: 0.62 });
    fig.group.position.set(top[0], top[1], 0.02);
    world.add(fig.group);
    const l = line(B, [[-3.2, -1.6, 0.5], [-1.9, -1.2, 0.55], [-0.9, -0.62, 0.52], [0.25, 0.02, 0.5], [0.8, 0.66, 0.42], [1.02, 1.12, 0.34], [1.1, 1.52, 0.2]], { taper: [0.2, 0.02] });
    world.add(l.group);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x - (1 - a) * 0.7;
        for (let i = 0; i < pillars.length; i++) {
          const k = intro(0.2 + i * 0.28, 1.2, ease.outExpo);
          pillars[i].holder.scale.set(1, pop(k), 1);
        }
        const fk = intro(1.3, 0.9, ease.outExpo);
        fig.group.scale.setScalar(pop(fk));
        fig.group.position.y = top[1] + (s.settled ? 0 : Math.sin(s.t * 0.8) * 0.02);
        const dp = intro(0.6, 2.2, ease.inOutCubic);
        l.setProgress(dp);
      },
    };
  },

  /* 05 · Absence & wellbeing support — rest inside the arch, a low warm sun; everything very slow */
  calm(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.35, color: 'terracottaShape', at: [1.25, 1.05, -2.9], ry: -0.15 });
    world.add(sun);
    kit.floater(sun, { amp: 0.05, speed: 0.18, rot: 0.01 });
    const arch = kit.rimmedArch({ width: 2.7, height: 2.5, below: 3.2, rim: 0.16, depth: 0.22, emissive: 0.1 });
    arch.group.position.set(-0.2, -1.5, -1.3);
    const archSh = kit.softShadow({ shape: 'arch', width: 2.7, height: 2.5, blur: 0.1, opacity: 0.5 });
    archSh.position.set(-0.06, -1.5 + 1.2, -1.45);
    world.add(archSh, arch.group);
    const f = kit.figure({ height: 1.1, colors: { head: 'terracotta', body: 'cream' } });
    f.group.position.set(-0.2, -2.05, -1.0);
    world.add(f.group);
    kit.floater(f.group, { amp: 0.02, speed: 0.2, rot: 0.006 });
    const l = line(B, [[-3.2, -2.1, 0.5], [-1.8, -2.3, 0.6], [-0.4, -2.08, 0.7], [1.0, -2.3, 0.6], [2.3, -2.08, 0.4], [3.4, -2.25, 0.2]], { radius: 0.024 });
    world.add(l.group);
    return {
      lookY: -0.3,
      update(c, s) {
        arch.group.position.y = -1.5 - (1 - intro(0, 2, ease.outCubic)) * 1.2;
        f.group.scale.setScalar(pop(intro(0.8, 1.6, ease.outCubic)));
        l.setProgress(intro(0.4, 3, ease.inOutSine));
      },
    };
  },

  /* 06 · Workforce planning — a planned team on a grid, figures arriving, open places marked */
  rows(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.3, color: 'terracottaShape', at: [1.5, -0.55, -3.2], ry: -0.2 });   // low: the lifted camera (camY) projects far forms high
    world.add(sun);
    // three staggered rows (back rows stand in the gaps, like a team photograph); the open places are rings
    const cols = 4, rowsN = 3, dx = 0.9, dz = 1.05;
    const open = new Set([3, 6, 9]);
    const items = [], slots = [];
    for (let r = 0; r < rowsN; r++) for (let q = 0; q < cols; q++) {
      const i = r * cols + q;
      const x = (q - (cols - 1) / 2 + (r % 2 ? -0.5 : 0) + 0.25) * dx, z = (r - (rowsN - 1) / 2) * dz;
      slots.push([x, z, open.has(i)]);
      if (!open.has(i)) items.push({ p: [x, 0, z], height: 0.6, head: 'terracotta', body: (q + r) % 3 === 0 ? 'cream' : 'sage' });
    }
    const floor = new THREE.Group();
    floor.position.set(0, -1.45, 0.2);
    world.add(floor);
    const people = kit.people({ items });
    floor.add(people.group);
    const ringGeo = new THREE.TorusGeometry(0.2, 0.018, B.segs(8), B.segs(40));
    const ringMat = kit.clay('sage', { roughness: 0.5, emissive: 0.2 });
    const rings = slots.filter((sl) => sl[2]).map(([x, z]) => {
      const m = new THREE.Mesh(ringGeo, ringMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      floor.add(m);
      return m;
    });
    slots.forEach(([x, z]) => {
      const sh = kit.softShadow({ shape: 'ellipse', width: 0.5, height: 0.2, blur: 0.2, opacity: 0.45 });
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x + 0.04, 0.004, z + 0.02);
      floor.add(sh);
    });
    const base = Float32Array.from(people.pos);
    const l = line(B, [[-3.2, -2.35, 1.6], [-1.6, -2.1, 1.7], [0, -2.3, 1.8], [1.5, -2.02, 1.7], [3.2, -2.4, 1.4]], { radius: 0.022 });
    world.add(l.group);
    return {
      camY: 3.1,       // look down on the plan (a lifted camera, so the figures stay upright)
      lookY: -0.95,
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x + (1 - a) * 0.7;
        for (let i = 0; i < people.count; i++) {
          const k = intro(0.25 + i * 0.09, 0.8, ease.outExpo);
          people.setPosition(i, base[i * 3], base[i * 3 + 1] + (1 - k) * 0.5, base[i * 3 + 2]);
          people.setScale(i, pop(k));
        }
        people.update();
        const pulse = s.settled ? 1 : 1 + Math.sin(s.t * 1.4) * 0.08;
        const rk = intro(1.3, 0.8, ease.outExpo);
        for (let i = 0; i < rings.length; i++) rings[i].scale.setScalar(pop(rk) * (i % 2 ? pulse : 2 - pulse));
        l.setProgress(intro(0.4, 2.2, ease.inOutCubic));
      },
    };
  },

  /* 07 · Organisational design & change management — one organisation, two structures */
  restructure(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.35, color: 'terracottaShape', at: [-1.45, 1.7, -3.1], ry: 0.2 });
    world.add(sun);
    const A = layouts.orgChart({ levels: [1, 2, 6], width: 3.3, height: 2.5, depth: 0.5, seed: 6, jitter: 0.03 });
    const Bn = layouts.orgChart({ levels: [1, 4, 4], width: 3.1, height: 2.1, depth: 0.5, seed: 8, jitter: 0.03 });
    const look = [{ head: 'terracotta', body: 'cream', h: 0.66 }, { head: 'terracotta', body: 'sage', h: 0.52 }, { head: 'sage', body: 'cream', h: 0.44 }];
    const org = new THREE.Group();
    org.position.set(0, -0.55, 0);
    world.add(org);
    const people = kit.people({ items: A.nodes.map((n) => { const k = look[Math.min(n.level, 2)]; return { p: [n.p[0], n.p[1] - k.h * 0.45, n.p[2]], height: k.h, head: k.head, body: k.body }; }) });
    const linksA = kit.network({ nodes: A.nodes.map((n) => ({ p: [...n.p] })), links: A.links, lineColor: 'sage', lineOpacity: 0.5, showNodes: false });
    const linksB = kit.network({ nodes: Bn.nodes.map((n) => ({ p: [...n.p] })), links: Bn.links, lineColor: 'sage', lineOpacity: 0.5, showNodes: false });
    org.add(linksA.group, linksB.group, people.group);
    const hA = A.nodes.map((n) => look[Math.min(n.level, 2)].h);
    const hB = Bn.nodes.map((n) => look[Math.min(n.level, 2)].h);
    const l = line(B, [[-3.2, -2.3, 0.6], [-1.5, -2.05, 0.7], [0, -2.28, 0.8], [1.5, -2.0, 0.7], [3.2, -2.35, 0.4]], { radius: 0.022 });
    world.add(l.group);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x - (1 - a) * 0.7;
        // ping-pong between the two structures; the settled frame shows the second one
        const cyc = s.settled ? 1 : 0.5 - 0.5 * Math.cos(Math.max(0, s.t - 1.8) * 0.5);
        const m = ease.inOutCubic(cyc);
        for (let i = 0; i < people.count; i++) {
          const pa = A.nodes[i].p, pb = Bn.nodes[i].p;
          const x = lerp(pa[0], pb[0], m), y = lerp(pa[1], pb[1], m), z = lerp(pa[2], pb[2], m);
          const k = intro(0.2 + A.nodes[i].level * 0.25 + i * 0.03, 0.9, ease.outExpo);
          people.setPosition(i, x, y - lerp(hA[i], hB[i], m) * 0.45 - (1 - k) * 0.4, z);
          people.setScale(i, pop(k));
          linksA.setPosition(i, x, y, z); linksB.setPosition(i, x, y, z);
        }
        people.update(); linksA.update(); linksB.update();
        const li = intro(1.0, 1.2, ease.outCubic);
        linksA.lines.material.opacity = 0.5 * li * (1 - m);
        linksB.lines.material.opacity = 0.5 * li * m;
        l.setProgress(intro(0.4, 2.2, ease.inOutCubic));
      },
    };
  },

  /* 08 · Ad-hoc HR advice — a person, a note of advice, the line sweeping beneath the person up to the note */
  advice(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.25, color: 'terracottaShape', at: [1.5, 1.55, -3], ry: -0.2 });
    world.add(sun);
    const f = kit.figure({ height: 1.55 });
    f.group.position.set(-0.85, -2.1, 0.1);
    f.group.rotation.y = 0.35;
    const fsh = kit.softShadow({ shape: 'ellipse', width: 1.2, height: 0.34, blur: 0.2, opacity: 0.55 });
    fsh.rotation.x = -Math.PI / 2;
    fsh.position.set(-0.8, -2.095, 0.05);
    world.add(fsh, f.group);
    const CW = 1.2, CH = 1.55;
    const card = kit.card({ width: CW, height: CH, style: 'cream', face: { kicker: 'HCLabs', title: 'HR advice', variant: 'text', lines: 7, seed: 12 } });
    const csh = kit.softShadow({ shape: 'roundRect', width: CW, height: CH, blur: 0.09, opacity: 0.45 });
    csh.position.set(0.08, -0.13, -0.06);
    const cardRig = new THREE.Group();
    cardRig.position.set(0.74, 0.02, 0.3);
    cardRig.rotation.set(0.02, -0.3, 0.035);
    cardRig.add(csh, card.group);
    world.add(cardRig);
    kit.floater(cardRig, { amp: 0.05, speed: 0.45, rot: 0.02 });
    // ends on the note's lower-left corner (card-local (−CW/2, −CH/2) through the rig's rotation ≈ (0.18, −0.73, 0.18))
    const end = [0.2, -0.66, 0.3];
    const l = line(B, [[-3.2, -2.36, 0.5], [-1.9, -2.2, 0.62], [-0.55, -2.02, 0.6], [0.08, -1.55, 0.46], [0.2, -1.02, 0.34], end], { taper: [0.2, 0.03], radius: 0.024, tubularSegments: 260 });
    world.add(l.group);
    const tip = dot(B, 0.07);
    tip.position.set(...end);
    world.add(tip);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x + (1 - a) * 0.7;
        f.group.scale.setScalar(pop(intro(0.15, 1.1, ease.outExpo)));
        const ck = intro(0.5, 1.2, ease.outExpo);
        cardRig.position.x = 0.74 + (1 - ck) * 0.8;
        card.group.scale.setScalar(pop(ck));
        csh.material.opacity = 0.45 * ck;
        const dp = intro(1.0, 1.6, ease.inOutCubic);
        l.setProgress(dp);
        tip.scale.setScalar(pop(ease.outCubic(clamp01((dp - 0.9) / 0.1))));
      },
    };
  },

  /* 09 · Retained HR support packages — the doorway, with support circling it */
  orbit(B) {
    const { THREE, kit, world, intro } = B;
    const sun = discRig(B, { r: 1.35, color: 'sageShape', at: [1.5, 1.65, -3.1], ry: -0.2 });
    world.add(sun);
    const mark = kit.archMark({ height: 2.1, depth: 12, anchor: 'center' });
    mark.group.position.set(0, -0.45, 0);
    mark.group.rotation.y = -0.18;
    const msh = kit.softShadow({ shape: 'arch', width: mark.width, height: 2.1, blur: 0.12, opacity: 0.45 });
    msh.position.set(0.14, -0.45 - 0.2, -0.6);
    world.add(msh, mark.group);
    kit.floater(mark.group, { amp: 0.03, speed: 0.4, rot: 0.01 });
    const R = layouts.ring({ count: 8, radius: 1.85, tilt: 0.42, hub: false, size: 0.075, palette: ['sage', 'cream', 'sage', 'terracotta'], phase: 0 });
    const ring = kit.network({ nodes: R.nodes, links: R.links, lineColor: 'sage', lineOpacity: 0.4 });
    const spin = new THREE.Group();
    spin.position.set(0, -0.6, 0);
    spin.rotation.set(0.28, 0, 0.06);
    const turn = new THREE.Group();
    turn.add(ring.group);
    spin.add(turn);
    world.add(spin);
    const l = line(B, [[-3.2, -2.25, 0.5], [-1.6, -2.02, 0.65], [0, -2.24, 0.75], [1.5, -1.98, 0.6], [3.2, -2.32, 0.3]], { radius: 0.022 });
    world.add(l.group);
    return {
      update(c, s) {
        const a = intro(0, 1.3, ease.outCubic);
        sun.position.x = sun.userData.base.x + (1 - a) * 0.7;
        mark.group.scale.setScalar(pop(intro(0.1, 1.2, ease.outExpo)));
        const rk = intro(0.6, 1.4, ease.outExpo);
        turn.scale.setScalar(pop(rk));
        turn.rotation.y = (s.settled ? 0.35 : 0.35 + s.t * 0.16) + (1 - rk) * -1.2;
        l.setProgress(intro(0.4, 2.2, ease.inOutCubic));
      },
    };
  },
};
