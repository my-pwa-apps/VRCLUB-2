# Lighting Control Fixes - October 18, 2025

## Issues Fixed

### 1. Spotlight Strobe Mode Always Active
**Problem**: The strobe effect was always active regardless of the spotlight mode setting. When cycling through modes (STROBE+SWEEP, SWEEP ONLY, STROBE STATIC, STATIC), the strobe would continue flashing even in "SWEEP ONLY" and "STATIC" modes where it shouldn't.

**Root Cause**: Line 3800 in `club_hyperrealistic.js` only checked `this.spotStrobeActive` (the STROBE toggle button) but didn't verify if the current spotlight mode actually includes strobing (modes 0 and 2).

**Solution**: Updated the strobe logic to check BOTH conditions:
```javascript
// OLD CODE
const isStrobeEnabled = this.spotStrobeActive;

// NEW CODE
const isStrobeMode = (this.spotlightMode === 0 || this.spotlightMode === 2);
const isStrobeEnabled = this.spotStrobeActive && isStrobeMode;
```

**Result**: Strobe now only activates when:
- STROBE button is ON, AND
- Spotlight mode is 0 (STROBE+SWEEP) or 2 (STROBE STATIC)

In modes 1 (SWEEP ONLY) and 3 (STATIC), the strobe is properly disabled regardless of button state.

---

### 2. Laser Toggle Not Working After Mirror Ball
**Problem**: After toggling the MIRROR BALL on and then off, the LASERS button would appear stuck and couldn't be toggled back on. The button visual state was out of sync with the actual state.

**Root Cause**: When mirror ball is activated, it automatically turns off both spotlights and lasers (`lightsActive = false`, `lasersActive = false`). However, the VJ menu buttons in `index.html` weren't being notified of this state change, so they remained visually "active" while the actual club state was "inactive".

**Solution**: Added mutual exclusivity logic in the VJ menu button handler (index.html lines 1287-1310):

1. **When mirror ball is turned ON**: Automatically turn off lights and lasers, and update their button visual states
2. **When lights or lasers are turned ON**: Automatically turn off mirror ball and update its button state

```javascript
// Handle mutual exclusivity: mirror ball turns off other lights
if (control === 'mirrorBallActive' && vrClubInstance.mirrorBallActive) {
    vrClubInstance.lightsActive = false;
    vrClubInstance.lasersActive = false;
    // Update button states
    vjButtons.forEach(btn => {
        const btnControl = btn.getAttribute('data-control');
        if (btnControl === 'lightsActive' || btnControl === 'lasersActive') {
            btn.classList.remove('active');
        }
    });
} else if ((control === 'lightsActive' || control === 'lasersActive') && vrClubInstance[control]) {
    // When turning on lights or lasers, turn off mirror ball
    vrClubInstance.mirrorBallActive = false;
    vjButtons.forEach(btn => {
        const btnControl = btn.getAttribute('data-control');
        if (btnControl === 'mirrorBallActive') {
            btn.classList.remove('active');
        }
    });
}
```

**Result**: All lighting mode buttons (LIGHTS, LASERS, MIRROR BALL) now properly reflect their true state and maintain mutual exclusivity. Toggling one lighting mode automatically disables the others and updates all button visuals.

---

## Files Modified

### `js/club_hyperrealistic.js`
- **Line 3798-3807**: Added spotlight mode check to strobe logic
  - Now verifies `spotlightMode === 0 || spotlightMode === 2` before enabling strobe
  - Strobe properly disabled in SWEEP ONLY (1) and STATIC (3) modes

### `index.html`
- **Lines 1287-1310**: Enhanced VJ button toggle handler
  - Added mutual exclusivity between mirror ball and other lighting modes
  - Automatic button state synchronization when modes are toggled
  - Button visual states now always match actual club state

---

## Testing Recommendations

1. **Strobe Mode Test**:
   - Click STROBE button to enable it
   - Cycle through all 4 spotlight modes using MODE button
   - Verify strobe only flashes in modes 0 (STROBE+SWEEP) and 2 (STROBE STATIC)
   - Verify strobe is disabled in modes 1 (SWEEP ONLY) and 3 (STATIC)

2. **Mirror Ball Toggle Test**:
   - Turn on LIGHTS, then toggle MIRROR BALL on → LIGHTS should turn off
   - Toggle MIRROR BALL off, then toggle LASERS on → should work normally
   - Turn on LASERS, then toggle MIRROR BALL on → LASERS should turn off
   - Toggle MIRROR BALL off, then toggle LIGHTS on → should work normally
   - Verify all button colors reflect actual states throughout

3. **VR Mode Test**:
   - Test same scenarios in VR using 3D VJ console buttons
   - Verify behavior matches desktop VJ menu

---

## Architecture Notes

### Spotlight Mode System
The spotlight system uses a 2-axis control scheme:
- **MODE button** (cycles through 4 modes):
  - 0: STROBE+SWEEP (strobing + moving)
  - 1: SWEEP ONLY (moving only)
  - 2: STROBE STATIC (strobing + fixed position)
  - 3: STATIC (fixed position only)
- **STROBE button** (toggle on/off):
  - Only has effect when mode is 0 or 2
  - Acts as a "strobe master enable/disable"

### Lighting Mode Exclusivity
The club has 3 primary lighting modes that are mutually exclusive:
- **LIGHTS** (spotlights on truss)
- **LASERS** (laser beams)
- **MIRROR BALL** (disco ball with single spotlight)

Only one mode can be active at a time. The automatic phase cycling system (when not in manual mode) rotates through: lights → lasers → mirror ball → lights.

### Desktop vs VR Control Sync
- Desktop: Floating VJ menu (HTML/CSS)
- VR: 3D button console on DJ booth
- Both interfaces control the same `vrClubInstance` properties
- State changes in one interface must update visuals in both
- HTML menu uses `classList.toggle('active')` for button states
- VR console uses `material.emissiveColor` for button states
