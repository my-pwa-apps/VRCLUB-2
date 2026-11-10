# VJ Control System Guide

## VR Comfort and Access

- **VR Comfort** is on by default and is selectable before entry, in the desktop
  accessibility panel, and in the headset quick menu. It uses Babylon teleportation
  with 30-degree snap turns. Turn it off for continuous thumbstick movement.
- Comfort mode disables sprint and jump shortcuts. Switching it on also cancels
  an active jump and clears residual camera movement.
- Open the headset quick menu with **Y on the left controller** or **B on the
  right controller** (or the app-menu component if supplied by the runtime).
- **Entrance**, **Dance Floor**, and **DJ Booth** provide instant travel without
  walking, preserving tracked eye height and head orientation. The booth adds
  its 0.5 m platform elevation; travel back to the floor removes that elevation.
- **Safe Mode** is available in the headset menu, and the controllers never vibrate.
- Comfort and travel controls do not stop the automatic light show. Photosensitive
  Safe Mode reduces flashing but is not a medical guarantee of safety.

These controls support seated use but do not establish universal accessibility.
Controller-free input, spatial room acoustics, broader crowd behavior, and testing
with disabled visitors remain priorities before presenting this as an authentic,
accessible substitute for a club visit. Headset frame pacing and user comfort must
be evaluated on the target device, not inferred from desktop screenshots.

## Overview

### Independent spots, rows and columns

Open **Show / Lights / Individual spots, rows and columns**, **VR Lights / Spot Rig**,
or **SPOT RIG** on the desk's Lights panel. **EDIT GROUP** cycles through all six
heads, three front/middle/rear rows, left/right columns and six individual heads.
The selection is personal navigation; changing a setting is host-owned in a room.

- **GROUP ON/OFF** dims the selected heads without switching real GPU lights off.
- **GROUP COLOUR** chooses a palette colour or follows the shared **SPOT COLOUR**.
  A custom group colour releases **MATCH ALL COLOURS**; matching again overrides
  individual colours without changing their saved group settings.
- **GROUP MOVEMENT** follows the rig, moves independently, points down, sweeps in
  mirror pairs, crosses, or uses Row Wave, Row Fans or Row Call / Response.
  These are also whole-rig aim-path options. Grouped row aims follow musical time,
  rather than multiplying absolute time by the movement-speed slider: a wave/fan
  cycle is eight bars, and call/response is a six-bar open/return/hold phrase.
- **SEQUENCE** offers Steady, head/row/column Chase and head/row/column Fill.
  Chase fades one group out as the next lights; Fill adds groups and then fades
  them all out before restarting. Explicitly disabled heads stay dark.
  Sequences carry the shared spot colour; Steady restores individual colours.
- **STEP EVERY** selects 1, 2, 4 or 8 beats. Fast one-beat sequences stride to
  alternate beats above 150 BPM. Changes fade rather than create another flash
  source. Safe Mode uses slower fades and a 45% sequence-level ceiling.
- **RESET SPOT RIG** restores every head to on/follow colour/follow movement,
  Steady and two-beat steps; it does not reset other fixtures.

Automatic spotlight looks include paired row chases, alternating columns
and row fills. Each new look resets specialized head settings. A manual group
edit takes the lights under the normal hold/return policy. Master blackout and
Safe Mode remain authoritative across lenses, beams, pools, gobos and lighting.
Room frames carry group settings and a timestamped musical position in automatic
and manual modes. Late joiners follow the host's sequence; handover keeps its
current phase, and leaving/blocking restores local group settings. Older clients
ignore these optional fields. This uses the existing flat show protocol; no relay
deployment is required. Network phase is approximate, not sample-exact.
Physical-headset appearance and frame cost remain unmeasured.

### Row choreography in the automatic show

The reference clip informed the principle of coordinated groups and contrast, not
a copied rig or cue sequence. The existing six heads do the work; no new lights,
meshes, screens or video playback are added.

- **Pulse / Row Wave:** warm mirrored pairs sweep slowly through the room, each
  row following the previous one by one bar. A 16-bar cue gives the eight-bar
  wave two complete cycles, against a restrained complementary wall.
- **Pulse and Ignition / Row Conversation:** coloured front/rear pairs open,
  return and hold in turn. A still white middle pair anchors the scene. The
  groove version includes four full six-bar phrases (24 bars); the 12-bar peak
  version offers two phrases of quieter spatial recovery after the brief layered hit.
- **Ascent / Row Build:** nested fans accumulate one row per bar, hold the whole
  rig, then fade out and rebuild. The wall supports the heads rather than
  competing at full strength, with four complete fill cycles over 16 bars.
  The breakdown rise uses a faster two-beat fill
  with the same coordinated fans, still without strobes.
- **Sideways** passes the spot colour between paired rows; **Chromatic Room**
  answers with alternating columns. Both are attached to enabled spot cues.
- **Afterglow / Drift Away** recalls the delayed wave at lower intensity, leaving
  the mirror-ball, sheet and sunrise passages to provide space and contrast.

All structural cue changes remain bar-locked. The row movement itself is
continuous, with smooth departures/returns and no restart on a slow frame.
Safe Mode retains the choreography, suppresses strobes and softens/dims sequence
changes; master zero still blacks out every spot surface. Grouped motion shares
the host's musical clock even when its sequence is Steady.

### Automatic Show Balance

The pace mixes short energetic cuts with occasional longer spatial passages:
Arrival's closing First Light lasts 16 bars, Pulse's row conversation 24, Ascent's row build
16, Ignition's row conversation 12, and Afterglow's sheet 16. At 124 BPM these
are about 31, 46, 31, 23 and 31 seconds respectively. Brief two-bar peak hits,
sequence step rates, strobe limits, countdowns and breakdown detection are
unchanged; the whole show is not slowed down.

**HOLD THIS LOOK** in the desktop Show panel or VR Show page, and **HOLD LOOK**
on the desk's Show panel, keeps the current cue running indefinitely. Beams,
patterns, beat response and colour-preserving movement continue: this is not
a frozen frame. Press the same control again or **AUTO SHOW** to release it;
cue advancement resumes on a bar boundary. It does not change the saved
after-a-change policy, and that policy's timer cannot expire this explicit hold.
Countdowns and other set-pieces must finish before a look can be held.
Light edits, another section, reset or a new countdown supersede the hold.
Only the host can hold the room's show; guests follow its existing cue frames.

The automatic show favors one headline fixture at a time. Mirror-ball cues keep
the LED wall, moving heads and lasers dark. Layered peak cues last two bars;
sustained high audio energy returns from the peak sequence to a complete groove
sequence before another peak is possible. The groove emphasizes moving heads and
mirror-ball looks, with shorter dedicated laser moments and fewer blackout cuts.
Safe Mode continues to suppress strobes, and manual fixture controls remain available.

### Musical Builds and Safe Mode

- Automatic countdowns require energy to rise by at least 0.035 across the last
  four bars; a high but flat level can still enter the peak movement without a
  countdown. The manual DROP action remains available without that condition.
- The groove's Underground Sequence wall solo lasts 38 bars, giving its six-scene
  film a complete run. Switching away clears old phosphor trails but preserves
  the film's beat origin; a reset beat clock starts a new run.
- In Safe Mode, a strobe-only solo becomes a slow aurora wall instead of an
  empty room. Changing Safe Mode immediately recomposes the current automatic
  cue and countdown rung, without taking control from manual lighting.

### Room DJ and Audio Effects

In a room, the host's **RESIDENT DJ** toggle sends the DJ home or brings them back
for everyone. Guests may still hide the DJ for themselves, but cannot override a
host absence. Their saved personal people-hiding choices are not overwritten.

The host's nine audio controls are shared: low-pass, high-pass, echo, flanger,
reverb, phaser, noise sweep, gater and crossfader. They update with the existing
host frames, at most four times a second, including late joiners. Saved-link music
is processed on each listener; a local-file broadcast is already processed and
must not receive a second wet effect or crossfader attenuation. Guests cannot turn
the host's knobs. Returning their personally hidden DJ does not clear host effects.
Leaving or blocking the host restores local settings; promotion to host keeps the
current effect values. This shares settings, not sample-exact modulation phases.

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
- **Pattern 1 (STATIC DOWN)** - All lights point straight down at dance floor (Cyan) **← DEFAULT**
- **Pattern 2 (SYNC SWEEP)** - All lights sweep side-to-side together in sync (Pink)
- **Pattern 0 (RANDOM)** - Auto-cycles through 7 different movement patterns every ~10 seconds (Magenta)

The button flashes with a different color for each pattern to show which is active.

**Cycle Order**: STATIC DOWN (start) → SYNC SWEEP → RANDOM → STATIC DOWN (repeat)

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
  - Cyan = Static Down pattern (DEFAULT - straight down)
  - Pink = Sync Sweep pattern (left-to-right sweeping)
  - Magenta = Random pattern (auto-cycling complex movements)

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

1. **Start Simple**: App starts with STATIC DOWN (beams pointing straight down)
2. **Add Sweep**: Click PATTERN once to get SYNC SWEEP (pink flash) for synchronized side-to-side motion
3. **Explore Patterns**: Click PATTERN again to get RANDOM (magenta flash) for auto-cycling movements
4. **Back to Static**: Click PATTERN again to return to STATIC DOWN
5. **Change Colors**: Click NEXT COLOR every 15-20 seconds for variety
6. **Disco Moment**: Activate DISCO BALL for a classic retro moment
7. **Control Everything**: Independently toggle each lighting system (spots, lasers, LED, strobes)

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
- VR users: Press `Y` (or the exposed menu button) anywhere in the club, then use the controller pointer and trigger on the camera-relative quick menu

**Patterns not changing?**
- Click the PATTERN button - it cycles through 3 modes
- Watch for the color flash: Cyan (Static) → Pink (Sweep) → Magenta (Random)
- Check console logs for confirmation
- Default is STATIC DOWN (cyan flash on first click)

**Lights seem static?**
- App starts with STATIC DOWN pattern (beams point straight down)
- Click PATTERN button once to get synchronized sweeping (pink flash)
- SPOT MODE might also be set to "Static" (mode 3) - click to cycle
- Try: PATTERN (pink flash for sweep) + SPOT MODE (cyan flash for sweep only)

## Future Enhancements
- Speed control slider for pattern/sweep speed
- Blackout button (all lights off instantly)
- Save/recall preset lighting scenes
- MIDI controller integration
