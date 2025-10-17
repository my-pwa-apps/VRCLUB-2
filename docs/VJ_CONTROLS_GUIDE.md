# VJ Control System Guide

## Overview
The VJ control console is located on the **right side of the DJ platform** (x=3.5, z=-24.4). It features **9 interactive 3D buttons** arranged in 3 rows.

## Button Layout (3 Rows)

### Row 1 - Main Lighting Controls (z=-23.7)
| Button | Control | Effect |
|--------|---------|--------|
| **SPOTS** | Toggle spotlights on/off | Enables/disables all 6 moving head spotlights |
| **LASERS** | Toggle lasers on/off | Enables/disables all 3 multi-beam laser systems |
| **LED WALL** | Toggle LED wall on/off | Enables/disables the 10x6 LED panel wall |
| **STROBES** | Toggle strobes on/off | Enables/disables 4 corner strobe lights |

### Row 2 - Special Effects & Color (z=-24.5)
| Button | Control | Effect |
|--------|---------|--------|
| **DISCO BALL** | Toggle mirror ball effect | Activates disco ball with spotlight (turns off other lights) |
| **BALL COLOR** | Cycle disco ball color | Changes disco ball spotlight through 9 colors |
| **NEXT COLOR** | Cycle spotlight color | Changes all spotlight colors (9 color cycle) |
| **SPOT MODE** | Cycle spotlight mode | Changes mode: Strobe+Sweep → Sweep Only → Strobe Static → Static |

### Row 3 - Spotlight Movement Patterns (z=-25.3)
| Button | Control | Effect |
|--------|---------|--------|
| **PATTERN** | Cycle movement pattern | Cycles through: Random → Static Down → Sync Sweep |

## Spotlight Modes vs. Patterns

### Spotlight Modes (SPOT MODE button)
Controls **how** the spotlights behave:
- **Mode 0: Strobe+Sweep** - Lights flash while moving (8Hz strobe)
- **Mode 1: Sweep Only** - Smooth continuous movement, no flashing
- **Mode 2: Strobe Static** - Lights flash at fixed positions
- **Mode 3: Static** - Lights stay fixed, no movement or flashing

### Spotlight Patterns (PATTERN button)
Controls **where** the spotlights aim - cycles with each click:
- **Pattern 0 (RANDOM)** - Auto-cycles through 7 different movement patterns every ~10 seconds (Magenta)
- **Pattern 1 (STATIC DOWN)** - All lights point straight down at dance floor (Cyan)
- **Pattern 2 (SYNC SWEEP)** - All lights sweep side-to-side together in sync (Pink)

The button flashes with a different color for each pattern to show which is active.

## Color Cycles

### Spotlight Colors (NEXT COLOR button)
9 colors in sequence:
1. Red
2. Blue
3. Green
4. Magenta
5. Yellow
6. Cyan
7. Orange
8. Purple
9. White

### Disco Ball Colors (BALL COLOR button)
9 colors in sequence:
1. White (classic disco)
2. Red
3. Blue
4. Green
5. Magenta
6. Yellow
7. Cyan
8. Orange
9. Purple

## VJ Manual Mode
- When you click ANY VJ button, **automated patterns pause for 5 minutes**
- This gives you manual control without interference
- After 5 minutes of no interaction, automated cycling resumes
- Console log shows: `🎛️ VJ manual mode: Automated patterns paused for 5 minutes`

## Button Visual Feedback
- **Active toggle buttons** glow with their ON color (bright)
- **Inactive toggle buttons** dim to their OFF color (dark)
- **Action buttons** (NEXT COLOR, BALL COLOR, SPOT MODE, PATTERN) flash briefly when clicked
- **PATTERN button** flashes with a different color for each pattern:
  - Magenta = Random pattern
  - Cyan = Static Down pattern
  - Pink = Sync Sweep pattern

## Mirror Ball Special Behavior
When **DISCO BALL** is active:
- All other lights turn OFF (spotlights, lasers, LED wall)
- 1 spotlight aims at the rotating mirror ball
- 300 reflection spots shimmer across walls, floor, and ceiling
- Classic disco atmosphere with dramatic lighting

## Technical Details

### Light Limits
- Quest VR: 6 lights max per PBR material
- Desktop: 4 lights max per PBR material
- System automatically detects and adjusts

### Performance
- Buttons use **Action Managers** for click detection
- All animations run at 60 FPS target
- Reflections use emissive meshes (not real lights) to stay within GPU limits

### Console Position
- **Position**: x=3.5 (right side), y=0.8, z=-24.4 (DJ platform back)
- **Size**: 2.5m wide, 0.15m tall, 2.0m deep (extended for 3 rows)
- **Button Size**: 0.4m wide, 0.1m tall, 0.3m deep
- **Total Buttons**: 9 (4 in row 1, 4 in row 2, 1 in row 3)

## Usage Tips

1. **Start Simple**: Click PATTERN until you get Static Down (cyan flash), then use SPOT MODE for Sweep Only
2. **Add Movement**: Click PATTERN to get Sync Sweep (pink flash) for synchronized side-to-side motion
3. **Go Wild**: Click PATTERN to get Random (magenta flash), then SPOT MODE to Strobe+Sweep for full club energy
4. **Change Colors**: Click NEXT COLOR every 15-20 seconds for variety
5. **Disco Moment**: Activate DISCO BALL for a classic retro moment
6. **Control Everything**: Independently toggle each lighting system (spots, lasers, LED, strobes)

## Console Logs
The system provides detailed feedback:
- `🎛️ VJ Control: [Button Name] clicked`
- `💡 Spotlight mode: [Mode Name]`
- `🎯 Spotlight pattern: [Pattern Name]`
- `🎨 Color changed to index [0-8]`
- `🪩 Mirror ball color: [Color Name]`
- `[System]: ON/OFF` (for toggle buttons)

## Troubleshooting

**Buttons not responding?**
- Check console for "VJ Control interaction enabled" message
- Ensure you're clicking the 3D button meshes (not behind them)
- VR users: Use controller pointer to click

**Patterns not changing?**
- Click the PATTERN button - it cycles through 3 modes
- Watch for the color flash: Magenta → Cyan → Pink
- Check console logs for confirmation

**Lights seem static?**
- SPOT MODE might be set to "Static" (mode 3) - click to cycle
- Pattern might be "STATIC DOWN" - click PATTERN button
- Try cycling PATTERN to Sync Sweep (pink flash) + SPOT MODE to Sweep Only (cyan flash)

## Future Enhancements
- Speed control slider for pattern/sweep speed
- Blackout button (all lights off instantly)
- Save/recall preset lighting scenes
- MIDI controller integration
