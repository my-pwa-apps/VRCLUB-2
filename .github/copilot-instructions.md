# VR Club — AI Coding Agent Instructions

> **Accuracy contract**: this file describes the code as it exists. If you change the
> architecture, update this file in the same commit. A previous version of this document
> described a `js/systems/` module layer and `ModelLoader.createInstance()` APIs that do
> not exist, which actively misled agents working in the repo.

## What this is

A **client-side WebXR nightclub** built with **Babylon.js 9.28.0**, targeting Meta Quest 3S
and desktop browsers. Server-side code in `worker/` comprises the optional multiplayer
relay and Stripe/invitation VR entitlements (D1); desktop preview stays client-side and free.
Development sources are classic `<script>`
files that publish classes onto `window`; `npm run build` preserves their tested order and
emits one minified, content-hashed production bundle with esbuild.

## Load order is a hard contract

`index.html` loads scripts synchronously in this exact order:

1. `js/vendor/babylon.js` — pinned Babylon 9.28.0 runtime
2. `js/vendor/babylonjs.proceduralTextures.min.js`
3. `js/vendor/babylonjs.loaders.min.js` — **required** for `.glb`
4. `js/assetCache.js` — `IndexedDBAssetCache`, `InFlightRegistry`, `fetchWithTimeout`
5. `js/audioUtils.js`, then `js/musicLibrary.js` (`window.MusicLibrary`: user-provided direct audio, relay-resolved Miss Melera Colourizon links and official-player fallback for other SoundCloud saved sets)
6. loaders/factories (`textureLoader`, `modelLoader`, `materialFactory`, `lightFactory`)
7. `js/vjDirector.js`, then `js/showDirector.js`
8. `js/ledPatterns.js`, then `js/barProps.js` (bottle geometry and label atlas; no club dependency), then `js/venueDressing.js` (entrance stair hall and bar), `js/mezzanine.js` (steel balcony and stair, and the walking-surface follow) and `js/cityDistrict.js` (the street outside, at street level) and `js/vjDesk.js` (the VJ desk's two touch panels at the DJ table), all mixed into `VRClub.prototype`
9. `js/avatarRig.js` (the local player's procedural body), `js/djPerformer.js` (the DJ's live set, posed through the rig), `js/crowdDance.js` (the crowd's choreographer), `js/minglerClock.js` (the shared room-time round), then `js/networkClient.js`, `js/avatarManager.js` and `js/multiplayer.js` (`ClubMultiplayer`) — optional multiplayer (no instance until a guest connects)
10. `js/club/01-core.js` through `js/club/11-audio-crowd.js`, in numeric order
11. `js/club_hyperrealistic.js` — final public `VRClub` bridge and LED mixin
12. `js/paymentGate.js` — public `window.VRPayment`, verified access/device management and prepared VR leases
13. `js/ui-init.js` — instantiates `new VRClub()`

`npm test` enforces this ordering, plus "every referenced script exists" and "every class
is exported onto `window`". Run it after touching `index.html` or adding a file.

Every source asset URL in `index.html` carries a shared `?v=` cache-busting token. The test
suite fails if the tokens diverge. Production uses content-hashed app and CSS filenames.

## Commands

```powershell
npm start        # dependency-free local server on :8000
npm run build    # content-hashed production site under dist/
npm run start:prod  # build + dependency-free dist server honouring $PORT
npm run check    # node --check every JS file
npm test         # contract test suite (test/contract.test.mjs)
npm run optimize:models  # idempotent model/texture shrink; `-- --check` fails if anything would change
npm run test:e2e # Playwright: production build in Chromium, with a Quest 3 emulated by IWER
```

The e2e suite needs no headset. `test/e2e/support.mjs` injects IWER (`iwer`, a WebXR runtime
emulator) as a Quest 3 with two controllers; it also patches IWER 2.3.0's
`getOffsetReferenceSpace()`, which stores the `XRRigidTransform` instead of its matrix and so
ignores every origin offset (teleport, snap turn and `xrCamera.position` writes would silently
do nothing). Drive input with IWER's ids (`thumbstick`, `trigger`, `y-button`), not the
`xr-standard-*` ids Babylon uses. `test/e2e/vr-session.spec.mjs` covers spawn, tracking, ray
select, snap turn and teleport; `test/e2e/vr-parity.spec.mjs` compares the desktop and VR
render state and image at the same pose. The emulator renders mono at 1280x720 on SwiftShader:
it proves behaviour, not headset frame time or stereo comfort.

HTTPS is not needed locally; the Quest browser allows WebXR over `http://localhost` and
over your LAN IP.

## Architecture

### `js/assetCache.js`
Shared caching primitives used by both loaders:
- `IndexedDBAssetCache` — never rejects on init, wires `tx.onerror`/`tx.onabort`/`request.onerror`,
  TTL-expires entries, and **degrades to download-every-time** on `QuotaExceededError`
  instead of breaking startup.
- `InFlightRegistry.run(key, factory)` — de-duplicates concurrent downloads of the same URL.
- `fetchWithTimeout(url, { timeoutMs, ...init })` — `AbortController`-backed hard deadline.
- `fetchAssetFingerprint(url)` — the server's ETag / Last-Modified / length for a file (a HEAD with `cache: 'no-cache'`),
  or null when unknown (offline, no validators). `IndexedDBAssetCache.put(url, payload, meta)` stores it beside the
  payload and `getRecord(url)` returns both. **`ModelLoader.loadOrDownloadModel()` uses a cached GLB only while its stored
  fingerprint matches the server's** (or the server cannot be asked); otherwise it downloads again with `cache: 'no-cache'`.
  An entry stored without one counts as changed. The cache is keyed by URL and GLBs are rebuilt in place, so before this
  a returning visitor kept the old street (pavement over the new entrance stair) for the 30-day TTL. `scripts/serve.mjs`
  sends a weak ETag and Last-Modified on every file; GitHub Pages sends its own. Textures do not do this yet (see below).

Any new network-backed asset type should reuse these rather than hand-rolling IndexedDB.

### `js/club/` and `js/club_hyperrealistic.js`
The VRClub implementation is an 11-layer inheritance chain grouped by lifecycle,
rendering, environment, fixtures, animation, UI, and audio/crowd responsibilities.
Layers stay around 1,500 lines (`08-animation-fixtures.js` is the largest at ~1,600), and no
function in `02-lifecycle.js` / `08-animation-fixtures.js` exceeds ~215 lines. `init()` and
`updateSpotlights()` are orchestrators over named per-phase methods; add new phases as
methods rather than growing them again. `club_hyperrealistic.js` defines the final public class and
mixes `window.LEDPatterns` into its prototype. `updateAnimations()` is a thin orchestrator.

Key lifecycle members:
- `this.initPromise` — the constructor stores `init()`'s promise; failures surface a retry
  splash via `_handleFatalInitError()`. **Never** drop this promise.
- `this.ready` — `true` once `init()` resolves. The DJ console and PA GLBs keep loading after
  that (`this.modelLoadPromise`); `#vrButton` reads "Preparing VR…" until they settle and
  `scene.whenReadyAsync()` resolves (30 s ceiling), because their main-thread parsing stalls
  frames. It is the only XR entry point (`disableDefaultUI: true`).
  It is hidden until immersive-VR support is confirmed. Unsupported devices keep the
  **Access** menu for account/device management but cannot prepare VR.
- `dispose()` — stops the render loop, removes listeners, closes the `AudioContext`,
  revokes blob URLs, tears down the UI timers and disposes scene + engine.
- `visibilitychange` stops the render loop when the tab is hidden and not in VR.
- `engine.onContextLostObservable` shows a toast and reloads (the engine runs with
  `doNotHandleContextLost: true`).

### `js/ledPatterns.js`
The LED wall's 20 `pattern*` implementations (exactly the playlist in `updateLEDWall()`;
unreachable patterns were deleted, including a 15 Hz full-field strobe) plus `updateLEDPanel()` and the two stateful
palette/shape helpers. It publishes `window.LEDPatterns`; `club_hyperrealistic.js` mixes
that map into `VRClub.prototype` after defining the class, preserving the club instance
as `this` without wrappers or call-site changes.

`patternUndergroundSequence` (index 18, the `theWave` look) is a 38-bar, six-scene film
(DESCENT, SIGNAL, CONCRETE, HAZARD, DATAFALL, SUB) clocked from `vjDirector.beatNumber` /
`barPhase`, so scenes change on bar lines. Rules when editing it: every scene writes a shared
"fresh" buffer and one persistence pass gives the phosphor trail; scenes dip through black
rather than cut; nothing may flicker above 3 Hz per panel or step the whole field abruptly
(`test/unit.test.mjs` simulates the full loop and enforces both); and the restart-at-DESCENT
check keys off the scene frame counter, never wall-clock time, because a slow frame must not
restart the film. New patterns are appended to the playlist: looks refer to them by index.

`patternWarehouse` (index 19) is the wall as a club screen: eight beat-cut shape programs
(bars, blocks, rings, slats, diamonds, scan, checker, radar) picked on bar lines from the
music's energy (the Show Director's slow EMA blended with live bass). One colour, multi-colour
(`ledMulti`: the wall colour, its complement `ledAccentColor`, white-hot) or black and white
(`ledMonochrome`). It is the only pattern allowed to FLASH, and the flash is governed:
the room-wide `VRClubCore._tryClubFlash()` gate accepts its flash at most every 0.4 s
whatever the tempo, shapes step at most 2.5 times
a second (every other beat above 150 BPM), no program lights more than ~85% of the wall, and
Photosensitive Safe Mode keeps the motion but removes the flash (slow attack, lower peak,
lifted floor; nothing crosses half brightness). `test/unit.test.mjs` enforces all of it with
failing-when-removed checks on the gap, the stride and Safe Mode. Never raise a rate, add a
second flash source, or make a program change on every beat of a fast track without re-running it.

### `js/avatarRig.js` — the player's body
`AvatarRig` poses ONE person on the shared UE-mannequin dancer skeleton (`club-dancer-female`,
`club-dancer-male`, `club-dj-male`, `club-dj-female`). Those GLBs carry only a
dance or DJ-idle clip, so there is nothing to play for walking, turning or reaching: the rig
poses the skeleton every frame from where the player is, where they look and (in VR) where
their hands are. `VRClub._updateLocalPlayerBody()` builds the local pose from the camera and
the XR controllers. Remote guests keep their assigned modular skeleton: `AvatarManager` plays
its clips and uses `AvatarRig.createTrackedArms()` for an arm-only view of that existing body.
The helper reuses the world-matrix cache, two-bone IK and hand orientation methods without
creating a second avatar, disposing clips, cloning materials or changing the lower body.

What it does: planted gait (stance feet slide back at exactly the player's speed, swing feet
lift and step, two-bone IK to the ankles), hips that follow the eyes with a dead-zone and a
turn-in-place, head/neck/spine sharing the remaining twist and pitch, arm swing against the
legs, VR arms IK'd to the controllers with the hand taking the controller's orientation,
crouch and flight from the same root-height maths, and the torso backing off as you look
down (the body mesh is open at the neck).

Rules when editing it:
- **World-space rotations only.** Every pose step is "rotate this world vector onto that
  one", converted to a local quaternion through the parent's world matrix. Never assume which
  bone axis is forward, and never reintroduce per-bone Euler maths. Facing and which side is
  "left" are measured from the skeleton at construction (`yaw0`, `yawDir`, `sideL`).
- **It owns a world-matrix cache** (`W`, `pos`, `Lq`). Calling Babylon's `computeWorldMatrix`
  per rotation cost ~3,400 calls and 5 ms a frame; the cache costs ~0.25 ms. Only the final
  quaternions are written back to the nodes, once per frame.
- **Share the crowd's materials.** Do not clone them: a cloned PBR material clones its
  textures, which never become ready for an embedded GLB image, so the mesh silently never
  draws (`Mesh.render` is still called, which is misleading). A per-guest tinted copy was
  measured at 38 new shader effects and ~3 s of invisibility for three guests.
- No per-frame allocation, and nothing in it may toggle a light or touch a material.
- VR hands are written against the WebXR pointer pose (forward and up) and have only been
  exercised with synthetic poses. Check them on a headset before trusting the roll.
- `test/rig.test.mjs` runs the real Babylon and the real GLB headless (no stubs, because a
  stub cannot tell a sliding foot from a planted one) and enforces planted feet, a real
  stride, rigid limbs, head tracking, the turn dead-zone, crouch, reach and a 2 ms ceiling.
- `pose.lean` (optional, 0..0.6 rad, default 0) bends the spine forward over the hips (spine_01/02/03 share it
  0.4/0.35/0.25). The head stays over the eye point, so leaning moves the HIPS back. Only the DJ uses it.

### `js/djPerformer.js` — the DJ at the decks
`DJPerformer` is pure behaviour (no Babylon): each frame it turns the music and the people near the booth into an
`AvatarRig` pose. `VRClub._spawnPerformingDJ()` builds the rig on the DJ's container (falling back to the file's
`Idle_Loop` clip if the rig refuses it) and `_updateDJ(dt, audio)` (from `updateDancers`) feeds it `beatPhase` (from
`barPhase`), `bar` (`vjDirector.beatNumber / 4`), the kick band's `energy`, `bpm`, a `drop` edge (the show's `release`
set-piece starting or the movement entering `ignition`) and the visitors (this guest and every remote guest).
- Activities: `mix` (jog wheel + a mixer knob), `cue` (a headphone cup held to the ear), `tweak` (both hands on knobs),
  `crowd` (looking out, a fist pumped when energy > 0.6), `handsUp` (on a drop) and `wave` (at a visitor who walks into
  the zone in front of the booth, once per `WAVE_COOLDOWN` = 45 s each). Activities change ONLY on bar lines, except the
  drop and the wave, which cut in. With no music it keeps its own 118 BPM and never throws its hands up.
- On every beat a nod and a knee bounce, both deeper with energy. Everything is eased; the pose object and its hands are
  reused (no per-frame allocation).
- **Placement is measured, not guessed.** The desk is `console_final`'s world bounds (`_djDesk()`, with a fallback);
  the DJ's eyes stand 0.18 m behind its near edge on the 0.5 m riser, eyes at 93% of the look's height. Both DJs' arms
  (~0.49 m shoulder to wrist) reach every knob only from there with the activity's lean; further back they stop short.
  `test/rig.test.mjs` drives both DJ GLBs on the real Babylon and fails if any knob or jog target is missed by 3 cm, the
  hips enter the table (z -19), a foot leaves the riser or a frame costs over 2 ms. Retune against it, not by eye.
  Headset cost is unmeasured (~0.05-0.3 ms a frame on desktop SwiftShader).

### `js/crowdDance.js` — the crowd dances on the beat
The Quaternius dancer files (not the three Mixamo files, not the guests) carry nine authored moves: the retargeted
`Dance_Loop` and eight procedural grooves (`Groove_Bounce`, `_SideTap`, `_Clap`, `_Pump`, `_Twist`, `_HandsUp`, `_Sway`,
`_Still`) authored by `synthesize()` in `scripts/build-crowd-glbs.mjs` straight onto the modular rig: hips, spine and
head angles plus wrist and ankle targets solved with two-bone IK, at `GROOVE_BPM` 120 and `GROOVE_FPS` 20, every loop a
whole number of beats with a beat on its first key. A groove drives EXACTLY the bones `Dance_Loop` drives (Body, spine,
neck, head, shoulders, arms, wrists, legs, the free feet), so switching between them never leaves a joint in the last
clip's pose. `Groove_Still` remains in the files for compatibility but is deliberately excluded from the live
repertoire: an enabled floor dancer must always move, even while kick detection is absent. `mirror` in `CAST` mirrors
the grooves too.
- `CrowdDance` is pure (no Babylon). `MOVES` gives each move its `beats`, `anchor` (where a beat lands: `Dance_Loop`
  dips half a beat in), pick `weight`, the `energy` it suits, and `build` / `drop` multipliers; the free `Groove_Sway`
  is what every dancer does without a beat. `step(dancer, music, frac)` returns the move and a speed: `bpm / 120`
  (halved at half time) corrected by the phase error in beats (x0.8, clamped +-40%; over 0.6 beats it jumps), so knees
  bend and hands clap ON the club's beat grid (`vjDirector.beatNumber` plus the bar-phase fraction). A half-time clap
  lands on 2 and 4 (`halfAnchor`).
- Choosing: per-dancer taste, a change only on a bar line after 4-8 bars, less of a move below its energy, claps x5 in a
  build (the countdown or the ascent movement), hands up and fist pumps on a drop (the release or ignition starting,
  which cut in at once). The kick is present while real onsets keep coming (`lastRealOnsetAt` within ~2.5 beats) and
  returns   after two in a row (`onsetStreak`). A trusted beat remains present for seven kick-less beats (the same threshold at
  which the Show Director declares a breakdown), so a missed onset or render hitch cannot send the floor idle early;
  the analyser's audible state is also held for two beats so one sparse frame cannot flip it.
- **`step()` takes a three-state pulse, not a boolean.** `music.beatPresent` (the kick) gives `true`; failing that,
  `music.rhythm` (`VJDirector.rhythmPresent`, see `js/vjDirector.js`) gives `'rhythm'` — hats, a snare or a synth
  keeping time through a kick-less breakdown; neither gives `false`. Only `false` drops every Quaternius dancer onto
  the free `Groove_Sway` at `FREE_SPEED`, off the grid: a breakdown that still has audible rhythm now keeps the
  floor on-grid instead, just lighter. `RHYTHM_WEIGHTS` reweights `_pick()` during `'rhythm'` — `Groove_Sway` far
  more likely (it also doubles as an on-grid move here, not only the off-grid fallback), `Groove_HandsUp` excluded
  entirely (nobody throws their hands up to a hi-hat) — and free moves, excluded outright while a kick is present,
  are allowed back into contention so a `'rhythm'` frame can still choose one without forcing it. `true` behaves as
  before: free moves excluded from `_pick()`, normal weights.
- The historical Mixamo slot ids remain for layout compatibility but now resolve to
  CC0 modular people; no Mixamo GLB is loaded or copied into the Quest build.
- The club side (`11-audio-crowd.js`): `_crowdMusic()` computes `m.rhythm = !m.beatPresent && hasAudio && vj.rhythmPresent`
  (see the rhythm band in `js/vjDirector.js`) alongside the existing `m.beatPresent`, so `'rhythm'` only ever applies
  when the kick is genuinely absent. `_spawnAvatar(..., { repertoire })` keeps the eight live groups (others disposed),
  `npc.dance = { groups, current, state }`, `npc.animations` is always `[current]` (so `_setAnimating` pauses and
  restarts the right one when a tier or district hides it), and `_updateCrowdDance()` (from `updateDancers`, before `updateDancingNPCs`,
  which leaves these dancers' speed alone) starts a new move with `enableBlending` (it blends from the old pose) and
  stops the old one: one group evaluates per dancer.
- Tests: the choreography in `test/unit.test.mjs` (phase lock at several tempos, bar lines, variety, beat loss, build,
  drop, and the `'rhythm'` state keeping the lighter moves rather than `Groove_HandsUp`); the grooves on the real skeleton in `test/rig.test.mjs` (feet planted, the tap lands on the beat, hands meet
  on the beat, fists and hands up, the bounce lowest on the beat, seamless loops); and the whole thing in the real club
  in `test/e2e/crowd-dance.spec.mjs`, stepped at 16 ms (measured mean phase error ~0.0013 beats, worst 0.033).

### `js/vjDirector.js`
Beat/BPM detection, master colour palette,
scene state machine (`breakdown`/`groove`/`build`/`drop`), and macros. Writes into the
`VRClub` instance (`beatEnvelope`, `masterIntensity`, `barPhase`, `spotColorIndex`, …).
`masterIntensity` is a REAL show dimmer: render code must multiply it into show-owned
emission, wall level and flash impulses; zero means blackout except explicit safety practicals.

**Kicks come from the kick band, not the bass band.** When `audioData.low` is a number, `_detectOnset()` feeds every
entry of `audioData.kickSteps` (one per 1/60 s of AUDIO time since the last frame, stamped when it played) to
`_detectKick(low, lowRms, t)`; without steps it falls back to one call per frame. A rise over the last 60 ms must clear 2.5x the median rise,
`low` must be >= 0.35, and the RAW rise must reach `KICK_REF_SHARE` (0.45) of the accepted kicks' (an EMA relaxing with a
60 s half-life), so a bassline cannot pass as kicks even after the normalising peak has decayed through a breakdown.
A refractory of max(180 ms, 55% of a beat) stops eighth-note doubles. Without the kick band (a stubbed or old analyser)
the legacy spectral-flux path on the bass band runs. Measured on a synthetic 124 BPM track with an eighth-note bassline
and a kick-less breakdown: recall 0.99, precision 0.98, no false onset in the breakdown, 124.9 BPM, ~14 ms lag (the old
path: 323 onsets for 128 kicks, 144 BPM, no breakdown found). `_registerBeat()` punches `beatEnvelope` at most once
every `MIN_PUNCH_GAP_MS` (400 ms): above 150 BPM it punches alternate beats, under the 3-a-second flash limit.
`test/unit.test.mjs` enforces the bassline rejection and the punch gap.

**The rest of the rhythm keeps the grid alive when the kick drops out.** A long breakdown often drops the kick
entirely while hats, a snare or a synth arpeggio keep a clear pulse; without reading them the crowd fell back to its
slow free sway the moment the kick did, even on a track that was still obviously in time. `_detectRhythm()` runs the
rhythm band (see `js/club/11-audio-crowd.js`) through the SAME onset-envelope machinery as the kick
(`_pushEnvelope`/`_envelope`), but decides presence differently: autocorrelation strength alone falsely flagged
Poisson-timed noise as periodic, so `_onsetCoherence()` also requires the onsets to be phase-locked to the beat's
sixteenth-note or triplet subdivisions (a circular phase-locking value) — real hats/snares/arpeggios measure
~0.96-0.98 coherent over a 4 s window, random hits 0.3-0.68 — before `rhythmPresent`/`rhythmStrength`/`rhythmBpm`
are set. `js/crowdDance.js` treats a frame as `true` (kick), `'rhythm'` (rhythm band only) or `false` (neither); only
`false` lets the floor fall back to the free `Groove_Sway`.

**Tempo tracking is autocorrelation, not kick-to-kick medians.** The old median-of-intervals approach misread a
124 BPM set as 140-167 BPM the moment a bassline pluck or an extra kick landed between two real beats, because a
single outlier interval skews a median of few samples. `_autocorrelate()`/`_acfAt()`/`_pulseAt()` instead score
candidate periods (70-180 BPM, plus the period's double/half at a discount) against the SHARED onset envelope, and
`_tempoPrior()` (a Gaussian in log2-BPM space centred on `preferredBpm`) nudges an ambiguous half/double-time read
toward the plausible range; `_tempoTrusted(now)` reports whether a recent evaluation was confident enough to drive
the grid. `_flywheel(now)` (extracted from `update()`) keeps counting bars from the tracked tempo for up to 1.5 beats
without a real kick, synthesizing the NEXT bar line at its exact due time (`lastBeatAt + beat`, not the time it was
noticed) so a slow frame cannot drift the grid; `_nudgeFlywheel()` gently pulls `lastBeatAt` toward the rhythm
band's own onsets while the kick is away, so claps and taps still land where the crowd expects them when the tempo
was read a little wrong.

**A syncopated hit (a bass note, an extra kick on the "and") must not be counted as the beat.** `_detectKick()`
gates a hit against the phase the last `phaseVotes` candidates (accepted or not) agree on — a circular median, so a
minority of off-grid hits cannot win the vote — rather than against the single last accepted kick: that anchor
could itself have been the syncopated hit, after which every REAL kick sits off-grid from it and gets rejected in
its place, forever, because the syncopation recurs at its own fixed offset from the beat. The same vote lets a kick
that has genuinely moved (a mix landing late) back in once most recent candidates agree on the new position.
`test/unit.test.mjs` mutation-tests both directions: disable the vote and the syncopated hit is counted as a beat;
keep it and a real tempo/phase shift is still followed within a few beats.

### `js/showDirector.js` — "NOCTURNE"
The composed light show, and **the single source of truth for fixture state** whenever
`showDirector.isDriving()` is true (i.e. the show is enabled and `vjManualMode` is off).

Structure: **23 looks** → **5 movements** (`arrival`, `pulse`, `ascent`, `ignition`,
`afterglow`) → **4 set-pieces** (`countdown`, `cutToBlack`, `breakdown`, `release`). A look
is a flat map of
`VRClub` fixture properties; a `[from, to]` value is a ramp resolved across the cue's bar
span. Movements are ordered cue lists; the next movement is chosen from a smoothed audio
energy EMA, but only on a bar boundary and only after `minBars` have elapsed.

Rules when editing:
- **All structural decisions happen in `_onBar()`, never mid-bar.** Landing changes off the
  musical grid is exactly the failure this class exists to fix.
- Look keys are validated at construction by `_validateLooks()` — a typo warns rather than
  silently doing nothing. Add new fixture properties to a look, not to a special case.
- `intensity`, `palette`, `punch`, `colorLock`, `hue` and `ledHarmony` are meta keys
  (`ShowDirector.META_KEYS`) consumed by the director itself. They must never be written onto
  the club instance. `hue` (0..1) pins the master colour via `VJDirector.setMasterHue()` for
  the look; a look without it calls `unlockHue()`, so rotation resumes. `ledHarmony` sets the
  wall's colour against the beams (`match` default, `analogous`, `complement`, `triad`,
  `follow` = the lasers' partner hue); `_applyLook()` resets it to `match` for every look, and
  `colorLock` wins over it. The wall's colour is `club.ledShowColor`: `VJDirector.refreshLedColor()`
  owns it, and aliases `currentSpotColor` only when matching. A wall pattern must paint the
  colour it is handed or no harmony can reach it (`patternBreathing` ignored it until
  2026-10-02; plasma, aurora and rainbow still synthesise their own hues).
  `ledLevel` (0..1, resolved to `club.ledWallLevel`, reset to 1 per look) runs the wall as a quiet
  ACCOMPANIMENT: `_applyLedLevel()` scales every pattern in one final pass and eases in from dark.
  The wall must be lit through most of the show (`test/unit.test.mjs` fails below 60% of bars, and
  any new look that goes dark must be added to its stated list of deliberate solos). A level
  <= 0.85 does not count as a second headline in the single-subject rule. Give an accompaniment
  look a pattern with steady presence (tunnel, kaleidoscope, DNA): sparse ones such as the
  underground film and warehouse shapes average 0.14-0.24 and vanish when dimmed.
- `photosensitiveSafeMode` **overrides the designer**: `_applyLook()` force-clears
  `strobesActive`, and the `countdown` set-piece drops its strobe ladder
  and carries the build with intensity and speed alone. Never bypass this.
- Keep the gobo/laser exclusivity rule — one aerial idea at a time, or the haze turns to soup.

**Four places hand control over. All four must stay gated:**

| Gate | File | Guard |
|------|------|-------|
| Legacy 12-phase wall-clock cycler | `js/club/07-animation-core.js` | `&& !showDriving` |
| LED wall private pattern timer | `js/club/09-animation-finish.js` | `if (!showOwnsPattern && …)` |
| Auto-scene energy-threshold picker | `vjDirector.js` `update()` step 5 | `&& !showDriving` |
| Spotlight palette cycler (it swapped the heads' colour every few seconds, overriding any look's hue) | `js/club/08-animation-fixtures.js` `updateSpotColorCycle()` | `&& !showDriving` |

VJDirector keeps running throughout — beat tracking, BPM and the colour palette are inputs
to the show, not competitors. Only the *look decision* is handed over.

**Reading the track's structure.** VJDirector has a *flywheel*: after 1.5 beats without a
kick it keeps counting beats at the tracked BPM, so the bar grid survives a kick-less
breakdown. `realOnsetCount`, `lastRealOnsetAt` and `onsetStreak` count only genuine kicks.
`_watchKick()` uses them: a groove (≥ 32 kicks) followed by ~2 kick-less bars starts the
`breakdown` set-piece (blue sheet → teal wall → rising magenta, strobe-free, up to 96 bars);
two fresh kicks end it with `release`, which re-locks `_beatInBar` to the returning kick and
hands on to IGNITION. Over 4 s of silence hands the breakdown to AFTERGLOW instead; a one-beat
gap before a drop does not. AFTERGLOW now ends on `sunrise` (amber aurora, 16 bars).

**Strobes are beat-locked.** A look's `strobeSync` (`beat`, `offbeat`, `bar`, `roll`; omitted =
`free`, the legacy random timer) makes `_strobeSyncDue()` in `09-animation-finish.js` fire a
burst on the kick, between kicks, on the downbeat, or on both (the build-up roll). A synced
`chase` steps the corners in order instead of picking randomly. Every strobing look declares a
sync mode (a unit test enforces it) and the countdown climbs bar → beat → roll → roll. Safe
Mode still force-clears `strobesActive` first, so none of this can fire under it.
**Strobes are an accent, not only a peak.** Under the groove and build, the heads, lasers and
laser sheets carry a `chase` strobe once per bar (`strobeSync: 'bar'`, about 0.5 flashes a
second at any tempo) to add tension; the opening, the breakdown arc and the comedown stay
strobe-free. Any strobe layered under another subject must be bar-synced (a unit test allows
only `detonation` and `releaseHit` to be faster), which also keeps it clear of the 3-a-second
limit. A strobe-only solo may use the faster grid. The one-idea-at-a-time rule counts a
bar-synced strobe as an accent, like a dimmed LED wall.
**Kick punch reaches the fixtures.** `club.kickDepth` (the look's `punch`, written by the
director) × `beatEnvelope` gives `club.kickPulse` each frame, halved in Safe Mode. It lifts
the moving-head intensity and beams, laser beams, laser-sheet glow, mirror-ball spin, and —
via `_ledLift` in `updateLEDPanel()` — the whole LED wall. Unit tests drive these methods on
bare stubs, so every read is `(this.kickPulse || 0)`. The moving heads also dip toward the floor on the kick
(`kickTilt` in `updateSpotlights`, up to 20% of their horizontal reach: motion, not light).
**The rig breathes with the kick.** In `_applyContinuous()` the look's `punch` scales a dip between kicks to an
envelope floor of 0.3 when the kick band is trusted, 0.65 for the legacy path or under Photosensitive Safe Mode, 0.75
with no audio; the master's smoothing compounds with `dtScale`. The show's energy EMA is weighted by the kick band's
`energy` (`0.55 + 0.75 * energy`), and fixture speed follows it (`audioSpeedMultiplier` 0.75..1.35), so a breakdown
calms the room and a drop lifts it.
## Non-negotiable rendering rules

### Frame-rate independence
The render loop runs at 60 Hz on desktop, 72/90/120 Hz on Quest, and lower under thermal
throttling. `updateAnimations()` computes:

```javascript
const frameMs = this.engine.getDeltaTime();
const dtScale = Math.min(4, Math.max(0.25, frameMs / 16.667));
const dt = dtScale / 60;   // exact elapsed seconds for the clamped frame
```

**Never** hard-code `0.016` or a bare per-frame increment. Multiply rotation/phase steps by
`dtScale` and decrement timers by `dt`. For an exponential smoother, compound the retention
rate rather than scaling it: `k = 1 - Math.pow(1 - k60, dtScale)`.

A contract test (`test/unit.test.mjs`) fails the build on any literal `0.016` inside
`js/club/*animation*.js`.

### Never freeze/unfreeze materials per frame
`Material.freeze()` and `unfreeze()` both call `markDirty()`, which walks **every mesh in
the scene**. Calling them in the render loop for a handful of fixtures produced hundreds of
full-scene scans per second. If a material's colour is mutated each frame, unfreeze it
**once** and leave it unfrozen.

The same cascade fires from any `ImageProcessingConfiguration` setter (`exposure`,
`contrast`, vignette, tone mapping): every material observes the scene configuration and
walks every mesh. A per-frame `imageProcessing.exposure = …` cost 104–130 ms per write at
the current scene size. Per-frame exposure goes through `_writeExposure()`
(`js/club/07-animation-core.js`); a unit test and the e2e suite assert zero notifications.

### Light count limits
PBR materials exhaust GPU uniform buffers past a device-specific light count. The authority
is `VRClub.detectMaxLights()` in `js/club/01-core.js`; `ModelLoader.detectDefaultMaxLights()`
mirrors it for the standalone case and a test enforces that the two agree.

| Device  | Max simultaneous lights |
|---------|-------------------------|
| Quest   | 4                       |
| Desktop | 3                       |
| Mobile  | 3                       |

Set `material.maxSimultaneousLights = this.maxLights` on **every** material, including the
materials that arrive inside loaded `.glb` files.

Mirror-ball fixtures are deliberately visual-only. Their emissive incident beams, reflected
surface spots/rays and ambient bounce provide the effect; do not add or dynamically enable a
real mirror-ball light. Doing so changes the light UBO layout after static PBR materials are
frozen and can invalidate DJ, avatar and truss draws on WebGL.

`maxSimultaneousLights` invalidates the compiled effect through `markAllSubMeshesAsLightsDirty`.
Both `scene.blockMaterialDirtyMechanism` and `material.freeze()` suppress that. The startup
and model-loader budget sweeps unfreeze lit materials and mark their lights dirty, even
when the numeric budget already matches. Leave lit materials unfrozen: asynchronously
loaded or enabled lights can change a slot from spotlight to point light without changing
the count, leaving a frozen shader expecting a larger buffer than the bound light supplies.
Startup restores `scene.blockMaterialDirtyMechanism = false` before rendering. Unlit
materials may remain frozen. See `_clampMaterialLightBudgets()` and
`ModelLoader._enforceSceneLightBudget()`; never freeze/unfreeze in the animation loop.

DJ-console and PA-speaker accent lights target only their own imported meshes through
`includedOnlyMeshes`. Do not let them consume the room or crowd's moving-spotlight budget.

A material binds the first `maxSimultaneousLights` enabled lights that can affect its mesh,
in its cached eligible-light order. DJ and PA accents use `renderPriority = 1`, enabling
`requireLightSorting`; the loader resynchronizes their meshes once after assigning the
scoped accent. Room/crowd order remains creation order because those accents cannot affect
them. Today their slots are `ambient`,
`spot0` and `spot1` (plus `spot2` on Quest). `_bindPhotometricSlots()` copies the strongest
surface-hitting heads into those slots each frame, from a snapshot, so a bright beam on
`spot4` still shades the floor it hits. Do not "fix" that copy by restoring each slot to
its own yoke. The six moving-head `SpotLight`s stay **enabled for life** and are dimmed
through `intensity`. Never toggle a light's enabled state in the render loop: it re-slots
every lit material, which measured 17–20 shader compiles (0.4–1.1 s freezes) per cue change
and a ~2 ms scene walk per toggle. `strobeFlash` stays disabled for life; the flash is the
emissive lamp plus the ambient impulse.

Smoke and dust are unlit sprites, so `_lightAirParticles()` (07, hooked into the haze and
dust `updateFunction` by `_installAirLighting()`) brightens and tints the ones inside a
moving-head cone with a Henyey-Greenstein phase term, makes dust visible only inside beams,
and feeds each beam's `_mediumDensity` back into its alpha. It edits the colour for one
frame only (the colour gradient recomputes it), allocates nothing, and is **desktop only**:
~0.3 ms per pass on a desktop CPU, unmeasured on a Quest. Do not enable it in VR without a
headset capture.
No light currently owns a `ShadowGenerator`: the two it had sat outside every material's
slots, so no shadow was ever sampled.

Keep the ambient preset's small nonzero specular contribution. Babylon's (observed on 8.30.5;
the mirror-only e2e still guards it on 9.28.0) clear-coat path can read uninitialized pre-lighting vectors when only a zero-specular
hemispheric light remains. This produces a white floor/foreground in mirror-only cues,
not extra fog. The ambient specular term keeps `SPECULARTERM` enabled without another light.

### VR opacity
VR stereoscopic rendering is hypersensitive to transparency. On every mesh of a loaded model:

```javascript
mesh.material.alpha = 1.0;
mesh.material.transparencyMode = 0;      // PBRMATERIAL_OPAQUE - force it, do not infer
mesh.material.needAlphaBlending = () => false;
mesh.material.disableDepthWrite = false;
```

### No per-frame allocation
Reuse `this.cachedColors` and pre-allocated `Vector3`s; prefer `addToRef` / `scaleInPlace`
over `add` / `scale` inside `updateAnimations()`.

### Desktop vs VR settings
All differences live in the `vrSettings` object in `js/club/01-core.js`.
Change the config and call `applyVRSettings(xrCamera)` / `applyDesktopSettings()` — never
set pipeline values inline. Grain and chromatic aberration are disabled on both targets
(they read as haze); bloom is kept minimal.

The selective Babylon `GlowLayer` object remains available for fixture registration and diagnostics but is deliberately
`isEnabled = false` in EVERY mode: `applyVRSettings()` and `applyDesktopSettings()` only change its intensity (a unit
test fails if any club layer sets it `true`). It renders selected emitters into a private target without the opaque venue or characters in its
depth buffer, which made lights and halos visible through walls and Quaternius people. Visible glow comes only from the
default rendering pipeline's bloom, after the main scene has resolved depth. Never re-enable the selective layer unless
its pass includes every relevant occluder and the added full-scene draw cost has been measured.

**`pipeline.sharpen.colorAmount` is a brightness GAIN, not a sharpness.** Babylon's sharpen shader is
`colour * colorAmount - edge * edgeAmount` and runs after tone mapping, so a value below 1 darkens the
whole image and caps peak white at that value. VR shipped at 0.1 (a headset frame at 10% brightness,
which no amount of fixture boosting could fix); keep it at 1.0 and set brightness with `exposure`.
Sharpening strength is `edgeAmount` only. `test/e2e/vr-parity.spec.mjs` fails if the VR gain drifts or
the VR frame is darker than the desktop one. The strobe's whole-room impulse is
`vrSettings.*.strobeImpulse`, tuned against measured flash luminance, not by eye. A strobe burst is
about 40 ms in REAL seconds (`STROBE_FLASH_S` in `09-animation-finish.js`, not scaled by
`strobeSpeed`) and the free-running timer is floored at 0.34 s (three flashes a second); a unit test
simulates 45 to 120 Hz and fails on a longer burst or a faster timer. The strobe bank, manual
moving-head shutter and Warehouse LED flash all claim the same room-wide
`VRClubCore._tryClubFlash()` governor, so their combined output cannot exceed one abrupt
flash per 0.34 s (Warehouse requests its stricter 0.4 s gap). Safe Mode denies every claim;
the Warehouse pattern may still run its explicitly tested slow Safe Mode swell.

**The XR layer's `antialias` does not antialias the scene.** The headset renders into the pipeline's
offscreen target first, so MSAA must be set on that pipeline: `vrSettings.vr.msaaSamples` through
`VRClubCore.resolveVRMsaaSamples()` (clamped to `maxMSAASamples`, overridable with `localStorage`
`vrclub.vrMsaa` = 1, 2 or 4). It was 1 and only FXAA ran. Its Quest 3S cost is unmeasured.

### Graphics quality tiers
`vrSettings` covers *desktop vs VR*. A second, orthogonal axis covers *how strong a GPU
this is*: `this.qualityTiers` (constructor, next to `vrSettings`) with `ultra` / `high` /
`balanced`.

- `detectGraphicsTier()` picks the tier from `WEBGL_debug_renderer_info`,
  `navigator.hardwareConcurrency` and `navigator.deviceMemory`. Quest browsers start at `ultra`,
  phones/tablets at `balanced`. A `localStorage` override (`vrclub.graphicsTier`) always wins.
- `this.tierSettings` is a getter for the active tier's config.
- `setGraphicsTier(tier)` switches at runtime, persists the choice and rebuilds the
  tier-owned pipelines. Wired to the `cycleGraphicsQuality` VJ button and the VR quick menu.
  After rebuilding it unfreezes and invalidates material effects once, because
  pre-pass outputs can change when motion blur or SSR is attached or removed.

Tier-gated desktop features:

| Feature | Where | Ultra | High | Balanced |
|---------|-------|-------|------|----------|
| Render scale (`<1` = supersample) | `init()` + `applyDesktopSettings()` | 0.8 | 1.0 | 1.0 |
| Pipeline MSAA (`pipeline.samples`) | `addPostProcessing()` | 4 | 4 | 1 |
| `bloomKernel` | `addPostProcessing()` | 160 | 128 | 96 |
| SSR (`SSRRenderingPipeline`) | `_createScreenSpaceReflections()` | high | balanced | off |
| Motion blur | `_createMotionBlur()` | on | off | off |
| Contact-hardening (PCSS) shadows | `_applyShadowQuality()` (no-op: no generator exists) | on | on | off |
| Anisotropic filtering | `_applyAnisotropicFiltering()` | 16× | 8× | 4× |
| Reflection probe resolution | `createFloorReflectionProbe()` | 512 | 256 | 128 |
| Mirror reflection spots | `_updateMirrorReflectionBatch()` | 280 | 180 | 96 |
| Mirror outgoing rays | `_updateMirrorReflectionBatch()` | 64 | 52 | 32 |
| SSAO samples / expensive blur | `addPostProcessing()` | 24 / yes | 16 / yes | 8 / no |
| Floor `receiveShadows` | `createFloor()` | on | off | off |

The same selection also scales headset-safe features without enabling desktop-only SSR,
SSAO, motion blur or shadows in XR:

| VR feature | Ultra | High | Balanced |
|------------|-------|------|----------|
| Bloom kernel | 64 | 48 | 32 |
| Pipeline MSAA default | 4 | 4 | 4 |
| Anisotropic filtering | 12× | 8× | 4× |
| Haze / dust rates | 90 / 50 | 78 / 40 | 65 / 30 |
| Fixed foveation | 0.2 | 0.3 | 0.4 |
| Crowd / guests | 14 / 8 | 10 / 4 | 6 / 2 |
| Mirror spots / rays | 280 / 64 | 180 / 52 | 96 / 32 |

Quest browsers auto-detect `ultra` (the owner's Quest 3 runs it; the Quest 3S is unmeasured) and phones/tablets `balanced`; a saved or in-menu
selection always wins, and the VR menu steps down to `high` or `balanced`. Because the flat (pre-XR) page on a Quest also runs the
desktop tier path, ultra's SSR, SSAO and motion blur render there until the headset session starts, and are detached on entry.
High and Ultra remain unmeasured on a Quest 3S.

Rules when touching this:
- Mirror reflection spots and outgoing rays are two thin-instanced meshes backed by
  preallocated matrix buffers. `_intersectRoomInterior()` analytically clips them to
  `ROOM_INTERIOR` (the shell's inner faces: x ±12.25, ceiling y 9.85, LED wall z -20, front
  wall z -0.25), except rays through the front doorway continue onto the analytically modelled
  entrance stair treads and risers. `ROOM_BOUNDS` is the narrower walkable band and must not be used for optics.
  Do not restore per-spot meshes or `scene.pickWithRay()` calls.
- **Every new heavy effect must be feature-detected** (`if (BABYLON.X)`) and wrapped in
  `try/catch` — there is no build step or browser test to catch a missing API.
- **Every new pipeline must be detached in `applyVRSettings()` and re-attached in
  `applyDesktopSettings()`**, mirroring the existing SSAO and SSR blocks. VR performance
  is the hard constraint; no desktop-only tier feature may run in a headset.
- **Every new pipeline must be disposed in `dispose()`** — post-process render targets are
  not always reclaimed by `scene.dispose()`.
- `applyDesktopSettings()` only runs when *exiting* VR. Anything that must be true on the
  initial desktop load also has to be set in `init()`.
- Dithering (`imageProcessing.ditheringEnabled`) is deliberately on. The scene is almost
  entirely dark gradients, which band badly in 8-bit without it. Do not remove it.

## Factories

Do not construct materials or lights inline.

```javascript
// Material
const mat = this.materialFactory.getPreset('platform');   // memoised by preset name
const custom = this.materialFactory.createPBRMaterial('customMat',
    { baseColor: [0.5, 0.5, 0.5], metallic: 0.8, roughness: 0.3 }, /* shared */ true);

// Light. Presets take (position, name) - position FIRST.
const light = this.lightFactory.getPreset('djLight', new BABYLON.Vector3(0, 5, 0), 'myLight');
this.lightFactory.getGroup('dj').forEach(l => l.setEnabled(false));
```

Material presets: `cdjBody`, `jogWheel`, `mixer`, `table`, `platform`, `rail`, `floor`,
`floorConcrete` (the dance floor: matte, no clear coat), `wall`, `ceiling`, `truss`, `brace`,
`lightFixture`, `speakerBody`, `speakerGrill`, `speakerHorn`, `brick`, `pillar`, `pipe`,
`steelGirder`, `laserHousing`, and more.

SSR's `reflectivityThreshold` sits above a dielectric's F0 (~0.04) so only metals trace
reflections; lowering it makes the concrete floor mirror the room again at grazing angles.

The laser sheet has two truss projectors (`laserSheetSource` at x = -6,
`laserSheetSourceRight` at x = +6) and by default BOTH emit (`laserSheetOrigin: 'both'`): the left
fan leads, the right one mirrors its yaw and trails its pitch in phase so the planes scissor.
The fans share materials, so the second costs two draw calls and no extra noise textures.

**Tune the sheets by their crossing, not their planes.** Each plane turns only ~2 deg/s, but the
bright line where the two planes meet runs many times faster (the old aim measured a median
1.6 m/s and a 7.5 m/s peak, 3-5 m over the floor). The shipped geometry (inward aim 0.20 rad,
base pitch 0.53, follower trail 0.5, ranges 0.06 / 0.12) holds the crossing to a ~0.4 m/s drift,
under 1 m/s at worst, and 2.0-3.6 m high at mid-room. `_poseLaserSheet()` owns the pose maths
and caps the laser speed at 1.4 so the slider or a legacy phase cannot undo it. It integrates
clamped elapsed time × speed into a stored phase; never go back to absolute time × current speed
or a late cue ramp will teleport the crossing.
`test/sheet.test.mjs` measures the crossing on the real Babylon maths for every shipped sheet
look; retune against it, never by eye.
`'ceilingLeft'` / `'ceilingRight'` fire one projector only. `configureLaserSheetVariant()`
re-parents the lead fan; `this.laserSheetSource` always points at the lead projector and
`_laserSheetFollower` at the second (null when single-sided).

**Laser optics (sheet and ceiling beams).** Both are drawn the way a beam is seen in haze, and the
rules are enforced by `test/unit.test.mjs`:
- Colours are diode wavelengths (`cachedLaserColors`: 638 / 532 / 445 nm), not sRGB primaries;
  `_laserColor()` is the one source, honouring `colorLockActive`.
- Additive laser materials have `fogEnabled = false`: fog mixes toward its colour and greys a beam.
  Distance and haze attenuation go in vertex alpha instead.
- No laser line is narrower than a few pixels (`_laserView()` gives the pixel angle), and widening
  divides its brightness. A sub-pixel modelled cylinder aliased into dashed, crawling lines.
- Ceiling beams are ONE camera-facing ribbon batch (`laser_beams`) plus ONE dot batch
  (`laser_beamHits`) written every frame by `updateLasers()`. Each beam leaves the projector's
  underside aperture, ends on whichever `ROOM_INTERIOR` face it reaches (walls included), throws a
  dot there and scatters forward (`_laserScatterGain()`, Henyey-Greenstein g 0.45).
- The sheet fan is subdivided: vertex alpha carries the ~1/r power spread and the brighter scan
  edges, and an emissive Fresnel term makes it a bright line edge-on and a veil face-on. The fan is
  longer than the room so the shell's depth test ends it on a surface. Its noise textures need
  `getAlphaFromRGB = true` (Babylon's noise writes alpha 1). There is deliberately no separate
  bright line where the fan meets the floor (tried, removed at the owner's request).

Light presets: `ambient`, `djLight`, `speakerLight`, `spotlight`, `laserLight`.

Shared materials are keyed by `MaterialFactory._cacheKey()`, which normalises arrays and
`Color3`s so equivalent configs collide correctly. Materials carrying a texture are never
shared. A cached instance is tagged `_vrclubShared = true`: **never mutate one per-instance**,
because it is handed out by identity to every other consumer.

Factory materials are **frozen after creation** unless their config says `mutable: true`.
Pass it for any material whose colour or intensity is written at runtime. Freeze behaviour
is never inferred from the material's name, and a test guards the migrated call sites.

`ModelLoader` takes `{ lightFactory, textureLoader }` as its fifth argument, so accent lights
are registered and speaker textures are cached. `_fitAndPlace()` preserves the glTF loader's
handedness conversion via `ModelLoader._rootHandedness()`. Model configs therefore carry no
mirror signs in `scale`; never add a `-1` there to "unmirror" a model.

### Teardown
Every factory and loader exposes `dispose()` (`TextureLoader`, `ModelLoader`,
`MaterialFactory`, `LightFactory`). `VRClub.dispose()` calls all four. They own IndexedDB
connections, in-flight downloads and `DynamicTexture`s that `scene.dispose()` does **not**
reclaim. Anything you add that holds one of those must be released there.

## Build and service worker

Quest uses `npm run build:quest` for the same content-hashed production web build.
It also copies `LICENSE`, `ASSETS.md` and `licenses/`. `npm run quest:prepare` validates
the owner's public HTTPS URL, real Meta App ID, permanent package ID, external signing
key and certificate, then writes ignored `quest-package/` configuration. It builds no APK.
Only an explicitly prepared public `assetlinks.json` is copied into `dist/.well-known/`;
publish it at the origin root even with subdirectory hosting. See `docs/QUEST.md`.
Keep keystores, credentials and packaging outputs out of source and the web server.

`index.html` is the single source of truth for the script load order. `scripts/build.mjs`
**derives** the bundle order from it by parsing the `<script>` tags — never add a second
hand-maintained list. The build also **generates** `dist/sw.js`: its `PRECACHE` array and
`VERSION` come from the content hashes of the emitted bundle, because `caches.match()`
compares the full URL including the query string and a hand-written list cannot track them.

The service worker owns the **app shell only**. Models, textures and `.env` files are owned
by `IndexedDBAssetCache`; caching them in both places doubles ~60 MB of storage and exhausts
the origin quota on a Quest.

`npm run version:bump` rewrites `index.html`, `package.json`, `sw.js` and `serviceworker.js`
together. A contract test fails if any of the four disagree.

Production is the **built** `dist/`. **The `main` branch is published to GitHub Pages** by the `deploy` job in
`.github/workflows/ci.yml` only after `verify`, `e2e` and `audit` pass (GitHub Pages source
must be set to "GitHub Actions"). **The `Quest` branch is published to Cloudflare Pages** (project `nocturne-vr`,
served at `nocturne.mitwee.nl`): `npm run deploy:cloudflare` from a logged-in machine, or the `deploy-cloudflare`
CI job when the `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets exist. That project's production branch
is `Quest`, so a deployment made with any other `--branch` is only a Preview and never reaches the custom domain.
The relay Worker is deployed separately with `npm run deploy:worker`. GitHub Pages ignores `_headers`, so
`frame-ancestors` and the immutable asset caching there only apply on Cloudflare Pages or Netlify.

Search engines and link previews use `https://nocturne.mitwee.nl/` as the only canonical URL.
`index.html` owns the title, description, Open Graph/Twitter metadata and the visible
`WebApplication` microdata in `#modelCredits`; `robots.txt` points at the one-URL `sitemap.xml`.
The 1200x630 preview is `icons/social-preview.png`, generated from the editable
`icons/social-preview.svg`. `scripts/build.mjs` copies all four crawl/preview assets into `dist/`.
Keep development and `pages.dev` hostnames out of canonical metadata and the sitemap so they do
not compete with production in search results.

The production builder minifies the CSS with esbuild and hashes the minified bytes; JavaScript is
already emitted as an IIFE minified by esbuild. Keep source styles readable in `css/styles.css`;
never commit generated `dist/` output.

`.gitattributes` pins LF line endings and marks `js/vendor/**` as `-text`. The vendored
bundles are byte-pinned by sha384, and Windows `core.autocrlf` would otherwise rewrite them
and fail `npm test`.

## Assets

- **Textures**: local `./textures/{factoryFloor,walls,ceiling}/{diff,normal,roughness,ao}.jpg`
  (Poly Haven, CC0; normal maps are the DirectX `nor_dx` variant). Not fetched from a CDN.
  The folder name is part of the IndexedDB cache key, so replacing a set means renaming its
  folder — overwriting files in place leaves returning visitors on the old maps for 30 days (textures are not
  fingerprinted; models are, so a GLB may be rebuilt in place).
- **Models**: local `./js/models/` — `djgear/source/pioneer_DJ_console.glb`,
  `paspeakers/source/stage_speaker___black.glb`, and the characters in `avatars/`.
  Characters: the Quaternius `club-*.glb` files share one UE-mannequin rig and carry their clips
  inside the file, EXCEPT the crowd (next bullet). `_spawnAvatar(..., { clip })` keeps one clip and
  disposes the rest; `_spawnAvatar(..., { clips })` keeps several named ones as `npc.poses`
  (see "the guest who works the room"). After building or replacing one, run
  `npm run optimize:avatars -- <file>` (it merges skinned parts that share a skin and material, so a
  character is ~6 draws, and a contract test fails above 6). Add every new GLB to `ASSETS.md`. The three
  Mixamo GLBs are source-only historical assets, excluded from Quest distribution
  (Quaternius's free libraries have ONE dance clip, `Dance_Loop`). The two Quaternius sci-fi prop packs were evaluated and not used:
  chunky pieces (a 1.6 m chair, 2 m desks, 4-6k-vertex crates) that do not fit this club.
  The DJ console and PA speaker are **optimised derivatives**: run
  `npm run optimize:models` after replacing or editing either (idempotent; `npm test` runs it with
  `--check`). Never put a 4096 px texture in the scene — a Quest shares its memory with the browser
  and each one costs ~85 MB with mips (the budget is in `test/e2e/budget.spec.mjs`). The speaker
  GLB is deliberately textureless: `ModelLoader.applyPASpeakerTextures()` applies the external
  `paspeakers/source/authored/textures/small_speaker_1_1001_*` set to every mesh: original-GLB
  albedo/normal (2048 px) and shared packed ORM (1024 px). Keep `invertY=false`, normal-map
  handedness matching glTF, metallic/roughness factors at 1, and no uniform emissive floor.
  The optimizer recovers these images before stripping a replacement's embedded copies.
  The resource-budget snapshot also reports active-submesh proxy draws by subsystem, active
  material/texture/effect counts, transparency, instancing/shared geometry, shadows, reflection
  targets and particle systems. Its IWER XR numbers are regression evidence, not Quest frame
  timing or a device-specific draw-call budget.
  Do not use Draco, meshopt
  or KTX2: Babylon fetches their decoders from a CDN, which the same-origin rule forbids.
- **The crowd is 17 different people** (`club-crowd-f1..f8`, `m1..m9`), plus the bouncer (`club-crowd-bouncer`, same build): the CC0 Quaternius Modular Women and
  Modular Men packs, recoloured (skin tone, hair, clothes, silver heads for older guests) and given the club's own
  dance and idle clips. They are NOT on the UE mannequin: their rig is the 62-bone modular one (a `Body` bone
  carries the height and the legs hang from it, free-standing IK foot bones, arms-down bind pose, no dance clip),
  so `node scripts/build-crowd-glbs.mjs --women <dir> --men <dir> --optimize` retargets the clips offline: trunk
  bones take the source's WORLD rotation delta from its bind pose, arms and legs are aimed along the source's
  world bone directions (swing only, which is what lets a T-posed source drive a relaxed rig), and the foot
  bones are placed at the end of the animated legs. The floor dancers also carry the procedural grooves (see
  `js/crowdDance.js` above). Each person is ONE mesh with ONE material and per-vertex
  colour (no textures, ~0.8 MB), where the Universal Base Characters cost about six draws. The cast, palettes
  and which people carry the guest clips live in that script's `CAST`; props (pistols, hats, crowns) are dropped.
  `test/rig.test.mjs` measures the real skeletons dancing (limbs rigid, feet on the floor, hands moving) and is
  what catches a wrong axis or flipped side; `test/unit.test.mjs` pins one skin, one draw, one material and the
  clip sets. Do not hand-edit the GLBs: change `CAST` and rebuild.
- **Sources load per tier.** `VRClub.AVATAR_SOURCES` (`js/club/11-audio-crowd.js`) lists every character file by
  id (`sourceIndex('f1')`); the crowd and guest slots point at them. Only the files the active tier shows are fetched
  (`_requiredCrowdSources`: the player's body, the bartender, the first N dancers and the first N guests), so a
  Balanced headset downloads about half of what Ultra does; `_applyCrowdSize()` fetches the missing ones in the
  background when the tier rises (`_topUpCrowdSources`) and places them afterwards. In
  `_crowdSourceContainers` `undefined` means "not requested yet" (the slot waits) and `null` means "failed"
  (another loaded character stands in). A character a tier hides is paused, and restarted when shown, only through
  `VRClubAudioCrowd._setAnimating(npc, on)`: Babylon 9's `AnimationGroup` has `isPlaying` and NO `isPaused`, and the
  old `group.isPaused && group.restart()` check never restarted anyone, so dancers brought back by a higher tier stood
  frozen (`test/e2e/tiers.spec.mjs` goes Ultra, Balanced, Ultra and fails on any character whose bones do not move). After
  any GLB loads late, `_restoreLightBudgets()` resets the light budgets the glTF loader raised on every scene material.
  Slots are ordered so the first six are already varied (men and women,
  several skin tones, a silver head and a punk). `club-dancer-*.glb` now only dress the player's own
  body and the bartender is the female guest file with a black tint; `club-guest-male.glb` is a build source only.
- **Who is in the club** (`vrclub.hiddenPeople`, resolved by `VRClubCore.resolvePeopleVisibility()` into
  `this.peopleVisibility`). A guest can send three groups home, separately or in combination: **dancers** (`dancerN`),
  **bystanders** (the side guests `guestN`, the mingler, the bartender, the bouncer and the street queue) and the
  **DJ**. `isPeopleVisible(category)` is the only read; `setPeopleVisible` / `togglePeopleVisible` (`'all'` comes back
  only when every group is away) are the only writes, and they persist and then call `applyPeopleVisibility()`.
  Exactly three places act on it: `_applyCrowdSize()` (which turns a hidden group's target into 0, so a quality-tier
  change can never resurrect it), `_showStreetPeople()` and `_applyDJVisibility()`. `_requiredCrowdSources()` also
  gates on it, so a group nobody can see is never downloaded, and `_applyDJ()` only records `_djWanted` while the DJ
  is away. It is a **personal, local** preference, not a light or a music control: it is never host-gated (the VR
  button uses `action: 'people'` with no `control`, and `initRoomGuestLock`'s `keep` selector includes
  `[data-people]`). Three surfaces only call `togglePeopleVisible`: the VJ panel's "Who is in the club" section, the VR
  quick menu's CROWD page (its own HOME button; it used to sit at the bottom of COMFORT, where nobody found it) and the
  VJ desk's RESIDENT DJ button.
- **Ambient bystander poses.** Fixed bystanders still evaluate exactly one clip: the mezzanine guest f7 grips the
  rail through the club-authored `Idle_Railing_Loop`. Her wrists sit above and behind the 6 x 5 cm top tube, and
  the generated clip drives all three joints of each finger so the knuckles cross its dance-floor side and the
  fingertips curl back underneath; do not reduce this to a wrist-on-centreline assertion, which allows the straight
  hand mesh to pass through the metal. One high-tier queue guest outside uses
  `Idle_TalkingPhone_Loop` (never an indoor slot beside the PA); the bouncer uses the neutral `Idle_Loop`. The source
  guest files and every `guest: true` modular crowd file carry the ambient clips. f7 and the mingler (m6, a taller
  variant fitted to his 1.84 m frame) carry the procedural rail clip. `_streetSlots()` and `_guestSlots()` are the
  assignment authority, and unit/rig tests verify the clip exists and the wrist/knuckle/fingertip grip fits the real rail.
  A slot's `ambient` map adds a slow, bounded attention yaw and small playback-rate variation over the authored breathing
  and hand motion. It never moves a rail grip, dancer, rig-driven character, mingler, or somebody currently talking to
  the mingler. The absolute-time wave plus elapsed-time yaw easing is refresh-rate independent and allocates nothing.
- **The guest who works the room** (`js/club/11-audio-crowd.js`). Exactly one side guest (slot 2, `m6`, carrying
  `mingles: true` and `clips: ['Walk', 'Idle_Loop', 'Idle_Talking_Loop', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop']`) does not stand
  still: he walks a round, joins the other standing guests' conversations, visits the bartender, watches the dance
  floor, goes outside to smoke, and visits the balcony. `_updateMingler(dt)` runs from `updateDancers()` next to
  `_updateBouncer`. **He lingers**: a conversation is 22-38 s, watching the floor 25-40 s, the bar is two sips with a
  chat between them (~25 s), a cigarette 75-105 s and the balcony 25-40 s at the rail plus 25-40 s talking. He walks
  about a quarter of the time (the real-club test fails above 45%); before 2026-10-08 he walked most of it.
  - **In a networked room**, `MinglerClock` samples a deterministic round from the relay's `world` welcome
    (`v`, `startedAt`, `seed`), not local startup, random frame updates or host snapshots. The client advances it
    with `performance.now()` and corrects it using timestamped heartbeat replies (half-round-trip compensation).
    Late joiners, hidden bystanders, missing-tier partners and a hidden host's mingler cannot change the round;
    conversations retain their canonical dwell even without a visible partner. Host handover preserves it, and an
    empty room starts a new clock. Positions, height hints, yaw, clip phase, bar stages and cigarette burn follow that
    timeline; existing physical hand/glass, mouth/smoke, collider and shadow paths remain in use. Offline and older
    relays retain the local round. Network latency can leave a small clock difference; this is not headset timing evidence.
  - **The round is hand-placed, never derived or random** (`_minglerRoute()`): a chain walked up and
    back down (`state.node` / `state.dir` ping-pong), with `home` (index 1) his own placed spot. `guest` on a node is
    the guest slot he stops at; `bartender` marks the one customer-side bar stop; `activity` marks the intentional
    solo `watch`, `smoke` or `balcony` stops; a node without any of those is a corner. Every indoor leg was measured
    to clear all 14 dance-floor slots, every standing guest and the bar furniture by at least 0.8 m, and the outside
    route uses the centre of both doors to stay clear of the bouncer and queue. A unit test re-measures it. Corners
    are navigation only and are passed without a dwell; only social and named activity nodes stop. Moving any crowd,
    guest, bar, entrance or mezzanine slot means re-running that test.
  - **Height comes from the venue.** `_minglerSurfaceLevel()` reads `VenueLayout.vestibule.walkLevel()` and then
    `MezzanineLayout.walkLevel()`, so the same authoritative surfaces used by the player carry him up the entrance
    stair to street level and up the mezzanine stair to the deck. His collider and contact-shadow translations include
    that root height; the real-club test verifies both throughout the route.
  - **Speed.** 1.05 m/s with the `Walk` clip at `route.speed / route.walkClipSpeed` (the packs' walk is authored for
    1.4 m/s, the same mapping `AvatarManager` uses), deliberately independent of `npc.baseSpeed` so his feet do not
    skate. Idles play at `npc.baseSpeed`.
  - **One group plays at a time.** `_playClip(npc, clip, speedRatio)` starts the new group (blending from the old
    pose), stops the old one and reassigns `npc.animations = [next]`, so `_setAnimating()` pauses and restarts the
    right clip across a tier change.
  - **He carries his own collider and contact shadow.** The occupant collider is its own mesh (a left-behind one is an
    invisible wall) and the contact shadows are ONE thin-instance buffer rebuilt only when the enabled set changes, so
    `_moveContactShadow()` rewrites his own translation in place (`_refreshContactShadows()` records `npc._shadowIndex`).
  - **The people he stops at** turn toward him and play `Idle_Talking_Loop`, then go back to their placed pose and yaw
    (`slotClip` / `slotYaw`). Only one person eases back at a time. Guests have `homeYaw === null`, so
    `updateDancingNPCs()`'s proximity yaw never fights this.
  - **At the bar**, the bartender and m6 turn toward each other and run an explicit sequence: order, serve, glass on
    counter, pickup, drink, return, glass on counter (and a 7 s chat), a second pickup, drink and return, clear. One persistent PBR glass is handed from the
    bartender's hand to the measured counter top, then to m6's palm; it follows that palm while `Drink_Loop` raises
    it to his mouth, returns to the counter, then goes back to the bartender's hand. The glass itself NEVER
    interpolates through open space: it is either fixed to a hand or fixed on the counter, and ownership switches
    only after the relevant hand reaches the same measured point. The bartender is driven by an `AvatarRig` so both
    hands physically place, clear and resume washing the glass. M6's one-shot clip is explicitly phase-synchronised
    in `_syncMinglerDrinkPose()` rather than trusting render-loop animation time. The real-club test holds every
    hand/counter and glass/mouth contact under 12 cm. The mesh and pose vectors are reused without per-frame allocation.
  - **Intentional solo stops.** At home he uses `Idle_Loop` while facing the dance floor.
  - **The balcony** is a solo stop next to somebody: the node carries `activity: 'balcony'` AND `guest: 3` (f7). He
    stands at x -9.93, a metre along the rail from her, both hands on the rail (`Idle_Railing_Loop`, measured: wrists
    0.394 m ahead of his feet, 1.09 m up; the rail is x -9.54, 1.08 m above the deck) watching the floor; when that
    dwell ends `_minglerTurnToTalk()` turns them to each other (both `Idle_Talking_Loop`, f7's slot keeps that clip
    through `clips`). Leaving puts her back on the rail through the usual `slotClip` / `slotYaw` return.
  - **Smoking outside.** `Smoke_Loop` is a 12 s loop: hand low with the palm turned in, an ash flick, then the hand
    comes up PALM TOWARD THE FACE so the cigarette between index and middle fingers points at his lips, a ~1.7 s drag,
    and a chin-up exhale. The wrist targets were measured on his real face: the old clip put the wrist at the mouth, so
    hand and cigarette vanished into his head. `build-crowd-glbs.mjs` hands can carry `thumb` (which way the index
    side faces) as well as `fingers`, which is what turns a palm. The cigarette (`_createMinglerSmoke`) is one
    vertex-coloured unlit mesh plus a glowing tip, PARENTED to `Middle2.R` by `_attachCigarette()` once per stop,
    from the current finger joints. **Spawned people are mirrored in the world** (`_spawnAvatar` replaces the glTF
    root's handedness flip with a plain yaw), so the palm is computed in the body's own frame, never as a world-space
    cross product. A drag is detected from geometry (filter within 5 cm of a mouth node on the Head bone), never from
    clip timing: the tip glows, and 0.45 s after the hand drops an exhale leaves the mouth up and toward the smoking
    hand. Two small particle systems (`minglerSmokeWisp` 60, `minglerSmokeExhale` 45, the club's
    `_fogParticleTexture`, standard blend) run only while he smokes; the cigarette burns down to 55% over the stop.
    Headset cost is unmeasured (a few dozen particles and three draws while he smokes outside).
  - **Tiers.** He is guest slot 2, so Balanced (2 guests) does not show him at all; on High a stop whose guest is
    absent is walked straight through (`_minglerArrive()` departs at once). No per-frame allocation. His cost on a
    headset is **not measured**.
  - **Tests.** `test/unit.test.mjs` re-measures the round's clearance, simulates fifteen minutes of it (rail before
    the balcony talk, two sips, walking under 40% of the time) and checks it is frame-rate independent;
    `test/rig.test.mjs` places him as the club does (mirrored) and checks the cigarette's filter reaches his lips while
    the burning end and every fingertip stay out of his face, that the drink reaches his face, and that his rail
    wrists land on the real rail, all without sliding either foot; `test/e2e/crowd-dance.spec.mjs` raises the tier to
    ultra and walks him a whole round in the real club (filter at the lips, glowing tip, exhale, burn-down, hands on
    the rail within 8 cm, a conversation with f7, the physical bar sequence, closest approach 0.8 m to 22 floor
    characters, street z 7.1 and balcony y 3.0). After changing his clips: `node scripts/build-crowd-glbs.mjs
    --refresh-static --only m6 --optimize` (no asset packs needed).
- **Generic DJs are local choices.** `VRClub.DJ_LOOKS` (`js/club/11-audio-crowd.js`) maps `male` (1.78 m)
  and `female` (1.68 m) to `club-dj-male.glb` / `club-dj-female.glb`, built from CC0 Quaternius
  guests. `chooseDJ()` persists `vrclub.questDJ`; neither music nor remote podcast metadata selects
  a DJ. The male guest's beard is cut out by its exact vertices, and a Universal Base
  Characters `Hair_Long`, shortened to shoulder length and trimmed of everything in front of the ears (its bangs read
  as long eyebrows), goes over the short cap and shares its material, so
  the optimiser still merges to ≤6 draws; optimise `club-dj-male.glb` and `club-dj-female.glb`.
  `setDJ(id)` queues behind `initPromise`, loads each DJ once, disposes the previous performer and
  collider, and tints garment and hair (`/^MI_Hair/`) on the DJ's own container so the crowd is
  unaffected. The DJ is then posed by `DJPerformer` through an `AvatarRig` (see `js/djPerformer.js` above); the GLB's
  `Idle_Loop` only plays if the rig cannot drive it. They are fictional DJs, not endorsed artists.
  Both wear the CC0 "Headphones" model (OpenGameArt,
  see ASSETS.md): `addHeadphones()` in `scripts/build-dj-glbs.mjs` measures each DJ's ears and crown from its bind pose,
  moves the cups out to them and skins the mesh 100% to the `Head` joint, so there is no runtime placement to get wrong.
  That makes a DJ SEVEN draws (the six-draw rule is for everyone else; `test/contract.test.mjs` allows 7 for `club-dj-*`).
  A new DJ is a `DJ_LOOKS` entry and an explicitly wired local selection, never an artist lookup.
- **Environment and surfaces**: the reflection environment is `textures/environment/empty_warehouse_01_256.env` (Poly Haven, CC0; how it is made is in ASSETS.md); do not go back to a bright or coloured sky, it tints every metal surface. Floor, wall and ceiling use a packed `orm.jpg` (R occlusion, G roughness, B metallic): add a new surface set with `node scripts/pack-orm.mjs`. Signs are `createSignage()` (one atlas, one additive mesh), and every character gets a contact shadow from `_refreshContactShadows()`; call `_applyCrowdSize()` after enabling or moving characters.
- **LED wall**: ONE mesh (`ledPanel_wall`), not one per panel. Patterns still write
  `panel.material.emissiveColor` (a plain holder, not a Babylon material), and `_flushLedWall()`
  copies those colours into the wall's 21x10 emissive texture at the end of `updateLEDWallPass`.
  Do not split it back into per-panel meshes, and do not add a code path that writes a panel colour
  after that flush.
- **PBR environment**: local `./js/vendor/environmentSpecular.env`. It used to be fetched
  from `assets.babylonjs.com`; a contract test now forbids any third-party origin in the
  critical path, because one CDN outage silently stripped every reflection in the scene.
- `ModelLoader` has **no** instancing API. `createInstance()` / `disposeInstance()` do not
  exist; both PA speakers are separate loads that share one cached download.
- `TextureLoader` pools textures by `${url}_${scale.u}_${scale.v}`. `releaseTexture(texture)`
  takes the texture instance, not a URL, and references are counted on BINDING
  (`applyTexturesToMaterial`), not on pool hits.
- Downloads that read a body must use `fetchBufferWithTimeout` / `fetchBlobWithTimeout`.
  Plain `fetchWithTimeout` clears its deadline as soon as headers arrive, so a stalled body
  hangs startup forever.

### Layout coordinates (`CLUB_POSITIONS` in `js/club/01-core.js`)
- DJ booth: `{ x: 0, y: 0.95, z: -18 }`
- Dance floor centre: around `z = -12`
- Entrance: a 4 m doorway in the front wall at `z = 0` (x -2..2, 3.4 m high) onto the foot of the entrance stair; the
  vestibule (`z 0.25..6`) is a stair hall climbing to street level (`VenueLayout.vestibule.streetLevel`, 2.8 m). Its street
  door (`z 6.3`, x ±1.66, 3.06 m high, sill at street level) opens onto the avenue outside (see The street)
- The club shell ends at its facade: front wall `z 0.25`, side walls, floor and ceiling `z -21.25..0.25` (they used to run 12 m
  on past it, which would have covered the street)
- Bar: along the right wall, `x 9.7..12.25`, `z -13.8..-6`
- PA speakers: flown from the rear truss at `x = ±6`, cabinet top `y = 7.1`, `z = -16`
- Lighting rig side cross beams, their six moving heads and the two side lasers:
  `x = ±CLUB_POSITIONS.sideTrussX` (7.6), over the dance floor, clear of the balcony, the bar and the flown PA

Treat `CLUB_POSITIONS` and `ROOM_BOUNDS` as the source of truth; do not re-derive
coordinates from documentation. The bar and vestibule numbers live in `window.VenueLayout`
(`js/venueDressing.js`); the guest slots, the bartender and the tests read them from there.

### Entrance and bar (`js/venueDressing.js`, `js/barProps.js`)
`VenueDressing` is a mixin like `LEDPatterns`: `createEntranceArea()` and `createBar()` run at the end of
`_buildVenue()`, after `createLights()`. Rules:
- **One draw per material.** Boxes and cylinders are collected per material by `_dressingBuilder()` and merged.
  Do not add per-bottle or per-prop meshes. The 130+ bottles are ONE vertex-coloured mesh (`barBottles`): glass tint is
  the vertex colour, labels, caps and roughness come from a 512 px atlas painted at runtime (`BarProps.paintAtlas`).
  Bottle shapes are generic and the label words descriptive; do not paint real brand names or logos.
- **Two scoped accent lights** (`entranceLight`, `barLight`) reach only their own meshes (`includedOnlyMeshes`) and take the
  first material slot through `renderPriority = 1` plus `_resyncLightSources()`, exactly like the DJ and PA accents. Anything
  added to the bar later (the bartender, the stools) joins through `_extendAccentLight()`. No light budget changes.
- **Walls**: the front wall is three boxes (`frontWall`, `frontWallRight`, `frontWallLintel`) around the doorway. The vestibule's
  street wall has a doorway too, at street level (solid below it, a pier either side and a lintel; `VenueLayout.vestibule.doorHalfWidth`
  / `doorHeight`). Until the
  street has loaded the door is SHUT: two glass leaves, a mullion, push bars and an invisible `streetDoorBlock`
  (`this._streetDoor`). `CityDistrict._openStreetDoor()` hides the leaves and removes the block; it runs when the street
  arrives, or at the end of `createEntranceArea()` if the street got there first. A unit test with real Babylon proves the shut
  door blocks, the open one lets a person through, and the wall around it is still a wall.
- **The club is a basement; the vestibule is a stair hall.** `VenueLayout.vestibule.stair` (`halfWidth 1.8`, `zBottom 0.85`,
  `zTop 5.0`, 16 risers of 0.175 m, 15 treads of 0.277 m) climbs from a short landing at the club's doorway to a landing at
  the street door, at `streetLevel` (2.8). Either side of the flight is a solid gallery at street level (ticket desk left, coat
  check right), railed along the stairwell and its front edge by steel railings plus invisible `vestibuleGallery*` blocks.
  The steps are SOLID boxes (nothing to walk under) in one mesh, `vestibuleStair` (`this._vestibuleStair`): collidable, so the
  desktop camera slides up its risers, and collision group 2 like the balcony's treads, so the headset follows it instead
  (`xrCamera.collisionMask` excludes 2 whenever either exists). It and `vestibuleFloor` are teleport floors. The red carpet
  runs down every tread and riser, with brass rods and cyan nosings either side of it.
  `VenueLayout.vestibule.walkLevel(x, z)` is the walking surface from the front wall outward (null inside the club):
  0 on the bottom landing, a ramp over the flight, `streetLevel` on the galleries, the top landing and the whole street.
  `Mezzanine._walkSurfaceLevel()` joins it to the balcony's, and both the desktop and the headset follow it. Camera presets
  `arrival` (the top landing, looking down the stair) and `street` carry `level: streetLevel`. The street wall's EXIT sign is on
  the lintel (`createSignage()` reads `streetLevel`). Tests: the stair's geometry, rails and walking surface (unit, real Babylon);
  walking up and down on the desktop under real collisions and with the VR thumbstick (`test/e2e/street.spec.mjs`).
- **Bartender**: the Quaternius female guest in her own container (black outfit), named `bartender` (not `guest*` or
  `dancer*`, so no tier removes her). `AvatarRig` poses both hands for her washing loop and measured counter reaches;
  the source file's idle clip is only the fallback when the rig refuses the skeleton. The guest slots keep out of the
  bar footprint (tested).
- **Stools**: Poly Haven *Metal Stool 03* (`ModelLoader` key `bar_stool`) placed once by the loader and instanced four more
  times by `_furnishBarStools()`; its emissive floor is lowered there because the loader's generic 0.12 reads as pale paint.
- `node scripts/build-bar-assets.mjs` regenerates `textures/barWood/` and the stool GLB from Poly Haven.
- Everything is measured on desktop SwiftShader only; the extra triangles (about 48k bottles, 33k stools, 33k bartender) are
  unmeasured on a headset.

### Bass bins under the PA
One Sketchfab *Bass Bin 3* (CC BY 4.0, darksoundlab) hangs under each flown speaker (`bass_bin_left` / `bass_bin_right` in `getModelConfigs()`).
- **Placement is derived, never hand-tuned.** `hangFrom` names the host; `_resolveHangPlacement()` hangs the bin from the host's
  measured `placed.bottomCentre` (`_fitAndPlace` returns it, so it is right for a tilted cabinet), `hangGap` below it, and faces it
  the way the host faces (yaw only: it hangs LEVEL, as a real bin on its own chains does). The bin's mouth is local +z. Bins load after
  the speakers (`loadAllModels`); a missing host throws and the bin is simply not shown.
- **Rigging**: `createBassBinHangingHardware()` draws a master link and two chains to the bin's lifting eyes as one merged mesh.
- **Lighting**: a hung model joins its host's `speakerLight_*` accent (first slot, budget unchanged). `emissiveFloor` and `albedoTint`
  are per-model config options: the generic 0.12 emissive floor turned the black carpet grey.
- **Cost**: the optimiser joins the bin's 12 meshes to 6 (one per material), so 2 bins are 12 draws, ~41k triangles, 1.6 MB shipped.
  Two invisible blocks (`_blockBassBins`) fence them. Headset cost is unmeasured.

### Mezzanine (`js/mezzanine.js`)
A steel balcony (deck at y 3.0, x -12.2..-9.5, z -19..-10.4) on the left wall with a 16-step stair climbing along that wall
from z -6.2. It reuses `_dressingBuilder()` and `_createScopedAccent()` from `venueDressing.js`, so it is four merged meshes
(`mezzDeck`, `mezzPanel`, `mezzRails`, `mezzGlowCyan`), one accent light (`balconyLight`, first slot, no budget change) and the
bar's stool GLB instanced twice. Textures are Poly Haven `steelDeck` / `steelPanel` (`textureLoader` configs, CC0).
- **Walking**: `Mezzanine._walkSurfaceLevel()` decides the surface a walker stands on: `VenueLayout.vestibule.walkLevel()` from the
  club's front wall outward (the entrance stair and the street), otherwise `MezzanineLayout.walkLevel()`. The collision system carries the desktop
  camera UP the stair (no gravity there), so `_updateWalkSurface()` only records the level on ascent and lowers the eye on
  descent. It never snaps anyone onto the deck from beneath: a candidate surface more than 0.5 m from the current level is
  ignored. `this._walkLevel` feeds the player body's `groundY` and the `balcony` camera preset (`level`). In VR,
  `_updateVRWalkSurface()` owns the headset's height: it finds the surface under the FEET (eye minus `_xrHeadHeight()`) and
  holds the headset on it, so teleports onto the deck or a stair tread stick, smooth walking climbs the stair, and stepping
  off the edge drops to the floor. The deck mesh (`_mezzDeck`, deck plate plus every tread) is a teleport floor via
  `_teleportFloorMeshes()`. Never read `WebXRCamera.realWorldHeight` from a scene observer: it reads the XR frame and throws
  outside the frame callback; `_xrHeadHeight()` samples it inside `onXRFrameObservable`. `test/e2e/mezzanine.spec.mjs`
  teleports onto the deck, back down and onto the stair in the Quest emulator.
- The deck guest is guest slot 3 (`y: 3.0`), so only the ultra and high tiers seat it. Keep floor guests out of the
  footprint (a unit test enforces it).
- `node scripts/build-mezzanine-assets.mjs` regenerates both texture sets.

### The street (`js/cityDistrict.js`)
Out of the vestibule's street door, at the top of the entrance stair, is a night avenue: a four-lane road along x (-48..48, road `z 9.25..21.25`), a 3 m kerb
strip either side, a paved forecourt `z 0.25..6.25` in front of the club, a row of six buildings facing the club across the
road (front plane `z 24.25`) and two buildings either side of the club facing the street (front plane `z 0.25`, from `|x| 13.5`).
It is built from the CC0 Quaternius *Downtown City MegaKit (Standard)*, which is NOT in the repository.
- **One baked GLB.** `js/models/city/downtown.glb` comes from `node scripts/build-city-assets.mjs --kit "<unzipped kit>/Exports/glTF (Godot)"`,
  then `npm run bake:street-props -- --cars "<Car Pack>/OBJ" --house "<Ultimate House Interior Pack>/OBJ"`.
  The idempotent second bake adds three parked cars, two small bins and one entrance plant from those additional CC0
  Quaternius packs. It bakes their flat colours and the cars' tiny palette textures into vertex colour on one shared
  material; every prop remains one named node/one draw so `_createCityColliders()` can give it its measured blocker
  instead of a building's six-metre blocker. The layout, LOD, materials and texture sizes are in those scripts (recipe
  in ASSETS.md). Change the layout there and in
  `CITY_LAYOUT` (`js/cityDistrict.js`) together: a unit test fails if they differ. The script needs `meshoptimizer` (a dev
  dependency used offline only; the runtime still needs no decoder). Kit geometry is right-handed and Babylon's loader mirrors X,
  so the script writes kit x = -club x. Babylon makes one mesh per primitive (`far3_primitive0`), named after the node.
- **Rendering rules.** Everything is opaque (only the road paint is alpha-TESTED, `decals`); every material is held to
  `this.maxLights` and left unfrozen; tints are baked into vertex colour so a building is 4 to 6 draws (brick, trim, metal, windows,
  roof asphalt). The windows are one 1024 px atlas (three room pictures plus a black glass tile) used as an emissive map, and the
  room cards are lifted 16 cm in front of the glass so lit rooms show. Never put the kit's PNGs in the scene (78 MB).
- **Night lighting.** Two lights reach only the city (`cityMoon` directional, `cityFill` hemispheric, `renderPriority = 1`,
  `_extendAccentLight()`), exactly like the DJ and PA accents, so no club material gains a slot. Their intensities (5.5 and 3.8) and
  the windows' `emissiveIntensity` (1.7) were tuned in the real pipeline: the club's grade (ACES, contrast 1.2, vignette)
  crushes a dim scene, and values that look right in a bare Babylon viewer are four times too dark here.
- **It costs nothing indoors.** `updateCityDistrict()` (called from `_beginFrame()`) disables the whole root unless the guest is
  forward of `z -8` (hysteresis: it hides again below `-10`). It stays enabled while `_cityWarm` so `scene.whenReadyAsync()` compiles
  every material before the VR button wakes. The street loads at the END of `modelLoadPromise`, so "Preparing VR..." covers its
  parse stall; a failed load only leaves the street door shut (`createCityDistrict()` never rejects).
- **Outdoors.** `CityLayout.exteriorAmount(x, z)` (0 in the club and vestibule, 1 outside, a smoothstep through the door) is the single
  definition; audio, fog and the visibility manager all use it. `this._exterior` is its eased value; `_tintClubAir()` thins the fog to
  38% and turns it night blue. The sky (`citySky`, an `infiniteDistance` dome inside the camera's 100 m far plane) and the
  skyline (`citySkyline`, 20-odd towers and two end blocks in ONE mesh with a canvas-drawn window grid) are procedural and unlit.
- **Collision and teleport.** One invisible box per building (union of its primitives' bounds) and a fence at each end inside the
  bollards (`fenceX 45.5`) are always enabled; they are far from the club so they cost nothing indoors. The street ground, the
  vestibule floor and stair, the club floor and the deck are the teleport floors (`_teleportFloorMeshes()`). The `street` camera preset
  and the VR menu's STREET button refuse until `_streetDoor.open`.
- **The street door's front: a bouncer and a queue.** `CityDistrict._createStreetDoorDressing()` builds a velvet rope
  line on the pavement (`CityLayout.ropeZ` 7.65, from `ropeFromX` 2.7 to `ropeToX` 9.8, plus a rope across the head of the
  queue back to the facade), a warm lamp bar over the door and `streetDoorLight`, a scoped point light (renderPriority 1)
  that reaches only the rope, the vestibule's facade, the street ground and the people outside. Ropes are parented to the
  district root (hidden with it); two invisible blocks make them solid. `VRClubAudioCrowd._streetSlots()` places the bouncer
  (`club-crowd-bouncer.glb`, black suit, relaxed `Idle_Loop`, 1.96 m, beside the door at x 2.25, clear of its opening) and
  up to eight people queueing behind the rope facing the door (a talking pair at the head, then relaxed `Idle` poses). The
  queue's length is the tier's `queueSize` (8/6/4), and its order keeps a balanced queue free of anyone dancing inside on
  that tier. `_applyStreetPeople()` runs when both the street and the crowd exist (either may finish first), loads the files
  it needs in the background (`_streetTopUp`) and adds everyone to `streetDoorLight` and `cityFill`;
  `_showStreetPeople(visible)` (from `updateCityDistrict()`'s visibility toggle) disables them, their colliders and their
  animation groups whenever the street is hidden. Queue slots carry different slow `ambient` timing so relaxed idles
  glance toward the door or street without moving the talking pair off each other. `_updateBouncer(dt)` slowly scans the
  pavement when alone and turns toward a player within 7 m, at most 1.3 rad off his post. The relay's avatar pool is only
  `f*`/`m*`, so no player is handed the bouncer.
  Headset cost (up to nine extra skeletons near the entrance) is unmeasured.
- **Street level.** The club is a basement: the GLB is baked at y = 0 and the `cityDistrict` root is lifted by `CityLayout.groundY`
  (2.8, equal to `VenueLayout.vestibule.streetLevel`, unit-tested), so colliders and the fence are built from world bounds and the
  skyline is re-frozen after parenting. The forecourt's paving is left out within `forecourtOpening` (3 m) of the centre line, over
  the entrance stair; the stair hall's own floors cover the gap, which is inside the vestibule (tested both ways). A new layout
  must change `CITY` in the bake script and `CITY_LAYOUT` together (a unit test compares them).
- **Unmeasured:** about 154k triangles and 7.2 MB, 66 draws with the whole street in view; no Quest 3S frame time yet. LOD was set by eye
  and by the simplifier's plateau (facades are thousands of separate window-frame islands, so the topological simplifier stops near 50%;
  beyond 22 m the window frames also go through the sloppy one). `test/e2e/street.spec.mjs` walks out under real collisions, checks the
  visibility toggle and measures the spectrum on the street.

## Mesh naming

Procedural meshes are found by name for cleanup, so names are load-bearing:
`leftCDJ`, `rightCDJ`, `mixer`, `sub-7`/`subGrill-7`/`mid-7` (left stack),
`sub7`/`subGrill7`/`mid7` (right stack), `speakerLED-7`, `ledLight-7`.

When a real `.glb` loads, hide the conflicting procedural geometry with `setEnabled(false)`
to avoid z-fighting.

## VR access invitations

`js/paymentGate.js` preflights server access before immersive entry and offers Stripe Checkout,
verified-email recovery, invitations and device management. Asynchronous requests must NEVER
auto-enter XR (user activation): prepare a VR lease first, then enter on the next user click.
`worker/src/payments.js` owns `/payments/redeem` and `/payments/entitlement`, exact-origin credentialed
requests, and the HttpOnly API-host cookie. `worker/migrations/0002_vr_invitations.sql` stores only
domain-separated SHA-256 code hashes, redemption subject/time and optional revocation time.
The single conditional `UPDATE … RETURNING` both consumes the code and grants access atomically; never
replace it with a read-then-write check. Legacy invitations used signed `invite:<UUID>` subjects;
new redemption requires a verified server session and links `vr_invitations.user_id` atomically
with consumption and an audit event. Only a redeemed, unrevoked row grants access.
Owner issuance (`scripts/generate-vr-invitations.mjs`, `npm run vr:codes`) produces eight-digit numeric codes
using shared rejection-sampled Web Crypto randomness (the email verifier uses the same helper)
in a new private directory outside the repository (including symlink checks), never console output,
and a hash-only SQL import. Imports fail on collisions: do not distribute until the import succeeds,
and regenerate a colliding batch. A reimport cannot reset consumed codes. Dashboard issuance retries
existing hashes and within-batch duplicates, then uses an atomic insert/audit transaction.
Old 32-character hexadecimal invitations retain their original normalization and hash.
Numeric redemption uses D1 `access_rate_limits`: 30/IP per 10 minutes, 10/verified account per
10 minutes and 300 globally per hour, before the conditional redemption update.
The gate stages the invitation only in memory, guides code → email → verification, then redeems
and registers this browser if a slot is free. Both eight-digit fields have read-only numeric displays,
physical-key/paste support and a 3×4 on-screen keypad. The UI accepts numeric invitations only;
there is no legacy entry option or explanation comparing new and old formats.
Existing entitlements are restored without consuming a staged invitation. It never auto-enters XR.
`worker/src/invitationAdmin.js` and `invitationDashboard.js` serve the Access-protected dashboard
at `https://api.mitwee.nl/admin/invitations`. Every `/admin` route verifies a signed RS256 Access JWT
with `jose` (root dev dependency bundled into the Worker), configured issuer/audience/expiry and the
`INVITATION_ADMINS` signed-email allow-list; a mere email header is NEVER trusted. `workers.dev` admin
requests are denied. Mutations require same-origin JSON, and all responses are no-store.
Cloudflare Access application `NOCTURNE invitation administration` protects `api.mitwee.nl/admin`
and its subpaths; exact email `garfieldapp@outlook.com`, existing one-time-PIN IdP, six-hour session.
`0003_invitation_admin.sql` adds private labels/actor fields and `invitation_audit`. Issuance
(1–20 codes) and revocation each use D1 batch transactions with their audit event. Codes are
returned once on issuance, never stored or recoverable from the list. Revocation needs confirmation.
Change administrators in BOTH the Access policy and the Worker allow-list. This is an admin
control only: the public client-side VR gate remains bypassable by deliberate frontend modification,
a product risk accepted by the owner. Tests use real signed JWTs, real SQLite, and browser dashboard flows.
No unauthenticated generation endpoint exists. First verified-email redemption wins (codes can be
forwarded BEFORE redemption). Cookies last one year; loss/new device restores the same grant by
email verification, not by reusing an invitation.
`worker/src/accessRecovery.js` owns recovery, named device slots (two per account) and account-wide
VR leases (one active device/tab, 90 s expiry, 20 s renewal in XR). Migration 0005 adds hashed
server sessions, one-use eight-digit email challenges (10 min, five attempts), persisted request
rate limits, device/session revocation and `access_audit`. `EMAIL` sends transactional codes
through Cloudflare Email Sending from `access@mitwee.nl`; never log codes or full email bodies.
`ACCESS_RECOVERY_ENABLED = "1"` is the staged rollout switch; production must keep it on.
Legacy paid access must verify the receipt email. Legacy anonymous invitation cookies can bind
once to a verified email; old cookies stop granting access afterward. Lost legacy cookies require
independent support identification and the Access dashboard's confirmed `link-legacy` action,
which only transfers an existing unlinked grant to an already email-verified user and audits
the signed admin. Recovery history is available only behind Access. See `docs/QUEST.md`.
Real SQLite migration/redemption/concurrency tests run under Node 24; Node 20 runs the remaining unit tests.

## Audio

`<audio crossOrigin="anonymous">` → `MediaElementSource` → `AnalyserNode(fftSize=256)` →
`DynamicsCompressor` → `GainNode` → destination.

- **Web Audio is right-handed, Babylon is left-handed.** Never write a Babylon coordinate to a
  `PannerNode` or the `AudioListener` directly: use `AudioUtils.setPannerPosition()`,
  `setPannerOrientation()` and `AudioUtils.audioX()`, which mirror X. Done raw, the PA is heard
  in the opposite ear to where it appears. `test/e2e/audio-spatial.spec.mjs` plays noise through
  the real graph and fails if a speaker is louder in the wrong ear.
- `getAudioData()` averages the analyser's 128 bins as bass = bins 0–11, mid = 12–63,
  treble = 64–127. At 48 kHz and `fftSize = 256` that is roughly 0–2.2 kHz, 2.2–12 kHz and
  12–24 kHz, so "bass" also carries vocals and snare body. The show's energy uses the bass band
  and treble adds a small LED-wall shimmer. The lasers and mirror ball follow the look and the kick pulse, not the bands.
  Re-banding needs the Show Director's energy thresholds recalibrated (see `BACKLOG.md`).
- **The kick band** is a second tap: `audioSource` → `kickFilter` (low-pass 120 Hz, Q 0.7) → `kickAnalyser`
  (fftSize 8192, ~170 ms, time domain), a dead end that nothing hears. `_readKickBand()` writes `lowRms` (RMS), `low` (RMS against
  a peak with an 8 s half-life) and `energy` (a 0.5 s average against one that slows from 1 s to 20 s after the track
  starts, mapped `(ratio - 0.3) / 1.0` into 0..1; levels start over after 2 s of silence) into `_audioFrameData`.
  `low`/`energy` are `null` when there is no kick analyser. Kick detection uses it (see `js/vjDirector.js`); the main
  analyser and its bands are untouched because the LED patterns and movement thresholds are calibrated on them.
  **The detector runs on the audio clock, not the frame rate.** Each frame `_readKickBand()` reads back over every
  1/60 s of audio played since the last read (`audioContext.currentTime`), one 512-sample RMS window per step, into
  `frame.kickSteps` (preallocated, `KICK_MAX_STEPS` 16). It used to read only the newest window once per frame, and
  the 60 ms rise test then found no earlier sample below ~50 fps: on a real Resident set the beat was present 99% of
  the time at 60 fps, 23% at 30, 1% at 20 and never at 12, so the crowd fell back to its free sway whenever the room
  was heavy to draw. With steps: 99 / 97 / 92 / 100%. At 60 fps it is still one window a frame (the tuning is
  unchanged). `test/unit.test.mjs` drives a continuous waveform through it at 60/30/20/12 fps.
- **The rhythm band** is a third tap, in parallel with the kick band: `audioSource` → `rhythmFilter` (high-pass
  200 Hz) → `rhythmAnalyser` (fftSize 8192, time domain), read by the SAME `_bandStep()` audio-clock windows as the
  kick band (`frame.kickSteps.rhythm` / `.rhythmLevels`), so the two bands are always compared sample-for-sample.
  It exists because a long breakdown can drop the kick entirely while hats, a snare or a synth arpeggio keep a
  danceable pulse going; without it the crowd fell back to its slow free sway the moment the kick did, even though
  the track was still clearly in time. See `js/vjDirector.js` for how the band becomes `rhythmPresent` and
  `js/crowdDance.js` for what the crowd does with it.
- **Occlusion and the street.** `updateSpatialAudioListener()` runs two low-pass stages in series after the PA panners
  (`occlusionFilter`, then `occlusionFilter2`). Indoors only the first works, and it is ONE continuous sweep, not a step
  at the doorway: `VenueLayout.vestibule.enclosure(z)` smoothsteps from 1 at the dance floor's front edge
  (`roomMouthZ`, kept equal to `ROOM_BOUNDS.z.max` by a unit test) to 0 at the top of the entrance stair
  (`stair.zTop`), and the cutoff is interpolated in log-frequency between 520 Hz up there and 20 kHz in the room
  (~2 kHz at the bottom step, ~2.8 kHz in the doorway). Everything the ROOM itself makes follows the same curve — the
  reverb send, the early reflection (`roomDelayGain`) and the crowd bed are all scaled by `enclosure` — so a guest on
  the stair no longer gets the room's full-band tail at its loudest, which was most of why the club used to sound wide
  open from the stairwell. The make-up gain ramps with it too (0.72 at the top of the stair to 1.15 on the floor)
  instead of stepping. The **sub channel is deliberately left alone**: bass through a wall is correct.
  Past the street door (`CityLayout.exteriorAmount`) both poles close, interpolated in log-frequency, to a bass-only
  24 dB/oct (90 Hz down the avenue, 180 Hz at the door), the room's reverb send and early reflection and the crowd bed
  fade to zero, the
  sub channel (omni, 100 Hz) stays present and fades with distance from the door, and the master gets make-up gain (1.25 at
  the door) that then falls with distance from it, `1 / (1 + max(0, d - 2) / 6)`: -6 dB 8 m out, -10 dB on the far pavement,
  -18 dB at the end of the block. The analyser
  taps the source BEFORE all of this, so the light show stays full-band outside. `test/e2e/street.spec.mjs` measures the real
  spectrum: more than 90% of the energy below 250 Hz on the street, under 40% in the room. A unit test walks the stair
  in 10 cm steps and fails if the cutoff ever falls back or jumps more than a third of an octave in one step.
- URLs are validated by `_isSafeAudioUrl()`: `blob:`/`https:` always allowed; `http:` only
  when the page itself is not HTTPS or the host is loopback; embedded credentials rejected.
- A stream served without `Access-Control-Allow-Origin` can produce an all-zero analyser.
  `getAudioData()` warns only after a sustained, unmuted silent window and phrases it as a
  heuristic ("silent so far; may be a server CORS restriction"), not as proof.
- **Quest music (`js/musicLibrary.js`).** `MusicLibrary` owns at most eight HTTPS audio or SoundCloud page links
  in `vrclub.questMusic`, with optional names and a selected index. Storage failures surface explicitly.
  YouTube and Spotify webpage URLs are rejected.
  **Every SoundCloud track URL (kind `soundcloud`) plays as analysed audio, never in SoundCloud's own player by
  default**, so the crowd, DJ and lights react exactly as on `main`. `_resolveSoundCloud()` first tries the
  allow-listed Colourizon feed for `soundcloud.com/missmelera/<track>` (matched by permalink or Colourizon
  number), then asks the relay's `/soundcloud/resolve?url=` (`worker/src/podcast.js`), which takes the track id
  from SoundCloud's public oEmbed and offers a `/soundcloud/stream/<id>-<user>-<slug>.mp3` stream only if
  SoundCloud's podcast-stream endpoint serves that track (it 404s for tracks whose creator has not published
  them to podcast players). Nothing scrapes or unlocks audio SoundCloud does not give podcast apps: such a
  track fails with a persistent explanation (`error.code` `soundcloud-not-published`, `-not-a-track`,
  `-relay`) and the saved set is kept. The embedded player (lazily loaded Widget API; the exact
  `https://w.soundcloud.com/player/api.js` is the only remote script CSP exception, `frame-src` its player) is
  reached ONLY through the explicit "Open in SoundCloud player" button (`playInSoundCloudPlayer()`,
  `lastMode === 'player'`); then `_unanalysedDanceMusic()` supplies only crowd/DJ choreography on a shared
  120 BPM clock (no analyser samples, kicks or fabricated drops) and the lights run their own tempo clock.
  An unnamed SoundCloud set takes the track's title on first play.
  An RSS feed URL (kind `feed`) is supported ONLY for `podcast.hernancattaneo.com` (any non-audio path, plus the
  `http://` upgrade): the page CSP's `connect-src` lists exactly the hosts the browser may read, and a test ties
  `RESIDENT_FEED` and the relay origin to it (the Quest branch once dropped the Resident host, so Hernan sets
  never loaded). Its episode picker (`listEpisodes()` reads the whole feed, 10 min cache, at most 400) offers the newest
  episode (default; the Resident feed is read by a 64 KB range first, like `main`), a random one, or any episode;
  `setEpisode()` saves the choice with the set (`item.episode`, kept when the URL is saved again). Only the
  Resident and Podbean hosts accept `http://`, upgraded to HTTPS on save.
  The Music panel's **Paste URL** button reads the clipboard only from its click gesture, fills
  the URL field without auto-playing, and gives press-and-hold paste guidance when clipboard
  access is unavailable or denied (as it may be in a Quest browser).
  The Audio panel, VR menu and VJ desk all call the same library. No built-in stream, feed or queue
  is initialised. Historical `js/podcasts.js` remains source-only. The Worker's podcast endpoints
  are a live dependency of SoundCloud playback: a Worker change is not live until `wrangler deploy`
  is run from `worker/`.
  Direct audio and WebRTC remain on real analysis; silent audio never automatically triggers the fallback.
- **Entry music.** ENTER creates the AudioContext in the user click and resumes only an explicitly
  saved set. Fresh profiles show guidance to open Music, with no third-party music request.
  Historical `vrclub.lastStreamUrl` / `vrclub.podcast` are ignored. Sets use `{ onDemand: true }`
  (no loop or automatic next track). Blocked playback retries on the next click/key.
- **Seeking.** `getPlaybackInfo()`, `seekAudioTo/Fraction/By()` and `toggleAudioPlayback()` in
  `js/club/10-ui.js` are the one API (Audio menu slider `#audioSeek` and ±30 s, VR Music page). Seeks
  clamp to `duration − 1` (seeking to the very end fires `ended` and advances the queue); live streams
  (infinite duration) are not seekable; only the host publishes the position (`_shareAudioPosition`).
- A reconnect of a finite-duration source resumes at its position (`_recoverAudioStream()`).
- The Audio menu separates **Music** (the chosen stream/file only) from **Ambience** (the
  generated crowd bed). `setAudioVolume()` writes only the media element; the crowd bed has
  its own persisted `vrclub.crowdAmbience` gain, and the per-frame acoustic ducking never
  overwrites that user setting.

## Persistence

`vrclub.privateRooms` stores up to twelve locally saved private-room bookmarks, scoped to
the relay URL. Private rooms successfully joined on this device are also remembered.

| Store | Key |
|-------|-----|
| IndexedDB `VRClubTextureCache` / `textures` | asset URL |
| IndexedDB `VRClubModelCache` / `models` | asset URL |
| `localStorage` | `vrclub.safeMode`, `vrclub.bassHaptics`, `vrclub.graphicsTier`, `vrclub.avatarStyle` (`female`/`male`), `vrclub.crowdAmbience`, `vrclub.questMusic` (saved links/names/selection), `vrclub.questDJ` (`male`/`female`), `vrclub.networkServerUrl`, `vrclub.networkRoom`, `vrclub.networkName`, `vrclub.networkUid` (secret; never shown), `vrclub.blockedPeers`, `vrclub.personalSpace`, `vrclub.autoNod`, `vrclub.avatarPool`, `vrclub.nameTags` (`'0'` = hidden), `vrclub.duckForVoice` (`'0'` = off), `vrclub.hiddenPeople` (a comma-separated list of the groups sent home: `dancers`, `bystanders`, `dj`) |

VR comfort is persisted separately as `vrclub.vrComfort` (off for new visitors; only stored `1` enables it).
The splash and constructor use `resolveVRComfortMode()` so existing saved choices are preserved.
`setVRComfortMode()` owns locomotion through `_applyXRLocomotionMode()`. Babylon declares
MOVEMENT and TELEPORTATION **mutually exclusive** (enabling one while the other is enabled
throws), so comfort mode *swaps* features: comfort on disables MOVEMENT and (re)enables
teleportation; comfort off, in-session only, disables teleportation and enables MOVEMENT.
Never enable either feature directly, and never put controller button bindings behind the
locomotion call: a thrown `enableFeature()` once silently dropped sprint, jump and the only
Y/B quick-menu binding. Comfort mode suppresses sprint/jump. The XR camera NEVER uses camera
gravity (its collision ellipsoid hangs from the eye, so gravity sank the eye and blocked every stair);
the deck/treads reserve collision-group value `2`, excluded by the XR camera's collision mask.
Desktop collision, teleport picking and jump-ground rays still use the actual tread mesh;
XR horizontal collision still includes the rails, structure, furniture and room walls.
**The XR collider is a torso, not a person.** Babylon hangs a camera ellipsoid from the EYE, so a fixed
0.8 m radius reached the floor only at a head height of exactly 1.6 m; any lower headset (shorter
player, seated, crouched) put it through the floor and the floor mesh blocked every step. The guarded
`_updatePosition` calls `_fitVRCollisionBody()` first: radius 0.25 m, spanning 0.3 m to 1.3 m above the
FEET (never above the eye), re-hung from the sampled head height through `ellipsoidOffset`. Never
set `xrCamera.ellipsoid` to anything that scales with the eye. Likewise a crowd member's occupant
collider is its own mesh, so `_applyCrowdSize()` enables and disables it with the dancer; a leftover
collider is an invisible wall.
Height in the headset belongs to `_updateVRWalkSurface()`, and `_guardVRCameraSteps()` wraps the XR
camera's own `_updatePosition` so a smooth-locomotion step is level, at most 25 cm (frame hitches), and
collisions cannot slide it upward.
Desktop `_guardDesktopCameraSteps()` projects FreeCamera motion onto the floor, preserving
horizontal speed while removing pitch-driven vertical travel. Q/E fly bindings are empty;
the text-field-aware global shortcut maps one E press to `jumpDesktop()` (no repeat).
`_updateWalkSurface()` holds the eye 1.7 m above the authoritative surface, including the
DJ riser, and integrates a 0.45 m jump arc under 9.81 m/s² gravity instead of free flight.
The desktop collision ellipsoid spans 0.3–1.3 m above the feet (radius y 0.5,
offset y -0.4); foot clearance prevents solid stair risers blocking the surface follower.
Babylon defers XR movement: both the guard and surface follower must also write
`_deferredPositionUpdate.y` when `_deferOnly && _deferredUpdated`, or the next XR frame restores
the collision lift / discards the surface correction.
Jumps and preset travel also synchronize the queued position so walking/turning cannot undo them.
`_xrMovementOptions()` swaps Babylon's default input registrations: the LEFT stick walks along the
headset heading, the RIGHT stick turns smoothly. Head pitch never adds flight.
`_xrHeadHeight()` registers before XR entry and samples the base reference space first on each XR frame;
all finite heights (including zero) are valid. No first pose means no surface correction or preset travel;
a missing pose retains the last valid height, and a new session clears it.
Walking uses the actual collidable shell, not the obsolete interior perimeter band.
Teleport blockers are derived from enabled collidable scene meshes, excluding the floor/deck walk surfaces,
and refreshed on every comfort reapplication. XR entry preserves tracked eye height.
`moveCameraToPreset()` routes to the XR camera when active,
preserving head orientation and measured seated height with a booth floor offset.
The paged quick menu includes lighting, effects, show/reset, a CROWD page (who is in the club), comfort (locomotion,
safe mode, haptics, quality), five destinations (entrance, dance floor, DJ booth, balcony, street) and a **Music** page: a seek
strip (`vrQuickMenuSeek`, click or drag a ray on it; `_beginVRSeek/_moveVRSeek/_endVRSeek` ride the
scene pointer observables, the seek happens on release), ±1 min, play/pause, saved-set Previous/Next,
Play saved set and ADD LINKS / FILE. `_openQuestPanel()` exits XR for music entry or licences;
the guest then presses Enter VR to return. CROWD → CHOOSE DJ offers male/female.
Its clock redraws from a 500 ms ticker that runs only while that page is open;
Y/B or the runtime menu component opens it, world-locked where the player is looking
(`_placeVRQuickMenu()`); never parent it to the XR camera. Haptics are opt-in for new visitors and
the same preference gates both bass pulses and UI feedback. These preference and
travel actions must not force VJ manual mode.

**Fast social wheel.** In a room, clicking the right thumbstick opens a world-locked wheel for Chat,
Reactions and Microphone. Tilt to highlight, click to choose, then center before the next choice.
Its paged actions and recipient choices come from the existing network-menu definitions; it never
reimplements a social action. Left-stick click and either grip retain sprint. While open, the wheel
suspends smooth/snap rotation and restores the exact prior flags only after the stick centers, or
immediately on XR exit, right-controller removal, comfort-mode changes or disposal. Its texture and
multiplayer subscription are disposed with the scene.

## UI

The DOM panel (`js/ui-init.js`), the VR quick menu (`js/club/10-ui.js`) and the VJ desk at the DJ table
(`js/vjDesk.js`) are three surfaces over ONE control set. All state mutation lives on `VRClub` —
`toggleLightControl(control)` (the shared allow-list `VRClubUI.LIGHT_TOGGLES`, the Safe Mode strobe rule,
`applyFixtureExclusivity()`, and `takeLightControl()`), `resumeAutoShow()`, `setLightSpeed()`, `cycleSpotColor()`,
`cycleMirrorBallColor()`, `resetVJControls()` — and the handlers only call those and render feedback. They previously
reimplemented the same actions and had silently diverged; tests enforce the delegation. The display names for spot
modes and aims are `VRClubUI.SPOT_MODE_NAMES` / `SPOT_PATTERN_NAMES` on every surface. Keep the terminology distinct:
`cyclePattern` is the moving heads' **SPOT AIM PATH**, while `goboActive` / `cycleGoboPattern` control a **PROJECTED
GOBO** / **GOBO IMAGE** on the floor or wall. The internal `circle` gobo means an open gate and is displayed as
`OPEN`, because it deliberately leaves the normal soft spotlight pool visible.

**The VJ desk** (`js/vjDesk.js`, mixed into `VRClub.prototype`; `createVJDesk()` is called from `createDJBooth()`).
It replaced eleven unlabelled coloured boxes, a speed slider and an audio box that opened a DOM dialog (useless in a
headset) along the table's front lip. Now there are two touch panels either side of the DJ controller, tilted 30° and
turned toward the operator. Each is ONE plane with a 1536x720 canvas texture plus one merged housing, so the desk is
three meshes. Panels are redrawn only when what they show changes (a signature checked every 0.2 s), and a press is
mapped from the pick point into the panel's own plane to a button rect, like the VR seek bar. A mouse click and a
controller ray therefore use the same path (`pressVJDesk` / `dragVJDesk` / `releaseVJDesk`, from
`setupVJControlInteraction`).
- **SHOW** (left): the header always says who has the lights (AUTOMATIC SHOW with the NOCTURNE movement, YOU ARE THE
  VJ, or THE HOST HAS THE LIGHTS in someone else's room). Buttons: AUTO SHOW, RESIDENT DJ (`togglePeopleVisible('dj')`,
  personal so never host-gated), MUSIC (play/pause, or the selected user-saved set), DROP (the show's countdown
  while it drives, else the director's peak look), BLACKOUT, NEXT SECTION (automatic show only, and says so),
  TAP TEMPO, BEAMS TO FLOOR, RESET LIGHTS, plus BRIGHTNESS (the director's master) and MOVEMENT SPEED faders.
- **LIGHTS** (right): every fixture on/off, plus steppers for spot colour (with a swatch), movement mode, spot aim
  path, projected gobo image, wall picture (n of 20) and mirror colour. Every button's second line is its live value; unavailable ones are grey and say
  why (HOST ONLY, SAFE MODE, AUTO SHOW ONLY).
- **Who has the lights.** Touching any light or fader calls `takeLightControl()`. While the player stands in the booth
  (`VJ_DESK.booth`), `updateVJDesk()` keeps `lastVJInteraction` fresh, so the lights stay theirs. Once they walk away,
  the usual `VJ_TIMEOUT` (60 s, counted down in the header) hands them back; AUTO SHOW does it at once.
- Tests: the layout (inside the panel, no overlaps, every control known), the hand-over and hand-back, the booth hold,
  host and Safe Mode gating (`test/unit.test.mjs`, `test/multiplayer.test.mjs`); in the real club a ray at the middle
  of every button lands on that button from the booth viewpoint, and presses redraw the panels
  (`test/e2e/vj-desk.spec.mjs`, which also saves a screenshot of each panel).

`data-control` toggles are dispatched through the `TOGGLE_CONTROLS` allow-list, never by
writing `instance[attributeValue]` directly.

Panel layout (`css/styles.css`): the panels (`.panel`, z-index 102) sit above the corner toggle buttons (101) and the
credits link (100), because on a phone a full-width panel otherwise sat under the Multiplayer toggle, which covered its
close button; every panel has its own close. Each panel has a definite `width` (VJ 480, Audio 340, Multiplayer 380 px,
`auto` under 720 px wide), so a long line wraps instead of widening the panel (a room-guest note once stretched the
Multiplayer panel across the screen). Multi-line explanations use `.network-help` (and `.vj-help` under a VJ section
title); `.audio-file-name` is single-line with an ellipsis and is only for short status lines.
The Quest Music panel is height-bounded at every viewport width, with a fixed header and a scrollable
`.audio-content`; focusing the URL must never move the close/Enter VR path offscreen.

**Plain-language UI rule.** Every control must say what it does without a tooltip (touch screens and the headset never
show one): the corner buttons carry a word under the icon (Lights, Music, People, Go to), every VJ section has a
one-sentence `.vj-help`, and the Multiplayer panel is a form read top to bottom. Before joining it shows only *Join a
room* (labelled name and room fields, a primary **Join room**, *Start a private room*, and the relay URL tucked in an
*Advanced* disclosure); in a room it shows *Talk*, *React*, *People*, and *Host tools* only to the host. A control that
cannot do anything is **hidden** when it belongs to a state the user is not in (in-room sections before joining, host
tools for a guest) and **disabled** when it is visible but unavailable (`initRoomGuestLock` really sets `disabled` on a
guest's host-owned buttons and inputs, remembering any that were already disabled for their own reason).

**The social bar** (`#socialBar`, `initSocialBar` in `js/ui-init.js`): Mic / React / Chat at the bottom of the screen,
only while in a room and never in VR. React opens the emoji and gestures; Chat opens the log and a message field; a
message that arrives while it is closed peeks above the bar for 6 s and counts on the button. The live mic is red.
Keyboard: **M** toggles the mic and **T** opens the chat, in a room; they work while a button has focus (only Space and
Enter belong to a focused button) and never while typing in a field.

Global keyboard shortcuts ignore text fields and `defaultPrevented` events, and leave Space and Enter to a focused
button, so Space still activates a focused button instead of being stolen for audio play/pause.

Photosensitive Safe Mode is offered on the splash **before** the scene renders, next to the
photosensitivity warning, and is **off by default** (a product decision: it is never switched on
automatically, not even for `prefers-reduced-motion`). Splash and constructor both call
`VRClubCore.resolvePhotosensitiveSafeMode()`: only a stored `'1'` turns it on. It must never be
reachable only after the strobes have already fired.

**The splash is deliberately sparse.** It carries the NOCTURNE wordmark, the subtitle, the photosensitivity
warning, two press-to-enable toggles (Safe Mode and VR Comfort — never checkboxes, and neither carries an
explanatory paragraph **or a `title` tooltip**: a headset and a touch screen never show one, so a tooltip is
the same extra text hidden from exactly the guests who need it — the button's own label must say what it
does), ENTER, the controls line and the `.splash-credits` line — nothing else. **No emoji and no decorative
symbols**: not on the toggles, not on ENTER, not in the controls line, not even the warning triangle or the
subtitle's diamonds. They render differently on every platform, they are the first thing a headset guest reads
at low angular resolution, and each one sat beside a label that already said the same thing; a unit test fails
on any pictograph, dingbat, arrow or geometric shape between `#splashScreen` and `<main>` (including one
written back at runtime, such as the RETRY label). There is no
music picker: ENTER resumes only a user-saved set. It must not name a podcast, a
stream, a server or the relay host. User links live in Music and the
streaming privacy note lives in `#modelCredits`. Unit
tests fail if a show name, a server host, a picker or any `<input type="checkbox">` reappears between
`#splashScreen` and `<main>`, and if the credits lose the no-music and IP disclosures.

**The wordmark is path geometry, not a typeface.** `js/nocturneLogo.js` (`window.NocturneLogo`) is the ONE
definition of the NOCTURNE logo: tube centrelines on a 100-unit cap height, traced from the club's artwork.
The letterforms are not a font's — the O is a ring cut at nine and three o'clock, the R has no left stem (top
bar into a right-side bowl, back along an inset middle bar, then a diagonal leg), the E is three detached bars
and each N is one mitred run that points at the top left and bottom right. No installed font draws those, and
a headset has no web fonts to fall back on, which is why it is geometry.

Two surfaces consume it: `_drawNocturneNeon()` in `js/club/04-environment.js` strokes
`new Path2D(NocturneLogo.path())` into the signage atlas (halo, tube, core; `lineWidth` follows the canvas
transform, `shadowBlur` does not) for the neon over the dance floor AND the sign over the street entrance, and
the splash inlines the same `d` in a static `<svg class="splash-wordmark">` so the logo is in the very first
paint. A unit test fails if the two drift apart, if the O/R/E/N lose their letterforms, if the canvas falls
back to a font, or if the splash's `stroke-width` stops matching `NocturneLogo.STROKE`. Change the geometry in
`js/nocturneLogo.js` and paste the new `path()` into index.html; there is no image file to update.

## Multiplayer

**Room browser.** `worker/src/roomDirectory.js` exposes opt-in `GET /rooms` (50 public rooms
per page) and `POST /rooms/status` (up to twelve explicitly supplied names), using D1
migration `0006_room_directory.sql`. Every case-insensitive `private-` prefix is unlisted:
private codes and participant identities never enter the public presence table.
`ClubRoom` publishes ordered join/leave/lock updates and refreshes every thirty seconds
through its existing sweeper; rows expire after ninety seconds. Its `/directory-status`
endpoint is internal: the public relay rejects it even with a WebSocket upgrade.
`ClubMultiplayer.refreshRooms`, `directoryRooms`, `joinListedRoom`, `savePrivateRoom` and
`forgetPrivateRoom` own the shared state for the DOM People panel and VR ONLINE → BROWSE
ROOMS. Only saved/previously joined private rooms are queried; no startup room request.
The VR browser uses five rooms per page to keep navigation within its twelve meshes.
Counts are advisory, and existing capacity, lock, kick and ban enforcement remains authoritative.
The final public departure deletes its directory entry; private bookmarks survive locally
until forgotten, but empty rooms of either kind reset live lock/bans/music/show state.
`host-transfer` is a rate-limited, host-only request targeting another connected,
mutually visible guest. It changes only `hostId` and broadcasts the existing `host` frame;
neither socket leaves and cached room state remains. `welcome.hostTransfer` advertises
support so old relays cannot silently ignore the new control. Both DOM Make host and
VR MAKE HOST delegate to `ClubMultiplayer.transferHost` and require a second press within
four seconds. Role/voice/music handling uses the existing host-change path; WebRTC local
music cannot migrate a file and requires the new host's selection and renewed listener consent.

The optional payment API (`worker/src/payments.js`) uses `STRIPE_MODE` (`test` or `live`),
dashboard-managed Checkout payment methods and mode-checked claims/webhooks.
`purchases.livemode` separates test grants from real purchases; migration 0004 marks
the historical rollout as test. Invitation subjects and `SESSION_SECRET` do not change
when switching Stripe modes. Live rollout requires a matching live price, API key and
webhook secret; never treat a test Checkout as a real paid entitlement.

Optional and opt-in: nothing connects until a guest clicks **Connect** in the Multiplayer panel or **ONLINE → NETWORK**
in the VR quick menu. The relay stays the same Cloudflare Worker (`vrclub-network.garfieldapp.workers.dev`); the
protocol only grew, so older clients keep working.

- `worker/src/relay.js` (entry `worker/src/index.js` re-exports only `ClubRoom` and the default handler, because the
  runtime rejects any other export) — Cloudflare Worker + `ClubRoom` Durable Object relay, one object per
  room. It holds sessions, the host id, bans, the lock and the shared music state in memory only. The file
  header documents the JSON protocol. The relay treats every client as hostile. It
  allow-lists browser `Origin`s (`ALLOWED_ORIGINS` in `wrangler.toml`; loopback and
  private-LAN origins always pass). It caps rooms at 8 (`MAX_ROOM_SIZE`: voice is a full mesh and `AvatarManager` draws 8 people), drops frames over 16 KB, applies
  per-type token buckets and closes flooders. Close codes: `4003` room full, `4008` flooding, `4010` kicked,
  `4011` banned, `4012` room locked, `4013` no heartbeat (not terminal: the client retries). A client pings every
  10 s (`ClubMultiplayer.PING_MS`, a timer, so it runs in a hidden tab); once a client has pinged, 30 s of silence
  closes it (swept every 10 s), so a host who vanished without closing the socket is replaced in under a minute
  instead of whenever the network gives up. Clients that never ping (older builds) are never swept. Emoji and gestures (`wave`, `nod`, `dance`, `stop`) are allow-listed, typed `chat` is cleaned and capped (see below), and names
  are sanitised. Tests: `test/worker.test.mjs`, `test/multiplayer.test.mjs`.
  `worker/src/podcast.js` is a historical relay utility, unused by Quest. Selected-recipient chat changes the
  room protocol and requires Worker deployment. Worker changes are not live until deployed.
- **Identity and safety.** The browser keeps a secret `uid` (`vrclub.networkUid`), sent as a query parameter; the relay
  shows everyone else only `pid = SHA-256("vrclub-pid-v1:" + uid)` truncated to 16 hex. Blocks and bans are keyed by
  `pid`, so they survive reconnects (session ids change every time) and copying a `pid` cannot get anyone banned.
  A client without a uid is anonymous per connection. **Block** is two-way invisibility: the relay filters state,
  emoji, gesture, music and rtc-signal both ways and sends join/leave when a block changes; the client also ignores
  blocked pids locally, and sends its saved list as `blocklist` after the welcome. The welcome never lists a guest who
  has blocked the newcomer. The host alone can `kick`, `ban` and `lock` (refuses new guests); handover to the next host
  keeps the lock and the bans. **An empty room starts over** (`_onClose`): lock, bans, music and show are cleared when the
  last guest leaves, because with nobody left to unlock it a locked room refused everyone (its own host included,
  reconnecting after a drop) until the Durable Object happened to be evicted.
- **Avatars.** The relay assigns each guest a random, room-unique character from `AVATARS` (the 17 Quaternius Modular
  people `f1`–`f8`, `m1`–`m9`; a test ties the list to `AVATAR_SOURCES`) and a guest may reroll. A guest can restrict the draw to women (`f*`) or men (`m*`) (`vrclub.avatarPool`: `any`/`women`/`men`; `?avatars=` on connect, `pool` on a reroll; `AVATAR_POOLS` in the relay). If a pool is exhausted the relay gives any free person, never a double; choosing a pool in a room rerolls only a look outside it. Others see you as that
  character. Your own first-person body is still the UE-mannequin `AvatarRig`, which only drives that skeleton, so you
  do not see yourself as your assigned avatar.
- `js/networkClient.js` — WebSocket presence plus a WebRTC voice mesh using **perfect
  negotiation** (`negotiationneeded`; the higher id is polite). Either guest may enable the
  mic first. Muting removes tracks but keeps connections, so the guest still hears others.
  A dropped socket reports every peer through `onPeerLeave`, because the relay issues new
  ids per connection. `sendMusic()` refuses non-http(s) URLs, since a host's `blob:` is
  meaningless to guests. Kick, ban and lock close codes are terminal (no reconnect), carry `error.code`
  and release the mic.
  Local files instead use a separate `musicPc` per consenting listener, signaled through the existing
  block-aware `rtc-signal` relay with `channel: 'music'` (`state`, `listen`, SDP and ICE).
  Only the current visible host may send music; no music connection or tracks are accepted before
  Listen along. Voice muting never touches these connections. `ClubMultiplayer.shareLocalMusic()`
  captures the local MediaElementSource into a MediaStreamDestination before PA acoustics/ducking;
  host element volume still affects the broadcast. `startNetworkMusic()` routes a received stream
  through the existing PA, analyser and kick/rhythm taps, with a separate guest volume gain and
  muted audio element to keep Chromium delivering WebRTC samples. No file upload or Worker
  redeployment is needed. Disconnect, blocks, host changes and URL-track switches release the
  connections and audio nodes. STUN-only connectivity, latency and Quest costs remain unmeasured.
- `js/avatarManager.js` — remote guests as people built from `club._loadCrowdSource(index)` (the same containers the
  crowd uses; one draw each). A clip state machine plays Idle/Walk/Run from the interpolated speed, plus Wave, Yes
  (nod) and a Dance_Loop toggle. `MAX_PEOPLE` (8) are people; the rest, and any guest still loading, are a capsule +
  head (the capsule always remains as the invisible collision body). `state.y` on the wire is the sender's **eye**
  height; the avatar root is placed `EYE_HEIGHT` below it. Name tag (a 0.6 x 0.15 m pill sized to the name, mipmapped,
  with a host crown and mute marker; `setNameTags()` hides them, emoji stay), an
  analyser-driven speaking frame, per-guest mute and mute-all through the gain node, and a **personal-space bubble**
  (a guest hides within 0.7 m and returns beyond 0.95 m). Each remote voice is also attached to
  a muted `<audio>` element, because Chromium delivers no samples from a remote WebRTC
  stream into Web Audio otherwise. The full `AvatarRig` remains the local player's body.
  **Live VR arms.** `updateNetworkPresence()` sends optional `state.hands.left/right` at up to
  20 Hz in VR (desktop stays 10 Hz): each has position relative to the eye, plus world forward/up
  vectors from the same `_handPose()` used by the local body. Missing tracking is null.
  `sanitizeState()` validates finite numbers, a 1.5 m reach envelope, unit-ish orthogonal orientation,
  strips extra fields and normalises directions; position-only older clients still work.
  `AvatarManager` interpolates hand targets, times out stale samples after 0.5 s of update time,
  and runs the arm-only helper in one `onAfterAnimationsObservable` observer, removed in `dispose()`.
  Never put the arm override before animation evaluation: clips would erase it in `scene.render()`.
  The helper reads the animated torso, overrides only the tracked upper/lower arm and wrist,
  and preserves rigid limb lengths; reachable hands follow the controllers, unreachable ones clamp.
  It measures physical arm sides from shoulder positions in the guest's facing frame at construction.
  Never map `hands.left` straight to `.L`: removing the glTF root conversion mirrors these bone names.
  Rig and browser tests identify physical sides independently, not from the helper's mapping.
  Live hands take priority over canned Wave/Yes/Dance clips; the usual Idle/Walk/Run lower-body
  animation continues. An absent hand retains clip animation. No per-frame vector/matrix allocation,
  no added mesh/light/material. Tests cover protocol/blocks/late join (worker), interpolation/fallback
  (unit), all 17 real GLBs' wrist positions and orientation after render (rig, 2 ms mean IK ceiling)
  and real IWER controller movement through the club's network-state/render path
  (`test/e2e/network-arms.spec.mjs`). Physical-controller roll and Quest 3S frame time are unmeasured.
  Both the relay and frontend must be deployed; an older relay strips the optional hand poses.
  **Labels must not write depth** (`_labelMaterial()`: `disableDepthWrite = true`). A `StandardMaterial` is pre-pass
  capable exactly while it writes depth, and on the desktop tiers with SSR the SSR composition drew pre-pass
  alpha-blended labels as black shapes (mobile and Quest have no SSR, so it only showed on desktop). Any new
  alpha-blended, canvas-textured billboard in the scene needs the same.
- `js/multiplayer.js` (`ClubMultiplayer`, `club.multiplayer`) owns the session: preferences (`vrclub.networkUid`,
  `blockedPeers`, `personalSpace`, `nameTags`, `autoNod` and the existing server/room/name keys), connect/disconnect, mic, emoji,
  gestures (dance ends when the guest walks 0.6 m; a head nod in VR, detected from camera pitch, sends `nod` unless
  turned off), reroll, mute, block list, host-only kick/ban/lock, and shared music. Both the DOM panel (`initNetworkMenu`
  in `js/ui-init.js`) and the VR menu call it and redraw from `onChange`; neither reimplements an action, and
  `test/multiplayer.test.mjs` checks the delegation.
- VR menu (`js/club/10-ui.js`): **in a room, HOME starts with TALK (mic), REACT (the gestures page) and CHAT** (quick
  phrases: one tap sends a ready-made message; there is no keyboard in a headset), so the things people do most are
  one press away; out of a room that row is absent. HOME → **ONLINE** → NETWORK / MIC / **LOOK** (women / men / anyone,
  new look) / **GESTURES** (wave, nod, dance, 7 emoji) /
  **PEOPLE** (9 per page, then a person page: MUTE, BLOCK, KICK, BAN; kick and ban need a second tap within 4 s) /
  **SAFETY** (personal space, lower music, name tags, mute all, lock room, nod to nod, unblock all, leave room) / NEW
  PRIVATE ROOM / JOIN ROOM / PUBLIC LOBBY / LISTEN ALONG. A page's BACK returns to where it was opened from
  (`_vrPageParent`: REACT is reached from HOME and from ONLINE). The menu redraws on a session change while HOME or a
  net page is open. **Unavailable buttons are drawn disabled** (`_isVRButtonDisabled`: flat grey face, grey text, a
  second line saying why: HOST ONLY, JOIN A ROOM FIRST); a press still answers with a message. Every page header has a
  plain one-line description (`about` in `_showVRQuickMenuPage`).
- **Typed chat** (`chat` in the relay, `sanitizeChat`: control/format/separator characters removed, whitespace
  collapsed, at most 200 code points, 0.5/s with a burst of 4, block-aware, sender named by the relay, never stored).
  `ClubMultiplayer.sendChat()` / `chat` (the session's log, last 50, cleared per room) / `chatUnread` /
  `markChatRead()`. A received message shows in a speech bubble over the sender (`AvatarManager.showChat`, one plane per
  guest, `wrapText` to three lines, 5-12 s), which is how a headset user reads it.
- **Outgoing audiences are independent.** `ClubMultiplayer.chatAudience` / `voiceAudience` are null (Everyone)
  or explicit session-ID arrays. `setAudience()` / `toggleAudiencePeer()` own both DOM and VR selectors.
  Restricted selections stay restricted when emptied, on departure, reconnect and new rooms; they are never persisted.
  The chat box and People/Talk contain the desktop selectors; VR CHAT/CHAT RECIPIENTS and ONLINE/MIC / WHO HEARS ME
  use the same setters. Quick phrases respect the chat audience. Relay `chat.targets` is validated and routed only
  to the selected visible peers (empty/malformed lists fail closed); `restricted` marks the log and bubble.
  Welcome `targetedChat: true` advertises support; clients refuse restricted chat on old relays so an ignored
  targets field cannot leak a message. `NetworkClient.setVoiceAudience()` stops excluded microphone senders
  with `replaceTrack(null)` and reuses the same senders when re-selected, avoiding renegotiation races. Every
  track-attachment path is gated, including late joins; muting stops capture and also clears sender tracks.
  Incoming voice and `musicPc` are untouched. These are outgoing recipients, not private group membership, and
  recipients can still record or forward what they receive. Deploy the changed relay before using targeted chat.
- **Lowering the music for voice** (`vrclub.duckForVoice`, on by default): while my mic is on or anyone is audibly
  speaking (`AvatarManager.anyoneSpeaking()`), `VRClub.setVoiceDuck(true)` fades a dedicated `voiceDuckGain` (after the
  compressor, before the master gain) to 0.25 in 80 ms, and it comes back over 0.5 s, 1.5 s after the last word
  (`DUCK_HOLD_MS`). It never touches the user's music volume, the master gain (rewritten every frame by the room
  acoustics) or the analyser (upstream, so the light show still hears the whole track). Leaving the room or switching
  it off restores the music at once.
- **The host owns the music and the lights; everyone else follows.** The host is the first socket in the room and
  passes to the next guest when they leave (the relay keeps the lock, bans, music and show across the handover).
  - *Music.* The host's `music` frame carries `url`, `playing`, `position`, `title` and legacy `podcast: null`.
    The relay stamps `updatedAt` with its own clock and the guest reads it through
    `NetworkClient.serverOffset` (measured from the welcome's `serverTime`), never `Date.now()` directly. The host
    re-announces every 3 s and on play, pause and seek (`ClubMultiplayer._watchAudio`, so every control is covered);
    a guest seeks only when it drifts more than 0.75 s and never on a live stream.
    Every source waits for **Listen along**, because it discloses the guest's IP.
    The host's title is followed but never its historical artist/DJ metadata.
  - *Lights.* The host sends a `show` frame at most every 250 ms, on each bar line, on any change and every 2 s
    (a lone host sends nothing; a newcomer triggers one at once; the relay keeps the latest for late joiners). Building a
    frame allocates, so the host looks for a change at most every `SHOW_CHECK_MS` (100 ms), never every render frame.
    A guest *follows* only while the host is visible to them (`ClubMultiplayer.following`: connected, not host, and the
    host is in `client.peers`). Blocking is two-way, so a guest who blocks the host (or whose blocked guest becomes host)
    gets no frames, and is handed back their own music and lights instead of being locked out; `_syncRole()` runs on
    every join, leave and host change.
    While the Show Director drives (`m: 'show'`) it carries `ShowDirector.snapshot()` (movement, cue, bars into the
    cue, set-piece, beat in the bar) plus `VJDirector.colourSnapshot()` (master hue, whether a look pins it, palette,
    LED harmony, mirror-ball colour). Under manual control (`m: 'manual'`, or the legacy cycler `'off'`) it carries
    `fx`, the console's settings. A guest runs `ShowDirector.setFollower(true)` and `VJDirector.remoteDriven`: its grid,
    ramps and kick punch still run on its own audio, but it never picks a movement, advances a cue, starts a
    breakdown, ends a set-piece, rotates the hue, rotates the mirror ball or picks an auto-scene; `applyRemote()` puts
    it on the host's cue (names it does not know are ignored; `_alignBeat()` adopts the host's beat in the bar only
    when two frames in a row disagree, because one beat is network delay). The first frame after joining (or after a
    gap) is applied with `force`, so the look is written even if the cue matches.
  - *What a frame may do.* The relay checks only shape (`sanitizeShow`: known fields, clamped numbers, a flat `fx`
    of at most 96 booleans/numbers/short words); the client's `MANUAL_FIXTURES` allow-list (name, type, range) is
    the authority, so a frame can never write another property. A guest's **Photosensitive Safe Mode wins**: the
    host's strobes are never applied under it. Every frame the guest re-asserts the host's mode, so a stray local
    change cannot pull it off; with no frame for 12 s (`SHOW_STALE_MS`: an old-client or backgrounded host) the guest's
    own show runs until the host speaks again.
  - *Guests cannot change either.* `VRClub.isFollowingHost()` / `guardHostControl('music'|'lights')` gate the VR
    quick menu (buttons read HOST ONLY), the VJ desk at the DJ table (its buttons say HOST ONLY too; RESIDENT DJ stays
    yours), `toggleLightControl`, `seekAudioTo`, `toggleAudioPlayback`, the keyboard
    shortcuts (Space, B, F) and the director's own macros; `initRoomGuestLock()` in `js/ui-init.js` dims and swallows
    every control of the lighting and audio panels with one capture-phase listener per panel (new controls are covered
    automatically) and disables their inputs. The comfort settings stay live. A new control that changes the music
    or the lights must call `guardHostControl`; `test/multiplayer.test.mjs` fails if a listed one stops doing so.
  - *Rooms.* A private room's code is six digits (`private-482913`, typed on the VR keypad; unlisted, not secret:
    the host can lock it and kick or ban). `ClubMultiplayer.roomFromCode()` maps six digits to that name and passes
    any other text through; `?room=` in the URL (`inviteUrl()`) joins a room directly.
- Unmeasured: eight skinned people plus voice analysers on a Quest 3S. Verified with two desktop browsers against a
  local `wrangler dev` relay (walk/wave/nod/dance clips, voice, mute, reroll, block across a reconnect, kick, ban).

## Debugging

1. Reproduce on desktop first — iteration is far faster than deploying to the headset.
2. Inspect the Quest browser via `chrome://inspect` from a PC.
3. Look for `🥽 VR mode activated` / `🖥️ Desktop mode restored`.
4. `Too many lights` or `GL_INVALID_OPERATION` means a material exceeded `maxLights`.
5. `DEBUG_MODE` / `*_DEBUG` constants must be left `false` on commit — `npm test` enforces it.
6. The diagnostics overlay is `Ctrl+Shift+D`; `getDiagnostics()` returns the circular buffer.

## Licensing

Source code is MIT (`LICENSE`). Bundled 3D models, textures and animations are third-party
works under their own terms — every one is recorded in `ASSETS.md`, and CC BY attribution
(title, creator, source link, licence link, change notice) must remain in `#modelCredits`, a
collapsed `<details>` disclosure in the club's bottom-left corner, and every CC BY creator must
stay named in the splash's `.splash-credits` line.

## Known technical debt

See `BACKLOG.md` for the review history and resolved acceptance criteria. The repository
now has focused VRClub source layers, a production bundle, contract tests, and runtime
tests; new debt should be recorded there with measurable acceptance criteria.
