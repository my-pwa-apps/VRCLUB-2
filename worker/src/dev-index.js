import relay from './relay.js';
export { ClubRoom } from './relay.js';

export default {
    fetch(request, env, ctx) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/payments') || path.startsWith('/admin')) {
            return Response.json({ message: 'Payments and production access are disabled on the development service.' }, { status: 404 });
        }
        return relay.fetch(request, env, ctx);
    }
};
