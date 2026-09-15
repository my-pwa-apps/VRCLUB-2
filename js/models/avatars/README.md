# Avatar Assets

The crowd loader in `js/club/11-audio-crowd.js` explicitly loads the GLBs in this
directory into Babylon `AssetContainer`s. Each dancer gets an independent skeleton and
animation group while clones share source geometry, materials, and textures.

## Current Sources

The dancers and DJ use the CC0 Quaternius Universal Base Characters and Universal
Animation Library Standard packs. Exact provenance and archive hashes are recorded in
`ASSETS.md`.

| File | Role | Clip | Size target |
|------|------|------|-------------|
| `club-dancer-female.glb` | Crowd | `Dance_Loop` | Under 1 MB |
| `club-dancer-male.glb` | Crowd | `Dance_Loop` | Under 1 MB |
| `club-dj.glb` | DJ booth | `Idle_Loop` | Under 1 MB |

## Rebuilding

Build a character by combining a base glTF with one animation from the compatible
Quaternius library:

```powershell
node scripts/build-avatar-glb.mjs <base.gltf> <animations.glb> <clip> <output.glb>
```

Then run `gltf-transform optimize` with quantization, WebP texture compression, a
512 px texture cap, and simplification disabled. Do not add decoder-based compression
without also adding and validating the corresponding Babylon runtime decoder.

Every shipped GLB must be listed in `ASSETS.md`. Keep character textures at 512 px for
Quest, force imported materials opaque through `_prepareAvatarMaterials()`, and validate
orientation from rendered geometry rather than trusting the root transform alone.
