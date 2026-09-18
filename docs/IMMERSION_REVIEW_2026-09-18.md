# Immersive Environment Review — 2026-09-18

## Review Basis and Limits

Evidence gathered for this review:

- Current source and repository documentation, including the five unresolved findings from the
  2026-09-15 assessment.
- Live desktop runtime at 1314 x 1249 from arrival and right-wall viewpoints, after all local models
  loaded on the high tier.
- Runtime scene graph, camera, crowd animation and remote-avatar inspection.
- A controlled runtime insertion of one remote guest beside the rigged crowd.
- Contract and unit suite: 62 of 63 checks passed. The sole failure is the previously recorded
  `js/vendor/babylon.js` SHA-384 mismatch.

The inspected high-tier frame reported 1,118 meshes, 582 active meshes, 549 materials and about 560
draws. The integrated browser reported 5 FPS under automation; project records establish that this is
not representative of desktop or Quest hardware, so it is not used as a performance score.

No physical Quest 3S, stereoscopic capture, profiler trace, thermal run, direct audio audition or
multi-user network session was available. Headset-dependent findings are therefore **LIKELY** or
**SPECULATIVE**, not confirmed defects.

## 1. Executive Assessment

VR Club is a client-side Babylon.js 8.30.5 WebXR warehouse nightclub for Quest 3S and desktop. It
combines a beat-locked light show, local PBR environment, animated crowd, spatial PA model, comfort
locomotion, an in-world VJ desk and optional peer-to-peer multiplayer.

The build remains **promising but immersion frequently breaks**. The fixture rig, show ownership,
rendering safeguards, comfort controls and audio architecture are technically strong. The scene is
less convincing as a physically occupied venue: the entrance and bar are authored but disconnected,
the perimeter has little function, crowd members each run one repeated loop, the player has no visible
embodiment, and large surfaces have little localized history. Multiplayer adds a new mismatch: remote
people render as featureless cyan capsules among rigged human performers.

Technical readiness is good for a sophisticated browser visualizer but incomplete for a premium VR
release until Quest frame delivery, stereo stability, reach, scale and acoustics are measured on target
hardware.

## 2. Reality Test

The first cues that reveal a computer-generated environment are:

1. **CONFIRMED — Repeated performer behavior.** Ten high-tier dancers and one DJ each expose one
   animation group; runtime behavior changes playback speed but never social state.
2. **CONFIRMED — Empty venue perimeter.** The right-wall capture shows a broad uninterrupted wall,
   two repeated dancers and lighting effects, but no bar, service area or circulation purpose.
3. **CONFIRMED in multiplayer — Primitive remote people.** A runtime-injected remote guest is a
   capsule and sphere with one cyan material. Beside authored humans it is immediately artificial.
4. **LIKELY — Floating-camera embodiment.** Hand tracking is disabled and no body or tracked hand
   representation exists. This requires headset confirmation because controller rendering varies by
   runtime.
5. **CONFIRMED — Generic surface history.** Large floor and wall planes have PBR response but sparse
   cause-based wear, junction geometry or operational detail.

## 3. Critical Findings

No Critical defect was confirmed. Missing Quest performance data is a High-priority release gap, not
proof of a performance failure. A sustained native-refresh miss, severe stereo instability or unsafe
strobe path found in-headset would become Critical immediately.

The unrelated vendor-integrity contract failure remains a release-readiness issue: the checked-in
Babylon runtime does not match its recorded SHA-384 value.

## 4. High-Priority Findings

### H1 — Restore Distinct Entrance and Bar Presence Zones

**Confidence:** CONFIRMED  
**Evidence:** `js/club/02-lifecycle.js` still omits `createEntranceArea()`,
`createDanceFloorLighting()` and `createBar()` “for cleaner look.” Runtime mesh inspection found no
entrance, stanchion, counter, bottle or shelf meshes; the right-wall capture confirms the resulting
empty perimeter.  
**Impact:** Looking away from the stage exposes a decorated box rather than a functioning venue.  
**Solution:** Restore a restrained threshold and compact working bar with practical light and mundane
service cues, under a fixed Quest draw and memory budget.  
**Effort / gain:** Medium / High.

### H2 — Replace Looping Clones with Social Micro-Behaviors

**Confidence:** CONFIRMED  
**Evidence:** Every current dancer has one animation group. `updateDancingNPCs()` only changes speed
and distance-pauses animation; all crowd slots remain isolated and predominantly stage-facing.  
**Impact:** Repeated full-body motion is the strongest continuous artificial cue in the main zone.  
**Solution:** Keep the current headcount and skeleton budget, but schedule dance, rest, talk, watch,
phone and transit states at low frequency; arrange pairs and small groups.  
**Effort / gain:** Large / High.

### H3 — Establish Quest 3S Release Budgets

**Confidence:** CONFIRMED process gap  
**Evidence:** `docs/PERFORMANCE_BASELINE.md` still contains only an automated desktop complexity
baseline and an unfilled Quest check. No CPU/GPU frame time, dropped frame, reprojection, memory or
thermal-soak measurement is recorded.  
**Impact:** Frame pacing could override every visual and interaction improvement.  
**Solution:** Capture a repeatable 15-minute balanced-tier route through worst-case crowd, haze,
mirror, laser and safe lighting states; publish p95 budgets and headroom.  
**Effort / gain:** Medium / High.

### H4 — Add Minimal Player Embodiment and Venue Contact

**Confidence:** LIKELY  
**Evidence:** Hand tracking and default controller models are disabled, physics is off, and venue
meshes do not provide near-contact interaction. VJ buttons, locomotion collisions and haptics do work.  
**Impact:** Close interaction is performed by an invisible camera and ray rather than a body.  
**Solution:** Add tracked hand/controller proxies, booth and rail contact response, and one physically
depressed DJ control instead of a general rigid-body simulation.  
**Effort / gain:** Large / High.

## 5. Medium/Low Findings

### M1 — Replace Remote Guest Capsules

**Confidence:** CONFIRMED  
**Evidence:** `AvatarManager.ensurePeer()` creates a 1.6 m capsule, sphere head and nameplate. A
controlled runtime comparison beside the crowd made the style and motion mismatch unambiguous.  
**Impact:** Optional multiplayer's most socially important figure is its least believable human.  
**Solution:** Use a shared low-cost torso/head avatar with quantized head and hand poses, local
interpolation and restrained idle motion. This was added to `BACKLOG.md`.

### M2 — Author Cause-Based Eye-Level Wear

**Confidence:** CONFIRMED  
**Evidence:** Complete 1K PBR sets cover very large planes, while runtime captures show broad repeated
response and clean junctions with little threshold, edge, repair or contact variation.  
**Solution:** Add a shared trim/decal atlas and sparse geometry for traffic wear, cleaning patterns,
touch polish, cable repairs and floor-wall contacts. Do not increase base texture resolution.

### L1 — Add Rare Ambient Venue Events

**Confidence:** SPECULATIVE  
After zoning and crowd work, infrequent door, staff or service motions could add subconscious life.
They are low priority because more motion cannot compensate for missing venue function.

## 6. Top 10 Presence Improvements

Ranked by expected immersion gain per implementation effort:

1. Restore a readable entrance threshold and compact warm bar silhouette.
2. Put most crowd members into varied idle and social states rather than continuous dance.
3. Calibrate a dim neutral practical-light layer in-headset.
4. Group dancers into pairs and triads with varied facing and personal space.
5. Replace multiplayer capsules with low-cost posed guest avatars.
6. Add localized threshold, floor-edge and booth-contact wear from one atlas.
7. Add correctly scaled tracked hand/controller proxies.
8. Add booth/rail contact haptics and one responsive DJ control.
9. Establish and enforce Quest p95 CPU/GPU frame budgets.
10. Add rare ambient service events after the static venue reads convincingly.

## 7. Environment & Architecture

**CONFIRMED:** The room has coherent warehouse scale, collision walls, ceiling, pillars, ducting,
truss, stage, flown PA and detailed mounting hardware. Overhead construction is the strongest
architectural layer.

Eye-level function is weak. The current experience initializes stage and safety signs but omits its
own entrance and bar methods. A complete multi-room venue is not necessary yet; one believable
arrival threshold and one working service ecosystem would create most of the needed spatial hierarchy.
Human-scale constants are plausible but still require stereoscopic verification.

## 8. Materials & Surface Realism

**CONFIRMED:** Floor, wall and ceiling use local albedo, normal, roughness and AO maps. The floor also
has clearcoat, anisotropy, a probe and capable-tier SSR. These are sound material foundations.

The limitation is physical specificity, not texture resolution. Perfect primitive intersections and
large repeated planes fail close inspection. Wear should follow traffic, touch, cleaning, moisture and
repair causes. A small atlas, trims and sparse fastener/threshold geometry offer better value than 4K
base textures or uniform grunge.

## 9. Lighting & Atmosphere

**CONFIRMED:** Lighting is disciplined: beat/bar ownership, six moving spots, shadow generators,
fixture exclusivity, safe-mode strobe suppression, visual-only mirror output and bounded room bounce.
Haze and fog emitters give beams spatial structure without the removed floor-ribbon layer.

The captures preserve fixture spectacle but leave much of the floor and perimeter close to black.
Treat this as **LIKELY** headset calibration work, not evidence that more saturated lights are needed.
The target is a dirty neutral practical layer that reveals circulation and contact while preserving
designed blackouts.

## 10. Crowd & Human Presence

**CONFIRMED:** Tiered headcounts, transform variation, source-container reuse and distance animation
pausing are sensible performance decisions. They do not conceal one-loop behavior or stage-facing
placement. Social grouping and activity changes should precede more characters.

Optional multiplayer currently widens the visual mismatch. Remote guests have smooth positional
interpolation and spatial voice, but no human articulation. Their upgrade should reuse the network and
audio ownership already in place rather than introducing full crowd skeletons.

## 11. Interaction & Physics

The VJ desk, far-pointer controls, button depression, locomotion collision and opt-in haptics provide
usable control. **LIKELY:** lack of visible hands and surface contact still weakens body ownership in
headset. Broad rigid-body physics would add risk and little value; two authored contact interactions
are the appropriate initial scope.

## 12. Spatial Audio & Music

**CONFIRMED in code:** Music uses two HRTF PA panners, an omnidirectional sub path, distance-dependent
air absorption, early delay, concrete-room impulse response, position-dependent reverb and entrance
occlusion. Remote voice uses an HRTF panner attached to the interpolated guest position.

Direct listening was unavailable, so acoustical realism remains **LIKELY**, not verified. Added venue
zones should use explicit acoustic volumes and doorway transitions; listener-Z approximation will not
scale to multiple rooms.

## 13. VR Visual Quality

The implementation explicitly protects opacity, depth across rendering groups, material light layouts,
anisotropy, dithering and XR render scale. These are strong safeguards. Shimmer, stereo transparency,
LED aliasing, shadow stability, reflection stability and 10–20 cm texture behavior remain unverified
until a physical Quest pass.

## 14. Performance

The inspected high-tier state reported 1,118 meshes, 582 active meshes, 549 materials and about 560
draws. These are camera and cue dependent and cannot be compared directly with older captures.
Quality tiers, Quest-forced balanced settings, crowd caps, light budgets and no-allocation animation
tests are strong controls. They do not replace native headset CPU/GPU and thermal measurements.

## 15. Comfort & UX

**CONFIRMED:** Photosensitive Safe Mode is available before scene rendering, reduced-motion can select
it automatically, and the show director force-clears strobes. Comfort locomotion owns teleport/snap
turn versus smooth movement, preserves tracked eye height and suppresses sprint/jump behavior. This is
one of the strongest systems. Snap angle, seated booth reach, head collision and sustained contrast
still need user tests on Quest.

## 16. Environmental Storytelling

Current storytelling establishes a warehouse-club category through materials, DJ equipment, rigging,
exit signs and haze. It says little about tonight's operation or the building's history. The most useful
details are mundane and causal: repaired cable runs, taped labels, till/bin/sink grouping, cleaning
streaks, threshold wear and staff storage. Random bottles and decals would add noise, not credibility.

## 17. Cleanup & Repetition

The main repetition is experiential: one crowd activity, repeated source bodies, stage-facing placement
and large tiled planes. Address these before adding fixture types or LED patterns. The existing removal
of constant floor fog demonstrates the correct standard: effects that cost clarity without creating
presence should stay removed.

## 18. Missed Immersion Opportunities

These are recommendations, not defects:

- **High value:** small crowd groups that form, rest and separate on low-frequency schedules.
- **High value:** remote head and hand intent synchronized with spatial voice.
- **Moderate value:** an audible entrance threshold tied to a visible door volume.
- **Moderate value:** subtle distance-shaped bass haptics using the existing opt-in preference.
- **Low value until profiling:** dynamic cables, cloth and broad prop physics.

## 19. Backlog Summary

- Critical count: 0
- High count: 4 existing, 0 added
- Medium count: 1 existing, 1 added
- Low count: 0
- Items added: 1
- Existing items updated: 0
- Duplicates merged: booth reach and ergonomics remain within player embodiment; VR render-scale
  calibration remains within the Quest baseline; neutral practical lighting remains within venue zoning.

## Immersion Scorecard

| Dimension | Score | Constraint below 8 |
|---|---:|---|
| Spatial Presence | 5 | Weak perimeter identity and no physical-headset pass |
| Architectural Credibility | 5 | Strong rigging, sparse eye-level venue function |
| Human Scale | 7 | Plausible dimensions, not stereoscopically verified |
| Geometry | 6 | Detailed technical rig, primitive eye-level architecture |
| Materials | 6 | Correct PBR foundations, limited localized layering |
| Texture Realism | 6 | Complete sets, large-plane repetition and sparse history |
| Lighting | 6 | Sophisticated show; surroundings lose readability |
| Reflections | 7 | Probe and desktop SSR; headset stability unverified |
| Atmosphere | 6 | Layered dance-floor haze, little zone differentiation |
| Environmental Detail | 5 | Strong overhead hardware, sparse mundane ecology |
| Environmental Storytelling | 3 | Little operational history or cause-based wear |
| Crowd Realism | 4 | One-loop performers and no social behavior |
| Animation | 5 | Beat response without behavioral variety |
| Interaction | 3 | Strong VJ surface, almost no venue contact |
| Physics | 2 | Locomotion collision only; broad physics intentionally absent |
| Spatial Audio | 7 | Strong graph, not directly auditioned |
| Music / Club Acoustics | 7 | Physical PA model, no measured listening validation |
| Player Embodiment | 3 | No visible body/hands or near-contact response |
| Visual Stability | 6 | Explicit safeguards, no physical-headset evidence |
| Performance | 5 | Thoughtful controls, no representative Quest measurements |
| VR Comfort | 8 | Pre-entry safe mode and coherent comfort locomotion |
| Overall Technical Quality | 8 | Strong lifecycle, tests and rendering ownership |
| Overall Visual Realism | 5 | Fixture core is credible; venue, crowd and remotes remain synthetic |
| Overall Immersion | 5 | Spectacle works; place, society and embodiment frequently break |

## Final Verdict

**Promising but immersion frequently breaks**  
**Confidence:** Medium-high for source and desktop runtime findings; medium overall without a physical
Quest and direct audio pass.

**Three biggest presence breakers:**

1. Repeated one-loop crowd with little social intent.
2. Missing entrance/bar ecology and weak eye-level venue function.
3. Floating-camera embodiment; in multiplayer, primitive remote guests intensify the problem.

**Three strongest aspects:**

1. Disciplined beat-locked fixture/show architecture with photosensitive safeguards.
2. Spatial PA, sub, room-response and remote-voice audio design.
3. WebXR-focused rendering robustness, graphics tiers and comfort ownership.

**Five highest-value changes next:**

1. Measure worst-case Quest 3S frame delivery and establish release budgets.
2. Restore a restrained entrance and compact functional bar/practical-light layer.
3. Convert the crowd from continuous solo loops to mixed social states.
4. Add localized physical wear and transitions at eye level.
5. Add minimal tracked embodiment, then apply its head/hand representation to remote guests.