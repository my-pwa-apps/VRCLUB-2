# VR Club — AI Coding Agent Instructions

> **Accuracy contract**: this file describes the code as it exists. If you change the
> architecture, update this file in the same commit. A previous version of this document
> described a `js/systems/` module layer and `ModelLoader.createInstance()` APIs that do
> not exist, which actively misled agents working in the repo.

## What this is

A **client-side WebXR nightclub** built with **Babylon.js 9.28.0**, targeting Meta Quest 3S
and desktop browsers. There is **no application backend**; the only server-side code is the
optional multiplayer relay in `worker/` (see Multiplayer). Development sources are classic `<script>`
files that publish classes onto `window`; `npm run build` preserves their tested order and
emits one minified, content-hashed production bundle with esbuild.

## Load order is a hard contract

`index.html` loads scripts synchronously in this exact order:

1. `js/vendor/babylon.js` — pinned Babylon 9.28.0 runtime
2. `js/vendor/babylonjs.proceduralTextures.min.js`
3. `js/vendor/babylonjs.loaders.min.js` — **required** for `.glb`
4. `js/assetCache.js` — `IndexedDBAssetCache`, `InFlightRegistry`, `fetchWithTimeout`
5. `js/audioUtils.js`, then `js/podcasts.js` (`window.Podcasts`: podcast catalogue, random/queue player)
6. loaders/factories (`textureLoader`, `modelLoader`, `materialFactory`, `lightFactory`)
7. `js/vjDirector.js`, then `js/showDirector.js`
8. `js/ledPatterns.js`, then `js/barProps.js` (bottle geometry and label atlas; no club dependency), then `js/venueDressing.js` (entrance vestibule and bar), `js/mezzanine.js` (steel balcony and stair) and `js/cityDistrict.js` (the street outside), all mixed into `VRClub.prototype`
9. `js/avatarRig.js` (the procedural player body), then `js/networkClient.js` and `js/avatarManager.js` — optional multiplayer (no instance until a guest connects)
10. `js/club/01-core.js` through `js/club/11-audio-crowd.js`, in numeric order
11. `js/club_hyperrealistic.js` — final public `VRClub` bridge and LED mixin
12. `js/ui-init.js` — instantiates `new VRClub()`

`npm test` enforces this ordering, plus "every referenced script exists" and "every class
is exported onto `window`". Run it after touching `index.html` or adding a file.

Every source asset URL in `index.html` carries a shared `?v=` cache-busting token. The test
suite fails if the tokens diverge. Production uses content-hashed app and CSS filenames.

## Commands

```powershell
npm start        # dependency-free local server on :8000
npm run build    # content-hashed production site under dist/
npm run start:prod  # build + dependency-free dist server honouring $PORT
npm run check    # node --check every JS file
npm test         # contract test suite (test/contract.test.mjs)
npm run optimize:models  # idempotent model/texture shrink; `-- --check` fails if anything would change
npm run test:e2e # Playwright: production build in Chromium, with a Quest 3 emulated by IWER
```

The e2e suite needs no headset. `test/e2e/support.mjs` injects IWER (`iwer`, a WebXR runtime
emulator) as a Quest 3 with two controllers; it also patches IWER 2.3.0's
`getOffsetReferenceSpace()`, which stores the `XRRigidTransform` instead of its matrix and so
ignores every origin offset (teleport, snap turn and `xrCamera.position` writes would silently
do nothing). Drive input with IWER's ids (`thumbstick`, `trigger`, `y-button`), not the
`xr-standard-*` ids Babylon uses. `test/e2e/vr-session.spec.mjs` covers spawn, tracking, ray
select, snap turn and teleport; `test/e2e/vr-parity.spec.mjs` compares the desktop and VR
render state and image at the same pose. The emulator renders mono at 1280x720 on SwiftShader:
it proves behaviour, not headset frame time or stereo comfort.

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
Layers stay around 1,500 lines (`08-animation-fixtures.js` is the largest at ~1,600), and no
function in `02-lifecycle.js` / `08-animation-fixtures.js` exceeds ~215 lines. `init()` and
`updateSpotlights()` are orchestrators over named per-phase methods; add new phases as
methods rather than growing them again. `club_hyperrealistic.js` defines the final public class and
mixes `window.LEDPatterns` into its prototype. `updateAnimations()` is a thin orchestrator.

Key lifecycle members:
- `this.initPromise` — the constructor stores `init()`'s promise; failures surface a retry
  splash via `_handleFatalInitError()`. **Never** drop this promise.
- `this.ready` — `true` once `init()` resolves. The DJ console and PA GLBs keep loading after
  that (`this.modelLoadPromise`); `#vrButton` reads "Preparing VR…" until they settle and
  `scene.whenReadyAsync()` resolves (30 s ceiling), because their main-thread parsing stalls
  frames. It is the only XR entry point (`disableDefaultUI: true`).
- `dispose()` — stops the render loop, removes listeners, closes the `AudioContext`,
  revokes blob URLs, tears down the UI timers and disposes scene + engine.
- `visibilitychange` stops the render loop when the tab is hidden and not in VR.
- `engine.onContextLostObservable` shows a toast and reloads (the engine runs with
  `doNotHandleContextLost: true`).

### `js/ledPatterns.js`
The LED wall's 20 `pattern*` implementations (exactly the playlist in `updateLEDWall()`;
unreachable patterns were deleted, including a 15 Hz full-field strobe) plus `updateLEDPanel()` and the two stateful
palette/shape helpers. It publishes `window.LEDPatterns`; `club_hyperrealistic.js` mixes
that map into `VRClub.prototype` after defining the class, preserving the club instance
as `this` without wrappers or call-site changes.

`patternUndergroundSequence` (index 18, the `theWave` look) is a 38-bar, six-scene film
(DESCENT, SIGNAL, CONCRETE, HAZARD, DATAFALL, SUB) clocked from `vjDirector.beatNumber` /
`barPhase`, so scenes change on bar lines. Rules when editing it: every scene writes a shared
"fresh" buffer and one persistence pass gives the phosphor trail; scenes dip through black
rather than cut; nothing may flicker above 3 Hz per panel or step the whole field abruptly
(`test/unit.test.mjs` simulates the full loop and enforces both); and the restart-at-DESCENT
check keys off the scene frame counter, never wall-clock time, because a slow frame must not
restart the film. New patterns are appended to the playlist: looks refer to them by index.

`patternWarehouse` (index 19) is the wall as a club screen: eight beat-cut shape programs
(bars, blocks, rings, slats, diamonds, scan, checker, radar) picked on bar lines from the
music's energy (the Show Director's slow EMA blended with live bass). One colour, multi-colour
(`ledMulti`: the wall colour, its complement `ledAccentColor`, white-hot) or black and white
(`ledMonochrome`). It is the only pattern allowed to FLASH, and the flash is governed:
the room-wide `VRClubCore._tryClubFlash()` gate accepts its flash at most every 0.4 s
whatever the tempo, shapes step at most 2.5 times
a second (every other beat above 150 BPM), no program lights more than ~85% of the wall, and
Photosensitive Safe Mode keeps the motion but removes the flash (slow attack, lower peak,
lifted floor; nothing crosses half brightness). `test/unit.test.mjs` enforces all of it with
failing-when-removed checks on the gap, the stride and Safe Mode. Never raise a rate, add a
second flash source, or make a program change on every beat of a fast track without re-running it.

### `js/avatarRig.js` — the player's body
`AvatarRig` poses ONE person on the shared UE-mannequin dancer skeleton (`club-dancer-female`,
`club-dancer-male`, `club-dj-hernan`, `club-dj-melera`; the three Mixamo sources are refused). Those GLBs carry only a
dance or DJ-idle clip, so there is nothing to play for walking, turning or reaching: the rig
poses the skeleton every frame from where the player is, where they look and (in VR) where
their hands are. `VRClub._updateLocalPlayerBody()` builds the local pose from the camera and
the XR controllers; `AvatarManager` builds remote guests' from the interpolated state.

What it does: planted gait (stance feet slide back at exactly the player's speed, swing feet
lift and step, two-bone IK to the ankles), hips that follow the eyes with a dead-zone and a
turn-in-place, head/neck/spine sharing the remaining twist and pitch, arm swing against the
legs, VR arms IK'd to the controllers with the hand taking the controller's orientation,
crouch and flight from the same root-height maths, and the torso backing off as you look
down (the body mesh is open at the neck).

Rules when editing it:
- **World-space rotations only.** Every pose step is "rotate this world vector onto that
  one", converted to a local quaternion through the parent's world matrix. Never assume which
  bone axis is forward, and never reintroduce per-bone Euler maths. Facing and which side is
  "left" are measured from the skeleton at construction (`yaw0`, `yawDir`, `sideL`).
- **It owns a world-matrix cache** (`W`, `pos`, `Lq`). Calling Babylon's `computeWorldMatrix`
  per rotation cost ~3,400 calls and 5 ms a frame; the cache costs ~0.25 ms. Only the final
  quaternions are written back to the nodes, once per frame.
- **Share the crowd's materials.** Do not clone them: a cloned PBR material clones its
  textures, which never become ready for an embedded GLB image, so the mesh silently never
  draws (`Mesh.render` is still called, which is misleading). A per-guest tinted copy was
  measured at 38 new shader effects and ~3 s of invisibility for three guests.
- No per-frame allocation, and nothing in it may toggle a light or touch a material.
- VR hands are written against the WebXR pointer pose (forward and up) and have only been
  exercised with synthetic poses. Check them on a headset before trusting the roll.
- `test/rig.test.mjs` runs the real Babylon and the real GLB headless (no stubs, because a
  stub cannot tell a sliding foot from a planted one) and enforces planted feet, a real
  stride, rigid limbs, head tracking, the turn dead-zone, crouch, reach and a 2 ms ceiling.

### `js/vjDirector.js`
Beat/BPM detection (spectral flux + adaptive median threshold), master colour palette,
scene state machine (`breakdown`/`groove`/`build`/`drop`), and macros. Writes into the
`VRClub` instance (`beatEnvelope`, `masterIntensity`, `barPhase`, `spotColorIndex`, …).
`masterIntensity` is a REAL show dimmer: render code must multiply it into show-owned
emission, wall level and flash impulses; zero means blackout except explicit safety practicals.

### `js/showDirector.js` — "NOCTURNE"
The composed light show, and **the single source of truth for fixture state** whenever
`showDirector.isDriving()` is true (i.e. the show is enabled and `vjManualMode` is off).

Structure: **23 looks** → **5 movements** (`arrival`, `pulse`, `ascent`, `ignition`,
`afterglow`) → **4 set-pieces** (`countdown`, `cutToBlack`, `breakdown`, `release`). A look
is a flat map of
`VRClub` fixture properties; a `[from, to]` value is a ramp resolved across the cue's bar
span. Movements are ordered cue lists; the next movement is chosen from a smoothed audio
energy EMA, but only on a bar boundary and only after `minBars` have elapsed.

Rules when editing:
- **All structural decisions happen in `_onBar()`, never mid-bar.** Landing changes off the
  musical grid is exactly the failure this class exists to fix.
- Look keys are validated at construction by `_validateLooks()` — a typo warns rather than
  silently doing nothing. Add new fixture properties to a look, not to a special case.
- `intensity`, `palette`, `punch`, `colorLock`, `hue` and `ledHarmony` are meta keys
  (`ShowDirector.META_KEYS`) consumed by the director itself. They must never be written onto
  the club instance. `hue` (0..1) pins the master colour via `VJDirector.setMasterHue()` for
  the look; a look without it calls `unlockHue()`, so rotation resumes. `ledHarmony` sets the
  wall's colour against the beams (`match` default, `analogous`, `complement`, `triad`,
  `follow` = the lasers' partner hue); `_applyLook()` resets it to `match` for every look, and
  `colorLock` wins over it. The wall's colour is `club.ledShowColor`: `VJDirector.refreshLedColor()`
  owns it, and aliases `currentSpotColor` only when matching. A wall pattern must paint the
  colour it is handed or no harmony can reach it (`patternBreathing` ignored it until
  2026-10-02; plasma, aurora and rainbow still synthesise their own hues).
  `ledLevel` (0..1, resolved to `club.ledWallLevel`, reset to 1 per look) runs the wall as a quiet
  ACCOMPANIMENT: `_applyLedLevel()` scales every pattern in one final pass and eases in from dark.
  The wall must be lit through most of the show (`test/unit.test.mjs` fails below 60% of bars, and
  any new look that goes dark must be added to its stated list of deliberate solos). A level
  <= 0.85 does not count as a second headline in the single-subject rule. Give an accompaniment
  look a pattern with steady presence (tunnel, kaleidoscope, DNA): sparse ones such as the
  underground film and warehouse shapes average 0.14-0.24 and vanish when dimmed.
- `photosensitiveSafeMode` **overrides the designer**: `_applyLook()` force-clears
  `strobesActive`, and the `countdown` set-piece drops its strobe ladder
  and carries the build with intensity and speed alone. Never bypass this.
- Keep the gobo/laser exclusivity rule — one aerial idea at a time, or the haze turns to soup.

**Four places hand control over. All four must stay gated:**

| Gate | File | Guard |
|------|------|-------|
| Legacy 12-phase wall-clock cycler | `js/club/07-animation-core.js` | `&& !showDriving` |
| LED wall private pattern timer | `js/club/09-animation-finish.js` | `if (!showOwnsPattern && …)` |
| Auto-scene energy-threshold picker | `vjDirector.js` `update()` step 5 | `&& !showDriving` |
| Spotlight palette cycler (it swapped the heads' colour every few seconds, overriding any look's hue) | `js/club/08-animation-fixtures.js` `updateSpotColorCycle()` | `&& !showDriving` |

VJDirector keeps running throughout — beat tracking, BPM and the colour palette are inputs
to the show, not competitors. Only the *look decision* is handed over.

**Reading the track's structure.** VJDirector has a *flywheel*: after 1.5 beats without a
kick it keeps counting beats at the tracked BPM, so the bar grid survives a kick-less
breakdown. `realOnsetCount`, `lastRealOnsetAt` and `onsetStreak` count only genuine kicks.
`_watchKick()` uses them: a groove (≥ 32 kicks) followed by ~2 kick-less bars starts the
`breakdown` set-piece (blue sheet → teal wall → rising magenta, strobe-free, up to 96 bars);
two fresh kicks end it with `release`, which re-locks `_beatInBar` to the returning kick and
hands on to IGNITION. Over 4 s of silence hands the breakdown to AFTERGLOW instead; a one-beat
gap before a drop does not. AFTERGLOW now ends on `sunrise` (amber aurora, 16 bars).

**Strobes are beat-locked.** A look's `strobeSync` (`beat`, `offbeat`, `bar`, `roll`; omitted =
`free`, the legacy random timer) makes `_strobeSyncDue()` in `09-animation-finish.js` fire a
burst on the kick, between kicks, on the downbeat, or on both (the build-up roll). A synced
`chase` steps the corners in order instead of picking randomly. Every strobing look declares a
sync mode (a unit test enforces it) and the countdown climbs bar → beat → roll → roll. Safe
Mode still force-clears `strobesActive` first, so none of this can fire under it.
**Strobes are an accent, not only a peak.** Under the groove and build, the heads, lasers and
laser sheets carry a `chase` strobe once per bar (`strobeSync: 'bar'`, about 0.5 flashes a
second at any tempo) to add tension; the opening, the breakdown arc and the comedown stay
strobe-free. Any strobe layered under another subject must be bar-synced (a unit test allows
only `detonation` and `releaseHit` to be faster), which also keeps it clear of the 3-a-second
limit. A strobe-only solo may use the faster grid. The one-idea-at-a-time rule counts a
bar-synced strobe as an accent, like a dimmed LED wall.
**Kick punch reaches the fixtures.** `club.kickDepth` (the look's `punch`, written by the
director) × `beatEnvelope` gives `club.kickPulse` each frame, halved in Safe Mode. It lifts
the moving-head intensity and beams, laser beams, laser-sheet glow, mirror-ball spin, and —
via `_ledLift` in `updateLEDPanel()` — the whole LED wall. Unit tests drive these methods on
bare stubs, so every read is `(this.kickPulse || 0)`.
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

The same cascade fires from any `ImageProcessingConfiguration` setter (`exposure`,
`contrast`, vignette, tone mapping): every material observes the scene configuration and
walks every mesh. A per-frame `imageProcessing.exposure = …` cost 104–130 ms per write at
the current scene size. Per-frame exposure goes through `_writeExposure()`
(`js/club/07-animation-core.js`); a unit test and the e2e suite assert zero notifications.

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

Mirror-ball fixtures are deliberately visual-only. Their emissive incident beams, reflected
surface spots/rays and ambient bounce provide the effect; do not add or dynamically enable a
real mirror-ball light. Doing so changes the light UBO layout after static PBR materials are
frozen and can invalidate DJ, avatar and truss draws on WebGL.

`maxSimultaneousLights` invalidates the compiled effect through `markAllSubMeshesAsLightsDirty`.
Both `scene.blockMaterialDirtyMechanism` and `material.freeze()` suppress that. The startup
and model-loader budget sweeps unfreeze lit materials and mark their lights dirty, even
when the numeric budget already matches. Leave lit materials unfrozen: asynchronously
loaded or enabled lights can change a slot from spotlight to point light without changing
the count, leaving a frozen shader expecting a larger buffer than the bound light supplies.
Startup restores `scene.blockMaterialDirtyMechanism = false` before rendering. Unlit
materials may remain frozen. See `_clampMaterialLightBudgets()` and
`ModelLoader._enforceSceneLightBudget()`; never freeze/unfreeze in the animation loop.

DJ-console and PA-speaker accent lights target only their own imported meshes through
`includedOnlyMeshes`. Do not let them consume the room or crowd's moving-spotlight budget.

A material binds the first `maxSimultaneousLights` enabled lights that can affect its mesh,
in its cached eligible-light order. DJ and PA accents use `renderPriority = 1`, enabling
`requireLightSorting`; the loader resynchronizes their meshes once after assigning the
scoped accent. Room/crowd order remains creation order because those accents cannot affect
them. Today their slots are `ambient`,
`spot0` and `spot1` (plus `spot2` on Quest). `_bindPhotometricSlots()` copies the strongest
surface-hitting heads into those slots each frame, from a snapshot, so a bright beam on
`spot4` still shades the floor it hits. Do not "fix" that copy by restoring each slot to
its own yoke. The six moving-head `SpotLight`s stay **enabled for life** and are dimmed
through `intensity`. Never toggle a light's enabled state in the render loop: it re-slots
every lit material, which measured 17–20 shader compiles (0.4–1.1 s freezes) per cue change
and a ~2 ms scene walk per toggle. `strobeFlash` stays disabled for life; the flash is the
emissive lamp plus the ambient impulse.

Smoke and dust are unlit sprites, so `_lightAirParticles()` (07, hooked into the haze and
dust `updateFunction` by `_installAirLighting()`) brightens and tints the ones inside a
moving-head cone with a Henyey-Greenstein phase term, makes dust visible only inside beams,
and feeds each beam's `_mediumDensity` back into its alpha. It edits the colour for one
frame only (the colour gradient recomputes it), allocates nothing, and is **desktop only**:
~0.3 ms per pass on a desktop CPU, unmeasured on a Quest. Do not enable it in VR without a
headset capture.
No light currently owns a `ShadowGenerator`: the two it had sat outside every material's
slots, so no shadow was ever sampled.

Keep the ambient preset's small nonzero specular contribution. Babylon's (observed on 8.30.5;
the mirror-only e2e still guards it on 9.28.0) clear-coat path can read uninitialized pre-lighting vectors when only a zero-specular
hemispheric light remains. This produces a white floor/foreground in mirror-only cues,
not extra fog. The ambient specular term keeps `SPECULARTERM` enabled without another light.

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

**`pipeline.sharpen.colorAmount` is a brightness GAIN, not a sharpness.** Babylon's sharpen shader is
`colour * colorAmount - edge * edgeAmount` and runs after tone mapping, so a value below 1 darkens the
whole image and caps peak white at that value. VR shipped at 0.1 (a headset frame at 10% brightness,
which no amount of fixture boosting could fix); keep it at 1.0 and set brightness with `exposure`.
Sharpening strength is `edgeAmount` only. `test/e2e/vr-parity.spec.mjs` fails if the VR gain drifts or
the VR frame is darker than the desktop one. The strobe's whole-room impulse is
`vrSettings.*.strobeImpulse`, tuned against measured flash luminance, not by eye. A strobe burst is
about 40 ms in REAL seconds (`STROBE_FLASH_S` in `09-animation-finish.js`, not scaled by
`strobeSpeed`) and the free-running timer is floored at 0.34 s (three flashes a second); a unit test
simulates 45 to 120 Hz and fails on a longer burst or a faster timer. The strobe bank, manual
moving-head shutter and Warehouse LED flash all claim the same room-wide
`VRClubCore._tryClubFlash()` governor, so their combined output cannot exceed one abrupt
flash per 0.34 s (Warehouse requests its stricter 0.4 s gap). Safe Mode denies every claim;
the Warehouse pattern may still run its explicitly tested slow Safe Mode swell.

**The XR layer's `antialias` does not antialias the scene.** The headset renders into the pipeline's
offscreen target first, so MSAA must be set on that pipeline: `vrSettings.vr.msaaSamples` through
`VRClubCore.resolveVRMsaaSamples()` (clamped to `maxMSAASamples`, overridable with `localStorage`
`vrclub.vrMsaa` = 1, 2 or 4). It was 1 and only FXAA ran. Its Quest 3S cost is unmeasured.

### Graphics quality tiers
`vrSettings` covers *desktop vs VR*. A second, orthogonal axis covers *how strong a GPU
this is*: `this.qualityTiers` (constructor, next to `vrSettings`) with `ultra` / `high` /
`balanced`.

- `detectGraphicsTier()` picks the tier from `WEBGL_debug_renderer_info`,
  `navigator.hardwareConcurrency` and `navigator.deviceMemory`. Quest browsers start at `ultra`,
  phones/tablets at `balanced`. A `localStorage` override (`vrclub.graphicsTier`) always wins.
- `this.tierSettings` is a getter for the active tier's config.
- `setGraphicsTier(tier)` switches at runtime, persists the choice and rebuilds the
  tier-owned pipelines. Wired to the `cycleGraphicsQuality` VJ button and the VR quick menu.
  After rebuilding it unfreezes and invalidates material effects once, because
  pre-pass outputs can change when motion blur or SSR is attached or removed.

Tier-gated desktop features:

| Feature | Where | Ultra | High | Balanced |
|---------|-------|-------|------|----------|
| Render scale (`<1` = supersample) | `init()` + `applyDesktopSettings()` | 0.8 | 1.0 | 1.0 |
| Pipeline MSAA (`pipeline.samples`) | `addPostProcessing()` | 4 | 4 | 1 |
| `bloomKernel` | `addPostProcessing()` | 160 | 128 | 96 |
| SSR (`SSRRenderingPipeline`) | `_createScreenSpaceReflections()` | high | balanced | off |
| Motion blur | `_createMotionBlur()` | on | off | off |
| Contact-hardening (PCSS) shadows | `_applyShadowQuality()` (no-op: no generator exists) | on | on | off |
| Anisotropic filtering | `_applyAnisotropicFiltering()` | 16× | 8× | 4× |
| Reflection probe resolution | `createFloorReflectionProbe()` | 512 | 256 | 128 |
| Mirror reflection spots | `_updateMirrorReflectionBatch()` | 280 | 180 | 96 |
| Mirror outgoing rays | `_updateMirrorReflectionBatch()` | 64 | 52 | 32 |
| SSAO samples / expensive blur | `addPostProcessing()` | 24 / yes | 16 / yes | 8 / no |
| Floor `receiveShadows` | `createFloor()` | on | off | off |

The same selection also scales headset-safe features without enabling desktop-only SSR,
SSAO, motion blur or shadows in XR:

| VR feature | Ultra | High | Balanced |
|------------|-------|------|----------|
| Bloom kernel | 64 | 48 | 32 |
| Pipeline MSAA default | 4 | 4 | 4 |
| Anisotropic filtering | 12× | 8× | 4× |
| Haze / dust rates | 90 / 50 | 78 / 40 | 65 / 30 |
| Fixed foveation | 0.2 | 0.3 | 0.4 |
| Crowd / guests | 14 / 8 | 10 / 4 | 6 / 2 |
| Mirror spots / rays | 280 / 64 | 180 / 52 | 96 / 32 |

Quest browsers auto-detect `ultra` (the owner's Quest 3 runs it; the Quest 3S is unmeasured) and phones/tablets `balanced`; a saved or in-menu
selection always wins, and the VR menu steps down to `high` or `balanced`. Because the flat (pre-XR) page on a Quest also runs the
desktop tier path, ultra's SSR, SSAO and motion blur render there until the headset session starts, and are detached on entry.
High and Ultra remain unmeasured on a Quest 3S.

Rules when touching this:
- Mirror reflection spots and outgoing rays are two thin-instanced meshes backed by
  preallocated matrix buffers. `_intersectRoomInterior()` analytically clips them to
  `ROOM_INTERIOR` (the shell's inner faces: x ±12.25, ceiling y 9.85, LED wall z -20, front
  wall z -0.25). `ROOM_BOUNDS` is the narrower walkable band and must not be used for optics.
  Do not restore per-spot meshes or `scene.pickWithRay()` calls.
- **Every new heavy effect must be feature-detected** (`if (BABYLON.X)`) and wrapped in
  `try/catch` — there is no build step or browser test to catch a missing API.
- **Every new pipeline must be detached in `applyVRSettings()` and re-attached in
  `applyDesktopSettings()`**, mirroring the existing SSAO and SSR blocks. VR performance
  is the hard constraint; no desktop-only tier feature may run in a headset.
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
`floorConcrete` (the dance floor: matte, no clear coat), `wall`, `ceiling`, `truss`, `brace`,
`lightFixture`, `speakerBody`, `speakerGrill`, `speakerHorn`, `brick`, `pillar`, `pipe`,
`steelGirder`, `laserHousing`, and more.

SSR's `reflectivityThreshold` sits above a dielectric's F0 (~0.04) so only metals trace
reflections; lowering it makes the concrete floor mirror the room again at grazing angles.

The laser sheet has two truss projectors (`laserSheetSource` at x = -6,
`laserSheetSourceRight` at x = +6) and by default BOTH emit (`laserSheetOrigin: 'both'`): the left
fan leads, the right one mirrors its yaw and trails its pitch in phase so the planes scissor.
The fans share materials, so the second costs two draw calls and no extra noise textures.

**Tune the sheets by their crossing, not their planes.** Each plane turns only ~2 deg/s, but the
bright line where the two planes meet runs many times faster (the old aim measured a median
1.6 m/s and a 7.5 m/s peak, 3-5 m over the floor). The shipped geometry (inward aim 0.20 rad,
base pitch 0.53, follower trail 0.5, ranges 0.06 / 0.12) holds the crossing to a ~0.4 m/s drift,
under 1 m/s at worst, and 2.0-3.6 m high at mid-room. `_poseLaserSheet()` owns the pose maths
and caps the laser speed at 1.4 so the slider or a legacy phase cannot undo it. It integrates
clamped elapsed time × speed into a stored phase; never go back to absolute time × current speed
or a late cue ramp will teleport the crossing.
`test/sheet.test.mjs` measures the crossing on the real Babylon maths for every shipped sheet
look; retune against it, never by eye.
`'ceilingLeft'` / `'ceilingRight'` fire one projector only. `configureLaserSheetVariant()`
re-parents the lead fan; `this.laserSheetSource` always points at the lead projector and
`_laserSheetFollower` at the second (null when single-sided).

**Laser optics (sheet and ceiling beams).** Both are drawn the way a beam is seen in haze, and the
rules are enforced by `test/unit.test.mjs`:
- Colours are diode wavelengths (`cachedLaserColors`: 638 / 532 / 445 nm), not sRGB primaries;
  `_laserColor()` is the one source, honouring `colorLockActive`.
- Additive laser materials have `fogEnabled = false`: fog mixes toward its colour and greys a beam.
  Distance and haze attenuation go in vertex alpha instead.
- No laser line is narrower than a few pixels (`_laserView()` gives the pixel angle), and widening
  divides its brightness. A sub-pixel modelled cylinder aliased into dashed, crawling lines.
- Ceiling beams are ONE camera-facing ribbon batch (`laser_beams`) plus ONE dot batch
  (`laser_beamHits`) written every frame by `updateLasers()`. Each beam leaves the projector's
  underside aperture, ends on whichever `ROOM_INTERIOR` face it reaches (walls included), throws a
  dot there and scatters forward (`_laserScatterGain()`, Henyey-Greenstein g 0.45).
- The sheet fan is subdivided: vertex alpha carries the ~1/r power spread and the brighter scan
  edges, and an emissive Fresnel term makes it a bright line edge-on and a veil face-on. The fan is
  longer than the room so the shell's depth test ends it on a surface. Its noise textures need
  `getAlphaFromRGB = true` (Babylon's noise writes alpha 1). There is deliberately no separate
  bright line where the fan meets the floor (tried, removed at the owner's request).

Light presets: `ambient`, `djLight`, `speakerLight`, `spotlight`, `laserLight`.

Shared materials are keyed by `MaterialFactory._cacheKey()`, which normalises arrays and
`Color3`s so equivalent configs collide correctly. Materials carrying a texture are never
shared. A cached instance is tagged `_vrclubShared = true`: **never mutate one per-instance**,
because it is handed out by identity to every other consumer.

Factory materials are **frozen after creation** unless their config says `mutable: true`.
Pass it for any material whose colour or intensity is written at runtime. Freeze behaviour
is never inferred from the material's name, and a test guards the migrated call sites.

`ModelLoader` takes `{ lightFactory, textureLoader }` as its fifth argument, so accent lights
are registered and speaker textures are cached. `_fitAndPlace()` preserves the glTF loader's
handedness conversion via `ModelLoader._rootHandedness()`. Model configs therefore carry no
mirror signs in `scale`; never add a `-1` there to "unmirror" a model.

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

Production is the **built** `dist/`, published by the `deploy` job in
`.github/workflows/ci.yml` only after `verify`, `e2e` and `audit` pass (GitHub Pages source
must be set to "GitHub Actions"). GitHub Pages ignores `_headers`, so `frame-ancestors`
and the immutable asset caching there only apply on Cloudflare Pages or Netlify.

`.gitattributes` pins LF line endings and marks `js/vendor/**` as `-text`. The vendored
bundles are byte-pinned by sha384, and Windows `core.autocrlf` would otherwise rewrite them
and fail `npm test`.

## Assets

- **Textures**: local `./textures/{factoryFloor,walls,ceiling}/{diff,normal,roughness,ao}.jpg`
  (Poly Haven, CC0; normal maps are the DirectX `nor_dx` variant). Not fetched from a CDN.
  The folder name is part of the IndexedDB cache key, so replacing a set means renaming its
  folder — overwriting files in place leaves returning visitors on the old maps for 30 days.
- **Models**: local `./js/models/` — `djgear/source/pioneer_DJ_console.glb`,
  `paspeakers/source/stage_speaker___black.glb`, and the characters in `avatars/`.
  Characters: the Quaternius `club-*.glb` files share one UE-mannequin rig and carry their clips
  inside the file, EXCEPT the crowd (next bullet). `_spawnAvatar(..., { clip })` keeps one clip and
  disposes the rest. After building or replacing one, run
  `npm run optimize:avatars -- <file>` (it merges skinned parts that share a skin and material, so a
  character is ~6 draws, and a contract test fails above 6). Add every new GLB to `ASSETS.md`. The three
  Mixamo GLBs are a known licensing gap, kept for their authored hip-hop, house and rumba choreography
  (Quaternius's free libraries have ONE dance clip, `Dance_Loop`). The two Quaternius sci-fi prop packs were evaluated and not used:
  chunky pieces (a 1.6 m chair, 2 m desks, 4-6k-vertex crates) that do not fit this club.
  The DJ console and PA speaker are **optimised derivatives**: run
  `npm run optimize:models` after replacing or editing either (idempotent; `npm test` runs it with
  `--check`). Never put a 4096 px texture in the scene — a Quest shares its memory with the browser
  and each one costs ~85 MB with mips (the budget is in `test/e2e/budget.spec.mjs`). The speaker
  GLB is deliberately textureless: `ModelLoader.applyPASpeakerTextures()` applies the external
  `paspeakers/source/authored/textures/small_speaker_1_1001_*` set to every mesh: original-GLB
  albedo/normal (2048 px) and shared packed ORM (1024 px). Keep `invertY=false`, normal-map
  handedness matching glTF, metallic/roughness factors at 1, and no uniform emissive floor.
  The optimizer recovers these images before stripping a replacement's embedded copies.
  Do not use Draco, meshopt
  or KTX2: Babylon fetches their decoders from a CDN, which the same-origin rule forbids.
- **The crowd is 17 different people** (`club-crowd-f1..f8`, `m1..m9`): the CC0 Quaternius Modular Women and
  Modular Men packs, recoloured (skin tone, hair, clothes, silver heads for older guests) and given the club's own
  dance and idle clips. They are NOT on the UE mannequin: their rig is the 62-bone modular one (a `Body` bone
  carries the height and the legs hang from it, free-standing IK foot bones, arms-down bind pose, no dance clip),
  so `node scripts/build-crowd-glbs.mjs --women <dir> --men <dir> --optimize` retargets the clips offline: trunk
  bones take the source's WORLD rotation delta from its bind pose, arms and legs are aimed along the source's
  world bone directions (swing only, which is what lets a T-posed source drive a relaxed rig), and the foot
  bones are placed at the end of the animated legs. Each person is ONE mesh with ONE material and per-vertex
  colour (no textures, ~0.8 MB), where the Universal Base Characters cost about six draws. The cast, palettes
  and which people carry the guest clips live in that script's `CAST`; props (pistols, hats, crowns) are dropped.
  `test/rig.test.mjs` measures the real skeletons dancing (limbs rigid, feet on the floor, hands moving) and is
  what catches a wrong axis or flipped side; `test/unit.test.mjs` pins one skin, one draw, one material and the
  clip sets. Do not hand-edit the GLBs: change `CAST` and rebuild.
- **Sources load per tier.** `VRClub.AVATAR_SOURCES` (`js/club/11-audio-crowd.js`) lists every character file by
  id (`sourceIndex('f1')`); the crowd and guest slots point at them. Only the files the active tier shows are fetched
  (`_requiredCrowdSources`: the player's body, the bartender, the first N dancers and the first N guests), so a
  Balanced headset downloads about half of what Ultra does; `_applyCrowdSize()` fetches the missing ones in the
  background when the tier rises (`_topUpCrowdSources`) and places them afterwards. In
  `_crowdSourceContainers` `undefined` means "not requested yet" (the slot waits) and `null` means "failed"
  (another loaded character stands in). Slots are ordered so the first six are already varied (men and women,
  several skin tones, a silver head, a punk, one Mixamo dancer). `club-dancer-*.glb` now only dress the player's own
  body and the bartender is the female guest file with a black tint; `club-guest-male.glb` is a build source only.
- **The DJ follows the podcast.** `VRClub.DJ_LOOKS` (`js/club/11-audio-crowd.js`) maps `hernan` (silver
  hair, beard, black tee, 1.78 m) and `melera` (long dark hair, black, 1.68 m) to `club-dj-hernan.glb` /
  `club-dj-melera.glb`, built by `node scripts/build-dj-glbs.mjs` from the Quaternius male/female
  guests (+ a Universal Base Characters beard that shares the hair material, so the optimiser still
  merges to ≤6 draws), then `npm run optimize:avatars -- club-dj-hernan.glb club-dj-melera.glb`.
  `setDJ(id)` queues behind `initPromise`, loads each DJ once, disposes the previous performer and
  collider, and tints garment and hair (`/^MI_Hair/`) on the DJ's own container so the crowd is
  unaffected. The looks are approximations from public photos, not likenesses: Hernan is known for grey hair, a
  grey beard (and often glasses, which are not modelled) in dark tops; Miss Melera for long brunette hair (her
  braid). Both podcasts are solo sets by their host, so there is no per-track guest to look up; a new DJ is a new
  `DJ_LOOKS` entry plus a `dj` field on a podcast in `js/podcasts.js`.
- **Environment and surfaces**: the reflection environment is `textures/environment/empty_warehouse_01_256.env` (Poly Haven, CC0; how it is made is in ASSETS.md); do not go back to a bright or coloured sky, it tints every metal surface. Floor, wall and ceiling use a packed `orm.jpg` (R occlusion, G roughness, B metallic): add a new surface set with `node scripts/pack-orm.mjs`. Signs are `createSignage()` (one atlas, one additive mesh), and every character gets a contact shadow from `_refreshContactShadows()`; call `_applyCrowdSize()` after enabling or moving characters.
- **LED wall**: ONE mesh (`ledPanel_wall`), not one per panel. Patterns still write
  `panel.material.emissiveColor` (a plain holder, not a Babylon material), and `_flushLedWall()`
  copies those colours into the wall's 21x10 emissive texture at the end of `updateLEDWallPass`.
  Do not split it back into per-panel meshes, and do not add a code path that writes a panel colour
  after that flush.
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
- Entrance: a 4 m doorway in the front wall at `z = 0` (x -2..2, 3.4 m high) into the vestibule, `z 0.25..6`; its street door
  (`z 6.3`, x ±1.66, 3.06 m high) opens onto the avenue outside (see The street)
- The club shell ends at its facade: front wall `z 0.25`, side walls, floor and ceiling `z -21.25..0.25` (they used to run 12 m
  on past it, which would have covered the street)
- Bar: along the right wall, `x 9.7..12.25`, `z -13.8..-6`
- PA speakers: flown from the rear truss at `x = ±6`, cabinet top `y = 7.1`, `z = -16`
- Lighting rig side cross beams, their six moving heads and the two side lasers:
  `x = ±CLUB_POSITIONS.sideTrussX` (7.6), over the dance floor, clear of the balcony, the bar and the flown PA

Treat `CLUB_POSITIONS` and `ROOM_BOUNDS` as the source of truth; do not re-derive
coordinates from documentation. The bar and vestibule numbers live in `window.VenueLayout`
(`js/venueDressing.js`); the guest slots, the bartender and the tests read them from there.

### Entrance and bar (`js/venueDressing.js`, `js/barProps.js`)
`VenueDressing` is a mixin like `LEDPatterns`: `createEntranceArea()` and `createBar()` run at the end of
`_buildVenue()`, after `createLights()`. Rules:
- **One draw per material.** Boxes and cylinders are collected per material by `_dressingBuilder()` and merged.
  Do not add per-bottle or per-prop meshes. The 130+ bottles are ONE vertex-coloured mesh (`barBottles`): glass tint is
  the vertex colour, labels, caps and roughness come from a 512 px atlas painted at runtime (`BarProps.paintAtlas`).
  Bottle shapes are generic and the label words descriptive; do not paint real brand names or logos.
- **Two scoped accent lights** (`entranceLight`, `barLight`) reach only their own meshes (`includedOnlyMeshes`) and take the
  first material slot through `renderPriority = 1` plus `_resyncLightSources()`, exactly like the DJ and PA accents. Anything
  added to the bar later (the bartender, the stools) joins through `_extendAccentLight()`. No light budget changes.
- **Walls**: the front wall is three boxes (`frontWall`, `frontWallRight`, `frontWallLintel`) around the doorway. The vestibule's
  street wall has a doorway too (a pier either side and a lintel; `VenueLayout.vestibule.doorHalfWidth` / `doorHeight`). Until the
  street has loaded the door is SHUT: two glass leaves, a mullion, push bars and an invisible `streetDoorBlock`
  (`this._streetDoor`). `CityDistrict._openStreetDoor()` hides the leaves and removes the block; it runs when the street
  arrives, or at the end of `createEntranceArea()` if the street got there first. A unit test with real Babylon proves the shut
  door blocks, the open one lets a person through, and the wall around it is still a wall.
- **Bartender**: the Quaternius female guest in her own container (`avatarSources[7]`, black outfit), `Idle_Talking_Loop`,
  named `bartender` (not `guest*` or `dancer*`, so no tier removes her). The guest slots keep out of the bar footprint (tested).
- **Stools**: Poly Haven *Metal Stool 03* (`ModelLoader` key `bar_stool`) placed once by the loader and instanced four more
  times by `_furnishBarStools()`; its emissive floor is lowered there because the loader's generic 0.12 reads as pale paint.
- `node scripts/build-bar-assets.mjs` regenerates `textures/barWood/` and the stool GLB from Poly Haven.
- Everything is measured on desktop SwiftShader only; the extra triangles (about 48k bottles, 33k stools, 33k bartender) are
  unmeasured on a headset.

### Bass bins under the PA
One Sketchfab *Bass Bin 3* (CC BY 4.0, darksoundlab) hangs under each flown speaker (`bass_bin_left` / `bass_bin_right` in `getModelConfigs()`).
- **Placement is derived, never hand-tuned.** `hangFrom` names the host; `_resolveHangPlacement()` hangs the bin from the host's
  measured `placed.bottomCentre` (`_fitAndPlace` returns it, so it is right for a tilted cabinet), `hangGap` below it, and faces it
  the way the host faces (yaw only: it hangs LEVEL, as a real bin on its own chains does). The bin's mouth is local +z. Bins load after
  the speakers (`loadAllModels`); a missing host throws and the bin is simply not shown.
- **Rigging**: `createBassBinHangingHardware()` draws a master link and two chains to the bin's lifting eyes as one merged mesh.
- **Lighting**: a hung model joins its host's `speakerLight_*` accent (first slot, budget unchanged). `emissiveFloor` and `albedoTint`
  are per-model config options: the generic 0.12 emissive floor turned the black carpet grey.
- **Cost**: the optimiser joins the bin's 12 meshes to 6 (one per material), so 2 bins are 12 draws, ~41k triangles, 1.6 MB shipped.
  Two invisible blocks (`_blockBassBins`) fence them. Headset cost is unmeasured.

### Mezzanine (`js/mezzanine.js`)
A steel balcony (deck at y 3.0, x -12.2..-9.5, z -19..-10.4) on the left wall with a 16-step stair climbing along that wall
from z -6.2. It reuses `_dressingBuilder()` and `_createScopedAccent()` from `venueDressing.js`, so it is four merged meshes
(`mezzDeck`, `mezzPanel`, `mezzRails`, `mezzGlowCyan`), one accent light (`balconyLight`, first slot, no budget change) and the
bar's stool GLB instanced twice. Textures are Poly Haven `steelDeck` / `steelPanel` (`textureLoader` configs, CC0).
- **Walking**: `MezzanineLayout.walkLevel()` decides the surface a walker stands on. The collision system carries the desktop
  camera UP the stair (no gravity there), so `_updateWalkSurface()` only records the level on ascent and lowers the eye on
  descent. It never snaps anyone onto the deck from beneath: a candidate surface more than 0.5 m from the current level is
  ignored. `this._walkLevel` feeds the player body's `groundY` and the `balcony` camera preset (`level`). In VR,
  `_updateVRWalkSurface()` owns the headset's height: it finds the surface under the FEET (eye minus `_xrHeadHeight()`) and
  holds the headset on it, so teleports onto the deck or a stair tread stick, smooth walking climbs the stair, and stepping
  off the edge drops to the floor. The deck mesh (`_mezzDeck`, deck plate plus every tread) is a teleport floor via
  `_teleportFloorMeshes()`. Never read `WebXRCamera.realWorldHeight` from a scene observer: it reads the XR frame and throws
  outside the frame callback; `_xrHeadHeight()` samples it inside `onXRFrameObservable`. `test/e2e/mezzanine.spec.mjs`
  teleports onto the deck, back down and onto the stair in the Quest emulator.
- The deck guest is guest slot 3 (`y: 3.0`), so only the ultra and high tiers seat it. Keep floor guests out of the
  footprint (a unit test enforces it).
- `node scripts/build-mezzanine-assets.mjs` regenerates both texture sets.

### The street (`js/cityDistrict.js`)
Out of the vestibule's street door is a night avenue: a four-lane road along x (-48..48, road `z 9.25..21.25`), a 3 m kerb
strip either side, a paved forecourt `z 0.25..6.25` in front of the club, a row of six buildings facing the club across the
road (front plane `z 24.25`) and two buildings either side of the club facing the street (front plane `z 0.25`, from `|x| 13.5`).
It is built from the CC0 Quaternius *Downtown City MegaKit (Standard)*, which is NOT in the repository.
- **One baked GLB.** `js/models/city/downtown.glb` comes from `node scripts/build-city-assets.mjs --kit "<unzipped kit>/Exports/glTF (Godot)"`
  (layout, LOD, materials and texture sizes are all in that script; recipe in ASSETS.md). Change the layout there and in
  `CITY_LAYOUT` (`js/cityDistrict.js`) together: a unit test fails if they differ. The script needs `meshoptimizer` (a dev
  dependency used offline only; the runtime still needs no decoder). Kit geometry is right-handed and Babylon's loader mirrors X,
  so the script writes kit x = -club x. Babylon makes one mesh per primitive (`far3_primitive0`), named after the node.
- **Rendering rules.** Everything is opaque (only the road paint is alpha-TESTED, `decals`); every material is held to
  `this.maxLights` and left unfrozen; tints are baked into vertex colour so a building is 4 to 6 draws (brick, trim, metal, windows,
  roof asphalt). The windows are one 1024 px atlas (three room pictures plus a black glass tile) used as an emissive map, and the
  room cards are lifted 16 cm in front of the glass so lit rooms show. Never put the kit's PNGs in the scene (78 MB).
- **Night lighting.** Two lights reach only the city (`cityMoon` directional, `cityFill` hemispheric, `renderPriority = 1`,
  `_extendAccentLight()`), exactly like the DJ and PA accents, so no club material gains a slot. Their intensities (5.5 and 3.8) and
  the windows' `emissiveIntensity` (1.7) were tuned in the real pipeline: the club's grade (ACES, contrast 1.2, vignette)
  crushes a dim scene, and values that look right in a bare Babylon viewer are four times too dark here.
- **It costs nothing indoors.** `updateCityDistrict()` (called from `_beginFrame()`) disables the whole root unless the guest is
  forward of `z -8` (hysteresis: it hides again below `-10`). It stays enabled while `_cityWarm` so `scene.whenReadyAsync()` compiles
  every material before the VR button wakes. The street loads at the END of `modelLoadPromise`, so "Preparing VR..." covers its
  parse stall; a failed load only leaves the street door shut (`createCityDistrict()` never rejects).
- **Outdoors.** `CityLayout.exteriorAmount(x, z)` (0 in the club and vestibule, 1 outside, a smoothstep through the door) is the single
  definition; audio, fog and the visibility manager all use it. `this._exterior` is its eased value; `_tintClubAir()` thins the fog to
  38% and turns it night blue. The sky (`citySky`, an `infiniteDistance` dome inside the camera's 100 m far plane) and the
  skyline (`citySkyline`, 20-odd towers and two end blocks in ONE mesh with a canvas-drawn window grid) are procedural and unlit.
- **Collision and teleport.** One invisible box per building (union of its primitives' bounds) and a fence at each end inside the
  bollards (`fenceX 45.5`) are always enabled; they are far from the club so they cost nothing indoors. The street ground, the
  vestibule floor, the club floor and the deck are the teleport floors (`_teleportFloorMeshes()`). The `street` camera preset
  and the VR menu's STREET button refuse until `_streetDoor.open`.
- **Unmeasured:** 148k triangles and 6.7 MB, about 60 draws with the whole street in view; no Quest 3S frame time yet. LOD was set by eye
  and by the simplifier's plateau (facades are thousands of separate window-frame islands, so the topological simplifier stops near 50%;
  beyond 22 m the window frames also go through the sloppy one). `test/e2e/street.spec.mjs` walks out under real collisions, checks the
  visibility toggle and measures the spectrum on the street.

## Mesh naming

Procedural meshes are found by name for cleanup, so names are load-bearing:
`leftCDJ`, `rightCDJ`, `mixer`, `sub-7`/`subGrill-7`/`mid-7` (left stack),
`sub7`/`subGrill7`/`mid7` (right stack), `speakerLED-7`, `ledLight-7`.

When a real `.glb` loads, hide the conflicting procedural geometry with `setEnabled(false)`
to avoid z-fighting.

## Audio

`<audio crossOrigin="anonymous">` → `MediaElementSource` → `AnalyserNode(fftSize=256)` →
`DynamicsCompressor` → `GainNode` → destination.

- **Web Audio is right-handed, Babylon is left-handed.** Never write a Babylon coordinate to a
  `PannerNode` or the `AudioListener` directly: use `AudioUtils.setPannerPosition()`,
  `setPannerOrientation()` and `AudioUtils.audioX()`, which mirror X. Done raw, the PA is heard
  in the opposite ear to where it appears. `test/e2e/audio-spatial.spec.mjs` plays noise through
  the real graph and fails if a speaker is louder in the wrong ear.
- `getAudioData()` averages the analyser's 128 bins as bass = bins 0–11, mid = 12–63,
  treble = 64–127. At 48 kHz and `fftSize = 256` that is roughly 0–2.2 kHz, 2.2–12 kHz and
  12–24 kHz, so "bass" also carries vocals and snare body. Bass drives onset detection
  (and so the kick pulse and bar grid) and the show's energy; treble adds a small LED-wall
  shimmer. The lasers and mirror ball follow the look and the kick pulse, not the bands.
  Re-banding needs the Show Director's energy thresholds recalibrated (see `BACKLOG.md`).
- **Occlusion and the street.** `updateSpatialAudioListener()` runs two low-pass stages in series after the PA panners
  (`occlusionFilter`, then `occlusionFilter2`). Indoors only the first works: the corridor's single pole, 700 Hz at the vestibule.
  Past the street door (`CityLayout.exteriorAmount`) both close, interpolated in log-frequency, to a bass-only 24 dB/oct
  (90 Hz down the avenue, 180 Hz at the door), the room's reverb send and early reflection and the crowd bed fade to zero, the
  sub channel (omni, 100 Hz) stays present and fades with distance from the door, and the master gets make-up gain. The analyser
  taps the source BEFORE all of this, so the light show stays full-band outside. `test/e2e/street.spec.mjs` measures the real
  spectrum: more than 90% of the energy below 250 Hz on the street, under 40% in the room.
- URLs are validated by `_isSafeAudioUrl()`: `blob:`/`https:` always allowed; `http:` only
  when the page itself is not HTTPS or the host is loopback; embedded credentials rejected.
- A stream served without `Access-Control-Allow-Origin` can produce an all-zero analyser.
  `getAudioData()` warns only after a sustained, unmuted silent window and phrases it as a
  heuristic ("silent so far; may be a server CORS restriction"), not as proof.
- **Podcasts (`js/podcasts.js`).** Two shows, chosen on the splash, in the Audio menu or on the VR
  Music page, and stored as `vrclub.podcast`: `resident` (Hernan Cattaneo, Podbean feed fetched
  straight from the browser) and `colourizon` (Miss Melera, SoundCloud). Each catalogue entry names
  its DJ (`dj: 'hernan'` / `'melera'`). `missmelera.com` hosts no audio and is not used. SoundCloud's
  feed and stream carry no CORS headers (the analyser needs `crossOrigin="anonymous"`), so
  Colourizon goes through the relay Worker's `/podcast/colourizon/{feed.xml,stream/<id>-missmelera-<slug>.mp3}`
  (`worker/src/podcast.js`: Origin allow-list, fixed upstream host, range-aware, fresh signed URL per
  request). The relay base is the multiplayer server URL converted to https
  (`podcastRelayBase()` in `js/ui-init.js`); it must be deployed for Colourizon, a self-hosted relay
  needs its own CSP `connect-src` entry, and Hernan works without it.
  `Podcasts.createPlayer(club, ...)` (stored as `club.podcastPlayer`) owns `playRandom` (entry
  default), `playLatest`, `playFrom`, `switchTo`; when an episode ends the next older one starts, a
  dead link is skipped (3 tries), and past the oldest it picks a random one. `switchTo` and every
  play call `club.setDJ(podcast.dj)`. Use own-key checks on catalogue lookups (`__proto__` bit once).
- **Entry music.** ENTER plays a RANDOM episode of the chosen podcast (`startEntryMusic()`), unless
  the guest unticked the splash toggle (`vrclub.radioOnEntry = '0'`; `AudioUtils.shouldPlayOnEntry()`).
  The AudioContext is created inside the click (autoplay), the feed lookup is the only async part, and
  a blocked `play()` retries on the next click or key. Episodes play once
  (`startAudioStream(url, { onDemand: true })` turns `loop` off). Choosing any other stream or a file
  ends the queue; everything else loops. A stream the guest chose is remembered
  (`vrclub.lastStreamUrl`) and wins; a podcast episode URL is never remembered
  (`AudioUtils.isResidentEpisodeUrl()`). The e2e harness serves a fake Resident feed
  (`routeResidentFeed()` in `test/e2e/support.mjs`); `test/e2e/podcast.spec.mjs` serves both shows with
  a Range-capable episode.
- **Seeking.** `getPlaybackInfo()`, `seekAudioTo/Fraction/By()` and `toggleAudioPlayback()` in
  `js/club/10-ui.js` are the one API (Audio menu slider `#audioSeek` and ±30 s, VR Music page). Seeks
  clamp to `duration − 1` (seeking to the very end fires `ended` and advances the queue); live streams
  (infinite duration) are not seekable; only the host publishes the position (`_shareAudioPosition`).
- The Audio menu's **Latest** button resolves the newest episode with
  `AudioUtils.parseLatestPodcastEpisode()`. The feed origins are in the CSP `connect-src` and in the
  contract test's third-party allow-list; any other feed needs both. A reconnect of a finite-duration
  source resumes at its position (`_recoverAudioStream()`).
- The Audio menu separates **Music** (the chosen stream/file only) from **Ambience** (the
  generated crowd bed). `setAudioVolume()` writes only the media element; the crowd bed has
  its own persisted `vrclub.crowdAmbience` gain, and the per-frame acoustic ducking never
  overwrites that user setting.

## Persistence

| Store | Key |
|-------|-----|
| IndexedDB `VRClubTextureCache` / `textures` | asset URL |
| IndexedDB `VRClubModelCache` / `models` | asset URL |
| `localStorage` | `vrclub.safeMode`, `vrclub.bassHaptics`, `vrclub.graphicsTier`, `vrclub.avatarStyle` (`female`/`male`), `vrclub.crowdAmbience`, `vrclub.lastStreamUrl`, `vrclub.radioOnEntry` (`'0'` = music off on entry), `vrclub.podcast` (`resident`/`colourizon`), `vrclub.networkServerUrl`, `vrclub.networkRoom`, `vrclub.networkName` |

VR comfort is persisted separately as `vrclub.vrComfort` (off for new visitors; only stored `1` enables it).
The splash and constructor use `resolveVRComfortMode()` so existing saved choices are preserved.
`setVRComfortMode()` owns locomotion through `_applyXRLocomotionMode()`. Babylon declares
MOVEMENT and TELEPORTATION **mutually exclusive** (enabling one while the other is enabled
throws), so comfort mode *swaps* features: comfort on disables MOVEMENT and (re)enables
teleportation; comfort off, in-session only, disables teleportation and enables MOVEMENT.
Never enable either feature directly, and never put controller button bindings behind the
locomotion call: a thrown `enableFeature()` once silently dropped sprint, jump and the only
Y/B quick-menu binding. Comfort mode suppresses sprint/jump. The XR camera NEVER uses camera
gravity (its collision ellipsoid hangs from the eye, so gravity sank the eye and blocked every stair);
the deck/treads reserve collision-group value `2`, excluded by the XR camera's collision mask.
Desktop collision, teleport picking and jump-ground rays still use the actual tread mesh;
XR horizontal collision still includes the rails, structure, furniture and room walls.
**The XR collider is a torso, not a person.** Babylon hangs a camera ellipsoid from the EYE, so a fixed
0.8 m radius reached the floor only at a head height of exactly 1.6 m; any lower headset (shorter
player, seated, crouched) put it through the floor and the floor mesh blocked every step. The guarded
`_updatePosition` calls `_fitVRCollisionBody()` first: radius 0.25 m, spanning 0.3 m to 1.3 m above the
FEET (never above the eye), re-hung from the sampled head height through `ellipsoidOffset`. Never
set `xrCamera.ellipsoid` to anything that scales with the eye. Likewise a crowd member's occupant
collider is its own mesh, so `_applyCrowdSize()` enables and disables it with the dancer; a leftover
collider is an invisible wall.
Height in the headset belongs to `_updateVRWalkSurface()`, and `_guardVRCameraSteps()` wraps the XR
camera's own `_updatePosition` so a smooth-locomotion step is level, at most 25 cm (frame hitches), and
collisions cannot slide it upward.
Babylon defers XR movement: both the guard and surface follower must also write
`_deferredPositionUpdate.y` when `_deferOnly && _deferredUpdated`, or the next XR frame restores
the collision lift / discards the surface correction.
Jumps and preset travel also synchronize the queued position so walking/turning cannot undo them.
`_xrMovementOptions()` swaps Babylon's default input registrations: the LEFT stick walks along the
headset heading, the RIGHT stick turns smoothly. Head pitch never adds flight.
`_xrHeadHeight()` registers before XR entry and samples the base reference space first on each XR frame;
all finite heights (including zero) are valid. No first pose means no surface correction or preset travel;
a missing pose retains the last valid height, and a new session clears it.
Walking uses the actual collidable shell, not the obsolete interior perimeter band.
Teleport blockers are derived from enabled collidable scene meshes, excluding the floor/deck walk surfaces,
and refreshed on every comfort reapplication. XR entry preserves tracked eye height.
`moveCameraToPreset()` routes to the XR camera when active,
preserving head orientation and measured seated height with a booth floor offset.
The paged quick menu includes quality, lighting, effects, show/reset, comfort, safe mode,
haptics, four destinations (entrance, dance floor, DJ booth, balcony) and a **Music** page: a seek
strip (`vrQuickMenuSeek`, click or drag a ray on it; `_beginVRSeek/_moveVRSeek/_endVRSeek` ride the
scene pointer observables, the seek happens on release), ±1 min, play/pause, the two podcasts,
random and latest. Its clock redraws from a 500 ms ticker that runs only while that page is open;
Y/B or the runtime menu component opens it, world-locked where the player is looking
(`_placeVRQuickMenu()`); never parent it to the XR camera. Haptics are opt-in for new visitors and
the same preference gates both bass pulses and UI feedback. These preference and
travel actions must not force VJ manual mode.

## UI

The DOM panel (`js/ui-init.js`) and the in-world desk (`js/club/10-ui.js`) are two surfaces
over ONE control set. All state mutation lives on `VRClub` — `cycleSpotColor()`,
`cycleMirrorBallColor()`, `applyFixtureExclusivity()`, `resetVJControls()` — and both
handlers only call those and render feedback. They previously reimplemented the same actions
and had silently diverged; a test now enforces the delegation.

`data-control` toggles are dispatched through the `TOGGLE_CONTROLS` allow-list, never by
writing `instance[attributeValue]` directly.

Global keyboard shortcuts ignore focused interactive controls and `defaultPrevented` events,
so Space still activates a focused button instead of being stolen for audio play/pause.

Photosensitive Safe Mode is offered on the splash **before** the scene renders, next to the
photosensitivity warning, and is **off by default** (a product decision: it is never switched on
automatically, not even for `prefers-reduced-motion`). Splash and constructor both call
`VRClubCore.resolvePhotosensitiveSafeMode()`: only a stored `'1'` turns it on. It must never be
reachable only after the strobes have already fired.

## Multiplayer

Optional and opt-in: nothing connects until a guest clicks **Connect** in the Multiplayer panel.

- `worker/src/index.js` — Cloudflare Worker + `ClubRoom` Durable Object relay, one object per
  room. It holds sessions, the host id and the shared music state in memory only. The file
  header documents the JSON protocol. The relay treats every client as hostile. It
  allow-lists browser `Origin`s (`ALLOWED_ORIGINS` in `wrangler.toml`; loopback and
  private-LAN origins always pass). It caps rooms at 16, drops frames over 16 KB, applies
  per-type token buckets and closes flooders. Close codes are `4003` (room full) and
  `4008` (flooding). Emoji are allow-listed and names are sanitised. Tests: `test/worker.test.mjs`.
  `worker/src/podcast.js` also serves the Colourizon podcast (see Audio); it sits behind the same Origin
  check, fetches only `feeds.soundcloud.com`, and is live on the hosted relay since 2026-10-07. A worker change
  is not live until `wrangler deploy` runs in `worker/`: when the Melera podcast fails with a "websocket upgrade"
  reply, the hosted relay is an old build.
- `js/networkClient.js` — WebSocket presence plus a WebRTC voice mesh using **perfect
  negotiation** (`negotiationneeded`; the higher id is polite). Either guest may enable the
  mic first. Muting removes tracks but keeps connections, so the guest still hears others.
  A dropped socket reports every peer through `onPeerLeave`, because the relay issues new
  ids per connection. `sendMusic()` refuses non-http(s) URLs, since a host's `blob:` is
  meaningless to guests.
- `js/avatarManager.js` — remote guests. `state.y` on the wire is the sender's **eye**
  height; the avatar root is placed `EYE_HEIGHT` below it. The first sample snaps into
  place and yaw interpolates along the shortest arc. Each remote voice is also attached to
  a muted `<audio>` element, because Chromium delivers no samples from a remote WebRTC
  stream into Web Audio otherwise. Emoji are allow-listed and rate-limited per guest.
  The first `MAX_RIGS` (4) guests are people (`AvatarRig`, see below); later ones, and any
  guest who arrives before the crowd has loaded, are a capsule + head. The capsule always
  remains as the invisible collision body.
- The host (first socket in the room) drives shared music. A guest's browser fetches the
  host's stream only after an explicit **Listen along** click, because that request
  discloses the guest's IP to an arbitrary server.

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
(title, creator, source link, licence link, change notice) must remain in `#modelCredits`, a
collapsed `<details>` disclosure in the club's bottom-left corner, and every CC BY creator must
stay named in the splash's `.splash-credits` line.

## Known technical debt

See `BACKLOG.md` for the review history and resolved acceptance criteria. The repository
now has focused VRClub source layers, a production bundle, contract tests, and runtime
tests; new debt should be recorded there with measurable acceptance criteria.
