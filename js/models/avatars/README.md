# Avatar Assets

The crowd loader in `js/club/11-audio-crowd.js` explicitly loads the GLBs in this
directory into Babylon `AssetContainer`s. Each dancer gets an independent skeleton and
animation group while clones share source geometry, materials, and textures.

## Current Sources

The crowd people (`club-crowd-*`) come from the CC0 Quaternius Modular Women and Modular Men packs (see below); the
player's body, the bartender and the DJs combine faces from the CC0 Quaternius Universal Base Characters,
complete Peasant garment meshes from Modular Character Outfits - Fantasy, rigged
hairstyles, and clips from the Universal Animation Library Standard packs. Exact
provenance and archive hashes are recorded in `ASSETS.md`.

| File | Role | Appearance | Clips | Size |
|------|------|------------|-------|------|
| `club-dancer-female.glb` | The player's own body (AvatarRig) | Peasant outfit, buns, modeled face/eyes | `Dance_Loop` | ~1.5 MB |
| `club-dancer-male.glb` | The player's own body (AvatarRig) | Peasant outfit, parted hair, modeled face/eyes | `Dance_Loop` | ~1.4 MB |
| `club-dj-hernan.glb` | DJ booth while Hernan Cattaneo's podcast is chosen | Jacket (tinted dark grey at load), short parted cap plus shoulder-length `Hair_Long` (tinted dark brown), no beard, headphones, modeled face/eyes | `Idle_Loop` | ~2.7 MB |
| `club-dj-melera.glb` | DJ booth while Miss Melera's podcast is chosen | Jacket (tinted grey at load), long straight hair (tinted light blond), headphones, modeled face/eyes | `Idle_Loop` | ~2.8 MB |
| `club-guest-female.glb` | The bartender (black outfit through a tint); build source | Ranger jacket and boots (no hood, no pauldron), long hair | `Dance_Loop`, `Idle_Talking_Loop`, `Idle_Loop`, `Yes`, `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop` | ~2.9 MB |
| `club-guest-male.glb` | Build source only (the DJ and crowd builds); not loaded at runtime | As above, parted hair and beard | as above | ~2.7 MB |
| `club-crowd-f1..f8.glb`, `club-crowd-m1..m9.glb` | The dance floor and the side-wall guests: 17 different people | Quaternius Modular Women / Men, recoloured: every skin tone, black, brown, auburn, blond and silver hair, casual, punk, formal and suit outfits | `Dance_Loop`; the six guests (f6-f8, m4, m6, m8) also carry the idle clips | ~1.0 MB each |

The crowd people are one skinned mesh and one material each, coloured per vertex; see the next section. The three
Mixamo files in this folder (`Hip Hop Dancing.glb`, `house.glb`, `rumba_dancing_female_character.glb`) are the
other dance floor characters, kept for their distinct choreography.

A multi-clip file carries several clips. `_spawnAvatar(..., { clip })` keeps the one a slot asks for and
disposes the rest, so a guest evaluates one animation like everyone else; with no `clip` a multi-clip
file plays `Dance_Loop`. `_guestSlots()` in `11-audio-crowd.js` lists who stands where and does what, and a
unit test checks that every slot's clip exists in its file.

## The crowd people (`club-crowd-*.glb`)

`node scripts/build-crowd-glbs.mjs --women "<Modular Women glTF dir>" --men "<Modular Men glTF dir>" --optimize`
rebuilds all of them (`--only f1,m3` for some). Their rig is not the UE mannequin the clips were authored on (a `Body`
bone carries the height and the legs hang from it, the feet are free-standing IK bones, the arms hang by the sides), so
the script retargets `Dance_Loop` and the idle clips from `club-guest-female.glb` / `club-guest-male.glb`: trunk bones take
the source's world rotation delta from its bind pose; arms and legs are aimed along the source's world bone directions.
Who is in the cast, their skin tone, hair and clothes colours, and which of them carry the guest clips are the `CAST`
table at the top of the script. Props (pistols, hats, crowns) are dropped and every material is baked into vertex colour.
The pack's native `Idle`, `Walk`, `Run` and `Wave` clips are kept (other players in a multiplayer room walk and wave with
them; `AvatarManager` plays them by name), and `Yes` is retargeted to every person, so a nod works for any avatar.
Punch and the other clips are not shipped. `test/rig.test.mjs` measures the dancing on the real skeleton.
The characters load per quality tier (`AVATAR_SOURCES` and `_requiredCrowdSources` in `11-audio-crowd.js`).

The two DJs are derived from the guest files (the outfit and animation packs the first builds used are not needed):
`node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>"` keeps one clip, cuts the beard out
of Hernan's hair mesh and adds `Hair_Long` shortened to shoulder length, with its front trimmed away, over his short cap (sharing the hair material so
the optimiser can merge it), then adds the CC0 headphones (`--headphones "<unzipped Headphones dir>"`, see ASSETS.md: a
mesh skinned to the Head joint, which makes the DJs seven draws where everyone else is six), and writes `club-dj-hernan.glb` and `club-dj-melera.glb`;
then run `npm run optimize:avatars -- club-dj-hernan.glb club-dj-melera.glb`. Which one stands at the decks follows the
chosen podcast (`DJ_LOOKS` and `setDJ()` in `js/club/11-audio-crowd.js`, which also hold their hair and top tints).

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
