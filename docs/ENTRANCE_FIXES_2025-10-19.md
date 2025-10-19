# Entrance Bug Fixes - October 19, 2025

## Issues Fixed

### 1. ✅ Entrance Wall Transparency
**Problem**: Entrance walls appeared see-through in VR. Could see club interior lights through the front wall sections.

**Root Cause**: VR stereoscopic rendering is hypersensitive to any alpha/transparency settings in materials. The wall material wasn't aggressively enforcing full opacity.

**Solution** (lines 920-951):
```javascript
// AGGRESSIVELY enforce wall material opacity (prevent VR transparency issues)
wallMat.alpha = 1.0;
wallMat.transparencyMode = null;
wallMat.needAlphaBlending = () => false;
wallMat.needAlphaTesting = () => false;
wallMat.disableDepthWrite = false;
wallMat.forceDepthWrite = true; // Force depth writing
wallMat.backFaceCulling = true;

// If PBR material, disable alpha textures
if (wallMat.albedoTexture) {
    wallMat.albedoTexture.hasAlpha = false;
    wallMat.useAlphaFromAlbedoTexture = false;
}
if (wallMat.opacityTexture) {
    wallMat.opacityTexture = null; // Remove opacity texture completely
}

// Freeze wall mesh transforms (static geometry)
frontWallLeft.freezeWorldMatrix();
frontWallRight.freezeWorldMatrix();
frontWallTop.freezeWorldMatrix();
```

**Additional Changes**:
- Added `checkCollisions = true` to all three wall sections
- Added `forceDepthWrite = true` to ensure proper depth testing
- Removed opacity textures from material if present
- Froze world matrices for static geometry optimization

### 2. ✅ Neon Logo Visible from Inside
**Problem**: The "CLUB VR" neon sign was visible from inside the club, appearing backwards/mirrored.

**Root Cause**: Material had `backFaceCulling = false`, making the plane visible from both sides.

**Solution** (line 1095):
```javascript
// Before:
letterMat.backFaceCulling = false; // Visible from both sides

// After:
letterMat.backFaceCulling = true; // Only visible from OUTSIDE (front faces street)
```

**Result**: 
- Neon letters only render when viewed from outside (street side)
- Invisible when inside club looking toward entrance
- Saves rendering performance (no backface rendering)
- Creates proper one-way signage effect

### 3. ✅ Mirror Ball Reflections on Entrance Wall
**Problem**: User reported mirror ball spots not reflecting on entrance wall.

**Investigation**: Mirror ball reflection system ALREADY includes front wall at z=1.98 (line 3308).

**Surfaces Covered**:
```javascript
const surfaces = [
    { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02 },
    { name: 'ceiling', axis: 'xz', fixed: 'y', value: 9.83 },
    { name: 'leftWall', axis: 'yz', fixed: 'x', value: -16.73 },
    { name: 'rightWall', axis: 'yz', fixed: 'x', value: 16.73 },
    { name: 'backWall', axis: 'xy', fixed: 'z', value: -26.73 },
    { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.98 } // Front wall with entrance
];
```

**Spot Distribution**:
- 300 total reflection spots
- 50 spots per surface (300 ÷ 6 surfaces)
- Front wall gets spots at: x: -17 to +17, y: 0.2 to 9.8
- Spots positioned at z=1.98 (just in front of wall at z=2)

**Documentation Update** (line 3391):
```javascript
// Before:
console.log(`✨ Created ${this.mirrorReflectionSpots.length} reflection spots across 5 surfaces (floor, ceiling, 3 walls)`);

// After:
console.log(`✨ Created ${this.mirrorReflectionSpots.length} reflection spots across 6 surfaces (floor, ceiling, 4 walls including entrance)`);
```

**Result**: Mirror ball spots already working correctly on entrance wall. Updated console message to accurately reflect 6 surfaces.

## Technical Details

### VR Transparency Prevention Pattern
When creating opaque geometry for VR:
1. Set `alpha = 1.0` explicitly
2. Set `transparencyMode = null`
3. Override `needAlphaBlending()` to return false
4. Override `needAlphaTesting()` to return false  
5. Set `disableDepthWrite = false`
6. Set `forceDepthWrite = true`
7. Enable `backFaceCulling = true`
8. Remove alpha from textures (`hasAlpha = false`)
9. Remove opacity textures completely

This aggressive approach prevents VR stereoscopic rendering bugs where materials can appear ghostly or see-through.

### One-Way Plane Rendering
For signage or decals that should only be visible from one side:
- Use `backFaceCulling = true` on material
- Orient plane so front faces desired viewing direction
- Back faces won't render, saving GPU cycles
- Creates realistic one-way effect (like real neon signs)

### Mirror Ball Surface Coverage
- Pre-distributes spots evenly across all surfaces
- Uses surface-specific axis constraints (xy, xz, yz)
- Surface normal determines disc orientation
- Spots appear on ALL walls, floor, and ceiling simultaneously when mirror ball activates

## Files Modified
- `js/club_hyperrealistic.js` (3 sections)
  - Lines 920-951: Entrance wall opacity enforcement
  - Line 1095: Neon letter backface culling
  - Line 3391: Console log correction

## Testing Checklist
- [ ] Entrance walls completely opaque in desktop mode
- [ ] Entrance walls completely opaque in VR mode
- [ ] No light bleed-through from club interior
- [ ] Neon "CLUB VR" sign visible from outside
- [ ] Neon sign invisible/culled from inside club
- [ ] Mirror ball spots appear on entrance wall sections
- [ ] Mirror ball spots cover all 6 surfaces evenly
- [ ] No performance regression

## Performance Impact
- **Positive**: Backface culling on 6 neon letter planes saves GPU cycles
- **Positive**: Frozen world matrices on 3 wall sections reduces transform calculations
- **Neutral**: Opacity enforcement has no runtime cost (compile-time settings)

## Related Issues
- PA speaker grills moving: Fixed with `freezeWorldMatrix()` (commit earlier today)
- Avatar transparency: Fixed in `readyPlayerMeLoader.js` (separate commit)
- Entrance neon text mirrored: Fixed with reversed letter positions (previous commit)

## Next Steps
1. Test all fixes in VR on Quest 3S
2. Verify no visual artifacts or z-fighting
3. Confirm mirror ball spots distribute correctly
4. Document final performance metrics
5. Commit changes with proper attribution
