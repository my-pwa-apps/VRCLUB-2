import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness({ music: true });

/** Five minutes of mono white noise: longer than the allowed scene startup, steady and broadband. */
function noiseWav(seconds = 300, sampleRate = 22050) {
    const samples = seconds * sampleRate;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round((Math.random() * 2 - 1) * 9000), 44 + i * 2);
    return buffer;
}

/** Taps the club's real master bus with a left/right level meter. */
const installMeter = page => page.evaluate(() => {
    const club = window.vrClub;
    const ctx = club.audioContext;
    const splitter = ctx.createChannelSplitter(2);
    const meters = [0, 1].map(() => {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        return analyser;
    });
    club.audioMasterGain.connect(splitter);
    splitter.connect(meters[0], 0);
    splitter.connect(meters[1], 1);
    window.__meter = { meters, buffer: new Float32Array(2048) };
});

const readLevels = (page, reads = 12) => page.evaluate(async count => {
    const { meters, buffer } = window.__meter;
    const sums = [0, 0];
    for (let i = 0; i < count; i++) {
        await new Promise(resolve => setTimeout(resolve, 40));
        meters.forEach((analyser, channel) => {
            analyser.getFloatTimeDomainData(buffer);
            let s = 0;
            for (let k = 0; k < buffer.length; k++) s += buffer[k] * buffer[k];
            sums[channel] += Math.sqrt(s / buffer.length);
        });
    }
    return { left: sums[0] / count, right: sums[1] / count };
}, reads);

/**
 * Which side of the screen the NEARER PA is on, from the camera that is actually
 * rendering. `ambiguous` when both speakers are about equally far (a symmetric pose).
 */
const paScreenSide = page => page.evaluate(() => {
    const club = window.vrClub;
    const camera = club.scene.activeCamera;
    const eye = camera.rigCameras && camera.rigCameras[0] ? camera.rigCameras[0] : camera;
    const view = eye.getViewMatrix();
    const position = camera.globalPosition;
    const forward = camera.getForwardRay(1).direction;
    const speakers = Object.values(window.CLUB_POSITIONS.paSpeakers).map(p => {
        const point = new BABYLON.Vector3(p.x, p.y, p.z);
        return { distance: BABYLON.Vector3.Distance(point, position), screenX: BABYLON.Vector3.TransformCoordinates(point, view).x };
    }).sort((a, b) => a.distance - b.distance);
    return {
        side: speakers[0].screenX > 0 ? 'right' : 'left',
        ambiguous: speakers[1].distance - speakers[0].distance < 1.5,
        position: position.asArray().map(v => +v.toFixed(2)),
        forward: [forward.x, forward.z].map(v => +v.toFixed(2))
    };
});
const expectLouderOnSide = async (page, label, margin = 1.04) => {
    await renderFrames(page, 3);
    await page.waitForTimeout(100);
    const { side, ambiguous, position, forward } = await paScreenSide(page);
    const { left, right } = await readLevels(page);
    console.log(`${label}: pos=${position} fwd=${forward} nearest PA on ${side}${ambiguous ? ' (ambiguous)' : ''}; left=${left.toFixed(4)} right=${right.toFixed(4)}`);
    expect(left + right, `${label}: nothing is playing`).toBeGreaterThan(0.002);
    if (ambiguous) return;
    if (side === 'left') expect(left / right, `${label}: PA on the left must be louder in the left ear`).toBeGreaterThan(margin);
    else expect(right / left, `${label}: PA on the right must be louder in the right ear`).toBeGreaterThan(margin);
};
test('the PA is heard on the side it appears, on desktop and in VR', async ({ page }) => {
    test.setTimeout(1_200_000);
    const wav = noiseWav();
    // Unroute the harness's silent episode so the loud noise replaces it.
    await page.unroute('https://audio.example/**');
    await page.route('https://audio.example/**', route => route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: wav
    }));
    await enterClub(page);
    try {
        await page.waitForFunction(() => {
            const club = window.vrClub;
            return club.audioContext && club.audioContext.state === 'running' && club.audioSource && !club.audioElement.paused;
        }, null, { timeout: 120_000 });
    } catch (error) {
        const state = await page.evaluate(() => {
            const club = window.vrClub;
            const audio = club.audioElement;
            return {
                context: club.audioContext?.state,
                hasSource: !!club.audioSource,
                paused: audio?.paused,
                ended: audio?.ended,
                currentTime: audio?.currentTime,
                duration: audio?.duration,
                readyState: audio?.readyState,
                networkState: audio?.networkState,
                currentSrc: audio?.currentSrc,
                mediaError: audio?.error && { code: audio.error.code, message: audio.error.message },
                kind: club._audioKind,
                streamUrl: club._audioStreamUrl
            };
        });
        throw new Error(`Entry audio did not start: ${JSON.stringify(state)}`, { cause: error });
    }
    // The saved set correctly enters as finite on-demand audio. Loop only this synthetic
    // signal after startup so a slow SwiftShader XR run cannot exhaust the fixture.
    await page.evaluate(() => { window.vrClub.audioElement.loop = true; });
    await installMeter(page);

    const stand = (x, z, yawDegrees) => page.evaluate(([px, pz, yaw]) => {
        const club = window.vrClub;
        club.camera.position.set(px, 1.7, pz);
        const r = yaw * Math.PI / 180;
        club.camera.setTarget(new BABYLON.Vector3(px + Math.sin(r), 1.7, pz + Math.cos(r)));
    }, [x, z, yawDegrees]);

    await test.step('desktop, standing right of the stage centre and left of it', async () => {
        await stand(4, -12, 180);
        await expectLouderOnSide(page, 'desktop x=+4 facing the stage');
        await stand(-4, -12, 180);
        await expectLouderOnSide(page, 'desktop x=-4 facing the stage');
    });

    await test.step('desktop, turning the head moves the stage to the other ear', async () => {
        await stand(0, -12, 90);
        await expectLouderOnSide(page, 'desktop facing +x');
        await stand(0, -12, 270);
        await expectLouderOnSide(page, 'desktop facing -x');
    });

    // Measure on the floor facing the PA, not from the street arrival.
    await stand(0, -12, 180);
    await enterVR(page, { floorPosition: [0, 0, -12] });
    await page.waitForFunction(() => window.vrClub.audioContext.state === 'running');

    await test.step('in the headset, stepping sideways', async () => {
        // The emulator's local space is right-handed: a +x step is a -x step in the club.
        await page.evaluate(() => window.__iwerDevice.position.set(3, 1.6, 0));
        await expectLouderOnSide(page, 'VR stepped to club x=-3');
        await page.evaluate(() => window.__iwerDevice.position.set(-3, 1.6, 0));
        await expectLouderOnSide(page, 'VR stepped to club x=+3');
    });

    await test.step('in the headset, turning the head moves the stage to the other ear', async () => {
        await page.evaluate(() => window.__iwerDevice.position.set(3, 1.6, 0));
        for (const [label, yaw] of [['left', 90], ['right', -90]]) {
            await page.evaluate(degrees => {
                const half = degrees * Math.PI / 360;
                window.__iwerDevice.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
            }, yaw);
            await expectLouderOnSide(page, `VR head turned ${label}`);
        }
    });
});