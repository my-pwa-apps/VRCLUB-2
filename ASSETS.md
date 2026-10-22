# Third-party assets

Every binary shipped in this repository, with its licence and provenance.

## Quest distribution profile

The `Quest` branch builds a user-music-first candidate. No podcast catalogue is loaded,
no podcast relay is contacted, and the only recording bundled is the club's own generated
house set (`audio/nocturne-house.mp3`, below). The male/female DJs
are fictional CC0 characters, selected locally, not named artists or endorsements.
The three historical Mixamo GLBs remain in the source repository but are not referenced,
loaded or copied to `dist/`. Their former slot ids now use CC0 crowd models.
`js/podcasts.js` and the optional Worker's historical podcast utility are also not part
of the Quest web build. Do not distribute the source tree as the Quest product.

The production build includes this register, the app MIT `LICENSE`, and `licenses/`
(Babylon's exact upstream Apache 2.0 licence, CC BY 4.0, CC0, and third-party notices).
The Credits & licences disclosure is reachable from VR COMFORT → CREDITS / LICENCES,
which returns to the setup panel. Keep these credits and licences in every package.
An app purchase does not revoke recipients' CC BY rights over the attributed assets.

The MIT licence in `LICENSE` covers the **source code only**. The assets below
are third-party works under their own terms, and several carry attribution
obligations that must be satisfied in the running product (see `#modelCredits`
in `index.html`).

> **Maintenance rule:** every `.glb` under `js/models/` and every texture set
> under `textures/` must appear in this file. If you add an asset without a
> recorded licence, do not ship it.

---

## ADE pitch-only brandpack (not default distribution)

The owner supplied the [ADE26 30Y BRANDPACK](https://drive.google.com/drive/folders/1_kLgnuYqK_YJOsKUDLJXJxj7qXJWUDlZ)
on 18 October 2026 for this independent pitch. ADE names and campaign artwork retain
their owners' rights; **no general redistribution licence or usage guidance was
found in the inspected folders**. These are not MIT/CC0 assets. Written permission
and brand guidance are required before public deployment or distribution.

| Source retained under `design/ade-brandpack/` | Pitch derivative under `concept-assets/ade/` | Treatment |
|---|---|---|
| `ade26-30y-black.svg` (Logo / ADE26 30Y BLACK.svg) | `ade26-30y-black.png` | Proportional 512 px rasterisation, transparency retained |
| `ade26-keyvisual-black-landscape.png` (Key Visuals / ADE_2026_KeyVisual_Black_V2_Landscape.png) | `ade26-keyvisual-black-landscape.webp` | 2560x1440 to 1024x576, no crop or recolour |

`npm run ade:assets` verifies the original SHA-256 hashes and rebuilds those two
derivatives. Source files never enter `dist/`. Default builds exclude
`concept-assets/`; explicit ADE builds include only the logo. The black XXX campaign
image was removed from the environment and is not copied to `dist/`.
The owner requested a public non-indexed pitch at `nocturne-ade.mitwee.nl`;
`npm run build:ade-site` prepares that separate site. This request does not establish
an ADE endorsement or grant a general redistribution licence.
No brandpack fonts, animated idents or artist footage are included.
The concept panel and [ADE brandpack notice](licenses/ade-brandpack-notice.txt)
state the source and independent status.

## 3D models

### Creator-authored avatar eyewear

The round, square and sunglasses choices use Sagerfrog's Glasses 01, 02 and 03,
adapted for MakeHuman by spamrakuen from the official
[MakeHuman Community glasses01 pack](https://static.makehumancommunity.org/assets/assetpacks/glasses01.html).
The selected `.mhclo`, `.mhmat` and `.obj` source files each declare CC0; the pack
manifest is retained beside them in `design/characters/accessories/`.
`npm run build:avatar-accessories` validates those notices, samples the original
diffuse maps into vertex colours and rebuilds `js/avatarAccessoryAssets.js`.
At runtime the meshes are fitted to the measured eye landmarks and merged with
the avatar's existing head-skinned adornment mesh; they add no draw call, texture
or material. Novelty glasses and beard/stubble remain original procedural
designs; no moustache geometry is generated or offered. The facial-hair pack
was not used because its pack-level CC0 metadata
conflicts with AGPL3 notices in its individual OBJ files. The queue caller's
phone also remains procedural; no verified authored phone source was found.

### Optional detailed adult cast (ADE)

The following 34 fictional adults are generated from MakeHuman/MPFB's **CC0
base assets**, verified CC0 clothing, hair and shoes, plus punkduck's explicitly
licensed **CC BY 4.0** High Neck Crop Top on Asha. Sources:
[MPFB](https://github.com/makehumancommunity/mpfb2),
[system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
[dress01](https://static.makehumancommunity.org/assets/assetpacks/dress01.html).
The per-person selected assets, authors, URLs and recipes are in
`design/characters/recipes.json`; exact pack hashes and upstream tool revision
are in `design/characters/provenance.json`. MPFB software is GPL-3.0-or-later;
the base assets are **CC0-1.0**, not GPL source code. Asha's dressed character
and wardrobe additionally contain the attributed **CC BY 4.0** garment below;
do not redistribute that derivative as CC0-only.
Faces retain their source-neutral expressions in both base and wardrobe models.
No smiles are painted, procedurally shaped or baked from generic face-shape sliders.
Expression changes must use verified official expression options supplied for that
avatar; none are currently integrated. Recipes and shipped model metadata record
`source-neutral` with no expression targets. The lightweight cast keeps its authored faces.
Regenerate with Blender 5.2 using `scripts/characters/generate.py`,
`VRCLUB_CHARACTER_TOOLS` pointing at the existing MPFB/assets tooling directory,
and a separate `BLENDER_USER_RESOURCES` profile. Repeat with `AVATAR_WARDROBE=1`
for fitted personal parts, then run `npm run build:characters` and
`npm run build:wardrobe`. `AVATAR_ONLY` accepts comma-separated cast IDs for a
targeted source regeneration; the production builders always rebuild their full catalogs.

Changes: adult body/face recipes, fitted clothing and hair, hidden-body removal,
decimation below 10,000 triangles, 1024 px body/512 px hair WebP atlases,
53-joint skinning, and offline world-space retargeting of the club's existing
CC0 Quaternius dances, locomotion, gestures, seating and social clips. Hand
contacts are fitted to anatomy and role props; knee planes follow each person's
own anatomy. Non-skin metacarpal helpers support the existing tracked-arm driver.
Standing idles preserve the source's measured hip-to-neck direction rather than
amplifying its short upper-spine segment on a differently proportioned body;
bar, rail, dance and work poses retain their intentional bends. Regenerate both
the detailed cast and personal wardrobe after changing `scripts/characters/retarget.mjs`.
Measured eye landmarks place the self body. Both DJs reuse
[Headphones by nisu](https://opengameart.org/content/headphones), CC0, fitted to
each head and skinned to its Head joint (3,324 extra triangles).
The procedural cue hand contacts the measured cup shell in the moving Head
frame, with its own palm length, on both detailed and lightweight DJs.
No proprietary scans, branded outfits or externally hosted avatar service.

The detailed night-out wardrobe combines cropped tops and trousers, fitted
shirts, tailored layers, halter silhouettes and the CC0 cut-out dress
([MargaretToigo](http://www.makehumancommunity.org/node/1704)) and midi halter
([MargaretToigo](http://www.makehumancommunity.org/node/1854)).
Residents sharing a clothing mesh use distinct baked palettes: Luca wears an
ivory long-sleeve top, Noah teal, and Felix an olive button shirt. Jonas wears
indigo, Mara a rose halter dress and Ari silver-grey.
These colours are baked into clothing atlas cells, never into skin or runtime
material clones. `test/wardrobe.test.mjs` samples the shipped torso textures.
Stock MakeHuman graphics on `male_casualsuit02`, `04` and `06` are removed
from their verified shirt UV region before either atlas is baked. The club
adds at most one original print, and only to catalogued plain print surfaces;
unknown textured garments never receive an overlapping graphic.

#### Curated night-out separates and modern hair

The owner approves both CC0 and CC-BY with verified terms and attribution.
The following source-only packs extend the existing silhouettes without changing
identities, rigs, clips, editor enums or live draw budgets:

| Asset / title | Creator | Licence | Original source |
|---|---|---|---|
| High Neck Crop Top | punkduck | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [node 1088](http://www.makehumancommunity.org/node/1088) |
| Turtleneck Halter Top | MargaretToigo | CC0-1.0 | [node 1642](http://www.makehumancommunity.org/node/1642) |
| Camisole Top | MargaretToigo | CC0-1.0 | [node 1726](http://www.makehumancommunity.org/node/1726) |
| Fisherman Sweater | MargaretToigo | CC0-1.0 | [node 1187](http://www.makehumancommunity.org/node/1187) |
| Keyhole Tank Top | MargaretToigo | CC0-1.0 | [node 1606](http://www.makehumancommunity.org/node/1606) |
| Basic Tucked T-shirt | MargaretToigo | CC0-1.0 | [node 1203](http://www.makehumancommunity.org/node/1203) |
| Male Polo Shirt | namuhekam | CC0-1.0 | [node 2909](http://www.makehumancommunity.org/node/2909) |
| Tiered Mini Skirt | MargaretToigo | CC0-1.0 | [node 1668](http://www.makehumancommunity.org/node/1668) |
| Wool Pants | MargaretToigo | CC0-1.0 | [node 1194](http://www.makehumancommunity.org/node/1194) |
| Cargo Pants | Cortu | CC0-1.0 | [node 2798](http://www.makehumancommunity.org/node/2798) |
| Short Messy Hair | Cortu | CC0-1.0 | [node 2809](http://www.makehumancommunity.org/node/2809) |
| Inverted Bob / with Bangs | MargaretToigo | CC0-1.0 | [node 1673](http://www.makehumancommunity.org/node/1673), [1685](http://www.makehumancommunity.org/node/1685) |
| Curled-under Bob / Blunt Bob with Bangs | MargaretToigo | CC0-1.0 | [node 1677](http://www.makehumancommunity.org/node/1677), [1681](http://www.makehumancommunity.org/node/1681) |

Official packs: [shirts01](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html),
[shirts03](https://static.makehumancommunity.org/assets/assetpacks/shirts03.html),
[skirts01](https://static.makehumancommunity.org/assets/assetpacks/skirts01.html),
[pants01](https://static.makehumancommunity.org/assets/assetpacks/pants01.html),
[hair01](https://static.makehumancommunity.org/assets/assetpacks/hair01.html).
Download hashes and selected asset metadata are pinned in
`design/characters/provenance.json`. The crop top's author-original `.mhclo`
explicitly says `# license CC BY 4.0`; its exact file hash is checked before
generation. Generic pack JSON only says CC-BY, which is not enough to assume
a version. Unversioned CC-BY candidates and an incompatible extended-basemesh
lace blouse were not imported.

Changes: fit to the existing fictional adult bodies; recolour to the room's
graphite, bronze, stone, teal and amber palette; combine tops and bottoms,
union garment-covered skin masks, atlas-bake, simplify, skin and retarget.
Wardrobe top and bottom retain independent colours and the same two garment
draws. Eye landmarks use their actual atlas cell rather than assuming a 2x2
layout. Hair remains alpha-tested with depth writes, never alpha-blended.
Modern short/bob choices reuse the editor's existing slots; existing long hair
and ponytails remain. Two French-braid sources were evaluated but not shipped
after real previews exposed poor scalp coverage at the wardrobe budget.
No face expression, smile, runtime light, texture clone or per-frame updater
is added. Physical-headset appearance and performance remain unmeasured.

Detailed women wear a deterministic mix of sock-free leather loafers,
closed ballet pumps and high-heeled ankle boots. Loafers derive from the
CC0 MakeHuman system `shoes03` footwear with the separate sock and lace
geometry removed. Fitted shoes include a small leather-thickness clearance
to prevent toes poking through independently decimated footwear and skin.
The other choices are fitted derivatives of
[Ballet flats](http://www.makehumancommunity.org/node/1734) and
[Stiletto booties](http://www.makehumancommunity.org/node/1694) by MargaretToigo,
from the verified CC0-only
[MakeHuman shoes01 pack](https://static.makehumancommunity.org/assets/assetpacks/shoes01.html).
Changes: plain leather recolouring, sock removal and a low collar on the loafers,
shape fitting, measured sole-to-floor alignment, skin occlusion, atlas baking
and triangle reduction. Footwear fitting does not change the skeleton or clips.
The pumps are flat ballet pumps, not stilettos; the high-heel option is an
ankle boot. No socks are added to these three options. The lightweight cast
keeps its original authored footwear.
The existing lightweight CC0 cast retains its original geometry and expressions;
these face and silhouette changes belong to the optional detailed cast and wardrobe.

| File | Fictional adult | Role |
|------|------------------|------|
| `js/models/characters/nia.glb` | Nia | Dancer/player |
| `js/models/characters/luca.glb` | Luca | Dancer/player |
| `js/models/characters/robin.glb` | Robin | Dancer |
| `js/models/characters/tao.glb` | Tao | Dancer/player |
| `js/models/characters/sofia.glb` | Sofia | Dancer/player |
| `js/models/characters/asha.glb` | Asha | Dancer/player |
| `js/models/characters/diego.glb` | Diego | Dancer/player |
| `js/models/characters/iris.glb` | Iris | Dancer/player |
| `js/models/characters/eden.glb` | Eden | Dancer |
| `js/models/characters/ren.glb` | Ren | Dancer/player |
| `js/models/characters/felix.glb` | Felix | Dancer/player |
| `js/models/characters/kai.glb` | Kai | Dancer |
| `js/models/characters/jonas.glb` | Jonas | Dancer |
| `js/models/characters/mara.glb` | Mara | Dancer |
| `js/models/characters/ellis.glb` | Ellis | Indoor guest/player |
| `js/models/characters/amara.glb` | Amara | Seated bar guest/player |
| `js/models/characters/malik.glb` | Malik | Mingler/player |
| `js/models/characters/mei.glb` | Mei | Balcony guest/player |
| `js/models/characters/rosa.glb` | Rosa | Indoor guest/player |
| `js/models/characters/samir.glb` | Samir | Indoor guest/player |
| `js/models/characters/luz.glb` | Luz | Indoor guest |
| `js/models/characters/ari.glb` | Ari | Indoor guest |
| `js/models/characters/leila.glb` | Leila | Queue/player |
| `js/models/characters/kwame.glb` | Kwame | Queue |
| `js/models/characters/hana.glb` | Hana | Queue |
| `js/models/characters/owen.glb` | Owen | Queue |
| `js/models/characters/alex.glb` | Alex | Queue |
| `js/models/characters/vera.glb` | Vera | Queue, phone |
| `js/models/characters/noah.glb` | Noah | Queue |
| `js/models/characters/river.glb` | River | Queue |
| `js/models/characters/sana.glb` | Sana | Bartender |
| `js/models/characters/idris.glb` | Idris | Bouncer/player |
| `js/models/characters/jin.glb` | Jin | Male DJ |
| `js/models/characters/zara.glb` | Zara | Female DJ |

Generic stool and low-seat clips use reachable, relaxed hand targets close to the
lap with bent elbows, rather than straight arms reaching for an assumed counter.
The low-seat pose adds a small forward lean; feet and pelvis retain their authored
seat contacts. The bar regular's separate counter-and-bottle clips are unchanged.
After editing generic seated poses, `node scripts/build-crowd-glbs.mjs --refresh-static --seated-only --optimize`
refreshes only those two clips on the lightweight cast, then `npm run build:characters`
and `npm run build:wardrobe` transfer them to detailed bodies and personal outfits.
The shipped-rig and browser seated-pose tests check elbows and foot stability;
browser screenshots provide front and side inspection views.

The two fictional DJs' current styling takes broad hair, wardrobe and build cues
from reference photographs supplied by the owner: mature, lean, loose dark waves
around the ears and into the nape, and a charcoal crew-neck tee for the male; long side-parted blonde hair and a
charcoal tee for the female. They remain Jin and Zara, not representations of
Hernan Cattaneo or Miss Melera and not an endorsement. The photographs and their
printed clothing artwork are not bundled or copied. Both recipes reuse only the
verified CC0 system assets above, including `long01` hair and a
plain `male_casualsuit06` tee/jeans mesh fitted to each body. Jin uses the mature
male skin and age parameter 0.82; his lower hair panels are re-authored into
13 tapered curved clumps, retaining the parted roots. He remains 1.78 m tall,
with the same 53-bone rig and three draws. `AVATAR_ONLY=jin` limits the offline
generator and `npm run build:characters` to his recipe without rebuilding the
other runtime people. The lightweight male DJ also has longer opaque nape
waves, softened cheek/jaw geometry and subtle age creases; the effect is more
stylized than Jin's. `node scripts/build-dj-glbs.mjs --refine-male` refreshes
those refinements idempotently without the source packs; full regeneration
applies them too. Headphone geometry and bind matrices remain unchanged,
and the lightweight DJ stays at seven draws.
Reference provenance is recorded in `design/characters/provenance.json`.

All table entries are **CC0-1.0**, credited in-app as a courtesy. Quaternius
remains the default; the detailed cast is opt-in and has a personal lightweight
override. Existing room identity IDs and capacities are unchanged.

| File | Title | Creator | Licence | Attribution shown in-app |
|------|-------|---------|---------|--------------------------|
| `js/models/djgear/source/pioneer_DJ_console.glb` | [Pioneer DJ Console](https://sketchfab.com/3d-models/pioneer-dj-console-0ba527fa6b164c34aa050dcecbaa2ffb) | TwoPixels.studio (<https://sketchfab.com/twopixels.studio>) | CC BY 4.0 | Yes, with source and modification notice |
| `js/models/paspeakers/source/stage_speaker___black.glb` | [Stage Speaker — Black](https://sketchfab.com/3d-models/stage-speaker-black-f3209a6a45b844df92560099f982a508) | Sousinho (<https://sketchfab.com/sousinho>) | CC BY 4.0 | Yes, including source and derivative notice |
| `js/models/bassbin/source/bass_bin_3.glb` | [Bass Bin 3 - Subwoofer](https://sketchfab.com/3d-models/bass-bin-3-subwoofer-0f5b16da5e704357aa94fbf632a88455) | darksoundlab (<https://sketchfab.com/darksoundlab>) | CC BY 4.0 | Yes, including source and derivative notice |
| `js/models/barstool/source/bar_stool.glb` | [Metal Stool 03](https://polyhaven.com/a/metal_stool_03) | Flo Tasser, Poly Haven | CC0 1.0 | Credited as courtesy |
| `js/models/lounge/source/old_couch.glb` | [Old Couch](https://sketchfab.com/3d-models/old-couch-8da7e0d122f544e2862b4e592988e183) | Oliver Triplett (<https://sketchfab.com/OliverTriplett>) | CC BY 4.0 | Yes, with source and modification notice |
| `js/models/monitors/source/monitor_speaker.glb` | [Yamaha HS8 Studio Monitor](https://sketchfab.com/3d-models/yamaha-hs8-studio-monitor-d82ed6ea096c40358229fc0c31b0e8e8) | Ivan_WSK (<https://sketchfab.com/ivan-wsk>) | CC BY 4.0 | Yes, with source and modification notice |
| `js/models/restroom/source/toilet.glb` | [Toilet](https://poly.pizza/m/WAu50yGFVt) | Quaternius (<https://quaternius.com>) | CC0 1.0 | Credited as courtesy |
| `js/models/restroom/source/bathroom_sink.glb` | [Bathroom Sink](https://poly.pizza/m/OMCJDgMUui) | Quaternius (<https://quaternius.com>) | CC0 1.0 | Credited as courtesy |
| `js/models/restroom/source/metal_trash_can.glb` | [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) | GurJas Studios, Poly Haven | CC0 1.0 | Credited as courtesy |
| `js/models/restroom/source/wet_floor_sign.glb` | [Wet Floor Sign 01](https://polyhaven.com/a/WetFloorSign_01) | Fran Calvente, Poly Haven | CC0 1.0 | Credited as courtesy |
| `js/models/restroom/source/plunger.glb` | [Plunger](https://polyhaven.com/a/plunger) | James Ray Cock, Poly Haven | CC0 1.0 | Credited as courtesy |
| `js/models/city/downtown.glb` | [Downtown City MegaKit (Standard)](https://quaternius.com), [Car Pack](https://quaternius.com) and [Ultimate House Interior Pack](https://quaternius.com) | Quaternius (<https://quaternius.com>) | CC0 1.0 | Credited as courtesy |

### Modular personal wardrobe

`js/models/wardrobe/` contains fitted derivatives of the same verified CC0
MakeHuman assets and the attributed CC BY 4.0 crop top on Asha listed above. The seventeen files
are `js/models/wardrobe/nia.glb`, `js/models/wardrobe/asha.glb`,
`js/models/wardrobe/sofia.glb`, `js/models/wardrobe/iris.glb`,
`js/models/wardrobe/leila.glb`, `js/models/wardrobe/amara.glb`,
`js/models/wardrobe/mei.glb`, `js/models/wardrobe/rosa.glb`,
`js/models/wardrobe/tao.glb`, `js/models/wardrobe/luca.glb`,
`js/models/wardrobe/diego.glb`, `js/models/wardrobe/ellis.glb`,
`js/models/wardrobe/felix.glb`, `js/models/wardrobe/malik.glb`,
`js/models/wardrobe/ren.glb`, `js/models/wardrobe/samir.glb`
and `js/models/wardrobe/idris.glb`.
Their base recipes and original clothing/hair/shoe sources remain
`design/characters/recipes.json`. Additional fitted choices are system hair
`short03` / `long01` and clothing `male_casualsuit06` / `male_casualsuit01`
(fallbacks `short02`, `ponytail01`, `male_casualsuit04` and
`male_elegantsuit01` keep alternatives distinct from the original),
verified against the existing CC0 pack manifest by the generator.

Changes: bake a separate body surface for each outfit using its authored
skin-occlusion mask (never draw full skin through the trousers or blouse), fit all
choices to each base's shape and common skeleton, decimate skin/hair/outfits,
bake neutral tintable 1024 px skin/outfit and 512 px hair atlases, retain
textured eyes/shoes, split clothing into top/bottom material regions, alpha-test
hair, and retarget the existing CC0 locomotion/gesture/seating clips offline.
Only the selected hair and outfit draw (up to six meshes); per-person material
instances share the original textures without cloning or mutating them.
All bases also include original shoes, loafers, ballet pumps and heeled ankle
boots. Eyes are merged into each shoe option to retain the six-draw ceiling.
Three outfit skin meshes carry four-channel shoe-occlusion masks, not twelve
duplicated bodies. Production packs decoded normalized coverage into bytes.
Selection filters triangles on instance-owned geometry,
never the shared source or another visitor's body.
Optional sheer black/nude tights tint only leg-weighted skin vertices; they
remain opaque, require no texture, mesh or per-frame updater, and default to
bare legs. Original legacy shoes are retained as a separate choice.
Complete v3 appearance descriptors add `shoes` and `legwear`; v1/v2 still
select their original shoes and bare legs. The relay must advertise
`appearanceFootwear` before a v3 look can be shared; unsupported relays preserve
the saved preference and report that sharing requires an update.
The editor has no face/body morphs or proprietary likeness models.

`js/avatarDetails.js` adds original code-authored glasses (round, square,
heart, star and sunglasses), beard/stubble shapes and cap/beanie/fedora/bucket
headwear. Moustaches are not generated or offered: that choice stays unavailable
until an officially avatar-accompanied asset with clear redistribution terms
is verified. Older saved moustache choices normalize to none. This procedural geometry is covered by
the repository's MIT licence; it does not import a model, logo or texture.
One vertex-coloured skinned mesh draws selected accessories together.
Facial hair is fitted to the actual face surface, not a floating face card.
All four hat styles use measured upper-head bounds and a scalp-envelope profile,
not eye-level face width or a fixed-height crown. Brims rest near the brow,
crowns clear the scalp by millimetres and full brims extend only about 2.4 cm.
The real-GLB tests check scalp coverage and size across both casts and all
seventeen personal wardrobe bases.
Accessories follow the head and disappear with the first-person head while
remaining visible in the mirror. Personal wardrobes retain the six-draw
ceiling and shared source textures. Headwear hides the fitted hair.
The same deterministic accessory assignments dress both NPC styles.
Selected shirts and long-sleeve tops also carry original orbit/wave graphics
and hand-authored Japanese 音 (sound) / 光 (light) lettering; personal Casual
outfits receive the same bounded designs. Meanings were checked against
[音](https://jlearn.net/dictionary/%E9%9F%B3) and
[光](https://jlearn.net/dictionary/%E5%85%89). No brand, artist graphic,
font download or faux-language marks are used. The ink is clipped to the
actual garment triangles and retains interpolated torso skin weights,
merged into that same accessory draw: no texture download or per-frame
projection. Only head accessories collapse with the first-person head.
Idris/the bouncer, Ellis and Ren have bald heads; the lightweight bouncer,
m4 and m7 expose their existing scalp by removing connected crown-hair
geometry, retaining eyebrows/side hair, skin, rig and animation. Their vm4/vm5
variants inherit the changed silhouette. Reproduce with
`node scripts/build-crowd-glbs.mjs --refresh-wardrobe --only bouncer,m4,m7 --optimize`
then `node scripts/build-crowd-glbs.mjs --variants --only vm4,vm5 --optimize`.
The queue caller's original generic phone is one opaque, vertex-coloured mesh
fitted to the raised palm and parented to the wrist, with no per-frame updater.
It is created/disposed with that caller in either character style and uses
the existing scoped street lighting. Physical-headset appearance is unmeasured.

Authoring: run `scripts/characters/generate.py` in the same verified MPFB/Blender
environment as the base cast with `AVATAR_WARDROBE=1`; source-only GLBs go to
`design/characters/wardrobe/`. `npm run build:wardrobe` retargets/compresses them
and generates `js/wardrobeCatalog.js` with measured eye landmarks from the
wardrobe itself. These files total 47.9 MiB and are loaded on demand.
Real-Babylon tests enforce all 17 clip sets, selected-part draw counts,
per-person colour isolation, texture sharing and depth/light policies.
Fit under every pose and physical-headset performance are not certified.

### Textures bundled with the models

| Directory | Belongs to | Licence |
|-----------|-----------|---------|
| `js/models/djgear/textures/` | *removed — an unreferenced duplicate of the console textures (12.7 MB); the console's textures are embedded in its GLB* | — |
| `js/models/paspeakers/source/authored/textures/` | Stage Speaker — Black (recovered from its original embedded GLB images; applied externally) | CC BY 4.0 (same as the model) |
| `textures/barWood/` | Poly Haven [Dark Wood](https://polyhaven.com/a/dark_wood) by Rob Tuytel (1K: diffuse, DirectX normal, and the `arm` map used as the packed `orm.jpg`), for the bar counter, back bar and vestibule desks | CC0 1.0 |
| `textures/steelDeck/` | Poly Haven [Metal Plate](https://polyhaven.com/a/metal_plate) by Rob Tuytel (1K, same three maps): mezzanine deck and stair treads | CC0 1.0 |
| `textures/steelPanel/` | Poly Haven [Metal Plate 02](https://polyhaven.com/a/metal_plate_02) by Rob Tuytel (resized to 512 px, same three maps): mezzanine fascia, columns and stringers | CC0 1.0 |

### The bass bins

One *Bass Bin 3 - Subwoofer* (CC BY 4.0, darksoundlab; 20,561 triangles) hangs under each flown PA speaker. It is an **optimised derivative**,
produced by `npm run optimize:models`: its three 1024 px maps become 512 px WebP and its 12 meshes are flattened and joined to 6 (one per
material), so a bin is 6 draws; the source was 4.7 MB and the shipped file is 1.6 MB. Geometry and materials are otherwise unchanged. At run
time the loader sizes it to 1.2 m wide, hangs it from the speaker's measured underside, faces its mouth the way the speaker faces,
and rigs two chains to its lifting eyes (`createBassBinHangingHardware`). Its albedo is darkened to 55% and its emissive floor lowered so
the carpet reads black like the cabinet above it. The model's colours of the folded horn (a red bracing) are as authored.

### The mezzanine

A steel balcony along the left wall (deck 2.7 x 8.6 m at y 3) with a 16-step stair, rails, columns and X-bracing, a high table and
two stools. Textures are the two Poly Haven sets above; the rails use the project's own `steelGirder` preset; the stools are
the bar's *Metal Stool 03* instances (no extra download). Everything else is procedural. `node scripts/build-mezzanine-assets.mjs`
regenerates both texture sets.

### The lounge couch

A worn two-seat sofa stands against the entrance wall, centred between the doorway and the bar-side wall and facing the DJ. It is
*Old Couch* by Oliver Triplett (CC BY 4.0), downloaded from Sketchfab while signed in. It is an **optimised derivative**,
produced by `npm run optimize:models`: its three 1024 px PNG maps become 512 px WebP and its seven parts are joined into one
mesh, so it is one draw, 936 triangles and 0.5 MB (the source was 4.3 MB). Geometry and materials are otherwise unchanged. At
run time the loader sizes it to 2.1 m wide and turns it toward the DJ; the two cushions are the interactive seats.

### The DJ booth monitor speakers and the club restroom

Two nearfield studio monitor speakers stand on the DJ table behind the console, one either side of it (`VenueLayout.monitors`, 0.30 m
tall), facing the DJ and toed in toward the middle of the booth. A pair of balanced signal cables (one merged mesh) runs from each
cabinet's rear connector across the table to the console's rear jacks. They use *Yamaha HS8 Studio Monitor* by Ivan_WSK (CC BY 4.0,
Sketchfab), a one-off derivative: the geometry was simplified to 5,614 triangles and its 4096 px base-colour atlas (one-pixel
strips per polygon, which turn to noise when downscaled) was sampled into vertex colour, so the GLB carries no textures
(`js/models/monitors/source/monitor_speaker.glb`, 1 draw, 0.2 MB; the right monitor is an instance of the left).

The club restroom (`VenueLayout.restroom`) opens off the front-left corner of the hall through a 1.8 m doorway under a pink neon `WC`
sign. Its two stalls and wash area use Quaternius's *Toilet* (`js/models/restroom/source/toilet.glb`, 1 draw, 402 triangles) and
*Bathroom Sink* (`js/models/restroom/source/bathroom_sink.glb`, 1 draw, 350 triangles), both CC0 1.0, with vertex-baked porcelain
and brushed-steel colours, instanced for the second stall and second basin, and lit by the scoped `restroomLight` accent. Both toilets
are tagged as interactive seats. `node scripts/build-restroom-monitor-assets.mjs` rebuilds the restroom GLBs from their CC0 sources.

Three small Poly Haven props (CC0) dress it: a metal waste bin under the hand dryer (1,221 triangles, 1 draw; the asset's rusty twin and
lids are left out), a wet floor sign in the aisle (228 triangles, 1 draw) and a plunger in the first stall (1,147 triangles, 1 draw),
each with 512 px WebP maps and a few hundred KiB (`node scripts/build-restroom-props.mjs` rebuilds them from Poly Haven). Foliage was
left out deliberately: its alpha-masked cards cannot be drawn in the club, where every imported surface is forced opaque.

The walls are dressed from ONE painted atlas, `js/restroomArt.js` (2048 x 1024, painted at run time with Canvas 2D, no image files and
no web fonts): a backlit NOCTURNE poster in a steel box at the end of the aisle, an event flyer and a hygiene and no-smoking sign on the
dividers, and a safety poster, marker tags and a few stickers inside the stalls and on the stall doors. It is original artwork
with generic wording (no brands, no artists), costing two draws plus one per door. A toilet roll, paper holder, soap dispenser pumps
and hand-dryer nozzle are procedural.

### The street

The avenue outside the club's street door is one **baked derivative** of the CC0 Quaternius *Downtown City MegaKit (Standard)*, which is
not in this repository (153 pieces and 78 MB of PNG). `node scripts/build-city-assets.mjs --kit "<unzipped kit>/Exports/glTF (Godot)"`
rebuilds `js/models/city/downtown.glb` from it. The script lays the three whole buildings out as two rows facing each other across a
four-lane avenue (a far row of six, a near row of two either side of the club), with street and sidewalk tiles, crosswalks, planters and
bollards. The forecourt leaves out the four tiles over the club's entrance stair (the club is a basement; the GLB is baked at y = 0
and lifted to street level at runtime). It drops the interior floors, makes the transparent glass an opaque dark pane, lifts the kit's "fake interior" room pictures a
few centimetres in front of the glass so lit rooms show, bakes the kit's per-instance tints into vertex colour (so brick, trim and
asphalt are one material each), and packs the three room pictures plus a black glass tile into one 1024 px atlas. Each building is
simplified by its distance from the door (meshoptimizer: the topological simplifier alone stops near 50% because a facade is thousands
of separate window-frame islands; beyond about 22 m the window-frame material also goes through the sloppy simplifier), merged per
building and per material, and quantised (14-bit positions, 8-bit normals). Textures become WebP: base colour 1024 px, packed ORM and
normals 512 px.

`npm run bake:street-props -- --cars "<Car Pack>/OBJ" --house "<Ultimate House Interior Pack>/OBJ"` is the idempotent
second bake. It adds three parked cars (`BasicCar`, `SimpleCarShort`, `Taxi`), the two small bins
(`Trashcan_Small1`, `Trashcan_Small2`) and one entrance plant (`Houseplant_4`) from those two additional Quaternius
CC0 packs. Their flat materials and the cars' 4 px palette textures are baked into vertex colour on one shared opaque
material; the source textures are not shipped. Each prop remains a separate node so the runtime can give it one
measured collision box. The combined result is about 154k triangles, 8 materials, 7.2 MB and 66 draws. It is only
drawn while a guest is near the entrance. The sky dome and the distant towers are procedural (`js/cityDistrict.js`). The kit's licence
file asks for nothing, but the creator is credited here. The exact CC0 source archives used for the prop bake have
SHA-256 hashes `40B1F046227D1D7D3BC208E6DFFB36803AF71FA62476E371019D76860F08CE07` (Car Pack) and
`E59E14F0C2F57C6E5D3A057A77DEEB7416C4FE3A6BDC5F27C8431F8A0BD7BBBB` (Ultimate House Interior Pack).

### The bar

The bar and entrance are built from these third-party pieces plus procedural geometry:

- **Stools**: Poly Haven *Metal Stool 03* (CC0), geometry untouched (6,576 triangles), its 1K textures re-encoded as 512 px
  WebP. Five instances stand at the counter.
- **Wood**: Poly Haven *Dark Wood* (CC0), above.
- **Bartender**: the Quaternius female guest (`club-guest-female.glb`, CC0) loaded as a second container so she can wear a
  black outfit, playing its `Idle_Talking_Loop`.
- **Bottles**: procedural (`js/barProps.js`), twelve generic shapes (vodka, gin, rum, whisky, bourbon, tequila, champagne,
  three liqueurs, lager, wine) whose labels are drawn at runtime from descriptive words. They are not real brands.

`node scripts/build-bar-assets.mjs` regenerates the wood textures and the stool from their Poly Haven sources.

### Derived files

Both models are **optimised derivatives** of the originals, produced by
`npm run optimize:models` (`scripts/optimize-models.mjs`, idempotent; `npm test` fails if a
model drifts back above its budget). The console's embedded textures are resized from 4096 px
to 2048 px WebP (normal and emissive maps lossless); the speaker GLB's embedded textures are
stripped because the app replaces them with the external set above, which is also resized.
Geometry and licences are unchanged. The speaker retains the source's 6,940 triangles.
Its albedo and normal maps are 2048 px; its original packed ORM (R=occlusion,
G=roughness, B=metallic) is 1024 px, with full-resolution JPEG chroma.
These images were recovered from the original download preserved in commit `475c46f`,
without changing their glTF UV orientation. The older loose maps had the opposite
vertical orientation and incorrectly substituted grayscale roughness for packed ORM.
The new directory invalidates returning visitors' IndexedDB texture caches.
Runtime material factors are the original 1/1 metallic/roughness multipliers, with
glTF normal-map handedness and no uniform emissive visibility floor. The existing
speaker-only accent light receives a material slot without increasing the light budget.
The flown cabinets keep the horn above the two drivers, with the existing downward
and inward aim; the old X-axis half-turn had hung them upside down.
When replacing the speaker with its original textured GLB, the optimizer exports
these three images before stripping the embedded copies.

## Character models and animations

| File | Origin | Licence |
|------|--------|---------|
| `js/models/avatars/club-dancer-female.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy + Universal Animation Library (`Dance_Loop`) | CC0 1.0 |
| `js/models/avatars/club-dancer-male.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy + Universal Animation Library (`Dance_Loop`) | CC0 1.0 |
| `js/models/avatars/club-dj-male.glb` | Fictional male DJ, derived from `club-guest-male.glb`: beard removed, Universal Base Characters `Hair_Long` reworked into opaque nape waves over the cap, softened cheek/jaw and subtle age creases, CC0 headphones added, `Idle_Loop` retained. Dark-brown hair and grey top through runtime tints | CC0 1.0 |
| `js/models/avatars/club-dj-female.glb` | Fictional female DJ, derived from `club-guest-female.glb`: CC0 headphones added, `Idle_Loop` retained. Blond hair and grey top through runtime tints | CC0 1.0 |
| `js/models/avatars/club-guest-female.glb` | Quaternius Universal Base Characters + Modular Character Outfits - Fantasy (Ranger outfit without its hood and pauldron) + Universal Animation Library (`Dance_Loop`, `Idle_Talking_Loop`, `Idle_Loop`) + Universal Animation Library 2 (`Yes`, `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop`). At runtime it is the bartender (black outfit through a tint); it is also the source the DJ and crowd builds derive from | CC0 1.0 |
| `js/models/avatars/club-guest-male.glb` | As `club-guest-female.glb`, male. Not loaded at runtime any more (the guests are the `club-crowd-*` people); kept as the source `scripts/build-dj-glbs.mjs` and `scripts/build-crowd-glbs.mjs` derive from | CC0 1.0 |
| `js/models/avatars/Hip Hop Dancing.glb` | Adobe Mixamo character and hip-hop animation | Mixamo terms of use |
| `js/models/avatars/house.glb` | Adobe Mixamo character and house-dance animation | Mixamo terms of use |
| `js/models/avatars/rumba_dancing_female_character.glb` | Adobe Mixamo character and rumba animation | Mixamo terms of use |

### The DJs' headphones

Both DJs wear the **"Headphones"** model by *nisu*, published on OpenGameArt
(<https://opengameart.org/content/headphones>, CC0 1.0; black over-ear cans with a blue accent, 3,324 triangles, 4K
PBR set). Only the OBJ and its base-colour map are used: `scripts/build-dj-glbs.mjs --headphones "<unzipped dir>"` converts
the OBJ (the source file's own units are scaled so the cups come out 7 cm across), moves the cups out to each DJ's
measured ears and widens the band to meet them, lifts the band onto the crown, skins the mesh 100% to the `Head` joint
(so it follows every head movement with no runtime placement) and ships the colour map at 512 px WebP. One extra draw
call per DJ. The brand mark on one cup is tiny and fictional.
The download used carries no licence file; the page states CC0.

### The crowd: Modular Women and Modular Men

Seventeen people, plus the bouncer at the street door, built by `scripts/build-crowd-glbs.mjs` from the Quaternius **Modular Women** and **Modular Men**
packs (the "Individual Characters" glTF downloads), recoloured into a varied cast and carrying the club's own dance
and idle clips retargeted onto their rig. The eleven floor dancers also carry eight dance moves (`Groove_*`) that the
script authors procedurally onto the rig itself (no third-party animation; see `js/crowdDance.js`). The scripts and tests treat them as `club-crowd-<id>.glb`:

| File | Base character | Look | Clips |
|------|----------------|------|-------|
| `js/models/avatars/club-crowd-f1.glb` | Women / Casual | Deep skin, black hair, white top, navy trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-f2.glb` | Women / Casual | Fair skin, auburn hair, teal top, black trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-f3.glb` | Women / Punk | Tan skin, cyan mohawk and top | `Dance_Loop` |
| `js/models/avatars/club-crowd-f4.glb` | Women / Formal | Brown skin, black hair, burgundy dress | `Dance_Loop` |
| `js/models/avatars/club-crowd-f5.glb` | Women / Formal | Light skin, blonde hair, royal-blue dress | `Dance_Loop` |
| `js/models/avatars/club-crowd-f6.glb` | Women / Suit | Fair skin, silver hair (an older guest), dark suit | all six |
| `js/models/avatars/club-crowd-f7.glb` | Women / Suit | Espresso skin, black hair, red blazer | all six + `Idle_Railing_Loop` |
| `js/models/avatars/club-crowd-f8.glb` | Women / Casual | Medium skin, dark hair, cream top, plum trousers | all six |
| `js/models/avatars/club-crowd-m1.glb` | Men / Casual 2 | Deep skin, black hair, black tee | `Dance_Loop` |
| `js/models/avatars/club-crowd-m2.glb` | Men / Casual 2 | Fair skin, silver hair (an older man), slate top | `Dance_Loop` |
| `js/models/avatars/club-crowd-m3.glb` | Men / Casual Hoodie | Tan skin, dark hair, forest-green hoodie | `Dance_Loop` |
| `js/models/avatars/club-crowd-m4.glb` | Men / Casual Hoodie | Brown skin, black hair, rust hoodie | all six |
| `js/models/avatars/club-crowd-m5.glb` | Men / Punk | Light skin, blue mohawk | `Dance_Loop` |
| `js/models/avatars/club-crowd-m6.glb` | Men / Suit | Tan skin, silver hair (an older man), charcoal suit, pistol removed | all six |
| `js/models/avatars/club-crowd-m7.glb` | Men / Suit | Deep skin, black hair, burgundy suit, pistol removed | `Dance_Loop` |
| `js/models/avatars/club-crowd-m8.glb` | Men / Beach | Light skin, blond hair, cream shirt, blue shorts | all six |
| `js/models/avatars/club-crowd-m9.glb` | Men / Casual 2 | Medium skin, brown hair, purple tee | `Dance_Loop` |
| `js/models/avatars/club-crowd-bouncer.glb` | Men / Suit | The bouncer at the street door: unchanged espresso skin and black hair, charcoal suit, light slate shirt and dark tie, pistol removed | all six |
| `js/models/avatars/club-crowd-vf1.glb` | Women / Formal (f4) | Olive skin, chestnut hair, emerald dress | `Dance_Loop` |
| `js/models/avatars/club-crowd-vf2.glb` | Women / Casual (f1) | Golden skin, platinum hair, mustard top, black trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-vf3.glb` | Women / Punk (f3) | Pale skin, pink mohawk, plum outfit | `Dance_Loop` |
| `js/models/avatars/club-crowd-vf5.glb` | Women / Casual (f8) | Light skin, auburn hair, rose top, slate trousers | all six |
| `js/models/avatars/club-crowd-vf6.glb` | Women / Suit (f7) | Tan skin, dark hair, rose shirt, indigo suit | all six + `Idle_Railing_Loop` |
| `js/models/avatars/club-crowd-vf7.glb` | Women / Casual (f8) | Deep skin, black hair, jade top, black trousers | all six |
| `js/models/avatars/club-crowd-vm1.glb` | Men / Casual 2 (m1) | Umber skin, auburn hair, red tee, charcoal trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-vm2.glb` | Men / Casual 2 (m9) | Pale skin, ginger hair, teal shirt, navy trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-vm3.glb` | Men / Casual Hoodie (m3) | Espresso skin, black hair, ochre hoodie, navy trousers | `Dance_Loop` |
| `js/models/avatars/club-crowd-vm4.glb` | Men / Suit (m7) | Tan skin, dark hair, navy suit, plum shirt | `Dance_Loop` |
| `js/models/avatars/club-crowd-vm5.glb` | Men / Casual Hoodie (m4) | Medium skin, brown hair, steel-blue hoodie | all six |
| `js/models/avatars/club-crowd-vm6.glb` | Men / Beach (m8) | Umber skin, auburn hair, brown shirt, orange-trimmed blue shorts | all six |
| `js/models/avatars/club-crowd-vm7.glb` | Men / Punk (m5) | Brown skin, green mohawk, teal shirt, dark-red jacket | `Dance_Loop` |

The thirteen `v*` files are **recoloured copies** of the cast above, made by `node scripts/build-crowd-glbs.mjs --variants`
(`VARIANTS` in that script; no asset packs needed, and `--refresh-static` and a full build regenerate them). A person is
one vertex-coloured mesh whose colours fall into flat clusters (skin, hair, top, trousers, shoes), so a variant swaps the
skin tone, hair and garment colours and copies the body, skeleton and every clip unchanged. They exist so that nobody in
the club is the same person twice (dancers, side guests and the queue outside use one file each). They are not player
avatars: the relay's pool stays `f1`..`m9`. They are derived works under the same CC0 licence as their base.

Garment clusters down to 60 vertices are recoloured: the old 270-vertex floor
silently left several tops unchanged while only recolouring trousers.
`node scripts/build-crowd-glbs.mjs --refresh-wardrobe --optimize` rebuilds these
variants and the bouncer's clothing without the packs or changes to his skin,
skeleton or clips. Bald recipes additionally remove the connected crown-hair
shell while preserving the existing scalp. The existing scoped entrance lamp also lights his face
more clearly; live character swaps re-register accent-light ordering. No extra
light or texture is added. Optional NPC accessories add one shared-material
draw per dressed person, and the caller's phone adds one draw. Appearance is browser-tested in both
styles; physical-headset readability and timing remain unmeasured.

"All six" is `Dance_Loop`, `Idle_Loop`, `Idle_Talking_Loop`, `Idle_FoldArms_Loop`, `Idle_TalkingPhone_Loop` and `Yes`:
the guests, who stand and talk instead of dancing, need the idle poses. Every file also keeps the packs' own `Idle`,
`Walk`, `Run` and `Wave` clips: they are what the other players in a multiplayer room use (`AvatarManager`), so the
Clips column above lists the retargeted extras. Dancers therefore carry six clips and guests ten; `f7` carries the
additional procedural railing pose used only on the mezzanine. Each file is one skinned mesh and one material
(per-vertex colour, no textures), about 1.0 MB, so a person costs one draw call where the Universal Base Characters
cost about six.

Source: Quaternius *Modular Women* and *Modular Men* (CC0 1.0, <https://quaternius.com/>; the download used carries no
licence file, and Quaternius publishes both under CC0). The two archives used have SHA-256 hashes
`2E2E7D46E5090CB0F6F62501F0B907EFEDBFA42D57975239CACBD967A0CAA88C` (Modular Women, ten characters) and
`49798EC15E0C23B4F540FC4BDCE5C77A071EEB15B9DF2670B8E761B5453F4D22` (Modular Men, eleven). The packs' own clips
(Walk, Run, Punch...) include no dancing; Idle, Walk, Run and Wave are kept for networked guests and the rest dropped; the dance and idle clips are the Universal Animation Library
ones already inside `club-guest-female.glb` / `club-guest-male.glb`, retargeted by the build script (the two rigs differ:
see the header of `scripts/build-crowd-glbs.mjs`); five of the eleven dancers (f2, f4, m1, m3, m7) play the dance mirrored
(reflected across the body's midline), so neighbours are not in step. Skin tones, hair and clothes are a per-person palette in that script.
Nothing from the packs' hats, helmets, crowns or weapons is shipped.

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

The three Mixamo-derived GLBs are retained in the historical source only; Quest does not ship them.
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

### Graffiti

`textures/graffiti/atlas.webp` (2048 px RGBA WebP, 2.2 MB) is a **derivative** of five Sketchfab decal packs, all
*Decal - Graffiti Textures* by **karlwirbelwind** (<https://sketchfab.com/karlwirbelwind>), **CC BY 4.0**. Two are titled
"[CCO]" on Sketchfab, but every listing and every GLB's embedded `asset.extras.license` says CC-BY-4.0, so all five are
treated and credited as CC BY.

| Atlas cell | Source listing | Painted on |
|------------|----------------|------------|
| `character` | [37d78e03…](https://sketchfab.com/3d-models/cco-decal-graffiti-textures-37d78e03040041bdb9158c7ce4aa7cd8) | front wall, right of the door |
| `tagWall` | [4b3bc244…](https://sketchfab.com/3d-models/decal-graffiti-textures-4b3bc244cccf4acb8d402372d8ce1db0) | left wall, front corner |
| `tagCluster` | [69a07e3d…](https://sketchfab.com/3d-models/decal-graffiti-textures-69a07e3d256e4b0490ac49e99ac57896) | right wall, rear corner |
| `vaps` | [19b3096f…](https://sketchfab.com/3d-models/cco-decal-graffiti-textures-19b3096fbd9a424484f78b58368a9b8a) | front wall, left of the door |
| `klw` | [86d7a898…](https://sketchfab.com/3d-models/decal-graffiti-textures-86d7a89828364880b5397081350455a7) | right wall, front corner |

Changes made: each GLB's embedded 1024 px RGBA image was flipped upright, trimmed to its painted area, fitted into its
cell and the five were packed into one atlas; the GLB geometry is not shipped. The in-app credit in `#modelCredits` links
all five listings, the creator and the licence, and states the change. Sketchfab downloads need an account, so to rebuild,
download the five GLBs and run `node scripts/build-graffiti-atlas.mjs <folder>` (packs are matched by the source URL
embedded in each GLB, not by file name).

## Music

| Path | What it is | Licence |
|------|------------|---------|
| `audio/nocturne-house.mp3` | The club's own original house set: 3 cycles, 15.5 minutes at 124 BPM, 160 kbps joint-stereo. | MIT, original work of this project |

Every sound in it is synthesised from maths by `scripts/build-default-set.mjs` (kick, claps, hats, bass, pads and a lead,
arranged in 16-bar phrases with builds, a breakdown and drops so the light show and crowd have a real structure to follow).
It uses no samples, no recordings and no third-party material, so there is nothing to license or credit. It plays only
when a guest has no music of their own and is not in someone else's room. Regenerate it with
`node scripts/build-default-set.mjs` (needs ffmpeg with libmp3lame; the output is deterministic). The file must stay under
Cloudflare Pages' 25 MiB per-file limit (the script refuses to finish above it).

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

1. **Mixamo characters (excluded from Quest)**: redistribution clearance for the three raw GLBs remains
   unconfirmed; see the character section above. The Stage Speaker creator/source
   gap is resolved: the user supplied the original listing, identifying Sousinho
   and CC BY 4.0, and the in-app credit includes both links and the derivative notice.
2. **Provenance evidence**: retain the original graffiti licence metadata/download records and identify
   the exact Poly Haven wall/ceiling sets before a commercial release. Their recorded licences permit
   commercial use; this is an evidence gap, not a finding that they require payment.
3. **Non-copyright rights**: asset licences do not confer brand/trademark or artist endorsement rights.
   The Quest UI does not name artists; review any prominent product branding before store marketing.
