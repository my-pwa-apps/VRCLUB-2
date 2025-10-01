# 🚀 VR Club - Quick Reference

## Start Development Server

```bash
# Option 1: PowerShell (Windows)
.\start-server.ps1

# Option 2: Batch (Windows)
start-server.bat

# Option 3: NPM
npm start

# Option 4: Python
python -m http.server 8000
```

## Access the App

- **Desktop**: http://localhost:8000
- **Quest 3S**: http://YOUR_IP:8000 (get IP from server output)

## File Organization

```
📁 Project Root
  📄 index.html           ← A-Frame scene + 3D environment
  📁 css/
    📄 styles.css         ← All styling
  📁 js/
    📄 club-environment.js ← Core functionality
    📄 init.js            ← App initialization
```

## Key Components

### HTML (index.html)
- Scene setup and networking
- 3D geometry (floors, rooms, truss)
- Camera and controllers
- Assets (audio, templates)

### CSS (css/styles.css)
- VR button styling
- Loading screen
- UI elements

### JS (js/club-environment.js)
- `setupLasers()` - Generate laser system
- `setupLightShowSequence()` - Cycle lighting modes
- `setupMusicSystem()` - Music controls
- `setupAudioAnalysis()` - Reactive lighting
- `setupNetworking()` - Multiplayer sync

### JS (js/init.js)
- Initialize component on DOM ready
- VR mode event handlers

## Quick Edits

### Change Light Colors
📝 `js/club-environment.js` line ~19
```javascript
const colors = ['#ff0000', '#00ff00', ...];
```

### Change Mode Switch Timing
📝 `js/club-environment.js` line ~120
```javascript
}, 8000); // milliseconds
```

### Modify VR Button Style
📝 `css/styles.css` line ~11
```css
.a-enter-vr-button { ... }
```

### Add New Room
📝 `index.html` - Add new `<a-entity>` section

## Environment Structure

- **Ground Floor** - Main dance floor, DJ booth, stages
- **VIP Floor** (+6m) - Elevated lounge area
- **Basement** (-6m) - Chill zone
- **Bar Room** - Side area with counter
- **Booth Room** - Private spaces

## Lighting Modes

1. **Lasers** (0-8s) - Rotating laser beams
2. **Spotlights** (8-16s) - Moving colored lights
3. **Strobes** (16-24s) - Sequential flashing
4. **Mixed** (24-32s) - All effects combined

## Music Reactivity

- **Bass** → Disco ball, stage lights
- **Mid** → Laser intensity
- **High** → LED panels

## Multiplayer

- **Default Server**: wss://naf-server.herokuapp.com
- **Room**: mainclub
- **Sync**: Player positions + music state

## Controls

### Desktop
- **WASD** - Move
- **Mouse** - Look
- **Click** - Interact

### VR (Quest 3S)
- **Joystick** - Move
- **Trigger** - Interact
- **Head** - Look

## Deployment Checklist

- [ ] Test locally first
- [ ] Push to Git repository
- [ ] Deploy to hosting (GitHub Pages/Vercel/Netlify)
- [ ] Ensure HTTPS is enabled
- [ ] Test with Quest 3S
- [ ] Share URL with friends!

## Common Commands

```bash
# Install dependencies (optional)
npm install

# Start server
npm start

# Check file structure
tree /F

# Count lines
Get-Content index.html | Measure-Object -Line
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Music won't play | Check CORS, use direct MP3 URL |
| Lights not reactive | Ensure music is playing |
| Can't connect VR | Use HTTPS in production |
| Server won't start | Install Python or Node.js |

## URLs

- A-Frame Docs: https://aframe.io/docs/
- Networked-A-Frame: https://github.com/networked-aframe/networked-aframe
- WebXR API: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API

---

**Happy Coding! 🎉**
