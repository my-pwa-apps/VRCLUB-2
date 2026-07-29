# VR Club

Hyperrealistic WebXR nightclub built with Babylon.js for Meta Quest 3S and desktop browser preview. The experience includes a PBR club environment, DJ booth, LED wall, lasers, spotlights, mirror ball effects, audio-reactive lighting, local audio files, and stream URL playback.

## Quick Start

```powershell
npm install
npm start
```

Open `http://localhost:8000`, click **ENTER CLUB**, then use the on-screen controls or camera presets to inspect the scene. For Quest testing, open the same server from the headset browser using your PC IP address, for example `http://192.168.1.100:8000`.

You can also serve the static files without Node:

```powershell
npm run serve
```

## Project Layout

Scripts are plain `<script>` tags with **no build step and no module system** — each file
publishes its class onto `window`, so the load order in `index.html` is a hard contract.
They are listed below in that order.

```text
index.html                 Main page and script loader (owns the load order)
css/styles.css             Splash screen and desktop control styling
js/assetCache.js           IndexedDB cache, in-flight dedup, fetch timeouts (loaders depend on it)
js/textureLoader.js        Texture caching and pooling
js/modelLoader.js          GLB model loading, caching, placement and procedural fallbacks
js/materialFactory.js      Shared Babylon material presets
js/lightFactory.js         Shared Babylon light creation helpers
js/vjDirector.js           Beat/BPM detection, colour palette and VJ macros
js/showDirector.js         "NOCTURNE" — the composed, beat-locked cue engine
js/club_hyperrealistic.js  Main Babylon/WebXR scene (the VRClub class)
js/ui-init.js              Splash, desktop VJ menu, and audio menu wiring; constructs VRClub
scripts/serve.mjs          Dependency-free static server honouring $PORT (used by Procfile)
test/contract.test.mjs     Contract tests — load order, wiring, assets, hygiene
textures/                  Local PBR environment textures
js/models/                 Local GLB models and model textures
backup_aframe/             Legacy A-Frame implementation, not production
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
npm test        # contract tests: load order, DOM wiring, assets, hygiene
```

`npm test` is the only automated safety net in the project. It fails on a reordered
script tag, a renamed element id, a `data-control` nothing handles, a missing texture or
model, mismatched `?v=` cache tokens, a missing SRI attribute, a leaked global event
listener, a native `alert()`, debug flags left on, and README drift. Run it before every
commit.

Recommended manual smoke test before publishing:

1. Open the app from the local server.
2. Click **ENTER CLUB** and wait for the splash screen to disappear.
3. Confirm the browser console has no model/material errors.
4. Open the VJ and audio menus and verify controls still respond.
5. Test Quest browser separately for WebXR entry and performance.

## Deployment

This repository is intended for static hosting such as GitHub Pages. The app does not require a Node backend for the current single-player experience. External Babylon.js scripts are pinned to version `8.30.5` and include Subresource Integrity hashes.

## Credits

- Pioneer DJ Console by TwoPixels.studio, CC BY 4.0
- PA speaker model assets, CC BY 4.0
- Built with Babylon.js and the Web Audio API

## License

MIT
