import { test } from '@playwright/test';

test('probe: speaker side on screen vs in the ear', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
        const listenerAt = { x: 0, y: 1.7, z: -12 };
        const speakers = { left: [-6, 7.1, -16], right: [6, 7.1, -16] };
        const out = {};
        for (const facing of [[0, 0, -1], [0, 0, 1]]) {
            const eye = new BABYLON.Vector3(listenerAt.x, listenerAt.y, listenerAt.z);
            const target = eye.add(new BABYLON.Vector3(...facing));
            const view = BABYLON.Matrix.LookAtLH(eye, target, BABYLON.Vector3.Up());
            for (const [name, p] of Object.entries(speakers)) {
                const v = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(...p), view);
                const sampleRate = 44100;
                const ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
                const L = ctx.listener;
                L.positionX.value = listenerAt.x; L.positionY.value = listenerAt.y; L.positionZ.value = listenerAt.z;
                L.forwardX.value = facing[0]; L.forwardY.value = facing[1]; L.forwardZ.value = facing[2];
                L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
                const panner = ctx.createPanner();
                panner.panningModel = 'HRTF';
                panner.positionX.value = p[0]; panner.positionY.value = p[1]; panner.positionZ.value = p[2];
                const buffer = ctx.createBuffer(1, sampleRate, sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(panner).connect(ctx.destination);
                src.start();
                const rendered = await ctx.startRendering();
                const rms = c => Math.sqrt(rendered.getChannelData(c).reduce((s, v) => s + v * v, 0) / rendered.length);
                const l = rms(0), r = rms(1);
                out[`facing ${facing[2] < 0 ? '-z (stage)' : '+z (entrance)'} / ${name} PA (x=${p[0]})`] = {
                    appearsOnScreen: v.x > 0 ? 'RIGHT' : 'LEFT',
                    heardIn: l > r ? 'LEFT ear' : 'RIGHT ear',
                    leftRms: +l.toFixed(3), rightRms: +r.toFixed(3)
                };
            }
        }
        return out;
    });
    console.log(JSON.stringify(result, null, 1));
});
