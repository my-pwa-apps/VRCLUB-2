import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

function loadMenuClass() {
    const window = {};
    const context = vm.createContext({ window, URL, log: { error() {}, warn() {}, info() {} }, VRClubAnimationFinish: class {} });
    vm.runInContext(read('js/club/10-ui.js'), context);
    return window.VRClubUI;
}

/** A canvas context that records the glass sheet's path. */
function recordingContext() {
    const calls = [];
    const record = name => (...args) => calls.push([name, ...args]);
    return {
        calls,
        clearRect: record('clearRect'), beginPath: record('beginPath'), moveTo: record('moveTo'), arcTo: record('arcTo'),
        closePath: record('closePath'), fill: record('fill'), stroke: record('stroke'),
        createLinearGradient: () => ({ addColorStop() {} })
    };
}

test('the VR menu glass is drawn only as tall as the page\u2019s last button row', () => {
    const VRClubUI = loadMenuClass();
    const sheetBottom = definitions => {
        const context = recordingContext();
        const menu = Object.create(VRClubUI.prototype);
        menu._vrQuickMenuBackTexture = { getContext: () => context, update() {} };
        menu._drawVRQuickMenuBack(definitions);
        return context.calls.filter(call => call[0] === 'arcTo').map(call => call[2]).reduce((max, y) => Math.max(max, y), 0);
    };
    const buttons = count => Array.from({ length: count }, () => ({ label: 'X' }));
    const one = sheetBottom(buttons(3)), three = sheetBottom(buttons(9)), four = sheetBottom(buttons(12));
    assert.ok(one < three && three < four, `a short page must not leave an empty slab: ${one} < ${three} < ${four}`);
    assert.ok(four <= 1138, 'the sheet stays inside its texture');
    // The music page keeps its seek strip in the first (empty) row, so it is still four rows tall.
    assert.equal(sheetBottom([null, null, null, ...buttons(9)]), four);
    // Row 3's lower edge is 0.855 m under the sheet's top (632 px a metre); the glass reaches past it.
    assert.ok(four > 0.855 * 632, 'the glass must cover the last row of buttons');
});

test('the VR menu says which buttons leave the immersive session before they are pressed', () => {
    const VRClubUI = loadMenuClass();
    const menu = Object.create(VRClubUI.prototype);
    menu.isFollowingHost = () => false;
    for (const action of ['musicSetup', 'credits']) {
        assert.equal(menu._vrQuickMenuButtonValue({ action, label: 'X' }, false), 'LEAVES VR', action);
    }
});

test('the VR menu is a translucent glass sheet, not an opaque slab, and its small text is headset-sized', () => {
    const source = read('js/club/10-ui.js');
    assert.match(source, /'vrQuickMenuPanelMat'[\s\S]{0,200}opacityTexture: backTexture/, 'the backing carries its own alpha');
    assert.doesNotMatch(source, /panelMaterial\.alpha = 0\.96/, 'no hard 96% opaque rectangle behind the buttons');
    assert.match(source, /let size = 40;[\s\S]{0,160}bold \$\{size\}px/, 'button value line (ON / OFF, the current value) is at least 28 px');
    assert.match(source, /let size = 36;[\s\S]{0,160}\$\{size\}px sans-serif/, 'the page subtitle is at least 26 px');
});

test('the side panels are mutually exclusive: opening one closes the others without moving focus', () => {
    const source = read('js/ui-init.js');
    const match = /const SIDE_PANELS[\s\S]*?\nfunction closeOtherSidePanels[\s\S]*?\n}\n/.exec(source);
    assert.ok(match, 'closeOtherSidePanels is defined');
    const panels = new Map();
    const make = id => {
        const state = { hidden: id === 'networkMenu', expanded: null };
        panels.set(id, state);
        return {
            classList: { contains: name => name === 'hidden' && state.hidden, add: name => { if (name === 'hidden') state.hidden = true; } },
            setAttribute: (name, value) => { if (name === 'aria-expanded') state.expanded = value; }
        };
    };
    const nodes = Object.fromEntries(['vjMenu', 'vjToggle', 'audioMenu', 'audioToggle', 'networkMenu', 'networkToggle'].map(id => [id, make(id)]));
    const context = vm.createContext({ document: { getElementById: id => nodes[id] || null } });
    vm.runInContext(`${match[0]}\nthis.close = closeOtherSidePanels;`, context);
    panels.get('vjMenu').hidden = false;
    panels.get('audioMenu').hidden = false;
    context.close('audioMenu');
    assert.equal(panels.get('audioMenu').hidden, false, 'the panel being opened stays open');
    assert.equal(panels.get('vjMenu').hidden, true, 'the other open panel closes');
    assert.equal(panels.get('vjToggle').expanded, 'false', 'its toggle reports collapsed');
    for (const open of ['openVJMenu', 'openAudioMenu', 'openNetworkMenu']) {
        const id = { openVJMenu: 'vjMenu', openAudioMenu: 'audioMenu', openNetworkMenu: 'networkMenu' }[open];
        assert.match(source, new RegExp(`const ${open} = \\(\\) => \\{\\s*closeOtherSidePanels\\('${id}'\\);`), `${open} closes the others first`);
    }
});

test('the Access button follows the corner-button pattern (icon over one word) and the hidden hint draws nothing', () => {
    const gate = read('js/paymentGate.js');
    assert.match(gate, /toggle\.append\(toggleIcon, element\('span', 'Access', 'toggle-word'\)\)/);
    const css = read('css/styles.css');
    assert.match(css, /\.audio-source-hint\[hidden\]\s*\{\s*display:\s*none;/, 'a hidden hint must not render its bullet');
    assert.match(css, /\.audio-input-group \.audio-paste-button\s*\{/, 'the Paste button style must out-rank .audio-button');
});

test('desktop control panels use the same language and can switch without exposed corner controls', () => {
    const html = read('index.html');
    assert.match(html, /<span>Show &amp; Lights<\/span>/);
    assert.match(html, /id="networkMenuTitle"[\s\S]{0,160}<span>Online<\/span>/);
    assert.match(html, /id="networkToggle"[\s\S]{0,240}<span class="toggle-word" aria-hidden="true">Online<\/span>/);
    assert.match(html, /id="cameraPresetToggle"[\s\S]{0,420}<span class="toggle-word" aria-hidden="true">Go to<\/span>/);
    assert.equal((html.match(/class="panel-switcher"/g) || []).length, 3);
    for (const panel of ['vjMenu', 'audioMenu', 'networkMenu']) {
        assert.equal((html.match(new RegExp(`data-open-panel="${panel}"`, 'g')) || []).length, 3, `${panel} appears in every switcher`);
    }
    for (const id of ['vjToggle', 'audioToggle', 'networkToggle', 'cameraPresetToggle']) {
        const control = new RegExp(`<button id="${id}"[\\s\\S]*?<\\/button>`).exec(html)?.[0] || '';
        assert.match(control, /<svg class="app-icon"/, `${id} uses the shared monochrome icon`);
        assert.doesNotMatch(control, /\p{Extended_Pictographic}/u, `${id} does not use a platform emoji`);
    }
    assert.match(read('css/styles.css'), /body:has\(\.panel:not\(\.hidden\)\) \.payment-toggle[\s\S]*?visibility: hidden;/,
        'covered corner controls are not left looking clickable');
});

test('Show and Lights progressively owns show, fixture, effect and club controls', () => {
    const html = read('index.html');
    assert.deepEqual([...html.matchAll(/data-vj-tab-target="([^"]+)"/g)].map(match => match[1]),
        ['show', 'lights', 'effects', 'club']);
    for (const owner of ['show', 'lights', 'effects', 'club']) {
        assert.match(html, new RegExp(`data-vj-tab-panel="${owner}"`), `${owner} has owned content`);
    }
    assert.match(html, /data-vj-tab-panel="club"[\s\S]*?<select class="audio-input" id="djStyle">/,
        'resident DJ belongs to Club');
    assert.doesNotMatch(/id="audioMenu"[\s\S]*?id="networkMenu"/.exec(html)?.[0] || '', /id="djStyle"/,
        'Music does not own the resident DJ');
    assert.match(html, />COLOUR<\/button>/);
    assert.match(html, />SPOT STROBE<\/button>/);
    assert.match(html, />LED MONO<\/button>/);
});

test('Music presents one source path at a time and disables transport until playback starts', () => {
    const html = read('index.html');
    assert.deepEqual([...html.matchAll(/data-audio-source="([^"]+)"/g)].map(match => match[1]),
        ['link', 'file', 'folder']);
    const addMusic = /<div class="vj-section-title">Add music<\/div>([\s\S]*?)<details class="audio-help">/.exec(html)?.[1] || '';
    assert.ok(addMusic.indexOf('id="setName"') < addMusic.indexOf('id="playStreamBtn"'),
        'the optional name is chosen before Save & play');
    assert.match(html, /id="audioTransportSection" aria-disabled="true"/);
    for (const id of ['audioPreviousSource', 'audioPlaybackToggle', 'audioStop', 'audioNextSource']) {
        assert.match(html, new RegExp(`id="${id}"[^>]* disabled`), `${id} starts disabled`);
    }
    assert.match(read('js/ui-init.js'), /No music selected\. Add a link, file or folder below\./);
});

test('Access starts with invitation, restore and purchase as separate paths', () => {
    const source = read('js/paymentGate.js');
    assert.match(source, /button\('Use an invitation'/);
    assert.match(source, /button\('Restore existing access'/);
    assert.match(source, /button\('Buy VR access — €1\.99'/);
    assert.match(source, /primaryButton\('Continue to secure checkout'/);
    assert.match(source, /accessPath === 'buy'/);
});
