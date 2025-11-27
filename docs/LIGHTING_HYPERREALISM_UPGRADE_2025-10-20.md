# Lighting Hyperrealism Upgrade (2025-10-20)

## Overview
This update brings the lighting system to a "State of the Art" modern club standard, focusing on hyperrealism, immersiveness, and performance.

## Key Features

### 1. Volumetric Smoke & Gobos (Spotlights)
- **Old System:** Static gradient textures for beams and 3-layer disc system for floor pools.
- **New System:** 
  - **Beams:** `NoiseProceduralTexture` applied to emissive channel, animated in real-time to simulate smoke drifting through the light.
  - **Gobos:** Single-layer floor pool with a high-contrast noise texture that rotates, simulating a rotating gobo wheel.
  - **Performance:** Reduced draw calls by removing 2 extra floor discs per light (12 fewer meshes).

### 2. High-Precision Lasers
- **Old System:** 4cm thick beams, standard glow.
- **New System:**
  - **Core:** Ultra-thin **8mm** beams (0.008 diameter) with extreme emissive intensity (8.0).
  - **Glow:** Wider halo with `NoiseProceduralTexture` to match the spotlight smoke effect.
  - **Result:** Lasers look like they are cutting through atmosphere rather than being solid cylinders.

### 3. Audience Blinders
- **New Fixture:** Added 4 "Blinder" units to the front truss facing the crowd.
- **Effect:** Warm white (2800K) high-intensity flashes during "Drop" and "Peak" phases.
- **Visuals:** Includes lens flare billboards that scale with intensity.

## Technical Implementation

### `createLights()`
- Replaced `DynamicTexture` gradient with `NoiseProceduralTexture`.
- Replaced `lightPoolCore/Glow` with single `lightPool` using rotating noise texture.

### `createLaserBeam()`
- Reduced cylinder diameter to `0.008`.
- Added `NoiseProceduralTexture` to `beamGlowMat`.

### `createBlinders()`
- New function generating 4 box fixtures with flare planes.

### `updateLighting()`
- Added animation logic:
  ```javascript
  spot.beamMat.emissiveTexture.vOffset -= 0.01; // Smoke rise
  spot.lightPool.rotation.z += 0.005; // Gobo rotation
  ```
- Added blinder flash logic synced to `lightingPhase`.

## Performance Impact
- **Positive:** Reduced transparent mesh count (floor pools).
- **Neutral:** Procedural textures are generated on GPU, minimal CPU overhead.
- **Visual:** Massive increase in perceived fidelity.
