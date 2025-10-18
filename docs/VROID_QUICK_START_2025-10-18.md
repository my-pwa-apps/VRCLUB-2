# VRoid Studio Avatar Setup - Quick Start

## 🎯 Goal
Create 8 diverse VRoid avatars for your VR nightclub in ~2 hours.

---

## ⏱️ Timeline

**Total Time: ~2 hours**
- Download VRoid Studio: 10 minutes
- Create 8 avatars: 80 minutes (10 min each)
- Export & Convert: 20 minutes
- Integration: 10 minutes

---

## 📥 Step 1: Download VRoid Studio (10 min)

### Windows:
1. Visit: **https://vroid.com/en/studio**
2. Click **"Download for Windows"**
3. Run installer (VRoidStudio-v1.xx.x-win.exe)
4. Follow installation wizard
5. Launch VRoid Studio

### Mac:
1. Visit: **https://vroid.com/en/studio**
2. Click **"Download for Mac"**
3. Open DMG file, drag to Applications
4. Launch VRoid Studio (may need to allow in Security settings)

**System Requirements:**
- Windows 10/11 or macOS 10.13+
- 8GB RAM recommended
- 2GB free disk space
- Dedicated GPU preferred (integrated works)

---

## 🎨 Step 2: Create 8 Avatars (80 min, ~10 min each)

### Quick Creation Workflow:

For each avatar (repeat 8 times):

**1. Start New Character (30 seconds)**
- Click **"New Character"**
- Choose base: **Male** or **Female**
- Click **"OK"**

**2. Customize Face (2 minutes)**
- **Face Tab** → Select preset face shape
- **Eyes**: Choose style and color
- **Eyebrows**: Select style
- **Mouth**: Choose expression
- **Skin Tone**: Pick from palette

**3. Customize Hair (3 minutes)**
- **Hair Tab** → **Preset Hairstyles**
- Browse library, click to apply
- **Hair Color**: Change base color
- **Highlights** (optional): Add secondary color
- Skip custom hair drawing for speed

**4. Customize Body (1 minute)**
- **Body Tab**
- **Height**: Vary between 1.5m - 1.9m
- **Build**: Adjust sliders slightly for variety
- Keep defaults otherwise

**5. Customize Clothing (3 minutes)**
- **Clothing Tab**
- **Tops**: Select shirt/jacket style
- **Bottoms**: Select pants/skirt
- **Shoes**: Select footwear
- **Colors**: Change clothing colors for variety

**6. Save Avatar (30 seconds)**
- **File → Save**
- Name: `club_avatar_01` through `club_avatar_08`
- Location: Choose easy-to-find folder

---

### 🎭 Recommended Avatar Diversity

Create this mix for good variety:

| # | Gender | Skin Tone | Hair Color | Style | Height |
|---|--------|-----------|------------|-------|--------|
| 1 | Female | Light | Blonde | Casual | 1.65m |
| 2 | Male | Medium | Brown | Casual | 1.78m |
| 3 | Female | Dark | Black | Dressy | 1.70m |
| 4 | Male | Light | Red | Urban | 1.82m |
| 5 | Female | Medium | Blue | Trendy | 1.68m |
| 6 | Male | Dark | Black | Dressy | 1.75m |
| 7 | Female | Tan | Purple | Urban | 1.72m |
| 8 | Male | Medium | Blonde | Trendy | 1.80m |

**Notes:**
- Mix skin tones: Light, medium, tan, dark
- Vary hair colors: Natural + 2-3 bold colors (blue, purple, etc.)
- Balance styles: 2 casual, 2 dressy, 2 urban, 2 trendy
- Height range: 1.65m - 1.82m (realistic human variation)

---

## 💾 Step 3: Export Avatars (20 min total)

### Export Each Avatar from VRoid Studio:

1. **Open avatar** in VRoid Studio
2. **File → Export**
3. **Settings:**
   - Format: **VRM 0.0** (best compatibility)
   - Quality: **Standard** (good balance of quality/size)
   - Preset: **VRM 0.0**
4. **Export Location:** Choose easy-to-find folder (e.g., Desktop/VRoid_Exports)
5. **Click "Export"**
6. Wait ~2 minutes per avatar
7. **Repeat for all 8 avatars**

**Result:** 8 `.vrm` files (10-20MB each)

---

## 🔄 Step 4: Convert VRM to GLB (20 min)

### Option A: VRoid Hub (Recommended - Easy)

**For each avatar:**

1. **Visit:** https://hub.vroid.com/
2. **Sign up** (free) or **Log in**
3. **Click "Upload Model"**
4. **Select VRM file**
5. **Fill in details:**
   - Title: "Club Avatar 01" (etc.)
   - Description: (optional)
   - Visibility: **Private** (only you can see)
6. **Upload** (takes 1-2 minutes)
7. **After upload completes:**
   - View your model page
   - Click **"Download" → "GLB"**
   - Save to `Downloads/club_avatars/` folder
8. **Repeat for all 8 avatars**

**Result:** 8 `.glb` files ready to use!

---

### Option B: Online Converter (Faster but less reliable)

**For batch conversion:**

1. Visit: **https://products.aspose.app/3d/conversion/vrm-to-glb**
2. **Upload all VRM files** (drag & drop)
3. **Click "Convert"**
4. Wait for conversion (5-10 min for 8 files)
5. **Download converted GLB files**

**Note:** Check file sizes - some converters don't optimize properly.

---

## 📁 Step 5: Copy to Project (5 min)

### Organize Files:

1. **Navigate to project:**
   ```
   VRCLUB/js/models/avatars/
   ```

2. **Copy all GLB files** to this folder

3. **Rename for consistency:**
   ```
   vroid_01.glb
   vroid_02.glb
   vroid_03.glb
   vroid_04.glb
   vroid_05.glb
   vroid_06.glb
   vroid_07.glb
   vroid_08.glb
   ```

---

## ⚙️ Step 6: Update Code (5 min)

### Edit `js/readyPlayerMeLoader.js`:

Find the `avatarLibrary` array (around line 14) and update:

```javascript
this.avatarLibrary = [
    // VRoid Studio avatars:
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    './js/models/avatars/vroid_03.glb',
    './js/models/avatars/vroid_04.glb',
    './js/models/avatars/vroid_05.glb',
    './js/models/avatars/vroid_06.glb',
    './js/models/avatars/vroid_07.glb',
    './js/models/avatars/vroid_08.glb',
];
```

Find `useAvatarLibrary` (around line 39) and set to **true**:

```javascript
this.useAvatarLibrary = true; // Enable 3D avatars!
```

**Save the file.**

---

## 🧪 Step 7: Test (5 min)

### Run the Application:

```powershell
npm start
```

### Open Browser:

Navigate to: `http://localhost:8000`

### Check Console:

Look for these messages:
```
🎭 Avatar Loader initialized (supports VRoid, RPM, Mixamo, custom GLB)
🔍 Testing VRoid avatar availability...
🔄 Loading VRoid avatar for npc_1 from ./js/models/avatars/vroid_01.glb
✅ Loaded VRoid avatar with 47 meshes
```

### Verify in Scene:

- **NPCs should appear** with anime-styled VRoid avatars
- **Check hair rendering** (should have volume and detail)
- **Watch animations** (dancing should work)

---

## ✅ Success Checklist

After completing all steps:

- [ ] VRoid Studio installed
- [ ] 8 diverse avatars created
- [ ] All avatars saved in VRoid Studio
- [ ] All avatars exported as VRM files
- [ ] All VRM files converted to GLB
- [ ] All GLB files in `js/models/avatars/` directory
- [ ] `readyPlayerMeLoader.js` updated with file paths
- [ ] `useAvatarLibrary = true` in code
- [ ] Application runs without errors
- [ ] NPCs appear with VRoid avatars
- [ ] Performance is smooth (60fps)

---

## 🐛 Troubleshooting

### Issue: "Avatar file not found"
**Solution:** 
- Check file paths in `avatarLibrary` array
- Ensure GLB files are in `js/models/avatars/` directory
- Check file names match exactly (case-sensitive)

### Issue: "Avatars too big/small"
**Solution:**
- Adjust scale in `getAvatarScale()` method
- Change VRoid scale from `1.0` to `0.8` or `1.2`

### Issue: "Hair looks wrong"
**Solution:**
- VRoid hair uses transparency
- Check that materials have `transparencyMode` set
- Verify `renderingGroupId = 1` for hair meshes

### Issue: "Performance issues"
**Solution:**
- Reduce avatar count (use 5-6 instead of 8)
- Re-export avatars with "Standard" quality (not "High")
- Check console for errors

### Issue: "Avatars don't appear at all"
**Solution:**
- Check browser console for errors
- Verify `useAvatarLibrary = true`
- Test with single avatar first
- Check that GLB files are valid (open in Blender or online viewer)

---

## 🎓 Advanced Tips

### Mixing Avatar Types:
```javascript
this.avatarLibrary = [
    // VRoid avatars
    './js/models/avatars/vroid_01.glb',
    './js/models/avatars/vroid_02.glb',
    
    // Ready Player Me avatars
    'https://models.readyplayer.me/YOUR_ID.glb',
    
    // Mixamo avatars
    './js/models/avatars/mixamo_knight.glb',
];
```

### Custom Scaling Per Avatar:
```javascript
// Add to getAvatarScale() method:
if (avatarType === 'VRoid' && url.includes('vroid_01')) {
    return 0.9; // Make avatar #1 shorter
}
```

### Performance Optimization:
- Use fewer avatars for NPCs (5-6)
- Cache prevents re-downloading same avatar
- Avatars auto-dispose when player leaves

---

## 📚 Resources

- **VRoid Studio**: https://vroid.com/en/studio
- **VRoid Hub**: https://hub.vroid.com/
- **Full Guide**: See `docs/VROID_INTEGRATION_GUIDE_2025-10-18.md`
- **Avatar Options**: See `docs/AVATAR_LIBRARY_OPTIONS_2025-10-18.md`

---

## 🆘 Need Help?

1. Check full documentation in `docs/` folder
2. Review console for specific error messages
3. Test with single avatar before loading all
4. Verify GLB files are valid (use online viewer)

---

**Time to Create Your Club's Unique Avatars!** 🎨✨

Good luck and have fun customizing! Your club will look amazing with diverse, anime-styled VRoid avatars dancing on the floor.

---

**Last Updated:** October 18, 2025  
**Estimated Total Time:** 2 hours  
**Difficulty:** Beginner-Friendly
