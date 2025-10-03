# DJ Booth Rebuild Plan

## Current Problem
The DJ booth code is corrupted with mixed old and new implementations. Multiple conflicting helper methods exist.

## Clean Solution Needed

### Position & Orientation
- Platform: 8m wide × 3m deep, centered at z=-24
- Front edge at z=-22.5 (facing dance floor)  
- Back edge at z=-25.5 (near LED wall at z=-26)
- DJ stands with back to LED wall, facing forward
- All screens/displays face the DJ (toward negative z, away from dance floor)

### Components Needed (in order)
1. **Platform** (z=-24)
   - Raised stage with anti-slip surface
   - Front safety rail at z=-22.5

2. **DJ Equipment Table** (z=-23.5, center of platform)
   - CDJs left/right with jog wheels
   - Mixer in center with display facing DJ (toward -z)
   - Monitor speakers behind table (z=-24.3)

3. **Laptop** (z=-25.2, back left corner)
   - Stand and screen facing DJ (toward +z)

4. **VJ Controls** (right side, x=3)
   - Simple control console with 5 toggle buttons
   - SPOTS, LASERS, LED WALL, STROBES, NEXT COLOR
   - All facing DJ (toward -z)

### Files to Fix
- `js/club_hyperrealistic.js`
  - Remove: createCDJs(), createMixer(), createMonitorSpeakers(), createLaptopStand(), createVJStation(), createBoothLighting()
  - Keep only: createDJBooth() and createVJLightingControls()
  - Consolidate all DJ equipment into createDJBooth()
  - Simplify createVJLightingControls() to just the 5 toggle buttons

### Next Steps
1. Backup current file
2. Remove all conflicting helper methods  
3. Rewrite createDJBooth() with all equipment inline
4. Simplify createVJLightingControls()
5. Test orientation and spacing
