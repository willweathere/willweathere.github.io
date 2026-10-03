/**
 * /services/ — the service ecosystem.
 *
 * The HCLabs doorway (the logo as an object) stands at the centre of a tilted orbit of nine numbered doors, one per
 * service. The brand's flowing terracotta line always connects the figure in the doorway to exactly one service:
 * the door under the pointer, the door chosen in the DOM index (the ring turns to bring it to the front), or, when
 * nobody is choosing, whichever door is passing the front as the ring drifts. Its end lands on the door's crown as a
 * dot, like the head on the shoulders in the mark.
 *
 * Built only from brand primitives: matte clay arch + figure, instanced arch-shaped doors (1 draw call), serif
 * numerals from one small atlas texture, a faint orbit path, sage spokes, a camera-facing ribbon for the live
 * connection, the terracotta disc and the flowing line. ~26 draw calls, no transmission.
 *
 * sceneOptions: { rest: 0 (door at the front in the settled frame), stacked: bool | getter (compact phone stage) }
 * api: setActive(i | -1)   turn the ring so door i comes to the front (DOM hover / focus / scroll position)
 *      setHovered(i | -1)  highlight without turning (pointer on a door: it must not slide out from under it)
 *      pickAt(x, y, touch) → door index under a client point (raycast; touch gets a forgiving nearest-door fallback)
 *      target              index the line currently points at
 * events: hc3d:target { index } whenever the connected door changes.
 */
import { createKit, COLORS, HEX, FONT_SERIF, ease, clamp01, damp, extrude, archShape, shiftView } from '../kit.js';

const N = 9;
const TAU = Math.PI * 2;
const STEP = TAU / N;
const FRONT = Math.PI / 2;

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const O = ctx.options || {};
  const rest = Number.isInteger(O.rest) ? Math.max(0, Math.min(N - 1, O.rest)) : 0;
  const kit = createKit(ctx);
  const low = ctx.quality.tier === 'low';
  await kit.ready;

  kit.environment({ intensity: 0.58 });
  const lights = kit.lights({ key: 2.15, rim: 1.7, fill: 0.5, keyPos: [-4, 6, 7], rimPos: [5, 3, -6], glow: 8, glowPos: [0, 0.3, 5], glowFollow: [3, 2] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  /* ---- the ecosystem's geometry ------------------------------------------------------------ */
  const R = 2.3, RZ = 1.9, Y0 = -0.78, TILT = 0.52;      // orbit: x radius, depth radius, centre height, front-down slope
  const TW = 0.42, TH = 0.56, TD = 0.09;               // one door
  const MARK_H = 1.6, MARK_Y = -1.0;                    // the centre doorway (base height)
  const HEAD_Y = MARK_Y + (29 / 56) * MARK_H;           // the figure's head (logo units: head centre 29 above the base)

  /* ---- background forms: the disc (top right, cropped by the frame) and the flowing line ---------- */
  const discRig = new THREE.Group();
  const disc = kit.disc({ radius: 1.7, thickness: 0.2, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 3.4, height: 3.4, blur: 0.11, opacity: 0.6 });
  discShadow.position.set(0.1, -0.28, -0.15);
  discRig.add(discShadow, disc);
  world.add(discRig);

  const line = kit.flowLine({
    points: [[-7.2, -1.6, -2.6], [-4.4, -2.35, -0.7], [-2.0, -2.62, 0.7], [0.4, -2.55, 1.15], [2.4, -2.15, 0.45], [4.4, -1.3, -1.0], [7.2, 0.1, -2.8]],
    radius: 0.019, taper: [0.18, 0.18], tubularSegments: 380, emissive: 0.2,
  });
  world.add(line.group);

  /* ---- the centre: the doorway mark ---------------------------------------------------------- */
  const markRig = new THREE.Group();
  markRig.position.set(0, MARK_Y, 0);
  const mark = kit.archMark({ height: MARK_H, depth: 12, anchor: 'base' });
  const markShadow = kit.softShadow({ shape: 'arch', width: mark.width, height: MARK_H, blur: 0.12, opacity: 0.4 });
  markShadow.position.set(0.12, MARK_H / 2 - 0.18, -0.62);
  markRig.add(markShadow, mark.group);
  world.add(markRig);
  kit.floater(mark.group, { amp: 0.022, speed: 0.45, rot: 0.01 });

  /* ---- orbit path (+ a quieter dashed inner ring) and a soft floor under it ---------------------- */
  const orbitAt = (phi, r, out) => out.set(R * r * Math.cos(phi), Y0 - TILT * RZ * r * Math.sin(phi), RZ * r * Math.sin(phi));
  const _o = new THREE.Vector3();
  const ring = (count, r) => {
    const a = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) { orbitAt((k / count) * TAU, r, _o); a[k * 3] = _o.x; a[k * 3 + 1] = _o.y + 0.004; a[k * 3 + 2] = _o.z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  };
  const pathMat = new THREE.LineBasicMaterial({ color: COLORS.cream, transparent: true, opacity: 0.16, depthWrite: false });
  const path = new THREE.LineLoop(ring(low ? 96 : 160, 1), pathMat);
  const innerMat = new THREE.LineDashedMaterial({ color: COLORS.sage, transparent: true, opacity: 0.16, dashSize: 0.07, gapSize: 0.08, depthWrite: false });
  const inner = new THREE.LineLoop(ring(low ? 64 : 110, 0.56), innerMat);
  inner.computeLineDistances();
  path.frustumCulled = inner.frustumCulled = false;
  const floor = kit.softShadow({ shape: 'ellipse', width: R * 2.35, height: RZ * 2.35, blur: 0.18, opacity: 0.26 });
  floor.rotation.x = -Math.PI / 2 + Math.atan(TILT);
  floor.position.set(0, Y0 - 0.02, 0);
  world.add(floor, path, inner);

  /* ---- spokes: the figure's head to every door ------------------------------------------------ */
  const spokePos = new Float32Array(N * 6);
  const spokeGeo = new THREE.BufferGeometry();
  spokeGeo.setAttribute('position', new THREE.BufferAttribute(spokePos, 3).setUsage(THREE.DynamicDrawUsage));
  const spokeMat = new THREE.LineBasicMaterial({ color: COLORS.sage, transparent: true, opacity: 0.2, depthWrite: false });
  const spokes = new THREE.LineSegments(spokeGeo, spokeMat);
  spokes.frustumCulled = false;
  world.add(spokes);

  /* ---- the nine doors (one instanced draw call) -------------------------------------------------- */
  const doorGeo = extrude(archShape({ width: TW, height: TH, bottom: 0 }), { depth: TD, bevel: 0.024, bevelSegments: low ? 2 : 3, curveSegments: low ? 18 : 32 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
  const doors = new THREE.InstancedMesh(doorGeo, doorMat, N);
  doors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseCol = [];
  for (let i = 0; i < N; i++) { baseCol.push(i % 2 ? COLORS.sage : COLORS.cream); doors.setColorAt(i, baseCol[i]); }
  doors.instanceColor.setUsage(THREE.DynamicDrawUsage);
  doors.frustumCulled = false;
  doors.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, Y0, 0), R + 1.4);   // instances move: a fixed generous bound
  world.add(doors);

  // serif door numbers from one atlas (9 cells), each on its own tiny plane
  const CELL = 128;
  const atlas = kit.canvasTexture(CELL * N, CELL, (g) => {
    g.fillStyle = HEX.navy;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `italic 400 ${Math.round(CELL * 0.64)}px ${FONT_SERIF}`;
    for (let i = 0; i < N; i++) g.fillText(String(i + 1).padStart(2, '0'), CELL * (i + 0.5), CELL * 0.56);
  }, { maxSize: low ? 1024 : 2048 });
  const numMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, premultipliedAlpha: true, depthWrite: false, toneMapped: false });
  const nums = [];
  for (let i = 0; i < N; i++) {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / N);
    const m = new THREE.Mesh(g, numMat);
    m.renderOrder = 2;
    world.add(m);
    nums.push(m);
  }

  /* ---- the live connection: a camera-facing ribbon from the head to one door, ending in a dot ------ */
  const SEG = 44;
  const rib = new Float32Array((SEG + 1) * 6);
  const ridx = new Uint16Array(SEG * 6);
  for (let s = 0; s < SEG; s++) { const a = s * 2; ridx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], s * 6); }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.BufferAttribute(rib, 3).setUsage(THREE.DynamicDrawUsage));
  ribGeo.setIndex(new THREE.BufferAttribute(ridx, 1));
  const ribMat = new THREE.MeshBasicMaterial({ color: COLORS.terracotta, side: THREE.DoubleSide, toneMapped: false });
  const ribbon = new THREE.Mesh(ribGeo, ribMat);
  ribbon.frustumCulled = false;
  const endDot = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: COLORS.terracotta, toneMapped: false }));
  world.add(ribbon, endDot);

  const dust = kit.particles({ count: 200, box: [11, 9, 6], center: [0, 0.2, -1.6], size: 0.024, opacity: 0.38, drift: 0.16, fade: [8, 30], speed: 0.7 });
  world.add(dust);

  /* ---- state ------------------------------------------------------------------------------ */
  let rot = FRONT + rest * STEP, rotT = rot;
  let active = -1, hovered = -1, target = -1, linkP = 1, lastEmit = -2;
  const DRIFT = 0.085;                                  // idle turn (rad/s): a new door reaches the front every ~7 s
  const lvl = new Float32Array(N);
  const dx = new Float32Array(N), dy = new Float32Array(N), dz = new Float32Array(N), dsc = new Float32Array(N);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3v = new THREE.Vector3();
  const tint = new THREE.Color();
  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), P3 = new THREE.Vector3();
  const BP = new THREE.Vector3(), BT = new THREE.Vector3(), VW = new THREE.Vector3(), NN = new THREE.Vector3(), CAM = new THREE.Vector3();
  const nearest = (to, from) => { let t = to; while (t - from > Math.PI) t -= TAU; while (t - from < -Math.PI) t += TAU; return t; };
  const frontIndex = () => (((Math.round((rot - FRONT) / STEP)) % N) + N) % N;

  const bez = (t, out) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return out.set(P0.x * a + P1.x * b + P2.x * c + P3.x * d, P0.y * a + P1.y * b + P2.y * c + P3.y * d, P0.z * a + P1.z * b + P2.z * c + P3.z * d);
  };
  const bezT = (t, out) => {
    const u = 1 - t, a = 3 * u * u, b = 6 * u * t, c = 3 * t * t;
    return out.set(a * (P1.x - P0.x) + b * (P2.x - P1.x) + c * (P3.x - P2.x), a * (P1.y - P0.y) + b * (P2.y - P1.y) + c * (P3.y - P2.y), a * (P1.z - P0.z) + b * (P2.z - P1.z) + c * (P3.z - P2.z));
  };
  function buildRibbon(p, width) {
    CAM.copy(camera.position);
    world.worldToLocal(CAM);
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      bez(t, BP); bezT(t, BT);
      VW.subVectors(CAM, BP);
      NN.crossVectors(BT, VW);
      const l = NN.length() || 1;
      const sw = Math.min(1, t / 0.16), ew = Math.max(0, (t - 0.86) / 0.14);
      const w = (width * (0.22 + 0.78 * sw * sw * (3 - 2 * sw)) * (1 - 0.35 * ew)) / l;
      const o = s * 6;
      rib[o] = BP.x + NN.x * w; rib[o + 1] = BP.y + NN.y * w; rib[o + 2] = BP.z + NN.z * w;
      rib[o + 3] = BP.x - NN.x * w; rib[o + 4] = BP.y - NN.y * w; rib[o + 5] = BP.z - NN.z * w;
    }
    ribGeo.attributes.position.needsUpdate = true;
    ribGeo.setDrawRange(0, Math.round(p * SEG) * 6);
    bez(p, endDot.position);
  }

  /* ---- framing ----------------------------------------------------------------------------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist = 16, lookY = -0.42, camY = 1.2, lift = 0;
  function resize(c) {
    const a = c.size.aspect;
    const stacked = !!O.stacked;
    // the composition (doors + numbers + mark) is ≈ 6.4 × 4.3 world units; fit it with a margin at any aspect
    const H = Math.max(stacked ? 4.45 : 4.5, (stacked ? 5.9 : 6.05) / a);
    dist = H / (2 * tanHalf);
    camera.near = 0.1; camera.far = dist + 40; camera.updateProjectionMatrix();
    // tall stages (desktop column): lift the subject a touch so the caption card below has room
    lift = stacked ? 0 : a < 1 ? 0.07 : 0.03;
    shiftView(camera, 0, lift, c.size.width, c.size.height);
    // the disc: cropped by the frame's top-right corner, as in the brand artwork. On the stacked band the top edge is
    // not a frame edge (the band sits mid-page until it sticks), so there it is cropped by the right edge only.
    const zD = -3.4, half = (dist - zD) * tanHalf;
    const rD = Math.min(1.8, half * (stacked ? 0.33 : 0.3));
    discRig.scale.setScalar(rD / 1.7);
    discRig.position.set(half * a * (stacked ? 1.0 : 0.97), lookY + half * (stacked ? 0.5 : 0.34), zD);
    discRig.rotation.set(0.05, -0.22, 0);
  }

  /* ---- per frame -------------------------------------------------------------------------- */
  function update(c) {
    const settled = c.settled || c.static;
    const t = settled ? 0 : c.time, dt = settled ? 1 : c.delta;
    const px = c.pointer.x, py = c.pointer.y;

    // ring rotation: hold under the pointer, turn to the chosen door, otherwise drift
    if (settled) { if (hovered < 0 && active >= 0) rot = rotT; }
    else {
      if (hovered >= 0) rotT = rot;
      else if (active < 0 && !c.reducedMotion) rotT += DRIFT * dt;
      rot = damp(rot, rotT, 2.4, dt);
    }
    const front = frontIndex();
    const tgt = hovered >= 0 ? hovered : active >= 0 ? active : front;
    if (tgt !== target) { target = tgt; linkP = settled ? 1 : 0; }
    if (target !== lastEmit) { lastEmit = target; c.emit('target', { index: target }); }

    // intro: the mark rises, the doors open out from the centre one by one, then the line connects
    const iMark = kit.intro(0, 1.3, ease.outExpo);
    markRig.position.y = MARK_Y - (1 - iMark) * 0.35;
    markRig.scale.setScalar(0.9 + 0.1 * iMark);
    const k = settled ? 1 : 1 - Math.exp(-9 * dt);
    const lp = settled ? 1 : clamp01((c.time - 1.4) / 0.5);    // the link waits for the doors to arrive

    for (let i = 0; i < N; i++) {
      const ip = settled ? 1 : ease.outExpo(clamp01((c.time - 0.3 - i * 0.07) / 1.25));
      const phi = rot - i * STEP;
      const rr = 0.3 + 0.7 * ip;
      const on = i === target ? 1 : 0;
      lvl[i] += (on - lvl[i]) * k;
      const L = lvl[i];
      const s = Math.max(0.0001, ip * (1 + 0.26 * L));
      const x = R * rr * Math.cos(phi), zb = RZ * rr * Math.sin(phi);
      const y = Y0 - TILT * zb + L * 0.1 + Math.sin(t * 0.7 + i * 1.3) * 0.018;
      const z = zb + L * 0.12;
      dx[i] = x; dy[i] = y; dz[i] = z; dsc[i] = s;
      M4.compose(P3v.set(x, y, z), Q, S3.set(s, s, s));
      doors.setMatrixAt(i, M4);
      tint.copy(baseCol[i]).lerp(COLORS.terracotta, L);
      doors.setColorAt(i, tint);
      nums[i].position.set(x, y + TH * 0.47 * s, z + (TD / 2 + 0.005) * s);
      nums[i].scale.setScalar(TW * 0.8 * s);
      const o = i * 6;
      spokePos[o] = 0; spokePos[o + 1] = HEAD_Y + mark.group.position.y; spokePos[o + 2] = 0;
      spokePos[o + 3] = x; spokePos[o + 4] = y + TH * 0.42 * s; spokePos[o + 5] = z;
    }
    doors.instanceMatrix.needsUpdate = true;
    doors.instanceColor.needsUpdate = true;
    spokeGeo.attributes.position.needsUpdate = true;
    spokeMat.opacity = 0.2 * (settled ? 1 : clamp01((c.time - 0.9) / 1));
    pathMat.opacity = 0.16 * (settled ? 1 : clamp01((c.time - 0.3) / 1.2));
    innerMat.opacity = pathMat.opacity;

    // scroll: the camera settles a little lower as the index scrolls past (settled frame = middle pose)
    const sp = settled ? 0.5 : c.scroll.progress;
    camera.position.set(px * 0.35, camY + (0.5 - sp) * 0.7 + py * 0.2, dist);
    camera.lookAt(0, lookY, 0);
    world.rotation.set(-py * 0.035, px * 0.11, 0);
    world.updateMatrixWorld();

    // the connection
    if (!settled) linkP = Math.min(1, linkP + dt / 0.8);
    const draw = ease.inOutCubic(linkP) * lp;
    if (target >= 0 && draw > 0.001) {
      const s = dsc[target];
      P0.set(0, HEAD_Y + mark.group.position.y + markRig.position.y - MARK_Y, 0.02);
      P3.set(dx[target], dy[target] + TH * s + 0.075, dz[target]);
      const side = P3.x - P0.x > 0.25 ? 1 : P3.x - P0.x < -0.25 ? -1 : 1;
      P1.set(P0.x + side * 0.32, P0.y + 0.02, P0.z + 0.95);
      P2.set(P3.x + side * 0.3, P3.y + 0.48, P3.z + 0.3);
      buildRibbon(draw, 0.026);
      ribbon.visible = true;
      endDot.visible = true;
      endDot.scale.setScalar(0.052 * (0.55 + 0.45 * ease.outCubic(clamp01((draw - 0.8) / 0.2))));
    } else { ribbon.visible = false; endDot.visible = false; }

    line.setProgress(kit.intro(0.35, 2.4, ease.inOutCubic));
    const iDisc = kit.intro(0.1, 1.8, ease.outExpo);
    disc.position.x = (1 - iDisc) * 0.9;
    disc.position.y = (1 - iDisc) * 0.4;
    kit.updateFloaters(t, settled ? 0 : 1);
    dust.update(c);
    lights.update(c);
  }

  /* ---- picking (raycast on the instanced doors; touch falls back to the nearest door) ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = [];
  const pv = new THREE.Vector3();
  function pickAt(x, y, touch = false) {
    const r = ctx.container.getBoundingClientRect();   // the canvas fills the stage (the engine may swap canvases)
    if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) return -1;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    world.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    hits.length = 0;
    ray.intersectObject(doors, false, hits);
    if (hits.length && hits[0].instanceId != null) return hits[0].instanceId;
    if (!touch) return -1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      pv.set(dx[i], dy[i] + TH * 0.45 * dsc[i], dz[i]).applyMatrix4(world.matrixWorld).project(camera);
      const sx = (pv.x + 1) / 2 * r.width, sy = (1 - pv.y) / 2 * r.height;
      const dd = Math.hypot(sx - (x - r.left), sy - (y - r.top));
      if (dd < bd) { bd = dd; best = i; }
    }
    return bd < 30 ? best : -1;
  }

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    degrade() { dust.visible = false; inner.visible = false; },
    api: {
      setActive(i) { const n = typeof i === 'number' && i >= 0 && i < N ? i : -1; active = n; if (n >= 0) rotT = nearest(FRONT + n * STEP, rot); ctx.invalidate(); },
      setHovered(i) { hovered = typeof i === 'number' && i >= 0 && i < N ? i : -1; ctx.invalidate(); },
      pickAt,
      get target() { return target; },
      get hovered() { return hovered; },
    },
  };
}
