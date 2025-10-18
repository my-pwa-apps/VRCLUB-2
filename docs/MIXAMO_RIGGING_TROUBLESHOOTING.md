# Mixamo Rigging Troubleshooting - "Plank Movement" Issue

## 🚨 Problem: Avatar Moves Like a Plank (No Joint Movement)

**Symptoms**:
- Upload avatar to Mixamo
- Add dance animation
- Avatar moves but limbs don't bend
- Whole body moves as one rigid piece
- Looks like a "plank" or "statue" moving

**Cause**: Mixamo's auto-rigging **failed to detect joints** properly.

---

## ✅ Solution: Proper Mixamo Upload Workflow

### **Step 1: Verify Avatar Has Rigging**

Ready Player Me avatars **should be pre-rigged**, but let's verify:

1. **Open GLB in a viewer**:
   - Online: https://gltf-viewer.donmccurdy.com/
   - Or use Blender
2. **Check for skeleton**:
   - Look for bone structure
   - Should see: Hips, Spine, Arms, Legs bones
3. **If no skeleton visible**:
   - Avatar is NOT rigged
   - Download new avatar from Ready Player Me

---

### **Step 2: Use Ready Player Me Avatar Directly**

**Skip FBX conversion to Mixamo!** Use this workflow instead:

#### **Option A: Ready Player Me with Built-in Animations (Recommended)**

Ready Player Me has **animation packs** you can purchase:
1. Visit: https://readyplayer.me/
2. Purchase animation pack (optional)
3. Download avatar with animations included
4. Use directly in VR Club (already GLB format)

**Cost**: Animation packs are paid, but high quality and pre-rigged.

---

#### **Option B: Use Pre-Animated GLB from Other Sources**

Skip Mixamo entirely and use avatars that **already have animations**:

1. **Sketchfab** (some include animations):
   - Visit: https://sketchfab.com/
   - Search: "animated character downloadable"
   - Filter: CC0 or CC-BY license, with animations
   - Download GLB format directly
   
2. **Mixamo Characters** (pre-made):
   - Visit Mixamo
   - Browse "Characters" (not upload)
   - Select pre-made character
   - Add animation
   - Download FBX → Convert to GLB
   - These are already rigged by Mixamo!

---

### **Step 3: Fix Auto-Rigging in Mixamo (If Using Custom Avatar)**

If you MUST use Mixamo with your custom avatar, try these fixes:

#### **Fix 1: Check T-Pose or A-Pose**

Mixamo auto-rigging works best with specific poses:

**T-Pose** (Recommended):
- Arms straight out to sides (90° angle)
- Legs straight, feet together
- Head facing forward

**A-Pose** (Alternative):
- Arms at 45° angle (like letter A)
- Legs straight, feet together

**Problem**: If your Ready Player Me avatar is in a different pose, Mixamo can't detect joints.

**Solution**: 
1. Download avatar in T-pose or A-pose
2. Or use Blender to adjust pose before uploading

---

#### **Fix 2: Manual Rigging Markers**

When uploading to Mixamo, you can **manually place markers**:

1. **Upload avatar to Mixamo**
2. **Choose "Manual" rigging** (not auto)
3. **Place markers** on key joints:
   - Chin
   - Wrists (left/right)
   - Elbows (left/right)
   - Groin
   - Knees (left/right)
   - Hands (optional)
4. **Continue** with rigging
5. **Test animation** before downloading

**This takes longer but is more accurate.**

---

#### **Fix 3: Use Blender to Prepare Avatar**

If Mixamo keeps failing, prepare avatar in Blender first:

1. **Open Blender**
2. **Import your GLB avatar**
3. **Check existing armature**:
   - Should see bone structure in hierarchy
   - If no bones, avatar is not rigged
4. **If rigged, export with visible T-pose**:
   - Pose mode → Reset to T-pose
   - File → Export → FBX
   - Check "Apply Modifiers"
   - Upload FBX to Mixamo
5. **If not rigged, manually rig**:
   - Add Armature
   - Parent bones to mesh
   - Export as FBX
   - Upload to Mixamo

---

### **Step 4: Test Rigging Before Downloading**

**CRITICAL**: Always preview animation in Mixamo BEFORE downloading!

1. **Add animation** (Hip Hop Dancing)
2. **Click Play** (▶️) in Mixamo viewer
3. **Watch carefully**:
   - ✅ Arms bend at elbows?
   - ✅ Legs bend at knees?
   - ✅ Hips rotate?
   - ✅ Head moves naturally?
4. **If still "plank-like"**:
   - ❌ DON'T download
   - Try different rigging method
   - Or use pre-made Mixamo character

---

## 🎯 Recommended Workflow (Easiest)

### **Use Mixamo's Pre-Made Characters**

Instead of uploading custom avatar, use Mixamo's library:

1. **Visit Mixamo**: https://www.mixamo.com/
2. **Click "Characters"** (top menu)
3. **Select a character** (100+ available):
   - Malcolm (default, very reliable)
   - Amy
   - Jasper
   - Etc.
4. **Add animation** (Hip Hop Dancing)
5. **Preview** - should move perfectly!
6. **Download**:
   - Format: FBX with skin
   - FPS: 30
7. **Convert FBX to GLB**
8. **Use in VR Club**

**Pros**:
- ✅ Already perfectly rigged
- ✅ Guaranteed to work
- ✅ Professional quality
- ✅ No rigging issues

**Cons**:
- ⚠️ Not your custom avatar
- ⚠️ Less unique

---

## 🔍 Debugging Checklist

If avatar still moves like a plank:

### **In Mixamo Preview**:
- [ ] Can you see skeleton/bones when animation plays?
- [ ] Do elbows bend when arms move?
- [ ] Do knees bend when legs move?
- [ ] Does spine twist/bend?
- [ ] Does head turn independently?

**If NO to any above**: Rigging failed, try:
1. Manual marker placement
2. Different avatar pose (T-pose)
3. Use pre-made Mixamo character instead

---

### **After Converting to GLB**:
- [ ] Open GLB in viewer (gltf-viewer.donmccurdy.com)
- [ ] Can you see bone structure?
- [ ] Does animation play correctly in viewer?
- [ ] Are there multiple animation tracks?

**If animation works in viewer but not VR Club**: Code issue, not rigging.

---

## 🛠️ Alternative Solutions

### **Solution 1: Use Mixamo Character Library**

**Fastest working solution**:
1. Mixamo → Characters → Malcolm
2. Add Hip Hop Dancing
3. Download FBX
4. Convert to GLB
5. ✅ Works perfectly!

---

### **Solution 2: Use Ready Player Me Animations**

**If you want custom avatar**:
1. Create on Ready Player Me
2. Purchase animation pack (optional)
3. Download with animations
4. ✅ No Mixamo needed!

---

### **Solution 3: Use Static Avatars (No Animation)**

**Simplest option**:
1. Use avatars without animations
2. They'll stand still but won't "plank"
3. Physics and multiplayer still work
4. Add animations later when working

---

## 📋 Common Issues & Fixes

### **Issue**: "Auto-rig failed"
**Fix**: Use manual marker placement or pre-made character

### **Issue**: "Arms don't move but legs do"
**Fix**: Re-upload with arms in T-pose (90° angle)

### **Issue**: "Character is too small/large in Mixamo"
**Fix**: Use scale slider in Mixamo before downloading

### **Issue**: "Animation is too fast/slow"
**Fix**: Adjust FPS on download (try 24 or 30)

### **Issue**: "Character twists weirdly"
**Fix**: Check for duplicate bones in Blender

---

## ✅ Working Test Case

**To verify your workflow works**:

1. **Download "Malcolm" from Mixamo** (pre-made character)
2. **Add "Hip Hop Dancing"** animation
3. **Download FBX**
4. **Convert to GLB**: https://products.aspose.app/3d/conversion/fbx-to-glb
5. **Open in GLB viewer**: Should dance perfectly
6. **Use in VR Club**: Should work!

**If this works**: Workflow is correct, your custom avatar has rigging issue.  
**If this fails**: Converter or code issue.

---

## 🎯 Final Recommendations

### **For Best Results**:

1. **Start with Mixamo character** (Malcolm) to verify workflow
2. **Then try custom Ready Player Me avatar**
3. **If custom fails, use manual rigging markers**
4. **Or use Ready Player Me animation packs instead**

### **Quick Win**:
Download pre-animated character from Sketchfab:
- Already rigged ✅
- Already animated ✅
- Already GLB format ✅
- No conversion needed ✅

Search: https://sketchfab.com/3d-models?features=downloadable&animated=true&sort_by=-likeCount

---

## 🔗 Useful Resources

**Testing Tools**:
- glTF Viewer: https://gltf-viewer.donmccurdy.com/
- Babylon.js Sandbox: https://sandbox.babylonjs.com/

**Converters**:
- Aspose: https://products.aspose.app/3d/conversion/fbx-to-glb
- CloudConvert: https://cloudconvert.com/fbx-to-glb

**Tutorials**:
- Mixamo Auto-Rig Tutorial: YouTube "Mixamo auto rig tutorial"
- Blender Rigging Basics: YouTube "Blender rigging tutorial"

---

## 💡 Pro Tips

1. **Always test in Mixamo preview** before downloading
2. **Use Malcolm first** to verify workflow
3. **Check T-pose** is correct
4. **Manual markers** give best results for custom avatars
5. **Sketchfab pre-animated** = zero hassle

---

**Still having issues?** Try the **Mixamo character library** (Malcolm) as a working baseline, then debug from there.

---

**Last Updated**: October 18, 2025  
**Status**: Common issue with custom avatar uploads to Mixamo
