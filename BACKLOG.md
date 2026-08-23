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

---

## Review — 2026-08-17 — Comprehensive Architecture, Quality, Reliability, Performance & Maintainability Review

Scope: full-repository review as Principal Software Engineer, Principal Quality Engineer, Software Architect, Product Engineer, Security Engineer, Performance Engineer, UX Reviewer, and Technical Lead covering architecture, engineering principles, runtime efficiency, security, reliability, test coverage, and long-term maintainability.

### Fixed during this review

- [x] Sixty-six ESLint warnings and parameter mismatches across source layers
  Priority: High
  Category: Cleanup / Quality
  Area: Whole codebase
  Affected files: `js/club/01-core.js`, `js/club/02-lifecycle.js`, `js/club/05-fixtures.js`, `js/club/06-effects.js`, `js/club/07-animation-core.js`, `js/club/08-animation-fixtures.js`, `js/club/09-animation-finish.js`, `js/club/10-ui.js`, `js/ledPatterns.js`, `js/lightFactory.js`, `js/showDirector.js`, `js/textureLoader.js`, `js/ui-init.js`, `js/vjDirector.js`
  Problem: 66 warnings and dead parameter declarations were flagged across 14 source files, including undeclared loop variables (`i` in fog animation), unexported global constants (`ROOM_BOUNDS`, `CLUB_POSITIONS`), unused variables in lighting loops, and unused parameter declarations in pattern functions.
  Impact: Noise in build checks obscured real syntax errors, and undeclared loop indices risked runtime ReferenceErrors.
  Recommended solution: Clean up unused declarations, export required window globals, prefix interface-mandated unused arguments with `_`, and ensure `npm run lint` executes with 0 warnings and 0 errors.
  Acceptance criteria: `npm run lint` passes with 0 errors and 0 warnings.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: High

- [x] Mirror ball rotation was frame-rate dependent on high-refresh displays
  Priority: High
  Category: Bug / Performance
  Area: Animation
  Affected files: `js/club/07-animation-core.js`
  Problem: `this.mirrorBallRotation -= 0.003 * speedMultiplier` in `updateMirrorBall()` did not multiply by `dtScale`, causing mirror ball spin and its associated outgoing rays to rotate 1.5–2x faster on 90 Hz / 120 Hz Quest headsets than on 60 Hz desktop displays.
  Impact: Visual pacing of the mirror ball effect diverged depending on device refresh rate and thermal throttling.
  Recommended solution: Destructure `dtScale` from the frame context in `updateMirrorBall` and scale the rotation increment by `dtScale`.
  Acceptance criteria: Mirror ball rotation completes one revolution in identical wall-clock time across 60, 72, 90, and 120 Hz.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

---

### Open Backlog Items

- [x] Transition 11-layer prototype chain with ambient TypeScript definitions and isolated layer contracts
  Priority: High
  Category: Architecture / Refactor
  Area: Whole application
  Affected files: `js/club/*.js`, `js/club_hyperrealistic.js`, `types/vrclub.d.ts`, `scripts/build.mjs`
  Problem: `VRClub` was composed via classic script global inheritance without formal type contracts, creating potential risks of property collisions during cross-layer extension.
  Impact: Risk of accidental property collision and lack of IDE typing support across layer boundaries.
  Recommended solution: Solidified each of the 11 focused layers (`01-core.js` through `11-audio-crowd.js`) under 1,500 lines with zero lint warnings, exported clean global contracts (`window.VRClubCore`, `window.ROOM_BOUNDS`, `window.CLUB_POSITIONS`), and authored ambient TypeScript definitions in `types/vrclub.d.ts` specifying all public APIs, configs, and subsystem interfaces.
  Acceptance criteria: All layers parse, build, lint with zero warnings, and pass all contract and unit tests; `types/vrclub.d.ts` provides complete IDE autocompletion.
  Estimated effort: Large
  Business value: High
  Technical debt reduction: High

- [x] Web Audio 3D spatialization and room acoustics reverberation
  Priority: High
  Category: Feature / Audio
  Area: Sound
  Affected files: `js/club/11-audio-crowd.js`, `js/club/07-animation-core.js`, `test/unit.test.mjs`
  Problem: Audio previously routed into a static stereo mastering chain with flat loudness and equal frequency response regardless of listener location (DJ booth vs dance floor center vs entrance).
  Impact: Moving around the club lacked acoustic depth, directionality, and the physical sense of being inside an industrial acoustic space.
  Recommended solution: Implemented dynamic Web Audio 3D spatial acoustics. Flown PA speakers at `CLUB_POSITIONS.paSpeakers.left` and `CLUB_POSITIONS.paSpeakers.right` have dedicated `PannerNode`s configured with HRTF panning and distance attenuation. An omnidirectional Sub-bass channel (`BiquadFilterNode` lowpass 100 Hz) dynamically delivers physical sub-bass on the dance floor (`z: -12` to `-16`) with realistic falloff toward the entrance (`z: 0`). Distance-dependent high-frequency air absorption filter and early room reflections (`roomDelay`) provide authentic nightclub acoustic presence. Listener position and orientation update smoothly every frame.
  Acceptance criteria: Audio loudness, stereo panning, and frequency balance realistically attenuate as player walks from the center dance floor to the entrance; pre-spatial tap preserves 100% reactive lighting across the room; unit tests pass.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] WebXR controller direct interaction and tactile haptic feedback for VJ console
  Priority: High
  Category: Feature / UX
  Area: WebXR / Interaction
  Affected files: `js/club/10-ui.js`, `js/club/05-fixtures.js`
  Problem: In-world VJ buttons and audio controls had no physical tactile depression animation or localized controller haptic feedback.
  Impact: Pressing controls in VR lacked physical responsiveness and tactile feedback.
  Recommended solution: Added `_pressButton3D(mesh)` and `pulseHaptic(intensity, duration)` to `VRClubUI`. When activated in VR or via desktop ray pointer, 3D buttons visibly depress (`position.y -= 0.015`) for 120 ms and trigger a sharp dual-rumble haptic pulse on active VR controllers.
  Acceptance criteria: In-world 3D buttons animate on click with physical spring-back and dispatch haptic clicks in VR.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] Dynamic Level of Detail (LOD) and frustum culling for crowd avatars
  Priority: Medium
  Category: Performance
  Area: Crowd / Rendering
  Affected files: `js/club/11-audio-crowd.js`, `test/unit.test.mjs`
  Problem: Skinned dancer avatars evaluated full 60-joint skeletal animation groups every frame even when located behind the camera or when the user stood inside the DJ booth facing away from the dance floor.
  Impact: Unnecessary CPU/GPU vertex skinning load on standalone Quest 3S chipsets.
  Recommended solution: Implemented camera view frustum testing (`cam.isInFrustum(npc.root)`) inside `updateDancingNPCs()`. Off-screen and distant (>28 m) dancers pause skeletal animation evaluation (`group.pause()`) and automatically resume (`group.restart()`) upon re-entering the camera frustum.
  Acceptance criteria: Off-screen avatars pause animation evaluation; smoothly resume when entering frustum; unit tests verify culling and pause state logic.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium

- [x] ServiceWorker and PWA Offline Shell for instant WebXR launch
  Priority: Medium
  Category: Reliability / UX
  Area: Application shell
  Affected files: `manifest.json`, `sw.js`, `serviceworker.js`, `index.html`, `js/ui-init.js`, `scripts/build.mjs`, `test/unit.test.mjs`
  Problem: First-time loading over unstable venue or headset Wi-Fi had to fetch all assets fresh, with no installable PWA manifest or offline shell.
  Impact: Slow cold-start times on standalone VR headsets.
  Recommended solution: Added `manifest.json` with WebXR fullscreen metadata, `sw.js` with versioned cache management, and registration in `ui-init.js`. Core assets (Babylon runtime, loaders, stylesheets, app scripts) are cached with a stale-while-revalidate strategy. `scripts/build.mjs` copies PWA assets into `dist/`.
  Acceptance criteria: PWA manifest validates; Service Worker installs and caches app shell; `npm test` and `npm run build` pass.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] Structured client-side telemetry and crash diagnostics buffer
  Priority: Low
  Category: Observability / Reliability
  Area: Monitoring
  Affected files: `js/club/01-core.js`, `js/club/11-audio-crowd.js`, `test/unit.test.mjs`
  Problem: Headset users could not access devtools to diagnose runtime audio errors, WebGL context drops, or FPS dips.
  Impact: Hard-to-diagnose field issues on standalone VR headsets.
  Recommended solution: Implemented a bounded circular diagnostics buffer (`diagnosticsBuffer`) in `VRClubCore` capturing timestamped audio, XR, render, and lifecycle events with `recordDiagnostic(category, message, data)` and snapshot exporter `getDiagnostics()`. Integrated into debug overlay and error handlers.
  Acceptance criteria: Bounded 100-item circular buffer records events; `getDiagnostics()` returns full health report; unit tests pass.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Strict TypeScript ambient declarations for public VRClub API
  Priority: Low
  Category: Developer Experience / Documentation
  Area: Tooling
  Affected files: `types/vrclub.d.ts`
  Problem: Methods across the 11 prototype layers relied on dynamic duck-typing without IDE autocompletion or ambient type signatures.
  Impact: Higher cognitive overhead when inspecting or extending VRClub classes.
  Recommended solution: Authored comprehensive ambient type definitions in `types/vrclub.d.ts` covering `VRClub`, `QualityTierSettings`, `DiagnosticsReport`, `AudioFrameData`, `ShowCue`, `Movement`, and all factory/loader classes.
  Acceptance criteria: `types/vrclub.d.ts` provides complete IDE autocompletion for `VRClub` APIs and configs.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: High

---

## Review — 2026-08-17b — Physical Presence & Real-World Feel

Scope: a second pass focused solely on the gap between "a good-looking 3D scene" and "being
in a room". The rig, the show and the spatial mix were already strong; what was missing was
everything the body notices — the room's acoustic tail, the sound of other people, the fact
that walking is not gliding, and that eyes and air are not perfect.

### Fixed during this review

- [x] The room had a delay tap but no acoustic tail
  Priority: High
  Category: Feature / Audio
  Area: Sound
  Affected files: `js/club/11-audio-crowd.js`, `test/unit.test.mjs`
  Problem: room ambience was a single 38 ms `DelayNode` tap. One discrete echo is not a
  room; a hard-surfaced warehouse produces a dense, slowly-decaying cloud of reflections,
  and its absence is why the mix read as "headphones" rather than "venue".
  Impact: the most-cited difference between recorded and live electronic music was missing.
  Recommended solution: a `ConvolverNode` fed by a procedurally synthesised impulse
  response (`_createRoomImpulseResponse()`): six discrete early reflections computed from
  the actual 25 x 16 x 10 m box at 343 m/s, layered over an exponentially decaying,
  one-pole-lowpassed noise tail (~1.9 s RT60, concrete-appropriate). Generated rather than
  shipped so no extra asset lands on the critical path.
  Acceptance criteria: the tail is dense and stereo-wide; no additional network request;
  the send survives occlusion so the room keeps ringing when the direct path is blocked.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] Reverb, occlusion and level did not respond to where the listener stood
  Priority: High
  Category: Feature / Audio
  Area: Sound
  Affected files: `js/club/11-audio-crowd.js`
  Problem: the panners handled direction, but the dry/wet balance was fixed, and walking
  out of the room toward the entrance sounded identical to standing in front of the PA.
  Impact: the room had no acoustic geography — the single strongest spatial cue a real
  venue gives you.
  Recommended solution: drive the convolver send from listener distance (0.08 dry at the
  boxes to 0.62 wet at the back), and add an occlusion `BiquadFilter` between the panners
  and the mastering bus that rolls off to 700 Hz and drops master gain to 0.72 once the
  listener passes `ROOM_BOUNDS.z.max`. Keyed off the authored room bounds, not a
  re-derived literal.
  Acceptance criteria: walking from the dance floor to the entrance audibly moves from
  dry/loud/bright to wet/muffled/distant; sourced from `ROOM_BOUNDS`.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] The club was silent between tracks — nobody else was in it
  Priority: High
  Category: Feature / Audio
  Area: Sound
  Affected files: `js/club/11-audio-crowd.js`, `js/club/02-lifecycle.js`, `test/unit.test.mjs`
  Problem: fourteen animated dancers were visible on the floor and produced no sound at
  all. Any gap in the music dropped the room to digital silence, which instantly reads as
  a simulation.
  Impact: undermined the crowd the renderer was already paying full skinning cost for.
  Recommended solution: `_startCrowdAmbience()` — a looping brown-noise buffer through a
  900 Hz bandpass (the vocal-mass band), spatialised by its own `PannerNode` at
  `CLUB_POSITIONS.danceFloor` so it sits behind you at the booth, and ducked against
  analyser energy so it swells in the gaps and disappears under a loud PA.
  Acceptance criteria: audible murmur between tracks, inaudible under full music, correctly
  positioned when the listener moves; the looping source is explicitly stopped in
  `dispose()` (closing the context alone does not reclaim it).
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] The desktop camera glided at a fixed height like a drone
  Priority: High
  Category: Feature / UX
  Area: Camera
  Affected files: `js/club/01-core.js`, `js/club/07-animation-core.js`, `test/unit.test.mjs`
  Problem: WASD movement translated the camera with no vertical or rotational component,
  so the desktop viewer had no body. VR users get real head motion from the headset;
  desktop users got nothing.
  Impact: the largest remaining "this is a viewport, not a place" cue on desktop.
  Recommended solution: `updateCameraPresence()` — speed-derived stride phase driving a
  35 mm vertical bob at twice stride rate plus an 11 mrad lateral roll at stride rate,
  amplitude lerped in and out so starting and stopping is smooth. Gated on
  `prefers-reduced-motion` and hard-disabled in VR, where synthetic bob causes sim
  sickness. The previously applied offset is subtracted before the camera delta is
  sampled, otherwise the bob feeds its own speed estimate and self-oscillates.
  Acceptance criteria: walking feels weighted, stopping settles cleanly, VR is untouched,
  reduced-motion users get the old behaviour.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] Exposure was constant, so the room never felt bright or dark
  Priority: Medium
  Category: Feature / Rendering
  Area: Post-processing
  Affected files: `js/club/01-core.js`, `js/club/07-animation-core.js`, `test/unit.test.mjs`
  Problem: `imageProcessing.exposure` was a fixed per-target constant. A real iris stops
  down hard against a blinder and opens slowly in a blackout; without that, a full-rig
  peak and a breakdown are rendered with identical sensitivity and the dynamic range of
  the show is flattened.
  Impact: peaks did not feel bright and breakdowns did not feel dark.
  Recommended solution: `updateEyeAdaptation()` estimates scene brightness from rig state
  (a GPU readback would stall the pipeline every frame, and the rig already knows exactly
  how much light it is emitting) and lerps exposure toward it with asymmetric time
  constants — fast constrict (0.10), slow dilate (0.012). Clamped to [0.78, 1.22] of the
  target's base so a blackout can never blow out. The strobe term is gated on
  `photosensitiveSafeMode` so safe mode cannot be brightened through the back door.
  `_adaptedExposure` is re-seeded on both VR transitions, where the pipeline is rebuilt.
  Acceptance criteria: a drop visibly stops the image down and a breakdown opens it back
  up over seconds; safe mode is unaffected; no stale exposure survives a VR transition.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] Light beams were smooth cones with nothing in the air
  Priority: Medium
  Category: Feature / Rendering
  Area: Particles
  Affected files: `js/club/05-fixtures.js`, `js/club/01-core.js`, `test/unit.test.mjs`
  Problem: haze made the beams visible as volumes, but the volumes were perfectly smooth.
  Real air carries dust that glints individually as a beam sweeps across it, and its
  absence is a recognisable CG tell on every fixture in the room.
  Recommended solution: an additive `dustMotes` particle system, 12–50 mm particles, tier
  scaled (1400 / 900 / 400) with upward convection gravity — a packed room lifts dust, so
  negative gravity would read as falling snow. Emit rate is set on both the VR and desktop
  paths so entering a headset does not keep paying the desktop cost.
  Acceptance criteria: beams sparkle as they sweep; capacity follows the tier; VR rate is
  reduced.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

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

---

## Review — 2026-08-18 — Full-repository engineering review

Full-stack review across product, architecture, correctness, performance, security,
reliability, testing, accessibility and maintainability. `[x]` items were resolved in
this pass; `[ ]` items are carried forward.

Baseline before: 40 tests passing, lint clean, `dist/` = 109.5 MB.
Baseline after: 40 tests passing (16 source-scanning change-detector tests replaced
with behavioural ones), lint clean, `dist/` = 60.9 MB, verified in a real browser with
zero console errors and zero WebGL warnings.

### Critical

- [x] Photosensitive Safe Mode was unreachable until after the strobes had already fired
  Priority: Critical
  Category: Accessibility
  Area: UI / Safety
  Affected files: `index.html`, `css/styles.css`, `js/ui-init.js`
  Problem: strobes and blinders default ON; safe mode defaults OFF; the only control was
  the LAST section of a nine-section panel that itself had no `max-height` or `overflow`,
  so on any viewport under ~1070 px tall it was clipped off-screen with no scrollbar. The
  sequence for a photosensitive user was: enter → strobes fire → hunt for an emoji icon →
  scroll to a section that could not be scrolled to. `prefers-reduced-motion` was consulted
  only for head-bob, never for strobes.
  Impact: WCAG 2.3.1 (Level A) failure and a genuine seizure risk on a head-mounted display,
  where the flashes fill the entire field of view.
  Recommended solution: put a photosensitivity warning and a Safe Mode toggle on the splash
  above ENTER; default safe mode ON when `prefers-reduced-motion: reduce` and no explicit
  preference is stored; promote the accessibility section to first in the VJ panel; give the
  panel `max-height` + `overflow-y: auto`.
  Acceptance criteria: the toggle is operable before any WebGL frame renders; the splash and
  panel controls stay in sync; the panel scrolls on a 600 px-tall viewport.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] The audio toggle button was positioned 40 px below the viewport
  Priority: Critical
  Category: UX
  Area: UI layout
  Affected files: `css/styles.css`
  Problem: `#audioToggle` shared `bottom: 20px; left: 50%` with `#cameraControls` and used
  `margin-bottom: -60px` to dodge the collision. For an absolutely positioned box that shifts
  the border box DOWN by 60 px, leaving ~5 px of a 45 px button on screen.
  Impact: the primary entry point for the app's core value proposition — play your own music
  — was effectively unreachable by pointer.
  Recommended solution: anchor it bottom-right with safe-area insets; move `#audioMenu` to match.
  Acceptance criteria: `getBoundingClientRect()` is fully inside the viewport; no overlap with
  the camera bar at any breakpoint.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] `updateAnimations()` ran AFTER `scene.render()`, so every frame displayed stale state
  Priority: Critical
  Category: Bug / Performance
  Area: Render loop
  Affected files: `js/club/02-lifecycle.js`
  Problem: the render loop called `scene.render()` first. Every beam position, spotlight
  quaternion, LED colour, strobe flash, exposure value and head-bob offset was therefore not
  seen by the GPU until the NEXT frame.
  Impact: a permanent one-frame lag (~14 ms at 72 Hz on Quest, on top of the compositor's own),
  and a guaranteed phase error between the camera matrix and the head-bob written into it.
  Recommended solution: update, then render.
  Acceptance criteria: `updateAnimations()` precedes `scene.render()`.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Unclamped `Math.acos()` poisoned pooled beam quaternions with NaN, permanently
  Priority: Critical
  Category: Bug
  Area: Fixture animation
  Affected files: `js/club/08-animation-fixtures.js`
  Problem: two beam-orientation paths fed `Vector3.Dot()` of float32-normalised vectors
  straight into `Math.acos`. Float32 normalisation routinely yields ±1.0000000000000002,
  whose `acos` is NaN. Because the quaternions are POOLED on the beam object and reused
  across frames, one NaN made the world matrix NaN forever.
  Impact: a laser or spotlight beam vanished permanently until reload. The mirror-ball path
  already clamped correctly, which is evidence this was an oversight.
  Recommended solution: clamp the dot product to [-1, 1] at both sites; stop mutating the
  shared `laserDir` scratch with `.normalize()` after it has already been consumed.
  Acceptance criteria: both call sites clamp; no `Math.acos` in the tree takes an unclamped dot.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Low

- [x] `ModelLoader.loadModel()` had no rollback: a failure left orphaned geometry AND a duplicate
  Priority: Critical
  Category: Bug
  Area: Model loading
  Affected files: `js/modelLoader.js`
  Problem: `addAllToScene()` sat inside the same `try` as ~230 lines of post-load configuration
  whose `catch` built a SECOND model from the procedural fallback. The `AssetContainer` was
  never removed or disposed on the error path.
  Impact: on any post-load throw the scene kept un-scaled, un-opacified, over-lit GLB meshes at
  the origin, with the VR opacity contract half-applied, alongside a duplicate model.
  Recommended solution: split into a fetch/parse phase and a configure phase; the configure
  catch calls `removeAllFromScene()` + `dispose()` before falling back.
  Acceptance criteria: no code path can leave a partially configured container in the scene.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] The service worker precached URLs the page never requests; production precached nothing
  Priority: Critical
  Category: Bug
  Area: PWA / build
  Affected files: `sw.js`, `scripts/build.mjs`, `js/ui-init.js`
  Problem: three compounding defects. (1) `CORE_ASSETS` held unversioned paths while
  `index.html` requests `?v=`-suffixed ones; `caches.match()` compares the full URL including
  the query string, so the precache was unreachable and every core asset downloaded TWICE.
  (2) `sw.js` was copied verbatim into `dist/`, where 25 of 28 entries 404 — and `cache.addAll()`
  is atomic, so production precached nothing at all, silenced by a `console.warn`.
  (3) The SW also cached ~100 MB of GLB/PNG that `IndexedDBAssetCache` already stores.
  Impact: the PWA had no offline shell, doubled cold-start downloads, and exhausted the origin
  quota on a Quest — which then made IndexedDB's graceful quota path fire constantly.
  Recommended solution: rewrite `sw.js` around an app-shell scope with a generated token;
  have `build.mjs` emit `dist/sw.js` with a `PRECACHE` and `VERSION` derived from the content
  hashes; exclude IndexedDB-owned binaries by extension; use `Promise.allSettled` per entry.
  Acceptance criteria: precache entries match the URLs the page requests; a contract test
  enforces the token; binaries are excluded; a missing optional asset cannot void the install.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] `scripts/build.mjs` kept a second, unverified copy of the script load order
  Priority: Critical
  Category: Architecture
  Area: Build
  Affected files: `scripts/build.mjs`, `test/contract.test.mjs`
  Problem: the load order existed in three hand-maintained places. Because the HTML rewrite
  strips first-party `<script>` tags unconditionally, adding a file to `index.html` and
  forgetting `build.mjs` did not produce a duplicate or an error — the code was simply ABSENT
  from production while dev worked and `npm test` stayed green.
  Impact: silent production-only breakage, undetectable by any existing check.
  Recommended solution: derive `sources` by parsing `index.html`; assert the postcondition
  that no first-party tag survives into `dist/index.html`; add a contract test.
  Acceptance criteria: `index.html` is the single source of truth; the build throws rather
  than shipping a 404.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: High

### High

- [x] `this.lastColorChange` was shared by two unrelated colour cyclers
  Priority: High
  Category: Bug
  Area: Animation
  Affected files: `js/club/08-animation-fixtures.js`, `js/club/09-animation-finish.js`, `js/ui-init.js`
  Problem: the spotlight palette cycler (2–12 s) and the LED wall palette cycler (4 s / 8 beats)
  wrote the same property in the same frame. Whichever fired first reset the other's clock.
  Impact: neither honoured its configured interval; the spotlight cycler was starved outright
  whenever the LED interval was shorter. The property was initialised in three places — the
  smell that led here.
  Recommended solution: give the LED wall `ledLastColorChange`.
  Acceptance criteria: one writer per timing property.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] The dance-floor LED strip divided an already-normalised audio value by 255
  Priority: High
  Category: Bug
  Area: Animation
  Affected files: `js/club/08-animation-fixtures.js`
  Problem: `getAudioData()` already returns 0–1; every other consumer treats it that way.
  Impact: audio terms collapsed to ≤0.004, so the perimeter strip was completely non-reactive —
  and was 125× BRIGHTER with no audio than with it, because the `: 0.5` fallback was not divided.
  Recommended solution: drop the `/ 255`.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] Nine frame-rate-independence violations across the animation layers
  Priority: High
  Category: Bug / Performance
  Area: Animation
  Affected files: `js/club/07-animation-core.js`, `js/club/08-animation-fixtures.js`
  Problem: the project's stated non-negotiable rule was violated in nine places — mirror-ball
  colour cycling keyed on `frameCounter % 180`, spotlight colour cross-fade as a bare per-frame
  increment, mirror-ball spot/ray smoothing lerps, laser-sheet and beam-haze UV scroll, gobo
  pool spin, and the energy-level easing. `dt` itself was derived as `0.016 * dtScale`, which is
  0.96× true elapsed time, so every dt-driven timer ran ~4 % slow at every refresh rate.
  Impact: the show ran at a different musical tempo per device; the gobo pool and the projection
  disc counter-rotated at any refresh rate other than 60 Hz.
  Recommended solution: `dt = dtScale / 60`; multiply per-frame steps by `dtScale`; compound
  smoothing retention as `1 - Math.pow(1 - k60, dtScale)`; replace frame-counter timers with the
  wall clock. Add a test that fails on a literal `0.016` in the animation tree.
  Acceptance criteria: `npm test` fails on any reintroduction.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] `dispose()` leaked seven categories of GPU and host resource
  Priority: High
  Category: Bug
  Area: Lifecycle
  Affected files: `js/club/02-lifecycle.js`, `js/textureLoader.js`, `js/modelLoader.js`, `js/materialFactory.js`, `js/lightFactory.js`
  Problem: `renderPipeline`, `_desktopRenderPipeline` (the parked desktop chain during an XR
  session — a second full HDR pipeline), `ssaoPipeline`, `glowLayer`, `floorReflectionProbe`,
  the context-lost observer and its `setTimeout`, the XR jump/Y-lock observers, and all four
  loader/factory objects (two IndexedDB connections, in-flight downloads, DynamicTextures)
  were never released.
  Impact: the club could not be embedded, hot-reloaded or unmounted without leaking the whole
  scene graph and the WebGL context. The context-lost handler would also reload a document the
  club no longer owned, two seconds after teardown.
  Recommended solution: dispose all pipelines and layers, remove all observers, clear all
  tracked timers, and add `dispose()` to `TextureLoader`, `ModelLoader`, `MaterialFactory` and
  `LightFactory`, called from `VRClub.dispose()`.
  Acceptance criteria: nothing created in these files survives `dispose()`.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: High

- [x] VR jump and sprint were dead in every session after the first
  Priority: High
  Category: Bug
  Area: WebXR
  Affected files: `js/club/02-lifecycle.js`
  Problem: the `IN_XR` setup block was gated on `!this.movementFeature`, but `movementFeature`
  was never cleared on exit — while the exit path deliberately destroyed `_jumpObserver` and
  `jumpState`. The guard, intended to prevent double-registration within a session, made the
  whole block one-shot for the instance lifetime.
  Impact: on the second and every subsequent VR entry, jump was dead, sprint was unbound, and
  `xrCamera.applyGravity` / `checkCollisions` were never re-applied.
  Recommended solution: clear `movementFeature` on `NOT_IN_XR`.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [x] The RETRY button hung the app forever
  Priority: High
  Category: Bug
  Area: UI / error recovery
  Affected files: `js/ui-init.js`, `js/club/01-core.js`
  Problem: `_handleFatalInitError()` relabels ENTER to RETRY, but the handler begins
  `if (!window.vrClub)` — and after a failed init `window.vrClub` is a truthy broken instance.
  Clicking RETRY therefore called `startAudioStream` on a dead instance, re-ran the menu
  initialisers against the same DOM (double-binding every listener so each toggle fired twice
  and cancelled itself out), and attached to the already-rejected `initPromise`, whose `.catch`
  sets `done = true` so the splash never hides.
  Impact: the button added specifically to avoid a manual reload guaranteed one.
  Recommended solution: make RETRY `location.reload()`; guard the menu initialisers against
  re-entry with a module-level flag.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] `TextureLoader`'s reference count did not count references (use-after-free trap)
  Priority: High
  Category: Bug
  Area: Asset caching
  Affected files: `js/textureLoader.js`
  Problem: the count was incremented only on a pool HIT inside `loadTextureSet`, never when a
  texture was bound to a material. But the `walls` set is bound to both `wallMat` and `brickMat`,
  and `ceiling` to both `pillarMat` and `ceilingMat` — each reporting a count of 1.
  Impact: a single `releaseTexture()` would dispose a texture two live materials were still
  sampling. Safe only because nothing called it — a trap, not a feature.
  Recommended solution: count on BINDING in `applyTexturesToMaterial()`; add the mirroring
  `releaseTexturesFromMaterial()`; stamp the pool key on the texture for O(1) release.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: High

- [x] The fetch "hard deadline" did not cover the response body
  Priority: High
  Category: Reliability
  Area: Asset caching
  Affected files: `js/assetCache.js`, `js/textureLoader.js`, `js/modelLoader.js`
  Problem: `await fetch()` resolves when HEADERS arrive; the timer was then cleared and the
  caller streamed the body outside any deadline.
  Impact: a server that sends `200 OK` and stalls mid-body hung startup forever — precisely the
  failure the file's own docstring says it exists to prevent, and the most likely stall for a
  15 MB GLB.
  Recommended solution: add `fetchBufferWithTimeout` / `fetchBlobWithTimeout` that keep one
  deadline across the body read; use them in both loaders. Also stop relabelling caller-initiated
  aborts as timeouts, and stop discarding a caller-supplied `AbortSignal`.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] IndexedDB writes resolved before commit, so quota errors were silently lost
  Priority: High
  Category: Bug
  Area: Asset caching
  Affected files: `js/assetCache.js`
  Problem: `_run` settled on `request.onsuccess`. Chromium routinely reports
  `QuotaExceededError` at COMMIT time for large blobs, so `put()` returned `true`, the
  `disabled` flag was never set, and the later `tx.onabort` rejected an already-settled promise.
  Also: `init()` was not concurrency-safe (two callers both opened a connection, orphaning one);
  a transient `onblocked` permanently disabled persistence and leaked the pending open; and a
  full quota disabled the cache for the session instead of evicting.
  Impact: the cache reported success while writing nothing and retried a doomed write on every
  load; on a Quest this degraded permanently to re-downloading ~50 MB per launch.
  Recommended solution: resolve `readwrite` on `tx.oncomplete`; memoise the init promise; treat
  `onblocked` as transient; evict the oldest 25 % and retry once before disabling; add `prune()`.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] The device light-budget clamp never reached the GPU
  Priority: High
  Category: Bug / Performance
  Area: Rendering
  Affected files: `js/club/03-rendering.js`, `js/modelLoader.js`
  Problem: `maxSimultaneousLights` invalidates the compiled effect via
  `markAllSubMeshesAsLightsDirty`, but THREE things suppressed that: scene-wide
  `blockMaterialDirtyMechanism` (set at init and never released), `material.freeze()` (sets
  `checkReadyOnlyOnce`), and — once those were lifted — re-freezing before the recompile.
  Impact: verified live. With the mechanism naively unblocked, the browser emitted a continuous
  stream of `GL_INVALID_OPERATION: uniform buffer that is too small`: the GPU kept a shader
  built for the old light count while the UBO was sized for the new one.
  Recommended solution: unblock the dirty mechanism, unfreeze, write, `markAsDirty(LightDirtyFlag)`,
  and defer the re-freeze to `onAfterRenderObservable.addOnce`.
  Acceptance criteria: zero over-budget materials and zero GL warnings at runtime (verified: 0/477).
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [x] The DOM and in-world VJ handlers had diverged into two different behaviours
  Priority: High
  Category: Architecture
  Area: UI
  Affected files: `js/ui-init.js`, `js/club/10-ui.js`
  Problem: ~200 lines implementing the same control surface twice. Only the 3D path updated
  `mirrorReflectionSpots`, `_sharedMirrorBeamMat`, `_sharedMirrorRayMat` and invalidated
  `mirrorBallCachedColors`; only the 3D path applied fixture exclusivity — and it applied it
  silently, discarding three of the user's choices with no feedback.
  Impact: the desktop button left reflection spots and shared beam materials stale; the two
  surfaces behaved differently for identical actions.
  Recommended solution: extract `cycleSpotColor()`, `cycleMirrorBallColor()`,
  `applyFixtureExclusivity()` and `resetVJControls()` onto `VRClub`; reduce both handlers to
  "call the method, render the feedback"; surface exclusivity as a toast. Add a test enforcing
  the delegation.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High

- [x] A contract test's hard-coded `\` separator made the dispose guarantee a Windows-only no-op
  Priority: High
  Category: Testing
  Area: CI
  Affected files: `test/contract.test.mjs`, `.github/workflows/ci.yml`
  Problem: `file.startsWith(join('js','club') + '\\')` matched on Windows and matched NOTHING on
  the Linux CI runner, where the very next line (`assert.ok(added.size > 0)`) then failed.
  Impact: the listener-leak guarantee was simultaneously vacuous locally and red in CI.
  Recommended solution: normalise `collectJs()` output to POSIX; add a `windows-latest` CI matrix
  leg so a separator bug cannot hide again.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Medium

- [x] Five version identifiers with no cross-check, already drifted
  Priority: High
  Category: Developer Experience
  Area: Release
  Affected files: `scripts/bump-version.mjs`, `sw.js`, `serviceworker.js`, `test/contract.test.mjs`
  Problem: `package.json.version`, `package.json.cacheToken`, the 25 `?v=` tokens, `sw.js`
  `VERSION` and the `serviceworker.js` comment drifted freely — and had (`-2` vs `-1`).
  `bump-version.mjs` never touched the two worker files, which is how the drift arose.
  Impact: a stale worker `VERSION` means `activate` never evicts the old cache, so a deploy
  silently keeps serving the previous bundle.
  Recommended solution: extend `bump-version.mjs` to all four; add a version-parity contract test.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: High

- [x] The PBR environment texture was still a hard third-party critical-path dependency
  Priority: High
  Category: Reliability
  Area: Assets
  Affected files: `js/club/02-lifecycle.js`, `scripts/vendor.manifest.json`, `index.html`, `test/contract.test.mjs`
  Problem: the Babylon runtime was vendored after an observed CDN 502, and `index.html` claimed
  "no third-party origin left in the critical path" — but `environmentSpecular.env`, which every
  material in the scene samples, was still fetched from `assets.babylonjs.com` with no `try` and
  no fallback. The contract test only forbade third-party `<script src>` tags.
  Impact: the same outage would still have stripped every PBR reflection in the club.
  Recommended solution: vendor it with an SRI hash in the manifest; extend the contract test to
  forbid any third-party resource load in first-party JS.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] `LightFactory.disposeGroup()` skipped every other light
  Priority: High
  Category: Bug
  Area: Lighting
  Affected files: `js/lightFactory.js`
  Problem: `getGroup()` returns the LIVE array and `disposeLight()` splices from it inside the
  `forEach`. `Array.prototype.forEach` does not re-index, so alternate lights were skipped — and
  `lightGroups.delete()` then destroyed the only handle to the survivors, leaving them in the
  scene with their `ShadowGenerator` render targets alive.
  Impact: a textbook mutation-during-iteration bug in the one method whose entire job is cleanup.
  Recommended solution: copy the array before iterating.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [x] 16 of 22 "unit" tests were regex scans of source text
  Priority: High
  Category: Testing
  Area: Test suite
  Affected files: `test/unit.test.mjs`
  Problem: change detectors — maximum maintenance cost, minimum defect detection. A test titled
  "Diagnostics buffer records events in a bounded circular buffer" asserted only that three
  substrings existed; it could not catch an off-by-one but would fail on a renamed parameter.
  Meanwhile 37 LED patterns, `dispose()`, graphics-tier detection, frame-rate independence and
  ShowDirector look validation had zero coverage.
  Impact: the suite obstructed refactoring while catching none of the defects in this review.
  Recommended solution: delete the change detectors; add behavioural tests that execute code —
  an LED-pattern smoke test over all 37 patterns, ShowDirector meta-key and safe-mode
  enforcement across every look, `LightFactory.disposeGroup`, IndexedDB commit/quota semantics,
  `init()` concurrency, and a lint-style test for the `dtScale` rule.
  Acceptance criteria: every remaining test either runs code or asserts a cross-file invariant.
  Estimated effort: Large
  Business value: High
  Technical debt reduction: High

- [x] No LICENSE file, and incomplete CC BY attribution
  Priority: High
  Category: Documentation
  Area: Legal
  Affected files: `LICENSE`, `ASSETS.md`, `index.html`
  Problem: `package.json` and the README both declared MIT with no licence text and no
  identifiable copyright holder. "PA Speakers (CC BY 4.0)" named no creator, no title and linked
  to neither the material nor the licence, as CC BY 4.0 §3(a)(1) requires. Three Mixamo avatar
  GLBs shipped with no provenance anywhere.
  Impact: an SPDX identifier without the text grants nothing downstream; the CC BY entry was
  non-compliant.
  Recommended solution: add `LICENSE` and `ASSETS.md` recording every shipped binary; fix the
  in-product credits; record the two remaining gaps explicitly.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] 109.5 MB deploy payload, ~30 MB of it unreferenced or duplicated
  Priority: High
  Category: Performance
  Area: Build
  Affected files: `scripts/build.mjs`, `js/models/`, `.github/workflows/ci.yml`
  Problem: `cp(js/models, ...)` copied everything, including an 11.7 MB `model.zip`, a 6.1 MB
  unreferenced `PA_Speakers.glb`, a `.dae` source file, and a texture directory duplicated
  byte-for-byte alongside its own copy.
  Impact: nearly double the necessary transfer for every first-time visitor.
  Recommended solution: derive an allow-list of referenced model paths; delete the ballast from
  the repository; add a 75 MB CI payload budget.
  Acceptance criteria: `dist/` ≤ 75 MB and CI fails above it. (Achieved: 60.9 MB.)
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium

- [x] The dev server sent `immutable, max-age=1y` for source files
  Priority: High
  Category: Developer Experience
  Area: Tooling
  Affected files: `scripts/serve.mjs`
  Problem: correct for `--dist` (content-hashed filenames), actively harmful in dev — an edited
  source file kept being served from the browser cache for a year.
  Impact: "my change did nothing" is indistinguishable from a real bug. Observed during this
  review's own browser verification.
  Recommended solution: `no-cache` unless `--dist`; always `no-cache` for worker scripts, whose
  `updateViaCache: 'imports'` default would otherwise pin them for a year.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

### Medium

- [x] Sub-woofer grilles latched in the extended position whenever bass stopped
  Priority: Medium
  Category: Bug
  Area: Animation
  Affected files: `js/club/09-animation-finish.js`
  Problem: the excursion was written only inside `if (audioData.bass > 0.1)` with no `else`, and
  the mesh had been permanently unfrozen.
  Impact: every breakdown, pause and track change froze the grille at its last excursion while
  still paying world-matrix cost. `_subGrillRefs` was also cached before the PA `.glb` landed,
  so it could drive meshes the loader had since disabled.
  Recommended solution: always write the excursion (zero below threshold); invalidate the cache
  when `modelLoadPromise` resolves.
  Estimated effort: Small

- [x] The strobe bloom spike was never restored on two exit paths
  Priority: Medium
  Category: Bug / Accessibility
  Area: Post-processing
  Affected files: `js/club/09-animation-finish.js`
  Problem: restoration lived only in the `maxIntensity === 0` else-branch, inside
  `if (strobesActive && !photosensitiveSafeMode)`. Flipping either flag mid-flash left
  `bloomWeight` elevated indefinitely. The captured value could also leak across a VR pipeline swap.
  Impact: **a photosensitivity control that left the screen brighter than it found it** — the
  wrong failure direction.
  Recommended solution: restore unconditionally at the top of the function; re-capture per burst.
  Estimated effort: Small

- [x] Per-frame `Color3` allocation in the strobe hot path
  Priority: Medium
  Category: Performance
  Area: Animation
  Affected files: `js/club/09-animation-finish.js`
  Problem: `cachedColors.white.scale(...)` allocates, once per strobe per frame for the whole
  flash — the only remaining unbounded allocation in `updateAnimations()` on the light path, and
  it sat next to correctly-optimised code.
  Recommended solution: `scaleToRef` into a per-strobe buffer.
  Estimated effort: Small

- [x] A dead assignment meant strobing spotlights never actually went dark
  Priority: Medium
  Category: Bug
  Area: Fixture animation
  Affected files: `js/club/08-animation-fixtures.js`
  Problem: `spot.light.intensity = beamVisible ? 12 : 0` was overwritten unconditionally ~350
  lines later in the same `forEach`.
  Impact: with `spotStrobeActive` on, the beam mesh and pool flashed while the `SpotLight` stayed
  pinned at ~18, so the floor never went dark between flashes — the strobe read as a translucent
  flicker. The 1,030-line function is what let this hide.
  Recommended solution: fold `beamVisible` into the authoritative write.
  Estimated effort: Small

- [x] Beam clip planes used wall coordinates that contradicted the geometry
  Priority: Medium
  Category: Bug
  Area: Fixture animation
  Affected files: `js/club/08-animation-fixtures.js`
  Problem: `BACK_WALL_Z = -25.8`, `LEFT_WALL_X = -10`, `RIGHT_WALL_X = 10` were re-declared
  inside a per-spot per-frame loop and disagreed with `ROOM_BOUNDS` (±12.5, z = -21).
  Impact: spotlight beams terminated 2.5 m short of the side walls and 4.8 m behind the back wall.
  Recommended solution: source them from `ROOM_BOUNDS`, per the project's own stated rule.
  Estimated effort: Small

- [x] A random interval re-drawn every frame made the randomness illusory
  Priority: Medium
  Category: Bug
  Area: Fixture animation
  Affected files: `js/club/08-animation-fixtures.js`
  Problem: `time - colorSwitchTime > (8 + Math.random() * 4)` drew a NEW threshold every frame,
  so ~240 samples raced the elapsed time and the intended 8–12 s switch collapsed to ≈8.02 s with
  near-zero variance.
  Recommended solution: draw once per interval.
  Estimated effort: Small

- [x] Two competing BPM detectors wrote the same output variable
  Priority: Medium
  Category: Architecture
  Area: Audio
  Affected files: `js/club/09-animation-finish.js`
  Problem: `VJDirector` is the documented authority (spectral flux + adaptive median threshold)
  and runs earlier in the same frame; the LED wall then ran a second, cruder bass-peak detector
  that overwrote `this.bpm` and `this.beatInterval`.
  Recommended solution: consume the director's estimate; delete the local detector.
  Estimated effort: Small

- [x] `addPostProcessing()`'s guard prevented SSAO/SSR/motion-blur from ever being rebuilt
  Priority: Medium
  Category: Bug
  Area: Rendering
  Affected files: `js/club/03-rendering.js`
  Problem: the early return keyed on `renderPipeline` alone, but the method also creates three
  other pipelines. After `applyVRSettings()` assigned a new `renderPipeline`, any later call
  returned immediately. The helpers already carry their own idempotency guards, making the outer
  guard both redundant and harmful.
  Recommended solution: guard only the `DefaultRenderingPipeline`; give SSAO its own check.
  Estimated effort: Small

- [x] Freeze-state asymmetry left intentionally-hot materials permanently frozen
  Priority: Medium
  Category: Bug
  Area: Rendering / textures
  Affected files: `js/club/03-rendering.js`, `js/textureLoader.js`
  Problem: `createFloorReflectionProbe()` and `applyTexturesToMaterial()` unfroze conditionally
  but froze unconditionally. A material the factory deliberately left hot was silently frozen,
  no-op'ing its runtime colour mutations. `_rebuildFloorReflectionProbe()` re-runs on every tier
  change, compounding it.
  Recommended solution: save and restore `wasFrozen`, as `_suppressUnlitSpecular()` already does.
  Estimated effort: Small

- [x] Panels were `role="dialog"` while behaving as disclosures
  Priority: Medium
  Category: Accessibility
  Area: UI
  Affected files: `index.html`
  Problem: internally contradictory markup — a disclosure trigger (`aria-expanded`/`aria-controls`),
  a `role="dialog"`, and `aria-modal="false"` (the default, adding nothing).
  Impact: NVDA/JAWS entered forms mode and announced a dialog, implying the background was
  unavailable and that a focus trap existed. Neither is true.
  Recommended solution: `role="group"` + `aria-labelledby`; keep the trigger's expanded state,
  the heading focus move and Escape-to-close.
  Estimated effort: Small

- [x] Toggle state and slider values were invisible to assistive technology
  Priority: Medium
  Category: Accessibility
  Area: UI
  Affected files: `index.html`, `js/ui-init.js`
  Problem: nine toggles conveyed on/off through a CSS class only; three sliders had no
  accessible name (the visible label was an unassociated sibling `<div>`) and announced a bare
  number with no unit. Active/inactive differed only by the alpha of one hue. The minimize
  buttons destroyed their own `aria-hidden` wrapper via `textContent` and never relabelled.
  Impact: WCAG 4.1.2 and 1.4.1 failures — and the SAFE MODE toggle in particular was unusable
  non-visually, so a user could not confirm they had turned the strobes off.
  Recommended solution: `aria-pressed` on every toggle kept in sync through one helper;
  `aria-labelledby` + `aria-valuetext` on sliders; a non-colour active marker drawn with a
  gradient (generated text content is exposed to the a11y tree); write to the inner `<span>`.
  Estimated effort: Medium

- [x] Focus escaped behind the splash screen
  Priority: Medium
  Category: Accessibility
  Area: UI
  Affected files: `index.html`, `js/ui-init.js`
  Problem: `#splashScreen` is a full-viewport `z-index: 10000` overlay, but `<main>` was never
  hidden or `inert`, so tab order walked into eight invisible controls behind it.
  Recommended solution: `role="dialog" aria-modal="true"` on the splash and `inert` on `<main>`
  until it is dismissed; focus the canvas afterwards.
  Estimated effort: Small

- [x] Cycling controls hid their own state
  Priority: Medium
  Category: UX
  Area: UI
  Affected files: `js/ui-init.js`, `index.html`
  Problem: MODE / PATTERN / GOBO showed the new value for 1.5 s (racing the 2 s state poller)
  then reverted to a generic word.
  Impact: the current mode became unknowable without clicking through the cycle again — i.e.
  changing the state in order to read it. `QUALITY:` and `SHOW:` already did this correctly.
  Recommended solution: make all cycling labels permanent.
  Estimated effort: Small

- [x] "Enter VR" was buried behind an unlabelled gear icon, with no capability check
  Priority: Medium
  Category: UX
  Area: UI
  Affected files: `index.html`, `css/styles.css`, `js/ui-init.js`, `js/club/10-ui.js`
  Problem: the headline action of a WebXR app sat one click deep inside a settings panel whose
  sole content was that button. It was offered at full prominence on machines with no headset,
  did nothing at all when `baseExperience` was falsy, and never changed label in session.
  Recommended solution: promote it to a top-level control; delete the settings panel entirely
  (removing a third duplicated panel implementation); feature-detect with
  `navigator.xr.isSessionSupported()`; toggle Enter/Exit on the XR session observables.
  Estimated effort: Medium

- [x] A silent audio failure left the user in a club with no music and no explanation
  Priority: Medium
  Category: UX
  Area: Audio
  Affected files: `js/ui-init.js`
  Problem: the default stream's rejection went only to the console. Autoplay blocks, station
  downtime, offline launches and corporate networks all land here — and the lights keep running
  off a 128 BPM default, so the scene LOOKS alive.
  Recommended solution: surface a toast naming the fix and pulse the audio control; add a
  "now playing" readout.
  Estimated effort: Small

- [x] The status timer, XR observers and flash timers leaked
  Priority: Medium
  Category: Bug
  Area: UI
  Affected files: `js/ui-init.js`, `js/club/10-ui.js`
  Problem: `showStatus()` never stored its handle, so an earlier message's 3 s timer blanked a
  later one after a few hundred ms and repeated calls accumulated unbounded timers. The audio
  panel's XR observers dropped their return values (the VJ panel's stored them), so they were
  unremovable and transitively retained the whole VRClub instance. Button-flash timers wrote to
  materials that `scene.dispose()` had already freed.
  Recommended solution: store and clear every handle; register them with the teardown list.
  Estimated effort: Small

- [x] `updateButtonStates()` fought its own SHOW button every two seconds
  Priority: Medium
  Category: Bug
  Area: UI
  Affected files: `js/ui-init.js`
  Problem: the substring dispatch (`!control.includes('change'|'cycle'|'reverse')`) let
  `toggleShow` reach the generic branch and read `vrClubInstance.toggleShow`, which is `undefined`.
  Impact: the poller stripped `.active` off the SHOW button every 2 s while its own label still
  read "SHOW: ON" — two indicators in permanent disagreement.
  Recommended solution: replace the stringly-typed test with the explicit allow-list and read
  `showDirector.enabled`.
  Estimated effort: Small

- [x] Unrestricted dynamic property write keyed by a DOM attribute
  Priority: Medium
  Category: Security
  Area: UI
  Affected files: `js/ui-init.js`
  Problem: `vrClubInstance[button.getAttribute('data-control')] = !...`. Not reachable today —
  every `data-control` is a literal — but `__proto__` would write to `Object.prototype` and
  `constructor` would clobber the instance's constructor.
  Recommended solution: a `TOGGLE_CONTROLS` allow-list, enforced by a test that every
  `aria-pressed` toggle in the DOM appears in it.
  Estimated effort: Small

- [x] `serve.mjs` in non-`--dist` mode served the entire repository
  Priority: Medium
  Category: Security
  Area: Tooling
  Affected files: `scripts/serve.mjs`
  Problem: the traversal and symlink guards are genuinely well done, but place no restriction
  INSIDE `ROOT` — which without `--dist` is the repository. `GET /.git/config`, `/package.json`,
  `/node_modules/...` and `/.env` were all servable, and `.env` even had a MIME mapping.
  Recommended solution: a path denylist applied regardless of ROOT.
  Estimated effort: Small

- [x] The PWA was not installable and the forced-colors rule was a no-op
  Priority: Medium
  Category: Bug
  Area: PWA / accessibility
  Affected files: `manifest.json`, `icons/`, `scripts/generate-icons.mjs`, `css/styles.css`
  Problem: the only icon was a `data:` SVG declaring two sizes; Chromium requires a ≥192 px
  RASTER icon and does not treat `data:` icons as installable resources. `id` and `scope` were
  absent. Separately, the `@media (forced-colors: active)` block targeted `.vj-panel` and
  `.audio-panel` — class names that exist nowhere in the document.
  Recommended solution: generate real 192/512/maskable PNGs with a dependency-free encoder; add
  `id` and `scope`; correct the forced-colors selectors; assert all of it in a test.
  Estimated effort: Medium

- [x] `sw.js` and `serviceworker.js` were outside every quality gate
  Priority: Medium
  Category: Developer Experience
  Area: Tooling
  Affected files: `eslint.config.mjs`, `scripts/check-syntax.mjs`
  Problem: `check-syntax.mjs` collected only `js/**` and `scripts/*.mjs`; the ESLint config had
  no block matching root-level `sw.js`, so it was visited with no `languageOptions` and no rules.
  Impact: a typo in the service worker shipped unchallenged.
  Recommended solution: add both files to the syntax check and a dedicated ESLint block with
  worker globals.
  Estimated effort: Small

- [x] Zero responsive breakpoints, and panels that overlapped each other
  Priority: Medium
  Category: UX
  Area: UI
  Affected files: `css/styles.css`
  Problem: a 1,091-line stylesheet with two `@media` blocks, neither a width breakpoint, despite
  declaring `mobile-web-app-capable` and `viewport-fit=cover` with no `env(safe-area-inset-*)`
  usage. `#vjMenu` and `#settingsPanel` overlapped below ~375 px.
  Recommended solution: breakpoints at 720 px and 620 px height; safe-area insets on the
  bottom-anchored controls; full-width panels on small screens.
  Estimated effort: Medium

- [x] No reset, no keyboard shortcuts, and almost nothing persisted
  Priority: Medium
  Category: UX
  Area: UI
  Affected files: `index.html`, `js/ui-init.js`, `js/club/10-ui.js`, `js/club/11-audio-crowd.js`
  Problem: 19 controls with no way back to a known state except a reload; the app's only global
  shortcut was a bare `D` for a developer overlay (colliding with the WASD keys a user presses
  constantly); the stream URL — the highest-friction input in the app, typed on a Quest virtual
  keyboard — was re-entered every session; there was no volume or mute control anywhere.
  Recommended solution: a RESET button backed by documented `VJ_DEFAULTS`; `Space`/`B`/`F`/`1`–`4`
  shortcuts with `Ctrl+Shift+D` for debug; persist the last stream URL (re-validated on read);
  add a volume slider and a now-playing readout.
  Estimated effort: Medium

- [x] Dead code and a misleading data-collection prompt
  Priority: Medium
  Category: Cleanup
  Area: UI
  Affected files: `index.html`, `js/ui-init.js`, `js/club/09-animation-finish.js`, `js/club/10-ui.js`
  Problem: the splash's "Your Name (Optional)" field was written once and never read anywhere —
  it asked for personal data with no purpose and implied the app was multiplayer when it is
  single-player. Also dead: `updateLEDWallSimple()` (zero call sites), a debug counter
  incrementing every frame forever to satisfy a check that can be true three times, the
  `networkManager` sync block, `systems.spotlight` fallbacks for a module layer the repo's own
  instructions warn does not exist, and `patternRandom`/`fogBurst` branches no fixture uses.
  Recommended solution: delete all of it.
  Estimated effort: Small

### Low

- [x] `getPreset()` constructed a new material and GPU program on every call
  Priority: Low
  Category: Performance
  Area: Materials
  Affected files: `js/materialFactory.js`, `js/club/05-fixtures.js`
  Problem: ten presets did not pass `shared: true`. Every current call site happened to hoist the
  result out of its loop, but nothing enforced it and the name actively invites in-loop use.
  A related latent bug was found live by the new warning: `createStandardMaterial(..., true)` in
  `05-fixtures.js` believed it was sharing, but that creator has no cache path — it produced one
  material per laser emitter. Verified fixed at runtime: 9 → 1.
  Recommended solution: memoise `getPreset` by name; warn on the ignored third argument.
  Estimated effort: Small

- [x] Prototype-chain and duplication hazards in the factories
  Priority: Low
  Category: Refactor
  Area: Materials / lighting
  Affected files: `js/materialFactory.js`, `js/lightFactory.js`
  Problem: cache objects were plain `{}` with keys derived from config VALUES; the `HOT_MUTATED`
  array was duplicated verbatim three times; `clearCache()` disposed materials live meshes still
  referenced and had no callers; `light.shadowGenerator = gen` created a dead own-property;
  `addToGroup` permitted duplicates; `getPreset` returned `null` for an unknown name, turning a
  typo into a TypeError rather than a degraded scene.
  Recommended solution: `Object.create(null)`; one `static HOT_MUTATED`; replace `clearCache()`
  with a safe `dispose()`; dedupe group membership; return a disabled light as the fallback.
  Estimated effort: Small

- [x] Mirror-spot visibility sweep ran every frame outside its own update gate
  Priority: Low
  Category: Performance
  Area: Animation
  Affected files: `js/club/07-animation-core.js`
  Problem: the expensive raycast loop is correctly throttled to every 2nd/3rd frame, but the
  follow-up sweep iterated all 150 spots every frame, issuing up to 300 `setEnabled()` calls
  (each walking the mesh's descendant hierarchy) on state that provably had not changed.
  Recommended solution: move it inside the gate.
  Estimated effort: Small

- [x] Sourcemap deployed, unusable, and publishing full source
  Priority: Low
  Category: Cleanup
  Area: Build
  Affected files: `scripts/build.mjs`
  Problem: `esbuild.transform()` with `sourcemap: true` returns the map but does not append a
  `//# sourceMappingURL`. A 1.2 MB map with `sourcesContent` was therefore deployed, unusable by
  DevTools, at a filename derivable from the public bundle name.
  Recommended solution: `sourcemap: 'external'`, `sourcesContent: false`, append the comment.
  Estimated effort: Small

- [x] Documentation asserted things that were not true
  Priority: Low
  Category: Documentation
  Area: Docs
  Affected files: `README.md`, `docs/`, `.github/copilot-instructions.md`
  Problem: the README described `check:sri` as verifying "index.html integrity hashes" (there are
  no SRI attributes in the HTML) and the CHANGELOG claimed an "automatic CDN fallback" that a
  contract test actively forbids. The agent instructions — which explicitly carry an accuracy
  contract — documented the light budget as 6/4/4 (actual: 4/3/3), `transparencyMode = null`
  (actual: `0`), and a `LightFactory.getPreset(name, position)` signature whose arguments are
  reversed, so an agent following it would write broken code on the first try. Seven `docs/`
  files were self-declared archival and said "use the README instead".
  Recommended solution: correct every claim; delete the superseded docs; label the rest.
  Estimated effort: Medium

- [x] `backup_aframe/` was an empty husk kept alive by config
  Priority: Low
  Category: Cleanup
  Area: Repository
  Affected files: `eslint.config.mjs`
  Problem: two empty untracked directories that git cannot track, still referenced in the ESLint
  `ignores` list and still advertised in the workspace tree — misleading every reader into
  thinking a legacy implementation was preserved.
  Recommended solution: delete the directory and the ignore entry.
  Estimated effort: Small

### Carried forward — not addressed in this pass

- [ ] Extract `init()` (561 lines, 9 levels of nesting) and `updateSpotlights()` (~1,030 lines)
  Priority: High
  Category: Refactor
  Area: Lifecycle / fixture animation
  Affected files: `js/club/02-lifecycle.js`, `js/club/08-animation-fixtures.js`
  Problem: `init()` reaches nine nesting levels in the XR controller setup. `updateSpotlights()`
  is one ~1,030-line function whose legacy `else` branch is indented at the OUTER level, so the
  brace structure is not visually recoverable, with two `const baseIntensity` declarations
  shadowing across nested scopes and a 55-line pattern table duplicated character-for-character.
  Impact: this is not a style complaint — it is *causal*. The dead-assignment bug and the VR
  re-entry bug in this review were both invisible at that nesting depth, and both were found by
  reading rather than by any test.
  Recommended solution: extract `_setupXRLocomotion()`, `_setupXRJump()`, `_setupLifecycleListeners()`;
  invert `updateSpotlights()` to an early return and extract `_solveSweepPattern(index, phase, out)`
  called twice into pooled scratch objects.
  Acceptance criteria: no function over ~200 lines in these files; no nesting past 5 levels.
  Estimated effort: Large
  Business value: Medium
  Technical debt reduction: High

- [x] Add the headless browser E2E suite to CI
  Priority: High
  Category: Testing
  Area: CI
  Affected files: `.github/workflows/ci.yml`, `test/`
  Problem: the Playwright desktop/Quest suite existed but CI never ran it. Browser-only WebGL,
  WebXR, service-worker and production-bundle failures could therefore ship while every required
  check stayed green.
  Impact: the three Critical build/SW defects fixed here would all have been caught by one
  headless page load. Every one of them shipped green.
  Recommended solution: install Chromium in a Linux CI job and run the existing serial E2E suite
  against `npm run start:prod`, retaining traces, screenshots, video and the HTML report on failure.
  Acceptance criteria: implemented 2026-08-23. CI runs desktop rendering plus emulated Quest XR,
  fails on page/console/diagnostic errors, and uploads browser failure artifacts.
  Acceptance criteria: the test fails if any of those appear; runs in under 2 minutes.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: High

- [ ] Close the two asset-licensing gaps recorded in ASSETS.md
  Priority: High
  Category: Documentation
  Area: Legal
  Affected files: `ASSETS.md`, `js/models/`
  Problem: (1) the PA speaker model's creator and source URL were never recorded, so its CC BY
  attribution cannot be made compliant from the information in the repository. (2) Three Mixamo
  animation GLBs are redistributed inside a public MIT repository; Adobe's terms permit use in a
  project, but redistribution of the raw files is a distinct act.
  Impact: a licence-compliance risk that blocks any public release.
  Recommended solution: locate the original download and record creator/title/URL, or replace the
  model. For the animations, confirm the terms, replace with CC0/CC BY equivalents, or move them
  out of version control and fetch at build time.
  Acceptance criteria: every entry in ASSETS.md has a creator, a source URL and a licence; the
  "Known gaps" section is empty. The contract test requiring every `.glb` to appear in ASSETS.md
  was added 2026-08-23; creator/source recovery and Mixamo redistribution clearance remain open.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [ ] Optimise the two 15 MB GLBs and the 8 MB texture PNGs
  Priority: Medium
  Category: Performance
  Area: Assets
  Affected files: `js/models/`, `scripts/optimize-avatars.mjs`, `scripts/build.mjs`
  Problem: the source asset payload is 65.26 MiB, and 49.66 MiB of that is two GLBs and two PNG
  textures. `scripts/optimize-avatars.mjs` exists but is invoked by nothing, only ever touches
  `js/models/avatars/`, and destructively overwrites the source files in place — so it is not
  idempotent and re-running re-quantises already-quantised geometry. `@gltf-transform/cli` is a
  heavy devDependency carried for a script nobody runs.
  Impact: a cold first load on a Quest over Wi-Fi is dominated by these files.
  Recommended solution: generalise it to `optimize-models.mjs` covering `djgear` and `paspeakers`,
  writing to `dist/` and never mutating sources; add Draco/meshopt compression and KTX2 textures;
  wire it into `npm run build`. Or delete it and the dependency.
  Acceptance criteria: `dist/` under 25 MB with no visible quality regression. `npm run
  audit:assets` now reports the total, top ten and type totals in CI so progress is measurable.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium

- [ ] Remove `'unsafe-inline'` from `style-src`
  Priority: Medium
  Category: Security
  Area: CSP
  Affected files: `js/club/10-ui.js`, `index.html`
  Problem: the only remaining consumer is one `innerHTML` template in `showAudioStreamInputUI()`
  containing `style=""` attributes. It is not exploitable today — the template is fully static —
  but it is the sole markup-injection sink in the codebase and it sits directly beside the code
  handling the most attacker-influenced values in the app.
  Impact: one future `${...}` there becomes XSS, and CSP would not stop injected markup,
  clickjacking bait or form overlays.
  Recommended solution: rebuild the overlay with `createElement` + `textContent`, then drop
  `'unsafe-inline'` from `style-src` and add `require-trusted-types-for 'script'`.
  Acceptance criteria: no `innerHTML` anywhere in `js/`; a contract test forbids it.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: High

- [x] `showAudioStreamInputUI()` can create duplicate-ID overlays
  Priority: Medium
  Category: Bug
  Area: In-VR UI
  Affected files: `js/club/10-ui.js`
  Problem: nothing prevents re-entry. Two clicks produce two `#vrAudioInput` elements; the
  handler wiring then reaches for `document.getElementById('audioFileBrowseBtn')`, binding the
  second overlay's handler onto the first overlay's button, while `cleanup()` removes only the
  first — orphaning the second on screen forever with its Escape handler already detached.
  `camera.attachControl` can also be called twice, and uses the pre-Babylon-5 signature.
  Recommended solution: early-return if the overlay exists; scope every lookup to the container;
  fix the `attachControl` signature.
  Acceptance criteria: repeated activation leaves exactly one `#vrAudioInput` and one Escape
  handler; implemented 2026-08-22 with an early re-entry guard.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [ ] Disclose the default third-party audio stream before connecting to it
  Priority: Medium
  Category: Security
  Area: Privacy
  Affected files: `js/ui-init.js`, `index.html`
  Problem: clicking ENTER immediately opens a long-lived connection to a German radio provider,
  disclosing the visitor's IP, User-Agent and listening duration, with no notice and no opt-out.
  Impact: a GDPR/ePrivacy exposure for an EU-facing PWA, and a hard first-run dependency on a
  third party's uptime.
  Recommended solution: name the station on the splash with an opt-out, or ship a short local
  loop as the default and make the stream an explicit choice.
  Acceptance criteria: no third-party connection occurs without an explicit user action.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [ ] Route ModelLoader's three PointLights through LightFactory
  Priority: Low
  Category: Refactor
  Area: Lighting
  Affected files: `js/modelLoader.js`
  Problem: one DJ light and one per speaker are created with bare `new BABYLON.PointLight`,
  bypassing the registry. `LightFactory.disposeAll()` will never reclaim them and `getStats()`
  under-reports, so even a manual audit of the factory understates the true light count.
  Recommended solution: pass the factory into `ModelLoader` and use `getPreset('djLight')` /
  `getPreset('speakerLight')`.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [ ] Investigate whether `_fitAndPlace()` destroys the glTF handedness transform
  Priority: Low
  Category: Bug
  Area: Model loading
  Affected files: `js/modelLoader.js`
  Problem: `_fitAndPlace()` zeroes `rootMesh.rotationQuaternion`/`rotation`/`scaling` on
  `__root__`, which is where Babylon's glTF loader puts the right-handed→left-handed conversion
  (conventionally `scaling.z = -1`). That is very likely why `dj_console` carries a
  `scale: new Vector3(-1, 1, 1)` "unmirror" workaround whose comment blames the exporter.
  Impact: if confirmed, the sign-flip machinery exists only to paper over a self-inflicted bug.
  Recommended solution: parent the container root under a new `TransformNode` and apply
  fit/placement there, leaving the loader's conversion intact; then delete the sign handling.
  Acceptance criteria: both models render identically with no `scale` sign flips in the configs.
  Estimated effort: Medium
  Business value: Low
  Technical debt reduction: Medium

- [ ] Decide the fate of the unreferenced procedural model fallbacks
  Priority: Low
  Category: Cleanup
  Area: Model loading
  Affected files: `js/modelLoader.js`
  Problem: `createEnhancedProceduralModel()` dispatches on `config.type`, but none of
  `dj_console`, `pa_speaker_left` or `pa_speaker_right` declares one. On the failure path the
  "fallback" is an empty `TransformNode`, making ~350 lines of `createEnhancedCDJ` /
  `createEnhancedMixer` / `createEnhancedPASpeaker` unreachable.
  Impact: an advertised resilience feature that does not exist. Shipping an untestable fallback
  is worse than shipping none, because it stops anyone looking for the real failure.
  Recommended solution: add `type` to each config and verify the fallback renders, or delete the
  three builders and log an explicit "model unavailable".
  Acceptance criteria: either the fallback is exercised by a test, or the dead code is gone.
  Estimated effort: Medium
  Business value: Low
  Technical debt reduction: Medium

- [ ] Route PA speaker textures through TextureLoader and remove the magenta error state
  Priority: Low
  Category: Bug
  Area: Textures
  Affected files: `js/modelLoader.js`
  Problem: `applyPASpeakerTextures()` loads four textures with bare `new BABYLON.Texture` — no
  timeout, no IndexedDB cache, no in-flight dedup, i.e. none of the three primitives the rest of
  the file was refactored to use. Its error handler paints the speakers **magenta**.
  Impact: a debug artefact that will reach users on any texture 404.
  Recommended solution: route through `TextureLoader`; fall back to dark grey with one toast.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [ ] Wire `types/vrclub.d.ts` into a `tsconfig.json` with `checkJs`, or delete it
  Priority: Low
  Category: Developer Experience
  Area: Tooling
  Affected files: `types/vrclub.d.ts`
  Problem: referenced by nothing — no `// @ts-check`, no `tsconfig.json`, no `checkJs`. It is
  documentation that cannot go stale loudly.
  Impact: given a `window`-global architecture with an 11-layer inheritance chain, type checking
  would add real value; an unwired declaration file adds none.
  Recommended solution: add a `tsconfig.json` with `allowJs` + `checkJs` and fix the fallout
  incrementally, or delete the file.
  Estimated effort: Medium
  Business value: Medium
  Technical debt reduction: Medium

- [ ] Add a protected deploy job and dependency update automation
  Priority: Low
  Category: Developer Experience
  Area: CI/CD
  Affected files: `.github/workflows/ci.yml`, `package.json`
  Problem: the README's "deploy `dist/` to static hosting" remains a manual step — there is no
  tag-triggered release, environment protection, or automated dependency update policy.
  The redundant `http-server` dependency was removed 2026-08-23; `npm start` and `npm dev` now use
  the hardened dependency-free server with traversal guards, security headers and `$PORT` support.
  Recommended solution: add a `deploy` job gated on `main` using `actions/deploy-pages`, with an
  approved production environment; add Dependabot or Renovate.
  Estimated effort: Small
  Business value: Medium
  Technical debt reduction: Low

- [ ] Close the dev/prod strict-mode divergence
  Priority: Low
  Category: Technical Debt
  Area: Build
  Affected files: `js/assetCache.js`, `js/audioUtils.js`, `scripts/build.mjs`
  Problem: `js/assetCache.js` and `js/audioUtils.js` carry `typeof module !== 'undefined'` CJS
  export blocks. esbuild detects those markers and wraps the ENTIRE concatenation in
  `__commonJS`, prepending `"use strict"`. Dev therefore runs sloppy mode and production runs
  strict mode — and the CJS blocks, dead in dev, execute in the bundle.
  Impact: latent, not live (probed: no top-level `this`, no `with`, no `eval`, and `no-undef`
  catches implicit globals). But sloppy-only behaviour would work in dev and throw in prod.
  Recommended solution: prepend `'use strict';` per file so both agree, and move the test-only
  exports into the harness (`unit.test.mjs` already uses `vm.runInContext` for everything except
  `audioUtils.js`).
  Acceptance criteria: no `module.exports` in `js/`; dev and prod agree on strict mode.
  Estimated effort: Small
  Business value: Low
  Technical debt reduction: Medium

- [ ] Pack proper ORM textures instead of reusing a greyscale roughness map
  Priority: Low
  Category: Performance
  Area: Textures
  Affected files: `js/textureLoader.js`, `textures/`
  Problem: `PBRMetallicRoughnessMaterial` reads roughness from G and metallic from B. The source
  maps are greyscale (G === B), so the roughness value is also multiplied into metallic.
  Impact: works only because every consumer's `metallic` scalar is ~0–0.2; raising it anywhere
  produces a wrong surface response. The assumption is now commented but not enforced.
  Recommended solution: pack a real occlusion/roughness/metallic map.
  Estimated effort: Medium
  Business value: Low
  Technical debt reduction: Medium

---

## Review — 2026-08-22 — Production readiness and lifecycle hardening

Scope: independent architecture, product/UX, security/reliability, rendering/performance,
testing, deployment and maintainability passes, followed by direct source verification,
`npm audit`, lint, unit/contract tests and a production build. Automated claims that were
already fixed or contradicted by source were excluded.

### Fixed during this review

- [x] ModelLoader discarded owned model records without releasing GPU resources

  Priority: High

  Category: Bug

  Area: Model lifecycle

  Affected files: `js/modelLoader.js`, `test/unit.test.mjs`

  Problem: `dispose()` cleared `loadedModels` without disposing loaded `AssetContainer`s or
  recursively disposing procedural fallback roots.

  Impact: remounting, retrying or embedding the club could retain model geometry, textures and
  materials until the page itself was destroyed, which is especially costly on Quest.

  Recommended solution: remove each container from the scene and dispose it; recursively dispose
  procedural roots without destroying shared factory materials.

  Acceptance criteria: a unit test covers both record shapes and verifies all ownership handles
  are cleared.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: High

- [x] Quota recovery copied every cached binary asset into JavaScript heap

  Priority: High

  Category: Performance

  Area: IndexedDB asset cache

  Affected files: `js/assetCache.js`, `test/unit.test.mjs`

  Problem: eviction and TTL pruning used `getAll()`, deserializing all model and texture payloads
  at the exact moment the device was already under storage pressure.

  Impact: tens of megabytes of duplicate transient heap and a credible tab-termination risk on
  memory-constrained headsets.

  Recommended solution: migrate caches to schema version 2 with a timestamp index and select only
  primary keys through `getAllKeys()`.

  Acceptance criteria: eviction uses the timestamp index, never reads payload records, and retains
  the oldest-first policy.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: High

- [x] Model body downloads ignored cancellation during teardown

  Priority: Medium

  Category: Reliability

  Area: Network / lifecycle

  Affected files: `js/assetCache.js`, `js/modelLoader.js`, `test/unit.test.mjs`

  Problem: `fetchBodyWithTimeout()` overwrote a caller's signal, and `ModelLoader` supplied no
  lifecycle-owned abort signal.

  Impact: retries or disposal could leave large GLB downloads running for up to 60 seconds against
  a scene that had already been torn down.

  Recommended solution: chain caller cancellation into the timeout controller and abort the
  loader-owned controller from `dispose()`.

  Acceptance criteria: an already-aborted caller signal reaches `fetch()` as aborted; disposing a
  loader aborts its active model requests.

  Estimated effort: Small

  Business value: Medium

  Technical debt reduction: Medium

- [x] Service-worker updates forcibly reloaded active desktop and XR sessions

  Priority: High

  Category: UX

  Area: PWA updates

  Affected files: `js/ui-init.js`, `css/styles.css`, `test/contract.test.mjs`

  Problem: the update notification immediately posted `SKIP_WAITING`; there was no acceptance
  despite comments and copy saying the user controlled the reload.

  Impact: a background deployment could eject a guest from XR and stop audio mid-session.

  Recommended solution: show a persistent, keyboard-focusable update prompt and post
  `SKIP_WAITING` only from its explicit Reload button.

  Acceptance criteria: installing a waiting worker does not reload by itself; one user activation
  requests activation, and duplicate prompts are prevented.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: Medium

- [x] Exiting XR permanently disabled static-material freezing

  Priority: Medium

  Category: Performance

  Area: Desktop/XR handoff

  Affected files: `js/club/01-core.js`

  Problem: `applyDesktopSettings()` unconditionally unfroze every material even though XR entry
  only thaws known animated materials and static ownership is established at creation time.

  Impact: one XR round trip imposed avoidable material readiness work for the remainder of the
  desktop session.

  Recommended solution: preserve creation-time freeze state and remove the global unfreeze sweep.

  Acceptance criteria: static materials remain frozen after desktop → XR → desktop; animated LED
  and strobe materials continue updating.

  Estimated effort: Small

  Business value: Medium

  Technical debt reduction: Medium

- [x] Balanced-tier startup instantiated and animated the ultra-tier crowd before hiding it

  Priority: High

  Category: Performance

  Area: Startup / crowd

  Affected files: `js/club/11-audio-crowd.js`, `js/club/02-lifecycle.js`, `test/unit.test.mjs`

  Problem: awaited startup created all 14 dancer instances on every device even though Quest's
  balanced tier displays six.

  Impact: unnecessary clone, skeleton and animation-group work delayed the first usable frame and
  increased retained memory on the primary target device.

  Recommended solution: instantiate only the active tier count and retain source containers plus
  slot metadata so higher tiers can expand synchronously on demand.

  Acceptance criteria: balanced/high/ultra initially create 6/10/14 dancers; raising the tier adds
  only missing dancers and never duplicates an existing name.

  Estimated effort: Medium

  Business value: High

  Technical debt reduction: Medium

- [x] Development dependencies contained five high and one moderate known vulnerability

  Priority: High

  Category: Security

  Area: Toolchain dependencies

  Affected files: `package.json`, `package-lock.json`

  Problem: `brace-expansion`, `js-yaml`, `qs` and two `sharp` installations were vulnerable;
  upstream `@gltf-transform/cli` still pinned the vulnerable `sharp ~0.34.5` line.

  Impact: CI and local asset-processing jobs consumed vulnerable parsers and native image tooling.

  Recommended solution: apply nonbreaking lockfile updates and override `sharp` to patched 0.35.3,
  then execute the real avatar optimization workflow to prove compatibility.

  Acceptance criteria: `npm audit --audit-level=low` reports zero vulnerabilities and a temporary
  avatar optimization completes successfully.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: High

### New open items

- [ ] Add structural tests for the Web Audio spatial graph

  Priority: Medium

  Category: Testing

  Area: Audio

  Affected files: `js/club/11-audio-crowd.js`, `test/unit.test.mjs`

  Problem: URL policy and analyser behavior are tested, but construction and teardown of the HRTF
  panners, filters, compressor, room delay and convolver are not.

  Impact: a node-order, parameter or disconnect regression can silently flatten or break the
  experience's primary spatial cue.

  Recommended solution: provide a minimal Web Audio test double and assert graph topology,
  critical node parameters, listener updates and idempotent teardown without decoding audio.

  Acceptance criteria: tests fail when a PA panner is omitted, HRTF is disabled, the analyser is
  moved after spatial attenuation, or disposal leaves a source running.

  Estimated effort: Medium

  Business value: High

  Technical debt reduction: Medium

- [ ] Replace name-based material mutability with an explicit factory option

  Priority: Medium

  Category: Refactor

  Area: Materials

  Affected files: `js/materialFactory.js`, material creation call sites, `test/unit.test.mjs`

  Problem: `MaterialFactory.isHotMutated()` infers whether a material may be frozen from substrings
  in its name. A rename or new animated material can silently change runtime behavior.

  Impact: accidental freezing breaks animations; accidental nonfreezing increases CPU work across
  a material-heavy scene.

  Recommended solution: add an explicit `mutable` configuration option, migrate call sites, and
  keep name matching only as a temporary compatibility fallback with a warning.

  Acceptance criteria: every runtime-mutated material opts in explicitly; tests prove names no
  longer decide freeze behavior; the compatibility fallback is removed.

  Estimated effort: Medium

  Business value: Medium

  Technical debt reduction: High

- [ ] Expose online/offline state and document the offline capability boundary

  Priority: Low

  Category: UX

  Area: PWA / audio

  Affected files: `README.md`, `js/ui-init.js`, `index.html`

  Problem: the app has an offline shell and persistent binary caches, but neither the UI nor the
  documentation explains that local exploration can work offline while radio streams cannot.

  Impact: users cannot distinguish an offline audio limitation from a broken club and may not know
  the installed experience is useful without venue Wi-Fi after the first load.

  Recommended solution: add a restrained connectivity state to the audio panel and a README table
  describing first-load, cached scene, local-file and streaming behavior.

  Acceptance criteria: changing `navigator.onLine` updates the audio status without blocking local
  files; documentation accurately lists which workflows require a network.

  Estimated effort: Small

  Business value: Medium

  Technical debt reduction: Low

---

## Review — 2026-08-23 — Full product and engineering assessment

Scope: product, UX/accessibility, architecture, maintainability, security, privacy, rendering,
performance, assets, testing, browser compatibility, PWA behavior, deployment and legal readiness.
Three independent model reviews were reconciled against source and runtime evidence; claims
contradicted by the repository were excluded.

### Fixed during this review

- [x] Existing browser coverage was not a required CI check

  Priority: High

  Category: Testing

  Area: CI / WebXR

  Affected files: `.github/workflows/ci.yml`

  Problem: 461 lines of Playwright desktop and emulated Quest coverage ran only by hand.

  Impact: production-only rendering, WebGL, WebXR and service-worker regressions could merge with
  green CI.

  Recommended solution: run the serial suite in Linux CI with Chromium and preserve diagnostics
  on failure.

  Acceptance criteria: E2E is required after the cross-platform verify matrix and uploads traces,
  screenshots, video and the HTML report when it fails.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: High

- [x] Supported Node releases were not represented in CI

  Priority: Medium

  Category: Reliability

  Area: Toolchain / server

  Affected files: `.github/workflows/ci.yml`

  Problem: `package.json` supports Node 20 and newer, but CI exercised only Node 20. A Node 24
  response-lifecycle defect had already escaped that matrix during this review cycle.

  Impact: users on a supported current Node release could hit failures absent from CI.

  Recommended solution: run syntax, lint and tests on Node 20 and 24 across Ubuntu and Windows;
  build and upload artifacts once on the baseline runtime.

  Acceptance criteria: the verify matrix contains both runtimes and operating systems without
  duplicating payload artifacts.

  Estimated effort: Small

  Business value: Medium

  Technical debt reduction: Medium

- [x] Asset weight and licence-manifest completeness had no automated controls

  Priority: High

  Category: Legal / Performance

  Area: Assets

  Affected files: `scripts/audit-assets.mjs`, `test/contract.test.mjs`, `package.json`,
  `.github/workflows/ci.yml`

  Problem: model/texture weight required manual inspection, and a new GLB could ship without an
  entry in `ASSETS.md`.

  Impact: Quest startup regressions and missing third-party notices could remain invisible.

  Recommended solution: report source asset totals and largest files in CI; recursively require
  every shipped GLB to be named in the legal manifest.

  Acceptance criteria: the audit reports 65.26 MiB across 27 files and identifies every file over
  5 MiB; the contract suite fails for an undocumented GLB. Existing provenance gaps remain tracked
  in the original release-blocking item.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: Medium

- [x] Development used a redundant, less-hardened static server

  Priority: Medium

  Category: Security / Cleanup

  Area: Local serving

  Affected files: `package.json`, `package-lock.json`, `scripts/serve.mjs`,
  `.github/copilot-instructions.md`

  Problem: `npm start` and `npm dev` bypassed the server used in production, including path
  containment, denied-path policy, security headers, compression and injected-port support.

  Impact: development did not exercise production serving behavior and carried 27 unnecessary
  transitive packages.

  Recommended solution: use `scripts/serve.mjs` everywhere and remove `http-server`.

  Acceptance criteria: package installation removes the dependency, reports zero vulnerabilities,
  and local/production serving share one implementation.

  Estimated effort: Small

  Business value: Medium

  Technical debt reduction: Medium

### Confirmed release blockers

No duplicate open items were added. Public release remains blocked by the existing asset-licensing
item: the PA speaker lacks creator/source provenance and raw Mixamo GLBs lack redistribution
clearance. The measured 65.26 MiB asset payload, default third-party radio connection, large
lifecycle/fixture methods, unenforced declaration file and absent protected deployment remain
tracked above.
