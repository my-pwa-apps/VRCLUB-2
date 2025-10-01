# VR Club - Quest 3S Multiplayer Experience

A hyperrealistic WebXR virtual reality club environment with music streaming and multiplayer capabilities.

## 🎯 Features

- **Multi-Floor Environment**: Ground floor, VIP area, basement chill zone, bar, and private booths
- **Professional Lighting System**: Truss-mounted spotlights, lasers, strobes, and LED panels
- **Music-Reactive Lighting**: Real-time audio analysis makes lights respond to bass, mid, and treble frequencies
- **Multiplayer Support**: Real-time networking with Networked-A-Frame
- **Music Streaming**: Add YouTube embeds, MP3 streams, or any audio source
- **Quest 3S Optimized**: Full VR controller support and optimized performance

## 📁 Project Structure

```
VRCLUB/
├── index.html              # Main HTML structure with A-Frame scene
├── css/
│   └── styles.css         # All styling for the VR app
├── js/
│   ├── club-environment.js # Main club component (lighting, music, etc.)
│   └── init.js            # Initialization and event handlers
└── README.md              # This file
```

## 🏗️ Architecture

### Modular Design
The application is split into three main parts:

1. **HTML (index.html)**
   - A-Frame scene structure
   - 3D environment geometry
   - Entity definitions
   - Asset management

2. **CSS (css/styles.css)**
   - UI styling
   - VR button customization
   - Loading screen styles

3. **JavaScript (js/)**
   - `club-environment.js`: Core club functionality
     - Laser beam generation
     - Light show sequencing
     - Music system integration
     - Audio analysis and reactive lighting
     - Multiplayer networking
   - `init.js`: Application initialization
     - DOM ready handlers
     - VR mode event listeners

## 🚀 Getting Started

### Local Development

1. **Clone or download this repository**

2. **Start a local server** (required for WebXR):
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js http-server
   npx http-server -p 8000
   ```

3. **Open in browser**:
   ```
   http://localhost:8000
   ```

4. **For Quest 3S**:
   - Connect your Quest to the same network
   - Use your computer's local IP address
   - Enter VR mode and enjoy!

### Production Deployment

Deploy to any static hosting service:
- **GitHub Pages**: Free, HTTPS enabled
- **Vercel**: Automatic deployments from Git
- **Netlify**: Drag-and-drop deployment
- **AWS S3 + CloudFront**: Scalable hosting

**Important**: WebXR requires HTTPS in production!

## 🎮 Controls

### Desktop (Testing)
- **WASD**: Move around
- **Mouse**: Look around
- **Click**: Interact with DJ booth controls

### VR (Quest 3S)
- **Joystick**: Move around
- **Head**: Look around
- **Controller Trigger**: Select/Interact
- **Laser Pointer**: Point at DJ booth to control music

## 🎵 Adding Music

1. Walk to the DJ booth (center back of main stage)
2. Look at the control panel
3. Click/trigger to enter music URL
4. Supported formats:
   - Direct MP3/audio file URLs
   - YouTube embed URLs: `https://www.youtube.com/embed/VIDEO_ID`
   - SoundCloud embed URLs
   - Any audio stream with CORS enabled

## 💡 Lighting System

### Lighting Modes (Auto-cycles every 8 seconds)
- **Lasers**: Rotating laser beams from truss-mounted emitters
- **Spotlights**: Moving colored spotlights with LED wall panels
- **Strobes**: Sequential white strobe flashing
- **Mixed**: Combination of all effects

### Music Reactivity
When music is playing, lights react in real-time:
- **Bass** → Disco ball intensity, stage lights
- **Mid** → Laser beam intensity and opacity
- **Treble** → LED wall panel brightness

## 🌐 Multiplayer

The app uses Networked-A-Frame for real-time multiplayer:
- **Default Server**: `wss://naf-server.herokuapp.com`
- **Room**: `mainclub`
- All players in the same room see each other
- Music playback syncs across all connected players

### Setting Up Your Own Server
For better performance and control, deploy your own NAF server:
- [NAF Server on GitHub](https://github.com/networked-aframe/naf-janus-adapter)

## 🔧 Customization

### Changing Lighting Colors
Edit `js/club-environment.js`:
```javascript
const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#ffff00', '#00ffff'];
```

### Adjusting Light Mode Duration
Edit `js/club-environment.js`:
```javascript
setInterval(() => {
  // Change 8000 to desired milliseconds
}, 8000);
```

### Adding More Rooms
Edit `index.html` and add new `<a-entity>` sections following the existing room patterns.

## 🛠️ Technologies Used

- **A-Frame 1.5.0**: WebXR framework
- **A-Frame Extras**: Movement controls
- **Networked-A-Frame**: Multiplayer networking
- **Socket.io**: Real-time communication
- **Web Audio API**: Audio analysis for reactive lighting

## 📱 Browser Support

- **Quest 3S**: ✅ Full support
- **Quest 2/3**: ✅ Full support
- **Meta Quest Browser**: ✅ Recommended
- **Desktop Chrome/Edge**: ✅ (Testing mode)
- **Desktop Firefox**: ✅ (Testing mode)
- **Safari**: ⚠️ Limited WebXR support

## 🐛 Troubleshooting

### Music Won't Play
- Check CORS settings on audio source
- Try a direct MP3 URL first
- For YouTube, use embed format

### Lights Not Reactive
- Music must be playing
- Check browser console for errors
- Try refreshing the page

### Poor Performance
- Close other tabs/applications
- Lower Quest graphics settings
- Reduce number of connected players

## 📄 License

This project is open source and available for personal and commercial use.

## 🤝 Contributing

Feel free to fork, modify, and enhance! Some ideas:
- Add more room types
- Create custom avatar models
- Implement voice chat
- Add particle effects
- Create admin controls for DJs

## 📞 Support

For issues or questions, check the browser console for error messages and ensure:
1. HTTPS is enabled (for production)
2. WebXR is supported by your device
3. Microphone/audio permissions are granted (for multiplayer)

Enjoy the VR Club experience! 🎉🎵✨
