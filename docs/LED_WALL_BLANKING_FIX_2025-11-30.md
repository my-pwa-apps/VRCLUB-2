# LED Wall Blanking Fix - 2025-11-30

## Issue
When disabling the LED wall from the VJ console, the wall would simply pause on the last frame instead of turning off (blanking). This was because the `setActive(false)` method only updated the state flag but didn't immediately clear the panel colors. The `update()` loop would then skip processing, leaving the last colors on the panels.

## Changes Implemented

### 1. Updated `setActive` Method
Modified `setActive` in `js/systems/ledWallSystem.js` to immediately call `_disableLEDWall()` when `active` is false.

```javascript
    /** Set LED wall active state */
    setActive(active) {
        this.ledWallActive = active;
        if (!active) {
            this._disableLEDWall();
        }
    }
```

### 2. Existing `_disableLEDWall` Logic
The `_disableLEDWall` method (already present) correctly sets all panel emissive colors to black (0,0,0).

```javascript
    /** Disable LED wall (all panels off) */
    _disableLEDWall() {
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor.r = 0;
            panel.material.emissiveColor.g = 0;
            panel.material.emissiveColor.b = 0;
        });
    }
```

## Verification
- Open the VJ Console.
- Toggle the "LED Wall" button off.
- Verify that the LED wall immediately goes black instead of freezing on the current pattern.
