import { test, expect } from '@playwright/test';
import { enterClub, useQuestHarness, browserFailures } from './support.mjs';

useQuestHarness({ music: true });
test('Detailed characters replace every role and player live; lightweight restores Quaternius without changing the room choice', async ({ page }) => {
    test.setTimeout(600_000);
    const detailedRequests = [];
    page.on('request', request => { if (request.url().includes('/models/characters/')) detailedRequests.push(request.url()); });
    await enterClub(page);
    await page.waitForFunction(() => !!window.vrClub._mingler || window.vrClub.npcAvatars.some(n => n.name === 'bartender'));
    expect(detailedRequests).toEqual([]);
    const initial = await page.evaluate(async () => {
        const club = window.vrClub;
        club.setGraphicsTier('ultra');
        await club._crowdTopUp;
        await club.modelLoadPromise;
        club.moveCameraToPreset('street');
        await club._streetTopUp;
        window.__characterActors = new Map(club.npcAvatars.map(npc => [npc.name, npc]));
        window.__characterMingler = club._mingler?.mingle;
        window.__characterMusic = club.audioElement;
        window.__originalCallerPhone = club.npcAvatars.find(npc => npc.name === 'queue5')?.meshes.find(mesh => mesh.metadata?.vrclubPhone);
        return { tier: club.graphicsTier, people: club.npcAvatars.length, style: club.getCharacterStyle(),
            phone: !!window.__originalCallerPhone && Math.abs(window.__originalCallerPhone.computeWorldMatrix(true).determinant()) > 0.5 };
    });
    expect(initial.style).toBe('quaternius');
    expect(initial.phone).toBe(true);
    await expect.poll(() => page.evaluate(() => window.vrClub.npcAvatars.filter(n => n.name.startsWith('dancer')).length), { timeout: 120_000 }).toBe(14);
    const changed = await page.evaluate(() => window.vrClub.setCharacterStyle('diverse'));
    expect(changed).toBe(true);
    await page.waitForFunction(() => window.vrClub._mirrorDouble?.characterStyle === 'diverse');
    const detailed = await page.evaluate(async () => {
        const club = window.vrClub;
        const manager = club.avatarManager || new window.AvatarManager(club);
        club.avatarManager = manager;
        const peer = manager.ensurePeer('cast-test-peer', 'Guest', {});
        await manager.setAvatar('cast-test-peer', 'f5');
        const caller = club.npcAvatars.find(npc => npc.name === 'queue5');
        window.__detailedCallerPhone = caller?.meshes.find(mesh => mesh.metadata?.vrclubPhone);
        return {
            style: club.getCharacterStyle(), tier: club.graphicsTier,
            identities: club.npcAvatars.every(npc => window.__characterActors.get(npc.name) === npc),
            mingler: club._mingler.mingle === window.__characterMingler,
            music: club.audioElement === window.__characterMusic,
            dancers: club.npcAvatars.filter(npc => npc.name.startsWith('dancer')).length,
            detailed: club.npcAvatars.every(npc => !!npc.character),
            people: club.npcAvatars.length, unique: new Set(club.npcAvatars.map(npc => npc.character?.url)).size,
            rigs: !!club._djRig?.ok && !!club._bartenderRig?.ok,
            hair: club._avatarContainers.flatMap(container => container.materials).filter(mat => mat.name.endsWith('_hair'))
                .every(mat => mat.needAlphaTesting() && !mat.needAlphaBlending() && !mat.disableDepthWrite),
            sourceAnimations: club._avatarContainers.flatMap(container => container.animationGroups).filter(group => group.isPlaying).length,
            remote: peer.person?.character?.label,
            arms: !!peer.person?.arms,
            eyeRaw: club._mirrorDouble.eyeRaw,
            callerPhone: !!window.__detailedCallerPhone && Math.abs(window.__detailedCallerPhone.computeWorldMatrix(true).determinant()) > 0.5,
            phoneScoped: club.scene.getLightByName('streetDoorLight').includedOnlyMeshes.includes(window.__detailedCallerPhone),
            oldPhoneDisposed: window.__originalCallerPhone.isDisposed()
        };
    });
    expect(detailed).toMatchObject({ style: 'diverse', tier: 'ultra', identities: true, mingler: true, music: true,
        dancers: 14, detailed: true, rigs: true, hair: true, sourceAnimations: 0, arms: true,
        callerPhone: true, phoneScoped: true, oldPhoneDisposed: true });
    expect(detailed.unique).toBe(detailed.people);
    expect(detailed.remote).toContain('Leila');
    expect(detailed.eyeRaw).toBeGreaterThan(1.4);
    const djView = await page.evaluate(() => {
        const camera = window.vrClub.camera;
        const saved = { position: camera.position.asArray(), rotation: camera.rotation.asArray() };
        camera.position.set(0.7, 2.1, -16.7);
        camera.setTarget(new window.BABYLON.Vector3(0, 1.65, -19.05));
        return saved;
    });
    const djs = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.chooseDJ('female');
        const female = club.npcAvatars.find(npc => npc.name === 'djPerformer').character.label;
        return { female };
    });
    await page.screenshot({ path: 'test-results/dj-styling-female-diverse.png' });
    const maleDJ = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.chooseDJ('male');
        window.__characterActors.set('djPerformer', club.npcAvatars.find(npc => npc.name === 'djPerformer'));
        return { male: club.npcAvatars.find(npc => npc.name === 'djPerformer').character.label,
            eye: club._djPerformer.eye, fitted: club._characterDJLook('male').height * 0.93 };
    });
    expect(djs.female).toContain('Zara');
    expect(maleDJ.male).toContain('Jin');
    expect(maleDJ.eye).toBeCloseTo(maleDJ.fitted, 5);
    await page.screenshot({ path: 'test-results/dj-styling-male-diverse.png' });
    await page.evaluate(saved => {
        window.vrClub.camera.position.fromArray(saved.position);
        window.vrClub.camera.rotation.fromArray(saved.rotation);
    }, djView);
    await page.screenshot({ path: 'test-results/character-styles-diverse-street.png' });
    expect(await page.evaluate(() => window.vrClub.setLightweightCharacters(true))).toBe(true);
    await page.waitForFunction(() => Array.from(window.vrClub.avatarManager.remotes.values()).every(peer => !!peer.person && !peer.person.character));
    const restored = await page.evaluate(() => {
        const club = window.vrClub;
        const phone = club.npcAvatars.find(npc => npc.name === 'queue5')?.meshes.find(mesh => mesh.metadata?.vrclubPhone);
        return { style: club.getCharacterStyle(), selected: club.getRoomCharacterStyle(),
            identities: club.npcAvatars.every(npc => window.__characterActors.get(npc.name) === npc),
            detailed: club.npcAvatars.some(npc => !!npc.character),
            mingler: club._mingler.mingle === window.__characterMingler,
            retainedDetailedSources: club._avatarContainers.filter(container => !!container.character).length,
            phone: !!phone && Math.abs(phone.computeWorldMatrix(true).determinant()) > 0.5,
            oldPhoneDisposed: window.__detailedCallerPhone.isDisposed() };
    });
    expect(restored).toEqual({ style: 'quaternius', selected: 'diverse', identities: true, detailed: false, mingler: true,
        retainedDetailedSources: 0, phone: true, oldPhoneDisposed: true });
    expect(browserFailures.get(page)).toEqual([]);
});

test('A saved detailed style starts correctly and the Club controls can recover a failed change', async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(() => localStorage.setItem('vrclub.characterStyle', 'diverse'));
    await enterClub(page);
    await page.waitForFunction(() => window.vrClub._mirrorDouble?.characterStyle === 'diverse'
        && window.vrClub.npcAvatars.some(npc => npc.name === 'bartender'));
    expect(await page.evaluate(() => window.vrClub.npcAvatars.every(npc => !!npc.character))).toBe(true);
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabClub').click();
    await expect(page.locator('#characterStyle')).toHaveValue('diverse');
    await page.locator('#lightweightCharacters').click();
    await page.waitForFunction(() => window.vrClub.getCharacterStyle() === 'quaternius'
        && !window.vrClub.characterStyleStatus().loading);
    await expect(page.locator('#lightweightCharacters')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
        window.__replaceCharacters = window.vrClub._replaceCharacterStyle;
        window.vrClub._replaceCharacterStyle = async () => { throw new Error('Test unavailable asset'); };
    });
    await page.locator('#lightweightCharacters').click();
    await expect(page.locator('#retryCharacterStyle')).toBeVisible();
    await expect(page.locator('#characterStyleStatus')).toContainText('Test unavailable asset');
    await page.evaluate(() => { window.vrClub._replaceCharacterStyle = window.__replaceCharacters; });
    await page.locator('#retryCharacterStyle').click();
    await page.waitForFunction(() => window.vrClub.getCharacterStyle() === 'diverse'
        && !window.vrClub.characterStyleStatus().loading);
    await expect(page.locator('#retryCharacterStyle')).toBeHidden();
    expect(await page.evaluate(() => window.vrClub.graphicsTier)).toBe('balanced');
    expect(browserFailures.get(page)).toEqual([]);
});
