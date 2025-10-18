/**
 * NetworkManager - Handles multiplayer networking for VR Club
 * Manages WebSocket connection, player synchronization, and state updates
 */
class NetworkManager {
    constructor(scene) {
        this.scene = scene;
        this.ws = null;
        this.connected = false;
        this.playerId = null;
        this.serverUrl = null;
        this.username = 'Guest';
        
        // Callbacks for events
        this.onConnect = null;
        this.onDisconnect = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onPlayerUpdate = null;
        this.onVJControl = null;
        this.onAudioSync = null;
        this.onChat = null;
        
        // Throttle position updates to 20Hz (50ms)
        this.lastPositionUpdate = 0;
        this.positionUpdateInterval = 50;
        
        console.log('🌐 NetworkManager initialized');
    }
    
    connect(serverUrl, username = 'Guest') {
        if (this.connected) {
            console.warn('Already connected to server');
            return;
        }
        
        this.serverUrl = serverUrl;
        this.username = username;
        
        try {
            console.log(`🔌 Connecting to ${serverUrl}...`);
            this.ws = new WebSocket(serverUrl);
            
            this.ws.onopen = () => {
                console.log('✅ Connected to multiplayer server');
                this.connected = true;
                
                // Send username
                this.send({
                    type: 'setUsername',
                    username: this.username
                });
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (err) {
                    console.error('Error parsing server message:', err);
                }
            };
            
            this.ws.onclose = () => {
                console.log('❌ Disconnected from server');
                this.connected = false;
                this.playerId = null;
                if (this.onDisconnect) this.onDisconnect();
            };
            
            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
            };
            
        } catch (err) {
            console.error('Failed to connect:', err);
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.playerId = null;
    }
    
    handleMessage(message) {
        switch (message.type) {
            case 'welcome':
                this.playerId = message.playerId;
                console.log(`🎮 Assigned Player ID: ${this.playerId}`);
                
                if (this.onConnect) {
                    this.onConnect(message.playerId, message.clubState, message.players);
                }
                break;
                
            case 'playerJoined':
                console.log(`👤 Player joined: ${message.player.username} (${message.player.id})`);
                if (this.onPlayerJoined) {
                    this.onPlayerJoined(message.player);
                }
                break;
                
            case 'playerLeft':
                console.log(`👋 Player left: ${message.playerId}`);
                if (this.onPlayerLeft) {
                    this.onPlayerLeft(message.playerId);
                }
                break;
                
            case 'playerPosition':
                if (this.onPlayerUpdate) {
                    this.onPlayerUpdate(message);
                }
                break;
                
            case 'playerUpdate':
                if (this.onPlayerUpdate) {
                    this.onPlayerUpdate(message);
                }
                break;
                
            case 'vjControl':
                console.log(`🎛️ VJ Control: ${message.control} = ${message.value}`);
                if (this.onVJControl) {
                    this.onVJControl(message.control, message.value, message.playerId);
                }
                break;
                
            case 'audioSync':
                console.log(`🎵 Audio sync: ${message.audioPlaying ? 'Playing' : 'Paused'} at ${message.audioTime}s`);
                if (this.onAudioSync) {
                    this.onAudioSync(message);
                }
                break;
                
            case 'chat':
                if (this.onChat) {
                    this.onChat(message);
                }
                break;
        }
    }
    
    send(message) {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        
        try {
            this.ws.send(JSON.stringify(message));
        } catch (err) {
            console.error('Error sending message:', err);
        }
    }
    
    // Send player position update (throttled)
    sendPositionUpdate(position, rotation, isVR = false, xrCamera = null) {
        const now = performance.now();
        if (now - this.lastPositionUpdate < this.positionUpdateInterval) {
            return; // Throttle updates
        }
        this.lastPositionUpdate = now;
        
        const update = {
            type: 'positionUpdate',
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            rotation: {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z
            },
            isVR: isVR
        };
        
        // Add VR tracking data if available
        if (isVR && xrCamera) {
            // Head position (camera)
            update.headPosition = {
                x: xrCamera.position.x,
                y: xrCamera.position.y,
                z: xrCamera.position.z
            };
            
            // Controller positions (if available)
            if (xrCamera.leftController && xrCamera.leftController.grip) {
                const leftPos = xrCamera.leftController.grip.position;
                update.leftHandPosition = {
                    x: leftPos.x,
                    y: leftPos.y,
                    z: leftPos.z
                };
            }
            
            if (xrCamera.rightController && xrCamera.rightController.grip) {
                const rightPos = xrCamera.rightController.grip.position;
                update.rightHandPosition = {
                    x: rightPos.x,
                    y: rightPos.y,
                    z: rightPos.z
                };
            }
        }
        
        this.send(update);
    }
    
    // Send VJ control change
    sendVJControl(control, value) {
        this.send({
            type: 'vjControl',
            control: control,
            value: value
        });
    }
    
    // Send audio sync state
    sendAudioSync(audioUrl, audioTime, audioPlaying) {
        this.send({
            type: 'audioSync',
            audioUrl: audioUrl,
            audioTime: audioTime,
            audioPlaying: audioPlaying
        });
    }
    
    // Send chat message
    sendChat(message) {
        this.send({
            type: 'chat',
            message: message
        });
    }
    
    isConnected() {
        return this.connected;
    }
    
    getPlayerId() {
        return this.playerId;
    }
}
