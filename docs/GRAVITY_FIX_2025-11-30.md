# Gravity and Locomotion Fix - 2025-11-30

## Issue
User reported that gravity was not working in VR and requested the ability to walk around using thumbsticks.

## Root Cause Analysis
1. **Explicit Y-Lock**: The VR camera's Y position was being forcibly locked to 1.7m in every frame via `scene.onBeforeRenderObservable`. This prevented any vertical movement (gravity or walking up/down).
2. **Missing Collisions**: The floor and other walkable surfaces (DJ platform) did not have `checkCollisions = true` enabled.
3. **Camera Configuration**: The VR camera did not have `applyGravity = true` or `checkCollisions = true` enabled.

## Changes Implemented

### 1. Removed Y-Lock
Removed the `vrYLockObserver` in `js/club_hyperrealistic.js` that was pinning the camera height.

### 2. Enabled Gravity on VR Camera
Configured the WebXR camera with physics properties:
```javascript
// GRAVITY & COLLISIONS: Enable physics-like movement
const xrCamera = vrHelper.baseExperience.camera;
xrCamera.applyGravity = true;
xrCamera.checkCollisions = true;
// Set ellipsoid for collision detection (approximate human size)
xrCamera.ellipsoid = new BABYLON.Vector3(0.3, 0.9, 0.3);
```

### 3. Enabled Collisions on Surfaces
Added `checkCollisions = true` to:
- Main Floor (`createFloor`)
- DJ Platform & Top Surface (`createDJBooth`)
- Entrance Arch Pillars (`createEntranceArea`)

## Result
- Users can now walk around using thumbsticks.
- Gravity applies, so users will stay on the floor.
- Users can collide with walls and structures (if they have collisions enabled).
- Users can potentially walk up steps if the collision engine allows (ellipsoid settings).

## Verification
- Enter VR mode.
- Use left thumbstick to move.
- Verify that you don't fly or float.
- Verify that you can walk on the floor and collide with the DJ platform.
