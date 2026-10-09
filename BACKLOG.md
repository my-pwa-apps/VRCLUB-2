# Backlog

Actionable engineering items for the VRCLUB repository.
Items are grouped by the review that produced them. Unresolved items are never removed —
they are carried forward and re-prioritised.

---

## Feature - 2026-10-09 - Ambient NPC attention

- [x] **Give fixed bystanders independent, natural micro-behavior**

  **Resolved 2026-10-09.** Authored idle clips already moved the characters' breathing, hands and weight, but every
  fixed guest repeated at one exact rate and one exact facing. The street queue and bouncer therefore read as posed
  figures unless the player walked into the bouncer's reaction radius.

  **Priority:** Medium
  **Category:** Crowd realism
  **Confidence:** High
  **Area:** Side guests, balcony, street queue, bouncer and mingler solo stops
  **Affected files:** [07-animation-core.js](js/club/07-animation-core.js),
  [11-audio-crowd.js](js/club/11-audio-crowd.js), [unit.test.mjs](test/unit.test.mjs)
  **Solution implemented:**
  - `_guestSlots()` and `_streetSlots()` now give each fixed bystander distinct, slow `ambient` timing. Relaxed
    watchers scan a bounded arc and all fixed bystanders vary idle playback by at most 5%, layered over the authored
    clip rather than replacing its body motion.
  - `_updateAmbientNPC()` uses absolute-time mixed waves and elapsed-time easing, allocates nothing per frame, and
    explicitly stands down for dancers, rig-driven characters, the mingler, planted rail grips, and anyone currently
    talking to or returning from the mingler.
  - The bouncer scans a small arc while alone but still gives a nearby player his full attention. At solo watch and
    smoke stops, the mingler now changes his gaze slowly instead of holding one exact body angle for up to 105 seconds.
  **Validation:** focused Node tests verify slot coverage, rail exclusion, bounded motion, conversation ownership,
  refresh-rate independence and the bouncer's scan/visitor tracking. `npm run check` and focused ESLint pass.

---

## Feature - 2026-10-09 - Crowd dances through kick-less breakdowns

- [x] **The rhythm band: follow hats, snares and synth pulses when the kick drops out**

  **Resolved 2026-10-09.** A long breakdown could drop the kick entirely while hats, a snare or a synth arpeggio
  kept a clear pulse; without reading them the crowd fell back to its slow free `Groove_Sway` the moment the kick
  did, even on a track that was still obviously in time.

  **Priority:** Medium
  **Category:** Crowd realism / audio analysis
  **Confidence:** High
  **Area:** Crowd choreography during kick-less passages
  **Affected files:** [vjDirector.js](js/vjDirector.js), [crowdDance.js](js/crowdDance.js),
  [11-audio-crowd.js](js/club/11-audio-crowd.js), [unit.test.mjs](test/unit.test.mjs)
  **Problem:** `CrowdDance.step()` only ever saw `music.beatPresent` (the kick). With no kick, every Quaternius
  floor dancer dropped onto `Groove_Sway`, the one deliberately slow, off-grid move, regardless of how much
  rhythmic material (hats, snares, a synth arpeggio) was still audible.
  **Solution implemented:**
  - A third audio tap, the rhythm band (`rhythmFilter`, a 200 Hz high-pass, into `rhythmAnalyser`), read by the
    same audio-clock-aligned step windows as the kick band so the two are always sample-for-sample comparable
    (`_bandStep()` in `11-audio-crowd.js`).
  - `VJDirector._detectRhythm()`/`_evaluateRhythm()` score the band's onset envelope for periodicity
    (autocorrelation) AND phase-lock the onsets to the beat's sixteenth/triplet subdivisions
    (`_onsetCoherence()`), because periodicity alone falsely flagged Poisson-timed noise as a pulse. Real hats,
    snares and arpeggios measure ~0.96-0.98 coherent over a 4 s window; random hits measure 0.3-0.68.
  - `CrowdDance.step()` now takes a three-state pulse (`true` kick / `'rhythm'` rhythm-band-only / `false`
    neither). Only `false` drops the floor onto the free sway; `'rhythm'` keeps dancers on-grid with
    `RHYTHM_WEIGHTS`-reweighted, lighter moves (`Groove_HandsUp` excluded; `Groove_Sway` likelier and now also an
    on-grid choice, not only the off-grid fallback).
  - Tempo tracking was reworked from kick-to-kick interval medians to autocorrelation
    (`_autocorrelate`/`_acfAt`/`_pulseAt`/`_tempoPrior`) because the old median misread a 124 BPM set as
    140-167 BPM the moment a bassline pluck or an extra kick landed between two real beats — discovered by
    running the real detector against a downloaded Hernan Cattaneo set through `OfflineAudioContext` (temporary
    diagnostic, since removed). `_flywheel()` now synthesizes a missed bar line at its exact due time
    (`lastBeatAt + beat`) instead of the time it was noticed, fixing a frame-rate-dependent drift.
  - A syncopated kick-band hit (a bass note, an extra kick on the "and") is rejected by voting the candidate's
    phase against the last several candidates (accepted or not) — a circular median — rather than against the
    single last accepted kick, which could itself have been the syncopated hit and then lock every real kick out
    forever.
  **Validation:** 5 new `test/unit.test.mjs` cases (rhythm-band pulse vs. noise/silence, breakdown phase-nudge,
  crowd move selection during `'rhythm'`, syncopation rejection, and legitimate tempo/phase-shift recovery), each
  mutation-tested (fails when the relevant fix is reverted). Full suites pass: `npm run check` (59 files),
  `npm run lint`, `npm test` (361 tests). Not yet re-run against the real-club `crowd-dance.spec.mjs` e2e scenario
  with an actual kick-less passage, and the extra per-frame autocorrelation cost is unmeasured on Quest hardware.
  **Estimated effort:** Large
  **Business value:** Medium
  **Technical debt reduction:** Low

- [x] **Make the balcony watcher grip the rail instead of intersecting it**

  **Resolved 2026-10-09.** The watcher’s wrists were authored and tested against the top rail’s centreline, while
  every finger remained straight and pointed through the tube. The animation could therefore satisfy the old
  wrist-distance assertion while visibly putting both hands partly inside the metal.

  **Priority:** Medium
  **Category:** Character posing
  **Confidence:** High
  **Area:** Mezzanine ambient guest
  **Affected files:** [build-crowd-glbs.mjs](scripts/build-crowd-glbs.mjs),
  [11-audio-crowd.js](js/club/11-audio-crowd.js), [club-crowd-f7.glb](js/models/avatars/club-crowd-f7.glb),
  [rig.test.mjs](test/rig.test.mjs)
  **Solution implemented:** Moved her stance 10 cm back from the original placement, raised both wrists above the
  top tube, and added an optional three-segment `grip` curve to the procedural clip synthesizer. It rotates the
  index, middle, ring and pinky chains around the rail: wrist above/guest-side, middle knuckle beyond the
  dance-floor edge, fingertip below and curled back under the tube. Other synthesized clips do not provide `grip`
  and retain their existing finger animation. The real-GLB test now checks those three geometric contacts across
  the complete loop instead of accepting any wrist within 9 cm of the rail centre.
  **Validation:** `node --test --test-name-pattern "balcony watcher keeps" test/rig.test.mjs`; the old straight,
  centreline pose fails the new wrist/knuckle/tip assertions.

---

## Review - 2026-10-08 - Post-crowd-work delta review

Review mode only, source revision `fc9f12d`; no runtime fixes. This pass focused on changes
since the 2026-10-06 review, especially the rig-driven bartender, mingler drink/smoke
sequence, release gates and relay tooling. Syntax, the production build, the 186-test Node
suite and the asset audit pass. Root production dependencies and Worker production
dependencies audit clean. The full browser suite found the bartender contract failure below;
the remaining browser scenarios were still running when the finding was recorded. Lint also
fails on the newly used `Path2D` browser global, so the current revision is not deployable
through the gated workflow. Matching lint and Worker-audit findings are updated in place
rather than duplicated.

- [x] **Verify the rig-driven bartender by motion instead of an animation-array sentinel**

  **Resolved 2026-10-08.** `bar.spec.mjs` now asserts the bartender has a healthy `AvatarRig` and two hand bones,
  and that her hands move more than 1 cm over 12 rendered frames. The check passes, and fails (0 m of travel)
  when `_updateBartender()` is stubbed out.

  **Priority:** High  
  **Category:** Testing  
  **Confidence:** High  
  **Area:** Bar character and release-gated browser tests  
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [bar.spec.mjs](test/e2e/bar.spec.mjs),
  [ci.yml](.github/workflows/ci.yml)  
  **Evidence:** `npm run test:e2e` fails `bar.spec.mjs:87`: the bartender is enabled but
  `bartender.animations.length === 1` is false. `_spawnWorkingBartender()` intentionally
  creates an `AvatarRig`, sets `animations: []`, and updates its pose every frame through
  `_updateBartender()`. The assertion predates that implementation and checks container
  shape rather than visible movement.  
  **Problem:** The production behavior changed from one playing `AnimationGroup` to a
  procedural rig, but the release-gated browser contract still requires one animation group.  
  **Impact:** CI and deployment fail even when the bartender is moving; simply deleting the
  assertion would also remove protection against a genuinely frozen bartender.  
  **Recommended solution:** Replace the sentinel with a short, deterministic before/after
  sample of a bartender-driven bone or hand world position while the washing pose runs.
  Also assert that the rig is healthy and retain the enabled, placement, light-slot and
  `reactsToBeat` checks.  
  **Regression considerations:** Do not add a redundant animation group to satisfy the old
  assertion, and do not weaken the test to presence-only. The bartender must continue using
  the shared crowd materials and remain outside quality-tier removal.  
  **Acceptance criteria:** The browser test observes meaningful bartender pose movement over
  time, fails if `_updateBartender()` is disabled, and passes with the procedural rig.  
  **Validation:** Targeted `bar.spec.mjs`, the bartender drink-contact scenario in
  `crowd-dance.spec.mjs`, then the full Playwright suite.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** Medium

- [x] **Keep the selective glow layer disabled across desktop and XR transitions**

  **Resolved 2026-10-08.** `applyVRSettings()` and `applyDesktopSettings()` now keep `glowLayer.isEnabled = false`
  and only set the mode's intensity. A unit test fails if any club layer sets it `true`. `vr-parity.spec.mjs` now
  expects it off in both modes. The Quest-emulation test in `vrclub.spec.mjs` passes. That test had been masking a
  stale assertion (the laser beam batch has been excluded from glow since `1c7494b`), now aligned.

  **Priority:** High  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** Rendering lifecycle and XR parity  
  **Affected files:** [01-core.js](js/club/01-core.js), [02-lifecycle.js](js/club/02-lifecycle.js),
  [vr-parity.spec.mjs](test/e2e/vr-parity.spec.mjs), [vrclub.spec.mjs](test/e2e/vrclub.spec.mjs)  
  **Evidence:** `_createGlowLayer()` deliberately sets `glowLayer.isEnabled = false` because its
  private render target omits venue/character occluders. `applyVRSettings()` and
  `applyDesktopSettings()` later set it to `true`. The full Playwright run fails both the
  parity check (`glow.enabled` changes unexpectedly) and the XR contract
  (`selectiveGlowDisabled` expected true, received false); 29 other browser scenarios pass.  
  **Problem:** Entering XR re-enables an effect the rendering contract explicitly disables,
  and exiting XR leaves it enabled on desktop too.  
  **Impact:** Emitters and halos can appear through opaque walls and people, the extra render
  target adds avoidable headset work, and two release-gated browser tests block deployment.  
  **Recommended solution:** Never change `glowLayer.isEnabled` from false in either mode.
  Keep mode-specific intensity values only for diagnostics/future opt-in work, and rely on
  the depth-correct default-pipeline bloom for visible glow. Update the stale parity assertion
  that currently expects VR glow enabled.  
  **Regression considerations:** Preserve default-pipeline bloom, fixture registration and
  diagnostics. Do not delete the compatibility layer unless all registration/diagnostic
  consumers are migrated.  
  **Acceptance criteria:** The selective layer remains disabled before XR, during XR and
  after XR exit; bloom remains enabled in both modes; occlusion and image-parity tests pass.  
  **Validation:** Targeted `vr-parity.spec.mjs` and the Quest-emulation scenario in
  `vrclub.spec.mjs`, then the full Playwright suite and resource-budget snapshot.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** Medium

- [x] **Make kick detection independent of the frame rate, so the crowd dances under load**

  **Resolved 2026-10-08.**  
  **Priority:** High  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** Kick band, VJ beat tracking, crowd choreography  
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [vjDirector.js](js/vjDirector.js),
  [unit.test.mjs](test/unit.test.mjs)  
  **Evidence:** The Quaternius dancers fall back to the slow free `Groove_Sway` whenever `beatPresent` is false.
  Rendering was ruled out: in the production build at Balanced and Ultra, desktop and emulated XR, every dancer's
  skeleton matrices change while the camera faces away. On a real Resident episode, fed through the club's analyser
  at fixed frame intervals, the beat was present 99% of the time at 16 ms, 23% at 33 ms, 1% at 50 ms and never at
  80 ms. `_readKickBand()` read only the newest ~11 ms window once per frame. `_detectKick()`'s 60 ms rise test
  then had one or no earlier sample to compare against. The extra rotation seen next to dancers is the existing
  1.6 m avoidance turn, not dancing.  
  **Fix:** The kick analyser holds ~170 ms (fftSize 8192). Each frame reads one 512-sample window for every 1/60 s
  of audio time since the last read, stamped with when it played, into the preallocated `frame.kickSteps`.
  `_detectOnset()` runs the detector over each step. At 60 fps this is still one window per frame.  
  **Validation:** Same real-set measurement after the fix: 99 / 97 / 92 / 100% beat present at 16 / 33 / 50 / 80 ms,
  124 BPM. A new unit test catches the kicks of a continuous waveform at 60, 30, 20 and 12 fps and fails at 30 fps
  with the old per-frame read. All 349 Node tests and the real-club crowd-dance e2e pass. Not yet checked with real
  music on a Quest 3S.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** Medium

- [x] **Make the walking guest linger, lean on the balcony rail with the woman there, and smoke properly**

  **Resolved 2026-10-08.** He walked most of the time (stops of 9-17 s). On the balcony he stood alone in `Idle_Loop`.
  Smoking, his wrist went to his mouth, burying his hand and the cigarette in his head. The cigarette was a
  pale-grey 9 mm tube on his palm, lit only by the ambient light at night, with no smoke at all.
  - Stops are now 22-40 s, the cigarette 75-105 s and the bar two sips with a chat. He walks 26% of a measured
    round (the real-club test fails above 45%).
  - The balcony stop stands him at the rail beside f7 with his own taller `Idle_Railing_Loop`; his hands are within
    1.1 cm of the rail once settled. After his look at the floor, the two of them turn and talk.
  - `Smoke_Loop` is now a 12 s cycle with an ash flick, a palm-to-face drag and a chin-up exhale, measured against his
    real face. `build-crowd-glbs.mjs` hands gained a `thumb` direction so a palm can be turned.
  - The cigarette (unlit, vertex-coloured, glowing tip) is pinched between his index and middle fingertips and
    burns down over the stop. A wisp and an exhale (two small particle systems) run only while he smokes.
  - Spawned characters are mirrored in the world, so the hand frame is computed in the body's own frame.

  **Validation:** rig tests on the real GLB as the club places him: the filter reaches his lips; fingertips, the
  burning end and his collar stay clear; the rail hands land on the rail. Both rig tests fail on the old file. Unit
  tests cover 15 minutes of his round. The real-club e2e covers a whole round: filter within 2.3 cm of the lips,
  tip glow, exhale, burn-down, rail and conversation. Screenshots were reviewed. Budget, tiers, bar and street
  e2e also pass.

- [ ] **Measure the mingler's smoke particles and cigarette on a Quest 3S**

  **Priority:** Low  
  **Category:** Performance  
  **Confidence:** Medium  
  **Area:** Street, mingler  
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js)  
  **Evidence:** Two alpha-blended particle systems (60 + 60 capacity, ~10-34 particles a second) and two small
  meshes run while he smokes outside. Measured only on desktop SwiftShader.  
  **Acceptance criteria:** Quest 3S frame time on the street with him smoking within 0.2 ms of him standing; the
  smoke reads in the headset at 1-3 m without sorting artefacts.  
  **Estimated effort:** Small  
  **Business value:** Low  
  **Technical debt reduction:** Low

- [x] **Put crowd control on its own VR menu page, and redesign the VJ desk at the DJ table**

  **Resolved 2026-10-08.**
  - **VR menu.** DANCERS / BYSTANDERS / DJ / EVERYONE were the last four buttons of COMFORT, where the owner did not
    find them. They now have their own CROWD page on HOME. QUALITY moved to COMFORT to keep HOME within its twelve
    slots.
  - **Old desk.** Eleven unlabelled coloured boxes and a speed slider sat on the table's front lip, with an audio
    box that opened a DOM dialog no headset can use. Several actions had no desk control: auto show, the DJ,
    macros, brightness, gobo. The real-club e2e checks none of the old meshes remain.
  - **New desk** (`js/vjDesk.js`): two angled, labelled touch panels.
    - **SHOW**: who has the lights, AUTO SHOW, RESIDENT DJ, MUSIC, DROP, BLACKOUT, NEXT SECTION, TAP TEMPO, BEAMS TO
      FLOOR, RESET LIGHTS, and BRIGHTNESS and MOVEMENT SPEED faders.
    - **LIGHTS**: every fixture plus the steppers, each showing its live value.
  - **Shared code.** All three surfaces now share `toggleLightControl()`, `resumeAutoShow()` and `setLightSpeed()`.
  - **Who has the lights.** They stay with whoever stands at the desk and go back to the automatic show 60 s after
    they leave, counted down on the desk.

  **Validation:**
  - Unit tests: layout, hand-over and hand-back, the booth hold, host and Safe Mode gating, and the CROWD page.
  - Real-club e2e: a ray at the middle of every button lands on it, and presses redraw the panels.
  - Screenshots of both panels were reviewed.
  - The VR menu and session e2e tests, the full Node suite, lint and build pass.
  - Not checked on a headset: text legibility at arm's length on a Quest 3S, or hand-ray comfort while leaning over
    the decks.

## Review - 2026-10-06 - NOCTURNE principal experience reassessment

Review mode only, source revision `c9650c0`; no runtime fixes. See the
[full report](docs/REVIEW_2026-10-06.md) for validation, scorecard and release limitations.
New findings are below. Navigation, caching, credits, hardware measurement and other
matching findings are updated in place; older measurements are not current benchmarks.

**Implementation follow-up, cache `20261006-8`:** Slower rotating lasers (one-quarter rate),
doubled mirror spots (96/180/280), left-stick head-directed walking and right-stick smooth turning
are implemented; saved Comfort choices are retained. Local lint, syntax, build and 180 Node tests
pass. Six targeted Quest-emulator scenarios pass, plus a final two-scenario rerun for enabled
teleport blockers and tighter stair limits. Stair ascent/descent reached levels 3/0 in 31/32
software-rendered frames, with a maximum level change of 0.179 m (required <0.21 m); these are
functional hitch-bound measurements, not headset frame timing. Hardware comfort, seated/standing
traversal and the additional mirror-spot GPU cost still need Quest validation.

- [x] **Keep classic-script browser globals wired into the lint/deployment gate**

  **Resolved 2026-10-08:** `Path2D` added to `browserGlobals` in `eslint.config.mjs`; `npm run lint` exits 0
  with `no-undef` unchanged. The actual CI run is still unverified.

  **Rechecked 2026-10-08:** `npm run lint` exits 1 at
  `js/club/04-environment.js:290` because `Path2D` is a standard browser global used by
  `_drawNocturneNeon()` but is absent from `browserGlobals`. Syntax, the production build and
  all 186 Node tests pass. The earlier `ROOM_INTERIOR` omission was fixed; this is the same
  root maintenance failure on a newly used runtime global, so it updates this item instead
  of creating a duplicate.

  **Priority:** High
  **Category:** Bug
  **Confidence:** High
  **Area:** Classic-script globals and CI
  **Affected files:** [eslint.config.mjs](eslint.config.mjs), [04-environment.js](js/club/04-environment.js),
  [ci.yml](.github/workflows/ci.yml)
  **Evidence:** `npm run lint` exits 1 with six `no-undef` errors at lines 1019-1024 of
  `06-effects.js`. `ROOM_INTERIOR` is declared/exported by `01-core.js`, but is missing
  from ESLint's `projectGlobals`. Syntax, the production build and all 176 Node tests pass.
  **Problem:** The new runtime-global contract was not wired into lint configuration.
  **User-visible effect:** CI cannot publish the current improvements through the gated deploy job.
  **Immersion impact:** Indirect; users may remain on an older deployed experience.
  **Desktop impact:** Deployment, not a reproduced browser ReferenceError.
  **VR impact:** Same delivery blockage.
  **Performance impact:** None.
  **Recommended solution:** Declare the existing shared global readonly in the lint configuration;
  preserve `no-undef` and the script-order checks.
  **Regression considerations:** Do not disable the rule, change load order or duplicate room bounds.
  **Acceptance criteria:** `npm run lint` exits 0; existing tests/build still pass; CI verify is green.
  **Validation:** Lint, contract tests and production build, then the actual CI run.
  **Implementation update (after review):** Added `ROOM_INTERIOR` to the readonly shared globals.
  Local lint, syntax checking and all 180 Node tests passed at that revision. The later `Path2D`
  addition regressed the same gate, so the acceptance criteria are not currently satisfied.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [ ] **Preserve valid near-floor tracked head heights in the VR surface follower**

  **Priority:** High
  **Category:** VR
  **Confidence:** High for the executed height correction; headset comfort impact needs hardware
  **Area:** Tracked pose, crouching and locomotion
  **Affected files:** [mezzanine.js](js/mezzanine.js), [unit.test.mjs](test/unit.test.mjs),
  [mezzanine.spec.mjs](test/e2e/mezzanine.spec.mjs), [vr-navigation.spec.mjs](test/e2e/vr-navigation.spec.mjs)
  **Evidence:** Executing the current methods with a synthetic valid viewer pose at y=0.25 m
  records `_xrEyeHeight=0.25`, but `_xrHeadHeight()` returns 1.6. Passing a floor-level camera
  at `(0,0.25,-12)` to `_updateVRWalkSurface()` then sets its y to 1.6 in one call.
  The fallback applies to every sample <=0.3, not just a missing/invalid pose.
  **Problem:** A valid low physical head pose is mistaken for absent tracking. The surface
  correction therefore moves the virtual origin by 1.35 m instead of preserving the crouch.
  **User-visible effect:** A near-floor reach/crouch can cause an artificial vertical jump.
  **Immersion impact:** Contradicts head tracking at the point where physical presence matters most.
  **Desktop impact:** None; the methods are XR-specific.
  **VR impact:** A confirmed mathematical discontinuity with a potentially severe comfort consequence;
  not claimed as a physical-headset reproduction.
  **Performance impact:** No extra rendering work is needed.
  **Recommended solution:** Track whether a valid finite pose has been sampled separately from its
  height; preserve valid low heights and retain the last valid sample during tracking loss.
  Reset calibration appropriately across sessions/reference-space changes.
  **Regression considerations:** Seated height, world scale, stairs, balcony/booth teleport, jumps,
  session re-entry, and missing poses must retain their intended behaviour.
  **Acceptance criteria:** A continuous valid height sweep through 0.3 m produces no origin jump;
  feet remain on the chosen surface, with <2 cm correction when no locomotion occurs.
  **Validation:** Boundary tests at 0.29/0.30/0.31 m and a continuous crouch sweep; missing/invalid
  pose tests; IWER tracked-height changes, then a supervised seated/standing headset check.
  **Implementation update (after review):** The sampler is installed before XR entry, runs before
  camera observers and accepts every finite height, including zero. Before any pose, surface following
  waits and preset travel reports that tracking is unavailable. Missing poses retain the last valid sample;
  new sessions reset it. Unit tests cover the boundary sweep, missing/invalid poses, session reset and
  scaled low poses on the balcony. IWER also preserves tracked heights 0/0.25/0.29/1.6 m without
  moving the floor. Physical-headset validation is still required.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Medium

- [ ] **Make desktop/XR image parity repeatable without weakening its thresholds**

  **Priority:** Medium
  **Category:** Testing
  **Confidence:** High for the fail/pass results; animation timing as the cause is not proven
  **Area:** Production image parity and CI signal
  **Affected files:** [vr-parity.spec.mjs](test/e2e/vr-parity.spec.mjs),
  [xr-measure.mjs](test/e2e/xr-measure.mjs), [07-animation-core.js](js/club/07-animation-core.js)
  **Evidence:** The three-test browser batch passed spatial audio and budgets but failed image
  correlation at 0.6928527663 against >0.700. An isolated, unchanged rerun passed in 2.9 minutes,
  recording luminance x1.41, structure r=0.74 and edge energy x0.81. No threshold or timeout
  changed. The test pins the cue and hue, not the animated LED/particle/crowd state or clock;
  desktop and XR samples are collected sequentially. The first run also overlapped a separate
  visual-review browser for part of its duration; that is not proof of the failure's cause.
  **Problem:** The current comparison can fail without a code change, and its scalar-only
  image capture does not preserve the paired image evidence needed to distinguish causes.
  **User-visible effect:** CI may delay deployment or miss a real regression among noisy failures.
  **Immersion impact:** Indirect, through confidence in desktop/VR visual consistency.
  **Desktop impact:** One side of the sequential comparison.
  **VR impact:** The mono emulator comparison is affected; no headset rendering failure is inferred.
  **Performance impact:** Test instrumentation only; no additional live rendering work is needed.
  **Recommended solution:** Capture paired image/state diagnostics, reproduce at controlled
  animation phases and seed where applicable, and isolate intentional mode differences.
  Keep a separate in-motion test so deterministic captures do not hide temporal defects.
  **Regression considerations:** Preserve gain, luminance, structure and restore-state assertions;
  do not lower the correlation threshold or treat a retry as a fix.
  **Acceptance criteria:** Ten repeated controlled comparisons pass the existing thresholds on
  the CI runner, and an injected output-gain/structure regression still fails.
  **Validation:** Repeated selected Playwright runs, saved paired captures and failing-when-broken checks.
  **Estimated effort:** Medium
  **Product value:** Medium
  **Technical debt reduction:** Medium

---

## Review - 2026-10-05 - Principal experience and engineering reassessment

Review mode only; no runtime behaviour changed. Full evidence, limitations, scorecard and
release verdict: [Principal review](docs/REVIEW_2026-10-05.md), source revision `2671b79`.
New defects are below. Matching teleport, remote-avatar, Quest-baseline, lighting and relay-tooling
findings are updated in place rather than duplicated. Historical measurements remain historical.

- [ ] **Persist the crowd and reflection environment in the offline asset cache**

  **Rechecked 2026-10-06:** The direct Babylon-loading paths remain. A warm production visit
  had 16 NPCs on high tier, a local rig and a ready environment; IndexedDB held four equipment
  entries and 22 texture entries, with no avatar or environment key. Route both paths through
  the shared byte cache rather than expanding the shell SW. The awaited, sequential avatar
  loader also bypasses the shared body deadline; include stalled-body and dispose-during-load
  coverage in this same fix, rather than creating another loading system.
  A fresh offline return with only the ordinary HTTP cache cleared reproduced `ready=true`,
  zero NPCs, no local rig and `environmentTexture.isReady()=false`. SW/IndexedDB were preserved.

  **Priority:** High
  **Category:** Bug
  **Confidence:** High
  **Area:** Offline loading, people and environment reflections
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [02-lifecycle.js](js/club/02-lifecycle.js),
  [assetCache.js](js/assetCache.js), [modelLoader.js](js/modelLoader.js), [sw.js](sw.js), [README.md](README.md)
  **Evidence:** A production Chromium visit loaded 10 NPCs, the local rig and a ready environment texture.
  After waiting for SW control, clearing only the ordinary HTTP cache (not IndexedDB or Cache Storage),
  going offline and re-entering, `ready` was true but NPC count was 0, the local rig was absent and
  `environmentTexture.isReady()` was false. All six cached surface sets remained available.
  IndexedDB held four equipment model URLs and 21 surface/speaker texture URLs, but no avatar or
  environment URL. The avatar path calls `LoadAssetContainerAsync` directly; the environment calls
  `CreateFromPrefilteredData` directly; the SW deliberately excludes both binary extensions.
  **Problem:** The documented persistent offline ownership contract has two bypasses. A warm HTTP cache
  can conceal the defect, but it is not the promised loader-owned persistent cache.
  **User-visible effect:** An offline return visit opens an empty club without the player's body or the
  intended environment reflections, even after a successful online visit.
  **Immersion impact:** Removes the human presence and changes the material response simultaneously.
  **Desktop impact:** Reproduced in production Chromium.
  **VR impact:** Uses the same asset paths; offline headset reproduction is still required.
  **Performance impact:** Reuse downloaded bytes; do not duplicate binaries in SW and IndexedDB.
  **Recommended solution:** Route avatar GLB bytes and the environment through the shared cache and
  body-deadline helpers before Babylon parsing. Preserve separate containers where material ownership
  requires them, deduplicate downloads, revoke owned object URLs and handle disposal during loading.
  **Regression considerations:** Keep source-container/shared-material ownership, the SW shell-only
  boundary, cache quota degradation and existing online fallbacks. This review did not measure a stalled
  avatar download; also test that direct-loader replacement bounds that failure path.
  **Acceptance criteria:** A warmed production visit with HTTP cache cleared and network offline retains
  the same NPC count, local rig and ready environment; no binary is duplicated in Cache Storage.
  **Validation:** Browser test preserving IndexedDB/SW while clearing HTTP cache, plus delayed-body,
  quota-exhaustion and dispose-during-load cases; then an offline Quest visit.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** High

- [ ] **Keep expanded model credits clear of the narrow-screen camera control**

  **Rechecked 2026-10-06:** The new collapsed disclosure fixes the permanent obstruction.
  At 375x667 the collapsed camera hit-test reaches the button. With credits expanded,
  the plate is approximately `(10,285.48,225.20,371.85)` and the same camera-centre hit
  still returns `.credits-note`. Keep this item open for the expanded state; do not
  describe the current default as a permanent large overlay.

  **Priority:** Medium
  **Category:** UX
  **Confidence:** High
  **Area:** Responsive desktop/browser overlays and attribution
  **Affected files:** [styles.css](css/styles.css), [index.html](index.html), [ui-init.js](js/ui-init.js),
  [vrclub.spec.mjs](test/e2e/vrclub.spec.mjs)
  **Evidence:** At a measured 375x667 CSS-pixel viewport, the credits rectangle was approximately
  `(10,367,225,290)`, covering 26.1% of the viewport. The camera toggle was `(167,599,42,42)`.
  `elementFromPoint()` at its centre returned `.credits-note`; a normal Playwright click timed out
  because that subtree intercepted pointer events. At 739x553 the plate covered 19.2% of the view.
  **Problem:** The growing fixed credit plate occupies the camera control's hit area.
  **User-visible effect:** The visible camera button cannot be clicked/tapped at the tested narrow width.
  **Immersion impact:** A large permanent overlay obscures the scene and blocks a travel affordance.
  **Desktop impact:** Narrow windows and responsive layouts; the 375px hit-test is reproduced.
  **VR impact:** Primarily the browser before/after immersive mode, not the stereo scene.
  **Performance impact:** Layout-only; no new rendering effects are needed.
  **Recommended solution:** Reserve non-overlapping overlay space and provide compact, keyboard-operable
  expandable attribution, keeping a visible credits affordance and every required attribution/link.
  **Regression considerations:** Do not remove CC BY credits, disable their links with `pointer-events:none`,
  or make attribution unreachable to keyboard/screen-reader users.
  **Acceptance criteria:** Camera, audio and multiplayer controls receive normal clicks at 375x667,
  720px and desktop widths; all credits remain readable and reachable at 200% zoom.
  **Validation:** Responsive browser hit-tests and ordinary pointer/keyboard activation, not forced clicks;
  screenshot review and attribution-link checks.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [ ] **Check Ultra, headset heights and the stair on a Quest 3S**

  **Priority:** Medium
  **Category:** Performance / Navigation
  **Evidence:** Quest browsers now start on Ultra (14 dancers, 8 guests, 280 mirror spots); only a Quest 3 has been tried. The
  invisible-wall fix (torso collider) was verified with Babylon's real collision solver and the IWER emulator at 0.9 to 1.85 m
  headset heights, not with a physical headset. The stair's clear corridor is about 0.8 m for the 0.25 m-radius body, so
  approaching it at an angle can still catch a rail.
  **Recommended solution:** Capture frame time on Ultra standing at the dance floor and the bar; walk to the balcony standing and
  seated. If the stair is fiddly, widen it past 1.4 m (`MEZZANINE.stairs`) or flare its first rails.
  **Acceptance criteria:** Ultra holds the headset refresh rate (or the default drops back to High), and a seated and a standing
  player both reach the deck by thumbstick on the first try.

---

## Implementation - 2026-10-07 - A diverse crowd from the Modular Women / Men packs

Shipped: 17 recoloured Quaternius Modular people with retargeted dance and idle clips, loaded per quality tier (see
[CHANGELOG.md](CHANGELOG.md), [ASSETS.md](ASSETS.md)). Validated with the real Babylon skeletons headless and desktop
SwiftShader only. Open items:

- [ ] **Judge the crowd's look and cost on a Quest 3S**

  **Priority:** Medium
  **Category:** Experience / Performance
  **Evidence:** The people are flat-coloured low-poly figures (13k vertices, one draw each) next to the textured
  Mixamo dancers and the DJs; they match the old characters' style in the desktop renders but have not been seen
  in a headset. Every dance is the single Universal Animation Library `Dance_Loop`; five of the eleven modular dancers
  play it mirrored (`mirror: true` in `CAST`), so variety comes from the figures, the mirroring, phase offsets and
  speeds, not from different choreography.
  **Recommended solution:** Look at them in the headset at booth and floor distance; if the choreography still reads
  as a chorus line, add more Mixamo-free clips when Quaternius releases them and retarget those.
  **Acceptance criteria:** No two neighbours move in step; Ultra holds the headset's refresh rate with 14 dancers and 8 guests.

- [ ] **Retire the Mixamo dancers and the two peasant-outfit files**

  **Priority:** Low
  **Category:** Licensing
  **Evidence:** `Hip Hop Dancing.glb`, `house.glb` and `rumba_dancing_female_character.glb` are still the only
  non-CC0 characters and still account for three of the 14 dance slots; `club-dancer-*.glb` now only dress the
  player's own body.
  **Recommended solution:** Replace them with `club-crowd-*` people once a second CC0 dance exists to retarget, and
  rebuild the player's body from a Modular character (the rig would need the modular skeleton, not the mannequin).
  **Acceptance criteria:** Every shipped character file is CC0.

---

## Implementation - 2026-10-07 - Multiplayer from the VR menu: avatars, gestures, safety

Shipped: ONLINE pages in the VR menu and the DOM panel (one `ClubMultiplayer` controller), relay-assigned random avatars
from the 17 crowd people, clip-driven remote people (`AvatarManager`), wave/nod/dance/emoji, VR head-nod detection,
mute, personal-space bubble, two-way block by hashed `pid`, host kick/ban/lock. See `.github/copilot-instructions.md`.
Open items, each with an acceptance criterion:

- [ ] **The player's own first-person body is still the UE mannequin, not their assigned avatar.**
  **Affected files:** `js/avatarRig.js`, `js/club/07-animation-core.js`.
  **Recommended solution:** teach `AvatarRig` the Modular skeleton (Body-rooted legs, free-standing IK feet).
  **Acceptance criteria:** the local body in a mirror/photo mode matches `selfAvatar`; `test/rig.test.mjs` passes on both skeletons.
- [ ] **Eight skinned people, voice analysers and name tags are unmeasured on a Quest 3S.**
  **Acceptance criteria:** a headset capture with 8 guests keeps frame time within the 72 Hz budget, or `MAX_PEOPLE` is lowered.
- [ ] **Shared lights and music are verified only in two to three desktop browsers on a local relay.** Beat alignment
  across guests relies on each browser detecting the same kicks from the same audio (the host sends the bar line and
  the cue, not a beat clock), so a guest can sit a fraction of a beat off the host.
  **Recommended solution:** send the host's beat phase and let the guest's grid slew toward it.
  **Acceptance criteria:** with two headsets on one track, strobe flashes land within 60 ms of each other; the guest's
  position stays within 1 s of the host's across a 10-minute set, including after a seek and a track change.
- [ ] **A host who plays a local file shares nothing.** Guests keep the previous stream.
  **Acceptance criteria:** guests are told "the host is playing a file that cannot be shared" and pause.
- [ ] **The VR Music page seek e2e (`podcast.spec.mjs`, "seeks by clicking the bar with the controller ray") timed out
  once in a 1.4 h full run** and passed 3 of 3 runs on its own. If the emulated trigger misses the bar it waits out the
  whole 15-minute test timeout. **Acceptance criteria:** the wait for the new position has its own short timeout and
  reports where the ray hit, and the test passes in five consecutive full runs.
- [ ] **Bans and the lock live in the room's memory.** They reset when the room empties.
  **Recommended solution:** Durable Object storage keyed by room, plus a room owner token.
  **Acceptance criteria:** a ban survives an empty room and a relay restart.
- [ ] **Reporting and moderation beyond the host** (report a guest, rate-limit repeat joins by ip hash).

---

## Implementation - 2026-10-07 - Podcast choice, seek bar and a DJ per podcast

Shipped: Hernan Cattaneo / Miss Melera selector, random episode on entry, seek bar (desktop and VR Music page) and a DJ
that changes with the podcast (see [CHANGELOG.md](CHANGELOG.md)). Validated with mocked feeds on desktop SwiftShader and the
IWER harness only. Open items:

- [ ] **Verify Colourizon end to end in a browser, and after every relay change**

  **Priority:** Medium
  **Category:** Deployment
  **Evidence:** The relay was deployed on 2026-10-07 (the hosted copy had been the old build, so choosing Miss Melera failed:
  "expected a websocket upgrade"). With `curl` and the production Origin it now returns the rewritten feed, a 206 with
  `Content-Range` on the real SoundCloud stream, a 206 for a range 40 MB in (a seek), and 403 for a missing or foreign Origin.
  Not yet checked: a full play-through in a browser against the live relay, and SoundCloud's signed stream URLs live about
  five minutes (the proxy re-resolves per request).
  **Recommended solution:** After any change under `worker/`, run `wrangler deploy` there and repeat the three curl checks
  above before trusting the UI; then play Colourizon, seek across the episode and let one finish.
  **Acceptance criteria:** An episode plays with a live analyser (not the "silent" warning), a mid-episode seek resumes within
  3 s, and an episode longer than five minutes does not stall at the first URL expiry.

- [ ] **Check the DJ looks and the seek bar on a Quest 3S**

  **Priority:** Low
  **Category:** Experience
  **Evidence:** The DJs are tinted Quaternius characters built from public descriptions, and the seek strip was exercised only
  with synthetic controller poses.
  **Acceptance criteria:** Both DJs read as the artists at booth distance, and the strip can be dragged precisely with a real controller.

---

## Implementation - 2026-10-08 - The crowd dances varied moves on the beat

Shipped: eight procedural grooves on the eleven Quaternius floor dancers and a choreographer that picks them per dancer
and phase-locks them to the beat (see [CHANGELOG.md](CHANGELOG.md) and `js/crowdDance.js`). Validated by unit tests,
the real skeleton in `test/rig.test.mjs`, and the real club stepped at 16 ms in `test/e2e/crowd-dance.spec.mjs` (mean
phase error ~0.0013 beats). Open items:

- [ ] **Judge the dancing in a headset, and with real music**

  **Priority:** Medium
  **Category:** Crowd / VR
  **Evidence:** The grooves were checked on screenshots on desktop SwiftShader and by measurement; the beat lock was
  measured with a synthetic beat grid, not with the kick detector on real tracks (whose `beatNumber` can step when a
  kick lands early or late: the lock absorbs up to 0.6 beats smoothly, more is a jump). The extra clips add ~100 KB to
  each floor dancer's file (now 0.95-1.09 MB). The hand orientation is swing-only (palms are not twisted to face in a clap).
  **Acceptance criteria:** On a Quest 3S with a set playing, the floor reads as varied and on the beat from the booth and
  from the floor, claps visibly meet on the beat, no dancer pops when changing move, and breakdowns visibly calm the floor.

---

## Implementation - 2026-10-07 - The club is a basement: an entrance stair down from the street

Shipped: the street door is at street level (2.8 m) and a 16-riser stair hall leads down to the club's doorway; the street GLB
is lifted to match and its forecourt leaves the stairwell open; outdoors the music falls with distance from the door (see
[CHANGELOG.md](CHANGELOG.md)). Validated with unit tests on the real Babylon geometry and e2e walks on desktop SwiftShader and the
IWER harness (desktop collisions up and down, VR thumbstick up and down, teleport out of the door). Open items:

- [ ] **Walk the entrance stair in a headset**

  **Priority:** Medium
  **Category:** VR comfort
  **Evidence:** The headset's height on the stair is a linear ramp over the flight (`VenueLayout.vestibule.walkLevel`), the same
  approach as the balcony stair; nothing has been checked for comfort on a real Quest (smooth descent of 2.8 m in about 4 m).
  The outdoor falloff (`1 / (1 + max(0, d - 2) / 6)` on the master gain) was set by numbers, not by ear on the headset.
  **Acceptance criteria:** A Quest 3S walk up and down the stair with the thumbstick reports no discomfort and no catch on the
  rails or the doorways; the bass at the door and at the end of the block sounds plausible through the headset's speakers.

- [ ] **Measure the bouncer and the queue on a headset**

  **Priority:** Medium
  **Category:** Performance
  **Evidence:** Up to nine skinned characters (the bouncer and a queue of `queueSize`: 8/6/4 by tier) stand outside the street
  door. They are disabled, with their animation groups paused, whenever the street is hidden (deeper than `z -8`), so the dance
  floor is unaffected; but on the stair and on the street they add one skeleton evaluation and one draw each, on top of the
  street's ~60 draws. Measured only on desktop SwiftShader (feet at street level, lights and visibility toggling verified).
  **Acceptance criteria:** On a Quest 3S at the top of the entrance stair and on the pavement facing the queue, frame time
  stays within the headset's refresh budget on the shipped tier; otherwise lower that tier's `queueSize`.

---

## Implementation - 2026-10-06 - The street outside the club

Shipped: the vestibule's street door opens onto a night avenue from the CC0 Quaternius *Downtown City MegaKit*, and the
music outside is only the low bass (see [CHANGELOG.md](CHANGELOG.md), [ASSETS.md](ASSETS.md)). Validated on desktop SwiftShader
and the IWER harness only. Open items:

- [ ] **Measure the street on a Quest 3S**

  **Priority:** High
  **Category:** Performance
  **Evidence:** The baked district is 148k triangles and about 60 draws with the whole avenue in view, drawn per eye; it is hidden
  below `z -8` so the club itself is unaffected, but no headset frame time exists for the street, and its 6.7 MB GLB parses inside
  the "Preparing VR..." window.
  **Recommended solution:** Capture frame time on the sidewalk facing the far row and facing down the avenue, balanced tier. If over
  budget, lower `LOD_BY_DISTANCE` in `scripts/build-city-assets.mjs` (the sloppy simplifier can take the near buildings' window
  frames too), drop the two outermost buildings per row on the balanced tier, or lower the sky dome's segments.
  **Acceptance criteria:** The street holds the headset's refresh rate on the balanced tier with no worse than the dance-floor
  baseline's dropped-frame rate, and the GLB's parse stall is below 300 ms on the headset.

- [ ] **Stop drawing the club's interior while a guest is out on the street**

  **Priority:** Medium
  **Category:** Performance
  **Evidence:** There is no occlusion culling, so looking back at the facade from the avenue still submits every club mesh in the
  frustum (about 560 active meshes measured on desktop at the pavement's edge) only for the brick wall to cover them.
  **Recommended solution:** Tag the shell (walls, vestibule, signs, graffiti) and put everything else on a layer the camera drops
  when `_exterior > 0.95` and the guest is off the door's line; verify the XR rig cameras inherit the mask first.
  **Acceptance criteria:** Active meshes on the avenue fall below 250 with the club unchanged when the guest walks back in.

- [ ] **Give the street's lighting and the club facade some life**

  **Priority:** Low
  **Category:** Experience
  **Evidence:** The street is lit by two flat scoped lights and the kit's own windows; there are no street lamps, no neon, and the
  club's street-side facade is bare brick above the vestibule.
  **Recommended solution:** Emissive lamp posts merged into the street mesh, a NOCTURNE sign on the facade through
  `createSignage()`, and a warm spill on the pavement from the open door.
  **Acceptance criteria:** No new draws beyond one merged mesh; the sign respects Photosensitive Safe Mode.

---

## Implementation - 2026-10-05 - Bass bins under the PA

Shipped: one bin hung under each flown speaker (see [CHANGELOG.md](CHANGELOG.md), [ASSETS.md](ASSETS.md)). Open item:

- [ ] **Measure the bass bins on a Quest 3S and re-check the PA sound image**

  **Priority:** Medium
  **Category:** Performance
  **Evidence:** Two bins add 12 draws and ~41k triangles above the dance floor; only desktop software rendering and the IWER harness were run.
  The speaker's spatial audio still sits at the cabinet, not the combined stack.
  **Recommended solution:** Capture frame time with the bins in the headset; if over budget, simplify the 14.6k-triangle metal part.
  **Acceptance criteria:** No frame-time regression versus the dance-floor baseline on the balanced tier.

---

## Implementation - 2026-10-04 - Steel mezzanine and stair

Shipped: a steel balcony on the left wall, a 16-step stair, a table and two stools, a BALCONY preset (see
[CHANGELOG.md](CHANGELOG.md), [ASSETS.md](ASSETS.md)). Open items:

- [ ] **Align walking collision and teleport blockers with the expanded venue**

  **Priority:** High
  **Category:** VR
  **Confidence:** High for the reproduced entrance escape and source registration gap
  **Area:** Walking and comfort-mode navigation across entrance, bar and mezzanine
  **Affected files:** [10-ui.js](js/club/10-ui.js), [02-lifecycle.js](js/club/02-lifecycle.js),
  [venueDressing.js](js/venueDressing.js), [mezzanine.js](js/mezzanine.js),
  [04-environment.js](js/club/04-environment.js), [vr-session.spec.mjs](test/e2e/vr-session.spec.mjs)
  **Evidence update 2026-10-06:** The deck/stair floor registration is implemented, and the preceding
  session's actual controller tests passed. Do not report the deck as teleport-inaccessible.
  `TELEPORT_BLOCKERS` still omits the vestibule and bar. A second mismatch is reproduced in the
  current production browser: a collidable ray from `(6,1.7,-4)` towards -z hits invisible
  `collisionWall4` at z=-4.75, although the visible front shell is at z=0. Sixty real desktop
  `_collideWithWorld(0,0,-0.1)` steps stop at z=-4.245 instead of the intended z=-10.
  The symmetric old barriers retain a 4 m central gap across otherwise visibly open floor.
  Historical teleport reproduction, 2026-10-05 with production
  Chromium/IWER: from ARRIVAL `(0,1.6,5)`, a right-hand arc aimed toward the street door landed at
  `(-0.25,1.61,6.7422)`, beyond the closed vestibule end at `farZ=6`. The current blocker list contains
  only the original room walls and DJ platform, not the new vestibule, bar or mezzanine geometry.
  Walking collision flags do not make those meshes teleport blockers.
  **Problem:** Legacy collision bounds and the teleport blocker list do not match the expanded
  visible venue. The original room/stage regression passes while the entrance can leak and walking
  can encounter invisible partitions.
  **User-visible effect:** A comfort-mode guest can teleport through the street door into unfinished
  exterior space (prior reproduction; missing blockers rechecked), while walkers hit an invisible
  partition five metres in front of the real doorway (current reproduction).
  **Immersion impact:** Breaks the physical boundary of the venue and the meaning of solid geometry.
  **Desktop impact:** Reproduced invisible-wall obstruction; XR exit can also carry an escaped position back.
  **VR impact:** Reproduced in IWER; requires a physical-headset regression check.
  **Performance impact:** A bounded pick-target/blocker set, not a general physics engine.
  **Recommended solution:** Keep the implemented deck/tread registration, align walking colliders with
  actual architecture and register the new shell/furniture teleport blockers after construction and
  every locomotion feature swap. Do not merely remove all collision protection. Derive body ground
  level from the selected destination surface; do not teleport to rail tops or beneath the deck.
  **Regression considerations:** Preserve original wall/stage containment, snap turn, tracked seated
  eye height, both controllers, comfort toggles and legitimate doorway passage.
  **Acceptance criteria:** Teleport cannot cross the closed vestibule end/sides or land inside bar
  furniture; guests can teleport onto the deck and back with the body grounded on the destination;
  walking across visible open floor at x=+6 and x=-6 crosses z=-5 without an invisible obstruction.
  **Validation:** Extend actual controller-arc tests to the vestibule, bar and balcony, on entry and
  after comfort off/on; retain the existing stage/wall checks. Then seated/standing headset traversal.
  **Implementation update (after review):** Removed the five obsolete perimeter boxes (equipment guards
  remain); the visible shell still collides. `_teleportBlockerMeshes()` now derives blockers from enabled collidable
  scene meshes, excluding the walkable floor/deck, and refreshes them after every locomotion swap.
  The production-browser desktop test now crosses z=-5 at both x=-6 and x=6. Rails are deliberately blockers:
  a balcony exit throw must clear the rail rather than pass through it.
  Actual IWER throws after smooth/comfort swaps are blocked by the closed vestibule end/side and
  bar; deck/stair teleport and the original room/stage containment tests also pass.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [ ] **Validate the implemented VR stair walking on a physical headset**

  **Priority:** Medium
  **Category:** VR
  **Evidence update 2026-10-06:** Comfort-off right-stick walking now has a passing IWER
  ascent/deck/descent test from the preceding session. Camera gravity is intentionally disabled;
  `_updateVRWalkSurface` owns height and `_guardVRCameraSteps` levels/caps movement through
  Babylon's private `_updatePosition`. Do not re-enable camera gravity. Real headset feel,
  seated/standing tracking and recentering remain unverified; include the low-pose issue above.
  **Implementation update (after review):** Walking is now left-stick/head-directed. The new browser
  descent regression caught a queued-transform bug: restoring `camera.position.y` alone left Babylon's
  `_deferredPositionUpdate.y` free to lift the walker on the next XR frame. Both the step guard and
  surface follower now synchronize that queued height; a unit regression preserves the correction.
  A real-Babylon headless collision regression then reproduced tread-face blockage before the
  surface follower could lift the walker. The tread/deck mesh now has collision-group value `2`,
  excluded only by the XR camera; the desktop, jump-ground rays and teleport keep using it.
  Rails and furniture still collide. The revised actual-controller IWER ascent/deck/descent test passes;
  physical-headset validation remains open.
  **Acceptance criteria:** A headset capture climbing and descending without clipping or floating.

---

## Implementation - 2026-10-04 - Bar and entrance

Shipped: doorway and vestibule, bar with a female bartender, five stools and a 134-bottle back bar (see
[CHANGELOG.md](CHANGELOG.md), [ASSETS.md](ASSETS.md)). Validated on desktop SwiftShader and the IWER Quest harness
(`test/e2e/bar.spec.mjs`, `budget.spec.mjs`); desktop submissions 304 and XR 281 per frame, no 4096 textures. Open items:

- [ ] **Measure the bar's triangle cost on a Quest 3S**

  **Priority:** Medium
  **Category:** Performance
  **Evidence:** The bar adds about 48k bottle triangles (one draw), 33k stool triangles (five instances of 6.6k) and a 33k-triangle
  bartender; only desktop software rendering has been run.
  **Recommended solution:** Capture frame time at the bar and at the entrance on the headset. If it is over budget, drop to
  three stools, 10 radial bottle segments (`BarProps.SEGMENTS`) or thin the top shelf; every one is a constant.
  **Acceptance criteria:** No frame-time regression versus the dance-floor baseline at the bar on balanced tier.

- [ ] **Give the bartender a job**

  **Priority:** Low
  **Category:** Animation
  **Evidence:** She plays the shared `Idle_Talking_Loop`; the Quaternius libraries carry no pour or wipe clip.
  **Recommended solution:** Author or source a CC0 bartending clip for the shared UE skeleton; until then she is a convincing
  presence behind the counter, not a performer.

- [ ] **Add glassware and a till**

  **Priority:** Low
  **Category:** Art
  **Evidence:** Opaque glass reads wrongly and the club forbids blended surfaces in VR, so no drinking glasses were added;
  Poly Haven *Cash Register 01* carries a blended glass material and was left out for the same reason.
  **Recommended solution:** Author opaque or alpha-tested glass props, or bake a frosted look, then place them on the counter.

---

## Review - 2026-10-04 - Principal experience and engineering assessment

Review mode only; no runtime behaviour was changed. Full assessment and validation:
[Principal review](docs/REVIEW_2026-10-04.md). Source revision: `8a5ab33`.
New findings below are separate root causes, not repetitions of the existing Quest baseline,
audio-band calibration, desktop restore, crowd behaviour or licensing items.
The existing CI-gate item is reopened below; its historical resolution is preserved.
Historical frame-time and allocation measurements elsewhere in this file were not remeasured.

- [x] **Apply master dimming to every show-owned fixture and flash impulse**

  **Resolution:** Master dimming now scales moving heads, ceiling lasers, laser sheets, the LED wall and strobe room impulses continuously: a live wall still renders at master 0.01 (~0.00975 panel red after easing), master 0 fades it below 0.001, and the VR strobe probe now blends ambient/exposure/retinal from 0.06/1.22/0 through 0.53/1.06/0.03 at master 0.5 to 1.00/0.90/0.06 at full.

  **Priority:** High
  **Category:** Lighting
  **Confidence:** High for isolated fixture output; countdown image not yet validated
  **Area:** NOCTURNE intensity, dimmer and blackout
  **Affected files:** [08-animation-fixtures.js](js/club/08-animation-fixtures.js), [07-animation-core.js](js/club/07-animation-core.js), [09-animation-finish.js](js/club/09-animation-finish.js), [showDirector.js](js/showDirector.js)
  **Evidence:** Moving-head, laser and sheet output do not consistently consume `masterIntensity`; the wall uses a threshold. An isolated real-method strobe probe at master zero still emits [10,10,10], ambient intensity 3.2 and retinal alpha 0.18 using the desktop fallback impulse. This is not a capture of the countdown, which smooths toward zero.
  **Problem:** A director or macro intensity of zero is not a global show dimmer.
  **User-visible effect:** Some sources remain bright through an intended dark interval.
  **Immersion impact:** Breaks the contrast and anticipation of authored drops.
  **Desktop impact:** Fixture and room-flash output.
  **VR impact:** Same fixture mismatch, including peripheral flash output.
  **Performance impact:** No new lights or passes are necessary.
  **Recommended solution:** Compose the master multiplicatively into final fixture output, including every flash impulse, with named exemptions for safety practicals.
  **Regression considerations:** Preserve enabled light slots, Safe Mode, look punch and wall accompaniment; do not solve this by toggling lights.
  **Acceptance criteria:** Zero master suppresses all show-owned emission and impulses; intermediate levels dim continuously; exempt safety signage remains.
  **Validation:** Real-method tests at zero/intermediate/full master, an actual countdown run and image-level blackout tests in desktop and emulated XR.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Govern the separate moving-head flash source**

  **Resolution:** Manual moving-head strobes now use the same 0.34 s flash ceiling as the bank, measuring 2.93 complete off→on cycles per second at 45/60/72/90/120 Hz at maximum audio speed, and Safe Mode removes the on/off transitions entirely.

  **Priority:** High
  **Category:** Accessibility
  **Confidence:** High
  **Area:** Manual spotlight strobe modes
  **Affected files:** [08-animation-fixtures.js](js/club/08-animation-fixtures.js), [unit.test.mjs](test/unit.test.mjs)
  **Evidence:** `Math.sin(time * 50 * audioSpeed) > 0` is a separate moving-head square wave. Its nominal rate is 50/(2*pi), about 8 flashes/s, reaching about 12 at `audioSpeed = 1.5`. It is outside the bank's governed timer.
  **Problem:** The existing short-burst/rate tests do not constrain this reachable flash source.
  **User-visible effect:** Manual modes can flash synchronized heads and their surface lighting rapidly.
  **Immersion impact:** Uncomfortable visual exposure, not merely an artistic preference.
  **Desktop impact:** Ungoverned moving-head flashing.
  **VR impact:** The same source occupies the immersive field.
  **Performance impact:** A bounded timing policy is inexpensive.
  **Recommended solution:** Apply an explicit shared or equivalent bounded flash policy to this source; do not add a second independent flash allowance.
  **Regression considerations:** Safe Mode already suppresses this path and must continue to do so. Preserve sweep-only looks and musical timing.
  **Acceptance criteria:** All manual spotlight modes respect the documented flash ceiling at maximum audio input; Safe Mode yields no on/off flash transitions.
  **Validation:** Count complete off-to-on flash cycles at 45/60/72/90/120 Hz, including maximum speed, and run image-level flash assessment. Rate alone is not WCAG certification.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Integrate sheet phase so speed ramps cannot teleport the crossing**

  **Resolution:** `_poseLaserSheet()` now integrates clamped elapsed time into a persistent phase; the shipped ramps measure worst-case p95 0.411 m/s and max 0.430 m/s (`liquidPlane`, 120 Hz, 600 s uptime) instead of the prior 2.49 m single-frame jump at 600 s.

  **Priority:** High
  **Category:** Animation
  **Confidence:** High
  **Area:** Laser-sheet cue ramps
  **Affected files:** [07-animation-core.js](js/club/07-animation-core.js), [showDirector.js](js/showDirector.js), [sheet.test.mjs](test/sheet.test.mjs)
  **Evidence:** Phase is absolute time multiplied by the current speed, while cue ramps change speed in beat-sized steps. A pinned-Babylon maths probe at 600 s moved the crossing 2.49 m in one 60 Hz frame for a normal `liquidPlane` ramp increment; fixed speed moved it 0.0054 m.
  **Problem:** A speed change changes accumulated phase retrospectively; the jump grows with uptime.
  **User-visible effect:** The bright crossing snaps instead of drifting during a cue ramp.
  **Immersion impact:** Violates the calm, physically coherent sheet-motion contract.
  **Desktop impact:** Visible discontinuity.
  **VR impact:** The same sudden spatial motion in the headset.
  **Performance impact:** A persistent phase accumulator is negligible.
  **Recommended solution:** Integrate clamped elapsed time times speed into a continuous phase. Audit the analogous moving-head sweep expression before extending the same helper.
  **Regression considerations:** Preserve both-projector geometry, crossing height, follower lag, speed caps and frame-rate independence.
  **Acceptance criteria:** Actual shipped ramps and cue transitions retain crossing p95 speed <= 1 m/s and maximum <= 1.5 m/s at several uptimes and refresh rates.
  **Validation:** Extend the real-Babylon sheet test to run ramps, not separate constant-speed endpoint runs, at 0/60/600 s and 45-120 Hz.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Reserve an effective material slot for equipment accent lights**

  **Resolution:** DJ and PA accents now both reserve an eligible-light slot with `renderPriority = 1` plus one mesh resync: the room stays `[ambient, spot0, spot1, spot2]`, while the console compiles `[djConsoleLight, ambient, spot0]` at budget 3 and `[djConsoleLight, ambient, spot0, spot1]` at budget 4 without raising any light budget.

  **Priority:** Medium
  **Category:** Rendering
  **Confidence:** High
  **Area:** Imported console and PA lighting
  **Affected files:** [modelLoader.js](js/modelLoader.js), [06-effects.js](js/club/06-effects.js), [vrclub.spec.mjs](test/e2e/vrclub.spec.mjs)
  **Evidence:** Globally affecting room spots precede the mesh-local point lights. A real Babylon light-defines probe at budgets 3 and 4 contains no equipment point-light slot, even with earlier spots at intensity zero.
  **Problem:** `includedOnlyMeshes` prevents spill but does not reserve a slot on those meshes.
  **User-visible effect:** Dedicated console and speaker illumination contributes nothing to the compiled material.
  **Immersion impact:** Equipment loses authored local lighting and legibility.
  **Desktop impact:** Three-slot budget.
  **VR impact:** Four-slot budget has the same starvation.
  **Performance impact:** Reassign existing slots; do not raise the light budget.
  **Recommended solution:** Reserve a bounded equipment slot through explicit mesh/light membership or a compatible priority strategy, retaining intended room-head contribution.
  **Regression considerations:** No real mirror light, slot churn, room spill or per-frame light enable changes.
  **Acceptance criteria:** The local point light participates in equipment shader defines at both budgets and visibly lights equipment with heads dark.
  **Validation:** Compiled-light-slot assertions plus controlled equipment captures; retain the existing locality assertions.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **Restore desktop body calibration after seated XR**

  **Resolution:** `_updateLocalPlayerBody()` now restores the 1.7 m desktop fit on XR exit, preserves measured XR height on re-entry, and the unit/real-rig tests cover seated, standing and DJ-riser transitions.

  **Priority:** Medium
  **Category:** VR
  **Confidence:** High
  **Area:** Local body mode transitions
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [avatarRig.js](js/avatarRig.js), [rig.test.mjs](test/rig.test.mjs), [unit.test.mjs](test/unit.test.mjs)
  **Evidence:** The adapter refits standing-eye calibration on XR entry but only clears its XR-refit flag on exit. A real shipped-skeleton/rig transition from 1.0 m seated XR to the 1.7 m desktop camera retained 1.0 m calibration and measured feet 0.700000 m above the floor.
  **Problem:** A seated/short XR calibration persists into the standing desktop pose.
  **User-visible effect:** The returning desktop body can be small and float above the floor.
  **Immersion impact:** Breaks grounded embodiment after a normal mode switch.
  **Desktop impact:** After a seated or short-height XR session.
  **VR impact:** Re-entry must still preserve measured eye height.
  **Performance impact:** Refit once per transition, not per frame.
  **Recommended solution:** Restore the intended desktop calibration on exit and explicitly own mode-transition body sizing.
  **Regression considerations:** Do not resize genuine crouching or confuse the DJ-riser offset with player height.
  **Acceptance criteria:** Standing/seated XR -> desktop -> XR preserves grounded feet, intended body scale and seated tracking.
  **Validation:** Real-rig transition tests at two heights and on the booth riser, then seated/standing headset inspection.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **Give guests a way to silence crowd ambience**

  **Resolution:** The Audio menu now separates **Music** from persisted **Ambience** (`vrclub.crowdAmbience`), and the generated crowd bed uses a user gain the per-frame acoustic ducking never overwrites.

  **Priority:** Medium
  **Category:** Audio
  **Confidence:** High
  **Area:** User volume and generated crowd bed
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [ui-init.js](js/ui-init.js), [audio-spatial.spec.mjs](test/e2e/audio-spatial.spec.mjs)
  **Evidence:** `setAudioVolume()` changes only the media element. The independently generated crowd source reaches the compressor/master bus directly. Real browser master-bus RMS remained 0.003584 with user volume zero, crowd gain 0.05 and no music element.
  **Problem:** The UI's only Volume control cannot silence app-generated ambience.
  **User-visible effect:** Setting volume to 0% still leaves audible noise.
  **Immersion impact:** Sound control feels unreliable; users cannot opt out of the ambient bed.
  **Desktop impact:** After AudioContext creation.
  **VR impact:** Same, with fewer readily accessible browser controls.
  **Performance impact:** One persistent user gain or an explicit ambience control is negligible.
  **Recommended solution:** Provide a user-owned output gain distinct from acoustic gain, or clearly label music volume and add an ambience mute. Keep voice control explicit rather than silently changing its semantics.
  **Regression considerations:** Spatial attenuation, reverb and the per-frame acoustic master must not overwrite the user setting.
  **Acceptance criteria:** A discoverable control silences generated ambience; control labels accurately describe scope; user gain remains stable during movement.
  **Validation:** Real Web Audio output meter with music absent, music present, volume/mute zero and changing acoustic zones.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **Do not steal native Space activation from focused buttons**

  **Resolution:** Global keyboard shortcuts now ignore focused interactive targets and `defaultPrevented` events, so Space still activates the focused control while scene-focused Space keeps the audio shortcut.

  **Priority:** Medium
  **Category:** Accessibility
  **Confidence:** High
  **Area:** DOM keyboard shortcuts
  **Affected files:** [ui-init.js](js/ui-init.js), [vrclub.spec.mjs](test/e2e/vrclub.spec.mjs)
  **Evidence:** The shortcut guard excludes text fields but not buttons. With an audio element present, focusing Close audio panel and pressing Space leaves it open; Enter closes it in the same browser session.
  **Problem:** The global audio shortcut prevents the focused button's native Space action.
  **User-visible effect:** Keyboard activation of buttons unexpectedly controls music instead.
  **Immersion impact:** Breaks reliable menu interaction.
  **Desktop impact:** Keyboard and assistive input.
  **VR impact:** DOM keyboard accessibility outside immersive XR.
  **Performance impact:** None.
  **Recommended solution:** Respect interactive targets and default-prevented events, allowing global shortcuts only in their intended non-interactive context.
  **Regression considerations:** Keep Space play/pause on the scene and existing text-field/modifier guards; preserve Enter activation and focus restoration.
  **Acceptance criteria:** Focused buttons activate once with Space without changing unrelated audio state; scene-focused Space still controls playback.
  **Validation:** Browser keyboard tests for close, Safe Mode and disclosure buttons with an existing audio element, plus canvas-focused playback.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **Report silent analysis as a heuristic, not proof of a missing CORS header**

  **Resolution:** `getAudioData()` now gates the warning by elapsed unmuted silence, resets on real analyser activity, and reports a CORS restriction as one possible cause instead of as proof.

  **Priority:** Medium
  **Category:** Reliability
  **Confidence:** High for the predicate and message
  **Area:** Audio diagnostics
  **Affected files:** [11-audio-crowd.js](js/club/11-audio-crowd.js), [unit.test.mjs](test/unit.test.mjs)
  **Evidence:** The real `getAudioData()` method emits a categorical missing-header toast after 181 zero-valued reads whenever a playing element's clock exceeds 2 s. A browser analyser/media stub reproduced it without any network or CORS failure.
  **Problem:** Legitimate silence is indistinguishable from blocked analysis, and the threshold is counted in render frames.
  **User-visible effect:** Silent intros, breaks or muted input can receive misleading server-blame feedback at refresh-dependent times.
  **Immersion impact:** False error feedback interrupts otherwise valid playback.
  **Desktop impact:** Same diagnostic.
  **VR impact:** Same predicate at different render rates; DOM toast is not an in-world diagnostic.
  **Performance impact:** Negligible elapsed-time bookkeeping.
  **Recommended solution:** Use elapsed-time gating, account for user mute and prior nonzero samples, and describe sustained silence with CORS as one possible cause unless independently established.
  **Regression considerations:** Keep actionable notification for genuinely blocked/failed streams; do not silently swallow media errors.
  **Acceptance criteria:** Legitimate silence is never described as proven missing CORS; timing is consistent at 45-120 Hz; a blocked source still receives useful guidance.
  **Validation:** Same-origin silent audio, nonzero-then-silent audio, muted playback and failed cross-origin playback, with frame-rate-varied unit tests.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **Measure render submissions and label texture-budget scope accurately**

  **Resolution:** `snapshotResourceBudget()` (test/e2e/xr-measure.mjs) now records engine-counted scene submissions beside the active-submesh proxy and reports ordinary and cube/render-target texture memory separately; the budget spec also takes an XR-entered snapshot. With the bar: desktop 304 submissions (proxy 284), XR 281, 228 MB ordinary textures plus 10-13 MB cube/render-target, zero 4096 textures.

  **Priority:** Medium
  **Category:** Testing
  **Confidence:** High
  **Area:** Browser resource budgets
  **Affected files:** [budget.spec.mjs](test/e2e/budget.spec.mjs), [xr-measure.mjs](test/e2e/xr-measure.mjs), [PERFORMANCE_BASELINE.md](docs/PERFORMANCE_BASELINE.md)
  **Evidence:** The budget adds active submesh counts, not submitted draws, and skips cube/render-target textures. A real high-tier entrance `firstLight` frame had 299 active-submesh proxy draws versus 321 engine-counted scene submissions; 11 cube/render-target textures were outside the estimate.
  **Problem:** Complexity proxies are presented as full draw-call/GPU-memory budgets, and the budget spec never enters XR.
  **User-visible effect:** No immediate rendering change, but expensive passes can regress without violating the advertised budget.
  **Immersion impact:** Missed regressions undermine frame pacing.
  **Desktop impact:** Glow, post-processing, probes and other passes need explicit coverage.
  **VR impact:** XR render-target/MSAA costs are not covered by this desktop snapshot.
  **Performance impact:** Test instrumentation only; do not add production per-frame readbacks.
  **Recommended solution:** Retain the active-content proxy with an honest name, assert engine submission deltas on pinned cues, and separately budget ordinary texture estimates and mode-owned render targets.
  **Regression considerations:** Do not reinterpret SwiftShader time as headset performance or claim exact driver allocation from RGBA estimates.
  **Acceptance criteria:** Added render passes change the submission budget; render-target growth changes its own estimate; desktop and emulated XR shapes are validated separately.
  **Validation:** Mutation checks adding a pass/render target, pinned mirror/strobe/sheet cues, and XR entry; actual Quest timing remains in the existing headset-baseline item.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** High

---

## Review — 2026-10-03 — Phase 1 of the realism plan

Done: neon and exit signs (see the resolved item below), a contact shadow under every character, a
dark industrial reflection environment, packed ORM surface maps. Measured from the entrance view: draw
calls 347 -> 329, texture memory 224 -> 210 MB.

- [x] **People and gear floated: nothing grounded them**
  **Resolved 2026-10-03 for characters.** One quad with a thin instance per enabled character (a soft
  radial blob, alpha-blended, no depth write, no light): one draw call, rebuilt only when the set of
  enabled characters changes. Checked on a lit floor with the characters hidden. **Still open:** the DJ
  console, the booth and the speakers are not covered, and a blob does not follow a moving light.
  **Correction 2026-10-04:** no light currently owns a shadow generator; tier shadow settings
  therefore do not provide equipment coverage. Retain this gap in the existing grounding item.
- [x] **Reflections came from a generic sample sky**
  **Resolved 2026-10-03.** The scene environment is now Poly Haven's *Empty Warehouse 01* (CC0, Sergej
  Majboroda), prefiltered to 256 px (152 KB, was 268 KB), loaded from `textures/environment/`. On the
  DJ booth, the truss and the speakers the metal now takes a cool industrial reflection with real shape,
  at the same mean brightness. The mirror ball's mirror facets read as silver instead of blue-purple.
  A contract test checks the file, its magic bytes and its ASSETS.md row. **Not measured:** how it reads
  in a headset; the 256 px size is a guess and 128 px would halve it again.
- [x] **Mirror-ball rays, spots and beams are still about 80 animated draws**
  **Resolved/rechecked 2026-10-06:** Surface spots and outgoing rays now use two thin-instance
  batches (`mirrorReflectionSpots`, `mirrorOutgoingRays`). The current production browser
  contains those batches and the full Node suite passes the batching regression. This closes
  the batching work, not the separate hardware/CPU timing acceptance criterion.
  **Priority:** Medium. Left out of this pass on purpose: they move every frame, are found by name for
  cleanup and are gated per tier, so thin-instancing them needs its own careful change and a visual
  A/B. Likely 80 -> about 4 draws.

---
## Review — 2026-10-03 — Engine and tooling upgrade

Babylon.js moved 8.30.5 -> 9.28.0 (see CHANGELOG). Items it left behind:

- [ ] **Clustered lighting could lift the 3 to 4 lights per surface cap**
  **Priority:** Medium. **Category:** Lighting. **Confidence:** Low until tried.
  Babylon 9 ships `ClusteredLightContainer` (and many more light-related changes). The cap in
  `VRClub.detectMaxLights()` is the single biggest limit on how much of the moving-head rig actually
  lights surfaces (only ambient, spot0 and spot1 ever do). Clustering would let every head and the LED
  wall light the room. **Risk:** it changes the light uniform layout, which the frozen PBR materials, the
  `includedOnlyMeshes` fixture lights and `_clampMaterialLightBudgets()` all depend on, and Quest cost is
  unknown. **Acceptance criteria:** a prototype behind a flag on the high tier, side-by-side captures, and a
  Quest frame-time comparison before it goes near the balanced tier.
- [ ] **The runtime grew 1.7 MB**
  **Priority:** Low. `babylon.js` is 8.4 MB (was 7.2) and the glTF loader bundle 829 KB (was 338 KB).
  The production bundle does not tree-shake the vendored files. **Option:** a custom Babylon build (ES
  modules and esbuild) that includes only what the club uses; it would also cut parse time on Quest.
  Measure parse and start-up on a headset before deciding.
- [ ] **Entering XR logs about 250 "Framebuffer is incomplete: Attachment has zero size" warnings**
  **Priority:** Low. Seen in the IWER emulator on 8.30.5 and 9.28.0 alike, all during the first frames of
  the session (none during load or desktop rendering), each a draw into a render target that has no size
  yet. Cheap to find (log the render-target names while XR starts); check whether a real Quest does it too.
- Not adopted: `fixedFoveation` is exposed on the XR session manager in both versions (not new in 9);
  setting it changes the headset's sharpness against its cost, so it belongs with the Quest baseline.
- [ ] **Resolve the relay tooling advisory chain and audit its separate lockfile in CI**

  **Rechecked 2026-10-08:** Root audit and both production-only audits report zero.
  `npm --prefix worker audit --audit-level=high` still exits 1 with four high-severity
  development-tooling nodes in the Wrangler/Miniflare Sharp and Undici chain. CI still runs
  only the root lockfile audit.

  **Rechecked 2026-10-06:** Root audit still reports zero. The worker full audit now reports
  **four high dependency nodes**, not the previous one high/two moderate: Wrangler, Miniflare,
  Undici 7.29.0 and Sharp 0.35.4. Sharp adds GHSA-wq5f-xc86-pv6w (fixed boundary 0.35.5).
  Production-only worker audit remains zero; this is development-tooling exposure, not a
  demonstrated application exploit. npm now proposes Wrangler 4.15.2; do not blindly downgrade.

  **Priority:** Medium
  **Category:** Dependency
  **Confidence:** High for the lockfile/advisory match; application exploitability not established
  **Area:** Optional relay development tooling and CI dependency coverage
  **Affected files:** [worker/package.json](worker/package.json), [worker/package-lock.json](worker/package-lock.json),
  [ci.yml](.github/workflows/ci.yml)
  **Evidence:** Rechecked 2026-10-05: root `npm audit --json` reports zero, so the old root CLI/braces
  finding is no longer current. `npm audit --prefix worker --json` exits 1 with one high and two moderate
  dependency nodes. The lockfile chain is `wrangler@4.141.0 -> miniflare@5.20260925.0-alpha -> undici@7.29.0`.
  The high advisories include GHSA-rfgv-xxqx-mfg5 and GHSA-w293-vg96-wgc3; their listed fixed boundary is
  7.29.1. Production-only relay audit reports zero. CI currently audits the root lockfile only.
  **Problem:** A clean Pages audit does not cover the separately locked relay toolchain.
  **User-visible effect:** No shipped-browser exploit or live-relay incident was demonstrated.
  **Immersion impact:** Indirect: reliability of the tooling used to support optional social sessions.
  **Desktop impact:** Development tooling, not a bundled browser dependency.
  **VR impact:** Same distinction; no headset vulnerability is claimed.
  **Performance impact:** No expected client rendering change.
  **Recommended solution:** Select a compatible patched tooling dependency path, validate local relay
  operation and audit both lockfiles in CI. Review the individual advisories for actual tooling exposure.
  Do not blindly accept npm's proposed Wrangler downgrade to 4.101.0.
  **Regression considerations:** Preserve Worker/Durable Object compatibility and existing relay tests;
  do not weaken the audit threshold to hide the issue.
  **Acceptance criteria:** Both full lockfile audits report no high findings, CI covers both, and the
  selected relay toolchain passes its development/build smoke checks.
  **Validation:** Root and worker `npm audit`, lockfile-tree inspection, Node relay tests and a local
  Worker smoke test. No Wrangler operation or deployed relay test was run in this review.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

---

## Review — 2026-10-03 — Strobe feel, headset antialiasing and external performance feedback

Scope: strobe timing and brightness, the headset antialiasing path, and a check of an outside
developer's feedback (big assets, draw calls, spot lights) against this repo. Measured in the
Chromium and Quest-emulator harness; nothing here is measured on a real Quest 3S.

- [x] **Strobes read as the room being lit when switched on from the menu**

  **Resolved 2026-10-03.** Switching strobes on by hand puts the club in manual VJ mode, so they run on
  the free-running timer, not the beat grid. There a burst's real length was `0.09 / speed^1.5`: 90 ms
  (7 frames at 72 Hz) at speed 1, and the speed left behind by the last cue (2.4, or 4.8 after the
  countdown) also set the rate, which could reach 7 to 9 flashes a second. The earlier "bursts never
  reach the screen" fix made all of them visible. Now a burst is about 40 ms (3 frames at 72 Hz, shorter
  at higher speed, never under 22 ms), the free timer can never exceed 3 flashes a second, switching
  strobes on by hand while the show is driving resets the speed to the default, and the VR flash level
  is measured against the desktop one (0.19 against 0.22 mean luminance, was 0.33).
  **Evidence:** MEASURED. A 72 Hz simulation of the previous code gave "one burst lasted 97 ms"; the new
  unit test fails on it and passes now. `test/unit.test.mjs`: "strobes are short stabs, and the
  free-running timer never exceeds three flashes a second" (72, 90, 120 and 45 Hz, five speed and drop
  combinations), and "switching strobes on by hand resets a leftover show speed".
  **Not verified:** how the new level feels in a headset.

- [x] **The headset ran with no MSAA, so edges stair-stepped**

  **Resolved 2026-10-03, with an unmeasured frame-time cost.** The VR pipeline set `samples = 1` on the
  comment "the XR layer provides its own antialiasing". The layer's `antialias` only affects content
  drawn straight onto it; the scene is drawn into the pipeline's offscreen target first, so only FXAA
  was running. It now uses MSAA from `vrSettings.vr.msaaSamples` (4), clamped to the GPU's limit, with a
  stored override `vrclub.vrMsaa` (1, 2 or 4). Crops of the DJ and thin lines were rough at 1x and
  clean at 4x.
  **Risk:** 4x MSAA on a half-float target costs bandwidth, and a tiled mobile GPU resolves it cheaply
  but this has not been measured on a Quest 3S. If frame time suffers, set `vrclub.vrMsaa` to 2 and
  report back; the default can then be lowered. The desktop `balanced` tier still uses no MSAA.

- **Not applicable: "swap spot lights for point lights".** There are 6 spot lights, 3 point lights on
  and 3 off, and 1 hemispheric. Only 3 to 4 lights reach a surface at a time (the photometric slots), no
  shadow generator runs in VR, and a spot light's cost over a point light is a few instructions. A point
  light would also light the ceiling and the back of the room, losing the cone-shaped pools the heads
  exist to make. The cost is the number of lights per material, which is already clamped.

- Applies, and both are now fixed (see the two resolved items below): the large assets (1.45 GB of GPU
  texture memory -> 224 MB) and the draw calls (the 210-panel LED wall -> 1 mesh).

---

## Review — 2026-10-02 — VR parity and headset emulation

Scope: new emulator-driven specs, `test/e2e/vr-session.spec.mjs` and
`test/e2e/vr-parity.spec.mjs`, run in Chromium on SwiftShader with a Quest 3 emulated by
IWER. The emulator renders mono at 1280x720, so it proves behaviour, not headset frame time,
stereo comfort or the Quest compositor. Findings that depend on the render output carry
that caveat in their confidence.

Checked and found sound (do not re-raise without new evidence):

- Spawn is the dance-floor centre (0, 1.6, -12), facing the stage. Headset and controller
  poses reach the scene at the right place, snap turn is exactly 30 degrees and does not
  translate the user, and teleport lands on the floor inside the room.
- The DJ-platform and wall teleport blockers work: with them removed, a 26 degree throw
  lands on the platform at (-0.50, -18.04) and a 12 degree throw lands outside the room.
- At the `balanced` tier (what a Quest always runs) the only desktop/VR differences are the
  documented ones; the show, crowd, fixtures, tone mapping, bloom, glow, FXAA, dithering and
  reflections are all present in VR. `INTENTIONAL_DIFFERENCES` in the parity spec lists them.
- The emulator needed a fix: IWER 2.3.0 ignores every origin offset, which silently disables
  teleport, snap turn and `xrCamera.position` writes. `test/e2e/support.mjs` patches it. This
  was first misread as an app spawn bug; it is not.

### New open items

- [x] **Strobes never reached the screen on any frame longer than the burst**

  **Resolved 2026-10-03.** A burst is drawn for the frame it fires on, then counts down.

  **Priority:** High
  **Category:** Bug
  **Confidence:** High. Reproduced in the browser and in a unit test.
  **Area:** Strobe bank
  **Affected files:** `js/club/09-animation-finish.js`
  **Evidence:** MEASURED. With strobes forced on and Safe Mode off, 0 of 120 rendered frames
  flashed on desktop and in VR. After the fix, 60 of 120 do, and the VR frame is about 13x
  brighter while one fires (0.0056 to 0.0756; desktop about 20x). `updateStrobes()` counted the
  flash timer down before drawing it; a burst is 20-90 ms (45-90 ms divided by the strobe speed
  to the power 1.5), so on any frame longer than the burst it was lit and cleared in one pass.
  At 72 Hz a 24 ms peak burst got a single 14 ms frame; at 36-45 fps or under load it got none.
  **Problem:** Strobe presence depended on the frame rate, which breaks the frame-rate
  independence rule, and it disappeared exactly when a headset is under the most load.
  **User-visible effect:** Strobes looked absent or barely there in VR.
  **Immersion impact:** High for peak cues. **Desktop impact:** Same on a slow machine.
  **VR impact:** Worst, the headset runs the heaviest frame.
  **Performance impact:** None.
  **Regression considerations:** Cadence, intensity, the cues that use strobes and
  Photosensitive Safe Mode are unchanged. Flashes that were invisible now render, so Safe Mode
  matters more, not less.
  **Acceptance criteria:** A burst is lit for at least one frame at every frame time from 90 Hz
  to a 4-frame stall and still ends within the designed 90 ms plus one frame.
  **Validation:** `test/unit.test.mjs` "a strobe burst is visible for at least one frame at any
  frame time" (fails before the fix at speed 2 on a 50 ms frame).
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **Strobes were rare by design, and absent without music**

  **Resolved 2026-10-03.** Strobes are now an accent through the groove and the build, and Safe
  Mode is no longer inferred from `prefers-reduced-motion` (product decision). Strobe bars rose from
  14 of 222 (6%) to 82 of 222 (37%): ARRIVAL 0/36, PULSE 32/56, ASCENT 28/36, IGNITION 22/46,
  AFTERGLOW 0/48. `sideways`, `crossfire`, `ceilingSidewash`, `ceilingDip`, `theClimb`,
  `laserStorm`, `afterburn` and `chromaticRoom` now carry a `chase` strobe once per bar
  (about 0.5 flashes a second at any tempo); the opening, the breakdown arc and the comedown stay
  strobe-free. A unit test enforces that any strobe layered under another subject is bar-synced
  (only `detonation` and `releaseHit` may be faster) and `strobe-defaults.spec.mjs` measures it in
  the browser. The original analysis is kept below.

  **Priority:** Medium
  **Category:** Lighting
  **Confidence:** High for the mechanism, Medium for whether it is a defect
  **Area:** Show Director movement selection
  **Affected files:** `js/showDirector.js`
  **Evidence:** Strobes existed only in the 4-bar `strobeHeartbeat` (ASCENT), the IGNITION
  movement and the countdown set-piece. `_pickMovement()` needs the smoothed energy above 0.34
  for IGNITION; with no audio the show assumes 0.24, so it can reach ASCENT but never IGNITION.
  Photosensitive Safe Mode force-disables strobes everywhere. It used to default on under
  `prefers-reduced-motion`; that default is removed. A stored `vrclub.safeMode = '1'` (set when a
  guest taps the splash toggle) still keeps it on.
  **Problem:** A user in VR can legitimately see no strobes for minutes, with no hint why.
  **User-visible effect:** "The strobes do not work."
  **Recommended solution:** Show the Safe Mode state in the in-headset menu header.
  **Acceptance criteria:** A user can tell from the headset why strobes are not firing.
  **Validation:** Quest menu capture.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **All spatial audio was mirrored left to right (PA, crowd bed and guest voices)**

  **Resolved 2026-10-03.** `AudioUtils.audioX()` / `setPannerPosition()` /
  `setPannerOrientation()` convert Babylon's left-handed space to Web Audio's right-handed
  space, and the listener position, forward and up all go through them.

  **Priority:** High
  **Category:** Spatial Audio
  **Confidence:** High. Measured in Chromium, not guessed.
  **Area:** Web Audio listener, PA, crowd bed and remote voices
  **Affected files:** `js/audioUtils.js`, `js/club/11-audio-crowd.js`, `js/avatarManager.js`
  **Evidence:** MEASURED with an `OfflineAudioContext` and an HRTF panner: in all four tested
  poses the PA was heard in the ear opposite to the side it appears on screen (for example,
  facing the stage, the PA at x=-6 appears on the right and was louder in the LEFT ear,
  0.049 against 0.014). Babylon is left-handed and Web Audio is right-handed; the code passed
  Babylon coordinates straight through. The old unit test asserted the unmirrored values.
  **Problem:** Every positional sound came from the wrong side, and turning the head moved the
  stage the wrong way in the headset.
  **User-visible effect:** The sound field contradicted the picture, the strongest possible
  presence breaker for spatial audio.
  **Immersion impact:** High. **Desktop impact:** Same. **VR impact:** Worst, since head turns
  drive the HRTF field continuously.
  **Performance impact:** None.
  **Also fixed:** the listener's up vector was a static +Y, so a tilted head left the sound
  field upright; it now follows the camera's world matrix with no per-frame allocation.
  **Regression considerations:** Keep the analyser pre-spatial and the occlusion, reverb and
  sub behaviour unchanged.
  **Acceptance criteria:** The nearer PA is louder in the ear on its screen side, on desktop
  and in VR, including after a head turn.
  **Validation:** `test/unit.test.mjs` (side-of-ear maths for six yaws, head roll) and
  `test/e2e/audio-spatial.spec.mjs` (noise through the real graph; fails with a left/right
  ratio of 0.84 if the mirroring is removed).
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **The VR frame was output at 10% brightness (and the desktop at 50%)**

  **Resolved 2026-10-03 for VR.** The cause is not the lighting and not the emulator. The VR
  pipeline set `sharpen.colorAmount` to 0.1 (`vrSettings.vr.colorSharpness`), and Babylon's
  sharpen shader is `colour * colorAmount - edge * edgeAmount`: `colorAmount` is a brightness
  gain on the final, already tone-mapped image, default 1. VR now uses `sharpenGain: 1.0`,
  exposure is retuned (1.35 to 0.6) and the strobe impulse is moved into config and retuned.
  Bisected in the browser: with bloom, FXAA and sharpen off together the VR frame rose from
  0.0072 to 0.0661; switching off sharpen alone gave 0.0713, bloom and FXAA alone changed nothing.
  A real headset report ("light is just a colour, it does not brighten the room") matched.
  Measured after the fix, against the same desktop cue: VR mean luminance x1.6-1.9 and peaks
  (p99) x2.1-2.6 of desktop, where before it was x0.37 with peaks about a tenth.
  Side effect found and fixed: the old strobe impulse (3.8 / 0.24 / 2.6), tuned under the 10% cap,
  now measures a 0.76 mean-luminance full-field white-out in VR against 0.22 on desktop. It is now
  `vrSettings.vr.strobeImpulse` = 1.6 / 0.10 / 1.2, a flash of about 0.3 (about 12x the idle frame).
  Raw scene radiance was equal or higher in VR throughout (0.0261 against 0.0207), which is why
  every lighting experiment before the bisect found nothing.

  The remainder of the original analysis is kept below for the record.

  **Priority:** High
  **Category:** VR
  **Confidence:** Medium. Measured and reproducible, but on an emulator whose XR output path is
  not the Quest compositor. Needs one capture on a real headset before it is called a defect.
  **Area:** XR render path, post-processing
  **Affected files:** `js/club/01-core.js` (`applyVRSettings`), `js/club/03-rendering.js`
  **Evidence:** MEASURED. Same scene, hue-pinned `firstLight` cue, same position and 90 degree
  vertical FOV, `balanced` tier. Mean luminance of the upper 62% of the frame: desktop
  0.015-0.025 (varies with the show), VR 0.0073-0.0077 (stable); ratio 0.30-0.51. The ratio
  map is 0.25-0.77 in every region, median about 0.45, so the loss is global, not limited to
  the LED wall, the beams or the floor. Structure matches (grid correlation 0.89-0.90).
  Ruled out one at a time in VR, none restored the brightness: fog and environment at desktop
  values, desktop haze, bloom off, glow intensity 0 or 3.5, the VR animation boosts
  (`isInVRMode` false). ACES tone mapping off roughly doubles the VR frame (0.0148), and on
  desktop it raises 0.0156 to 0.0439.
  **Narrowed 2026-10-03 (MEASURED): the lighting is not the cause; the loss is after the scene
  is rendered.** Raw HDR radiance with every post-process off (a float render target, mean
  linear luma): desktop mode / desktop camera 0.0207; VR mode / desktop camera 0.0255; VR mode /
  XR rig camera 0.0261. So the XR camera sees a slightly BRIGHTER scene than the desktop one, as
  designed. On the desktop, applying every VR setting (VR post values, no vignette, SSAO off,
  `isInVRMode`) raises the final frame from 0.0157 to 0.0532, yet the real VR frame is 0.0074,
  about 7x lower than the same scene and settings on the desktop. Final-frame alpha is 1.0 in
  both, so it is not alpha. Two desktop findings fell out of the same run: SSAO costs 0.0157 to
  0.0205 and the vignette (weight 2.2) 0.0205 to 0.0287 of the desktop frame.
  **Problem:** Something between the XR camera's post-process chain and the emulator's output
  loses roughly 7x. Whether that is the emulator or the app's XR pipeline is not yet known.
  A flat emissive-plane read-back of the output transfer function did not isolate it (the
  centre pixel did not follow the plane's value in either mode); that probe needs redoing.
  **User-visible effect:** If it reproduces on a Quest, the club looks roughly half as bright
  in the headset as on the desktop screen, with far fewer bright highlights.
  **Immersion impact:** High if confirmed; the light show carries the presence.
  **Desktop impact:** None.
  **VR impact:** Whole-scene dimming.
  **Performance impact:** None expected.
  **Recommended solution:** First capture the same pose and cue on a Quest 3S (or the Meta
  Immersive Web Emulator) to confirm. If it is real, bisect the XR post-process chain (the
  `vrPipeline` stages on the XR rig cameras) and the XR layer's colour handling; do not retune
  the VR light values, which are not the problem.
  **Regression considerations:** Keep VR comfort settings (no vignette, no motion blur), the
  light budget and the frozen-material rules.
  **Acceptance criteria:** VR/desktop mean luminance >= 0.75 at the parity spec's pose and cue.
  **Validation:** `npx playwright test vr-parity.spec.mjs` and a headset capture. Raise the
  `luma > 0.2` floor in the spec as the gap closes.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [ ] **Desktop output is halved by the same sharpen gain (0.5)**

  **Priority:** Medium
  **Category:** Rendering
  **Confidence:** High for the mechanism, Medium for how much the desktop look relies on it
  **Area:** Desktop post-processing
  **Affected files:** `js/club/03-rendering.js`, `js/club/01-core.js` (`vrSettings.desktop.sharpenAmount`)
  **Evidence:** `pipeline.sharpen.colorAmount = desktop.sharpenAmount` (0.5). It is a gain on the
  final image (see the resolved VR item), so every desktop pixel is multiplied by 0.5 after tone
  mapping and peak white is capped at 50%. Desktop strobes reach a mean luminance of 0.22 and the
  frame peaks at 0.1-0.14, which is why the desktop looks dim and muddy rather than punchy.
  **Problem:** A "sharpness" setting is silently a -6 dB output gain. The desktop exposure, bloom
  and the existing tests were tuned against it.
  **User-visible effect:** A dimmer, lower-contrast desktop than the fixtures are authored for.
  **Immersion impact:** Medium. **Desktop impact:** Yes. **VR impact:** None.
  **Performance impact:** None.
  **Recommended solution:** Set the gain to 1.0 and lower `vrSettings.desktop.exposure` (and re-check
  the vignette, SSAO strength and strobe impulse) until the mean luminance matches today's, so the
  look is unchanged but peaks reach full white.
  **Regression considerations:** Brightness-threshold tests (`mirror-only cues do not turn the
  foreground into a white layer`), strobe flash level, Photosensitive Safe Mode.
  **Acceptance criteria:** Desktop peaks reach full scale with no change in mean luminance.
  **Validation:** `vr-parity.spec.mjs` (remove the `pipeline.sharpenGain` entry from
  `INTENTIONAL_DIFFERENCES`), the e2e suite, and a side-by-side capture.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [ ] **Desktop loses SSAO after a VR visit**

  **Rechecked 2026-10-06:** The unchanged isolated parity run passed its exact
  `KNOWN_DESKTOP_RESTORE_DRIFT` comparison, which still includes both SSAO fields.
  This is tolerated drift, not proof of correct restoration.

  **Priority:** Medium
  **Category:** Bug
  **Confidence:** High
  **Area:** `applyVRSettings` / `applyDesktopSettings`
  **Affected files:** `js/club/01-core.js`
  **Evidence:** MEASURED. `ssaoPipeline._cameras` is `["camera"]` before VR, `[]` while in VR
  and still `[]` after exit. The comment in `applyDesktopSettings()` says SSAO "remains
  attached to the desktop camera while XR is active, so there is nothing to reattach"; the
  data says it does not.
  **Problem:** SSAO is never reattached to the desktop camera.
  **User-visible effect:** After one VR session the desktop loses ambient occlusion until reload.
  **Immersion impact:** Low-Medium. Contact darkening around the booth and truss disappears.
  **Desktop impact:** Yes. **VR impact:** None.
  **Performance impact:** Slightly cheaper desktop, which hides the bug.
  **Recommended solution:** Reattach the desktop camera to the `ssao` pipeline in
  `applyDesktopSettings()` (guarded and in `try/catch`), and find which call detaches it.
  **Regression considerations:** Do not attach SSAO to the XR camera. Reattaching non-reusable
  passes logs errors, so verify the console stays clean.
  **Acceptance criteria:** `ssaoCameras` equals `["camera"]` after exit.
  **Validation:** Remove `screenSpace.ssaoAttached` and `screenSpace.ssaoCameras` from
  `KNOWN_DESKTOP_RESTORE_DRIFT` in `vr-parity.spec.mjs`; the spec must still pass.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [ ] **Desktop reflections get 50% stronger after a VR visit**

  **Rechecked 2026-10-06:** Source still initializes 0.4 and restores 0.6; the isolated
  parity run still reports this field through its exact known-drift assertion.

  **Priority:** Low
  **Category:** Bug
  **Confidence:** High
  **Area:** Scene environment settings
  **Affected files:** `js/club/02-lifecycle.js`, `js/club/01-core.js`
  **Evidence:** MEASURED. `init()` sets `environmentIntensity` to 0.4; `vrSettings.desktop`
  says 0.6 and `applyDesktopSettings()` writes it on exit. The live value goes 0.4 to 0.6.
  **Problem:** Two sources of truth for one value.
  **User-visible effect:** The desktop look shifts after the first VR session.
  **Immersion impact:** Low. **Desktop impact:** Yes. **VR impact:** None.
  **Performance impact:** None.
  **Recommended solution:** Decide the intended value, set it in one place, and have `init()`
  read the config.
  **Regression considerations:** Reflection brightness on the floor, truss and DJ gear.
  **Acceptance criteria:** The value is identical before and after a VR visit.
  **Validation:** Remove `environment.environmentIntensity` from `KNOWN_DESKTOP_RESTORE_DRIFT`.
  **Estimated effort:** Small
  **Product value:** Low
  **Technical debt reduction:** Low

- [ ] **The first trigger pull from the inactive hand does not click**

  **Priority:** Medium
  **Category:** UX
  **Confidence:** High for the behaviour, Medium for how often users hit it
  **Area:** VR pointer selection
  **Affected files:** `js/club/02-lifecycle.js` (`createDefaultXRExperienceAsync` options)
  **Evidence:** MEASURED. Opening the menu with the left Y button, then aiming the right
  controller at a button and pulling its trigger, did not toggle it. The ray hit the right mesh.
  Babylon's pointer selection routes clicks through one controller (`_attachedController`, the
  left one here) unless `enablePointerSelectionOnAllControllers` is set; the other hand's first
  pull only switches the pointer to it. The same select from the left hand worked.
  **Problem:** Only one hand has a live laser, and nothing tells the user.
  **User-visible effect:** A right-handed user opens the menu with the left hand, points with
  the right and pulls the trigger once with no effect.
  **Immersion impact:** Low. **Desktop impact:** None.
  **VR impact:** Menu feels unresponsive on the first click.
  **Performance impact:** One extra laser mesh.
  **Recommended solution:** Set `enablePointerSelectionOnAllControllers: true`, and check it
  against teleportation's `setSelectionFeature` hand-off.
  **Regression considerations:** Teleport arcs, snap turn, and the Y/B menu binding.
  **Acceptance criteria:** A single right-hand pull toggles a button without a prior left pull.
  **Validation:** Extend the menu step in `vr-session.spec.mjs` to select with the inactive hand.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

---

## Review — 2026-10-02 — Ultrahyperrealism pass

Scope: source inspection of venue build, lighting ownership, spatial audio, crowd and
embodiment, plus commands run on `e2c49ea`: `npm run check` (38 files), `npm test`
(135/135), `npm run build`, `npm run check:sri`, `npm run audit:assets` (71.97 MiB,
30 files) and `npx playwright test` (4/4). No physical Quest capture and no new
frame-time measurement. Historical numbers in `docs/PERFORMANCE_BASELINE.md` are
not re-measured here.

Reconfirmed, not duplicated:

- `createEntranceArea()`, `createDanceFloorLighting()` and `createBar()` are still
  defined and still uncalled. `_buildVenue()` calls `createSafetyDetails()` only.
- The looping-crowd, Quest baseline, contact-shadow, asset-weight and licensing
  items remain the highest-value open work.
- Music is still HRTF-spatialised from the two flown PA positions.

Updated in place, not closed:

- Remote guests: the first four now use `AvatarRig`; later guests and guests who
  arrive before the crowd loads still fall back to a capsule. The 2026-09-18 item
  stays open.
- Local embodiment: `AvatarRig` now poses a body and, in VR, IK arms. Venue contact
  and a physical control response are still absent, so the 2026-09-15 embodiment
  item stays open.

### New open items

- [x] **Neon wall signs are blank emissive rectangles**

  **Resolved 2026-10-03.** `createSignage()` draws CLUB, VR, DANCE and EXIT into one 1024x512 atlas (outline tubes with a halo and a hot core; an exit sign with a tinted panel) and renders all five signs as one additive quad mesh plus one merged backing-plate mesh. While doing it I found the old signs could not be seen at all: they sat on the wall's centre line, inside the front wall or facing into it. They are now on the inner faces, clear of the brick fins and pillars, and the glow layer gives them a halo. 13 meshes became 3 (including the step lights), no light added, no per-frame update.

  **Priority:** Medium
  **Category:** Rendering
  **Confidence:** High
  **Area:** Perimeter signage
  **Affected files:** `js/club/04-environment.js`
  **Evidence:** `createSafetyDetails()` stores `text: 'CLUB' | 'VR' | 'DANCE'` and then
  never reads `sign.text`. Each sign is a double-sided `StandardMaterial` plane with
  only an emissive colour. Exit faces use the shared exit-sign preset; these three do not.
  **Problem:** The only perimeter "signage" cannot be read, and it bypasses the material factory.
  **User-visible effect:** Eye-level coloured slabs with no lettering, tube geometry or glow falloff.
  **Immersion impact:** Medium. At VR inspection distance they read as placeholders, not a club.
  **Desktop impact:** Same, less close.
  **VR impact:** High at the wall; the planes are large enough to read as missing text.
  **Performance impact:** Negligible if replaced with one shared dynamic texture or a frozen atlas.
  **Recommended solution:** Draw the existing strings into one shared dynamic texture, or a small
  emissive atlas, and route the material through `MaterialFactory`. Do not add a light per sign.
  **Regression considerations:** Keep the planes frozen, unpickable and inside the existing light budget.
  **Acceptance criteria:** Each of the three signs shows its authored word at 2 m; no new light;
  no per-frame texture update.
  **Validation:** Desktop capture at the right wall, left wall and entrance; `npm test`.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

---

## Review — 2026-10-01 — Presence, photosafety and coherence

Scope: source inspection of rendering, XR locomotion, spatial audio and crowd, plus
`npm test` (113/113) and `npm run check` (37 files). No headset capture, no live
frame-time measurement, and no e2e run this pass. Prior measured baselines in
`docs/PERFORMANCE_BASELINE.md` are cited only as historical measurements.

Checked and found sound (do not re-raise without new evidence):

- Music is HRTF-spatialised from the two flown PA positions, with inverse-distance
  attenuation, a sub path, air absorption, a synthesised reverb send and entrance
  occlusion. This is a designed acoustic model, not listener-glued stereo.
- Comfort mode still defaults on (teleport + 30° snap). Smooth movement is explicit
  opt-out. Y/B quick-menu binding is registered independently of locomotion.
- Shell collision and teleport blockers from the 2026-09-30 pass are still in place.
  Do not reopen "camera leaves the venue" or "teleport through walls".
- `_writeExposure()` still bypasses the notifying setter except when the value is
  exactly 1. The strobe path still calls it; the open cost is the flash-light
  `setEnabled()` item below, not a new exposure-notification regression.
- SSR `reflectivityThreshold` above dielectric F0 is an intentional anti-mirror-floor
  choice. Do not lower it.
- Worker abuse controls and the Chromium muted-`<audio>` voice workaround are in
  source and unit-tested. They stay open only for deploy / two-device audition.

Reconfirmed, not duplicated:

- Shipped haze is on again (`atmosphereTestDisabled = false`). EXP2 fog stays up and
  tints toward the look. See the resolved clear-air item. Bar/entrance methods are still
  uncalled.
- Photometric slots now follow the strongest surface hits. The contact-shadow half of
  the light-mismatch item is still open. Strobe `setEnabled()` is gone; the flash light
  stays disabled. Crowd skeletal allocation and the missing Quest baseline are unchanged.

### New open items

- [x] **Reduced-motion Safe Mode is shown ON but never applied**

  **Resolved 2026-10-01.** Splash and constructor share `VRClubCore.resolvePhotosensitiveSafeMode()`.

  **Priority:** Critical
  **Category:** Accessibility
  **Confidence:** High
  **Area:** Splash photosafety / strobe gate
  **Affected files:** `js/ui-init.js`, `js/club/01-core.js`, `index.html`
  **Evidence:** CONFIRMED by code. `initSplashSafeMode()` renders the splash button ON when
  `prefers-reduced-motion: reduce` matches and `vrclub.safeMode` is unset, but it writes
  `localStorage` only on click. `enterClubBtn` then does `new VRClub()`, and the constructor
  sets `photosensitiveSafeMode` only when `localStorage['vrclub.safeMode'] === '1'`.
  The two never meet, so the instance starts with strobes allowed while the splash says ON.
  **Problem:** The product contract is that Safe Mode defaults on under reduced motion and
  is applied before the scene renders. The control advertises that and does not do it.
  **User-visible effect:** A reduced-motion user can enter believing flashes are suppressed
  and still get the full strobe show.
  **Immersion impact:** Safety, not atmosphere. A false safety control is worse than no control.
  **Desktop impact:** Same as VR.
  **VR impact:** Same, and harder to leave once the headset is on.
  **Performance impact:** None.
  **Recommended solution:** Resolve Safe Mode once, before `new VRClub()`: stored `'1'`/`'0'`
  wins; otherwise use `prefers-reduced-motion`. Persist that result and have the constructor
  read the same function. Add a unit or contract test that a null store plus reduced motion
  yields `photosensitiveSafeMode === true` on the instance without a click.
  **Regression considerations:** An explicit stored `'0'` must still win over reduced motion.
  Do not enable strobes during the splash.
  **Acceptance criteria:** With no stored choice and reduced motion, entering the club has
  Safe Mode on before the first lighting update. With stored `'0'`, it stays off.
  **Validation:** Unit test of the resolver; manual splash check with the media query forced.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **Local dancers occupy no space and do not react to the player**

  **Resolved 2026-10-01.** Dancers and the DJ get a static collision box; remote capsules
  collide; the nearest dancer yaws away. The local guest has one extra body (not counted
  in the tier headcount): first a dancer clone replaying a slowed dance, now an `AvatarRig`
  (`js/avatarRig.js`) that walks, turns, crouches and reaches. No Havok world and no desktop
  gravity. Still open: VR hand roll against real controllers; no finger curl; remote guests
  do not yet send head pitch or hand poses, so they have a gait but relaxed arms.

  **Priority:** High
  **Category:** Crowd
  **Confidence:** High
  **Area:** Dance floor presence
  **Affected files:** `js/club/11-audio-crowd.js`
  **Evidence:** CONFIRMED by code. Dancer meshes are `isPickable = false`. Their update uses
  analyser bass, camera distance (pause beyond 28 m, which the room cannot reach) and a shared
  playback-rate boost. No collision ellipsoid, physics impostor, gaze, step-aside or personal-space
  response exists. Remote guests are a separate system (`js/avatarManager.js`) and are also
  non-colliding; do not conflate the two.
  **Problem:** The only nearby humans can be walked through. They are scenery, not occupants.
  **User-visible effect:** The player passes through a dancer with no look, yield or contact.
  **Immersion impact:** High at social distance. This is a stronger "not a real room" cue than
  texture repetition.
  **Desktop impact:** Same collision miss; less visceral than stereo proximity.
  **VR impact:** High. Close stereo inspection makes the miss immediate.
  **Performance impact:** Must not add a full physics world or per-frame allocations. The skeletal
  allocation item already dominates the crowd budget.
  **Recommended solution:** Soft separation capsules for the nearest 2–3 dancers only, plus one
  low-rate proximity response (torso yaw or a half-step), driven from the existing camera position.
  Keep state changes off the per-frame allocation path. Do not raise the tier headcount.
  **Regression considerations:** Teleport and shell collision must still work. Safe Mode and
  crowd LOD/pause behaviour stay. Do not duplicate the social-state scheduler in
  **Replace the looping clone crowd with social micro-behaviours** — that item owns variety;
  this one owns occupancy.
  **Acceptance criteria:** From the dance floor the player cannot occupy a dancer's capsule;
  the nearest dancer changes facing or spacing within one second of approach; balanced-tier
  skeleton count does not increase.
  **Validation:** Desktop collision walk-through plus an in-headset approach. No new per-frame
  `Vector3` allocations in the dancer update.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Low

---

## Review — 2026-09-30 (follow-up) — Frame-time spikes, lighting slots and loading

Scope: the same principal review brief, run a second time on the committed first pass
(`f4a5873`). This pass measured **spikes rather than averages**: 45–60 s cold captures with
long-frame attribution (cue, newly compiled shaders, enabled lights, Babylon internal
timings), forced cue changes, a forced strobe burst, CDP heap snapshots after GC, and a
CDP allocation-sampling profile. Also: per-material light-slot inspection and the compiled
material defines. The integrated browser and laptop are the same as the first pass; nothing
was run on a headset.

Validation actually executed: `npm run check`, `npm run lint`, `npm test` (101/101 across
unit, contract and worker; 3 new tests), `npm run build`, `npm run test:e2e` 4/4. A first
e2e run failed two tests. One timed out at 300 s because my concurrent profiling session
starved the software renderer (it passed once that session was parked). The other was a
genuine conflict: my crowd-LOD change violated a deliberate XR rule (see below), so it was
reverted.

Checked and found sound (do not re-raise without new evidence): no JS heap leak (125.6 to
127.5 MB after forced GC over 60 s, flat after 20 s); no DynamicTexture or per-frame
material freeze in the hot path; image-processing notifications stay at 0.

### Fixed during this follow-up

- [x] **Cue changes recompiled 17–20 shader variants (0.4–1.1 s freezes)**

  **Resolved 2026-09-30.** The six moving-head `SpotLight`s are enabled for life, and
  `updateSpotlights()` gates them by `intensity` only. Measured: seven forced cue changes
  compiled 5 variants in total (before, 20 and 17 for two switches) with no frame over
  150 ms; steady p50/p99 went from 21.4/268 to 17.5/62 ms.

  **Priority:** High
  **Category:** Performance
  **Confidence:** High
  **Area:** Moving-head lights / material light slots
  **Affected files:** `js/club/06-effects.js`, `js/club/08-animation-fixtures.js`
  **Evidence:** MEASURED. Long-frame attribution showed `newEffects: 20` on eclipse to firstLight
  (676 + 1,073 ms) and `17` on the way back (396 ms); `light.setEnabled()` costs ~2 ms each;
  `spot.beamVisible` toggles at flash rate in spot-strobe modes.
  **Problem:** Enabling or disabling a light changes which light types occupy every lit
  material's three slots, so their defines change.
  **User-visible effect:** The show froze at many of its most important moments.
  **Immersion impact:** High; in a headset each freeze is a black or smeared frame.
  **Desktop impact:** Freezes removed.
  **VR impact:** Same, and at 72–120 Hz the budget is far smaller.
  **Performance impact:** Removes compiles and scene walks; dark cues now shade 3 slots
  (as lit cues always did), so the worst case is unchanged.
  **Recommended solution:** Implemented as above; the rule is documented in the instructions.
  **Regression considerations:** Spots dim to zero exactly as before; the e2e spotlight,
  optics and white-foreground tests pass.
  **Acceptance criteria:** No new shader variant after warm-up on cue changes; no
  cue-change frame over 150 ms on the measured machine.
  **Validation:** Runtime capture (recorded in `docs/PERFORMANCE_BASELINE.md`); e2e.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Two shadow maps were rendered every frame and sampled by nothing**

  **Resolved 2026-09-30.** The generators on `spot2`/`spot5` were removed; zero visual change.

  **Priority:** Medium
  **Category:** Performance
  **Confidence:** High
  **Area:** Shadows
  **Affected files:** `js/club/06-effects.js`
  **Evidence:** MEASURED. 0 of 168 lit submeshes had any `SHADOWn` define. Every mesh's
  `lightSources` is `[ambient, spot0 … spot5]` with `maxSimultaneousLights = 3`, so the
  shadow-casting spots never reached a slot; the two receivers (DJ platform) bind ambient,
  spot0 and spot1. Each map had 1024² resolution and 134 casters, including skinned dancers,
  at `REFRESHRATE_RENDER_ONEVERYFRAME` on ultra/high.
  **Problem:** Two full scene passes per frame with no output.
  **User-visible effect:** None (which is itself the realism gap tracked below).
  **Immersion impact:** None.
  **Desktop impact:** Two render-target passes per frame removed on ultra/high.
  **VR impact:** VR already disabled them.
  **Performance impact:** Render-target CPU of ~2.1 ms per frame measured earlier, plus GPU.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** `_applyShadowQuality()` and `_refreshShadowCasters()` are now
  no-ops and are kept for the grounding-shadow item.
  **Acceptance criteria:** No shadow render targets exist.
  **Validation:** Runtime light and shadow-generator inventory.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **VR could be entered during ~12 s of post-load main-thread stalls**

  **Resolved 2026-09-30.** `#vrButton` reads "Preparing VR…" until `modelLoadPromise`
  settles and `scene.whenReadyAsync()` resolves, with a 30 s ceiling; the timer is cleared
  in `dispose()`. Babylon's overlay icon is disabled so the gated button is the only entry.

  **Priority:** High
  **Category:** VR
  **Confidence:** High
  **Area:** Loading / XR entry
  **Affected files:** `js/club/10-ui.js`, `js/club/02-lifecycle.js`, `test/e2e/vrclub.spec.mjs`
  **Evidence:** MEASURED. After `ready`: 2.8 s and 2.0 s first-render frames (26 variants),
  then 250–600 ms gaps for ~12 s while Babylon's own frame time stayed 17–40 ms and meshes
  arrived in +3/+25/+25 steps (DJ console, then the two PA speakers).
  **Problem:** Main-thread GLB parsing and instancing in an interactive scene.
  **User-visible effect:** A headset entered early showed sustained dropped frames.
  **Immersion impact:** High on first impression.
  **Desktop impact:** Unchanged (the desktop start still stutters; see the open item).
  **VR impact:** Entry now waits for the load; a slow network waits at most 30 s.
  **Performance impact:** None.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** The Quest emulation e2e now waits up to 60 s for the button.
  **Acceptance criteria:** The button is disabled while models load and enabled after, or
  after the ceiling.
  **Validation:** Unit test (loaded and stalled paths); Quest emulation e2e.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

### New open items

- [ ] **Only ambient, spot0 and spot1 ever light a surface; grounding shadows do not exist**

  **Rechecked 2026-10-05:** The title and original evidence below are historical, not the full current
  state. `_bindPhotometricSlots()` now selects the strongest heads, and the browser budget probe found
  10 contact-shadow instances for 10 enabled NPCs. No dynamic shadow generator exists, and the
  booth/equipment contact-shadow acceptance criterion is still open. Do not propose increasing the
  light budget or restoring the already-fixed creation-order bug.

  **Partial 2026-10-01.** `_bindPhotometricSlots()` copies the strongest surface-hitting
  heads into the live slots. Contact shadows are still absent and stay out of scope:
  adding a generator would change the frozen light UBO.

  **Priority:** High
  **Category:** Lighting
  **Confidence:** High
  **Area:** Moving heads, material light budget, shadows
  **Affected files:** `js/club/06-effects.js`, `js/club/08-animation-fixtures.js`, `js/club/01-core.js`
  **Evidence:** MEASURED light-slot inventory (see the fixed items above). On desktop,
  spot2–spot5 contribute beams, pools and gobos (meshes) but no surface light; which two spots
  light the room depends only on creation order, not on where they point. The "grounding
  shadows for the booth" described in code never rendered.
  **Problem:** Surface lighting is decoupled from the visible fixtures.
  **User-visible effect:** A beam lands on the floor, yet the floor's real shading follows two
  other, arbitrary fixtures.
  **Immersion impact:** High; light that doesn't match its source is a core realism contradiction.
  **Desktop impact:** Same as VR.
  **VR impact:** Same (Quest adds spot2).
  **Performance impact:** Must stay within the 3/4-slot budget.
  **Recommended solution:** Either (a) give each spot `includedOnlyMeshes` for its zone so
  every fixture lights what it points at within the budget, or (b) make spot2–spot5
  visual-only (no `SpotLight`) and let spot0/1 follow the two most visible beams. Then add one
  shadow generator to a slot-budgeted light, with a booth-only caster list and the platform as
  receiver.
  **Regression considerations:** Keep lights enabled for life (no slot churn); white-foreground tests.
  **Acceptance criteria:** Each visible pool coincides with real surface light; a contact
  shadow appears under the DJ gear on ultra/high; no shader compiles on cue change.
  **Validation:** Per-material slot inventory; A/B captures; frame-time capture.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Each strobe flash costs ~19 ms (the flash light toggles its enabled state)**

  **Resolved 2026-10-01 in code.** `updateStrobes()` no longer calls `setEnabled`. The
  flash light stays disabled so it cannot take slot 0. The visible flash is the emissive
  lamp, the ambient impulse, bloom and the retinal layer. Frame-time was not re-measured.

  **Priority:** Medium
  **Category:** Performance
  **Confidence:** High
  **Area:** Strobes
  **Affected files:** `js/club/09-animation-finish.js`, `js/club/05-fixtures.js`
  **Evidence:** MEASURED. Flash frames averaged 45.3 ms against 26.1 ms for others over 296
  frames, with no new shaders. `strobeFlash` is created before `ambient`, so enabling it
  takes slot 0 of every material.
  **Problem:** A scene-wide light re-slot on every flash.
  **User-visible effect:** Strobe cues stutter exactly on the flashes.
  **Immersion impact:** Medium.
  **Desktop impact:** About 19 ms on each flash frame.
  **VR impact:** Likely a dropped frame per flash.
  **Performance impact:** About 19 ms per flash frame.
  **Recommended solution:** Keep the flash light permanently enabled at intensity 0 and move it
  after the spots in `scene.lights` (remove and re-add), or drop it and rely on the ambient
  impulse the code already fires. Either way is a small visual change needing an A/B.
  **Regression considerations:** Safe Mode restoration; strobe e2e optics assertions.
  **Acceptance criteria:** Flash frames within 2 ms of non-flash frames.
  **Validation:** Forced-burst capture as above.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [ ] **Crowd skeletal interpolation dominates allocation (~15 MB/s)**

  **Priority:** Medium
  **Category:** Crowd
  **Confidence:** High
  **Area:** Dancers / Babylon animation groups
  **Affected files:** `js/club/11-audio-crowd.js`
  **Evidence:** MEASURED with CDP allocation sampling: Babylon `_interpolate`, `_animate` and
  `animate` account for ~146 of ~216 MB allocated per 10 s. Distance and
  heading-based pauses were prototyped and reverted: they violate the 2026-08-23
  rule, encoded in the Quest e2e test (`nearbyAnimationsRunning`), that every enabled dancer
  animates in XR after frustum-based pausing froze dancers per eye.
  **Problem:** GC pressure scales with dancer count and runs regardless of visibility.
  **User-visible effect:** Periodic GC hitches, most likely on Quest.
  **Immersion impact:** Medium.
  **Desktop impact:** Minor on this laptop.
  **VR impact:** Likely GC pauses on Quest (unmeasured).
  **Performance impact:** ~15 MB/s of allocation.
  **Recommended solution:** Bake the dance loops into vertex animation textures
  (`BakedVertexAnimationManager`) with instancing, which removes per-frame skeletal CPU and
  allocation while keeping every dancer animating.
  **Regression considerations:** Per-dancer phase and speed offsets; `alwaysSelectAsActiveMesh`.
  **Acceptance criteria:** Allocation below 3 MB/s with the full tier crowd; no dancer ever freezes.
  **Validation:** CDP allocation sampling; Quest GC trace.
  **Estimated effort:** Large
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [ ] **The desktop start stutters for ~12 s after the club appears**

  **Priority:** Medium
  **Category:** Performance
  **Confidence:** High
  **Area:** Loading
  **Affected files:** `js/club/02-lifecycle.js`, `js/modelLoader.js`
  **Evidence:** MEASURED; see the VR-entry item. The first two frames compile 26 variants (2.8 s + 2.0 s).
  **Problem:** Progressive loading is done synchronously on the main thread in a live scene.
  **User-visible effect:** Jerky first impression while walking or looking around.
  **Immersion impact:** Medium.
  **Desktop impact:** About 12 s of stutter.
  **VR impact:** Mitigated by the entry gate.
  **Performance impact:** Loading only.
  **Recommended solution:** Hold the splash until `scene.whenReadyAsync()` for the base scene
  (move the first compile behind it), pre-compile the GLB materials with
  `forceCompilationAsync` before enabling their meshes, and spread instancing across frames.
  **Regression considerations:** Keep time-to-first-view reasonable; splash progress reporting.
  **Acceptance criteria:** No frame over 100 ms after the splash hides, on the measured machine.
  **Validation:** The cold capture used here.
  **Estimated effort:** Medium
  **Product value:** Medium
  **Technical debt reduction:** Low

---

## Review — 2026-09-30 — Principal experience, rendering and performance review

Scope: every validation command; a runtime session of the production build in desktop
Chromium (Adreno X1-85 laptop iGPU) with per-method CPU instrumentation of
`updateAnimations()`, draw-call/scene counters, ray-pick profiling, collision probes and
viewpoint captures; a code review of the staged 2026-09-23 implementation pass; and focused
passes over the render loop, XR/UI lifecycle, audio/crowd and scene/rendering code. Not
executed: any headset session, two-device voice, a deployed-relay test. Every "measured"
figure below is CPU time on that laptop, not a Quest result.

Validation actually executed:

| Check | Before | After this pass |
|-------|--------|-----------------|
| `npm run check` | Pass | Pass (37 files) |
| `npm run lint` | Pass | Pass |
| `npm test` | 92/92 | 99/99 (7 new regression tests; each new test was run against the old code and failed) |
| `npm run check:sri` | Pass | Pass |
| `npm run build` | Pass | Pass |
| `npm audit` | **1 high** (dev-only `brace-expansion`) | 0 (lockfile-only fix) |
| `npm run test:e2e` | 3/4 (`reflectionBeams` 0 vs 16) | 4/4 (production test re-run alone after its final edit; the other three passed in the preceding full run) |

Checked and found sound (do not re-raise without new evidence): `moveCameraToPreset()`
preserves seated XR eye height (unit-tested); XR state observers are cleared by
`baseExperience.dispose()`; the music graph is genuinely spatial (two HRTF PA panners,
listener tracks the active/XR camera, air absorption, occlusion, convolution reverb, sub
branch, spatialised crowd bed); the analyser is pre-spatial; no DynamicTexture is redrawn per
frame; GLB materials are forced opaque with the device light budget; room scale is plausible
(25 x 21 x 10 m shell, 1.42 m booth work surface, 7.1 m flown PA). `patternStrobe` (15 Hz
full-field) is **not** in the LED playlist, so it is dead code rather than a live
safe-mode bypass (see the cleanup item).

### Fixed during this review

- [x] **Per-frame exposure writes dirtied every material (the app ran below 10 fps)**

  **Resolved 2026-09-30.** `_writeExposure()` updates the configuration's backing
  `_exposure`, which `bind()` re-reads every frame, and uses the notifying setter only when
  the value crosses exactly 1 (the EXPOSURE define). Strobe spike/restore use it too.
  Measured on the same scene: `updateEyeAdaptation()` 109 ms to 0.00 ms per frame; frame rate
  on a non-mirror cue 6–8 fps to 36.6 fps; zero `onUpdateParameters` notifications in 6 s.
  Guarded by a unit test (fails on the old code) and an e2e assertion on the real build.

  **Priority:** Critical
  **Category:** Performance
  **Confidence:** High
  **Area:** Render loop / post-processing
  **Affected files:** `js/club/07-animation-core.js`, `js/club/09-animation-finish.js`
  **Evidence:** MEASURED. `updateEyeAdaptation()` wrote `ip.exposure` every frame. Babylon's
  setter notifies 556 observers; each material runs `_markAllSubMeshesAsDirty`, walking all
  1,115 meshes (0.2 ms per material). Five timed writes: 104, 110, 120, 122, 130 ms.
  Introduced 2026-08-18 (`619a5a8`), and it scales with materials x meshes, so it worsened as
  the venue grew.
  **Problem:** An O(materials x meshes) scan ran every frame, in VR as well.
  **User-visible effect:** Single-digit frame rates on a capable laptop; this is also the real
  cause of the "host at 0.6 fps" e2e slowdown that the 2026-09-23 pass attributed to machine load.
  **Immersion impact:** Judder destroys presence.
  **Desktop impact:** 6–8 fps to 30–37 fps on the measured machine.
  **VR impact:** The same code ran in XR (`vrSettings.vr.exposure`); on a Quest-class CPU this
  alone exceeds any headset frame budget several times over.
  **Performance impact:** About 100 ms per frame removed.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Materials apply image processing by post-process, so they
  never read exposure. The bloom downscale keeps its last notified exposure. VR/desktop
  switches still use the public setter.
  **Acceptance criteria:** No image-processing notification over 20 rendered frames; eye
  adaptation still moves exposure.
  **Validation:** Unit test "per-frame exposure never dirties every material…"; e2e production test.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** High

- [x] **The strobe exposure spike never reached the screen**

  **Resolved 2026-09-30.** `updateEyeAdaptation()` runs after `updateStrobes()` and
  overwrote the spike in the same frame, so the designed (and unit-tested) 2.1/2.6 exposure
  flash never rendered. It now yields on a strobe flash frame. This is a visible change for
  non-Safe-Mode strobes only; Safe Mode still disables strobes entirely.

  **Priority:** Medium
  **Category:** Lighting
  **Confidence:** High
  **Area:** Strobes / eye adaptation
  **Affected files:** `js/club/07-animation-core.js`
  **Evidence:** CONFIRMED by call order in `updateAnimations()`.
  **Problem:** Two per-frame writers to one property.
  **User-visible effect:** Strobe hits lacked the intended blinding exposure lift.
  **Immersion impact:** Low–medium: strobes read weaker than designed.
  **Desktop impact:** Visible on strobe cues.
  **VR impact:** Same, 2.6 exposure spike.
  **Performance impact:** None (cheap write path).
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Photosensitive review of the restored spike before release.
  **Acceptance criteria:** A flash frame renders the spike; the next frame restores adaptation.
  **Validation:** Unit test asserts the spike survives eye adaptation.
  **Estimated effort:** Small
  **Product value:** Low
  **Technical debt reduction:** Low

- [x] **Mirror-ball ray predicate cost ~0.6 ms per pick**

  **Resolved 2026-09-30.** Mesh names are fixed at creation, so the surface match is
  memoised per mesh (WeakMap, re-derived if a name changes); enabled/visible stay live.
  Identical to the old predicate on every scene mesh (checked at runtime). Measured with the
  mirror pinned: pick 0.97 to 0.38 ms, `updateMirrorBall()` 31 to 12 ms per frame,
  16.6 to 23.4 fps. The remaining cost is tracked as an open item below.

  **Priority:** High
  **Category:** Performance
  **Confidence:** High
  **Area:** Mirror ball
  **Affected files:** `js/club/06-effects.js`
  **Evidence:** MEASURED. About 31 picks per frame; Babylon calls the predicate for all
  1,115 meshes per pick; the predicate lowercased the name, scanned up to 25 substrings and
  allocated a 19-element array on every call (about 35k arrays per frame).
  **Problem:** Avoidable string work and GC in the hottest loop of mirror cues.
  **User-visible effect:** Mirror-ball cues dropped the frame rate by half.
  **Immersion impact:** The signature disco-ball moment was the least smooth part of the show.
  **Desktop impact:** Plus 40% fps on mirror cues.
  **VR impact:** VR updates spots every 2nd frame, so the saving applies at a higher rate.
  **Performance impact:** About 19 ms per frame on the measured machine.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Keep the whitelist semantics; avatars and effects must never
  receive spots.
  **Acceptance criteria:** Same hit set; lower pick cost.
  **Validation:** Runtime equivalence check across all meshes; e2e mirror-cue assertions.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **The desktop camera could leave the venue through walls and roof**

  **Resolved 2026-09-30.** The four brick shell walls and the ceiling now collide (simple
  boxes). An e2e check walks out of the entrance, flies into a side wall at 6 m and into the
  roof, and asserts containment.

  **Priority:** High
  **Category:** Desktop
  **Confidence:** High
  **Area:** Desktop locomotion / collision
  **Affected files:** `js/club/03-rendering.js`, `js/club/04-environment.js`
  **Evidence:** MEASURED with the camera's own collider. From arrival, walking +z reached
  z = 41 (the visible front wall is at z = 0); at 6 m the camera passed the left wall to
  x = −50; holding E reached y = 13.8 (roof at 9.8). Only the floor, a 4 m-tall invisible band
  and the DJ platform collided.
  **Problem:** The visible architecture was not the physical boundary.
  **User-visible effect:** Walking or flying through brick into a black void.
  **Immersion impact:** High; this is a classic "floating camera" break.
  **Desktop impact:** Fixed.
  **VR impact:** Smooth locomotion now also stops at the shell; teleport is handled below.
  **Performance impact:** Five extra collision boxes; negligible.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** All four camera presets remain reachable (the closest is 1.35 m
  from a wall).
  **Acceptance criteria:** No path leaves the shell by walking or Q/E flight.
  **Validation:** e2e production test.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **VR teleport arc passed through walls onto the floor outside the venue**

  **Resolved 2026-09-30.** The shell walls and DJ platform are registered as teleport
  blockers (`addBlockerMesh`) on every path that obtains a teleport feature, idempotently.

  **Priority:** High
  **Category:** VR
  **Confidence:** High
  **Area:** WebXR locomotion
  **Affected files:** `js/club/10-ui.js`
  **Evidence:** CONFIRMED by code and Babylon 8.30.5 source: the teleport pick considers only
  `floorMeshes` and `pickBlockerMeshes`; none were set. The single floor slab spans x ±17.5,
  z −32.5..12.5, i.e. 5–12 m beyond the brick shell on every side.
  **Problem:** Pointing at a wall selected the floor behind it.
  **User-visible effect:** Teleporting outside the club, or under the DJ platform.
  **Immersion impact:** High.
  **Desktop impact:** None.
  **VR impact:** Default (comfort-on) locomotion could exit the venue.
  **Performance impact:** None.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Teleport to every floor area inside the room must still work.
  **Acceptance criteria:** No teleport target outside the shell or under the platform.
  **Validation:** Unit test asserts the blocker set; in-headset check still recommended.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **VR jump was a ~1.2 m forced lift that scaled with refresh rate**

  **Resolved 2026-09-30.** `_startVRJump()` / `_stepVRJump()` integrate real gravity with
  the clamped frame time (~0.45 m apex) and land at the eye height measured at take-off.

  **Priority:** High
  **Category:** VR
  **Confidence:** High
  **Area:** WebXR locomotion (comfort off)
  **Affected files:** `js/club/02-lifecycle.js`
  **Evidence:** CONFIRMED by code. `y += 0.12; v -= 0.006` per frame gives a 1.2 m apex with
  effective gravity of 31 m/s² at 72 Hz and 86 m/s² at 120 Hz; landing forced `ground + 1.7`.
  **Problem:** Artificial vertical motion that was unrealistic and refresh-rate dependent, and
  that discarded tracked height.
  **User-visible effect:** A floaty-then-violent lift; seated players re-seated at standing height.
  **Immersion impact:** Medium.
  **Desktop impact:** None.
  **VR impact:** Vection and comfort risk for users who turned comfort off.
  **Performance impact:** None.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Comfort mode still suppresses jump.
  **Acceptance criteria:** The same arc at 72 and 120 Hz; a seated player lands at their own height.
  **Validation:** Unit test at 72/120 Hz with a 1.15 m seated eye height.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **Safe Mode did not stop the dance-floor strip strobing**

  **Resolved 2026-09-30.** The legacy `strobe_attack` floor branch is gated by
  `photosensitiveSafeMode`; Safe Mode falls through to the slow colour cycle.

  **Priority:** High
  **Category:** Accessibility
  **Confidence:** High
  **Area:** Photosensitive Safe Mode
  **Affected files:** `js/club/08-animation-fixtures.js`
  **Evidence:** CONFIRMED by code. `sin(time*20) > 0 ? 1 : 0` produces a ~3.2 Hz full on/off
  white strip. The legacy cycler reaches `strobe_attack` whenever the Show Director is
  switched off (the `toggleShow` control) and not in manual mode.
  **Problem:** A flashing source not covered by the photosensitivity control.
  **User-visible effect:** Flashing in Safe Mode.
  **Immersion impact:** None; this is a safety issue.
  **Desktop impact:** Fixed.
  **VR impact:** Fixed; flashing in the headset periphery is the higher risk.
  **Performance impact:** None.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Without Safe Mode the phase still strobes.
  **Acceptance criteria:** No luminance step greater than 0.5 between 60 Hz samples in Safe Mode.
  **Validation:** Unit test with a non-Safe-Mode control.
  **Estimated effort:** Small
  **Product value:** High
  **Technical debt reduction:** Low

- [x] **VJ and Show Director smoothing depended on frame rate**

  **Resolved 2026-09-30.** `beatEnvelope` decay scales by `dtScale`; `masterIntensity` and
  the Show Director energy EMA compound their retention. Onset detection sorts into a reused
  scratch array.

  **Priority:** Medium
  **Category:** Animation
  **Confidence:** High
  **Area:** `js/vjDirector.js`, `js/showDirector.js`
  **Affected files:** `js/vjDirector.js`, `js/showDirector.js`
  **Evidence:** CONFIRMED by code. `beatEnvelope - 0.06`, `* 0.12` and `* 0.02` were applied
  per frame, and `slice().sort()` ran per audio frame. The contract test only scans
  `js/club/*animation*.js`, so these escaped it.
  **Problem:** Kick punch decayed twice as fast at 120 Hz; movement choice timing varied by device.
  **User-visible effect:** Beat-reactive lighting felt different on every headset refresh rate.
  **Immersion impact:** Medium; audiovisual sync is the club's core.
  **Desktop impact:** 144 Hz monitors saw about 2.4x faster decay.
  **VR impact:** 72/90/120 Hz produced three different shows.
  **Performance impact:** One allocation plus sort per frame removed.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** At 60 Hz the behaviour is unchanged.
  **Acceptance criteria:** Identical envelope and intensity after 0.1 s at 60 and 120 Hz.
  **Validation:** Unit test (fails on the old code).
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Medium

- [x] **Pressing Play could never resume a suspended AudioContext**

  **Resolved 2026-09-30.** `_connectAudioSourceOnce()` calls `_ensureAudioContext()`
  (which resumes) before returning early for an existing media source.

  **Priority:** Medium
  **Category:** Audio
  **Confidence:** High
  **Area:** Audio lifecycle
  **Affected files:** `js/club/11-audio-crowd.js`
  **Evidence:** CONFIRMED by code: the early `return` preceded `_ensureAudioContext()`, the
  only resume path.
  **Problem:** After a browser suspension (interruption, backgrounding) the graph stayed
  silent while the error toast said "Press Play again".
  **User-visible effect:** A silent club until reload.
  **Immersion impact:** High when it occurs.
  **Desktop impact:** Fixed.
  **VR impact:** Fixed.
  **Performance impact:** None.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** `createMediaElementSource` is still called once.
  **Acceptance criteria:** A Play request resumes a suspended context.
  **Validation:** Extended the Web Audio graph unit test.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **Multiplayer: mic left live after an error close; double-click leaked a capture; ghost avatars**

  **Resolved 2026-09-30** (relay half needs a redeploy).
  - `_onSocketClosed()` calls `disableVoice()` on the room-full, flooding and
    retries-exhausted closes.
  - `enableVoice()` shares one in-flight permission request and stops a stream granted after
    mute, disconnect or dispose; the UI reflects the client's real mic state.
  - Clients ignore `state` for ids never announced by welcome/join.
  - The relay ignores frames from sessions it has already closed.

  **Priority:** Medium
  **Category:** Privacy
  **Confidence:** High
  **Area:** Multiplayer voice and presence
  **Affected files:** `js/networkClient.js`, `js/ui-init.js`, `worker/src/index.js`
  **Evidence:** CONFIRMED by code review of the staged diff; each case is reproduced by a new
  unit or worker test that fails on the old code.
  **Problem:** A capture the UI showed as off and could not stop; frozen avatars that no
  leave/reconnect removed.
  **User-visible effect:** The headset mic indicator stayed on; phantom guests.
  **Immersion impact:** Medium (phantom guests).
  **Desktop impact:** Same as VR.
  **VR impact:** Same as desktop.
  **Performance impact:** Unbounded ghost avatars removed.
  **Recommended solution:** Implemented as above.
  **Regression considerations:** Auto-reconnect keeps the mic; perfect negotiation unchanged.
  **Acceptance criteria:** No live track after a terminal close; one capture per request;
  no avatar for unannounced ids.
  **Validation:** `test/unit.test.mjs`, `test/worker.test.mjs`.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **Dev-only `brace-expansion` advisory (GHSA-q2hr-2g5m-vwhr and two related)**

  **Resolved 2026-09-30** with `npm audit fix`; lockfile-only, and production dependencies
  were already clean.
  **Priority:** Low · **Category:** Dependency · **Confidence:** High ·
  **Validation:** `npm audit` reports 0.

### New open items

- [x] **Decide and document the shipped "clear-air test": haze is off in production**

  **Resolved 2026-10-01.** The switch defaults off. Haze uses STANDARD blending at the
  existing emit rate and alphas; EXP2 fog stays enabled so beams always have a medium.
  Each puff fades in and out through colour gradients (peak alpha is still
  `vrSettings.hazeAlpha`) and grows as it disperses; haze and dust are pre-warmed so the
  room is already hazy at load, the ambient hazer is never stopped by a smoke cue (only
  the fog machines are), and fog density eases on a smoke toggle instead of snapping.
  The flag remains for the clear-air unit test. Smoke is also lit by the beams it sits in
  (desktop only, `_lightAirParticles()`); real volumetric shadowing of the haze by dancers
  is still absent.

  **Priority:** High
  **Category:** Lighting
  **Confidence:** High
  **Area:** Atmosphere / haze / fog machines
  **Affected files:** `js/club/01-core.js`, `js/club/07-animation-core.js`
  **Evidence:** CONFIRMED. `this.atmosphereTestDisabled = true` (added in `770d132`,
  2026-09-15) makes `updateFogMachines()` force `scene.fogEnabled = false` and stop the haze,
  dust-mote and fog-machine particles for everyone. It is undocumented in the README,
  CHANGELOG, backlog and agent instructions. Runtime captures show mirror shafts and laser
  lines as hard lines in clear air; re-enabling the flag at runtime restarted the haze emitter.
  **Problem:** Every beam fixture was designed for haze (the instructions' own "haze turns to
  soup" rule), yet the medium is switched off, so beams are visible without anything to
  scatter them.
  **User-visible effect:** Light shafts look drawn rather than lit; the room reads as a void.
  **Immersion impact:** High; this is the prompt's canonical realism contradiction.
  **Desktop impact:** Same as VR.
  **VR impact:** Same as desktop; haze also affects stereo depth cues.
  **Performance impact:** Re-enabling adds particle overdraw that must be budgeted per tier.
  **Recommended solution:** The owner decides. Either remove the switch and restore
  tier-budgeted haze with the white-foreground guards (e2e "mirror-only cues…"), or make
  clear-air an explicit documented look and stop rendering beams where there is no medium.
  **Regression considerations:** The 2026-09 "white foreground" fixes; keep the Safe Mode and
  clear-air unit test semantics if the switch stays.
  **Acceptance criteria:** The shipped atmosphere is a documented decision; beams are
  never drawn with zero scattering medium.
  **Validation:** A/B captures at four presets; a Quest balanced-tier frame-time capture with haze on.
  **Estimated effort:** Small (decision) / Medium (haze budget)
  **Product value:** High
  **Technical debt reduction:** Medium

- [ ] **Audio bands do not match their documented ranges and cannot isolate the kick**

  **Priority:** High
  **Category:** Audio
  **Confidence:** High
  **Area:** `getAudioData()`, VJ onset detection, Show Director energy
  **Affected files:** `js/club/11-audio-crowd.js`, `js/vjDirector.js`, `js/showDirector.js`
  **Evidence:** CONFIRMED. `fftSize = 256` gives 128 bins of 187.5 Hz at 48 kHz;
  `bassEnd = floor(128 × 0.1) = 12`, so "bass" is about 0–2.25 kHz and "mid" 2.25–12 kHz.
  The instructions claimed 0–85 / 85–255 Hz (corrected this pass). The analyser's
  `smoothingTimeConstant` applies per `getByteFrequencyData()` call, i.e. per render frame,
  so flux dynamics also vary with refresh rate.
  **Problem:** Onset detection and "bass" reactivity respond to vocals, snare and synth leads.
  **User-visible effect:** Onset tracking and energy-driven lighting can respond to vocals and snare body rather than isolating kicks. Mirror-ball look selection is now director-owned, so the earlier claim that it directly follows vocals is stale.
  **Immersion impact:** High; audiovisual coherence is the club's core promise.
  **Desktop impact:** Same as VR.
  **VR impact:** Same as desktop.
  **Performance impact:** Negligible (larger FFT reads).
  **Recommended solution:** `fftSize` 2048; derive band edges from `sampleRate` (kick
  40–120 Hz, low-mid 120–500 Hz, presence 2–6 kHz, air above); sample the analyser at a fixed
  rate independent of the render rate; then recalibrate the Show Director energy bands and
  onset threshold against a reference track set.
  **Regression considerations:** "ShowDirector … calibrated energy band" test; CORS-silence detection.
  **Acceptance criteria:** On a reference 128 BPM four-on-the-floor track, at least 95% of
  detected onsets fall within 30 ms of kicks, with none on vocal-only passages; identical
  results at 72/90/120 Hz.
  **Validation:** Offline analyser harness with recorded spectra, plus an in-headset listen test.

  **Progress (kick isolation done, re-banding not):** The kick is now isolated without touching the main analyser: a
  second tap (low-pass 120 Hz into a 512-sample time-domain analyser, `_readKickBand()`) feeds `VJDirector._detectKick()`,
  which requires a sudden rise over 60 ms (frame-rate independent) that is also at least 45% of the accepted kicks'
  raw rise, so the bassline cannot pass even after a long breakdown. Measured with a synthetic 124 BPM track (16 bars
  groove, 8 bars kick-less breakdown with an eighth-note bassline, hats, pad and a vocal-like line, 16 bars drop),
  ticking `updateAnimations()` at 60 Hz in the browser: recall 0.99, precision 0.98, no onset in the breakdown,
  124.9 BPM, median lag 14 ms; the breakdown set-piece and release now fire. Before: 323 onsets for 128 kicks, 144 BPM,
  no breakdown detected. The kick band's energy reads ~0.6 in the groove, 0.17-0.29 in the breakdown and 1.0 settling
  to ~0.8 in the drop. Still open: the bass/mid/treble bands (LED patterns, movement thresholds) are unchanged; the
  detector is unverified at 72/90/120 Hz in a headset and on real recorded tracks (the unit test covers the logic, not
  the analyser); a breakdown longer than ~60 s relaxes the kick reference enough that a loud bassline could pass;
  whether `audioElement.volume` scales the analyser tap (and so a sudden volume drop could stall detection until the
  reference relaxes) has not been checked.

- [ ] **The performing DJ is unmeasured on a headset**

  **Priority:** Low
  **Category:** Performance / Avatars
  **Area:** `js/djPerformer.js`, `VRClub._spawnPerformingDJ()` / `_updateDJ()`
  **Evidence:** The DJ is now an `AvatarRig` posed every frame (instead of one baked idle clip). Desktop SwiftShader:
  0.05-0.3 ms a frame; `test/rig.test.mjs` fails above 2 ms. Hands reach every knob in the rig test, and the six
  activities were checked visually on desktop for both DJs.
  **Acceptance criteria:** A Quest 3S capture with the DJ in view shows the rig under 0.5 ms a frame; the hands are
  seen on the controller from the dance floor and the booth in the headset.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [ ] **Re-profile the optimized mirror-ball reflection path against its CPU target**

  **Rechecked 2026-10-06:** The old scene-wide raycasts have been replaced by
  `_intersectRoomInterior`, with thin-instance matrix updates. The 12 ms figure below
  is historical and must not be attributed to the current implementation. Keep the
  existing <=2 ms measured-laptop criterion open until re-profiled, and check the
  shell-only optical approximation around the balcony, booth and doorway. Do not
  reimplement the already-shipped analytic intersection as new work.

  **Priority:** High
  **Category:** Performance
  **Confidence:** High
  **Area:** Mirror ball
  **Affected files:** `js/club/07-animation-core.js`, `js/club/06-effects.js`
  **Evidence:** MEASURED after the predicate fix: about 31 `scene.pickWithRay()` per frame at
  0.38 ms each, because Babylon still walks all 1,115 meshes per pick. A candidate-list
  `mesh.intersects()` prototype disagreed with Babylon on 245 of 400 rays, so it was not shipped.
  **Problem:** The most expensive remaining per-frame CPU system; VR updates every 2nd frame.
  **User-visible effect:** Mirror cues run about 35% slower than other cues.
  **Immersion impact:** Medium.
  **Desktop impact:** About 12 ms per frame.
  **VR impact:** Likely a missed frame on Quest during mirror cues (unmeasured).
  **Performance impact:** Up to about 12 ms per frame recoverable.
  **Recommended solution:** Intersect the axis-aligned shell (floor, walls, ceiling) analytically
  (ray vs. box, O(1)) and pick only the small set of non-planar receivers (truss, pillars,
  platform) from a cached list using Babylon's own `Ray.intersectsMesh`; or bake a reflection
  lookup per facet and update positions without per-frame picks.
  **Regression considerations:** Spots must never float in mid-air or land on people/effects;
  e2e mirror assertions.
  **Acceptance criteria:** Mirror cue at most 2 ms of mirror CPU per frame on the measured
  laptop; the same hit surfaces.
  **Validation:** The instrumentation recorded in `docs/PERFORMANCE_BASELINE.md`, then Quest.
  **Estimated effort:** Medium
  **Product value:** High
  **Technical debt reduction:** Medium

- [x] **Live streams that stall or error fail silently**

  **Resolved 2026-09-30 (follow-up).** `_watchAudioStream()` reconnects a previously-playing
  network stream after a media `error`, or when an un-paused stream's clock stops for 8 s,
  with 2/5/10 s backoff and a toast per attempt. It never retries a URL that never played,
  a user pause, or a local file (a decode error is explained instead). The watchdog, the
  pending retry and the listeners are released in `dispose()` before the `src` is cleared.
  Covered by a unit test with a fake media element and timers.

  **Priority:** Medium
  **Category:** Audio
  **Confidence:** High
  **Area:** Audio stream lifecycle
  **Affected files:** `js/club/10-ui.js`
  **Evidence:** CONFIRMED by code: no `error`, `stalled`, `waiting` or `ended` listener on the
  `<audio>` element; only a rejected `play()` is handled.
  **Problem:** Internet radio drops mid-session with no feedback and no retry.
  **User-visible effect:** The music stops and the show falls back to synthetic beats unexplained.
  **Immersion impact:** High when it occurs.
  **Desktop impact:** Same as VR.
  **VR impact:** Same as desktop; worse in the headset, where the DOM panel is unreachable.
  **Performance impact:** None.
  **Recommended solution:** Listen for `error`/`stalled`; show a toast and in-world indicator;
  retry with bounded backoff for live streams; clean up the listeners in `dispose()`.
  **Regression considerations:** The CORS-silence warning; blob files.
  **Acceptance criteria:** A killed stream is reported within 5 s and retried up to 3 times.
  **Validation:** Unit test with a fake media element; manual network-drop test.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [ ] **Alpha-blended beam and flare materials write depth**

  **Priority:** Medium
  **Category:** Rendering
  **Confidence:** Medium
  **Area:** Lasers, mirror flares/spots, beam cones
  **Affected files:** `js/club/05-fixtures.js`, `js/club/06-effects.js`
  **Evidence:** MEASURED at runtime: `laser*_beam*` (alpha 0.6), `mirrorFlare*` (0.4),
  `mirrorSpot*` (0.9) and `mirrorSpotBeam*` (0.07) all have `disableDepthWrite = false` in
  rendering group 2; 131 alpha-blended meshes were active in one frame.
  **Problem:** A transparent surface that writes depth hides transparent surfaces sorted after it.
  **User-visible effect:** Beams that vanish or pop where they cross; ordering can differ between eyes.
  **Immersion impact:** Medium (visual QA required to quantify).
  **Desktop impact:** Same class of artifact as VR.
  **VR impact:** Most visible in stereo.
  **Performance impact:** None, or a small gain.
  **Recommended solution:** Additive, depth-test-only (`disableDepthWrite = true`) for emissive
  light volumes; keep depth write only for solid spots if sorting requires it.
  **Regression considerations:** The e2e "later lighting groups respect opaque depth…" test.
  **Acceptance criteria:** No beam occludes another in crossing-beam captures from three presets.
  **Validation:** Before/after captures; in-headset crossing-beam check.
  **Estimated effort:** Small
  **Product value:** Medium
  **Technical debt reduction:** Low

- [x] **Remove the 19 unreachable LED patterns (including a 15 Hz full-field strobe)**

  **Resolved 2026-09-30 (follow-up).** All 19 deleted (`js/ledPatterns.js` 52.9 to 36.9 KB).
  The remaining 18 methods are exactly the playlist; both shared helpers are still used; the
  "every LED wall pattern runs" test and the ShowDirector index references pass. The
  instructions and README no longer say 37.

  **Priority:** Low
  **Category:** Cleanup
  **Confidence:** High
  **Area:** LED wall
  **Affected files:** `js/ledPatterns.js`, `test/unit.test.mjs`, `docs/LED_WALL.md`
  **Evidence:** CONFIRMED. The playlist in `updateLEDWall()` references 18 of 37 `pattern*`
  methods; the rest are unreachable. `patternStrobe` flashes the whole wall at 15 Hz with no
  Safe Mode check and allocates a `Color3` per panel per frame.
  **Problem:** About half of a 53 KB module is dead code, and one piece is unsafe if re-added.
  **User-visible effect:** None today.
  **Immersion impact:** None.
  **Desktop impact:** Smaller bundle.
  **VR impact:** Smaller bundle.
  **Performance impact:** Smaller parse cost.
  **Recommended solution:** Delete the unreferenced patterns (or move them to an opt-in module
  gated by Safe Mode); update the test that runs every pattern and the "37 implementations" docs.
  **Regression considerations:** Show Director cues reference patterns by index (for example 16 = aurora).
  **Acceptance criteria:** Every `pattern*` method is reachable; no pattern flashes above 3 Hz full-field.
  **Validation:** Unit test.
  **Estimated effort:** Small
  **Product value:** Low
  **Technical debt reduction:** Medium

- [x] **`dispose()` leaves the XR default experience's input observers attached**

  **Resolved 2026-09-30 (follow-up).** `dispose()` removes `_xrButtonBindingObserver` and
  disposes the whole default experience (input, pointer selection, teleportation), falling
  back to `baseExperience.dispose()`. The Quest emulation e2e test passes.

  **Priority:** Low
  **Category:** Reliability
  **Confidence:** Medium
  **Area:** Teardown
  **Affected files:** `js/club/02-lifecycle.js`
  **Evidence:** CONFIRMED by code: `dispose()` calls `vrHelper.baseExperience.dispose()`, not
  `vrHelper.dispose()`; `_xrButtonBindingObserver` on `vrHelper.input` is never removed.
  **Problem:** Closures over a disposed club survive on embed/hot-reload teardown.
  **User-visible effect:** None in the normal page lifecycle.
  **Immersion impact:** None.
  **Desktop impact:** None.
  **VR impact:** Only affects re-initialisation.
  **Performance impact:** Minor retained memory.
  **Recommended solution:** Remove `_xrButtonBindingObserver` and dispose the whole default experience.
  **Regression considerations:** The e2e XR exit/restore test.
  **Acceptance criteria:** No XR observer references the disposed club.
  **Validation:** Extend the dispose unit test.
  **Estimated effort:** Small
  **Product value:** Low
  **Technical debt reduction:** Low

### Updated existing items

- **Establish a representative Quest 3S frame-time and stability baseline** (2026-09-15):
  still open. New evidence: a single per-frame call cost about 100 ms on a laptop CPU for six
  weeks without any gate noticing. Add CPU-per-system instrumentation (as in
  `docs/PERFORMANCE_BASELINE.md`) to the Quest route, and a structural e2e guard per hot path
  (the exposure-notification guard added in this pass is the pattern).
- **2026-09-23 "E2E on the final build blocked by the host"**: root-caused. The 0.6 fps was the
  exposure cascade above, and the `reflectionBeams` failure came from a 2 s wall-clock wait while
  the show advanced to a haze-free cue. The test now pins the cue and waits on rendered frames.
- Asset licensing, GLB/texture optimisation, ORM packing, the relay deploy, the Pages source
  setting and the six 2026-09-15/18 presence items were not re-verified and remain open.

---

## Review — 2026-09-23 — Evidence-driven quality review (V2 protocol)

Scope: repository discovery; every existing validation command; GitHub Actions history; the
live GitHub Pages deployment; a line-by-line review of the multiplayer stack
(`worker/src/index.js`, `js/networkClient.js`, `js/avatarManager.js`, the multiplayer and
shared-music paths in `js/ui-init.js`); the VR session lifecycle in `js/club/02-lifecycle.js`;
and bounded read-only passes over build/serve/service-worker/asset-cache and UI/audio/lifecycle
code. Two Playwright probes were run against the production build to diagnose the e2e failures.
Not executed: a real Quest 3S session, two-device voice or presence tests, and a deployed-relay
load test.

Validation actually executed:

| Check | Result |
|-------|--------|
| `npm run check` | Pass (36 files) |
| `npm run lint` | **Fail**: 9 `no-undef` errors (`BABYLON` in `test/e2e/vrclub.spec.mjs`), 1 warning |
| `npm test` | **Fail on Windows checkout**: 65/66; vendor hash mismatch caused by CRLF conversion |
| `npm run build` | Pass |
| `npm run check:sri` | **Fail on Windows checkout**: same CRLF cause; upstream `.env` matches |
| `npm audit` | **Fail**: 3 high (dev-only `sharp` <0.35.4 via `@gltf-transform/cli`); 0 in production deps |
| `npm run test:e2e` | **Fail**: 2/4 (Quest WebXR locomotion; floor-spotlight assertion) |
| GitHub Actions CI | **Red on every sampled run from #14 (2026-08-23) to #23**; `Lint` fails in all four `verify` jobs, so tests, build and e2e never run |

Checked and found sound (do not re-raise without new evidence): `scripts/serve.mjs` path
containment/symlink/method handling; service-worker versioned caches, old-cache eviction,
non-200/opaque exclusion and IDB-owned exclusions; `assetCache.js` IDB error/abort/quota/TTL
handling and body-deadline wrappers; DOM output uses `textContent`/canvas text (no HTML
injection from names, emoji, URLs or toasts); `_isSafeAudioUrl()` applied on every
`startAudioStream()` entry, including host-shared music; `createMediaElementSource` single-shot
guard; splash safe-mode offered before rendering.

- [x] **Restore VR locomotion, sprint/jump and the Y/B quick-menu binding**

  **Resolved 2026-09-23.** `setVRComfortMode()` owns an explicit feature swap via
  `_applyXRLocomotionMode()`. Comfort on disables MOVEMENT and (re)enables teleportation;
  comfort off, in-session only, disables teleportation and enables MOVEMENT. The controller
  button bindings moved out of the locomotion `try` into `_setupXRSession()` and
  `_bindXRMotionController()`. Locomotion failures are logged as errors and recorded as `xr`
  diagnostics.

  **Verified by:**
  - The Quest emulation e2e now passes. It asserts no `xr` diagnostics, presses Y through
    IWER, and toggles comfort both ways in-session.
  - The unit test models Babylon's conflict rule, where enabling a conflicting feature throws.

  An in-headset Quest 3S smoke test is still recommended.

  **Priority:** Critical  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** WebXR session lifecycle  
  **Affected files:** `js/club/02-lifecycle.js`, `js/club/10-ui.js`, `test/e2e/vrclub.spec.mjs`  
  **Evidence:** CONFIRMED. `c1eed78` (2026-09-15) changed `disableTeleportation: true` to `false`.
  On `IN_XR` the MOVEMENT feature is then enabled and Babylon throws
  `Feature xr-controller-movement cannot be enabled while xr-controller-teleportation is enabled`
  (captured under IWER Quest 3 emulation against the production build). The exception is
  caught and downgraded to `log.warn`. `this.movementFeature` stays `null` while the session
  reports `IN_XR`, and the e2e test fails with `Cannot read properties of undefined (reading 'movementEnabled')`.  
  **Problem:** Everything after `enableFeature()` inside that `try` never runs:
  - gravity and collision setup on the XR camera;
  - sprint bindings;
  - jump bindings;
  - the only `toggleVRQuickMenu()` controller binding (Y/B/menu).

  `setVRComfortMode(false)` cannot recover, because it only mutates an existing `movementFeature`.  
  **Impact:** On the primary target device, comfort-off users cannot move smoothly or turn, and
  no user can open the VR quick menu with a controller. This includes access to safe mode,
  comfort, haptics and travel. It shipped because CI never reached the e2e job.  
  **Recommended solution:**
  - Treat teleportation and MOVEMENT as mutually exclusive feature states that `setVRComfortMode()` owns:
    - on switch, `featuresManager.disableFeature()` the inactive feature and enable the other;
    - keep one retained handle per feature.
  - Move controller registration and the sprint, jump and menu bindings out of the
    movement-feature `try` block, so that button bindings never depend on locomotion
    succeeding.
  - Escalate a failed locomotion enable to a visible diagnostic, not only a warning.

  **Regression considerations:** comfort-on teleport and snap-turn, tracked eye-height
  preservation, `moveCameraToPreset()` XR routing, one-shot observer cleanup on `NOT_IN_XR`,
  and re-entry in a second session.  
  **Acceptance criteria:**
  - The Quest emulation e2e test passes.
  - No `Could not enable VR movement feature` warning appears in either comfort mode.
  - Y/B opens the quick menu in both modes.
  - Toggling comfort in-session switches between smooth movement and teleport without
    re-entering XR.
  - All of the above hold for a second XR session as well.

  **Validation:** extend the emulation e2e to toggle comfort in-session and to press Y through
  the IWER controller; run an in-headset smoke test on Quest 3S.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** Medium

- [x] **Restore a green CI gate (lint, audit, e2e)**

  **Resolution 2026-10-04:** the vulnerable chain was the unused `@gltf-transform/cli` dev dependency; it was replaced by the three `@gltf-transform` libraries the scripts import. `npm audit` (full and production-only) reports 0 vulnerabilities, `eslint` is clean, `npm test` passes 166/166 and the full Chromium/IWER suite passes (15 tests; three specs were rerun after fixing calibration that the master-dimming and sheet-phase fixes legitimately changed).

  **Reopened 2026-10-04:** local syntax, lint and all 152 Node tests pass, but live
  `npm audit --json` exits 1 with three high dependency nodes (`braces`, `micromatch`,
  `@gltf-transform/cli`) from one dev-tool dependency chain, GHSA-vfj7-8cjw-p6xm.
  The current CI audit gate uses `npm audit --audit-level=high`, and deploy depends on it.
  This is a deployment/tooling blocker, not evidence of a shipped-browser exploit.
  npm's offered downgrade to CLI 2.0.5 is not a validated compatible remedy.
  **User-visible effect:** a compliant new production deployment cannot pass the current gate.
  **Immersion impact:** Indirect; fixes cannot be shipped through the intended path.
  **Desktop impact:** Deployment, not runtime.
  **VR impact:** Deployment, not runtime.
  **Performance impact:** None.
  **Current recommended solution:** resolve the advisory through a verified compatible
  upstream fix/replacement, or document a narrowly justified reviewed exception under the
  repository's security process. Do not force a major downgrade or weaken the audit
  threshold without approval.
  **Current acceptance criteria:** the unchanged high-severity gate exits zero and the
  model-optimization contracts and clean-install build still pass; confirm the actual CI run.
  **Current validation:** live npm advisory report and inspected CI dependency graph.

  **Historical resolution 2026-09-23 (locally verified; confirm on the first push):**
  - **Lint:** `BABYLON` added to the e2e ESLint globals; the dead `pick` removed.
  - **Audit:** the `sharp` override raised to 0.35.4, and the `js-yaml` advisory fixed with
    `npm audit fix`.
  - **Stale e2e expectations:** the floor-spotlight check now pins a lit look. The
    brightness, room-bounce and ambient-floor checks compare against the live `vrSettings`
    instead of copied literals, which went stale when `510af70` retuned lighting.
  - **Results:** `npm run lint` shows 0 problems, `npm audit` 0 vulnerabilities, `npm test`
    92/92, and `npm run test:e2e` 4/4.

  **Priority:** High  
  **Category:** Deployment  
  **Confidence:** High  
  **Area:** CI/CD  
  **Affected files:** `eslint.config.mjs`, `package.json`, `package-lock.json`, `js/club/11-audio-crowd.js`, `test/e2e/vrclub.spec.mjs`  
  **Evidence:** CONFIRMED.
  - The GitHub Actions API shows every sampled CI run from #14 (2026-08-23) to #23 failing.
  - In run #23, `Lint` fails in all four `verify` jobs and `audit` fails.
  - `test/e2e/vrclub.spec.mjs` uses `BABYLON` inside `page.evaluate`, but the e2e ESLint block
    only adds `browserGlobals`.
  - `package.json` pins `overrides.sharp` to `0.35.3`, and GHSA-rgj7-g3m4-5g8c affects <0.35.4.
  - The e2e floor-spotlight assertion reads live show state at load. The NOCTURNE opener
    `eclipse` sets `lightsActive: false`, so all six spotlights are legitimately disabled
    (probe: `spotEnabled: 0`, `driving: true`).
  - An unused `pick` sits at `11-audio-crowd.js:746`.

  **Problem:** Because lint fails first, `npm test`, the production build, the payload budget
  and the e2e suite have not gated any change for a month.  
  **Impact:** Regressions ship unobserved; the Critical VR locomotion defect above is one
  example.  
  **Recommended solution:**
  - Add `BABYLON` to the e2e globals.
  - Raise the `sharp` override to `^0.35.4` and regenerate the lockfile.
  - Remove the unused variable.
  - Make the floor-spotlight test apply a look with `lightsActive: true` (as the mirror test
    already does via `_applyCue`) before asserting light sources.

  **Regression considerations:** do not weaken `no-undef`, the audit level or the lighting
  budget assertion itself.  
  **Acceptance criteria:**
  - `npm run lint` reports 0 errors and 0 warnings.
  - `npm audit --audit-level=high` exits 0.
  - All four e2e tests pass.
  - A push to `main` produces a fully green CI run on every matrix entry.

  **Validation:** local lint, audit and `npm run test:e2e`, plus the CI run.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** High

- [x] **Pin LF line endings for integrity-checked vendor files**

  **Resolved 2026-09-23.** `.gitattributes` sets `* text=auto eol=lf`, and `js/vendor/** -text`
  plus binary rules. After re-checkout the vendored files are `w/lf`, and `npm test` and
  `npm run check:sri` pass on a `core.autocrlf=true` Windows checkout.

  **Priority:** High  
  **Category:** Developer Experience  
  **Confidence:** High  
  **Area:** Repository configuration / supply-chain integrity  
  **Affected files:** `.gitattributes` (new), `js/vendor/*.js`  
  **Evidence:** CONFIRMED.
  - There is no `.gitattributes`, and `git ls-files --eol` reports `i/lf w/crlf` for all three
    vendored scripts when `core.autocrlf=true`.
  - The CRLF bytes hash to `y7kfj8…`; LF-normalising them reproduces the manifest hash `Kxab4B…` exactly.
  - `npm test` and `npm run check:sri` fail on such a checkout; the Linux `sri` CI job passes.

  **Problem:** Git's line-ending conversion rewrites byte-pinned files on Windows checkouts,
  including GitHub's `windows-latest` runners (LIKELY; masked today because lint fails first).  
  **Impact:** Windows developers and the Windows CI matrix fail the integrity contract. This
  trains people to ignore a real tamper signal, and a Windows-built `dist/` ships bytes that no
  longer match the recorded hashes.  
  **Recommended solution:**
  - Add `.gitattributes` with `js/vendor/** -text` (or `binary`) and `* text=auto eol=lf` for
    sources.
  - Renormalise the working tree once.

  **Regression considerations:** the vendored bytes and manifest hashes must stay unchanged.  
  **Acceptance criteria:**
  - A fresh clone with `core.autocrlf=true` passes `npm test` and `npm run check:sri`.
  - The `windows-latest` CI jobs pass the Test step.

  **Validation:** fresh Windows clone; CI matrix.  
  **Estimated effort:** Small  
  **Business value:** Medium  
  **Technical debt reduction:** Medium

- [x] **Remote guests float about 1.7 m above the floor**

  **Resolved 2026-09-23.** The wire protocol is unchanged, so older clients still
  interoperate. `AvatarManager` treats `state.y` as the sender's eye height and places the
  root `EYE_HEIGHT` (1.7 m) below it, with the voice panner at eye level. The first sample
  snaps into place instead of sliding in from the origin, and non-finite values are
  rejected. A unit test covers a standing guest (feet at y = 0) and the booth riser (feet
  at 0.95 m).

  **Priority:** High  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** Multiplayer presence  
  **Affected files:** `js/club/07-animation-core.js`, `js/avatarManager.js`, `worker/src/index.js`  
  **Evidence:** CONFIRMED by code.
  - `updateNetworkPresence()` sends `cam.position.y`. The desktop `FreeCamera` spawns at
    `y = 1.7` (`02-lifecycle.js:113`), and the XR camera is also at eye height.
  - `AvatarManager.updatePeerState()` assigns that value to the avatar root, then offsets the
    body `+0.9`, the head `+1.75`, the nameplate `+2.05` and the voice panner `+1.6`.

  **Problem:** A standing guest's avatar head renders at about 3.45 m, and their voice
  originates about 3.3 m up. The 2026-09-18 comparison injected a peer directly and did not
  exercise the network path.  
  **Impact:** Every remote guest in every session is visibly and audibly misplaced, which is
  the primary thing multiplayer users see.  
  **Recommended solution:**
  - Transmit floor-relative position plus a separate head height, or subtract the sender's
    eye height before sending.
  - Place the avatar root at floor level and derive head, label and panner offsets from the
    transmitted head height.
  - Snap, rather than lerp, on a peer's first sample so avatars do not slide in from the
    origin.

  **Regression considerations:** the booth platform (`y = 0.95`), seated XR height and the
  interpolation smoothing.  
  **Acceptance criteria:**
  - Two connected clients see each other's head within ±0.1 m of the sender's camera height.
  - Feet sit on the local floor or platform.
  - Voice originates at the head.
  - A unit test covers the send→receive transform.

  **Validation:** unit test with a fake `NetworkClient`; two-browser manual check on desktop and Quest.  
  **Estimated effort:** Small  
  **Business value:** High  
  **Technical debt reduction:** Low

- [ ] **Add abuse controls to the public multiplayer relay**

  **Status 2026-09-23: implemented and unit-tested; blocked on deployment.**
  - **Worker changes:**
    - `Origin` allow-list: `ALLOWED_ORIGINS`, with loopback and private-LAN origins always
      allowed.
    - 16-guest room cap, closed with code 4003.
    - 16 KB frame limit.
    - Per-type token buckets; persistent flooders are closed with code 4008.
    - Emoji allow-list, sanitised names (control characters removed, code-point-safe
      truncation), finite/bounded/normalised state, and an http(s)-only music URL.
  - **Client changes:** close codes are surfaced without a reconnect storm, and emoji are
    allow-listed and rate-limited per guest.
  - **Tests:** `test/worker.test.mjs`, 11 tests.
  - **Remaining:** the owner must run `cd worker && npm ci && npm run deploy` (Cloudflare
    credentials required), then check a live two-guest session. The hosted relay runs the
    old code until then.

  **Priority:** High  
  **Category:** Security  
  **Confidence:** High  
  **Area:** Cloudflare Worker relay  
  **Affected files:** `worker/src/index.js`, `js/networkClient.js`, `js/avatarManager.js`  
  **Evidence:** CONFIRMED by code.
  - Both the README and `defaultNetworkServerUrl()` point every visitor at
    `wss://vrclub-network.garfieldapp.workers.dev`, with the default room `lobby`.
  - The Worker performs no `Origin` check and caps neither sessions per room nor messages per
    second nor frame size.
  - It rebroadcasts every `state` frame to all peers unthrottled.
  - It forwards `rtc-signal.signal` objects of arbitrary size.
  - Every `emoji` frame makes each receiving client allocate a new mesh, `StandardMaterial` and
    `DynamicTexture` (`AvatarManager.showEmoji()`).
  - `name.slice(0, 32)` and `emoji.slice(0, 8)` operate on UTF-16 units and can split surrogate
    pairs.

  **Problem:** Any web page or script can join any room and flood it.  
  **Impact:**
  - **Clients:** CPU, GPU and texture churn in every connected guest.
  - **Relay:** worker and Durable Object cost and availability.
  - **Scaling:** O(n²) fan-out in large rooms.

  Severity: medium-high. Likelihood: moderate, because the endpoint is published in the README.  
  **Recommended solution:**
  - In the Worker:
    - allow-list the production and localhost `Origin`s;
    - cap room size (for example 16);
    - reject frames above a small byte limit;
    - apply per-connection token-bucket rate limits (state ≈10 Hz, emoji ≈1 Hz, signals bounded);
    - validate the `emoji` against an allow-list of the panel's emoji;
    - strip control characters from names.
  - On the client, rate-limit emoji rendering per peer.

  **Regression considerations:** keep the 10 Hz presence cadence, WebRTC signaling bursts
  during ICE gathering, and local `wrangler dev` testing.  
  **Acceptance criteria:**
  - Worker unit tests prove oversize, over-rate and wrong-origin connections are dropped.
  - A full room refuses the next join with a clear close code, which the client surfaces.
  - Normal two- and four-guest sessions are unaffected.

  **Validation:** Worker tests (Miniflare or `vitest-pool-workers`) plus a scripted flood against `wrangler dev`.  
  **Estimated effort:** Medium  
  **Business value:** High  
  **Technical debt reduction:** Medium

- [x] **Make WebRTC voice negotiate for every mic-enabled guest**

  **Resolved 2026-09-23.** `NetworkClient` now uses perfect negotiation: `negotiationneeded`,
  with the higher id as the polite peer and glare-safe offer handling. Enabling the mic adds
  tracks to existing connections, which renegotiates them. Muting removes tracks but keeps
  connections, so a muted guest still hears others; previously muting tore down every
  connection. The wire format is unchanged. A unit test joins two clients through an
  in-memory relay with a fake `RTCPeerConnection`, covering higher-id-first, a later mic
  and mute; it fails on the old code. A two-device audio check is still recommended.

  **Priority:** Medium  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** Multiplayer voice  
  **Affected files:** `js/networkClient.js`  
  **Evidence:** CONFIRMED by code. `_maybeInitiateVoice()` offers only when `selfId < peerId`.
  - If only the higher-id guest enables the mic, no connection is ever created.
  - If the lower-id guest offered first, the answerer's connection has no local track. When the
    answerer later enables the mic, `_maybeInitiateVoice()` returns early because `peer.pc`
    exists, and no track is added or renegotiated.

  **Problem:** Whether voice works depends on random UUID ordering and on who clicked **Enable
  Mic** first.  
  **Impact:** In roughly half of pairings, a guest's voice is silently never heard.  
  **Recommended solution:**
  - When a guest enables the mic, add tracks to existing connections and renegotiate:
    use perfect negotiation with a polite/impolite role and `onnegotiationneeded`.
  - Alternatively, signal a `voice-request` so the lower-id peer offers.

  **Regression considerations:** keep glare avoidance and receive-only listening.  
  **Acceptance criteria:** for every enable order among two or three guests, each mic-enabled
  guest is heard by all others.  
  **Validation:** unit test with mocked `RTCPeerConnection`; two-browser manual test.  
  **Estimated effort:** Medium  
  **Business value:** Medium  
  **Technical debt reduction:** Low

- [ ] **Remote voice may be silent in Chromium-based browsers**

  **Status 2026-09-23: workaround implemented; awaiting device verification.**
  `attachVoice()` also binds each remote stream to a muted, detached `<audio>` element,
  released in `detachVoice()`, while the HRTF panner stays the only audible path. Close
  this after the two-device Chrome/Quest check in the acceptance criteria.

  **Priority:** Medium  
  **Category:** Bug  
  **Confidence:** Medium  
  **Area:** Multiplayer voice / spatial audio  
  **Affected files:** `js/avatarManager.js`  
  **Evidence:** LIKELY. `attachVoice()` routes the remote `MediaStream` only through
  `createMediaStreamSource()`. Chromium plays no audio from a remote WebRTC stream through
  Web Audio unless the stream is also attached to a media element (long-standing Chromium
  issue 933677, still reported with the muted-`<audio>` workaround). Quest Browser is
  Chromium-based.  
  **Problem:** Spatial voice may be completely silent on the primary target and on desktop
  Chrome and Edge.  
  **Impact:** The voice feature may not function where it matters most.  
  **Recommended solution:** also attach the stream to a muted, detached `<audio>` element
  (`srcObject`, `muted = true`, `play()`) per peer. Release it in `detachVoice()`.  
  **Regression considerations:** avoid double playback: the element must stay muted and the
  HRTF panner path must remain the only audible one.  
  **Acceptance criteria:** remote voice is audible and spatialised in Chrome and on Quest
  Browser.  
  **Validation:** two-device test on Chrome and Quest; also confirm Firefox and Safari do not
  double the audio.  
  **Estimated effort:** Small  
  **Business value:** Medium  
  **Technical debt reduction:** Low

- [x] **Clear remote avatars and voice when the relay socket drops**

  **Resolved 2026-09-23.** `_dropAllPeers()` reports every peer through `onPeerLeave` on
  socket close and on `disconnect()`. The manual avatar-removal loop in `ui-init.js` is
  gone. Covered by a unit test.

  **Priority:** Medium  
  **Category:** Reliability  
  **Confidence:** High  
  **Area:** Multiplayer lifecycle  
  **Affected files:** `js/networkClient.js`, `js/ui-init.js`  
  **Evidence:** CONFIRMED by code.
  - `_onSocketClosed()` clears `this.peers` without calling `onPeerLeave()`.
  - The Worker assigns a fresh `crypto.randomUUID()` per connection.
  - Only the manual **Disconnect** button removes avatars.

  **Problem:** After any network blip, reconnect or terminal error, previous peers remain as
  frozen avatars, with voice nodes still connected. The same guests reappear as duplicates
  under new ids.  
  **Impact:** Ghost guests accumulate for the rest of the session, cost draw calls, and misstate
  who is present.  
  **Recommended solution:** emit `onPeerLeave()` for every known peer in `_onSocketClosed()`,
  or add an `onReset` callback that `AvatarManager` handles by removing all remotes.  
  **Regression considerations:** keep the bounded-reconnect behaviour; keep `micEnabled`
  across reconnects.  
  **Acceptance criteria:** after a forced socket close and automatic reconnect, the scene
  contains exactly one avatar per live peer.  
  **Validation:** extend `test/unit.test.mjs` "multiplayer stops initial failures…" with a
  fake socket close; verify the `AvatarManager` remote count.  
  **Estimated effort:** Small  
  **Business value:** Medium  
  **Technical debt reduction:** Low

- [x] **Shared music: never broadcast `blob:` URLs, and ask before following a host's stream**

  **Resolved 2026-09-23.**
  - `sendMusic()` refuses anything other than http(s), and returns false.
  - A host playing a local file is told that it isn't shared.
  - Guests see the host's stream origin and must click **Listen along**
    (`#networkListenAlong`) before any remote-driven load. Consent is per connection.
  - The worker also nulls non-http(s) URLs once deployed.
  - Covered by unit tests.

  **Priority:** Medium  
  **Category:** Privacy  
  **Confidence:** High  
  **Area:** Multiplayer shared music  
  **Affected files:** `js/ui-init.js`, `worker/src/index.js`  
  **Evidence:** CONFIRMED by code.
  - The host heartbeat sends `audio.src` every 8 s. For an uploaded file that value is a
    host-local `blob:` URL, which no guest can resolve; the failure is swallowed by
    `.catch(() => {})`.
  - `applyMusicState()` automatically calls `startAudioStream()` with any host-chosen
    `https:` URL.
  - The host is simply the first socket in the room, and `lobby` is the shared default.

  **Problem:** Uploaded tracks silently never sync. Separately, any stranger who becomes host
  can make every guest's browser fetch an arbitrary server, disclosing IP address and
  listening time.  
  **Impact:** A broken feature path, plus a privacy exposure that guests never consented to.  
  **Recommended solution:**
  - Exclude `blob:` and `data:` URLs from `sendMusic()`, and show the host that local files
    are not shared.
  - Validate the URL scheme in the Worker.
  - On guests, show the host's stream origin and require one explicit "Listen along" action
    before the first remote-driven load.

  **Regression considerations:** keep the heartbeat resync for guests who have opted in.  
  **Acceptance criteria:**
  - No `blob:` URL is ever sent.
  - A guest's first remote-driven stream load requires consent and displays the origin.

  **Validation:** unit tests on the heartbeat filter; manual two-browser check.  
  **Estimated effort:** Small  
  **Business value:** Medium  
  **Technical debt reduction:** Low

- [x] **Bring `worker/` under repository tooling and remove committed Wrangler state**

  **Resolved 2026-09-23.** The change covers:
  - `worker/.wrangler` untracked, and `.wrangler/` ignored.
  - An ESLint module block for `worker/src/**` with Workers globals.
  - `check-syntax` includes the Worker.
  - A `worker/package-lock.json`, with Wrangler raised to `^4.136.3` because 3.x carried
    high advisories; the worker audit shows 0 vulnerabilities.
  - Protocol tests in `test/worker.test.mjs`, run by `npm test`.
  - Dependabot configured for `/worker`.

  **Priority:** Medium  
  **Category:** Cleanup  
  **Confidence:** High  
  **Area:** Relay worker / repository hygiene  
  **Affected files:** `worker/.wrangler/**`, `.gitignore`, `eslint.config.mjs`, `scripts/check-syntax.mjs`, `worker/package.json`  
  **Evidence:** CONFIRMED.
  - `git ls-files worker` lists three local Durable Object SQLite files under
    `worker/.wrangler/state/`.
  - `.gitignore` does not ignore `.wrangler/`.
  - No ESLint `files` block matches `worker/src/**`, so it is linted with no rules.
  - `check-syntax.mjs` does not include it.
  - The Worker has no tests and no lockfile, so `npm install` in `worker/` resolves
    `wrangler ^3.90` freshly on each deploy.

  **Problem:** Developer-local relay state (which may contain room names and presence data)
  is versioned. The production relay's source has no automated protection, and its deploys
  are not reproducible.  
  **Impact:** A typo in the relay ships unchallenged; leaked local state and churning binary
  diffs.  
  **Recommended solution:**
  - `git rm --cached -r worker/.wrangler` and ignore `.wrangler/`.
  - Add an ESLint module block for `worker/src/**/*.js` with Workers globals, and include the
    Worker in `check-syntax`.
  - Commit `worker/package-lock.json`.
  - Add protocol tests (host-only `music`, `rtc-signal` routing, host hand-off on close).

  **Regression considerations:** none for runtime behaviour.  
  **Acceptance criteria:**
  - No `.wrangler` paths are tracked.
  - `npm run lint` covers the Worker with rules.
  - Worker protocol tests run in CI.

  **Validation:** `git ls-files`, lint, CI.  
  **Estimated effort:** Small  
  **Business value:** Medium  
  **Technical debt reduction:** Medium

- [x] **Avatar turn interpolation takes the long way round**

  **Resolved 2026-09-23.** `AvatarManager.shortestAngle()` replaces the sign-preserving `%`
  wrap. The worker normalises `rotY`, and `update()` takes `dt` from the caller only, with
  the `0.016` fallback removed. Unit tests cover ±3π/2 and 3→−3 rad.

  **Priority:** Low  
  **Category:** Bug  
  **Confidence:** High  
  **Area:** Multiplayer presence  
  **Affected files:** `js/avatarManager.js`  
  **Evidence:** CONFIRMED by code.
  - `dy = ((dy + π) % 2π) - π` uses JavaScript's sign-preserving `%`, so for `dy < -π` the
    result stays below `-π`.
  - The desktop `camera.rotation.y` is unbounded, so large negative differences occur
    routinely.
  - `update()` also falls back to a literal `0.016` step, contrary to the frame-rate rule the
    contract test enforces only in `js/club/*animation*.js`.

  **Problem:** Remote avatars visibly spin almost a full turn instead of the short way.  
  **Impact:** A minor but conspicuous presence artefact.  
  **Recommended solution:**
  - Wrap with `dy - 2π·Math.round(dy / 2π)`.
  - Normalise the transmitted `rotY`.
  - Take `dt` from the caller only.

  **Regression considerations:** keep the compounded smoothing constant.  
  **Acceptance criteria:** a unit test proves the shortest-arc delta for ±3π inputs; no `0.016`
  literal remains in `avatarManager.js`.  
  **Validation:** unit test.  
  **Estimated effort:** Small  
  **Business value:** Low  
  **Technical debt reduction:** Low

- [x] **Document multiplayer in the agent instructions and persistence table**

  **Resolved 2026-09-23.** `.github/copilot-instructions.md` now lists both scripts in the
  load order. It has a Multiplayer section (relay protocol and abuse controls, perfect
  negotiation, the eye-height convention, listen-along consent) and the three `vrclub.network*`
  keys. It also documents the locomotion feature-swap rule, the gated deploy and
  `.gitattributes`. The README covers listen-along, `ALLOWED_ORIGINS`, the room cap, the
  deploy job and an offline table.

  **Priority:** Low  
  **Category:** Documentation  
  **Confidence:** High  
  **Area:** `.github/copilot-instructions.md`  
  **Affected files:** `.github/copilot-instructions.md`  
  **Evidence:** CONFIRMED. The file declares itself an accuracy contract. It never mentions
  `networkClient.js`, `avatarManager.js` or `worker/`, even though `index.html:464-465` loads
  them between the loaders and the club layers. Its persistence table omits
  `vrclub.networkServerUrl`, `vrclub.networkRoom` and `vrclub.networkName`.  
  **Problem:** The load-order contract and architecture description are stale.  
  **Impact:** Agents and contributors working from the document will misplace multiplayer code
  and miss that display names and room codes persist locally.  
  **Recommended solution:** add the two scripts to the load-order list, add a short Multiplayer
  architecture section (relay protocol, host model, voice mesh, trust boundaries), and extend
  the persistence table.  
  **Regression considerations:** none.  
  **Acceptance criteria:** the load order and persistence table match `index.html` and
  `NETWORK_PREFS`.  
  **Validation:** review against source.  
  **Estimated effort:** Small  
  **Business value:** Low  
  **Technical debt reduction:** Medium

### Updated existing items

- **Add a protected deploy job and dependency update automation** (2026-08-18 carried-forward
  list) raised from Low to **High**, with new evidence recorded in place.
- The 2026-08-23 release blocker (asset licensing) was not re-verified in this pass and remains
  open.

### Implementation pass — 2026-09-23

Every finding above plus 14 older items were implemented. Each item's own entry records how
it was verified.

Final local validation:

| Check | Result |
|-------|--------|
| `npm run check` | Pass |
| `npm run lint` | 0 problems |
| `npm test` | 92/92 |
| `npm audit` (root and `worker/`) | 0 vulnerabilities |
| `npm run check:sri` | Pass |
| `npm run build` | Pass |
| `npm run test:e2e` | 4/4 on the build with everything up to the handedness fix and the `init()`/spotlight extractions |
| E2E on the final build | Blocked by the host (see below) |

**E2E on the final build.** During the final runs the shared host reported 100% CPU and
rendered about 0.6 fps; an untouched `HEAD` build measured the same (249 s to ready, 4 frames
in 5 s). A timeout-scaled run of the production-build test on the final build passed every
assertion up to the mirror-cue block, including all three equipment lights (so the
handedness-corrected PA speakers load and configure) and the floor spotlights. It then failed
only on `reflectionBeams` (0 vs 16). That check waits a fixed 2 s for mirror ray batches to
accumulate, which is one frame at that speed; the mirror code was not touched after the green
run. Re-run `npm run test:e2e` on a normally loaded machine, or rely on the first CI run.

**Still open, and why:**
- **Owner action needed:**
  - Deploy the hardened relay: `cd worker && npm ci && npm run deploy`.
  - Set GitHub Pages' Source to "GitHub Actions".
- **Device checks:**
  - Chromium remote-voice workaround.
  - An in-headset Quest 3S smoke test.
- **Legal:** asset-licensing gaps; creator and source information must come from the owner.
- **Asset and art work, visual QA required:** GLB/texture optimisation, ORM packing, and the
  six 2026-09-15/18 presence items.

---

## Review — 2026-09-18 — Multiplayer presence follow-up

Scope: current source inspection and desktop runtime comparison of an injected remote guest beside
the authored high-tier crowd. The five unresolved findings from the 2026-09-15 immersive environment
assessment remain current and are not duplicated here.

- [ ] **Replace remote guest capsules with expressive low-cost avatars**

  **Rechecked 2026-10-06:** A fresh production receive/update probe again maps seated
  eye y=1.0 to root ground y=-0.7 using the real manager and loaded assets. No live
  peer connection was needed or tested. The ground/calibration protocol work below remains open.

  **Rechecked 2026-10-05 - seated grounding remains incorrect.** A production browser probe using
  the real `AvatarManager` and a loaded rig received `{x:0,y:1,z:-10,rotY:0}`. It produced
  `root.position.y = pose.groundY = -0.7`, while `pose.eyeY = 1`. The current receiver subtracts a
  fixed 1.7 m from every transmitted eye height; it cannot distinguish a seated/crouching guest from
  a guest on a lower floor. This is distinct from the fixed standing-avatar 1.7 m upward offset:
  do not undo that fix. No live peer connection was required for this receive/render-path probe.
  Extend this item's solution to carry separately validated ground level and head/body calibration
  (with a defined legacy-message fallback), preserving eye-height voice placement and shortest-arc
  interpolation. Extend acceptance to seated 1.0 m and standing 1.7 m eyes on floor, booth and balcony:
  feet remain within 0.1 m of the intended surface, and transmitted hands/head remain aligned.
  **Affected files:** [avatarManager.js](js/avatarManager.js), [07-animation-core.js](js/club/07-animation-core.js),
  [networkClient.js](js/networkClient.js), [worker/src/index.js](worker/src/index.js), [unit.test.mjs](test/unit.test.mjs)
  **User-visible effect:** A seated remote guest sinks 0.7 m into the floor in the reproduced input.
  **Desktop impact:** Observers see misplaced remote people.
  **VR impact:** Seated/crouching senders have incorrect remote embodiment.
  **Performance impact:** A few bounded pose fields; retain the four-rig cap.
  **Regression considerations:** Backward compatibility, finite/range-checked relay data, raised surfaces,
  voice at the eyes and the already-correct standing path.
  **Product value:** High
  **Technical debt reduction:** Medium

  **Partial 2026-10-02.** `AvatarManager` now builds an `AvatarRig` for the first
  `MAX_RIGS` (4) guests. Later guests, and anyone who arrives before the crowd
  containers load, still render as a capsule and head. Acceptance criteria are not met.

  **Priority:** Medium
  **Category:** Crowd
  **Confidence:** High
  **Area:** Optional multiplayer sessions and dance floor
  **Evidence:** `AvatarManager.ensurePeer()` represents every remote guest as a shared cyan 1.6 m
  capsule plus sphere head and floating label. A desktop runtime comparison placed that figure beside
  the rigged crowd and confirmed that its featureless silhouette, rigid body and uniform material are
  immediately conspicuous. Remote transforms interpolate smoothly, but no head/controller pose or
  idle motion is transmitted or rendered.
  **Problem:** The representation communicates network occupancy but not another embodied clubgoer,
  and its abstraction conflicts with the otherwise human crowd.
  **Presence impact:** In multiplayer, the person the player is most likely to attend to becomes one
  of the strongest computer-generated cues in the primary presence zone.
  **Recommended solution:** Replace the primitive with a Quest-budget avatar assembled from a low-poly
  torso, head and tracked hand/controller proxies; transmit quantized head and hand poses, add restrained
  procedural idle motion, and preserve the current interpolation, nameplate and spatial-voice ownership.
  **Performance considerations:** Keep one shared material/mesh set, pool avatar parts and labels, cap
  update frequency, interpolate locally, and define a measured remote-player budget before increasing
  geometry or adding skinning.
  **Acceptance criteria:** Remote guests have readable facing, head height and hand intent at normal
  social distance; no capsule primitive is visible; four simulated guests add no sustained frame-time
  miss on Quest balanced tier and allocate nothing in the per-frame update path.
  **Validation:** Side-by-side in-headset social-distance review, packet-loss/latency simulation, four-peer
  Quest CPU/GPU frame-time capture, and seated/standing head-and-hand alignment tests.
  **Estimated effort:** Medium
  **Immersion value:** High

---

## Review — 2026-09-15 — Immersive environment presence assessment

Scope: desktop runtime inspection at arrival, dance-floor, bar-wall and DJ-booth positions;
scene-graph/material/audio/interaction inspection; repository evidence; existing performance
records. Quest frame timing, stereoscopic stability, scale and comfort still require an in-headset
pass, so findings that depend on them are not presented as confirmed visual defects.

- [ ] **Restore distinct entrance and bar presence zones**

  **Rechecked 2026-10-06:** Both zones now exist; the bar was visually inspected with
  textured wood, stocked shelves, stools, warm practicals and the bartender. The old
  "zero bar/entrance meshes" evidence below is historical. Remaining acceptance is
  circulation integrity (tracked in the navigation item) and measured Quest cost,
  not rebuilding these zones. Keep open until that original headset criterion is met.

  **Note 2026-10-03.** Evaluated Quaternius's Modular Sci-Fi MegaKit and Sci-Fi Essentials Kit (both CC0) as
  props for this: they are chunky sci-fi pieces (chair 0.9 x 1.6 x 1.1 m, desks 2 m, crates 4-6k vertices each,
  four trim texture sets), and none is a bar stool, glass or bottle. Not used. The Universal Animation
  Library's sitting and rail-leaning clips would suit a bar, but were left out of the guest files until
  there is furniture to match their seat height (about 0.45 m).

  **Priority:** High
  **Category:** Environment
  **Confidence:** High
  **Area:** Arrival, room perimeter and right wall
  **Evidence:** `createEntranceArea()`, `createDanceFloorLighting()` and `createBar()` exist, but
  `init()` explicitly omits all three "for cleaner look". Runtime inspection found zero entrance,
  stanchion, bar, bottle or shelf meshes; the right wall is an uninterrupted dark surface.
  **Problem:** The 25 m x 16 m room has almost no spatial hierarchy outside the stage, so it reads
  as a lighting volume rather than a venue that supports arrival, waiting, service and circulation.
  **Presence impact:** Looking away from the DJ immediately reveals an empty simulation shell.
  **Recommended solution:** Reintroduce a restrained threshold and compact working bar using the
  existing methods as prototypes, then replace decorative primitives with a small believable
  ecosystem: door/security point, counter, backbar, sink/till/bin/storage cues and warm practicals.
  **Performance considerations:** Merge static geometry, share materials and use emissive practicals;
  set a fixed draw-call and texture-memory budget before enabling the zone on Quest.
  **Acceptance criteria:** Arrival, dance floor and bar are visually distinguishable with show lights
  disabled; each has a plausible function and circulation path; the Quest balanced tier stays within
  its measured frame budget.
  **Validation:** A/B captures from arrival and the right wall, collision walk-through, and sustained
  Quest GPU/CPU frame-time capture with the bar visible.
  **Estimated effort:** Medium
  **Immersion value:** High

- [ ] **Replace the looping clone crowd with social micro-behaviours**

  **Partly done 2026-10-08.** Static social states now exist: `_guestSlots()` stands a talking pair,
  relaxed watchers, a head-nodder and a standing idler by the side walls. The balcony guest has a dedicated
  `Idle_Railing_Loop`: both hands stay on the measured mezzanine rail while her head scans the dance floor.
  Phone-call poses (implausible beside the PA) and the stiff folded-arm assignments were removed; the bouncer
  now uses `Idle_Loop` while his runtime gaze still follows nearby guests. Still open: a scheduler that changes
  the other guests' state over time, transit/walking, and wider gaze. The balanced tier now has 2 more
  skeletons than before, which breaks this item's own "skeleton counts do not increase" criterion until
  the headset baseline says it is affordable. Quaternius's free libraries have no second dance clip;
  the Mixamo files remain the only extra dance motion.

  **Priority:** High
  **Category:** Crowd
  **Confidence:** High
  **Area:** Dance floor and DJ booth
  **Evidence:** High tier rendered ten dancers plus one DJ from three source GLBs. Every character
  ran one looping animation; repeated sources differed mainly by phase and speed, all crowd slots
  were oriented toward the booth, and the runtime has no gaze, idle, conversation or navigation state.
  **Problem:** Repeated full-body loops and evenly distributed solo performers create obvious clone
  and chorus-line patterns despite phase offsets.
  **Presence impact:** Humans become the strongest computer-generated cue in the primary presence zone.
  **Recommended solution:** Keep the tiered headcount but add a low-frequency behaviour scheduler with
  dancing, resting, talking, watching, phone-check and transit states; arrange pairs/small groups,
  vary facing and personal space, and reserve the most animated loops for a minority.
  **Performance considerations:** Reuse current skeletons and animation LOD; state changes should occur
  infrequently and must not add per-frame allocations, pathfinding or a higher Quest headcount.
  **Acceptance criteria:** A two-minute fixed-camera capture contains no synchronized restarts; fewer
  than half of visible patrons face the DJ continuously; at least three readable social states occur;
  balanced-tier skeleton and draw counts do not increase.
  **Validation:** Timeline capture from arrival and dance floor, automated state-distribution test, and
  in-headset uncanny/repetition review.
  **Estimated effort:** Large
  **Immersion value:** High

- [ ] **Establish a representative Quest 3S frame-time and stability baseline**

  **Evidence update 2026-10-06:** The current balanced `firstLight` resource test passes:
  317 desktop / 316 IWER-XR engine submissions, 308/162 active-submesh proxies, 277 MiB
  ordinary RGBA+mip estimate in both modes, and 10/13 MiB cube/render-target estimates.
  Seven ordinary textures are >=2048px; none are >=4096px. The 2048px graffiti atlas
  accounts for approximately 21 MiB of the change from the previous ordinary-texture
  estimate. These are not physical GPU allocations or timing measurements.
  Include 4x pipeline MSAA, the 1.2 XR layer scale and the updated mirror/laser paths
  in the existing hardware route. The low tracked-pose and circulation findings need
  regression coverage before claiming comfortable stair traversal.

  **Evidence update 2026-10-05:** The pinned balanced `firstLight` browser-budget test now measures
  324 desktop and 319 IWER-XR engine submissions/frame, with 311/163 active-submesh proxies respectively.
  Ordinary 2D RGBA+mip estimates are 256 MiB in both modes; cube/render-target estimates are 10/13 MiB.
  Ten NPCs have ten contact shadows; no ordinary 4096px textures exist. These are software-rendered
  complexity snapshots at different mode viewpoints, NOT headset CPU/GPU time or actual GPU memory.
  Include the new bar, stair/deck and bass bins in the existing 15-minute hardware route; the two
  asset-specific hardware tasks above remain open until that route validates them.
  **Affected files:** [PERFORMANCE_BASELINE.md](docs/PERFORMANCE_BASELINE.md), [budget.spec.mjs](test/e2e/budget.spec.mjs),
  [01-core.js](js/club/01-core.js)
  **User-visible effect:** Stable native headset delivery is still not established.
  **Desktop impact:** Browser resource ceilings pass; representative desktop timing is also unmeasured in this review.
  **VR impact:** Stereo comfort, sustained frame pacing and thermal behaviour remain release evidence gaps.
  **Performance impact:** Measurement first; retain visual quality until a bottleneck is identified.
  **Regression considerations:** Do not treat IWER's mono image or RGBA estimates as a Quest GPU benchmark.
  **Product value:** High
  **Technical debt reduction:** Medium

  **Priority:** High
  **Category:** Performance
  **Confidence:** High
  **Area:** Balanced tier, WebXR render loop and worst-case show cues
  **Evidence:** The documented baseline records desktop automation at 4 FPS and explicitly says it is
  not representative. This review observed 1,015 meshes, 590 active meshes, 487 materials and roughly
  611 draws from one high-tier arrival frame, but the repository contains no Quest CPU/GPU frame-time,
  dropped-frame, reprojection, thermal-soak or texture-memory result.
  **Problem:** Stable headset delivery, the hard requirement for presence and comfort, is currently an
  assumption rather than a release criterion.
  **Presence impact:** Judder, reprojection or thermal degradation could invalidate every visual gain.
  **Recommended solution:** Define a repeatable 15-minute Quest 3S route covering arrival, crowd,
  mirror ball, laser sheet and maximum safe lighting; capture refresh rate, CPU/GPU frame time, dropped
  frames, memory and thermals, then set budgets and fail criteria in `docs/PERFORMANCE_BASELINE.md`.
  **Performance considerations:** Measurement only initially; optimize from the measured dominant cost
  instead of reducing effect density by assumption.
  **Acceptance criteria:** Balanced tier sustains the selected native refresh target through the route
  without progressive thermal frame loss; worst-case p95 CPU and GPU times retain documented headroom.
  **Validation:** Quest 3S capture using the same route and show-state seed on two cold starts and one
  thermal-soak run.
  **Estimated effort:** Medium
  **Immersion value:** High

- [ ] **Add minimal player embodiment and physical venue response**

  **Partial 2026-10-02.** The local guest now has an `AvatarRig` body, and VR arms
  are IK'd to the controllers. Near interaction and hand tracking stay disabled.
  Venue meshes still have no contact response, so the item stays open.

  **Priority:** High
  **Category:** Interaction
  **Confidence:** Medium
  **Area:** Player rig, DJ booth and nearby venue objects
  **Evidence:** The scene has no player body or rendered hands; controller meshes and near interaction
  are disabled, venue meshes have no action managers, and the physics engine is disabled. Interaction
  is intentionally limited to far-pointer VJ controls, locomotion, collisions and controller haptics.
  **Problem:** At close range the player behaves like a floating camera that can operate a control desk
  but cannot physically register against the venue.
  **Presence impact:** Reaching toward rails, booth surfaces or obvious controls produces no embodied
  response, weakening scale and ownership of space.
  **Recommended solution:** Add lightweight tracked hand/controller proxies and collision-aware hand
  poses, then choose two high-value responses rather than broad physics: rail/booth contact haptics and
  one physically depressed DJ control. Keep decorative venue props visibly non-interactive.
  **Performance considerations:** Avoid a general rigid-body simulation; use bounded overlaps, authored
  poses and pooled haptic events suitable for Quest.
  **Acceptance criteria:** Hands/controllers remain aligned at normal reach, never pass visibly through
  the booth or rail during the test route, and the chosen control gives visual and tactile confirmation.
  **Validation:** In-headset seated/standing reach tests across two player heights and both controllers.
  **Estimated effort:** Large
  **Immersion value:** High

- [ ] **Author eye-level wear and break up large surface repetition**

  **Priority:** Medium
  **Category:** Material
  **Confidence:** High
  **Area:** Floor, perimeter walls, entrance threshold and DJ booth
  **Evidence:** Local 1K PBR texture sets provide albedo, normal, roughness and AO, but one wall set is
  tiled 4 x 2 across long 25-45 m planes and the floor set 6 x 6 across a 35 x 45 m ground mesh. Runtime
  and close captures show clean box junctions and broad repeated material response with little localized
  wear, dirt accumulation, repairs, cable routing or contact variation.
  **Problem:** Good base materials describe material type but not how this specific club was built,
  touched, cleaned and damaged.
  **Presence impact:** At 10-20 cm inspection, repetition and perfect transitions reveal procedural
  construction before texture resolution becomes the limiting factor.
  **Recommended solution:** Add a small shared trim/decal atlas and sparse geometry for thresholds,
  skirting, floor-edge buildup, patched conduit mounts, booth fingerprints and traffic wear. Place marks
  by physical cause and avoid uniform grunge.
  **Performance considerations:** Use atlas batching, instanced fasteners and distance-gated decals;
  do not increase base texture resolution or add unique 4K maps.
  **Acceptance criteria:** No obvious repeated stain/feature appears twice in one headset view; floor-wall
  and booth-floor contacts have depth and localized wear; added balanced-tier draw and memory costs are
  measured and remain inside the Quest budget.
  **Validation:** 10-20 cm in-headset inspection at five fixed locations plus before/after material and
  draw-call captures.
  **Estimated effort:** Medium
  **Immersion value:** High

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

- [x] Keep enabled crowd avatars animating outside the camera view
  Priority: Medium
  Category: Reliability / UX
  Area: Crowd / Rendering
  Affected files: `js/club/11-audio-crowd.js`, `test/unit.test.mjs`
  Problem: Pausing skeletal animation by distance or camera frustum froze enabled dancers when viewed from some angles,
  and animated hierarchy bounds are unreliable in stereo XR.
  Impact: NPCs visibly stopped dancing even though their quality tier and district still showed them.
  Recommended solution: Only `_setAnimating()` pauses a character when tier or district visibility explicitly hides it.
  Every enabled character keeps evaluating its animation regardless of camera distance or direction.
  Acceptance criteria: Enabled avatars never pause based on distance or frustum state; hidden avatars still pause and
  restart through their visibility owner.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

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

- [x] Extract `init()` (561 lines, 9 levels of nesting) and `updateSpotlights()` (~1,030 lines)
  Resolved 2026-09-23 (pure extractions; bodies moved verbatim, with data flow computed by
  `eslint-scope` so every input and output is explicit).
  - `init()`: 635 lines at nesting 10 → 193 lines at nesting 1. Extracted `_initXRHelper`,
    `_setupXRSession`, `_bindXRMotionController`, `_createDesktopCamera`,
    `_createGlowLayer`, `_buildVenue`, `_finalizeRenderQuality` and
    `_setupLifecycleListeners`.
  - `updateSpotlights()`: 1,064 lines at nesting 8 → 214 lines at nesting 5. Extracted
    `_solveSpotDirection`, `_animateMovingHead`, `_resolveSpotSurfaceHit`,
    `_updateSpotBeamGeometry`, `_updateSpotBeamAppearance`, `_updateSpotLightPool`,
    `_placeSpotPool`, `_updateSpotPoolGlow` and `_updateSpotGoboProjection`. Per-spot records
    (`_beamGeom`, `_beamState`, `_surfaceHit`, `_dirOut`) are pooled, so nothing allocates
    per frame.
  - Every function in both files is now ≤ ~214 lines and nests ≤ 5 levels.
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
  was added 2026-08-23. The PA creator/source gap is now resolved: Sousinho's original
  Sketchfab listing is recorded in ASSETS.md and linked in-app with the CC BY 4.0 licence
  and optimization notice. Mixamo redistribution clearance remains open.
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Low

- [x] **The LED wall costs 210 draw calls: half of everything drawn in a frame**

  **Resolved 2026-10-03.** The wall is now ONE mesh (`ledPanel_wall`): the same 210 quads at the same
  positions with the same dark seams, coloured from a 21x10 float `RawTexture` with one texel per
  panel (all four corners of a quad share its texel centre, so each panel is a flat colour). The
  patterns are untouched: they still write `panel.material.emissiveColor`, which is now a plain
  holder, and `_flushLedWall()` copies those colours into the texture once per frame at the end of
  `updateLEDWallPass` (all branches: patterns, off state, monochrome, ledWallLevel). The glow
  selector special-cases the wall (`2.0 x` the texture). Floats keep colours above 1.0 driving the
  glow; GPUs without float textures fall back to 8-bit.
  **Measured:** desktop entrance view 564 -> 355 draw calls; the wall 210 -> 1. A side-by-side of a
  known colour map (per-panel colours including HDR values) matches in desktop and in the emulated
  headset: same colours, seams and position, and a similar glow contribution.
  **Guarded by:** `test/e2e/budget.spec.mjs` (wall is one mesh, draws <= 400) and a unit test for
  the flush (row/column mapping, float and 8-bit paths).
  **Still open:** 355 draws remain. The biggest groups are the mirror-ball rays, spots and beams (about
  80, animated every frame) and ~30 static chain links; the rest is a long tail of small fixture parts.
  Merging static fixture parts or moving the mirror-ball rays to thin instances would take it lower,
  but the mesh names are load-bearing for cleanup and the rays are animated, so that needs its own
  pass. Headset frame time before/after has NOT been measured (the emulator is software-rendered).
- [x] Optimise the two 15 MB GLBs and the 8 MB texture PNGs
  **Resolved 2026-10-03.** `npm run optimize:models` (`scripts/optimize-models.mjs`, idempotent,
  `--check` mode enforced by a contract test) did the following, with no Draco/meshopt/KTX2 because
  their decoders load from a CDN, which the same-origin critical-path rule forbids:
  - DJ console GLB: 4096 -> 2048 WebP textures (normal and emissive lossless): 15.71 -> 3.20 MiB.
  - Speaker GLB: embedded textures stripped (the app already replaced them with the external set):
    15.75 -> 0.32 MiB. External speaker textures resized (normal PNG 10.08 -> 1.93 MiB).
  - Deleted `js/models/djgear/textures/` (12.7 MB, referenced by nothing) and one unused texture.
  **Measured:** source asset payload 65.26 -> 21.08 MiB; estimated GPU texture memory **1,450 -> 224 MB**;
  textures of 2048 px or more 16 -> 6, of 4096 px 16 -> 0. Close-ups of the console and the speaker
  before and after are visually identical (the only pixel differences are animated avatar/LED/beam
  content). Guarded by `test/e2e/budget.spec.mjs` and the contract tests.
  **Not measured:** real headset load time and memory; the GPU figures are estimates
  (width x height x 4 x 4/3). A second PA speaker still loads its own copy of the textures.
  Priority: High
  Category: Performance
  Area: Assets
  Affected files: `scripts/optimize-models.mjs`, `js/models/`, `ASSETS.md`
  Estimated effort: Medium
  Business value: High
  Technical debt reduction: Medium
- [x] Remove `'unsafe-inline'` from `style-src`
  Resolved 2026-09-23 (acceptance criteria met; the header directive intentionally stays).
  - `showAudioStreamInputUI()` now builds the overlay with `createElement`/`textContent`.
  - No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` remains in `js/`.
  - A contract test ("first-party code builds DOM without HTML-string sinks") forbids them.
  - `'unsafe-inline'` cannot be dropped: the pinned Babylon runtime injects `<style>` elements
    with runtime-computed CSS (WebXR enter/exit button, loading screen, audio unmute), and
    neither a hash nor a nonce can cover that. The CSP comment in `index.html` records this.
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

- [x] Disclose the default third-party audio stream before connecting to it
  Resolved 2026-09-23.
  - The splash has a "Play radio on entry" opt-in, `#splashRadioOnEntry`, unchecked by
    default; a pre-ticked box is not consent under Planet49. It is persisted as
    `vrclub.radioOnEntry`.
  - The note names the station and the host that will be contacted, including a remembered
    stream.
  - Without opt-in, ENTER makes no third-party connection and highlights the audio menu.
  - The e2e suite opts in so the stream path stays covered.
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

- [x] Route ModelLoader's three PointLights through LightFactory
  Resolved 2026-09-23.
  - `ModelLoader` accepts `{ lightFactory, textureLoader }`, and `VRClub` passes both.
  - The accent lights are created with `lightFactory.createPointLight()`, keeping the same
    intensity and range.
  - `group` is set (`dj` / `speakers`); no club code sweeps those groups.
  - A unit test asserts no bare `PointLight`, and e2e asserts all three equipment lights exist.
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

- [x] Investigate whether `_fitAndPlace()` destroys the glTF handedness transform
  Resolved 2026-09-23: CONFIRMED and fixed.
  - Babylon's loader writes a net `diag(-1, 1, 1)` conversion on `__root__`, which
    `_fitAndPlace()` reset.
  - `ModelLoader._rootHandedness()` now captures the axis signs before the reset and folds
    them into the fit, so the DJ console's `scale.x = -1` workaround is removed.
  - The runtime probe shows the DJ console transform unchanged (x scale −0.0128, rotation
    π about Y). The PA speakers now carry the conversion and are no longer mirrored.
  - A unit test uses Babylon's own matrix maths and asserts that no config carries a mirror
    sign.
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

- [x] Decide the fate of the unreferenced procedural model fallbacks
  Resolved 2026-09-23: deleted.
  - The ~480 unreachable lines are gone: `createEnhancedProceduralModel`, `createEnhancedCDJ`,
    `createEnhancedMixer`, `createEnhancedPASpeaker`, and the `useProcedural` flags.
  - A failed load now logs "unavailable — keeping the club's built-in geometry" and returns
    null without recording the model as loaded.
  - The real fallback is the club's own procedural booth and speaker stacks, which are only
    hidden when a GLB loads.
  - The live `createSpeakerHangingHardware()` was preserved; e2e caught a first attempt
    that removed it.
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

- [x] Route PA speaker textures through TextureLoader and remove the magenta error state
  Resolved 2026-09-23.
  - All four maps load through `TextureLoader.loadOrDownloadTexture()`, which gives them the
    IndexedDB cache, body deadline and in-flight de-duplication. A bare `Texture` is used
    only when the loader runs standalone.
  - A missing albedo falls back to a near-black finish, with a single warning.
  - Covered by a unit test.
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

- [x] Wire `types/vrclub.d.ts` into a `tsconfig.json` with `checkJs`, or delete it
  Resolved 2026-09-23 by a third option, which targets the stated problem ("cannot go stale
  loudly").
  - A contract test fails if any declared class is not exported on `window`, or any declared
    method is not defined in its source.
  - It immediately found three stale declarations (`LightFactory.createLight`,
    `VJDirector.tap`/`drop`), which are now corrected.
  - `NetworkClient` and `AvatarManager`, plus the new `ModelLoader` and `MaterialFactory`
    options, are declared.
  - Full `checkJs` remains possible later, but is no longer needed to keep the file honest.
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
  Status 2026-09-23: implemented; blocked on one repository setting.
  - `.github/workflows/ci.yml` now has a `deploy` job. It runs only on pushes to `main`,
    needs `verify`, `e2e` and `audit`, builds `dist/`, and publishes it with
    `upload-pages-artifact` + `deploy-pages` under the `github-pages` environment.
  - `.github/dependabot.yml` covers the root, `/worker` and GitHub Actions.
  - The cache token is bumped to `20260923-1`, so the root-served site refreshes meanwhile.
  - Remaining: the owner must set Settings → Pages → Source to "GitHub Actions". Until then
    Pages keeps deploying the raw root on every push.
  Priority: High (raised from Low 2026-09-23)
  Category: Deployment
  Area: CI/CD
  Affected files: `.github/workflows/ci.yml`, `package.json`, GitHub Pages settings
  Problem: the README's "deploy `dist/` to static hosting" remains a manual step — there is no
  tag-triggered release, environment protection, or automated dependency update policy.
  The redundant `http-server` dependency was removed 2026-08-23; `npm start` and `npm dev` now use
  the hardened dependency-free server with traversal guards, security headers and `$PORT` support.
  Evidence (2026-09-23, CONFIRMED):
  - Production is GitHub Pages "pages build and deployment" from the repository root.
    It succeeded on every push while CI failed.
  - `https://my-pwa-apps.github.io/VRCLUB-2/` serves the unbuilt sources:
    - individual `js/*.js?v=20260915-1` scripts, instead of the content-hashed `dist/assets/app-*.js`;
    - the hand-maintained root `sw.js`.
  - GitHub Pages ignores `_headers`, so `frame-ancestors`, `X-Frame-Options` and the immutable
    asset caching are not applied in production.
  - About 950 lines of multiplayer JavaScript landed after `20260915-1` without a `version:bump`.
    With the service worker's stale-while-revalidate strategy, a returning visitor's first
    load can pair fresh `index.html` markup with cached, pre-multiplayer `ui-init.js`.
  Recommended solution:
  - Add a `deploy` job gated on `main` that needs `verify` and `e2e`, builds `dist/`, and
    publishes it with `actions/upload-pages-artifact` + `actions/deploy-pages` under a
    protected environment.
  - Switch Pages to "GitHub Actions" as its source.
  - Because Pages cannot send `_headers`, either host `dist/` on Cloudflare Pages or Netlify,
    or document that clickjacking protection is absent.
  - Add Dependabot or Renovate.
  Acceptance criteria:
  - The live site loads `assets/app-<hash>.js`.
  - A red CI run cannot deploy.
  - A source change always changes the deployed asset URLs.
  - Dependency updates open PRs automatically.
  Estimated effort: Small
  Business value: High
  Technical debt reduction: Medium

- [x] Close the dev/prod strict-mode divergence
  Resolved 2026-09-23.
  - Every first-party script starts with `'use strict';`. Production was already fully
    strict, because `assetCache.js`'s directive landed at the top of the concatenation.
  - Both CommonJS export blocks are removed, so the bundle no longer carries esbuild's
    CommonJS shim.
  - Tests load `audioUtils.js` through the VM harness.
  - A contract test enforces both rules.
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
  **Resolved 2026-10-03** for the three environment surface sets: `scripts/pack-orm.mjs` packs `ao.jpg` and `roughness.jpg` into `orm.jpg` (R occlusion, G roughness, B metallic = 0, 4:4:4 chroma), the loader binds it as one texture, and the old two-map path remains for an unpacked set. Four maps per set became three (GPU texture memory 224 -> 210 MB). Not changed: the DJ console and speaker, whose materials come from their GLBs.
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

- [x] Add structural tests for the Web Audio spatial graph

  Resolved 2026-09-23. A Web Audio test double records `connect()` edges. Three tests assert:
  - both PA panners are HRTF and positioned from `CLUB_POSITIONS`;
  - the analyser is fed pre-spatial and is never downstream of a panner;
  - the sub, early-reflection, reverb and occlusion paths reach the bus and the output;
  - the crowd bed runs spatialised;
  - `createMediaElementSource` is called once;
  - the listener follows the camera, and the corridor occludes the PA;
  - `dispose()` stops every source and closes the context.

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

- [x] Replace name-based material mutability with an explicit factory option

  Resolved 2026-09-23.
  - All three factory creators take `mutable: true`, which is part of the shared-cache key.
  - `HOT_MUTATED` and `isHotMutated()` are removed.
  - All 16 call sites the name heuristic kept unfrozen now opt in explicitly, so no runtime
    behaviour changed.
  - Tests prove that names no longer decide freezing, that shared frozen and mutable
    materials never collide, and (as a migration guard) that every formerly hot-named call
    site declares `mutable`.

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

- [x] Expose online/offline state and document the offline capability boundary

  Resolved 2026-09-23. The audio panel announces offline and online transitions through its
  status line, and sets `data-offline` on `#audioMenu` without blocking local files. The
  README has an "Offline use" table covering first visit, cached visits, local files,
  streams and multiplayer.

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

- [x] Moving-head output looked dimmed instead of photometrically powerful

  Priority: High

  Category: Visual fidelity

  Area: Fixture optics / direct lighting

  Affected files: `js/club/06-effects.js`, `js/club/08-animation-fixtures.js`,
  `test/e2e/vrclub.spec.mjs`

  Problem: moving-head diffuse color was multiplied to 15% on desktop and 32% in VR,
  using chroma as a dimmer despite the light already having an intensity control. Desktop
  source cores were also much weaker than their headset equivalents. Punch-heavy looks let
  the entire rig fall to 45% output between beats, even with active music.

  Impact: lenses and additive pools appeared lit, but PBR surfaces, haze, dancers, and room
  architecture received weak colored light, making professional fixtures read as dim props.

  Recommended solution: increase real SpotLight intensity and preserve more direct-light chroma;
  strengthen compact HDR source cores, beam scatter, and receiving pools while retaining the
  existing auto-iris, `0.20` indirect-bounce cap, and `0.06` blackout floor. Make musical
  punch additive above a 65% pedestal (75% without audio); hard blackouts stay independent.

  Acceptance criteria: rendered desktop review shows bright source-to-beam-to-surface continuity;
  Quest optics tests enforce direct-light chroma, source, beam, pool, and intensity floors.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: Medium

- [x] DJ, crowd, and truss disappeared when the mirror-ball cue began

  Priority: Critical

  Category: Bug / Rendering

  Area: Mirror ball / material light buffers

  Affected files: `js/club/06-effects.js`, `test/e2e/vrclub.spec.mjs`

  Problem: the mirror-ball cue dynamically enabled a real SpotLight after static PBR materials
  had been frozen while scene material-dirty propagation was blocked. Babylon changed the active
  light UBO layout without recompiling those effects.

  Impact: WebGL emitted `uniform buffer that is too small` draw errors and stopped rendering
  unrelated DJ, avatar, and truss materials on both desktop and VR. Their meshes remained enabled
  and active, making the failure look like delayed asset removal.

  Recommended solution: keep mirror fixtures visual-only and use their emissive incident beams,
  reflected surface spots/rays, and existing fixture-driven ambient bounce for illumination.

  Acceptance criteria: a rendered desktop mirror-only cue has no real mirror SpotLight, emits no
  UBO warning, and keeps all renderable dancer, DJ, and truss meshes in Babylon's active set.

  Estimated effort: Small

  Business value: Critical

  Technical debt reduction: High

- [x] Audience blinders consumed scene and control complexity without useful output

  Priority: Low

  Category: Simplification / Performance

  Area: Fixtures / VJ controls

  Affected files: `js/club/05-fixtures.js`, `js/club/07-animation-core.js`,
  `js/club/09-animation-finish.js`, `js/club/10-ui.js`, `js/showDirector.js`, `js/ui-init.js`

  Problem: four decorative two-cell blinder housings exposed controls and show state, but their
  emissive discs did not provide useful room illumination or a distinct effect beyond strobes.

  Impact: eight glowing discs, four housings, a per-frame update, and duplicated choreography/UI
  state increased scene and maintenance cost without improving the experience.

  Recommended solution: remove the fixture meshes, animation and public controls completely;
  retain strobes as the sole photosensitive white-impact system.

  Acceptance criteria: no runtime or test code references blinder state, no blinder control is
  rendered, and the production desktop/Quest browser suite remains healthy.

  Estimated effort: Small

  Business value: Low

  Technical debt reduction: Medium

- [x] Laser-sheet smoke looked like glowing bubbles and fixtures did not illuminate the room

  Priority: High

  Category: Visual fidelity

  Area: Laser sheet / indirect lighting

  Affected files: `js/club/06-effects.js`, `js/club/07-animation-core.js`,
  `test/e2e/vrclub.spec.mjs`

  Problem: additive fog billboards expanded to 1.8 times their initial size with near-zero drift,
  producing luminous spheres instead of aerosol density variations. Fixture beams were visible,
  but contributed almost no low-frequency illumination to surrounding architecture.

  Impact: the sheet read as a particle effect rather than laser light scattered by turbulent haze,
  while the room remained implausibly black around powerful operating fixtures.

  Recommended solution: use sparse, rotated, anisotropic standard-alpha haze wisps with lateral
  turbulent flow and fading tails. Derive a smoothed, hue-matched bounce term from active fixture
  energy using the existing hemispheric light, avoiding new light uniforms or shadow maps.

  Acceptance criteria: rendered checks show dark gaps and irregular wisps without additive bubbles;
  active fixtures settle the room bounce at or below 0.20, while a blackout returns it to 0.06.
  Browser tests enforce particle blending/shape and both illumination bounds.

  Estimated effort: Medium

  Business value: High

  Technical debt reduction: Medium

- [x] Truss and crowd appeared to disappear during sustained VR show playback

  Priority: High

  Category: Bug

  Area: VR rendering / show readability

  Affected files: `js/materialFactory.js`, `js/club/11-audio-crowd.js`,
  `test/e2e/vrclub.spec.mjs`

  Problem: multi-bar aerial-only looks deliberately extinguish surface fixtures and the LED wall.
  Through denser VR haze, dark avatar textures and aluminum truss then fell below the headset's
  useful black level and looked unloaded even though Babylon kept every mesh enabled and active.

  Impact: users could mistake an authored lighting transition for delayed culling or failed assets.

  Recommended solution: retain true fixture blackouts but give avatar silhouettes and structural
  aluminum a restrained neutral emissive floor; verify actual active-mesh membership after rendered
  XR frames rather than checking only `alwaysSelectAsActiveMesh` flags.

  Acceptance criteria: the emulated Quest test proves every enabled NPC and truss mesh is in the
  scene's active-mesh set after sustained rendering, and verifies the minimum material floors.

  Estimated effort: Small

  Business value: High

  Technical debt reduction: Medium

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
