# Spotlight Beam Visibility Fix - October 17, 2025

## Problem
User reported that spotlight patterns (RANDOM, STATIC DOWN, SYNC SWEEP) didn't seem to do anything - only floor reflections were moving. The actual volumetric light beams through the air were **too faint to see**.

## Root Cause
The spotlight beams WERE being created and animated correctly, but with alpha/emissive values too low to be clearly visible:
- **Beam alpha**: 0.15 (very transparent)
- **Beam glow alpha**: 0.08 (barely visible)
- **Emissive intensities**: 4.0 and 3.0 (dim)

This made the beams essentially invisible, so users only saw the floor light pools changing position (which are much brighter by design).

## Solution
Increased beam visibility **2x across the board**:

### Main Beam (Core Light Ray)
```javascript
// Before:
beamMat.emissiveColor = this.currentSpotColor.scale(0.7);
beamMat.emissiveIntensity = 4.0;
beamMat.alpha = 0.15;

// After:
beamMat.emissiveColor = this.currentSpotColor.scale(1.2); // +71% brighter
beamMat.emissiveIntensity = 6.0;                          // +50% intensity
beamMat.alpha = 0.30;                                     // 2x more opaque
```

### Beam Glow (Atmospheric Scatter)
```javascript
// Before:
beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.35);
beamGlowMat.emissiveIntensity = 3.0;
beamGlowMat.alpha = 0.08;

// After:
beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.6); // +71% brighter
beamGlowMat.emissiveIntensity = 5.0;                          // +67% intensity
beamGlowMat.alpha = 0.15;                                     // Nearly 2x more opaque
```

## Visual Impact
Users will now see:
- ✅ **Clear volumetric light beams** cutting through the air (like real concert lighting)
- ✅ **Visible beam movement** when patterns change (RANDOM/STATIC/SWEEP)
- ✅ **Sweeping animations** clearly visible as beams swing side-to-side
- ✅ **Atmospheric depth** with visible glow around beam cores
- ✅ **Better sense of 3D space** with light rays filling the club

## Pattern Behavior Now Visible

### Pattern 0: RANDOM
- 7 different movement patterns cycling every ~10 seconds
- Beams sweep in complex paths (circular, figure-8, cross, etc.)
- Clearly visible as beams dance around the room

### Pattern 1: STATIC DOWN
- All 6 beams point straight down from truss to dance floor
- Creates classic "downlight wash" effect
- Beams appear as vertical columns of light

### Pattern 2: SYNC SWEEP
- All 6 beams sweep left-to-right together in synchronized motion
- Most dramatic effect - all beams move as one
- Creates sweeping "searchlight" effect across the club

## Technical Details

### Material Properties
- **Material Type**: PBR (Physically Based Rendering)
- **Texture**: Radial gradient (bright center → transparent edge)
- **Rendering Group**: 1 (after opaque objects, before UI)
- **Transparency Mode**: Alpha Blend
- **Backface Culling**: Disabled (visible from all angles)
- **Lighting**: Disabled (self-illuminated/unlit)

### Beam Geometry
- **Shape**: Cone (narrow at fixture, wide at floor)
- **Top Diameter**: 0.25m (at fixture)
- **Bottom Diameter**: 2.0m (at floor/target)
- **Tessellation**: 16 segments (smooth cone)
- **Caps**: No caps (open-ended for proper transparency)

### Performance Impact
- **Negligible** - beams already existed, just increased visibility
- Same 6 beams x 2 layers (core + glow) = 12 meshes total
- Alpha blending cost unchanged (already using it)
- No additional draw calls

## Testing
After hard refresh (`Ctrl + Shift + R`):
1. Look at DJ booth area from dance floor
2. Click **PATTERN** button (row 3) to cycle modes
3. You should now SEE the beams:
   - **Magenta flash** = Beams cycling through complex patterns
   - **Cyan flash** = Beams pointing straight down
   - **Pink flash** = Beams sweeping side-to-side together
4. Try different **SPOT MODE** settings (row 2, right button):
   - Strobe+Sweep = Flashing beams while moving
   - Sweep Only = Smooth continuous movement
   - Strobe Static = Flashing beams at fixed positions
   - Static = Beams stay fixed (no movement)

## Related Files
- `js/club_hyperrealistic.js` - Lines 2165-2235 (beam creation), 3630-3710 (beam animation)
- Commit: `b2ecbc2` - "Increase spotlight beam visibility (2x brighter)"

## Future Enhancements
- Add "Beam Intensity" slider for user-adjustable brightness
- Implement fog/haze system for even more dramatic volumetric effects
- Add beam color temperature control (warm/cool lighting)
