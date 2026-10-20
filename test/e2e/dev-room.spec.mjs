import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness, expectHealthyRuntime, browserFailures } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';
import { DevAttendees, DEV_NAV_EDGES, ATTENDEE_NAMES } from '../../worker/src/devAttendees.js';

useQuestHarness();

test('DEV code joins a real relay simulation with 31 moving peers, persistent dances and VR-safe cleanup', async ({ page, context }) => {
    test.setTimeout(900_000);
    const room = new ClubRoom({}, {
        ROOM_CAPACITY: '32', MEDIA_TRANSPORT: 'sfu', DEV_ROOM_ENABLED: '1',
        SFU_APP_ID: 'browser-test', SFU_APP_SECRET: 'browser-fixture'
    });
    room._roomName = 'private-000032';
    room.world = { v: 1, seed: 456, startedAt: Date.now() };
    // The account check is covered with real SQLite in access-recovery.test.mjs.
    // This transport bridge runs ClubRoom itself; no avatars or poses are injected into the browser.
    let checked = 0;
    await page.route('**/payments/dev-room', async route => {
        expect(route.request().method()).toBe('POST');
        checked++;
        await route.fulfill({ json: { room: 'private-000032' } });
    });
    await context.routeWebSocket(/.*/, route => {
        const socket = {
            accept() {}, addEventListener() {},
            send: data => route.send(data),
            close: (code, reason) => route.close({ code, reason })
        };
        const url = new URL(route.url());
        expect(['localhost', '127.0.0.1']).toContain(url.hostname);
        expect(url.searchParams.get('room')).toBe('private-000032');
        const owner = room._acceptSession(socket, url.searchParams.get('name'), null, 'any', true);
        route.onMessage(data => room._onMessage(socket, owner, { data }));
        route.onClose(() => room._onClose(socket, owner));
    });
    try {
        await enterClub(page);
        room._simulation = new DevAttendees(456);
        await page.evaluate(async () => {
            const club = window.vrClub;
            await club.modelLoadPromise;
            club.multiplayer.joinRoom('000032');
        });
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.client?.peers.size), { timeout: 60_000 }).toBe(31);
        expect(checked).toBe(1);
        expect(room.sessions.size).toBe(32);
        expect(room.media.members.size).toBe(1);
        const first = await page.evaluate(() => {
            const club = window.vrClub;
            return {
                host: club.multiplayer.isHost(),
                peers: [...club.multiplayer.client.peers].map(([id, peer]) => ({ id, name: peer.name, simulated: peer.simulated, state: peer.state }))
            };
        });
        expect(first.host).toBe(true);
        expect(first.peers.every(peer => peer.simulated && ATTENDEE_NAMES.includes(peer.name))).toBe(true);
        expect(new Set(first.peers.map(peer => peer.name)).size).toBe(31);
        await expect.poll(() => page.evaluate(peers => {
            const current = window.vrClub.multiplayer.client.peers;
            return peers.filter(peer => {
                const state = current.get(peer.id)?.state;
                return state && Math.hypot(state.x - peer.state.x, state.z - peer.state.z) > 0.5;
            }).length;
        }, first.peers), { timeout: 90_000 }).toBeGreaterThan(0);
        expect(await page.evaluate(id => window.vrClub.multiplayer.transferHost(id), first.peers[0].id)).toBe(false);

        const dancer = [...room.sessions.values()].find(peer => peer.simulated && peer.lastState.dancing);
        expect(dancer).toBeTruthy();
        // Hold the server clock while software GL loads the selected body. This also
        // proves a late body uses the retained dance state without another dance event.
        clearInterval(room._poseTimer);
        room._poseTimer = null;
        await page.evaluate(({ id, state }) => {
            const club = window.vrClub;
            club.camera.position.set(state.x + 1.5, 1.7, state.z + 1.5);
            club.camera.setTarget(new window.BABYLON.Vector3(state.x, 1.2, state.z));
            window.devDancer = id;
        }, { id: dancer.id, state: dancer.lastState });
        await expect.poll(() => page.evaluate(() => {
            const peer = window.vrClub.avatarManager.remotes.get(window.devDancer);
            return peer?.person?.current;
        }), { timeout: 90_000 }).toBe('Dance_Loop');
        expect(await page.evaluate(() => window.vrClub.avatarManager.remotes.get(window.devDancer).gesture.dancing)).toBe(true);
        expect(await page.evaluate(() => window.vrClub.avatarManager.remotes.get(window.devDancer).person.groups.Dance_Loop.isPlaying)).toBe(true);
        await expect.poll(() => page.evaluate(() => {
            const peer = window.vrClub.avatarManager.remotes.get(window.devDancer);
            return performance.now() / 1000 - peer.lastEmojiAt;
        })).toBeGreaterThan(0.5);
        room._simulation.guests.get(dancer.simulatedIndex).gestureAt = room._simulation.clock;
        room._flushPoses(room._simulation.now + 50);
        await expect.poll(() => page.evaluate(() => !!window.vrClub.avatarManager.remotes.get(window.devDancer).emojiPlane)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.vrClub.avatarManager.remotes.get(window.devDancer).person.current),
            { timeout: 30_000 }).toBe('Dance_Loop');
        room._simulation.chatAt = room._simulation.clock;
        room._flushPoses(room._simulation.now + 50);
        const speaker = [...room._simulation.guests.values()].find(bot => bot.chat);
        expect(speaker).toBeTruthy();
        const speakerId = [...room.sessions.values()].find(session => session.simulatedIndex === speaker.index).id;
        await expect.poll(() => page.evaluate(id =>
            !!window.vrClub.avatarManager.remotes.get(id)?.chatPlane?.isEnabled(), speakerId)).toBe(true);
        const seated = [...room._simulation.guests.values()].find(bot => bot.state.seated);
        expect(seated).toBeTruthy();
        const seatId = seated.state.seat;
        expect(await page.evaluate(id => {
            const club = window.vrClub;
            const seat = club.scene.meshes.flatMap(mesh => mesh.metadata?.vrclubSeats || []).find(seat => seat.id === id);
            if (!seat) throw new Error(`Missing real furniture ${id}`);
            return club.sitAtSeat(seat);
        }, seatId)).toBe(false);
        await expect.poll(() => seated.yielding).toBe(true);
        for (let i = 0; i < 240; i++) room._flushPoses(room._simulation.now + 50);
        await expect.poll(() => page.evaluate(() => window.vrClub._activeSeat?.id), { timeout: 30_000 }).toBe(seatId);
        expect(seated.state.seated && seated.state.seat === seatId).toBe(false);
        expect(await page.evaluate(() => window.vrClub._devSeatWaitObserver)).toBeNull();
        await page.evaluate(() => window.vrClub.standFromSeat(false));
        const toiletGuest = [...room._simulation.guests.values()].find(bot => bot.state.seat?.startsWith('toilet-'));
        expect(toiletGuest).toBeTruthy();
        const toiletId = toiletGuest.state.seat;
        await expect.poll(() => page.evaluate(id =>
            window.vrClub._restroomDoors.find(door => door.seatId === id).remote, toiletId)).toBe(true);
        expect(await page.evaluate(id => {
            const club = window.vrClub, door = club._restroomDoors.find(door => door.seatId === id);
            return club._pressStallDoor({ pickedMesh: door.leaf });
        }, toiletId)).toBe(true);
        await expect.poll(() => toiletGuest.yielding).toBe(true);
        for (let i = 0; i < 240; i++) room._flushPoses(room._simulation.now + 50);
        await expect.poll(() => page.evaluate(id =>
            window.vrClub._restroomDoors.find(door => door.seatId === id).remote, toiletId)).toBe(false);
        room._poseTimer = setInterval(() => room._flushPoses(), 50);
        room._poseTimer.unref();

        const routes = DEV_NAV_EDGES;
        const obstructions = await page.evaluate(routes => {
            const B = window.BABYLON, scene = window.vrClub.scene, hits = new Set();
            const ray = new B.Ray(B.Vector3.Zero(), B.Vector3.Up(), 0.95);
            const architectural = mesh => mesh.isEnabled() && mesh.checkCollisions &&
                /wall|rail|streetDoorBlock|cityBlock|mezzPanel/i.test(mesh.name);
            for (const nodes of routes) for (let i = 0; i < nodes.length - 1; i++) {
                const a = nodes[i], b = nodes[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
                for (let d = 0; d < length; d += 0.25) {
                    const t = d / length;
                    ray.origin.set(a.x + (b.x - a.x) * t, a.floorY + (b.floorY - a.floorY) * t + 0.35, a.z + (b.z - a.z) * t);
                    const pick = scene.pickWithRay(ray, architectural);
                    if (pick?.hit) hits.add(pick.pickedMesh.name);
                }
            }
            return [...hits];
        }, routes);
        expect(obstructions).toEqual([]);
        await enterVR(page);
        await expect.poll(() => page.evaluate(() => window.vrClub.avatarManager.getDiagnostics().participants)).toBe(32);
        await page.screenshot({ path: test.info().outputPath('dev-room-vr.png') });
        await expectHealthyRuntime(page);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        expect(room.sessions.size).toBe(0);
        expect(room._poseTimer).toBeNull();
        expect(room._sweeper).toBeNull();
    } catch (error) {
        console.log('DEV_ROOM_FAILURE', JSON.stringify({
            errors: browserFailures.get(page)?.slice(-8),
            scene: await page.evaluate(() => {
                const club = window.vrClub, peer = club.avatarManager?.remotes.get(window.devDancer);
                return {
                    status: club.multiplayer?.client?.status, error: club.multiplayer?.lastError,
                    diagnostics: club.avatarManager?.getDiagnostics(), poseTime: club.avatarManager?._poseTime,
                    camera: club._playerCamera()?.globalPosition?.asArray(),
                    selected: peer && { avatar: peer.avatarId, root: peer.root.position.asArray(), target: peer.target,
                        wanted: peer.detailWanted, loading: peer.detailLoading, hidden: peer.hidden, culled: peer.culled,
                        dancing: peer.gesture.dancing, clip: peer.person?.current }
                };
            })
        }));
        throw error;
    } finally {
        for (const [socket, session] of [...room.sessions]) if (!session.simulated) room._onClose(socket, session);
    }
});
