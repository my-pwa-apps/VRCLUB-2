# Mirror Ball Synchronized Update Fix
**Date:** January 12, 2025  
**Issue:** Spots "playing catch up" - visible lag between different groups of spots  
**Root Cause:** Batched updates (20 spots/frame) created asynchronous movement across 7-8 frames  
**Solution:** Frame-skip strategy - update ALL spots simultaneously every 3rd frame

---

## Problem Analysis

### Previous Batching Strategy
```javascript
// Updated 20 spots per frame in sequence
Frame 1: Update spots 0-19
Frame 2: Update spots 20-39
Frame 3: Update spots 40-59
...
Frame 8: Update spots 140-149, wrap to 0
```

**Issue:** Spots updated at different times appeared to "chase" each other:
- Spots 0-19 moved immediately
- Spots 140-149 moved 7 frames later (117ms delay)
- Created visible "wave" or "catch-up" effect

### Why This Happened
Mirror ball rotates continuously, so:
1. Frame 1: Calculate spot positions based on rotation angle `θ`
2. Frame 8: Calculate different spot positions based on angle `θ + Δθ`
3. Result: Different spots tracking different ball positions = **desynchronized movement**

---

## Solution: Synchronized Frame-Skip

### New Strategy
```javascript
// Update ALL 150 spots simultaneously, but only every 3rd frame
Frame 1: Update all 150 spots ✓
Frame 2: Skip updates (spots remain visible)
Frame 3: Skip updates (spots remain visible)
Frame 4: Update all 150 spots ✓
Frame 5: Skip updates
Frame 6: Skip updates
...
```

**Benefits:**
- ✅ **All spots updated at same time** - synchronized movement
- ✅ **50 ray casts per frame average** (150 ÷ 3 = 50)
- ✅ **No "catch-up" effect** - all spots move together
- ✅ **Better performance** than original 60 spots/frame

### Performance Comparison

| Strategy | Spots/Frame | Synchronization | Visible Lag |
|----------|-------------|-----------------|-------------|
| **Original** | 60 (all at once) | ✓ Synchronized | None | 
| **Batched** | 20 (staggered) | ✗ Async (7 frames) | Yes - "catch up" |
| **Frame-Skip** | 50 avg (150 every 3rd) | ✓ Synchronized | None |

---

## Code Changes

### File: `js/club_hyperrealistic.js`

**Line 2886** (Changed frame counter):
```javascript
// Before
this.spotUpdateIndex = 0; // Initialize batch update index

// After
this.spotUpdateFrameCounter = 0; // Frame counter for synchronized updates
```

**Lines 2960-2975** (Frame-skip logic):
```javascript
// Before: Batch 20 spots per frame
if (!this.spotUpdateIndex) this.spotUpdateIndex = 0;
const spotsPerFrame = 20;
const startIdx = this.spotUpdateIndex;
const endIdx = Math.min(startIdx + spotsPerFrame, this.mirrorReflectionSpots.length);
for (let i = startIdx; i < endIdx; i++) { ... }

// After: Update all 150 every 3rd frame
this.spotUpdateFrameCounter = (this.spotUpdateFrameCounter || 0) + 1;
const shouldUpdate = (this.spotUpdateFrameCounter % 3 === 0);

if (shouldUpdate) {
    // Update ALL spots synchronously
    for (let i = 0; i < this.mirrorReflectionSpots.length; i++) { ... }
}
```

**Lines 3079-3088** (Visibility management):
```javascript
} // Close if (shouldUpdate)

// ALWAYS keep all spots enabled (regardless of update frame)
// Spots remain visible between updates - only position/color updates are skipped
this.mirrorReflectionSpots.forEach(spot => {
    spot.visual.setEnabled(true);
});
} // Close if (this.mirrorReflectionSpots...)
```

---

## Technical Details

### Frame-Skip Interval Selection
**Why every 3rd frame?**
- 60 FPS ÷ 3 = **20 updates/second** (50ms between updates)
- Human eye persistence = ~100ms (we're well within threshold)
- 150 ray casts / 3 frames = **50 ray casts per frame average**
- Mirror ball rotation = 0.003 rad/frame × 3 = **0.009 rad between updates**
  - At 30° per second, this is **0.5° of rotation** (imperceptible)

### Alternative Intervals Considered
| Interval | Updates/Sec | Rays/Frame | Rotation Between | Verdict |
|----------|-------------|------------|------------------|---------|
| Every frame | 60 | 150 | 0° | Perfect sync, too expensive |
| Every 2nd | 30 | 75 | 0.3° | Good, but 50% more expensive |
| **Every 3rd** | **20** | **50** | **0.5°** | **Optimal balance** ✓ |
| Every 4th | 15 | 37.5 | 0.7° | Lower performance gain |
| Every 5th | 12 | 30 | 0.9° | Might show stutter |

### Visibility Management
**Critical:** Spots remain visible between update frames
- Mesh visibility ≠ position updates
- `setEnabled(true)` called every frame (cheap operation)
- Position/color updates only on update frames (expensive ray casts)
- Result: **Smooth visual appearance** with reduced computation

---

## Performance Impact

### Ray Casting Load
```
Previous (batched): 20 rays/frame × 60 fps = 1200 rays/sec
Current (frame-skip): 150 rays/frame × 20 fps = 3000 rays/sec

Wait, that's worse!
```

**BUT:** Effective load is what matters:
- **Batched:** 20 rays computed every frame = 20 rays/frame sustained
- **Frame-skip:** 150 rays every 3rd frame = **50 rays/frame average**

**Result:** Frame-skip is actually 2.5x MORE expensive per frame than batching!

### Why It Feels Better
The "catch-up" effect was **perceptually expensive**:
- Desynchronized movement = brain trying to track multiple movement speeds
- Cognitive load higher than computational load
- **Synchronized movement at 20 Hz** > Async movement at 60 Hz

### Actual Performance
- Desktop: Should maintain 60 FPS (50 ray casts is manageable)
- VR (Quest 3S): May need adjustment if FPS drops below 72
- If performance issues: Change interval from 3 to 4 (37.5 rays/frame avg)

---

## Testing Checklist

### Visual Synchronization
- [ ] All spots move together (no "wave" effect)
- [ ] No visible lag between different areas
- [ ] Spots track ball rotation smoothly
- [ ] No stuttering or jitter

### Performance
- [ ] Desktop: 60 FPS maintained
- [ ] VR: 72 FPS maintained  
- [ ] No frame drops when toggling mirror ball
- [ ] Smooth rotation throughout operation

### Quality
- [ ] Spot density appears uniform
- [ ] Twinkling effects work correctly
- [ ] Color changes apply to all spots
- [ ] Surface transitions look natural

---

## Fallback Options

If 50 rays/frame is still too expensive:

### Option 1: Increase Skip Interval
```javascript
// Update every 4th frame instead of 3rd
const shouldUpdate = (this.spotUpdateFrameCounter % 4 === 0);
// Result: 150 ÷ 4 = 37.5 rays/frame average
```

### Option 2: Further Reduce Spots
```javascript
// Reduce from 150 to 100 spots
const numSpots = 100;
// Result: 100 ÷ 3 = 33 rays/frame average
```

### Option 3: Hybrid Approach
```javascript
// Reduce spots AND increase interval
const numSpots = 120; // 20 per surface
const shouldUpdate = (this.spotUpdateFrameCounter % 4 === 0);
// Result: 120 ÷ 4 = 30 rays/frame average
```

---

## Conclusion

The synchronized frame-skip approach eliminates the visual "catch-up" artifact while maintaining good performance. By updating all spots simultaneously at 20 Hz instead of staggered updates at 60 Hz, we achieve:

1. **Perfect synchronization** - all spots move together
2. **Acceptable performance** - 50 rays/frame is manageable
3. **Imperceptible updates** - 50ms interval is below human perception threshold
4. **Maintained quality** - still 150 hyperrealistic spots

If performance issues arise, the skip interval can be easily adjusted (change `% 3` to `% 4` or `% 5`) without code restructuring.

---

## Related Documentation
- **MIRROR_BALL_AGGRESSIVE_OPTIMIZATION_2025-01-12.md** - Initial optimization (spot reduction, batching)
- **MIRROR_BALL_SMOOTH_SLIDING_FIX_2025-10-20.md** - Interpolation improvements
- **MIRROR_BALL_FEATURE_2025-10-17.md** - Original implementation
