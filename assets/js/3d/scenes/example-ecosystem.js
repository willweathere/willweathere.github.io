/**
 * Reference scene (kit example) — a services ecosystem built from the logo's own forms, not a sphere-and-line
 * "network graph": the HCLabs mark stands at the centre and each service is a small DOORWAY (the mark's arch with
 * its person inside) on a gently tilted ring, joined to its neighbours by fine sage lines.
 *
 * Wiring pattern (accessible): the services are real links in the DOM. Hovering/focusing a link calls
 * api.setActive(i); hovering a doorway on the canvas dispatches `hc3d:hover` { index } on the container so the page
 * can highlight the matching link (and route clicks to its href). The active doorway lifts and its arch turns
 * terracotta — the person inside always keeps the brand's terracotta head and sage body.
 *
 * Draw calls: 3 instanced meshes (arches, bodies, heads) + 1 line segments + the centre mark, whatever the count.
 * sceneOptions: { count (9), radius (2.35), tilt (0.5), tile (0.42 = doorway height) }
 * api: { setActive(index | -1), get hovered }
 */
import { createKit, layouts, COLORS, extrude, archRingShape } from '../kit.js';

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const opts = { count: 9, radius: 2.35, tilt: 0.5, tile: 0.42, ...ctx.options };
  const kit = createKit(ctx);
  const low = ctx.quality.tier === 'low';

  kit.environment({ intensity: 0.5 });
  const lights = kit.lights({ key: 1.8, rim: 1.4, fill: 0.5, glow: 6, glowPos: [0, 1.2, 5] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  // centre: the logo as an object
  const mark = kit.archMark({ height: 1.05 });
  world.add(mark.group);

  // the ring (node 0 is the hidden hub; service i is node i + 1). Only the neighbour links are drawn: a quiet orbit.
  const ring = layouts.ring({ count: opts.count, radius: opts.radius, tilt: opts.tilt, hubSize: 0.001, size: 0.001 });
  const orbitLinks = ring.links.filter(([a, b]) => a !== 0 && b !== 0);
  const net = kit.network({ nodes: ring.nodes, links: orbitLinks, lineColor: 'sage', lineOpacity: 0.2, showNodes: false });
  world.add(net.group);

  // service doorways: one instanced arch ring + the person inside (instanced heads + bodies)
  const n = opts.count;
  const s = opts.tile / 56;                                          // logo units → world
  const archGeo = extrude(archRingShape({ thickness: 10 }), { depth: 8, bevel: 1.2, bevelSegments: low ? 2 : 4, curveSegments: low ? 16 : 28 });
  const archMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.64, metalness: 0 });
  const arches = new THREE.InstancedMesh(archGeo, archMat, n);
  const people = kit.people({
    items: ring.nodes.slice(1).map((nd) => ({ p: nd.p, height: opts.tile * 35 / 56, head: 'terracotta', body: 'sage' })),
  });
  arches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arches.frustumCulled = false;
  world.add(arches, people.group);
  const picker = kit.picker(arches);

  const dust = kit.particles({ count: 160, box: [9, 5, 5], center: [0, 0, -1], size: 0.024, opacity: 0.35 });
  world.add(dust);

  let active = -1, hovered = -1;
  const level = new Float32Array(n);                                 // eased highlight per doorway
  const scratch = new THREE.Color();
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), eu = new THREE.Euler(), p3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  function resize(c) {
    const H = Math.max(5.0, 6.6 / c.size.aspect) * 1.05;
    const d = H / (2 * tanHalf);
    camera.position.set(0, 0.9, d);
    camera.lookAt(0, 0, 0);
  }

  function layoutTiles(c) {
    // every doorway faces the viewer (counter-rotates the world's pointer tilt) and stands on its ring point
    q4.setFromEuler(eu.set(-world.rotation.x, -world.rotation.y, 0));
    for (let i = 0; i < n; i++) {
      const nd = ring.nodes[i + 1].p, l = level[i];
      const k = 1 + l * 0.35;
      p3.set(nd[0], nd[1] - opts.tile * 0.5 + l * 0.14, nd[2]);
      sc.set(s * k, s * k, s * k);
      m4.compose(p3, q4, sc);
      arches.setMatrixAt(i, m4);
      scratch.copy(COLORS.cream).lerp(COLORS.terracotta, l);
      arches.setColorAt(i, scratch);
      // the person stands inside the doorway (base at the arch's inner floor)
      people.setPosition(i, p3.x, p3.y, p3.z);
      people.setScale(i, k);
      people.ry[i] = -world.rotation.y;
    }
    arches.instanceMatrix.needsUpdate = true;
    if (arches.instanceColor) arches.instanceColor.needsUpdate = true;
    people.update();
  }

  function update(c) {
    const t = c.settled ? 0 : c.time;
    if (!c.settled && !c.pointer.touch) {
      const hit = picker.pick();
      const h = hit && hit.instanceId != null ? hit.instanceId : -1;
      if (h !== hovered) { hovered = h; c.emit('hover', { index: h }); }
    }
    const target = active >= 0 ? active : hovered;
    for (let i = 0; i < n; i++) {
      const on = i === target ? 1 : 0;
      level[i] += (on - level[i]) * (c.settled ? 1 : 1 - Math.exp(-9 * c.delta));
    }
    world.rotation.set(0.1 - c.pointer.y * 0.05, c.pointer.x * 0.12, 0);
    layoutTiles(c);
    kit.updateFloaters(t);
    dust.update(c);
    lights.update(c);
  }
  kit.floater(mark.group, { amp: 0.035, speed: 0.45, rot: 0.02 });

  resize(ctx);
  update(ctx);
  return {
    update, resize,
    api: {
      setActive(i) { active = typeof i === 'number' ? i : -1; ctx.invalidate(); },
      get hovered() { return hovered; },
    },
  };
}
