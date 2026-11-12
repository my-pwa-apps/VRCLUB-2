'use strict';

// Kept in step with ClubMultiplayer and LightingPresets by the preset contract tests.
(function () {
class PresetValidator {
    static COUNT = 12;
    static MAX_BYTES = 65536;
    static SPOT_RIG_FIXTURES = Object.freeze({
        spotSequence: [0, 6], spotSequenceRate: [1, 8], spotPrismActive: 'b',
        ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
            [`spotHead${i}Enabled`, 'b'], [`spotHead${i}Color`, [-1, 8]], [`spotHead${i}Motion`, [0, 7]]
        ]).flat())
    });

    static MANUAL_FIXTURES = Object.freeze({
        ...PresetValidator.SPOT_RIG_FIXTURES,
        lightsActive: 'b', lasersActive: 'b', ledWallActive: 'b', ledMonochrome: 'b', strobesActive: 'b',
        mirrorBallActive: 'b', mirrorBallRaysActive: 'b', laserSheetActive: 'b', smokeActive: 'b', spotStrobeActive: 'b',
        spotlightMode: [0, 7], spotlightPattern: [0, 7], ledPattern: [0, 63], spotColorIndex: [0, 63],
        spotlightSpeed: [0, 10], laserSpeed: [0, 10], mirrorBallSpeed: [0, 10],
        laserSheetSpeed: [0.25, 2],         laserSheetBrightness: [0, 3],
        spotBrightness: [0, 2],
        laserBrightness: [0, 2],
        ledWallBrightness: [0, 2], fogImmersion: [0, 1],
        ledWallSpeed: [0, 10], strobeSpeed: [0, 10], vjMaster: [0, 1], strobePatternIndex: [0, 31],
        currentColorIndex: [0, 2], colorLockActive: 'b',
        ledMulti: 'b', ledWallLevel: [0, 1], kickDepth: [0, 1], fogIntensity: [0, 2],
        fogBurstMode: ['auto', 'continuous', 'burst'],
        laserSheetOrigin: ['both', 'ceilingLeft', 'ceilingRight'], laserSheetMotion: ['vertical', 'lateral'],
        strobeSync: ['free', 'beat', 'offbeat', 'bar', 'roll'],
        spotRed: [0, 1], spotGreen: [0, 1], spotBlue: [0, 1],
        mirrorRed: [0, 1], mirrorGreen: [0, 1], mirrorBlue: [0, 1]
    });
    static parse(text) {
        if (typeof text !== 'string' || text.length > PresetValidator.MAX_BYTES) throw new Error('The preset file is too large');
        const data = JSON.parse(text);
        const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
            && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
        if (!exact(data, ['version', 'slots']) || data.version !== 1 || !Array.isArray(data.slots)
            || data.slots.length !== PresetValidator.COUNT) throw new Error('This is not a supported NOCTURNE lighting preset file');
        const schema = PresetValidator.MANUAL_FIXTURES;
        const preBrightnessSchema = { ...schema };
        delete preBrightnessSchema.spotBrightness;
        delete preBrightnessSchema.laserBrightness;
        delete preBrightnessSchema.ledWallBrightness;
        const previousSchema = { ...preBrightnessSchema };
        delete previousSchema.fogBurstMode;
        for (const preset of data.slots) {
            if (preset === null) continue;
            const fx = preset.fx;
            const retiredKeys = ['goboEnabled', 'goboPatternIndex', 'goboRotationSpeed'];
            if (fx && typeof fx === 'object' && retiredKeys.some(key => Object.hasOwn(fx, key))) {
                if (typeof fx.goboEnabled !== 'boolean' || !Number.isInteger(fx.goboPatternIndex)
                    || fx.goboPatternIndex < 0 || fx.goboPatternIndex > 31
                    || !Number.isFinite(fx.goboRotationSpeed) || Math.abs(fx.goboRotationSpeed) > 10) {
                    throw new Error('Invalid retired gobo settings');
                }
                for (const key of retiredKeys) delete fx[key];
                if (!Object.hasOwn(fx, 'spotPrismActive')) fx.spotPrismActive = false;
            }
            const previous = exact(preset.fx, Object.keys(previousSchema));
            const preBrightness = exact(preset.fx, Object.keys(preBrightnessSchema));
            if (!exact(preset, ['name', 'fx', 'colour']) || typeof preset.name !== 'string'
                || preset.name.trim() !== preset.name || !preset.name || preset.name.length > 32
                || /[\p{C}\p{Zl}\p{Zp}]/u.test(preset.name)
                || (!previous && !preBrightness && !exact(preset.fx, Object.keys(schema)))) throw new Error('A preset has an invalid name or incomplete lighting settings');
            for (const [key, spec] of Object.entries(previous ? previousSchema : preBrightness ? preBrightnessSchema : schema)) {
                const value = preset.fx[key];
                if (spec === 'b' ? typeof value !== 'boolean' : typeof spec[0] === 'string' ? !spec.includes(value)
                    : !Number.isFinite(value) || value < spec[0] || value > spec[1]
                        || (/Index$|Mode$|Pattern$|^spotHead|^spotSequence/.test(key) && !Number.isInteger(value))) {
                    throw new Error(`Invalid lighting setting: ${key}`);
                }
            }
            if (![1, 2, 4, 8].includes(preset.fx.spotSequenceRate)) throw new Error('Invalid spotlight sequence timing');
            const c = preset.colour;
            if (!exact(c, ['hue', 'hl', 'pal', 'lh', 'mbi']) || !Number.isFinite(c.hue) || c.hue < 0 || c.hue > 1
                || typeof c.hl !== 'boolean' || !['analogous', 'complementary', 'triad'].includes(c.pal)
                || !['match', 'analogous', 'complement', 'triad', 'follow'].includes(c.lh)
                || !Number.isInteger(c.mbi) || c.mbi < 0 || c.mbi > 63) throw new Error('Invalid lighting palette');
            if (previous) preset.fx.fogBurstMode = 'auto';
            if (previous || preBrightness) {
                preset.fx.spotBrightness = 1;
                preset.fx.laserBrightness = 1;
                preset.fx.ledWallBrightness = 1;
            }
        }
        return data;
    }

}
globalThis.NocturnePresetValidator = PresetValidator;
}());
