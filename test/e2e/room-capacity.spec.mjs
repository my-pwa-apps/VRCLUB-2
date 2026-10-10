import { test, expect } from '@playwright/test';

test('isolated live relay admits 32 guests, rejects guest 33 and discards the empty public room', async ({ page }) => {
    const relay = process.env.VRCLUB_SFU_RELAY_URL;
    test.skip(!relay, 'Set VRCLUB_SFU_RELAY_URL to an isolated development relay.');
    test.setTimeout(120_000);
    await page.route('**/capacity-test', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><title>Development room capacity test</title>'
    }));
    await page.goto('/capacity-test');
    const room = `capacity-${Date.now()}`;
    try {
        const results = await page.evaluate(async ({ relay, room }) => {
            window.capacitySockets = [];
            const welcomes = [];
            for (let i = 0; i < 32; i++) {
                const url = new URL(relay);
                url.searchParams.set('room', room);
                url.searchParams.set('name', `Load guest ${i + 1}`);
                const socket = new WebSocket(url);
                window.capacitySockets.push(socket);
                const welcome = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error(`Guest ${i + 1} timed out`)), 10_000);
                    socket.onmessage = event => {
                        const message = JSON.parse(event.data);
                        if (message.type === 'welcome') { clearTimeout(timeout); resolve(message); }
                    };
                    socket.onerror = () => { clearTimeout(timeout); reject(new Error(`Guest ${i + 1} failed`)); };
                });
                welcomes.push({ capacity: welcome.capacity, peers: welcome.peers.length });
            }
            const extraUrl = new URL(relay);
            extraUrl.searchParams.set('room', room);
            const extra = new WebSocket(extraUrl);
            window.capacitySockets.push(extra);
            const extraCode = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Guest 33 was not rejected')), 10_000);
                extra.onclose = event => { clearTimeout(timeout); resolve(event.code); };
            });
            return { welcomes, extraCode };
        }, { relay, room });
        expect(results.welcomes).toHaveLength(32);
        expect(results.welcomes.every(welcome => welcome.capacity === 32)).toBe(true);
        expect(results.welcomes[31].peers).toBe(31);
        expect(results.extraCode).toBe(4003);
    } finally {
        await page.evaluate(() => {
            for (const socket of window.capacitySockets || []) socket.close();
        });
    }
    await expect.poll(() => page.evaluate(async ({ relay, room }) => {
        const url = new URL(relay);
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        url.pathname = '/rooms';
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Directory failed: ${response.status}`);
        const data = await response.json();
        return data.rooms.some(item => item.room === room);
    }, { relay, room }), { timeout: 30_000, intervals: [2000, 4000, 6000] }).toBe(false);
});
