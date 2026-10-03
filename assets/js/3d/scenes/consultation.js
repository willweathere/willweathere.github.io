/**
 * /consultation/ — "the door opens". The logo's doorway at human scale: two arched door leaves swing slowly open
 * towards you and reveal the person standing in the doorway (the logo, completed), while the flowing line arrives
 * at the threshold. Calm on purpose: long eases, a slow float, no spin. Cheap: matte clay only (~14 draw calls).
 *
 * Pointer: the world turns a little; while the pointer is over the doorway the doors open a touch wider, and the
 * container emits `hc3d:door-hover { over }` so the page can show a pointer — the doorway is a real way in (a click
 * goes to the request form; `api.pickAt()` serves taps).
 * Scroll (hero leaving): the camera steps towards the threshold and the doors open fully.
 * Settled frame (reduced motion / ?shot=1): doors open, line drawn, everything at rest.
 *
 * options: { stacked (bool or live getter: the stage sits under the copy), intro (bool or getter, default true) }
 * api:     { invite(amount 0..1) } — e.g. hovering the main CTA opens the doors a little wider.
 *          { pickAt(clientX, clientY) → true when that viewport point is on the doorway }
 */
import { createKit, ease, clamp01, damp, archShape } from '../kit.js';

const OPEN = 1.12;         // settled opening angle (rad, ~64°)
const LEAF_T = 1.9;        // leaf thickness (logo units; the mark is 52 × 56)
const SEAM = 0.4;          // gap between the two leaves
const RING_D = 12;         // arch ring depth (logo units)

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  const opt = ctx.options || {};
  const introOn = () => (typeof opt.intro === 'function' ? opt.intro() : opt.intro !== false);

  kit.environment({ intensity: 0.52 });
  const lights = kit.lights({ key: 2.05, rim: 1.7, fill: 0.46, keyPos: [-4.5, 5, 7], rimPos: [5, 3, -5], glow: 9, glowPos: [-0.4, 0.9, 4.6], glowFollow: [2.6, 1.6] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  /* ---- the terracotta disc behind (as in the brand art: entering from the upper right) ---------------- */
  const discRig = new THREE.Group();
  const disc = kit.disc({ radius: 1.75, thickness: 0.2, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 3.5, height: 3.5, blur: 0.11, opacity: 0.6 });
  discShadow.position.set(0.1, -0.26, -0.15);
  discRig.add(discShadow, disc);
  discRig.rotation.set(0.04, -0.18, 0);
  world.add(discRig);

  /* ---- the doorway ------------------------------------------------------------------------------------ */
  const H = 3.1;
  const doorRig = new THREE.Group();
  world.add(doorRig);
  const mark = kit.archMark({ height: H, depth: RING_D, anchor: 'base' });
  const U = mark.unit;                                   // world units per logo unit
  const markShadow = kit.softShadow({ shape: 'arch', width: mark.width, height: H, blur: 0.12, opacity: 0.46 });
  markShadow.position.set(0.16, H / 2 - 0.22, -0.72);
  doorRig.add(markShadow, mark.group);

  // the room behind the doorway: a slightly lighter navy wall, so the revealed figure stands in a lit space
  const back = new THREE.Mesh(
    ctx.track(new THREE.ShapeGeometry(archShape({ width: 32.4, height: 46.4, bottom: 0 }), 40)),
    kit.clay('navySoft', { roughness: 0.9, emissive: 0.16, sheen: 0 }),
  );
  back.position.z = -RING_D / 2 + 0.6;
  mark.inner.add(back);

  // two arched leaves (quarter-circle tops), hinged on the jambs, standing just proud of the ring's face
  function leafGeometry() {
    const r = 15.75, w = 16 - SEAM / 2, x0 = 16 - r;       // hinge edge a hair inside the jamb
    const s = new THREE.Shape();
    s.moveTo(x0, 0.35);
    s.lineTo(w, 0.35);
    s.absarc(16, 30, r, Math.acos((w - 16) / r), Math.PI, false);   // (absarc adds the joining line itself)
    s.closePath();
    const b = 0.5, depth = LEAF_T;
    const g = new THREE.ExtrudeGeometry(s, { depth: depth - 2 * b, steps: 1, curveSegments: ctx.quality.tier === 'low' ? 18 : 32, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 3 });
    g.translate(0, 0, -(depth - 2 * b) / 2);
    g.computeBoundingSphere();
    return ctx.track(g);
  }
  const leafGeo = leafGeometry();
  const leafMat = kit.clay('sageDeep', { roughness: 0.6, emissive: 0.05 });
  const hingeZ = RING_D / 2 + LEAF_T / 2 + 0.3;
  const hingeL = new THREE.Group(), hingeR = new THREE.Group();
  hingeL.position.set(-16, 0, hingeZ);
  hingeR.position.set(16, 0, hingeZ);
  const leafL = new THREE.Mesh(leafGeo, leafMat);
  const leafR = new THREE.Mesh(leafGeo, leafMat);
  leafR.scale.x = -1;                                      // mirrored (three flips the winding for us)
  hingeL.add(leafL); hingeR.add(leafR);
  // a small terracotta pull on each leaf, where they meet (the brand's warm accent, as on the CSS door)
  const pullGeo = ctx.track(new THREE.CapsuleGeometry(0.62, 2.6, 4, 12));
  const pullMat = kit.clay('terracottaShape', { roughness: 0.5, emissive: 0.08, sheen: 0 });
  for (const [hinge, sx] of [[hingeL, 1], [hingeR, -1]]) {
    const pull = new THREE.Mesh(pullGeo, pullMat);
    pull.position.set(sx * (16 - SEAM / 2 - 2.3), 23, LEAF_T / 2 + 0.35);
    hinge.add(pull);
  }
  mark.inner.add(hingeL, hingeR);

  kit.floater(mark.group, { amp: 0.022, speed: 0.32, rot: 0.006 });

  // the doorway (ring, room, leaves, person) is the hover / click target
  const picker = kit.picker([mark.group]);
  const tapRay = new THREE.Raycaster();
  const tapNdc = new THREE.Vector2();
  const tapHits = [];

  /* ---- the line: arrives from the copy side, passes in front of the open leaf, ends at the threshold --- */
  const baseY = 0;   // door base in doorRig space; the line lives in world space (set in resize)
  let line = null, tipDot = null;
  const tipGeo = ctx.track(new THREE.SphereGeometry(0.07, 20, 14));
  const tipMat = kit.clay('terracotta', { roughness: 0.5, emissive: 0.2, sheen: 0 });

  function buildLine(stacked) {
    if (line) {
      // the line is rebuilt only when the layout flips (side by side ⇄ stacked): free the old tube now
      if (kit.release) kit.release(line.group);
      else { world.remove(line.group); line.mesh.geometry.dispose(); line.tip?.geometry.dispose(); }
    }
    const y = doorRig.position.y + baseY;
    const pts = stacked
      ? [[-4.6, y + 0.95, -1.2], [-3.1, y + 0.1, -0.2], [-1.9, y - 0.12, 0.9], [-0.95, y - 0.05, 1.55], [-0.3, y - 0.02, 1.3], [0.02, y - 0.02, 0.86]]
      : [[-5.4, y + 0.55, -1.0], [-3.7, y - 0.28, 0.1], [-2.3, y - 0.1, 0.8], [-1.15, y - 0.06, 1.62], [-0.32, y - 0.02, 1.34], [0.02, y - 0.02, 0.86]];
    line = kit.flowLine({ points: pts, radius: 0.024, taper: [0.28, 0.02], tubularSegments: 320 });
    world.add(line.group);
    if (!tipDot) { tipDot = new THREE.Mesh(tipGeo, tipMat); world.add(tipDot); }
    tipDot.position.set(0.02, y - 0.02, 0.86);
  }

  const dust = kit.particles({ count: 150, box: [9, 6.5, 5], center: [0.2, 0.3, -1.4], size: 0.024, opacity: 0.34, drift: 0.14, fade: [8, 24], speed: 0.55 });
  world.add(dust);

  /* ---- framing ------------------------------------------------------------------------------------------ */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist = 12, stackedNow = null, lookY = 0;
  const discBase = { x: 1.9, y: 1.25, z: -2.7, s: 1 };
  function resize(c) {
    const a = c.size.aspect;
    const stacked = opt.stacked != null ? !!opt.stacked : a > 1.1;
    // the door and its open leaves need ~4.3 × 4.5 units; keep the door at roughly half the stage height
    const Hv = Math.max(stacked ? 4.35 : 5.7, (stacked ? 4.6 : 4.45) / Math.max(0.45, a));
    dist = Hv / (2 * tanHalf);
    camera.near = 0.1; camera.far = dist + 30; camera.updateProjectionMatrix();
    doorRig.position.set(stacked ? 0.05 : 0.1, -1.62, 0);
    doorRig.rotation.set(0, stacked ? 0.06 : 0.1, 0);
    lookY = -0.02;
    if (stacked) { discBase.x = Math.min(2.25, 0.5 + Hv * a * 0.3); discBase.y = 0.62; discBase.z = -2.8; discBase.s = 0.66; }
    else { discBase.x = 1.95; discBase.y = 1.3; discBase.z = -2.7; discBase.s = 1; }
    if (stacked !== stackedNow) { stackedNow = stacked; buildLine(stacked); }
  }

  /* ---- animation ------------------------------------------------------------------------------------------ */
  let hover = 0, invite = 0, inviteTarget = 0, doorOver = false;
  function update(c) {
    const settled = c.settled || c.static;
    const intro = introOn() && !settled;
    const px = c.pointer.x, py = c.pointer.y;
    const exit = settled ? 0 : clamp01(c.scroll.exit);
    const dt = c.delta || 0.016;

    // the doorway settles in, then the doors open slowly; the line arrives as they finish
    const rise = intro ? kit.intro(0.05, 1.8, ease.outExpo) : 1;
    const open = intro ? kit.intro(0.75, 3.1, ease.inOutSine) : 1;
    const draw = intro ? kit.intro(1.6, 2.6, ease.inOutCubic) : 1;
    const discIn = intro ? kit.intro(0.2, 2.4, ease.outExpo) : 1;

    const over = !settled && !c.pointer.touch && !!picker.pick();
    if (over !== doorOver) { doorOver = over; c.emit('door-hover', { over }); }
    hover = settled ? 0 : damp(hover, over ? 1 : 0, 1.8, dt);
    invite = settled ? 0 : damp(invite, inviteTarget, 2.4, dt);
    const breathe = settled ? 0 : Math.sin(c.time * 0.42) * 0.028;
    const theta = open * (OPEN + breathe + Math.max(hover, invite) * 0.16 + ease.inOutCubic(clamp01(exit * 1.3)) * 0.3);
    hingeL.rotation.y = -theta;
    hingeR.rotation.y = theta;

    mark.group.visible = true;
    doorRig.position.y = -1.62 - (1 - rise) * 0.28;
    line?.setProgress(draw);
    if (tipDot) tipDot.scale.setScalar(Math.max(0.001, ease.outCubic(clamp01((draw - 0.9) / 0.1))));

    discRig.position.set(discBase.x + (1 - discIn) * 0.7, discBase.y + (1 - discIn) * 0.25, discBase.z);
    discRig.scale.setScalar(discBase.s);

    // camera: a slight three-quarter view from the copy side; scrolling away steps towards the threshold
    const e = ease.inOutSine(exit);
    const d = dist * (1 - e * 0.24);
    camera.position.set(-0.4 + px * 0.32, 0.28 + py * 0.16 - e * 0.35, d);
    camera.lookAt(0, lookY - e * 0.25, 0);
    world.rotation.y = px * 0.1;
    world.rotation.x = -py * 0.04;

    kit.updateFloaters(settled ? 0 : c.time, settled ? 0 : 1);
    dust.update(c);
    lights.update(c);
  }

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    degrade() { dust.visible = false; },
    api: {
      /** 0..1: open the doors a little wider (CTA hover / focus). */
      invite(v = 1) { inviteTarget = clamp01(v); ctx.invalidate(); },
      /** Is this viewport point on the doorway? (taps have no hover; also used to confirm a click) */
      pickAt(cx, cy) {
        const r = ctx.container.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        tapNdc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
        if (Math.abs(tapNdc.x) > 1 || Math.abs(tapNdc.y) > 1) return false;
        tapRay.setFromCamera(tapNdc, camera);
        tapHits.length = 0;
        tapRay.intersectObject(mark.group, true, tapHits);
        return tapHits.length > 0;
      },
    },
  };
}
