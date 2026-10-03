/**
 * About page — "Experience that understands the bigger picture."
 * One world inside the page's doorway window. The camera travels through Sarah's story (progress 0..5, driven by the
 * page as the chapters are read):
 *   0 the bigger picture      establishing shot: the doorway mark (the logo as an object) in front of a whole
 *                             organisation (1 · 3 · 6 · 12 figures), a far network, the disc, the rimmed arch, the line
 *   1 the founder             close on the doorway: one person
 *   2 20+ years               people gather in an arch around the doorway, each linked to it (people, connection)
 *   3 scale                   the organisation grows back to full size; the far network brightens
 *   4 operational & strategic the structure settles onto two glass floors (strategic above, operational below) and the
 *                             camera rises to a high three-quarter view: the bigger picture
 *   5 HCLabs                  the organisation recedes; a small team gathers at the doorway's threshold
 * Visual metaphors only (no employers, dates or numbers beyond the supplied facts).
 *
 * sceneOptions: { progress, intro }  progress: number or getter, 0..5 (read every frame; smoothed here, exact on settled
 *              frames) · intro: false skips the entrance (read once, when the static art is already showing)
 * Pointer: gentle camera orbit + the cursor light. Idle: slow float. Settled (reduced motion / ?shot=1): the exact pose.
 * Budget: ~17 draw calls — people are instanced (2 calls), all links are one LineSegments with per-vertex alpha,
 * glass is the cheap fresnel kind on every tier (no transmission pass).
 */
import { createKit, COLORS, ease, clamp01, lerp, damp, smoothstep, layouts } from '../kit.js';

const outBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/* ---- composition (world units) ---------------------------------------------------------------- */
const LEVELS = [1, 3, 6, 12];
const TIER_H = [0.46, 0.4, 0.34, 0.29];
const ORG_OFF = [0, 0.78, -2.75];
const MARK = { pos: [0, -1.0, 0.8], height: 1.5 };
const HUB = [0, -0.18, 0.5];                                   // links meet just behind the doorway's figure
const TEAM = { idx: [1, 5, 8, 3], pos: [[-1.12, -1.0, 1.4], [-0.52, -1.0, 1.86], [0.56, -1.0, 1.84], [1.14, -1.0, 1.38]] };
const FLOORS = {
  top: { y: 1.02, c: [0, -2.62], size: [3.5, 1.9] },
  bot: { y: -0.56, c: [0, -2.38], size: [6.2, 2.5] },
};
const DISC = { pos: [3.35, 3.55, -8.6], radius: 2.25 };
const RIM = { pos: [-3.5, -4.55, -7.6], width: 3.3, height: 1.6, below: 5 };
const LINE = [
  [-6.6, -3.05, -4.4], [-4.7, -2.5, -2.9], [-2.75, -1.8, -1.05], [-1.2, -1.38, 0.55], [0.15, -1.21, 1.05],
  [1.22, -1.03, 1.05], [2.25, -0.6, 0.4], [3.35, 0.02, -0.55], [4.8, 0.62, -1.3], [6.9, 1.3, -2.4],
];
// camera per state: look-at target, framed box [w, h] at the target, elevation, azimuth (radians)
const CAM = [
  { t: [0, 0.32, -1.4], box: [6.1, 5.8], el: 0.12, az: 0.0 },
  { t: [0.06, -0.3, 0.8], box: [2.55, 2.8], el: 0.04, az: -0.12 },
  { t: [0, -0.05, -0.1], box: [4.7, 3.9], el: 0.12, az: 0.15 },
  { t: [0, 0.34, -1.4], box: [6.3, 5.9], el: 0.08, az: -0.07 },
  { t: [0, 0.18, -2.1], box: [6.9, 5.4], el: 0.44, az: -0.62 },
  { t: [0, -0.5, 1.0], box: [3.4, 3.1], el: 0.16, az: 0.2 },
];
// link weights per state
const W_HUBRING = [0, 0, 1, 0, 0, 0];
const W_ORG = [1, 0, 0, 1, 1, 0];
const W_TEAM = [0, 0, 0, 0, 0, 1];
const W_STARS = [0.6, 0.2, 0.4, 0.9, 0.7, 0.28];
const W_GLOW = [1, 1.35, 1.1, 1, 1, 1.2];
const W_RIM = [1, 0, 0, 1, 0.75, 0];                  // the rimmed arch rises when the picture widens

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  const q = ctx.quality;
  const opts = ctx.options || {};
  // intro: false when the static art already stands in the window (the world then cross-fades in at its settled pose)
  const skipIntro = opts.intro === false;
  const intro = (delay, dur, fn) => (skipIntro ? 1 : kit.intro(delay, dur, fn));
  const readProgress = () => { const v = +opts.progress; return Number.isFinite(v) ? Math.min(5, Math.max(0, v)) : 0; };

  kit.environment({ intensity: 0.5 });
  scene.fog = new THREE.Fog(COLORS.navy, 18, 44);
  const lights = kit.lights({
    key: 2.05, rim: 1.8, fill: 0.44, keyPos: [-4.5, 5.5, 8], rimPos: [4.5, 3, -5.5], follow: [2.2, 1.4],
    glow: 11, glowPos: [0.3, 0.7, 4.6], glowFollow: [3.2, 2.2],
  });
  scene.add(lights.group);
  const glowBase = lights.point ? lights.point.intensity : 0;

  const world = new THREE.Group();
  scene.add(world);

  /* ---- background forms: disc (top right), cream-rimmed sage arch (bottom left) ------------------ */
  const discRig = new THREE.Group();
  discRig.position.set(...DISC.pos);
  discRig.rotation.set(0.04, -0.16, 0);
  const disc = kit.disc({ radius: DISC.radius, thickness: 0.22, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: DISC.radius * 2, height: DISC.radius * 2, blur: 0.11, opacity: 0.66 });
  discShadow.position.set(0.1, -0.3, -0.16);
  discRig.add(discShadow, disc);
  world.add(discRig);

  const rim = kit.rimmedArch({ width: RIM.width, height: RIM.height, below: RIM.below, rim: 0.15, depth: 0.22, emissive: 0.13 });
  const rimRig = new THREE.Group();
  rimRig.position.set(...RIM.pos);
  rimRig.rotation.y = 0.18;
  const rimShadow = kit.softShadow({ shape: 'arch', width: RIM.width, height: RIM.height + RIM.below, blur: 0.07, opacity: 0.5 });
  rimShadow.position.set(0.1, (RIM.height - RIM.below) / 2 - 0.16, -0.2);
  rimRig.add(rimShadow, rim.group);
  world.add(rimRig);

  /* ---- the doorway mark ------------------------------------------------------------------------- */
  const markHolder = new THREE.Group();
  markHolder.position.set(...MARK.pos);
  const markRig = new THREE.Group();
  markRig.rotation.set(0.02, -0.12, 0);
  const mark = kit.archMark({ height: MARK.height, depth: 12, anchor: 'base' });
  const markShadow = kit.softShadow({ shape: 'arch', width: mark.width, height: MARK.height, blur: 0.12, opacity: 0.42 });
  markShadow.position.set(0.12, MARK.height / 2 - 0.16, -0.62);
  markRig.add(markShadow, mark.group);
  markHolder.add(markRig);
  world.add(markHolder);
  kit.floater(markRig, { amp: 0.025, speed: 0.4, rot: 0.01 });

  /* ---- the flowing line ------------------------------------------------------------------------- */
  const line = kit.flowLine({ points: LINE, radius: 0.021, taper: [0.14, 0.1], tubularSegments: 380 });
  world.add(line.group);

  /* ---- the far network (the wider world) -------------------------------------------------------- */
  const cons = layouts.constellation({ count: 46, radius: [7.4, 4.4, 2.2], center: [0, 1.7, -10.5], seed: 12, k: 2, minDist: 1.0, size: [0.035, 0.085] });
  const stars = kit.network({ nodes: cons.nodes, links: cons.links, shading: 'flat', lineColor: "sage", lineOpacity: 0.16 });
  world.add(stars.group);

  const dust = kit.particles({ count: 240, box: [11, 8.5, 10], center: [0, 0.6, -2.4], size: 0.026, opacity: 0.36, drift: 0.15, fade: [6, 28], speed: 0.7 });
  world.add(dust);

  /* ---- people: one organisation, re-arranged per chapter ---------------------------------------- */
  const org = layouts.orgChart({ levels: LEVELS, width: 5.6, height: 3.5, depth: 0.7, seed: 4, jitter: 0.05 });
  const N = org.nodes.length;                                 // 22
  const tier = org.nodes.map((n) => n.level);
  const H = tier.map((t) => TIER_H[t]);
  const look = (i) => {
    const t = tier[i];
    if (t === 0) return ['terracotta', 'cream'];
    if (t === 1) return ['terracotta', 'sage'];
    if (t === 2) return ['cream', 'sage'];
    return i % 2 ? ['terracotta', 'sageBrand'] : ['sage', 'cream'];
  };
  const people = kit.people({ items: org.nodes.map((n, i) => ({ p: [0, 0, 0], height: H[i], head: look(i)[0], body: look(i)[1] })) });
  world.add(people.group);

  // poses per state: positions (figure base) + visibility
  const POS = [], VIS = [];
  for (let s = 0; s < 6; s++) { POS.push(new Float32Array(N * 3)); VIS.push(new Uint8Array(N)); }
  const put = (s, i, x, y, z, v = 1) => { POS[s][i * 3] = x; POS[s][i * 3 + 1] = y; POS[s][i * 3 + 2] = z; VIS[s][i] = v; };
  // organisation (front view): node points are chests; figure bases sit below them
  const orgBase = org.nodes.map((n, i) => [n.p[0] + ORG_OFF[0], n.p[1] + ORG_OFF[1] - H[i] * 0.45, n.p[2] + ORG_OFF[2]]);
  // arch of people around the doorway (figures 0..9)
  const ring = [];
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * (0.95 - (k * 0.9) / 9);
    ring.push([Math.cos(a) * 1.98, -0.78 + Math.sin(a) * 1.58, -0.3 - Math.sin(a) * 0.6]);
  }
  // two floors: strategic (tiers 0–1) above, operational (tiers 2–3) below
  const floorPos = [];
  {
    const T = FLOORS.top, B = FLOORS.bot;
    const t1 = [[-1.08, T.y, -2.28], [0.02, T.y, -2.12], [1.1, T.y, -2.3]];
    let k1 = 0, k2 = 0, k3 = 0;
    for (let i = 0; i < N; i++) {
      if (tier[i] === 0) floorPos.push([0.05, T.y, -3.08]);
      else if (tier[i] === 1) floorPos.push(t1[k1++]);
      else if (tier[i] === 2) { floorPos.push([-2.35 + k2 * 0.94, B.y, -3.12]); k2++; }
      else { const row = k3 % 2, col = Math.floor(k3 / 2); floorPos.push([-2.62 + col * 0.94 + row * 0.47, B.y, row ? -1.62 : -2.36]); k3++; }
    }
  }
  const teamOf = new Int8Array(N).fill(-1);
  TEAM.idx.forEach((fi, k) => { teamOf[fi] = k; });
  for (let i = 0; i < N; i++) {
    const [ox, oy, oz] = orgBase[i];
    put(0, i, ox, oy, oz, 1);
    put(1, i, ox, oy, oz, 0);
    if (i < 10) put(2, i, ...ring[i], 1); else put(2, i, ox, oy, oz, 0);
    put(3, i, ox, oy, oz, 1);
    put(4, i, ...floorPos[i], 1);
    if (teamOf[i] >= 0) put(5, i, ...TEAM.pos[teamOf[i]], 1); else put(5, i, ...floorPos[i], 0);
  }
  // hidden poses borrow the neighbouring visible position, so figures shrink/grow in place (never slide while invisible)
  const DELAY = new Float32Array(N);
  for (let i = 0; i < N; i++) DELAY[i] = 0.06 + tier[i] * 0.075 + (i % 6) * 0.014;
  const bob = new Float32Array(N);
  for (let i = 0; i < N; i++) bob[i] = i * 1.37;

  /* ---- links: hub↔arch, arch neighbours, organisation, hub↔team, team neighbours ---------------- */
  const LINKS = [];   // [a, b, kind] (a/b = figure index, -1 = the hub behind the doorway)
  for (let k = 0; k < 10; k++) LINKS.push([-1, k, 0]);
  for (let k = 0; k < 9; k++) LINKS.push([k, k + 1, 1]);
  for (const [a, b] of org.links) LINKS.push([a, b, 2]);
  for (const fi of TEAM.idx) LINKS.push([-1, fi, 3]);
  for (let k = 0; k < TEAM.idx.length - 1; k++) LINKS.push([TEAM.idx[k], TEAM.idx[k + 1], 4]);
  const NL = LINKS.length;
  const KIND_COL = [COLORS.terracotta, COLORS.sage, COLORS.sage, COLORS.terracotta, COLORS.sage];
  const KIND_A = [0.34, 0.5, 0.42, 0.5, 0.5];
  const lPos = new Float32Array(NL * 6), lCol = new Float32Array(NL * 8);
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3).setUsage(THREE.DynamicDrawUsage));
  lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 4).setUsage(THREE.DynamicDrawUsage));
  for (let l = 0; l < NL; l++) {
    const c = KIND_COL[LINKS[l][2]];
    for (let v = 0; v < 2; v++) { const o = l * 8 + v * 4; lCol[o] = c.r; lCol[o + 1] = c.g; lCol[o + 2] = c.b; lCol[o + 3] = 0; }
  }
  const lMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const links = new THREE.LineSegments(lGeo, lMat);
  links.frustumCulled = false;
  world.add(links);

  /* ---- glass floors (chapter 4) ----------------------------------------------------------------- */
  const glass = { transmission: false, opacity: 0.12, frost: 0.034, rim: 0.65 };
  const mkFloor = (F) => {
    const rig = new THREE.Group();
    rig.position.set(F.c[0], F.y - 0.03, F.c[1]);
    const slab = kit.card({ width: F.size[0], height: F.size[1], depth: 0.05, radius: 0.16, style: 'glass', glass });
    slab.group.rotation.x = -Math.PI / 2;
    rig.add(slab.group);
    rig.visible = false;
    world.add(rig);
    return rig;
  };
  const floorTop = mkFloor(FLOORS.top), floorBot = mkFloor(FLOORS.bot);

  /* ---- camera framing --------------------------------------------------------------------------- */
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = new Float32Array(6);
  const T = new THREE.Vector3(), P = new THREE.Vector3();
  let rimDrop = 0;
  function resize(c) {
    const a = Math.max(0.35, c.size.aspect);
    for (let s = 0; s < 6; s++) {
      const [w, h] = CAM[s].box;
      dist[s] = Math.max((h / 2) / tanHalf, (w / 2) / (tanHalf * a));
    }
    // taller windows are framed by width, so the camera sits further back: keep the fog band behind the disc (true
    // terracotta at any aspect) and lower the rimmed arch by the extra height, so only its crown rises into view
    const d0 = dist[0];
    scene.fog.near = d0 + 7.5;
    scene.fog.far = d0 + 34;
    // (the composition was tuned in the 1440 × 900 window, aspect ≈ 0.77; measure the extra height against that)
    const halfH = (a0) => Math.max(CAM[0].box[1] / 2, CAM[0].box[0] / 2 / a0);
    const extra = Math.min(3, Math.max(-0.6, halfH(a) - halfH(0.77)));
    rimDrop = extra * ((d0 + (CAM[0].t[2] - RIM.pos[2])) / d0);
    camera.near = 0.1; camera.far = 80; camera.updateProjectionMatrix();
  }

  /* ---- frame ------------------------------------------------------------------------------------ */
  let prog = readProgress();
  const wKind = new Float32Array(5);
  const stateW = (arr, a, b, t) => lerp(arr[a], arr[b], t);
  const chest = new Float32Array(3), chestB = new Float32Array(3);
  const chestOf = (i, out) => {
    if (i < 0) { out[0] = HUB[0]; out[1] = HUB[1]; out[2] = HUB[2]; return 1; }
    const s = people.mult[i];
    out[0] = people.pos[i * 3]; out[1] = people.pos[i * 3 + 1] + H[i] * s * 0.46; out[2] = people.pos[i * 3 + 2];
    return Math.min(1, s);
  };

  function update(c) {
    const settled = c.settled || c.static;
    const target = readProgress();
    prog = settled ? target : damp(prog, target, 3.4, c.delta);
    if (Math.abs(prog - target) < 1e-4) prog = target;
    const a = Math.min(4, Math.floor(prog)), b = a + 1, f = prog - a;
    const tc = smoothstep(0.06, 0.94, f);
    const time = settled ? 0 : c.time;

    /* intro (first seconds of scene time; 1 when settled) */
    const rise = intro(0.05, 1.3, ease.outExpo);
    const headK = intro(0.7, 0.8, outBack);
    const discIn = intro(0.0, 1.9, ease.outExpo);
    const rimIn = intro(0.2, 2.0, ease.outExpo);
    const lineIn = intro(0.45, 2.3, ease.inOutCubic);
    const starsIn = intro(1.3, 1.6, ease.outCubic);

    markHolder.position.set(MARK.pos[0], MARK.pos[1] - (1 - rise) * 0.55, MARK.pos[2]);
    if (mark.head) mark.head.scale.setScalar(Math.max(0.001, headK));
    discRig.position.set(DISC.pos[0] + (1 - discIn) * 1.2, DISC.pos[1] + (1 - discIn) * 0.9, DISC.pos[2]);
    const rimW = ease.inOutCubic(clamp01(lerp(W_RIM[a], W_RIM[b], tc)));
    rimRig.position.set(RIM.pos[0], RIM.pos[1] - rimDrop - (1 - rimIn) * 1.4 - (1 - rimW) * 2.6, RIM.pos[2]);
    rimRig.visible = rimW > 0.001;
    line.setProgress(lineIn);

    /* people */
    for (let i = 0; i < N; i++) {
      const ti = smoothstep(DELAY[i], DELAY[i] + 0.5, f);
      const va = VIS[a][i], vb = VIS[b][i], A = POS[a], B = POS[b], o = i * 3;
      let x, y, z, s;
      if (va && vb) {
        x = lerp(A[o], B[o], ti); y = lerp(A[o + 1], B[o + 1], ti) + Math.sin(Math.PI * ti) * 0.32; z = lerp(A[o + 2], B[o + 2], ti);
        s = 1 - Math.sin(Math.PI * ti) * 0.12;
      } else if (va) { x = A[o]; y = A[o + 1]; z = A[o + 2]; s = 1 - ease.inOutCubic(ti); }
      else if (vb) { x = B[o]; y = B[o + 1]; z = B[o + 2]; s = ti >= 1 ? 1 : outBack(ti); }
      else { x = A[o]; y = A[o + 1]; z = A[o + 2]; s = 0; }
      const pIn = intro(0.95 + tier[i] * 0.17 + (i % 6) * 0.035, 0.7, outBack);
      s *= pIn;
      if (!settled) y += Math.sin(time * 0.7 + bob[i]) * 0.018;
      people.setPosition(i, x, y - (1 - Math.min(1, pIn)) * 0.2, z);
      people.setScale(i, Math.max(0.0001, s));
    }
    people.update();

    /* links */
    const wRing = stateW(W_HUBRING, a, b, tc), wOrg = stateW(W_ORG, a, b, tc), wTeam = stateW(W_TEAM, a, b, tc);
    wKind[0] = wKind[1] = wRing; wKind[2] = wOrg; wKind[3] = wKind[4] = wTeam;
    for (let l = 0; l < NL; l++) {
      const L = LINKS[l];
      const sa = chestOf(L[0], chest), sb = chestOf(L[1], chestB);
      const o = l * 6;
      lPos[o] = chest[0]; lPos[o + 1] = chest[1]; lPos[o + 2] = chest[2];
      lPos[o + 3] = chestB[0]; lPos[o + 4] = chestB[1]; lPos[o + 5] = chestB[2];
      const al = KIND_A[L[2]] * wKind[L[2]] * Math.min(sa, sb);
      lCol[l * 8 + 3] = al; lCol[l * 8 + 7] = al;
    }
    lGeo.attributes.position.needsUpdate = true;
    lGeo.attributes.color.needsUpdate = true;

    /* glass floors */
    const wFloor = a === 4 ? 1 - tc : b === 4 ? tc : 0;
    const fk = ease.outCubic(clamp01(wFloor));
    floorTop.visible = floorBot.visible = fk > 0.002;
    floorTop.scale.set(fk, 1, fk);
    floorBot.scale.set(Math.min(1, fk * 1.08), 1, fk);

    /* the far network */
    const wStars = stateW(W_STARS, a, b, tc) * starsIn;
    stars.lines.material.opacity = 0.16 * wStars;
    if (!settled) stars.drift(time, 0.05, 0.22);
    for (let i = 0; i < stars.count; i++) stars.setScale(i, 0.35 + 0.65 * wStars);
    stars.update();

    /* camera: blend the two chapter poses, plus a gentle pointer orbit */
    const e = ease.inOutSine(tc), A = CAM[a], B = CAM[b];
    T.set(lerp(A.t[0], B.t[0], e), lerp(A.t[1], B.t[1], e), lerp(A.t[2], B.t[2], e));
    const d = lerp(dist[a], dist[b], e);
    const el = lerp(A.el, B.el, e) + c.pointer.y * 0.035;
    const az = lerp(A.az, B.az, e) + c.pointer.x * 0.075;
    P.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(T);
    camera.position.copy(P);
    camera.lookAt(T);

    if (lights.point) lights.point.intensity = glowBase * stateW(W_GLOW, a, b, tc);
    kit.updateFloaters(time, settled ? 0 : 1);
    dust.update(c);
    dust.material.uniforms.uOpacity.value = 0.36 * intro(0, 1.4, ease.outCubic);
    lights.update(c);
  }

  resize(ctx);
  update(ctx);
  return {
    update,
    resize,
    degrade() { dust.visible = false; stars.lines.visible = false; },
    api: { get progress() { return prog; } },
  };
}
