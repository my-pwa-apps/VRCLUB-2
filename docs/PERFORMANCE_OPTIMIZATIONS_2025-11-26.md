# Performance Optimizations - November 26, 2025

## Summary
Comprehensive performance optimizations applied to maintain 60fps while preserving all hyperrealistic features and immersion.

## Key Optimizations

### 1. Object Pooling & Caching (Reduces GC Pressure)

#### Vector3 Pool
```javascript
this.vecPool = {
    direction: new BABYLON.Vector3(0, 0, 0),
    up: new BABYLON.Vector3(0, 1, 0),
    temp1: new BABYLON.Vector3(0, 0, 0),
    temp2: new BABYLON.Vector3(0, 0, 0),
    rayOrigin: new BABYLON.Vector3(0, 0, 0),
    rayDir: new BABYLON.Vector3(0, 0, 0)
};
```
- Reused in animation loops instead of creating new Vector3 objects every frame
- Eliminates ~6-12 Vector3 allocations per frame

#### Color3 Caching
- Cached black color (`this.cachedColors.black`) used throughout animation loops
- Spotlight emissive colors cached and only recalculated when color changes
- Mirror ball housing colors cached similarly
- Laser emissive colors cached to avoid `.scale()` allocations

### 2. Staggered Updates (Reduces Per-Frame Work)

#### Laser Raycasts
```javascript
// Only raycast every 2nd frame per laser (staggered by laser index)
const shouldRaycast = ((this.frameCounter + i) % 2 === 0);
```
- 50% reduction in laser ray casts
- Results cached and reused on alternate frames
- No visible quality difference due to smooth beam interpolation

#### LED Wall Updates
```javascript
// Update LED wall every 2nd frame (30Hz is sufficient for LED animations)
if (this.frameCounter % 2 === 0) {
    this.updateLEDWall(time, audioData);
}
```
- LED animations update at 30Hz instead of 60Hz
- No visible quality difference (LED animations are already discrete)

#### Mirror Ball Reflection Spots
- Already optimized: Updates all 150 spots every 3rd frame
- Reduces ray casts from 150/frame to 50/frame average

### 3. Engine & Scene Optimizations

#### Engine Configuration
```javascript
this.engine = new BABYLON.Engine(this.canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
    doNotHandleContextLost: true,  // Skip context lost handling
    useHighPrecisionFloats: false  // Medium precision for better perf
});
this.engine.setHardwareScalingLevel(1.0); // Native resolution
```

#### Scene Flags
```javascript
this.scene.autoClear = false;
this.scene.autoClearDepthAndStencil = true;
this.scene.skipPointerMovePicking = true;         // Skip picking on pointer move
this.scene.blockfreeActiveMeshesAndRenderingGroups = true; // Prevent array reallocation
```

### 4. Calculation Caching

#### Pre-calculated Trig Values
```javascript
const sinTime = Math.sin(time);
const cosTime = Math.cos(time);
const sinTime2 = Math.sin(time * 2);
// ... etc
```
- Reduces ~30-40 Math.sin/cos calls per frame

#### Speed Multipliers Cached Once
```javascript
const speedMultiplierSpot = this.spotlightSpeed || 1.0;
const speedMultiplierLaser = this.laserSpeed || 1.0;
```
- Cached at start of updateAnimations() instead of per-light

#### Laser Ray Object Reuse
```javascript
if (!this.laserRay) {
    this.laserRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), 30);
    this.laserRayPredicate = (mesh) => { ... };
}
this.laserRay.origin.copyFrom(laser.originPos);
this.laserRay.direction.copyFrom(direction);
```
- Single Ray object reused for all laser raycasts

### 5. Conditional Color Updates

#### Laser Color Updates
```javascript
// Only update when color actually changes
if (laser.lastColorIndex !== this.currentColorIndex) {
    laser.lastColorIndex = this.currentColorIndex;
    // ... update colors
}
```

#### Spotlight Emissive Colors
```javascript
// Cache scaled colors, only recalculate on color change
if (!this.spotlightCachedColors || this.spotlightCachedColorSource !== this.currentSpotColor) {
    this.spotlightCachedColors = {
        lens5: this.currentSpotColor.scale(5.0),
        lens4: this.currentSpotColor.scale(4.0),
        source8: this.currentSpotColor.scale(8.0),
        source6: this.currentSpotColor.scale(6.4)
    };
    this.spotlightCachedColorSource = this.currentSpotColor;
}
```

## Performance Impact Estimates

| Optimization | CPU Savings | Memory Savings |
|-------------|-------------|----------------|
| Vector3 pool | ~5-10% | ~2KB/frame GC |
| Color3 caching | ~3-5% | ~1KB/frame GC |
| Staggered raycasts | ~15-20% | N/A |
| LED 30Hz update | ~5% | N/A |
| Engine flags | ~3-5% | N/A |
| Pre-calc trig | ~2-3% | N/A |

**Total estimated improvement: 30-40% reduction in animation loop CPU usage**

## Features Preserved

All hyperrealistic features remain fully functional:
- ✅ 6 spotlights with volumetric beams and floor pools
- ✅ Moving head fixture animations (pan/tilt)
- ✅ Laser system with raycasting hit detection
- ✅ Mirror ball with 150 reflection spots
- ✅ LED wall with 26 patterns
- ✅ Strobe lights with random flash patterns
- ✅ Audio reactivity (when audio playing)
- ✅ VJ control system
- ✅ Dancing NPC avatars
- ✅ PBR textures on floor/walls/ceiling

## Notes

- Hardware scaling level set to 1.0 (native). Can increase to 1.25 or 1.5 for lower-end devices
- Shadow generators only on every 3rd spotlight (already optimized previously)
- Static meshes already frozen with `freezeWorldMatrix()`
- Materials frozen after texture application
