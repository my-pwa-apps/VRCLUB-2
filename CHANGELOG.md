# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The cache token in `package.json` (`cacheToken`) identifies a deployed build; it is
kept in lockstep with `index.html`, `sw.js` and `serviceworker.js` by
`npm run version:bump` and enforced by a contract test.

## [Unreleased]

### Security

- The multiplayer relay now enforces a browser `Origin` allow-list, a 16-guest room cap,
  a 16 KB frame limit, per-connection rate limits with flood disconnects, an emoji
  allow-list, sanitised names and http(s)-only shared music URLs (requires a relay redeploy).
- First-party code no longer builds DOM from HTML strings; a contract test forbids it.

### Privacy

- **Music now starts on entry by default, and the default is the latest *Resident* episode by
  Hernan Cattaneo.** It replaces the SUNSHINE LIVE radio feed. The splash toggle ("Play music on
  entry") is ticked by default, still names the servers contacted (the podcast host and Podbean,
  which receive the guest's IP address) and can be unticked; that choice is remembered. The newest
  episode is resolved from the feed on every entry, so the default never goes stale, and one is
  never remembered as the guest's own "last stream" (a stream the guest picked themselves still is).
  The AudioContext is created inside the ENTER click so browsers allow autoplay; if playback is
  still blocked, the next click or key press starts it. **When an episode finishes the next older
  one plays**, and so on (a dead link is skipped); past the oldest one in the feed's first page
  (about 15) it checks the feed again, so a new release is picked up, and starts from the newest.
  Picking another stream or a file takes over and ends that chain. Previously a finished episode
  looped. This reverses the earlier privacy default
  (off until ticked) because it was asked for.
- Guests must choose **Listen along** before their browser loads a host's shared stream;
  hosts' local files (`blob:` URLs) are never broadcast.

### Fixed

- **The brick walls were stretched.** A box gives each face the whole texture once, however big the face, and on the side faces the texture ran sideways. The 45 m side walls smeared each brick about 3x and turned the courses vertical. The walls, brick fins, pillars and ceiling now get UVs from their real size (`_applyWorldUVs`): a 1.5 m tile on the walls, 3 m on the concrete, upright.
- **Strobes no longer read as the room being lit.** Switching strobes on from the menu hands the show
  over to manual mode, where they run on a free-running timer: a burst lasted 90 ms (7 frames in a
  headset) and the speed left behind by the last cue could fire them 7 to 9 times a second. A burst is
  now about 40 ms (3 frames at 72 Hz), the free timer never exceeds 3 flashes a second, turning
  strobes on by hand resets any leftover show speed to the default, and the headset flash level is
  matched to the desktop one (0.19 mean luminance, was 0.33).
- **The headset now antialiases geometry.** The VR pipeline ran with no MSAA ("the XR layer does its
  own"), but the layer's antialiasing never reaches the offscreen target the scene is drawn into, so
  only FXAA ran and the DJ, rails and truss stair-stepped. It now uses 4x MSAA (clamped to the GPU
  limit; `localStorage` `vrclub.vrMsaa` = 1, 2 or 4 overrides it). Not yet measured on a Quest 3S: if
  frame time suffers, set it to 2.
- **VR is no longer output at 10% brightness.** Fixtures, lasers and the LED wall looked like flat
  colour in the headset and did not light the room. The VR pipeline's sharpen stage was given a
  "colour amount" of 0.1, but that value is a brightness multiplier on the finished image, so the
  whole headset frame, and its peak white, were capped at a tenth. It is now 1.0, and VR exposure
  is retuned (1.35 to 0.6) so the headset frame is about 1.8x the desktop's mean luminance with
  full-scale highlights (it was 0.37x, with peaks around a tenth). Because the strobe impulse had
  been tuned under that cap it would now be a white-out, so it moved into `vrSettings.vr.strobeImpulse`
  and was retuned from measurements (flash about 0.3 mean luminance, 0.76 before). The desktop
  sharpen gain (0.5) has the same defect and is left unchanged for now; see `BACKLOG.md`.
- **Strobes no longer vanish when the frame rate dips.** A burst is only 20-90 ms long, and the
  flash timer was counted down before it was drawn, so on any frame longer than the burst (a
  loaded headset, or the emulator) it was lit and cleared in the same pass and never reached the
  screen. In the browser, with strobes forced on and Safe Mode off, no frame ever flashed on
  desktop or in VR; now they do (the VR frame is about 13x brighter while one fires). A burst is
  drawn for the frame it fires on whatever the frame time, then counts down as before. Cadence,
  intensity, the cues that use strobes and Photosensitive Safe Mode are unchanged.
- **The laser sheets no longer streak across the room, and hang lower.** Each sheet plane turned only
  ~2 deg/s, but the bright line where the two planes cross ran at a median 1.6 m/s and up to 7.5 m/s,
  and sat 3-5 m above the dance floor. The two projectors now aim further inward with a smaller
  phase offset and a lower pitch, so the crossing drifts at ~0.4 m/s (under 1 m/s at worst) and
  stays 2.0-3.6 m up, just over the crowd. The laser speed slider is capped for the sheets so it
  cannot undo that. A new test measures the crossing on the real geometry for every sheet look.

- The beat grid no longer stops in a kick-less passage: after 1.5 beats without a kick the
  tracker keeps counting at the tracked BPM, so cues no longer freeze mid-phrase during
  breakdowns. Real kicks are counted separately.
- The Show Director's colours were being overwritten: the spotlight palette cycler kept
  swapping the heads to the next palette entry every few seconds while the show was driving.
  It now stands down like the other legacy cyclers.
- The laser sheet no longer has a source behind the LED wall. It only hangs from the truss:
  the `liquidPlane` look now uses the left truss mount (vertical sweep), and the default and
  fallback origin is the left truss.
- Show cue changes no longer freeze the frame while shaders recompile. The six moving-head
  lights were enabled and disabled per cue, re-slotting every lit material (17–20 new shader
  variants and 0.4–1.1 s freezes per switch, measured). They now stay enabled and dim to zero.
- Two 1024² shadow maps (~134 casters each) are no longer rendered every frame on the ultra
  and high tiers; no material ever sampled them.
- Enter VR waits ("Preparing VR…") until the background DJ console and speaker models have
  loaded and compiled, instead of opening the headset into ~12 s of 250–600 ms stalls.
- A live stream that drops or stalls mid-session is reported and reconnected (up to three
  attempts); local files that cannot be decoded say so.
- Removed 19 LED wall patterns the playlist could never reach, including a 15 Hz full-wall
  strobe that ignored Safe Mode.
- Disposing the club releases the whole WebXR default experience and its controller observer.
- The desktop and VR frame rate is no longer capped below ~10 fps by eye adaptation. Writing
  `imageProcessing.exposure` every frame notified ~550 materials, each of which walked all
  ~1,100 meshes (104–130 ms per write, measured). Exposure now updates the post-process
  uniform without the material cascade; a strobe's exposure spike is no longer cancelled in
  the same frame.
- Mirror-ball ray casts are ~2.5x cheaper: the surface predicate, run for every scene mesh
  on every pick, now memoises its name match instead of rebuilding a keyword array.
- The desktop camera can no longer walk out through the front wall or fly over the 4 m
  collision band and through the side walls or roof; the visible shell and ceiling collide.
- VR jump (comfort off) follows real gravity (~0.45 m apex) at every refresh rate and lands
  at the player's own eye height; it was a ~1.2 m lift whose speed scaled with Hz and that
  re-seated players at 1.7 m.
- Photosensitive Safe Mode now also stops the dance-floor edge strip from strobing (~3 Hz)
  in the legacy show's strobe phase, reachable whenever the Show Director is switched off.
- The VJ beat envelope, master-intensity smoothing and Show Director energy follow wall-clock
  time instead of a per-frame step; onset detection no longer allocates a sorted copy per frame.
- Pressing Play resumes an AudioContext the browser suspended after the first track.
- Multiplayer: the microphone is released on a terminal relay close; a second Enable Mic
  click during the permission prompt can no longer leak a capture; late frames from a
  dropped session no longer create an avatar that never leaves.
- VR smooth locomotion, sprint, jump and the Y/B quick-menu binding work again. Babylon
  forbids MOVEMENT and TELEPORTATION together, so comfort mode now swaps the features
  instead of enabling both, and controller bindings no longer depend on locomotion.
- Remote guests stand on the floor (the wire's `y` is eye height), snap into place on join,
  turn the short way round, and disappear when the relay connection drops.
- WebRTC voice connects whichever guest enables the mic first, renegotiates a mic enabled
  later, and keeps listening while muted; remote voice is also bound to a muted media
  element for Chromium.
- PA speakers are no longer mirrored: the glTF handedness conversion is preserved instead of
  being reset and patched with a `scale.x = -1` on the DJ console.
- PA speaker textures load through the cached TextureLoader and never fall back to magenta.

### Added

- **Graffiti** on the walls: five CC BY 4.0 decal packs by karlwirbelwind (Sketchfab), packed into one 2048 px
  WebP atlas by `scripts/build-graffiti-atlas.mjs` and painted as one alpha-tested mesh (one draw call). The paint
  uses the wall's own brick normal map and mortar occlusion, so it follows every brick and joint. Credited in
  `#modelCredits`; provenance in `ASSETS.md`.

### Changed

- **Lighting rig pulled in over the dance floor**: the side cross beams, their six moving heads and the two
  side lasers moved from x ±8 to x ±7 (`CLUB_POSITIONS.sideTrussX`), 2.5 m clear of the balcony and the bar
  (was 1.5 m), still clear of the flown PA and the fog machines. The side lasers were also fixed: they were
  offset along the rotated beam's wrong axis and hung 2 m off it (x -10 and +6); they now hang on their beams.
- **Credits are a collapsed "ⓘ Credits & licences" disclosure** in the bottom-left corner instead of an
  always-open panel over the scene; the intro screen names every CC BY creator.
- **Renamed to NOCTURNE** everywhere a visitor sees the name: the intro screen, the browser tab, the
  page heading and the installed-app name (`manifest.json`; its `id` is unchanged, so installs update).
- **Wall art removed**: the two welded ring-and-bar sculptures (amber on the left wall, cyan on the
  right) are gone.
- **Lasers, ultra-realism pass** (ceiling beams and light sheet):
  - Beams were 4-8 mm cylinders, sub-pixel at club distances, so they aliased into dashed, crawling
    lines. They are now one camera-facing ribbon batch, never under a few pixels wide, with brightness
    divided by that widening, a Gaussian core and a faint scatter halo (15 draw calls -> 2).
  - Beams leave each projector's underside aperture and end on the wall, floor or ceiling they reach
    (the side units shone through the side walls), throwing a dot there.
  - Forward scatter (Henyey-Greenstein): a beam running toward you glows brighter than one seen side-on.
    Brightness follows the haze, never the fog colour, and decays slightly along the beam.
  - Diode colours (638 / 532 / 445 nm) instead of sRGB primaries; housings no longer glow.
  - The light sheet's smoke noise never showed (Babylon's noise writes alpha 1); it now does. The fan
    dims with distance from the projector, is brighter at its scan edges, reads as a bright line edge-on
    and a veil face-on, and runs on until it meets a surface.
  - Mirror-ball reflections are clipped to the real shell (ceiling 9.85 m, front wall), not the
    narrower walkable band, which had parked spots on invisible planes at y 8 and z -5.
- **Signage**: the generic CLUB, VR and DANCE neons are gone. The club's name, NOCTURNE, now hangs over
  the doorway inside the club as one 6 m neon piece facing the DJ and the dance floor, in widely tracked
  pink outline lettering. It is
  drawn into the existing signage atlas, so the signs remain two draw calls with no added light.
- **Babylon.js 8.30.5 -> 9.28.0** (vendored; the manifest hashes match the npm tarballs as well as the
  CDN). The 9.0 breaking change (TC39 decorators) only affects code that applies Babylon decorators to
  its own classes, which this app does not. With animation frozen, a desktop and an emulated-headset
  frame are pixel-equivalent to 8.30.5 (mean luma 6.12 vs 6.25 and 3.95 vs 3.97; the render-state
  snapshot is identical), the contract and unit tests pass, and the browser suite passes (the desktop-vs-VR image-structure check read r=0.67 once under load, then 0.87-0.89 on four reruns, as before). The cost
  is size: `babylon.js` 7.2 -> 8.4 MB and the glTF loader bundle 338 -> 829 KB. Dev tooling moved up too:
  Playwright 1.63, IWER 2.5 (its offset-reference-space bug is still there, so the harness shim stays),
  glTF Transform 4.5, ESLint 10 (needs Node 20.19+, so `engines` now says so) and Wrangler 4.141 in the
  worker lockfile. The cache token is bumped so returning visitors fetch the new runtime.
- Far lighter to load and to draw, with no visible change. The LED wall is one mesh coloured from
  a 21x10 texture instead of 210 planes (draw calls from the entrance view 564 -> 355; the wall
  210 -> 1). The two big models are optimised by `npm run optimize:models`: the DJ console's textures
  are 2048 px WebP instead of 4096, the speaker GLB carries no textures (the app already used
  external ones, which are resized), and 12.7 MB of unreferenced console textures are gone. Asset
  payload 65.3 -> 21.1 MiB; estimated GPU texture memory 1,450 -> 224 MB. `test/e2e/budget.spec.mjs`
  and a contract test guard both.
- The hall reads as an old factory: the dance floor is worn, patched, oil-stained concrete
  (Poly Haven `concrete_floor_damaged_01`, CC0) instead of clear-coated "wet" tiles, with
  no clear coat and a full-strength roughness map. Screen-space reflections now skip
  dielectrics, so only metal (truss, rails, DJ gear, mirror ball) mirrors the room.
  Rust-brown steel I-beam girders span the roof.
- The laser sheet has a projector on each side of the rear truss. Both stay hung; the
  active look decides which one emits, and the idle one parks with a dark aperture.
- Production deploys the built `dist/` from CI only after verify, e2e and audit pass.
- Material freezing is controlled by an explicit `mutable: true` option, not name matching.
- Every first-party script runs in strict mode in development, as it already did in the bundle.
- `init()` and `updateSpotlights()` are split into named per-phase methods.
- The audio panel reports offline/online transitions; the README documents offline use.
- **Photosensitive Safe Mode is never switched on automatically.** It used to turn itself on under
  `prefers-reduced-motion: reduce`; it is now off unless the guest turns it on. The photosensitivity
  warning and the opt-in stay on the splash before anything renders, a choice the guest makes is
  remembered, and the in-headset menu still has a SAFE MODE button. (Product decision; this
  deliberately reverses the earlier accessibility default.)
- **Strobes support the rest of the lighting.** They were solos in about 6% of the show's bars; they
  are now a once-per-bar accent under the heads, lasers and laser sheets through the groove and the
  build (37% of bars), for tension. The opening, the breakdown arc and the comedown stay strobe-free.
  Layered strobes stay at about 0.5 flashes a second at any tempo, and a unit test enforces it.

### Added

- **Bass bins under the PA.** Sketchfab's *Bass Bin 3 - Subwoofer* (CC BY 4.0, darksoundlab) now hangs on chains under each flown speaker,
  facing the room, shaded by the speaker's own accent light and credited in the product. The optimiser shrinks it from 4.7 MB to 1.6 MB and
  joins its 12 meshes to 6, so the two bins cost 12 draws. The loader derives their placement from each speaker's measured underside.
- **A steel mezzanine and stair.** A balcony along the left wall (deck at 3 m, rails, columns, X-bracing) overlooks the dance
  floor and is reached by a 16-step steel stair from the floor near the entrance; a high table and two stools stand on the
  deck, and a BALCONY camera preset (key 5, desktop panel, VR quick menu) puts you on it. Textures are Poly Haven *Metal Plate*
  and *Metal Plate 02* (CC0); the stools reuse the bar's model. Five merged meshes, one scoped accent light.
  `js/mezzanine.js` is new; `node scripts/build-mezzanine-assets.mjs` rebuilds the textures.
- **A bar and an entrance.** The front wall now has a 4 m doorway into a lit vestibule (red carpet, brass queue
  ropes, ticket desk, coat check, street door, ENTER/EXIT neon); the ENTRANCE destination puts you there. On the right wall
  stands a bar: a dark-wood counter (Poly Haven *Dark Wood*, CC0) with five Poly Haven *Metal Stool 03* stools, a
  back bar with three backlit shelves holding twelve recognisable bottle shapes (vodka, gin, rum, whisky, bourbon,
  tequila, champagne, three liqueurs, lager, wine) as one draw call, pendant lamps, a BAR neon sign and a female bartender
  (the Quaternius female guest in a black outfit). The talking pair of guests moved off the counter.
  `js/barProps.js` and `js/venueDressing.js` are new; `node scripts/build-bar-assets.mjs` rebuilds the Poly Haven assets.
- **Realism pass, phase 1.** The three wall signs now read CLUB, VR and DANCE (they were blank slabs, and none of them faced the room) and the two exit signs read EXIT; all five are one atlas and two meshes. Every character has a soft contact shadow, so people no longer hover. The reflection environment is a dim industrial interior (Poly Haven, CC0) instead of Babylon's sample sky, so metal picks up a believable cool reflection. The wall, floor and ceiling use one packed occlusion/roughness/metallic map each. Draw calls 347 -> 329, texture memory 224 -> 210 MB. `scripts/pack-orm.mjs` is new.
- **Guests off the dance floor.** Two new Quaternius characters (CC0, leather jackets, ~2.8 MB each,
  from Universal Animation Library 1 and 2) fill dance-floor slots and also stand by the side walls:
  a pair talking, someone on a call, someone watching with folded arms, one nodding along. They use
  the clips `Idle_Talking_Loop`, `Idle_TalkingPhone_Loop`, `Idle_FoldArms_Loop`, `Yes` and `Idle_Loop`;
  each character evaluates only the clip its slot asks for. 2 guests on the balanced tier (Quest), 4
  on high, 7 on ultra. The headset cost of the extra skeletons is unmeasured.
- Quaternius characters are cheaper to draw: the optimiser merges skinned parts that share a skin and
  a material, so a character is 6 meshes instead of about 12, and the existing dancers and DJ are
  smaller files (1.3-1.6 MB instead of 1.8-2.2 MB). Draw calls from the entrance view: 355 -> 347 even with the two guests added. A contract test keeps them that way.
- Spatial audio now sounds from the right side. Babylon is left-handed and Web Audio is
  right-handed, and every coordinate was passed through unconverted, so the PA, the crowd bed
  and guest voices were heard in the opposite ear to where they appeared (in the headset,
  turning right moved the stage to the right ear). `AudioUtils` now converts them, and the
  listener's up vector follows head tilt. Covered by unit tests and by
  `test/e2e/audio-spatial.spec.mjs`, which plays noise through the real graph.
- Headset-free VR coverage in the Playwright suite. `test/e2e/vr-session.spec.mjs` checks the
  spawn pose, headset and controller tracking, a ray-selected menu button, the 30 degree snap
  turn and teleport landing (including the DJ-platform blockers). `test/e2e/vr-parity.spec.mjs`
  compares the desktop and VR render state and image at one pose and fails on any
  undocumented difference. The IWER emulator is patched for its offset-reference-space bug.
- **The LED wall is now lit through most of the show, as an accompaniment.** It was dark for 76% of the
  show's bars (on for only 24%), so the beams, lasers and sheets played against a black back wall. It is
  now on for about 69%: `firstLight`, `sideways`, `crossfire`, `laserStorm`, `driftAway` and the three
  laser-sheet looks keep a lit wall at a reduced `ledLevel` (0.75 to 0.85), in a colour that complements
  the rig where there is one (teal against red heads). A dimmed wall eases in from dark rather than
  popping on under a beam cue. It stays dark only for the deliberate solos: the mirror ball, the strobe
  looks, the laser-sheet solo `liquidPlane`, `beamsOnly`, the comedown and blackout. A test fails if the
  wall's share of the show falls below 60% or a new look goes dark without being listed as a solo.

- **Warehouse shapes: the LED wall as a flashing, moving club screen.** Eight beat-cut programs - bars,
  blocks, rings, slats, diamonds, a scan, a checker and a radar - chosen on bar lines from the music's
  energy: a quiet groove gets big slow moves, a peak gets flashing shapes on every beat. It runs in one
  colour, in multi-colour (the wall colour, its complement and white) or in black and white, per look
  (`ledMulti` / `ledMonochrome`); six peak and breakdown looks now use it. Flashing is governed: at most
  one flash per 0.4 s whatever the tempo, shapes step at most 2.5 times a second, no program fills the
  wall, and Photosensitive Safe Mode keeps the motion but removes the flash. A test simulates tempos from
  96 to 200 BPM and fails if any of those limits is removed.
- **The LED wall can now complement the beams instead of always copying them.** Every look
  used to paint the wall in exactly the beams' colour. A look can now set `ledHarmony`
  (`analogous`, `complement`, `triad`, or `follow` to share the lasers' partner colour) and
  the wall takes that hue off the beams'. `theClimb` now builds red heads against a cyan
  wall, and `releaseHit` puts the wall and lasers in one colour against the heads. Looks that
  say nothing still match, and a colour-locked look always matches. Also fixed: the *breathing*
  wall ignored the show colour entirely (a fixed blue-to-red), so no harmony or colour lock
  could reach it; it now paints the colour it is given.
- **A real body for the player, and for other guests.** The local guest was a dancer clone
  replaying a slowed dance, and remote guests were a capsule and a ball. Both are now people
  on the same dancer skeleton, posed every frame by a new `AvatarRig` so you can move freely:
  feet plant and step at your actual speed, the hips follow your eyes (and turn in place),
  your head, neck and spine share the twist and pitch, arms swing against the legs, and
  crouching and flying follow your eye height. In VR the arms are IK'd to your controllers
  and the hands take their orientation. Looking down on desktop shows your chest, arms and
  boots rather than the inside of the shoulders. `vrclub.avatarStyle` (`female`/`male`)
  picks the body; `setLocalAvatarStyle()` switches it. Remote guests get the same body
  (first four; later ones stay capsules). A new headless test runs the real skeleton and
  fails on sliding feet, stretched limbs, a missing stride, or a rig slower than 2 ms/frame.
- **Underground Sequence, a basement film for the LED wall.** A 38-bar, six-scene pattern
  (index 18) replaces the rainbow spiral in the `theWave` look: DESCENT (a service tunnel
  with lamps rushing past), SIGNAL (an oscilloscope on a CRT graticule), CONCRETE (brutalist
  tiles igniting on the beat), HAZARD (warning chevrons behind a shutter), DATAFALL (terminal
  columns) and SUB (a liquid-light surface carried by the bass). Scenes change on the director's
  bar lines, dip through black, leave a phosphor trail, and restart at DESCENT whenever a cue
  hands the wall over. Amber appears only in colour looks; monochrome looks stay monochrome. A
  unit test simulates the whole loop and fails on any panel crossing half brightness more than
  3 times a second or any abrupt whole-wall step.
- **Smoke is lit by the beams it sits in (desktop).** Haze puffs and dust motes inside a
  moving-head cone brighten and take its colour with a forward-scatter phase term; dust is
  visible only in beams; beams read the density of the medium they cross.
- **The laser sheet now fires from both truss projectors at once.** It previously emitted from
  only one side at a time (the look picked which), so the other projector hung dark. Every
  sheet look now sends a fan from each side: the right one mirrors the left's sweep and
  trails it in phase, so the two planes scissor and cross over the dance floor. The fans share
  materials, so it adds two draw calls and no extra textures. A look can still pick a single
  side with `laserSheetOrigin: 'ceilingLeft' | 'ceilingRight'`.
- **Strobes are now a locked part of the show.** They used to fire on a random timer, so a
  flash never landed on the kick. Looks can set `strobeSync`: the peak's white chase and
  detonation hit on every kick (the chase steps the corners in order), a new
  *strobe floor* fires all four corners on every kick over a black room, a *strobe offbeat*
  chases between the kicks, and a *heartbeat* look puts one hit on each downbeat inside the
  build. The countdown's strobe ladder now climbs the grid: downbeat, every kick, then a
  kick-and-offbeat roll. Measured in the club on a 124 BPM kick: hits land at 0.07 of a beat
  after the kick (on-beat) and 0.58 (offbeat). Photosensitive Safe Mode still suppresses all
  of them, and the opening and groove stay strobe-free.
- **A breakdown arc for progressive sets.** The show now notices when the kick has been gone
  for ~two bars after a groove and plays *The Breakdown* for as long as it lasts: the floor
  drops out (blue mirror ball), a laser-sheet plane drifts over the crowd, the wall opens in
  teal aurora, then the rig winds up and the colour turns hot magenta. It is strobe-free.
  When the kick returns the show re-locks the bar grid to it and fires *The Release* (every
  system for one bar) straight into IGNITION. A sustained silence ends it in AFTERGLOW.
- AFTERGLOW now ends on *Sunrise*: a 16-bar amber aurora that warms and brightens.
- Looks can pin the master colour (`hue`), so a cue's colour is a design decision.
- **The kick now reaches the fixtures.** The look's punch scales a per-frame kick pulse that
  lifts the moving heads, their beams, the lasers, the laser sheet and the LED wall, and
  nudges the mirror ball's spin. Previously it only touched exposure, strobes and the
  ambient fill. The wall also shimmers slightly with the hi-hats. Halved in Safe Mode.
- **Latest Resident — Hernan Cattaneo** in the Audio menu plays the newest episode of the
  *Resident* podcast. On click it reads only the first 64 KB of the public RSS feed (one
  range request instead of ~2.6 MB) and streams the Podbean MP3, which sends CORS headers
  so the show reacts to it. `connect-src` allows `podcast.hernancattaneo.com` for this.
- A dropped on-demand episode reconnects at its playback position instead of restarting.
- Production browser coverage now verifies laser-sheet exclusivity, the exact moving
  strobe sequence, Photosensitive Safe Mode suppression, synchronized room colors,
  and the mounting point and motion axis of both ceiling-sheet variations.

### Fixed

- Moving heads now cast materially brighter, saturated direct light with stronger HDR
  lens cores, volumetric beams, and receiving-surface pools. Exposure adaptation and
  the existing indirect-bounce ceiling still preserve blackouts and room contrast.
  Beat punch now rides above a 65% output pedestal (75% without audio) instead of
  holding peak looks near half output between pulses.
- Mirror-ball cues no longer enable a late real SpotLight that invalidated frozen PBR
  light buffers and caused the DJ, dancers, and truss to disappear on desktop and VR.
  The existing emissive beams, reflected spots/rays, and room bounce retain the effect.
- Removed the ineffective audience blinder meshes, animation state, NOCTURNE cues and
  controls. Strobes remain the sole high-impact white fixture and stay governed by
  Photosensitive Safe Mode.
- Strobe impulses now illuminate frozen room materials through the always-compiled
  ambient fill and add a brief XR-rendered retinal glare veil. The local flash light,
  bloom and exposure spike remain, while Safe Mode restores every value immediately.
- The DJ now faces the dance floor instead of the LED wall. Laser-sheet cues now
  appear in every NOCTURNE movement, scan lower and more slowly, and illuminate
  short-lived, palette-synchronized smoke pockets inside the moving sheet.
- Animated NPC meshes and the merged/instanced ceiling truss are now exempt from
  unreliable stereo frustum rejection. Crowd animation LOD uses distance only instead
  of testing skinned hierarchy roots, preventing both systems from disappearing after
  sustained XR head movement.
- VR lighting now uses a brighter headset-specific exposure with stronger glow and
  a lower, still-controlled bloom threshold, restoring fixture and beam presence
  without applying the desktop pipeline's broad LED-wall wash.
- Moving heads now enable their real SpotLights when their beams are active instead
  of only changing intensity on permanently disabled lights. VR uses stronger real
  illumination, HDR lens cores, and soft beam-aligned glare driven by the active XR
  camera, so looking into an aimed fixture produces a white-hot source response.
- Pencil lasers now retain their physically narrow cores while using HDR emission and
  selective glow in VR. Mirror-ball incident beams, outgoing rays, reflected shafts,
  lenses, and source flares receive headset-specific brightness without adding lights.
- Strobes now fire as short 45-90 ms white bursts with a soft flare face, one brighter
  shared light, full transient bloom, and a brief exposure impulse instead of lingering
  grey rectangles. Photosensitive Safe Mode still suppresses the cue and immediately
  restores both bloom and exposure.
- Persistent VR smoke now retains enough ambient haze and floor-fog particles to stay
  visible between machine bursts, with a small headset-only opacity lift that is fully
  restored to desktop values on XR exit.
- NOCTURNE now repeatedly gives the LED wall, lasers, mirror ball, and moving heads
  exclusive passages. Nine recurring looks are single-subject cues; layered systems
  remain reserved for builds, transitions, and peak detonation/afterburn moments.
- NOCTURNE now includes recurring strobe-only clockwise chases, diffuse laser-sheet
  passages through the existing haze, and selected full-room color locks that align
  the LED wall, pencil lasers, moving heads, and mirror ball to one master hue.
- The existing laser-sheet effect is now constructed during startup, originates inside
  the rear wall, uses restrained additive haze scatter without writing depth, and no
  longer floods the dance floor like an opaque surface.
- Laser sheets now vary between the rear wall and left/right ceiling-truss mounting
  points. Authored cues move them slowly either vertically or laterally while reusing
  one transparent mesh and no additional GPU lights.
- VR now renders at a conservative 1.2x per-eye framebuffer scale with FXAA retained
  as a compositor-independent fallback, reducing jagged truss, rail, and fixture edges
  without enabling a heavyweight headset-only pipeline.
- Moving-head volumes no longer use a negative depth bias that distorted stereo
  occlusion, mirror-ball beam gradients now expose their alpha channel, and the frozen
  floor probe no longer captures a stale frame of the animated LED wall.
- The DJ avatar now faces the dance floor instead of the LED wall. Existing wall-neon
  planes are opaque and visible from inside the room rather than entering the VR
  transparency path or disappearing through back-face culling.
- Mirror-ball reflections now rotate with the ball's actual Babylon transform instead
  of sweeping in the opposite direction. Reflected shafts are correctly aligned to
  their Y-axis geometry, sparsely haze-gated, distance-faded, and terminate in soft
  projected spots. All four incident fixtures now render equally legible restrained
  shafts while only one consumes a real GPU light slot.
- Restored the four audience blinders that were still exposed in controls and NOCTURNE
  cues but had no meshes or update path. Strobes now use larger emitter faces and a
  synchronized burst clock so both fixture types produce readable hits.
- Moving-head beams now use lower-density atmospheric scatter, view-angle edge falloff,
  and a full fade before the receiving surface instead of reading as hard translucent
  cones.
- NOCTURNE now owns LED hue timing as well as pattern timing. The LED wall and mirror
  ball receive the VJ Director's phrase palette together, eliminating independent
  three/four-second color clocks that broke authored looks mid-cue.
- Model and avatar teardown now releases owned containers and procedural hierarchies;
  disposing during a GLB download also aborts the body read.
- IndexedDB quota recovery now selects timestamp-indexed keys instead of deserializing
  every cached binary payload into memory.
- Service-worker updates wait for an explicit **Reload now** action instead of ejecting
  users from an active desktop or XR session.
- Exiting XR preserves static material freezing, and the audio overlay rejects duplicate
  activation.
- Development dependency advisories were cleared, including a tested `sharp` override for
  the glTF optimization toolchain.
- Balanced and high graphics tiers instantiate only their visible crowd during startup;
  raising quality creates the missing dancers on demand.
- **Photosensitive Safe Mode is now reachable before the strobes fire.** A warning and
  an opt-in toggle sit on the splash screen, the preference defaults to on under
  `prefers-reduced-motion`, and the in-app control is the first section of a panel that
  can now actually be scrolled. Previously the only control was clipped off-screen on any
  viewport under ~1070 px tall.
- **The audio button is on screen.** `margin-bottom: -60px` (a workaround for a collision
  with the camera bar) had pushed ~90% of it below the viewport.
- **`updateAnimations()` now runs before `scene.render()`**, removing a permanent
  one-frame lag from every fixture, the head-bob and the eye adaptation.
- **Beams no longer disappear permanently**: two unclamped `Math.acos()` calls could write
  NaN into a pooled quaternion, poisoning the world matrix for the rest of the session.
- **The device light budget now reaches the GPU.** The clamp was suppressed by
  `blockMaterialDirtyMechanism` and by material freezing; unblocking it naively then
  produced a continuous `GL_INVALID_OPERATION: uniform buffer too small`. Both are fixed
  and verified at runtime (0 of 477 lit materials over budget).
- **The PWA works.** The service worker precached unversioned URLs the page never requests
  (so every core asset downloaded twice and nothing was ever served from cache), was copied
  unmodified into `dist/` where all its paths 404 (and `addAll` is atomic, so production
  precached nothing), cached ~100 MB of binaries IndexedDB already owned, and had an
  offline fallback that could never hit. It now caches an app shell whose URLs are generated
  by the build, and ships an update prompt instead of hot-swapping the controller.
- **Production can no longer silently lose a source file**: the bundler derives the script
  list from `index.html` instead of keeping a second, untested copy.
- Nine frame-rate-independence violations; `dt` was also 4% short of real time.
- A shared `lastColorChange` property meant neither the spotlight nor the LED palette
  cycler honoured its own interval.
- The dance-floor LED strip divided an already-normalised audio value by 255, making it
  non-reactive and brighter with no audio than with it.
- Strobing spotlights never dimmed their actual `SpotLight` (a dead assignment 350 lines
  from its overwrite), so the floor never went dark between flashes.
- The strobe bloom spike was never restored when safe mode was enabled mid-flash.
- Sub-woofer grilles latched at their last excursion whenever bass stopped.
- `dispose()` leaked seven categories of GPU and host resource, including a whole second
  HDR pipeline when disposing during a VR session.
- VR jump and sprint were dead in every session after the first.
- The RETRY button hung the app forever instead of retrying.
- `ModelLoader` left orphaned geometry *and* a duplicate model in the scene on any
  post-load failure.
- `TextureLoader`'s reference count did not count references (a use-after-free trap).
- The fetch deadline did not cover the response body, so a stalled download hung startup.
- IndexedDB writes resolved before commit, silently losing quota errors.
- `LightFactory.disposeGroup()` skipped every other light.
- The `forced-colors` media block targeted class names that do not exist in the document.

### Added

- A camera-relative VR quick menu opened with the Quest `Y`/menu button. Controller
  rays can toggle spots, lasers, mirror ball, strobes, blinders, LED wall and smoke,
  advance the LED pattern, or close the panel from anywhere in the club.
- Photosensitivity warning and splash-level Safe Mode opt-in.
- Keyboard shortcuts: `Space` play/pause, `B` blackout, `F` drop, `1`–`4` camera presets.
  The debug overlay moved from a bare `D` (which collides with the movement keys) to
  `Ctrl+Shift+D`.
- A RESET button restoring documented VJ defaults, volume control, a now-playing readout,
  and persistence of the last stream URL.
- Real PWA icons (192/512/maskable) generated by `npm run icons`, plus `id` and `scope` —
  the app was not previously installable.
- `LICENSE` and `ASSETS.md` recording the licence and provenance of every shipped binary.
- `_headers` for static hosts, which send no `frame-ancestors` of their own.
- CI: a Windows matrix leg, a 75 MB payload budget, `npm audit`, and build artifacts.

### Changed

- The PBR environment texture is vendored; the critical path is now entirely same-origin
  and a contract test enforces it.
- Deploy payload reduced from 109.5 MB to 60.9 MB by shipping only referenced model assets
  and deleting ~30 MB of unreferenced and duplicated files.
- "Enter VR" is a top-level control with a real capability check; the settings panel that
  contained nothing else was removed.
- The DOM and in-world VJ surfaces now delegate to shared `VRClub` methods instead of
  reimplementing the same actions differently.
- Cycling controls keep their value in the label instead of reverting after 1.5 s.
- Accessibility: `aria-pressed` on every toggle, named sliders with `aria-valuetext`,
  `role="group"` instead of a contradictory `role="dialog"`, `inert` main content behind the
  splash, 44 px targets, and a non-colour active-state marker.
- Responsive breakpoints and safe-area insets (the stylesheet previously had none).
- 16 source-scanning tests replaced with behavioural ones, including a smoke test over all
  37 LED wall patterns and a guard against reintroducing a fixed 60 fps frame step.
- `npm start` no longer serves source files with a one-year `immutable` cache header.

### Added (earlier in this cycle)

- The official SUNSHINE LIVE Techno radio feed now starts when the guest enters the
  club, providing audio-reactive music by default while remaining replaceable from
  the audio panel.

### Changed

- Aligned desktop and DJ-table VJ controls with the implemented four spotlight
  patterns and core fixture capabilities; Safe Mode now suppresses moving-head flashes.
- Camera viewpoints now collapse behind a compact camera button and close after selection.
- Synchronized PA collision volumes and documentation with the existing rear-truss rigging.
- Restored desktop/VR scene parity: the XR camera now receives bloom and tone
  mapping, runtime fixture materials remain animated, VR haze uses its configured
  density, and entering XR no longer removes mirror-ball reflections.
- Removed the obsolete right-wall bar that was mostly hidden by desktop camera
  framing but prominent from the XR dance-floor spawn.
- Restored overhead rig visibility and LED-wall clarity in XR by keeping native
  render scale, moderate foveation and normal scene semantics; mirror-ball rays
  now hit non-interactive structure and use headset-readable beam intensity.
- Replaced 11 stale and redundant camera presets with four immersive viewpoints
  aligned to the current entrance, dance floor, DJ booth, and lighting rig.
- Split the VRClub monolith into 11 focused source layers and added a content-hashed esbuild production bundle.
- Reduced static scene submissions, tiered mirror-ball reflections, and removed recurring spotlight/LED allocations.
- Added runtime tests, CI, ESLint, startup progress, accessibility improvements, vendored Babylon, and compressed avatars.

## [1.1.0] - 2026-07-29

### Added

- Self-hosted Babylon.js bundles under `js/vendor/`, removing a hard third-party
  dependency from first load. (There is deliberately no CDN fallback: a contract test
  forbids one, so an outage cannot silently change what the app is running.)
- Real-time shadow generators on the DJ key light and two truss spots, so the
  existing contact-hardening / tier plumbing finally has something to act on.
- Determinate startup progress: `init()` publishes stage progress and the splash
  screen renders a bar and a stage label.
- `js/ledPatterns.js` — the ~45 LED wall pattern functions extracted from the
  monolith into a data-driven registry.
- Per-system update methods (`updateMirrorBall`, `updateSpotlights`, `updateStrobes`,
  `updateLasers`, `updateLaserSheet`, `updateFogMachines`, …) sharing one per-frame
  context object.
- Runtime unit tests (`test/unit.test.mjs`) covering `_isSafeAudioUrl()`,
  `MaterialFactory._cacheKey()`, `InFlightRegistry.run()` and ShowDirector ramp
  resolution and movement selection.
- GitHub Actions CI running `npm run check`, `npm run lint` and `npm test`, plus a
  separate Subresource Integrity verification job.
- ESLint flat config (`npm run lint`).
- `npm run version:bump` — rewrites every `?v=` cache-busting token in one step.
- Keyboard support for the VJ, audio and settings panels: Escape to close, focus
  moved into the panel on open and restored to the trigger on close.
- `<main>` landmark and a heading hierarchy for screen-reader navigation.

### Changed

- Crowd size now responds to a runtime graphics-tier change instead of being fixed
  at load.
- The reflection probe is rebuilt at the new resolution when the tier changes.
- Spotlight pan/tilt smoothing is frame-rate independent.
- `ModelLoader` takes an explicit `maxLights` instead of falling back to a
  hard-coded `3`.
- The duplicate stream-URL control in the settings panel was removed; the audio menu
  is the single entry point.
- `startAudioStream()` and `startAudioFromFile()` share one `_playAudio()`
  implementation.
- `scripts/serve.mjs` resolves symlinks and re-asserts the document root before
  streaming a file.
- `docs/` pruned: seven self-declared archival files removed, the rest explicitly
  labelled current or archived in `docs/README.md`.
- README expanded with architecture, Quest testing and troubleshooting sections.

### Removed

- `npm run serve` (undocumented `python -m http.server` duplicate of `npm start`).
- Dead code markers: commented-out laser-sheet assignments, `void metallicPath;`,
  the duplicated `ceilingY` constant and the unused `TEX_DEBUG` flag.

## [1.0.0] - 2026-07-28

Initial documented baseline: Babylon.js 8.30.5 WebXR nightclub with the NOCTURNE
composed light show, graphics quality tiers, shared asset cache and the contract
test suite.
