# PA Speaker Texture Fix - 2025-11-30

## Issue
PA speakers were not displaying the correct textures. The system was configured to use a procedural black material instead of loading external textures. Additionally, the texture file extensions and mapping logic were incorrect for the provided assets.

## Changes Implemented

### 1. Updated Model Configuration
Modified `getModelConfigs` in `js/modelLoader.js` for `pa_speaker_left` and `pa_speaker_right`:
- Disabled `makeBlack: true` (was overriding textures with black material).
- Enabled `applyExternalTextures: true`.
- Set `textureBasePath` to `./js/models/paspeakers/source/textures/`.

### 2. Updated Texture Mapping Logic
Refactored `applyPASpeakerTextures` in `js/modelLoader.js`:
- **Unified Texture Mapping**: Now applies the provided `small_speaker_1_1001_*` textures to ALL parts of the speaker mesh (since only one texture set was provided).
- **Corrected File Extensions**: Changed `.jpeg` to `.jpg` to match the actual files on disk.
- **Separate Metallic/Roughness**: Updated logic to load separate metallic and roughness textures instead of expecting a combined packed texture.

## Texture Files Used
- `small_speaker_1_1001_albedo.jpg` (Base Color)
- `small_speaker_1_1001_normal.png` (Normal Map)
- `small_speaker_1_1001_metallic.jpg` (Metallic)
- `small_speaker_1_1001_roughness.jpg` (Roughness)
- `small_speaker_1_1001_AO.jpg` (Ambient Occlusion)

## Verification
- Reload the application.
- Inspect the PA speakers (hanging from the ceiling).
- Verify they now have detailed textures (scratches, surface details) instead of a flat black color.
