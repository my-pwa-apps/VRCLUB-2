const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Store connected clients and their state
const clients = new Map();
let playerIdCounter = 0;

// Shared club state
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

console.log(`🎧 VR Club Multiplayer Server started on port ${PORT}`);

wss.on('connection', (ws) => {
    const playerId = ++playerIdCounter;
    
    const player = {
        id: playerId,
        ws: ws,
        username: `Player${playerId}`,
        position: { x: 0, y: 1.6, z: -12 },
        rotation: { x: 0, y: 0, z: 0 },
        headPosition: null,
        leftHandPosition: null,
        rightHandPosition: null,
        isVR: false,
        connectedAt: Date.now()
    };
    
    clients.set(playerId, player);
    console.log(`✅ Player ${playerId} connected (Total: ${clients.size})`);
    
    // Send welcome message with player ID and current club state
    ws.send(JSON.stringify({
        type: 'welcome',
        playerId: playerId,
        clubState: clubState,
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
    
    // Notify all other clients about new player
    broadcast({
        type: 'playerJoined',
        player: {
            id: player.id,
            username: player.username,
            position: player.position,
            rotation: player.rotation,
            isVR: player.isVR
        }
    }, playerId);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(playerId, message);
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    });
    
    ws.on('close', () => {
        clients.delete(playerId);
        console.log(`❌ Player ${playerId} disconnected (Total: ${clients.size})`);
        
        // Notify all clients about player leaving
        broadcast({
            type: 'playerLeft',
            playerId: playerId
        });
    });
    
    ws.on('error', (err) => {
        console.error(`Error with player ${playerId}:`, err);
    });
});

function handleMessage(playerId, message) {
    const player = clients.get(playerId);
    if (!player) return;
    
    switch (message.type) {
        case 'setUsername':
            player.username = message.username;
            broadcast({
                type: 'playerUpdate',
                playerId: playerId,
                username: player.username
            });
            break;
            
        case 'positionUpdate':
            player.position = message.position;
            player.rotation = message.rotation;
            player.isVR = message.isVR || false;
            
            // VR tracking data
            if (message.headPosition) player.headPosition = message.headPosition;
            if (message.leftHandPosition) player.leftHandPosition = message.leftHandPosition;
            if (message.rightHandPosition) player.rightHandPosition = message.rightHandPosition;
            
            // Broadcast to all other clients
            broadcast({
                type: 'playerPosition',
                playerId: playerId,
                position: player.position,
                rotation: player.rotation,
                headPosition: player.headPosition,
                leftHandPosition: player.leftHandPosition,
                rightHandPosition: player.rightHandPosition,
                isVR: player.isVR
            }, playerId);
            break;
            
        case 'vjControl':
            // Update shared club state
            if (message.control in clubState) {
                clubState[message.control] = message.value;
            }
            
            // Broadcast VJ control change to all clients
            broadcast({
                type: 'vjControl',
                playerId: playerId,
                control: message.control,
                value: message.value
            });
            break;
            
        case 'audioSync':
            // Update audio state
            clubState.audioUrl = message.audioUrl;
            clubState.audioTime = message.audioTime;
            clubState.audioPlaying = message.audioPlaying;
            
            // Broadcast to all clients
            broadcast({
                type: 'audioSync',
                playerId: playerId,
                audioUrl: message.audioUrl,
                audioTime: message.audioTime,
                audioPlaying: message.audioPlaying
            });
            break;
            
        case 'chat':
            // Broadcast chat message
            broadcast({
                type: 'chat',
                playerId: playerId,
                username: player.username,
                message: message.message,
                timestamp: Date.now()
            });
            break;
    }
}

function broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    clients.forEach((player, id) => {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(data);
        }
    });
}

// Heartbeat to keep connections alive
setInterval(() => {
    clients.forEach((player, id) => {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.ping();
        }
    });
}, 30000);

console.log('🌐 Server ready for connections');
console.log('📡 Use ws://localhost:8080 to connect');
