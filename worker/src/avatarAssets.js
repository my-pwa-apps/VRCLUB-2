export const AVATAR_ASSET_MAX_BYTES = 8 * 1024 * 1024;

export function sanitizeUploadedAppearance(value) {
    const fields = ['v', 'outfit', 'top', 'bottom', 'glasses', 'hat'];
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
        value.v !== 1 || !['original', 'casual', 'smart'].includes(value.outfit) ||
        !['none', 'round', 'square'].includes(value.glasses) || !['none', 'cap', 'beanie'].includes(value.hat) ||
        !/^#[0-9a-f]{6}$/i.test(value.top) || !/^#[0-9a-f]{6}$/i.test(value.bottom)) {
        throw new TypeError('Choose valid uploaded-avatar clothing, colours and accessories.');
    }
    return { v: 1, outfit: value.outfit, top: value.top.toLowerCase(), bottom: value.bottom.toLowerCase(),
        glasses: value.glasses, hat: value.hat };
}

export function validateAvatarGlb(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 28 || buffer.byteLength > AVATAR_ASSET_MAX_BYTES) {
        throw new TypeError('Shared avatars must be self-contained GLB files no larger than 8 MiB.');
    }
    const view = new DataView(buffer);
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a ||
        jsonLength > 512 * 1024 || jsonLength % 4 || jsonLength + 28 > buffer.byteLength) {
        throw new TypeError('Invalid binary GLB header.');
    }
    const binOffset = 20 + jsonLength;
    const binLength = view.getUint32(binOffset, true);
    if (view.getUint32(binOffset + 4, true) !== 0x004e4942 || binOffset + 8 + binLength !== buffer.byteLength) {
        throw new TypeError('Shared avatars require one embedded binary buffer.');
    }
    let json;
    try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 20, jsonLength))); }
    catch { throw new TypeError('Invalid avatar GLB JSON.'); }
    if (json.asset?.version !== '2.0' || json.buffers?.length !== 1 || json.buffers[0].uri ||
        !Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength > binLength ||
        (json.extensionsRequired || []).length || (json.nodes || []).length > 512 ||
        (json.materials || []).length > 16 || (json.images || []).length > 8 ||
        (json.meshes || []).length > 32 || (json.animations || []).length > 32 ||
        (json.skins || []).length !== 1 || json.skins[0].joints?.length > 128) {
        throw new TypeError('Avatar exceeds shared-model limits or requires unsupported extensions.');
    }
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        if (Object.hasOwn(value, 'uri') || Object.hasOwn(value, 'extensions')) {
            throw new TypeError('Shared avatars cannot contain external resources or loader extensions.');
        }
        for (const child of Object.values(value)) walk(child);
    };
    walk(json);
    for (const part of json.bufferViews || []) {
        const offset = part.byteOffset ?? 0;
        if (part.buffer !== 0 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(part.byteLength) ||
            part.byteLength < 0 || offset + part.byteLength > json.buffers[0].byteLength) {
            throw new TypeError('Invalid avatar buffer range.');
        }
    }
    let samples = 0;
    for (const accessor of json.accessors || []) {
        if (!Number.isInteger(accessor.count) || accessor.count < 0 || accessor.count > 100000 || accessor.sparse) {
            throw new TypeError('Invalid or oversized avatar accessor.');
        }
        samples += accessor.count;
    }
    if (samples > 1000000) throw new TypeError('Avatar animation and geometry data exceed the sharing budget.');
    let pixels = 0;
    for (const image of json.images || []) {
        const part = json.bufferViews?.[image.bufferView];
        if (!part) throw new TypeError('Avatar images must be embedded.');
        const data = new DataView(buffer, binOffset + 8 + (part.byteOffset || 0), part.byteLength);
        let width = 0, height = 0;
        if (image.mimeType === 'image/png' && data.byteLength >= 24 && data.getUint32(0) === 0x89504e47) {
            width = data.getUint32(16); height = data.getUint32(20);
        } else if (image.mimeType === 'image/jpeg' && data.byteLength >= 4 && data.getUint16(0) === 0xffd8) {
            let at = 2;
            while (at + 9 <= data.byteLength) {
                if (data.getUint8(at) !== 0xff) break;
                const marker = data.getUint8(at + 1), length = data.getUint16(at + 2);
                if (length < 2 || at + 2 + length > data.byteLength) break;
                if ([0xc0, 0xc1, 0xc2].includes(marker)) {
                    height = data.getUint16(at + 5); width = data.getUint16(at + 7); break;
                }
                at += 2 + length;
            }
        }
        if (!width || !height || width > 2048 || height > 2048) {
            throw new TypeError('Shared-avatar textures must be PNG/JPEG images at most 2048 pixels per side.');
        }
        pixels += width * height;
    }
    if (pixels > 16 * 1024 * 1024) throw new TypeError('Avatar textures exceed the shared texture budget.');
    let vertices = 0, indices = 0;
    for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
        if ((primitive.mode ?? 4) !== 4 || primitive.targets?.length ||
            !Number.isInteger(primitive.attributes?.POSITION) || !Number.isInteger(primitive.indices)) {
            throw new TypeError('Shared avatars require indexed triangles without morph targets.');
        }
        const position = json.accessors?.[primitive.attributes.POSITION];
        const index = json.accessors?.[primitive.indices];
        if (!position || !index || !Number.isInteger(position.count) || !Number.isInteger(index.count) ||
            position.count < 1 || index.count < 3) throw new TypeError('Invalid avatar geometry.');
        vertices += position.count;
        indices += index.count;
    }
    if (!vertices || vertices > 80000 || indices > 300000) throw new TypeError('Shared avatars exceed the geometry budget.');
    return json;
}

async function readBounded(request, maxBytes) {
    const reader = request.body?.getReader();
    if (!reader) throw new TypeError('Avatar request has no body.');
    const chunks = [];
    let length = 0;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reader.cancel('Avatar upload timed out').catch(error => console.error('Avatar body cancellation failed', error.message)); }, 30000);
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (timedOut) throw new TypeError('Avatar upload timed out.');
            if (done) break;
            length += value.byteLength;
            if (length > maxBytes) {
                await reader.cancel('Avatar request too large');
                throw new TypeError('Avatar request exceeds its size limit.');
            }
            chunks.push(value);
        }
        const result = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
        return result.buffer;
    } finally { clearTimeout(timer); reader.releaseLock(); }
}

export class RoomAvatarAssets {
    constructor(room) {
        this.room = room;
        this.busy = false;
    }

    announce(session) {
        const frame = { type: 'uploaded-avatar', id: session.id, model: session.uploadedAvatar || null };
        this.room._relay(session, frame);
        const ws = this.room._findSocketById(session.id);
        if (ws) this.room._send(ws, frame);
    }

    async retire(key) {
        if (!key) return;
        try { await this.room.env.AVATAR_ASSETS.delete(key); }
        catch (error) { console.error('Uploaded avatar cleanup failed', { message: error.message }); }
    }

    remove(session) {
        const key = session.avatarAssetKey;
        session.avatarAssetKey = null;
        session.uploadedAvatar = null;
        const work = this.retire(key);
        this.room.state.waitUntil?.(work);
        return work;
    }

    async fetch(request) {
        const headers = { 'cache-control': 'no-store', 'content-type': 'application/json', 'x-content-type-options': 'nosniff' };
        const reply = (body, status = 200) => Response.json(body, { status, headers });
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
        const session = [...this.room.sessions.values()].find(member => !member.simulated && member.avatarAssetToken === token);
        if (!token || !session) return reply({ message: 'Join the room before sharing or loading an uploaded avatar.' }, 403);
        const url = new URL(request.url);
        if (request.method === 'GET') {
            const now = Date.now();
            if (!session.avatarDownloadWindow || now - session.avatarDownloadWindow.at >= 60000) {
                session.avatarDownloadWindow = { at: now, count: 0 };
            }
            if (++session.avatarDownloadWindow.count > 64) return reply({ message: 'Avatar download rate exceeded. Try again shortly.' }, 429);
            const other = this.room.sessions.get(this.room._findSocketById(url.searchParams.get('id')));
            if (!other || !this.room._visible(session, other) || !other.uploadedAvatar ||
                other.uploadedAvatar.hash !== url.searchParams.get('hash')) return reply({ message: 'This avatar is no longer available to you.' }, 404);
            const key = other.avatarAssetKey;
            let object;
            try { object = await this.room.env.AVATAR_ASSETS.get(key); }
            catch (error) {
                console.error('Shared avatar download failed', { message: error.message });
                return reply({ message: 'Shared avatar storage is temporarily unavailable.' }, 503);
            }
            if (this.room.sessions.get(this.room._findSocketById(session.id)) !== session ||
                this.room.sessions.get(this.room._findSocketById(other.id)) !== other ||
                other.avatarAssetKey !== key || !this.room._visible(session, other)) {
                await object?.body?.cancel();
                return reply({ message: 'This avatar is no longer available to you.' }, 404);
            }
            if (!object) return reply({ message: 'The shared avatar could not be found.' }, 404);
            return new Response(object.body, { headers: { ...headers, 'content-type': 'model/gltf-binary',
                'content-length': String(object.size) } });
        }
        if (!['PUT', 'POST', 'DELETE'].includes(request.method)) return reply({ message: 'Method not allowed.' }, 405);
        const now = Date.now();
        if (now - (session.avatarAssetMutationAt || 0) < 1000) return reply({ message: 'Wait a moment before changing your shared avatar.' }, 429);
        if (this.busy) return reply({ message: 'Another avatar upload is in progress. Try again shortly.' }, 429);
        session.avatarAssetMutationAt = now;
        if (request.method === 'DELETE') {
            await this.remove(session);
            this.announce(session);
            return reply({ model: null });
        }
        this.busy = true;
        let pendingKey = null;
        try {
            if (request.method === 'POST') {
                const bytes = await readBounded(request, 512);
                const appearance = sanitizeUploadedAppearance(JSON.parse(new TextDecoder().decode(bytes)));
                if (!this.room.sessions.has(this.room._findSocketById(session.id))) throw new Error('You left the room during avatar customization.');
                if (!session.uploadedAvatar) return reply({ message: 'Share your model before changing its room appearance.' }, 409);
                session.uploadedAvatar = { ...session.uploadedAvatar, appearance };
            } else {
                if (request.headers.get('content-type') !== 'model/gltf-binary') throw new TypeError('Upload a binary GLB model.');
                if (now - (session.avatarAssetUploadAt || 0) < 30000) return reply({ message: 'Wait 30 seconds before uploading another model.' }, 429);
                session.avatarAssetUploadAt = now;
                const descriptor = request.headers.get('X-Avatar-Appearance') || 'null';
                if (descriptor.length > 512) throw new TypeError('Avatar clothing descriptor is too large.');
                const appearance = sanitizeUploadedAppearance(JSON.parse(descriptor));
                const buffer = await readBounded(request, AVATAR_ASSET_MAX_BYTES);
                validateAvatarGlb(buffer);
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), b => b.toString(16).padStart(2, '0')).join('');
                pendingKey = `${this.room.state.id}/${session.id}/${hash}`;
                await this.room.env.AVATAR_ASSETS.put(pendingKey, buffer, { httpMetadata: { contentType: 'model/gltf-binary' } });
                if (!this.room.sessions.has(this.room._findSocketById(session.id))) throw new Error('You left the room during avatar upload.');
                const previous = session.avatarAssetKey;
                session.avatarAssetKey = pendingKey;
                session.uploadedAvatar = { hash, bytes: buffer.byteLength, appearance };
                pendingKey = null;
                if (previous !== session.avatarAssetKey) await this.retire(previous);
            }
            this.announce(session);
            return reply({ model: session.uploadedAvatar });
        } catch (error) {
            await this.retire(pendingKey);
            const invalid = error instanceof TypeError || error instanceof SyntaxError;
            if (!invalid) console.error('Uploaded avatar operation failed', { message: error.message });
            return reply({ message: invalid ? error.message : 'Avatar sharing failed. Try again; your local avatar is unchanged.' }, invalid ? 400 : 503);
        } finally { this.busy = false; }
    }
}
