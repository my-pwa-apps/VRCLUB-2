# Avatar Assets

The crowd loader in `js/club/11-audio-crowd.js` explicitly loads the GLBs in this
directory into Babylon `AssetContainer`s. Each dancer gets an independent skeleton and
animation group while clones share source geometry, materials, and textures.

## Current Sources

The dancers and DJ combine faces from the CC0 Quaternius Universal Base Characters,
complete Peasant garment meshes from Modular Character Outfits - Fantasy, rigged
hairstyles, and clips from the Universal Animation Library Standard packs. Exact
provenance and archive hashes are recorded in `ASSETS.md`.

| File | Role | Appearance | Clips | Size |
|------|------|------------|-------|------|
| `club-dancer-female.glb` | Crowd | Peasant outfit, buns, modeled face/eyes | `Dance_Loop` | ~1.5 MB |
| `club-dancer-male.glb` | Crowd | Peasant outfit, parted hair, modeled face/eyes | `Dance_Loop` | ~1.4 MB |
| `club-dj.glb` | DJ booth | Peasant outfit, buzzed hair, modeled face/eyes | `Idle_Loop` | ~1.4 MB |
| `club-guest-female.glb` | Dance floor and side-wall guests | Ranger jacket and boots (no hood, no pauldron), long hair | `Dance_Loop`, `Idle_Talking_Loop`, `Idle_Loop`, `Yes`, `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop` | ~2.9 MB |
| `club-guest-male.glb` | Dance floor and side-wall guests | As above, parted hair and beard | as above | ~2.7 MB |

The guest files carry several clips. `_spawnAvatar(..., { clip })` keeps the one a slot asks for and
disposes the rest, so a guest evaluates one animation like everyone else; with no `clip` a multi-clip
file plays `Dance_Loop`. `_guestSlots()` in `11-audio-crowd.js` lists who stands where and does what, and a
unit test checks that every slot's clip exists in its file.

## Rebuilding

Build a character by combining a base glTF with clips from the compatible Quaternius libraries.
`<clip>` may list several clips of the first library, and `--clips-from=<file.glb>:<clip,clip>` adds
clips from another one (both libraries share the same rig). `--exclude=<regex>` drops accessory parts
by node name:

```powershell
node scripts/build-avatar-glb.mjs <base.gltf> <animations.glb> <clip[,clip]> <output.glb> --head-only --exclude='Hood|Pauldron' --clips-from=<animations2.glb>:<clip,clip> <outfit.gltf> <hair.gltf>
```

Optional accessories must be skinned glTFs with the same ordered joint list as the
base character. The current builds use the Quaternius `Rigged to Head Bone`
hairstyles so hair follows the existing animation without another runtime skeleton.
`--head-only` removes the underwear-clad body while retaining its modeled head, eyes,
and eyebrows; the complete outfit supplies arms, torso, legs, and feet without hidden
overlapping geometry.

Then run `npm run optimize:avatars -- <file.glb> ...` (no arguments rebuilds every GLB here, including
the Mixamo ones). It recompresses textures as 512 px WebP, drops redundant animation keyframes, merges
duplicate materials and textures, and merges skinned primitives that share a skin and a material into
one mesh, which takes a character from about a dozen draw calls to six. A contract test fails if a
Quaternius `club-*.glb` has more than six primitives.
Do not apply glTF Transform's `join`, `flatten` or quantization to these modular characters: `join` skips
skinned meshes, and the flatten/quantization path duplicates the shared skin per mesh. Do not add
decoder-based compression without also adding and validating the corresponding Babylon runtime decoder.
Every shipped GLB must be listed in `ASSETS.md`. Keep character textures at 512 px for
Quest, force imported materials opaque through `_prepareAvatarMaterials()`, and validate
orientation from rendered geometry rather than trusting the root transform alone.
