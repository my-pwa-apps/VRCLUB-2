# VR Club — AI Coding Agent Instructions

> **Accuracy contract**: this file describes the code as it exists. If you change the
> architecture, update this file in the same commit. A previous version of this document
> described a `js/systems/` module layer and `ModelLoader.createInstance()` APIs that do
> not exist, which actively misled agents working in the repo.

## What this is

A **client-side WebXR nightclub** built with **Babylon.js 8.30.5**, targeting Meta Quest 3S
and desktop browsers. There is **no backend**. Development sources are classic `<script>`
files that publish classes onto `window`; `npm run build` preserves their tested order and
emits one minified, content-hashed production bundle with esbuild.

## Load order is a hard contract

`index.html` loads scripts synchronously in this exact order:

1. `js/vendor/babylon.js` — pinned Babylon 8.30.5 runtime
2. `js/vendor/babylonjs.proceduralTextures.min.js`
3. `js/vendor/babylonjs.loaders.min.js` — **required** for `.glb`
4. `js/assetCache.js` — `IndexedDBAssetCache`, `InFlightRegistry`, `fetchWithTimeout`
5. `js/audioUtils.js`
6. loaders/factories (`textureLoader`, `modelLoader`, `materialFactory`, `lightFactory`)
7. `js/vjDirector.js`, then `js/showDirector.js`
8. `js/ledPatterns.js`
9. `js/club/01-core.js` through `js/club/11-audio-crowd.js`, in numeric order
10. `js/club_hyperrealistic.js` — final public `VRClub` bridge and LED mixin
11. `js/ui-init.js` — instantiates `new VRClub()`

`npm test` enforces this ordering, plus "every referenced script exists" and "every class
is exported onto `window`". Run it after touching `index.html` or adding a file.

Every source asset URL in `index.html` carries a shared `?v=` cache-busting token. The test
suite fails if the tokens diverge. Production uses content-hashed app and CSS filenames.

## Commands

```powershell
npm start        # http-server on :8000 (local dev)
npm run build    # content-hashed production site under dist/
npm run start:prod  # build + dependency-free dist server honouring $PORT
npm run check    # node --check every JS file
npm test         # contract test suite (test/contract.test.mjs)
```

HTTPS is not needed locally; the Quest browser allows WebXR over `http://localhost` and
over your LAN IP.

## Architecture

### `js/assetCache.js`
Shared caching primitives used by both loaders:
- `IndexedDBAssetCache` — never rejects on init, wires `tx.onerror`/`tx.onabort`/`request.onerror`,
  TTL-expires entries, and **degrades to download-every-time** on `QuotaExceededError`
  instead of breaking startup.
- `InFlightRegistry.run(key, factory)` — de-duplicates concurrent downloads of the same URL.
- `fetchWithTimeout(url, { timeoutMs, ...init })` — `AbortController`-backed hard deadline.

Any new network-backed asset type should reuse these rather than hand-rolling IndexedDB.

### `js/club/` and `js/club_hyperrealistic.js`
The VRClub implementation is an 11-layer inheritance chain grouped by lifecycle,
rendering, environment, fixtures, animation, UI, and audio/crowd responsibilities.
No layer exceeds 1,500 lines. `club_hyperrealistic.js` defines the final public class and
mixes `window.LEDPatterns` into its prototype. `updateAnimations()` is a thin orchestrator.

Key lifecycle members:
- `this.initPromise` — the constructor stores `init()`'s promise; failures surface a retry
  splash via `_handleFatalInitError()`. **Never** drop this promise.
- `this.ready` — `true` once `init()` resolves.
- `dispose()` — stops the render loop, removes listeners, closes the `AudioContext`,
  revokes blob URLs, tears down the UI timers and disposes scene + engine.
- `visibilitychange` stops the render loop when the tab is hidden and not in VR.
- `engine.onContextLostObservable` shows a toast and reloads (the engine runs with
  `doNotHandleContextLost: true`).

### `js/ledPatterns.js`
The LED wall's 37 `pattern*` implementations plus `updateLEDPanel()` and the two stateful
palette/shape helpers. It publishes `window.LEDPatterns`; `club_hyperrealistic.js` mixes
that map into `VRClub.prototype` after defining the class, preserving the club instance
as `this` without wrappers or call-site changes.

### `js/vjDirector.js`
Beat/BPM detection (spectral flux + adaptive median threshold), master colour palette,
scene state machine (`breakdown`/`groove`/`build`/`drop`), and macros. Writes into the
`VRClub` instance (`beatEnvelope`, `masterIntensity`, `barPhase`, `spotColorIndex`, …).

### `js/showDirector.js` — "NOCTURNE"
The composed light show, and **the single source of truth for fixture state** whenever
`showDirector.isDriving()` is true (i.e. the show is enabled and `vjManualMode` is off).

Structure: **14 looks** → **5 movements** (`arrival`, `pulse`, `ascent`, `ignition`,
`afterglow`) → **2 set-pieces** (`countdown`, `cutToBlack`). A look is a flat map of
`VRClub` fixture properties; a `[from, to]` value is a ramp resolved across the cue's bar
span. Movements are ordered cue lists; the next movement is chosen from a smoothed audio
energy EMA, but only on a bar boundary and only after `minBars` have elapsed.

Rules when editing:
- **All structural decisions happen in `_onBar()`, never mid-bar.** Landing changes off the
  musical grid is exactly the failure this class exists to fix.
- Look keys are validated at construction by `_validateLooks()` — a typo warns rather than
  silently doing nothing. Add new fixture properties to a look, not to a special case.
- `intensity`, `palette` and `punch` are meta keys (`ShowDirector.META_KEYS`) consumed by
  the director itself. They must never be written onto the club instance.
- `photosensitiveSafeMode` **overrides the designer**: `_applyLook()` force-clears
  `strobesActive`/`blindersActive`, and the `countdown` set-piece drops its strobe ladder
  and carries the build with intensity and speed alone. Never bypass this.
- Keep the gobo/laser exclusivity rule — one aerial idea at a time, or the haze turns to soup.

**Three places hand control over. All three must stay gated:**

| Gate | File | Guard |
|------|------|-------|
| Legacy 12-phase wall-clock cycler | `js/club/07-animation-core.js` | `&& !showDriving` |
| LED wall private pattern timer | `js/club/09-animation-finish.js` | `if (!showOwnsPattern && …)` |
| Auto-scene energy-threshold picker | `vjDirector.js` `update()` step 5 | `&& !showDriving` |

VJDirector keeps running throughout — beat tracking, BPM and the colour palette are inputs
to the show, not competitors. Only the *look decision* is handed over.

## Non-negotiable rendering rules

### Frame-rate independence
The render loop runs at 60 Hz on desktop, 72/90/120 Hz on Quest, and lower under thermal
throttling. `updateAnimations()` computes:

```javascript
const frameMs = this.engine.getDeltaTime();
const dtScale = Math.min(4, Math.max(0.25, frameMs / 16.667));
const dt = dtScale / 60;   // exact elapsed seconds for the clamped frame
```

**Never** hard-code `0.016` or a bare per-frame increment. Multiply rotation/phase steps by
`dtScale` and decrement timers by `dt`. For an exponential smoother, compound the retention
rate rather than scaling it: `k = 1 - Math.pow(1 - k60, dtScale)`.

A contract test (`test/unit.test.mjs`) fails the build on any literal `0.016` inside
`js/club/*animation*.js`.

### Never freeze/unfreeze materials per frame
`Material.freeze()` and `unfreeze()` both call `markDirty()`, which walks **every mesh in
the scene**. Calling them in the render loop for a handful of fixtures produced hundreds of
full-scene scans per second. If a material's colour is mutated each frame, unfreeze it
**once** and leave it unfrozen.

### Light count limits
PBR materials exhaust GPU uniform buffers past a device-specific light count. The authority
is `VRClub.detectMaxLights()` in `js/club/01-core.js`; `ModelLoader.detectDefaultMaxLights()`
mirrors it for the standalone case and a test enforces that the two agree.

| Device  | Max simultaneous lights |
|---------|-------------------------|
| Quest   | 4                       |
| Desktop | 3                       |
| Mobile  | 3                       |

Set `material.maxSimultaneousLights = this.maxLights` on **every** material, including the
materials that arrive inside loaded `.glb` files.

`maxSimultaneousLights` invalidates the compiled effect through `markAllSubMeshesAsLightsDirty`.
Both `scene.blockMaterialDirtyMechanism` and `material.freeze()` suppress that, so any sweep
that writes it must unfreeze, `markAsDirty(BABYLON.Material.LightDirtyFlag)`, and re-freeze -
otherwise the clamp never reaches the GPU. See `_clampMaterialLightBudgets()`.

### VR opacity
VR stereoscopic rendering is hypersensitive to transparency. On every mesh of a loaded model:

```javascript
mesh.material.alpha = 1.0;
mesh.material.transparencyMode = 0;      // PBRMATERIAL_OPAQUE - force it, do not infer
mesh.material.needAlphaBlending = () => false;
mesh.material.disableDepthWrite = false;
```

### No per-frame allocation
Reuse `this.cachedColors` and pre-allocated `Vector3`s; prefer `addToRef` / `scaleInPlace`
over `add` / `scale` inside `updateAnimations()`.

### Desktop vs VR settings
All differences live in the `vrSettings` object in `js/club/01-core.js`.
Change the config and call `applyVRSettings(xrCamera)` / `applyDesktopSettings()` — never
set pipeline values inline. Grain and chromatic aberration are disabled on both targets
(they read as haze); bloom is kept minimal.

### Graphics quality tiers
`vrSettings` covers *desktop vs VR*. A second, orthogonal axis covers *how strong a GPU
this is*: `this.qualityTiers` (constructor, next to `vrSettings`) with `ultra` / `high` /
`balanced`.

- `detectGraphicsTier()` picks the tier from `WEBGL_debug_renderer_info`,
  `navigator.hardwareConcurrency` and `navigator.deviceMemory`. Quest/mobile always get
  `balanced`. A `localStorage` override (`vrclub.graphicsTier`) always wins.
- `this.tierSettings` is a getter for the active tier's config.
- `setGraphicsTier(tier)` switches at runtime, persists the choice and rebuilds the
  tier-owned pipelines. Wired to the `cycleGraphicsQuality` VJ button.

Tier-gated features, all **desktop only**:

| Feature | Where | Ultra | High | Balanced |
|---------|-------|-------|------|----------|
| Render scale (`<1` = supersample) | `init()` + `applyDesktopSettings()` | 0.8 | 1.0 | 1.0 |
| Pipeline MSAA (`pipeline.samples`) | `addPostProcessing()` | 4 | 4 | 1 |
| `bloomKernel` | `addPostProcessing()` | 160 | 128 | 96 |
| SSR (`SSRRenderingPipeline`) | `_createScreenSpaceReflections()` | high | balanced | off |
| Motion blur | `_createMotionBlur()` | on | off | off |
| Contact-hardening (PCSS) shadows | `_applyShadowQuality()` | on | on | off |
| Anisotropic filtering | `_applyAnisotropicFiltering()` | 16× | 8× | 4× |
| Reflection probe resolution | `createFloorReflectionProbe()` | 512 | 256 | 128 |
| Mirror reflection spots | `updateMirrorBall()` | 100 | 60 | 30 |
| SSAO samples / expensive blur | `addPostProcessing()` | 24 / yes | 16 / yes | 8 / no |
| Floor `receiveShadows` | `createFloor()` | on | off | off |

Rules when touching this:
- **Every new heavy effect must be feature-detected** (`if (BABYLON.X)`) and wrapped in
  `try/catch` — there is no build step or browser test to catch a missing API.
- **Every new pipeline must be detached in `applyVRSettings()` and re-attached in
  `applyDesktopSettings()`**, mirroring the existing SSAO and SSR blocks. VR performance
  is the hard constraint; nothing tier-gated may run in a headset.
- **Every new pipeline must be disposed in `dispose()`** — post-process render targets are
  not always reclaimed by `scene.dispose()`.
- `applyDesktopSettings()` only runs when *exiting* VR. Anything that must be true on the
  initial desktop load also has to be set in `init()`.
- Dithering (`imageProcessing.ditheringEnabled`) is deliberately on. The scene is almost
  entirely dark gradients, which band badly in 8-bit without it. Do not remove it.

## Factories

Do not construct materials or lights inline.

```javascript
// Material
const mat = this.materialFactory.getPreset('platform');   // memoised by preset name
const custom = this.materialFactory.createPBRMaterial('customMat',
    { baseColor: [0.5, 0.5, 0.5], metallic: 0.8, roughness: 0.3 }, /* shared */ true);

// Light. Presets take (position, name) - position FIRST.
const light = this.lightFactory.getPreset('djLight', new BABYLON.Vector3(0, 5, 0), 'myLight');
this.lightFactory.getGroup('dj').forEach(l => l.setEnabled(false));
```

Material presets: `cdjBody`, `jogWheel`, `mixer`, `table`, `platform`, `rail`, `floor`,
`wall`, `ceiling`, `truss`, `brace`, `lightFixture`, `speakerBody`, `speakerGrill`,
`speakerHorn`, `brick`, `pillar`, `pipe`, `laserHousing`, and more.

Light presets: `ambient`, `djLight`, `speakerLight`, `spotlight`, `laserLight`.

Shared materials are keyed by `MaterialFactory._cacheKey()`, which normalises arrays and
`Color3`s so equivalent configs collide correctly. Materials carrying a texture are never
shared. A cached instance is tagged `_vrclubShared = true`: **never mutate one per-instance**,
because it is handed out by identity to every other consumer.

### Teardown
Every factory and loader exposes `dispose()` (`TextureLoader`, `ModelLoader`,
`MaterialFactory`, `LightFactory`). `VRClub.dispose()` calls all four. They own IndexedDB
connections, in-flight downloads and `DynamicTexture`s that `scene.dispose()` does **not**
reclaim. Anything you add that holds one of those must be released there.

## Build and service worker

`index.html` is the single source of truth for the script load order. `scripts/build.mjs`
**derives** the bundle order from it by parsing the `<script>` tags — never add a second
hand-maintained list. The build also **generates** `dist/sw.js`: its `PRECACHE` array and
`VERSION` come from the content hashes of the emitted bundle, because `caches.match()`
compares the full URL including the query string and a hand-written list cannot track them.

The service worker owns the **app shell only**. Models, textures and `.env` files are owned
by `IndexedDBAssetCache`; caching them in both places doubles ~60 MB of storage and exhausts
the origin quota on a Quest.

`npm run version:bump` rewrites `index.html`, `package.json`, `sw.js` and `serviceworker.js`
together. A contract test fails if any of the four disagree.

## Assets

- **Textures**: local `./textures/{floor,walls,ceiling}/{diff,normal,roughness,ao}.jpg`
  (originally sourced from Poly Haven). Not fetched from a CDN.
- **Models**: local `./js/models/` — `djgear/source/pioneer_DJ_console.glb`,
  `paspeakers/source/stage_speaker___black.glb`.
- **PBR environment**: local `./js/vendor/environmentSpecular.env`. It used to be fetched
  from `assets.babylonjs.com`; a contract test now forbids any third-party origin in the
  critical path, because one CDN outage silently stripped every reflection in the scene.
- `ModelLoader` has **no** instancing API. `createInstance()` / `disposeInstance()` do not
  exist; both PA speakers are separate loads that share one cached download.
- `TextureLoader` pools textures by `${url}_${scale.u}_${scale.v}`. `releaseTexture(texture)`
  takes the texture instance, not a URL, and references are counted on BINDING
  (`applyTexturesToMaterial`), not on pool hits.
- Downloads that read a body must use `fetchBufferWithTimeout` / `fetchBlobWithTimeout`.
  Plain `fetchWithTimeout` clears its deadline as soon as headers arrive, so a stalled body
  hangs startup forever.

### Layout coordinates (`CLUB_POSITIONS` in `js/club/01-core.js`)
- DJ booth: `{ x: 0, y: 0.95, z: -18 }`
- Dance floor centre: around `z = -12`
- Entrance: `z = 0`
- PA speakers: flown from the rear truss at `x = ±6`, cabinet top `y = 7.1`, `z = -16`

Treat `CLUB_POSITIONS` and `ROOM_BOUNDS` as the source of truth; do not re-derive
coordinates from documentation.

## Mesh naming

Procedural meshes are found by name for cleanup, so names are load-bearing:
`leftCDJ`, `rightCDJ`, `mixer`, `sub-7`/`subGrill-7`/`mid-7` (left stack),
`sub7`/`subGrill7`/`mid7` (right stack), `speakerLED-7`, `ledLight-7`.

When a real `.glb` loads, hide the conflicting procedural geometry with `setEnabled(false)`
to avoid z-fighting.

## Audio

`<audio crossOrigin="anonymous">` → `MediaElementSource` → `AnalyserNode(fftSize=256)` →
`DynamicsCompressor` → `GainNode` → destination.

- Bass (0–85 Hz) drives the mirror ball, mids (85–255 Hz) the lasers, highs the LED patterns.
- URLs are validated by `_isSafeAudioUrl()`: `blob:`/`https:` always allowed; `http:` only
  when the page itself is not HTTPS or the host is loopback; embedded credentials rejected.
- A stream served without `Access-Control-Allow-Origin` produces an all-zero analyser.
  `getAudioData()` detects this and surfaces a toast rather than failing silently.

## Persistence

| Store | Key |
|-------|-----|
| IndexedDB `VRClubTextureCache` / `textures` | asset URL |
| IndexedDB `VRClubModelCache` / `models` | asset URL |
| `localStorage` | `vrclub.safeMode`, `vrclub.bassHaptics`, `vrclub.graphicsTier`, `vrclub.lastStreamUrl` |

## UI

The DOM panel (`js/ui-init.js`) and the in-world desk (`js/club/10-ui.js`) are two surfaces
over ONE control set. All state mutation lives on `VRClub` — `cycleSpotColor()`,
`cycleMirrorBallColor()`, `applyFixtureExclusivity()`, `resetVJControls()` — and both
handlers only call those and render feedback. They previously reimplemented the same actions
and had silently diverged; a test now enforces the delegation.

`data-control` toggles are dispatched through the `TOGGLE_CONTROLS` allow-list, never by
writing `instance[attributeValue]` directly.

Photosensitive Safe Mode is offered on the splash **before** the scene renders and defaults
to on under `prefers-reduced-motion`. It must never be reachable only after the strobes have
already fired.

## Debugging

1. Reproduce on desktop first — iteration is far faster than deploying to the headset.
2. Inspect the Quest browser via `chrome://inspect` from a PC.
3. Look for `🥽 VR mode activated` / `🖥️ Desktop mode restored`.
4. `Too many lights` or `GL_INVALID_OPERATION` means a material exceeded `maxLights`.
5. `DEBUG_MODE` / `*_DEBUG` constants must be left `false` on commit — `npm test` enforces it.
6. The diagnostics overlay is `Ctrl+Shift+D`; `getDiagnostics()` returns the circular buffer.

## Licensing

Source code is MIT (`LICENSE`). Bundled 3D models, textures and animations are third-party
works under their own terms — every one is recorded in `ASSETS.md`, and CC BY attribution
must remain visible in `#modelCredits`.

## Known technical debt

See `BACKLOG.md` for the review history and resolved acceptance criteria. The repository
now has focused VRClub source layers, a production bundle, contract tests, and runtime
tests; new debt should be recorded there with measurable acceptance criteria.
