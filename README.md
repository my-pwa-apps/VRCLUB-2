# VR Club

Hyperrealistic WebXR nightclub built with Babylon.js for Meta Quest 3S and desktop browser preview. The experience includes a PBR club environment, DJ booth, LED wall, lasers, spotlights, mirror ball effects, audio-reactive lighting, local audio files, and stream URL playback.

## Quick Start

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
js/podcasts.js             Podcast catalogue (Hernan Cattaneo, Miss Melera), the choice, random/latest pick and queue behind both the Audio menu and the VR menu
js/textureLoader.js        Texture caching and pooling
js/modelLoader.js          GLB model loading, caching, placement and procedural fallbacks
js/materialFactory.js      Shared Babylon material presets
js/lightFactory.js         Shared Babylon light creation helpers
js/vjDirector.js           Beat/BPM detection, colour palette and VJ macros
js/showDirector.js         "NOCTURNE" — the composed, beat-locked cue engine
js/ledPatterns.js          LED wall pattern methods mixed into VRClub.prototype
js/barProps.js             Bar bottles: lathe shapes, shelf stocking and the label atlas (pure data)
js/venueDressing.js        Entrance vestibule and bar (counter, back bar, stools, lights) mixed into VRClub.prototype
js/mezzanine.js            Steel balcony and stair along the left wall, plus the walking-surface follow, mixed into VRClub.prototype
js/cityDistrict.js         The street outside (baked GLB), its sky and skyline, fence, street door and "outdoors" amount, mixed into VRClub.prototype
js/avatarRig.js            Procedural player body on the dancer skeleton: planted gait, turning, head, IK arms and legs
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

- **Move**: `W` `A` `S` `D` or the arrow keys; drag with the mouse to look. `Q`/`E` for down/up.
- **VR**: the 🥽 **Enter VR** button sits top-right and is disabled when no headset is detected. On first load it reads **Preparing VR…** while the background models finish loading. By default, the **left stick walks in the direction you look** (without flying when you look up/down), and the **right stick turns smoothly**. Walk up/down the left-hand stairs to reach or leave the balcony. Click a thumbstick or squeeze a grip to sprint; `A`/`X` to jump. **VR Comfort** switches to teleport and snap turn, disabling sprint/jump. Press `Y`/`B` (or the controller menu button when exposed) for the world-locked, paged quick menu. It provides headset-friendly pages for lighting, effects, the automatic show, comfort and safety, travel, reset, and live **Balanced / High / Ultra** quality switching.
- **The crowd**: up to 14 dancers and 8 guests, all different: 17 recoloured Quaternius Modular Women / Men (every skin tone, black, brown, auburn, blond and silver hair, casual, punk, formal and suit outfits) plus the three Mixamo dancers. Lower quality tiers show fewer people and download fewer characters. They are built by `scripts/build-crowd-glbs.mjs`, which also retargets the club's dance and idle clips onto their rig; see `js/models/avatars/README.md`.
- **Laser speed**: rotating ceiling beams now move at one quarter of their previous rate. The VJ laser-speed slider still changes their speed; laser-sheet motion is unchanged.
- **The street**: walk out through the vestibule's street door (or press `6` / use the Street button / the VR menu's Travel page) onto a night avenue lined with lit buildings. Out there the music is only the low bass coming through the walls, a little clearer at the door than down the street. The street is drawn only while you are near the entrance, and the door stays shut if it cannot load. Its source kit is not in the repo; see ASSETS.md.
- **Mirror ball**: 96 surface spots on Balanced, 180 on High, 280 on Ultra. Outgoing-ray counts and the two-batch rendering layout are unchanged; High and Ultra headset GPU cost is not yet measured.
- **🎛️ VJ menu** (top-left): safe mode, haptics, fixture toggles, spotlight/gobo settings, graphics quality, the NOCTURNE show, live macros and a reset.
- **🎵 Audio menu** (bottom-right): choose **Hernan Cattaneo** (*Resident*) or **Miss Melera** (*Colourizon*), play a **Random** or the **Latest** episode, drag the **seek bar** (or ±30 s) to move through it, or play an HTTP(S) stream URL / local audio file, plus volume. The last stream you chose is remembered. A dropped episode reconnects at the same position. The VR menu has the same controls on its **Music** page, with a seek strip you click or drag with the controller ray.
- **Music on entry:** a random episode of the chosen podcast starts when you press ENTER (the splash names which servers see your IP address, and one tick turns it off for good). When an episode finishes, the next older one plays, and so on. The DJ in the booth changes to match the podcast.
- **Miss Melera needs the relay:** her SoundCloud podcast has no CORS headers, so it streams through the Worker in `worker/` (`/podcast/colourizon/...`). The hosted relay was updated on 2026-10-07; after changing `worker/`, redeploy it with `wrangler deploy`. Hernan Cattaneo works without it.
- **📷 Camera presets** (bottom-centre): four fixed viewpoints.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause audio |
| `B` | Blackout |
| `F` | Fire the drop |
| `1`–`6` | Camera presets (arrival / floor / booth / lights / balcony / street) |
| `Esc` | Close the focused panel |
| `Ctrl+Shift+D` | FPS / diagnostics overlay |

All shortcuts are ignored while a text field has focus.

## Multiplayer (optional)

The **👥 Multiplayer** panel (top-right) lets several guests share one club: the same
room state, each other's positions as simple avatars, voice chat, and one shared "now
playing" stream. It is entirely opt-in — nobody connects until a guest clicks **Connect**.
Both local testing and the deployed site default to the hosted relay:
`wss://vrclub-network.garfieldapp.workers.dev`. No local Worker is required.

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

**Rooms, the host and sharing.** Type a room name (or the 6 digits of a private room's code) in the
panel, or open an invite link (`?room=...`, **Copy invite link**), to join an existing room; **New
private room** makes your own, and in VR the ONLINE page has **JOIN ROOM** (a keypad) and **NEW PRIVATE
ROOM**. The first guest in is the room's **host** (named in the status line); if they leave, the next
guest becomes host. The host owns the music and the lights: everyone else hears the same track at the same
position and sees the same show, and their lighting and music controls are dimmed (VR buttons read
*HOST ONLY*). A guest's own comfort settings stay theirs: Safe Mode (it still removes the host's
strobes), volume, quality, VR comfort and haptics. The host's podcast episodes start for a guest at
once (the app already talks to those servers); any other stream is not fetched until the guest
chooses **Listen along**, because loading it discloses their IP address to that server. Local files
the host plays are not shared.

The relay accepts browser connections only from origins listed in `ALLOWED_ORIGINS`
(`worker/wrangler.toml`); loopback and private-LAN origins always pass. Add your own site's
origin before deploying a relay for it. Rooms hold up to 8 guests (voice is a full mesh, and eight is how many are drawn as characters), and per-connection
rate limits disconnect clients that flood the room.

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
