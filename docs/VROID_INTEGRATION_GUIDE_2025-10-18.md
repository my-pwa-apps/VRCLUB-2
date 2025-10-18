# VRoid Studio Avatar Integration Guide

## 📋 Overview

This guide walks you through creating and integrating **VRoid Studio avatars** into the VR Club project. VRoid avatars are anime-styled, highly customizable 3D characters that work perfectly with Babylon.js.

**Benefits of VRoid:**
- ✅ **Completely FREE** (unlimited avatars)
- ✅ **Professional quality** anime/stylized characters
- ✅ **Highly customizable** (hair, clothes, face, body)
- ✅ **Hair physics** included
- ✅ **Active community** with shared assets
- ✅ **No licensing restrictions** for your creations

---

## 🎨 Step 1: Download VRoid Studio

### Windows/Mac:
1. Visit **https://vroid.com/en/studio**
2. Click **"Download"** (Windows or Mac)
3. Install VRoid Studio (free, no account required)
4. Launch the application

**System Requirements:**
- Windows 10/11 or macOS 10.13+
- 4GB RAM minimum (8GB recommended)
- 2GB free disk space

---

## 🧑‍🎨 Step 2: Create Your Avatars

### Quick Start (10 minutes per avatar):

1. **Launch VRoid Studio**
2. **Click "New Character"**
   - Choose **Male** or **Female** base model
   - Or start from scratch with **"Blank"**

3. **Customize Appearance:**

   **Face Tab:**
   - Eye shape, color, size
   - Eyebrow style and color
   - Nose shape and size
   - Mouth shape
   - Face shape (cheeks, jaw, chin)
   - Skin tone (8+ presets)

   **Hair Tab:**
   - Preset hairstyles (100+ options)
   - Custom hair painting (draw strands)
   - Hair color (multiple layers)
   - Hair physics settings

   **Body Tab:**
   - Height (1.4m - 2.0m)
   - Body proportions
   - Muscle/weight sliders
   - Skin tone

   **Clothing Tab:**
   - Tops, bottoms, shoes
   - Textures and colors
   - Import custom textures
   - Multiple outfit layers

4. **Test Pose and Expressions:**
   - Use "Pose" tab to preview movement
   - Test facial expressions

5. **Save Your Avatar:**
   - File → Save (save as .vroid file for editing later)

### Tips for Club-Appropriate Avatars:

**Create Diverse NPCs:**
- Mix male/female models
- Vary skin tones
- Different hair styles and colors
- Range of body types (height, build)
- Club-appropriate outfits (casual, dressy, urban)

**Recommended Styles for Nightclub:**
- Modern streetwear
- Fashionable casual
- Trendy/edgy styles
- Avoid fantasy costumes (or embrace them!)

**Performance Optimization:**
- Keep hair complexity moderate (not maximum detail)
- Use standard clothing (complex textures increase file size)
- Test export file size (aim for <20MB per avatar)

---

## 💾 Step 3: Export Avatars

### Export Settings:

1. **In VRoid Studio:**
   - File → Export
   - Choose export location
   - **Format: VRM** (VRoid Model format)
   - **Preset: VRM 0.0** (best compatibility)
   - Click **"Export"**

2. **Wait for Export:**
   - Large avatars may take 1-2 minutes
   - Progress bar shows completion

3. **Repeat for All Avatars:**
   - Create and export 8-10 diverse avatars
   - Name them descriptively:
     - `club_npc_01.vrm`, `club_npc_02.vrm`, etc.
     - Or: `male_casual_01.vrm`, `female_dressy_01.vrm`

**Export Checklist:**
- ✅ 8-10 diverse avatars
- ✅ VRM 0.0 format
- ✅ Descriptive filenames
- ✅ File sizes reasonable (<20MB each)

---

## 🔄 Step 4: Convert VRM to GLB

VRoid exports **VRM** format, but Babylon.js works best with **GLB** (glTF Binary). We need to convert.

### **Option A: VRoid Hub (Recommended, Easy)**

1. **Visit https://hub.vroid.com/**
2. **Create free account** (email or social login)
3. **Upload VRM files:**
   - Click **"Upload Model"**
   - Select your .vrm file
   - Fill in details (name, description)
   - Set visibility to **Private** (only you can see)
4. **Download GLB:**
   - After upload completes, view your model
   - Click **"Download"** → **"GLB"**
   - Save to your computer

**Repeat for all avatars.**

---

### **Option B: UniVRM (Advanced, Requires Unity)**

If you have Unity Editor:

1. **Download Unity 2019.4+ LTS**
2. **Install UniVRM package:**
   - https://github.com/vrm-c/UniVRM
3. **Import VRM to Unity**
4. **Export as GLB:**
   - Select avatar in hierarchy
   - File → Export → glTF 2.0
   - Choose binary (.glb)

---

### **Option C: Online Converters (Quick)**

Use web-based converters (verify they work):

- **https://products.aspose.app/3d/conversion/vrm-to-glb**
- **https://anyconv.com/vrm-to-glb-converter/**

**Note**: Check file size after conversion. Online tools may not optimize properly.

---

## 📁 Step 5: Add Avatars to Project

### Directory Structure:

Create avatar directory:
```
VRCLUB/
├── js/
│   ├── models/
│   │   ├── avatars/          ← Create this folder
│   │   │   ├── vroid_01.glb
│   │   │   ├── vroid_02.glb
│   │   │   ├── vroid_03.glb
│   │   │   ├── ... (8-10 total)
│   │   ├── djgear/
│   │   ├── paspeakers/
```

### Copy Files:

1. **Create folder**: `js/models/avatars/`
2. **Copy all GLB files** to this folder
3. **Rename for consistency**: `vroid_01.glb`, `vroid_02.glb`, etc.

**File Size Check:**
- Individual files: 10-20MB each is normal
- Total: 80-200MB for 8-10 avatars
- Babylon.js handles this well with caching

---

## 🔧 Step 6: Update Avatar Loader

### Edit `js/readyPlayerMeLoader.js`:

**Option 1: Rename the loader** (recommended for clarity):

Rename file:
- `readyPlayerMeLoader.js` → `avatarLoader.js`

Update class name and comments to reflect it now handles VRoid too.

**Option 2: Keep name and add VRoid support** (quick):

Just update the `avatarLibrary` array:

```javascript
// In readyPlayerMeLoader.js, line ~11:
this.avatarLibrary = [
    // VRoid Studio avatars (local files)
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    './js/models/avatars/vroid_03.glb',
    './js/models/avatars/vroid_04.glb',
    './js/models/avatars/vroid_05.glb',
    './js/models/avatars/vroid_06.glb',
    './js/models/avatars/vroid_07.glb',
    './js/models/avatars/vroid_08.glb',
    
    // Can mix with Ready Player Me URLs:
    // 'https://models.readyplayer.me/YOUR_ID.glb',
];

// Enable avatar loading (line ~22):
this.useReadyPlayerMe = true; // Now loads from avatarLibrary
```

**That's it!** The loader already handles GLB files from any source.

---

## ⚙️ Step 7: Test Integration

### Local Testing:

1. **Start development server:**
   ```powershell
   npm start
   ```

2. **Open browser:**
   - Navigate to `http://localhost:8000`

3. **Check console for avatar loading:**
   ```
   🎭 ReadyPlayerMeLoader initialized
   🔄 Loading RPM avatar for npc_1 from ./js/models/avatars/vroid_01.glb
   ✅ Loaded RPM avatar with 47 meshes
   ```

4. **Verify in scene:**
   - NPCs should appear with VRoid avatars
   - Check for hair rendering (should have physics)
   - Verify animations work

### Troubleshooting:

**Problem: Avatars not loading**
- ✅ Check console for 404 errors
- ✅ Verify GLB files in `js/models/avatars/`
- ✅ Check file paths in `avatarLibrary` array
- ✅ Ensure `useReadyPlayerMe = true`

**Problem: Avatars too big/small**
- Adjust scaling in `readyPlayerMeLoader.js` line ~64:
  ```javascript
  root.scaling = new BABYLON.Vector3(0.8, 0.8, 0.8); // Scale down 20%
  ```

**Problem: Avatars appear transparent**
- Check materials have `maxSimultaneousLights` set
- Verify alpha mode in materials (should be opaque)

**Problem: Hair looks wrong**
- VRoid hair uses transparency - ensure materials render correctly
- May need to adjust render order for hair meshes

**Problem: File too large**
- Re-export from VRoid with lower detail settings
- Use texture compression tools
- Consider using fewer avatars (5-6 instead of 8-10)

---

## 🎯 Step 8: Optimize Performance

### VRoid-Specific Optimizations:

**1. Material Light Limits** (already handled):
```javascript
// In readyPlayerMeLoader.js line ~68:
mesh.material.maxSimultaneousLights = 6;
```

**2. Texture Caching** (already handled):
```javascript
// Cache prevents re-downloading same avatar
this.cache.set(avatarUrl, result.meshes);
```

**3. Mesh Instancing for NPCs:**

VRoid avatars have ~30-50 meshes each. For NPCs (not networked players), consider using fewer unique avatars:

```javascript
// Instead of 8 unique avatars, use 4-5 and instance them
// This reduces memory usage while maintaining variety
```

**4. LOD (Level of Detail) - Future Enhancement:**

For distant avatars, could swap to simplified procedural avatars:
```javascript
// Pseudo-code for future:
if (distanceToPlayer > 15) {
    useProceduralAvatar(); // Simple geometry
} else {
    useVRoidAvatar(); // Full detail
}
```

---

## 🎨 Advanced Customization

### Mix Avatar Types:

You can mix VRoid, Ready Player Me, and procedural avatars:

```javascript
this.avatarLibrary = [
    // VRoid avatars
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    './js/models/avatars/vroid_03.glb',
    
    // Ready Player Me avatars
    'https://models.readyplayer.me/YOUR_ID_1.glb',
    'https://models.readyplayer.me/YOUR_ID_2.glb',
    
    // Sketchfab avatars
    './js/models/avatars/sketchfab_01.glb',
];

// System randomly picks from all available
```

### Per-Avatar Scaling:

If some avatars need different scales:

```javascript
// In readyPlayerMeLoader.js, add scale mapping:
this.avatarScales = {
    'vroid_01.glb': 1.0,
    'vroid_02.glb': 0.9,  // Shorter avatar
    'vroid_03.glb': 1.1,  // Taller avatar
};

// Then apply in loadRandomAvatar():
const scale = this.avatarScales[avatarFilename] || 1.0;
root.scaling = new BABYLON.Vector3(scale, scale, scale);
```

### Custom Animations:

VRoid avatars support standard humanoid rigs. You can apply Mixamo animations:

1. Export VRoid avatar skeleton
2. Upload to Mixamo
3. Download animations
4. Apply in Babylon.js

---

## 📚 VRoid Resources

### Official:
- **VRoid Studio**: https://vroid.com/en/studio
- **VRoid Hub**: https://hub.vroid.com/ (upload & convert)
- **VRoid Mobile**: iOS/Android app for quick customization

### Community:
- **VRoid Official Discord**: https://discord.gg/vroid
- **BOOTH** (Japanese marketplace): https://booth.pm/
  - Search "VRoid" for free/paid assets (hair, clothes, accessories)
- **YouTube Tutorials**: Search "VRoid Studio tutorial"

### Assets (Hair, Clothes, Textures):
- **BOOTH**: Free and paid VRoid assets
- **VRoid Hub**: Community shared items
- **Texture painting**: Use Photoshop/GIMP for custom designs

---

## 🎭 Recommended Avatar Collection

For a nightclub setting, create:

**Core Collection (8 avatars):**

1. **Female Casual 1**: Jeans, t-shirt, sneakers, ponytail
2. **Female Dressy 1**: Short dress, heels, long hair
3. **Male Casual 1**: Jeans, hoodie, sneakers, short hair
4. **Male Dressy 1**: Button-up, dress pants, styled hair
5. **Female Urban**: Streetwear, bold colors, unique hairstyle
6. **Male Urban**: Streetwear, cap, edgy style
7. **Female Trendy**: Fashion-forward outfit, colorful hair
8. **Male Trendy**: Modern style, accessories

**Diversity Checklist:**
- ✅ Mix of genders
- ✅ Varied skin tones (pale, tan, dark, etc.)
- ✅ Different hair colors (natural + bold)
- ✅ Range of heights (1.5m - 1.9m)
- ✅ Different body types
- ✅ Varied clothing styles

---

## 🚀 Quick Start Checklist

- [ ] Download VRoid Studio
- [ ] Create 8-10 diverse avatars
- [ ] Export as VRM files
- [ ] Convert VRM to GLB (VRoid Hub or converter)
- [ ] Copy GLB files to `js/models/avatars/`
- [ ] Update `readyPlayerMeLoader.js` avatarLibrary array
- [ ] Set `useReadyPlayerMe = true`
- [ ] Test in browser
- [ ] Verify all avatars load correctly
- [ ] Check performance (should be 60fps)
- [ ] Commit changes to git

---

## 🔧 Code Reference

### Minimal Code Changes:

**File: `js/readyPlayerMeLoader.js`**

```javascript
// Line ~11: Add VRoid avatar paths
this.avatarLibrary = [
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    './js/models/avatars/vroid_03.glb',
    './js/models/avatars/vroid_04.glb',
    './js/models/avatars/vroid_05.glb',
    './js/models/avatars/vroid_06.glb',
    './js/models/avatars/vroid_07.glb',
    './js/models/avatars/vroid_08.glb',
];

// Line ~22: Enable avatar loading
this.useReadyPlayerMe = true;
```

**File: `index.html`**

No changes needed! The loader handles all avatar types.

**File: `js/club_hyperrealistic.js`**

No changes needed! NPCs will automatically use new avatars.

---

## 📊 Expected Results

After integration:

**Visual:**
- ✅ NPCs appear with anime-styled VRoid avatars
- ✅ Diverse appearances (gender, skin tone, style)
- ✅ Smooth hair rendering with physics
- ✅ Natural movement during dance animations

**Performance:**
- ✅ 60fps maintained (Quest 3S and desktop)
- ✅ Avatars load within 1-2 seconds
- ✅ No memory leaks (caching works)

**Console Output:**
```
🎭 ReadyPlayerMeLoader initialized
🔄 Loading RPM avatar for npc_1 from ./js/models/avatars/vroid_01.glb
✅ Loaded RPM avatar with 47 meshes
🔄 Loading RPM avatar for npc_2 from ./js/models/avatars/vroid_03.glb
✅ Using cached RPM avatar
```

---

## 🎉 Next Steps

After successful integration:

1. **Fine-tune scaling** if avatars too big/small
2. **Test in VR** on Quest 3S
3. **Verify performance** with all NPCs loaded
4. **Consider adding more avatars** for variety
5. **Explore Mixamo animations** for avatar actions
6. **Share screenshots** of your unique club!

---

## 📝 License Note

**Your VRoid Creations:**
- You own copyright to avatars you create
- Use freely in personal/commercial projects
- No attribution required (but appreciated!)

**VRoid Studio Software:**
- Free to use
- Check terms: https://vroid.com/en/studio/terms

**VRoid Hub:**
- Free account
- Uploaded models remain your property
- Check individual asset licenses if using community items

---

## 🆘 Support

**Issues?**
1. Check console for error messages
2. Review troubleshooting section above
3. Verify file paths and filenames
4. Test with single avatar first
5. Check VRoid Discord for avatar-specific questions

**Common Questions:**

**Q: Can I use free VRoid assets from BOOTH?**  
A: Yes! Check individual asset licenses. Most are free for personal/commercial use.

**Q: How many avatars should I use?**  
A: 8-10 provides good variety. Can use fewer (5-6) for better performance.

**Q: Can I mix VRoid and Ready Player Me?**  
A: Absolutely! Just add both to `avatarLibrary` array.

**Q: File sizes too big?**  
A: VRoid allows export quality settings. Try "Standard" instead of "High".

**Q: Avatars look flat/unlit?**  
A: Check that lights are positioned correctly. VRoid materials work with standard lighting.

---

**Last Updated**: October 18, 2025  
**Tested With**: VRoid Studio 1.28.0, Babylon.js 8.32.1, Quest 3S

---

**Ready to create!** Download VRoid Studio and start customizing avatars for your club! 🎨🎉
