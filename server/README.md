# VR Club Multiplayer Server

WebSocket-based multiplayer server for VR Club. Allows multiple users (desktop + VR) to share the same club experience with synchronized lighting, audio, and avatars.

## Features

- **Real-time player positions** - See other players moving around the club
- **VR tracking** - Full head and hand tracking for VR users
- **Synchronized VJ controls** - All players see the same lighting effects
- **Audio streaming sync** - Hear the same music at the same time
- **Avatar system** - Different representations for VR vs desktop users
- **Name labels** - See player names above avatars

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Start Server

```bash
npm start
```

Server will start on `ws://localhost:8080`

### 3. Connect Clients

1. Open VR Club in multiple browser windows/devices
2. Click the **👥 Multiplayer** button (top-left)
3. Enter server URL: `ws://localhost:8080`
4. Enter your username
5. Click **Connect**

## Development

Use nodemon for auto-restart on file changes:

```bash
npm run dev
```

## Configuration

Edit `server.js` to change:

- **Port**: `const PORT = process.env.PORT || 8080;`
- **Default club state**: `const clubState = { ... }`

## Server Messages

### Client → Server

- `setUsername` - Set player username
- `positionUpdate` - Update player position/rotation
- `vjControl` - VJ control change (lights, lasers, etc.)
- `audioSync` - Audio URL and playback state
- `chat` - Chat message (future feature)

### Server → Client

- `welcome` - Connection confirmed with player ID and current state
- `playerJoined` - New player connected
- `playerLeft` - Player disconnected
- `playerPosition` - Player movement update
- `vjControl` - VJ control broadcast
- `audioSync` - Audio sync broadcast

## Production Deployment

For public hosting, use a proper WebSocket server:

1. **Heroku**: Use `PORT` environment variable
2. **AWS/Azure**: Use WebSocket-enabled load balancer
3. **DigitalOcean**: Deploy as Node.js app

### Environment Variables

```bash
PORT=8080  # Server port
```

## Security Notes

- ⚠️ No authentication in current version
- ⚠️ No rate limiting
- ⚠️ No input sanitization

For production use, add:
- User authentication
- Rate limiting
- Input validation
- SSL/TLS (wss://)

## Troubleshooting

### "Connection refused"
- Check server is running: `npm start`
- Verify port 8080 is available
- Check firewall settings

### "No avatars visible"
- Verify NetworkManager loaded: Check browser console
- Check player positions are updating
- Verify avatars created: `vrClub.avatarManager.getPlayerCount()`

### "Audio out of sync"
- Audio sync has ~200ms latency
- Ensure all clients use same audio URL
- Check network connection quality

## Architecture

```
Client 1 (Desktop) ←→ WebSocket Server ←→ Client 2 (VR)
         ↑                    ↓
      Browser            Relays all
     Babylon.js          messages to
   NetworkManager        all clients
   AvatarManager
```

## License

MIT
