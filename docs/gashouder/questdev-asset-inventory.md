# Gashouder asset inventory

This inventory records what the Gashouder setup actually reuses from the
QuestDev application and what it builds specifically for this venue. Licences and
full attribution are maintained in [`ASSETS.md`](../../ASSETS.md); this file is a
venue-level selection and integration record, not a replacement for that ledger.

## Reused and adapted

| Classification | Asset/system | Gashouder use | Notes |
| --- | --- | --- | --- |
| Reused, shared | `textures/walls/` | Brick wall material | Poly Haven, CC0 1.0; UVs are retiled per wall panel and pier. |
| Reused, shared | `MaterialFactory`, `TextureLoader` | Brick, ceiling, steel, truss, stage and fixture materials | Shared material presets and loaded texture sets; no duplicate asset pipeline. |
| Reused, adapted placement | `js/models/djgear/source/pioneer_DJ_console.glb` | DJ console on the 1.8 m stage | CC BY 4.0; placement is cloned and adjusted per venue. |
| Reused, adapted placement | `js/models/paspeakers/source/stage_speaker___black.glb` | Flown left/right PA | CC BY 4.0; model, top height and rigging anchor are Gashouder-specific. |
| Reused, adapted placement | `js/models/bassbin/source/bass_bin_3.glb` | Bass bins below the PA | CC BY 4.0; existing hang-from-speaker path is retained. |
| Reused, adapted placement | `js/models/monitors/source/monitor_speaker.glb` | DJ monitor pair | CC BY 4.0; existing right-side instance and cabling helper are retained with a venue layout. |
| Reused, configured | `js/models/avatars/club-crowd-*.glb` | Dancers and idle guests | CC0 Quaternius-derived files; shared AssetContainer/skeleton system, Gashouder slots. |
| Reused, configured | `club-dancer-female.glb`, `club-dancer-male.glb` | Local player body | CC0; requested independently of dancer count so the architectural setup can still embody its player. |
| Reused, adapted | `AvatarRig`, `DJPerformer` | Local player body and live DJ pose | Existing tracked-arm and controller-reaching behavior; stage height and desk bounds are venue-aware. |
| Reused, adapted | Moving heads, strobes, lasers, mirror ball and haze in `js/club/05-fixtures.js`, `06-effects.js`, `08-animation-fixtures.js` | Gashouder event lighting | Shared effect/animation systems; fixture mounts and surface resolution are venue-specific. |
| Reused, shared | `VJDirector`, `ShowDirector` | Live show cues and manual controls | Existing show state is preserved; venue LEDs honor blackout, master intensity and safe mode. |
| Reused, shared | `ModelLoader` | GLB loading, caching, placement and disposal | A filtered, cloned per-instance config is used; NOCTURNE model config objects are not mutated. |

## New procedural geometry

`js/gashouderVenue.js` generates the polygonal wall shell, door openings and
frames, inferred roof panels and steel members, main stage and its access steps,
circular event truss, and the 49-strip LED analogue. These are scene geometry,
not new third-party assets. The LED display is a thin-instance visual reference;
it does not recreate winches, hoists, safety systems, or their motion control.

## Deliberately not reused in this venue mode

The NOCTURNE bar, lounge, street, restroom, rectangular LED wall, rectangular
mezzanine, and NOCTURNE-only fixtures are not placed by the Gashouder scene builder.
Their meshes, locations, and walk surfaces do not represent the Gashouder hall.
The current reconstruction also does not include a fixed bar, a balcony or
mezzanine, repeated interior arches, a basement, or visible underground
facility entrances. Do not treat those features as complete because the source
application contains analogous NOCTURNE systems.

## Performance and provenance

Static roof/truss geometry is merged; the 49 animated strips share one thin-instance
mesh and material. Character and model downloads use the existing cache and
AssetContainer paths. These are implementation choices, not a Gashouder Quest
benchmark. No Gashouder-specific Quest 3/3S frame-time, memory, or thermal capture
has been recorded.
