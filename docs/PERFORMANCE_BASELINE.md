# Performance Baseline

Use the in-app debug overlay (`D`) to capture FPS, estimated draw calls per frame, active/total meshes, and material count from the same camera preset and show state.

## 2026-07-29 Desktop Chromium

Configuration: production bundle, 1280 x 800, default outside camera, all local GLBs loaded, integrated test browser.

| Metric | Before review | Current |
|---|---:|---:|
| Total meshes | 1,003 | 968 |
| Active meshes | 609 | 639 |
| Materials | 495 | 489 |
| Estimated draws/frame | not instrumented | 1,628 |

Active mesh counts are camera- and show-dependent, so only compare them from the same preset. The integrated browser ran at 4 FPS under automation and is not representative of desktop or headset performance; its draw count is a reproducible complexity baseline, not a frame-rate target.

Static material-group merging removes 56 potential submissions from the entrance and dance-floor grid. Mirror reflection spots are tiered to 140/90/48 for ultra/high/balanced; Quest uses balanced with every third beam enabled, cutting 92 raycasts per mirror update and up to 216 enabled spot/beam meshes relative to ultra.

## 2026-09-30 Desktop Chromium — CPU profile of `updateAnimations()`

Configuration: production bundle, integrated browser (Adreno X1-85 laptop iGPU, ANGLE/D3D11),
708 x 861 render size, `high` tier, NOCTURNE driving, no audio. Timings wrap each
per-frame update method for 5 s; they are CPU time on this machine, not a headset result.

| Measurement | Before | After |
|---|---:|---:|
| `updateEyeAdaptation()` per frame | 109 ms | 0.00 ms |
| One `imageProcessing.exposure` write (556 observers) | 104–130 ms | not written per frame |
| Frame rate, non-mirror cue | 6–8 fps | 36.6 fps |
| Mirror-ball pick (`scene.pickWithRay`) | 0.97 ms | 0.38 ms |
| `updateMirrorBall()` per frame, mirror cue, ~31 picks | 31 ms | 12 ms |
| Frame rate, mirror cue pinned | 16.6 fps | 23.4 fps |

Scene at capture: 1,115 meshes, 493 active, 548 materials, 506 draw calls, 31 skeletons,
131 alpha-blended active meshes. The remaining mirror-ball cost is Babylon walking every
scene mesh per pick; see `BACKLOG.md`.

## Quest Check

On the headset, select the same camera preset, enable the mirror ball, press `D`, and record the overlay after ten seconds. Compare balanced and high only outside immersive VR; entering VR always applies the balanced mirror-spot budget. Target a stable headset refresh rate with no periodic heap-growth hitching.
