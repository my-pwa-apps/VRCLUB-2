# QuestDev multidisciplinary experience review

Follow-up texture research is recorded in [the candidate shortlist](#follow-up-texture-candidates-1-november-2026); it is separate from the original review evidence.

Review date: 1 November 2026. Review only: no application, asset, configuration or test changes were made for the original review assignment.

## 1. Scope, revision and evidence limitations

### Reviewed distribution

| Item | Verified scope |
|---|---|
| Repository / branch | `my-pwa-apps/VRCLUB-2`, `QuestDev` |
| HEAD | `f0c0a1e49203ad7b7bc3bb22d93c71f648276be6` |
| Important revision qualification | HEAD **plus the ten pre-existing, uncommitted lighting-polish files**, not HEAD alone |
| Default identity | NOCTURNE; ADE branding is an explicit optional build variant, not the default |
| Development site | <https://nocturnedev.mitwee.nl/> |
| Deployment inspected | <https://e9ff0d23.nocturne-dev.pages.dev> |
| Rebuilt and deployed application | `assets/app-c50eac81e034.js` |
| CSS / service worker | `assets/styles-f7a142f540ad.css` / `vrclub-vd2d1e040527c` |
| Comparison base | **Local** `main`, `4858dfd1a9e508127981d554486f741088803037`; no remote fetch |
| Local main divergence | 0 commits main-only, 117 QuestDev-only; 573 changed files, 76,255 insertions, 3,839 deletions |
| Physical equipment | No worn Quest or real DJ interface was available to this review |

The ten existing changes are in [showDirector](../../js/showDirector.js), [LED patterns](../../js/ledPatterns.js), [animation fixtures](../../js/club/08-animation-fixtures.js), [multiplayer](../../js/multiplayer.js), [unit tests](../../test/unit.test.mjs), [multiplayer tests](../../test/multiplayer.test.mjs), [prism browser tests](../../test/e2e/spot-prism.spec.mjs), [desk browser tests](../../test/e2e/vj-desk.spec.mjs), [README](../../README.md) and [agent instructions](../../.github/copilot-instructions.md). They predate this review and were preserved. The site was already deployed with those changes.

The production bundle and service worker had been byte-compared against the deployment immediately before the assignment. This review rebuilt the same hashes and subsequently inspected a browser executing `app-c50eac81e034.js`. An initially reused browser was executing the older `app-7af823d6d457.js`; its statistics were discarded. A matching application hash does not prove the independently deployed Worker matches this worktree. The Worker was not redeployed or exhaustively fingerprinted.

### Architecture and installed toolchain

This is a client-side Babylon.js 9.28.0 WebXR venue, not a native game engine project. Development files are classic scripts publishing to `window`; an eleven-layer VRClub inheritance chain and mixins implement the venue. The builder derives the production IIFE order from HTML. Factories and loaders own shared materials, lights, textures and downloaded-model caches. Separate controllers own choreography, beat analysis, lighting composition, wardrobe, social presence and live input. Cloudflare Workers/Durable Objects provide relay, SFU authorization, event coordination and optional account services.

QuestDev uses isolated development routing, database, avatar storage and SFU configuration. Free development VR does **not** authorize the production account-owned simulated room. The important source contracts are in [the architecture instructions](../../.github/copilot-instructions.md), [development configuration](../../worker/wrangler.dev.jsonc), [development entry](../../worker/src/dev-index.js), [build](../../scripts/build.mjs) and [scaling runbook](../SCALING.md).

Installed versions recorded: Node 26.13.0; npm 11.7.0; glTF Transform core/extensions/functions 4.5.0; Playwright 1.63.0; esbuild 0.28.2; ESLint 10.11.0; IWER 2.5.0; jose 6.2.12; meshoptimizer 1.3.0; sharp 0.35.5. `npm ls` also reported extraneous `@emnapi/runtime`, `@img/sharp-wasm32` and `tslib`. No dependencies were changed. Babylon remains the pinned vendored runtime; an installed offline optimizer is not a runtime decoder.

### Method and evidence vocabulary

Seven separate read-only specialist agents produced independent assessments. They simulate professional perspectives; they are **not seven human professionals auditioning the venue**. The coordinating reviewer challenged suspected defects and consolidated corrected results. Independent priorities are retained where meaningful; the final roadmap resolves disagreement rather than manufacturing consensus.

Every claim uses one of these meanings:

- **VERIFIED IN CODE**: a concrete implementation, omission or reproducible source behavior. Not proof of perceived quality.
- **OBSERVED IN RUNTIME**: something seen in the browser during this review.
- **MEASURED**: numerical output with the device, environment and scenario identified.
- **DOCUMENTED HISTORICAL RESULT**: a previous capture/test, not a new measurement of this build.
- **REASONED HYPOTHESIS**: a credible design concern or proposed improvement, not a shipped defect.
- **REQUIRES PHYSICAL TESTING**: controller feel, headset comfort, stereo quality, audibility or performance unavailable here.

Confidence is an integer out of ten about the **stated finding**, not a probability that an untested product works. Scores below eight are explained. N/A means evidence is insufficient; it does not mean zero. Proposed acceptance thresholds are commissioning targets, not achieved results.

### Documentation and historical findings

The review examined [README](../../README.md), [BACKLOG](../../BACKLOG.md), [Quest packaging/access](../QUEST.md), [Quest rendering review](../QUEST_RENDERING_REVIEW.md), [performance baseline](../PERFORMANCE_BASELINE.md), [VJ guide](../VJ_CONTROLS_GUIDE.md), [scaling](../SCALING.md), [earlier immersion review](../IMMERSION_REVIEW_2026-09-18.md), [October review](../REVIEW_2026-10-14.md) and [hyperrealism/performance decision](../DESIGN_DECISION_HYPERREALISM_VS_PERFORMANCE.md).

| Historical item | Current assessment |
|---|---|
| Missing bar, entrance, street or balcony | Implemented; not recommendations to build them again |
| Visible blue remote capsules | Bodies now retain assigned appearances; loading colliders are invisible |
| One undifferentiated crowd dance | Authored repertoire and kick/rhythm/free-state choreography exist |
| No local character body / no planar mirror | Self/mirror embodiment and planar mirror exist; physical stereo still needs audition |
| Bad sharpen brightness gain; desktop SSR/SSAO in Quest setup | Corrected paths exist; do not propose the previous fix again |
| Light/shader churn, per-frame exposure notifications | Existing slot discipline and non-notifying exposure writes are strengths |
| Row skipping, overbright prism, overly subtle aesthetic peaks | Recent changes address these; regression/audition remains valuable, not proof of remaining defects |
| Uploaded avatars always local-only | Outdated: explicit room sharing now exists, subject to capability and visibility rules |
| Avaturn/avatar.me wardrobe service | No integrated external editor demonstrated; local tint/accessory editing is not a service wardrobe API |
| RTMP/Tribe ingest | Still an experimental capability gap, [BACKLOG:114](../../BACKLOG.md#L114), not a broken implemented feature |
| Offline catalog avatars | Direct URL Babylon source loading still bypasses downloaded-model persistence/deadlines; see C04 |
| Environment CDN outage | Environment is same-origin and shipped; do not repeat the old CDN defect |
| Safe stereo performance optimization | Still open; black multiview frames are invalid evidence |
| VJ guide defaults / haptics / acoustics | Stale: guide says comfort defaults on, no controller vibration and spatial acoustics pending, while current policies differ |
| Prior percentage FPS claims | Not adopted; historical estimates without reproducible measurements cannot justify optimization priorities |

## 2. Executive summary

**Verdict: a technically ambitious, coherent development nightclub, not yet a demonstrated premium standalone-Quest release.**

The strongest achievement is integration: music, authored lighting, crowd movement, real venue circulation, identity and multiplayer use shared state rather than independent demos. AESTHETIC is a worthwhile alternative to a constant peak show. The entrance/street transition, working bar, balcony, restroom, mirror and distinct staff roles provide a credible club journey.

The largest concern is **evidence debt**, not a lack of visual features. There is no current worn-headset certification for this build, no representative real 32-person media rehearsal and no calibrated DJ/audio audition. A previous Quest 3S capture was far outside native 72 Hz; it cannot be relabelled as the current result, but it is too serious to dismiss because tracking felt smooth.

There are also specific actionable defects/gaps:

1. The development `000032` journey is incompatible with the development authentication/configuration contract. Ordinary Online joining works; the owner-only simulation path does not.
2. Catalog-avatar URL loading does not share the bounded persistent loader used for equipment models.
3. Uploaded-avatar deletion is best-effort without demonstrated durable retries/reconciliation.
4. Reconnect schedules are bounded but deterministic, encouraging synchronized recovery after a shared outage.
5. `FrameStats.reset()` does not clear its stall count, contaminating later measurement windows.

The next iteration should prioritize reliable entry, believable embodiment, professional live-operation confidence and valid stereo performance. Add **authored variation and useful social agency**, not more render passes or decorative controls.

## 3. Overall scorecard

These are implementation/product-readiness judgments, not experimentally validated user ratings.

| Area | Score / 10 | Confidence / 10 | Reason |
|---|---:|---:|---|
| Architecture and defensive engineering | 8 | 8 | Shared authorities, ownership, schema constraints and extensive tests; globals and distributed teardown remain maintenance risks |
| Lighting authorship and VJ credibility | 8 | 8 | Cue structure, negative space, musical timing, presets, practical operator controls and common flash arbitration |
| DJ performance workflow | 7 | 8 | Real external-mixer workflow and confirmed SFU publication; operator recovery, cue assumptions and audience assurance need rehearsal |
| Spatial-audio implementation | 8 | 8 | Unified graph, corrected handedness, pre-spatial analysis and venue-dependent acoustics |
| Audible acoustic realism | N/A | N/A | No calibrated headphone/interface audition or measured end-to-end latency |
| Venue/asset engineering | 8 | 8 | Measured layout, merged geometry, fitted assets and detailed attribution |
| Photorealistic presentation | 6 | 6 | Industrial construction and stylized people/effects are not photorealism; close-view and stereo evidence is incomplete |
| Immersion design | 7 | 7 | Strong arrival/role/body loops; discoverability, finite choreography and access friction can interrupt presence |
| Interaction/accessibility readiness | 7 | 7 | Seated/height/comfort support is real; physical reach, disabled-user testing and comprehension are unproven |
| Multiplayer protocol engineering | 8 | 8 | Server authority, blocks, admission, separate event audio and synthetic/media separation |
| Live-event operational readiness | 6 | 8 | Implemented coordination is not provider/venue rehearsal; retention and recovery need work |
| Current Quest 3S frame pacing | N/A | N/A | Historical captures exist, but no worn measurement of this review build |
| Premium release readiness | 6 | 8 | Several release gates remain unverified and the dev owner test path is blocked |
| Overall development experience | 7 | 8 | Substantial coherent capability; polish alone cannot close hardware/operations evidence gaps |

## 4. Seven independent expert reviews

### Reading the independent recommendation records

Each row is a finding record with its own ID, priority, confidence, evidence/source, user consequence, proposed approach and acceptance/validation. Category is the specialist heading. `Cxx` links to the detailed consolidated record, which supplies effort, performance impact, dependencies and trade-offs for that implementation. Where several reviewers propose the same engineering work, those shared implementation fields are deliberately recorded once. Non-consolidated exploratory ideas explicitly state their effort/performance/trade-offs.

Priorities are **P0 critical**, **P1 high-impact immersion/reliability**, **P2 refinement**, **P3 experiment**. A recommendation to validate a feature does not mean it is absent. Physical-test recommendations cannot honestly have a completed perceptual acceptance result.

### 4.1 Professional nightclub DJ perspective

**Assessment:** credible as a destination for a DJ using an external mixer/interface; not a replacement for two-deck DJ software. Score **7/10**, confidence **8/10**: below eight because audience reception, monitoring and recovery have not been professionally auditioned.

**Strongest:** explicit private input test, stereo/48 kHz preference, disabled speech processing, clipping meters, deliberate publish, event-owned feed and reactive booth performer. Existing transport, seek, FX and channel crossfader are real. `LiveAudioClient.publish()` awaits SFU negotiation and checks the published slot: [liveAudioClient:156](../../js/liveAudioClient.js#L156), [sfuClient:157](../../js/sfuClient.js#L157).

**Weakest:** operational confidence during an outage, browser/interface compatibility and the distinction between a visual headphone-cue animation and a private audio cue bus. The external mixer is expected to supply professional cueing. A professional can enjoy the social destination without expecting the virtual console to replace their decks.

**Three best improvements:** real performer/listener recovery rehearsal; audience emergency silence without full teardown; an interface/monitoring checklist with actual reception/quality telemetry.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 DJ-01 | P0 / 8 | REQUIRES PHYSICAL TESTING; [liveAudioClient:88](../../js/liveAudioClient.js#L88), [liveInput:194](../../js/liveInput.js#L194). Outages can undermine performer confidence despite bounded recovery. | C03/C10: interrupt Wi-Fi, restore it, suspend/resume and unplug input. State must accurately indicate interruption; recover at most one publisher and no house-set takeover. |
| 2 DJ-02 | P1 / 8 | VERIFIED IN CODE + REASONED HYPOTHESIS; [liveInput:226](../../js/liveInput.js#L226), [broadcaster:41](../../broadcast/broadcast.js#L41). Stop releases capture rather than keeping a silent program connection. | C10: evaluate an explicit audience mute that retains private meters/session. Measure listener silence/recovery; make accidental mute unmistakable. |
| 3 DJ-03 | P1 / 8 | REQUIRES PHYSICAL TESTING; [broadcaster:154](../../broadcast/broadcast.js#L154). Input peaks do not establish audience bitrate, loss or latency. | C03/C10: advanced quality panel and listener confirmation. Controlled congestion must correlate with reported stats; do not label RTC RTT as one-way latency. |
| 4 DJ-04 | P1 / 9 | VERIFIED IN CODE; [broadcast HTML:13](../../broadcast/index.html#L13), [liveInput:25](../../js/liveInput.js#L25). Browser input assumes externally supplied cue/program monitoring. | C10: document and audition two interfaces, hardware cue and loopback. No program feedback at defaults; headphone cue stays private. |
| 5 DJ-05 | P1 / 8 | VERIFIED IN CODE; [liveInput:105](../../js/liveInput.js#L105). Channel/clipping meters exist, but device loss and actual format require real hardware. | C10/C14: test stereo, mono, channel reversal and unplugging. Show actual format and useful error; never silently substitute a different input. |
| 6 DJ-06 | P2 / 8 | VERIFIED IN CODE; [desk:61](../../js/vjDesk.js#L61), [transport:3320](../../js/club/10-ui.js#L3320). Existing program transport is not two-deck preparation. | C08/C12: clarify “program player” versus external live input; audition seek/source changes with host authority. Preserve finite-source transport and live-stream disabled states. |
| 7 DJ-07 | P2 / 7 | REASONED HYPOTHESIS; [DJ performer:106](../../js/djPerformer.js#L106). Timed gaze/wave/drop gestures provide ambience, not meaningful performer/audience dialogue. | C17: introduce limited audience feedback using existing social actions. Test that performers can identify reactions without intrusive overlays or manufactured crowd enthusiasm. |
| 8 DJ-08 | P2 / 8 | REQUIRES PHYSICAL TESTING; [desk controls:72](../../js/vjDesk.js#L72). Knob reach, wrist rotation and head posture cannot be scored from a mouse. | C01/C09: rehearse seated/standing, both hands, near-touch and ray; log misses and fatigue. Keep desk-only haptics and current hold ownership. |
| 9 DJ-09 | P3 / 9 | VERIFIED IN CODE capability gap; [BACKLOG:114](../../BACKLOG.md#L114). Tribe RTMP is not integrated. | Prototype only after demand: authorized ingest bridged to event audio, rotating secrets, admission and measured latency. XL effort/server cost; not a mandatory client-deck rewrite. |
| 10 DJ-10 | P3 / 7 | REASONED HYPOTHESIS; external-mixer workflow above. A browser cue bus may help some DJs but adds device/feedback risks. | Study opt-in private prelisten only if hardware workflow proves insufficient. L/XL effort; extra routing/permissions. Two interfaces must prove private cue and no feedback before adoption. |

**Real-world needs:** a practising DJ, two physical interfaces, stereo and mono sources, headphones, one listener on Quest, one desktop listener, 20-minute set, failure/recovery and listener confirmation. DJ enjoyment and cue quality remain N/A until that audition.

### 4.2 Professional VJ / nightclub lighting designer perspective

**Assessment:** substantially more credible than generic bass-reactive lights. Score **8/10**, confidence **8/10** for authorship; repertoire variation **7/10**, confidence **8/10**, because finite phrase/program structures can reveal recurrence. Physical glare/comfort **N/A**.

**Strongest:** authored movements/set-pieces, fixture ownership, paired-row symmetry, cue-local sweep timing, quiet wall accompaniment, single-colour AESTHETIC, hand-back policy and presets. The shared room-wide flash governor already arbitrates moving-head shutter, strobe bank and Warehouse wall: [core:1468](../../js/club/01-core.js#L1468), [fixtures:729](../../js/club/08-animation-fixtures.js#L729), [finish:165](../../js/club/09-animation-finish.js#L165), [LED:1419](../../js/ledPatterns.js#L1419).

**Weakest:** long-set artistic recurrence, explicit manual downbeat/phrase intervention and real multi-client audition. Automatic autocorrelation, phase votes and rhythm coherence already exist; they should not be replaced with a fashionable detector.

**Three best improvements:** commission the current show in a headset; author longer contextual variation; add narrow phrase-safe manual intervention without competing clocks.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 VJ-01 | P1 / 8 | VERIFIED IN CODE control limitation; [tap tempo:1014](../../js/vjDirector.js#L1014), [BPM:1044](../../js/vjDirector.js#L1044). Tempo adjustment is not an explicit bar/downbeat reset. | C12: provide a quantized bar-reanchor action only after phase-discontinuity tests. At 60/120/180 BPM, selected boundary and cue/LED transitions must agree within one rendered frame after commit. |
| 2 VJ-02 | P0 / 9 | VERIFIED IN CODE strength; shared governor above and [mutation tests:7452](../../test/unit.test.mjs#L7452). A future source could bypass an existing safety invariant. | C13: preserve, instrument and extend the existing gate, never create a second governor. Removing any supported source's claim must fail its regression. |
| 3 VJ-03 | P1 / 8 | VERIFIED IN CODE + REASONED HYPOTHESIS; [aesthetic shapes:1280](../../js/ledPatterns.js#L1280). Eight phrase-selected programs are finite; perceived repetition is not yet measured. | C11: contextual alternate banks, not continuous randomization. A 30-minute authored audition must avoid unintended repeat tuples while keeping deliberate reprises. |
| 4 VJ-04 | P1 / 7 | REASONED HYPOTHESIS; [rhythm confidence:620](../../js/vjDirector.js#L620), [set-piece decision:294](../../js/showDirector.js#L294). Accepted tempo can still begin on the wrong musical phrase. | C11: expose existing confidence and test high-consequence cue gating. Ambiguous intros/halftime must not force dramatic events on weak confidence; ordinary movement continues. |
| 5 VJ-05 | P2 / 8 | VERIFIED IN CODE design choice; [desk:89](../../js/vjDesk.js#L89), [held state:125](../../js/showDirector.js#L125). Simple desk intentionally omits a touring cue stack. | C12: study optional queued recall/release, not unconditional desk clutter. Current/pending cue must be clear; cancel prevents commit and host gates remain effective. |
| 6 VJ-06 | P0 / 8 | REQUIRES PHYSICAL TESTING; [peak look:196](../../js/showDirector.js#L196), [shape smoothing:1296](../../js/ledPatterns.js#L1296). Numeric peak/prism normalization is not perceived luminance. | C01/C13: audition peak wall, white/saturated prism, shutter and smoke. Record glare, contrast and pacing; no comfort or exposure certification from software alone. |
| 7 VJ-07 | P1 / 8 | DOCUMENTED HISTORICAL RESULT, VERIFIED IN CODE; [prism test](../../test/e2e/spot-prism.spec.mjs), [row clock](../../js/club/08-animation-fixtures.js). Recent normalization/timing changes must remain protected. | C11/C13: preserve rendered prism energy and forward row cadence tests across slow frames and speed changes; no duplicate rapid steps or new flash source. |
| 8 VJ-08 | P1 / 7 | VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [shared sequence:1423](../../js/multiplayer.js#L1423), [sequence correction:1558](../../js/multiplayer.js#L1558). Local clock correctness does not prove simultaneous remote cue landing. | C03/C18: measure host/follower error with jitter, stale frames and recovery. Establish a baseline before proposing protocol additions already present. |
| 9 VJ-09 | P2 / 8 | VERIFIED IN CODE; [preset capture/recall:88](../../js/lightingPresets.js#L88). Snapshot recall intentionally differs from phrase cueing. | C12: consider optional quantized recall separate from existing instant recall. Do not add music, ownership, beat history or Safe Mode to preset storage. |
| 10 VJ-10 | P2 / 7 | REASONED HYPOTHESIS; [look composition](../../js/showDirector.js), [abstract programs:1288](../../js/ledPatterns.js#L1288). Dense smoke with recurrent rig combinations may flatten emotional contrast. | C11/C16: commission silhouette/full-room passages against restrained intervals and hue history. Acceptance is a blinded long-set preference/comfort audition, not “more light everywhere.” |

**Real-world needs:** 30-minute musical set with sparse intro, syncopation, vocal break, sustained peak, silence, manual takeover and two listeners. Review static-down/inward/down sweep readability, prism colour, smoke silhouettes and every Safe Mode transition.

### 4.3 Senior WebXR / Babylon.js engineer perspective

**Assessment:** strong engineering discipline but insufficient current hardware evidence. Overall **6/10**, confidence **7/10** for standalone release engineering, below eight because physical pacing and retained resources remain incompletely demonstrated. Architecture alone scores eight; current physical performance is N/A.

**Strongest:** no per-frame material freeze/unfreeze, stable light slots, shared opaque imports, preallocated animation math, bounded equipment downloads, camera-mode isolation, scene readiness barriers and diagnostics that explicitly omit GPU timing.

**Weakest:** many static submissions in stereo; direct avatar URL loading outside cache/deadline infrastructure; distributed resource ownership; a small but concrete recorder-reset defect. The source does construct a separate XR pipeline; recommending one as if absent would be wrong.

**Three best improvements:** current worn-device release gate; measure/consolidate opaque work without changing the club; bring catalog-avatar loading under the existing bounded ownership/cache mechanism.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 ENG-01 | P0 / 10 | DOCUMENTED HISTORICAL RESULT + REQUIRES PHYSICAL TESTING; [baseline:195](../PERFORMANCE_BASELINE.md#L195). Old 48-58 ms frames do not certify this build. | C01: current stereo, thermal, all-tier capture before premium readiness claims. Reject black output; record app frames separately from compositor smoothness. |
| 2 ENG-02 | P1 / 9 | VERIFIED IN CODE policy; [tier detection](../../js/club/01-core.js), [startup policy:228](../PERFORMANCE_BASELINE.md#L228). Ultra is an owner choice, not a native-72 guarantee. | C01/C08: preserve override/default, offer evidence-based over-budget advice and opt-in adaptation. No unrequested forced downgrade or claim Balanced is proven safe. |
| 3 ENG-03 | P1 / 8 | DOCUMENTED HISTORICAL RESULT; [render loop:217](../../js/club/02-lifecycle.js#L217), [isolation:211](../PERFORMANCE_BASELINE.md#L211). Animation savings alone cannot explain old dominant constant cost. | C06: measure current opaque submission; consolidate/cull only with same-route visual equivalence and authoritative interactions retained. |
| 4 ENG-04 | P1 / 8 | VERIFIED IN CODE; [XR pipeline:714](../../js/club/02-lifecycle.js#L714). Existing XR image processing still has measurable cost. | C07: A/B each pass on hardware; retain exposure/sharpen gain and dark-gradient dithering unless evidence justifies change. |
| 5 ENG-05 | P0 / 9 | VERIFIED IN CODE; [catalog loader:1732](../../js/club/11-audio-crowd.js#L1732), [wardrobe load:215](../../js/avatarAppearance.js#L215). URL-based catalog sources lack the equipment loader's persistent body-deadline path. | C04: reuse caching/fetch helpers, preserve source-container sharing and generation guards. Test stalled body, offline warm assets and concurrent loads. |
| 6 ENG-06 | P2 / 10 | VERIFIED IN CODE, reproduced; [reset:29](../../js/frameStats.js#L29), [stall increment:48](../../js/frameStats.js#L48). Clean windows retain prior stalls. | C19: clear the count at reset; one stall then reset/16 ms clean frame must report zero new stalls without changing percentiles. |
| 7 ENG-07 | P2 / 8 | VERIFIED IN CODE; [probe:505](../../js/club/03-rendering.js#L505). A render-once probe has startup/retained-resource cost, not a continuous full-scene pass. | C06: explicit contributors and tier capture limits; maintain render-once behavior and compare reflectivity/blackout states. |
| 8 ENG-08 | P1 / 8 | VERIFIED IN CODE ownership complexity; [dispose:981](../../js/club/02-lifecycle.js#L981). Extensive teardown is spread across shared/borrowed/owned resources. | C09/C06: repeated lifecycle accounting before new abstraction. Twenty create/enter/exit/dispose cycles must plateau, with no shared material disposed while in use. |
| 9 ENG-09 | P2 / 9 | VERIFIED IN CODE strength; [model loader:375](../../js/modelLoader.js#L375), [texture loader:105](../../js/textureLoader.js#L105). Existing deadlines/quota degradation deserve protection, not reimplementation. | C04: test fingerprint replacement, offline fallback, body timeout and quota failure for each source type; one download per concurrent URL. |
| 10 ENG-10 | P2 / 8 | DOCUMENTED HISTORICAL RESULT + VERIFIED IN CODE; [effect inventory:158](../PERFORMANCE_BASELINE.md#L158). Overdraw is a secondary budget, not a proven present bottleneck. | C06/C07: track blended draws, capacities and screen coverage as proxies; optimize only if physical A/B identifies a real cost. |

**Real-world needs:** current Quest 3S, optional Quest 3 comparison, visible stereo validation, supported GPU tools, same build/pose/tier A/B, 15-minute thermals, uploaded models and a real multi-client view. Neither native 72 Hz nor a GPU bottleneck can be inferred from emulator timing.

### 4.4 Senior 3D environment artist perspective

**Assessment:** venue/asset construction **8/10**, confidence **8/10**; physical close-view realism **N/A**. The specialist did not view runtime captures. The concern is how existing detail reads, not a fabricated absence of bar variation, brackets or shadows.

**Strongest:** basement arrival, measured stair/deck/seat relationships, coherent industrial language, working staff roles, licensed assets, one-atlas bar variation and merged support geometry.

**Weakest:** repeated construction and saturated emission may make materials feel procedural; the outdoor scene deliberately omits real shadow reception; close-view stylized people cannot become photographic simply by adding polygons.

**Three best improvements:** tune existing practical/material readability; test current scale/contact grounding; remove obvious tiling using existing UVs/vertex colours rather than more meshes.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 ART-01 | P1 / 8 | REASONED HYPOTHESIS; [effect/dimmer:111](../../js/club/06-effects.js#L111), [scoped practicals:217](../../js/venueDressing.js#L217). Saturation may hide roughness, faces and edges. | C16/C13: tune existing materials/scoped practicals, not a new broad real light. Safety surfaces stay readable; master-zero remains intentional blackout except practicals. |
| 2 ART-02 | P2 / 7 | REASONED HYPOTHESIS; [steel:108](../../js/mezzanine.js#L108), [floor:35](../../js/club/04-environment.js#L35). Regular motifs can reveal procedural construction. | C16: inspect normal viewpoints; vary UV phase/vertex masks only where repetition is visible. No new draw or high-resolution texture required. |
| 3 ART-03 | P2 / 6 | REASONED HYPOTHESIS; [furniture:648](../../js/venueDressing.js#L648), [city:124](../../js/cityDistrict.js#L124). Existing grounding may read poorly without real shadows. | C16/C09: check gaps/penetration before correction; prefer transform/AO fixes to per-prop shadow generators. Seating and routes must remain clear. |
| 4 ART-04 | P2 / 8 | VERIFIED IN CODE strength + REASONED HYPOTHESIS; [mezzanine supports:133](../../js/mezzanine.js#L133), [mounts:399](../../js/club/05-fixtures.js#L399). Hardware exists but can disappear into darkness. | C16: local roughness/contrast emphasis only where audition shows unreadable support; preserve silhouette and circulation. |
| 5 ART-05 | P2 / 9 | VERIFIED IN CODE strength; [bottle profiles:39](../../js/barProps.js#L39), [atlas:101](../../js/barProps.js#L101), [placement:240](../../js/barProps.js#L240). Many variants exist; visible distribution may cluster. | C16: tune existing seeded arrangement, not another bottle system. Preserve one stock draw, bartender reach and descriptive non-brand labels. |
| 6 ART-06 | P2 / 7 | REASONED HYPOTHESIS; [restroom plan:53](../../js/venueDressing.js#L53), [art:23](../../js/restroomArt.js#L23). Close rooms expose material/edge inconsistency. | C16: test porcelain, metal, grout, mirror edge and localized wear; keep sparse art and opaque imports. No generic “more dirt” pass. |
| 7 ART-07 | P1 / 7 | REASONED HYPOTHESIS; [beam construction:111](../../js/club/06-effects.js#L111). Existing analytical optics/shell depth do not prove every interior occluder behaves convincingly. | C13/C16: inspect origin, wall/deck occlusion and termination; only add clipping where a reproducible leak is observed. Avoid per-frame scene raycasts. |
| 8 ART-08 | P1 / 7 | REASONED HYPOTHESIS; [styles:102](../../js/characterStyles.js#L102), [details:3](../../js/avatarDetails.js#L3). Role/readability matters more than texture detail. | C17/C16: tune silhouette, wardrobe contrast and gaze using existing metadata. Recognize staff roles from 3-8 m without forced smiles or exaggerated poses. |
| 9 ART-09 | P1 / 9 | REQUIRES PHYSICAL TESTING; [venue measurements:13](../../js/venueDressing.js#L13), [mezzanine:13](../../js/mezzanine.js#L13). Correct dimensions are not proof of comfortable reach/scale. | C01/C09: measure bar, seats, rails, controls and eye height physically. Record deliberate stylization instead of guessing corrections. |
| 10 ART-10 | P2 / 9 | VERIFIED IN CODE/documentation; [attribution](../../ASSETS.md), [art builder](../../scripts/build-restroom-props.mjs). Replacement/branding can invalidate provenance. | C20/C16: preserve source/licence/version/change notices and optional-brand permissions. Every replacement must retain visible CC BY attribution and source hashes where required. |

**Real-world needs:** matched standing/seated close views, neutral and saturated looks, booth, bar, stair and restroom. Do not create human facial expressions or replace the lightweight cast solely to chase “hyperrealistic” marketing.

### 4.5 Professional spatial-audio engineer perspective

**Assessment:** architecture **8/10**, confidence **8/10**; acoustic-model calibration **7/10**, confidence **7/10** because constants, reverb character and interface/headphone translation need audition. Audible quality and measured live latency **N/A**.

**Strongest:** unified local/network PA graph, real pre-effect detector taps, handedness correction, separate sub, entrance/street filtering, room returns, booth/height zones and explicit ambience gain. Real browser localization tests exist; “there are no graph/audio tests” would be inaccurate.

**Weakest:** procedural random IR hampers reproducible tuning; summed headroom has not been certified; ducking includes crowd/reverb via the common compressor bus. That is a mix policy to evaluate, not necessarily a bug.

**Three best improvements:** digital headroom/transfer-function fixtures; deterministic reproducible room response; calibrated route/interface audition with repeated source replacement.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 AUD-01 | P1 / 8 | VERIFIED IN CODE + REASONED HYPOTHESIS; [compressor/master:242](../../js/club/11-audio-crowd.js#L242), [spatial gains:939](../../js/club/11-audio-crowd.js#L939). A compressor followed by gain is not proof of a digital peak ceiling. | C14: measure worst-case summed peaks and choose a ceiling before adding a limiter. No claim about dangerous physical SPL is justified without device calibration. |
| 2 AUD-02 | P2 / 9 | VERIFIED IN CODE; [IR:296](../../js/club/11-audio-crowd.js#L296). `Math.random()` changes response each context. | C15: seeded generation or a verified IR; repeated impulse renders must have stable peak, decay, spectrum and channel correlation. |
| 3 AUD-03 | P2 / 8 | VERIFIED IN CODE architecture + REASONED HYPOTHESIS; [sends:707](../../js/club/11-audio-crowd.js#L707), [acoustic controls:877](../../js/club/11-audio-crowd.js#L877). Shared source filtering couples direct/early/late sound. | C15: independently measure delay and convolution before splitting sends. Stair/street returns must follow intentional enclosure curves with no full-band tail leak. |
| 4 AUD-04 | P2 / 8 | VERIFIED IN CODE test gap; [mono input:203](../../js/club/11-audio-crowd.js#L203). Explicit mono is legitimate; portability should be measured. | C14: left-only/right-only/opposite-phase fixtures must match documented downmix semantics; do not rewrite standards-compliant mixing without a failing case. |
| 5 AUD-05 | P2 / 9 | VERIFIED IN CODE mix policy; [crowd path:577](../../js/club/11-audio-crowd.js#L577), [duck bus:263](../../js/club/11-audio-crowd.js#L263). Ducking attenuates ambience and room returns too. | C15: audition/document whole-room versus isolated-music ducking. If isolation is chosen, fixtures prove unrelated ambience gains remain unchanged. |
| 6 AUD-06 | P1 / 8 | VERIFIED IN CODE strength + REASONED HYPOTHESIS; [remote cleanup:751](../../js/club/11-audio-crowd.js#L751). Cleanup exists; repeated replacements may expose ownership edges. | C09/C03: 100 replace/stop/reconnect cycles leave one branch and no retained consumer elements; borrowed tracks are not stopped by the wrong owner. |
| 7 AUD-07 | P1 / 8 | REQUIRES PHYSICAL TESTING; [live client:88](../../js/liveAudioClient.js#L88). A live socket is not audible-track continuity. | C03/C10: exercise ended/muted/unplugged tracks and publisher restart; indicate interruption, retain event semantics and never fabricate analysis or a house-set fallback. |
| 8 AUD-08 | P1 / 8 | REQUIRES PHYSICAL TESTING; [audio coordinate helper:27](../../js/audioUtils.js#L27), [listener:812](../../js/club/11-audio-crowd.js#L812). Correct pan math does not establish headphone/image quality. | C01/C15: matched interface/headphone route audition; verify visible-side dominance, sub continuity, head turns and voice intelligibility. |
| 9 AUD-09 | P2 / 8 | VERIFIED IN CODE acoustic zones; [spatial update:877](../../js/club/11-audio-crowd.js#L877). Smooth parameter curves still need transfer-function and perceptual checks. | C15: sample stair in 10 cm increments, deck/bar/restroom and door distances; no unintended gain/cutoff jumps or double reverberation. |
| 10 AUD-10 | P2 / 9 | VERIFIED IN CODE existing tests; [spatial browser test:19](../../test/e2e/audio-spatial.spec.mjs#L19). Audible localization is covered, not every topology/maximum state. | C14/C15: extend targeted graph fixtures rather than add a second analysis system. Count connections, measure peak/IR/duck/mono and stress replacement. |

**Real-world needs:** level-matched headphones, interface loopback, real signal probes, music/voice/crowd balance, occluded zones and provider-forwarded stream. RTC statistics cannot independently establish acoustic quality or one-way latency.

### 4.6 Senior VR experience / interaction designer perspective

**Assessment:** UX implementation **7/10**, confidence **7/10**; worn-headset usability **N/A**. Below eight because task density, access comprehension, imperfect rays and identity recovery have not had representative user testing.

**Strongest:** actual first-person body, mirror, seated lift, measured eye height, intentional furniture seating, world-locked paged menu, immediate room social actions and shared controls. Existing press feedback is present. Menu parenting and global haptics are not missing features.

**Weakest:** users must understand many access/source/appearance states; uploaded-model editing can be mistaken for service wardrobe selection; useful functions may be difficult to discover while immersed.

**Three best improvements:** short task-oriented orientation; optional calibration/mirror identity ritual; plain, tested private/shared upload and live-input status.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 UX-01 | P0 / 10 | VERIFIED IN CODE + OBSERVED IN RUNTIME; [network:310](../../js/networkClient.js#L310), [dev gate:5](../../js/paymentGate.js#L5). Dev `000032` reports an app-update error instead of a working authorized path. | C02: repair isolated owner preparation/authentication, not a bypass. Authorized owner succeeds; unverified/wrong owner and production cross-use stay denied. |
| 2 UX-02 | P1 / 7 | REASONED HYPOTHESIS; [immersive states:12](../../js/immersiveLaunch.js#L12), [payment states:637](../../js/paymentGate.js#L637). Preview/pair/verify/device/lease concepts can obscure the next action. | C08: user-test a single plain next action with fallback. Keep free-dev and production-account flows internally separate. |
| 3 UX-03 | P1 / 7 | VERIFIED IN CODE + REASONED HYPOTHESIS; [welcome:68](../../js/immersiveLaunch.js#L68). Locked first choice may look like failed input. | C08/C13: validate explanation/selection confirmation; preserve default policies and user choice, not an unsolicited comfort-mode change. |
| 4 UX-04 | P1 / 7 | REASONED HYPOTHESIS; [menu pages:1075](../../js/club/10-ui.js#L1075). Breadth creates memory/ray travel burden. | C08: measure task completion before simplifying Home; keep world-locked placement and stable Back/Close. Essential tasks within two selections from their Home destination. |
| 5 UX-05 | P1 / 8 | VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [button feedback:803](../../js/club/10-ui.js#L803), [pointer routing:2892](../../js/club/10-ui.js#L2892). Feedback exists; visibility/target tolerance is unproven on hardware. | C01/C08: imperfect aim, both hands and seated selection. Improve visual/audio feedback where observed; haptics remain desk-only. |
| 6 UX-06 | P1 / 8 | VERIFIED IN CODE policy + REQUIRES PHYSICAL TESTING; [comfort action:3551](../../js/club/10-ui.js#L3551). Smooth/teleport/turning semantics need comprehension. | C08: opt-in tutorial and visible current mode. Preserve off-by-default comfort, persistence, mutually exclusive locomotion and no unsolicited vignette. |
| 7 UX-07 | P1 / 8 | VERIFIED IN CODE; [height:7](../../js/playerHeight.js#L7), [estimation:67](../../js/playerHeight.js#L67). Floor calibration and seated lift can be confused with avatar stature. | C09: explain measured eye height, physical floor and standing avatar while seated; test short/seated/elevated cases without virtual-floor hacks. |
| 8 UX-08 | P1 / 7 | REASONED HYPOTHESIS; [appearance:60](../../js/avatarAppearance.js#L60), [mirror/self browser test](../../test/e2e/self-body.spec.mjs). Mirror can anchor identity but may go undiscovered. | C09/C17: optional invitation after avatar/calibration; test recognition and voluntary revisit, no forced toilet detour. |
| 9 UX-09 | P1 / 8 | VERIFIED IN CODE + REASONED HYPOTHESIS; [editor:192](../../js/avatarEditor.js#L192), [sharing page:1351](../../js/club/10-ui.js#L1351). Copy-retention wording exists but may be missed. | C09/C05: test private application, explicit room-share consent, cancel and truthful post-stop copy limitations. Never imply receiver-held copies can be recalled. |
| 10 UX-10 | P2 / 7 | REASONED HYPOTHESIS; [social actions:2802](../../js/club/10-ui.js#L2802), [DEV interaction test:78](../../test/e2e/dev-room.spec.mjs#L78). Actions exist; revisit/discovery value is not measured. | C17: task-based prompts and room bookmarks/event continuity; do not replace existing social actions with a parallel interaction model. |

**Real-world needs:** first-time/experienced users, seated and limited-reach participants, different heights, glasses/headwear, left/right-handed selection, privacy comprehension and 15-minute comfort. Accessibility support is not a claim of universal accessibility.

### 4.7 Multiplayer / live-event systems engineer perspective

**Assessment:** protocol authority **8/10**, confidence **8/10**; operational readiness **6/10**, confidence **8/10**, below eight because provider load, cleanup recovery and real participant performance are not established. SFU/headset capacity performance **N/A**.

**Strongest:** server allow-lists/sanitization, private-directory exclusion, owner checks, block-aware visibility, bounded GLBs, admission reservations, hashed capabilities, separate event audio and synthetic actors excluded from SFU membership.

**Weakest:** dev owner path incompatibility; lost cleanup retries; deterministic outage recovery; large-world claims that can outrun actual rehearsal. A room filled by 31 actors is useful render/presence testing, not 32 human sockets or media peers.

**Three best improvements:** durable avatar retirement; isolate/fix the dev owner journey; real 8/16/32 provider/headset rehearsal with accurate telemetry.

| Rank / ID | Priority / confidence | Evidence and user impact | Recommendation and acceptance |
|---|---|---|---|
| 1 NET-01 | P1 / 9 | VERIFIED IN CODE; [retire:148](../../worker/src/avatarAssets.js#L148), [alarm:448](../../worker/src/relay.js#L448). Delete failures log without avatar retry registration. | C05: persist retirement/reconcile records. Inject failure and restart; remove within declared policy window without deleting active assets. |
| 2 NET-02 | P0 / 10 | VERIFIED IN CODE + OBSERVED IN RUNTIME; [owner access:5](../../worker/src/devRoomAccess.js#L5), [dev config:27](../../worker/wrangler.dev.jsonc#L27). Free-dev VR does not create verified-owner identity. | C02: scoped development owner auth and preparation; never trust room code/header or reuse production entitlements. |
| 3 NET-03 | P2 / 10 | VERIFIED IN CODE; [synthetic occupancy:43](../../test/worker.test.mjs#L43). One owner + 31 actors + one SFU member is not real-user load. | C03/C20: report real/simulated/media counts separately in every capacity result. Preserve the valuable actor admission test. |
| 4 NET-04 | P0 / 9 | REQUIRES PHYSICAL TESTING; [capacity configuration](../../worker/wrangler.dev.jsonc), [scaling:64](../SCALING.md#L64). Admission limit does not guarantee usable 32-person media/rendering. | C03: staged 8/16/32 real clients; record join/media failure, bandwidth, frame/memory/thermal and shared-state behavior. |
| 5 NET-05 | P1 / 10 | VERIFIED IN CODE; [room retry:421](../../js/networkClient.js#L421), [live retry:86](../../js/liveAudioClient.js#L86). Deterministic exponential retries align after a common outage. | C18: bounded jitter with existing caps and terminal rules. Thirty-two simultaneous drops must distribute retry starts and retain no duplicate membership. |
| 6 NET-06 | P1 / 8 | REASONED HYPOTHESIS; [peer reset:384](../../js/networkClient.js#L384), [event expiry:132](../../worker/src/liveEvents.js#L132). New relay session can race capacity/reservation/expiry. | C03/C18: room-full, old-session cleanup and ticket-expiry scenarios; no stale peer, duplicated reservation or media member after three recovery cycles. |
| 7 NET-07 | P2 / 9 | VERIFIED IN CODE; [delete logging:148](../../worker/src/avatarAssets.js#L148). Operators lack durable pending age/attempt visibility. | C05: content-free cleanup counters and retry metadata; oldest age and failures auditable without model bytes or private identity logs. |
| 8 NET-08 | P1 / 8 | REASONED HYPOTHESIS; [remote construction:194](../../js/avatarManager.js#L194), [detail paths:260](../../js/avatarManager.js#L260). Thirty-two detailed/uploads may exceed memory/render budget. | C03/C06: measure allowed worst cases before any LOD policy. Preserve assigned identity; no surprise capsule or unrequested distance substitution. |
| 9 NET-09 | P2 / 8 | VERIFIED IN CODE regression risk; [show signature:1450](../../js/multiplayer.js#L1450), [phase:1558](../../js/multiplayer.js#L1558). New fields can miss capture/signature/relay/apply coverage. | C18/C12: canonical supported-field mutation tests for change, late join, stale recovery, promotion and Safe Mode. |
| 10 NET-10 | P0 / 9 | REQUIRES PHYSICAL TESTING; [SFU deadlines:100](../../js/sfuClient.js#L100), [rollout limitation:64](../SCALING.md#L64). Authorization smoke is not provider-forwarded sound. | C03/C10: publish a real program, receive it across overflow, rotate/revoke/end and verify cleanup. Record negotiation latency separately from media latency. |

**Real-world needs:** isolated dev provider resources, real sockets/listeners/publishers, mixed desktop/Quest clients, join churn, two-way blocks, voice audiences, overflow, owner rotation, visibility loss, uploaded models and provider cleanup. This is not a penetration test; no unverified exploit is alleged.

## 5. Runtime evaluation and reproducibility

### Automated checks run for this review

| Command / scope | Result |
|---|---|
| `npm run check` | PASS: 109 JavaScript files |
| `npm run lint` | PASS with one existing warning, no errors: [spot-rig:69](../../test/e2e/spot-rig.spec.mjs#L69), `prefer-const` |
| `node --test --test-reporter=dot` over every top-level `test/*.test.mjs` | Exit 0; 911 dot-reporter entries. The suite has an existing optional built-variant skip; dot output does not provide reliable pass/skip totals |
| `npm run build -- --branding=nocturne` | PASS; application/CSS/SW hashes match the inspected deployment |
| Native Quest signing | Not configured; web build warning is not a web build failure. No APK certification claimed |

Focused browser review command:

```powershell
npx playwright test budget.spec.mjs vr-session.spec.mjs audio-spatial.spec.mjs self-body.spec.mjs dev-room.spec.mjs perf-scenarios.spec.mjs --workers=1 --reporter=line
```

Browser results and captured-location outcomes are recorded in the final evidence addendum below. The full e2e suite was not run, and test existence is never substituted for a current pass.

### Live application observations

- Ordinary Online entry was exercised after acknowledging the safety guide. A temporary private room was joined and left successfully; welcome capacity was 32. No persistent public event or participant was created.
- `000032` produced **“Update the club app before joining DEV room 000032.”** Code explains this precisely: dev `VRPayment` has no preparation method, dev Worker refuses payments/admin routes and dev configuration lacks owner-enablement/identity setup. This is not general Online failure.
- The browser executed the rebuilt current application hash after reload. Navigation itself exceeded the integrated tool's ten-second timeout once, but the page subsequently loaded. Several model fingerprint HEAD requests were aborted; that alone is not evidence that the model body failed.
- Live desktop environment: VS Code integrated Chromium/Electron on Windows, Intel Arc via ANGLE/D3D11, viewport 844x554. This is neither SwiftShader e2e nor a Quest GPU.
- A current-build desktop sample had 526 retained frames, mean 55.42 ms, p50 51.8, p95 86.5, update mean 5.21 and submit mean 46.61 ms, while local browser validation was also running. **This is a contaminated workstation sample, not a performance baseline or a hardware conclusion.**
- Recorder `stalls` can include prior windows until C19 is fixed. Samples therefore cannot establish independent stall counts.

### Historical physical evidence, correctly bounded

[PERFORMANCE_BASELINE:195](../PERFORMANCE_BASELINE.md#L195) records a worn Quest 3S on 14 October:

| Historical scenario | Median / p95 app interval | Interpretation |
|---|---|---|
| Original Ultra | 59.1 / 66.5 ms | Far outside native 72 Hz |
| Native-scale valid Ultra | 51.7 / 57.7 ms | About 19.4 fps average on that captured route |
| High | 52.8 / 58.8 ms | No meaningful native-rate certification |
| Balanced | 48.4 / 53.3 ms | Faster on that route, still outside 13.89 ms at 72 Hz |
| Attempted multiview | Reported 28-31 ms, black display and GL error 1282 | **Invalid** black-frame throughput; rolled back |

The historical isolation put application updates near 1 ms, transparency/particles suppression below 1 ms median change, all characters around 2.5 ms and post-processing around 5 ms. The document attributes dominant constant cost to per-eye opaque submission. These are earlier-build attribution experiments, not a current GPU timer measurement or a promise that the same bottleneck remains dominant.

The 18 October policy restored fresh Quest 3/3S Ultra following the owner's practical report; no subsequent physical capture accompanied that change. Preserve that product choice while measuring the present build. Tracking/compositor reprojection can feel smooth even when the application updates slowly.

## 6. Cross-disciplinary experience assessments

### Hyperrealism

NOCTURNE is more defensibly described as **an immersive authored industrial nightclub** than as hyperrealistic. The environment has coherent dimensions, plausible materials, staff work, music direction and a real approach journey. Stylized character silhouettes, reused construction, emissive beam geometry and limited contact/shadow cues remain potential CG tells. The detailed wardrobe is not a universal solution: cloth fit, expressions, controller hands and conversational gaze determine realism at least as much as triangle count.

Large gains can come from material scale, nonuniform roughness, contact alignment and role readability using existing UVs/vertex data. Increasing texture size, adding shadows everywhere or painting generic smiles would increase cost or violate source-expression policy without demonstrating improved presence.

### Immersion and presence

The highest-value loops are arrival through a basement threshold, sound becoming enclosed, finding the dance floor, seeing one's own body, witnessing bartender/guest activity, controlling the booth and meeting people. Agency and coherent feedback matter more than another effect.

Likely breakers include access-path errors, frame pacing, body calibration/copy-status uncertainty, recurrent crowd/show combinations and interaction discovery. Only the dev-room error and specific technical gaps are verified defects; subjective breaker rankings require user testing.

### DJ and VJ authenticity

VJ credibility is strong: a shared beat grid, cue ownership, negative space, static-down/inward/down mirror sweeps, phrase-local movement, a common flash gate and presets resemble a composed show rather than random light activation. Recent row smoothing and prism normalization are appropriate refinements.

DJ credibility is conditional on product positioning. The live workflow receives an external mixer program; it does not need to duplicate professional mixing software. Visual headphone touching is not a cue bus. A reliable audience, private test, truthful publication state, monitoring instructions and emergency recovery are more important than virtual deck features.

### Performance and technical architecture

The render rules are unusually explicit, and tests encode past failures. The weaknesses are exceptions to shared ownership and the absence of current physical release evidence. Do not blame every transparent mesh or optimize already-cheap crowd JavaScript because it is easy to edit.

Start with same-build pass/subsystem measurements. Static material consolidation, visually safe district/portal culling and render-once capture discipline can preserve fidelity. A glTF decoder migration, module rewrite, multiview experiment or new render pass is not justified merely by fashion.

### Social atmosphere, crowd and multiplayer

Dancers already follow musical states with authored lag, variation and attention. Bartender, bar regular, mingler, rail watcher, queue and bouncer make the room less like a synchronized animation test. Simulated guests can rehearse presence but remain scripted and voice-free.

Human social quality depends on intelligible voice, stable identity, deliberate audiences, blocks, reachable gestures and reasons to remain together. Thirty-two admission slots and up to eight overflow rooms are coordinator limits, not measured human-scale guarantees. A repeated 17-look assignment pool is an explicit limitation; preserving identity matters more than promising uniqueness.

### Accessibility and safety

There is real support for seated mode, standing eye measurement, furniture poses, comfort locomotion and a photosensitivity choice before ordinary rendering. Safe Mode and the existing shared flash gate are strengths, not medical guarantees.

Validate legibility, imperfect rays, physical reach, eye-floor calibration, audio volume/headroom, flicker/contrast and thermal pacing with actual participants. Keep personal comfort/people/volume settings live under host control. No haptics outside the desk, no camera-parented menu and no unsolicited default-policy change are recommended.

Privacy requires truthful distinctions between local upload, room delivery, server deletion and recipient-retained copies. Durable server cleanup cannot promise erasure of somebody else's downloaded GLB. Keep report/block, private audience and host authority boundaries; this broad review does not claim a specialist exploit assessment.

### Artistic identity, physical objects, revisit value and product readiness

- **Identity:** restrained neon, industrial basement, deliberate silence/negative space and one-colour lighting are more distinctive than generic maximal effects. Optional ADE branding is a distribution choice with separate permissions, not a new default.
- **Physical objects:** stairs, seating, tabletop contacts and optical origins already use measured contracts. Close inspection should audit them, not presume they float.
- **Revisit:** saved identity, trusted live events, meaningful host/social actions and a show that sustains a long set are stronger return reasons than collectible decorative props.
- **Readiness:** suitable for development/testing with explicit limitations. Premium release requires hardware, operations and user evidence, plus resolving concrete reliability gaps.

## 7. Panel disagreements and resolutions

| Disagreement | Competing value | Resolution and reason |
|---|---|---|
| Artist requests neutral fill; VJ wants darkness | Faces/edges versus authored blackout and scarce light slots | Tune existing scoped practicals/materials/baked AO. No new broad real light; preserve master-zero show blackout and explicit safety practicals |
| VJ requests denser smoke; engineer wants less blended work | Silhouettes/envelopment versus potential fill cost | Commission existing dense passages first. Historical transparency delta was small; neither add particles nor remove smoke without current A/B evidence |
| Engineer proposes lower default; owner prefers Ultra | Frame budget versus desired detail/user agency | Keep Ultra/override. Measure all tiers and offer actionable opt-in adaptation; no tier currently earns an untested “safe72” label |
| Network reviewer proposes distance LOD; identity reviewer rejects substitution | Memory/GPU budget versus stable personal appearance | Measure worst cases first. Prefer shared geometry, serialized loads and offscreen pose holds; explicit LOD only with identity-preserving UX/product approval |
| DJ requests browser decks/RTMP; operator prioritizes external mixer | Feature breadth versus dependable program delivery | Commission external mixer and audience recovery first. RTMP/private cue remain demand-led P3 prototypes, not release blockers |
| VJ proposes cue queue; current desk intentionally stays simple | Touring operator control versus discovery/maintenance | Optional quantized recall/release, if task testing supports it; do not rebuild a dense console or bypass existing hand-back policy |
| UX suggests more prompts; splash must stay sparse | Discoverability versus first-paint overload | Optional in-club task tutorial/identity ritual, not extra splash fields or access paragraphs |
| Audio reviewer wants isolated music duck; social reviewer wants whole room quieter | Acoustic consistency versus voice intelligibility | Level-match and audition both policies; change graph only if benefit is measured. Existing whole-room duck is not inherently defective |
| Artist wants richer characters; engineer worries about 32 uploads | Close-view realism versus thermal/memory risks | Improve silhouette, garment fit, gaze and calibration before higher-poly assets; retain lightweight option and explicit upload limits |

Corrections made during panel review: standalone publication is correctly awaited; global flash arbitration already exists; XR has a separate pipeline; bar variants and structural supports already exist; network music teardown exists; ring percentiles do not require chronological sorting. None of these rejected claims appears as a confirmed defect below.

## 8. Consolidated findings

The following are implementation-ready records. Effort: S = roughly a focused change/test; M = several coupled surfaces; L = substantial subsystem or rehearsal work; XL = infrastructure/product expansion. These are relative planning sizes, not delivery commitments.

### C01 - Current worn-Quest commissioning gate

- **Category / priority / confidence:** release performance/comfort, **P0**, **10/10** confidence that evidence is missing.
- **Evidence:** DOCUMENTED HISTORICAL RESULT; REQUIRES PHYSICAL TESTING. [Physical baseline:195](../PERFORMANCE_BASELINE.md#L195), [render loop:217](../../js/club/02-lifecycle.js#L217), [frame recorder](../../js/frameStats.js).
- **Consequence / user value:** no current native-frame or sustained-comfort claim is supportable. Earlier poor intervals create a serious release risk.
- **Solution / approach:** execute the physical protocol in section 12 on the exact deployed hash; preserve owner defaults. Reject black/stale stereo frames and record compositor/app behavior separately.
- **Effort / performance:** L commissioning; no runtime cost. Enables evidence-led optimization rather than predicted FPS gains.
- **Risk / trade-off:** device time and possible release delay; preferable to treating reprojection as native rendering.
- **Acceptance / validation:** matched visible stereo runs for all tiers, 15-minute thermals, peaks, mirror, uploads and social views; current p50/p95/p99, missed frames, CPU, supported GPU metrics, memory and comfort observations documented. Declare chosen refresh target and inability to meet it rather than conceal it.
- **Dependencies:** exact build/equipment; C19 for independent stall windows.

### C02 - Isolated development owner-room journey

- **Category / priority / confidence:** functional blocker, **P0**, **10/10**.
- **Evidence:** VERIFIED IN CODE; OBSERVED IN RUNTIME. [dev payment stub:5](../../js/paymentGate.js#L5), [join requirement:305](../../js/networkClient.js#L305), [dev entry](../../worker/src/dev-index.js), [config:27](../../worker/wrangler.dev.jsonc#L27), [verified owner:5](../../worker/src/devRoomAccess.js#L5).
- **Consequence / user value:** an owner cannot exercise `000032` on the development deployment; the error implies an app version problem. Ordinary Online still works.
- **Solution / approach:** design a **development-only verified-owner session** and preparation route/configuration. Provide accurate unsupported/disabled status. Do not just add a client method or copy production account grants.
- **Effort / performance:** M/L because identity and server configuration are prerequisites, not a trivial flag; negligible frame cost.
- **Risk / trade-off:** accidental production trust crossover or weakened gate. Maintain separate database, provider, cookies and origins.
- **Acceptance / validation:** configured dev owner enters; missing verification, wrong owner, disabled flag, non-SFU and forged external header all deny. Ordinary rooms and production entitlements unchanged; test live dev deployment.
- **Dependencies:** scoped authentication decision and isolated Worker deployment. No auth change was made during review.

### C03 - Real participant/provider load certification

- **Category / priority / confidence:** event reliability/readiness, **P0**, **9/10**.
- **Evidence:** VERIFIED IN CODE; REQUIRES PHYSICAL TESTING. [synthetic test:43](../../test/worker.test.mjs#L43), [SFU publication:157](../../js/sfuClient.js#L157), [historical smoke limitation:64](../SCALING.md#L64).
- **Consequence / user value:** 32 admission slots and scripted actor tests do not establish usable human voice/music/avatar performance.
- **Solution / approach:** stage 8, 16, 32 real clients with dev SFU, a real program publisher, voice, worst permitted avatars, churn, two-way blocks and overflow. Report real sockets, synthetic actors, SFU members and publishers separately.
- **Effort / performance:** L; provider/device usage, no inherent client rendering addition.
- **Risk / trade-off:** expensive test coordination; limited pilot capacity may be necessary if evidence fails.
- **Acceptance / validation:** measured negotiation/join/cleanup latency and failure rates; publisher and listener audio actually forwarded; roles/blocks/revocation correct; headset pacing/memory/thermals recorded. Set operational limits from results, not from directory counts.
- **Dependencies:** C01 and provider resources; C02 only for owner simulation, not ordinary real-client rooms.

### C04 - Bounded persistent catalog-avatar sources

- **Category / priority / confidence:** loading reliability, **P0**, **9/10**.
- **Evidence:** VERIFIED IN CODE. [_loadAvatarSource:1732](../../js/club/11-audio-crowd.js#L1732) directly uses `SceneLoader.LoadAssetContainerAsync`; [wardrobe:215](../../js/avatarAppearance.js#L215) also reads URL sources. Compare [model caching:375](../../js/modelLoader.js#L375) and [body-deadline primitives](../../js/assetCache.js).
- **Consequence / user value:** warmed app-shell/equipment persistence does not ensure catalog bodies survive cold HTTP cache/offline startup. A stalled source does not have the explicit body deadline of shared equipment loading.
- **Solution / approach:** reuse persistent binary fetch, fingerprint, body timeout and in-flight helpers, then parse a local blob while retaining source-container sharing/generation cancellation.
- **Effort / performance:** M/L; improved startup resilience/storage use, no extra per-frame work.
- **Risk / trade-off:** duplicated ownership, parse lifetime and shared-material disposal if integrated carelessly. Uploaded local blobs are a separate persistence path.
- **Acceptance / validation:** warm visited avatar, clear only browser HTTP cache, go offline with app-shell/IndexedDB retained: body loads. Stalled headers/body fail within declared deadline; concurrent same URL downloads once; cancelled appearance cannot overwrite latest.
- **Dependencies:** existing loaders/cache; memory accounting C09. Direct same-origin environment loading is a coverage concern, not a confirmed CDN defect.

### C05 - Durable shared-avatar retirement

- **Category / priority / confidence:** retention/reliability, **P1**, **9/10**.
- **Evidence:** VERIFIED IN CODE. [retire/remove:148](../../worker/src/avatarAssets.js#L148), [replace/failure:226](../../worker/src/avatarAssets.js#L226), [relay alarm:448](../../worker/src/relay.js#L448). The alarm retries media cleanup, not avatar deletion.
- **Consequence / user value:** R2 delete failure can outlive departure/replacement, with no recorded retry. This is retention/cost risk, not a demonstrated disclosure exploit.
- **Solution / approach:** durable pending retirement and bounded retry/reconciliation; expose count, oldest age and attempts without logging content or private identifiers.
- **Effort / performance:** M; bounded Worker storage/alarm cost, zero headset draw cost.
- **Risk / trade-off:** deleting an active/shared key during reconciliation. Preserve references and idempotency; distinguish server retention from receiver copies.
- **Acceptance / validation:** injected R2 failure plus DO restart leaves retry intent; eventually deletes within a documented policy window; active keys protected; private-use uploads not sent to room.
- **Dependencies:** existing server storage/alarm lifecycle; user copy wording C09.

### C06 - Fidelity-preserving render/resource consolidation

- **Category / priority / confidence:** performance/architecture, **P1**, **8/10**.
- **Evidence:** DOCUMENTED HISTORICAL RESULT and MEASURED proxy inventory; [baseline:211](../PERFORMANCE_BASELINE.md#L211), [probe:505](../../js/club/03-rendering.js#L505), [dispose:981](../../js/club/02-lifecycle.js#L981).
- **Consequence / user value:** static stereo submission and retained passes can cost more than simulation; unnecessarily deleting people/effects may sacrifice fidelity without solving the bottleneck.
- **Solution / approach:** matched current pass attribution; merge compatible opaque static material groups, preserve separate colliders/pick targets, register render-once probe contributors and use visually safe district/portal visibility.
- **Effort / performance:** L; potentially less submission/capture work; no quantitative gain promised.
- **Risk / trade-off:** over-merging harms culling; incorrect portals hide mirrors/people; material merging changes appearance.
- **Acceptance / validation:** same-pose desktop/XR images and interactions remain equivalent; lower measured submissions/pass CPU or GPU cost on hardware; startup probe capture and retained-resource counts bounded.
- **Dependencies:** C01; respect current remote identity/culling policies. Character pose LOD is not the default solution.

### C07 - Existing XR pipeline A/B commissioning

- **Category / priority / confidence:** rendering performance, **P1**, **8/10**.
- **Evidence:** VERIFIED IN CODE; DOCUMENTED HISTORICAL RESULT. [applyVRSettings:714](../../js/club/02-lifecycle.js#L714), [pipeline configuration](../../js/club/03-rendering.js), [historical pass isolation:211](../PERFORMANCE_BASELINE.md#L211).
- **Consequence / user value:** XR is already separate from desktop, but bloom, AA and image processing cost still needs current attribution.
- **Solution / approach:** test supported tier/MSAA options and individual pass costs. Preserve sharpen `colorAmount=1`, intended exposure and dithering; no automatic return to supersampling, selective glow or failed multiview.
- **Effort / performance:** M commissioning; possible GPU/pass benefit, unknown magnitude.
- **Risk / trade-off:** aliasing, banding, dimness or loss of aesthetic glow; retain full visible stereo validity.
- **Acceptance / validation:** identical cue/pose A/B with reported render targets, frame intervals and supported GPU metrics; preference/comfort assessment; no desktop-only pass enters XR.
- **Dependencies:** C01, visual reference shots.

### C08 - Task-oriented first visit and truthful state

- **Category / priority / confidence:** UX/immersion, **P1**, **7/10**.
- **Evidence:** REASONED HYPOTHESIS grounded in VERIFIED IN CODE; [immersive states:12](../../js/immersiveLaunch.js#L12), [quick-menu pages:1075](../../js/club/10-ui.js#L1075), [DOM UI](../../js/ui-init.js).
- **Consequence / user value:** many valid internal states can make an unfamiliar user unsure what to do next.
- **Solution / approach:** optional in-club task tutorial and one next action for access/source/room states. Keep sparse splash, exact dev/production isolation, world-locked menu, personal settings and existing shared action APIs.
- **Effort / performance:** M; negligible rendering cost if reuse current textures/feedback.
- **Risk / trade-off:** over-onboarding or hiding advanced controls; keep skip, return and stable Back/Close.
- **Acceptance / validation:** representative first-time users enter, choose movement, reach music/people/avatar and exit without desktop coaching; observe selection errors and comprehension, then simplify based on evidence.
- **Dependencies:** C02 for owner dev flow; C09 calibration/identity messages.

### C09 - Trustworthy embodiment, sharing and lifecycle

- **Category / priority / confidence:** identity/comfort/privacy, **P1**, **8/10**.
- **Evidence:** VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [height math](../../js/playerHeight.js), [editor:192](../../js/avatarEditor.js#L192), [sharing page:1351](../../js/club/10-ui.js#L1351), [remote build:194](../../js/avatarManager.js#L194), [teardown:981](../../js/club/02-lifecycle.js#L981).
- **Consequence / user value:** eye-floor calibration, source clothing, local editing, shared status and recipient copies can be confused. Repeated appearance changes also exercise shared/owned resource boundaries.
- **Solution / approach:** optional height/mirror ritual, truthful fit/save/private/shared status and explicit copy consent. Explain local GLB tint/accessories versus service-provided garment/hair choices. Stress reuse/disposal before adding a generic registry.
- **Effort / performance:** M/L; little UI frame cost; avoid retaining every visited decoded wardrobe.
- **Risk / trade-off:** forced mirror detour, private material mutation or recipient-copy erasure promises.
- **Acceptance / validation:** standing/seated/short-player scale and mirror head correct physically; private use sends no asset; sharing acknowledges delivery/capability; 100 swaps and 20 lifecycle cycles plateau without shared-texture corruption.
- **Dependencies:** C04/C05, existing generation/ack guards.

### C10 - Professional live-operation commissioning

- **Category / priority / confidence:** DJ/audio reliability, **P1**, **8/10**.
- **Evidence:** VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [input setup:25](../../js/liveInput.js#L25), [go live:194](../../js/liveInput.js#L194), [publish confirmation:156](../../js/liveAudioClient.js#L156), [broadcaster:154](../../broadcast/broadcast.js#L154).
- **Consequence / user value:** private meters and successful negotiation do not guarantee good audience sound or confident recovery.
- **Solution / approach:** two-interface hardware monitoring guide, listener-confirmation check, advanced packet/format status; assess audience mute without stopping capture/session. Keep raw publication independent of local monitor/volume.
- **Effort / performance:** M/L; small stats/audio-node cost if changed, rehearsal is main work.
- **Risk / trade-off:** feedback, accidental mute, confusing program FX with external live raw signal.
- **Acceptance / validation:** real stereo program heard by desktop/Quest, clipping and actual format visible; unplug/outage/rotation/stop handled; no duplicate publisher, feedback or self-subscription; mute state truthful at both ends.
- **Dependencies:** C03, C14 and external hardware.

### C11 - Long-set musical and aesthetic authorship

- **Category / priority / confidence:** VJ/crowd immersion, **P1**, **8/10**.
- **Evidence:** VERIFIED IN CODE + REASONED HYPOTHESIS; [aesthetic program:1288](../../js/ledPatterns.js#L1288), [confidence:620](../../js/vjDirector.js#L620), [set-piece watch:294](../../js/showDirector.js#L294).
- **Consequence / user value:** finite sequences can expose the algorithm over long sets; accepted tempo is not necessarily the correct musical downbeat.
- **Solution / approach:** contextual authored alternatives/seeded anti-repeat history and high-consequence use of existing confidence. Preserve deliberate reprises, row cadence, cue-local sweep and five immersive hue offsets.
- **Effort / performance:** M/L authoring; minimal runtime arithmetic/storage, no new render pass.
- **Risk / trade-off:** random churn destroys longer holds; over-gating suppresses desired peaks.
- **Acceptance / validation:** 30-minute deterministic plus live audition across genres; log cue/program/palette/aim/prism tuples and musical errors; no unintended rapid recurrence, smooth cadence, Safe Mode limits and host hue preserved.
- **Dependencies:** C13, C12 manual recovery, C03 follower rehearsal.

### C12 - Optional phrase-safe operator intervention

- **Category / priority / confidence:** VJ controls, **P2**, **8/10**.
- **Evidence:** VERIFIED IN CODE limitation/design choice; [tap:1014](../../js/vjDirector.js#L1014), [BPM:1044](../../js/vjDirector.js#L1044), [held section:125](../../js/showDirector.js#L125), [preset recall:103](../../js/lightingPresets.js#L103).
- **Consequence / user value:** tempo change, instant snapshot recall and bar/downbeat reset are different tasks; touring control can be difficult without cluttering the intentionally simple desk.
- **Solution / approach:** test narrow quantized reanchor and optional queued preset/release/cancel. Keep immediate recall, shared authoritative actions and hand-back policy.
- **Effort / performance:** M; no added draw/pass, additional state/tests.
- **Risk / trade-off:** delayed action feels unresponsive; protocol divergence; overcomplicated desk.
- **Acceptance / validation:** clear current/pending state, cancel works, boundary commit within one frame after selected quantization; host/follower/late-join agree; safety/music/ownership never captured into preset.
- **Dependencies:** C11; C18 field coverage.

### C13 - Commission and preserve existing lighting safety

- **Category / priority / confidence:** visual comfort/safety, **P0**, **9/10**.
- **Evidence:** VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [flash gate:1468](../../js/club/01-core.js#L1468), [arbitration tests:7452](../../test/unit.test.mjs#L7452), [safe/peak shapes:1296](../../js/ledPatterns.js#L1296).
- **Consequence / user value:** implemented limits are valuable, but do not certify perceived glare, contrast, combined scene comfort or medical safety.
- **Solution / approach:** preserve one governor; instrument all abrupt emitters, safe-mode transitions and peak prism/wall/smoke. Tune only after physical contrast/comfort evidence.
- **Effort / performance:** M commissioning/test; no extra exposure accumulator or another gate required.
- **Risk / trade-off:** over-softening erases the authored peak; under-testing gives false reassurance.
- **Acceptance / validation:** normal flashes respect shared minimum gap and Warehouse's stricter limit; Safe Mode denies abrupt claims; tests fail if any source bypasses; physical bright/saturated peak and dim-room navigation readable, with participant stop conditions.
- **Dependencies:** C01 and current safety tests. No seizure-trigger testing on people.

### C14 - Digital headroom and mixer-contract evidence

- **Category / priority / confidence:** audio quality, **P1**, **8/10**.
- **Evidence:** VERIFIED IN CODE + REASONED HYPOTHESIS; [mono:203](../../js/club/11-audio-crowd.js#L203), [compressor/master:242](../../js/club/11-audio-crowd.js#L242), [spatial gains:939](../../js/club/11-audio-crowd.js#L939), [real graph test](../../test/e2e/audio-spatial.spec.mjs).
- **Consequence / user value:** summed paths/FX may colour or clip a program; existing localization tests do not prove every digital peak state.
- **Solution / approach:** instrument offline/real graph with left/right/anti-phase, impulse, full-scale and effect fixtures. Select explicit digital ceiling; add final limiting only if required by measured failures.
- **Effort / performance:** M test work; modest optional node cost.
- **Risk / trade-off:** unnecessary limiting reduces musical dynamics; no device SPL inference.
- **Acceptance / validation:** documented downmix and bus topology; no duplicate program path; maximum effects/zones remain within declared digital ceiling; gain changes click-free. Physical volume warning/controls remain available.
- **Dependencies:** C10 and C15.

### C15 - Reproducible acoustic commissioning

- **Category / priority / confidence:** spatial audio realism, **P2**, **8/10**.
- **Evidence:** VERIFIED IN CODE + REQUIRES PHYSICAL TESTING; [random IR:296](../../js/club/11-audio-crowd.js#L296), [crowd bus:577](../../js/club/11-audio-crowd.js#L577), [spatial update:877](../../js/club/11-audio-crowd.js#L877).
- **Consequence / user value:** random response makes comparisons noisy; direct/early/late coupling and whole-room ducking are hard to tune by intuition.
- **Solution / approach:** seed IR; isolate measurement taps, not necessarily split production buses; audition room/stair/street/under-deck/bar/restroom with level matching and decide duck policy.
- **Effort / performance:** M; same IR memory/CPU if seeded, extra nodes only if demonstrated worthwhile.
- **Risk / trade-off:** excessive reverb realism hurts musical clarity/voice; sterile dry room loses venue character.
- **Acceptance / validation:** repeated impulse stable; known decay/correlation; smooth gain/cutoff curves; direct-side localization, sub presence, exterior bass and voice intelligibility measured/auditioned.
- **Dependencies:** C14; correct hardware volume/reference.

### C16 - Material/contact readability without render inflation

- **Category / priority / confidence:** environment realism, **P2**, **7/10**.
- **Evidence:** REASONED HYPOTHESIS based on VERIFIED IN CODE; [floor:35](../../js/club/04-environment.js#L35), [steel:108](../../js/mezzanine.js#L108), [bottle variants:39](../../js/barProps.js#L39), [scoped practicals:217](../../js/venueDressing.js#L217).
- **Consequence / user value:** repeated textures, flattened roughness or indistinct contacts can reveal CG despite sound geometry.
- **Solution / approach:** matched neutral/saturated close-view audit; existing UV phase, packed ORM/vertex variation, contact transforms and practical tuning. No blanket grime, new light, full-time shadow maps or larger textures.
- **Effort / performance:** M; targets zero additional draws and no significant GPU growth.
- **Risk / trade-off:** over-darkening repeats prior couch issue; detail adds clutter; changing slots disrupts shaders.
- **Acceptance / validation:** specific observed tiling/contact/readability issue improves in same-pose images and headset audition; draw/texture budgets unchanged; seats/routes/beam depth remain correct.
- **Dependencies:** C01/C13, attribution C20.

### C17 - Human-scale social agency and return value

- **Category / priority / confidence:** social immersion, **P1**, **7/10**.
- **Evidence:** VERIFIED IN CODE capability + REASONED HYPOTHESIS; [social menu:2802](../../js/club/10-ui.js#L2802), [DJ reaction:106](../../js/djPerformer.js#L106), [multiplayer](../../js/multiplayer.js), [simulated actors](../../worker/src/devAttendees.js).
- **Consequence / user value:** believable ambient roles alone do not make people form a community or return.
- **Solution / approach:** optional interaction discovery, performer-visible existing reactions, room bookmarks and trustworthy event continuity. Add one or two tangible interactions using shared state only after task tests.
- **Effort / performance:** M; prefer current social messages/props over AI services, extra skeletons or constant UI.
- **Risk / trade-off:** scripted chatter feels fake; prompts intrude; additional world actions must be synced and abuse-resistant.
- **Acceptance / validation:** user study measures independent interaction discovery, voice comprehension and voluntary return intent; public/private audience and blocks preserved; simulated/human distinction clear.
- **Dependencies:** C03/C08; privacy/safety, not decorative complexity.

### C18 - Distributed recovery and shared-state contracts

- **Category / priority / confidence:** networking reliability, **P1**, **9/10**.
- **Evidence:** VERIFIED IN CODE; [room backoff:421](../../js/networkClient.js#L421), [live backoff:86](../../js/liveAudioClient.js#L86), [show signature:1450](../../js/multiplayer.js#L1450), [event expiry:132](../../worker/src/liveEvents.js#L132).
- **Consequence / user value:** synchronized retries increase outage pressure; adding shared fields can miss one capture/signature/sanitize/apply surface.
- **Solution / approach:** bounded jitter, exact existing retry/terminal limits, capacity/expiry/churn tests and supported-field mutation coverage; measure phase rather than inventing another clock.
- **Effort / performance:** S/M; negligible client frame overhead and smoother aggregate recovery.
- **Risk / trade-off:** slightly variable recovery time; careless jitter extends caps; stale callbacks attach media to a replaced session.
- **Acceptance / validation:** retry bounds/random distribution; 32 simultaneous drops distribute starts; no duplicate session/ticket/media; host/follower convergence on all supported fields after heartbeat/late join/promotion; Safe Mode never overwritten.
- **Dependencies:** C03, C12 where control schema expands.

### C19 - Independent stall measurement windows

- **Category / priority / confidence:** diagnostic correctness, **P2**, **10/10**.
- **Evidence:** VERIFIED IN CODE and reproduced. [Recorder.reset:29](../../js/frameStats.js#L29) clears count/index/total/origin, not `stalls`; [add:48](../../js/frameStats.js#L48) increments it.
- **Consequence / user value:** later reports contain stalls from earlier windows. Percentile/ring chronology is not defective.
- **Solution / approach:** reset stall count with window state and add exact reset-isolation test.
- **Effort / performance:** S; no material frame cost.
- **Risk / trade-off:** distinguish window from lifetime counters if lifetime telemetry is separately desired.
- **Acceptance / validation:** `add(0)`, `add(300)`, reset, `add(0)`, `add(16)` with 250 ms threshold reports one clean retained frame and zero new stalls. Existing current output reports `stalls:1`.
- **Dependencies:** none; useful before C01.

### C20 - Documentation and readiness truth

- **Category / priority / confidence:** maintenance/product accuracy, **P2**, **10/10**.
- **Evidence:** VERIFIED IN CODE/documentation contradiction; [VJ guide:5](../VJ_CONTROLS_GUIDE.md#L5), [guide:15](../VJ_CONTROLS_GUIDE.md#L15), [guide:20](../VJ_CONTROLS_GUIDE.md#L20), [scaling:64](../SCALING.md#L64), [BACKLOG](../../BACKLOG.md).
- **Consequence / user value:** false defaults, obsolete “missing” features and overbroad performance claims mislead users and future engineers.
- **Solution / approach:** reconcile guide/backlog with current implementations; qualify dates/distributions/build hashes; label synthetic admission versus real media and stylized immersion versus photorealism; preserve asset/branding attribution.
- **Effort / performance:** S/M; no runtime cost.
- **Risk / trade-off:** deleting history loses lessons; mark resolved/historical rather than erase useful evidence.
- **Acceptance / validation:** comfort off default, desk-only haptics, existing acoustics/body/sharing and unmeasured current32/Quest statements agree with code; links resolve; no unsupported percentages or FPS promises.
- **Dependencies:** findings verified above; hardware/provider results later append without overwriting history.

## 9. Prioritized top 20 improvement roadmap

Benefit scores are planning judgments (integer 1-10), not measured effect sizes. Complexity is 1 easiest to 10 hardest. Detailed affected files, risks and acceptance are in each C-record.

| Order | Finding / priority | Immersion | Realism | Complexity | Confidence | Performance / dependencies / validation |
|---|---|---:|---:|---:|---:|---|
| 1 | C01 P0: worn Quest commissioning | 10 | 8 | 7 | 10 | No runtime cost; exact build/device + C19; visible stereo/thermal route |
| 2 | C13 P0: safety commissioning/invariants | 10 | 7 | 5 | 9 | Existing gate; C01; Safe Mode/peak/combined cases |
| 3 | C02 P0: isolated dev owner flow | 8 | 4 | 6 | 10 | Negligible frame cost; scoped auth/Worker; allow/deny matrix/live test |
| 4 | C04 P0: bounded avatar source loader | 9 | 7 | 6 | 9 | Persistent startup, no frame cost; cache ownership; stalled/offline/cancel tests |
| 5 | C03 P0: real media/capacity rehearsal | 10 | 8 | 8 | 9 | Provider resources; C01; real8/16/32 and overflow, no synthetic equivalence |
| 6 | C05 P1: durable avatar retirement | 7 | 3 | 5 | 9 | Small server cost; references/alarms; injected deletes/restart/reconcile |
| 7 | C18 P1: jitter/recovery/state coverage | 9 | 5 | 5 | 9 | Tiny arithmetic, aggregate benefit; C03; storm/expiry/shared mutation |
| 8 | C06 P1: opaque/resource consolidation | 9 | 8 | 8 | 8 | Potential submission reduction; C01; same-image hardware A/B |
| 9 | C07 P1: XR pass A/B | 9 | 8 | 6 | 8 | Potential pass/fill reduction; C01; gain/dither/stereo preserved |
| 10 | C08 P1: task-oriented onboarding | 9 | 6 | 5 | 7 | Minimal draw change; C02/C09; novice task success |
| 11 | C09 P1: body/calibration/share trust | 10 | 9 | 6 | 8 | No texture cloning/retention; C04/C05; physical + lifecycle cycles |
| 12 | C10 P1: DJ operations | 9 | 9 | 6 | 8 | Small telemetry/node cost; C03/C14; interface/listener audition |
| 13 | C14 P1: headroom/mixer evidence | 8 | 8 | 5 | 8 | Mostly test cost; C10/C15; digital fixtures, no SPL inference |
| 14 | C11 P1: long-set authorship | 9 | 8 | 6 | 8 | Negligible frame cost; C13/C12; 30-minute genres/cadence |
| 15 | C17 P1: social agency/return | 9 | 9 | 6 | 7 | Reuse shared actions; C03/C08; user study, block-aware |
| 16 | C19 P2: stall reset | 3 | 2 | 1 | 10 | No frame cost; independent; exact numerical reproduction |
| 17 | C20 P2: accurate docs | 5 | 3 | 2 | 10 | No runtime cost; verified scope; defaults/links/claims |
| 18 | C16 P2: material/contact tune | 8 | 9 | 5 | 7 | Zero-extra-draw goal; C01/C13; observed issue + image budgets |
| 19 | C15 P2: acoustic reproducibility | 8 | 9 | 5 | 8 | Same seeded IR cost; C14; impulse/route/listening |
| 20 | C12 P2: phrase-safe operator tools | 7 | 8 | 5 | 8 | No pass; C11/C18; quantized/cancel/authority tests |

### Five highest-impact quick wins

1. **C19:** reset-window stall regression/fix; tiny, concrete and prerequisite for trustworthy measurements.
2. **C20:** correct misleading guide/default/sharing/capacity claims, retaining historical sections.
3. **C18:** bounded retry jitter with tests; small implementation, useful under common outages.
4. **C15:** seed the procedural IR before further acoustic tuning; reproducible without more draws or a heavier graph.
5. **C08/C02 interim messaging:** distinguish an unavailable owner-dev preparation path from an obsolete-app error. This does **not** unlock `000032`; the authenticated server work remains C02.

These are planning recommendations only; no fixes were applied during the review.

### Five strategic improvements

1. Current Quest and real-media release commissioning (C01/C03/C13).
2. Bounded, persistent and trustworthy identity lifecycle (C04/C05/C09).
3. Fidelity-preserving stereo render work guided by current measurements (C06/C07).
4. Professional live set operation, calibrated audio and truthful audience assurance (C10/C14/C15).
5. Long-form musical authorship plus human social return value (C11/C17).

### Implementation sequencing

- **P0 - usable and honest:** first C19 for measurements; collect C01/C13; repair isolated C02; harden C04; run C03 before advertising real32 or larger live events.
- **P1 - immersion/reliability:** C05 and C18 can proceed independently; C06/C07 follow current hardware attribution. C08/C09 and C10 are task/rehearsal-led, not UI rewrites. Then C11/C17.
- **P2 - refinements:** C20 now, C16 against observed images, C15 after stable fixtures, C12 only if operators benefit. Record budgets and same-build evidence with every change.
- **P3 - experiments:** authenticated Tribe/RTMP bridge, independent browser cue bus, procedural high-fidelity crowd cognition or alternative stereo pipeline. Each needs bounded prototype goals, real demand and safety/performance validation. No dependency on fashionable module/engine/decoder migration.

**Simplify/remove candidates:** obsolete source-only prototypes in production allow-lists if any regression reveals them; duplicated/stale guide concepts; redundant user-facing state jargon; repeated cue combinations with no artistic value. Do not remove the functioning bar, crowd choreography, comfort controls, safety guide, private audience controls or dense-smoke passages merely because they are complex. A second flash governor, parallel social API, camera-parented menu and global haptics should not be introduced.

## 10. Explicit answers to the twenty strategic questions

1. **Five greatest strengths?** Shared musical/show authority; coherent basement venue journey; embodied self/mirror/wardrobe; real spatial PA/acoustic zones; server-authoritative social/event safety with opt-in live input.
2. **Five biggest immersion breakers?** Risk of poor current headset pacing; verified dev owner-room entry failure; avatar load/calibration/sharing uncertainty; potential long-set recurrence; task-discovery/access jargon. The latter three contain hypotheses, not observed universal failures.
3. **What looks computer-generated?** Perfect repeated industrial motifs, stylized people, emissive beam surfaces and weak/ambiguous contact/material variation at close range. More polygons alone do not remove these cues.
4. **What feels like a genuine nightclub?** A street-to-basement threshold, occluded bass opening into the room, staff doing tasks, bar/balcony/queue social roles, a performing DJ and light sections with restraint and peaks.
5. **Would a professional DJ enjoy performing?** Potentially yes with their mixer/interface and a trustworthy audience feed. Not yet demonstrated by a real DJ audition; program monitoring/recovery matter more than virtual deck imitation.
6. **Would a professional VJ find it credible?** Yes as an authored club show/control system. Long-form variation, manual phrase correction and actual headset/follower commissioning would improve professional confidence.
7. **What does a first visitor notice?** Wordmark/warning, music and room scale, beam/wall colour and people. They may next struggle with how to move or reach social/music tools; test rather than assume.
8. **What does an experienced user notice after ten minutes?** Timing/comfort, gaze and body trust, ray/menu burden, acoustic transitions, repeated show/crowd choices and whether other people make the room worth staying in.
9. **What emerges under close inspection?** Garment fit, wrist roll, facial neutrality, material roughness, rail/seat contacts, prop supports and mirror stereo. These are physical-audition priorities, not newly alleged rendering defects.
10. **Is more visual complexity desirable?** Usually not yet. Better consistency, authored variation and reliable frame pacing are higher value. Add detail only for a specific observed perceptual problem.
11. **What currently limits Quest 3S?** Unknown for this build. Historical isolation implicated per-eye opaque submission plus some post-process cost, not application animation or transparency alone. Re-measure before selecting a bottleneck.
12. **Which optimizations preserve the experience?** Compatible static-material consolidation, correct visibility, bounded render-once capture, shared geometry/textures, cache/deadline reuse and measured XR-pass choices. Preserve colliders, identity, gain and dark gradients.
13. **Which missing environmental interactions add presence?** Study a small shared action such as a meaningful drink/service request or performer acknowledgement using existing props/social state. Doors/seats already interact; do not build them again. Shared-state/abuse/hand-contact design comes before features.
14. **How can the crowd feel real?** More contingent attention and human social agency, role-readable silhouettes and long-form musical choices. Existing lag/grooves/mingler/staff should be retained; avoid synchronized enthusiasm or scripted conversation masquerading as people.
15. **How convincing is spatial audio?** Strong implementation and existing localization evidence; actual headphone/venue impression is N/A in this review. Seed/calibrate IR and measure headroom/zone transfer before claiming acoustic realism.
16. **What distinguishes NOCTURNE?** A deliberately composed restrained nightclub, bodily identity and a live external-DJ destination with a believable physical approach, rather than another social lobby full of unrelated effects.
17. **What makes people return?** Trusted live sessions, friends/private rooms, saved personal identity, discoverable performer/social actions and a show that stays interesting for a full set.
18. **Biggest one-year technical risks?** Headset/Browser/Babylon compatibility and performance; provider media/cleanup failures; worst-case uploads/resource retention; shared-state schema drift; branch/deployment/documentation divergence.
19. **Premium release requirements?** Current visible stereo/native-frame or honestly stated performance targets, thermals, accessible task testing, calibrated audio, real provider/capacity rehearsal, reliable identity/privacy cleanup and reproducible distribution/rollback evidence.
20. **Only five improvements?** Worn-Quest commissioning with fidelity-preserving optimization; reliable cached/shared identity lifecycle; real DJ/SFU operations rehearsal; task-oriented calibrated onboarding; longer authored musical/social experience. Fix the owner-dev blocker and diagnostic/docs issues as enabling reliability work, not substitutes for those five outcomes.

## 11. Outstanding uncertainties and final verdict

### What this review does not establish

- Current Quest 3S/Quest 3 p95/p99 frame pacing, stereo mirror quality, GPU cost, reprojection or thermals.
- Real controller roll, touch/grip knob feel, headset text legibility or fatigue.
- Physical headphone frequency response, SPL, clipping audibility, mono portability or true one-way live latency.
- Real32 voice/music/upload load or 256 attendees; coordinator limits do not demonstrate delivery quality.
- A full production/development Worker-version comparison or independent penetration test.
- Representative users' revisit intent, preference for detailed versus lightweight cast, accessible reach or photosensitivity safety.
- Perfect offline recovery of every asset class. Catalog-avatar bypass is concrete; environment offline coverage needs its own cold-HTTP-cache experiment.
- External vendor garment/hair/editor rights, API compatibility or production integration. A locally uploaded naked GLB cannot acquire vendor wardrobe meshes from a tint slider.

**Final verdict:** invest in commissioning, identity trust, professional audio operation and authored longevity. The project has enough visual systems to support a distinctive club; the next major iteration should make them dependable and believable. “Premium immersive nightclub” is a defensible goal. “Hyperrealistic, native-rate32-person standalone-Quest venue” is not established by the present evidence.

## 12. Physical Quest 3S testing plan

### Setup and measurement

Use the exact reviewed/deployed bundle, current Quest Browser version and recorded headset firmware. Record Quest 3S battery/charging condition, room temperature, headset refresh request/actual rate, saved tier/AA/foveation, safe/comfort mode and avatar style. Reset prior state deliberately; never silently erase user credentials or private assets.

Keep a second desktop observer/listener and one reference audio/interface available. Use remote debugging and `club.getPerformanceReport()`/`resetFrameStats()` for application interval/update/submit data. Fix C19 or explicitly account for accumulated stalls. Use supported platform profiling tools for GPU/reprojection/memory/thermal data; if unavailable write **unavailable**, not an inferred number.

App frame budget examples: 72 Hz = 13.89 ms; 90 Hz = 11.11 ms; 120 Hz = 8.33 ms. Record actual target first. Compositor rate and smooth head tracking do not establish app rate. Reject black frames, stale projection and GL errors as invalid runs.

Perform the same 15-minute route separately for Ultra, High and Balanced after equivalent warm-up/cool-down. Preserve owner overrides. If the device/runtime cannot expose GPU time, still record visible behavior and CPU/application counters honestly.

### Reproducible 15-minute route

| Time | Task / scene | Record / acceptance purpose |
|---|---|---|
| 0:00-1:00 | Enter from opposite pavement, face entrance, read welcome; start chosen set | Visible correct stereo, actual entry point, first useful frame/audio latency, no black output |
| 1:00-2:00 | Walk street/forecourt and down entrance stair; head turns | World scale, stable feet/floor, door clearance, bass-to-room transition, no jump in audio/height |
| 2:00-3:30 | Dance floor, empty/restrained then normal crowd | Interval/update/submit, visible bones/draw counters, role visibility, onset/rhythm response |
| 3:30-5:00 | Aesthetic peak, row chase/fill one beat, static-down/inward/down sweep, prism | Step continuity, sweep no teleport, colour/energy, safe contrasting legibility and glare |
| 5:00-6:00 | Dense smoke plus sheet/spots; Safe Mode transition | Silhouette quality, combined flash governor, sheet crossing comfort, contrast and frame pacing |
| 6:00-7:30 | Booth/desk, ray and direct knob/fader, A/X reset, source transport | Reach, roll, grip/fine control, locking/end stops, desk-only haptics, host gating |
| 7:30-9:00 | Bar seat/drink/service view, then lounge seated mode | Physical versus furniture seating, eye/body calibration, hands/prop contacts, circulation |
| 9:00-10:00 | Balcony/stair ascent/descent and rail view | No floor snapping, body ground, acoustic height transition, rail contacts |
| 10:00-11:30 | Restroom and mirror, head turns/lean, seat/door, switch appearance | Both-eye current reflection, head restored in mirror, self hidden correctly, shared occupied state |
| 11:30-13:00 | Return floor, two real peers, chat/gesture/voice/block/private audience | Intelligibility, identity continuity, hand pose, name tag, effective block/audience and personal controls |
| 13:00-14:00 | Live external DJ program, listener confirm, brief controlled interruption | Real SFU sound, no self subscription/double FX, truthful outage and one recovery |
| 14:00-15:00 | Repeat initial peak/floor view, then normal exit/reentry | Compare early/late thermals/p95/memory, no resource growth, exit cleanup and restored state |

### Separate stress/validation matrix

- Real 8/16/32 participants: repeat floor/booth/mirror scenarios with voice/music, catalog and worst permitted uploaded avatars. Synthetic `000032` is an additional render/presence test, not replacement media load.
- Input: stereo and mono interfaces, absent device, unplug, channel reversal, clipping, sample-rate changes, local monitor muted/unmuted without publication changes.
- Network: 0/100/250 ms injected signaling latency, jitter, controlled loss/disconnect, room-full reconnect, ticket expiry, publisher rotation/end, host changes, overflow and two-way blocks. Record actual network conditions.
- Identity: at least two heights, standing, seated, low chair, physical floor error/recalibration, wardrobe/accessory/head hiding, private upload, consented share, receiver caching, rapid appearance changes and source cancellation.
- Stability: 20 entry/exit/dispose cycles and 100 appearance/media replacements with resource plateau; offline warm app/IndexedDB plus cleared HTTP cache; stalled bodies and quota failures.
- Safety: automatic/manual max brightness, shared flash arbitration, Safe Mode, legible stairs/controls and volume control. Do not recruit someone to provoke a photosensitive reaction; stop any test immediately for discomfort.

### Go / no-go record

For each run store build/device/config, valid visible stereo, p50/p95/p99/max application intervals, over-budget/missed share, update/submit means, GPU/reprojection where genuinely available, memory early/late, rendered counts, audio status, errors and participant comfort notes. Frame/latency/retention targets must be agreed before commissioning; a failed target is a failure, not explained away with tracking smoothness.

No premium/real32/native72 claim until matching evidence exists. Maintain a tested rollback and supported lower tier/comfort path. A declared lower performance target may be a product decision, but must still pass comfort and truthful communication gates.

## 13. Final runtime evidence addendum

### Focused browser results

Eight tests were selected. Four completed: **two passed, two failed**. The run was stopped during the fifth test after the performance sample became impractically slow; the remaining three were not started. This is deliberately **not** described as a passing browser suite.

| Selected test | Current result | Evidence / interpretation |
|---|---|---|
| [audio-spatial:83](../../test/e2e/audio-spatial.spec.mjs#L83) | FAIL | 120-second entry-audio wait expired; AudioContext remained `suspended`, media readyState 4, source present, media error null. Localization assertions were not reached; no current audio-localization pass claimed |
| [budget:16](../../test/e2e/budget.spec.mjs#L16) | PASS | Completed desktop and IWER resource/submission ceilings; numeric inventory below |
| [dev-room:8](../../test/e2e/dev-room.spec.mjs#L8) | PASS | Local configured relay/31-actor browser path passed. This does **not** repair or certify the separately configured live development `000032` path |
| [desktop performance scenarios:50](../../test/e2e/perf-scenarios.spec.mjs#L50) | FAIL | Lighting/crowded scenarios retained four frames, below the assertion `>5`. Their interval statistics are insufficient for a pacing comparison |
| [XR performance scenarios:58](../../test/e2e/perf-scenarios.spec.mjs#L58) | INTERRUPTED | Run stopped during this scenario; no completed XR scenario result |
| [self-body](../../test/e2e/self-body.spec.mjs) and two [VR-session](../../test/e2e/vr-session.spec.mjs) tests | NOT RUN | No new embodiment/session pass asserted in this review |

Failures are recorded, not automatically attributed to the application or dismissed as environmental. Source/runtime diagnosis and a clean focused rerun remain needed before promoting these results to release evidence. Because the assignment is review-only, no tests or application paths were changed to obtain a pass.

Test artifacts remain in the session evidence directory `files/multidisciplinary-tests`; retained videos/error contexts support the two failures. The runner/server process was stopped rather than left running.

### Current resource inventory

**MEASURED**, existing Playwright production-build budget scenario, Balanced configuration, Chromium with IWER for XR. These are software-renderer regression inventories, not physical Quest timing. Counts are view/state-dependent.

| Counter | Desktop | IWER XR |
|---|---:|---:|
| Engine-reported scene submissions/frame | 184 | 230 |
| Active-submesh proxy draws | 204 | 126 |
| Active materials / textures | 134 / 97 | 88 / 72 |
| Transparent / alpha-test proxy draws | 22 / 1 | 14 / 0 |
| Enabled characters in this scenario | 15 | 10 |
| LED wall render meshes | 1 | 1 |
| Ordinary RGBA-with-mips estimate | 286 MiB | 286 MiB |
| Cube/render-target RGBA estimate | 4 MiB | 7 MiB |
| Ordinary textures at least 4096 px | 0 | 0 |
| Render-once floor-probe contributors / resolution | 76 / 128x128 | 76 / 128x128 |

RGBA estimates are not measured physical VRAM or device allocation. Proxy and engine counters sample different render concepts; they must not be subtracted and relabelled as a reliable additional-pass total. The desktop proxy count exceeding the engine count illustrates this limitation.

Desktop performance-scenario sample sizes were 10 / 4 / 4 / 4 retained frames. The logged means of roughly 0.78 / 1.62 / 1.86 / 2.12 seconds per frame on the loaded software-renderer run are **not a valid Quest or comparative scene-cost baseline**. The test correctly rejected insufficient sampling.

After stopping that runner, a separate ten-second **live desktop** sample was collected on Intel Arc/ANGLE/D3D11, High, CSS viewport 844x554, camera `(0,1.7,-8.5)`, with the held IGNITION section continuing to advance. It retained 379 frames: mean 26.42 ms, p50 25.6, p95 33.6, p99 39.4, maximum 86.6; update mean 2.44 and submit mean 22.82 ms. Ending counters were 170 reported draws, 158 active meshes, 423,373 active triangles, 1,050 active bones and 208.1 MiB reported JS heap. This is a single workstation observation with evolving cues, not a constant-cue A/B or standalone-headset target. Reported `stalls:397` was discarded because the verified reset-lifetime defect makes it non-window-specific. GPU time was not measured.

### Visual location record

All following scene images were captured from the live current bundle and inspected by the coordinating reviewer. Captures are **mono desktop**, not Quest through-the-lens or stereo. Camera positions were scripted directly for inspection; this is not evidence that a human walked those routes under collision. Automatic lighting continued between shots, so brightness comparisons across images are not controlled A/Bs.

| Location / evidence | Camera eye position (metres) | OBSERVED IN RUNTIME; limitation |
|---|---|---|
| [Splash](questdev-review-images/00-splash.png) | Not in scene | Sparse wordmark, warning, two OFF choice buttons and attribution. Confirms the visible default labels, not headset legibility |
| [Street / club approach](questdev-review-images/01-street.png) | 0, 4.5, 22.3 | Recognizable facade/wordmark, crossing, queue and surrounding buildings. Repeated window cards are visible; nighttime grounding remains stylized |
| [Entrance stair](questdev-review-images/02-entrance.png) | 0, 4.5, 5.3 | Basement threshold, carpet, rails and coloured step edges read clearly in this mono view. No physical descent/comfort assertion |
| [Dance floor / booth](questdev-review-images/03-floor.png) | 0, 1.7, -10 | Bodies and booth are present; foreground dancer partially occludes the booth. Captured wall was very restrained/dark, not proof of a missing LED system |
| [Booth operator view](questdev-review-images/04-booth.png) | -1.3, 2.2, -19.6 | Real decks, SHOW panel, resident DJ, floor and bar. Panel/gear read as functional equipment; resident placement can obscure a direct central inspection |
| [Bar](questdev-review-images/05-bar.png) | 8.1, 1.7, -10 | Warm practical hierarchy, bartender, patterned wood, different bottle shapes/colours and stools. Shelf group placement is visibly regular: tune arrangement only if user testing finds it distracting |
| [Balcony](questdev-review-images/06-balcony.png) | -10.4, 4.7, -14.4 | Rail guest, elevated floor view, hanging equipment and blue mirror rays. Demonstrates vantage, not safe walking or headset ray comfort |
| [Restroom](questdev-review-images/07-restroom.png) | -14.2, 1.7, -2.7 | Basin, mirror frame, cubicle art and opening to the venue. Oblique shot does not validate one's own reflected head or both-eye mirror refresh |
| [Close crowd](questdev-review-images/08-crowd.png) | 2, 1.7, -11 | Clothing, distinct silhouettes and raised-arm poses are present; stylized fingers/hair remain apparent. A still cannot certify or disprove arm twist through a full groove |
| [Central desk](questdev-review-images/09-desk.png) | -0.4, 2.2, -19.7 | Resident DJ occupies central operator view, controls on both sides. Existing SEND DJ HOME supports access; no new collision/usability defect is inferred from standing directly behind the resident |
| [Selected IGNITION floor view](questdev-review-images/10-lit-floor.png) | 0, 1.7, -8.5 | Existing `pickSection('ignition')` applied; snapshot movement ignition, cue 1, bar 159. Blue wall regions/fixture colour visible. This instant is not a maximum-peak/glare test |

The scene was ready after every recorded location. A previous screenshot timeout captured the splash instead of the requested street; it was correctly renamed and **not** treated as a scene inspection. An integrated page reload/selection attempt also timed out; a fresh shared browser page completed the collection with longer screenshot deadlines. These tool/workstation observations are not hardware performance claims.

The images support the report's restrained industrial/stylized assessment, existing bar/role/structural strengths and targeted material/readability proposals. They do not turn the independent artist's source-only review into a fabricated human/headset audition.

## IF THIS WERE MY CLUB

I would keep the industrial basement, a restrained original wordmark, the street approach, the bar/balcony/restroom journey and the AESTHETIC show's long holds. The club would become recognizable through **a musical point of view**, not a growing list of effects.

**Within the existing architecture**, the panel would first make entry and identity trustworthy: bounded body sources, truthful private/shared fit status, an optional height/mirror moment and task-oriented controls. We would commission the real headset and optimize the invisible work while preserving the visible club. We would give the VJ a small set of phrase-safe interventions and a longer authored repertoire, and give the DJ audience confirmation, predictable recovery and calibrated external-mixer instructions. Materials would gain selective roughness/contact/UV variation without another draw or broad real light. Social prompts would help real people acknowledge each other rather than manufacture NPC enthusiasm.

**Substantial new development**, only after that foundation, would be a reliable authorized remote-ingest bridge for performers who need Tribe/RTMP, an identity-preserving scalable asset pipeline for larger real audiences, and a carefully authored programme of shared tangible interactions. A new stereo render architecture would earn its place only through visible, error-free physical A/B evidence; black-frame “speed” would never count. Human community, programming and event operations would remain as important as code.

The premium promise would be simple: enter easily, recognize yourself, hear a convincing room, trust the performer feed, move comfortably, and share a memorable set with other people. Every new system would have to improve one of those experiences enough to justify its performance and maintenance cost.

## Follow-up texture candidates: 1 November 2026

Requested after the original review. This is a verified source shortlist, not an
implementation or a claim of measured headset improvement. It addresses C16,
ART-02, ART-04 and ART-06: surface scale, roughness variation, localized wear and
grout readability. The existing floor already uses damaged concrete; the bar and
mezzanine already have wood and steel PBR maps. More dirt everywhere would duplicate
that treatment rather than fix obvious repetition.

All four assets are **CC0**, including redistribution, verified against
[Poly Haven's asset licence](https://polyhaven.com/license). Exact names, map
availability, descriptions and revision fingerprints were checked using the
provider's `/info/<id>` and `/files/<id>` API endpoints. Each offers 1K JPG
diffuse, DirectX normal and packed `arm` maps. Sizes below are the sum of those
three downloads, not decoded GPU memory or an optimized production budget.

| Priority | Candidate | Suggested audition, not automatic replacement | 1K download | Source revision (`files_hash`) |
|---|---|---|---:|---|
| 1 | [Plastered Wall 04](https://polyhaven.com/a/plastered_wall_04) | Matte grey plaster with fine pits/trowel marks on selected entrance or restroom surfaces. Contrast with existing brick without adding saturated colour. | 0.90 MiB | `6d3a95313563598622a45bdfe02137a3e590cc30` |
| 2 | [Brushed Concrete](https://polyhaven.com/a/brushed_concrete) | Stair/landing concrete or an A/B alternative to the current floor, where trowel direction and roughness variation help surface scale. Do not layer it across the whole damaged floor. | 2.36 MiB | `2274ffd02c42d765d335c85e9067398253d6b45e` |
| 3 | [Long White Tiles](https://polyhaven.com/a/long_white_tiles) | A localized vanity-side tile/grout treatment, not every wall. Its chips/discolouration are deliberately aged; compare against a cleaner surface before choosing it. Calibrate white albedo under the actual dark grade. | 1.76 MiB | `c26e8672a94d97e12b4eb15f3eab2ce954430313` |
| 4, optional | [Rusty Metal 04](https://polyhaven.com/a/rusty_metal_04) | Small industrial sheeting/casing areas only. Coarse rust and flaking paint are less appropriate for contact rails, chrome fixtures or the entire truss. Existing steel-panel roughness/UV variation is preferable first. | 2.50 MiB | `1c144f4e2b09d58f75430ae32d992b5d8aae53eb` |

Integration constraints:

- Start with **one** matched-pose audition, neutral and saturated lighting, before
  selecting a replacement. Do not download/install all candidates by default.
- Keep 512/1024 px production maps; use diffuse, normal and packed ORM on the
  existing mesh/material through `TextureLoader` and the factories. No displacement,
  parallax layer, new light, per-prop mesh or runtime CDN dependency.
- Three uncompressed RGBA 1K maps with mipmaps can occupy about **16 MiB**, even when
  their JPG downloads are under 2 MiB. Prefer replacement/reuse over accumulating sets.
- Set real-world UV scale and vary phase where repetition is actually visible.
  Preserve walk surfaces, colliders, prop contacts, seats and beam depth.
- New texture folders must have new names so the URL-keyed texture cache does not
  retain replaced maps for its 30-day TTL. Record the selected source, fingerprint
  and modifications in `ASSETS.md` only when imported.
- Acceptance remains the original C16 target: demonstrably improved same-pose
  images/headset audition, with unchanged draw/texture budgets. No candidate has
  yet met that runtime acceptance criterion.

## Venue texture implementation: 1 November 2026

The owner selected all four candidates for specific surfaces. Locally bundled
white tiles cover the restroom's interior walls to 1.5 m; matte plaster covers
the upper walls. Rusty metal is restricted to the DJ-platform sides, leaving its
anti-slip top intact. A wood worktop reuses the bar maps, with unchanged table
height/collision geometry beneath it. Brushed concrete replaces the active
ceiling set, with normal strength 0.3.

Tile and worktop finishes each add one opaque draw; walls remain merged, with
the existing colliders, door opening, lights, mirror and prop contacts. No new
light or runtime CDN dependency was added. Tiles/concrete use 1K maps,
plaster/rust 512 px: four sets total about 2 MiB download, approximately 24 MiB
additional mipmapped RGBA texture storage over the existing active sets.
Exact sources, revisions, authors and source/output hashes are in each texture
folder's `provenance.json` and ASSETS.md; the importer validates revisions.
Headset appearance and frame cost still need a physical-device audition.

The supplied demo recording is not included in this release because its
redistribution rights remain unconfirmed; the original generated club set is
the default and existing saved-source/host/event precedence is unchanged.

## C04 / C06 implementation follow-up

- Catalog/crowd/DJ sources and desktop/VR wardrobe previews now use the shared
  equipment loader's fingerprinted `VRClubModelCache`. There is no second binary
  cache, unbounded decoded wardrobe retention or change to uploaded-avatar privacy.
  `loadAssetContainer()` revokes parse blobs and rejects loader/scene disposal;
  appearance generations and existing container reference/retirement paths remain.
- `test/e2e/avatar-cache.spec.mjs` warms a real GLB, destroys decoded containers
  and their loader, clears Chromium's HTTP cache, disconnects the network and
  reloads the same geometry from reopened IndexedDB. Concurrent URL loads download
  once. Unit tests cover fingerprint replacement, stalled headers and bodies,
  the shared 120-second deadline, blob cleanup and late cancellation.
- Most static venue groups already use material merging or source instancing.
  The remaining ceiling duct/water pipes now merge into one opaque material draw
  instead of three, with identical world vertices, normals, UVs and material.
  Pick geometry and collision behavior are retained. The merged ceiling-named
  group joins the existing render-once probe list (including the duct, formerly
  omitted by its name); its refresh policy is unchanged.
- This is deliberately a small consolidation, not a full-room/portal merger.
  Characters, seats, doors, fixture animation and district boundaries are untouched.
  Software-rendered left/right-eye-offset A/B images and submission counts are
  regression evidence only; physical-headset CPU/GPU gains remain unmeasured.
