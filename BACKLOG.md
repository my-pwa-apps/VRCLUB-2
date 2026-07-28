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

- [ ] The scene contains no shadow generators at all, so all shadow work is inert
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

- [ ] Babylon CDN is a single point of failure with no fallback
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

- [ ] Reflection probe resolution does not update when the graphics tier changes at runtime
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

- [ ] Decompose `updateAnimations()` into per-system update methods
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

- [ ] Split `club_hyperrealistic.js` into modules and introduce a build step
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

- [ ] Eliminate remaining per-frame allocations in the hot loop
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

- [ ] Scale spotlight pan/tilt lerp factors by `dtScale`
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

- [ ] Remove duplicated strobe burst-phase computation
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

- [ ] Consolidate the duplicated audio-stream UI
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

- [ ] Extract shared playback logic from `startAudioStream()` and `startAudioFromFile()`
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

- [ ] Add runtime tests for the pure logic layer
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

- [ ] Add CI
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

- [ ] Add ESLint with a flat config
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

- [ ] Automate the cache-busting token bump
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

- [ ] Decide the fate of `backup_aframe/`
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

- [ ] Add keyboard dismissal and focus management to the overlay panels
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

- [ ] Add a `<main>` landmark and a document heading structure
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

- [ ] Reconcile the audio URL `pattern` attribute with `blob:` support
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

- [ ] Add a CHANGELOG and adopt real versioning
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

- [ ] Expand the README
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

- [ ] Consolidate the `docs/` folder
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

- [ ] Fix the `ModelLoader` `maxLights` fallback
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

- [ ] Remove remaining dead code markers
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

- [ ] Add a Subresource Integrity check to CI
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
