import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const BABYLON = require('../js/vendor/babylon.js');

const source = readFileSync(new URL('../js/gashouderVenue.js', import.meta.url), 'utf8');
const fixtureSource = readFileSync(new URL('../js/club/05-fixtures.js', import.meta.url), 'utf8');
const effectsSource = readFileSync(new URL('../js/club/06-effects.js', import.meta.url), 'utf8');
const animationCoreSource = readFileSync(new URL('../js/club/07-animation-core.js', import.meta.url), 'utf8');
const animationSource = readFileSync(new URL('../js/club/08-animation-fixtures.js', import.meta.url), 'utf8');
const crowdSource = readFileSync(new URL('../js/club/11-crowd.js', import.meta.url), 'utf8');
const mezzanineSource = readFileSync(new URL('../js/mezzanine.js', import.meta.url), 'utf8');

test('Gashouder deployment hosts select the venue while explicit choices and NOCTURNE remain unchanged', () => {
    const uiSource = readFileSync(new URL('../js/ui-init.js', import.meta.url), 'utf8')
        .split('function ensureMusicLibrary')[0];
    for (const [hostname, search, expected] of [
        ['gashouder.mitwee.nl', '', 'gashouder'],
        ['gashouder-vr.pages.dev', '', 'gashouder'],
        ['preview.gashouder-vr.pages.dev', '', 'gashouder'],
        ['gashouder.mitwee.nl', '?venue=nocturne', 'nocturne'],
        ['nocturne.mitwee.nl', '', 'nocturne'],
        ['localhost', '?venue=gashouder', 'gashouder'],
        ['not-gashouder-vr.pages.dev', '', 'nocturne']
    ]) {
        const select = { value: 'nocturne' };
        const context = vm.createContext({
            window: { location: { hostname, search } },
            document: { getElementById: id => id === 'venueSelect' ? select : null },
            URLSearchParams,
            console
        });
        vm.runInContext(uiSource, context);
        assert.equal(select.value, expected, `${hostname}${search}`);
    }
});

function loadVenue(globals = {}) {
    const window = {};
    const context = vm.createContext({ window, ...globals });
    vm.runInContext(source, context, { filename: 'js/gashouderVenue.js' });
    return window;
}

function loadVenueMethods() {
    const window = {};
    const context = vm.createContext({ window, BABYLON, log: { info() {}, warn() {}, error() {} } });
    vm.runInContext(source, context, { filename: 'js/gashouderVenue.js' });
    context.VRClubEnvironment = class {};
    vm.runInContext(fixtureSource, context, { filename: 'js/club/05-fixtures.js' });
    vm.runInContext(effectsSource, context, { filename: 'js/club/06-effects.js' });
    context.VRClubEffects = window.VRClubEffects;
    vm.runInContext(animationCoreSource, context, { filename: 'js/club/07-animation-core.js' });
    context.VRClubAnimationCore = window.VRClubAnimationCore;
    vm.runInContext(animationSource, context, { filename: 'js/club/08-animation-fixtures.js' });
    vm.runInContext(mezzanineSource, context, { filename: 'js/mezzanine.js' });
    return window;
}

test('the architecture-only setup still requests the local player body source', () => {
    const sourceNames = ['dancerF', 'dancerM', 'crowdMember', 'guest'];
    const audioCrowd = {
        AVATAR_SOURCES: sourceNames,
        sourceIndex: name => sourceNames.indexOf(name)
    };
    const window = { VRClubAvatars: class {}, VRClubAudioCrowd: audioCrowd };
    const context = vm.createContext({ window, VRClubAudioCrowd: audioCrowd });
    vm.runInContext(crowdSource, context, { filename: 'js/club/11-crowd.js' });

    const crowd = Object.assign(Object.create(window.VRClubCrowd.prototype), {
        venueId: 'gashouder',
        gashouderPreset: 'architectural',
        isPeopleVisible: () => true,
        getGashouderCrowdSize: () => 0,
        getGashouderGuestSize: () => 0,
        getCharacterStyle: () => 'diverse',
        getLocalAvatarStyle: () => 'male',
        _crowdSlots: [],
        _guestSlots: () => []
    });

    assert.deepEqual(Array.from(crowd._requiredCrowdSources()), [1]);
});

test('Gashouder dimensions and crowd source data are frozen at load time', () => {
    const window = loadVenue();
    assert.equal(window.GASHOUDER_VENUE.dimensions.structuralBays, 40);
    assert.equal(window.GASHOUDER_VENUE.crowdSources.length, 14);
    assert.deepEqual({
        fixtures: window.GASHOUDER_VENUE.rig.fixtureCount,
        groups: window.GASHOUDER_VENUE.rig.fixtureGroups,
        strobes: window.GASHOUDER_VENUE.rig.strobeCount,
        lasers: window.GASHOUDER_VENUE.rig.laserCount,
        fogMachines: window.GASHOUDER_VENUE.rig.fogMachineCount
    }, { fixtures: 24, groups: 6, strobes: 12, lasers: 8, fogMachines: 8 });
    assert.ok(Object.isFrozen(window.GASHOUDER_VENUE));
    assert.ok(Object.isFrozen(window.GASHOUDER_VENUE.crowdSources));
});

test('the event presets provide a curved arena LED wall through the shared single-mesh pipeline', () => {
    const window = loadVenueMethods();
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const club = Object.assign(Object.create(window.VRClubAnimationFixtures.prototype), {
        scene,
        engine,
        materialFactory: {
            createStandardMaterial(name, options) {
                const material = new BABYLON.StandardMaterial(name, scene);
                material.emissiveTexture = options.emissiveTexture;
                return material;
            }
        }
    });

    try {
        const wallSpec = window.GASHOUDER_VENUE.rig.ledWall;
        club.createLEDWall({
            name: 'gashouderLedWall',
            colliderName: 'gashouderLedWallCollider',
            cols: wallSpec.cols,
            rows: wallSpec.rows,
            panelWidth: wallSpec.panelWidth,
            panelHeight: wallSpec.panelHeight,
            seam: wallSpec.seam,
            baseY: wallSpec.baseY,
            centerZ: wallSpec.centerZ,
            curveRadius: wallSpec.curveRadius
        });

        const wall = scene.getMeshByName('gashouderLedWall');
        const collider = scene.getMeshByName('gashouderLedWallCollider');
        const positions = wall.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        assert.equal(club._ledWall.cols, 72);
        assert.equal(club._ledWall.rows, 16);
        assert.equal(wall.getTotalVertices(), 72 * 16 * 4);
        assert.equal(wall.material, scene.materials.find(material => material.name === 'ledWallMat'));
        assert.equal(collider.checkCollisions, true);
        assert.equal(collider.isVisible, false);
        assert.ok(collider._curveMeta.curveRadius > 0);
        assert.ok(positions[2] > positions[(35 * 4) * 3 + 2],
            'the outer panels bow forward around the stage');
        let maxAbsX = 0;
        for (let i = 0; i < positions.length; i += 3) maxAbsX = Math.max(maxAbsX, Math.abs(positions[i]));
        assert.ok(maxAbsX > window.GASHOUDER_VENUE.stage.width / 2 + 12,
            `LED wall chord extends well past the ±9m stage edges (max |x| = ${maxAbsX.toFixed(1)}m)`);
        assert.equal(club.ledPanels.length, 72 * 16);

        // Verify walking behind the DJ table (z = -21.2) is NOT blocked by the curved LED wall's wing AABB
        const walkingClub = Object.assign({}, window.Mezzanine, {
            venueId: 'gashouder',
            _ledWallCollider: collider
        });
        const cam = {
            position: new BABYLON.Vector3(0, 3.5, -21.2),
            ellipsoid: new BABYLON.Vector3(0.5, 0.5, 0.5),
            cameraDirection: new BABYLON.Vector3(0, 0, -0.1)
        };
        walkingClub._containLEDWall(cam);
        assert.equal(cam.position.z, -21.2, 'operator can walk freely behind the DJ table at z = -21.2');
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('integrated ceiling LED architecture tracks radial roof bays and concentric rings in one draw', () => {
    const window = loadVenue({ BABYLON, performance });
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const club = Object.assign({}, window.GashouderVenue, {
        scene,
        tierSettings: { vrLedUpdateHz: 30 },
        masterIntensity: 1,
        ledWallActive: true,
        ledWallLevel: 1,
        ledWallBrightness: 1,
        gashouderCeilingMode: 1,
        vjDirector: { beatNumber: 8, barPhase: 0.25, beatEnvelope: 0.8, masterHue: 0.55 },
        materialFactory: {
            createStandardMaterial(name) {
                return new BABYLON.StandardMaterial(name, scene);
            }
        }
    });

    try {
        club.createGashouderLEDInstallation();
        const mesh = scene.getMeshByName('gashouderCeilingLedGrid');
        assert.ok(mesh, 'integrated ceiling LED grid mesh exists');
        const expectedSegments = window.GASHOUDER_VENUE.dimensions.structuralBays *
            window.GASHOUDER_VENUE.rig.ceilingRadialSegments +
            window.GASHOUDER_VENUE.rig.ceilingRingCounts.reduce((a, b) => a + b, 0);
        assert.equal(club._gashouderLedCount, expectedSegments);
        assert.equal(mesh.material.useVertexColors, true);

        club._gashouderLedLastUpdate = -1000;
        club.updateGashouderLEDInstallation();
        const litValues = Array.from(club._gashouderLedColors).filter((_, idx) => idx % 4 !== 3);
        assert.ok(litValues.some(v => v > 0.2), 'ceiling battens illuminate with the show');
        assert.ok(Math.max(...litValues) - Math.min(...litValues) > 0.15,
            'addressable ceiling segments display spatial patterns rather than uniform flat color');

        club.ledWallActive = false;
        club._gashouderLedLastUpdate = -1000;
        club.updateGashouderLEDInstallation();
        const darkValues = Array.from(club._gashouderLedColors).filter((_, idx) => idx % 4 !== 3);
        assert.ok(darkValues.every(v => v === 0), 'turning off LEDs blacks out the ceiling grid');
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('techno builds the configured circular + stage-bridge event rig and monumental LED wall', () => {
    const window = loadVenue();
    const venue = Object.assign(Object.create(window.GashouderVenue), {
        gashouderPreset: 'techno',
        createGashouderArchitecture() {},
        createGashouderStage() {},
        createGashouderEventTruss() {},
        createLEDWall(options) { this.ledWallOptions = options; },
        createGashouderLEDInstallation() {},
        createLasers() { this.lasers = this.gashouderLighting.laserPositions; },
        createLaserSheet() { this.hasLaserSheet = true; },
        createTrussMountedLights() { this.trussLights = this.gashouderLighting.fixturePositions; },
        createLights() {
            this.spotlights = this.gashouderLighting.fixturePositions;
            this.strobes = this.gashouderLighting.strobePositions;
        },
        createHyperrealisticSmoke() { this.hazeMachineCount = this.gashouderLighting.fogMachineCount; },
        createMirrorBall() {},
        createDJMonitors() {},
        configureGashouderCamera() {}
    });

    venue.createGashouderVenue();
    assert.equal(venue.ledWallOptions.cols, 72);
    assert.equal(venue.ledWallOptions.rows, 16);
    assert.equal(venue.trussLights.length, 24);
    assert.equal(venue.spotlights.length, 24);
    assert.equal(venue.strobes.length, 12);
    assert.equal(venue.lasers.length, 8);
    assert.equal(venue.hazeMachineCount, 8);
    assert.equal(venue.gashouderLighting.fogMachinePositions.length, 8);
    assert.ok(venue.gashouderLighting.fogMachinePositions.every(pos => pos.y > 9),
        'all Gashouder smoke machines are mounted overhead on the trusses, not on the floor');
    assert.equal(venue.hasLaserSheet, true);
    assert.equal(venue.gashouderLighting.laserSheetPositions.length, 2);
    for (const mount of venue.gashouderLighting.laserSheetPositions) {
        assert.ok(Number.isFinite(mount.yaw));
        assert.equal(mount.y, window.GASHOUDER_VENUE.rig.stageMountY);
    }
});

test('setup presets cap the architectural and soundcheck crowds', () => {
    const window = loadVenue();
    const club = Object.assign({}, window.GashouderVenue, {
        gashouderPreset: 'architectural',
        tierSettings: { crowdSize: 14, guestSize: 6 }
    });
    assert.equal(club.getGashouderCrowdSize(), 0);
    assert.equal(club.getGashouderGuestSize(), 0);

    club.gashouderPreset = 'soundcheck';
    assert.equal(window.GASHOUDER_PRESETS.soundcheck.led, true);
    assert.equal(club.getGashouderCrowdSize(), 2);
    assert.equal(club.getGashouderGuestSize(), 0);

    club.gashouderPreset = 'techno';
    assert.equal(club.getGashouderCrowdSize(), 14);
    assert.equal(club.getGashouderGuestSize(), 6);
});

test('Gashouder crowd and guest slots stay inside the hall and clear the stage footprint', () => {
    const window = loadVenue();
    const club = Object.assign({}, window.GashouderVenue, { gashouderPreset: 'techno' });
    const slots = [
        ...club.gashouderCrowdSlots(id => id),
        ...club.gashouderGuestSlots(id => id)
    ];
    const stage = window.GASHOUDER_VENUE.stage;

    assert.equal(slots.length, 20);
    for (const slot of slots) {
        assert.ok(Math.hypot(slot.x, slot.z) < window.GASHOUDER_VENUE.dimensions.innerRadius);
        assert.equal(
            Math.abs(slot.x - stage.x) < stage.width / 2
                && Math.abs(slot.z - stage.z) < stage.depth / 2,
            false,
            `${slot.src} overlaps the stage`
        );
    }
});

test('Gashouder model configuration excludes unrelated NOCTURNE props and relocates its rig', () => {
    const window = loadVenue();
    const club = Object.assign({}, window.GashouderVenue, { gashouderPreset: 'techno' });
    const configs = {
        dj_console: { placement: { centerZ: -18.62, bottomY: 1.42 } },
        dj_monitor: { placement: { centerZ: -18.22, bottomY: 1.42 } },
        pa_speaker_left: { placement: { centerZ: -11, topY: 8.4 }, rigging: { anchorY: 8.4 } },
        pa_speaker_right: { placement: { centerZ: -11, topY: 8.4 }, rigging: { anchorY: 8.4 } },
        bass_bin_left: {},
        bass_bin_right: {},
        bar_stool: {}
    };

    const selected = club.configureGashouderModelConfigs(configs);
    const stage = window.GASHOUDER_VENUE.stage;
    const trussRadius = window.GASHOUDER_VENUE.rig.radius;
    assert.deepEqual(Object.keys(selected).sort(), [
        'bass_bin_left', 'bass_bin_rear_left', 'bass_bin_rear_right', 'bass_bin_right',
        'dj_console', 'dj_monitor',
        'pa_speaker_left', 'pa_speaker_rear_left', 'pa_speaker_rear_right', 'pa_speaker_right'
    ]);
    // Both front and rear PA speakers sit right on the 15.5 m circular event truss
    assert.ok(Math.abs(Math.hypot(selected.pa_speaker_left.placement.centerX, selected.pa_speaker_left.placement.centerZ) - trussRadius) < 0.08);
    assert.ok(Math.abs(Math.hypot(selected.pa_speaker_rear_left.placement.centerX, selected.pa_speaker_rear_left.placement.centerZ) - trussRadius) < 0.08);
    assert.ok(Math.abs(Math.hypot(selected.pa_speaker_rear_right.placement.centerX, selected.pa_speaker_rear_right.placement.centerZ) - trussRadius) < 0.08);
    // Rear PA speakers face inward (-Z) across the hall rather than outward into the brick wall
    const rearLeftMatrix = BABYLON.Matrix.RotationYawPitchRoll(
        selected.pa_speaker_rear_left.rotation.y,
        selected.pa_speaker_rear_left.rotation.x,
        selected.pa_speaker_rear_left.rotation.z
    );
    const rearLeftForward = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, -1), rearLeftMatrix);
    assert.ok(rearLeftForward.z < -0.5 && rearLeftForward.y < -0.2,
        `rear left PA aims inward & downward across the floor, got (${rearLeftForward.x.toFixed(2)}, ${rearLeftForward.y.toFixed(2)}, ${rearLeftForward.z.toFixed(2)})`);
    assert.equal(selected.bass_bin_rear_left.hangFrom, 'pa_speaker_rear_left');
    assert.equal(selected.bass_bin_rear_right.hangFrom, 'pa_speaker_rear_right');
    assert.ok(stage.consoleZ > stage.z, 'the DJ setup sits in the stage front half');
    assert.ok(stage.consoleZ - 0.6 > stage.z - stage.depth / 2, 'the table remains on the stage');
    assert.ok(stage.consoleZ + 0.6 < stage.z + stage.depth / 2, 'the table clears the stage edge');
    // DJ console sits in the operator's rear half of the table so the DJ stands cleanly behind the table face
    assert.equal(selected.dj_console.placement.centerZ, stage.consoleZ - 0.28);
    assert.equal(selected.dj_console.placement.bottomY, stage.consoleTop);
    assert.equal(selected.pa_speaker_left.rigging.anchorY, window.GASHOUDER_VENUE.rig.centreY);
    assert.equal(configs.dj_console.placement.centerZ, -18.62);
    assert.equal(configs.dj_monitor.placement.centerZ, -18.22);
    assert.equal(configs.pa_speaker_left.rigging.anchorY, 8.4);
    assert.deepEqual(configs.bar_stool, {});

    club.gashouderPreset = 'architectural';
    assert.deepEqual(Object.keys(club.configureGashouderModelConfigs(configs)), []);
});

test('the architectural shell, roof panels, stage, and event truss build with Babylon', () => {
    const window = loadVenue({ BABYLON });
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const materials = new Map();
    const club = Object.assign({}, window.GashouderVenue, {
        scene,
        materialFactory: {
            getPreset(name) {
                if (!materials.has(name)) materials.set(name, new BABYLON.StandardMaterial(name, scene));
                return materials.get(name);
            }
        },
        _applyWorldUVs() {}
    });

    try {
        club.createGashouderArchitecture();
        club.createGashouderStage();
        club.createGashouderEventTruss();

        const wall = scene.getMeshByName('gashouderBrickShell');
        assert.ok(wall?.checkCollisions);
        assert.ok(scene.getMeshByName('gashouderRoofPanels')?.getTotalVertices() > 0);
        assert.ok(scene.getMeshByName('gashouderRadialRoofTrusses'));
        assert.ok(scene.getMeshByName('gashouderCircularRoofRings'));
        assert.ok(scene.getMeshByName('gashouderMainStage')?.checkCollisions);
        assert.ok(scene.getMeshByName('gashouderStageTop')?.checkCollisions);
        assert.equal(window.GASHOUDER_VENUE.stage.stairSteps,
            scene.meshes.filter(mesh => mesh.name.startsWith('gashouderStageStair')).length);
        assert.ok(scene.getMeshByName('gashouderCircularEventTruss'));

        const doorwayRay = new BABYLON.Ray(new BABYLON.Vector3(0, 2, 0), BABYLON.Vector3.Forward(), 40);
        assert.equal(doorwayRay.intersectsMesh(wall, false).hit, false, 'the main doorway remains open at walking height');
        const lintelRay = new BABYLON.Ray(new BABYLON.Vector3(0, 5, 0), BABYLON.Vector3.Forward(), 40);
        assert.equal(lintelRay.intersectsMesh(wall, false).hit, true, 'the door lintel closes the opening above 4 m');

        const jointAngle = -Math.PI + Math.PI / window.GASHOUDER_VENUE.dimensions.structuralBays;
        const jointRay = new BABYLON.Ray(new BABYLON.Vector3(0, 5, 0),
            new BABYLON.Vector3(Math.sin(jointAngle), 0, Math.cos(jointAngle)), 40);
        assert.equal(jointRay.intersectsMesh(wall, false).hit, true, 'brick piers close the panel joints');
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('Gashouder enables owner headset VR, pre-seeds latest Hernan and Miss Melera sets, and builds the stage VJ desk + DJ FX', async () => {
    const paymentSource = readFileSync(new URL('../js/paymentGate.js', import.meta.url), 'utf8');
    const audioUtilsSource = readFileSync(new URL('../js/audioUtils.js', import.meta.url), 'utf8');
    const musicSource = readFileSync(new URL('../js/musicLibrary.js', import.meta.url), 'utf8');
    const vjDeskSource = readFileSync(new URL('../js/vjDesk.js', import.meta.url), 'utf8');

    for (const host of ['gashouder.mitwee.nl', 'gashouder-vr.pages.dev', 'preview.gashouder-vr.pages.dev']) {
        const payCtx = vm.createContext({
            window: { location: { hostname: host } },
            AbortSignal
        });
        vm.runInContext(paymentSource, payCtx);
        assert.equal(payCtx.window.VRPayment.canEnterVR(), true, `${host} allows owner VR entry`);
        assert.equal(payCtx.window.VRPayment.hasEntitlement(), true, `${host} grants development entitlement`);
    }

    const hernanFeed = `<rss><channel>
        <item><title>Resident 1002</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/resident-1002.mp3"/></item>
        <item><title>Resident 1001</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/resident-1001.mp3"/></item>
    </channel></rss>`;
    const meleraFeed = `<rss><channel>
        <item><title>Miss Melera ° Colourizon 169</title><enclosure type="audio/mpeg" url="https://vrclub-network-dev.garfieldapp.workers.dev/podcast/colourizon/stream/2421312102-missmelera-colourizon-169.mp3"/></item>
        <item><title>Miss Melera ° Colourizon 168</title><enclosure type="audio/mpeg" url="https://vrclub-network-dev.garfieldapp.workers.dev/podcast/colourizon/stream/2407530030-missmelera-colourizon-168.mp3"/></item>
    </channel></rss>`;

    const plays = [];
    const musicCtx = vm.createContext({
        URL,
        TextDecoder,
        window: { location: { href: 'https://gashouder.mitwee.nl/', hostname: 'gashouder.mitwee.nl' } },
        console: { warn() {} }
    });
    vm.runInContext(audioUtilsSource, musicCtx);
    vm.runInContext(musicSource, musicCtx);

    const club = {
        venueId: 'gashouder',
        showErrorMessage() {},
        guardHostControl: () => true,
        startAudioStream: async (...args) => { club._audioStreamUrl = args[0]; plays.push(args); },
        getPlaybackInfo: () => ({ seekable: true, position: 0, duration: 3600, playing: true })
    };
    const storage = { getItem: () => null, setItem() {} };
    const library = new musicCtx.window.MusicLibrary(club, storage, {
        getRelay: () => 'wss://vrclub-network-dev.garfieldapp.workers.dev',
        fetchBuffer: async url => new TextEncoder().encode(
            url.includes('colourizon/feed.xml') ? meleraFeed : hernanFeed
        ).buffer
    });

    assert.equal(library.items.length, 2);
    assert.equal(library.items[0].name, 'Resident by Hernan Cattaneo');
    assert.equal(library.items[1].name, 'Colourizon by Miss Melera');

    await library.play();
    assert.equal(plays[0][0], 'https://mcdn.podbean.com/resident-1002.mp3');
    assert.equal(club.nowPlayingLabel, 'Resident 1002');

    library.select(1);
    await library.play();
    assert.equal(plays[1][0], 'https://vrclub-network-dev.garfieldapp.workers.dev/podcast/colourizon/stream/2421312102-missmelera-colourizon-169.mp3');
    assert.equal(club.nowPlayingLabel, 'Miss Melera ° Colourizon 169');

    const venueWin = loadVenue({ BABYLON });
    vm.runInContext(vjDeskSource, vm.createContext({ window: venueWin, BABYLON, performance }));
    let deskArgs = null;
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
        const stageClub = Object.assign({}, venueWin.GashouderVenue, venueWin.VJDesk, {
            venueId: 'gashouder',
            scene,
            materialFactory: {
                getPreset(name) { return new BABYLON.StandardMaterial(name, scene); }
            },
            _applyWorldUVs() {},
            createVJDesk(args) { deskArgs = args; },
            _playerCamera: () => ({ position: new BABYLON.Vector3(0, 3.5, venueWin.GASHOUDER_VENUE.stage.consoleZ - 1.2) })
        });
        stageClub.createGashouderStage();
        assert.deepEqual({ ...deskArgs }, {
            top: venueWin.GASHOUDER_VENUE.stage.consoleTop,
            frontZ: venueWin.GASHOUDER_VENUE.stage.consoleZ - 0.6
        });
        assert.equal(stageClub._operatorAtVJDesk(), true, 'operator standing behind the Gashouder DJ console is recognized at the VJ desk');
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('stage walking levels and spotlight surface hits follow Gashouder geometry', () => {
    const window = loadVenueMethods();
    const walking = Object.assign({}, window.Mezzanine, { venueId: 'gashouder' });
    assert.equal(walking._walkSurfaceLevel(0, -12.1, 0), 0.3);
    assert.equal(walking._walkSurfaceLevel(0, -13.1, 0), 0.9);
    assert.equal(walking._walkSurfaceLevel(0, -14.9, 0), 1.8);
    assert.equal(walking._walkSurfaceLevel(0, -20, 1.8), 1.8);
    assert.equal(walking._walkSurfaceLevel(10, -20, 1.8), 0);

    const lighting = Object.create(window.VRClubAnimationFixtures.prototype);
    lighting.venueId = 'gashouder';
    const spot = { basePos: new BABYLON.Vector3(0, 5, 0) };
    const wallHit = lighting._resolveSpotSurfaceHit(spot, new BABYLON.Vector3(1, 0, 0));
    assert.equal(wallHit.hitSurface, 'curvedWall');
    assert.ok(Math.abs(wallHit.surfaceIntersection.x - window.GASHOUDER_VENUE.dimensions.innerRadius) < 0.1);
    assert.ok(wallHit.surfaceNormal.x < 0);

    spot.basePos.set(0, 10, -20);
    const stageHit = lighting._resolveSpotSurfaceHit(spot, new BABYLON.Vector3(0, -1, 0));
    assert.equal(stageHit.hitSurface, 'floor');
    assert.ok(Math.abs(stageHit.surfaceIntersection.y - window.GASHOUDER_VENUE.stage.height) < 1e-4);

    // Verify mirror-ball reflections populate valid finite world positions & ray lengths in Gashouder
    const spotMatrices = new Float32Array(32 * 16);
    const rayMatrices = new Float32Array(16 * 16);
    const directions = new Float32Array(32 * 2);
    for (let i = 0; i < 32; i++) {
        directions[i * 2] = i * 0.6;
        directions[i * 2 + 1] = Math.acos(1 - 2 * ((i + 0.5) / 32));
    }
    const mirrorClub = Object.assign(Object.create(window.VRClubEffects.prototype), {
        venueId: 'gashouder',
        mirrorBall: { position: new BABYLON.Vector3(0, 8.8, 0) },
        mirrorBallRotation: 0.25,
        mirrorBallSpotlightColor: new BABYLON.Color3(1, 0.4, 0.8),
        masterIntensity: 1,
        smokeActive: true,
        fogIntensity: 1.4,
        tierSettings: { mirrorSpots: 32, mirrorRays: 16 },
        mirrorReflectionBatch: {
            spots: { thinInstanceCount: 0, thinInstanceBufferUpdated() {} },
            rays: { thinInstanceCount: 0, thinInstanceBufferUpdated() {} },
            spotMat: { emissiveColor: new BABYLON.Color3() },
            rayMat: { emissiveColor: new BABYLON.Color3(), alpha: 0 },
            spotMatrices,
            rayMatrices,
            directions,
            hit: { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
        }
    });
    mirrorClub._updateMirrorReflectionBatch();
    assert.ok(Array.from(spotMatrices).every(Number.isFinite), 'Gashouder mirror reflection spots have finite matrices (no NaN)');
    assert.ok(Array.from(rayMatrices).every(Number.isFinite), 'Gashouder mirror outgoing rays have finite matrices (no NaN)');
    assert.ok(Math.hypot(spotMatrices[12], spotMatrices[14]) > 1, 'Gashouder mirror spots project onto arena surfaces');
    assert.ok(stageHit.surfaceBounds);

    // Regression test: long-running air particle lighting must flush subnormal floats to 0 and never produce Infinity/NaN
    const airClub = Object.assign(Object.create(window.VRClubAnimationCore.prototype), {
        venueId: 'gashouder',
        scene: { getFrameId: () => 42, activeCamera: { position: new BABYLON.Vector3(0, 1.7, 5) } },
        engine: { getDeltaTime: () => 16.667 },
        lightsActive: true,
        masterIntensity: 1,
        currentSpotColor: new BABYLON.Color3(0.8, 0, 1),
        spotlights: [{
            _photoPos: new BABYLON.Vector3(0, 10, 0),
            _photoDir: new BABYLON.Vector3(0, -1, 0),
            _photoIntensity: 40,
            _photoAngle: 0.5,
            _surfaceHit: { centerDistanceToSurface: 10 }
        }]
    });
    const testParticles = [
        { position: new BABYLON.Vector3(0, 5, 0), size: 1.5, color: new BABYLON.Color4(0.5, 0.5, 0.6, 0.04) },
        { position: new BABYLON.Vector3(14, 6, 8), size: 1.5, color: new BABYLON.Color4(0.5, 0.5, 0.6, 0.04) }
    ];
    // Step 1: particle 0 is inside beam, then moves outside and decays for 5000 frames (previously underflowed to 3e-323 -> Infinity/NaN)
    airClub._lightAirParticles(testParticles, 'haze');
    testParticles[0].position.set(15, 6, 8);
    for (let f = 1; f <= 5000; f++) {
        airClub.scene.getFrameId = () => 42 + f;
        airClub._lightAirParticles(testParticles, 'haze');
    }
    for (const p of testParticles) {
        assert.ok(
            Number.isFinite(p.color.r) && Number.isFinite(p.color.g) &&
            Number.isFinite(p.color.b) && Number.isFinite(p.color.a),
            `particle color remained finite after 5000 decay frames: ${JSON.stringify(p.color)}`
        );
    }
});

test('Gashouder keeps DJ legs clear of the table, preserves full rear-hall & stage-monitor spatial audio, and omits water self-service', () => {
    const audioSource = readFileSync(new URL('../js/club/11-audio.js', import.meta.url), 'utf8');
    const avatarsSource = readFileSync(new URL('../js/club/11-avatars.js', import.meta.url), 'utf8');
    const audioUtilsSource = readFileSync(new URL('../js/audioUtils.js', import.meta.url), 'utf8');
    const citySource = readFileSync(new URL('../js/cityDistrict.js', import.meta.url), 'utf8');
    const dressingSource = readFileSync(new URL('../js/venueDressing.js', import.meta.url), 'utf8');
    const venueSrc = readFileSync(new URL('../js/gashouderVenue.js', import.meta.url), 'utf8');
    const sessionSource = readFileSync(new URL('../js/sessionExperience.js', import.meta.url), 'utf8');

    const babylonStub = {
        ...BABYLON,
        DynamicTexture: class extends BABYLON.Texture {
            constructor(name, _size, s) { super(null, s); this.name = name; }
            getContext() { return { fillRect() {}, fillText() {} }; }
            update() {}
        }
    };
    const window = { BABYLON: babylonStub, performance };
    const ctx = vm.createContext({
        window,
        BABYLON: babylonStub,
        Math, Number, Object, Array, Set, Map, Float32Array, Uint8Array, Promise,
        performance,
        log: { info() {}, warn() {}, error() {}, debug() {} },
        CLUB_POSITIONS: { paSpeakers: { left: { x: -10, y: 8.4, z: -16 }, right: { x: 10, y: 8.4, z: -16 } } }
    });
    window.window = window;
    vm.runInContext('class VRClubUI {} class VRClubAudioBase {}', ctx);
    vm.runInContext(`${audioUtilsSource}\nwindow.AudioUtils = AudioUtils;`, ctx);
    vm.runInContext(citySource, ctx);
    vm.runInContext(dressingSource, ctx);
    vm.runInContext(venueSrc, ctx);
    vm.runInContext(sessionSource, ctx);
    vm.runInContext(`${audioSource}\nwindow.VRClubAudio = VRClubAudio;`, ctx);
    vm.runInContext(`${avatarsSource}\nwindow.VRClubAvatars = VRClubAvatars;`, ctx);

    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    try {
        // 1. DJ table & console clearance: DJ stands behind the table's rear (-Z) face with zero leg overlap
        const stage = window.GASHOUDER_VENUE.stage;
        const tableRearZ = stage.consoleZ - 0.6; // -19.8
        const consoleMesh = BABYLON.MeshBuilder.CreateBox('console_final', { width: 1.02, height: 0.12, depth: 0.54 }, scene);
        consoleMesh.position.set(0, stage.consoleTop + 0.06, stage.consoleZ - 0.28);
        consoleMesh.computeWorldMatrix(true);

        const avatarClub = Object.assign(Object.create(window.VRClubAvatars.prototype), {
            venueId: 'gashouder',
            scene
        });
        const desk = avatarClub._djDesk();
        const djStandingZ = desk.near - 0.18;
        assert.ok(djStandingZ <= tableRearZ - 0.15,
            `DJ stands cleanly behind the DJ table (${djStandingZ.toFixed(2)} <= ${(tableRearZ - 0.15).toFixed(2)})`);

        // 2. Spatial audio in the rear hall (z = +18) and behind the DJ booth (z = -20.1, y = 3.5)
        const makeParam = initial => ({
            value: initial,
            setTargetAtTime(v) { this.value = v; },
            setValueAtTime(v) { this.value = v; }
        });
        const makeNode = () => ({
            gain: makeParam(1),
            frequency: makeParam(20000),
            delayTime: makeParam(0),
            Q: makeParam(1),
            positionX: makeParam(0), positionY: makeParam(0), positionZ: makeParam(0),
            orientationX: makeParam(0), orientationY: makeParam(0), orientationZ: makeParam(0),
            connect() {}
        });
        window.AudioContext = class FakeAudioContext {
            constructor() {
                this.currentTime = 0;
                this.sampleRate = 48000;
                this.state = 'running';
                this.destination = {};
                this.listener = {
                    positionX: makeParam(0), positionY: makeParam(0), positionZ: makeParam(0),
                    forwardX: makeParam(0), forwardY: makeParam(0), forwardZ: makeParam(-1),
                    upX: makeParam(0), upY: makeParam(1), upZ: makeParam(0)
                };
            }
            createAnalyser() { return { fftSize: 256, frequencyBinCount: 128, connect() {} }; }
            createBiquadFilter() { return makeNode(); }
            createPanner() { return makeNode(); }
            createGain() { return makeNode(); }
            createDelay() { return makeNode(); }
            createDynamicsCompressor() {
                return {
                    threshold: makeParam(-18), knee: makeParam(24), ratio: makeParam(6),
                    attack: makeParam(0.003), release: makeParam(0.18), connect() {}
                };
            }
            createWaveShaper() { return { curve: null, oversample: 'none', connect() {} }; }
            createConvolver() { return { buffer: null, connect() {} }; }
            createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len || 16) }; }
        };

        const cam = new BABYLON.FreeCamera('testCam', new BABYLON.Vector3(0, 1.65, 18), scene); // deep in the rear half of Gashouder!
        scene.activeCamera = cam;
        const camPos = cam.position;
        const audioClub = Object.assign(
            Object.create(window.VRClubAudio.prototype),
            window.VenueDressing,
            window.SessionExperience,
            {
                venueId: 'gashouder',
                scene,
                materialFactory: {
                    createPBRMaterial: name => new BABYLON.PBRMaterial(name, scene)
                },
                getGashouderPreset: () => 'techno',
                _createDJEffects() {},
                _startCrowdAmbience() {},
                _listenerUp: () => BABYLON.Axis.Y
            }
        );
        audioClub._ensureAudioContext();
        // Rear PA panners must aim inward (-Z) into the arena, not +Z into the back brick wall
        assert.ok(audioClub.pannerRearLeft.orientationZ.value < -0.5, 'rear left panner aims inward (-Z) across the hall');
        assert.ok(audioClub.pannerRearRight.orientationZ.value < -0.5, 'rear right panner aims inward (-Z) across the hall');

        audioClub.updateSpatialAudioListener();
        assert.ok(audioClub.occlusionFilter.frequency.value > 18000,
            `rear of Gashouder is unoccluded (${audioClub.occlusionFilter.frequency.value} Hz, not muffled as outdoors)`);
        assert.ok(audioClub.occlusionFilter2.frequency.value > 20000,
            `secondary exterior filter stays wide open in the rear of Gashouder (${audioClub.occlusionFilter2.frequency.value} Hz)`);
        assert.ok(audioClub.audioMasterGain.gain.value >= 1.1,
            `master gain stays full indoors in the rear of Gashouder (${audioClub.audioMasterGain.gain.value})`);
        assert.ok(audioClub.monitorGain.gain.value < 0.05, 'DJ monitors are silent at the rear of the hall');

        // Move listener onto the stage behind the DJ console: DJ monitor speakers must come alive
        camPos.set(0, stage.height + 1.65, stage.consoleZ - 0.85);
        audioClub.updateSpatialAudioListener();
        assert.ok(audioClub.monitorGain.gain.value > 0.8,
            `DJ booth monitors deliver strong nearfield sound on stage (${audioClub.monitorGain.gain.value.toFixed(2)})`);

        // 3. Water self-service station & cups are omitted in Gashouder
        audioClub.createSessionExperience();
        assert.equal(scene.getMeshByName('sessionWaterStation'), null, 'self-service water station mesh is absent in Gashouder');
        assert.equal(scene.getMeshByName('sessionWater0'), null, 'water cup meshes are absent in Gashouder');
        assert.ok(scene.getMeshByName('sessionBoothFeedback'), 'booth room feedback panel still builds cleanly');
        assert.equal(audioClub.pressSessionExperience({ pickedMesh: { metadata: { vrclubSession: 'water' } } }), false);
        audioClub.disposeSessionExperience();
    } finally {
        scene.dispose();
        engine.dispose();
    }
});
