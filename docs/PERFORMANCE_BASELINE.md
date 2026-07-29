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

Static material-group merging removes 56 potential submissions from the entrance and dance-floor grid. Mirror reflections are tiered to 100/60/30 spot-and-beam pairs for ultra/high/balanced; Quest uses balanced, cutting up to 140 active mirror meshes and 70 raycasts per mirror update relative to ultra.

## Quest Check

On the headset, select the same camera preset, enable the mirror ball, press `D`, and record the overlay after ten seconds. Compare balanced and high only outside immersive VR; entering VR always applies the balanced mirror-spot budget. Target a stable headset refresh rate with no periodic heap-growth hitching.
