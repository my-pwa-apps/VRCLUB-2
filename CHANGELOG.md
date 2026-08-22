# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The cache token in `package.json` (`cacheToken`) identifies a deployed build; it is
kept in lockstep with `index.html`, `sw.js` and `serviceworker.js` by
`npm run version:bump` and enforced by a contract test.

## [Unreleased]

### Added

- Production browser coverage now verifies laser-sheet exclusivity, the exact moving
  strobe sequence, Photosensitive Safe Mode suppression, synchronized room colors,
  and the mounting point and motion axis of both ceiling-sheet variations.

### Fixed

- VR lighting now uses a brighter headset-specific exposure with stronger glow and
  a lower, still-controlled bloom threshold, restoring fixture and beam presence
  without applying the desktop pipeline's broad LED-wall wash.
- Persistent VR smoke now retains enough ambient haze and floor-fog particles to stay
  visible between machine bursts, with a small headset-only opacity lift that is fully
  restored to desktop values on XR exit.
- NOCTURNE now repeatedly gives the LED wall, lasers, mirror ball, and moving heads
  exclusive passages. Nine recurring looks are single-subject cues; layered systems
  remain reserved for builds, transitions, and peak detonation/afterburn moments.
- NOCTURNE now includes recurring strobe-only clockwise chases, diffuse laser-sheet
  passages through the existing haze, and selected full-room color locks that align
  the LED wall, pencil lasers, moving heads, and mirror ball to one master hue.
- The existing laser-sheet effect is now constructed during startup, originates inside
  the rear wall, uses restrained additive haze scatter without writing depth, and no
  longer floods the dance floor like an opaque surface.
- Laser sheets now vary between the rear wall and left/right ceiling-truss mounting
  points. Authored cues move them slowly either vertically or laterally while reusing
  one transparent mesh and no additional GPU lights.
- VR now renders at a conservative 1.2x per-eye framebuffer scale with FXAA retained
  as a compositor-independent fallback, reducing jagged truss, rail, and fixture edges
  without enabling a heavyweight headset-only pipeline.
- Moving-head volumes no longer use a negative depth bias that distorted stereo
  occlusion, mirror-ball beam gradients now expose their alpha channel, and the frozen
  floor probe no longer captures a stale frame of the animated LED wall.
- The DJ avatar now faces the dance floor instead of the LED wall. Existing wall-neon
  planes are opaque and visible from inside the room rather than entering the VR
  transparency path or disappearing through back-face culling.
- Mirror-ball reflections now rotate with the ball's actual Babylon transform instead
  of sweeping in the opposite direction. Reflected shafts are correctly aligned to
  their Y-axis geometry, sparsely haze-gated, distance-faded, and terminate in soft
  projected spots. All four incident fixtures now render equally legible restrained
  shafts while only one consumes a real GPU light slot.
- Restored the four audience blinders that were still exposed in controls and NOCTURNE
  cues but had no meshes or update path. Strobes now use larger emitter faces and a
  synchronized burst clock so both fixture types produce readable hits.
- Moving-head beams now use lower-density atmospheric scatter, view-angle edge falloff,
  and a full fade before the receiving surface instead of reading as hard translucent
  cones.
- NOCTURNE now owns LED hue timing as well as pattern timing. The LED wall and mirror
  ball receive the VJ Director's phrase palette together, eliminating independent
  three/four-second color clocks that broke authored looks mid-cue.
- Model and avatar teardown now releases owned containers and procedural hierarchies;
  disposing during a GLB download also aborts the body read.
- IndexedDB quota recovery now selects timestamp-indexed keys instead of deserializing
  every cached binary payload into memory.
- Service-worker updates wait for an explicit **Reload now** action instead of ejecting
  users from an active desktop or XR session.
- Exiting XR preserves static material freezing, and the audio overlay rejects duplicate
  activation.
- Development dependency advisories were cleared, including a tested `sharp` override for
  the glTF optimization toolchain.
- Balanced and high graphics tiers instantiate only their visible crowd during startup;
  raising quality creates the missing dancers on demand.
- **Photosensitive Safe Mode is now reachable before the strobes fire.** A warning and
  an opt-in toggle sit on the splash screen, the preference defaults to on under
  `prefers-reduced-motion`, and the in-app control is the first section of a panel that
  can now actually be scrolled. Previously the only control was clipped off-screen on any
  viewport under ~1070 px tall.
- **The audio button is on screen.** `margin-bottom: -60px` (a workaround for a collision
  with the camera bar) had pushed ~90% of it below the viewport.
- **`updateAnimations()` now runs before `scene.render()`**, removing a permanent
  one-frame lag from every fixture, the head-bob and the eye adaptation.
- **Beams no longer disappear permanently**: two unclamped `Math.acos()` calls could write
  NaN into a pooled quaternion, poisoning the world matrix for the rest of the session.
- **The device light budget now reaches the GPU.** The clamp was suppressed by
  `blockMaterialDirtyMechanism` and by material freezing; unblocking it naively then
  produced a continuous `GL_INVALID_OPERATION: uniform buffer too small`. Both are fixed
  and verified at runtime (0 of 477 lit materials over budget).
- **The PWA works.** The service worker precached unversioned URLs the page never requests
  (so every core asset downloaded twice and nothing was ever served from cache), was copied
  unmodified into `dist/` where all its paths 404 (and `addAll` is atomic, so production
  precached nothing), cached ~100 MB of binaries IndexedDB already owned, and had an
  offline fallback that could never hit. It now caches an app shell whose URLs are generated
  by the build, and ships an update prompt instead of hot-swapping the controller.
- **Production can no longer silently lose a source file**: the bundler derives the script
  list from `index.html` instead of keeping a second, untested copy.
- Nine frame-rate-independence violations; `dt` was also 4% short of real time.
- A shared `lastColorChange` property meant neither the spotlight nor the LED palette
  cycler honoured its own interval.
- The dance-floor LED strip divided an already-normalised audio value by 255, making it
  non-reactive and brighter with no audio than with it.
- Strobing spotlights never dimmed their actual `SpotLight` (a dead assignment 350 lines
  from its overwrite), so the floor never went dark between flashes.
- The strobe bloom spike was never restored when safe mode was enabled mid-flash.
- Sub-woofer grilles latched at their last excursion whenever bass stopped.
- `dispose()` leaked seven categories of GPU and host resource, including a whole second
  HDR pipeline when disposing during a VR session.
- VR jump and sprint were dead in every session after the first.
- The RETRY button hung the app forever instead of retrying.
- `ModelLoader` left orphaned geometry *and* a duplicate model in the scene on any
  post-load failure.
- `TextureLoader`'s reference count did not count references (a use-after-free trap).
- The fetch deadline did not cover the response body, so a stalled download hung startup.
- IndexedDB writes resolved before commit, silently losing quota errors.
- `LightFactory.disposeGroup()` skipped every other light.
- The `forced-colors` media block targeted class names that do not exist in the document.

### Added

- A camera-relative VR quick menu opened with the Quest `Y`/menu button. Controller
  rays can toggle spots, lasers, mirror ball, strobes, blinders, LED wall and smoke,
  advance the LED pattern, or close the panel from anywhere in the club.
- Photosensitivity warning and splash-level Safe Mode opt-in.
- Keyboard shortcuts: `Space` play/pause, `B` blackout, `F` drop, `1`–`4` camera presets.
  The debug overlay moved from a bare `D` (which collides with the movement keys) to
  `Ctrl+Shift+D`.
- A RESET button restoring documented VJ defaults, volume control, a now-playing readout,
  and persistence of the last stream URL.
- Real PWA icons (192/512/maskable) generated by `npm run icons`, plus `id` and `scope` —
  the app was not previously installable.
- `LICENSE` and `ASSETS.md` recording the licence and provenance of every shipped binary.
- `_headers` for static hosts, which send no `frame-ancestors` of their own.
- CI: a Windows matrix leg, a 75 MB payload budget, `npm audit`, and build artifacts.

### Changed

- The PBR environment texture is vendored; the critical path is now entirely same-origin
  and a contract test enforces it.
- Deploy payload reduced from 109.5 MB to 60.9 MB by shipping only referenced model assets
  and deleting ~30 MB of unreferenced and duplicated files.
- "Enter VR" is a top-level control with a real capability check; the settings panel that
  contained nothing else was removed.
- The DOM and in-world VJ surfaces now delegate to shared `VRClub` methods instead of
  reimplementing the same actions differently.
- Cycling controls keep their value in the label instead of reverting after 1.5 s.
- Accessibility: `aria-pressed` on every toggle, named sliders with `aria-valuetext`,
  `role="group"` instead of a contradictory `role="dialog"`, `inert` main content behind the
  splash, 44 px targets, and a non-colour active-state marker.
- Responsive breakpoints and safe-area insets (the stylesheet previously had none).
- 16 source-scanning tests replaced with behavioural ones, including a smoke test over all
  37 LED wall patterns and a guard against reintroducing a fixed 60 fps frame step.
- `npm start` no longer serves source files with a one-year `immutable` cache header.

### Added (earlier in this cycle)

- The official SUNSHINE LIVE Techno radio feed now starts when the guest enters the
  club, providing audio-reactive music by default while remaining replaceable from
  the audio panel.

### Changed

- Aligned desktop and DJ-table VJ controls with the implemented four spotlight
  patterns and core fixture capabilities; Safe Mode now suppresses moving-head flashes.
- Camera viewpoints now collapse behind a compact camera button and close after selection.
- Synchronized PA collision volumes and documentation with the existing rear-truss rigging.
- Restored desktop/VR scene parity: the XR camera now receives bloom and tone
  mapping, runtime fixture materials remain animated, VR haze uses its configured
  density, and entering XR no longer removes mirror-ball reflections.
- Removed the obsolete right-wall bar that was mostly hidden by desktop camera
  framing but prominent from the XR dance-floor spawn.
- Restored overhead rig visibility and LED-wall clarity in XR by keeping native
  render scale, moderate foveation and normal scene semantics; mirror-ball rays
  now hit non-interactive structure and use headset-readable beam intensity.
- Replaced 11 stale and redundant camera presets with four immersive viewpoints
  aligned to the current entrance, dance floor, DJ booth, and lighting rig.
- Split the VRClub monolith into 11 focused source layers and added a content-hashed esbuild production bundle.
- Reduced static scene submissions, tiered mirror-ball reflections, and removed recurring spotlight/LED allocations.
- Added runtime tests, CI, ESLint, startup progress, accessibility improvements, vendored Babylon, and compressed avatars.

## [1.1.0] - 2026-07-29

### Added

- Self-hosted Babylon.js bundles under `js/vendor/`, removing a hard third-party
  dependency from first load. (There is deliberately no CDN fallback: a contract test
  forbids one, so an outage cannot silently change what the app is running.)
- Real-time shadow generators on the DJ key light and two truss spots, so the
  existing contact-hardening / tier plumbing finally has something to act on.
- Determinate startup progress: `init()` publishes stage progress and the splash
  screen renders a bar and a stage label.
- `js/ledPatterns.js` — the ~45 LED wall pattern functions extracted from the
  monolith into a data-driven registry.
- Per-system update methods (`updateMirrorBall`, `updateSpotlights`, `updateStrobes`,
  `updateLasers`, `updateLaserSheet`, `updateFogMachines`, …) sharing one per-frame
  context object.
- Runtime unit tests (`test/unit.test.mjs`) covering `_isSafeAudioUrl()`,
  `MaterialFactory._cacheKey()`, `InFlightRegistry.run()` and ShowDirector ramp
  resolution and movement selection.
- GitHub Actions CI running `npm run check`, `npm run lint` and `npm test`, plus a
  separate Subresource Integrity verification job.
- ESLint flat config (`npm run lint`).
- `npm run version:bump` — rewrites every `?v=` cache-busting token in one step.
- Keyboard support for the VJ, audio and settings panels: Escape to close, focus
  moved into the panel on open and restored to the trigger on close.
- `<main>` landmark and a heading hierarchy for screen-reader navigation.

### Changed

- Crowd size now responds to a runtime graphics-tier change instead of being fixed
  at load.
- The reflection probe is rebuilt at the new resolution when the tier changes.
- Spotlight pan/tilt smoothing is frame-rate independent.
- `ModelLoader` takes an explicit `maxLights` instead of falling back to a
  hard-coded `3`.
- The duplicate stream-URL control in the settings panel was removed; the audio menu
  is the single entry point.
- `startAudioStream()` and `startAudioFromFile()` share one `_playAudio()`
  implementation.
- `scripts/serve.mjs` resolves symlinks and re-asserts the document root before
  streaming a file.
- `docs/` pruned: seven self-declared archival files removed, the rest explicitly
  labelled current or archived in `docs/README.md`.
- README expanded with architecture, Quest testing and troubleshooting sections.

### Removed

- `npm run serve` (undocumented `python -m http.server` duplicate of `npm start`).
- Dead code markers: commented-out laser-sheet assignments, `void metallicPath;`,
  the duplicated `ceilingY` constant and the unused `TEX_DEBUG` flag.

## [1.0.0] - 2026-07-28

Initial documented baseline: Babylon.js 8.30.5 WebXR nightclub with the NOCTURNE
composed light show, graphics quality tiers, shared asset cache and the contract
test suite.
