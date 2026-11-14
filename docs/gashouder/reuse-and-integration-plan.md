# Gashouder reuse and integration plan

## Integration boundary

Gashouder is a separate `venueId`, selected independently of the default
NOCTURNE venue. The classic-script contract remains: the venue mixin is loaded
before `club_hyperrealistic.js` composes `VRClub`, and `_buildVenue()` branches
before NOCTURNE-only dressing is created.

The setup uses these existing seams:

1. `VRClubCore` resolves the venue/setup selection and provides per-instance
   room bounds and acoustic positions; it leaves the module-level NOCTURNE
   `ROOM_BOUNDS`, `ROOM_INTERIOR`, and `CLUB_POSITIONS` unchanged.
2. `ModelLoader` remains the only GLB loader. Gashouder filters the model set and
   clones each placement/rigging object before applying venue coordinates.
3. `VRClubLifecycle._buildVenue()` calls the Gashouder geometry and lighting
   builder instead of creating rectangular NOCTURNE walls, bars, mezzanine, and
   restroom. The default NOCTURNE path is unchanged.
4. Crowd, local-body, DJ, lighting, VJ, show, and audio systems remain shared.
   Venue-specific positions are supplied at the existing configuration boundary
   rather than by forking those systems.
5. Disposal removes the Gashouder LED observer explicitly before scene teardown.

## Runtime contracts

- Architectural setup has no stage, event rig, dancers, guests, or resident DJ.
  The local player body remains available.
- The 1.8 m stage has a six-step access route; its step tops are walk/teleport
  surfaces. The desk, DJ placement, and DJ viewpoint use the same stage datum.
- Spotlight rays use the circular shell, inferred roof, floor, stage and desk
  surfaces. They do not inherit NOCTURNE balcony/bar slabs or rectangular wall
  planes.
- Laser-sheet projectors are mounted at the configured event-ring points and aim
  toward the stage.
- The right DJ monitor is instantiated by the shared dressing helper in setups
  that include the stage. Its geometry and acoustic panner use the same
  venue-specific monitor layout.
- The animated LED strip observer uses reused scratch objects, responds to
  established lighting controls, and is omitted from the frozen floor probe.
- A venue change or reinitialization must not leave the global NOCTURNE room
  dimensions modified.

## Validation and extension guidance

Focused tests cover immutable source model configs, the open main doorway and
lintel, structural-joint coverage, stage access geometry, crowd bounds, and the
venue setup limits. Repository checks and the production build remain required
after changes to classic scripts or script ordering.

The current mode is a main-hall reconstruction. Add bars, balcony/mezzanine,
interior arches, basement features, and corresponding density zones only after
obtaining suitable plans and deciding how those new surfaces affect navigation,
audio, ray intersections, lighting, and the Quest draw/instance budget. Avoid
calling NOCTURNE dressing helpers merely to fill the Gashouder scene.

Quest performance is a release-validation item, not an integration assumption.
Run a separate physical Quest 3/3S measurement with the Awakenings-inspired
setup, crowd, haze and lighting active before making frame-rate claims.
