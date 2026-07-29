# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The running build version is shown in the FPS/debug overlay (press `D`), so a bug
report can always be tied back to an entry below.

## [Unreleased]

### Added

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

- Self-hosted Babylon.js bundles under `js/vendor/` with an automatic CDN fallback,
  removing a hard third-party dependency from first load.
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
- `docs/` split into `docs/reference/` (maintained) and `docs/history/` (archival).
- README expanded with architecture, Quest testing and troubleshooting sections.

### Removed

- `npm run serve` (undocumented `python -m http.server` duplicate of `npm start`).
- Dead code markers: commented-out laser-sheet assignments, `void metallicPath;`,
  the duplicated `ceilingY` constant and the unused `TEX_DEBUG` flag.

## [1.0.0] - 2026-07-28

Initial documented baseline: Babylon.js 8.30.5 WebXR nightclub with the NOCTURNE
composed light show, graphics quality tiers, shared asset cache and the contract
test suite.
