# PA Speaker Transparency Fix (2025-11-30)

## Issue
The PA speakers appeared semi-transparent or "ghostly" in the application, despite textures being loaded.

## Root Cause
1. **Invalid Transparency Mode**: The `loadModel` function was setting `mesh.material.transparencyMode = null` in an attempt to disable transparency. For PBR materials, this property expects a specific integer enum (0 = OPAQUE). Setting it to `null` likely caused Babylon.js to revert to a default behavior that enabled alpha blending based on texture channels or other factors.
2. **Material Defaults**: The PBR material was initialized with `metallic = 1.0` and `roughness = 1.0`. If textures failed to load or were interpreted incorrectly, this resulted in a material that could look like a perfect mirror or dark metal, which combined with transparency issues created the "ghostly" look.

## The Fix
1. **Correct Transparency Mode**: Updated `js/modelLoader.js` to explicitly set `transparencyMode = 0` (BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE) instead of `null`.
2. **Forced Opacity**: Added `forceDepthWrite = true` and `separateCullingPass = false` to the material configuration to ensure the geometry is treated as solid opaque objects by the renderer.
3. **Sensible Defaults**: Changed default `metallic` to 0.1 and `roughness` to 0.7. This ensures that even if textures fail to load, the speaker will look like a solid matte object (plastic/wood) rather than a weird metallic ghost.

## Verification
The speakers should now appear as solid, opaque objects. If textures load, they will be visible. If textures fail, the speaker will be a solid color (white or magenta if the previous debug fallback triggers) but NOT transparent.
