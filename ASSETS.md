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
| `js/models/djgear/textures/` | Pioneer DJ Console | CC BY 4.0 (same as the model) |
| `js/models/paspeakers/source/textures/` | Stage Speaker — Black | CC BY 4.0 (same as the model) |

## Character animations

| File | Origin | Licence |
|------|--------|---------|
| `js/models/avatars/Hip Hop Dancing.glb` | Adobe Mixamo | Mixamo terms of use |
| `js/models/avatars/rumba_dancing_female_character.glb` | Adobe Mixamo | Mixamo terms of use |
| `js/models/avatars/house.glb` | Adobe Mixamo | Mixamo terms of use |

## Environment / surface textures

| Path | Origin | Licence |
|------|--------|---------|
| `textures/floor/`, `textures/walls/`, `textures/ceiling/` | Poly Haven | CC0 1.0 (public domain) |

## Runtime libraries

| Path | Version | Licence |
|------|---------|---------|
| `js/vendor/babylon.js` | Babylon.js 8.30.5 | Apache-2.0 |
| `js/vendor/babylonjs.loaders.min.js` | Babylon.js 8.30.5 | Apache-2.0 |
| `js/vendor/babylonjs.proceduralTextures.min.js` | Babylon.js 8.30.5 | Apache-2.0 |
| `js/vendor/environmentSpecular.env` | Babylon.js sample environment | Apache-2.0 |

Provenance URLs and SHA-384 integrity hashes for all four are recorded in
`scripts/vendor.manifest.json` and re-verified by `npm run check:sri`.

---

## Known gaps

These are tracked in `BACKLOG.md` and must be closed before any public release:

1. **Stage Speaker — Black**: the creator name and the source URL were never
   recorded. CC BY 4.0 §3(a)(1) requires identifying the creator, the title, a
   link to the material and a link to the licence. Until the original download is
   located, this asset is **not** compliantly attributed.
2. **Mixamo animations**: Adobe's terms permit use of Mixamo assets in a project,
   but redistributing the raw `.glb` files inside a public MIT-licensed
   repository is a different act. Either confirm this is permitted, replace them
   with CC0/CC BY equivalents, or move them out of version control and fetch them
   at build time.
