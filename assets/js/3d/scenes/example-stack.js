/**
 * Reference scene (kit example) — the HR Starter Pack as a 3D document stack that responds to
 * scroll: a neat cascade (every header visible) that fans into an arc as the section scrolls
 * through the viewport. Hover (or api.focus(i) from DOM links) lifts a document forward.
 *
 * Page agents: copy this into scenes/<your-page>.js and adapt. Keep the real, accessible content
 * (titles, links) in the DOM — the canvas is aria-hidden decoration.
 *
 * sceneOptions: { spread: [start, end] — window of ctx.scroll.progress mapped to cascade→fan (default [0.12, 0.45]) }
 * events: container dispatches `hc3d:focus` { index } when the pointer hovers a document.
 * api: { focus(index | -1) }
 */
import { createKit, segment } from '../kit.js';

const DOCS = [
  { number: '01', title: 'Employee Handbook', variant: 'cover' },
  { number: '02', title: 'Essential HR Policies', variant: 'cover' },
  { number: '03', title: 'Disciplinary & Grievance Procedures', variant: 'cover' },
  { number: '04', title: 'Absence Management Documentation', variant: 'cover' },
  { number: '05', title: 'Family Leave Policies', variant: 'cover' },
  { number: '06', title: 'Manager Guidance Documents', variant: 'cover' },
  { number: '07', title: 'HR Templates and Forms', variant: 'cover' },
];

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const opts = { spread: [0.12, 0.45], ...ctx.options };   // settled (progress .5) = the full fan: no title is ever covered
  const kit = createKit(ctx);
  await kit.ready; // fonts for the document faces

  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({ key: 2.3, rim: 1.5, fill: 0.45, keyPos: [-3, 5, 7], glow: 9, glowPos: [0, 1, 5] });
  scene.add(lights.group);

  const W = 1.1;
  const stack = kit.stack(DOCS, { width: W, height: W * 1.414, style: 'paper', spreadX: 1.22 });   // > W: cards never overlap when fanned
  const rig = new THREE.Group();
  rig.add(stack.group);
  scene.add(rig);
  // tag meshes with their card index for picking
  stack.cards.forEach((c, i) => c.group.traverse((o) => { o.userData.card = i; }));
  const picker = kit.picker(stack.cards.map((c) => c.group));

  let focus = -1, hovered = -1;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  let aspect = 1, spreadNow = 0;
  function frameCamera() {
    // frame the cascade tightly, pulling back as it fans into the arc (≈ 7 × spreadX + a card wide)
    const needW = 3.6 + (9.3 - 3.6) * spreadNow, needH = 3.3;
    const H = Math.max(needH, needW / aspect) * 1.08;
    const d = H / (2 * tanHalf);
    camera.position.set(0, d * 0.16, d);
    camera.lookAt(0, 0.05, -0.6);
  }
  function resize(c) { aspect = c.size.aspect; frameCamera(); }

  function update(c) {
    // settled frames get progress 0.5 from the engine (or ?hc3d-preview) → a composed half-fan
    const spread = segment(c.scroll.progress, opts.spread[0], opts.spread[1]);
    spreadNow = spread;
    frameCamera();
    // hover picking (desktop pointer only)
    if (!c.settled && !c.pointer.touch) {
      const hit = picker.pick();
      const h = hit ? hit.object.userData.card ?? -1 : -1;
      if (h !== hovered) { hovered = h; c.emit('focus', { index: h }); }
    }
    stack.layout(spread, focus >= 0 ? focus : hovered, c.settled ? 1 : c.delta);
    rig.rotation.set(-c.pointer.y * 0.05, c.pointer.x * 0.1, 0);
    lights.update(c);
  }

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    api: { focus(i) { focus = typeof i === 'number' ? i : -1; ctx.invalidate(); } },
  };
}

