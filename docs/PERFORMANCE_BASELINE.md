# Performance Baseline

Use the in-app debug overlay (`Ctrl+Shift+D`) to capture FPS, engine-reported scene submissions per
sampled frame, active/total meshes, and material count from the same camera preset and show
state. The e2e browser-resource budget tracks a different set of figures on purpose:
active-submesh proxy draws, ordinary 2D RGBA texture estimates, and cube/render-target RGBA
estimates are logged separately and should not be compared one-for-one with the overlay's
submission counter.

## 2026-07-29 Desktop Chromium

Configuration: production bundle, 1280 x 800, default outside camera, all local GLBs loaded, integrated test browser.

| Metric | Before review | Current |
|---|---:|---:|
| Total meshes | 1,003 | 968 |
| Active meshes | 609 | 639 |
| Materials | 495 | 489 |
| Engine-reported submissions/frame | not instrumented | 1,628 |

Active mesh counts are camera- and show-dependent, so only compare them from the same preset.
The integrated browser ran at 4 FPS under automation and is not representative of desktop or
headset performance; its submission count is a reproducible complexity baseline, not a
frame-rate target.

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

## 2026-09-30 (follow-up) — Frame-time spikes, not averages

Same machine and build as above, `high` tier, 45–60 s captures.

| Measurement | Before | After |
|---|---:|---:|
| Worst frame over 45 s (cold) | 7,043 ms | startup only (see VR entry gate) |
| Shader variants compiled by 7 forced cue changes | 20 + 17 for two switches | 5 in total |
| Frames > 150 ms during cue changes | 676 / 1,073 / 396 ms | none |
| Steady frame p50 / p99 | 21.4 / 268 ms | 17.5 / 62 ms |
| Shadow-map passes per frame (both unsampled) | 2 x 1024² | 0 |
| Strobe flash frame vs other frame | 45.3 vs 26.1 ms | unchanged (open item) |
| JS heap after forced GC, 60 s steady | — | 125.6 → 127.5 MB (flat; no leak) |
| Allocation rate, 10 s sample | — | ~21 MB/s, ~68% Babylon skeletal interpolation |

After ENTER the club shows ~12 s of 250–600 ms main-thread stalls while the DJ console and
PA GLBs parse and instance (Babylon frame time stays 17–40 ms in those gaps). Enter VR now
waits for that load.

## 2026-10-04 Browser resource snapshot semantics

The current browser resource-budget evidence intentionally separates the figures below instead
of labelling them all "draw calls" or "GPU memory":

- **Active-submesh proxy draws:** geometry-visible work only. The 2026-10-04 review's balanced
  browser snapshot logged **330** from the e2e budget spec.
- **Engine-reported scene submissions/frame:** full Babylon submission count, including
  additional passes. A pinned high-tier entrance probe logged **321** submissions against
  **299** active-submesh proxy draws.
- **Ordinary 2D RGBA texture estimate:** approximate `width * height * 4 * mip-factor` for
  ready non-cube, non-render-target textures. The balanced browser snapshot logged **210 MiB**,
  **6** ordinary textures at least 2048 px, and **0** at least 4096 px.
- **Cube/render-target RGBA estimate:** logged separately because probes, post-process targets
  and XR eye buffers are mode-owned allocations, not ordinary content textures. The 2026-10-04
  review observed **11** cube/render-target textures outside the old ordinary-texture figure.

The updated [budget.spec.mjs](../test/e2e/budget.spec.mjs) now captures both a desktop snapshot
and an XR-entered snapshot with the existing IWER harness, but this task did not run Playwright,
so the next checked numbers must come from the owner's e2e run rather than being invented here.

## 2026-10-05 Production Chromium / IWER resource snapshot

Source revision `2671b79`; Windows, Node 24.19.0, Playwright Chromium with SwiftShader,
balanced tier, Safe Mode on, pinned `firstLight`, 20 rendered frames per sample.
These results come from [budget.spec.mjs](../test/e2e/budget.spec.mjs), not a hardware profiler.

| Metric | Desktop | Emulated XR |
|---|---:|---:|
| Engine-reported scene submissions/frame | 324 | 319 |
| Active-submesh proxy | 311 | 163 |
| Ordinary 2D RGBA+mip estimate | 256 MiB | 256 MiB |
| Cube/render-target RGBA estimate | 10 MiB | 13 MiB |
| Ordinary textures at least 2048px / at least 4096px | 6 / 0 | 6 / 0 |
| Cube textures / render-target textures | 2 / 10 | 2 / 11 |
| Enabled NPCs / NPC contact-shadow instances | 10 / 10 | 10 / 10 |
| Maximum meshes per NPC | 6 | 6 |
| LED wall meshes / logical panels | 1 / 210 | 1 / 210 |

Desktop and XR use different viewpoints in this budget test; the lower XR active-submesh
count is not evidence of equivalent-view culling or a percentage speedup. IWER renders mono,
not two physical headset eye buffers. RGBA estimates do not account accurately for actual
GPU formats, MSAA, depth allocations or driver overhead and are not resident-memory readings.
The test has a 400-submission desktop ceiling but no absolute XR submission ceiling.

`npm run audit:assets` reported 27.67 MiB across 35 files; the full uncompressed built site
was 37.66 MiB across 48 files. Neither is a measured network transfer size.
No representative desktop/Quest CPU or GPU frame time, p95/p99, thermal or reprojection result
was obtained. Historical CPU timings above must not be presented as measurements of this build.
See the [review](REVIEW_2026-10-05.md) and the existing hardware-baseline item in
[BACKLOG.md](../BACKLOG.md).

## Quest Check

On the headset, use a repeatable route through the entrance, dance floor, bar and balcony with
mirror-ball, sheet and peak safe cues. Record the headset's native refresh target, CPU/GPU
frame times, missed/reprojected frames, memory and thermal behaviour over 15 minutes. The DOM
diagnostics overlay (`Ctrl+Shift+D` with a keyboard outside immersive mode) is supporting
evidence, not a substitute for a headset timing capture. Compare quality tiers explicitly:
the detector defaults Quest to balanced, but a persisted tier override can change the selected
content budget. Do not infer stable headset performance from the emulator or one FPS sample.
