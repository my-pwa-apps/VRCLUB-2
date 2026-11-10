'use strict';
class LightingPresets {
    static KEY = 'vrclub.lightingPresets';
    static COUNT = 12;
    static MAX_BYTES = 65536;

    constructor(club, storage) {
        this.club = club;
        this.storage = storage;
        this.slots = Array(LightingPresets.COUNT).fill(null);
        this.selected = 0;
        this.error = '';
        try {
            storage ??= window.localStorage;
            this.storage = storage;
            const text = storage.getItem(LightingPresets.KEY);
            if (text !== null) this.slots = LightingPresets.parse(text).slots;
        } catch (error) {
            this.error = `Could not read lighting presets: ${error.message}`;
            club.showErrorMessage(this.error);
        }
    }

    static parse(text) {
        if (typeof text !== 'string' || text.length > this.MAX_BYTES) throw new Error('The preset file is too large');
        const data = JSON.parse(text);
        const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
            Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
        if (!exact(data, ['version', 'slots']) || data.version !== 1 || !Array.isArray(data.slots) || data.slots.length !== 12)
            throw new Error('This is not a supported NOCTURNE lighting preset file');
        const schema = ClubMultiplayer.MANUAL_FIXTURES;
        for (const preset of data.slots) {
            if (preset === null) continue;
            if (!exact(preset, ['name', 'fx', 'colour']) || typeof preset.name !== 'string' ||
                !preset.name.trim() || preset.name.trim() !== preset.name || preset.name.length > 32 ||
                /[\p{C}\p{Zl}\p{Zp}]/u.test(preset.name)) throw new Error('Invalid preset name');
            // The previous brightness schema defaults only the newly introduced trims.
            const keys = Object.keys(schema), oldKeys = keys.filter(key => !['spotBrightness', 'laserBrightness', 'ledWallBrightness'].includes(key));
            if (exact(preset.fx, oldKeys)) Object.assign(preset.fx, { spotBrightness: 1, laserBrightness: 1, ledWallBrightness: 1 });
            if (!exact(preset.fx, keys)) throw new Error('Incomplete preset lighting settings');
            for (const [key, spec] of Object.entries(schema)) {
                const value = preset.fx[key];
                if (spec === 'b' ? typeof value !== 'boolean' : typeof spec[0] === 'string' ? !spec.includes(value) :
                    !Number.isFinite(value) || value < spec[0] || value > spec[1] ||
                    (/Index$|Mode$|Pattern$|^spotHead|^spotSequence/.test(key) && !Number.isInteger(value)))
                    throw new Error(`Invalid lighting setting: ${key}`);
            }
            if (![1, 2, 4, 8].includes(preset.fx.spotSequenceRate)) throw new Error('Invalid sequence timing');
            const c = preset.colour;
            if (!exact(c, ['hue', 'hl', 'pal', 'lh', 'mbi']) || !Number.isFinite(c.hue) || c.hue < 0 || c.hue > 1 ||
                typeof c.hl !== 'boolean' || !['analogous', 'complementary', 'triad'].includes(c.pal) ||
                !['match', 'analogous', 'complement', 'triad', 'follow'].includes(c.lh) || !Number.isInteger(c.mbi) || c.mbi < 0 || c.mbi > 63)
                throw new Error('Invalid lighting palette');
        }
        return data;
    }

    _write(slots) {
        const text = JSON.stringify({ version: 1, slots });
        LightingPresets.parse(text);
        this.storage.setItem(LightingPresets.KEY, text);
        this.slots = slots;
        this.error = '';
        if (this.club._vjDesk) this.club._vjDesk.dirty = true;
    }

    _checkSlot(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= 12) throw new Error('Choose a preset slot from 1 to 12');
    }

    _checkAvailable(preset) {
        const c = this.club, f = preset.fx;
        if (f.spotColorIndex >= c.spotColorList.length || f.ledPattern >= (c._ledPatternPlaylist?.length ?? 20) ||
            preset.colour.mbi >= c.mirrorBallColors.length || f.strobePatternIndex >= VRClubAnimationFinish.STROBE_PATTERNS.length ||
            Array.from({ length: 6 }, (_, i) => f[`spotHead${i}Color`]).some(value => value >= c.spotColorList.length))
            throw new Error('This preset uses an unavailable colour or pattern');
    }

    save(slot, name = this.slots[slot]?.name || `Preset ${slot + 1}`) {
        this._checkSlot(slot);
        if (this.error) throw new Error(this.error);
        const c = this.club;
        const preset = { name: name.trim(), fx: c.multiplayer._captureFixtures(), colour: c.vjDirector.colourSnapshot() };
        if (c.showDirector?.isDriving()) preset.fx.vjMaster = Math.min(1, Math.max(0, c.masterIntensity));
        const slots = this.slots.slice(); slots[slot] = preset; this._write(slots);
    }

    recall(slot) {
        this._checkSlot(slot);
        const preset = this.slots[slot], c = this.club;
        if (!preset) throw new Error('Save lighting in this slot first');
        if (!c.guardHostControl('lights')) return false;
        this._checkAvailable(preset);
        c.takeLightControl();
        c.vjDirector.applyRemoteColour(preset.colour);
        c.multiplayer._applyFixtures(preset.fx);
        c.ledPattern = preset.fx.ledPattern;
        c.ledPatternSwitchTime = 0;
        c.showErrorMessage(`${preset.name} recalled.`);
        return true;
    }

    rename(slot, name) {
        this._checkSlot(slot);
        if (!this.slots[slot]) throw new Error('This preset slot is empty');
        const slots = this.slots.slice(); slots[slot] = { ...slots[slot], name: name.trim() }; this._write(slots);
    }

    remove(slot) {
        this._checkSlot(slot);
        if (this.error) throw new Error(this.error);
        const slots = this.slots.slice(); slots[slot] = null; this._write(slots);
    }

    export() {
        if (this.error) throw new Error(this.error);
        return JSON.stringify({ version: 1, slots: this.slots }, null, 2);
    }

    import(text) {
        const data = LightingPresets.parse(text);
        for (const preset of data.slots) if (preset) this._checkAvailable(preset);
        this._write(data.slots);
    }

    dispose() {}
}
window.LightingPresets = LightingPresets;
