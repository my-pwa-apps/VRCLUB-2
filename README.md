# VR Club

Hyperrealistic WebXR nightclub built with Babylon.js for compatible VR headsets and desktop browsers, with Meta Quest used as the primary tested headset. The experience includes a PBR club environment, DJ booth, LED wall, lasers, spotlights, mirror ball effects, audio-reactive lighting, local audio files, and stream URL playback.

## Quick Start

### Quest branch

This branch is a **Quest distribution candidate**, not an uploaded or signed store release.
Run `npm run build:quest` for the web payload. See [docs/QUEST.md](docs/QUEST.md) for
signing, Meta Bubblewrap packaging, Digital Asset Links, release checks and remaining blockers.

No music is included. Open **Music**, choose a local file, paste a direct HTTPS audio link,
or paste a SoundCloud track/set page in the same **Choose a file or paste a URL** section,
optionally name it, and press **Save & play**. Up to eight sets are saved on this device.
Choose them from the VR Music menu; **ADD MUSIC** returns to the setup panel for the Quest
keyboard/file picker, then **Enter VR** returns to the club. SoundCloud uses its official
visible player: its seek/volume controls work, but VR Club cannot analyse, spatialize or
share that audio. YouTube/Spotify page URLs are not playable. Direct audio hosts must allow
CORS; no proxy is provided.
SoundCloud's official Widget API is loaded only when a set is chosen. Confirmed playback
gives the crowd varied dance moves and the DJ an active performance on a shared 120 BPM
animation clock, not detected beats. Pause, finish, errors and source changes restore calm
movement; choosing a set or blocked autoplay alone never starts the dance fallback.
Only explicitly saved music resumes on entry; historical podcast/stream preferences are ignored.
Generic **Male DJ / Female DJ** choices are in the Music panel and VR CROWD → CHOOSE DJ.
The Quest payload uses CC0 dancers only; historical Mixamo files do not ship.

```powershell
npm install
npm start
```

Open `http://localhost:8000`, click **ENTER CLUB**, then use the on-screen controls or camera presets to inspect the scene. For Quest testing, open the same server from the headset browser using your PC IP address, for example `http://192.168.1.100:8000`.

Build and serve the production bundle with content-hashed assets:

```powershell
npm run start:prod
```

## Project Layout

Development sources remain plain `<script>` files that publish classes onto `window`, so
their order in `index.html` is a tested contract. `npm run build` feeds those sources to
esbuild in that same order and emits one minified, content-hashed application bundle plus
a content-hashed stylesheet under `dist/`.

```text
index.html                 Main page and script loader (owns the load order)
css/styles.css             Splash screen and desktop control styling
js/vendor/                 Pinned Babylon.js runtime and loader libraries
js/assetCache.js           IndexedDB cache, in-flight dedup, fetch timeouts (loaders depend on it)
js/audioUtils.js           Pure, tested audio URL security policy
js/podcasts.js             Historical podcast utility, not loaded or bundled in Quest
js/musicLibrary.js         Quest user-provided saved sets, shared by the Music panel, VR menu and VJ desk
js/textureLoader.js        Texture caching and pooling
js/modelLoader.js          GLB model loading, caching, placement and procedural fallbacks
js/materialFactory.js      Shared Babylon material presets
js/lightFactory.js         Shared Babylon light creation helpers
js/vjDirector.js           Beat/BPM detection, colour palette and VJ macros
js/showDirector.js         "NOCTURNE" — the composed, beat-locked cue engine
js/ledPatterns.js          LED wall pattern methods mixed into VRClub.prototype
js/barProps.js             Bar bottles: lathe shapes, shelf stocking and the label atlas (pure data)
js/nocturneLogo.js         The NOCTURNE wordmark as path geometry — the one source for the splash SVG and both neon signs
js/venueDressing.js        Entrance stair hall (down from the street door) and bar (counter, back bar, stools, lights) mixed into VRClub.prototype
js/mezzanine.js            Steel balcony and stair along the left wall, plus the walking-surface follow, mixed into VRClub.prototype
js/cityDistrict.js         The street outside (baked GLB), its sky and skyline, fence, street door and "outdoors" amount, mixed into VRClub.prototype
js/vjDesk.js               The VJ desk at the DJ table: two touch panels (who has the lights, the DJ, music, macros, faders; every light), mixed into VRClub.prototype
js/avatarRig.js            Procedural player body on the dancer skeleton: planted gait, turning, head, IK arms and legs
js/djPerformer.js          The DJ's live set as a pose for AvatarRig: mixing, cueing, knobs, crowd, hands up on a drop, waves at visitors, on the beat
js/crowdDance.js           The crowd's choreographer: who dances which move, on the beat; claps in a build, hands up on a drop, sway or stand when the kick goes
js/minglerClock.js         Shared room-time mingler round: deterministic positions, activities and clip phase, independent of host, startup and graphics tier
js/networkClient.js        Multiplayer WebSocket/WebRTC client (presence, voice, emoji, shared music)
js/avatarManager.js        Remote guests as clip-driven Quaternius people: idle/walk/run, wave, nod, dance; name tags, spatial voice, mute and the personal-space bubble
js/multiplayer.js          One multiplayer session for the whole club (DOM panel and VR menu): connect, mic, gestures, block, mute, kick/ban/lock, shared music
js/club/01-core.js         VRClub constructor, shared state, and device settings
js/club/02-lifecycle.js    Scene initialization and disposal
js/club/03-rendering.js    Pipelines, materials, shadows, floor, and walls
js/club/04-environment.js  Entrance, room, bar, and truss construction
js/club/05-fixtures.js     DJ booth, speakers, LED wall, smoke, strobes, and lasers
js/club/06-effects.js      Fixture lights, laser sheet, and mirror ball
js/club/07-animation-core.js Frame context, fog, mirror ball, and VJ updates
js/club/08-animation-fixtures.js LED, laser, and spotlight animation
js/club/09-animation-finish.js Strobe, speaker, and LED wall animation
js/club/10-ui.js           In-scene controls, audio UI, camera, and gobos
js/club/11-audio-crowd.js  Audio analysis, accessibility, avatars, and diagnostics
js/club_hyperrealistic.js  Public VRClub class assembled from the focused layers
js/ui-init.js              Splash, desktop VJ menu, and audio menu wiring; constructs VRClub
scripts/serve.mjs          Dependency-free static server honouring $PORT (used by Procfile)
scripts/build.mjs          Production bundler and static-asset copier
scripts/build-city-assets.mjs Bakes the street from the Quaternius Downtown City MegaKit into js/models/city/downtown.glb
scripts/build-crowd-glbs.mjs Builds the 17-person crowd (`club-crowd-*.glb`) from the Quaternius Modular Women/Men packs: retargets the club's clips, recolours, bakes vertex colours
scripts/build-dj-glbs.mjs  Derives the two DJs from the guest files
test/contract.test.mjs     Contract tests — load order, wiring, assets, hygiene
test/unit.test.mjs         Runtime unit tests for security, caching, materials, and show logic
textures/                  Local PBR environment textures
js/models/                 Local GLB models and model textures
```

## Controls

**Access** restores paid or invited VR access after cookies are cleared or
on a new device. Verify the receipt/linked email, register up to two named devices
(replace an old one when full), then **Prepare VR** and press **Enter VR**. Only one
device/tab may hold the active VR lease. Old anonymous invitations can be linked
while their cookie is present; otherwise contact the issuer. See
[recovery and support](docs/QUEST.md#restore-access-and-registered-devices).

- **Move**: `W` `A` `S` `D` or the arrow keys; drag with the mouse to look. Movement stays
  on the floor even when looking up/down. Press `E` for a short jump; holding it does
  not repeat the jump. `Q` no longer flies downward. Stairs, the balcony and DJ riser
  carry the player's feet.
- **VR**: the 🥽 **Enter VR** button sits top-right and is hidden on incompatible devices. On compatible devices it reads **Preparing VR…** while the background models finish loading. By default, the **left stick walks in the direction you look** (without flying when you look up/down), and the **right stick turns smoothly**. Walk up/down the left-hand stairs to reach or leave the balcony. Click the left thumbstick or squeeze a grip to sprint; `A`/`X` to jump. **VR Comfort** switches to teleport and snap turn, disabling sprint/jump. Press `Y`/`B` (or the controller menu button when exposed) for the world-locked, paged quick menu. It provides headset-friendly pages for lighting, effects, the automatic show, **CROWD** (send the dancers, the other guests or the DJ home), comfort, safety and quality (**Balanced / High / Ultra**), and travel.
- **The crowd**: up to 14 dancers and 8 guests drawn from the CC0 Quaternius Modular Women / Men cast. Quest replaces the three historical Mixamo slots with CC0 people (some appearances repeat at Ultra). Lower quality tiers show fewer people and download fewer characters. They are built by `scripts/build-crowd-glbs.mjs`; see `ASSETS.md`.
- **Laser speed**: rotating ceiling beams now move at one quarter of their previous rate. The VJ laser-speed slider still changes their speed; laser-sheet motion is unchanged.
- **The street**: the club is a basement. From its front doorway a carpeted stair climbs between the ticket desk and the coat check to the street door, which opens onto a night avenue lined with lit buildings (or press `6` / use the Street button / the VR menu's Travel page). A bouncer in a black suit watches the door, and a line of people waits behind a velvet rope to get in (longer on higher graphics tiers). Out there the music is only the low bass coming through the walls, loudest at the door and quieter the further you walk from it (about half as loud 8 m away, much quieter at the end of the block). The street is drawn only while you are near the entrance, and the door stays shut if it cannot load. Its source kit is not in the repo; see ASSETS.md.
- **Mirror ball**: 96 surface spots on Balanced, 180 on High, 280 on Ultra. Outgoing-ray counts and the two-batch rendering layout are unchanged; High and Ultra headset GPU cost is not yet measured.
- **🎛️ Lights** (top-left, the VJ menu): safe mode, fixture toggles, spotlight/gobo settings, graphics quality, the NOCTURNE show, live macros and a reset.
- **Take over from the DJ** (the VJ desk on the DJ table): go to the booth (**Go to → DJ Booth**, or the VR menu's TRAVEL page) and use the two touch panels either side of the DJ controller, with the mouse or a controller ray. The left panel, **SHOW**, says who has the lights right now. It holds **AUTO SHOW** (hand the lights back to the automatic show), **RESIDENT DJ** (send the DJ home and the decks are yours), **MUSIC** (play/pause, or start a set), DROP, BLACKOUT, NEXT SECTION, TAP TEMPO, BEAMS TO FLOOR and RESET LIGHTS, plus BRIGHTNESS and MOVEMENT SPEED faders. The right panel, **LIGHTS**, switches every fixture on or off and steps the spot colour, moves, aim, gobo, wall picture and mirror colour, each showing its current value. Touching any light makes you the VJ; the lights stay yours while you stand at the desk and go back to the automatic show a minute after you walk away, or at once with AUTO SHOW.
- **Music** (bottom-right): save/play your direct HTTPS audio links, choose a saved set or local file, select a generic male/female DJ, seek with the slider or +/-30 seconds, and adjust music/ambience independently. The VR Music page offers saved-set controls and a ray-selectable seek strip; ADD LINKS / FILE returns to the setup panel.
- **Music on entry:** only a set you explicitly saved resumes. Fresh profiles have no music downloads. Sets play once, without an automatic queue. DJs are a separate local choice.
- **A DJ who plays the set:** the DJ mixes on the jog wheels, works the mixer knobs, holds a headphone cup to one ear, looks out over the crowd (with a fist pump when it is loud), throws both hands up when a drop lands, and waves at you when you walk up to the booth. They nod and bounce on the beat, harder when the music is louder. With no music they keep a calm groove of their own.
- **A crowd that dances on the beat:** the people on the floor switch between nine moves (a bounce, side taps, clapping, fist pumps, the twist, hands up, a sway and the original dance), each at the track's tempo and locked to its beat, each dancer with their own favourites, changing on bar lines. More clapping in a build, hands up on the drop; when the kick drops out they sway slowly or just stand until it returns.
- **A show that follows the kick:** the club listens to the kick drum on its own (a 120 Hz band, separate from the bass/mid/treble analyser), so the beat grid locks to real kicks rather than the bassline. The whole rig dips between kicks and hits on them (at most 2.5 hits a second, whatever the tempo), the moving heads dip toward the floor on each kick, and fixture speed and the show's energy follow how loud the low end is now against the last ~20 seconds: a breakdown calms the room, a drop lifts it. Photosensitive Safe Mode keeps the old shallow breathing.
- **Direct audio hosts** must provide CORS for reactive lighting. Music is not extracted from webpage links or proxied through the multiplayer relay.
- **`js/paymentGate.js`** keeps desktop preview free while requiring a server-verified Stripe entitlement before immersive VR entry.
- **📷 Go to** (bottom-centre): jump to a viewpoint (entrance, dance floor, booth, lights, balcony, street).

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause audio |
| `B` | Blackout |
| `F` | Fire the drop |
| `M` | In a room: microphone on / off |
| `T` | In a room: type a message |
| `1`–`6` | Camera presets (arrival / floor / booth / lights / balcony / street) |
| `Esc` | Close the focused panel |
| `Ctrl+Shift+D` | FPS / diagnostics overlay |

All shortcuts are ignored while a text field has focus.

## Multiplayer (optional)

The **👥 People** button (top-right) opens the Multiplayer panel, which lets several guests share one club: each
other as characters, voice, typed chat, emoji and gestures, and one shared "now playing" stream and light show. It is
entirely opt-in: nobody connects until a guest presses **Join room**. In a room, a bar at the bottom of the screen has
**Mic**, **React** and **Chat** (keys **M** and **T**), and the music is lowered while anyone talks (switchable). In VR the quick menu's first row in a room is **TALK**, **REACT** and **CHAT** (one-tap ready-made messages).
For faster access, click the **right thumbstick** while in a room to open the social wheel, tilt toward Chat,
Reactions or Microphone, click to choose, and center the stick before choosing again. Microphone and chat
can target Everyone, nobody, or selected guests. Right-stick turning pauses while the wheel is open; the
left-stick click and grips still sprint, and `Y`/`B` still opens the complete quick menu.
Both local testing and the deployed site default to the hosted relay:
`wss://vrclub-network.garfieldapp.workers.dev`. No local Worker is required.

### Immersive VR access

Desktop preview remains free. Entering immersive VR requires a one-time €1.99
Stripe purchase or an owner-issued, single-use invitation, verified by the
hosted Worker rather than by a browser flag.
The Worker validates the paid Checkout Session with Stripe, stores the
entitlement in D1 and issues an HttpOnly session cookie. Refunds and disputes
revoke access. Stripe secrets and the session-signing secret are configured
with Wrangler and are never included in the Pages build. See
[docs/QUEST.md](docs/QUEST.md#stripe-gated-immersive-vr) for setup and test-mode
release steps.

Invitation codes are entered once in the VR access dialog, with no payment required.
Choose **Use invitation code**: enter the new eight-digit numeric code with the
on-screen keypad, then verify your email using the email code and its numeric keypad.
Verification automatically activates the staged invitation and registers the browser
if a device slot is free. Older letter-and-number codes have a separate entry option.
Codes stay only in tab memory during this flow. The first redemption wins;
the code cannot be redeemed again. Access is linked to that verified account, with
up to two named devices and one active VR session. Lost cookies or a new headset
use email recovery, not another purchase or reuse of the invitation.
Owner tooling (`npm run vr:codes`) writes codes outside the web tree and imports
only hashes into D1; see [issuing invitations](docs/QUEST.md#single-use-vr-invitations).

The [invitation administrator dashboard](https://api.mitwee.nl/admin/invitations)
is restricted by Cloudflare Access plus backend JWT/email verification. It issues
codes once, lists grant state, confirms revocation and records administrator audit
events. Access to this dashboard does not change the deliberately client-side VR
entry gate: technically skilled users may still bypass that frontend check.

The relay is a small Cloudflare Worker (Durable Object) under [worker/](worker/) that only
forwards JSON messages between guests in the same room; deploy your own with:

```powershell
cd worker
npm install
npm run deploy   # or: npm run dev, to run it locally on ws://localhost:8787
```

Paste the deployed `wss://your-worker.workers.dev` URL (and a room code) into the panel.
Custom hosted relay URLs are remembered. Saved legacy localhost:8787 defaults migrate to
the hosted relay; enter a local URL explicitly when testing Worker changes locally.
Voice audio itself never touches the Worker — once two guests are in the same room their
browsers negotiate a direct WebRTC connection (the Worker only relays the SDP/ICE
handshake), so audio stays peer-to-peer. Either guest may enable the mic first; muting keeps
you listening to everyone else.

**Your VR arms are live.** While in a room, both controllers' positions and orientations
are sent with your avatar pose at up to 20 Hz. Other guests see your assigned character
reach, wave and dance with your hands, without pressing a gesture button. Elbows are
inferred with two-bone IK; these are controller poses, not finger or full-body tracking.
Controllers drive the character's physical left/right arms, accounting for mirrored imported skeletons.
Walking still uses the character's authored clips. Losing a controller releases that arm
to animation; leaving VR, losing pose updates or disconnecting releases live tracking.
Desktop guests keep the existing wave/nod/dance buttons. This requires the updated
frontend and relay; Quest 3S performance and physical-controller hand roll remain
unmeasured on hardware.

**Choose who receives your chat and microphone separately.** On desktop, **People → Talk**
contains **Who hears my microphone**; the chat box contains **Send chat to**. In VR, use
**ONLINE → MIC / WHO HEARS ME** and **CHAT → CHAT RECIPIENTS**. Each can target Everyone,
one guest, or a selected group. This is an outgoing audience, not a private room: you can
still receive other guests' public chat and voice. Restricted chat is marked in the log
and speech bubbles and routed only to selected, unblocked recipients by the relay.
Microphone tracks go only to selected peers; changing the audience replaces excluded sender tracks with silence
without closing incoming voice or music connections. Music broadcasting is unchanged.
An empty selection sends nothing. Departing guests are removed; reconnecting or changing
rooms clears restricted selections to Nobody, never Everyone. Choices are session-only.
Selected-recipient chat requires the updated relay; older relays are detected and the
client refuses to send restricted messages instead of broadcasting them. Messages and
voice are not protected against recording or forwarding by their intended recipients.

**Rooms, the host and sharing.** Type a room name (or the 6 digits of a private room's code) in the
panel, or open an invite link (`?room=...`, **Copy invite link**), to join an existing room; **New
private room** makes your own, and in VR the ONLINE page has **JOIN ROOM** (a keypad) and **NEW PRIVATE
ROOM**. The first guest in is the room's **host** (named in the status line); if they leave, the next
guest becomes host. The host owns the music and the lights: everyone else hears the same track at the same
position and sees the same show, and their lighting and music controls are dimmed (VR buttons read
*HOST ONLY*). A guest's own comfort settings stay theirs: Safe Mode (it still removes the host's
strobes), volume, quality, VR comfort and the generic DJ choice. No host stream is fetched until the guest
chooses **Listen along**, because loading it discloses their IP address to that server. Local files
the host plays are automatically offered over a separate **WebRTC music broadcast**, also gated by
Listen along (a direct connection shares IP addresses with the host). The file is not uploaded:
the host sends the playing audio to each consenting guest, separately from microphone voice.
Guests hear it through their own PA/room acoustics, with their own volume and voice ducking;
their beat analyser hears it too. Pause, resume and seeks follow the host's live audio, with
WebRTC latency rather than sample-exact synchronization. Host file volume also affects the sent
audio; host room acoustics and microphone audio do not. Leaving, blocking the host or a host
handover stops the broadcast. STUN-only connectivity can fail on restrictive networks; no TURN
relay is currently configured. Host upload bandwidth and headset cost grow with each listener
and are unmeasured on Quest.

The current host can also choose **Make host** beside another person in the People list,
or ONLINE → PEOPLE → person → **MAKE HOST** in VR. Confirm with a second press within
four seconds. Neither person leaves; the room's lock, bans and cached show/music state
remain, and the old host becomes a guest. A local-file WebRTC broadcast cannot move the
original file to the new host: they must choose their own music, and listeners consent
again when its source changes.

The mingling guest follows one shared room clock: late joiners see the same position,
walk and activities even with different graphics tiers or locally hidden people. His
bar service, smoke stop and balcony visit remain intact. Host handover does not restart
him; an empty room starts a fresh round. Offline visits still use the local round.
Small network-clock differences remain possible; this is not sample-exact synchronization.

**Browse rooms.** People → **Browse rooms** on desktop and ONLINE → **BROWSE ROOMS** in VR
list active public rooms, approximate occupancy and whether each room is full or locked.
Private rooms are never publicly listed: only codes you explicitly save, or private rooms
you previously joined on this device, appear in your private list. Up to twelve bookmarks
are stored locally, scoped to their relay; **Forget** removes one. Refresh is opt-in, not a
background request on startup. Public listings expire after 90 seconds without an update;
joining still checks the actual room's capacity and lock. Private codes are unlisted, not
authentication: use the host's lock, kick and ban controls when needed.
When the last person leaves a public room, its listing is deleted immediately. Private
bookmarks stay until forgotten; reusing an empty private room starts a fresh session,
with no old lock, ban list, music or lights carried over.

Relay deployment requires D1 migration `0006_room_directory.sql` before the new Worker.
It stores only public room names/counts/locks/expiry and hashed-IP lookup rate limits,
never a private room code or a participant's name.

The relay accepts browser connections only from origins listed in `ALLOWED_ORIGINS`
(`worker/wrangler.toml`); loopback and private-LAN origins always pass. Add your own site's
origin before deploying a relay for it. Rooms hold up to 8 guests (voice is a full mesh, and eight is how many are drawn as characters), and per-connection
rate limits disconnect clients that flood the room.
For a custom relay's room browser, also add its HTTP(S) origin to `connect-src` in
`index.html`; the shipped policy permits the hosted relay and API without allowing
arbitrary HTTP(S) connections.

## Offline use

After one successful online visit, the app shell (service worker) and the models, textures and
environment (IndexedDB) are cached on the device.

| Workflow | Needs a network? |
|----------|------------------|
| First visit (download app shell, ~60 MB of models/textures) | Yes |
| Later visits: explore the club, VJ desk, NOCTURNE show, VR | No |
| Play a local audio file | No |
| Internet radio / stream URL | Yes |
| Multiplayer (relay, voice, shared music) | Yes |

The audio panel announces when the device goes offline or comes back online.

## Accessibility

- **Photosensitive Safe Mode** disables every strobe and bloom flash. It is offered
  on the splash screen *before* the scene renders, next to a photosensitivity warning, and is
  **off by default**: it is never switched on automatically (not even for
  `prefers-reduced-motion: reduce`). A guest who turns it on keeps it across sessions.
- Every control is keyboard reachable, has an accessible name, and exposes its state via
  `aria-pressed` / `aria-valuetext`. Toggle state is signalled by a marker and border weight,
  not by colour alone.
- Panels close with `Esc` and restore focus to their trigger.

## Quality Checks

```powershell
npm run check      # node --check every first-party JS file (including the service worker)
npm run lint       # ESLint
npm test           # contract and runtime unit tests
npm run check:sri  # verify js/vendor/* against scripts/vendor.manifest.json and upstream
npm run build      # emit the production site under dist/
npm run icons      # regenerate the PWA icons under icons/
npm run version:bump  # bump every cache token and the service-worker version in lockstep
```

The test suite fails on: a reordered script tag; a renamed element id; a `data-control`
nothing handles; a missing texture or model; `?v=` cache tokens that disagree with
`package.json` or with the service worker; a vendored bundle whose bytes no longer match its
recorded hash; a third-party origin appearing in the critical path; a leaked global event
listener; a native `alert()`; a hard-coded 60 fps frame step in the animation layers; a debug
flag left on; and README drift.

Runtime tests execute real code: the audio URL security boundary, in-flight request
deduplication, IndexedDB commit/quota semantics, material cache-key normalisation, light
factory disposal, ShowDirector look validation and safe-mode enforcement, VJDirector beat
tracking, and a smoke test over every LED wall pattern in the playlist.

Run all checks before every commit.

Recommended manual smoke test before publishing:

1. Open the app from the local server.
2. Click **ENTER CLUB** and wait for the splash screen to disappear.
3. Confirm the browser console has no model/material errors.
4. Open the VJ and audio menus and verify controls still respond.
5. Test Quest browser separately for WebXR entry and performance.

## Deployment

Deploy the generated `dist/` directory to any static host — there is no Node backend.
`npm run start:prod` builds and serves that directory while honouring the platform's `PORT`,
with brotli/gzip compression and security headers.

GitHub Pages is published by the `deploy` job in `.github/workflows/ci.yml`. It builds `dist/`
and deploys it only after the `verify`, `e2e` and `audit` jobs pass on `main`. One-time setup:
**Settings → Pages → Build and deployment → Source: GitHub Actions**. Until then, Pages
serves the raw repository root. GitHub Pages ignores `_headers`, so clickjacking protection
(`frame-ancestors`) requires Cloudflare Pages or Netlify.

What the build produces:

- One content-hashed application bundle and stylesheet under `dist/assets/`.
- A service worker whose precache list and `VERSION` are **generated** from those hashes, so
  a deploy always invalidates the previous cache and the offline shell actually works.
- Only the model assets the code references (the deploy is ~61 MB, not ~110 MB).
- `_headers` for Cloudflare Pages / Netlify, which otherwise send no `frame-ancestors`.

CI enforces a 75 MB payload budget on `dist/`.

The Babylon.js `9.28.0` runtime and the PBR environment texture are vendored under
`js/vendor/` and verified against `scripts/vendor.manifest.json`. There is **no** CDN
fallback — the critical path is deliberately same-origin, and a contract test enforces it.

## Credits

See **[ASSETS.md](ASSETS.md)** for the licence and provenance of every shipped binary.

- Pioneer DJ Console by TwoPixels.studio — CC BY 4.0
- Stage Speaker — Black — CC BY 4.0
- Surface textures from Poly Haven — CC0
- Built with Babylon.js (Apache-2.0) and the Web Audio API

## License

MIT — see [LICENSE](LICENSE). The licence covers the source code only; bundled 3D models,
textures and animations are third-party works under their own terms (see ASSETS.md).
