# LED Wall Blanking Fix (2025-11-30)

## Issue
The LED wall would "pause" (freeze on the last frame) instead of turning black when disabled via the VJ console.

## Root Cause Analysis
1. **Hybrid Initialization**: The LED wall was being created using the modular `LEDWallSystem` even when `useModularSystems` was set to `false`.
   - `createScene` checked `if (this.systems.ledWall)` instead of `if (this.useModularSystems && this.systems.ledWall)`.
   - This caused the LED panels to be stored in `this.systems.ledWall.ledPanels` instead of `this.ledPanels`.

2. **Update Logic Flaw**: The main render loop (`updateAnimations`) had a conditional update:
   ```javascript
   if (this.systems.ledWall && this.ledWallActive) {
       this.systems.ledWall.update(time, audioData);
   } else if (this.ledPanels && ... && !this.ledWallActive) {
       // Blank legacy panels
   }
   ```

3. **The "Pause" Effect**:
   - When `ledWallActive` was set to `false`:
     - The first block was skipped (because `ledWallActive` is false).
     - The second block was skipped (because `this.ledPanels` was empty, as panels were in the modular system).
   - Result: No code executed to update the panels, so they retained their last color values.

## The Fix
Modified `js/club_hyperrealistic.js` to ensure the modular system is updated even when inactive, allowing it to execute its internal blanking logic.

```javascript
// CRITICAL FIX: Always update modular system to handle blanking when inactive
if (this.systems.ledWall) {
    this.systems.ledWall.setActive(this.ledWallActive);
    this.systems.ledWall.update(time, audioData);
}
```

This ensures that `LEDWallSystem.update()` runs, which contains:
```javascript
if (!this.ledWallActive) {
    this._disableLEDWall(); // Sets all panels to black
    return;
}
```

## Verification
- **Active State**: `setActive(true)` is called, `update()` runs animation logic.
- **Inactive State**: `setActive(false)` is called, `update()` runs and calls `_disableLEDWall()`, turning panels black.
