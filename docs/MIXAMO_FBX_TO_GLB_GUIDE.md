# Mixamo FBX to GLB Conversion Guide

## ⚠️ Important Note

**Mixamo only exports FBX format** - you must convert to GLB for Babylon.js!

This guide shows you the **easiest ways** to convert Mixamo FBX animations to GLB format for your VR Club avatars.

---

## 🎯 Quick Workflow Overview

```
Avatar (GLB) → Mixamo (auto-rig) → Add Animation → Download (FBX) 
    → Convert to GLB → Use in VR Club ✅
```

**Total Time**: ~45 minutes (including conversion)

---

## 📋 Step-by-Step Guide

### **Step 1: Prepare Avatar**

1. **Get Ready Player Me avatar**:
   - Visit: https://readyplayer.me/avatar
   - Create custom avatar
   - Download as GLB
   - Save to desktop (for easy access)

---

### **Step 2: Upload to Mixamo**

1. **Visit Mixamo**: https://www.mixamo.com/
2. **Sign in** with Adobe account (free)
3. **Click "Upload Character"**
4. **Select your avatar GLB file**
5. **Wait for auto-rigging** (~2 minutes)
   - Mixamo automatically detects skeleton
   - No manual rigging needed!

---

### **Step 3: Add Animation**

1. **Search for animations**:
   - Search bar: "hip hop dance"
   - Or browse: Animations → Dancing
2. **Preview animations**:
   - Click animation to preview on your avatar
   - Try different ones to find what you like
3. **Recommended for nightclub**:
   - Hip Hop Dancing (energetic)
   - Samba Dancing (Latin vibes)
   - Silly Dancing (fun)
   - Capoeira (acrobatic)
   - Wave Hip Hop Dance (smooth)

---

### **Step 4: Download FBX**

1. **Click "Download"** button (top right)
2. **Settings**:
   - Format: **FBX for Unity (.fbx)** ⚠️ (only option)
   - Skin: **With Skin** ✅ (IMPORTANT!)
   - Frames per second: **30**
   - Keyframe Reduction: None
3. **Click "Download"**
4. **Save FBX file** to desktop

---

### **Step 5: Convert FBX to GLB**

#### **Option A: Online Converter (Recommended - Easiest)**

**Using Aspose (Free, No Account)**:

1. **Visit**: https://products.aspose.app/3d/conversion/fbx-to-glb
2. **Upload FBX file**:
   - Click "Choose file"
   - Select downloaded FBX
3. **Click "Convert"**
4. **Wait** (~30 seconds - 2 minutes depending on file size)
5. **Download GLB file**

**Alternative Online Converters**:
- https://anyconv.com/fbx-to-glb-converter/
- https://cloudconvert.com/fbx-to-glb
- https://convertio.co/fbx-glb/

---

#### **Option B: Blender (More Control)**

**If you have Blender or want full control**:

1. **Download Blender**: https://www.blender.org/ (free)
2. **Install and launch**
3. **Delete default cube** (select and press X)
4. **Import FBX**:
   - File → Import → FBX (.fbx)
   - Select Mixamo FBX file
   - Click "Import FBX"
5. **Check animation**:
   - Press Spacebar to play animation
   - Verify it looks correct
6. **Export to GLB**:
   - File → Export → glTF 2.0 (.glb/.gltf)
   - Format: **glTF Binary (.glb)** ✅
   - Check **"Include Animations"** ✅
   - Remember export location
   - Click "Export glTF 2.0"
7. **Done!** GLB file created

---

### **Step 6: Add to VR Club**

1. **Copy GLB file** to:
   ```
   VRCLUB/js/models/avatars/dancing_avatar.glb
   ```

2. **Update code** in `js/readyPlayerMeLoader.js`:
   ```javascript
   this.avatarLibrary = [
       './js/models/avatars/dancing_avatar.glb',
   ];
   this.useAvatarLibrary = true; // Already enabled!
   ```

3. **Test**:
   ```powershell
   npm start
   ```

4. **Check console** for:
   ```
   ✅ Loaded Ready Player Me avatar with 47 meshes
   🎬 Loaded 3 animations for Ready Player Me avatar
   💃 Found 1 dance animation(s)
   🎵 Playing dance animation: HipHopDancing
   ```

---

## ⚡ Quick Troubleshooting

### **"Converted GLB has no animations"**

**Cause**: Converter stripped animations.

**Solutions**:
1. Try different online converter
2. Use Blender and ensure "Include Animations" is checked
3. Check FBX download had "With Skin" enabled

---

### **"Animation looks weird/broken after conversion"**

**Cause**: Skeleton mismatch or bad conversion.

**Solutions**:
1. Re-download from Mixamo with "With Skin" checked
2. Use Blender for conversion (more reliable)
3. Try different animation
4. Ensure avatar is humanoid (not custom skeleton)

---

### **"File size too large after conversion"**

**Normal sizes**:
- Avatar only: 5-15 MB
- Avatar + 1 animation: 10-25 MB
- Avatar + multiple animations: 20-40 MB

**If too large** (>50 MB):
1. Use Blender export
2. Enable compression in export settings
3. Reduce keyframes (if possible)

---

### **"Converter takes forever"**

**Solutions**:
1. Try different online converter
2. Check file size (large FBX = longer conversion)
3. Use Blender (local, faster)

---

## 📊 Format Comparison

| Format | Mixamo Export | Babylon.js Support | Conversion Needed |
|--------|---------------|-------------------|-------------------|
| **FBX** | ✅ Yes | ❌ No | ✅ Yes (to GLB) |
| **GLB** | ❌ No | ✅ Yes | ❌ No |
| **DAE** | ✅ Yes | ⚠️ Limited | ⚠️ Complex |

**Recommendation**: Always convert Mixamo FBX to GLB for Babylon.js.

---

## 🎨 Multiple Animations Workflow

Want multiple dances on one avatar?

### **Using Blender (Advanced)**:

1. **Import avatar GLB** (base)
2. **Import first FBX** animation
3. **Import second FBX** animation (append to existing)
4. **Repeat** for more animations
5. **Export single GLB** with all animations
6. System will randomly pick one to play

---

## 🔗 Useful Links

### **Converters**:
- **Aspose (Recommended)**: https://products.aspose.app/3d/conversion/fbx-to-glb
- **AnyConv**: https://anyconv.com/fbx-to-glb-converter/
- **CloudConvert**: https://cloudconvert.com/fbx-to-glb

### **Tools**:
- **Mixamo**: https://www.mixamo.com/
- **Blender**: https://www.blender.org/
- **Ready Player Me**: https://readyplayer.me/

### **Documentation**:
- **Full Guide**: `AVATAR_ANIMATIONS_GUIDE.md`
- **Implementation**: `AVATAR_PHYSICS_ANIMATIONS_SUMMARY.md`

---

## ✅ Conversion Checklist

Before using converted GLB:

- [ ] Downloaded FBX from Mixamo **with skin**
- [ ] Converted FBX to GLB format
- [ ] File size reasonable (<30 MB)
- [ ] Copied to `js/models/avatars/` folder
- [ ] Updated `readyPlayerMeLoader.js` avatarLibrary
- [ ] Set `useAvatarLibrary = true`
- [ ] Tested with `npm start`
- [ ] Checked console for animation detection
- [ ] Avatar dances in scene! 💃

---

## 💡 Pro Tips

### **Tip 1: Batch Download**
Download multiple FBX files from Mixamo before converting - then batch convert them all at once.

### **Tip 2: Name Files Clearly**
```
dancing_avatar_hiphop.fbx
dancing_avatar_samba.fbx
dancing_avatar_breakdance.fbx
```

### **Tip 3: Test Before Converting All**
Convert ONE animation first, test in VR Club, then convert the rest if it works.

### **Tip 4: Keep FBX Files**
Save original FBX files in case you need to re-convert with different settings.

### **Tip 5: Use Blender for Quality**
Online converters are quick but Blender gives you more control and better results.

---

## 🎯 Summary

**The Process**:
1. ✅ Create avatar on Ready Player Me
2. ✅ Upload to Mixamo for auto-rigging
3. ✅ Add dance animation
4. ✅ Download FBX (with skin)
5. ✅ Convert FBX → GLB (online or Blender)
6. ✅ Copy to project
7. ✅ Update code
8. ✅ Dance! 💃

**Time**: 45 minutes total  
**Cost**: FREE (all tools are free)  
**Result**: Animated dancing avatar in your VR nightclub!

---

**Need help?** See full documentation in:
- `docs/AVATAR_ANIMATIONS_GUIDE.md`
- `docs/AVATAR_PHYSICS_ANIMATIONS_SUMMARY.md`

---

**Last Updated**: October 18, 2025  
**Tested**: Mixamo → Aspose Converter → Babylon.js VR Club ✅
