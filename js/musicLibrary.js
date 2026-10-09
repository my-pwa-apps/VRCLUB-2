'use strict';

class MusicLibrary {
    static KEY = 'vrclub.questMusic';
    static MAX_SETS = 8;

    constructor(club, storage) {
        this.club = club;
        this.storage = storage;
        this.items = [];
        this.selected = 0;
        this.onChange = null;
        try {
            this.storage = storage || window.localStorage;
            const raw = this.storage.getItem(MusicLibrary.KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.items) || data.items.length > MusicLibrary.MAX_SETS) {
                throw new Error('Invalid saved music library');
            }
            this.items = data.items.map(item => this._item(item.url, item.name));
            this.selected = Number.isInteger(data.selected) && data.selected >= 0 && data.selected < this.items.length
                ? data.selected : 0;
        } catch (error) {
            this.items = [];
            console.warn('[Music] Could not read saved sets:', error);
            club.showErrorMessage('Saved sets could not be read. Add your music links again.');
        }
    }

    _item(url, name) {
        const parsed = new URL(String(url).trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
            throw new Error('Use a direct HTTPS audio link without a username or password.');
        }
        const soundcloud = /(^|\.)soundcloud\.com$/.test(parsed.hostname);
        if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/.test(parsed.hostname)) {
            throw new Error('That is a music website, not a direct audio link. Use an HTTPS MP3, M4A, OGG or stream URL.');
        }
        if (soundcloud) {
            for (const key of ['si', 'utm_source', 'utm_medium', 'utm_campaign']) parsed.searchParams.delete(key);
        }
        return {
            url: parsed.href,
            name: String(name || (soundcloud ? 'SoundCloud set' : parsed.hostname)).trim().slice(0, 60) || parsed.hostname,
            kind: soundcloud ? 'soundcloud' : 'direct'
        };
    }

    current() { return this.items[this.selected] || null; }

    _persist(items, selected) {
        try {
            this.storage.setItem(MusicLibrary.KEY, JSON.stringify({ items, selected }));
        } catch (error) {
            throw new Error(`Could not save sets on this device: ${error.message}`);
        }
        this.items = items;
        this.selected = selected;
        if (this.onChange) this.onChange();
    }

    save(url, name) {
        const item = this._item(url, name);
        const items = this.items.slice();
        let index = items.findIndex(saved => saved.url === item.url);
        if (index < 0) {
            if (items.length >= MusicLibrary.MAX_SETS) throw new Error('Eight sets are saved. Remove one before adding another.');
            index = items.length;
            items.push(item);
        } else {
            items[index] = item;
        }
        this._persist(items, index);
        return item;
    }

    select(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.items.length) {
            throw new Error('Choose a saved set first.');
        }
        this._persist(this.items, index);
        return this.current();
    }

    step(delta) {
        if (delta !== -1 && delta !== 1) throw new Error('Choose the previous or next saved set.');
        if (!this.items.length) throw new Error('No saved sets. Use ADD LINKS to save your music.');
        return this.select((this.selected + delta + this.items.length) % this.items.length);
    }

    remove() {
        if (!this.current()) throw new Error('No saved set to remove.');
        const items = this.items.filter((_, index) => index !== this.selected);
        this._persist(items, Math.min(this.selected, Math.max(0, items.length - 1)));
    }

    async play() {
        if (!this.club.guardHostControl('music')) return false;
        const item = this.current();
        if (!item) throw new Error('No saved sets. Add a music link in Music first.');
        if (item.kind === 'soundcloud') await this.club.startSoundCloud(item.url, item.name);
        else await this.club.startAudioStream(item.url, { onDemand: true });
        this.club.nowPlayingLabel = item.name;
        if (this.onChange) this.onChange(item);
        return true;
    }
}

if (typeof window !== 'undefined') window.MusicLibrary = MusicLibrary;
