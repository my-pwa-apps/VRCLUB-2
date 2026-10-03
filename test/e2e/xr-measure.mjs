export const renderFrames = (page, count) => page.evaluate(async n => {
    for (let i = 0; i < n; i++) {
        await new Promise(resolve => window.vrClub.scene.onAfterRenderObservable.addOnce(resolve));
    }
}, count);

/** Every setting that decides how the club looks, read from the live engine. */
export const snapshotRenderState = page => page.evaluate(() => {
    const club = window.vrClub;
    const scene = club.scene;
    const pipeline = club.renderPipeline;
    const ip = pipeline && pipeline.imageProcessing;
    const camera = scene.activeCamera;
    const attached = candidate => Boolean(candidate && candidate._cameras && candidate._cameras.includes(camera));
    const meshes = scene.meshes.filter(mesh => mesh.isEnabled() && mesh.getTotalVertices() > 0);
    const textures = scene.textures.filter(texture => texture.getSize && texture.isReady());
    const materials = scene.materials;
    const budgetOf = material => material.maxSimultaneousLights;
    const transparentModelMeshes = scene.meshes.filter(mesh =>
        /djConsole|speaker|^__root__|GLB/i.test(mesh.name) && mesh.material &&
        (mesh.material.alpha < 1 || (mesh.material.transparencyMode || 0) !== 0));
    const round = value => (typeof value === 'number' ? +value.toFixed(4) : value);
    return {
        pipeline: {
            kind: pipeline && pipeline.name,
            samples: pipeline && pipeline.samples,
            fxaa: pipeline && pipeline.fxaaEnabled,
            bloom: pipeline && pipeline.bloomEnabled,
            bloomWeight: round(pipeline && pipeline.bloomWeight),
            bloomThreshold: round(pipeline && pipeline.bloomThreshold),
            bloomKernel: round(pipeline && pipeline.bloomKernel),
            bloomScale: round(pipeline && pipeline.bloomScale),
            sharpen: pipeline && pipeline.sharpenEnabled,
            sharpenEdge: round(pipeline && pipeline.sharpen && pipeline.sharpen.edgeAmount),
            // The sharpen stage's colour amount is a brightness GAIN on the final image.
            sharpenGain: round(pipeline && pipeline.sharpen && pipeline.sharpen.colorAmount),
            imageProcessing: pipeline && pipeline.imageProcessingEnabled,
            toneMapping: ip && ip.toneMappingEnabled,
            toneMappingType: ip && ip.toneMappingType,
            exposure: round(ip && ip.exposure),
            contrast: round(ip && ip.contrast),
            vignette: ip && ip.vignetteEnabled,
            dithering: ip && ip.ditheringEnabled,
            grain: pipeline && pipeline.grainEnabled,
            chromaticAberration: pipeline && pipeline.chromaticAberrationEnabled
        },
        screenSpace: {
            activeCamera: camera.name,
            ssaoCameras: club.ssaoPipeline && club.ssaoPipeline._cameras ? club.ssaoPipeline._cameras.map(c => c.name) : [],
            ssaoAttached: attached(club.ssaoPipeline),
            ssrActive: Boolean(club.ssrPipeline && club.ssrPipeline.isEnabled),
            motionBlur: Boolean(club.motionBlur)
        },
        glow: {
            enabled: club.glowLayer.isEnabled,
            intensity: round(club.glowLayer.intensity)
        },
        environment: {
            hasReflections: Boolean(scene.environmentTexture),
            environmentIntensity: round(scene.environmentIntensity),
            fogMode: scene.fogMode,
            fogDensity: round(scene.fogDensity),
            clearColor: scene.clearColor.asArray().map(round),
            probeRefreshRate: club.floorReflectionProbe ? club.floorReflectionProbe.cubeTexture.refreshRate : null
        },
        resolution: {
            hardwareScaling: club.engine.getHardwareScalingLevel(),
            renderWidth: club.engine.getRenderWidth(),
            renderHeight: club.engine.getRenderHeight()
        },
        lighting: {
            lightCount: scene.lights.length,
            enabledLights: scene.lights.filter(light => light.isEnabled()).length,
            shadowCasters: scene.lights.filter(light => light.shadowEnabled && light.getShadowGenerator && light.getShadowGenerator()).length,
            maxLightsAnyMaterial: Math.max(...materials.map(budgetOf).filter(Number.isFinite)),
            materialsOverBudget: materials.filter(material => budgetOf(material) > club.maxLights).length
        },
        content: {
            enabledMeshes: meshes.length,
            enabledVertices: meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
            materialCount: materials.length,
            pbrMaterialCount: materials.filter(material => material.getClassName() === 'PBRMaterial').length,
            textureCount: textures.length,
            maxAnisotropy: Math.max(0, ...textures.map(texture => texture.anisotropicFilteringLevel || 0)),
            smallestTexture: Math.min(...textures.map(texture => texture.getSize().width).filter(width => width > 0)),
            dancers: club.npcAvatars.filter(npc => npc.root && npc.root.isEnabled()).length,
            spotlights: club.spotlights.length,
            lasers: club.lasers.length,
            ledPanels: club.ledPanels.length,
            strobes: club.strobes.length,
            mirrorBeams: club.mirrorBallBeams.filter(beam => beam.mesh.isEnabled()).length,
            mirrorReflectionSpots: club.mirrorReflectionSpots.filter(spot => spot.beam && spot.beam.isEnabled()).length,
            mirrorOutgoingRays: club.mirrorBallOutgoingRays.filter(ray => ray.mesh.isEnabled()).length,
            transparentModelMeshes: transparentModelMeshes.length
        },
        atmosphere: {
            hazeRate: club.haze.emitRate,
            hazeAlpha: [club.haze.color1.a, club.haze.color2.a].map(round),
            particleSystems: scene.particleSystems.length
        }
    };
});

/**
 * Reads the canvas the same frame it was rendered. The Quest emulator draws the XR
 * layer into the page canvas, so this is the headset image as well as the desktop one.
 */
export const captureImage = page => page.evaluate(() => new Promise(resolve => {
    const club = window.vrClub;
    club.scene.onAfterRenderObservable.addOnce(() => {
        const { width, height } = club.canvas;
        const copy = document.createElement('canvas');
        copy.width = width;
        copy.height = height;
        const context = copy.getContext('2d', { willReadFrequently: true });
        context.drawImage(club.canvas, 0, 0);
        const { data } = context.getImageData(0, 0, width, height);

        // Below the horizon sits the player's own body (visible in VR, partly in desktop),
        // which would swamp a comparison of the venue, so only the upper part is measured.
        const rows = Math.floor(height * 0.62);
        const gridW = 32;
        const gridH = 20;
        const grid = new Float64Array(gridW * gridH);
        const gridCount = new Float64Array(gridW * gridH);
        const lumas = new Float32Array(width * rows);
        let r = 0, g = 0, b = 0, edge = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                lumas[y * width + x] = luma;
                r += data[i]; g += data[i + 1]; b += data[i + 2];
                const cell = Math.floor(y / rows * gridH) * gridW + Math.floor(x / width * gridW);
                grid[cell] += luma;
                gridCount[cell]++;
                if (x > 0) edge += Math.abs(luma - lumas[y * width + x - 1]);
            }
        }
        const count = width * rows;
        const sorted = Float32Array.from(lumas).sort();
        const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
        let lit = 0;
        for (let i = 0; i < lumas.length; i++) if (lumas[i] > 0.1) lit++;
        resolve({
            width, height,
            meanLuma: lumas.reduce((sum, v) => sum + v, 0) / count,
            p50: at(0.5), p95: at(0.95), p99: at(0.99),
            litFraction: lit / count,
            meanRGB: [r, g, b].map(v => v / count / 255),
            edgeEnergy: edge / count,
            grid: Array.from(grid, (v, i) => v / Math.max(1, gridCount[i]))
        });
    });
}));

export const pearson = (a, b) => {
    const mean = values => values.reduce((s, v) => s + v, 0) / values.length;
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : 0;
};
