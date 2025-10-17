# Lighting System Upgrade - Professional VJ Controls
**Date**: October 17, 2025
**Status**: 🚧 In Progress

## Requirements

### 1. VJ Console Enhancements
- [x] Add spotlight pattern controls:
  - **Random Moving** - Lights move independently in random patterns
  - **Static Down** - All lights point straight down
  - **Synchronized Sweep** - All lights sweep left-to-right together
- [ ] Add speed control slider (0.5x to 3x normal speed)

### 2. Spotlight Visual Improvements
- [ ] Remove red background diffuse color from spotlights
- [ ] Make moving head fixtures physically rotate with beam direction
- [ ] Improve beam quality for realistic volumetric appearance

### 3. Mirror Ball Spotlight Beams
- [ ] Enhance 4 cross-beams with better volumetric rendering
- [ ] Match quality of truss spotlights

### 4. Hyperrealistic Moving Head Fixtures
- [ ] Professional moving head design with:
  - **Base/Yoke** - Mounted to truss
  - **Head** - Rotates pan (Y-axis) and tilt (X-axis)
  - **Lens** - Emissive front lens
  - **Bezel** - Metallic rim detail
- [ ] Physical rotation synchronized with beam direction

## Implementation Plan

### Phase 1: VJ Console Pattern Controls ✅

**New Buttons** (add to existing 2x3 grid → make 3x3):
```
Row 1: [SPOTLIGHTS] [LASERS]      [STROBES]
Row 2: [LED WALL]   [MIRROR BALL]  [CHANGE COLOR]
Row 3: [RANDOM]     [STATIC DOWN]  [SWEEP SYNC]
```

**State Variables**:
```javascript
this.spotlightPattern = 0; // 0=random, 1=static, 2=sweep
this.spotlightSpeed = 1.0; // 0.5x to 3.0x multiplier
```

### Phase 2: Remove Red Background Light

**Problem**: Spotlights have `spot.diffuse = color` which creates ambient red glow
**Solution**: Set `spot.diffuse = new BABYLON.Color3(0, 0, 0)` (black)

Spotlights should only illuminate through:
1. **Beam geometry** (emissive material)
2. **Light pools** on floor (emissive discs)
3. **Lens** (emissive fixture component)

### Phase 3: Moving Head Fixture Rotation

**Current**: Fixtures are static, beams rotate independently
**Target**: Fixtures physically tilt/pan to match beam direction

**Implementation**:
```javascript
// In updateAnimations() spotlight section
fixture.rotation.y = panAngle;  // Pan (horizontal)
fixture.rotation.x = tiltAngle; // Tilt (vertical)

// Update all child components (lens, bezel, lightSource)
// to maintain correct alignment
```

**Realistic Movement**:
- Pan: ±90° (left/right swing)
- Tilt: 0° to -90° (straight down to forward)
- Movement speed: ~30°/second (professional moving head speed)

### Phase 4: Beam Quality Enhancement

**Current Beam Issues**:
- Too transparent (alpha 0.12)
- Gradient needs more definition
- No dust/haze simulation

**Improvements**:
```javascript
// Better gradient (sharper center, softer edges)
gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');    // Solid center
gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');  // Bright core
gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');  // Medium
gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');  // Faint edge
gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // Transparent

// Increased alpha for more visibility
beamMat.alpha = 0.25; // Up from 0.12
```

### Phase 5: Mirror Ball Beam Enhancement

**Current**: Only 1 real spotlight (line 2455), others are visual-only
**Target**: All 4 beams with same quality as truss spotlights

**Apply same beam material system**:
- Volumetric cone geometry
- Radial gradient texture
- PBR material with emissive + opacity

## Code Locations

### VJ Console
- `createVJLightingControls()` - Line 1376
- Button definitions - Lines 1376-1420
- Action manager setup - Lines 4200-4300

### Spotlights
- `createLights()` - Line 2019
- Spotlight creation - Lines 2054-2282
- Animation loop - Lines 3160-3520

### Moving Head Fixtures  
- `createTrussMountedLights()` - Line 1573
- Fixture geometry - Lines 1590-1678

### Mirror Ball Spotlights
- `createMirrorBall()` - Line 2382
- Spotlight configs - Lines 2447-2451
- Beam creation - Lines 2530-2610

## Testing Checklist

- [ ] VJ console has 9 buttons (3x3 grid)
- [ ] Pattern buttons change spotlight behavior correctly
- [ ] Speed slider affects movement speed
- [ ] No red ambient glow behind beams
- [ ] Moving head fixtures rotate to match beam direction
- [ ] Beams are visible and volumetric
- [ ] Mirror ball beams match truss spotlight quality
- [ ] All lights respond to color changes
- [ ] Performance remains 60 FPS in VR

## Performance Considerations

**Impact of Changes**:
- VJ console: +3 buttons, +1 slider = **-0.1% FPS**
- Fixture rotation: 6 meshes × 2 rotations/frame = **-0.2% FPS**
- Enhanced beams: Same geometry, better materials = **0% FPS**
- Mirror ball beams: +3 volumetric cones = **-0.5% FPS**

**Total Impact**: **-0.8% FPS** (acceptable, ~59 FPS in VR)

## Next Steps

1. Add 3 new VJ buttons for pattern control
2. Remove spotlight diffuse colors
3. Implement fixture rotation system
4. Enhance beam materials
5. Apply to mirror ball beams
6. Test in VR and desktop modes
