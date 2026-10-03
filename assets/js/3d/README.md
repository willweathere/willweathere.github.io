# HCLabs 3D — engine, scene kit, hero world

Everything WebGL on the site lives here. Three files are shared infrastructure; scenes are per page.

| File | What it is | Who edits |
|---|---|---|
| `engine.js` | `mount()`: lazy loading, quality tiers, one renderer + one rAF loop per canvas, input, resize, fallback crossfade, disposal | 3D/foundation only |
| `kit.js` | The HCLabs 3D design language as builders (palette, materials, arch mark, figure/people, disc, rimmed arch, flowing line, document cards, node networks, particles, soft shadows, motion helpers) | 3D/foundation only |
| `scenes/home-hero.js` | The homepage hero world (the art-directed version: clickable Starter Pack documents, `right`/`top` framings) | homepage/integrator |
| `scenes/home-door.js` | The homepage consultation band's open door (cheap: clay only, ~10 draw calls) | homepage/integrator |
| `scenes/hero.js` | The original generic hero world (used by `/lab-3d/`; options in §6) | 3D/foundation |
| `scenes/example-stack.js` | Reference: Starter Pack document stack driven by scroll, hover-focus | copy it, don't edit |
| `scenes/example-ecosystem.js` | Reference: services ecosystem — nine small **doorways** (arch + person) on a quiet ring, wired to DOM links | copy it, don't edit |
| `scenes/example-org.js` | Reference: organisational structure made of the logo's people (always terracotta head + sage body) | copy it, don't edit |
| `scenes/<page>.js` | Your page's scene | page agents |

Live test bench: **`/lab-3d/`** (noindex locally; answers 404 in production via `site/_redirects`) — hero + the three
references. Add `?stats=1` for draw calls/triangles, `?q=low|mid|high` to force a tier (this also bypasses the
software-GL fallback, so headless Chrome renders the live world).

**Non-negotiables (learned the hard way on the homepage):**
- The person is sacred: **terracotta head + sage body, every time**, and never a body without its head (not even for
  one intro frame). Tiers/roles are shown with scale, depth or the doorway around them — never by recolouring people.
- No stock "network graph" visuals (bare spheres + lines). Nodes are built from the brand's forms: doorways, documents,
  discs. Lines are fine and quiet (opacity ≤ 0.3).
- Glass documents sit on navy only (≥ 40 px clear of the disc and the arch) so their cream type stays legible.
- Anything in the canvas that looks clickable (a titled document, a doorway that reacts to the cursor) must BE
  clickable: pick it (`kit.picker` / a raycast), set `cursor: pointer` on the stage, and navigate by clicking a real
  `<a>` so the page transition runs (see `home.js` → `go()` and `home-hero.js` → `api.pickAt()`).
- Documents are branded covers (`face.variant: 'cover'`): serif numeral, title, the mark, one swoosh. Avoid the
  `text` / `checklist` / `form` skeleton variants for anything seen up close — they read as loading placeholders.

---

## 1. Quick start (page agents)

```html
<!-- in your src/pages/<page>.html -->
<div class="my-stage" id="pack-stage">
  <!-- static fallback: shown first, kept forever on no-WebGL/failure, crossfaded out once 3D is live -->
  <svg data-3d-fallback aria-hidden="true" focusable="false" viewBox="0 0 800 600">…brand shapes…</svg>
</div>
```

```js
// site/assets/js/pages/<page>.js  (ES module; the import map for 'three' is in head.html)
import { mount } from '/assets/js/3d/engine.js';

const handle = mount(document.getElementById('pack-stage'),
  () => import('/assets/js/3d/scenes/starter-pack.js'),
  { sceneOptions: { /* passed to your scene as ctx.options */ } });

const api = await handle.ready;   // your scene's `api`, or null if 3D is unavailable (fallback stays)
```

CSS you own: give the stage a real size (`position: relative` + height or aspect-ratio). The engine
appends `<canvas class="hc3d-canvas" aria-hidden="true">` absolutely filling it (pointer-events: none),
so DOM content can sit above or below it freely. `engine.js` is tiny and has no static three.js
import — three + your scene load only when the stage comes within ~200px of the viewport.

**Gate the mount like the homepage does** (SPEC §1: reduced motion, no WebGL and low-power devices keep the static art
and never download three.js):

```js
import HC from '/assets/js/site.js';
import { mount, hasWebGL2, lowPower } from '/assets/js/3d/engine.js';
const CAN_3D = hasWebGL2() && (HC.shot || (!HC.reduced() && !lowPower()));
if (CAN_3D) mount(stage, () => import('/assets/js/3d/scenes/<page>.js'), { … });
```

Never put a CSS `mask-image` / `filter` / `backdrop-filter` on the canvas or on anything that overlaps it: the compositor
then re-processes the full canvas every frame. Fade edges with a static overlay pseudo-element painted in the section's
own ground instead (see `.home-hero__stage::after`).

Declarative alternative: `<div data-scene="starter-pack" data-scene-options='{"x":1}'>` +
`import { autoMount } from '/assets/js/3d/engine.js'; autoMount();` (loads `scenes/<name>.js`).

**Accessibility contract:** the canvas is decoration (`aria-hidden`). Every real thing — titles,
links, buttons, prices — must exist in the DOM. 3D hover effects mirror DOM hover/focus (see §6).

---

## 2. Engine API (`engine.js`)

### `mount(container, loadSceneModule, options?) → handle`

| option | default | notes |
|---|---|---|
| `sceneOptions` | `{}` | arrives as `ctx.options` |
| `fov` / `near` / `far` | `30` / `0.1` / `120` | default PerspectiveCamera (`ctx.camera`) |
| `toneMapping` | `'neutral'` | `'neutral'` (Khronos PBR Neutral — keeps brand colours true), `'aces'`, `'agx'`, `'none'` |
| `exposure` | `1` | |
| `scrollTarget` | container | element whose passage drives `ctx.scroll`. **Use the tall track element when your stage is `position: sticky`.** |
| `eager` | `false` | don't wait for the viewport: build **in idle time after `load`** (never competes with first paint). Use only for a stage that is on the first screen |
| `manual` | `false` | never start by itself; call `handle.prewarm()` (e.g. from `requestIdleCallback` once the page has settled) |
| `share` | `null` | pool key: mounts with the same key share ONE renderer + canvas (re-parented to whichever is on screen). For stages that are never visible together — one GL context, one PMREM, programs compiled once (homepage: hero + door, `share: 'home'`) |
| `pointerLambda` / `scrollLambda` | `3.2` / `7` | easing speed of smoothed inputs |
| `fadeMs` | `700` | canvas fade-in over the fallback. Keep the fallback a matching composition so this reads as a cross-cut |
| `fallback` | `'[data-3d-fallback]'` | elements (inside container) faded out when live, restored on teardown |
| `quality` | auto | force `'low' | 'mid' | 'high'` |
| `adaptive` | `true` | dynamic resolution + effect shedding (see *Adaptive quality*) |

**handle**: `ready` (Promise → scene api | handle | null), `api`, `state`, `ctx`, `unmount()`,
`pause()` / `resume()` (e.g. pause on `hc:pt-leave`, resume on `pageshow` with `persisted`), `prewarm()` (start a lazy/manual
mount now), `invalidate()`, `stats()` → `{ tier, dpr, gpu, calls, triangles, points, lines, geometries, textures, programs, size, transmission, shared }`.
Mounting the same container twice returns the same handle.

Other exports: `unmountAll()`, `autoMount(root?, engineOptions?)`, `hasWebGL2()` (feature test only — no throwaway
context), `lowPower()` (save-data, ≤ 2 GB or ≤ 2 cores), `detectQuality(force?)`, `yieldTask()`, `SHOT`.

**Container attributes** (for CSS if you need them): `data-3d="loading" | "ready" | "live" | "standby" | "fallback"`
(`standby` = a pooled mount whose canvas is currently on another stage: its fallback shows),
`data-3d-reason` (on fallback: `no-webgl2` / `software` / `error`), `data-3d-tier="low|mid|high"`.

### Lifecycle (all automatic)
- **Lazy**: IntersectionObserver (200px margin) → `import('three')` + your module → `create(ctx)` →
  `renderer.compileAsync()` (KHR_parallel_shader_compile; hidden objects included, so nothing compiles mid-intro) →
  textures uploaded one per task → first frame → canvas fades in, fallback fades out. The build **yields the main thread
  between stages**; do the same inside long `create()`s with `await ctx.yield()`.
- **Software GL** (SwiftShader, llvmpipe, "Microsoft Basic Render" — VMs, remote desktops, blocklisted GPUs): the mount
  falls back to the static art (`data-3d-reason="software"`); a CPU render loop would pin a core and make scrolling judder.
  `?q=` / `quality` / `?shot=1` override this (headless screenshots use SwiftShader).
- **One rAF loop per scene**, running only while the stage intersects the viewport and the tab is
  visible. `ctx.time` only advances while running (no jumps on return).
- **Page-transition gate**: if the foundation's transition overlay is still covering the page
  (`html.pt-enter`), `ctx.time` holds at 0 until `hc:pt-reveal`, so intros play as the page emerges.
- **Reduced motion** (`prefers-reduced-motion: reduce`) and **`?shot=1`**: no loop; one *settled* frame
  (`ctx.settled = true`, pointer 0, composed scroll state), re-rendered only on resize/`invalidate()`.
  Live-switches if the OS setting changes. (Pages should not mount at all under reduced motion — see §1.)
- **No WebGL2** / scene error → state `fallback`, static markup stays, `ready` resolves `null`.
- **Context loss** → canvas hidden, fallback restored; on restore the scene is rebuilt.
- **Resize**: ResizeObserver on the container, plus a `devicePixelRatio` listener (moving the window between a 1× and a
  2× screen) → DPR re-cap → `scene.resize(ctx)`.
- **Scroll input** is captured in a passive scroll listener, never read inside rAF (no forced layout).
- **bfcache**: `pagehide` with `persisted` only *pauses* (context and resources kept), so Back is instant; a context the
  browser drops meanwhile rebuilds through the context-restored path.
- **Teardown** (`unmount()`, non-persisted `pagehide`): `scene.dispose()`, `ctx.onDispose` callbacks, kit
  resources, then every geometry/material/texture found in `ctx.scene`, render targets you `track()`ed,
  `renderer.dispose()` + `forceContextLoss()` (for a pool: when its last user goes), canvas removed, listeners released,
  fallback restored.

### Adaptive quality
Time windows, not frame counts: the first second is skipped, then every second is judged. A window averaging slower
than 55 fps first sheds expensive effects (transmission glass → `scene.degrade(ctx)`, where scenes also drop particles),
then scales the pixel ratio by how far off the frame time was (never below 0.75). After 5 s of comfortable frames
(< 12 ms) it steps back up once. Implement `degrade()` in any scene with glass or heavy particles.

### Scene module contract

```js
export default async function create(ctx) {   // (or `export async function create`)
  // build into ctx.scene / configure ctx.camera; await fonts etc. here
  return {
    update(ctx) {},    // every frame (and for settled frames): animate, no allocations
    resize(ctx) {},    // after the canvas resized (ctx.size) — frame your camera here
    dispose() {},      // optional: release anything the engine can't find in ctx.scene
    degrade(ctx) {},   // optional: frames are slow — swap glass to kit.glass({ transmission: false }), hide particles
    api: {},           // optional: exposed as handle.api / resolved by handle.ready
  };
}
```

### `ctx` reference

| field | meaning |
|---|---|
| `THREE`, `renderer`, `scene`, `camera`, `canvas`, `container` | the basics (`setCamera(cam)` to swap cameras) |
| `quality` / `tier` | `{ tier, mobile, coarse, saveData, software, dpr, dprCap, maxPixels, antialias, transmission, particleScale, nodeScale, segmentScale, textureSize, anisotropy, maxAnisotropy, gpu, degraded }` |
| `options` | your `sceneOptions` |
| `size` | `{ width, height, aspect, dpr }` (CSS px) |
| `time`, `delta`, `frame` | scene clock (s), frame delta (clamped ≤ 0.1 s), frame count |
| `settled`, `static`, `reducedMotion`, `shot` | settled = this frame is the static composed frame — jump to final poses |
| `pointer` | `x, y` smoothed viewport-normalised −1..1 (y up); `tx, ty` targets; `local {x,y}` canvas NDC (raw); `inside` (pointer over this canvas); `clientX/Y`; `touch` |
| `scroll` | smoothed `enter` (0 when target's top hits the viewport bottom → 1 at the top), `exit` (0 top-aligned → 1 when its bottom leaves the top), `progress` (0..1 over the whole pass), `page` (document 0..1), `y`, `velocity`, and `raw.{…}` unsmoothed |
| `visible` | stage currently intersecting |
| `track(obj)` / `onDispose(fn)` | register extra disposables |
| `invalidate()` | request a render (needed in static mode after async changes, e.g. a hover from DOM) |
| `emit(name, detail)` | dispatches `CustomEvent('hc3d:<name>')` on the container (bubbles) |

Settled frames report `scroll = { enter: 1, exit: 0, progress: 0.5 }` — design your scroll-driven
poses so that state is a good composition (it is what reduced-motion users and screenshots see).

### Quality tiers

| | DPR cap | pixel budget | MSAA | glass | particles | nodes | curve segments | text textures | anisotropy |
|---|---|---|---|---|---|---|---|---|---|
| **high** (≥ 8 cores, ≥ 8 GB or unknown, fine pointer) | 1.75 | 2.4 MP | yes | MeshPhysical transmission (**discrete GPUs only**) | ×1.0 | ×1.0 | ×1.0 | 1024 | 8 |
| **mid** (≥ 4 cores desktop; 6-core+ / ≥ 4 GB phones) | 1.5 (phones 1.6) | 1.6 MP | yes | fresnel "lite" glass | ×0.6 | ×0.8 | ×0.75 | 1024 | 4 |
| **low** (save-data, ≤ 2 GB, ≤ 2 cores, weaker phones) | 1.0 (phones 1.25) | 1.1 MP | no | fresnel "lite" glass | ×0.3 | ×0.55 | ×0.5 | 512 | 2 |

The GPU string then refines the tier: **integrated GPUs** (Intel UHD/Iris, AMD "Radeon Graphics"/Vega, Apple M-base,
Mali/Adreno/PowerVR) are held at **mid with a 1.6 MP budget and DPR ≤ 1.25** on desktop — these business laptops are the
client's audience, and at high tier an Iris Xe ran the hero at 15–21 fps. Transmission is reserved for discrete GPUs
(NVIDIA, Radeon RX/Pro, Apple M Pro/Max/Ultra). Software rasterisers fall back to the static art (see Lifecycle).

### URL switches (testing)
- `?shot=1` — settled stable frame, no fade (added by `tools/shoot.sh`; shot mode also schedules with
  timers because headless capture produces no rAF/IntersectionObserver frames).
- `?q=low|mid|high` — force tier.
- `?hc3d-preview=px,py,scroll` — the settled frame uses this pointer (−1..1) and scroll (0..1) state, so you
  can screenshot parallax/scroll poses: `tools/shoot.sh "/lab-3d/?hc3d-preview=0.8,0.4,0.5" out.png 1440 900`.

---

## 3. Kit API (`kit.js`)

```js
import { createKit, COLORS, HEX, color, ease, clamp01, lerp, damp, segment, rng, layouts, shiftView } from '../kit.js';
const kit = createKit(ctx);   // bound to this canvas: tier-aware, caches materials, auto-disposes on teardown
await kit.ready;              // brand fonts loaded (only needed before canvas text: cards, textPlane)
```

### Palette (from the logo; linear colours for three.js)
`HEX` = sRGB strings; `COLORS` = read-only linear `THREE.Color`s (converted from sRGB via ColorManagement);
`color(nameOrHexOrNumber)` → a fresh linear `Color`. Names: `navy navyDeep navyInk navySoft navyLine cream paper
sand sage sageBrand sageShape sageDeep terracotta terracottaShape clay shadow`.
Canvas is transparent: **put the navy (or paper) ground in CSS behind the stage**. Scene fog set to
`COLORS.navy` blends exactly into a navy CSS ground (fog colour is output-space converted).

### Environment & light
- `kit.environment({ intensity = 0.55, tint = true })` — soft PMREM from three's `RoomEnvironment`, re-lit in brand
  tones (navy walls, warm cream soft-boxes, sage-tinted side box). Built **once per renderer**, cached, auto-released.
- `kit.lights({ key, rim, fill, keyPos, rimPos, follow:[x,y], glow, glowPos, glowFollow, keyColor, rimColor, glowColor })`
  → `{ group, key, rim, fill, point, update(ctx) }`. Warm key + cool rim directional lights + navy/cream
  hemisphere; `glow > 0` adds a soft point light near the viewer whose falloff paints gradients across flat
  faces and drifts with the cursor ("light follows the pointer"). Call `lights.update(ctx)` each frame.

### Materials (cached per kit — reuse freely)
- `kit.clay(color, { roughness = 0.62, sheen, emissive, envMapIntensity })` — matte clay for the arch, figures,
  discs, line. High tier adds a soft sheen. `emissive` (≈ 0.1) lifts large background forms toward their exact brand hue.
- `kit.paper(color = 'paper', { roughness })` — document card stock.
- `kit.glass({ tint, roughness = 0.32, opacity = 0.08, thickness, frost = 0.022, frostColor = 'sage', rim, transmission })` —
  **high**: `MeshPhysicalMaterial` transmission (frosted refraction of what's behind) + satin clearcoat, linear output so
  transmitted navy matches the CSS ground (an internal far-plane quad feeds the transmission pass the ground colour).
  **mid/low**: transparent standard material + view-angle fresnel (brighter, more opaque edges) + env reflections.
  Faint sage `frost` keeps panels legible over navy on every tier.

### The logo as objects
- `kit.archMark({ height = 2, depth = 11, thickness = 10, figure = true, anchor = 'center'|'base', colors:{arch,head,body} })`
  → `{ group, inner, arch, head, body, width, height, unit }`. Exact logo geometry (52×56 units, band 10): extruded,
  bevelled cream arch ring + terracotta head sphere + sage extruded shoulder arch.
- `kit.figure({ height = 0.6, colors:{head,body} })` → `{ group, head, body }` — the person alone (base on y = 0).
- `kit.people({ items:[{ p:[x,y,z], height, ry, head, body }], height })` → many figures in **2 draw calls**:
  `{ group, heads, bodies, count, pos, mult, setPosition(i,x,y,z), setScale(i,s), setColors(i,head,body), update() }`.
- `kit.disc({ radius, thickness, color = 'terracottaShape', emissive })` — lathe disc with a soft rounded edge, faces +Z.
- `kit.rimmedArch({ width, height, below, rim, depth, colors:{rim,fill}, emissive })` → `{ group, rim, fill }` — cream frame
  with the sage panel inset and standing proud (paper layers). `height` = top above y 0; `below` extends under the frame edge.
- `kit.flowLine({ points:[[x,y,z]…], radius = 0.022, color, taper:[start,end], tubularSegments, emissive, tip })` →
  `{ group, mesh, curve, tip, setProgress(0..1) }`. Tube on a centripetal Catmull-Rom curve with tapered ends;
  `setProgress` draws it on via `drawRange` (no rebuild). Start/end it behind forms or off-frame, like the brand art.
- Shapes for your own extrusions: `archRingShape()`, `archShape({width,height,bottom})`, `roundRectShape(w,h,r)`,
  `extrude(shape, { depth, bevel, bevelSegments, curveSegments })` (bevel kept inside the contour, centred on z).
- `shadeWalls(geo, farColor, { wall, down, up })` — vertex-colour AO for extrusions: soffits and side walls take a darker,
  warmer value than the front face (use with `kit.clay(c, { vertexColors: true })`). `archMark` already does this with a
  crisp 1.2-unit front bevel, so the doorway's inner curve never reads as a notch at the shoulder. Do the same for any
  extruded arch you build yourself.

### Documents & typography
- `kit.card({ width, height, depth, radius, style: 'paper'|'cream'|'dark'|'glass', face, glass, material, textureSize })`
  → `{ group, body, face, texture, redraw(face) }`. Rounded extruded card + crisp canvas face.
  `face` = `{ number: '01', kicker: 'HR Starter Pack', title, variant: 'cover'|'text'|'checklist'|'form', lines, checked,
  seed, titleScale, footer, mark:false, sheen }` — editorial layout: mark + tracked kicker, Instrument Serif italic numeral,
  Plus Jakarta 750 title, terracotta rule. **Use `variant: 'cover'`** (a branded cover — what the homepage uses); the
  other variants add abstract "content" (text bars / ticks / form fields) that reads as a skeleton placeholder up close.
  Textures are power-of-two, mipmapped, anisotropic, premultiplied. Pass `textureSize: 512` for cards that are small on screen.
- `kit.stack(items, { width, height, style, cascade:[dx,dy,dz], spreadX, arc, fanAngle, face, shadow })` →
  `{ group, cards, layout(spread 0..1, focusIndex|-1, dt) }` — cascade (every header peeks out) ⇄ fanned arc,
  focused card lifts forward. Call `layout()` every frame (`dt = 1` snaps).
- `kit.textPlane({ text, height, font:'sans'|'serif', weight, italic, color, tracking, opacity })` — flat typographic plane
  ("floating typography", e.g. an Instrument Serif "20+").
- `kit.canvasTexture(W, H, draw(g, W, H), { maxSize, key })` — your own crisp canvas texture; `texture.userData.redraw(fn)`.
- `drawDocumentFace(g, W, H, face, theme)` is exported if you want the face on something else.

### People / organisation
- `kit.network({ nodes:[{p,r,color}], links:[[i,j]], lineColor, lineOpacity, shading:'lit'|'flat', showNodes, hideBehindGlass })`
  → `{ group, mesh (InstancedMesh), lines, count, base, pos, scale, mult, setPosition, setScale, setColor, drift(t,amp,speed), update() }`.
  One draw call for all spheres + one for all links. `'lit'` = soft clay spheres (hoverable ecosystems), `'flat'` = crisp
  unlit brand dots (constellations). Call `update()` after changing positions/scales.
- `layouts.constellation({ count, radius:[x,y,z], center, seed, k, minDist, size:[min,max], palette, reject(p) })`
- `layouts.orgChart({ levels:[1,3,6], width, height, depth, seed, jitter, size, palette })` → `{ nodes, links, tiers }`
- `layouts.ring({ count = 9, radius, tilt, hub, hubSize, size, neighbours, palette, hubColor, phase })` — satellite *i* = node *i + 1*.
  All layouts are seeded → identical every load (stable screenshots).

### Atmosphere & depth
- `kit.particles({ count, box:[w,h,d], center, size, color, opacity, drift, speed, fade:[near,far], seed })` → `Points` with
  `.update(ctx)`. One draw call, drift on the GPU, count × tier scale (e.g. 420 → 420 / 252 / 126).
- `kit.softShadow({ shape:'ellipse'|'circle'|'arch'|'roundRect'|'rect', width, height, blur, opacity, color })` — the brand's
  soft "paper layer" shadow as a blurred-silhouette plane (no shadow maps on any tier). Place it just behind the form,
  offset down-right (≈ +0.1, −0.3).

### Motion helpers (allocation-free)
- `kit.floater(obj, { amp, speed, rot, phase })` + `kit.updateFloaters(time, strength)` — idle float around the rest pose
  (`kit.setRest(obj)` after moving it deliberately). Pass `time = 0` when settled.
- `kit.intro(delay, duration, easeFn)` → 0..1 entrance progress; **returns 1 when settled**.
- `kit.parallax(obj, { rx, ry, x, y })` → `{ update(ctx) }`.
- `kit.picker(objects, { every })` → `{ pick() }` hover raycast with the canvas-local pointer; raycasts only when the
  pointer moved (hits give `instanceId` for instanced meshes). Touch has no hover: expose an `api.pickAt(clientX, clientY)`
  for taps (see `home-hero.js`).
- `kit.release(obj)` — dispose one kit-built object's geometries now (e.g. when you rebuild a `flowLine` on resize) so
  they don't linger in the kit's owned set until teardown.
- Math: `ease.{outExpo,outCubic,inOutCubic,inOutSine,…}`, `clamp`, `clamp01`, `lerp`, `mapRange`, `smoothstep`,
  `damp(cur, target, lambda, dt)`, `segment(t, a, b)`, `rng(seed)`.
- Camera: `shiftView(camera, ndcX, ndcY, w, h)` — off-axis framing (move the subject without perspective skew; e.g. leave
  space for a headline), `visibleHeight(camera, dist)`, `visibleWidth(camera, dist)`.

---

## 4. Compose a new scene (complete example)

```js
// site/assets/js/3d/scenes/package-399.js — the £399 package: the pack + a consultation (figure) on a disc
import { createKit, ease } from '../kit.js';

export default async function create(ctx) {
  const { THREE, scene, camera } = ctx;
  const kit = createKit(ctx);
  await kit.ready;                                        // canvas text needs the brand fonts
  kit.environment({ intensity: 0.55 });
  const lights = kit.lights({ key: 2.2, rim: 1.6, fill: 0.45, glow: 10 });
  scene.add(lights.group);

  const world = new THREE.Group();
  scene.add(world);

  const disc = kit.disc({ radius: 1.6, thickness: 0.18, emissive: 0.1 });   // terracotta plinth, facing the viewer
  disc.position.set(0.9, 0.5, -1.4);
  const shadow = kit.softShadow({ shape: 'circle', width: 3.2, height: 3.2, opacity: 0.55 });
  shadow.position.set(1.0, 0.2, -1.55);
  world.add(shadow, disc);

  const stack = kit.stack([
    { number: '01', title: 'Employee Handbook' },
    { number: '02', title: 'Essential HR Policies', variant: 'checklist' },
    { number: '07', title: 'HR Templates and Forms', variant: 'form' },
  ], { width: 0.9, height: 1.27 });
  stack.group.position.set(-0.6, -0.1, 0);
  world.add(stack.group);

  const person = kit.figure({ height: 0.7 });              // the 60-minute consultation, as the brand's person
  person.group.position.set(1.1, -0.55, 0.4);
  kit.floater(person.group, { amp: 0.03 });
  world.add(person.group);

  const line = kit.flowLine({ points: [[-4, -1.2, -1], [-1, -0.9, 0.2], [1.2, -0.7, 0.6], [4, 0.6, -0.5]] });
  world.add(line.group);

  function resize(c) {                                      // frame ~6 × 4 units in any aspect
    const H = Math.max(4, 6 / c.size.aspect);
    camera.position.set(0, 0.4, H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
    camera.lookAt(0, 0, 0);
  }
  function update(c) {
    stack.layout(0, -1, 1);                                 // neat cascade
    line.setProgress(kit.intro(0.2, 2.2, ease.inOutCubic));
    world.rotation.set(-c.pointer.y * 0.05, c.pointer.x * 0.12, 0);
    kit.updateFloaters(c.settled ? 0 : c.time);
    lights.update(c);
  }
  resize(ctx); update(ctx);
  return { update, resize };
}
```

---

## 5. Recipes for the planned page scenes

- **Starter Pack (7 labelled documents, scroll-driven)** — start from `example-stack.js`: `kit.stack(DOCS)` +
  `stack.layout(segment(ctx.scroll.progress, a, b), focus, ctx.delta)`. For a pinned sequence make the section a tall
  track (e.g. 250vh) with a `position: sticky` stage and pass `mount(stage, …, { scrollTarget: track })`. Document titles
  (exact): 01 Employee Handbook · 02 Essential HR Policies · 03 Disciplinary & Grievance Procedures · 04 Absence Management
  Documentation · 05 Family Leave Policies · 06 Manager Guidance Documents · 07 HR Templates and Forms. Each document must
  also be a real DOM control (modal/page); wire hover/focus → `api.focus(i)`, and `hc3d:focus` → highlight the DOM item.
- **Services ecosystem (9 hoverable doorways)** — start from `example-ecosystem.js`: `layouts.ring({ count: 9 })` for
  positions, the doorways as ONE instanced arch mesh + `kit.people()` inside them, neighbour links only via
  `network({ showNodes: false })`, `kit.picker(arches)`, `ctx.emit('hover', { index })`; DOM links call `api.setActive(i)`;
  a click on the stage follows the hovered doorway's real link.
- **About — organisational structure** — start from `example-org.js`: `layouts.orgChart()` + `kit.people()` (terracotta
  heads, sage bodies — always) + `network({ showNodes: false })` links; tiers assemble with `ctx.scroll.enter`. Represent
  only supplied facts (e.g. levels as "small businesses → global entities" is fine as visual metaphor; no invented
  employers/dates).
- **Pricing / package visuals** — see §4: £299 = the document stack (cascade) on a disc; £399 = the same plus
  `kit.figure()` (the consultation). Keep both in one visual system (same camera, lights, materials); animate the
  selected package with `stack.layout(spread, focus)` and a `flowLine` draw-on.
- **Per-service motifs** — one small scene with a `motif` option is cheapest (one module, nine variants), built only from
  brand primitives: audits → `card` checklist variant + `stack` cascade; policies/handbook → `stack` of paper `card`s;
  employee relations → two `figure`s facing with a `flowLine` between; performance → `flowLine` rising + `disc`s growing;
  absence & wellbeing → `disc` + `rimmedArch`, very slow float; workforce planning → `people` in rows; organisational
  change → `people` easing between two `layouts.orgChart` configurations; ad-hoc advice → `figure` + one glass `card`;
  retained support → `archMark` with a `layouts.ring` of nodes around it. Visual metaphors only — no invented deliverables.

---

## 6. The hero

The homepage runs **`scenes/home-hero.js`** (the art-directed fork below, wired in `site/assets/js/pages/home.js`):
- `focus: 'right'` beside the copy on landscape screens; `focus: 'top'` on phones and portrait tablets, where the stage
  is a band **above** the headline (arch left of centre, the disc entering top-right, two documents inside the frame, no
  rimmed arch) so the world is in the first viewport. `api.setFocus()` switches live.
- The three glass documents (01 Employee Handbook, 02 Essential HR Policies, 03 Disciplinary & Grievance Procedures) are
  links to `/hr-starter-pack/#doc-0N`: the container emits `hc3d:panel-hover { index, href }`, `api.pickAt(x, y)` serves taps.
- The static SVG composition in the stage is painted from the first frame and mirrors the settled world, so the live
  canvas cross-cuts over it (`intro: false` unless `?shot=1&intro-t=<s>`).
- Head and body arrive together; the head lands a beat later with one small spring.
- `degrade()` swaps transmission glass to fresnel glass and hides the dust.

The original generic hero (`scenes/hero.js`) remains for `/lab-3d/`:

"The logo transformed into a world": the 3D doorway arch + figure; frosted glass Starter Pack documents floating in depth;
the terracotta disc entering from the top-right and the cream-rimmed sage arch rising from below (soft paper-layer
shadows); the terracotta line rising from behind the sage form, under the mark, out past the disc's rim; a quiet
constellation of people/organisation nodes; fine particles. Pointer → subtle world turn, layer parallax, cursor light.
Scroll (hero leaving) → camera dolly + lift with per-layer parallax. Idle → slow float. Intro ≈ 2.5 s, settled when static.

```js
mount(stage, () => import('/assets/js/3d/scenes/hero.js'), {
  sceneOptions: { focus: 'auto', avoid: '.hero__copy' },
  scrollTarget: document.querySelector('.hero'),
});
```

| sceneOption | default | |
|---|---|---|
| `focus` | `'auto'` | `'right'`: world right of the copy (desktop). `'center'`: centred in its own stage box. `'bottom'`: full-bleed behind copy, low and quieter. `auto` = right for landscape boxes, center for portrait |
| `avoid` | — | the headline copy element/selector: in `right` focus the world frames itself in the free space right of the **rendered text** (re-measured on resize/font load). Strongly recommended |
| `safeLeft` | `0.42` | fallback reserved left width (px or fraction) without `avoid` |
| `density` | `'auto'` | `'light'` drops a panel + nodes + particles (auto on portrait/low tier) |
| `anchor` | — | `[ndcX, ndcY]` override for where the arch sits |
| `scale`, `intro`, `scroll` | `1`, `true`, `true` | |

api: `setFocus(focus)`, `setPaused(bool)`.

**Recommended layout** (as on the homepage): desktop — stage `position:absolute; inset:0` behind the copy, navy CSS
ground, copy `pointer-events` only on its links. Phones/portrait — the stage is a band **above** the copy
(`height: clamp(14rem, 36svh, 25rem)`), never below the fold. Soften a hard section edge with a static overlay
pseudo-element in the section's own ground — **never a CSS mask on `.hc3d-canvas`** (it costs a full-canvas composite
every frame).
**Fallback**: the lab page's inline SVG (`src/pages/lab-3d.html`, `data-3d-fallback`) mirrors the settled 1440×900
frame (same disc/arch/line/panel placement) so the crossfade is seamless — copy it into the homepage hero.

---

## 7. Performance budget (measured on /lab-3d/, 1440×900, `?stats=1`)

| hero | draw calls | triangles | points | line segs | textures | programs |
|---|---|---|---|---|---|---|
| high | 31 (≈ 10 are the transmission pre-pass) | 64.8k (incl. pre-pass) | 420 | 40 | 9 | 12 |
| mid | 21 | 25.2k | 252 | 29 | 8 | 6 |
| low | 19 | 14.7k | 66 | 13 | 7 | 6 |

References: stack 21 calls / 7k tris / 7 face textures; ecosystem 6 calls / 11k tris; org 5 calls.

(Measured before the GPU-class tiering; integrated GPUs now run the mid column.)

Texture memory (hero): glass faces at 512² (≈ 1.4 MB each incl. mips), soft-shadow silhouettes 256² (128² low),
brand PMREM (≈ 1–3 MB). Discrete-GPU high tier only: three's transmission target is full-resolution RGBA16F with 4× MSAA —
bounded by the 2.4 MP pixel budget, plus one extra opaque pass (warmed before reveal, so its first use never stalls).
Rules of thumb for page scenes: ≤ 40 draw calls, ≤ 150k triangles on high (≤ 40k low), reuse `kit.clay()` materials
(cached), instance anything repeated (`network`, `people`), 512² faces for small cards, no per-frame allocations (preallocate
vectors/colours; don't create closures in `update`), dispose anything you create outside `ctx.scene` via `ctx.track()`.

---

## 8. Checklist before you ship a scene
- Mounted only when `hasWebGL2() && !HC.reduced() && !lowPower()` (or `HC.shot`); eager only if on the first screen.
- Two scenes on one page that are never on screen together share a renderer (`share: '<page>'`); the lower one is
  `manual` and prewarmed in idle time (`requestIdleCallback(() => handle.prewarm(), { timeout: 5000 })`), never built
  mid-scroll.
- Content lives in the DOM; canvas stays `aria-hidden`; a static `data-3d-fallback` exists and looks finished on its own.
- People are terracotta head + sage body; clickable-looking objects are clickable; glass documents sit on navy.
- Settled frame (`?shot=1`, reduced motion) is a good composition; intros use `kit.intro()`.
- `tools/shoot.sh "/page/?q=low"` and `?q=high` both look right at 1440×900 and 390×844 (use scale 2 for phones —
  headless clamps narrow 1× windows).
- `tools/console.sh "/page/?shot=1"` is clean.
- `?stats=1`-style check (`handle.stats()`) within the budget above.
