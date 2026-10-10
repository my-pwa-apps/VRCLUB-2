// Worker entry point. The runtime treats every export of this module as a handler or a
// Durable Object class, so the relay's constants and helpers (exported for tests) live in
// relay.js and only the two real entry points are re-exported here.
import relay, { ClubRoom } from './relay.js';
import { handlePayments } from './payments.js';
import { handleInvitationAdmin } from './invitationAdmin.js';

export { ClubRoom };

export default {
    async fetch(request, env, ctx) {
        const admin = await handleInvitationAdmin(request, env);
        if (admin) return admin;
        const origin = env.APP_ORIGIN || 'https://nocturne-vr.pages.dev';
        const payment = await handlePayments(request, env, origin);
        if (payment) return payment;
        return relay.fetch(request, env, ctx);
    }
};
