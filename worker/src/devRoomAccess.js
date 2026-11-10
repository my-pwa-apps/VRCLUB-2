import { accessSession } from './accessRecovery.js';
import { verifyAdmin } from './invitationAdmin.js';

export const DEV_ROOM = 'private-000032';
export const DEV_OWNER_HEADER = 'X-Nocturne-Dev-Owner';
export const DEV_OWNER_COOKIE = '__Secure-NocturneDevOwner';
export const DEV_OWNER_SIGN_IN = '/admin/dev-owner/sign-in';

export async function devRoomAccess(request, env) {
    const owners = (env.DEV_ROOM_OWNERS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    if (env.DEV_ROOM_ENABLED !== '1' || !env.DB || !owners.length || env.MEDIA_TRANSPORT !== 'sfu') {
        return { status: 503, error: 'dev_room_disabled', message: 'The developer room is not enabled on this relay.' };
    }
    if (env.DEV_OWNER_ACCESS === '1') {
        if (!env.DEV_OWNER_ORIGIN || !env.DEV_ACCESS_TEAM_DOMAIN || !env.DEV_ACCESS_AUD) {
            return { status: 503, error: 'dev_room_owner_config', message: 'Development owner verification is not configured.' };
        }
        const url = new URL(request.url);
        if (url.origin !== env.DEV_OWNER_ORIGIN || ![DEV_OWNER_SIGN_IN, '/dev-owner/check', '/dev-owner/socket'].includes(url.pathname)) {
            return { status: 403, error: 'dev_room_owner_origin', message: 'Use the development owner connection to join room 000032.' };
        }
        const signingIn = url.pathname === DEV_OWNER_SIGN_IN;
        const cookies = (request.headers.get('Cookie') || '').split(';').map(value => value.trim());
        const ownerCookies = cookies.filter(value => value.startsWith(`${DEV_OWNER_COOKIE}=`));
        const token = signingIn ? request.headers.get('Cf-Access-Jwt-Assertion') :
            ownerCookies.length === 1 ? ownerCookies[0].slice(DEV_OWNER_COOKIE.length + 1) : null;
        const headers = new Headers(request.headers);
        headers.delete('Cf-Access-Jwt-Assertion');
        if (token && token.length <= 3800) headers.set('Cf-Access-Jwt-Assertion', token);
        const owner = await verifyAdmin(new Request(request, { headers }), {
            ACCESS_TEAM_DOMAIN: env.DEV_ACCESS_TEAM_DOMAIN,
            ACCESS_AUD: env.DEV_ACCESS_AUD,
            INVITATION_ADMINS: env.DEV_ROOM_OWNERS
        });
        return owner ? null : {
            status: 401, error: 'dev_room_sign_in',
            message: 'Sign in as the development owner using Owner sign-in, then return here and join room 000032 again.'
        };
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
