/**
 * HCLabs 3D engine — lazy, tiered, disposable WebGL scene host.
 *
 *   import { mount } from '/assets/js/3d/engine.js';
 *   const handle = mount(el, () => import('/assets/js/3d/scenes/hero.js'), { sceneOptions: { focus: 'right' } });
 *   const api = await handle.ready;   // whatever the scene returned as `api` (null if 3D is unavailable)
 *
 * This file is deliberately small and has NO static three.js import: three + the scene module are
 * dynamically imported only when the container comes within ~200px of the viewport (or, for `eager`
 * mounts, in idle time after the page has loaded), so first paint is never blocked. Until then (and
 * forever on no-WebGL / software GL / failure) the container's static fallback markup stays visible.
 * Building is chunked (the main thread is yielded between stages) and shaders compile asynchronously
 * (KHR_parallel_shader_compile), so taps and scrolls stay responsive while a world is being built.
 * See README.md in this folder for the full contract.
 */

const HAS_WINDOW = typeof window !== 'undefined';
const PARAMS = HAS_WINDOW ? new URLSearchParams(location.search) : new URLSearchParams();
/** ?shot=1 (added by tools/shoot.sh): settle immediately, render a stable frame, no fade. */
export const SHOT = PARAMS.has('shot');
/** ?q=low|mid|high forces a quality tier (testing; also bypasses the software-GL fallback). */
const Q_OVERRIDE = /^(low|mid|high)$/.test(PARAMS.get('q') || '') ? PARAMS.get('q') : null;
/** ?hc3d-preview=px,py,scroll — the settled frame uses this pointer (−1..1) and scroll (0..1) state (testing). */
const PREVIEW = (() => {
  const v = (PARAMS.get('hc3d-preview') || '').split(',').map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? v : null;
})();

const mq = (q) => (HAS_WINDOW && window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {}, removeEventListener() {} });
const reducedMQ = mq('(prefers-reduced-motion: reduce)');

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Headless screenshot runs (?shot=1) may produce no rendering frames until capture, so rAF / IO /
// ResizeObserver never fire there: shot mode schedules with timers and activates by rect check.
const later = (fn) => (SHOT ? setTimeout(fn, 0) : requestAnimationFrame(fn));
const cancelLater = (id) => (SHOT ? clearTimeout(id) : cancelAnimationFrame(id));
const nextFrame = () => new Promise((r) => (SHOT ? setTimeout(r, 16) : requestAnimationFrame(() => r())));
/** Give the main thread back (input, paint) between build stages. */
export const yieldTask = () => (HAS_WINDOW && window.scheduler?.yield && !SHOT ? window.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
/** Run fn once the page has loaded and the main thread is idle (timeout ms at the latest after load). */
function whenIdle(fn, timeout = 1200) {
  const go = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout }) : setTimeout(fn, 180));
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

/* ------------------------------------------------------------------------------------------------
 * Capability detection → quality tier
 * ---------------------------------------------------------------------------------------------- */

let _webgl2 = null;
/**
 * True when WebGL2 is exposed (three r169 requires WebGL2). No throwaway context is created (that costs a
 * cold ANGLE device init on Windows): creating the real renderer is the actual test, and a failure there
 * falls back quietly.
 */
export function hasWebGL2() {
  if (_webgl2 !== null) return _webgl2;
  _webgl2 = HAS_WINDOW && 'WebGL2RenderingContext' in window && !!document.createElement('canvas').getContext;
  return _webgl2;
}
/** Low-power device hints: save-data, ≤2 GB memory or ≤2 cores. Pages keep their static art there. */
export function lowPower() {
  if (!HAS_WINDOW) return true;
  const n = navigator;
  return !!(n.connection?.saveData || (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency || 4) <= 2);
}

const TIERS = {
  //            dprCap  maxPixels   AA     glass-transmission particles nodes  segments  texture  aniso
  low:  { dprCap: 1.0,  maxPixels: 1.1e6, antialias: false, transmission: false, particleScale: 0.3, nodeScale: 0.55, segmentScale: 0.5,  textureSize: 512,  anisotropy: 2 },
  mid:  { dprCap: 1.5,  maxPixels: 1.6e6, antialias: true,  transmission: false, particleScale: 0.6, nodeScale: 0.8,  segmentScale: 0.75, textureSize: 1024, anisotropy: 4 },
  high: { dprCap: 1.75, maxPixels: 2.4e6, antialias: true,  transmission: true,  particleScale: 1.0, nodeScale: 1.0,  segmentScale: 1.0,  textureSize: 1024, anisotropy: 8 },
};
// GPU classes (from WEBGL_debug_renderer_info). Integrated laptop GPUs are the client's audience: they get the
// mid tier with a tight pixel budget. Transmission glass (a full-resolution MSAA half-float pass) is reserved for
// discrete GPUs.
const GPU_INTEGRATED = /Intel|UHD|Iris|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|Mali|Adreno|PowerVR|Apple GPU|Apple M\d(?! (Pro|Max|Ultra))/i;
const GPU_DISCRETE = /NVIDIA|GeForce|Quadro|RTX|Radeon RX|Radeon Pro|Apple M\d (Pro|Max|Ultra)/i;
const GPU_SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/**
 * Detect device capability. Returns a fresh quality object:
 * { tier, mobile, coarse, saveData, dprCap, dpr, maxPixels, antialias, transmission, particleScale,
 *   nodeScale, segmentScale, textureSize, anisotropy, software, gpu, gpuClass }
 */
export function detectQuality(force) {
  const nav = HAS_WINDOW ? navigator : {};
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory; // undefined on Safari/Firefox
  const coarse = mq('(pointer: coarse)').matches;
  const saveData = !!(nav.connection && nav.connection.saveData);
  const vw = HAS_WINDOW ? window.innerWidth : 1280;
  const vh = HAS_WINDOW ? window.innerHeight : 800;
  const small = Math.min(vw, vh) < 600 || vw < 820;
  const mobile = coarse && small;

  let tier;
  if (saveData || (mem && mem <= 2) || cores <= 2) tier = 'low';
  else if (mobile) tier = cores >= 6 && (!mem || mem >= 4) ? 'mid' : 'low';
  else if (cores >= 8 && (!mem || mem >= 8) && !coarse) tier = 'high';
  else if (cores >= 4) tier = 'mid';
  else tier = 'low';
  if (force && TIERS[force]) tier = force;
  if (Q_OVERRIDE) tier = Q_OVERRIDE;

  const q = { tier, mobile, coarse, saveData, software: false, gpu: '', gpuClass: 'unknown', ...TIERS[tier] };
  // Phones: small canvases, so capable devices can afford a crisper pixel ratio next to razor-sharp type.
  if (mobile) q.dprCap = tier === 'mid' && cores >= 6 && (!mem || mem >= 4) ? 1.6 : 1.25;
  q.dpr = Math.min(HAS_WINDOW ? window.devicePixelRatio || 1 : 1, q.dprCap);
  return q;
}

/** Refine a quality object once the GPU string is known. Returns 'software' when GL is a CPU rasteriser. */
function classifyGPU(q, name, forced) {
  q.gpu = name;
  if (GPU_SOFTWARE.test(name)) { q.software = true; q.gpuClass = 'software'; return 'software'; }
  if (GPU_DISCRETE.test(name)) q.gpuClass = 'discrete';
  else if (GPU_INTEGRATED.test(name)) q.gpuClass = 'integrated';
  if (forced) return q.gpuClass;
  if (q.gpuClass === 'integrated' && !q.mobile && q.tier !== 'low') {
    Object.assign(q, TIERS.mid, { tier: 'mid', transmission: false, maxPixels: 1.6e6, dprCap: 1.25 });
  }
  if (q.gpuClass !== 'discrete') q.transmission = false;
  q.dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
  return q.gpuClass;
}

/* ------------------------------------------------------------------------------------------------
 * Shared input: one set of window listeners for every mounted scene
 * ---------------------------------------------------------------------------------------------- */

const input = {
  tx: 0, ty: 0,          // pointer target, viewport-normalised −1..1 (y up)
  clientX: -1, clientY: -1,
  moved: false, touch: false,
  vw: HAS_WINDOW ? window.innerWidth : 1, vh: HAS_WINDOW ? window.innerHeight : 1,
  sx: 0, sy: 0,          // scroll position captured in the scroll event (never read inside rAF: no forced layout)
  maxScroll: 1,
  users: 0,
};

function onPointer(e) {
  input.clientX = e.clientX;
  input.clientY = e.clientY;
  input.tx = (e.clientX / input.vw) * 2 - 1;
  input.ty = -((e.clientY / input.vh) * 2 - 1);
  input.moved = true;
  input.touch = e.pointerType === 'touch';
}
function onPointerEnd(e) {
  if (e.pointerType === 'touch') { input.tx = 0; input.ty = 0; }
}
function onLeave() { input.tx = 0; input.ty = 0; }
function onScrollInput() { input.sx = window.scrollX; input.sy = window.scrollY; }
function measureViewport() {
  input.vw = window.innerWidth || 1;
  input.vh = window.innerHeight || 1;
  const de = document.documentElement;
  input.maxScroll = Math.max(1, de.scrollHeight - input.vh);
  onScrollInput();
}
let bodyRO = null;
function addInputUser() {
  if (input.users++ > 0) return;
  measureViewport();
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('pointerup', onPointerEnd, { passive: true });
  window.addEventListener('pointercancel', onPointerEnd, { passive: true });
  window.addEventListener('scroll', onScrollInput, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave, { passive: true });
  window.addEventListener('resize', measureViewport, { passive: true });
  // Layout shifts (fonts, images, reveals) move scroll targets: re-measure every mount.
  bodyRO = new ResizeObserver(() => { measureViewport(); for (const m of mounts) m.measure(); });
  bodyRO.observe(document.body);
}
function removeInputUser() {
  if (--input.users > 0) return;
  input.users = 0;
  window.removeEventListener('pointermove', onPointer);
  window.removeEventListener('pointerdown', onPointer);
  window.removeEventListener('pointerup', onPointerEnd);
  window.removeEventListener('pointercancel', onPointerEnd);
  window.removeEventListener('scroll', onScrollInput);
  document.documentElement.removeEventListener('mouseleave', onLeave);
  window.removeEventListener('resize', measureViewport);
  bodyRO?.disconnect();
  bodyRO = null;
}

/* ------------------------------------------------------------------------------------------------
 * Shared observers + renderer pools
 * ---------------------------------------------------------------------------------------------- */

const mounts = new Set();
const byEl = new Map();
let lazyIO = null;
let visIO = null;

function observers() {
  if (lazyIO) return;
  lazyIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) byEl.get(e.target)?.activate();
  }, { rootMargin: '200px 0px 200px 0px' });
  visIO = new IntersectionObserver((entries) => {
    for (const e of entries) byEl.get(e.target)?.setVisible(e.isIntersecting);
  }, { rootMargin: '0px' });
}

/**
 * Renderer pools (`share: '<key>'`): mounts that are never on screen together (e.g. the homepage hero and the
 * consultation door) share ONE WebGLRenderer + canvas. The canvas is re-parented into whichever mount is visible;
 * programs, the PMREM environment and the GL context are built once, so the second world costs almost nothing.
 */
const pools = new Map();
function getPool(key) {
  let p = pools.get(key);
  if (!p) { p = { key, renderer: null, canvas: null, quality: null, owner: null, users: new Set() }; pools.set(key, p); }
  return p;
}

if (HAS_WINDOW) {
  document.addEventListener('visibilitychange', () => { for (const m of mounts) m.sync(); });
  // bfcache: pause only (keep the context + resources), so Back is instant. A context the browser drops while the page
  // is cached comes back through webglcontextlost/restored, which rebuilds.
  window.addEventListener('pagehide', (e) => {
    for (const m of mounts) { if (e.persisted) m.pauseForCache(); else m.teardown('pagehide'); }
  });
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    measureViewport();
    for (const m of mounts) { if (m.suspended) m.observe(); else m.resumeFromCache(); }
  });
  reducedMQ.addEventListener?.('change', () => { for (const m of mounts) m.motionChanged(); });
}

/* ------------------------------------------------------------------------------------------------
 * mount()
 * ---------------------------------------------------------------------------------------------- */

const DEFAULT_OPTIONS = {
  sceneOptions: {},        // passed to the scene as ctx.options
  fov: 30,
  near: 0.1,
  far: 120,
  toneMapping: 'neutral',  // 'neutral' (brand-true) | 'aces' | 'agx' | 'none'
  exposure: 1,
  rootMargin: null,        // (shared lazy observer uses 200px)
  eager: false,            // start without waiting for the viewport — in idle time after load (never blocks first paint)
  manual: false,           // never start by itself: call handle.prewarm() (e.g. from requestIdleCallback)
  share: null,             // pool key: mounts with the same key share one renderer/canvas (never on screen together)
  scrollTarget: null,      // element whose passage drives ctx.scroll (default: container). Use the
                           // tall parent "track" when the container itself is position:sticky.
  pointerLambda: 3.2,      // pointer easing speed (higher = snappier)
  scrollLambda: 7,         // scroll easing speed
  fadeMs: 700,             // canvas fade-in over the fallback
  fallback: '[data-3d-fallback]', // selector (inside container) faded out once the canvas is live
  quality: null,           // force 'low' | 'mid' | 'high'
  adaptive: true,          // adapt resolution (and drop expensive effects) if frames are slow
  className: 'hc3d-canvas',
};

/**
 * Mount a 3D scene into `container`.
 * @param {HTMLElement} container  positioned box (engine sets position:relative if static) holding the static fallback
 * @param {() => Promise<any>} loadSceneModule  e.g. () => import('./scenes/hero.js'); module exports default|create(ctx)
 * @param {object} [options]  see DEFAULT_OPTIONS
 * @returns handle { ready, api, state, unmount(), pause(), resume(), prewarm(), invalidate(), stats(), ctx }
 */
export function mount(container, loadSceneModule, options = {}) {
  if (!HAS_WINDOW || !container) return deadHandle();
  const existing = byEl.get(container);
  if (existing) return existing.handle;
  const m = new Mount(container, loadSceneModule, { ...DEFAULT_OPTIONS, ...options });
  mounts.add(m);
  byEl.set(container, m);
  m.observe();
  return m.handle;
}

/** Unmount every scene (e.g. before a page transition navigates away). */
export function unmountAll() { for (const m of [...mounts]) m.unmount(); }

/**
 * Declarative mounting: every `[data-scene="name"]` inside root loads `./scenes/<name>.js`.
 * Options come from `data-scene-options` (JSON), merged into sceneOptions.
 */
export function autoMount(root = document, engineOptions = {}) {
  const handles = [];
  root.querySelectorAll('[data-scene]').forEach((el) => {
    const name = el.getAttribute('data-scene');
    if (!/^[a-z0-9-]+$/i.test(name)) return;
    let sceneOptions = {};
    try { sceneOptions = JSON.parse(el.getAttribute('data-scene-options') || '{}'); } catch (e) { /* ignore */ }
    const url = new URL(`./scenes/${name}.js`, import.meta.url).href;
    handles.push(mount(el, () => import(url), { ...engineOptions, sceneOptions: { ...(engineOptions.sceneOptions || {}), ...sceneOptions } }));
  });
  return handles;
}

function deadHandle() {
  return { ready: Promise.resolve(null), api: null, state: 'fallback', unmount() {}, pause() {}, resume() {}, prewarm() {}, invalidate() {}, stats: () => null, ctx: null };
}

const softError = (reason) => Object.assign(new Error(reason), { soft: true, reason });

let _uid = 0;

class Mount {
  constructor(container, loader, opts) {
    this.id = ++_uid;
    this.container = container;
    this.loader = loader;
    this.opts = opts;
    this.state = 'idle';      // idle → loading → ready | fallback | static ; disposed
    this.visible = false;
    this.running = false;
    this.suspended = false;
    this.paused = false;
    this.cachePaused = false;
    this.raf = 0;
    this.last = 0;
    this.ctx = null;
    this.inst = null;
    this.renderer = null;
    this.canvas = null;
    this.pool = null;
    this.generation = 0;       // guards async activation against teardown races
    this.metrics = { docTop: 0, left: 0, height: 1, width: 1, sTop: 0, sHeight: 1 };
    this.perf = { t: 0, win: 0, acc: 0, n: 0, stable: 0, up: false };
    let resolveReady;
    this.readyPromise = new Promise((r) => (resolveReady = r));
    this.resolveReady = resolveReady;
    const self = this;
    this.handle = {
      container,
      ready: this.readyPromise,
      get api() { return self.inst?.api ?? null; },
      get state() { return self.state; },
      get ctx() { return self.ctx; },
      unmount: () => self.unmount(),
      pause: () => { self.paused = true; self.sync(); },
      resume: () => { self.paused = false; self.sync(); },
      /** Start building now (idle-time pre-warm), without waiting for the viewport. */
      prewarm: () => self.prewarm(),
      invalidate: () => self.invalidate(),
      stats: () => self.stats(),
    };
    this._tick = (t) => this.tick(t);
    this._onLost = (e) => { e.preventDefault(); this.contextLost(); };
    this._onRestored = () => { this.teardown('restore'); this.observe(); };
    this._onDpr = () => { this.bindDpr(); this.scheduleResize(); };
  }

  observe() {
    this.suspended = false;
    if (SHOT) {
      if (this.opts.eager) { this.activate(); return; }
      const r = this.container.getBoundingClientRect();
      if (r.bottom > -200 && r.top < window.innerHeight + 200) { this.activate(); return; }
    }
    if (this.opts.manual) return;
    if (this.opts.eager) { whenIdle(() => this.activate(), 900); return; }
    observers();
    lazyIO.observe(this.container);
  }

  prewarm() { if (this.state === 'idle' && !this.suspended) this.activate(); }

  isStatic() { return SHOT || reducedMQ.matches; }

  async activate() {
    if (this.state !== 'idle') return;
    lazyIO?.unobserve(this.container);
    if (!hasWebGL2()) { this.fallback('no-webgl2'); return; }
    this.state = 'loading';
    this.container.setAttribute('data-3d', 'loading');
    const gen = ++this.generation;
    try {
      const [THREE, mod] = await Promise.all([import('three'), this.loader()]);
      if (gen !== this.generation) return;
      await this.build(THREE, mod, gen);
    } catch (err) {
      if (gen !== this.generation) return;
      if (!err?.soft) console.error('[hc3d] scene failed to start', err);
      this.teardown('error');
      this.fallback(err?.reason || 'error');
    }
  }

  createRenderer(THREE, quality) {
    const opts = this.opts;
    const canvas = document.createElement('canvas');
    canvas.className = opts.className;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('role', 'presentation');
    canvas.tabIndex = -1;
    const st = canvas.style;
    st.position = 'absolute'; st.inset = '0'; st.width = '100%'; st.height = '100%'; st.display = 'block';
    st.pointerEvents = 'none'; st.opacity = '0'; st.outline = 'none';
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality.antialias,
        alpha: true,
        premultipliedAlpha: true,
        stencil: false,
        powerPreference: quality.tier === 'low' ? 'default' : 'high-performance',
      });
    } catch (e) {
      throw softError('no-webgl2');
    }
    // GPU class → tier. A software rasteriser (VMs, remote desktops, blocklisted GPUs) keeps the static art: a CPU
    // render loop would pin a core and make scrolling judder.
    let cls = 'unknown';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      cls = classifyGPU(quality, name, !!(Q_OVERRIDE || opts.quality));
    } catch (e) { /* ignore */ }
    if (cls === 'software' && !SHOT && !Q_OVERRIDE && !opts.quality) {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      throw softError('software');
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = ({ neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping })[opts.toneMapping] ?? THREE.NeutralToneMapping;
    renderer.toneMappingExposure = opts.exposure;
    renderer.shadowMap.enabled = false;
    quality.maxAnisotropy = Math.min(quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
    return { renderer, canvas };
  }

  async build(THREE, mod, gen) {
    const c = this.container;
    const opts = this.opts;
    if (getComputedStyle(c).position === 'static') c.style.position = 'relative';

    const shareKey = opts.share && !SHOT ? opts.share : null;
    const pool = shareKey ? getPool(shareKey) : null;
    let renderer, canvas, quality;
    if (pool && pool.renderer) {
      ({ renderer, canvas } = pool);
      quality = { ...pool.quality, dprLimit: undefined, degraded: false };
    } else {
      quality = detectQuality(opts.quality);
      ({ renderer, canvas } = this.createRenderer(THREE, quality));
      if (pool) Object.assign(pool, { renderer, canvas, quality: { ...quality } });
    }
    this.renderer = renderer;
    this.pool = pool;
    pool?.users.add(this);
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
    if (!pool || !pool.owner || !pool.owner.visible) this.attach(canvas);

    await yieldTask();
    if (gen !== this.generation) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(opts.fov, 1, opts.near, opts.far);
    camera.position.set(0, 0, 10);

    const disposers = [];
    const tracked = new Set();
    const self = this;
    const ctx = {
      THREE, renderer, scene, camera, canvas, container: c,
      quality, tier: quality.tier,
      options: opts.sceneOptions || {},
      reducedMotion: reducedMQ.matches,
      shot: SHOT,
      get static() { return self.isStatic(); },
      settled: false,          // true while rendering the settled/static frame
      size: { width: 1, height: 1, aspect: 1, dpr: quality.dpr },
      time: 0, delta: 1 / 60, frame: 0,
      pointer: { x: 0, y: 0, tx: 0, ty: 0, clientX: -1, clientY: -1, local: { x: 0, y: 0 }, inside: false, moved: false, touch: false },
      scroll: { progress: 0, enter: 0, exit: 0, page: 0, y: 0, velocity: 0, raw: { progress: 0, enter: 0, exit: 0, page: 0 } },
      visible: false,
      /** Register anything with .dispose() (or a function) to be released on teardown. */
      track(obj) { if (obj) tracked.add(obj); return obj; },
      onDispose(fn) { disposers.push(fn); },
      /** Ask for a render on the next frame (needed in static mode after async changes). */
      invalidate: () => self.invalidate(),
      /** Dispatch a DOM CustomEvent `hc3d:<name>` on the container (for DOM ↔ scene wiring). */
      emit(name, detail) { c.dispatchEvent(new CustomEvent(`hc3d:${name}`, { detail, bubbles: true })); },
      /** Swap the active camera (e.g. an orthographic one). */
      setCamera(cam) { ctx.camera = cam; self.resize(); },
      /** Yield the main thread between heavy build steps inside a scene's create(): `await ctx.yield()`. */
      yield: yieldTask,
    };
    ctx._tracked = tracked;
    ctx._disposers = disposers;
    this.ctx = ctx;

    addInputUser();
    this.inputUser = true;
    this.measure();
    this.sizeRenderer();

    const create = mod.default || mod.create;
    if (typeof create !== 'function') throw new Error('scene module must export default/create(ctx)');
    const inst = await create(ctx);
    if (gen !== this.generation) { this.disposeCtx(ctx, inst); return; }
    this.inst = inst || {};
    // Intro gate: the foundation's transition adds html.pt-enter and fires 'hc:pt-reveal' as it lifts.
    const hc = document.documentElement.classList;
    if (hc.contains('pt-enter') && !hc.contains('pt-reveal') && !this.isStatic()) {
      this.gateOpen = false;
      const open = () => { this.gateOpen = true; window.removeEventListener('hc:pt-reveal', open); };
      window.addEventListener('hc:pt-reveal', open);
      setTimeout(open, 1200);
    }

    observers();
    visIO.observe(c);
    this.ro = new ResizeObserver(() => this.scheduleResize());
    this.ro.observe(c);
    this.bindDpr();
    this.resize();

    await yieldTask();
    if (gen !== this.generation) return;
    await this.warm(THREE, gen);
    if (gen !== this.generation) return;

    this.state = this.isStatic() ? 'static' : 'ready';
    c.setAttribute('data-3d', 'ready');
    c.setAttribute('data-3d-tier', quality.tier);
    if (this.isStatic()) {
      await this.renderSettled();
      if (gen !== this.generation) return;
      this.reveal();
    } else if (!this.pool) {
      this.visible = true; ctx.visible = true; // first frame immediately; IO corrects if offscreen
      this.sync();
    } else {
      this.sync();                             // pooled: the visibility observer claims the canvas when on screen
    }
    this.resolveReady(this.inst.api ?? this.handle);
  }

  /**
   * Compile every program (hidden objects included) off the main thread where the driver allows it
   * (KHR_parallel_shader_compile), then upload textures one by one with yields in between.
   */
  async warm(THREE, gen) {
    const { renderer, scene, camera } = this.ctx;
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      if (renderer.compileAsync && !SHOT) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
    } catch (e) { /* ignore */ }
    if (gen !== this.generation) return;
    const textures = new Set();
    let transmissive = false;
    scene.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        if (m.transmission > 0) transmissive = true;
        for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap']) if (m[k]?.isTexture) textures.add(m[k]);
      }
    });
    this.ctx.quality.hasTransmission = transmissive;
    for (const t of textures) {
      try { renderer.initTexture(t); } catch (e) { /* ignore */ }
      await yieldTask();
      if (gen !== this.generation) break;
    }
    // Transmission compiles a second (linear-output) variant of every opaque program and allocates its render target
    // the first time a transmissive object is drawn: do that now, while the canvas is still transparent.
    if (transmissive && (!this.pool || this.pool.owner === this) && gen === this.generation) {
      try { renderer.render(scene, camera); renderer.clear(); } catch (e) { /* ignore */ }
    }
    hidden.forEach((o) => { o.visible = false; });
  }

  /* ---- shared canvas ------------------------------------------------------------------------- */

  attach(canvas) {
    if (this.pool) {
      const prev = this.pool.owner;
      if (prev && prev !== this) prev.release();
      this.pool.owner = this;
    }
    this.canvas = canvas;
    canvas.style.transition = 'none';
    canvas.style.opacity = '0';
    if (canvas.parentNode !== this.container) this.container.appendChild(canvas);
  }

  /** Another mount took the shared canvas: stop, and let the static art stand in. */
  release() {
    this.running = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.revealed = false;
    this.restoreFallbacks();
    if (this.state === 'ready') this.container.setAttribute('data-3d', 'standby');
  }

  claim() {
    if (!this.pool || this.pool.owner === this || !this.ctx) return;
    this.attach(this.pool.canvas);
    this.resize();
  }

  /* ---- measurement --------------------------------------------------------------------------- */

  measure() {
    const c = this.container;
    if (!c.isConnected) return;
    const sy = window.scrollY, sx = window.scrollX;
    const r = c.getBoundingClientRect();
    const m = this.metrics;
    m.docTop = r.top + sy; m.left = r.left + sx; m.width = r.width || 1; m.height = r.height || 1;
    const t = this.opts.scrollTarget || c;
    if (t === c) { m.sTop = m.docTop; m.sHeight = m.height; }
    else { const tr = t.getBoundingClientRect(); m.sTop = tr.top + sy; m.sHeight = tr.height || 1; }
  }

  bindDpr() {
    if (!window.matchMedia) return;
    this._mqDpr?.removeEventListener?.('change', this._onDpr);
    this._mqDpr = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this._mqDpr.addEventListener?.('change', this._onDpr, { once: true });
  }

  scheduleResize() {
    if (this._rs) return;
    this._rs = later(() => { this._rs = 0; this.resize(); });
  }

  sizeRenderer() {
    const ctx = this.ctx; if (!ctx) return;
    const w = Math.max(1, Math.round(this.container.clientWidth));
    const h = Math.max(1, Math.round(this.container.clientHeight));
    const q = ctx.quality;
    let dpr = Math.min(window.devicePixelRatio || 1, q.dprCap, q.dprLimit || 9);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.max(0.75, Math.sqrt(q.maxPixels / (w * h)));
    q.dpr = dpr;
    ctx.size.width = w; ctx.size.height = h; ctx.size.aspect = w / h; ctx.size.dpr = dpr;
    if (this.pool && this.pool.owner !== this) return;   // the shared canvas is sized by its current owner
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
  }

  resize() {
    const ctx = this.ctx; if (!ctx || !this.renderer) return;
    this.sizeRenderer();
    this.measure();
    const cam = ctx.camera;
    if (cam.isPerspectiveCamera) { cam.aspect = ctx.size.aspect; cam.updateProjectionMatrix(); }
    this.inst?.resize?.(ctx);
    if (this.isStatic()) this.invalidate();
  }

  /* ---- loop ---------------------------------------------------------------------------------- */

  setVisible(v) {
    this.visible = v;
    if (this.ctx) this.ctx.visible = v;
    if (v && this.pool && this.state === 'ready') this.claim();
    this.sync();
  }

  sync() {
    const owner = !this.pool || this.pool.owner === this;
    const should = this.state === 'ready' && owner && this.visible && !document.hidden && !this.paused && !this.cachePaused && !this.isStatic();
    if (should && !this.running) {
      this.running = true;
      this.last = 0;
      this.perf.t = 0; this.perf.win = 0; this.perf.acc = 0; this.perf.n = 0;
      this.raf = requestAnimationFrame(this._tick);
    } else if (!should && this.running) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  pauseForCache() { this.cachePaused = true; this.sync(); }
  resumeFromCache() { this.cachePaused = false; this.measure(); this.sync(); }

  updateInputs(dt, settle) {
    const ctx = this.ctx, p = ctx.pointer, s = ctx.scroll, m = this.metrics;
    const kp = settle ? 1 : 1 - Math.exp(-dt * this.opts.pointerLambda);
    const tx = settle ? (PREVIEW ? PREVIEW[0] : 0) : input.tx, ty = settle ? (PREVIEW ? PREVIEW[1] : 0) : input.ty;
    p.tx = tx; p.ty = ty;
    p.x += (tx - p.x) * kp;
    p.y += (ty - p.y) * kp;
    p.clientX = input.clientX; p.clientY = input.clientY; p.moved = input.moved; p.touch = input.touch;
    const y = input.sy;
    const top = m.docTop - y;
    p.local.x = ((input.clientX - (m.left - input.sx)) / m.width) * 2 - 1;
    p.local.y = -(((input.clientY - top) / m.height) * 2 - 1);
    p.inside = input.moved && Math.abs(p.local.x) <= 1 && Math.abs(p.local.y) <= 1;

    const vh = input.vh;
    const sTop = m.sTop - y, sH = m.sHeight;
    const r = s.raw;
    r.enter = clamp01((vh - sTop) / vh);
    r.exit = clamp01(-sTop / sH);
    r.progress = clamp01((vh - sTop) / (vh + sH));
    r.page = clamp01(y / input.maxScroll);
    // Settled frames (reduced motion / screenshots) show the composed state, not a scroll-driven one.
    if (settle) { const v = PREVIEW ? PREVIEW[2] : 0; r.enter = PREVIEW ? v : 1; r.exit = v; r.progress = PREVIEW ? v : 0.5; }
    const ks = settle ? 1 : 1 - Math.exp(-dt * this.opts.scrollLambda);
    s.enter += (r.enter - s.enter) * ks;
    s.exit += (r.exit - s.exit) * ks;
    s.progress += (r.progress - s.progress) * ks;
    s.page += (r.page - s.page) * ks;
    const v = dt > 0 ? (y - s.y) / dt : 0;
    s.velocity += (v - s.velocity) * (settle ? 1 : ks);
    if (settle) s.velocity = 0;
    s.y = y;
  }

  tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    let dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    const rawDt = dt;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 240;
    const ctx = this.ctx;
    // The scene clock waits while a page-transition overlay still covers the page, so intros play as it lifts.
    ctx.delta = dt; if (this.gateOpen !== false) ctx.time += dt; ctx.frame++; ctx.settled = false;
    this.updateInputs(dt, false);
    try {
      this.inst.update?.(ctx);
      this.renderer.render(ctx.scene, ctx.camera);
    } catch (err) {
      console.error('[hc3d] render error', err);
      this.teardown('error'); this.fallback('error');
      return;
    }
    if (!this.revealed) this.reveal();
    if (this.opts.adaptive) this.adapt(Math.min(rawDt, 0.25));
  }

  /**
   * Dynamic resolution, in time windows (not frame counts, so slow devices adapt fast): skip the first second, then
   * judge every second. A missed 55 fps target drops expensive effects first (transmission, particles), then scales
   * the pixel ratio by how far off the frame time was. One step back up after 5 s of comfortable frames.
   */
  adapt(dt) {
    const p = this.perf, ctx = this.ctx, q = ctx.quality;
    p.t += dt;
    if (p.t < 1) return;
    p.acc += dt; p.n++; p.win += dt;
    if (p.win < 1) return;
    const avg = p.acc / p.n;
    p.acc = 0; p.n = 0; p.win = 0;
    if (avg > 1 / 55) {
      p.stable = 0;
      if (!q.degraded && (q.hasTransmission || q.transmission)) {
        q.degraded = true; q.transmission = false; q.hasTransmission = false;
        this.inst?.degrade?.(ctx);
        return;
      }
      const next = Math.max(0.75, q.dpr * Math.min(0.9, Math.max(0.6, Math.sqrt((1 / 60) / avg))));
      if (next < q.dpr - 0.02) {
        q.dprLimit = next;
        this.sizeRenderer();
        this.inst?.resize?.(ctx);
      } else if (!q.degraded) { q.degraded = true; this.inst?.degrade?.(ctx); }
    } else if (avg < 0.012 && q.dprLimit && !p.up) {
      if (++p.stable >= 5) {
        p.up = true;
        q.dprLimit = Math.min(q.dprCap, q.dpr / 0.85);
        this.sizeRenderer();
        this.inst?.resize?.(ctx);
      }
    } else p.stable = 0;
  }

  async renderSettled() {
    const ctx = this.ctx; if (!ctx) return;
    ctx.settled = true;
    ctx.time = this.opts.sceneOptions?.settleTime ?? ctx.time;
    this.updateInputs(0, true);
    // Two passes: the first uploads textures/compiles, the second is the stable frame.
    for (let i = 0; i < 2; i++) {
      this.inst?.update?.(ctx);
      this.renderer.render(ctx.scene, ctx.camera);
      if (i === 0) await nextFrame();
      if (!this.ctx) return;
    }
  }

  invalidate() {
    if (!this.ctx || !this.renderer) return;
    if (this.running) return; // next tick renders anyway
    if (this.pool && this.pool.owner !== this) return;
    if (this._inv) return;
    this._inv = later(() => {
      this._inv = 0;
      if (!this.ctx || (this.pool && this.pool.owner !== this)) return;
      if (this.isStatic()) this.renderSettled();
      else { this.inst?.update?.(this.ctx); this.renderer.render(this.ctx.scene, this.ctx.camera); }
    });
  }

  motionChanged() {
    if (!this.ctx) return;
    this.ctx.reducedMotion = reducedMQ.matches;
    this.state = this.isStatic() ? 'static' : 'ready';
    this.sync();
    if (this.isStatic()) this.invalidate();
  }

  reveal() {
    if (this.revealed || !this.canvas) return;
    this.revealed = true;
    const canvas = this.canvas;
    const fade = this.isStatic() ? 0 : this.opts.fadeMs;
    const fbs = this.opts.fallback ? this.container.querySelectorAll(this.opts.fallback) : [];
    this.fallbacks = [...fbs];
    clearTimeout(this._fbTimer);
    later(() => {
      if (!this.revealed || this.canvas !== canvas) return;
      canvas.style.transition = fade ? `opacity ${fade}ms cubic-bezier(.22,.61,.36,1)` : 'none';
      canvas.style.opacity = '1';
      // the static art stays fully opaque underneath until the canvas is opaque: a cross-cut, never a dip to navy
      this._fbTimer = setTimeout(() => {
        for (const el of this.fallbacks) { el.style.transition = 'none'; el.style.opacity = '0'; el.style.visibility = 'hidden'; }
      }, fade + 50);
    });
    this.container.setAttribute('data-3d', 'live');
  }

  contextLost() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.canvas) this.canvas.style.opacity = '0';
    this.revealed = false;
    this.restoreFallbacks();
    this.container.setAttribute('data-3d', 'fallback');
  }

  fallback(reason) {
    this.state = 'fallback';
    this.container.setAttribute('data-3d', 'fallback');
    this.container.setAttribute('data-3d-reason', reason);
    this.resolveReady(null);
  }

  restoreFallbacks() {
    clearTimeout(this._fbTimer);
    for (const el of this.fallbacks || []) { el.style.opacity = ''; el.style.visibility = ''; el.style.transition = ''; }
  }

  stats() {
    if (!this.renderer || !this.ctx) return null;
    const i = this.renderer.info;
    return {
      tier: this.ctx.quality.tier, dpr: +this.ctx.quality.dpr.toFixed(2), gpu: this.ctx.quality.gpu, gpuClass: this.ctx.quality.gpuClass,
      transmission: !!this.ctx.quality.hasTransmission, shared: this.pool?.key || null,
      calls: i.render.calls, triangles: i.render.triangles, points: i.render.points, lines: i.render.lines,
      geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0,
      size: `${this.ctx.size.width}x${this.ctx.size.height}`,
    };
  }

  /* ---- teardown ------------------------------------------------------------------------------ */

  disposeCtx(ctx, inst) {
    try { inst?.dispose?.(); } catch (e) { /* ignore */ }
    for (const fn of ctx._disposers) { try { fn(); } catch (e) { /* ignore */ } }
    const seen = new Set();
    const disposeMaterial = (mat) => {
      if (!mat || seen.has(mat)) return; seen.add(mat);
      for (const k in mat) { const v = mat[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      if (mat.uniforms) for (const k in mat.uniforms) { const v = mat.uniforms[k]?.value; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      mat.dispose();
    };
    ctx.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
      if (o.isInstancedMesh) o.dispose?.();
    });
    for (const t of ctx._tracked) {
      if (seen.has(t)) continue; seen.add(t);
      try { typeof t === 'function' ? t() : (t.isMaterial ? disposeMaterial(t) : t.dispose?.()); } catch (e) { /* ignore */ }
    }
    // (the kit releases its shared, per-renderer environment itself; only a scene-owned one is disposed here)
    if (!this.pool && ctx.scene.environment?.dispose && !seen.has(ctx.scene.environment)) ctx.scene.environment.dispose();
    ctx.scene.clear();
  }

  teardown(reason) {
    this.generation++;
    this.running = false;
    this.cachePaused = false;
    cancelAnimationFrame(this.raf); this.raf = 0;
    cancelLater(this._rs || 0); this._rs = 0;
    cancelLater(this._inv || 0); this._inv = 0;
    this.ro?.disconnect(); this.ro = null;
    this._mqDpr?.removeEventListener?.('change', this._onDpr); this._mqDpr = null;
    visIO?.unobserve(this.container);
    lazyIO?.unobserve(this.container);
    if (this.ctx) { this.disposeCtx(this.ctx, this.inst); }
    const canvas = this.pool ? this.pool.canvas : this.canvas;
    if (this.renderer) {
      canvas?.removeEventListener('webglcontextlost', this._onLost);
      canvas?.removeEventListener('webglcontextrestored', this._onRestored);
      const pool = this.pool;
      const last = !pool || (pool.users.delete(this), pool.users.size === 0);
      if (pool && pool.owner === this) pool.owner = null;
      if (last) {
        this.renderer.dispose();
        if (reason !== 'restore') { try { this.renderer.forceContextLoss(); } catch (e) { /* ignore */ } }
        canvas?.remove();
        if (pool) pools.delete(pool.key);
      } else if (canvas?.parentNode === this.container) canvas.remove();
    } else this.canvas?.remove();
    if (this.inputUser) { removeInputUser(); this.inputUser = false; }
    this.restoreFallbacks();
    this.canvas = null; this.renderer = null; this.ctx = null; this.inst = null; this.pool = null;
    this.revealed = false; this.visible = false;
    this.perf = { t: 0, win: 0, acc: 0, n: 0, stable: 0, up: false };
    if (reason === 'suspend') this.suspended = true;
    if (this.state !== 'fallback' || reason === 'restore') this.state = 'idle';
    if (reason !== 'error') { this.container.removeAttribute('data-3d'); this.container.removeAttribute('data-3d-tier'); }
  }

  unmount() {
    this.teardown('unmount');
    this.state = 'disposed';
    mounts.delete(this);
    byEl.delete(this.container);
    this.resolveReady(null);
  }
}
