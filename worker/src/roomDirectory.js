export const ROOM_DIRECTORY_TTL = 90_000;
export const ROOM_DIRECTORY_REFRESH = 30_000;

export function validRoomName(room) {
    return typeof room === 'string' && room.length > 0 && room.length <= 64 &&
        room === room.trim() && !/[\u0000-\u001f\u007f]/.test(room);
}

export function privateRoomName(room) {
    return /^private-/i.test(room);
}

export function roomStatus(room, people, locked) {
    return { room, people, capacity: 8, locked: !!locked, active: people > 0 };
}

export async function publishRoom(db, room, people, locked) {
    if (!db || !validRoomName(room) || privateRoomName(room)) return;
    if (!people) {
        await db.prepare('DELETE FROM public_rooms WHERE room = ?').bind(room).run();
        return;
    }
    await db.batch([
        db.prepare('DELETE FROM public_rooms WHERE expires_at <= ?').bind(Date.now()),
        db.prepare(`INSERT INTO public_rooms (room, people, locked, expires_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(room) DO UPDATE SET people = excluded.people, locked = excluded.locked, expires_at = excluded.expires_at`)
            .bind(room, people, locked ? 1 : 0, Date.now() + ROOM_DIRECTORY_TTL)
    ]);
}

async function boundedBody(request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Use JSON for the room lookup.');
    if (!request.body) throw new Error('Enter a room to look up.');
    const reader = request.body.getReader(), chunks = [];
    let length = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 4096) { await reader.cancel(); throw new Error('Room lookup is too large.'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleRoomDirectory(request, env, origin) {
    const url = new URL(request.url);
    if (url.pathname !== '/rooms' && url.pathname !== '/rooms/status') return null;
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store',
        'access-control-allow-origin': origin, vary: 'Origin' };
    const json = (body, status = 200) => Response.json(body, { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
        ...headers, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type'
    } });
    if ((url.pathname === '/rooms' && request.method !== 'GET') ||
        (url.pathname === '/rooms/status' && request.method !== 'POST')) return json({ message: 'Method not allowed.' }, 405);
    if (!env.DB) return json({ message: 'The room browser is not configured on this relay.' }, 503);
    try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('CF-Connecting-IP') || 'unknown'));
        const ip = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const now = Date.now(), minute = Math.floor(now / 60_000);
        const limits = await env.DB.batch([
            env.DB.prepare('DELETE FROM room_directory_limits WHERE expires_at <= ?').bind(now),
            env.DB.prepare(`INSERT INTO room_directory_limits (key, requests, expires_at) VALUES (?, 1, ?)
                ON CONFLICT(key) DO UPDATE SET requests = requests + 1 WHERE requests < 30 RETURNING requests`)
                .bind(`${ip}:${minute}`, (minute + 1) * 60_000)
        ]);
        if (!limits[1].results.length) return json({ message: 'Too many room lookups. Please wait a minute.' }, 429);
        if (url.pathname === '/rooms') {
            const after = url.searchParams.get('after');
            if (after !== null && !validRoomName(after)) return json({ message: 'Invalid room page.' }, 400);
            const rows = await env.DB.prepare(`SELECT room, people, locked FROM public_rooms
                WHERE expires_at > ? AND people > 0 AND room NOT LIKE 'private-%' AND (? IS NULL OR room > ?)
                ORDER BY room LIMIT 51`).bind(now, after, after).all();
            return json({ rooms: rows.results.slice(0, 50).map(row => roomStatus(row.room, row.people, row.locked)),
                next: rows.results.length > 50 ? rows.results[49].room : null });
        }
        let body;
        try { body = await boundedBody(request); }
        catch { return json({ message: 'Enter up to 12 room names or private codes using JSON.' }, 400); }
        if (!Array.isArray(body?.rooms) || body.rooms.length > 12 || body.rooms.some(room => !validRoomName(room))) {
            return json({ message: 'Enter up to 12 complete room names or private codes.' }, 400);
        }
        const rooms = await Promise.all([...new Set(body.rooms)].map(async room => {
            const stub = env.CLUB_ROOM.get(env.CLUB_ROOM.idFromName(room));
            const response = await stub.fetch(new Request('https://room.internal/directory-status'));
            if (!response.ok) throw new Error('Room status is unavailable');
            const status = await response.json();
            return roomStatus(room, status.people, status.locked);
        }));
        return json({ rooms });
    } catch (error) {
        console.error('[Rooms] Directory request failed', { name: error.name });
        return json({ message: 'Could not load rooms. Please retry.' }, 503);
    }
}
