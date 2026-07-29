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

- Desktop: WASD or arrow keys to move, mouse to look, camera preset buttons for quick scene checks.
- VR: Enter VR from the settings panel when WebXR is available, then use thumbsticks for locomotion.
- VJ menu: Toggle lights, lasers, strobes, LED wall, mirror ball, safe mode, haptics, and live macros.
- Audio menu: Play an HTTP(S) stream URL or select a local audio file.
- `D` toggles the FPS/debug overlay (ignored while a text field has focus).

## Quality Checks

```powershell
npm run check   # node --check every first-party JS file
npm run lint    # ESLint errors and migration-cleanup warnings
npm test        # contract and runtime unit tests
npm run check:sri # verify vendored Babylon files against index.html integrity hashes
npm run build   # emit the production site under dist/
```

The test suite fails on a reordered
script tag, a renamed element id, a `data-control` nothing handles, a missing texture or
model, mismatched `?v=` cache tokens, a missing SRI attribute, a leaked global event
listener, a native `alert()`, debug flags left on, and README drift. Runtime tests cover
the audio URL security boundary, in-flight request deduplication, material cache-key
normalization, and ShowDirector ramp and movement behavior. Run all checks before every
commit.

Recommended manual smoke test before publishing:

1. Open the app from the local server.
2. Click **ENTER CLUB** and wait for the splash screen to disappear.
3. Confirm the browser console has no model/material errors.
4. Open the VJ and audio menus and verify controls still respond.
5. Test Quest browser separately for WebXR entry and performance.

## Deployment

Deploy the generated `dist/` directory to static hosting such as GitHub Pages. The app does
not require a Node backend. `npm run start:prod` builds and serves that directory while
honouring the platform's `PORT`. Babylon.js `8.30.5` is vendored locally and verified by
the SRI tooling.

## Credits

- Pioneer DJ Console by TwoPixels.studio, CC BY 4.0
- PA speaker model assets, CC BY 4.0
- Built with Babylon.js and the Web Audio API

## License

MIT
