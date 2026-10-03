/**
 * Reference scene (kit example) — an organisational structure made of the logo's own figures:
 * layouts.orgChart() positions, kit.people() figures (2 instanced draw calls), links drawn with
 * network({ showNodes: false }), with a cream-rimmed sage arch
 * behind. Scroll assembles the tiers; pointer adds gentle parallax.
 *
 * sceneOptions: { levels: [1, 3, 6] }
 */
import { createKit, layouts, ease, segment, clamp01 } from '../kit.js';

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const opts = { levels: [1, 3, 6], ...ctx.options };
  const kit = createKit(ctx);
  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({ key: 1.9, rim: 1.4, fill: 0.5, glow: 6, glowPos: [0, 1.5, 5] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  // backdrop form: a deep doorway (cream rim, navy-soft fill) the organisation stands in — the sage people read against
  // it (a sage fill here would swallow their bodies)
  const arch = kit.rimmedArch({ width: 3.6, height: 2.3, below: 4, rim: 0.14, depth: 0.2, colors: { fill: 'navySoft' }, emissive: 0.08 });
  arch.group.position.set(0, -1.7, -2.4);
  world.add(arch.group);

  // people on an org chart. Every figure is the logo's person — terracotta head, sage body, ALWAYS (never recolour
  // the person: it is the brand's human element). Tiers read through scale and depth only.
  const org = layouts.orgChart({ levels: opts.levels, width: 4.2, height: 2.4, depth: 0.6, seed: 4, jitter: 0.05 });
  const tierLook = [{ head: 'terracotta', body: 'sage', h: 0.62 }, { head: 'terracotta', body: 'sage', h: 0.5 }, { head: 'terracotta', body: 'sage', h: 0.42 }];
  const people = kit.people({
    items: org.nodes.map((n) => {
      const look = tierLook[Math.min(n.level, tierLook.length - 1)];
      return { p: [n.p[0], n.p[1] - look.h * 0.45, n.p[2]], height: look.h, head: look.head, body: look.body };
    }),
  });
  world.add(people.group);
  // links join the figures' chests (node points), drawn as fine sage lines
  const links = kit.network({ nodes: org.nodes, links: org.links, lineColor: 'sage', lineOpacity: 0.32, showNodes: false });
  world.add(links.group);

  const base = Float32Array.from(people.pos);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  function resize(c) {
    const H = Math.max(4.2, 6.2 / c.size.aspect) * 1.05;
    const d = H / (2 * tanHalf);
    camera.position.set(0, 0.9, d);
    camera.lookAt(0, 0, 0);
  }
  function update(c) {
    // tiers assemble as the section enters (settled frames: fully assembled)
    const a = c.settled ? 1 : ease.outCubic(segment(c.scroll.enter, 0.1, 0.8));
    for (let i = 0; i < people.count; i++) {
      const lvl = org.nodes[i].level;
      const k = clamp01(a * 1.6 - lvl * 0.3);
      people.setPosition(i, base[i * 3], base[i * 3 + 1] - (1 - k) * 0.5, base[i * 3 + 2]);
      people.setScale(i, Math.max(0.001, k));
    }
    people.update();
    links.lines.material.opacity = 0.32 * a;
    world.rotation.set(-c.pointer.y * 0.05, c.pointer.x * 0.14, 0);
    lights.update(c);
  }
  resize(ctx);
  update(ctx);
  return { update, resize };
}
