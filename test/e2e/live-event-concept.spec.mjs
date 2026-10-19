import { test, expect } from '@playwright/test';
import { useQuestHarness, enterClub, enterVR, browserFailures } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';

useQuestHarness();

test('the ordinary club allocates no ADE dressing', async ({ page }) => {
    test.skip(process.env.VRCLUB_ADE_SITE === '1', 'The dedicated ADE site intentionally enables dressing at its root.');
    await enterClub(page);
    expect(await page.evaluate(() => ({
        attached: !!window.vrClub._liveEventConcept,
        meshes: window.vrClub.scene.meshes.filter(mesh => mesh.name.startsWith('liveEventConcept')).length,
        textures: window.vrClub.scene.textures.filter(texture => texture.name.startsWith('liveEventConcept')).length
    }))).toEqual({ attached: false, meshes: 0, textures: 0 });
    await expect(page.locator('#liveEventConceptToggle')).toBeHidden();
    expect(browserFailures.get(page)).toEqual([]);
    await page.evaluate(() => window.vrClub.dispose());
});

test('dedicated ADE site enables its root and has no search or social metadata', async ({ page }) => {
    test.skip(process.env.VRCLUB_ADE_SITE !== '1', 'Requires the dedicated non-indexed ADE build.');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-live-event', 'ade');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex, nofollow/);
    await expect(page.locator('link[rel="canonical"], link[rel="sitemap"], meta[property^="og:"], meta[name^="twitter:"], [itemscope]')).toHaveCount(0);
    await expect(page).toHaveTitle('NOCTURNE / ADE concept');
});

test('ADE signs leave the LED wall clear and stay visible online, offline and in VR', async ({ page }) => {
    test.skip(process.env.VRCLUB_ADE_PITCH !== '1' && process.env.VRCLUB_ADE_SITE !== '1',
        'Requires an explicit ADE build.');
    const room = new ClubRoom({});
    await page.routeWebSocket(/vrclub-network\.garfieldapp\.workers\.dev/, route => {
        const socket = {
            accept() {},
            addEventListener() {},
            send: message => route.send(message),
            close: (code, reason) => route.close({ code, reason })
        };
        const session = room._acceptSession(socket, 'ADE branding check');
        route.onMessage(data => room._onMessage(socket, session, { data }));
        route.onClose(() => room._onClose(socket, session));
    });
    await page.goto(process.env.VRCLUB_ADE_SITE === '1' ? '/' : '/?liveEvent=demo');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready && window.vrClub?._liveEventConcept?.root,
        null, { timeout: 180_000 });
    await expect(page.locator('#splashScreen')).toBeHidden();
    await expect(page.locator('#liveEventConceptPanel')).toBeVisible();
    await expect(page.locator('#liveEventConceptPanel')).toContainText('No ADE partnership');
    await expect(page.locator('#liveEventConceptPanel input, [data-event-mode]')).toHaveCount(0);
    await page.evaluate(async () => { await window.vrClub.modelLoadPromise; });
    await page.locator('#liveEventConceptClose').click();
    await expect(page.locator('#liveEventConceptPanel')).toBeHidden();
    await expect(page.locator('#liveEventConceptToggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#liveEventConceptToggle')).toBeFocused();
    await page.waitForTimeout(600);
    await expect(page.locator('#liveEventConceptPanel')).toBeHidden();
    await page.locator('#liveEventConceptToggle').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#liveEventConceptPanel')).toBeHidden();
    await page.locator('#liveEventConceptToggle').click();
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 640 });
    await page.locator('#liveEventConceptPanel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
    await expect(page.locator('#liveEventConceptClose')).toBeInViewport();
    await page.locator('#liveEventConceptClose').click();
    await page.setViewportSize(viewport);

    expect(await page.evaluate(() => {
        const c = window.vrClub._liveEventConcept;
        const fascia = c._meshes.find(mesh => mesh.name === 'liveEventConceptDJFascia');
        const tableBounds = c.club.scene.getMeshByName('djTable').getBoundingInfo().boundingBox;
        const fasciaBounds = fascia.getBoundingInfo().boundingBox;
        const signs = c._meshes.find(mesh => mesh.material.emissiveTexture?.name === 'liveEventConceptLogoArtwork');
        const room = window.ROOM_INTERIOR;
        const vertices = signs.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        let onSurfaces = true;
        for (let i = 0; i < vertices.length; i += 3) {
            const p = BABYLON.Vector3.TransformCoordinates(
                BABYLON.Vector3.FromArray(vertices, i), signs.getWorldMatrix());
            onSurfaces &&= Math.abs(Math.abs(p.x) - (room.x.max - 0.035)) < 0.001 ||
                Math.abs(p.z - (room.z.max - 0.035)) < 0.001 ||
                Math.abs(p.z - (window.CityLayout.doorZ + 0.035)) < 0.001;
        }
        const flags = c._meshes.find(mesh => mesh.material.emissiveTexture?.name === 'liveEventConceptFlag');
        flags.computeWorldMatrix(true);
        const bounds = flags.getBoundingInfo().boundingBox;
        return {
            meshes: c._meshes.length, signVertices: vertices.length / 3, onSurfaces,
            fasciaOnTable: fasciaBounds.minimumWorld.x > tableBounds.minimumWorld.x &&
                fasciaBounds.maximumWorld.x < tableBounds.maximumWorld.x &&
                fasciaBounds.minimumWorld.y > tableBounds.minimumWorld.y &&
                fasciaBounds.maximumWorld.y < tableBounds.maximumWorld.y &&
                Math.abs(fasciaBounds.centerWorld.z - tableBounds.maximumWorld.z - 0.025) < 0.001,
            floatingRearSigns: c._meshes.filter(mesh =>
                mesh !== fascia && mesh.getBoundingInfo().boundingBox.centerWorld.z < -16).length,
            flagVertices: flags.getTotalVertices(),
            flagsClearHeads: bounds.minimumWorld.y > window.VenueLayout.vestibule.streetLevel + 2.1,
            entranceAhead: bounds.minimumWorld.z > window.CityLayout.doorZ,
            noRemovedArtwork: !c.club.scene.textures.some(texture => /liveEventConcept.*(?:Campaign|Video|Placeholder)/.test(texture.name))
        };
    })).toEqual({
        meshes: 4, signVertices: 32, onSurfaces: true, fasciaOnTable: true,
        floatingRearSigns: 0, flagVertices: 16, flagsClearHeads: true, entranceAhead: true, noRemovedArtwork: true
    });

    const rootId = await page.evaluate(() => window.vrClub._liveEventConcept.root.uniqueId);
    expect(await page.evaluate(() => {
        const club = window.vrClub;
        club.multiplayer.connect({ room: 'private-ade-branding-test', name: 'ADE branding check' });
        return { connecting: club.multiplayer.connecting, enabled: club._liveEventConcept.root.isEnabled() };
    })).toEqual({ connecting: true, enabled: true });
    await page.waitForFunction(() => window.vrClub.multiplayer.connected);
    await page.waitForTimeout(750);
    expect(await page.evaluate(() => ({
        enabled: window.vrClub._liveEventConcept.root.isEnabled(),
        rootId: window.vrClub._liveEventConcept.root.uniqueId,
        meshes: window.vrClub._liveEventConcept._meshes.length
    }))).toEqual({ enabled: true, rootId, meshes: 4 });

    for (const [name, position, target, level] of [
        ['ade-clear-led-wall', [0, 1.7, -9], [0, 2.7, -20], 0],
        ['ade-wall-signs', [0, 1.7, -10], [12.25, 5.7, -10.7], 0],
        ['ade-entrance-flags', [0, 4.5, 14], [0, 5.3, 6.3], 2.8]
    ]) {
        await page.evaluate(async ({ position, target, level }) => {
            const club = window.vrClub;
            club._walkLevel = level;
            club.camera.position.copyFromFloats(...position);
            club.camera.setTarget(BABYLON.Vector3.FromArray(target));
            for (let i = 0; i < 4; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        }, { position, target, level });
        await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
    }
    await enterVR(page);
    expect(await page.evaluate(() => ({
        enabled: window.vrClub._liveEventConcept.root.isEnabled(),
        layers: window.vrClub._liveEventConcept._meshes.map(mesh => mesh.layerMask)
    }))).toEqual({ enabled: true, layers: Array(4).fill(0x0fffffff) });
    await expect(page.locator('#liveEventConceptToggle')).toBeHidden();
    await page.evaluate(() => window.vrClub.multiplayer.disconnect());
    await page.waitForTimeout(750);
    expect(await page.evaluate(() => ({
        online: window.vrClub.multiplayer.connected,
        enabled: window.vrClub._liveEventConcept.root.isEnabled(),
        rootId: window.vrClub._liveEventConcept.root.uniqueId
    }))).toEqual({ online: false, enabled: true, rootId });
    expect(browserFailures.get(page)).toEqual([]);
    expect(await page.evaluate(() => {
        const concept = window.vrClub._liveEventConcept;
        window.vrClub.dispose();
        return { disposed: concept._disposed, meshesReleased: concept._meshes.every(mesh => mesh.isDisposed()) };
    })).toEqual({ disposed: true, meshesReleased: true });
});
