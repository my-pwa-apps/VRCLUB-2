# Independent Light Speed Controls - October 19, 2025

## Overview
Added independent speed multipliers for each light system type, allowing VJs to control the animation speed of each lighting system separately. Also fixed automated mode to only adjust speeds instead of forcing lights on/off.

## Problem Statement

### Issue 1: Single Global Speed
Previously, only `spotlightSpeed` existed and was incorrectly applied to all light types:
- Mirror ball used `spotlightSpeed` instead of its own speed
- Lasers used `spotlightSpeed` instead of `laserSpeed`
- LED wall and strobes had no speed control
- VJ couldn't adjust individual system speeds

### Issue 2: Automated Mode Forced Light States
The professional phase progression system (build → peak → breakdown → ambient → drop) was forcing specific lights on/off:
```javascript
// OLD BEHAVIOR - Forced light states
case 'peak':
    this.lightsActive = false;    // ❌ Disabled spotlights
    this.lasersActive = true;     // ❌ Forced lasers on
    this.mirrorBallActive = false; // ❌ Disabled mirror ball
```

This meant:
- **Mirror ball and other lights couldn't run simultaneously**
- VJ had no control during automated phases
- Manual toggling was overridden every 20-30 seconds
- Broke the promise of independent light control

## Solution

### 1. Independent Speed Controls (Lines 165-171)
Added 5 separate speed multipliers initialized to 1.0 (100% speed):

```javascript
// Independent speed controls per light type (0.1 = 10% speed, 2.0 = 200% speed)
this.spotlightSpeed = 1.0;  // Spotlight sweep/rotation speed
this.laserSpeed = 1.0;      // Laser rotation speed
this.mirrorBallSpeed = 1.0; // Mirror ball rotation speed
this.ledWallSpeed = 1.0;    // LED wall animation speed
this.strobeSpeed = 1.0;     // Strobe flash rate
```

**Range**: 0.1 (10% speed, very slow) to 2.0 (200% speed, very fast)

### 2. Applied Speed Multipliers

**Mirror Ball Rotation** (Line 2829):
```javascript
// OLD: Used spotlightSpeed incorrectly
const speedMultiplier = this.spotlightSpeed || 1.0;

// NEW: Uses dedicated mirror ball speed
const speedMultiplier = this.mirrorBallSpeed || 1.0;
this.mirrorBallRotation -= 0.003 * speedMultiplier;
```

**Laser Rotation** (Line 3159):
```javascript
// OLD: Used spotlightSpeed
const speedMultiplier = this.spotlightSpeed || 1.0;

// NEW: Uses dedicated laser speed
const speedMultiplier = this.laserSpeed || 1.0;
if (this.lightingMode === 'synchronized') {
    laser.rotation += 0.015 * speedMultiplier;
    laser.tiltPhase += 0.02 * speedMultiplier;
}
```

**LED Wall Animations** (Line 2792):
```javascript
// OLD: No speed control
this.ledTime += 0.016;

// NEW: Uses dedicated LED wall speed
this.ledTime += 0.016 * (this.ledWallSpeed || 1.0);
```

**Strobe Flash Rate** (Lines 3838-3878):
```javascript
// NEW: Strobe speed multiplier affects all timing
const strobeSpeedMultiplier = this.strobeSpeed || 1.0;

// Flash decay speed
strobe.flashDuration -= 0.016 * strobeSpeedMultiplier;

// Burst phase speed
const burstPhase = Math.floor(strobe.flashDuration * 40 * strobeSpeedMultiplier) % 2;

// Next flash interval (faster speed = shorter wait)
const flashInterval = (0.1 + Math.random() * 0.9) / strobeSpeedMultiplier;
strobe.nextFlashTime = time + flashInterval;

// Flash duration (faster speed = shorter flashes)
const flashDuration = (0.15 + Math.random() * 0.2) / strobeSpeedMultiplier;
```

**Spotlight Sweep** (Line 3393):
```javascript
// Already correct - uses spotlightSpeed
const speedMultiplier = this.spotlightSpeed || 1.0;
const sweepPhase = globalPhase * audioSpeedMultiplier * speedMultiplier;
```

### 3. Fixed Automated Mode (Lines 3000-3070)

Changed automated phase progression to **only adjust speeds**, not force light states:

```javascript
// NEW BEHAVIOR - Speed suggestions only
case 'peak':
    this.lightingPhase = 'peak';
    this.targetEnergy = 1.0;
    // SPEED SUGGESTIONS ONLY - Don't force light on/off states
    this.spotlightSpeed = 1.5; // Speed up for peak energy
    this.laserSpeed = 1.5;
    this.mirrorBallSpeed = 1.5;
    this.ledWallSpeed = 1.5;
    this.strobeSpeed = 1.5;
    console.log('🔥 PEAK: High energy speeds (VJ controls which lights are active)');
    break;
```

**All 5 phases now only adjust speeds**:
- **Build**: Normal speed (1.0x all systems)
- **Peak**: Fast (1.5x all systems)
- **Breakdown**: Slow (0.5x most systems)
- **Ambient**: Atmospheric (0.3-0.7x varied)
- **Drop**: Maximum energy (1.8-2.0x all systems)

## Impact

### VJ Control Improvements
✅ **Mirror ball + spotlights can run simultaneously**
✅ **Mirror ball + lasers can run simultaneously**
✅ **Any combination of lights can be enabled together**
✅ **Automated mode no longer overrides VJ toggles**
✅ **Independent speed control per light type**

### Speed Control Examples
```javascript
// Slow mirror ball with fast lasers
this.mirrorBallSpeed = 0.3; // 30% speed (slow disco effect)
this.laserSpeed = 2.0;      // 200% speed (fast laser show)

// Fast strobes with slow spotlights
this.strobeSpeed = 1.8;     // 180% speed (rapid flashing)
this.spotlightSpeed = 0.5;  // 50% speed (slow sweeping)

// Freeze LED wall, animate everything else
this.ledWallSpeed = 0.1;    // 10% speed (near-static)
this.spotlightSpeed = 1.5;  // 150% speed
this.laserSpeed = 1.5;      // 150% speed
```

### Automated Phase Behavior
**Before**: Automated mode forced specific light combinations
**After**: Automated mode suggests speeds, VJ controls which lights are active

Example timeline:
1. **Build phase (30s)**: All speeds at 1.0x, VJ enables spotlights + LED wall
2. **Peak phase (20s)**: All speeds increase to 1.5x, VJ adds lasers (spotlights still on!)
3. **Breakdown (15s)**: All speeds drop to 0.5x, VJ enables mirror ball (everything else still on!)
4. **Ambient (20s)**: Slow atmospheric speeds, VJ chooses which lights to use
5. **Drop (25s)**: Maximum speeds (2.0x), VJ can enable all systems together

## Technical Details

### Speed Multiplier Application

**Rotation/Movement**: Multiplied with base rotation speed
```javascript
laser.rotation += laser.rotationSpeed * speedMultiplier;
```

**Time-based Animations**: Multiplied with time increment
```javascript
this.ledTime += 0.016 * speedMultiplier; // 60 FPS base
```

**Duration/Intervals**: Divided by speed (faster = shorter duration)
```javascript
const flashInterval = baseInterval / speedMultiplier;
```

### Automated Mode Logic

**Old Pattern**:
```
Phase Change → Force Light States → Override VJ Control → VJ Frustrated
```

**New Pattern**:
```
Phase Change → Suggest Speeds → VJ Keeps Control → Professional Flexibility
```

## Future Enhancements

### Potential Additions
1. **VJ UI Speed Sliders**: Add 3D in-scene sliders for each speed control
2. **Speed Presets**: Save/load speed combinations (e.g., "Chill Vibe", "Peak Energy")
3. **BPM Sync**: Automatically adjust all speeds based on detected BPM
4. **Per-Light Speed**: Individual speed control for each spotlight/laser (not just type)
5. **Speed Curves**: Non-linear speed ramping (ease-in/ease-out)

### Manual VJ Speed Control (Future)
```javascript
// Expose speed controls in VJ panel
createSpeedSlider('spotlightSpeed', 'Spotlights', 0.1, 2.0);
createSpeedSlider('laserSpeed', 'Lasers', 0.1, 2.0);
createSpeedSlider('mirrorBallSpeed', 'Mirror Ball', 0.1, 2.0);
createSpeedSlider('ledWallSpeed', 'LED Wall', 0.1, 2.0);
createSpeedSlider('strobeSpeed', 'Strobes', 0.1, 2.0);
```

## Files Modified
- `js/club_hyperrealistic.js` (5,606 lines):
  - Lines 165-171: Added 5 speed control variables
  - Line 2792: LED wall speed application
  - Line 2829: Mirror ball speed fix
  - Lines 3000-3070: Automated mode refactor (70 lines)
  - Line 3159: Laser speed fix
  - Lines 3838-3878: Strobe speed implementation
  - Line 3393: Spotlight speed (already correct)

## Testing Checklist
- [x] Mirror ball + spotlights run simultaneously
- [x] Mirror ball + lasers run simultaneously
- [x] All 5 light types can be enabled together
- [x] Automated mode doesn't force lights off
- [x] Each speed control affects only its target system
- [x] Speed multipliers work at extremes (0.1x and 2.0x)
- [x] Strobe flash rate correctly adjusts with speed
- [x] LED wall patterns speed up/slow down correctly

## Performance Impact
**Negligible**: Only adds 5 float multiplications per frame. No new objects or allocations.

## Compatibility
**Fully backward compatible**: All speed defaults to 1.0 (100%), so existing behavior unchanged if speeds not modified.
