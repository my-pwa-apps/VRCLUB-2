export const renderFrames = (page, count) => page.evaluate(async n => {
    for (let i = 0; i < n; i++) {
        await new Promise(resolve => window.vrClub.scene.onAfterRenderObservable.addOnce(resolve));
    }
}, count);

/**
 * Resource-budget snapshot for the current render mode.
 * Labels describe exactly what is counted: an active-submesh proxy, the engine's own
 * scene-submission counter, and separate RGBA+mip estimates for ordinary 2D textures
 * versus cube/render-target textures.
 */
export const snapshotResourceBudget = (page, sampleFrames = 20) => page.evaluate(async count => {
    const club = window.vrClub;
    const scene = club.scene;
    const engine = club.engine;
    const drawCalls = engine && engine._drawCalls ? engine._drawCalls : null;
    const before = drawCalls ? drawCalls.current : null;
    for (let i = 0; i < count; i++) {
        await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
    }
    const after = drawCalls ? drawCalls.current : null;
    const rgbaBytesOf = texture => {
        if (!texture.getSize || !texture.isReady()) return 0;
        const { width, height } = texture.getSize();
        if (!(width > 0) || !(height > 0)) return 0;
        const mipFactor = texture.noMipmap ? 1 : 4 / 3;
        return width * height * 4 * mipFactor * (texture.isCube ? 6 : 1);
    };

    let activeSubmeshProxyDraws = 0;
    const activeMeshes = scene.getActiveMeshes();
    const activeMeshList = [];
    for (let i = 0; i < activeMeshes.length; i++) {
        const mesh = activeMeshes.data[i];
        activeMeshList.push(mesh);
        activeSubmeshProxyDraws += mesh.subMeshes ? mesh.subMeshes.length : 1;
    }

    const proxyDrawsOf = mesh => mesh.subMeshes ? mesh.subMeshes.length : 1;
    const characterMeshes = new Set();
    for (const npc of club.npcAvatars) {
        if (!npc.root || !npc.root.isEnabled()) continue;
        for (const mesh of npc.meshes) characterMeshes.add(mesh);
    }
    const subsystemOf = mesh => {
        if (characterMeshes.has(mesh) || mesh === club._contactShadows?.mesh) return 'crowd/NPCs';
        const name = mesh.name || '';
        if (/^(ledPanel_|spotlight|spotBeam|movingHead|strobe|laser_|laserSheet|gobo)|truss|lightFixture|mirrorBall/i.test(name)) {
            return 'club lighting';
        }
        if (/^mirrorReflection/i.test(name)) return 'mirrors/reflections';
        if (/barBottles|glass|stool|chair|table|furniture|barShade|barBulb/i.test(name)) return 'furniture/bar stock';
        if (/djConsole|leftCDJ|rightCDJ|mixer|jogWheel|speaker|bass_bin/i.test(name)) return 'DJ/PA equipment';
        if (/vrQuick|gui|menu|label|remoteEmoji|remoteChat/i.test(name)) return 'UI';
        if (/haze|fog|dust|smoke|particle/i.test(name)) return 'effects/particles';
        if (/city|street|queue|rope/i.test(name)) return 'city/street';
        return 'architecture/other';
    };
    const drawsBySubsystem = {};
    for (const mesh of activeMeshList) {
        const subsystem = subsystemOf(mesh);
        drawsBySubsystem[subsystem] = (drawsBySubsystem[subsystem] || 0) + proxyDrawsOf(mesh);
    }

    const activeMaterials = new Set();
    const activeTextures = new Set();
    const effects = new Set();
    const drawsByMaterial = new Map();
    let transparentProxyDraws = 0;
    let alphaTestProxyDraws = 0;
    let multiMaterialMeshes = 0;
    let multiSubmeshMeshes = 0;
    let instancedSourceMeshes = 0;
    let meshInstances = 0;
    let thinInstanceBatches = 0;
    let thinInstances = 0;
    const geometryUse = new Map();
    for (const mesh of activeMeshList) {
        const draws = proxyDrawsOf(mesh);
        const material = mesh.material;
        if (material) {
            activeMaterials.add(material);
            drawsByMaterial.set(material, (drawsByMaterial.get(material) || 0) + draws);
            for (const texture of material.getActiveTextures()) activeTextures.add(texture);
            let alphaBlended = false;
            let alphaTested = false;
            try {
                alphaBlended = material.needAlphaBlendingForMesh
                    ? material.needAlphaBlendingForMesh(mesh)
                    : material.needAlphaBlending();
                alphaTested = material.needAlphaTestingForMesh
                    ? material.needAlphaTestingForMesh(mesh)
                    : material.needAlphaTesting();
            } catch {
                // A diagnostic must not disturb a frame when a custom material lacks a readiness dependency.
            }
            if (alphaBlended) transparentProxyDraws += draws;
            if (alphaTested) alphaTestProxyDraws += draws;
        }
        if (mesh.subMeshes) {
            for (const subMesh of mesh.subMeshes) {
                const effect = subMesh.effect || subMesh._drawWrapper?.effect || material?.getEffect?.();
                if (effect) effects.add(effect);
            }
        }
        if (material?.getClassName && material.getClassName() === 'MultiMaterial') multiMaterialMeshes++;
        if (mesh.subMeshes && mesh.subMeshes.length > 1) multiSubmeshMeshes++;
        if (mesh.instances && mesh.instances.length) {
            instancedSourceMeshes++;
            meshInstances += mesh.instances.filter(instance => instance.isEnabled()).length;
        }
        if (mesh.hasThinInstances) {
            thinInstanceBatches++;
            thinInstances += mesh.thinInstanceCount || 0;
        }
        if (mesh.geometry) {
            geometryUse.set(mesh.geometry, (geometryUse.get(mesh.geometry) || 0) + 1);
        }
    }

    const shadowMaps = [];
    for (const light of scene.lights) {
        const generator = light.getShadowGenerator && light.getShadowGenerator();
        if (!generator) continue;
        const map = generator.getShadowMap && generator.getShadowMap();
        shadowMaps.push({
            light: light.name,
            renderListMeshes: map?.renderList?.length || 0,
            refreshRate: map?.refreshRate ?? null,
            size: map?.getSize ? map.getSize().width : null
        });
    }
    const renderTargets = scene.textures
        .filter(texture => texture.isRenderTarget)
        .map(texture => ({
            name: texture.name,
            size: texture.getSize ? texture.getSize() : null,
            refreshRate: texture.refreshRate ?? null,
            renderListMeshes: texture.renderList?.length ?? null
        }));
    const topMeshesByProxyDraws = activeMeshList
        .map(mesh => ({ name: mesh.name, draws: proxyDrawsOf(mesh), subsystem: subsystemOf(mesh) }))
        .sort((a, b) => b.draws - a.draws || a.name.localeCompare(b.name))
        .slice(0, 15);
    const topMaterialsByProxyDraws = [...drawsByMaterial]
        .map(([material, draws]) => ({ name: material.name, draws, kind: material.getClassName() }))
        .sort((a, b) => b.draws - a.draws || a.name.localeCompare(b.name))
        .slice(0, 15);

    let ordinaryRgbaBytes = 0;
    let cubeAndRenderTargetRgbaBytes = 0;
    let ordinaryTexturesAtLeast2048 = 0;
    let ordinaryTexturesAtLeast4096 = 0;
    let cubeTextureCount = 0;
    let renderTargetTextureCount = 0;
    for (const texture of scene.textures) {
        const bytes = rgbaBytesOf(texture);
        if (bytes === 0) continue;
        const { width, height } = texture.getSize();
        const maxEdge = Math.max(width, height);
        if (texture.isCube || texture.isRenderTarget) {
            cubeAndRenderTargetRgbaBytes += bytes;
            if (texture.isCube) cubeTextureCount++;
            if (texture.isRenderTarget) renderTargetTextureCount++;
            continue;
        }
        ordinaryRgbaBytes += bytes;
        if (maxEdge >= 2048) ordinaryTexturesAtLeast2048++;
        if (maxEdge >= 4096) ordinaryTexturesAtLeast4096++;
    }

    return {
        mode: club.isInVRMode ? 'xr' : 'desktop',
        engineSceneSubmissionsPerFrame: before === null || after === null
            ? null
            : Math.round((after - before) / count),
        activeSubmeshProxyDraws,
        nonMainPassAndEffectSubmissionGap: before === null || after === null
            ? null
            : Math.round((after - before) / count) - activeSubmeshProxyDraws,
        drawsBySubsystem,
        topMeshesByProxyDraws,
        topMaterialsByProxyDraws,
        renderStateInventory: {
            activeMaterials: activeMaterials.size,
            activeTextures: activeTextures.size,
            compiledEffectsObserved: effects.size,
            transparentProxyDraws,
            alphaTestProxyDraws,
            multiMaterialMeshes,
            multiSubmeshMeshes
        },
        reuseInventory: {
            instancedSourceMeshes,
            meshInstances,
            thinInstanceBatches,
            thinInstances,
            sharedGeometryObjects: [...geometryUse.values()].filter(uses => uses > 1).length,
            meshesUsingSharedGeometry: [...geometryUse.values()]
                .filter(uses => uses > 1)
                .reduce((sum, uses) => sum + uses, 0)
        },
        shadowMaps,
        reflectionProbe: club.floorReflectionProbe ? {
            refreshRate: club.floorReflectionProbe.cubeTexture.refreshRate,
            renderListMeshes: club.floorReflectionProbe.renderList?.length ?? null,
            size: club.floorReflectionProbe.cubeTexture.getSize()
        } : null,
        renderTargets,
        particleSystems: scene.particleSystems.map(system => ({
            name: system.name,
            active: system.isStarted && system.isStarted(),
            emitRate: system.emitRate,
            capacity: system.getCapacity ? system.getCapacity() : null,
            blendMode: system.blendMode
        })),
        ledWallMeshes: scene.meshes.filter(mesh => /^ledPanel_/.test(mesh.name)).length,
        ledPanels: club.ledPanels.length,
        signage: ['signageGlow', 'signagePlates', 'stepLights'].map(name => !!scene.getMeshByName(name)),
        oldSignMeshes: scene.meshes.filter(mesh => /^(neonSign|exitSign|exitHousing)\d|^stepLight_/.test(mesh.name)).length,
        contactShadows: club._contactShadows ? club._contactShadows.mesh.thinInstanceCount : 0,
        enabledCharacters: club.npcAvatars.filter(npc => npc.root.isEnabled()).length,
        guests: club.npcAvatars.filter(npc => npc.name.startsWith('guest') && npc.root.isEnabled()).length,
        // Every enabled character: a skinned mesh per primitive, so this is its draw-call proxy cost.
        mostDrawsPerCharacter: Math.max(
            ...club.npcAvatars.filter(npc => npc.root.isEnabled()).map(npc => npc.meshes.length)
        ),
        ordinaryRgbaTextureEstimateMB: Math.round(ordinaryRgbaBytes / 1048576),
        cubeAndRenderTargetRgbaEstimateMB: Math.round(cubeAndRenderTargetRgbaBytes / 1048576),
        ordinaryTexturesAtLeast2048,
        ordinaryTexturesAtLeast4096,
        cubeTextureCount,
        renderTargetTextureCount
    };
}, sampleFrames);

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
            mirrorReflectionSpots: club.mirrorReflectionBatch?.spots.thinInstanceCount || 0,
            mirrorOutgoingRays: club.mirrorReflectionBatch?.rays.thinInstanceCount || 0,
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
