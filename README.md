# VR Club

Hyperrealistic WebXR nightclub built with Babylon.js for compatible VR headsets and desktop browsers, with Meta Quest used as the primary tested headset. The experience includes a PBR club environment, DJ booth, LED wall, lasers, spotlights, mirror ball effects, audio-reactive lighting, local audio files, and stream URL playback.

## Quick Start

### Edit your personal character

Open **Show → Club → Edit my character** on a computer or phone, or
**Comfort → Me → Edit my character** in VR. Choose one of 17 adult bases,
original/short/long hair or a bald head, an original/casual/smart fitted outfit,
glasses, facial hair and headwear, and skin, hair, top and bottom colours.
Frames include round, square, heart, star and sunglasses; facial hair includes
stubble and a beard. Moustache options remain unavailable until an officially
avatar-accompanied asset with clear redistribution terms is verified; older
saved moustache choices reset to none. Hats include a cap, beanie, fedora and
bucket hat; older party-cone selections migrate to the bucket hat. Headwear
hides the fitted hair to avoid clipping, and facial hair follows Hair color.
Casual outfits include original graphic prints;
selected NPC shirts and sweaters also carry abstract wave/orbit graphics or
Japanese 音 (sound) and 光 (light). Tailored outfits stay plain.
Rotate the 3D preview before saving; Cancel
leaves your character unchanged. Reset removes customization and keeps the
chosen base. This is a wardrobe editor, not a body/face sculpting tool.
Faces keep their source-authored expressions; no custom smile shaping is applied.
Official expression controls are not currently integrated.

Your choice is saved on this device and shared with guests in rooms. Sharing
requires the updated relay; an older relay gives an explicit error rather than
pretending others can see it. Custom personal bodies use detailed models even
in a lightweight room; other people's colours and NPC outfits are not changed.
Only a selected wardrobe is downloaded (about 2.4–3.0 MiB), not all 17 at entry.
The complete optional wardrobe payload is about 45 MiB.
No camera, upload, account sync or external avatar service is involved.
Controller comfort, clothing fit in every pose and frame cost on a physical
headset still require headset review.

`js/wardrobeCatalog.js` lists the on-demand wardrobe assets;
`js/avatarAccessoryAssets.js` contains eyewear generated from the selected
CC0 MakeHuman Community assets by `scripts/build-avatar-accessories.mjs`;
`js/avatarDetails.js` fits the authored glasses and remaining procedural
accessories to measured heads, and a phone to the outside queue caller's
animated hand in both character styles;
`js/avatarAppearance.js` owns validation, shared-texture instantiation, device
preferences and authoritative room updates; `js/avatarEditor.js` owns the
desktop/phone modal and the VR preview.
Old eight-field v1 wardrobes remain valid. The editor saves complete v2
descriptors, negotiating `appearanceAccessories` before publishing them.
Deploy the frontend and relay together for shared accessories; old relays
report unsupported sharing without discarding the device preference.

### Audio-only live DJ events

**Music / Live input** offers a guided mixer setup before joining a room:
choose an input, **Test my input**, then **Go live**. Tests drive the real crowd
and light detectors without transmitting audio; local monitoring is off until
**Hear test audio** is enabled (use headphones). Go live creates a private room
if necessary, after the existing Online safety guide, and publishes only after
that explicit action. **Copy guest link** brings listeners straight into the set.
Stop broadcast returns to private testing; Stop input releases the recording device.
The standalone broadcaster also supports a private sound check without an invitation.

A room host can create a live event from **Online / Live DJ event** and issue a
private DJ link. Its lightweight [broadcaster](broadcast/index.html) takes a
mixer/interface recording input, without a camera or local speaker monitor.
An audience invite joins an available room automatically: up to eight rooms
of 32 people share the same event-owned SFU music feed, while each room keeps
its own conversation. The actual received audio drives the crowd and lights.
These are admission bounds, not a 256-person performance or latency claim.

The Worker and frontend changes must both be deployed before this is available.
See [the live-audio runbook](docs/SCALING.md#live-audio-events-and-automatic-overflow)
for permissions, sound setup, private invitations, revocation, limits and validation.
There is no Twitch audio extraction, video or artist likeness.

### Live-event / ADE exploration

This branch contains an **independent pitch concept**, not a working venue broadcast
or an ADE partnership. `js/liveEventConcept.js` owns its optional event dressing.
Start the pitch preview below, open `http://127.0.0.1:4186/?liveEvent=demo`
and press ENTER as usual. Yellow signs use the supplied official ADE26 anniversary
mark, with an independent-pitch disclosure in the information panel.
Close the panel with its Close button or Escape; Event concept
reopens it. Signs sit on the side/front walls, the DJ table carries a
branded fascia, and signs and two hanging flags flank the street entrance. The LED
wall is left clear. The black XXX key visuals and the video-screen feature have
been removed. The resident DJ remains fictional. The optional branding concept
does not capture media; live audio is a separate, explicitly created event.

Without the query parameter the normal club is unchanged. Concept dressing turns
off in multiplayer rooms because this preview is not shared event state.
Read the [feasibility study](docs/ADE_LIVE_EVENT_FEASIBILITY.md) and
[draft ADE pitch](docs/ADE_PITCH.md) before presenting it as more than a concept.

For an explicit **private pitch build** with the artwork included:

```powershell
npm run build:ade-pitch
$env:PORT = '4186'
$env:HOST = '127.0.0.1'
node scripts\serve.mjs --dist
```

Default `npm run build` deliberately excludes the supplied artwork.
The owner requested a separate public, non-indexed pitch site at
`https://nocturne-ade.mitwee.nl/`. `npm run build:ade-site` enables the dressing at
the root, emits noindex/nofollow meta and HTTP directives, and omits canonical,
social, structured-data, sitemap and Search Console metadata. Crawling is allowed
so search engines can read noindex. This is not an access restriction or a licence
grant. Do not present the site as an approved ADE collaboration.
`npm run deploy:ade` publishes only the separate `nocturne-ade` Pages project,
with production branch `explore/ade-live-dj`; the main club is untouched.
Its custom domain needs a CNAME to `nocturne-ade.pages.dev`. The relay configuration
allow-lists the new HTTPS origin for access recovery, music and multiplayer.

For browser tests, set `$env:VRCLUB_ADE_PITCH = '1'` for the opt-in preview, or
`$env:VRCLUB_ADE_SITE = '1'` for the dedicated non-indexed site, then run
`npx playwright test live-event-concept.spec.mjs`.

### Quest branch

This branch is a **Quest distribution candidate**, not an uploaded or signed store release.
Run `npm run build:quest` for the web payload. See [docs/QUEST.md](docs/QUEST.md) for
signing, Meta Bubblewrap packaging, Digital Asset Links, release checks and remaining blockers.

The only music included is the club's own original, generated house set (`audio/nocturne-house.mp3`, MIT), which plays
until you add music of your own. Open **Music**, choose a local file, paste a direct HTTPS audio link,
or paste one SoundCloud track page in the same **Choose a file or paste a URL** section,
optionally name it, and press **Save & play**. Up to eight sets are saved on this device.
Choose them from the VR Music menu; **ADD MUSIC** returns to the setup panel for the Quest
keyboard/file picker, then **Enter VR** returns to the club. A SoundCloud track plays through
the club's analysed audio graph when its creator publishes it to podcast players: the relay
verifies that public stream, and the PA, lights, crowd, DJ, seeking and room sharing work as
for other audio. Playlists are not supported. If SoundCloud does not publish the track that
way, the saved link is kept and Music explains why; **Open in SoundCloud player** is an
explicit fallback whose audio cannot be analysed, spatialized or shared. The Widget API is
loaded only for that fallback. YouTube and Spotify page URLs are not playable. Other direct
audio hosts must allow CORS.
Only explicitly saved music resumes on entry; historical podcast/stream preferences are ignored.
Generic **Male DJ / Female DJ** choices are in Show & Lights → Club and VR CROWD → CHOOSE DJ.
The fictional male DJ has mature styling and longer, softly wavy nape-length hair
in both character styles; the detailed Jin look carries the stronger facial age cues.
The supplied hairstyle reference is not bundled, and this is not an artist likeness or endorsement.
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
js/restroomArt.js          The restroom's posters, stickers, marker tags and backlit NOCTURNE box: one runtime-painted atlas plus the placement plan
js/venueDressing.js        Entrance stair hall (down from the street door) and bar (counter, back bar, stools, lights) mixed into VRClub.prototype
js/mezzanine.js            Steel balcony and stair along the left wall, plus the walking-surface follow, mixed into VRClub.prototype
js/cityDistrict.js         The street outside (baked GLB), its sky and skyline, fence, street door and "outdoors" amount, mixed into VRClub.prototype
js/vjDesk.js               The VJ desk: Auto show/DJ/presets, fixture/spot-rig/settings pages and a separate player/effects panel
js/lightingPresets.js      Twelve local lighting preset slots, validated backups and desktop/phone naming and transfer
js/characterCatalog.js     Generated CC0 MakeHuman adult cast, measured eyes, NPC assignments and compatible player IDs
js/characterStyles.js      Shared room style, personal lightweight override and live model replacement preserving NPC/session state
js/avatarRig.js            Procedural player body on the dancer skeleton: planted gait, turning, head, IK arms and legs
js/frameStats.js           Frame-time distribution recorder (frame interval, update and submit CPU time, p95/p99, missed frames)
js/playerHeight.js         Pure player-height maths: standing eye-height estimator and the Seated mode view lift
js/djPerformer.js          The DJ's live set as a pose for AvatarRig: mixing, cueing, knobs, crowd, hands up on a drop, waves at visitors, on the beat
js/crowdDance.js           The crowd's choreographer: who dances which move, on the beat; claps in a build, hands up on a drop, sway or stand when the kick goes
js/minglerClock.js         Shared room-time mingler round: deterministic positions, activities and clip phase, independent of host, startup and graphics tier
js/sfuClient.js            Room-authorised SFU audio transport; loaded before networkClient
js/liveAudioClient.js      Event-owned live music, private publisher/listener authorization and bounded media reconnects
js/liveInput.js            Private mixer testing, input meters, optional monitoring and explicit live-event publication
js/networkClient.js        Multiplayer WebSocket/WebRTC client (presence, mesh/SFU voice, emoji, shared music)
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
scripts/characters/build.mjs Builds the 34 detailed adults with NPC/player clips from the verified source GLBs
test/contract.test.mjs     Contract tests — load order, wiring, assets, hygiene
test/unit.test.mjs         Runtime unit tests for security, caching, materials, and show logic
textures/                  Local PBR environment textures
js/models/                 Local GLB models and model textures
```

### Optional detailed characters

In **Show → Club → Crowd**, choose **Character style → Diverse adults**. In VR the
same choice is under **CROWD → CHARACTER STYLE**. Quaternius remains the default;
the detailed models are not fetched until selected. The host chooses the room's
style. **LIGHTWEIGHT CHARACTERS FOR ME** (VR: **LIGHTWEIGHT FOR ME**) forces
Quaternius on this device without changing the room's choice, including when the
host uses that override.
If a change cannot load, the active cast stays in place. Use **Retry loading
characters** (VR: **RETRY CHARACTERS**) or switch to the personal lightweight
override, which remains available while characters load.

The 34 fictional CC0 adults include varied ages, builds, skin tones, genders,
hair, dresses, skirts and casual clothing. Existing tier counts are unchanged:
Ultra has fourteen dancers, eight indoor guests, bartender, bouncer, eight people
queueing and one selected DJ (33 placed people; the other DJ is an alternative).
The same role behaviours, music, visibility, seats and room connection remain
when styles change. The local body/mirror and remote player bodies change too.
Network identity IDs and women/men/anyone pools remain compatible with the relay:
the seventeen existing player identities resolve to seventeen detailed adults,
separately from NPC slots. This does not expand the relay's identity pool.

The detailed cast has two draws and fewer than 10,000 triangles per person;
each DJ adds fitted headphones (three draws, fewer than 13,000 triangles).
It uses textured skin and hair, more joints and substantially more animation
data than Quaternius. A first change downloads/parses the required models and
can pause rendering briefly. Quest CPU/GPU cost and physical-controller feel
have not been measured; keep the lightweight override available.

`npm run build:characters` rebuilds the shipped models and generated catalogue
from `design/characters/base/` and `recipes.json`, using the existing Quaternius
CC0 animation sources. Source generation uses Blender 5.2 and MPFB 2.0.18:
set `VRCLUB_CHARACTER_TOOLS` to an external verified asset/MPFB tooling directory,
`BLENDER_USER_RESOURCES` to its isolated Blender profile, and run
`scripts/characters/generate.py` with Blender. `AVATAR_ONLY` optionally limits
generation to comma-separated IDs. Asset pack hashes and selected CC0 sources
are recorded in `design/characters/provenance.json` and the recipes. MPFB's
software licence is separate from its CC0 output assets. Source models, Blender
intermediates and tooling do not enter the production build.

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
- **VR**: the 🥽 **Enter VR** button sits top-right and is hidden on incompatible devices. On compatible devices it reads **Preparing VR…** while the background models finish loading. By default, the **left stick walks in the direction you look** (without flying when you look up/down), and the **right stick turns smoothly**. Walk up/down the left-hand stairs to reach or leave the balcony. Click the left thumbstick or squeeze a grip to sprint; `A`/`X` to jump. **VR Comfort** switches to teleport and snap turn, disabling sprint/jump. **Seated mode** (comfort page) lets you sit while your avatar stays standing: your view is lifted to standing eye height. In standing mode your avatar takes your real height, estimated as you play (or press **Measure height** and stand tall for three seconds), and other guests see a person your size. Press `Y`/`B` (or the controller menu button when exposed) for the world-locked, paged quick menu. It provides headset-friendly pages for lighting, effects, the automatic show, **CROWD** (send the dancers, the other guests or the DJ home), comfort, safety and quality (**Balanced / High / Ultra**), and travel.
- **The crowd**: up to 14 dancers and 8 guests drawn from the CC0 Quaternius Modular Women / Men cast. Quest replaces the three historical Mixamo slots with CC0 people (some appearances repeat at Ultra). Lower quality tiers show fewer people and download fewer characters. They are built by `scripts/build-crowd-glbs.mjs`; see `ASSETS.md`.
- **Natural club life**: the guest who works the room now periodically joins the dance floor and follows a hand-cleared route around every stool and standing guest. A regular sits on a real bar stool, alternates quiet time with bartender conversation, and occasionally lifts a bottle from the counter for a drink using authored seated animation.
- **Inclusive player bodies and seats**: physical headset height never shortens the visible avatar, so seated play still presents the same standing silhouette. Players can intentionally click or ray-select empty bar stools, either balcony stool, or one of three places on the lightweight Chesterfield-style lounge bench; moving or selecting the seat again stands up. Multiplayer guests see the authored seated pose too.
- **Laser speed**: rotating ceiling beams now move at one quarter of their previous rate. The VJ laser-speed slider still changes their speed; laser-sheet motion is unchanged.
- **The street**: the club is a basement. From its front doorway a carpeted stair climbs between the ticket desk and the coat check to the street door, which opens onto a night avenue lined with lit buildings (or press `6` / use the Street button / the VR menu's Travel page). Every VR entry starts on the opposite pavement, facing the entrance from about 16 metres away so the logo and queue are in view; tracked eye height is preserved. If the street cannot load, a notice explains the indoor fallback. A bouncer in a black suit watches the door, and a line of people waits behind a velvet rope to get in (longer on higher graphics tiers). Out there the music is only the low bass coming through the walls, loudest at the door and quieter the further you walk from it (about half as loud 8 m away, much quieter at the end of the block). The street is drawn only while you are near the entrance, and the door stays shut if it cannot load. Its source kit is not in the repo; see ASSETS.md.
- **Mirror ball**: 96 surface spots on Balanced, 180 on High, 280 on Ultra. The VJ and VR Lighting controls can hide the outgoing rays while retaining the reflected spots around the room. Outgoing-ray counts and the two-batch rendering layout are unchanged; High and Ultra headset GPU cost is not yet measured.
- **🎛️ Lights** (top-left, the VJ menu): safe mode, fixture toggles, spotlight/gobo settings, graphics quality, the NOCTURNE show, live macros and a reset.
- **Take over from the DJ** (the VJ desk on the DJ table): go to the booth (**Go to → DJ Booth**, or the VR menu's TRAVEL page) and use the panels with the mouse or a controller ray. The left **SHOW** panel contains only **AUTO SHOW** (on/off), **SEND DJ HOME / BRING DJ BACK**, and **lighting presets**. The right **LIGHTS** panel switches fixtures and steps colours/pictures; **SPOT RIG** edits individual heads, rows and columns. **LIGHTS → SETTINGS** holds brightness, movement speed, Safe Mode, reset and your return-to-auto timing. The centre player/effects panel appears when the DJ is away. Touching a light or recalling a preset makes you the VJ; the lights stay yours at the desk and follow your existing keep/return/shuffle preference when you leave.
- **Save a lighting setup:** choose one of twelve slots on the left panel, then **SAVE LIGHTING**. **RECALL PRESET** restores fixtures, exact colours, independent spotlight groups, patterns, speeds and brightness; it never changes music, audio effects, DJ presence or Safe Mode. Selecting a slot does not apply it. Replacing or deleting requires a second press within four seconds. Presets are saved only on this device; a host's recalled lighting is shared with the room through the existing lighting sync. **NAME / TRANSFER** opens a desktop/phone dialog for names and JSON export/import (it says **LEAVES VR** in a headset; immersive-only apps keep save/recall in VR but require a normal browser for file management). Import explicitly replaces all twelve slots after validating the backup. Saving, naming and importing do not take over the room's lights; only the host can recall a preset while following a host.
- **Automatic column lighting:** the show includes twelve-bar Column Fill passages, both stationary and with a slow beat-synced sweep. Each fills the left column, then both columns, then clears before repeating; the sweeping version keeps all three heads in a column moving together, with the opposite column mirrored. Safe Mode retains its gradual, lower-brightness fades.
- **Music** (bottom-right): save/play your direct HTTPS audio links, choose a saved set or local file, select a generic male/female DJ, seek with the slider or +/-30 seconds, and adjust music/ambience independently. A finite saved set resumes from its last position after restarting the app when the same source remains selected. The VR Music page offers saved-set controls and a ray-selectable seek strip; ADD LINKS / FILE returns to the setup panel.
- **Music on entry:** a set you saved resumes; with none saved the club plays its own original house set (`audio/nocturne-house.mp3`, generated by `scripts/build-default-set.mjs`) so nobody stands in a silent club. It loops, is never saved to your list, never plays over your own music, and stays quiet in someone else's room. Your own sets play once, without an automatic queue. DJs are a separate local choice.
- **A DJ who plays the set:** the DJ mixes on the jog wheels, works the mixer knobs, holds a headphone cup to one ear, looks out over the crowd with their hands on the console, and waves when you walk up to the booth. A drop can earn one restrained, staggered raise and return, at most once in 24 seconds; there is no repeated arm pumping or automatic hands-up loop from loud music. They still nod and shift their weight on the beat.
- **Your character:** choose **Show → Club → My character**, or **VR → Comfort → Me → My character**. Your exact choice is saved on this device and used for your body, reflection and room appearance, including reconnects. **Default** restores the mannequin offline and a random room character online. Online random-look/pool changes clear an exact choice when they reroll. Explicit choices can repeat another guest's look. Deploy the updated frontend and relay together; older relays explain that exact selection is unsupported instead of pretending to change your shared appearance.
- **A crowd that dances on the beat:** the people on the floor switch between nine moves (a bounce, side taps, clapping, fist pumps, the twist, hands up, a sway and the original dance), each at the track's tempo and locked to its beat, each dancer with their own favourites, changing on bar lines. More clapping in a build, hands up on the drop; when the kick drops out they sway slowly or just stand until it returns.
- **A show that follows the kick:** the club listens to the kick drum on its own (a 120 Hz band, separate from the bass/mid/treble analyser), so the beat grid locks to real kicks rather than the bassline. The whole rig dips between kicks and hits on them (at most 2.5 hits a second, whatever the tempo), the moving heads dip toward the floor on each kick, and fixture speed and the show's energy follow how loud the low end is now against the last ~20 seconds: a breakdown calms the room, a drop lifts it. Photosensitive Safe Mode keeps the old shallow breathing.
- **Direct audio hosts** must provide CORS for reactive lighting. SoundCloud is the narrow exception: the relay resolves and streams only individual tracks that SoundCloud itself publishes to podcast players; it does not scrape or unlock other audio.
- **`js/paymentGate.js`** keeps desktop preview free while requiring a server-verified Stripe entitlement before immersive VR entry.
- **`js/immersiveLaunch.js`** (opt-in, `?immersive=1`) opens the club straight into VR for a headset app: the photosensitivity choice, access check, a short free preview and a phone-paired code screen, all inside the headset.
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
can target Everyone, nobody, or selected guests in private rooms; public-room audiences stay room-wide
(with personal mutes and two-way blocks still available). Right-stick turning pauses while the wheel is open; the
left-stick click and grips still sprint, and `Y`/`B` still opens the complete quick menu.
Both local testing and the deployed site default to the hosted relay:
`wss://vrclub-network.garfieldapp.workers.dev`. No local Worker is required.

**QuestProtect safety.** The desktop Online panel and VR ONLINE page first show a
versioned **Before you go online** guide: keep personal/contact details private,
leave if pressured, and use **Report & block**. Acceptance is remembered on this
device; Safety can reopen it. Report & block sends a reason to the room host before
blocking contact both ways. Hosts receive a bounded, session-only report list with
remove/ban controls. Reports are not a staffed ADE reporting service, evidence
archive, age verification or guaranteed protection against abuse. An official
event still needs appointed moderators, escalation procedures and an admission policy.

**Larger rooms.** This branch integrates QuestDev's SFU/presence experiment and
configures the shared relay for **32 connected guests per room**, public or private.
The coordinated production rollout completed on 19 October 2026: migration 0009,
dedicated production SFU credentials, all three supported frontends and the shared
Worker are deployed. Old open tabs need reloading. SFU audio avoids a 32-person browser-to-browser
mesh; detailed remote bodies are bounded to the nearest 6/10/14 on
Balanced/High/Ultra, with capsule fallbacks for the rest. The 17-character pool can
repeat once exhausted. Admission is tested, not a claim of 32-person headset
performance or festival broadcast delivery. See [SCALING.md](docs/SCALING.md)
for setup, compatibility, safety enforcement, tests and rollout.

**Owner-only DEV room.** On the updated ADE site, join room **000032** through the
normal Online menu or VR room-code keypad. An already verified owner account on
that device is recognized automatically; otherwise verify it through Access first.
The code is a selector, not a password: non-owner accounts cannot enter.
The relay fills unused places to 32 total with fictional, internationally named attendees who walk
between individually chosen activities: dancing, watching the floor from a wall or
balcony, chatting in small indoor/outdoor groups, getting fresh air, resting on the
couch or balcony chairs, sitting at the bar and visiting a toilet. They linger rather
than following a shared circuit. Conversations use occasional short scripted chat
balloons, gestures and emoji, not generated speech or an AI service. Dancers sometimes
cheer toward the DJ. Limited simultaneous walking and reserved clear paths avoid
walking queues; real players can request an occupied seat or toilet and the simulated
guest makes room before the player sits. Another authorized owner takes a simulated guest's place.
Only real owners can host; leaving the last owner removes the simulation.
These are server-generated poses, not 31 real sockets or voice publishers.
Every attendee retains their assigned Quaternius body. See
[the DEV-room runbook](docs/SCALING.md#owner-only-dev-room-000032) for limits and configuration.

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
strobes), volume, quality, VR comfort and the generic DJ appearance. The host's DJ on/off choice
sets whether the room DJ is present for everyone. Guests can additionally hide that DJ personally,
but cannot bring back one the host sent home; the host's choice never overwrites their saved preferences.
All nine host audio controls (low-pass, high-pass, echo, flanger, reverb, phaser, noise sweep, gater and
crossfader) follow the same host frames in automatic and manual lighting modes. Saved-link listeners
apply them locally; local-file broadcasts already contain them, so receivers do not apply them twice.
These are control-setting updates, not sample-accurate synchronization of modulation or WebRTC audio.
Both clients and the relay must support these optional fields; older clients retain their former behavior.
No host stream is fetched until the guest
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
origin before deploying a relay for it. The shared relay configuration targets 32 guests using SFU
audio; unconfigured custom relays retain eight-person mesh rooms. Rooms above eight require SFU.
Detailed character counts are independent of room capacity, and per-connection
rate limits disconnect clients that flood the room.
For a custom relay's room browser, also add its HTTP(S) origin to `connect-src` in
`index.html`; the shipped policy permits the hosted relay and API without allowing
arbitrary HTTP(S) connections.

## Offline use

After one successful online visit, the app shell (service worker) and the models, textures and
environment (IndexedDB) are cached on the device. NOCTURNE is an installable PWA: in a supporting browser, open
**About, Credits & licences** and press **Install app** (or use the browser's own install button) to run it in its own
window.

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
