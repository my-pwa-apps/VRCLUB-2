# Quest Rendering and Performance Review

## Follow-up: lighting, LED wall and smoke

The lighting follow-up makes these bounded changes:

- Character-style replacement disposes cigarette particle systems without disposing
  their shared club haze texture.
- Synchronized strobe chase follows the physical corner order (`0, 1, 3, 2`).
- The LED wall remains one mesh and one upload per update. An initial 16-by-16 diode
  mask per tile made active panels read as centered dots; it has been removed. Each
  panel again samples one uniform-colour texel from the 21-by-10 dynamic texture.
- In VR, haze and dust beam-scattering work rotates across one third of the particles
  per frame; nozzle plumes retain full-rate lighting. Fog picks up restrained active
  fixture colour while preserving the show-master blackout and outdoor tint.
- Smoke lit by moving-head beams and laser sheets now eases into and out of each
  sampled beam instead of snapping with its position or kick-driven intensity.
  Smoke sampling removes the spot's kick-only intensity lift; sheet haze level is
  also steady through kicks. UV flow and the modest plume-density response continue
  on elapsed time. Fixture choreography and the shared flash governor are unchanged,
  and show-master blackout still clears the smoothed light immediately.
- Existing haze and nozzle-plume particles receive a subtle bounded, time-integrated
  drift after their normal particle update. It adds no particles or meshes and uses
  each particle's existing position; ambient haze drifts less than the directed jets.
  Its CPU cost on a physical headset has not been measured.

Validation:

- `npm test`: 946 tests, 945 passed, one skipped, zero failures.
- `npm run check`: 120 JavaScript files passed; `npm run lint` and `npm run build`
  passed.
- `test/e2e/character-styles.spec.mjs`: both Playwright tests passed, including the
  real-Babylon shared-texture lifetime check during live style replacement.
- Deployed only to the isolated `nocturne-dev` Pages preview on `QuestDev`
  (`https://66ed3f5d.nocturne-dev.pages.dev`). The USB-connected Quest loaded
  `assets/app-5ebb72cfdfff.js` from the development hostname and entered immersive
  WebXR successfully; production was not changed.
- A short Ultra-tier Quest capture with the automatic show and smoke active reported
  45.27 ms mean / 47.7 ms p95 (22.09 fps) against an 11.11 ms frame budget. It is a
  point capture, not a controlled A/B, and does not establish a performance gain.
  At that time, the LED texture was ready at 336 by 160; all six scene particle
  systems were running with the shared haze texture ready. The wall is now back to
  its previous 21-by-10 texture and must be rebuilt/deployed for that result. Smoke
  was already enabled and its setting was left unchanged.
- The USB screenshot showed the headset's passthrough/guardian view, not a reliable
  capture of the rendered app. Therefore the implementation is verified by runtime
  state and tests, but its subjective hyperrealism, stereo comfort and visual
  improvement are not claimed as verified.

## Follow-up: verified fixes from the USB-headset QA sweep

The follow-up implements:

- A fresh `FrameStats.Recorder.reset()` now clears stalls as well as frame samples
  and the time origin. Consecutive measurements no longer inherit startup stalls.
- Shipped NPCs and ordinary procedural rigs (staff, DJ and local mannequin) use a conservative
  whole-person motion envelope for frustum culling. Animated bind-pose bounds
  remain unsuitable. The shared envelope follows the root without per-frame
  allocation, uses each render pass's frustum and leaves original geometry bounds
  untouched for placement, picking and eye-height fitting. Uploaded/fallback rigs,
  remote bodies and the first-person/mirror double retain their prior policy.
- Street visibility retains its warmup and depth hysteresis, but additionally
  checks whether a horizontal sight line can pass both entrance openings.
  The restroom and obstructed front-wall positions no longer enable the street.
  The dance-floor preset is deliberately **not** forcibly culled: it can still
  have a sight line through the doorway. Street lights, colliders and shared
  people/animation ownership are unchanged.
- Browser-layout tests explicitly read viewport dimensions from `window`,
  resolving the three lint errors without changing the existing layout edits.

The culling regression samples every animation clip on the shipped base NPC cast
and all detailed characters using real Babylon skinned bounds. Separate frustum
checks cover both eye positions, an opposite-facing reflection camera, turning,
refitting and an offscreen root. Browser tests check actual active-mesh membership,
not just flags.

The earlier report included hypotheses that are **not established defects**.
The similarly named procedural rigs include distinct staff and resident-DJ
instances; they must not be deduplicated. Paused Babylon animatables remain
registered normally, and stopping them would change resume semantics. Mirror
quality is applied when the mirror is used; retaining its previous allocation
while away is not an extra rendering pass. Those paths are unchanged.

That earlier follow-up did not change refresh rate, cast style, facial expression,
crouch solving or AO textures. The lighting follow-up above adds only a bounded VR
particle-lighting sample; it does not claim that this or any other change fixes the
measured submission bottleneck. A higher refresh-rate request cannot fix a 20-35 fps
scene.

The original USB capture was of the deployed development build, with tracking
unavailable and the runtime's non-tracked continuation selected. After deploying
the verified fixes (`assets/app-09cc8510e110.js`) to `https://nocturnedev.mitwee.nl/`
and reconnecting the Quest 3S over USB, a repeat immersive WebXR benchmark
(90 Hz session, 4.5 s windows after 1.8 s settling, zero runtime errors and zero
recorded stalls after `resetFrameStats()`) measured the following on-device
reductions in draw calls, active bones and frame times:

| Scenario | Before: mean / p95 ms (FPS) | After: mean / p95 ms (FPS) | Before: draws / bones | After: draws / bones |
|---|---:|---:|---:|---:|
| Dance preset Ultra | 44.90 / 48.7 (22.27) | 37.91 / 41.0 (26.38) | 344 / 4208 | 243 / 1494 |
| Booth Ultra | 28.70 / 32.4 (34.84) | 22.16 / 24.6 (45.13) | 186 / 3092 | 98 / 254 |
| Balcony Ultra | 34.45 / 37.8 (29.03) | 30.95 / 33.3 (32.31) | 233 / 3092 | 140 / 623 |
| Restroom Ultra (`cityVisible: false`) | 51.57 / 56.1 (19.39) | 47.99 / 50.9 (20.84) | 528 / 4208 | 395 / 1308 |
| Front-Right Bar Ultra (`x=10.8, z=-2.0`, `cityVisible: false`) | — | 45.64 / 47.2 (21.91) | — | 320 / 1934 |
| Dance High | 39.62 / 43.2 (25.24) | 37.41 / 40.1 (26.73) | 324 / 2968 | 263 / 1246 |
| Dance Balanced | 37.22 / 42.1 (26.87) | 33.49 / 36.2 (29.86) | 295 / 1976 | 232 / 874 |
| Detailed Dance Ultra | 47.86 / 51.4 (20.89) | 41.49 / 44.5 (24.10) | 382 / 3602 | 282 / 1378 |
| Detailed Dance Balanced | 36.33 / 39.9 (27.53) | 34.17 / 36.3 (29.27) | 310 / 1694 | 258 / 742 |
| Arrival stair Ultra (`cityVisible: true`) | 48.99 / 52.7 (20.41) | 52.16 / 55.5 (19.17) | 544 / 4208 | 523 / 3174 |
| Street Ultra (`cityVisible: true`) | 50.77 / 53.7 (19.70) | 55.34 / 59.2 (18.07) | 612 / 4208 | 579 / 3608 |

These short on-device captures confirm that whole-person frustum culling and
sight-line street culling materially reduce indoor draw submissions and active
bone evaluations, while `FrameStats.Recorder.reset()` cleanly zeroes the stall
counter (`stalls: 0` across all 11 windows). Because the headset remained on a
stationary desk without 6DoF positional tracking or physical controller input,
perceived stereo comfort and physical hand/controller ergonomics remain to be
verified in a worn-headset session.

Validation of this follow-up:

- `npm test`: 943 passed, one skipped (944 total).
- `npm run check`: 120 files passed; `npm run lint`: no errors or warnings.
- `npm run build`: passed; deployed to `https://nocturnedev.mitwee.nl/` (`https://05e67275.nocturne-dev.pages.dev`).
- The final real-skin culling checks passed with translated, rotated and scaled
  actors, plus procedural crouch, lean, tracked reaches and eye-height refitting.
- Four focused Playwright regressions passed: desktop/XR active-mesh culling,
  tier down/up animation recovery, XR entry/controller registration/desktop
  restoration, and per-eye restroom-mirror rendering.
- Physical Quest 3S WebXR benchmark verified on the live deployed build across
  11 scenarios with zero runtime errors.

---

Date: 2026-10-18  
Audit source revision: `da81d1406b99e5990eeab99945d83980d084e088`  
Scope: rendering architecture, available XR measurements, tier selection and safe Quest-side
improvements. The code changes in this review are uncommitted relative to that source revision.

## Summary

The project already has a deliberately separate desktop and XR rendering path, three explicit
quality tiers, bounded crowd and atmospheric effects, instanced mirror-ball reflections, and
in-app frame/resource diagnostics. It is not useful to replace these systems or infer Quest
performance from SwiftShader.

The strongest available headset evidence is the 2026-10-14 Quest 3S capture in
[PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md): Ultra reached 51.7 ms median / 57.7 ms p95,
High reached 52.8 / 58.8 ms, and Balanced reached 48.4 / 53.3 ms. At a 72 Hz target the frame
budget is 13.89 ms; none of those profiles is close to sustaining it. Isolation showed the
application update near 1 ms, all transparent meshes and particles together below 1 ms of
median effect, all characters around 2.5 ms, and the post-process chain around 5 ms. Per-eye
opaque scene submission is the dominant reported cost. Do not present a lower tier, fewer
particles, or a software-emulator result as having solved the Quest 3S performance problem.

Two low-risk rendering changes were made:

1. Quest/Oculus browsers no longer use desktop supersampling or construct desktop-only SSAO,
   SSR and motion blur on the initial setup page or after exiting XR. The XR pipeline
   implementation is unchanged.
2. Fresh Quest 3S sessions retain the Ultra default. The owner reports that Ultra works fine
   on their headset, so the earlier proposal to make Balanced the default was reversed. Older
   Quest models still default to Balanced, and a saved selection always wins.

The lower tiers remain available as opt-in performance choices. The available capture measured
Balanced as faster on its route, but it does not override the owner's practical experience or
establish that Ultra cannot be used comfortably. The setup-page change avoids work that has no
place in a standalone headset's desktop renderer. No post-change physical timing capture has
been made, and no profile is claimed to sustain 72 Hz based on the available timing evidence.

## Current architecture

- The source is classic scripts assembled in the order defined by `index.html`; the production
  builder derives its bundle order from those tags. Rendering ownership is split across
  [`01-core.js`](../js/club/01-core.js), [`02-lifecycle.js`](../js/club/02-lifecycle.js) and
  [`03-rendering.js`](../js/club/03-rendering.js).
- Desktop uses a Babylon `DefaultRenderingPipeline`, with tier-controlled bloom, pipeline
  samples and render scale. SSAO is created in `addPostProcessing()`. SSR and object-based
  motion blur are constructed by tier-gated helpers.
- XR replaces the desktop rendering pipeline with an XR-camera-owned pipeline. It keeps bloom,
  image processing, sharpening, FXAA and tiered pipeline MSAA; desktop SSAO and SSR are
  detached/disabled and motion blur is disposed. XR uses framebuffer scale 1.0. Balanced uses
  FXAA with 1x MSAA; High and Ultra use 2x MSAA, subject to device capability and the optional
  `vrclub.vrMsaa` override.
- Fixed foveation is assigned to `session.renderState.baseLayer.fixedFoveation` only when the
  runtime exposes that property. Code inspection confirms the conditional write, not that a
  particular headset applied it or that it improved performance.
- The floor reflection probe is stopped in XR. Mirror-ball surface spots and outgoing rays use
  two thin-instance batches; the old per-ray scene-picking implementation is not present.
- Crowd capacity, haze/dust emission, mirror-ball counts and update cadences are tier-owned.
  Dancers remain on a beat-synchronized animation path; arbitrary per-frame animation skipping
  would risk visible or musical discontinuities.
- No shadow maps are active. Materials have a strict device-specific light-slot budget.
  Selective GlowLayer remains disabled because its private target lacks scene occluders.
- `FrameStats` reports render-loop intervals, `updateAnimations()` CPU time and
  `scene.render()` submission CPU time. It does not report GPU time. The browser resource
  snapshot labels its submesh count as a proxy and separates approximate ordinary-texture and
  cube/render-target RGBA estimates; these are not driver draw-call or resident-memory counts.

## Measurement quality and baseline

### What is reliable

- The 2026-10-14 Quest 3S capture is physical-device evidence for that build, route, tier and
  thermal/session state. Its median and p95 comparisons are useful as a baseline, not a
  guarantee for other Quest devices or a post-change result.
- The instrumented CPU update and submission intervals are browser-observed CPU times.
  Isolating characters, transparency and post-processing provides useful within-session
  comparisons. They do not expose GPU execution time.
- Node and Playwright tests validate contracts and rendering behavior. IWER is a mono WebXR
  emulator backed by SwiftShader; it can find regressions but cannot certify Quest throughput,
  stereo comfort, thermal behavior, reprojection or GPU memory.

### What is an estimate or unavailable

- `activeSubmeshProxyDraws` is a geometry inventory, not actual driver draw calls.
- Engine submissions include work from extra passes and XR; the difference from active
  submeshes is not attributed to a particular pass.
- RGBA texture sizes are arithmetic estimates. They do not account for actual GPU formats,
  depth buffers, MSAA allocations, compression, driver allocation or residency.
- `FrameStats` cannot report GPU frame time. A long frame with short update and submit times is
  evidence consistent with GPU-bound work, not a GPU timer query.
- IWER's mono output is not representative of two physical eye buffers. XR transition and
  startup shader compilation also need separate capture.
- The current repo's `perf-scenarios.spec.mjs` covers empty club, lighting/atmosphere, crowded
  floor and crowded peak show. It does not independently measure street, isolated mirror-ball
  plus air, active music, or a 15-minute thermal route.

### Available Quest 3S comparison (2026-10-14)

| Tier | Median frame | p95 | Approx. average rate | 72 Hz budget |
|---|---:|---:|---:|---:|
| Ultra | 51.7 ms | 57.7 ms | 19.4 fps | 13.89 ms |
| High | 52.8 ms | 58.8 ms | 18.9 fps | 13.89 ms |
| Balanced | 48.4 ms | 53.3 ms | 20.7 fps | 13.89 ms |

These figures predate the present changes and are not an A/B test of the new startup policy.
The earlier Ultra capture was 59.1 ms median / 66.5 ms p95. Native XR scale, lower pipeline
MSAA and not preserving an unread back buffer improved the valid Ultra capture to 51.7 / 57.7.
The attempted WebXR Layers multiview path rendered black and emitted WebGL error 1282; its
apparent frame-time improvement is invalid and the route was removed.

## Ranked opportunities

Evidence labels: **Measured** means a relevant runtime comparison exists; **Confirmed** means
the source establishes the behavior; **Hypothesis** means the benefit needs a controlled
capture. Effort and risk are relative engineering estimates.

| Rank | Opportunity; relevant code | Expected benefit | Effort / risk | Evidence and disposition |
|---:|---|---|---|---|
| 1 | Find a valid stereo submission reduction; `02-lifecycle.js`, WebXR projection setup | Potentially very high frame-time reduction | High / very high | **Measured blocker:** standard XR spends most of its cost submitting opaque geometry per eye. Babylon WebXR Layers multiview rendered black with this post-process stack and WebGL error 1282. **Hypothesis:** another supported route could help. Do not retry the failed path without visible, error-free headset frames. |
| 2 | Keep quality tiers user-selectable rather than forcing a lower Quest 3S default; `detectGraphicsTier()` in `01-core.js` | Preserve the owner's preferred detail and crowd density; lower tiers remain available | Small / low | **Measured:** Balanced was 3.3 ms lower median and 4.4 ms lower p95 than Ultra on the capture route, but still missed 72 Hz badly. **Owner report:** Ultra works fine on their Quest 3S. **Disposition:** Fresh Quest 3S stays on Ultra; older Quest models default to Balanced; saved selections win. |
| 3 | Remove desktop-only rendering cost from Quest's pre-XR setup path; `addPostProcessing()`, `_createScreenSpaceReflections()`, `_createMotionBlur()`, `applyDesktopSettings()` | Avoid redundant 2D setup work; possible faster/steadier setup and return from XR | Small / low | **Confirmed:** desktop SSR/SSAO/motion blur and Ultra 0.8 render scale could run before XR. Their Quest setup-page millisecond savings were not captured. **Implemented:** no Quest/Oculus desktop SSAO/SSR/motion blur and render scale remains 1.0. |
| 4 | Reduce the dominant opaque stereo submission cost without removing the room; XR rendering and model/mesh submission | High if a valid approach is found | Large / high | **Measured:** per-eye opaque scene submission dominates the physical capture. **Hypothesis:** pipeline-supported multiview or geometry consolidation may reduce it; the attempted multiview route is unsafe. |
| 5 | Add reproducible coverage for street, separate atmosphere/mirror-ball and active music; `perf-scenarios.spec.mjs`, `xr-measure.mjs` | Improves diagnosis and catches load regressions; no direct runtime saving | Medium / low | **Confirmed gap:** current performance scenarios cover four broad cases, not the full seven requested. Need equal poses and explicit load state; emulator values remain regression-only. |
| 6 | Profile the roughly 5 ms post-process contribution and compare individual XR passes; `01-core.js`, `03-rendering.js` | Moderate if a pass can be removed without harming visual clarity | Medium / medium | **Measured:** the chain costs about 5 ms in the existing physical isolation. **Hypothesis:** individual effect savings and visual impact are unknown. Preserve FXAA/bloom until a headset A/B shows an acceptable result. |
| 7 | Test crowd-animation LOD against beat and character motion; `11-audio-crowd.js`, `crowdDance.js`, `avatarManager.js` | Potential CPU headroom at high population | Large / medium-high | **Measured:** suppressing characters together saved about 2.5 ms in the old physical isolation. **Hypothesis:** near/mid/far LOD could preserve perceived density, but pausing or desynchronizing clips risks frozen poses and beat drift. Do not implement until per-subsystem and real-music captures justify it. |
| 8 | Improve contact cues and surface realism with inexpensive authored/baked approximations; material/lighting factories and venue dressing | High realism benefit; runtime cost unknown | Medium / medium | **Confirmed limitation:** no active shadow maps and only a few photometric slots reach each surface; the 2026-10-14 experience review identifies weak grounding. **Hypothesis:** AO decals or baked material detail improve presence without expensive shadow maps; requires visual review and a Quest memory check. |
| 9 | Re-profile mirror-ball batches and dynamic buffer writes; `06-effects.js`, `08-animation-fixtures.js` | Unknown; could reduce CPU or vertex processing | Medium / medium | **Confirmed:** implementation is already analytic and thin-instanced, replacing historical per-ray picks. The old ~12 ms pick cost no longer describes the code. No current physical CPU/GPU profile isolates the batches. |
| 10 | Evaluate GPU-native texture compression only with a local, decoder-safe pipeline; asset build scripts and `textureLoader.js` | Potentially lower GPU texture memory and bandwidth | Large / high | **Confirmed constraint:** runtime CDN decoders are forbidden, and WebP file size does not imply compressed GPU residency. **Hypothesis:** bundled Basis/KTX2 may reduce memory, but support, startup/decode cost, distribution size and visual quality need device validation. No asset format change recommended without that evidence. |

## Implemented changes

### Quest 3S default

`detectGraphicsTier()` selects Ultra for Quest 3 and Quest 3S, while legacy Quest models remain
Balanced. The owner reports that Ultra works fine on their Quest 3S; the earlier
Balanced-default change was therefore reversed. Balanced's smaller crowd and mirror-ball
budgets remain available as a manual choice. The persisted `vrclub.graphicsTier` override
remains first. Unit tests cover Quest 1/2/Pro/3/3S, unknown Quest identity, saved override
precedence and render-scale resolution.

### Quest setup-page renderer

The renderer identifies Quest/Oculus browsers independently of the selected tier. The desktop
pipeline remains native-scale there, and SSAO, SSR and motion blur are not constructed. The
guard also covers a tier change and returning from XR because those paths call the same
post-processing helpers. Non-Quest desktop tier behavior is unchanged. A focused unit test
checks that none of the three desktop-only pipeline constructors runs on the Quest path.

These changes are reversible and leave XR pipeline implementation and foveation
feature-detection logic, show logic, people animation and payment/multiplayer behavior
untouched. Quest 3S retains its Ultra XR settings by default; users can select a lower tier.

## Validation and next steps

Executed for this change:

- `npm run check`: passed, 85 JavaScript files.
- `npm run lint`: exited successfully with one warning at `test/unit.test.mjs:8412`
  (`args` is unused); no lint errors.
- `npm test`: passed, 664 tests.
- `npm run build`: passed; production app and stylesheet bundles emitted.
- Focused `budget.spec.mjs`, `vr-parity.spec.mjs` and `vrclub.spec.mjs`: 5 of 6 tests passed
  in IWER/SwiftShader. The budget and parity tests passed, as did three `vrclub.spec.mjs`
  cases. The remaining XR transition case failed twice at its DJ-root-facing assertion:
  `-0.0069937041` radians was outside the test's 0.005-radian tolerance. That assertion is
  outside the edited rendering and tier code; the cause was not established, and no
  pre-change run was made, so it is not labelled pre-existing.
- The emulated-XR budget sample after the change reported 226 engine scene submissions,
  125 active-submesh proxy draws and 10 enabled characters. These are scene-complexity
  counts, not frame-time or GPU measurements, and the pose differs from prior snapshots.

The unit tests cover the selected tier, override precedence, the desktop render scale and
absence of desktop-only post-process construction on Quest. No test result is presented as a
runtime speedup. The Playwright performance scenario test was not run in this pass; the
physical baseline remains the historical capture above.

Physical follow-up is still a release-level requirement:

1. Reproduce the 2026-10-14 route on the same Quest 3S and repeat Balanced, High and Ultra,
   with both a fresh profile and the saved-Ultra override.
2. Capture the 2D setup-page path and return-from-XR path separately; report actual headset
   frame time, not an estimate based on absent passes.
3. On a 15-minute route, collect native refresh target, CPU/GPU frame time, missed/reprojected
   frames, memory and thermal state. Include the street, crowded dance floor, mirror-ball,
   atmosphere and peak show.
4. Compare perceived sharpness and stereo stability before recommending any lower AA or
   resolution. Reconfirm photosensitive Safe Mode and the existing visual-parity test.
5. Do not report a tier as sustaining 72 Hz until the physical capture shows it.

The Chrome DevTools MCP entry was added at `.vscode/mcp.json`; this VS Code session may need a
reload before its tools are available. Browser trace tooling is not used as a substitute for
the XR performance harness or the physical headset baseline.
