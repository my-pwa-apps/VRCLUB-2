export const RESTROOM_ACTIONS = ['seat', 'lid', 'tap', 'flush'];
export const TAP_DURATION_MS = 12000;
export const FLUSH_DURATION_MS = 6000;
export const FLUSH_COOLDOWN_MS = 15000;

export function createRestroomState() {
    return { seats: [false, false], lids: [true, true], taps: [0, 0], flushes: [0, 0] };
}

export function applyRestroomAction(state, message, now, occupied) {
    const { action, fixture, on } = message;
    if (!RESTROOM_ACTIONS.includes(action) || !Number.isInteger(fixture) || fixture < 0 || fixture > 1 ||
        (action !== 'flush' && typeof on !== 'boolean')) return 'Invalid restroom control.';
    if ((action === 'seat' || action === 'lid') && occupied) return 'This toilet is occupied.';
    if (action === 'seat') {
        state.seats[fixture] = on;
        if (on) state.lids[fixture] = true;
    } else if (action === 'lid') {
        state.lids[fixture] = on;
        if (!on) state.seats[fixture] = false;
    } else if (action === 'tap') {
        state.taps[fixture] = on ? now + TAP_DURATION_MS : 0;
    } else {
        const last = state.flushes[fixture];
        if (last && now < last - FLUSH_DURATION_MS + FLUSH_COOLDOWN_MS) return 'Please wait before flushing again.';
        state.flushes[fixture] = now + FLUSH_DURATION_MS;
    }
    return null;
}
