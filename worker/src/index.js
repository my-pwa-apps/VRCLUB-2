/**
 * VR Club multiplayer relay.
 *
 * This Worker does not hold any application state itself - it just looks up the
 * Durable Object for a room name and forwards the WebSocket upgrade to it. All
 * room state (connected sessions, the current host, the shared music position)
 * lives in the `ClubRoom` Durable Object below, one instance per room name.
 *
 * Message protocol (all JSON, one object per frame):
 *   client -> server
 *     { type: 'state', state: {x,y,z,rotY} }        - throttled position/facing sample
 *     { type: 'emoji', emoji: '🎉' }                  - one-shot reaction
 *     { type: 'music', url, playing, position }       - host only; shared track state
 *     { type: 'rtc-signal', target, signal }          - relayed 1:1 to `target`
 *   server -> client
 *     { type: 'welcome', id, hostId, serverTime, peers:[{id,name,state}], music }
 *     { type: 'join', id, name }
 *     { type: 'leave', id }
 *     { type: 'state', id, state }
 *     { type: 'emoji', id, emoji }
 *     { type: 'music', url, playing, position, updatedAt }
 *     { type: 'host', id }
 *     { type: 'rtc-signal', from, signal }
 *
 * Voice and any future media never touch this Worker - `rtc-signal` only carries
 * SDP offers/answers and ICE candidates so two browsers can negotiate a direct
 * peer-to-peer WebRTC audio connection (mesh: every guest connects to every
 * other guest that has enabled the microphone).
 */

const MAX_NAME_LENGTH = 32;
const MAX_EMOJI_LENGTH = 8;

export class ClubRoom {
    constructor(state) {
        this.state = state;
        /** @type {Map<WebSocket, {id: string, name: string, lastState: object|null}>} */
        this.sessions = new Map();
        this.hostId = null;
        this.musicState = null; // { url, playing, position, updatedAt }
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426 });
        }

        const url = new URL(request.url);
        const name = (url.searchParams.get('name') || 'Guest').slice(0, MAX_NAME_LENGTH);

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this._acceptSession(server, name);
        return new Response(null, { status: 101, webSocket: client });
    }

    _acceptSession(ws, name) {
        ws.accept();
        const id = crypto.randomUUID();
        const session = { id, name, lastState: null };
        this.sessions.set(ws, session);
        if (!this.hostId) this.hostId = id;

        const peers = [];
        for (const other of this.sessions.values()) {
            if (other.id === id) continue;
            peers.push({ id: other.id, name: other.name, state: other.lastState });
        }

        this._send(ws, {
            type: 'welcome',
            id,
            hostId: this.hostId,
            serverTime: Date.now(),
            peers,
            music: this.musicState
        });
        this._broadcast({ type: 'join', id, name }, ws);

        ws.addEventListener('message', (evt) => this._onMessage(ws, session, evt));
        const onClose = () => this._onClose(ws, session);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onClose);
    }

    _onMessage(ws, session, evt) {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
            case 'state':
                if (msg.state && typeof msg.state === 'object') {
                    session.lastState = {
                        x: Number(msg.state.x) || 0,
                        y: Number(msg.state.y) || 0,
                        z: Number(msg.state.z) || 0,
                        rotY: Number(msg.state.rotY) || 0
                    };
                    this._broadcast({ type: 'state', id: session.id, state: session.lastState }, ws);
                }
                break;

            case 'emoji': {
                const emoji = String(msg.emoji || '').slice(0, MAX_EMOJI_LENGTH);
                if (emoji) this._broadcast({ type: 'emoji', id: session.id, emoji }, ws);
                break;
            }

            case 'music':
                // Only the room's current host may drive the shared "now playing" state,
                // otherwise any guest could hijack everyone else's audio.
                if (session.id !== this.hostId) return;
                this.musicState = {
                    url: typeof msg.url === 'string' ? msg.url.slice(0, 2048) : null,
                    playing: !!msg.playing,
                    position: Number(msg.position) || 0,
                    updatedAt: Date.now()
                };
                this._broadcast({ type: 'music', ...this.musicState }, ws);
                break;

            case 'rtc-signal': {
                const targetWs = this._findSocketById(msg.target);
                if (targetWs && msg.signal) {
                    this._send(targetWs, { type: 'rtc-signal', from: session.id, signal: msg.signal });
                }
                break;
            }

            default:
                break;
        }
    }

    _onClose(ws, session) {
        if (!this.sessions.has(ws)) return;
        this.sessions.delete(ws);

        if (this.hostId === session.id) {
            const next = this.sessions.values().next();
            this.hostId = next.done ? null : next.value.id;
            if (this.hostId) this._broadcast({ type: 'host', id: this.hostId });
        }
        this._broadcast({ type: 'leave', id: session.id });
    }

    _findSocketById(id) {
        if (!id) return null;
        for (const [ws, session] of this.sessions) {
            if (session.id === id) return ws;
        }
        return null;
    }

    _send(ws, obj) {
        try { ws.send(JSON.stringify(obj)); } catch { /* socket already closing */ }
    }

    _broadcast(obj, exclude) {
        const data = JSON.stringify(obj);
        for (const ws of this.sessions.keys()) {
            if (ws === exclude) continue;
            try { ws.send(data); } catch { /* drop - close event will clean it up */ }
        }
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') return new Response('ok');

        const room = (url.searchParams.get('room') || 'lobby').slice(0, 64);
        const id = env.CLUB_ROOM.idFromName(room);
        const stub = env.CLUB_ROOM.get(id);
        return stub.fetch(request);
    }
};
