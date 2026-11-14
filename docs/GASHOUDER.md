# Gashouder Amsterdam venue

The Gashouder is a separate venue mode. NOCTURNE remains the default, and its room
construction, assets, lighting, and crowd placements remain on their existing path.
Choose **Gashouder Amsterdam** on the entry screen, then select a setup before
entering.

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
Gashouder also pre-seeds the latest **Resident by Hernan Cattaneo** podcast feed and
latest **Colourizon by Miss Melera** SoundCloud feed, and mounts the full interactive
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
| Materials, model caching, animated characters, lighting, lasers and show control | Existing `MaterialFactory`, `ModelLoader`, `AvatarRig`, fixture, `VJDirector`, and `ShowDirector` systems |

Asset attribution, source links, optimization notes, and licenses are maintained in
[`ASSETS.md`](../ASSETS.md). The Gashouder mode changes per-instance model
configuration and placements rather than introducing a second asset loader.
Detailed scope is tracked in the [QuestDev asset inventory](gashouder/questdev-asset-inventory.md),
[reuse and integration plan](gashouder/reuse-and-integration-plan.md), and
[architectural reconstruction record](gashouder/architectural-reconstruction.md).

The raised stage has a six-step procedural access route. Architectural setup also
loads the selected local player-body asset while intentionally leaving out dancers
and the resident DJ.

## Setups and runtime limits

- **Architectural**: shell and roof only; no event stage, event rig, crowd, or guests.
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
capacity or emission rate. The monumental wrap-around 64 × 16 curved LED wall
(38.4 × 8.6 m) uses the single-mesh/single-texture update path, while 272 addressable
linear LED battens are flush-mounted along the 40 radial roof trusses and concentric
rings as one thin-instanced draw call with radial waves, hub ripples, and turbine
chases. A dedicated **Gashouder** automatic program is beat-locked, host-synchronized,
and keeps the existing Safe Mode strobe suppression.

The integrated ceiling LED grid is an architectural roof-lighting system tailored to
the conical steelwork rather than dangling kinetic winch strips. Crowd count is
limited by the app's quality tier and the available animated characters; it does not
represent venue capacity.

The roof shell and event truss use merged static meshes; the animated strip display
uses thin instances. These are implementation optimizations, not measured headset
performance claims. No Quest 3/3S frame-rate benchmark has been run for this mode.
The current mode also omits a fixed bar, balcony/mezzanine, repeated interior arches,
basement and underground facility entrances; these remain distinct scope items,
not implicit reuses of NOCTURNE's similarly named features.
