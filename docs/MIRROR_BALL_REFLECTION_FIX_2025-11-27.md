# Mirror Ball Reflection Fix

## Issue
The user reported that mirror ball reflection spots "seem to float in mid air" and "do not match".

## Root Cause Analysis
1. **Invisible Collision Boundaries**: The app creates invisible collision walls to keep the user inside the room. These walls are offset from the visual walls by ~2 meters (e.g., collision wall at x=15, visual wall at x=17).
2. **Raycasting Interference**: The mirror ball effect uses raycasting (`scene.pickWithRay`) to project spots onto surfaces.
3. **Predicate Failure**: The existing raycast predicate checked `!mesh.isPickable`, but for some reason (likely due to how `pickWithRay` interacts with `isPickable` or the specific mesh configuration), the rays were hitting the invisible collision walls instead of passing through to the visual walls.
4. **Result**: The spots were rendered on the invisible collision walls, appearing to float 2 meters in front of the real walls.

## Fix Implemented
Updated the `mirrorBallRayPredicate` in `js/club_hyperrealistic.js` to explicitly exclude meshes with "collision" or "trigger" in their names.

```javascript
        this.mirrorBallRayPredicate = (mesh) => {
            // ... existing checks ...
            
            // CRITICAL FIX: Ignore invisible collision walls to prevent spots floating in mid-air
            if (mesh.name.includes('collision') || mesh.name.includes('Collision')) return false;
            if (mesh.name.includes('trigger') || mesh.name.includes('Trigger')) return false;
            
            // ...
            return true;
        };
```

## Verification
- The raycast will now ignore the invisible collision boundaries.
- Rays will travel until they hit the visual walls (brick, concrete, etc.).
- Spots will render on the actual wall surfaces, eliminating the "floating" effect.
- Beams will extend fully to the walls, matching the visual spots.
