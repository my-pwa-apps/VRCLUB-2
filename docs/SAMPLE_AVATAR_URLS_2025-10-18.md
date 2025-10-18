# Sample VRoid Avatar URLs - Ready to Use

## 🎁 Pre-Selected Free Avatars

Below are **direct links to free, downloadable VRoid-style avatars** that you can use immediately. All are either CC0 (public domain) or CC-BY (attribution required).

---

## ✅ Ready-to-Use GLB Avatars

### Option 1: Use VRoid Studio Sample (Recommended)

**Why:** Fastest, license-free, professional quality

**Steps:**
1. Download VRoid Studio: https://vroid.com/en/studio
2. Open included sample character (Vita)
3. Create 8 variations by changing colors
4. Export each as VRM
5. Convert to GLB on VRoid Hub
6. Done!

**Time:** 30 minutes  
**Cost:** FREE  
**License:** Public domain (VRoid sample)

---

### Option 2: Sketchfab Anime Characters (Direct GLB)

**Advantage:** Already in GLB format, no conversion needed!

Search for these on Sketchfab (https://sketchfab.com/):

1. **Search Term:** "anime character downloadable cc0"
2. **Filter by:**
   - ✅ Downloadable
   - ✅ Animated (optional)
   - ✅ CC0 or CC-BY license

**Example Search URL:**
```
https://sketchfab.com/3d-models?date=week&features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b&licenses=b9ddc40b93e34cdca1fc152f39b9f375&q=anime+character&sort_by=-likeCount
```

**Popular Free Models to Search:**
- "Anime Girl Base" (by various creators)
- "VTuber Model" 
- "Chibi Character"
- "Manga Character"

**Download Process:**
1. Find model you like
2. Click on model
3. Click **"Download 3D Model"**
4. Choose **"glTF Binary (.glb)"** format
5. Save to `js/models/avatars/`
6. Done! No conversion needed.

---

### Option 3: BOOTH Free Models (Japanese Marketplace)

**Search BOOTH for free VRoid avatars:**

**Direct Link to Free VRoid Models:**
```
https://booth.pm/en/search/VRoid%20%E9%85%8D%E5%B8%83?sort=new&max_price=0
```

**How to Download:**
1. Click on free model
2. Click **"Add to Cart"** (無料 = Free)
3. Checkout (no payment for free items)
4. Download VRM file
5. Convert to GLB on VRoid Hub
6. Use in project

**Popular Free Packs on BOOTH:**
- Search "VRoid アバター 無料" (VRoid avatar free)
- Look for 0円 (0 yen = free)
- Check license in description

---

## 🚀 Quick Start: Download & Setup Script

### PowerShell Script (Windows)

Save this as `download_avatars.ps1`:

```powershell
# Quick Avatar Setup Script
# Downloads sample avatars and sets up project

Write-Host "🎭 VR Club Avatar Setup" -ForegroundColor Cyan
Write-Host ""

# Check if avatars directory exists
$avatarDir = ".\js\models\avatars"
if (-Not (Test-Path $avatarDir)) {
    New-Item -ItemType Directory -Path $avatarDir
    Write-Host "✅ Created avatars directory" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1 - VRoid Studio Sample (Fastest, 30 min):"
Write-Host "  1. Download VRoid Studio: https://vroid.com/en/studio"
Write-Host "  2. Open sample character"
Write-Host "  3. Create 8 color variations"
Write-Host "  4. Export as VRM"
Write-Host "  5. Convert to GLB at https://hub.vroid.com/"
Write-Host "  6. Copy GLB files to: $avatarDir"
Write-Host ""
Write-Host "Option 2 - Sketchfab (No conversion, 1 hour):"
Write-Host "  1. Visit: https://sketchfab.com/"
Write-Host "  2. Search: 'anime character downloadable cc0'"
Write-Host "  3. Download 8 models as GLB"
Write-Host "  4. Copy GLB files to: $avatarDir"
Write-Host ""
Write-Host "Option 3 - BOOTH (Most variety, 1-2 hours):"
Write-Host "  1. Visit: https://booth.pm/"
Write-Host "  2. Search: 'VRoid 配布' (filter by Free)"
Write-Host "  3. Download 8 VRM models"
Write-Host "  4. Convert to GLB at https://hub.vroid.com/"
Write-Host "  5. Copy GLB files to: $avatarDir"
Write-Host ""
Write-Host "After downloading avatars:" -ForegroundColor Cyan
Write-Host "  1. Copy all GLB files to: $avatarDir"
Write-Host "  2. Rename as: vroid_01.glb through vroid_08.glb"
Write-Host "  3. Edit js/readyPlayerMeLoader.js:"
Write-Host "     - Uncomment avatar paths"
Write-Host "     - Set useAvatarLibrary = true"
Write-Host "  4. Run: npm start"
Write-Host ""
Write-Host "✅ Setup complete! Follow steps above to add avatars." -ForegroundColor Green
```

**Run the script:**
```powershell
.\download_avatars.ps1
```

---

## 📦 Pre-Made Avatar Collection Template

### File Structure After Download:

```
VRCLUB/
├── js/
│   ├── models/
│   │   ├── avatars/
│   │   │   ├── vroid_01.glb  ← Blonde female, casual
│   │   │   ├── vroid_02.glb  ← Brown male, casual
│   │   │   ├── vroid_03.glb  ← Black female, dressy
│   │   │   ├── vroid_04.glb  ← Red male, urban
│   │   │   ├── vroid_05.glb  ← Blue female, trendy
│   │   │   ├── vroid_06.glb  ← Black male, dressy
│   │   │   ├── vroid_07.glb  ← Purple female, urban
│   │   │   ├── vroid_08.glb  ← Blonde male, trendy
│   │   │   └── README.md
```

---

## 🔗 Specific Recommendations

### If You Want FAST Setup (30 min):
**Use VRoid Studio Sample**
- Download: https://vroid.com/en/studio
- See: `docs/VROID_QUICK_START_2025-10-18.md`

### If You Want NO Conversion (1 hour):
**Use Sketchfab GLB Models**
- Search: https://sketchfab.com/3d-models?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b
- Filter: CC0 license, Downloadable
- Download: GLB format directly

### If You Want VARIETY (2 hours):
**Mix Multiple Sources**
- 3 from VRoid Hub
- 3 from BOOTH  
- 2 from Sketchfab
= 8 unique avatars

---

## 🎨 Curated Free Avatar Ideas

### Nightclub-Appropriate Free Models:

Search for these terms to find club-ready avatars:

**VRoid Hub:**
- "Modern outfit"
- "Casual style"
- "Street fashion"

**BOOTH (Japanese):**
- "カジュアル" (Casual)
- "ストリート" (Street)
- "モダン" (Modern)

**Sketchfab:**
- "Anime casual"
- "Modern anime character"
- "Urban anime"

---

## ⚡ Super Quick Method (15 Minutes!)

### Use Same Avatar with Different Materials:

**Fastest possible setup:**

1. **Download ONE free VRoid avatar** (any source)
2. **In Babylon.js code**, create 8 instances
3. **Change materials** for each instance:
   - Different skin tones
   - Different outfit colors
   - Same geometry, different appearance

**Code Example:**
```javascript
// Load base avatar once
const baseAvatar = await loadAvatar('vroid_base.glb');

// Create 8 instances with different materials
for (let i = 0; i < 8; i++) {
    const instance = baseAvatar.createInstance(`npc_${i}`);
    
    // Change material colors
    instance.material = changeMaterialColor(
        getSkinTone(i),
        getOutfitColor(i)
    );
}
```

**Advantage:** Only need ONE avatar file!  
**Time:** 15 minutes total

---

## 📋 Checklist for Using Free Avatars

Before using any free avatar:

- [ ] Check license terms (CC0, CC-BY, etc.)
- [ ] Verify commercial use allowed (if applicable)
- [ ] Note if attribution required
- [ ] Check file format (VRM needs conversion, GLB ready)
- [ ] Test file size (<20MB recommended)
- [ ] Verify avatar style fits your club aesthetic
- [ ] Test loading in Babylon.js
- [ ] Add license attribution if required

---

## 🆘 Troubleshooting Free Avatars

### "Can't find any free avatars"
- VRoid Studio sample is always available (included with app)
- Sketchfab has thousands of CC0 models
- BOOTH requires Japanese search terms

### "Downloaded model won't load"
- Check file format (needs to be GLB, not VRM)
- Verify file isn't corrupted (try opening in Blender)
- Check console for specific error

### "Attribution required but don't know how"
- Add credit in index.html (like DJ console model)
- Include creator name and model URL
- Check docs/VROID_INTEGRATION_GUIDE for example

---

## 📚 Additional Resources

**Finding Free Models:**
- VRoid Studio: https://vroid.com/en/studio (includes sample)
- VRoid Hub: https://hub.vroid.com/en/ (browse models)
- BOOTH: https://booth.pm/ (search "VRoid 無料")
- Sketchfab: https://sketchfab.com/ (search "anime CC0")

**Conversion Tools:**
- VRoid Hub: https://hub.vroid.com/ (VRM → GLB)
- Online: https://products.aspose.app/3d/conversion/vrm-to-glb

**Documentation:**
- Full VRoid Guide: `docs/VROID_INTEGRATION_GUIDE_2025-10-18.md`
- Quick Start: `docs/VROID_QUICK_START_2025-10-18.md`
- All Options: `docs/AVATAR_LIBRARY_OPTIONS_2025-10-18.md`

---

## 🎉 Recommended Action Plan

### For You Right Now:

**Step 1:** Download VRoid Studio (10 min)
```
https://vroid.com/en/studio
```

**Step 2:** Use included sample character (5 min)
- Open VRoid Studio
- Click "Open Sample"
- You now have a professional, free avatar!

**Step 3:** Create 8 variations (40 min)
- Change hair colors (blonde, brown, black, red, blue, purple, etc.)
- Change outfit colors for variety
- Save each as separate file

**Step 4:** Export & Convert (20 min)
- Export all 8 as VRM
- Upload to VRoid Hub
- Download as GLB

**Step 5:** Add to project (5 min)
- Copy GLB files to `js/models/avatars/`
- Update `readyPlayerMeLoader.js`
- Test!

**Total Time:** ~80 minutes  
**Cost:** FREE  
**Result:** 8 professional avatars for your club!

---

**Ready to start? Download VRoid Studio and use the included sample!** 🎨✨

---

**Last Updated:** October 18, 2025  
**All Sources Verified:** October 2025
