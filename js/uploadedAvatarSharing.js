'use strict';

class UploadedAvatarSharing {
    constructor(club) {
        this.club = club;
        this.client = null;
        this.message = 'Sharing is off. Your uploaded model stays on this device.';
        this.enabled = false;
        this._revision = 0;
        this._queue = Promise.resolve();
        this._controllers = new Set();
        this._publishedHash = null;
        this._publishedSource = null;
        this._publishedLook = null;
        try { this.enabled = localStorage.getItem('vrclub.shareUploadedAvatar') === '1'; }
        catch (error) {
            console.warn('Could not read uploaded avatar sharing preference:', error);
            club.showErrorMessage('Avatar sharing preference could not be read. Sharing remains off.');
        }
        if (this.enabled) this.message = 'Sharing is enabled. Join a room to share your uploaded avatar.';
    }

    status() { return { enabled: this.enabled, message: this.message }; }

    emit(message) {
        this.message = message;
        window.dispatchEvent(new CustomEvent('customavatarsharingchange'));
    }

    setEnabled(enabled) {
        localStorage.setItem('vrclub.shareUploadedAvatar', enabled ? '1' : '0');
        this.enabled = !!enabled;
        this.emit(this.enabled ? 'Sharing enabled. Room guests may retain a copy of your uploaded model.'
            : this._publishedHash ? 'Stopping room sharing…' : 'Sharing is off. Your uploaded model stays on this device.');
        this.sync();
    }

    connect(client) {
        if (client === this.client) return;
        this._revision++;
        for (const controller of this._controllers) controller.abort();
        this._controllers.clear();
        this.client = client;
        this._publishedHash = this._publishedSource = this._publishedLook = null;
        this.sync();
    }

    async request(client, method, body = null, extra = {}) {
        if (!client?.avatarAssetToken || !client.uploadedAvatarsSupported) throw new Error('This relay does not support uploaded avatar sharing.');
        const url = new URL(client.serverUrl);
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        url.pathname = '/avatars';
        url.search = '';
        url.searchParams.set('room', client.room);
        if (extra.id) url.searchParams.set('id', extra.id);
        if (extra.hash) url.searchParams.set('hash', extra.hash);
        const controller = new AbortController();
        this._controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 45000);
        try {
            const headers = { Authorization: `Bearer ${client.avatarAssetToken}` };
            if (method === 'PUT') {
                headers['Content-Type'] = 'model/gltf-binary';
                headers['X-Avatar-Appearance'] = JSON.stringify(extra.appearance);
            } else if (method === 'POST') headers['Content-Type'] = 'application/json';
            const response = await fetch(url, { method, body, headers, signal: controller.signal, cache: 'no-store', credentials: 'omit' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `Avatar sharing failed (${response.status}).`);
            }
            if (method !== 'GET') return await response.json();
            const limit = 8 * 1024 * 1024;
            const length = Number(response.headers.get('content-length'));
            if (length > limit) throw new Error('Shared avatar exceeds the 8 MiB limit.');
            const reader = response.body.getReader();
            const chunks = [];
            let size = 0;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > limit) throw new Error('Shared avatar exceeds the 8 MiB limit.');
                    chunks.push(value);
                }
            } catch (error) {
                await reader.cancel();
                throw error;
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            return bytes.buffer;
        } finally { clearTimeout(timer); this._controllers.delete(controller); }
    }

    sync() {
        const revision = ++this._revision;
        this._queue = this._queue.then(async () => {
            const club = this.club, client = this.client;
            if (revision !== this._revision) return;
            if (!client || client.status !== 'connected') {
                this.emit(this.enabled ? 'Sharing is enabled. Join a room to share your uploaded avatar.' : 'Sharing is off. Your uploaded model stays on this device.');
                return;
            }
            const wait = Math.max(0, 1100 - (Date.now() - (this._mutationAt || 0)));
            if (wait) await new Promise(resolve => setTimeout(resolve, wait));
            if (revision !== this._revision || client !== this.client) return;
            const active = this.enabled && club.isCustomAvatarSelected();
            if (!active) {
                if (this._publishedHash) {
                    this._mutationAt = Date.now();
                    await this.request(client, 'DELETE');
                }
                this._publishedHash = this._publishedSource = this._publishedLook = null;
                this.emit('Your uploaded avatar is not shared with this room.');
                return;
            }
            if (!client.uploadedAvatarsSupported) throw new Error('This relay needs an update before guests can see uploaded avatars.');
            const bytes = club._customAvatarBytes;
            if (!bytes) throw new Error('Reload your uploaded GLB before sharing it.');
            if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Online uploaded avatars must be no larger than 8 MiB. Your local model is unchanged.');
            const appearance = club.getCustomAvatarAppearance();
            const look = window.CustomAvatarAppearance.key(appearance);
            let response;
            if (this._publishedSource !== bytes) {
                this.emit('Sharing your uploaded avatar with room guests…');
                this._mutationAt = Date.now();
                response = await this.request(client, 'PUT', bytes, { appearance });
            } else if (this._publishedLook !== look) {
                this._mutationAt = Date.now();
                response = await this.request(client, 'POST', JSON.stringify(appearance));
            } else return;
            if (client !== this.client) return;
            this._publishedHash = response.model.hash;
            this._publishedSource = bytes;
            this._publishedLook = look;
            if (revision !== this._revision) return;
            this.emit('Room guests can see your customized uploaded avatar. They may retain a copy.');
        }).catch(error => {
            if (revision !== this._revision) return;
            console.warn('Uploaded avatar sharing failed:', error);
            this.emit(error.message);
            this.club.showErrorMessage(error.message);
        });
        return this._queue;
    }

    async download(id, model) {
        const client = this.client;
        const bytes = await this.request(client, 'GET', null, { id, hash: model.hash });
        if (client !== this.client) throw new Error('The room changed while loading an uploaded avatar.');
        if (bytes.byteLength !== model.bytes || bytes.byteLength > 8 * 1024 * 1024) throw new Error('Shared avatar has an invalid size.');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== model.hash) throw new Error('Shared avatar integrity check failed.');
        return bytes;
    }

    dispose() {
        this._revision++;
        for (const controller of this._controllers) controller.abort();
        this._controllers.clear();
        this.client = null;
    }
}
window.UploadedAvatarSharing = UploadedAvatarSharing;
