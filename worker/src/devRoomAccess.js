import { accessSession } from './accessRecovery.js';

export const DEV_ROOM = 'private-000032';
export const DEV_OWNER_HEADER = 'X-Nocturne-Dev-Owner';

export async function devRoomAccess(request, env) {
    const owners = (env.DEV_ROOM_OWNERS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    if (env.DEV_ROOM_ENABLED !== '1' || !env.DB || !owners.length || env.MEDIA_TRANSPORT !== 'sfu') {
        return { status: 503, error: 'dev_room_disabled', message: 'The developer room is not enabled on this relay.' };
    }
    const session = await accessSession(request, env);
    if (!session) {
        return { status: 401, error: 'dev_room_sign_in', message: 'Verify the owner account through Access on this device before joining DEV room 000032.' };
    }
    if (!owners.includes(session.email.toLowerCase())) {
        return { status: 403, error: 'dev_room_owner_only', message: 'DEV room 000032 is restricted to verified owner accounts.' };
    }
    return null;
}
