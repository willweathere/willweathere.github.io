/**
 * Homepage — free consultation band: "the door is open". The hero's world returns at the end of the story:
 * the doorway mark (the logo as an object) with the terracotta disc behind it, and the flowing line arriving from
 * the copy side to finish at the threshold with a dot.
 * Cheap on purpose (matte clay only, no glass/transmission): ~10 draw calls.
 *
 * Scroll: the line draws in as the band enters (settled frame = complete). The figure is always whole (head + body).
 * Pointer: the world turns a little; the cursor light drifts.
 */
import { createKit, ease, clamp01, segment } from '../kit.js';

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);

  kit.environment({ intensity: 0.5 });
  const lights = kit.lights({ key: 2.1, rim: 1.8, fill: 0.44, keyPos: [-4, 5, 7], rimPos: [5, 3, -5], glow: 11, glowPos: [0.2, 0.6, 4.4], glowFollow: [3, 2] });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  // background forms
  const discRig = new THREE.Group();
  discRig.position.set(2.3, 1.45, -2.9);
  discRig.rotation.set(0.05, -0.2, 0);
  const disc = kit.disc({ radius: 1.95, thickness: 0.2, emissive: 0.1 });
  const discShadow = kit.softShadow({ shape: 'circle', width: 3.9, height: 3.9, blur: 0.11, opacity: 0.62 });
  discShadow.position.set(0.1, -0.28, -0.15);
  discRig.add(discShadow, disc);
  world.add(discRig);

  // (no rimmed arch here: the door, the disc and the line are enough at this size)

  // the doorway mark
  const markRig = new THREE.Group();
  markRig.position.set(0.15, -1.95, 0);
  markRig.rotation.set(0.02, -0.2, 0);
  const mark = kit.archMark({ height: 2.6, depth: 12, anchor: "base" });
  const markShadow = kit.softShadow({ shape: "arch", width: mark.width, height: 2.6, blur: 0.12, opacity: 0.45 });
  markShadow.position.set(0.14, 2.6 / 2 - 0.2, -0.7);
  markRig.add(markShadow, mark.group);
  world.add(markRig);
  kit.floater(mark.group, { amp: 0.03, speed: 0.4, rot: 0.01 });

  // the line: arrives from the copy side, dips, and finishes at the threshold
  const line = kit.flowLine({
    points: [[-5.6, -0.5, -0.8], [-4.0, -1.45, 0.1], [-2.6, -1.25, 0.6], [-1.4, -2.02, 0.85], [-0.5, -1.9, 0.85], [0.08, -1.96, 0.74]],
    radius: 0.026, taper: [0.25, 0.02], tubularSegments: 360,
  });
  world.add(line.group);
  const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), kit.clay('terracotta', { roughness: 0.5, emissive: 0.2 }));
  tipDot.position.set(0.08, -1.96, 0.74);
  world.add(tipDot);

  const dust = kit.particles({ count: 140, box: [9, 6, 5], center: [0.4, 0.2, -1.5], size: 0.026, opacity: 0.38, drift: 0.16, fade: [8, 24], speed: 0.7 });
  world.add(dust);

  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  let dist = 12;
  // beside the copy (desktop) the card edge crops the disc, as in the brand art; stacked under the copy (wide, short box
  // mid-card) it sits lower and smaller so no box edge cuts it
  const discBase = { x: 2.25, y: 1.45, s: 1 };
  function resize(c) {
    const a = c.size.aspect;
    const stacked = ctx.options.stacked != null ? !!ctx.options.stacked : a > 1.25;   // the page passes the CSS layout (live getter)
    discBase.x = stacked ? 2.05 : 2.25; discBase.y = stacked ? 0.2 : 1.45; discBase.s = stacked ? 0.66 : 1;
    const H = Math.max(5.1, 5.4 / Math.max(0.6, a)) * (a > 1.5 ? 0.92 : 1);
    dist = H / (2 * tanHalf);
    camera.near = 0.1; camera.far = dist + 30; camera.updateProjectionMatrix();
  }

  function update(c) {
    const settled = c.settled || c.static;
    const px = c.pointer.x, py = c.pointer.y;
    const enter = settled ? 1 : c.scroll.enter;
    const fadeIn = kit.intro(0, 1.2, ease.outCubic);
    const drawP = ease.inOutCubic(segment(enter, 0.18, 0.78));
    line.setProgress(drawP);
    tipDot.scale.setScalar(Math.max(0.001, ease.outCubic(clamp01((drawP - 0.9) / 0.1))));
    const rise = ease.outExpo(segment(enter, 0.05, 0.75));
    discRig.position.set(discBase.x + (1 - rise) * 0.6, discBase.y, -2.9);
    discRig.scale.setScalar(discBase.s);

    camera.position.set(px * 0.3, 0.2 + py * 0.18, dist);
    camera.lookAt(0, -0.1, 0);
    world.rotation.y = px * 0.12;
    world.rotation.x = -py * 0.05;
    kit.updateFloaters(settled ? 0 : c.time, settled ? 0 : 1);
    dust.update(c);
    dust.material.uniforms.uOpacity.value = 0.38 * fadeIn;
    lights.update(c);
  }

  resize(ctx);
  update(ctx);
  return { update, resize, degrade() { dust.visible = false; } };
}
