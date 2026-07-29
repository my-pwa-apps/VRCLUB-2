# Backlog

Actionable engineering items for the VRCLUB repository.
Items are grouped by the review that produced them. Unresolved items are never removed —
they are carried forward and re-prioritised.

---

## Feature — 2026-07-29 — Hyperrealistic rendering tiers

- [x] Renderer had no way to scale visual quality to the GPU it was running on
  Priority: High
  Category: Feature / Performance
  Area: Rendering
  Affected files: `js/club_hyperrealistic.js`, `js/textureLoader.js`, `js/ui-init.js`, `index.html`
  Problem: every desktop machine got one fixed render configuration. It was simultaneously
  too heavy for weak integrated GPUs and far too timid for a discrete desktop GPU, so there
  was no headroom to add expensive realism features.
  Impact: visual fidelity capped well below what the target hardware could deliver.
  Recommended solution: add `detectGraphicsTier()` (`ultra`/`high`/`balanced`) driven by
  `WEBGL_debug_renderer_info`, `hardwareConcurrency` and `deviceMemory`, a `qualityTiers`
  config beside `vrSettings`, a `tierSettings` getter, a runtime `setGraphicsTier()` that
  persists to `localStorage`, and a `cycleGraphicsQuality` VJ button.
  Acceptance criteria: tier auto-detects; user override persists across reloads; VR is
  unaffected by the tier; `npm test` still passes.
  Estimated effort: M
  Business value: lets strong hardware look dramatically better without breaking weak hardware.
  Technical debt reduction: replaces scattered magic numbers with one tier config.

- [x] Dance floor could not reflect any moving light
  Priority: High
  Category: Feature
  Area: Rendering
  Affected files: `js/club_hyperrealistic.js`
  Problem: the polished floor's only reflection source was a `RENDER_ONCE` reflection probe,
  which captures static geometry. The spotlights, lasers, strobes and LED wall — the content
  that actually defines a club — never appeared in the floor.
  Impact: the single most important realism cue in nightclub imagery was missing.
  Recommended solution: add a feature-detected `SSRRenderingPipeline` (`_createScreenSpaceReflections()`)
  on `ultra`/`high`, using the pre-pass renderer, `useFresnel`, roughness-driven blur and the
  floor probe cube map as the miss fallback. Detach in `applyVRSettings()`, re-attach in
  `applyDesktopSettings()`, dispose in `dispose()`.
  Acceptance criteria: reflections visible on desktop; SSR never runs in VR; missing API or
  WebGL1 degrades silently.
  Estimated effort: M
  Business value: the highest-impact visual change available to this scene.
  Technical debt reduction: none (net new).

- [x] Dark gradients banded into visible contour rings
  Priority: Medium
  Category: Bug / Rendering
  Area: Post-processing
  Affected files: `js/club_hyperrealistic.js`
  Problem: the scene is almost entirely smooth falloffs into near-black, which quantise
  badly in 8-bit output.
  Impact: concentric banding around every light pool — an unmistakable CG artifact.
  Recommended solution: enable `imageProcessing.ditheringEnabled` with 1/255 intensity.
  Acceptance criteria: no banding around spotlight pools; property is feature-detected.
  Estimated effort: S
  Business value: high perceived-quality gain for near-zero cost.
  Technical debt reduction: none.

- [x] Tiling surfaces blurred to grey at shallow viewing angles
  Priority: Medium
  Category: Rendering
  Area: Textures
  Affected files: `js/textureLoader.js`, `js/club_hyperrealistic.js`
  Problem: no anisotropic filtering was set anywhere, and the floor is a 35x45 m tiled plane
  viewed from eye height — the worst case for trilinear filtering.
  Impact: the floor lost all detail a few metres out.
  Recommended solution: seed max anisotropy at texture creation and sweep the whole scene
  per tier via `_applyAnisotropicFiltering()` (16x/8x/4x, 4x in VR) so GLB-supplied textures
  are covered too.
  Acceptance criteria: floor tiling stays sharp to the far wall; VR clamps to 4x.
  Estimated effort: S
  Business value: large sharpness gain for negligible cost.
  Technical debt reduction: none.

- [x] Shadows were uniformly soft and the floor received none
  Priority: Medium
  Category: Rendering
  Area: Lighting
  Affected files: `js/club_hyperrealistic.js`
  Problem: shadow generators used uniform PCF and `floor.receiveShadows` was hard-disabled,
  so nothing appeared grounded.
  Recommended solution: `_applyShadowQuality()` enabling contact-hardening (PCSS) on
  `ultra`/`high`, tightening `shadowMinZ`/`shadowMaxZ` to the room size, and enabling
  `floor.receiveShadows` on `ultra`. Explicitly disabled again in `applyVRSettings()`.
  Acceptance criteria: contact shadows sharpen near contact points; VR keeps QUALITY_LOW PCF.
  Estimated effort: S
  Business value: objects read as standing on the floor.
  Technical debt reduction: centralises shadow config that was duplicated in two places.

- [x] SSR blanked every emissive surface, leaving the LED wall as outlines only
  Priority: Critical
  Category: Bug
  Area: Rendering
  Affected files: `js/materialFactory.js`, `js/club_hyperrealistic.js`
  Problem: `BABYLON.StandardMaterial` defaults `specularColor` to pure white, and the SSR
  pre-pass reads `specularColor` as surface reflectivity. Every self-illuminated
  `StandardMaterial` in the club (LED wall tiles, laser beams, light pools, gobos, strobes,
  neon) was therefore treated as a perfect mirror, and its emissive colour was replaced by
  a screen-space reflection that resolved to near-black. Measured at runtime: with SSR on,
  lit pixels facing the LED wall dropped from 77.2% to 28.7%. The visible symptom was an
  LED wall showing only panel outlines — that was the bloom halo surviving around each
  otherwise-black tile. Neither `useFresnel = false` nor raising `reflectivityThreshold`
  helped, because white specular reports reflectivity 1.0, far above any sane threshold.
  Impact: the flagship visual element of the club rendered as an unlit grid.
  Recommended solution: zero `specularColor` on unlit materials in
  `MaterialFactory.createStandardMaterial()` (a specular highlight on a pure emitter is
  physically meaningless), plus a `_suppressUnlitSpecular()` scene sweep for the ~20
  materials constructed directly in `club_hyperrealistic.js`, keyed on
  `disableLighting`, additive alpha mode, or a bright emissive colour.
  Acceptance criteria: lit-pixel coverage with SSR on matches the SSR-off reference
  (measured 45.8% vs 42.5% after the fix); glass bottles and other genuinely specular
  props keep their reflectivity.
  Estimated effort: S
  Business value: critical — unblocks the SSR feature entirely.
  Technical debt reduction: removes a latent wrong default that would have bitten any
  future reflectivity-based effect.

- [x] CSP blocked the WebXR controller profile fetch, and `frame-ancestors` was inert
  Priority: Medium
  Category: Bug / Security
  Area: Headers
  Affected files: `index.html`, `scripts/serve.mjs`
  Problem: two distinct CSP defects surfaced on every page load.
  (1) `connect-src` omitted `https://immersive-web.github.io`, so Babylon's
  `WebXRMotionControllerManager.UpdateProfilesList()` was blocked fetching
  `profilesList.json`. Babylon retried four times, producing four blocked requests and a
  wall of stack traces, and VR controllers fell back to generic geometry instead of the
  real Quest Touch models.
  (2) `frame-ancestors 'none'` was delivered via `<meta>`, where it is ignored per spec —
  the browser logged "The Content Security Policy directive 'frame-ancestors' is ignored
  when delivered via a `<meta>` element" on every load, and the page remained framable.
  Impact: console noise on every load, degraded VR controller rendering, and no actual
  clickjacking protection.
  Recommended solution: add `https://immersive-web.github.io` to `connect-src`; remove
  `frame-ancestors` from the meta CSP and send it as a real HTTP header from
  `scripts/serve.mjs` alongside `X-Frame-Options: DENY`.
  Acceptance criteria: zero console errors on load (verified); `curl -I` shows
  `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` (verified).
  Estimated effort: S
  Business value: clean console, working VR controller models, real framing protection.
  Technical debt reduction: removes a security control that only appeared to be applied.

- [x] Gobo projection threw `ReferenceError: physicsIntensity is not defined` every frame
  Priority: Critical
  Category: Bug
  Area: Lighting / Render loop
  Affected files: `js/club_hyperrealistic.js`
  Problem: `physicsIntensity` (Lambert cosine x inverse-square falloff) was declared `const`
  inside the light-pool block of the spotlight update. The gobo-projection block is a
  *sibling* scope, not a nested one, so its read of `physicsIntensity` was an undeclared
  identifier. The author's `(physicsIntensity || 1.0)` guard could never help: a
  ReferenceError is thrown when the identifier is resolved, before `||` is evaluated.
  Impact: with gobos and lights both enabled, `updateAnimations()` threw on every frame,
  aborting the rest of the per-frame update — all animation downstream of the spotlight
  loop stopped, and the console filled with uncaught errors.
  Recommended solution: hoist to `let physicsIntensity = 1.0;` in the per-spot scope
  alongside `beamVisible`, assign (not redeclare) it in the pool block, and drop the
  now-redundant `|| 1.0`.
  Acceptance criteria: 300 frames rendered with `lightsActive` and `goboEnabled` true and
  all 6 gobo meshes enabled, zero exceptions; gobo emissive resolves to a real computed
  value rather than the fallback (verified: 1.84 = 1.8 x 1.022).
  Estimated effort: S
  Business value: restores animation whenever gobos are used.
  Technical debt reduction: removes a latent scope error from the hot loop.

- [x] The scene contains no shadow generators at all, so all shadow work is inert
  Priority: High
  Category: Bug / Rendering
  Area: Lighting
  Affected files: `js/club_hyperrealistic.js`, `js/lightFactory.js`
  Problem: `LightFactory.createLight()` only builds a `ShadowGenerator` when passed
  `shadowGenerator: true`, and no call site anywhere in the repo passes it. Verified at
  runtime: `scene.lights.map(l => l.getShadowGenerator())` returns an empty list. The club
  therefore renders with zero real-time shadows — every object is grounded only by SSAO.
  Consequently `_applyShadowQuality()` (contact-hardening/PCSS, shadow depth-range
  tightening), the VR shadow-downgrade block in `applyVRSettings()`, and
  `floor.receiveShadows` on the `ultra` tier all currently do nothing.
  Impact: the single largest remaining realism gap. Objects read as pasted onto the floor.
  Recommended solution: enable `shadowGenerator: true` on the two or three highest-value
  casters (DJ booth key light, and one or two truss spots), add the DJ gear, speaker stacks
  and dancer meshes to their shadow render lists, and verify the frame cost on the
  `balanced` tier before enabling it there. The tier plumbing to control quality already
  exists and needs no changes.
  Acceptance criteria: `scene.lights` reports at least one shadow generator; contact
  shadows visible under the DJ booth and speaker stacks on `ultra`; VR frame time does not
  regress; shadow map count stays within the `maxLights` budget.
  Estimated effort: M
  Business value: high — completes the hyperrealism work already in place.
  Technical debt reduction: makes an existing, currently-dead code path meaningful.

- [x] Babylon CDN is a single point of failure with no fallback
  Priority: High
  Category: Reliability
  Area: Asset loading
  Affected files: `index.html`, `js/modelLoader.js`
  Problem: observed live during testing — `cdn.babylonjs.com` returned HTTP 502 for
  `loaders/babylonjs.loaders.min.js`. Because that script registers the glTF plugin, every
  `.glb` load failed with "Unable to find a plugin to load .glb files" and Babylon fell back
  to the `.babylon` JSON parser, producing a cascade of `importScene has failed JSON parse`
  errors. The DJ console, both PA speakers and all three dancer avatars silently degraded to
  procedural stand-ins.
  Impact: a third-party outage silently removes all real 3D content from the club.
  Recommended solution: self-host the three pinned Babylon scripts under `js/vendor/` (they
  are already version-pinned with SRI, so there is no drift risk), or add an `onerror`
  fallback to a second CDN. Also detect the missing glTF plugin explicitly and surface one
  clear toast instead of six parser errors.
  Acceptance criteria: models still load when `cdn.babylonjs.com` is unreachable; a single
  actionable message is shown if they cannot.
  Estimated effort: S
  Business value: high — removes a hard external dependency from first load.
  Technical debt reduction: removes an unmanaged runtime dependency.

- [x] Reflection probe resolution does not update when the graphics tier changes at runtime
  Priority: Low
  Category: Bug
  Area: Rendering
  Affected files: `js/club_hyperrealistic.js`
  Problem: `setGraphicsTier()` rebuilds the SSR and motion-blur pipelines but leaves the
  `ReflectionProbe` at whatever resolution it was constructed with, so switching to `ultra`
  does not deliver the 512px probe until the page is reloaded.
  Impact: minor, cosmetic; the probe only supplies a blurry ambient term.
  Recommended solution: dispose and re-create the probe (re-running the render-list filter)
  inside `setGraphicsTier()`, or document the reload requirement in the button tooltip.
  Acceptance criteria: probe resolution matches `tierSettings.probeResolution` after a
  runtime tier switch.
  Estimated effort: S
  Business value: low.
  Technical debt reduction: removes an inconsistency in the tier system.

---

## Feature — 2026-07-29 — "NOCTURNE" composed light show

- [x] Three independent processes drove the lighting, none locked to musical structure
  Priority: High
  Category: Feature / Design
  Area: Lighting
  Detail: The legacy 12-phase wall-clock cycler in `updateAnimations()`, VJDirector's
    energy-threshold scene machine, and `updateLEDWall()`'s private pattern timer all
    wrote the same fixture state and overwrote each other. Changes landed on wall-clock
    timers rather than bars, so nothing ever resolved on a downbeat and no cue could set
    up an expectation and then pay it off. Two writers to the same variable, with neither
    owning it, is indistinguishable from randomness at the output.
  Resolution: Added `js/showDirector.js` — 14 looks, 5 movements, 2 set-pieces, all
    structural decisions taken in `_onBar()`. The three former writers are now gated on
    `showDirector.isDriving()`. VJDirector still supplies beat, BPM and palette.
  Acceptance: 1200-beat simulation reaches all 5 movements, both set-pieces and all 13
    named looks; `COUNTDOWN` precedes every `IGNITION` entry; no NaN, no exceptions, no
    meta keys leaked onto the club instance.

- [x] Ramped look values produced `NaN` on `masterIntensity`
  Priority: Critical
  Category: Bug
  Area: Lighting
  Detail: `_applyContinuous()` read `look.intensity` directly, but a ramped look stores it
    as `[from, to]`. Arithmetic on an array yields NaN, which propagated to every fixture.
    The same loop also wrote `intensity`/`palette`/`punch` onto the club as dead properties.
  Resolution: `ShowDirector.META_KEYS` excludes the three director-owned keys from both the
    ramp loop and `_applyLook()`; `intensity` ramps are resolved explicitly.

- [x] Set-piece bridges never fired — ignition was unreachable
  Priority: High
  Category: Bug
  Area: Lighting
  Detail: The energy mix is `bass*0.6 + mid*0.3 + treble*0.1`, whose practical ceiling is
    ~0.45, but `_pickMovement()` required 0.40 to select `ignition`. The smoothed EMA never
    got there, so `countdown` and `cutToBlack` fired 0 times in 900 simulated bars.
  Resolution: Rebanded the thresholds to 0.08 / 0.16 / 0.25 / 0.34, matching VJDirector's
    own 0.35 drop threshold.

- [x] First cue of a movement was skipped whenever a set-piece handed over to it
  Priority: Medium
  Category: Bug
  Area: Lighting
  Detail: `_endSetPiece()` enters a fresh movement and resets the cue clock, but control
    fell through to the advance check, which compared the new cue against the stale
    `_cueBarsElapsed` computed earlier in the same `_onBar()` call.
  Resolution: Early `return` after `_endSetPiece()`.

---

## Review — 2026-07-28

Scope: full-repository review (architecture, code quality, performance, security,
reliability, testing, documentation, UX, accessibility, developer experience).

Items marked `[x]` were fixed during this review. Items marked `[ ]` remain open.

---

### Fixed during this review

- [x] LED wall time accumulator advanced twice per frame with the wrong multiplier
  Priority: High
  Category: Bug
  Area: Lighting / LED wall
  Affected files: js/club_hyperrealistic.js
  Problem: `this.ledTime` was incremented once at the top of `updateAnimations()` using `ledWallSpeed`, then incremented a second time later in the same frame using `spotlightSpeed`.
  Impact: Every LED wall pattern ran at roughly double the intended speed and its tempo was silently coupled to the unrelated spotlight speed slider.
  Recommended solution: Remove the second accumulator; keep a single increment driven by `ledWallSpeed`.
  Acceptance criteria: `ledTime` is advanced exactly once per frame; moving the spotlight speed slider has no effect on LED wall pattern speed.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] Animations were frame-rate dependent
  Priority: High
  Category: Bug
  Area: Render loop
  Affected files: js/club_hyperrealistic.js
  Problem: Six sites hard-coded a `0.016` second delta or a bare per-frame increment.
  Impact: On a 90 Hz or 120 Hz Quest display every effect ran 1.5–2× too fast; under thermal throttling everything ran in slow motion. The show was never the same twice.
  Recommended solution: Derive `dtScale` from `engine.getDeltaTime()`, clamp it to `[0.25, 4]`, and scale all phase/rotation steps and timer decrements by it.
  Acceptance criteria: A given effect completes one cycle in the same wall-clock time at 60, 72, 90 and 120 Hz.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium

- [x] `Material.freeze()`/`unfreeze()` called every frame
  Priority: High
  Category: Performance
  Area: Lighting / materials
  Affected files: js/club_hyperrealistic.js
  Problem: Four render-loop sites unfroze a material, mutated it, then re-froze it. Both calls invoke `markDirty()`, which iterates every mesh in the scene.
  Impact: Approximately 720 full-scene traversals per second for six fixtures at 60 fps — pure overhead on the most frame-budget-constrained target the app has.
  Recommended solution: Unfreeze once, never re-freeze materials whose properties are mutated per frame.
  Acceptance criteria: No `freeze()` or `unfreeze()` call occurs inside the render loop.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] No render-loop teardown, disposal path, or context-loss handling
  Priority: High
  Category: Reliability
  Area: Application lifecycle
  Affected files: js/club_hyperrealistic.js
  Problem: The render loop ran forever, there was no `dispose()`, no `visibilitychange` handling, and the engine was constructed with `doNotHandleContextLost: true` without an `onContextLostObservable` handler.
  Impact: A backgrounded tab kept rendering and draining a headset battery; a lost WebGL context left a permanently black canvas with no recovery.
  Recommended solution: Named render-loop callback, `visibilitychange` stop/start, a full `dispose()`, and a context-lost handler that notifies the user and reloads.
  Acceptance criteria: Hiding the tab (outside VR) stops rendering; `vrClub.dispose()` releases the engine, scene, audio context and listeners; a forced context loss shows a message and recovers.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] `init()` promise dropped from the constructor
  Priority: High
  Category: Bug
  Area: Application lifecycle
  Affected files: js/club_hyperrealistic.js
  Problem: The constructor called `this.init()` without capturing or handling the returned promise.
  Impact: Any startup failure produced an unhandled rejection and an infinite splash spinner with no error and no way to retry.
  Recommended solution: Store `this.initPromise`, attach a `.catch()` that calls `_handleFatalInitError()` to restore the splash screen with a retry affordance.
  Acceptance criteria: Forcing an exception in `init()` returns the user to a splash screen offering retry, with a visible error message.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] IndexedDB wrappers hung forever on transaction errors and broke startup on quota exhaustion
  Priority: Critical
  Category: Bug
  Area: Asset loading
  Affected files: js/assetCache.js (new), js/textureLoader.js, js/modelLoader.js
  Problem: Both hand-rolled caches handled only `request.onerror`. A `tx.onabort` (the normal outcome of a quota failure) left the promise permanently pending. `saveModel()` rejections propagated and aborted the whole load. There was no fetch timeout and no de-duplication of concurrent downloads of the same URL.
  Impact: A user with a full origin quota, or on a stalled network, saw the app hang at the loading screen with no error and no timeout. The single shared PA speaker GLB was downloaded twice on every cold start.
  Recommended solution: A shared `IndexedDBAssetCache` that wires all three failure channels, TTL-expires entries and degrades to download-every-time when storage is unavailable; `fetchWithTimeout`; `InFlightRegistry` for de-duplication.
  Acceptance criteria: Simulating a quota error still completes startup; a stalled asset request aborts after its timeout with a clear error; concurrent requests for the same URL issue one network request.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] `TextureLoader.releaseTexture()` could never match a pooled entry
  Priority: Medium
  Category: Bug
  Area: Asset loading
  Affected files: js/textureLoader.js
  Problem: The signature was `releaseTexture(url, scale = { u: 1, v: 1 })` but the pool is keyed by the config scale (6/6 for the floor, 4/2 for walls, 3/3 for the ceiling), so the default could never produce a matching key.
  Impact: Every call was a silent no-op; no texture was ever released.
  Recommended solution: Take the texture instance and reverse-look-up the pool key.
  Acceptance criteria: Releasing the last reference disposes the texture and removes it from the pool.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] `MaterialFactory` shared-material cache key was unstable
  Priority: Medium
  Category: Bug
  Area: Materials
  Affected files: js/materialFactory.js
  Problem: The key was `JSON.stringify()` of a destructured config. A colour supplied as `[1,0,0]` and the same colour as a `Color3` serialise differently, key order depended on destructuring order, and textures were excluded from the key while still permitting sharing.
  Impact: Silent cache misses created duplicate GPU materials; conversely, two materials with identical colours but different emissive maps could collide.
  Recommended solution: A `_cacheKey()` helper that sorts keys and normalises arrays/`Color3`/nested option objects; refuse to share any material carrying a texture.
  Acceptance criteria: Equivalent configs expressed differently return the same cached material; texture-bearing materials are never shared.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] `MaterialFactory` was not exported onto `window`
  Priority: Medium
  Category: Bug
  Area: Module loading
  Affected files: js/materialFactory.js
  Problem: The three sibling factory/loader files end with `window.X = X`; `materialFactory.js` did not, relying on classic-script global class hoisting.
  Impact: Fragile and inconsistent; breaks the moment the file is wrapped in an IIFE or converted to a module.
  Recommended solution: Add `window.MaterialFactory = MaterialFactory;` and assert the convention in the test suite.
  Acceptance criteria: `npm test` verifies every cross-file class is exposed on `window`.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] `LightFactory.disposeLight()`/`disposeAll()` leaked shadow generators
  Priority: Medium
  Category: Performance
  Area: Lighting
  Affected files: js/lightFactory.js
  Problem: A `ShadowGenerator` owns a `RenderTargetTexture` and is not disposed by `light.dispose()`.
  Impact: Every disposed shadow-casting light left a full shadow map resident on the GPU.
  Recommended solution: Dispose `light.getShadowGenerator()` before the light.
  Acceptance criteria: Disposing a shadow-casting light frees its render target.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Model auto-scaling was unbounded
  Priority: Medium
  Category: Bug
  Area: Asset loading
  Affected files: js/modelLoader.js
  Problem: `desiredHeight / modelHeight` was applied with no clamp.
  Impact: A degenerate or unit-less GLB (height 0.001 m) would produce a 3000× scale factor and a speaker large enough to enclose the entire room, with no diagnostic.
  Recommended solution: Clamp to `[0.01, 100]` and warn when the clamp engages.
  Acceptance criteria: A model with a pathological bounding box is clamped and logs a warning.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Blob URL leaked when GLB parsing failed
  Priority: Medium
  Category: Bug
  Area: Asset loading
  Affected files: js/modelLoader.js
  Problem: `URL.revokeObjectURL()` was called after `LoadAssetContainerAsync`, so a throw skipped it.
  Impact: Every failed model load permanently pinned the full file in memory.
  Recommended solution: Revoke in a `finally` block.
  Acceptance criteria: A deliberately corrupt GLB does not retain its blob.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] The FPS / debug overlay was permanently dead
  Priority: Medium
  Category: Bug
  Area: Diagnostics
  Affected files: js/club_hyperrealistic.js
  Problem: `setupPerformanceMonitor()` looked up `#fpsCounter`, which has never existed in `index.html`. The toggle wired in `setupUI()` therefore did nothing.
  Impact: The only in-app performance diagnostic — on a platform where frame rate is the primary quality metric — was unusable.
  Recommended solution: Create the overlay element lazily and show it only when debug mode is toggled on.
  Acceptance criteria: Toggling debug mode displays live FPS and camera coordinates.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] `showErrorMessage()` threw on rapid successive errors
  Priority: Medium
  Category: Bug
  Area: UI / error reporting
  Affected files: js/club_hyperrealistic.js
  Problem: Removal used `document.body.removeChild()`, which throws `NotFoundError` if the node was already removed; toasts also stacked at one fixed position and were invisible to assistive technology.
  Impact: An error while an error toast was displayed produced a second, different error.
  Recommended solution: A single `role="alert" aria-live="assertive"` toast host with flex stacking and `element.remove()`.
  Acceptance criteria: Firing three errors in quick succession shows three readable stacked toasts and throws nothing.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Audio URL validation allowed embedded credentials and mixed content
  Priority: High
  Category: Security
  Area: Audio
  Affected files: js/club_hyperrealistic.js
  Problem: `_isSafeAudioUrl()` accepted `http://user:pass@host/...` and accepted plain `http:` URLs on an HTTPS page.
  Impact: Credentials could be handed to a third-party host; `http:` sources were silently blocked as mixed content with no explanation to the user.
  Recommended solution: Reject URLs carrying `username`/`password`; allow `http:` only when the page is not HTTPS or the host is loopback.
  Acceptance criteria: A credential-bearing URL is rejected with a message; an `http:` URL on an HTTPS page is rejected with an explanatory message rather than failing silently.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] CORS-tainted audio streams failed silently
  Priority: High
  Category: UX
  Area: Audio
  Affected files: js/club_hyperrealistic.js
  Problem: A stream served without `Access-Control-Allow-Origin` plays normally but yields an all-zero analyser.
  Impact: Music played while every visual stopped reacting, with nothing in the console — indistinguishable from a broken app.
  Recommended solution: Detect sustained zero output while the element is playing and surface an explanatory toast.
  Acceptance criteria: Playing a known non-CORS stream produces a user-visible explanation within a few seconds.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] `Procfile` ignored `$PORT`
  Priority: High
  Category: Bug
  Area: Deployment
  Affected files: Procfile, package.json, scripts/serve.mjs
  Problem: `web: npm start` ran `http-server -p 8000`, hard-coding the port.
  Impact: Deployment to any platform that injects `$PORT` (Heroku, Render, Fly, Railway) fails its health check and the release never goes live.
  Recommended solution: A dependency-free `scripts/serve.mjs` that honours `process.env.PORT`, binds `0.0.0.0`, guards against path traversal and sets `X-Content-Type-Options: nosniff`.
  Acceptance criteria: `PORT=1234 npm run start:prod` serves the app on port 1234; `GET /../package.json` returns 400.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `package-lock.json` was gitignored
  Priority: High
  Category: Developer Experience
  Area: Build / tooling
  Affected files: .gitignore
  Problem: The lockfile was listed in `.gitignore` and was untracked.
  Impact: No reproducible installs; `npm ci` is impossible; transitive dependency versions can drift silently between machines and CI.
  Recommended solution: Stop ignoring the lockfile and commit it.
  Acceptance criteria: `package-lock.json` is tracked and `npm ci` succeeds from a clean clone.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `.github/copilot-instructions.md` documented code that does not exist
  Priority: High
  Category: Documentation
  Area: Developer experience
  Affected files: .github/copilot-instructions.md
  Problem: The file described a `js/systems/*.js` modular lighting layer (seven classes), a `this.systems.*` runtime API, and `ModelLoader.createInstance()`/`disposeInstance()`/`disposeAllInstances()` — none of which exist. Coordinates, texture sources and CDN URLs were also stale.
  Impact: Every AI agent and every new contributor was primed with a false model of the codebase, producing changes against non-existent APIs.
  Recommended solution: Rewrite against the actual code and add an explicit accuracy contract at the top.
  Acceptance criteria: Every API, path and coordinate in the document is verifiable in the source.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] Dead multiplayer wiring in the splash handler
  Priority: Low
  Category: Cleanup
  Area: UI
  Affected files: js/ui-init.js
  Problem: `#enableMultiplayer`, `#roomCodeGroup` and `#roomCode` were removed from `index.html` but their handlers and `splashConfig` fields remained behind an always-false guard.
  Impact: Misleading dead code implying a feature that no longer exists.
  Recommended solution: Remove the block and the unused config fields.
  Acceptance criteria: No JS file references a multiplayer element id.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Empty `server/` directory
  Priority: Low
  Category: Cleanup
  Area: Repository hygiene
  Affected files: server/
  Problem: An empty directory left behind by the removed multiplayer backend.
  Impact: Implies a backend that does not exist.
  Recommended solution: Delete it; assert its absence in the test suite.
  Acceptance criteria: `server/` does not exist.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] VJ UI timers and XR observers were never released
  Priority: Medium
  Category: Performance
  Area: UI
  Affected files: js/ui-init.js, js/club_hyperrealistic.js
  Problem: Two `setInterval` timers (1 s and 2 s) and two XR session observers ran for the lifetime of the page, kept the `VRClub` instance reachable, and continued polling while the tab was hidden.
  Impact: Wasted CPU and battery on a backgrounded headset; prevented garbage collection after disposal.
  Recommended solution: A `window.__vjUiTeardown` registry drained by `teardownVJUI()`, called from `VRClub.dispose()` and on `pagehide`; skip polling while `document.hidden`.
  Acceptance criteria: After `vrClub.dispose()` no VJ interval remains scheduled and both observers are removed.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] No automated verification of any kind
  Priority: Critical
  Category: Testing
  Area: Build / tooling
  Affected files: test/contract.test.mjs, package.json
  Problem: The only check was a chain of `node --check` calls. Nothing verified script load order, element-id wiring, asset existence or export conventions — all of which fail silently in a browser.
  Impact: Renaming an element id, reordering a script tag or moving an asset broke the app with zero signal until a human loaded it in a headset.
  Recommended solution: A dependency-free `node --test` contract suite covering parse, script/stylesheet existence, load-order dependencies, `window` exports, element-id wiring, `data-control` handler coverage, local asset existence, cache-token consistency, SRI/pinning, and debug-flag hygiene.
  Acceptance criteria: `npm test` passes and fails loudly when any of those contracts is broken. (Verified: the suite found four real defects on its first run.)
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] No Content Security Policy
  Priority: High
  Category: Security
  Area: Application shell
  Affected files: index.html
  Problem: The document shipped without a CSP.
  Impact: No defence-in-depth against script injection; no restriction on where scripts, styles or connections may originate.
  Recommended solution: A `Content-Security-Policy` meta with `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and a strict `script-src` (no `'unsafe-inline'`, no `'unsafe-eval'`), keeping `media-src` open because arbitrary user-supplied stream URLs are the core feature.
  Acceptance criteria: The app loads with no CSP violations in the console.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] No visible keyboard focus indicator
  Priority: High
  Category: Accessibility
  Area: CSS
  Affected files: css/styles.css
  Problem: Several rules set `outline: none` and nothing replaced the focus ring.
  Impact: WCAG 2.4.7 failure — keyboard users could not tell which control was focused anywhere in the app.
  Recommended solution: A global `:focus-visible` outline rule.
  Acceptance criteria: Tabbing through every panel shows a high-contrast focus ring.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] No `prefers-reduced-motion` support
  Priority: High
  Category: Accessibility
  Area: CSS
  Affected files: css/styles.css
  Problem: Four continuous animations ran regardless of the OS reduced-motion setting.
  Impact: WCAG 2.3.3 failure with real vestibular risk, aggravated by the head-mounted target.
  Recommended solution: A `@media (prefers-reduced-motion: reduce)` block that neutralises animations and hides the splash particles.
  Acceptance criteria: With reduced motion enabled, no looping animation runs.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Audio file input removed from the tab order
  Priority: Medium
  Category: Accessibility
  Area: CSS
  Affected files: css/styles.css
  Problem: `.audio-file-input { display: none; }` removes the element from the accessibility tree entirely.
  Impact: Keyboard and screen-reader users could not choose a local audio file.
  Recommended solution: Replace with a visually-hidden (`clip-path`) pattern and forward focus styling to the visible label.
  Acceptance criteria: The file input is reachable by keyboard and its label shows a focus ring.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Icon-only buttons had no accessible name
  Priority: Medium
  Category: Accessibility
  Area: UI
  Affected files: index.html
  Problem: Seven toggle/close buttons exposed only an emoji glyph, with `title` but no `aria-label` and no `type="button"`.
  Impact: Screen readers announced the emoji name or nothing at all.
  Recommended solution: Add `aria-label`, `type="button"`, `aria-expanded`/`aria-controls` where applicable, and wrap the glyph in `aria-hidden="true"`.
  Acceptance criteria: Every control has a meaningful accessible name.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Placeholder text below minimum contrast
  Priority: Low
  Category: Accessibility
  Area: CSS
  Affected files: css/styles.css
  Problem: Placeholders used 0.4–0.5 alpha white on dark backgrounds (~2.1:1).
  Impact: WCAG 1.4.3 failure.
  Recommended solution: Raise to 0.75 alpha.
  Acceptance criteria: Placeholder contrast is at least 4.5:1.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

---

### Open items

- [x] Decompose `updateAnimations()` into per-system update methods
  Priority: High
  Category: Refactor
  Area: Render loop
  Affected files: js/club_hyperrealistic.js
  Problem: A single method spans roughly 2,600 lines and mixes at least seven unrelated responsibilities (mirror ball, spotlights, strobes, lasers, laser sheet, VJ phasing, fog machines).
  Impact: The most performance-critical and most frequently modified code in the project is the hardest to reason about. Every one of the frame-rate and material-freezing defects found in this review lived here, and each required reading hundreds of lines of unrelated code to locate.
  Recommended solution: Extract `updateMirrorBall(ctx)`, `updateSpotlights(ctx)`, `updateStrobes(ctx)`, `updateLasers(ctx)`, `updateLaserSheet(ctx)`, `updateVJPhasing(ctx)` and `updateFogMachines(ctx)`, each taking a shared per-frame context object (`{ time, dt, dtScale, audio, beat }`). Keep them as methods on `VRClub` initially so no call sites change.
  Acceptance criteria: `updateAnimations()` is under 100 lines and contains only the context computation plus ordered delegation; visual output is unchanged.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High

- [x] Split `club_hyperrealistic.js` into modules and introduce a build step
  Priority: High
  Category: Architecture
  Area: Whole application
  Affected files: index.html, js/club_hyperrealistic.js, package.json
  Problem: One 10,400-line file with 112 methods holds scene construction, lighting, LED patterns, audio, XR and UI. Cross-file coupling relies on classic-script globals and a hand-maintained `<script>` ordering, plus a hand-synced `?v=` cache token on eight tags.
  Impact: Merge conflicts are near-certain on any parallel work; nothing can be unit tested in isolation; there is no tree-shaking, no minification and no dead-code elimination, so first-load cost is higher than necessary on a mobile-class GPU.
  Recommended solution: Convert to ES modules with explicit imports and adopt a zero-config bundler (esbuild or Vite). Do it incrementally: keep `window.*` shims during the transition so the app stays runnable at every step.
  Acceptance criteria: No file exceeds ~1,500 lines; `index.html` loads a single bundled entry point; content-hashed filenames replace the manual `?v=` token; the contract test suite still passes.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High
  Resolution 2026-07-29: split VRClub into 11 focused inheritance layers under `js/club/`;
  the largest is 1,467 lines. `club_hyperrealistic.js` is now the public-class bridge.
  `scripts/build.mjs` emits one content-hashed first-party bundle and hashed CSS with
  esbuild, and CI validates the production build.

- [x] Eliminate remaining per-frame allocations in the hot loop
  Priority: High
  Category: Performance
  Area: Render loop
  Affected files: js/club_hyperrealistic.js
  Problem: The mirror-ball raycast loop and several fixture updates still allocate: `new BABYLON.Vector3(...)` inside a `forEach`, `.add()`/`.scale()` chains that each return a new vector, and `.clone()` on `getAbsolutePosition()`.
  Impact: With 150 reflection spots this produces thousands of short-lived objects per second, causing GC pauses that read as frame hitches — the single most noticeable comfort problem in VR.
  Recommended solution: Pre-allocate scratch vectors on the instance and switch to the in-place Babylon APIs (`addToRef`, `scaleInPlace`, `copyFrom`, `getAbsolutePositionToRef`).
  Acceptance criteria: A 60-second capture in the browser profiler shows no sawtooth heap growth attributable to `updateAnimations()`.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium
  Update 2026-07-29: Done for the mirror-ball and spotlight passes (~270 allocations/frame removed). Remaining systems are tracked by "Audit the remaining `updateAnimations()` systems for per-frame allocation" in the 2026-07-29 review.

- [x] Scale spotlight pan/tilt lerp factors by `dtScale`
  Priority: Medium
  Category: Bug
  Area: Lighting
  Affected files: js/club_hyperrealistic.js
  Problem: `panLerpSpeed = 0.15` and `tiltLerpSpeed = 0.12` are applied as fixed per-frame fractions, so smoothing still depends on frame rate even after the broader `dtScale` fix.
  Impact: Moving heads track noticeably faster on a 120 Hz headset than on a 60 Hz desktop.
  Recommended solution: Use a frame-rate independent form such as `1 - Math.pow(1 - rate, dtScale)`.
  Acceptance criteria: Spotlight settling time is identical at 60 and 120 Hz.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Remove duplicated strobe burst-phase computation
  Priority: Low
  Category: Refactor
  Area: Lighting
  Affected files: js/club_hyperrealistic.js
  Problem: The strobe burst phase is computed twice per frame from the same inputs.
  Impact: Wasted work and a latent divergence risk if only one copy is edited.
  Recommended solution: Compute once into the per-frame context and reuse.
  Acceptance criteria: The expression appears once.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Consolidate the duplicated audio-stream UI
  Priority: Medium
  Category: Refactor
  Area: Audio / UI
  Affected files: index.html, js/club_hyperrealistic.js, js/ui-init.js
  Problem: Two independent stream-URL controls exist — `#musicUrl` + `#playMusicBtn` in the settings panel (wired in `club_hyperrealistic.js` `setupUI()`) and `#streamUrl` + `#playStreamBtn` in the audio menu (wired in `ui-init.js`).
  Impact: Two code paths for one user intent, in two different files, that can drift apart. The status feedback differs between them, which is genuinely confusing.
  Recommended solution: Keep the audio menu as the single entry point; remove the settings-panel duplicate and its wiring.
  Acceptance criteria: Exactly one stream-URL control exists and one code path handles it.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Extract shared playback logic from `startAudioStream()` and `startAudioFromFile()`
  Priority: Low
  Category: Refactor
  Area: Audio
  Affected files: js/club_hyperrealistic.js
  Problem: The two methods duplicate context creation, source connection, error handling and status updates; only the source differs.
  Impact: Fixes applied to one path (as happened with the URL-validation hardening) can miss the other.
  Recommended solution: Extract `_playAudio(src, kind)` and reduce both public methods to validation plus delegation.
  Acceptance criteria: Both entry points share one implementation.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Add runtime tests for the pure logic layer
  Priority: High
  Category: Testing
  Area: Test suite
  Affected files: test/
  Problem: The new suite verifies static contracts only. Nothing exercises behaviour — BPM detection, the scene state machine, URL validation, or the cache's error paths.
  Impact: The most algorithmically subtle code in the project (`vjDirector.js`) has no regression safety net at all.
  Recommended solution: Extract the pure functions (spectral flux, IOI/BPM snapping, `_isSafeAudioUrl`) so they are importable without a DOM, and unit test them with `node --test`. Add `fake-indexeddb`-style stubs to cover `IndexedDBAssetCache` quota and abort paths.
  Acceptance criteria: BPM detection is asserted against synthetic onset sequences; `_isSafeAudioUrl` has a table-driven test including credential and mixed-content cases.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: High

- [x] Add CI
  Priority: High
  Category: Developer Experience
  Area: Build / tooling
  Affected files: .github/workflows/
  Problem: There is no CI pipeline; `npm run check` and `npm test` only run if a contributor remembers.
  Impact: The contract suite delivers value only when it is enforced.
  Recommended solution: A GitHub Actions workflow on push and pull request running `npm ci`, `npm run check`, `npm test` and (once added) `npm run lint`.
  Acceptance criteria: A pull request that breaks script load order fails CI.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] Add ESLint with a flat config
  Priority: Medium
  Category: Developer Experience
  Area: Build / tooling
  Affected files: eslint.config.mjs, package.json
  Problem: No linting. `node --check` catches syntax errors only.
  Impact: Unused variables, shadowed globals, accidental implicit globals and typo'd property names all pass unnoticed — this review found several unused constants by hand.
  Recommended solution: `eslint.config.mjs` with browser globals, `no-unused-vars`, `no-undef`, and an allowance for the intentional `window.*` exports.
  Acceptance criteria: `npm run lint` passes with zero errors.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Automate the cache-busting token bump
  Priority: Medium
  Category: Developer Experience
  Area: Build / tooling
  Affected files: index.html, scripts/
  Problem: The `?v=` token is repeated on eight tags and must be edited by hand in lockstep.
  Impact: A partial bump ships a mix of cached and fresh files — the hardest class of bug to reproduce, because it depends on the visitor's cache state.
  Recommended solution: A `scripts/bump-version.mjs` invoked by `npm run version:bump` that rewrites every token; longer term, content hashing from the bundler removes the need entirely.
  Acceptance criteria: One command updates all tokens and `npm test` confirms consistency.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Decide the fate of `backup_aframe/`
  Priority: Low
  Category: Cleanup
  Area: Repository hygiene
  Affected files: backup_aframe/
  Problem: 1,280 lines of a superseded A-Frame 1.5.0 implementation are still tracked.
  Impact: Inflates the repository, confuses search results, and invites accidental edits. Its history is already preserved in git, so the working tree copy adds nothing.
  Recommended solution: Delete it and note the last commit that contained it in the README. **Requires owner confirmation before deletion.**
  Acceptance criteria: Owner has decided; the directory is either removed or documented as intentionally retained.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Add keyboard dismissal and focus management to the overlay panels
  Priority: Medium
  Category: Accessibility
  Area: UI
  Affected files: index.html, js/ui-init.js, css/styles.css
  Problem: The VJ, audio and settings panels can only be closed by clicking their close button. Opening a panel does not move focus into it, and closing it does not return focus to the trigger.
  Impact: Keyboard users can open a panel and then have to tab through the entire document to reach or leave it; there is no Escape affordance, which every user expects.
  Recommended solution: Close on Escape, move focus to the panel heading on open, restore focus to the toggle on close, and keep `aria-expanded` in sync.
  Acceptance criteria: Each panel opens, is operable and closes entirely from the keyboard, with focus returning to its trigger.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Low

- [x] Add a `<main>` landmark and a document heading structure
  Priority: Low
  Category: Accessibility
  Area: UI
  Affected files: index.html
  Problem: The document has no landmark regions and no heading hierarchy.
  Impact: Screen-reader users cannot navigate by landmark or heading.
  Recommended solution: Wrap the canvas and overlays in `<main>`, give each panel an `<h2>` and reference it with `aria-labelledby`.
  Acceptance criteria: An accessibility audit reports a valid landmark and heading structure.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Reconcile the audio URL `pattern` attribute with `blob:` support
  Priority: Low
  Category: Bug
  Area: Audio / UI
  Affected files: index.html
  Problem: The stream input declares `pattern="https?://.*"` while the JS validator also accepts `blob:` URLs.
  Impact: The two layers disagree; native form validation can reject an input the application would accept.
  Recommended solution: Widen or remove the `pattern` and rely on `_isSafeAudioUrl()` as the single source of truth, surfacing its message via `setCustomValidity()`.
  Acceptance criteria: One validation rule governs the field.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Add a CHANGELOG and adopt real versioning
  Priority: Low
  Category: Documentation
  Area: Repository hygiene
  Affected files: CHANGELOG.md, package.json
  Problem: `version` has been `1.0.0` throughout; there is no changelog.
  Impact: No way to correlate a deployed build with a set of changes when a user reports a regression.
  Recommended solution: Adopt semantic versioning and a Keep a Changelog file, bumped as part of the release step.
  Acceptance criteria: Each release has a version bump and a changelog entry.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Expand the README
  Priority: Medium
  Category: Documentation
  Area: Onboarding
  Affected files: README.md
  Problem: 51 lines, ending mid-sentence at "Recommended manual smoke test before publishing:". No architecture overview, no Quest testing instructions, no troubleshooting, no contribution guidance.
  Impact: A new contributor has to reverse-engineer the load-order contract and the VR constraints from source.
  Recommended solution: Document the architecture and load-order contract, how to test on a Quest over LAN, the light-count and opacity constraints, the commands, and how to run the contract suite. Finish the truncated smoke-test list.
  Acceptance criteria: A new contributor can go from clone to a running headset session using the README alone.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Consolidate the `docs/` folder
  Priority: Low
  Category: Documentation
  Area: Repository hygiene
  Affected files: docs/
  Problem: Ten historical markdown files (~52 KB), several of which are dated point-in-time fix write-ups referencing line numbers that have long since shifted.
  Impact: Readers cannot tell which documents are current, so all of them lose credibility.
  Recommended solution: Merge the still-relevant material into the README and the agent instructions; move the rest under `docs/history/` with a header stating it is archival.
  Acceptance criteria: Every file in `docs/` is either current or explicitly marked archival.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Fix the `ModelLoader` `maxLights` fallback
  Priority: Low
  Category: Bug
  Area: Asset loading
  Affected files: js/modelLoader.js
  Problem: When no `materialFactory` is supplied the loader falls back to a hard-coded `3`.
  Impact: Silently under-lights loaded models relative to the rest of the scene (which uses 4 or 6).
  Recommended solution: Accept the detected `maxLights` as an explicit constructor parameter with a device-appropriate default.
  Acceptance criteria: Loaded model materials use the same limit as procedurally created ones.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Remove remaining dead code markers
  Priority: Low
  Category: Cleanup
  Area: Whole application
  Affected files: js/club_hyperrealistic.js, js/textureLoader.js, js/modelLoader.js
  Problem: Commented-out `// LASER SHEET DISABLED` assignments, a `void metallicPath;` statement, a hard-coded `const ceilingY = 8.0;` that duplicates `ROOM_BOUNDS`, and a now-unused `TEX_DEBUG` constant.
  Impact: Each is a small false signal about what the code does.
  Recommended solution: Delete them; source the ceiling height from `ROOM_BOUNDS`.
  Acceptance criteria: ESLint reports no unused variables and no commented-out code remains at these sites.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Add a Subresource Integrity check to CI
  Priority: Low
  Category: Security
  Area: Build / tooling
  Affected files: .github/workflows/
  Problem: The SRI hashes in `index.html` are verified by the browser at runtime but never re-verified against the CDN in CI.
  Impact: A stale or mistyped hash blocks the Babylon runtime and produces a blank page in production, discovered only by a user.
  Recommended solution: A CI step that fetches each pinned CDN URL and asserts the computed hash matches the `integrity` attribute.
  Acceptance criteria: CI fails if any SRI hash is wrong.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

---

## Review — 2026-07-29 — Full-repository engineering review

Scope: product, architecture, code quality, performance, security, reliability, testing,
maintainability and UX. Findings were verified against source before being actioned —
several automated findings proved false and are recorded at the end so they are not
re-raised.

### Fixed during this review

- [x] Splash screen hid on a fixed timer while the scene was still loading
  Priority: Critical
  Category: Bug / UX
  Area: Startup
  Affected files: js/ui-init.js
  Problem: The ENTER CLUB handler hid the splash with `setTimeout(..., 1000)`, entirely decoupled from `init()`. Measured on a warm local server, `ready` became true at ~35 s, so the user was shown a black canvas for over 30 seconds with no feedback. The timer also raced `_handleFatalInitError()`, which re-shows the splash with a RETRY button — the timer hid the retry UI again, so a fatal startup error left a permanently black page.
  Impact: The single worst defect in the product. First-run users had no way to distinguish "still loading ~120 MB of avatar GLBs" from "broken", and users hitting an init failure lost the only recovery affordance.
  Recommended solution: Await `window.vrClub.initPromise`; hide the splash on resolve, leave the retry UI alone on reject, and cap the wait so a wedged init cannot trap the user.
  Acceptance criteria: Splash remains visible with the loading indicator until `ready === true`; a rejected `initPromise` leaves the RETRY splash on screen.
  Verified: Browser run held the splash for the full ~35 s load, then hid it cleanly (`splashDisplay: none`, `loadingVisible: false`, `ready: true`, zero page errors).
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] Global `dragover`/`drop`/`keydown` listeners could never be removed
  Priority: High
  Category: Bug
  Area: Lifecycle
  Affected files: js/club_hyperrealistic.js
  Problem: Three listeners were registered on `window`/`document` with inline arrow functions. `dispose()` could not remove them, and each closure retained the `VRClub` instance — and with it the entire scene graph, the WebGL context and every loaded GLB.
  Impact: `dispose()` silently failed to free the largest allocation in the app. Any future navigation or re-init would leak a full scene.
  Recommended solution: Store handlers as `this._onWindowDragOver` / `this._onWindowDrop` / `this._onKeyDown` and remove them in `dispose()`.
  Acceptance criteria: Every global listener is removed in `dispose()`; enforced by a contract test.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: High

- [x] Debug overlay toggled while typing in the stream-URL field
  Priority: Medium
  Category: Bug / UX
  Area: Input handling
  Affected files: js/club_hyperrealistic.js
  Problem: The `keydown` handler fired on any `d`/`D` with no check of the event target, so typing or pasting any stream URL containing the letter "d" silently toggled the debug overlay — and did so once per occurrence.
  Impact: Confusing, apparently random UI behaviour during the most common user task.
  Recommended solution: Ignore the event when the target is an input/textarea/select/contenteditable, or when a modifier key is held.
  Acceptance criteria: Typing in any text field never changes scene state.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Native `alert()` used for user-facing errors
  Priority: High
  Category: UX
  Area: Error reporting
  Affected files: js/club_hyperrealistic.js
  Problem: Three `alert()` calls (VR unavailable, and two audio failures). A native dialog blocks the render loop, cannot be styled, and in a headset renders as a flat 2D browser panel floating over the scene.
  Impact: Breaks presence in VR and, on some runtimes, is awkward to dismiss without leaving XR. The app already had a toast (`showErrorMessage`) that these sites bypassed.
  Recommended solution: Route all three through `showErrorMessage()`, and focus the relevant input on validation failure.
  Acceptance criteria: No `alert`/`confirm`/`prompt` in first-party JS; enforced by a contract test.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `currentSpotColor` aliased the shared palette instead of copying it
  Priority: High
  Category: Bug
  Area: Lighting
  Affected files: js/club_hyperrealistic.js
  Problem: Three initialisation sites assigned `this.currentSpotColor = spotColors[0]`, making the live, mutated colour the same object as entry 0 of the shared palette.
  Impact: A latent landmine of exactly the class that previously corrupted `cachedColors`. Any future in-place write to `currentSpotColor` would permanently corrupt the palette for every consumer, including VJDirector and ShowDirector, with no obvious cause.
  Recommended solution: Instance-owned `Color3` buffers initialised with `copyFrom`.
  Acceptance criteria: The palette array is never reachable through a mutable fixture property.
  Verified: Live probe confirmed the palette remained pristine through a full colour transition.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: High

- [x] Roughly 270 `Color3`/`Vector3` allocations per frame in the spotlight and mirror-ball passes
  Priority: High
  Category: Performance
  Area: Render loop
  Affected files: js/club_hyperrealistic.js
  Problem: The spotlight pass allocated six new `Color3`s per fixture per frame via `.scale()`/`.clone()`; the mirror-ball pass allocated per ray (40) and per reflection spot (100) via `new Vector3`, `.add()`, `.scale()`, `Vector3.Cross()` and `Quaternion.RotationAxis()`.
  Impact: Thousands of short-lived objects per second. GC pauses read as frame hitches, which is the most noticeable comfort problem in VR.
  Recommended solution: Pre-allocated per-fixture buffers plus the in-place Babylon APIs (`scaleToRef`, `copyFrom`, `addInPlace`, `CrossToRef`, `RotationAxisToRef`) and four new `vecPool` entries.
  Acceptance criteria: No allocation inside the per-fixture or per-ray loops.
  Note: This completes the 2026-07-28 open item "Eliminate remaining per-frame allocations in the hot loop" for the mirror-ball and spotlight systems. Other systems in `updateAnimations()` have not been audited to the same depth — see the open item below.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium

- [x] Unclamped `Math.acos(Vector3.Dot(...))` could produce NaN geometry
  Priority: Medium
  Category: Bug
  Area: Mirror ball
  Affected files: js/club_hyperrealistic.js
  Problem: The mirror-ball ray orientation computed `Math.acos(Vector3.Dot(up, dir))` on normalised vectors. Floating-point error can push the dot product marginally outside [-1, 1], making `acos` return NaN.
  Impact: A NaN rotation angle yields a NaN quaternion and the ray mesh disappears for the rest of the session, with no error logged.
  Recommended solution: Clamp the dot product before `acos`.
  Acceptance criteria: A NaN sweep over all ray transforms returns zero.
  Verified: `nanCount: 0` across 40 rays and 100 spots in a live probe.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] 100 full-scene raycasts every frame in VR, justified by an incorrect premise
  Priority: High
  Category: Performance
  Area: Mirror ball
  Affected files: js/club_hyperrealistic.js
  Problem: Reflection spots were throttled to every third frame on desktop but ran every frame in VR. The inline comment justified this with "frame-skipping in VR causes different states per eye = epileptic effect". That is factually wrong: Babylon renders both eyes from a single scene state within one `render()` call, so a skipped update is skipped for both eyes and they cannot disagree.
  Impact: 100 `pickWithRay` calls per frame at 72 Hz is 7,200 full-scene raycasts per second on the weakest target platform, for no benefit. An incorrect comment also actively deterred anyone from fixing it.
  Recommended solution: Throttle to every second frame in VR (halving the cost) and replace the comment with the correct explanation. Motion is lerp-smoothed, so the change is imperceptible.
  Acceptance criteria: VR raycast rate is at most ~3,600/s; reflection spots still track smoothly.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `getAudioData()` ran twice per frame and halved the CORS-silence threshold
  Priority: Medium
  Category: Bug / Performance
  Area: Audio
  Affected files: js/club_hyperrealistic.js
  Problem: `updateAnimations()` and `updateDancingNPCs()` each called `getAudioData()`, so every frame performed two `getByteFrequencyData()` reads plus six passes over the FFT bins. Worse, the duplicate call double-incremented `_silentAnalyserFrames`, so the heuristic meant to detect a CORS-blocked silent stream after ~180 frames (~3 s) fired after ~1.5 s.
  Impact: Wasted per-frame work, and a user-visible warning toast that could fire spuriously on a stream that was merely quiet at startup.
  Recommended solution: Compute once per frame and thread the value into `updateDancingNPCs(time, audioData)`, keeping a self-call fallback for other callers.
  Acceptance criteria: One `getByteFrequencyData()` per frame; the silence heuristic fires at its intended ~3 s.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Dead — and incorrect — spotlight colour-drift block
  Priority: Medium
  Category: Cleanup / Bug
  Area: Lighting
  Affected files: js/club_hyperrealistic.js
  Problem: A block in the spotlight micro-dynamics loop cumulatively incremented `spot.light.diffuse` channels during the `euphoria` and `tension` phases. It was dead — `diffuse` is unconditionally reassigned later in the same frame — and also wrong: it mutated in place with no restore path, so had it ever taken effect, a few seconds of `euphoria` would have saturated every spotlight to white permanently.
  Impact: A correctness trap waiting for anyone who reordered the loop.
  Recommended solution: Delete it and document why in place.
  Acceptance criteria: No cumulative unbounded mutation of any light colour.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] Untracked global click listener in the settings panel
  Priority: Medium
  Category: Bug
  Area: Lifecycle
  Affected files: js/ui-init.js
  Problem: `initSettingsPanel()` registered a `document` click listener with an inline literal, so it was invisible to the existing `teardownVJUI()` mechanism.
  Impact: Leaked past teardown and kept panel DOM references alive.
  Recommended solution: Named handler enrolled in the shared `window.__vjUiTeardown` list.
  Acceptance criteria: Enforced by the new removable-listener contract test.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] No HSTS header from the production server
  Priority: Medium
  Category: Security
  Area: Hosting
  Affected files: scripts/serve.mjs
  Problem: `scripts/serve.mjs` set a good baseline (CSP, `X-Content-Type-Options`, frame options, referrer policy) but no `Strict-Transport-Security`.
  Impact: A first or post-expiry request over plain HTTP is downgradeable by a network attacker, who could then serve modified JS.
  Recommended solution: Emit `max-age=31536000; includeSubDomains` only when the request is genuinely HTTPS — either a TLS socket or `X-Forwarded-Proto: https` from the platform's edge. Sending it over plain HTTP is ignored by browsers and would break local development.
  Acceptance criteria: HSTS present on HTTPS responses, absent on `http://localhost`.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] README documented an architecture that no longer existed
  Priority: Medium
  Category: Documentation
  Area: Onboarding
  Affected files: README.md
  Problem: The Project Layout omitted `js/assetCache.js` and `js/showDirector.js` — the shared caching layer and the cue engine that owns all fixture state whenever the show is driving. The Quality Checks section never mentioned `npm test`, the repository's only automated safety net.
  Impact: A new contributor could not learn from the README that a test suite exists, nor that the file order in `index.html` is a hard contract.
  Recommended solution: Rewrite both sections; state the load-order contract explicitly and enumerate what `npm test` protects.
  Acceptance criteria: Every first-party script is named in the README; enforced by a contract test.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Dead commented-out bootstrap block with a misleading comment
  Priority: Low
  Category: Cleanup
  Area: Startup
  Affected files: js/club_hyperrealistic.js
  Problem: A commented-out `DOMContentLoaded` initialiser at end of file, whose comment claimed initialisation happens "in index.html". It actually happens in `js/ui-init.js`.
  Impact: Sends a reader to the wrong file when tracing startup.
  Recommended solution: Replace with an accurate note explaining that construction is deliberately deferred behind the ENTER CLUB gesture because WebGL, `AudioContext` and large GLB downloads are all user-gesture gated.
  Acceptance criteria: No commented-out executable code at this site.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] Four new contract tests to prevent regression of the above
  Priority: High
  Category: Testing
  Area: Build / tooling
  Affected files: test/contract.test.mjs
  Problem: Every defect fixed above was reintroducible with no signal, because the suite only checked wiring and asset existence, not code hygiene.
  Impact: Fixes with no test decay.
  Recommended solution: Add tests for (1) no native dialogs, (2) global listeners registered with a removable reference, (3) every instance-stored listener removed in `dispose()`, (4) README names every first-party script. Suite grew 13 → 17.
  Acceptance criteria: Each test fails if its defect is reintroduced. Verified — tests 2 and 4 caught two live pre-existing defects on first run.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: High

### Open items

- [x] Extract the ~45 LED wall pattern methods into a dedicated module
  Priority: High
  Category: Refactor
  Area: LED wall
  Affected files: js/club_hyperrealistic.js, js/ledPatterns.js, index.html, test/contract.test.mjs, README.md
  Problem: Roughly 45 `pattern*(color, time, audioData)` methods span about 1,180 contiguous lines. They share one uniform signature, touch only the LED pixel buffer, and have no other coupling to `VRClub`.
  Impact: This is over 10% of the monolith and the most mechanically separable part of it. Its presence inflates the file that every contributor must load to change anything.
  Recommended solution: Move to `js/ledPatterns.js` as a lookup table of pure functions `(ctx, color, time, audioData)`. This is the lowest-risk first slice of the larger decomposition and can land before any bundler work.
  Acceptance criteria: `club_hyperrealistic.js` drops by ~1,100 lines; the pattern registry is data, not a switch; contract tests pass with the new script inserted in load order.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: High

- [x] No runtime tests of any kind
  Priority: High
  Category: Testing
  Area: Whole application
  Affected files: test/
  Problem: All 17 tests are static — they parse files and grep source. Nothing ever constructs a class, calls a method, or asserts a computed value. Pure, dependency-free logic that is entirely untested includes `_isSafeAudioUrl()` (a security boundary), `MaterialFactory._cacheKey()`, `InFlightRegistry.run()`, ShowDirector ramp resolution and movement selection, and VJDirector BPM estimation.
  Impact: The security-relevant URL validator has no test proving it rejects `javascript:`, embedded credentials or mixed content. A regression there is a real vulnerability, not a cosmetic bug.
  Recommended solution: Add `test/unit.test.mjs`. These modules need no DOM; where they touch `BABYLON`, a ten-line `Color3`/`Vector3` stub suffices. Start with `_isSafeAudioUrl()` and `_cacheKey()`.
  Acceptance criteria: Every branch of `_isSafeAudioUrl()` is covered by an assertion.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] No progress feedback during a ~35-second cold start
  Priority: High
  Category: UX
  Area: Startup
  Affected files: js/ui-init.js, js/club_hyperrealistic.js, css/styles.css
  Problem: With the splash-timer defect fixed, the splash now correctly stays up until the scene is ready — but it shows only a static "Loading club experience…" for the whole duration. Cold start is dominated by ~120 MB of avatar GLBs.
  Impact: A 35-second wait with no moving indicator still reads as a hang to many users; on a headset over Wi-Fi it will be longer.
  Recommended solution: Have `init()` publish coarse stage progress (textures / models / avatars / lighting) via a callback or observable, and render a determinate bar plus the current stage. Separately, evaluate whether the avatar GLBs can be compressed (Draco/meshopt) or loaded lazily after first render.
  Acceptance criteria: The splash shows a monotonically advancing indicator and a stage label throughout the load.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] Avatar GLB payload is roughly 120 MB
  Priority: High
  Category: Performance
  Area: Assets
  Affected files: js/models/avatars/, js/modelLoader.js
  Problem: The crowd and DJ models dominate first-load bytes and are served uncompressed.
  Impact: Directly causes the long cold start above, and on a metered or slow connection may prevent entry entirely. IndexedDB caching helps only on repeat visits.
  Recommended solution: Apply Draco or meshopt compression and texture-compress to KTX2/Basis; consider loading the crowd after the first rendered frame so the user is inside the club while it streams in.
  Acceptance criteria: Avatar payload reduced by at least 60%; first interactive frame no later than 10 s on a warm cache.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] Audit the remaining `updateAnimations()` systems for per-frame allocation
  Priority: Medium
  Category: Performance
  Area: Render loop
  Affected files: js/club_hyperrealistic.js
  Problem: The mirror-ball and spotlight passes were converted to in-place maths in this review. The strobe, laser, laser-sheet, fog and LED passes were not audited to the same depth.
  Impact: Residual GC pressure in VR, the platform least able to absorb it.
  Recommended solution: Profile a 60-second capture, then apply the same buffer-plus-`*ToRef` pattern to whichever passes still allocate.
  Acceptance criteria: No sawtooth heap growth attributable to `updateAnimations()`.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Medium

- [x] Scene weight: 1,003 meshes, 609 active, 495 materials
  Priority: Medium
  Category: Performance
  Area: Scene construction
  Affected files: js/club_hyperrealistic.js, js/materialFactory.js
  Problem: 609 active meshes implies a high draw-call count before any post-processing. 495 materials suggests the sharing in `MaterialFactory` is not reaching everything — notably materials arriving inside loaded GLBs, which `instantiateModelsToScene(cloneMaterials: false)` keeps out of `scene.materials` sweeps.
  Impact: Draw calls and material-state changes are the most likely ceiling on Quest frame rate. This is measurable headroom that has not been measured.
  Recommended solution: Instrument draw calls per frame; extend merging beyond pillars and bricks to other static geometry; audit which materials are genuinely unique and widen sharing.
  Acceptance criteria: A documented draw-call baseline plus a measured reduction on the Quest target.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Low

- [x] Crowd size is fixed at load and ignores runtime tier changes
  Priority: Medium
  Category: Bug
  Area: Graphics tiers
  Affected files: js/club_hyperrealistic.js
  Problem: `setGraphicsTier()` rebuilds the tier-owned pipelines, but the crowd is populated once during `init()` from the tier active at that moment. Downgrading to `balanced` on a struggling machine leaves the full `high`-tier crowd in the scene.
  Impact: The most direct lever a user has for recovering frame rate does not affect one of the heaviest costs, so the quality control under-delivers exactly when it matters.
  Recommended solution: Either rebuild the crowd on tier change, or pre-create the maximum count and toggle `setEnabled()` on the surplus (cheaper, no reload).
  Acceptance criteria: Switching to `balanced` at runtime measurably reduces active mesh count.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Harden `scripts/serve.mjs` against symlink escape
  Priority: Low
  Category: Security
  Area: Hosting
  Affected files: scripts/serve.mjs
  Problem: `resolveSafe()` correctly decodes percent-encoding, rejects NUL bytes, normalises and prefix-checks against the document root — path traversal via `..` is blocked. It does not resolve symlinks, so a symlink inside the root pointing outside it would still be served.
  Impact: Theoretical today (the repository contains no symlinks) but the server is the production entry point via `Procfile`, and a future asset pipeline could introduce one.
  Recommended solution: `fs.realpath` the resolved path and re-assert the root prefix before streaming.
  Acceptance criteria: A symlink inside the root pointing outside it returns 404.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] No CI, no release process, no CHANGELOG
  Priority: Medium
  Category: Process
  Area: Build / tooling
  Affected files: .github/workflows/, package.json
  Problem: `npm run check` and `npm test` exist and are fast, but nothing runs them automatically. There is no version tagging, no changelog, and the deployable artefact is the working tree.
  Impact: The safety net only works when a contributor remembers to use it — and this review found two defects that the tests catch, proving they had not been run against those changes. There is also no way to identify which build a user is running when they report a bug.
  Recommended solution: A GitHub Actions workflow running `npm run check` and `npm test` on push and PR. Adopt a version in `package.json` surfaced in the debug overlay, and keep a `CHANGELOG.md`.
  Acceptance criteria: CI is required to pass before merge; the running build version is visible in-app.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `docs/` has grown to 11 overlapping, partly historical files
  Priority: Low
  Category: Documentation
  Area: Onboarding
  Affected files: docs/
  Problem: Files such as `OPTIMIZATION_PHASE_COMPLETE.md` and `OPTIMIZATION_IMPLEMENTATION.md` are point-in-time status reports, not reference material, and several overlap with `.github/copilot-instructions.md` — which is the only document with an explicit accuracy contract.
  Impact: A reader cannot tell which document is current. Historical status files age into misinformation, which is worse than no document.
  Recommended solution: Split into `docs/reference/` (current, maintained) and `docs/history/` (explicitly archival, with a banner). Fold anything normative into `copilot-instructions.md`.
  Acceptance criteria: Every file in `docs/` is either maintained reference or clearly labelled archival.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] `npm run serve` is undocumented drift
  Priority: Low
  Category: Cleanup
  Area: Build / tooling
  Affected files: package.json, README.md
  Problem: `package.json` defines a `serve` script using `python -m http.server`, which is mentioned nowhere and duplicates `npm start`.
  Impact: A contributor may run it and get subtly different MIME handling and no cache-control headers, then debug a caching problem that does not exist under the supported servers.
  Recommended solution: Remove it, or document precisely when it is preferable.
  Acceptance criteria: Every script in `package.json` is documented in the README.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Low

- [x] `backup_aframe/` remains tracked in the repository
  Priority: Low
  Category: Cleanup
  Area: Repository
  Affected files: backup_aframe/
  Problem: A superseded A-Frame implementation is still tracked. Its history is already in git.
  Impact: Inflates clone size and search results, and every contributor must learn that an entire top-level directory is off-limits.
  Recommended solution: Delete it and tag the last commit that contained it.
  Acceptance criteria: The directory is gone and the tag is documented in the README.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

### Verified false — do not re-raise

- `getMeshByName` in the audio path is **not** unguarded. `_subGrillRefs` is populated once behind `if (!this._subGrillRefs)`. An automated scan rated this Critical; reading the source disproved it.
- `Cross-Origin-Embedder-Policy: require-corp` must **not** be added to `scripts/serve.mjs`. `cdn.babylonjs.com` sends no `Cross-Origin-Resource-Policy`, so COEP would block the pinned Babylon bundles and produce a blank page. The build uses no `SharedArrayBuffer` and no threaded WASM, so it buys nothing. The reasoning is now recorded in the file.
- Crowd bounding-box "clashes" with `mergedPillars`, `mergedBricks`, `goboProjection*` and `djPlatform` are artefacts of AABB testing against merged meshes and light-projection geometry. Actual pillar positions are `x = ±12.5`; all dancers are within `|x| ≤ 7.4`.
- Absolute FPS measured in the headless automation browser (12–14) is a property of software rendering, not a regression signal. A/B measurement showed the crowd costs ~2 FPS there.
