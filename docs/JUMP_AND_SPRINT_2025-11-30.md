# Jump & Sprint Features - 2025-11-30

## Features Added
1.  **Jump**: Press **A** (Right Controller) or **X** (Left Controller) to jump.
2.  **Sprint**: Press **Thumbstick** (Click) or **Grip** (Squeeze) to run.

## Implementation Details

### Jump Logic
- **Trigger**: `a-button` or `x-button` press.
- **Physics**: Custom update loop handles vertical velocity and gravity.
- **Gravity Handling**: Babylon's `applyGravity` is temporarily disabled during the jump to prevent conflict.
- **Landing**: Uses a Raycast downwards to detect the ground (Floor or DJ Platform).
- **Landing Height**: Resets camera Y to `groundHeight + 1.7m` (standing eye level).

### Sprint Logic
- **Trigger**: `xr-standard-thumbstick` (click) or `xr-standard-squeeze` (grip).
- **Speed**: Increases `movementSpeed` from 3.0 (Walk) to 6.0 (Sprint).

## Verification
1.  **Jump**:
    - Enter VR.
    - Press **A** or **X**.
    - Verify you jump up and land smoothly.
    - Try jumping onto the DJ platform.
2.  **Sprint**:
    - Move with thumbstick.
    - Click the thumbstick or squeeze the grip.
    - Verify movement speed increases.
