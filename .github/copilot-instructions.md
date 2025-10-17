# VR Club - AI Coding Agent Instructions

## Architecture Overview

This is a **WebXR VR nightclub** built with **Babylon.js 8.30.5** for Meta Quest 3S. The architecture uses a **modular loader pattern** with IndexedDB caching for assets.

**Note**: The `backup_aframe/` directory contains an earlier **A-Frame 1.5.0** implementation. The current production version uses Babylon.js for superior PBR materials, post-processing, and lighting control. Don't modify A-Frame files unless explicitly requested.

### Core Components (Load Order Matters!)
1. **index.html** - Entry point with inline styles, script loader
2. **js/textureLoader.js** - Polyhaven PBR textures with IndexedDB cache + texture pooling
3. **js/modelLoader.js** - 3D models (.glb) with IndexedDB cache + geometry instancing
4. **js/materialFactory.js** - Centralized material creation and reuse
5. **js/lightFactory.js** - Centralized light creation and group management
6. **js/club_hyperrealistic.js** - Main VRClub class (~4000 lines)

**Critical**: Scripts load synchronously in this order. `textureLoader.js` and `modelLoader.js` MUST load before factory classes, which MUST load before `club_hyperrealistic.js`. MaterialFactory and LightFactory provide consistent creation patterns across the app.

### Dual-Rendering Architecture
The app maintains **separate rendering configurations** for desktop vs VR:
- `vrSettings.desktop` - Lower bloom, FXAA anti-aliasing, NO grain/chromatic aberration (crisp rendering)
- `vrSettings.vr` - Minimal bloom, FXAA anti-aliasing, NO tone mapping, higher sharpness

**Pattern**: All VR/desktop differences live in the `vrSettings` config object (lines 13-45 in club_hyperrealistic.js). Use `applyVRSettings(xrCamera)` and `applyDesktopSettings()` helper methods—never inline settings.

**Important**: Grain and chromatic aberration are disabled on both desktop and VR to prevent hazy appearance. Bloom is kept minimal to avoid visual fog while maintaining light glow effects.

### Asset Loading Pattern
**Problem**: First-time users download ~50MB of textures/models from CDN.  
**Solution**: Two-tier caching system:
1. **IndexedDB** - Persistent browser storage for textures/models
2. **Procedural fallbacks** - Geometric shapes if models fail to load

**Example** (modelLoader.js lines 82-115):
```javascript
dj_console: {
    url: './js/models/djgear/source/pioneer_DJ_console.glb',
    useProcedural: false, // Try real model first
    // Falls back to procedural CDJ boxes if download fails
}
```

**Pattern**: Check `useProcedural` flag. If true, skip download and create geometric primitives. Always provide fallbacks for VR compatibility.

## Critical Performance Constraints

### Light Count Limits (Device-Specific)
**Quest VR**: 6 lights max per PBR material  
**Desktop**: 4 lights max per PBR material  
**Mobile**: 4 lights max

**Why**: PBR materials exhaust GPU uniform buffers. Exceeding limits causes GL errors and crashes.

**Pattern** (club_hyperrealistic.js lines 177-192):
```javascript
detectMaxLights() {
    const isQuest = ua.includes('quest') || ua.includes('oculus');
    if (isQuest) return 6;
    return 4; // Conservative for PBR + loaded 3D models
}
```

**Rule**: Set `material.maxSimultaneousLights = this.maxLights` on ALL materials, especially loaded models.

### VR-Specific Opacity Issues
**Problem**: Materials with ANY alpha/transparency settings appear see-through or shimmer in VR.  
**Solution**: Aggressively enforce opacity on loaded models (modelLoader.js lines 217-250):

```javascript
mesh.material.alpha = 1.0;
mesh.material.transparencyMode = null;
mesh.material.needAlphaBlending = () => false;
mesh.material.disableDepthWrite = false;
```

**Pattern**: When loading 3D models, ALWAYS enforce these properties on every mesh material. VR stereoscopic rendering is hypersensitive to transparency.

### Procedural Model Conflicts
**Problem**: Both procedural and real 3D models can render simultaneously, causing z-fighting.  
**Solution**: Hide procedural meshes when real models load (modelLoader.js lines 259-272):

```javascript
// Hide procedural CDJs when real model loads
const leftCDJ = this.scene.getMeshByName('leftCDJ');
if (leftCDJ) leftCDJ.setEnabled(false);
```

**Pattern**: After loading a real 3D model, search for procedural meshes by name and call `setEnabled(false)`. Check PA speakers (sub-7, subGrill-7, etc.) and CDJs.

## Development Workflow

### Local Testing
```powershell
# Node.js (recommended - defined in package.json)
npm start                 # Runs on http://localhost:8000

# Alternative: Python
npm run serve             # Runs Python SimpleHTTPServer on port 8000

# Alternative: Any HTTP server
# Simply serve the root directory on any port
```

**Note**: HTTPS not required for local development. Quest browser supports `http://localhost` WebXR without SSL. Access from Quest via your PC's IP address (e.g., `http://192.168.1.100:8000`).

### Debugging VR Issues
1. **Desktop preview**: Test rendering in desktop browser FIRST (faster iteration)
2. **Quest browser console**: Use `chrome://inspect` on PC to view Quest's browser console
3. **VR state changes**: Look for `🥽 VR mode activated` or `🖥️ Desktop mode restored` logs
4. **Material errors**: Search console for "Too many lights" or "GL_INVALID_OPERATION"

### Common Patterns

**Color Caching** (avoid creating Color3 objects every frame):
```javascript
this.cachedColors = {
    red: new BABYLON.Color3(1, 0, 0),
    // Reuse these in animations instead of new Color3()
};
```

**Post-Processing Toggle**:
```javascript
// Add camera to pipeline only in VR
this.renderPipeline.addCamera(xrCamera);
// Remove when exiting VR (happens automatically)
```

**Model Position Coordinates**:
- DJ Booth: `z = -23` (back wall)
- Dance Floor: `z = -12` (center)
- Entrance: `z = 0` (front)
- PA Speakers: `x = ±7, z = -25` (flanking DJ booth)

**Camera Presets** (index.html - 6 button UI at bottom):
```javascript
// Camera preset system for quick navigation
entrance: { position: [0, 1.6, 0], target: [0, 1.6, -15] }
danceFloor: { position: [0, 1.6, -12], target: [0, 1.6, -23] }
djBooth: { position: [0, 1.8, -18], target: [0, 1.6, -23] }
ledWallClose: { position: [0, 3, -22], target: [0, 3, -25] }
overview: { position: [15, 12, 5], target: [0, 2, -15] }
ceiling: { position: [0, 7.5, -12], target: [0, 0, -12] }
```

**Pattern**: Use camera presets for testing specific areas. Desktop users click buttons; VR users navigate naturally.

## Project-Specific Conventions

### Material Creation Pattern
**Never** create materials inline. Use the `MaterialFactory` for consistency and reusability:

```javascript
// ❌ Wrong
const mat = new BABYLON.PBRMetallicRoughnessMaterial("myMat", this.scene);
mat.baseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
mat.metallic = 0.8;
mat.roughness = 0.3;
mat.maxSimultaneousLights = this.maxLights;

// ✅ Correct - Use preset
const mat = this.materialFactory.getPreset('platform');

// ✅ Correct - Custom material
const mat = this.materialFactory.createPBRMaterial('customMat', {
    baseColor: [0.5, 0.5, 0.5],
    metallic: 0.8,
    roughness: 0.3
}, true); // shared=true for reuse
```

**Available Presets**: `cdjBody`, `jogWheel`, `mixer`, `table`, `platform`, `rail`, `floor`, `wall`, `ceiling`, `truss`, `brace`, `lightFixture`, `speakerBody`, `speakerGrill`, `speakerHorn`, `brick`, `pillar`, `pipe`, `laserHousing`

### Light Creation Pattern
**Never** create lights inline. Use the `LightFactory` for consistency and group management:

```javascript
// ❌ Wrong
const light = new BABYLON.PointLight("myLight", new BABYLON.Vector3(0, 5, 0), this.scene);
light.intensity = 1.5;
light.diffuse = new BABYLON.Color3(1, 0, 0);

// ✅ Correct - Use preset
const light = this.lightFactory.getPreset('djLight', 'myLight', new BABYLON.Vector3(0, 5, 0));

// ✅ Correct - Custom light with grouping
const light = this.lightFactory.createPointLight(
    'customLight',
    new BABYLON.Vector3(0, 5, 0),
    { intensity: 1.5, color: [1, 0, 0], range: 20 },
    'dj' // Add to 'dj' group for batch control
);
```

**Available Presets**: `ambient`, `djLight`, `speakerLight`, `spotlight`, `laserLight`

**Group Management**: Use `lightFactory.getGroup('groupName')` to batch-control lights:
```javascript
// Disable all DJ lights at once
this.lightFactory.getGroup('dj').forEach(light => light.setEnabled(false));

// Adjust all speaker lights intensity
this.lightFactory.getGroup('speakers').forEach(light => light.intensity *= 0.5);
```

### Texture Pooling Pattern
TextureLoader now pools textures by URL + scale to prevent duplicate downloads:

```javascript
// Reusing textures with same URL/scale returns cached instance
const tex1 = await this.textureLoader.loadTexture('brick_diff', { u: 2, v: 2 });
const tex2 = await this.textureLoader.loadTexture('brick_diff', { u: 2, v: 2 }); // Same instance!

// Different scale = different pool entry
const tex3 = await this.textureLoader.loadTexture('brick_diff', { u: 4, v: 4 }); // New instance

// Release when material is disposed
this.textureLoader.releaseTexture(tex1); // Decrements usage count
```

**Pattern**: Pool key = `${url}_${scale.u}_${scale.v}`. Textures track usage count and auto-dispose when count reaches 0. Use `clearTexturePool()` to manually flush cache.

### Configuration-Driven Settings
**Never** hardcode rendering values inline. Use the `vrSettings` object:
```javascript
// ❌ Wrong
this.renderPipeline.bloomWeight = 0.15;

// ✅ Correct
const vr = this.vrSettings.vr;
this.renderPipeline.bloomWeight = vr.bloomWeight;
```

### Mesh Naming Convention
Procedural meshes use predictable names for cleanup:
- `leftCDJ`, `rightCDJ`, `mixer` (DJ gear)
- `sub-7`, `subGrill-7`, `mid-7` (left PA speaker stack)
- `sub7`, `subGrill7`, `mid7` (right PA speaker stack)
- `speakerLED-7`, `ledLight-7` (speaker indicators)

**Pattern**: When adding procedural geometry, suffix with position (e.g., `horn7` for right side).

### IndexedDB Schema
**Texture cache**: `VRClubTextureCache` database, `textures` store, key: `url`  
**Model cache**: `VRClubModelCache` database, `models` store, key: `url`

Both store blobs/ArrayBuffers with timestamp. Clear with `cache.clearCache()` if corrupted.

### VJ Control System
**Interactive 3D UI** (club_hyperrealistic.js lines 1000-1200):
VJ controls are 3D meshes in-scene (not HTML overlays) that respond to pointer/gaze interactions:

```javascript
// VJ control buttons track state changes
this.vjControlButtons = []; // Populated during createDJBooth()
this.lightsActive = true;   // Main lighting toggle
this.lasersActive = false;  // Laser system toggle
this.ledWallActive = true;  // LED wall toggle
this.strobesActive = true;  // Strobe toggle
this.mirrorBallActive = false; // Mirror ball effect (disables all other lights)
this.spotlightMode = 0;     // 0=strobe+sweep, 1=sweep, 2=static+strobe, 3=static
```

**Pattern**: VJ interactions pause automated patterns. When user toggles lights, set `this.vjManualControl = true` to prevent auto-cycling. Buttons use action managers with `ExecuteCodeAction` on `ActionManager.OnPickTrigger`.

**Mirror Ball Effect**: When `mirrorBallActive = true`, all other lights (spots, lasers, LED wall) turn OFF. A single spotlight aims at a rotating 1.2m mirror ball suspended from center truss (0, 6.5, -12). 24 reflection spots simulate light reflections moving around the room. Classic disco effect with dramatic lighting.

### Audio Streaming System
**Web Audio API integration** (club_hyperrealistic.js lines 3550-3700):
```javascript
// Audio context initialized on first user interaction
this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
this.audioAnalyser = this.audioContext.createAnalyser();
this.audioAnalyser.fftSize = 256; // Frequency bins for analysis

// Connect HTML5 audio → analyser → destination
const source = this.audioContext.createMediaElementSource(audioElement);
source.connect(this.audioAnalyser);
this.audioAnalyser.connect(this.audioContext.destination);
```

**Pattern**: Audio reactivity uses `getByteFrequencyData()` to drive light intensity. Bass (0-85Hz) affects disco ball, mids (85-255Hz) modulate lasers, highs (255Hz+) trigger LED patterns. Always check `audioContext.state === 'running'` before analyzing.

## Integration Points

### Babylon.js CDN Dependencies (index.html)
```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/proceduralTexturesLibrary/babylonjs.proceduralTextures.min.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
```

**Order matters**: Core → Procedural Textures → Loaders → App scripts.

### External CDNs
- **Polyhaven textures**: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/`
- **3D Models**: Local `./js/models/` directory (committed to repo)

### License Attribution
All loaded 3D models are **CC BY 4.0** licensed. Attribution MUST appear in UI:
- Pioneer DJ Console by TwoPixels.studio (Sketchfab)
- PA Speakers (CC BY 4.0)

**Location**: `#modelCredits` div in index.html (bottom-left corner).

## Common Pitfalls

❌ **Don't** create new Color3 objects in render loops (causes GC pressure)  
✅ **Do** reuse `this.cachedColors`

❌ **Don't** exceed light count limits (causes GL errors)  
✅ **Do** set `maxSimultaneousLights` on all materials

❌ **Don't** leave transparency settings on VR materials  
✅ **Do** enforce `alpha=1.0`, `transparencyMode=null`

❌ **Don't** forget to hide procedural meshes when real models load  
✅ **Do** call `setEnabled(false)` on conflicting geometry

❌ **Don't** modify `vrSettings` directly during runtime  
✅ **Do** update config object and call `applyVRSettings()` or `applyDesktopSettings()`

### Geometry Instancing Pattern
ModelLoader supports geometry instancing for repeated model placements:

```javascript
// Load base model once
await this.modelLoader.loadModel('dj_console', this.scene, null, this.maxLights);

// Create instances for multiple locations
const instance1 = this.modelLoader.createInstance('dj_console', 'console_left', 
    { position: [-5, 0, -23], rotation: [0, 0, 0], scale: [1, 1, 1] });
const instance2 = this.modelLoader.createInstance('dj_console', 'console_right',
    { position: [5, 0, -23], rotation: [0, Math.PI, 0], scale: [1, 1, 1] });

// Dispose instances individually
this.modelLoader.disposeInstance('console_left');

// Or dispose all instances of a model
this.modelLoader.disposeAllInstances('dj_console');
```

**Pattern**: Instances share geometry/materials (memory efficient) but have unique transforms. Use for repeated objects like speakers, lights, or decorative elements.

## Documentation Reference

- **OPTIMIZATION_SUMMARY.md** - Performance metrics, scene statistics
- **CLEANUP_OPTIMIZATION_2025-10-08.md** - VR settings refactoring details
- **REFACTORING_2025-10-17.md** - Factory pattern optimizations, texture pooling, geometry instancing
- **POST_PROCESSING_HAZE_FIX_2025-10-17.md** - Bloom/grain/chromatic aberration removal for crisp rendering
- **MIRROR_BALL_FEATURE_2025-10-17.md** - Disco ball with spotlight and reflection effects
- **ANTI_ALIASING_FIX.md** - FXAA configuration for VR
- **PA_SPEAKER_TRANSPARENCY_FIX.md** - Opacity enforcement patterns
- **MODEL_INTEGRATION_COMPLETE.md** - 3D model loading architecture
- **TEXTURE_SYSTEM.md** - Polyhaven texture pipeline

These docs contain specific line numbers, before/after code examples, and troubleshooting steps for common issues.
