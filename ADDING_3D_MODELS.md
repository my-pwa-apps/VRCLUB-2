# Finding and Adding Free 3D Models from Sketchfab

## Quick Guide to Finding Models

### 1. CDJ Decks (Priority #1)
**Search on Sketchfab:**
```
Site: https://sketchfab.com/search
Query: "Pioneer CDJ" OR "DJ deck" OR "turntable CDJ"
Filters:
  - Downloadable: Yes
  - License: CC BY or CC0
  - File format: glTF (.glb preferred)
  - Animated: No
```

**Good alternatives:**
- Search: "DJ controller" "CDJ 2000" "CDJ 3000" "Technics turntable"
- Look for models by: music equipment manufacturers, DJ enthusiasts
- Ideal polygon count: < 50k triangles

**Example models to look for:**
- Pioneer CDJ-2000NXS2
- Pioneer CDJ-3000
- Technics SL-1200 (if you want vinyl turntables instead)

### 2. DJ Mixer (Priority #2)
**Search on Sketchfab:**
```
Query: "DJ mixer" OR "DJM" OR "Pioneer mixer"
Filters: Same as above
```

**Good models:**
- Pioneer DJM-900NXS2
- Pioneer DJM-A9
- Allen & Heath Xone series
- Any 4-channel DJ mixer

### 3. PA Speakers (Priority #3)
**Search on Sketchfab:**
```
Query: "PA speaker" OR "line array" OR "JBL speaker" OR "stage speaker"
Filters: Same as above
```

**Good models:**
- JBL VRX series
- EV (Electro-Voice) speakers
- d&b audiotechnik line arrays
- QSC KW series
- Generic "professional speaker" models

---

## How to Get the Download URL

### Method 1: Direct Download Link (Recommended)
1. Find your model on Sketchfab
2. Click "Download 3D Model"
3. Select "glTF (.glb)" format
4. Right-click the download button → "Copy Link Address"
5. Use this URL in `modelLoader.js`

### Method 2: Use Sketchfab API
```javascript
// Example: Get download URL via API
const modelId = 'abc123def456'; // From Sketchfab URL
const apiUrl = `https://api.sketchfab.com/v3/models/${modelId}/download`;
```

### Method 3: Self-Host (Most Reliable)
1. Download the `.glb` file to your computer
2. Create a `models/` folder in your project
3. Put models there: `models/cdj_left.glb`, `models/mixer.glb`, etc.
4. Update URLs in `modelLoader.js`:
```javascript
url: 'models/cdj_left.glb'
```

---

## Updating modelLoader.js with Real URLs

### Step 1: Open `js/modelLoader.js`

### Step 2: Replace placeholder URLs
Find this section:
```javascript
cdj_left: {
    name: 'CDJ Deck (Left)',
    url: 'https://models.readyplayer.me/placeholder/cdj.glb', // REPLACE THIS
    position: new BABYLON.Vector3(-1.5, 0.52, -23),
    //...
}
```

### Step 3: Add your Sketchfab model URL
```javascript
cdj_left: {
    name: 'CDJ Deck (Left)',
    url: 'https://media.sketchfab.com/models/[MODEL_ID]/[FILE].glb',
    position: new BABYLON.Vector3(-1.5, 0.52, -23),
    rotation: new BABYLON.Vector3(0, 0, 0),
    scale: new BABYLON.Vector3(0.01, 0.01, 0.01), // Adjust scale as needed
    placeholder: false // Change to false once you have real URL
}
```

---

## Testing and Adjusting Models

### 1. Load and Check Scale
After adding a model URL, reload the page and check console:
```
✅ CDJ Deck (Left) loaded successfully
```

If the model is too big/small, adjust the `scale` value:
```javascript
scale: new BABYLON.Vector3(0.01, 0.01, 0.01) // Very small (1% size)
scale: new BABYLON.Vector3(0.1, 0.1, 0.1)   // Small (10% size)
scale: new BABYLON.Vector3(1, 1, 1)         // Original size
scale: new BABYLON.Vector3(10, 10, 10)      // Large (1000% size)
```

### 2. Adjust Position
If the model is in the wrong spot:
```javascript
position: new BABYLON.Vector3(-1.5, 0.52, -23) // x, y, z
// x: left(-) / right(+)
// y: down(-) / up(+)
// z: forward(+) / back(-)
```

### 3. Adjust Rotation
If the model is facing the wrong way:
```javascript
rotation: new BABYLON.Vector3(0, Math.PI, 0) // Rotate 180° around Y axis
rotation: new BABYLON.Vector3(0, Math.PI / 2, 0) // Rotate 90° around Y axis
```

---

## Recommended Free Models (As of 2025)

### CDJ Decks
**Option 1: Pioneer CDJ-3000**
- Search: "Pioneer CDJ 3000"
- License: CC BY
- Quality: High
- Download: glTF (.glb)

**Option 2: Generic DJ Controller**
- Search: "DJ controller low poly"
- License: CC0 (preferred)
- Quality: Medium (but free to use anywhere)

### DJ Mixer
**Option 1: Pioneer DJM-900**
- Search: "DJM 900"
- License: CC BY
- Many available on Sketchfab

**Option 2: Generic 4-channel mixer**
- Search: "4 channel DJ mixer"
- License: CC0
- Simpler but works well

### PA Speakers
**Option 1: JBL Line Array**
- Search: "JBL line array" OR "pro audio speaker"
- License: CC BY
- Professional look

**Option 2: Generic PA Speaker**
- Search: "PA speaker box"
- License: CC0
- Simple box design works great

---

## Attribution Requirements

### CC0 (Public Domain)
- ✅ No attribution required
- ✅ Use anywhere, modify freely
- ✅ Commercial use allowed

### CC BY (Attribution)
- ⚠️ Attribution required
- Add credit in your app:

```html
<!-- In index.html, add credits section -->
<div id="credits" style="position: absolute; bottom: 5px; right: 5px; font-size: 10px; color: #888;">
    Models: 
    <a href="https://sketchfab.com/3d-models/[MODEL_ID]">CDJ by [Artist]</a> (CC BY), 
    <a href="https://sketchfab.com/3d-models/[MODEL_ID]">Mixer by [Artist]</a> (CC BY)
</div>
```

---

## Fallback Strategy

The model loader automatically falls back to procedural placeholders if:
1. Model fails to download
2. Model URL is invalid
3. CORS issues
4. Model format not supported

This means **your club will always work**, even if some models fail to load!

---

## Performance Tips

### Optimize Models Before Use
1. **Reduce polygons** (use Blender's decimate modifier)
   - Target: < 50k triangles per model
   - VR needs to run at 90fps!

2. **Compress textures**
   - Max 2K resolution (2048x2048)
   - Use JPEG for diffuse maps
   - Use PNG for alpha/transparency

3. **Merge materials**
   - Fewer materials = better performance
   - Combine similar textures into atlas

### Loading Strategy
Models load in priority order:
1. CDJ Left (most visible)
2. Mixer (center focus)
3. CDJ Right
4. PA Speakers (less critical)

This ensures DJ booth looks great even if speakers are still loading!

---

## Quick Start Checklist

- [ ] Search Sketchfab for "Pioneer CDJ" (CC BY or CC0)
- [ ] Download 2x CDJ models (.glb format)
- [ ] Search for "DJ mixer DJM" (CC BY or CC0)
- [ ] Download mixer model (.glb format)
- [ ] Search for "PA speaker" (CC BY or CC0)
- [ ] Download 1x speaker model (.glb format) - will be used twice
- [ ] Copy download URLs or save files to `models/` folder
- [ ] Update `js/modelLoader.js` with real URLs
- [ ] Set `placeholder: false` for each model
- [ ] Reload page and check browser console
- [ ] Adjust `scale`, `position`, `rotation` as needed
- [ ] Add attribution if using CC BY models

---

## Troubleshooting

### "Failed to download model"
- Check CORS: Model host must allow cross-origin requests
- Try downloading file and self-hosting in `models/` folder
- Check browser console for specific error

### "Model is invisible"
- Scale might be too small: increase scale value
- Position might be outside club: check x, y, z values
- Model might be inside floor: increase y position

### "Model is facing wrong direction"
- Adjust rotation.y value
- Try: 0, Math.PI/2, Math.PI, Math.PI*1.5

### "Model is too big/small"
- Adjust scale value
- Start with 0.01 (1%) and go up from there
- Different models use different unit scales

---

## Next Steps

After adding DJ equipment models, you can add:
1. Bar bottles and glasses
2. Bar counter/stools
3. Bartender character (Mixamo or Ready Player Me)
4. Lighting fixtures (moving heads, PARs)
5. Crowd/audience characters
6. Decorative elements (plants, art, etc.)

Would you like help finding specific models or need assistance updating the URLs?
