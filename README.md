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

```text
index.html                 Main page and script loader
css/styles.css             Splash screen and desktop control styling
js/textureLoader.js        IndexedDB texture cache and texture pooling
js/modelLoader.js          GLB model loading, caching, and fallbacks
js/materialFactory.js      Shared Babylon material presets
js/lightFactory.js         Shared Babylon light creation helpers
js/vjDirector.js           Beat detection and VJ macro controller
js/club_hyperrealistic.js  Main Babylon/WebXR scene
js/ui-init.js              Splash, desktop VJ menu, and audio menu wiring
textures/                  Local PBR environment textures
js/models/                 Local GLB models and model textures
backup_aframe/             Legacy A-Frame implementation, not production
```

## Controls

- Desktop: WASD or arrow keys to move, mouse to look, camera preset buttons for quick scene checks.
- VR: Enter VR from the settings panel when WebXR is available, then use thumbsticks for locomotion.
- VJ menu: Toggle lights, lasers, strobes, LED wall, mirror ball, safe mode, haptics, and live macros.
- Audio menu: Play an HTTP(S) stream URL or select a local audio file.

## Quality Checks

```powershell
npm run check
npm start
```

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
