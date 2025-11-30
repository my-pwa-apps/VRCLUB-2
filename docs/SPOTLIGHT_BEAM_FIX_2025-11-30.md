# Spotlight Beam Floor Contact Fix - 2025-11-30

## Issue
Users reported that spotlight beams (gobos) did not seem to touch the floor at all points when moving. This is a geometric artifact caused by the flat end of the cylindrical beam mesh intersecting with the flat floor plane at an angle. The "far" side of the beam's rim would lift off the floor, creating a visible gap.

## Changes Implemented

### 1. Extended Beam Length
Modified `_updateBeam` in `js/systems/spotlightSystem.js` to add a dynamic extension to the calculated beam length.

```javascript
// ADDED: Extra length to ensure beam penetrates floor at steep angles
const baseLength = verticalComponent > 0.1 ? originY / verticalComponent : 15;
const extraLength = 2.0 + (1.0 / (verticalComponent + 0.05)); // Dynamic extension
const beamLength = baseLength + extraLength;
```

### How It Works
- **Base Length**: Calculates the exact distance from the light source to the floor along the center ray.
- **Extra Length**: Adds a buffer (minimum 2.0m, increasing at steep angles) to ensure the *entire* beam cross-section penetrates the floor.
- **Visual Result**: The beam now extends slightly below the floor, ensuring a solid visual connection at all angles. The "Light Pool" disc (which sits on top of the floor) hides the intersection point, creating a seamless look.

## Verification
- Observe the spotlights moving in "Sweep" mode.
- Check the connection point between the beam and the floor, especially when the lights are tilted far from vertical.
- Verify there are no floating gaps between the beam and the floor.
