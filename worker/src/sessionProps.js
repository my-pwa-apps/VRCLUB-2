// Four self-service water positions, separate from the resident bartender's service.
export const WATER_SLOTS = Object.freeze([-7, -7.3, -7.6, -7.9]);

export function applyWaterAction(drinks, session, action, hand = 'right') {
    if (session.simulated || !['order', 'pickup', 'putdown'].includes(action)) return 'Invalid water action.';
    const state = session.lastState;
    if (!state || Date.now() - session.lastStateAt > 5000 ||
        Math.abs(state.x - 9.7) > 2 || state.z < -8.8 || state.z > -6) return 'Use the self-service water station at the bar.';
    const current = drinks.get(session.id);
    if (action === 'order') {
        if (current) return 'Your water is already at the station.';
        const slot = WATER_SLOTS.findIndex((_, i) => ![...drinks.values()].some(drink => drink.slot === i));
        if (slot < 0) return 'All water positions are in use. Try again shortly.';
        drinks.set(session.id, { slot, held: false, hand: 'right' });
        return null;
    }
    if (!current) return 'Order your water first.';
    if (action === 'pickup') {
        if (!['left', 'right'].includes(hand) || current.held) return 'Choose a free hand.';
        current.hand = hand;
        current.held = true;
    } else {
        if (!current.held) return 'Your water is already on the counter.';
        current.held = false;
    }
    return null;
}

export function waterSnapshot(drinks, sessions, viewer, visible) {
    const out = [];
    for (const [id, drink] of drinks) {
        const owner = [...sessions.values()].find(person => person.id === id);
        if (owner && (owner === viewer || visible(owner, viewer))) out.push({ id, ...drink });
    }
    return out;
}
