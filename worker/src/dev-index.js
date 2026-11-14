import relay from './relay.js';
import { devRoomAccess, issueDevOwnerSession, DEV_ROOM, DEV_OWNER_SIGN_IN } from './devRoomAccess.js';
export { ClubRoom } from './relay.js';
export { LiveAudioEvent } from './liveEvents.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        if (path === DEV_OWNER_SIGN_IN) {
            const headers = {
                'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
                'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
                'x-content-type-options': 'nosniff'
            };
            if (url.origin !== env.DEV_OWNER_ORIGIN) {
                return Response.json({ message: 'Owner sign-in is unavailable on this hostname.' }, { status: 403, headers });
            }
            if (request.method !== 'GET') {
                return Response.json({ message: 'Method not allowed.' }, { status: 405, headers });
            }
            try {
                const { denied, cookie } = await issueDevOwnerSession(request, env);
                if (denied) return Response.json(denied, { status: denied.status, headers });
                headers['set-cookie'] = cookie;
                headers['content-type'] = 'text/html; charset=utf-8';
                return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Development owner signed in</title><h1>Development owner signed in</h1><p>Return to your club tab and press Join room for 000032. You can close this tab.</p><p>This login is remembered on this browser or headset for one year across restarts. It does not change purchases or production access.</p><a href="https://nocturnedev.mitwee.nl/">Open the development club</a></html>', { headers });
            } catch (error) {
                console.error('Development owner sign-in unavailable', error.name);
                return Response.json({ message: 'Owner verification is temporarily unavailable. Try signing in again shortly.' }, { status: 503, headers });
            }
        }
        if (path.startsWith('/dev-owner/')) {
            const origin = request.headers.get('Origin');
            const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
            const headers = { 'cache-control': 'no-store', 'vary': 'Origin' };
            if (url.origin !== env.DEV_OWNER_ORIGIN || !allowed.includes(origin)) {
                return Response.json({ message: 'Development owner connection origin is not allowed.' }, { status: 403, headers });
            }
            Object.assign(headers, {
                'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-methods': 'GET', 'access-control-allow-headers': 'content-type'
            });
            if (path !== '/dev-owner/check' && path !== '/dev-owner/socket') {
                return Response.json({ message: 'Development owner route not found.' }, { status: 404, headers });
            }
            if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
            if (request.method !== 'GET') return Response.json({ message: 'Method not allowed.' }, { status: 405, headers });
            if (path === '/dev-owner/check') {
                try {
                    const denied = await devRoomAccess(request, env);
                    return Response.json(denied || { ready: true }, { status: denied?.status || 200, headers });
                } catch (error) {
                    console.error('Development owner verification unavailable', error.name);
                    return Response.json({ message: 'Owner verification is temporarily unavailable. Try again shortly.' }, { status: 503, headers });
                }
            }
            url.searchParams.set('room', DEV_ROOM);
            url.searchParams.delete('event');
            try {
                const socketHeaders = new Headers(request.headers);
                socketHeaders.delete('Cf-Access-Jwt-Assertion');
                socketHeaders.delete('Cf-Access-Authenticated-User-Email');
                return await relay.fetch(new Request(url, { method: request.method, headers: socketHeaders }), env, ctx);
            } catch (error) {
                console.error('Development owner connection unavailable', error.name);
                return Response.json({ message: 'Development room connection is temporarily unavailable.' }, { status: 503, headers });
            }
        }
        if (path.startsWith('/payments') || path.startsWith('/admin')) {
            return Response.json({ message: 'Payments and production access are disabled on the development service.' }, { status: 404 });
        }
        return relay.fetch(request, env, ctx);
    }
};
