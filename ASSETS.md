# Third-party assets

Every binary shipped in this repository, with its licence and provenance.

The MIT licence in `LICENSE` covers the **source code only**. The assets below
are third-party works under their own terms, and several carry attribution
obligations that must be satisfied in the running product (see `#modelCredits`
in `index.html`).

> **Maintenance rule:** every `.glb` under `js/models/` and every texture set
> under `textures/` must appear in this file. If you add an asset without a
> recorded licence, do not ship it.

---

## 3D models

| File | Title | Creator | Licence | Attribution shown in-app |
|------|-------|---------|---------|--------------------------|
| `js/models/djgear/source/pioneer_DJ_console.glb` | Pioneer DJ Console | TwoPixels.studio (<https://sketchfab.com/twopixels.studio>) | CC BY 4.0 | Yes |
| `js/models/paspeakers/source/stage_speaker___black.glb` | Stage Speaker — Black | *unrecorded — see gap below* | CC BY 4.0 | Partial |

### Textures bundled with the models

| Directory | Belongs to | Licence |
|-----------|-----------|---------|
| `js/models/djgear/textures/` | *removed — an unreferenced duplicate of the console textures (12.7 MB); the console's textures are embedded in its GLB* | — |
| `js/models/paspeakers/source/textures/` | Stage Speaker — Black (the GLB itself carries no textures; the app applies these) | CC BY 4.0 (same as the model) |

### Derived files

Both models are **optimised derivatives** of the originals, produced by
`npm run optimize:models` (`scripts/optimize-models.mjs`, idempotent; `npm test` fails if a
model drifts back above its budget). The console's embedded textures are resized from 4096 px
to 2048 px WebP (normal and emissive maps lossless); the speaker GLB's embedded textures are
stripped because the app replaces them with the external set above, which is also resized.
Geometry, materials and licences are unchanged.

## Character models and animations

| File | Origin | Licence |
|------|--------|---------|
| `js/models/avatars/club-dancer-female.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy + Universal Animation Library (`Dance_Loop`) | CC0 1.0 |
| `js/models/avatars/club-dancer-male.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy + Universal Animation Library (`Dance_Loop`) | CC0 1.0 |
| `js/models/avatars/club-dj.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy + Universal Animation Library (`Idle_Loop`) | CC0 1.0 |
| `js/models/avatars/club-guest-female.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy (Ranger outfit without its hood and pauldron) + Universal Animation Library (`Dance_Loop`, `Idle_Talking_Loop`, `Idle_Loop`) + Universal Animation Library 2 (`Yes`, `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop`) | CC0 1.0 |
| `js/models/avatars/club-guest-male.glb` | As `club-guest-female.glb`, male | CC0 1.0 |
| `js/models/avatars/Hip Hop Dancing.glb` | Adobe Mixamo character and hip-hop animation | Mixamo terms of use |
| `js/models/avatars/house.glb` | Adobe Mixamo character and house-dance animation | Mixamo terms of use |
| `js/models/avatars/rumba_dancing_female_character.glb` | Adobe Mixamo character and rumba animation | Mixamo terms of use |

Official sources: <https://quaternius.itch.io/universal-base-characters>,
<https://quaternius.itch.io/universal-animation-library>,
<https://quaternius.itch.io/universal-animation-library-2> and
<https://quaternius.itch.io/modular-character-outfits-fantasy>. The Standard archives
used to build these files have SHA-256 hashes
`FDBF1804C90DFC1EA03E992BFF7DA2DFD1A79318E13270A660180F9308455F40` and
`CC73FC4E495B82958207316596317A3F40B9FA38065BDE1027937452DA537724` for the base
characters and animations, `4008EA208A604773A2B2177D965F0F5D3195498B5BF838C3F5785D68E95F2A68`
for Animation Library 2, and
`C3468B18871CC8C8F05AB14DF7712BAF22CB9F389CBD870BABF130E595187F70` for the outfits.
The checked-in GLBs were combined with `scripts/build-avatar-glb.mjs` and then run through
`scripts/optimize-avatars.mjs`: 512 px WebP textures, redundant animation keyframes dropped,
and skinned parts that share a skin and a material merged into one mesh (about six draw calls
per character instead of a dozen). The skin, joints, weights and clips are unchanged.

The three Mixamo-derived GLBs are retained to provide distinct authored dance motion.
They are not covered by this repository's MIT licence. Adobe permits Mixamo characters
and animations in projects under its published terms, but redistribution of editable or
extractable raw character files may be restricted. Confirm that shipping these GLBs is
compatible with the intended distribution before a public release.

## Environment / surface textures

| Path | Origin | Licence |
|------|--------|---------|
| `textures/factoryFloor/` | Poly Haven — [Concrete Floor Damaged 01](https://polyhaven.com/a/concrete_floor_damaged_01) by Rob Tuytel (1K JPG: diff, nor_dx, and an `orm.jpg` packed from rough and ao by `scripts/pack-orm.mjs`) | CC0 1.0 (public domain) |
| `textures/walls/`, `textures/ceiling/` | Poly Haven | CC0 1.0 (public domain) |
| `textures/environment/empty_warehouse_01_256.env` | Poly Haven — [Empty Warehouse 01](https://polyhaven.com/a/empty_warehouse_01) HDRI by Sergej Majboroda, prefiltered (see below) | CC0 1.0 (public domain) |

The reflection environment is a derivative: the 1k `.hdr` (MD5 `ab2931b0191b050b97b1e08ab67b0fb0`, from <https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/empty_warehouse_01_1k.hdr>) loaded as a Babylon `HDRCubeTexture` at 256 px and written with `BABYLON.EnvironmentTextureTools.CreateEnvTextureAsync` as WebP (152 KB). Replace it by the same route; the file name carries the resolution because the service worker and browsers cache by URL.

## Runtime libraries

| Path | Version | Licence |
|------|---------|---------|
| `js/vendor/babylon.js` | Babylon.js 9.28.0 | Apache-2.0 |
| `js/vendor/babylonjs.loaders.min.js` | Babylon.js 9.28.0 | Apache-2.0 |
| `js/vendor/babylonjs.proceduralTextures.min.js` | Babylon.js 9.28.0 | Apache-2.0 |

Provenance URLs and SHA-384 integrity hashes for all four are recorded in
`scripts/vendor.manifest.json` and re-verified by `npm run check:sri`.

---

## Known gaps

These are tracked in `BACKLOG.md` and must be closed before any public release:

1. **Stage Speaker — Black**: the creator name and the source URL were never
   recorded. CC BY 4.0 §3(a)(1) requires identifying the creator, the title, a
   link to the material and a link to the licence. Until the original download is
   located, this asset is **not** compliantly attributed.
