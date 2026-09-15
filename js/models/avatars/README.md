# Avatar Assets

The crowd loader in `js/club/11-audio-crowd.js` explicitly loads the GLBs in this
directory into Babylon `AssetContainer`s. Each dancer gets an independent skeleton and
animation group while clones share source geometry, materials, and textures.

## Current Sources

The dancers and DJ combine faces from the CC0 Quaternius Universal Base Characters,
complete Peasant garment meshes from Modular Character Outfits - Fantasy, rigged
hairstyles, and clips from the Universal Animation Library Standard packs. Exact
provenance and archive hashes are recorded in `ASSETS.md`.

| File | Role | Appearance | Clip | Size target |
|------|------|------------|------|-------------|
| `club-dancer-female.glb` | Crowd | Peasant outfit, buns, modeled face/eyes | `Dance_Loop` | Under 2.5 MB |
| `club-dancer-male.glb` | Crowd | Peasant outfit, parted hair, modeled face/eyes | `Dance_Loop` | Under 2.5 MB |
| `club-dj.glb` | DJ booth | Peasant outfit, buzzed hair, modeled face/eyes | `Idle_Loop` | Under 2.5 MB |

## Rebuilding

Build a character by combining a base glTF with one animation from the compatible
Quaternius library:

```powershell
node scripts/build-avatar-glb.mjs <base.gltf> <animations.glb> <clip> <output.glb> --head-only <outfit.gltf> <hair.gltf>
```

Optional accessories must be skinned glTFs with the same ordered joint list as the
base character. The current builds use the Quaternius `Rigged to Head Bone`
hairstyles so hair follows the existing animation without another runtime skeleton.
`--head-only` removes the underwear-clad body while retaining its modeled head, eyes,
and eyebrows; the complete outfit supplies arms, torso, legs, and feet without hidden
overlapping geometry.

Then run `npm run optimize:avatars` to recompress textures as WebP with a 512 px cap.
Do not apply generic geometry optimization to these modular characters: glTF Transform's
quantization/flattening path duplicates the shared skin per mesh. Do not add decoder-based
compression without also adding and validating the corresponding Babylon runtime decoder.

Every shipped GLB must be listed in `ASSETS.md`. Keep character textures at 512 px for
Quest, force imported materials opaque through `_prepareAvatarMaterials()`, and validate
orientation from rendered geometry rather than trusting the root transform alone.
