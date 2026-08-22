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
js/textureLoader.js        Texture caching and pooling
js/modelLoader.js          GLB model loading, caching, placement and procedural fallbacks
js/materialFactory.js      Shared Babylon material presets
js/lightFactory.js         Shared Babylon light creation helpers
js/vjDirector.js           Beat/BPM detection, colour palette and VJ macros
js/showDirector.js         "NOCTURNE" — the composed, beat-locked cue engine
js/ledPatterns.js          LED wall pattern methods mixed into VRClub.prototype
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
test/contract.test.mjs     Contract tests — load order, wiring, assets, hygiene
test/unit.test.mjs         Runtime unit tests for security, caching, materials, and show logic
textures/                  Local PBR environment textures
js/models/                 Local GLB models and model textures
```

## Controls

- **Move**: `W` `A` `S` `D` or the arrow keys; drag with the mouse to look. `Q`/`E` for down/up.
- **VR**: the 🥽 **Enter VR** button sits top-right and is disabled when no headset is detected. In-headset, thumbsticks move and turn; click a thumbstick or squeeze a grip to sprint; `A`/`X` to jump. Press `Y` (or the controller menu button when exposed) to open the lighting menu, then point and trigger to change fixtures, the LED wall, and smoke.
- **🎛️ VJ menu** (top-left): safe mode, haptics, fixture toggles, spotlight/gobo settings, graphics quality, the NOCTURNE show, live macros and a reset.
- **🎵 Audio menu** (bottom-right): play an HTTP(S) stream URL or a local audio file, plus volume. The last stream you played is remembered.
- **📷 Camera presets** (bottom-centre): four fixed viewpoints.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / pause audio |
| `B` | Blackout |
| `F` | Fire the drop |
| `1`–`4` | Camera presets (arrival / floor / booth / lights) |
| `Esc` | Close the focused panel |
| `Ctrl+Shift+D` | FPS / diagnostics overlay |

All shortcuts are ignored while a text field has focus.

## Accessibility

- **Photosensitive Safe Mode** disables every strobe, blinder and bloom flash. It is offered
  on the splash screen *before* the scene renders, and defaults to **on** when the OS reports
  `prefers-reduced-motion: reduce`. The preference persists across sessions.
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
tracking, and a smoke test over all 37 LED wall patterns.

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

What the build produces:

- One content-hashed application bundle and stylesheet under `dist/assets/`.
- A service worker whose precache list and `VERSION` are **generated** from those hashes, so
  a deploy always invalidates the previous cache and the offline shell actually works.
- Only the model assets the code references (the deploy is ~61 MB, not ~110 MB).
- `_headers` for Cloudflare Pages / Netlify, which otherwise send no `frame-ancestors`.

CI enforces a 75 MB payload budget on `dist/`.

The Babylon.js `8.30.5` runtime and the PBR environment texture are vendored under
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
