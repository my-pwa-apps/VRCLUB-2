# LED Wall Documentation

## Overview
Added a large animated LED wall behind the DJ booth with synchronized pattern animations.

## Specifications

### Physical
- **Location**: Behind DJ booth at position (0, 3, -23.9)
- **Size**: 10 meters wide × 6 meters tall
- **Grid**: 6 columns × 4 rows = 24 individual panels
- **Panel Size**: 1.5m × 1.3m each
- **Frame**: Black box (10m × 6m × 0.15m)

### Animation System

#### 6 Pattern Types
1. **Wave Left-Right**: Light travels horizontally across columns
2. **Wave Top-Bottom**: Light travels vertically down rows
3. **Checkerboard**: Alternating diagonal pattern
4. **Horizontal Stripes**: Every other row lights up
5. **Vertical Stripes**: Every other column lights up
6. **Random Sparkle**: Panels randomly flash on/off

#### 6 Color Cycle
- Red (#ff0000)
- Green (#00ff00)
- Blue (#0000ff)
- Magenta (#ff00ff)
- Yellow (#ffff00)
- Cyan (#00ffff)

#### Timing
- **Pattern Change**: Every 2 seconds (switches to next pattern)
- **Color Cycle**: Every 12 seconds (6 patterns × 2 seconds)
- **Complete Cycle**: 72 seconds (6 colors × 6 patterns × 2 sec)

## Technical Implementation

### HTML Structure
```html
<a-entity id="dj-led-wall" position="0 3 -23.9">
  <a-box> <!-- Frame -->
  <a-entity id="led-wall-panels">
    <a-plane class="led-wall-panel"> × 24 panels
  </a-entity>
</a-entity>
```

### JavaScript Logic
- `setupLEDWall()`: Initializes panel references and timer
- `animateLEDWall()`: Called every 2 seconds to update pattern
- Pattern logic uses row/column math to determine which panels light up
- Uses flat shader for instant color changes

## Lighting Improvements

### Ambient Lighting Boost
Previous → New values:

| Light Type | Old Intensity | New Intensity | Increase |
|------------|---------------|---------------|----------|
| Ambient    | 0.8           | 1.0           | +25%     |
| Fill       | 0.4           | 0.5           | +25%     |
| Rim Lights | 0.8           | 1.0           | +25%     |
| Accent     | 0.7           | 0.9           | +29%     |

### Color Adjustments
- Ambient: `#2a2a3a` → `#3a3a4a` (lighter purple-gray)
- Fill: `#2a2a3a` → `#3a3a4a` (lighter purple-gray)
- Rim: `#3a2a4a` → `#4a3a5a` (lighter purple)
- Accent: `#2a1a3a` → `#3a2a4a` (lighter purple)

## Visual Effect
The LED wall creates a dynamic, professional backdrop for the DJ:
- Constantly changing patterns keep visual interest
- Single color per pattern creates cohesive look
- Large size (10m × 6m) makes it a focal point
- Synchronized animations appear professional
- Color cycling adds variety without chaos

## Future Enhancements
Possible additions:
- Music reactivity (change speed based on BPM)
- Text/logo display patterns
- Transition effects between patterns
- Brightness control based on audio levels
- Custom pattern sequences
