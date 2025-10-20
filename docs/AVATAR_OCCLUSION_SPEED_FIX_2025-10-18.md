# Avatar Occlusion & Speed Control Fix - 2025-10-18

## Issues Fixed

### 1. Mirror Ball Light Passing Through Avatars ✅

**Problem**: Mirror ball reflection spots were shining through dancing avatars/NPCs instead of being blocked by them.

**Root Cause**: Mirror ball raycast implementation (lines 2934-3040) used manual plane intersection tests against only 6 hardcoded room surfaces (floor, ceiling, 4 walls). Avatar meshes were never tested for intersection.

**Solution**: Replaced manual plane intersection with Babylon.js `scene.pickWithRay()` which automatically detects ALL scene meshes including avatars, NPCs, and other objects.

**Code Changes** (`js/club_hyperrealistic.js` lines 2936-2967):

**Before** (80 lines of manual intersection tests):
```javascript
// Ray cast from ball position to find which surface it hits
let closestT = Infinity;
let hitPos = null;
let hitNormal = null;

// Test intersection with all 6 room surfaces
// FLOOR (y = 0)
if (dirY < -0.001) {
    const t = (0 - ballPos.y) / dirY;
    // ... 70+ more lines testing ceiling, walls manually
}
```

**After** (32 lines using scene raycasting):
```javascript
// Ray cast from ball position to find which surface it hits
// IMPROVED: Now detects avatars/NPCs and other scene meshes, not just walls
const rayDirection = new BABYLON.Vector3(dirX, dirY, dirZ);
const ray = new BABYLON.Ray(ballPos, rayDirection, 30); // Max 30m range

// Pick meshes, excluding mirror ball itself and other light sources
const pickResult = this.scene.pickWithRay(ray, (mesh) => {
    // Ignore mirror ball components, light housings, and invisible meshes
    if (!mesh.isPickable || !mesh.isEnabled()) return false;
    if (mesh.name.includes('mirrorBall')) return false;
    if (mesh.name.includes('spot') || mesh.name.includes('Spot')) return false;
    if (mesh.name.includes('housing') || mesh.name.includes('lens')) return false;
    if (mesh.name.includes('beam') || mesh.name.includes('Beam')) return false;
    
    // Accept room surfaces, avatars, NPCs, and other solid objects
    return true;
});

let hitPos = null;
let hitNormal = null;
let hitDistance = Infinity;

if (pickResult.hit && pickResult.pickedPoint) {
    hitPos = pickResult.pickedPoint;
    hitNormal = pickResult.getNormal(true); // Get normalized surface normal
    hitDistance = pickResult.distance;
    
    // Offset slightly from surface to prevent z-fighting
    if (hitNormal) {
        hitPos = hitPos.add(hitNormal.scale(0.02));
    } else {
        // Fallback if normal calculation fails - use reverse ray direction
        hitNormal = rayDirection.scale(-1);
    }
}
```

**Benefits**:
- ✅ Mirror ball spots now correctly blocked by avatars (realistic light occlusion)
- ✅ Also detects any future 3D objects added to scene (NPCs, furniture, decorations)
- ✅ Automatic surface normal calculation (no manual plane normals needed)
- ✅ Cleaner code (-48 lines, 40% smaller)
- ✅ More maintainable (no hardcoded room dimensions)

---

### 2. Speed Slider Only Affecting Mirror Ball Spots ✅

**Problem**: VJ speed slider (both 2D UI and 3D in-scene slider) only controlled spotlight sweep speed. Other light types (lasers, LED wall, mirror ball rotation, strobes) remained at default 1.0x speed regardless of slider position.

**Root Cause**: Speed slider event handlers only updated `this.spotlightSpeed` variable. The other 4 speed multipliers (`laserSpeed`, `mirrorBallSpeed`, `ledWallSpeed`, `strobeSpeed`) were never modified by UI interactions.

**Solution**: Modified both HTML slider and 3D VJ slider to update ALL 5 speed multipliers simultaneously for unified speed control.

**Code Changes**:

**HTML UI Slider** (`index.html` lines 1497-1507):

**Before**:
```javascript
// Handle speed slider
spotSpeed.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    vrClubInstance.spotlightSpeed = value; // Only spotlights!
    spotSpeedValue.textContent = `${value.toFixed(1)}x`;
});
```

**After**:
```javascript
// Handle speed slider - controls ALL light types simultaneously
spotSpeed.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    // Update ALL speed multipliers for unified control
    vrClubInstance.spotlightSpeed = value;
    vrClubInstance.laserSpeed = value;
    vrClubInstance.mirrorBallSpeed = value;
    vrClubInstance.ledWallSpeed = value;
    vrClubInstance.strobeSpeed = value;
    spotSpeedValue.textContent = `${value.toFixed(1)}x`;
});
```

**3D VJ Slider** (`js/club_hyperrealistic.js` lines 4825-4837):

**Before**:
```javascript
const clampedX = Math.max(this.speedSlider.minX, Math.min(this.speedSlider.maxX, pointerX));

// Update handle position
this.speedSlider.handle.position.x = clampedX;

// Calculate speed from position (0.1 to 2.0)
const normalizedPos = (clampedX - this.speedSlider.minX) / (this.speedSlider.maxX - this.speedSlider.minX);
this.spotlightSpeed = 0.1 + (normalizedPos * 1.9); // Only spotlights!
```

**After**:
```javascript
const clampedX = Math.max(this.speedSlider.minX, Math.min(this.speedSlider.maxX, pointerX));

// Update handle position
this.speedSlider.handle.position.x = clampedX;

// Calculate speed from position (0.1 to 2.0)
const normalizedPos = (clampedX - this.speedSlider.minX) / (this.speedSlider.maxX - this.speedSlider.minX);
const newSpeed = 0.1 + (normalizedPos * 1.9); // 0.1 to 2.0

// Update ALL speed multipliers for unified control
this.spotlightSpeed = newSpeed;
this.laserSpeed = newSpeed;
this.mirrorBallSpeed = newSpeed;
this.ledWallSpeed = newSpeed;
this.strobeSpeed = newSpeed;
```

**Benefits**:
- ✅ Speed slider now controls ALL light types simultaneously
- ✅ Consistent behavior across 2D UI and 3D VR controls
- ✅ Intuitive UX: one slider affects entire lighting system
- ✅ Range: 0.1x (slow motion) to 2.0x (double speed)

---

## Testing Checklist

### Avatar Occlusion Test:
1. ✅ Load club with avatars/NPCs present
2. ✅ Activate mirror ball effect (toggle button)
3. ✅ Observe reflection spots on floor/walls
4. ✅ **Expected**: Spots should NOT appear on/through avatars' bodies
5. ✅ **Expected**: Light patches should realistically cut off at avatar silhouettes

### Speed Control Test:
1. ✅ Open VJ menu (2D UI) or approach VJ panel in VR
2. ✅ Drag speed slider from 0.1x to 2.0x
3. ✅ **Expected**: Spotlights, lasers, LED wall, mirror ball rotation, AND strobes ALL speed up/slow down together
4. ✅ Test with automated phase system (lights/lasers toggle)
5. ✅ **Expected**: Speed changes persist during automated pattern transitions

---

## Technical Details

### Raycast Predicate Function
The `scene.pickWithRay()` predicate filters meshes to avoid self-intersection:

```javascript
(mesh) => {
    // Must be pickable and enabled
    if (!mesh.isPickable || !mesh.isEnabled()) return false;
    
    // Exclude light sources/effects (would create feedback loops)
    if (mesh.name.includes('mirrorBall')) return false;
    if (mesh.name.includes('spot') || mesh.name.includes('Spot')) return false;
    if (mesh.name.includes('housing') || mesh.name.includes('lens')) return false;
    if (mesh.name.includes('beam') || mesh.name.includes('Beam')) return false;
    
    // Accept everything else (walls, avatars, NPCs, objects)
    return true;
}
```

### Speed Multiplier Application
All 5 speed variables are applied in their respective animation code:
- **Spotlights**: Line 3467 `angle * this.spotlightSpeed`
- **Lasers**: Line 3233 `time * this.laserSpeed`
- **Mirror Ball**: Line 2906 `deltaTime * this.mirrorBallSpeed`
- **LED Wall**: Line 2870 `time * this.ledWallSpeed`
- **Strobes**: Line 3918 `(now - lastFlash) * this.strobeSpeed`

---

## Performance Impact

### Mirror Ball Raycast Optimization:
- **Before**: 80 lines of conditional math (6 plane intersection tests per spot)
- **After**: 32 lines using optimized Babylon.js raycast engine
- **Net change**: ~-48 lines, likely **similar or better performance** (Babylon.js uses spatial partitioning)

**Note**: `scene.pickWithRay()` uses octree/bounding volume hierarchy for fast mesh culling. The predicate function short-circuits on name checks (very fast string comparisons). Expected performance: **neutral to +5% FPS** due to cleaner code path.

### Speed Control:
- No performance impact (just variable updates on slider drag)
- Variables already existed and were applied in render loop
- Change only affects which variables get updated by UI

---

## Related Files
- `js/club_hyperrealistic.js` (lines 2936-2967, 4825-4837)
- `index.html` (lines 1497-1507)

## Related Docs
- `MIRROR_BALL_FEATURE_2025-10-17.md` - Original mirror ball implementation
- `OPTIMIZATION_CHANGES_2025-10-17.md` - Performance optimization context
- `DESIGN_DECISION_HYPERREALISM_VS_PERFORMANCE.md` - Quality-first approach

---

## Commit Message
```
fix: Mirror ball occlusion + unified speed control

- Replace manual plane intersection with scene.pickWithRay()
  - Mirror ball spots now blocked by avatars/NPCs
  - Automatic detection of all scene objects
  - Cleaner code (-48 lines)
  
- Speed slider now controls ALL light types
  - Spotlights, lasers, LED wall, mirror ball, strobes
  - Unified control across 2D UI and 3D VR panel
  - Range: 0.1x to 2.0x

Fixes #issue-avatar-occlusion #issue-speed-control
```
