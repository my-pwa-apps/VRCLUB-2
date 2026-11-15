# Gashouder Amsterdam venue

The Gashouder is a separate venue mode. NOCTURNE remains the default, and its room
construction, assets, lighting, and crowd placements remain on their existing path.
Choose **Gashouder Amsterdam** on the entry screen, then select a setup before
entering.

## Branch isolation

Gashouder development lives on the **Gashouder** Git branch, separate from
**QuestDev**, with its own worktree at `D:\Git Repos\VRCLUB-Gashouder`.
QuestDev retains the NOCTURNE development app; do not merge Gashouder venue
changes into it. Shared fixes may be ported explicitly after checking each
venue's behavior. Run Gashouder builds and deployments from its worktree.
The existing NOCTURNE runtime option on this branch is not a shared branch.

## Deployment

Gashouder is served live on **<https://gashouder.mitwee.nl>** via the Cloudflare
Workers Static Assets custom domain (`worker/wrangler.gashouder.jsonc`) and mirrored
on Cloudflare Pages (`gashouder-vr` at <https://gashouder-vr.pages.dev>). Both hosts
and preview deployments select Gashouder by default; an explicit `?venue=nocturne`
still overrides it. Other deployments retain NOCTURNE as their default.

Build and deploy both targets in one step with `npm run deploy:gashouder`.

The development relay (`vrclub-network-dev`) allows `https://gashouder.mitwee.nl`,
`https://gashouder-vr.pages.dev`, and its preview deployments in `ALLOWED_ORIGINS`,
providing QuestDev owner-headset VR access (`VRPayment.canEnterVR() === true`),
shared first-party `mitwee.nl` owner authentication for room `000032` (accepting
both `__Secure-NocturneDevOwner` and any existing `nocturne_vr_session` owner
cookie with zero extra steps), and analysed SoundCloud/Colourizon streaming.
Gashouder also pre-seeds **Resident by Hernan Cattaneo**, **Colourizon by Miss Melera**,
and **DCR814 — Drumcode Radio Live with Bart Skils** from the official SoundCloud track.
The SoundCloud resolver supplies its analysed audio through the relay; the episode remains
an external stream, not a bundled recording. Existing untouched two-source Gashouder defaults
gain the new source without changing the selected set. Gashouder mounts the full interactive
3-panel VJ desk, DJ set player, and 8-knob 3D DJ FX surface on the `1.8 m` stage.

## Architectural basis

The build uses the venue's published approximate 54 m diameter, 10 m outer ring,
14.5 m centre height, and 18 × 9 × 1.8 m stage. The 2022 technical plan (plan page 7)
shows 40 perimeter bays; its page 4 interior image shows the radial roof members and
circular reinforcement. References:

- [Gashouder technical specifications](https://gashouder.nl/technical-specs)
- [2022 venue technical plan](https://uniquevenuesofamsterdam.com/wp-content/uploads/2021/07/Gashouder_ENG_Januari_2022.pdf)
- [Awakenings ADE 2024 lighting case](https://wahlberg.dk/blogs/cases/awakenings-ade-2024)

The polygonal brick shell, bay thickness, roof cross-section, roof-panel profile,
structural member sizes, doors, and event-rig locations are reconstruction choices,
not surveyed as-built dimensions. In particular, the plan does not provide a roof
section. The sloped radial roof joining the 10 m outer ring to the 14.5 m centre is
an inferred visual profile.
The five prominent concentric roof braces are another visual interpretation: their
radii are not confirmed by surveyed dimensions or the available plan.

The main hall is represented; the reported 2026 basement work is not included because
no current basement as-built plan is part of the available reference set.

## Reused assets and systems

| Use | Existing resource |
| --- | --- |
| Red brick shell | `textures/walls/` |
| Stage and DJ console | `js/models/djgear/source/pioneer_DJ_console.glb` |
| Flown PA | `js/models/paspeakers/source/stage_speaker___black.glb` |
| Bass bins | `js/models/bassbin/source/bass_bin_3.glb` |
| Crowd and guest characters | CC0 animated crowd GLBs under `js/models/avatars/` |
| DJ monitors | `js/models/monitors/source/monitor_speaker.glb` |
| Outer-ring stools | Poly Haven Metal Stool 03, also used on the NOCTURNE balcony |
| Materials, model caching, animated characters, lighting, lasers and show control | Existing `MaterialFactory`, `ModelLoader`, `AvatarRig`, fixture, `VJDirector`, and `ShowDirector` systems |

Asset attribution, source links, optimization notes, and licenses are maintained in
[`ASSETS.md`](../ASSETS.md). The Gashouder mode changes per-instance model
configuration and placements rather than introducing a second asset loader.
Detailed scope is tracked in the [QuestDev asset inventory](gashouder/questdev-asset-inventory.md),
[reuse and integration plan](gashouder/reuse-and-integration-plan.md), and
[architectural reconstruction record](gashouder/architectural-reconstruction.md).

The 1.8 m stage is an open steel balcony with a low-clearance space underneath,
support girders, front guardrail and twelve-step stairs at both sides. A sign
warns of the low headroom; taller guests may need to crouch. Architectural setup also
loads the selected local player-body asset while intentionally leaving out dancers
and the resident DJ. Both hall openings have closed collidable doors: no exterior
has been built. The main-entrance viewpoint remains inside the hall. Tracked and
queued headset movement is also contained at the doorways.
Three high tables and six selectable stools sit on the outer ring in every setup.
They reuse the balcony furniture and existing desktop/VR seating and network pose;
their stage-facing positions clear the entrance, stage, bystanders and 200-dancer
layout. Tables share one merged mesh, stools reuse the loaded model, and no lights
or per-frame updates are added. The tables also have simulated tablet props: selecting
one offers an optional, local three-minute static visual tint and subtle music filter.
Confirmation is required, the effect can be stopped at any time, and external player
audio cannot be filtered. It does not change the shared show or audio analysis.
Headset appearance and performance are unmeasured.

## Setups and runtime limits

- **Architectural**: shell, roof and outer-ring seating; no event stage, event rig, crowd, or guests.
- **Soundcheck**: stage and rig, two dancers, moving heads, strobes, mirror ball,
  monumental curved stage LED wall, and integrated ceiling LED architecture.
- **Techno**: full stage/rig, wrap-around curved LED wall, integrated radial ceiling
  LED grid, lasers and distributed haze, plus the active quality-tier crowd.
- **Awakenings Inspired**: full arena setup driving the wrap-around LED backdrop,
  conical roof LED grid, 24 moving heads, 8 multi-beam lasers, and 12 strobes.
- **Custom**: starts with the full visual setup; the existing live controls operate
  lights, lasers, haze, and LEDs.

The layered event rig combines the 31 m circular arena ring and a 20 m front-of-stage
bridge, carrying 24 moving heads across six control groups (with 360° radial arena
choreography and calibrated throw photometry), 12 strobes, two stage laser-sheet fans,
and eight multi-beam laser projectors. Eight distributed low-output fog units and the
shared ambient haze system span the larger hall without multiplying total particle
capacity or emission rate. Ring fixtures are staggered across distinct 7.5° truss nodes;
bridge fixtures occupy separate 1.25 m cross-beam nodes, and projector housings hang
clear below the truss chords. Smoke uses a softly feathered, noise-shaped cloud mask to
avoid repeated circular sprite edges; tiny dust glints retain their radial texture.
Mirror-ball pinspots use separate ring nodes from the other fixtures, and the
ball's cable reaches the roof hub. The six manual spot groups each control three
ring heads and one bridge head; the UI names groups rather than individual heads.
The monumental wrap-around 72 × 16 curved LED wall (44.64 m along its arc,
9.2 m high) has evenly spaced tiles and a dark continuous backing inside the brick
shell. It uses the single-mesh/single-texture update path, while 272 addressable
linear LED battens are flush-mounted along the 40 radial roof trusses and concentric
rings as one thin-instanced draw call with radial waves, hub ripples, and turbine
chases. A dedicated **Gashouder** automatic program is beat-locked, host-synchronized,
and keeps the existing Safe Mode strobe suppression.

VR entry starts just inside the main entrance, facing the stage. Its floor position
is `GASHOUDER_VENUE.vrEntry`, also used by the Main Entrance travel preset; tracked
eye height remains the headset's own.

The Gashouder Show panel and VR SHOW page offer an experimental **Ahead analysis**
toggle, off by default and saved on this device. When enabled for a finite, seekable
stream or local file, a separate silent audio element samples a 16-second window
starting 60 seconds ahead; its energy is blended with live energy to guide only the
next automatic Gashouder movement. Live beat tracking, cue timing, playback and
Safe Mode are unchanged. The analyzer follows playback but stops at a bounded
lookahead; live/network audio, non-seekable sources, and sources blocked from
analysis fall back to the existing live-reactive show. This may request the same
audio a second time and use extra bandwidth. Show and Music report whether the
current source has a usable preview or why it is unavailable; VR SHOW updates the
same status while open. A silent preview cannot distinguish quiet music from a
blocked analyser, so it is reported as uncertain rather than ready.

The Gashouder keeps its own pre-port spotlight look: 30-degree cones with subtle
variation, fixed authored beam pools, and eased pan/tilt motion. Do not apply the
narrower NOCTURNE optics or motion servo here. Its mirror-ball reflections trace
the illuminated facets of the four incident pinspots against the circular shell,
curved LED backdrop and DJ tabletop;
spotlight and laser beams also feed the shared haze lighting, with a broad wash
around spot and laser cores and segmented laser ribbons for smoke attenuation.

The integrated ceiling LED grid is an architectural roof-lighting system tailored to
the conical steelwork rather than dangling kinetic winch strips. Dancer count follows
the graphics tier by default, or can be set per device from 0 to 200 in the Club/Crowd
controls (and stepped by 1 or 10 from the VR Crowd page). Architectural and Soundcheck
setups retain their fixed limits. Counts above 24 are experimental: the existing 24
appearances repeat, and each dancer retains its own animated skeleton and choreography.
Extra dancers load one at a time; reducing the count disposes those above the original
24. High counts can severely reduce frame rate or exhaust device memory. The override
is stored as `vrclub.gashouderCrowdCount`, remains local, and is not shared with a room.
This is not a measured Quest capacity or performance guarantee.
The expensive 200-dancer browser regression is opt-in:
`$env:VRCLUB_CROWD_STRESS='1'; npx playwright test gashouder-qa -g "experimental Gashouder dancer"`.

The roof shell and event truss use merged static meshes; the animated strip display
uses thin instances. These are implementation optimizations, not measured headset
performance claims. Software-renderer performance sweeps are useful only for relative
regressions; they do not establish a Quest 3/3S crowd ceiling.
The five roof rings retain their 128-segment sweep and original sampled normals and UVs,
with 32 segments around each tube. This reduces the merged rings from 166,410 to 40,960
triangles; the tube's maximum deviation from a circular section is under 0.7 mm.
Their appearance and performance on a physical headset have not been compared.
The current mode also omits a fixed bar, balcony/mezzanine, repeated interior arches,
basement and underground facility entrances; these remain distinct scope items,
not implicit reuses of NOCTURNE's similarly named features.
