# Immersive Environment Review — 2026-09-15

## Review Basis and Limits

Evidence used:

- Live desktop runtime at 1440 x 900 from arrival, dance-floor, right-wall and close DJ-booth views.
- Runtime scene graph, material, light, animation, particle, collision and audio-node inspection.
- Source review of lifecycle, rendering, environment, fixture, interaction, crowd and audio ownership.
- Existing contract/unit/E2E coverage and `docs/PERFORMANCE_BASELINE.md`.
- 61 contract/unit checks run during this review: 60 passed; the existing Babylon vendor SHA-384
  mismatch failed one contract check.

Not available:

- A physical Quest 3S capture, profiler trace, stereoscopic recording or sustained thermal run.
- Direct listening comparison on headphones/headset.
- Real users testing scale, reach, locomotion comfort or photosensitivity controls.

Desktop automation reported 3-4 FPS, which project documentation identifies as a software-rendering
artifact. It is not used as a headset-performance score. Findings that depend on perception in a
headset are labelled **LIKELY** or **SPECULATIVE**, not confirmed.

## 1. Executive Assessment

VR Club is a client-side Babylon.js 8.30.5 WebXR warehouse-club experience targeting Meta Quest 3S
and desktop. The player is a single attendee/VJ with smooth locomotion or comfort teleport/snap turn,
an in-world control desk, stream/file audio, a tiered crowd and a composed beat-locked light show.

The current build is technically mature for a browser visualizer and **promising but immersion
frequently breaks** as a premium VR place. Its strongest work is below the surface: deterministic
show ownership, careful light budgets, PBR opacity/depth safeguards, graphics tiers, lifecycle
teardown, comfort settings, spatial PA modelling and detailed truss/fixture construction.

The primary weakness is that the experience is concentrated around spectacle rather than a complete
venue. The authored entrance and bar are not initialized, most architecture is unreadable in current
desktop captures, humans repeat three source loops, and the player has no body/hands or physical
relationship with nearby objects. Technical readiness is also limited by the absence of a
representative Quest frame-time and visual-stability baseline.

## 2. Reality Test

If a person entered without context, these would reveal the simulation first:

1. **CONFIRMED — Repeated solo dancers.** Ten high-tier dancers come from three source GLBs, each
   running one loop with speed/phase variation. The brain detects repeated body language quickly.
2. **CONFIRMED — Missing venue ecology.** Looking away from the stage reveals an empty right wall and
   no functioning bar, entrance threshold, staff area or social circulation pattern.
3. **LIKELY — Floating-camera embodiment.** The runtime has locomotion and controller rays but no
   visible player body/hands; nearby venue surfaces provide no contact response.
4. **CONFIRMED — Clean repeated construction.** Large wall/floor planes repeat three 1K PBR sets and
   meet as clean primitives without localized contact wear or repair history.
5. **LIKELY — Darkness hides physical relationships.** Arrival and dance-floor captures retain
   silhouettes and fixture sources but lose much of the floor, wall, booth and contact information.
   Final severity requires headset black-level testing.

### Strongest Potential Presence Moments

1. Entering a beat-locked ignition or blackout-to-drop cue on the dance floor.
2. Hearing the two flown PAs change direction, high-frequency content and reverb with position.
3. Standing below the detailed truss, moving-head mounts, speaker rigging and safety hardware.
4. Seeing moving light and the LED wall respond coherently through spatial haze and floor reflection.
5. Operating the in-world VJ desk with depression animation and opt-in haptic feedback.

### Five Strongest Presence Breakers

| Breaker | Player perception | Artificial cue | Frequency / damage | Smallest effective improvement | Ideal improvement |
|---|---|---|---|---|---|
| Clone crowd | Similar people dance alone in repeated loops | Repeated poses, timing and facing lack social intent | Continuous / High | Mix idle and dance states; vary facing | Group behaviours, transitions, gaze and transit |
| Empty perimeter | The stage sits in a mostly empty box | No service, threshold or circulation ecology | Whenever looking aside/back / High | Restore compact entrance and bar silhouettes | Functioning venue zones with mundane detail |
| No embodiment | Player reaches as a camera/controller ray | No visible body, hand scale or contact | Every close interaction / High | Tracked hand/controller proxies | Hands, contact poses and selected physical controls |
| Repeated clean surfaces | Wall/floor detail repeats without history | Perfect joins and context-free wear | Close inspection / Medium-High | Sparse trim/decal atlas | Cause-based wear, repairs and material transitions |
| Unproven headset delivery | Potential judder or unstable fine detail | Latency and shimmer override realism | Potentially continuous / Critical if present | Capture one worst-case Quest route | Release budgets with sustained automated telemetry |

## 3. Critical Findings

No critical runtime defect was confirmed from available evidence. This is not proof that the Quest
build meets frame or comfort requirements: representative headset data does not exist. Any sustained
miss of the selected native refresh target would immediately become Critical.

The contract suite has one release-readiness failure unrelated to this visual review: the vendored
Babylon runtime's current SHA-384 does not match `scripts/vendor.manifest.json`.

## 4. High-Priority Findings

### H1 — Restore Distinct Venue Zones

**Confidence:** CONFIRMED  
**Area:** Environment / architecture / lighting  
**Evidence:** `init()` explicitly omits `createEntranceArea()`, `createDanceFloorLighting()` and
`createBar()`. Runtime found no entrance, stanchion, counter, shelf or bottle meshes.  
**Presence impact:** The room communicates “stage in a box,” not an occupied club.  
**Performance impact:** Moderate if restored naively; low with merged geometry, shared materials and
emissive practicals.  
**Effort / gain:** Medium / High.  
**Validation:** Show-off arrival/right-wall captures, collision route, Quest A/B frame trace.

### H2 — Replace Looping Clones with Social Behaviour

**Confidence:** CONFIRMED  
**Area:** Crowd / animation  
**Evidence:** High tier has ten dancers and one DJ from three source avatars. Each owns one animation
group; slots predominantly face the booth. No social, idle, gaze or navigation state exists.  
**Presence impact:** Human repetition becomes more conspicuous than environmental simplification.  
**Performance impact:** Keep current headcount and animation LOD; avoid per-frame AI/pathfinding.  
**Effort / gain:** Large / High.  
**Validation:** Two-minute state/timing capture and in-headset repetition test.

### H3 — Establish Quest 3S Release Budgets

**Confidence:** CONFIRMED process gap  
**Area:** Performance / visual stability  
**Evidence:** Existing baseline explicitly says automated FPS is not representative. No Quest CPU/GPU
frame time, dropped frames, reprojection, thermals or memory figures are recorded.  
**Presence impact:** Unknown frame pacing is an unknown ceiling on all visual quality.  
**Performance impact:** Measurement first; optimize only the observed dominant costs.  
**Effort / gain:** Medium / High.  
**Validation:** Repeatable 15-minute worst-case route with cold and thermal-soak runs.

### H4 — Add Minimal Embodiment and Physical Response

**Confidence:** LIKELY  
**Area:** Player / interaction / physics  
**Evidence:** Controller meshes and near interaction are disabled, no player representation exists,
physics is disabled, and venue meshes have no action managers. VJ controls and haptics do work.  
**Presence impact:** The player has agency over the show but little bodily ownership of the room.  
**Performance impact:** A general rigid-body system is not justified; authored overlap/contact and
two responsive objects are the appropriate Quest scope.  
**Effort / gain:** Large / High.  
**Validation:** Seated/standing reach tests at multiple player heights.

## 5. Medium/Low Findings

**M1 — CONFIRMED:** Large surfaces use good base PBR data but repeat without localized physical
history. Add an atlas-driven, cause-based wear pass instead of higher-resolution base textures.

**M2 — LIKELY:** Current desktop captures lose floor/wall/contact readability even in an active
fixture look. Evaluate headset black level and exposure before changing authored lighting; recent
history shows this area is sensitive to Babylon shader/light interactions.

**M3 — CONFIRMED:** The spatial audio graph is sophisticated but not structurally tested. This is
already tracked in the backlog and should not be duplicated.

**L1 — SPECULATIVE:** Small, infrequent venue events such as a door movement, staff pass or fog-machine
service action could add life after the core crowd and zoning work is complete.

## 6. Top 10 Presence Improvements

Ranked by expected immersion gained per implementation effort:

1. Restore a restrained entrance threshold and warm bar silhouette.
2. Change most crowd members from continuous dance to mixed idle/social states.
3. Calibrate one readable neutral practical-light layer in-headset.
4. Group patrons into pairs/triads and vary facing/personal space.
5. Add localized floor-edge, threshold and booth-contact wear from a shared atlas.
6. Add tracked hand/controller proxies with correct reach scale.
7. Add contact haptics at the booth/rail and one physically responsive DJ control.
8. Establish and enforce Quest p95 CPU/GPU frame budgets.
9. Add mundane bar/booth service details with a strict batching budget.
10. Add rare low-cost ambient events only after the static scene reads as a real venue.

## 7. Environment & Architecture

The implemented world is a single 25 m x 16 m warehouse room with a 10 m modeled shell, front/rear
walls, pillars, pipes, ceiling ducting, truss, stage and flown PA. Construction detail is strongest
overhead: clamps, bolts, braces, chains, shackles and safety cables give fixtures plausible support.

At eye level, spatial logic is much weaker. The current experience includes stage, dance floor and
exit signs but omits its own entrance and bar methods. There are no toilets, coat check, corridor,
backstage or service zones. Expanding to all those rooms is not the highest-value response; a legible
threshold and one believable service zone would provide most of the gain.

Human scale is generally coherent in code: desktop eye height is 1.7 m, crowd heights range about
1.60-1.88 m, the bar prototype is 1.1 m, and the DJ riser has an explicit 0.5 m offset. These values
still need stereoscopic verification.

## 8. Materials & Surface Realism

The floor, wall and ceiling each use local 1K albedo/normal/roughness/AO sets. The floor has clearcoat,
tiered anisotropy, a reflection probe and desktop SSR on capable tiers. These are sound technical
foundations and preferable to indiscriminately increasing resolution.

The limitation is specificity. Wall textures tile 4 x 2 over long planes and floor textures 6 x 6
over a 35 x 45 m mesh. Perfect box corners, clean floor-wall contacts and sparse context-dependent wear
fail the 10-20 cm inspection test. Add trims, seams, fasteners, repairs, touch polish, traffic wear and
cleaning patterns according to physical cause. Do not add uniform grunge.

## 9. Lighting & Atmosphere

The rig is unusually disciplined for a browser scene: six moving spots, two shadow generators,
localized equipment lights, visual-only mirror-ball output, fixture exclusivity, beat/bar ownership,
safe-mode strobe suppression, asymmetric exposure adaptation and a bounded indirect room-bounce term.
Four particle systems provide two fog emitters, haze and dust; constant floor fog has correctly been
removed.

Desktop captures show bright fixtures and silhouettes but limited architectural readability. Treat
this as a headset-calibration question first, not a request for more RGB lights. The desired fix is a
dirty, neutral practical layer that reveals circulation and material boundaries while preserving real
blackouts. Atmosphere is concentrated on the dance floor; spatial differentiation will remain limited
until entrance/bar zones exist.

## 10. Crowd & Human Presence

Crowd density is tiered sensibly: 6/10/14 dancers plus the DJ, with source containers retained for
runtime expansion and distant animation pausing. Heights, positions, phase and speed vary.

Only three character sources and one loop per instance remain a severe content/behaviour bottleneck.
Everyone reads as an isolated performer. Presence requires fewer continuous dancers, more idles, pairs,
conversations, watching, transit and rest. This can be state-driven without adding headcount or general
navigation.

## 11. Interaction & Physics

Locomotion, collisions, far-pointer controls, button depression and opt-in haptics are implemented.
This makes the control workflow usable. Venue interaction and physics are otherwise intentionally absent.

Do not turn every prop into a rigid body. Add visual embodiment and two authored contact interactions
where expectation is strongest. Keep the rest clearly environmental so the interaction boundary is
consistent.

## 12. Spatial Audio & Music

The audio architecture is a major strength. Music routes through two HRTF panners at the flown PA
locations, an omnidirectional sub channel, distance-dependent air absorption, early delay, a synthetic
1.9 s concrete-room impulse response, position-dependent reverb send, entrance occlusion and mastering.
A spatialized, ducked crowd bed prevents silence between tracks. Listener position/orientation updates
from the active camera and analyser data is tapped before spatial attenuation.

This merits a provisional 7/10, not a higher score, because the graph was inspected rather than heard
and has no structural tests. Doorway transitions are approximated by listener Z position rather than
geometry-aware obstruction, which is suitable for the current single room but will not scale to added
zones without explicit acoustic volumes.

## 13. VR Visual Quality

The code explicitly addresses VR opacity, depth preservation across rendering groups, anisotropy,
dithering, light-buffer invalidation, native XR scale, foveation and reduced post-processing. These are
strong defenses against known WebXR failures.

Shimmer, specular crawl, stereo transparency, shadow stability, LED aliasing, LOD transitions and
10-20 cm texture behavior were not observable in a physical headset. They remain unverified release
criteria, not confirmed defects.

## 14. Performance

Runtime high-tier evidence from one arrival state: 1,015 meshes, 590 active meshes, 487 materials and
approximately 611 estimated draws. Counts vary with camera and cue. The older reproducible desktop
baseline recorded 968 total meshes and 1,628 estimated draws under a different state, so the numbers
must not be compared as a regression without reproducing that setup.

Strong controls include three quality tiers, Quest-forced balanced features, crowd caps, instanced/
merged static geometry, light-count budgets, reflection density limits, render-loop pause/teardown and
no-allocation hot-path tests. The missing evidence is actual Quest frame delivery under crowd, haze,
reflections, particles, audio and worst-case lighting.

## 15. Comfort & UX

Photosensitive Safe Mode is offered before rendering and force-clears strobes. Reduced-motion can
default it on. VR comfort mode owns teleport/snap turn versus smooth locomotion, preserves tracked eye
height, suppresses sprint/jump/gravity effects and persists independently. The quick menu is reachable
from controller buttons and includes travel, comfort and haptic settings.

This is one of the strongest dimensions. Remaining work is empirical: verify snap angle, seated booth
offset, head collision, sustained contrast and strobe perception with users on target hardware.

## 16. Environmental Storytelling

Current storytelling is mostly category-level: underground warehouse materials, rigging, DJ equipment,
exit signs and haze. There is little evidence of tonight's operations or the building's history because
the service ecosystem is absent and surface wear is generic.

The best next details are mundane and causal: repaired cable runs, taped labels, a till/bin/sink cluster,
cleaning streaks at the bar, traffic-polished thresholds and a few staff items. Random bottles or decals
without operational context would add clutter but not credibility.

## 17. Cleanup & Repetition

The codebase has already removed several effects that added complexity without presence. Continue that
discipline. The key repetition now is experiential rather than purely geometric: three crowd sources,
one activity, stage-facing placement and large tiled planes. Address those before adding more fixture
types or LED patterns.

Two existing cleanup/release items remain relevant but are not new immersion findings: unresolved asset
licensing and the Babylon vendor-integrity mismatch.

## 18. Missed Immersion Opportunities

These are recommendations, not established defects:

- **High value:** crowd members forming/breaking small groups on bar boundaries rather than per frame.
- **High value:** an acoustic threshold synchronized with a visible entrance/door volume.
- **Moderate value:** subtle bass haptics shaped by listener distance and sub energy, using the existing
  opt-in preference.
- **Moderate value:** infrequent staff/maintenance activity at the bar or booth.
- **Low value until profiling:** dynamic hanging cables, cloth or broad rigid-body prop simulation.

## 19. Backlog Summary

- Critical added: 0
- High added: 4
- Medium added: 1
- Low added: 0
- Items added: 5
- Existing items updated: 0
- Duplicates merged: entrance/bar/dance-floor zoning became one environment item; material wear and
  repetition became one surface item. Existing spatial-audio testing, licensing and offline-state work
  were referenced without duplication.

## Immersion Scorecard

Scores reflect available evidence, not aspirational feature descriptions.

| Dimension | Score | Constraint below 8 |
|---|---:|---|
| Spatial Presence | 5 | Single stage-led room with weak perimeter identity and no headset pass |
| Architectural Credibility | 5 | Strong rigging, sparse eye-level venue function and transitions |
| Human Scale | 7 | Coherent coded dimensions, not yet verified stereoscopically |
| Geometry | 6 | Detailed technical rig; much eye-level architecture remains primitive |
| Materials | 6 | Correct PBR foundations, limited localized layering and transition detail |
| Texture Realism | 6 | Complete 1K sets, visible risk of large-plane repetition |
| Lighting | 6 | Sophisticated show logic; physical surroundings remain hard to read in captures |
| Reflections | 7 | Probe, SSR tiers and polished-floor response; headset stability unverified |
| Atmosphere | 6 | Layered localized haze/dust, limited zone differentiation |
| Environmental Detail | 5 | Detailed overhead hardware, sparse mundane eye-level ecology |
| Environmental Storytelling | 3 | Little operational history, service activity or cause-based wear |
| Crowd Realism | 4 | Tiered and varied transforms, but three sources and repeated solo loops |
| Animation | 5 | Beat response and phase offsets; little behavioural variety |
| Interaction | 3 | Strong VJ controls, almost no venue interaction |
| Physics | 2 | Collision locomotion only; general physics intentionally disabled |
| Spatial Audio | 7 | Strong graph design, not directly auditioned or structurally tested |
| Music / Club Acoustics | 7 | Physical PA/sub/reverb model; no measured listening validation |
| Player Embodiment | 3 | No visible body/hands and minimal contact response |
| Visual Stability | 6 | Many explicit safeguards; physical-headset evidence absent |
| Performance | 5 | Thoughtful tiers and budgets, no representative Quest measurements |
| VR Comfort | 8 | Pre-entry safe mode and coherent comfort locomotion ownership |
| Overall Technical Quality | 8 | Strong lifecycle, tests, rendering safeguards and ownership boundaries |
| Overall Visual Realism | 6 | Convincing fixture core, visibly synthetic venue/crowd context |
| Overall Immersion | 5 | Spectacle works; place, society and embodiment frequently break |

## Final Verdict

**Verdict:** Promising but immersion frequently breaks  
**Confidence:** Medium-high for code/runtime findings; medium overall because no physical headset pass
was available.

**Three biggest presence breakers:**

1. Three-source looping crowd with little social intent.
2. Missing entrance/bar ecology and sparse eye-level venue function.
3. Floating-camera embodiment with no general physical response.

**Three strongest aspects:**

1. Disciplined, beat-locked fixture/show architecture with photosensitive safeguards.
2. Spatial PA, sub, air-absorption, room-response and crowd-audio design.
3. WebXR-focused rendering robustness, quality tiers and comfort ownership.

**Five highest-value changes next:**

1. Measure the worst-case experience on Quest 3S and establish release budgets.
2. Restore a restrained entrance and compact functioning bar/practical-light layer.
3. Convert the crowd from continuous solo loops to mixed social states.
4. Add localized, physically caused wear and material transitions at eye level.
5. Add minimal tracked embodiment and two high-value contact interactions.