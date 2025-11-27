# Speaker Placement & Material Updates - November 27, 2025

## Adjustments to PA System

Per user request, the PA speakers have been repositioned and re-textured to improve the stage layout and visual realism.

### 1. Positioning
*   **Z-Axis Shift:** Moved forward from `z = -25` to `z = -22`. This creates more separation from the LED wall (at `z = -26`).
*   **X-Axis Shift:** Widened stance from `x = ±10` to `x = ±11` to frame the wider stage area better.
*   **Rotation:** Applied a **30-degree inward tilt** (`Math.PI / 6`) to both stacks.
    *   Left Stack: Rotated `+30°` (Right/Clockwise) to face center.
    *   Right Stack: Rotated `-30°` (Left/Counter-Clockwise) to face center.
    *   *Note: Previous rotation was 0° (facing straight forward).*

### 2. Material Updates
*   **Darker Finish:** The `makeBlack` override in `ModelLoader` was darkened significantly.
    *   Old Albedo/Diffuse: `0.05` (Dark Grey)
    *   New Albedo/Diffuse: `0.01` (Near Pitch Black)
    *   This helps the speakers blend into the shadows better and look more like professional touring gear.

### 3. Camera Updates
*   **"Speakers" Preset:** Updated target coordinates to match the new left speaker position (`-11, 2.5, -22`) and moved camera back to `z = -15` for a better viewing angle.

### Files Modified
*   `js/modelLoader.js`: Updated `pa_speaker_left` and `pa_speaker_right` configs.
*   `js/club_hyperrealistic.js`: Updated `moveCameraToPreset` coordinates.
