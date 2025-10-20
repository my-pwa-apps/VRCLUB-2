# Multiplayer Network Architecture - VR Club

## Overview
The VR Club uses a **WebSocket-based multiplayer system** that synchronizes player positions, VJ lighting controls, and audio streaming between all connected users in real-time.

**Server**: `wss://vrclub-2.onrender.com` (Render.com deployment)  
**Protocol**: WebSocket with JSON messages  
**Client**: `js/networkManager.js` (WebSocket client wrapper)  
**Server**: `server/server.js` (Node.js WebSocket server)

## What's Currently Synchronized ✅

### 1. **Player Positions & Movement** ✅ FULLY IMPLEMENTED
**Update Rate**: 20Hz (50ms throttle)  
**Data Transmitted**:
- Desktop Mode:
  - Camera position (x, y, z)
  - Camera rotation (x, y, z)
  - `isVR: false` flag
  
- VR Mode:
  - Body position (base position)
  - Body rotation (base rotation)
  - Head position (HMD tracking)
  - Left hand position (left controller)
  - Right hand position (right controller)
  - `isVR: true` flag

**Implementation**:
```javascript
// Client sends (networkManager.js lines 174-219)
sendPositionUpdate(position, rotation, isVR = false, xrCamera = null) {
    // Throttled to 50ms
    // Includes VR tracking data if available
}

// Server broadcasts (server.js lines 128-144)
case 'positionUpdate':
    player.position = message.position;
    player.rotation = message.rotation;
    player.headPosition = message.headPosition; // VR only
    player.leftHandPosition = message.leftHandPosition; // VR only
    player.rightHandPosition = message.rightHandPosition; // VR only
    broadcast({ type: 'playerPosition', ... });
```

**Status**: ✅ Working perfectly - players see each other move in real-time

---

### 2. **VJ Lighting Controls** ✅ FULLY IMPLEMENTED (as of 2025-01-17)
**Update Rate**: On-demand (only when user clicks a button)  
**Synchronized Controls**:
- `lightsActive` - Main lighting system toggle
- `lasersActive` - Laser system toggle
- `ledWallActive` - LED wall toggle
- `strobesActive` - Strobe lights toggle
- `mirrorBallActive` - Mirror ball effect toggle
- `spotColorIndex` - Spotlight color (0-8 palette)
- `mirrorBallColorIndex` - Mirror ball color (0-8 palette)
- `spotlightMode` - Movement mode (0-3: strobe+sweep, sweep, strobe static, static)
- `spotlightPattern` - Pattern mode (0-2: random, static down, sync sweep)
- `spotlightSpeed` - Speed multiplier (0.1-2.0x)

**Implementation**:
```javascript
// Client sends (club_hyperrealistic.js, 6 locations)
if (this.networkManager && this.networkManager.isConnected()) {
    this.networkManager.sendVJControl(control, value);
}

// Server broadcasts (server.js lines 146-158)
case 'vjControl':
    clubState[message.control] = message.value; // Update shared state
    broadcast({ type: 'vjControl', control, value });
```

**Status**: ✅ Working - all VJ controls sync between browsers as of latest fix

---

### 3. **Audio Streaming** ⚠️ PARTIALLY IMPLEMENTED
**Update Rate**: On-demand (when audio URL changes or play/pause)  
**Synchronized Data**:
- `audioUrl` - Stream URL (e.g., Icecast/SHOUTcast server)
- `audioTime` - Current playback position (seconds)
- `audioPlaying` - Playing or paused state

**Implementation Status**:

✅ **Server Support**: Fully implemented
```javascript
// Server handles audio sync (server.js lines 160-173)
case 'audioSync':
    clubState.audioUrl = message.audioUrl;
    clubState.audioTime = message.audioTime;
    clubState.audioPlaying = message.audioPlaying;
    broadcast({ type: 'audioSync', ... });
```

✅ **Client Receiving**: Fully implemented
```javascript
// Client receives audio sync (club_hyperrealistic.js lines 4560-4564)
this.networkManager.onAudioSync = (syncData) => {
    if (syncData.audioUrl) {
        this.syncAudio(syncData.audioUrl, syncData.audioTime, syncData.audioPlaying);
    }
};

// syncAudio() method (lines 4566-4601)
syncAudio(audioUrl, audioTime, isPlaying = true) {
    // Creates audio element with Web Audio API
    // Syncs playback position
    // Connects to audio analyser for reactivity
}
```

❌ **Client Sending**: NOT IMPLEMENTED
```javascript
// toggleAudioStream() exists (lines 4873-4890) but NEVER calls sendAudioSync()
toggleAudioStream() {
    if (this.audioStreamButton.isPlaying) {
        this.audioElement.pause();
        // MISSING: this.networkManager.sendAudioSync(url, time, false);
    } else {
        this.showAudioStreamInputUI(); // Shows input dialog
    }
}

// showAudioStreamInputUI() (lines 4892-5000+) shows HTML input
// After user enters URL and clicks "Connect", audio plays locally
// MISSING: this.networkManager.sendAudioSync(url, 0, true);
```

**What Works**:
- ✅ User A can broadcast audio URL → User B receives and plays it
- ✅ Server stores audio state in `clubState`
- ✅ New users joining get current audio state

**What's Missing**:
- ❌ Audio stream button click doesn't send network message
- ❌ Play/pause doesn't sync between users
- ❌ Seek position doesn't sync
- ❌ No visual feedback showing "Host is streaming" vs "You are streaming"

---

### 4. **Chat System** ✅ SERVER READY, NO UI
**Update Rate**: On-demand (when user sends message)  
**Data Transmitted**:
- Username
- Message text
- Timestamp

**Implementation Status**:

✅ **Server Support**: Fully implemented
```javascript
// Server broadcasts chat (server.js lines 175-182)
case 'chat':
    broadcast({
        type: 'chat',
        playerId: playerId,
        username: player.username,
        message: message.message,
        timestamp: Date.now()
    });
```

✅ **Client API**: Fully implemented
```javascript
// NetworkManager has chat support (networkManager.js)
this.onChat = null; // Callback for receiving chat

sendChat(message) {
    this.send({ type: 'chat', message: message });
}

handleMessage(message) {
    case 'chat':
        if (this.onChat) this.onChat(message);
        break;
}
```

❌ **UI**: No chat interface in club_hyperrealistic.js
- No text input box
- No chat history display
- No callback assigned to `networkManager.onChat`

---

### 5. **Initial State Sync** ✅ WORKING
When a new user joins, they receive:
- Their assigned Player ID
- Current `clubState` (all VJ controls, audio URL, etc.)
- List of all connected players with positions

**Implementation**:
```javascript
// Server sends welcome message (server.js lines 51-68)
ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId,
    clubState: clubState, // All current VJ settings
    players: Array.from(clients.values()).map(p => ({
        id: p.id,
        username: p.username,
        position: p.position,
        rotation: p.rotation,
        headPosition: p.headPosition,
        leftHandPosition: p.leftHandPosition,
        rightHandPosition: p.rightHandPosition,
        isVR: p.isVR
    }))
}));

// Client receives and applies state (club_hyperrealistic.js lines 4488-4512)
this.networkManager.onConnect = (playerId, clubState, players) => {
    // Apply all VJ control states
    this.lightsActive = clubState.lightsActive;
    this.lasersActive = clubState.lasersActive;
    // ... etc for all controls
    
    // Spawn avatars for existing players
    players.forEach(player => {
        if (player.id !== playerId) {
            this.avatarManager.addAvatar(player.id, player.username, player.position);
        }
    });
};
```

**Status**: ✅ Working - new users see current lighting state immediately

---

## What's NOT Synchronized ❌

### 1. **NPC Dancer Animations** ❌
The 4 dancing NPCs are local only. Each client independently:
- Loads 4 Mixamo avatars
- Plays random dance animations
- Positions them around the dance floor

**Why It's Local**: NPCs are scene decoration, not networked entities. Syncing would require:
- Animation state (current animation name, time)
- NPC positions (if they move)
- ~200 bytes/NPC × 4 NPCs × 20Hz = 16KB/s overhead

**Recommendation**: Keep local unless you want perfectly synchronized NPC choreography.

---

### 2. **Mirror Ball Reflection Spots** ❌
The 300 mirror ball reflection spots are physics-calculated locally:
- Ray casting from mirror ball to 6 surfaces
- 300 spots × 20 rays per frame = 6000 ray casts/frame
- Each spot's position, intensity, shimmer effect

**Why It's Local**: Too expensive to sync. Would require:
- 300 spot positions × 3 floats × 4 bytes = 3.6KB per frame
- At 60 FPS: 216 KB/s per user (unsustainable)

**Recommendation**: Keep local. Deterministic if mirror ball rotation syncs (currently not synced).

---

### 3. **Audio Visualizer Reactivity** ❌
Audio-reactive lighting (bass→disco ball, mids→lasers, highs→LED) is local:
- Each client analyzes their own audio stream
- FFT frequency data drives light intensity
- Slight timing differences between clients (~50-200ms)

**Why It's Local**: 
- Audio analysis happens client-side via Web Audio API
- Network latency makes perfect sync impossible
- Audio streams may drift slightly over time

**Recommendation**: Keep local, but consider syncing the audio playback position periodically (every 5-10 seconds) to prevent drift.

---

### 4. **Procedural Texture Animations** ❌
Some textures have animated properties:
- Brick wall normal map perturbations
- LED wall pixel animations
- Laser beam intensity flicker

**Why It's Local**: Purely visual, deterministic based on time. No sync needed if all clients use `performance.now()` consistently.

---

### 5. **Camera Preset Buttons** ❌
The 6 camera preset buttons (entrance, dance floor, DJ booth, etc.) only affect the local camera.

**Why It's Local**: Each user controls their own viewpoint independently. This is intentional - users should be able to look wherever they want.

---

## Network Message Flow

### Player Joins
```
[Client A] Connect to wss://vrclub-2.onrender.com
    ↓
[Server] Assign Player ID (e.g., 123)
[Server] Send 'welcome' with clubState + player list
    ↓
[Client A] Apply VJ control states
[Client A] Spawn avatars for existing players
    ↓
[Server] Broadcast 'playerJoined' to all OTHER clients
    ↓
[Clients B, C, D] Spawn avatar for Player 123
```

### Position Update (Every 50ms)
```
[Client A] Camera moves to (5, 1.6, -12)
[Client A] sendPositionUpdate() throttled to 50ms
    ↓
[Server] Receive 'positionUpdate' from Player 123
[Server] Update player.position in clients Map
[Server] Broadcast 'playerPosition' to ALL OTHER clients
    ↓
[Clients B, C, D] Move Player 123's avatar to new position
```

### VJ Control Change
```
[Client A] Click "Lights" button
[Client A] Toggle lightsActive = !lightsActive
[Client A] Update button appearance
[Client A] sendVJControl('lightsActive', false)
    ↓
[Server] Receive 'vjControl' from Player 123
[Server] Update clubState.lightsActive = false
[Server] Broadcast 'vjControl' to ALL clients (including sender)
    ↓
[Clients A, B, C, D] onVJControl('lightsActive', false)
[Clients A, B, C, D] Turn off lights immediately
```

**Note**: Sender receives their own broadcast for consistency. Local change happens immediately, network confirmation comes ~50-100ms later.

### Audio Stream Sync (INCOMPLETE)
```
[Client A] Click "Audio Stream" button
[Client A] Enter URL: https://stream.example.com/radio.mp3
[Client A] Audio plays locally
[Client A] ❌ MISSING: sendAudioSync(url, 0, true)
    ↓
[Server] ❌ Never receives audioSync message
    ↓
[Clients B, C, D] ❌ Never get the audio stream
```

**Expected Flow** (if implemented):
```
[Client A] sendAudioSync(url, 0, true)
    ↓
[Server] Update clubState.audioUrl, audioTime, audioPlaying
[Server] Broadcast 'audioSync' to ALL clients
    ↓
[Clients A, B, C, D] syncAudio(url, 0, true)
[Clients A, B, C, D] Load and play audio at position 0
```

---

## Implementation Details

### Server State Management
The server maintains **authoritative state** in the `clubState` object:

```javascript
const clubState = {
    lightsActive: true,
    lasersActive: false,
    ledWallActive: true,
    strobesActive: true,
    mirrorBallActive: false,
    spotlightSpeed: 1.0,
    spotlightMode: 0,
    spotlightPattern: 0,
    spotColorIndex: 0,
    mirrorBallColorIndex: 0,
    audioUrl: null,
    audioTime: 0,
    audioPlaying: false
};
```

**Philosophy**: Server is source of truth. Clients can request changes, but server broadcasts final state.

### Client State Management
Clients maintain **local state** and **network state**:

```javascript
// Local state (club_hyperrealistic.js)
this.lightsActive = true; // Local toggle
this.lasersActive = false;
// ...

// When user clicks button:
this[control] = !this[control]; // Update local state immediately
this.networkManager.sendVJControl(control, this[control]); // Broadcast change

// When network update arrives:
this.networkManager.onVJControl = (control, value) => {
    this[control] = value; // Apply network state
};
```

**Philosophy**: Optimistic updates (change local state immediately, broadcast change). Network confirms state.

### Throttling Strategy
- **Position updates**: 20Hz (50ms) - Balance between smoothness and bandwidth
- **VJ controls**: On-demand - Only when user interacts
- **Audio sync**: On-demand - Only when URL/state changes
- **Heartbeat**: 30 seconds - WebSocket ping to keep connection alive

---

## Bandwidth Analysis

### Per-User Downstream (Receiving)
Assuming 10 connected players:

| Data Type | Rate | Size | Total |
|-----------|------|------|-------|
| Position updates | 20 Hz × 9 players | ~150 bytes/update | **27 KB/s** |
| VJ controls | ~5/minute | ~50 bytes | **4 bytes/s** |
| Audio sync | ~1/minute | ~100 bytes | **2 bytes/s** |
| Player join/leave | Rare | ~200 bytes | Negligible |
| **TOTAL** | | | **~27 KB/s** |

### Per-User Upstream (Sending)
| Data Type | Rate | Size | Total |
|-----------|------|------|-------|
| Position updates | 20 Hz | ~150 bytes/update | **3 KB/s** |
| VJ controls | ~5/minute | ~50 bytes | **4 bytes/s** |
| Audio sync | ~1/minute | ~100 bytes | **2 bytes/s** |
| **TOTAL** | | | **~3 KB/s** |

**Total Per User**: ~30 KB/s (~240 kbps)

**Quest 3S**: Wi-Fi 6E (up to 1.2 Gbps) - No problem  
**Desktop**: Typical broadband (10+ Mbps) - No problem  
**Mobile Hotspot**: 4G LTE (5+ Mbps) - Should work fine

---

## Missing Features & Recommendations

### Priority 1: Audio Stream Sync 🔥
**Issue**: Audio streaming exists but doesn't broadcast to other users.

**Fix Required**:
1. In `toggleAudioStream()` (line ~4890): Add `sendAudioSync()` call when pausing
2. In `showAudioStreamInputUI()` (after user clicks "Connect"): Add `sendAudioSync()` call
3. Add periodic sync every 5 seconds to prevent drift:
   ```javascript
   setInterval(() => {
       if (this.audioElement && !this.audioElement.paused && this.networkManager.isConnected()) {
           this.networkManager.sendAudioSync(
               this.audioElement.src,
               this.audioElement.currentTime,
               true
           );
       }
   }, 5000);
   ```

**Estimated Effort**: 30 minutes

---

### Priority 2: Chat UI 💬
**Issue**: Server supports chat, but no UI to send/receive messages.

**Fix Required**:
1. Add HTML chat input box (similar to audio stream input)
2. Add chat message display (last 10 messages, fading)
3. Hook up `networkManager.onChat` callback
4. Consider VR-friendly input (voice-to-text? controller keyboard?)

**Estimated Effort**: 2-3 hours

---

### Priority 3: Host/Guest Roles 👑
**Issue**: Any user can change VJ controls, which could be chaotic with many users.

**Possible Solutions**:
- **Host-only VJ controls**: Only player who started the room can DJ
- **Request DJ mode**: Users can request DJ control, host approves
- **Turn-based**: DJ control passes to next user after 5 minutes
- **Collaborative**: All users can DJ (current state)

**Recommendation**: Add `isHost` flag to first player who joins. Only host sees VJ controls as interactive. Others see read-only display.

**Estimated Effort**: 1-2 hours

---

### Priority 4: Username Display 👤
**Issue**: Player avatars exist but don't show usernames.

**Fix Required**:
1. Add 3D text label above each avatar's head
2. Use `BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh()`
3. Update label when player moves (billboard to always face camera)
4. Show "🎧 Streaming" indicator if player is audio host

**Estimated Effort**: 1 hour

---

### Priority 5: Voice Chat 🎤
**Issue**: Users can see each other and control lights, but can't talk.

**Possible Solutions**:
- **WebRTC Peer-to-Peer**: Direct audio streams between clients
- **Server-mediated**: Audio chunks sent through WebSocket (higher latency)
- **Third-party**: Integrate Agora, Twilio, or Discord

**Recommendation**: Use **WebRTC with spatial audio**:
- Closer players sound louder
- Audio pans left/right based on player position
- Works natively with Quest 3S microphone

**Estimated Effort**: 4-6 hours (complex)

---

## Testing Checklist

### Audio Stream Sync Testing (NEEDS FIX FIRST)
- [ ] Player A clicks "Audio Stream" button
- [ ] Player A enters stream URL (e.g., `https://somafm.com/groovesalad.pls`)
- [ ] Player A hears audio playing
- [ ] **Player B should automatically start playing same audio** (currently broken)
- [ ] Player A pauses → Player B should pause (currently broken)
- [ ] Player C joins mid-stream → Should start playing from current position

### VJ Control Sync Testing (WORKING)
- [x] Player A toggles lights → Player B sees lights toggle
- [x] Player A changes spotlight color → Player B sees color change
- [x] Player A changes mirror ball color → Player B sees color change
- [x] Player A cycles spotlight mode → Player B sees mode change
- [x] Player A cycles pattern → Player B sees pattern change
- [x] Player A drags speed slider → Player B sees speed change
- [x] Player A toggles lasers → Player B sees lasers toggle
- [x] Player A toggles LED wall → Player B sees LED wall toggle
- [x] Player A toggles strobes → Player B sees strobes toggle

### Position Sync Testing (WORKING)
- [x] Player A walks forward → Player B sees Player A's avatar move
- [x] Player A enters VR → Player B sees Player A's head/hands tracked
- [x] Player A exits VR → Player B sees Player A return to desktop mode
- [x] Player C joins → Players A & B see Player C's avatar spawn

### State Sync Testing (WORKING)
- [x] Player A sets lights OFF, lasers ON, mirror ball ON
- [x] Player B joins → Should see lights OFF, lasers ON, mirror ball ON
- [x] Player B should NOT reset lighting to defaults

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         VR CLUB CLIENTS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  Client A    │   │  Client B    │   │  Client C    │        │
│  │  (Desktop)   │   │  (Quest 3S)  │   │  (Desktop)   │        │
│  ├──────────────┤   ├──────────────┤   ├──────────────┤        │
│  │ Position:    │   │ Position:    │   │ Position:    │        │
│  │ (2, 1.6, -5) │   │ (0, 1.7, -12)│   │ (-3, 1.6, -8)│        │
│  │              │   │              │   │              │        │
│  │ VR: No       │   │ VR: Yes      │   │ VR: No       │        │
│  │ Streaming: ✅│   │ Streaming: ❌│   │ Streaming: ❌│        │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│         │                  │                  │                 │
│         │  Position (20Hz) │                  │                 │
│         │  VJ Controls     │                  │                 │
│         │  Audio Sync      │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │   WebSocket Server (Render)    │
            │  wss://vrclub-2.onrender.com   │
            ├────────────────────────────────┤
            │                                │
            │  clubState = {                 │
            │    lightsActive: true,         │
            │    lasersActive: false,        │
            │    audioUrl: "stream.mp3",     │
            │    audioTime: 45.3,            │
            │    audioPlaying: true,         │
            │    ... (all VJ controls)       │
            │  }                             │
            │                                │
            │  clients = Map {               │
            │    123 → Player A,             │
            │    124 → Player B,             │
            │    125 → Player C              │
            │  }                             │
            │                                │
            └────────────────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │   Broadcasts to all clients:   │
            │   - playerPosition             │
            │   - vjControl                  │
            │   - audioSync                  │
            │   - playerJoined/Left          │
            │   - chat                       │
            └────────────────────────────────┘
```

---

## Conclusion

### What's Working ✅
- **Player positions** - Perfect real-time sync with VR tracking
- **VJ lighting controls** - All 9 controls sync between users
- **Initial state sync** - New users get current lighting state
- **Player join/leave** - Avatars spawn/despawn correctly

### What's Broken ❌
- **Audio streaming** - Plays locally but doesn't broadcast to other users
- **Chat system** - Server ready, but no UI

### What's Missing 🔧
- **Host/guest roles** - Anyone can be VJ (could be chaotic)
- **Username labels** - Can't tell which avatar is which player
- **Voice chat** - Can't talk to other users

### Recommendation
**Fix audio streaming FIRST** - It's 90% done, just needs 3 calls to `sendAudioSync()`. This would enable the core multiplayer experience: multiple people in the same club, listening to the same DJ stream, with one person controlling the lights.

---

## Files Reference
- **js/networkManager.js** - WebSocket client, all send/receive methods
- **js/club_hyperrealistic.js** - Main club logic, VJ controls, audio
  - Lines 4488-4564: Network callbacks (onConnect, onPlayerJoined, onVJControl, onAudioSync)
  - Lines 4566-4601: `syncAudio()` method (receives audio sync)
  - Lines 4647-4870: VJ control button handlers (sends VJ controls)
  - Lines 4873-5000+: Audio stream UI (needs sendAudioSync calls)
- **server/server.js** - WebSocket server, message routing, state management
- **index.html** - Multiplayer UI (server URL input, connect button)
