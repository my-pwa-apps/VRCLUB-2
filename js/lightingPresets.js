'use strict';

class LightingPresets {
    static KEY = 'vrclub.lightingPresets';
    static COUNT = 12;
    static MAX_BYTES = 65536;

    constructor(club, storage) {
        this.club = club;
        this.storage = storage;
        this.slots = Array(LightingPresets.COUNT).fill(null);
        this.error = '';
        this.selected = 0;
        this._events = new AbortController();
        try {
            this.storage ??= localStorage;
            const saved = this.storage.getItem(LightingPresets.KEY);
            if (saved !== null) this.slots = LightingPresets.parse(saved).slots;
        } catch (error) {
            this.error = `Could not read lighting presets: ${error.message}. Import a valid backup to restore them.`;
            club.showErrorMessage(this.error);
        }
    }

    static parse(text) {
        if (typeof text !== 'string' || text.length > LightingPresets.MAX_BYTES) throw new Error('The preset file is too large');
        const data = JSON.parse(text);
        const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
            && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
        if (!exact(data, ['version', 'slots']) || data.version !== 1 || !Array.isArray(data.slots)
            || data.slots.length !== LightingPresets.COUNT) throw new Error('This is not a supported NOCTURNE lighting preset file');
        const schema = ClubMultiplayer.MANUAL_FIXTURES;
        for (const preset of data.slots) {
            if (preset === null) continue;
            if (!exact(preset, ['name', 'fx', 'colour']) || typeof preset.name !== 'string'
                || preset.name.trim() !== preset.name || !preset.name || preset.name.length > 32
                || /[\p{C}\p{Zl}\p{Zp}]/u.test(preset.name)
                || !exact(preset.fx, Object.keys(schema))) throw new Error('A preset has an invalid name or incomplete lighting settings');
            for (const [key, spec] of Object.entries(schema)) {
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

    save(slot, name = this.slots[slot]?.name || `Preset ${slot + 1}`) {
        this._checkSlot(slot);
        if (this.error) throw new Error(this.error);
        const club = this.club;
        const preset = { name: name.trim(), fx: club.multiplayer._captureFixtures(), colour: club.vjDirector.colourSnapshot() };
        if (club.showDirector?.isDriving()) preset.fx.vjMaster = Math.min(1, Math.max(0, club.masterIntensity));
        const slots = this.slots.slice();
        slots[slot] = preset;
        this._write(slots);
    }

    recall(slot) {
        this._checkSlot(slot);
        const preset = this.slots[slot], club = this.club;
        if (!preset) throw new Error('Save lighting in this slot first');
        if (!club.guardHostControl('lights')) return false;
        this._checkAvailable(preset);
        club.takeLightControl();
        club.vjDirector.applyRemoteColour(preset.colour);
        club.multiplayer._applyFixtures(preset.fx);
        // Matching colours may select the breathing wall; restore the saved wall picture afterwards.
        club.ledPattern = preset.fx.ledPattern;
        club.ledPatternSwitchTime = 0;
        club.showErrorMessage(`${preset.name} recalled. ${club.lightHoldSummary()}`);
        return true;
    }

    _checkAvailable(preset) {
        const c = this.club, f = preset.fx;
        const wallPictures = c._ledPatternPlaylist?.length ?? 20;
        if (f.spotColorIndex >= c.spotColorList.length || f.goboPatternIndex >= c.goboPatterns.length
            || f.ledPattern >= wallPictures || preset.colour.mbi >= c.mirrorBallColors.length
            || f.strobePatternIndex >= VRClubAnimationFinish.STROBE_PATTERNS.length
            || Array.from({ length: 6 }, (_, i) => f[`spotHead${i}Color`]).some(value => value >= c.spotColorList.length)) {
            throw new Error('This preset uses a colour or pattern unavailable in this version');
        }
    }

    rename(slot, name) {
        this._checkSlot(slot);
        if (!this.slots[slot]) throw new Error('This preset slot is empty');
        const slots = this.slots.slice();
        slots[slot] = { ...slots[slot], name: name.trim() };
        this._write(slots);
    }

    remove(slot) {
        this._checkSlot(slot);
        if (this.error) throw new Error(this.error);
        const slots = this.slots.slice();
        slots[slot] = null;
        this._write(slots);
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

    _checkSlot(slot) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= LightingPresets.COUNT) throw new Error('Choose a preset slot from 1 to 12');
    }

    async openManager() {
        const club = this.club;
        if (club.isInVRMode) {
            if (club._immersive && club._immersive.mode !== 'manual') {
                throw new Error('Rename and transfer presets in this site on your desktop or phone. Saving and recalling work here in VR');
            }
            window.VRPayment?.holdLeaseForSetup?.();
            await club.vrHelper.baseExperience.exitXRAsync();
        }
        const dialog = document.getElementById('lightingPresetDialog');
        if (!this._dialog) this._bindManager(dialog);
        this._renderManager();
        if (!dialog.open) dialog.showModal();
    }

    _renderManager() {
        const select = this._dialog.querySelector('[data-preset-slots]');
        select.replaceChildren(...this.slots.map((preset, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = `${index + 1}. ${preset?.name || 'Empty slot'}`;
            return option;
        }));
        select.value = String(this.selected);
        this._dialog.querySelector('[data-preset-name]').value = this.slots[this.selected]?.name || '';
        this._dialog.querySelector('[data-preset-rename]').disabled = !this.slots[this.selected];
        this._dialog.querySelector('[data-preset-status]').textContent = this.error || 'Saved on this device. Export a backup to take your lighting to another device.';
    }

    _bindManager(dialog) {
        this._dialog = dialog;
        const options = { signal: this._events.signal };
        const status = text => { dialog.querySelector('[data-preset-status]').textContent = text; };
        const run = action => {
            try { action(); } catch (error) { status(error.message); this.club.showErrorMessage(error.message); }
        };
        dialog.querySelector('[data-preset-close]').addEventListener('click', () => dialog.close(), options);
        dialog.querySelector('[data-preset-slots]').addEventListener('change', event => {
            this.selected = Number(event.target.value);
            this._renderManager();
        }, options);
        dialog.querySelector('[data-preset-rename]').addEventListener('click', () => run(() => {
            this.rename(this.selected, dialog.querySelector('[data-preset-name]').value);
            this._renderManager();
            status('Preset renamed.');
        }), options);
        dialog.querySelector('[data-preset-export]').addEventListener('click', () => run(() => {
            const blob = new Blob([this.export()], { type: 'application/json' });
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url;
            link.download = 'nocturne-lighting-presets.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            status('Preset backup downloaded.');
        }), options);
        const input = dialog.querySelector('[data-preset-file]');
        const importButton = dialog.querySelector('[data-preset-import]');
        input.addEventListener('change', async () => {
            importButton.disabled = true;
            this._importText = null;
            const file = input.files[0];
            if (!file) return;
            try {
                if (file.size > LightingPresets.MAX_BYTES) throw new Error('The preset file is too large');
                const text = await file.text();
                if (input.files[0] !== file || this._events.signal.aborted) return;
                const data = LightingPresets.parse(text);
                for (const preset of data.slots) if (preset) this._checkAvailable(preset);
                this._importText = text;
                importButton.disabled = false;
                status('Backup checked. Replace all 12 slots to import it. Your current presets will be overwritten.');
            } catch (error) { status(`Could not import presets: ${error.message}`); }
        }, options);
        importButton.addEventListener('click', () => run(() => {
            if (!this._importText) throw new Error('Choose a preset backup first');
            this.import(this._importText);
            this._importText = null;
            input.value = '';
            importButton.disabled = true;
            this._renderManager();
            status('All 12 preset slots replaced from the backup.');
        }), options);
    }

    dispose() {
        this._events.abort();
        this._dialog?.close();
        this._importText = null;
    }
}

window.LightingPresets = LightingPresets;
