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

### Optional detailed adult cast (ADE)

The following 34 fictional adults are generated from MakeHuman/MPFB's **CC0
assets**, with individually verified CC0 system clothing, hair, shoes and
MargaretToigo's CC0 `dress01` dresses. Sources:
[MPFB](https://github.com/makehumancommunity/mpfb2),
[system asset pack](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html),
[dress01](https://static.makehumancommunity.org/assets/assetpacks/dress01.html).
The per-person selected assets, authors, URLs and recipes are in
`design/characters/recipes.json`; exact pack hashes and upstream tool revision
are in `design/characters/provenance.json`. MPFB software is GPL-3.0-or-later;
these generated assets are **CC0-1.0**, not GPL source code.

Changes: adult body/face recipes, fitted clothing and hair, hidden-body removal,
decimation below 10,000 triangles, 1024 px body/512 px hair WebP atlases,
53-joint skinning, and offline world-space retargeting of the club's existing
CC0 Quaternius dances, locomotion, gestures, seating and social clips. Hand
contacts are fitted to anatomy and role props; knee planes follow each person's
own anatomy. Non-skin metacarpal helpers support the existing tracked-arm driver.
Measured eye landmarks place the self body. Both DJs reuse
[Headphones by nisu](https://opengameart.org/content/headphones), CC0, fitted to
each head and skinned to its Head joint (3,324 extra triangles).
No proprietary scans, branded outfits or externally hosted avatar service.

Residents sharing a clothing mesh use distinct baked palettes: Luca keeps the
light tee, Noah wears teal, and Felix wears an olive button shirt. Jonas wears
indigo, Mara rose and Ari silver-grey to separate previously similar outfits.
These colours are baked into clothing atlas cells, never into skin or runtime
material clones. `test/wardrobe.test.mjs` samples the shipped torso textures.

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

The two fictional DJs' current styling takes broad hair, wardrobe and build cues
from reference photographs supplied by the owner: mature, lean, ear-length dark
hair and a charcoal crew-neck tee for the male; long side-parted blonde hair and a
charcoal tee for the female. They remain Jin and Zara, not representations of
Hernan Cattaneo or Miss Melera and not an endorsement. The photographs and their
printed clothing artwork are not bundled or copied. Both recipes reuse only the
verified CC0 system assets above, including `short03` / `long01` hair and a
plain `male_casualsuit06` tee/jeans mesh fitted to each body. The lightweight DJs
retain their existing CC0 silhouettes with matching dark-shirt/hair tints.
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
| `js/models/avatars/club-dj-male.glb` | Fictional male DJ, derived from `club-guest-male.glb`: beard removed, shortened Universal Base Characters `Hair_Long` added over the cap, CC0 headphones added, `Idle_Loop` retained. Dark-brown hair and grey top through runtime tints | CC0 1.0 |
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
hair, skeleton or clips. The existing scoped entrance lamp also lights his face
more clearly; live character swaps re-register accent-light ordering. No extra
light, material, texture or draw is added. Appearance is browser-tested in both
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
