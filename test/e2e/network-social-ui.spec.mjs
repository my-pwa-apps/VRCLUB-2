import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.setTimeout(60000);

const source = readFileSync(new URL('../../js/ui-init.js', import.meta.url), 'utf8');
const functions = ['closeOtherSidePanels', 'setPanelMinimized', 'panelOwnsEscape', 'setToggleState', 'initRoomGuestLock',
    'initAudienceSelector', 'initSocialBar', 'initNetworkMenu'].map(name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}).join('\n');

test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.route('**/__social-ui-test.js', route => route.fulfill({ contentType: 'text/javascript', body: `(() => {
        const uiTeardowns = [];
        const uiLog = { info() {} };
        const SIDE_PANELS = [['vjMenu', 'vjToggle'], ['audioMenu', 'audioToggle'], ['networkMenu', 'networkToggle']];
        let openSocialChat = () => {};
        const vrClubInstance = {
            showErrorMessage(message) { window.socialTest.notices.push(message); },
            camera: { position: { x: 0, z: 0 } }
        };
        ${functions}
        const mp = new window.ClubMultiplayer(vrClubInstance);
        mp.acceptOnlineSafety();
        mp.client = new window.NetworkClient();
        mp.client.status = 'connected';
        mp.client.selfId = 'me'; mp.client.hostId = 'me';
        mp.client.liveEventsSupported = true;
        mp.client.peers.set('alex', { name: 'Alex', pid: '1111111111111111', avatar: 'f1' });
        mp.client._send = () => true;
        let speaking = false;
        mp.manager = { list: () => [{ id: 'alex', speaking, muted: false }] };
        window.socialTest = { mp, notices: [], actions: [],
            speaking(value) { speaking = value; mp._emit(); },
            teardown() { for (const fn of uiTeardowns) fn(); }
        };
        mp.manageLiveEvent = async action => window.socialTest.actions.push(action);
        mp.inviteUrl = () => 'https://club.example/?room=test';
        initNetworkMenu();
    })();` }));
    await page.addScriptTag({ url: '/__social-ui-test.js' });
    await page.locator('#splashScreen').evaluate(node => node.remove());
    await page.locator('#mainExperience').evaluate(node => node.removeAttribute('inert'));
    await page.locator('#networkToggle').click();
    expect(errors).toEqual([]);
});

test('live event handlers work before invite copying, register once, confirm once, and tear down', async ({ page }) => {
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
    });
    await page.locator('#networkLiveCreate').click();
    expect(await page.evaluate(() => window.socialTest.actions)).toEqual(['create']);
    await page.locator('#networkInviteBtn').click();
    await page.locator('#networkInviteBtn').click();
    await page.locator('#networkLiveCreate').click();
    expect(await page.evaluate(() => window.socialTest.actions)).toEqual(['create', 'create']);
    await page.evaluate(() => {
        const mp = window.socialTest.mp;
        mp.liveEvent = { id: '12345678-1234-4123-8123-123456789abc', canManage: true };
        mp._emit();
    });
    await page.locator('#networkLiveEnd').click();
    expect(await page.evaluate(() => window.socialTest.actions)).toEqual(['create', 'create']);
    await page.locator('#networkLiveEnd').click();
    expect(await page.evaluate(() => window.socialTest.actions)).toEqual(['create', 'create', 'end']);
    await page.evaluate(() => {
        window.socialTest.teardown();
        document.getElementById('networkLiveCreate').click();
    });
    expect(await page.evaluate(() => window.socialTest.actions)).toEqual(['create', 'create', 'end']);
});

test('speaking changes preserve report drafts and focus; capped chat keeps announcing new messages', async ({ page }) => {
    const row = page.locator('#networkPeopleList .network-person').first();
    await row.getByRole('button', { name: 'Report Alex to the room host', exact: false }).click();
    const picker = row.getByRole('combobox');
    await picker.selectOption({ index: 1 });
    const reason = await picker.inputValue();
    await picker.focus();
    await page.evaluate(() => window.socialTest.speaking(true));
    await expect(picker).toBeFocused();
    await expect(picker).toHaveValue(reason);
    await page.evaluate(() => window.socialTest.speaking(false));
    await expect(picker).toBeFocused();
    await page.evaluate(() => {
        const mp = window.socialTest.mp;
        mp.chat = Array.from({ length: 50 }, (_, i) => ({ id: 'alex', name: 'Alex', text: `Message ${i}`, self: false }));
        mp._emit();
        mp.chat.shift();
        mp.chat.push({ id: 'alex', name: 'Alex', text: 'Newest after cap', self: false });
        mp._emit();
    });
    await expect(page.locator('#socialPeek')).toHaveText('Alex: Newest after cap');
});
