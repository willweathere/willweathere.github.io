/**
 * Contact — "the conversation".
 * Sarah stands in her doorway (the logo as an object); you stand outside it, at the same height. The brand's flowing
 * terracotta line becomes the arc of a conversation between your two heads — the same gesture as the homepage's
 * "employment-related challenges" drawing — and a small cream message travels along it, one way and then back,
 * landing with a soft ring. The terracotta disc sits behind the doorway's shoulder, cropped by the page edge.
 *
 * Page wiring: sceneOptions.region() → { l, r, t, b, disc:{x,y,r} } in stage px (where the subject may stand, and the
 * disc). api.ping('mail'|'phone') sends a message now (hover / copy on the page); api.reframe() re-fits after layout.
 * Settled frame (reduced motion, ?shot=1): everything in place, the message resting at the top of the arc.
 * Cheap on purpose: matte clay only, no transmission — ~16 draw calls.
 */
import { createKit, ease, clamp01, segment, shiftView, COLORS } from '../kit.js';

const outBack = (t) => { const c1 = 1.5, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; };

// composition (world units; the people stand on y = 0)
const DOOR_H = 2.4, DOOR_X = 0.55, DOOR_RY = -0.3;
const VIS_H = 1.35, VIS_X = -1.6, VIS_Z = 0.45, VIS_RY = 0.42;
const SUB = { x0: -2.15, x1: 1.8, y0: -0.05, y1: 2.55 };        // subject bounds used for fitting
// the arc leaves just above your head and lands just above Sarah's, tucking back into the doorway opening at the end
// (her head top is y 1.5, the doorway's front face z ≈ 0.23 there; your head top is y 1.35)
const ARC = [[-1.56, 1.42, 0.5], [-1.34, 1.9, 0.58], [-0.8, 2.24, 0.64], [-0.14, 2.2, 0.6], [0.3, 1.9, 0.42], [0.5, 1.56, 0.26]];
const ARC_TAPER = [0.08, 0.08];
const TRAVEL = 2.7, HOLD = 1.5, PING_TRAVEL = 1.35, RING_LIFE = 1.15, CONVO_START = 3.2;

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  const opts = ctx.options || {};

  kit.environment({ intensity: 0.5 });
  const lights = kit.lights({ key: 2.1, rim: 1.75, fill: 0.46, keyPos: [-4, 5, 7], rimPos: [5, 3, -5], glow: 9, glowPos: [-0.4, 1.8, 4.2], glowFollow: [3, 2] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);
  const subject = new THREE.Group();
  world.add(subject);

  /* ---- the disc (placed in resize from the page's frame) ---- */
  const discRig = new THREE.Group();
  const disc = kit.disc({ radius: 1, thickness: 0.1, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 2, height: 2, blur: 0.11, opacity: 0.58 });
  discShadow.position.set(0.05, -0.15, -0.12);
  discRig.add(discShadow, disc);
  discRig.rotation.set(0.04, -0.16, 0);
  world.add(discRig);
  const DISC_Z = -2.8;
  const discBase = { x: 2.4, y: 2.6, s: 1.7 };

  /* ---- Sarah, in her doorway ---- */
  const doorRig = new THREE.Group();
  doorRig.position.set(DOOR_X, 0, 0);
  doorRig.rotation.y = DOOR_RY;
  const mark = kit.archMark({ height: DOOR_H, depth: 12, anchor: 'base' });
  const markShadow = kit.softShadow({ shape: 'arch', width: mark.width, height: DOOR_H, blur: 0.12, opacity: 0.46 });
  markShadow.position.set(0.16, DOOR_H / 2 - 0.2, -0.72);
  doorRig.add(markShadow, mark.group);
  subject.add(doorRig);
  kit.floater(mark.group, { amp: 0.022, speed: 0.34, rot: 0.008 });
  const sarahHead = new THREE.Vector3(DOOR_X, 29 * mark.unit, 0);
  const sarahHeadR = 6 * mark.unit;

  /* ---- you ---- */
  const visRig = new THREE.Group();
  visRig.position.set(VIS_X, 0, VIS_Z);
  visRig.rotation.y = VIS_RY;
  const you = kit.figure({ height: VIS_H, depth: 8 });
  const s = VIS_H / 35;
  const youBodyShadow = kit.softShadow({ shape: 'arch', width: 24 * s, height: 18 * s, blur: 0.14, opacity: 0.42 });
  youBodyShadow.position.set(0.1, 9 * s - 0.1, -0.42);
  const youHeadShadow = kit.softShadow({ shape: 'circle', width: 12 * s, height: 12 * s, blur: 0.16, opacity: 0.36 });
  youHeadShadow.position.set(0.1, 29 * s - 0.1, -0.42);
  visRig.add(youBodyShadow, youHeadShadow, you.group);
  subject.add(visRig);
  kit.floater(you.group, { amp: 0.02, speed: 0.42, rot: 0.01, phase: 2.1 });
  const youHead = new THREE.Vector3(VIS_X, 29 * s, VIS_Z);
  const youHeadR = 6 * s;

  /* ---- the arc of the conversation ---- */
  const arc = kit.flowLine({ points: ARC, radius: 0.021, taper: ARC_TAPER, tubularSegments: 260, tip: false, emissive: 0.24 });
  subject.add(arc.group);
  const msg = new THREE.Mesh(new THREE.SphereGeometry(0.058, 22, 16), kit.clay('cream', { roughness: 0.42, emissive: 0.22, sheen: 0 }));
  subject.add(msg);

  // arrival rings (a soft "heard you" at the receiving head)
  const ringGeo = new THREE.RingGeometry(1, 1.045, 72);
  const rings = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: COLORS.terracotta, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.visible = false;
    subject.add(m);
    return { m, t0: -1, r: 0.3 };
  });
  function fireRings(at, r, count, time) {
    for (let i = 0; i < count; i++) {
      let pick = rings[0];
      for (const rg of rings) { if (rg.t0 < 0) { pick = rg; break; } if (rg.t0 < pick.t0) pick = rg; }
      pick.t0 = time + i * 0.26;
      pick.r = r;
      pick.m.position.set(at.x, at.y, at.z + r * 0.5);
    }
  }

  const dust = kit.particles({ count: 130, box: [8, 4.8, 4.5], center: [0, 1.6, -1.4], size: 0.024, opacity: 0.34, drift: 0.15, fade: [8, 24], speed: 0.6 });
  world.add(dust);

  /* ---- framing: fit the subject into the page's region, pin the disc to its corner ---- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const frame = { D: 12, cx: (SUB.x0 + SUB.x1) / 2, cy: (SUB.y0 + SUB.y1) / 2, k: 100 };
  const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
  function worldAt(px, py, w, h, z, out) {
    out.set((px / w) * 2 - 1, 1 - (py / h) * 2, 0.5).unproject(camera);
    _dir.copy(out).sub(camera.position).normalize();
    const t = (z - camera.position.z) / _dir.z;
    return out.copy(camera.position).addScaledVector(_dir, t);
  }
  function resize(c) {
    const w = c.size.width, h = c.size.height;
    const reg = (typeof opts.region === 'function' && opts.region()) || { l: w * 0.1, r: w * 0.92, t: h * 0.1, b: h * 0.88, disc: { x: w * 0.9, y: h * 0.2, r: Math.min(w, h) * 0.22 } };
    const rw = Math.max(60, reg.r - reg.l), rh = Math.max(60, reg.b - reg.t);
    const k = Math.min(rw / (SUB.x1 - SUB.x0), rh / (SUB.y1 - SUB.y0), 178);
    frame.k = k;
    frame.D = (h / k) / (2 * tanHalf);
    camera.near = 0.1; camera.far = frame.D + 40;
    camera.position.set(frame.cx, frame.cy, frame.D);
    camera.lookAt(frame.cx, frame.cy, 0);
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // the subject stands on the region's floor, centred across it
    const pxX = (reg.l + reg.r) / 2;
    const pxY = reg.b - (frame.cy - SUB.y0) * k;
    shiftView(camera, (pxX / w) * 2 - 1, 1 - (pxY / h) * 2, w, h);
    camera.updateMatrixWorld();
    // disc: its centre and radius come from the page (so the static art matches), projected onto its plane
    const dz = reg.disc;
    worldAt(dz.x, dz.y, w, h, DISC_Z, _v);
    discBase.x = _v.x; discBase.y = _v.y;
    discBase.s = (dz.r / k) * (frame.D - DISC_Z) / frame.D;
  }

  /* ---- the conversation: a message travels one way, lands (ring), pauses, and travels back ---- */
  // the page skips the entrance when its static art was already showing (a late world): cross-fade settled → settled
  const playIntro = typeof opts.intro === 'function' ? !!opts.intro() : opts.intro !== false;
  const convoStart = playIntro ? CONVO_START : 0.6;
  const convo = { u0: 0, u1: 1, t0: convoStart, dur: TRAVEL, mode: 'travel', rings: 1 };
  let pingQueued = null;
  function startTrip(u0, u1, t, dur, ringCount = 1) { convo.u0 = u0; convo.u1 = u1; convo.t0 = t; convo.dur = dur; convo.mode = 'travel'; convo.rings = ringCount; }
  function curU(t) { return convo.u0 + (convo.u1 - convo.u0) * ease.inOutSine(clamp01((t - convo.t0) / convo.dur)); }

  function update(c) {
    const settled = c.settled || c.static;
    const t = c.time;
    const px = c.pointer.x, py = c.pointer.y;

    // entrance
    const it = settled || !playIntro ? 1e3 : t;   // entrance clock (1e3 = finished)
    const discIn = ease.outExpo(segment(it, 0, 1.7));
    const doorIn = ease.outExpo(segment(it, 0.05, 1.45));
    const sBody = ease.outExpo(segment(it, 0.5, 1.3));
    const sHead = outBack(segment(it, 0.95, 1.55));
    const yBody = ease.outExpo(segment(it, 0.8, 1.6));
    const yHead = outBack(segment(it, 1.2, 1.8));
    const lineIn = ease.inOutCubic(segment(it, 1.55, 3.05));

    discRig.position.set(discBase.x + (1 - discIn) * 1.1, discBase.y, DISC_Z);
    discRig.scale.setScalar(discBase.s);
    doorRig.position.y = (1 - doorIn) * -0.5;
    if (mark.body) mark.body.scale.setScalar(Math.max(0.001, sBody));
    if (mark.head) mark.head.scale.setScalar(Math.max(0.001, sHead));
    you.body.scale.setScalar(Math.max(0.001, yBody));
    youBodyShadow.scale.setScalar(Math.max(0.001, yBody));
    youHeadShadow.scale.setScalar(Math.max(0.001, Math.min(1, yHead)));
    you.head.scale.setScalar(Math.max(0.001, yHead));
    arc.setProgress(lineIn);

    // the message
    if (settled) {
      arc.curve.getPointAt(0.5, msg.position);
      msg.scale.setScalar(1);
      msg.visible = true;
      for (const rg of rings) { rg.m.visible = false; rg.t0 = -1; }
    } else if (t < convoStart) {
      msg.visible = false;
    } else {
      if (pingQueued) { const k = pingQueued; pingQueued = null; doPing(k, t); }
      if (convo.mode === 'travel') {
        const p = (t - convo.t0) / convo.dur;
        const u = curU(t);
        arc.curve.getPointAt(clamp01(u), msg.position);
        const edge = Math.min(u, 1 - u) / 0.07;
        msg.scale.setScalar(Math.max(0.001, ease.outCubic(clamp01(edge))));
        msg.visible = true;
        if (p >= 1) {
          convo.mode = 'hold'; convo.t0 = t;
          msg.visible = false;
          if (convo.u1 >= 1) fireRings(sarahHead, sarahHeadR * 1.25, convo.rings, t);
          else fireRings(youHead, youHeadR * 1.3, convo.rings, t);
        }
      } else if (t - convo.t0 > HOLD) {
        const back = convo.u1 >= 1;
        startTrip(back ? 1 : 0, back ? 0 : 1, t, TRAVEL);
      }
      for (const rg of rings) {
        if (rg.t0 < 0) continue;
        const a = (t - rg.t0) / RING_LIFE;
        if (a < 0) { rg.m.visible = false; continue; }
        if (a >= 1) { rg.m.visible = false; rg.t0 = -1; continue; }
        rg.m.visible = true;
        rg.m.scale.setScalar(rg.r * (1 + 1.5 * ease.outCubic(a)));
        rg.m.material.opacity = 0.7 * Math.pow(1 - a, 1.6);
      }
    }

    // pointer: the pair turns a touch toward you; the camera drifts for depth; scrolling away lifts the view
    const ex = settled ? 0 : c.scroll.exit;
    camera.position.set(frame.cx + px * 0.3, frame.cy + py * 0.18 + ex * 0.45, frame.D);
    camera.lookAt(frame.cx, frame.cy + ex * 0.45, 0);
    subject.rotation.y = px * 0.1;
    subject.rotation.x = -py * 0.035;
    kit.updateFloaters(settled ? 0 : t, settled ? 0 : 1);
    dust.update(c);
    dust.material.uniforms.uOpacity.value = 0.34 * discIn;
    lights.update(c);
  }

  function doPing(kind, t) {
    // already on its way to Sarah: leave it be
    if (convo.mode === 'travel' && convo.u1 >= 1 && (t - convo.t0) / convo.dur < 0.85) return;
    const from = convo.mode === 'travel' ? clamp01(curU(t)) : 0;
    startTrip(from, 1, t, PING_TRAVEL * Math.max(0.45, 1 - from), kind === 'phone' ? 2 : 1);
  }

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    dispose() { ringGeo.dispose(); },
    degrade() { dust.visible = false; },
    api: {
      /** Send a message along the arc now ('mail' | 'phone'; a call rings twice). No-op in the still frame. */
      ping(kind = 'mail') {
        if (ctx.static) return;
        if (ctx.time < convoStart) { pingQueued = kind; return; }
        doPing(kind, ctx.time);
      },
      /** Re-fit after the page layout changed. Also catches a stage resize the engine's ResizeObserver hasn't
          delivered yet (e.g. a layout flip at the breakpoint in a frameless screenshot run). */
      reframe() {
        const el = ctx.container;
        const w = Math.max(1, Math.round(el.clientWidth)), h = Math.max(1, Math.round(el.clientHeight));
        if (w !== ctx.size.width || h !== ctx.size.height) {
          ctx.size.width = w; ctx.size.height = h; ctx.size.aspect = w / h;
          ctx.renderer.setSize(w, h, false);
          camera.aspect = w / h;
        }
        resize(ctx);
        ctx.invalidate();
      },
    },
  };
}
