# PA Speaker Texture Fix (2025-11-30)

## Issue
The PA speakers were not displaying textures correctly (likely appearing black or with incorrect mapping).

## Root Cause
The textures were being loaded with `invertY = true` (default for Babylon.js/WebGL), but the GLTF model expects `invertY = false` (standard for GLTF UVs). This caused the textures to be flipped vertically relative to the UV coordinates, resulting in incorrect mapping.

## The Fix
Modified `js/modelLoader.js` in the `applyPASpeakerTextures` method to explicitly set `invertY` to `false` for all texture loads (Albedo, Normal, Metallic, Roughness, AO).

```javascript
// CRITICAL: invertY=false for GLTF models (UVs match GLTF standard)
const albedoTexture = new BABYLON.Texture(albedoPath, this.scene, false, false, ...);
```

This ensures the textures align correctly with the model's UV mapping.
