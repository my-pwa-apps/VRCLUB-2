# Maintaining the portable venue and reliability features

This is contributor documentation, not a rollout status report. These features
are shared by Quest and SideQuest; their deployment targets, canonical metadata,
paid VR gates, packaging and asset ceilings remain distribution-owned.
The shared QuestDev integration also includes live events, local performers,
uploaded avatars, the split UI/audio layers, Aesthetic smoke and visibility
regressions. Development free-VR access, development relay selection and seeded
music are excluded from these distributions. ADE artwork remains opt-in.
Production uses normal spot beams and the optional multi-beam filter only;
their methods now live in the eager UI controls layer, with shared fixture and
preset state preserved. The VR controls are on the smoke settings page to keep
the Effects page within twelve slots.

## Saved music and container caching

Treat `MusicLibrary.readError` as different from an empty library. Preserve
unreadable storage and suppress writes/default playback until retry succeeds or
the guest confirms a reset. Retry cancels a pending confirmation. Reset checks
the exact unreadable raw value again, so another tab's repaired library cannot
be erased; its playback-generation token invalidates old checkpoints.
Corrupt playback storage must never discard usable saved links.

DOM Music and VR SOURCES / MUSIC FROM YOUR PHONE expose the same personal retry
and reset operations, including while following a host. VR reset needs a second
matching press within four seconds. Recovery buttons are conditional; every
page must still fit twelve slots. The immersive phone path must not exit XR for
storage recovery or require a keyboard.

Normal NPC, local/mirror/remote character and wardrobe sources flow through
`_loadAvatarSource` / `_loadPlayerSource` into `ModelLoader.loadAssetContainer`.
Editor previews use that same parser with the club loader or a disposed temporary
loader. Fingerprint-validated cached bytes and body deadlines belong to
`loadOrDownloadModel`; stop source clips, reject retired loads and always revoke
parse blob URLs. Do not introduce a second unvalidated GLB cache.

## Fixture and preset contracts

DOM, VR and the existing desk delegate independent fixture controls to VRClub.
Spots, lasers and wall allow 200%; sheets allow 300%. Safe Mode caps boosts at
neutral and governs flashes; master zero immediately blacks show-owned output.
Keep sheet speed/opacity bounded, maximum smoke output tier-aware, both automatic
bursts on one musical clock, manual bursts expiring, and sequences advancing
through missed detector beats without exceeding the cadence governor.
Independent movable/pickable heads and their ordinary soft pools remain intact.
Projected gobo filters are removed from controls, rendering and shared state.
Imports of complete older presets discard their retired gobo fields.

`LightingPresets` owns twelve local slots and validates complete schemas before
writing. Selection/save/delete are personal; recall is host-owned. Matching
overwrite/delete confirmation lasts four seconds. Capture/application reuse
the multiplayer fixture schema and exclude music, people, safety, credentials
and musical phase.

The previous complete brightness schema lacks only `spotBrightness`,
`laserBrightness` and `ledWallBrightness`: migrate exactly those fields to 1,
retaining sheet brightness and every other setting. Incomplete or hostile
schemas still fail; reading/migration alone never rewrites storage.

## Static geometry, licensing and shared restroom mechanics

Merge only static compatible geometry such as ceiling service pipes. Preserve
pickable and independently moving fixtures. New licensed surface folders avoid
stale texture-cache keys. Recipes and exact revision/source/output hashes live
in `scripts/build-venue-textures.mjs` and each surface's `provenance.json`.
Door Handle 3 is plaggy's Sketchfab CC0 asset; its recipe and adjacent provenance
pin the compact textureless derivative. ASSETS.md is the attribution authority.
Toilet body/seat/lid remain separate hinged parts using the offline mechanics
helper. Do not add unrelated source GLBs or increase asset budgets.

`RestroomInteractions` consumes acknowledged retained state, never optimistic
online updates. The real relay validates occupancy, seat/lid coupling, tap
expiry and flush cooldown, acknowledges the sender even when blocked, filters
both block directions, retains state through handover/late join, and resets when
the last member leaves. A blocked occupant still prevents physical overlap.
Older relays explicitly reject unsupported actions. The production Worker must
be deployed separately only when authorized.

Rinse derives from tracked hand positions under the outlet. Original spatial
water audio uses Ambience, not Music/analyser; scheduled expiry and disposal must
disconnect nodes even without another rendered frame.
LED-wall containment must correct both tracked and queued/deferred XR positions.

The static server denies private/source-only paths and rechecks resolved symlink
destinations, without denying public `.well-known` or environment-map assets.
HTTP tests create fixtures inside the worktree, use dynamic ports and stop their
owned child servers. Windows junctions exercise realpath guards without file
symlink privileges.

## Focused validation

Run from the distribution being changed:

```powershell
npm run check
npm run lint -- --quiet
node --test test\portable-fixtures.test.mjs test\portable-reliability.test.mjs test\restroom-interactions.test.mjs test\server.test.mjs
npm test
npm run build
npm run audit:assets
npm run optimize:models -- --check
```

The focused tests execute corruption/retry/confirmation/stale-tab behavior on
normal and immersive VR pages, neutral preset migration, real HTTP private/
symlink guards, actual relay acknowledgment/late join/handover/two-way block/
occupancy, real handle/toilet geometry, water expiry and fixture governors.
Run full real-rig suites sequentially across worktrees to avoid competing CPU
load invalidating timing ceilings; never weaken thresholds to hide contention.

Browser regressions:

- `test\e2e\portable-port.spec.mjs`: preset save/recall, venue fixtures,
  tracked/deferred XR containment and hand-derived rinse.
- `test\e2e\music-recovery-port.spec.mjs`: DOM retry/first-press reset and rendered
  normal/immersive VR recovery page parity with no unconfirmed writes.

Use an isolated Playwright config with a unique local port and
`reuseExistingServer: false`; select the test by its basename regex. Keep the
recovery test at 800x600, video off, SwiftShader, hidden NPCs and dismissed
first-run hint. It uses the existing Quest harness; no live relay connection
is needed for storage recovery. Stop/remove owned helpers and scratch output.
The emulator and CPU tests do not certify controller fit, stereo comfort or
physical Quest frame time.
