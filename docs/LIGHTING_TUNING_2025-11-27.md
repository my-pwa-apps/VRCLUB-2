# Lighting Tuning - November 27, 2025

## Adjustments to Floor Reflections (Gobos)

User feedback indicated that the floor reflections were too large and bright compared to the volumetric beams. The following adjustments were made to `club_hyperrealistic.js` to balance the visual presentation.

### Changes

1.  **Size Reduction:**
    *   Initial disc radius reduced from `2.0` to `1.4`.
    *   Dynamic scaling factor in `updateAnimations` reduced from `baseSize * 2.0` to `baseSize * 1.4`.
    *   **Result:** Floor pools are approximately 30% smaller, matching the beam footprint more accurately.

2.  **Brightness Reduction:**
    *   Emissive color scaling reduced from `1.5` to `0.8`.
    *   **Result:** The "glow" of the floor pattern is significantly dimmer, preventing it from overpowering the beam itself.

3.  **Opacity Reduction:**
    *   Material alpha reduced from `0.6` to `0.4`.
    *   Mesh visibility in animation loop reduced from `0.9` to `0.7`.
    *   **Result:** The floor texture shows through more clearly, making the light look like a projection rather than a solid object.

### Verification
*   Reload the application.
*   Observe the spotlights hitting the floor.
*   The pool of light should now be slightly larger than the beam diameter but not excessive.
*   The brightness should be subordinate to the beam intensity.
