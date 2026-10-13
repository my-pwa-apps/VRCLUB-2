'use strict';

/**
 * Immersive launch: the Quest app opens the club straight into VR with no 2D page to click through.
 *
 * It is opt-in (`?immersive=1` on the start URL), so the website and the setup-panel candidate are untouched. What the 2D
 * splash and Access dialog normally do is done here, inside the headset:
 *
 *   1. The photosensitivity choice. Until the guest has chosen, Safe Mode is held ON for this session only
 *      (`persist: false`) and a locked WELCOME page asks. The answer is saved like the splash toggle.
 *   2. Access. `VRPayment.autoPrepare()` checks the account and takes the VR lease. A registered, entitled device just
 *      enters. Any other device gets a short FREE PREVIEW, then a veiled pairing screen with a code to enter on a phone
 *      (worker/src/deviceLink.js, link/). The headset polls, and on approval upgrades the session it is already in.
 *
 * Modes: booting -> member | preview -> locked -> member, or `manual` when the normal 2D flow takes over (XR failed, left,
 * another device holds the lease, the service is down). `manual` never blocks anything: desktop mode is free.
 *
 * The veil is the XR camera's layer mask: the world stays on the default layers and only the quick menu (which sits on the
 * extra layer too, see VRClubUI.MENU_LAYER_MASK) is drawn. The headset still tracks, so a locked guest is not blinded.
 */
class ImmersiveLaunch {
    static get PREVIEW_MS() { return 2 * 60 * 1000; }
    static get WORLD_LAYER_MASK() { return 0x0FFFFFFF; }
    static get VEIL_LAYER_MASK() { return 0x10000000; }
    static get RETRY_MS() { return 5000; }

    /** True when the start URL asks for an immersive launch. */
    static requested(search = (typeof window !== 'undefined' && window.location ? window.location.search : '')) {
        try {
            const value = new URLSearchParams(search).get('immersive');
            return value === '1' || value === 'true';
        } catch (_) {
            return false;
        }
    }

    /**
     * @param {object} club the VRClub instance (needs initPromise, _vrEntryReady, vrHelper, scene)
     * @param {object} [options] injectable collaborators, for tests
     */
    constructor(club, options = {}) {
        this.club = club;
        this.payment = options.payment || (typeof window !== 'undefined' ? window.VRPayment : null);
        this.onFirstGesture = options.onFirstGesture || null;
        this.host = options.host || (typeof window !== 'undefined' && window.location ? window.location.host : '');
        this._now = options.now || (() => performance.now());
        this._setTimeout = options.setTimeout || ((fn, ms) => setTimeout(fn, ms));
        this._clearTimeout = options.clearTimeout || (id => clearTimeout(id));
        this._sleep = options.sleep || (ms => new Promise(resolve => this._setTimeout(resolve, ms)));
        this.mode = 'booting';
        this.link = null;
        this.linkError = '';
        this.approved = false;
        this.veiled = false;
        this._disposed = false;
        this._linkToken = 0;
        this._loopActive = false;
        this._previewTimer = null;
        this._xrObserver = null;
        this._gestureObserver = null;
        this._mutedBefore = null;

        // A guest who never chose must not meet strobes before they can. The hold is not their saved choice.
        let chosen = true;
        try { chosen = localStorage.getItem('vrclub.safeMode') !== null; } catch (_) { /* storage blocked: ask, never assume */ chosen = false; }
        this.welcomePending = !chosen;
        if (this.welcomePending) club.setPhotosensitiveSafeMode(true, { persist: false });
    }

    /** A headset waiting to be paired: in its free preview or locked behind the pairing code. */
    needsAccess() { return this.mode === 'preview' || this.mode === 'locked'; }

    /** The first-run choice and a locked pairing code cannot be dismissed from the menu. */
    menuLocked() { return this.welcomePending || this.mode === 'locked'; }

    /** Words for the two pages this launch adds to the VR menu (see _showVRQuickMenuPage). */
    pageText(page) {
        if (page === 'welcome') {
            return { title: 'WELCOME', subtitle: 'THE LIGHTS FLASH. SENSITIVE? CHOOSE SAFE MODE.' };
        }
        const code = this.link ? `${this.link.code.slice(0, 4)} ${this.link.code.slice(4)}`.trim() : '';
        if (this.approved) {
            return { title: 'LINKED', subtitle: this.linkError || 'STARTING YOUR VR SESSION' };
        }
        return {
            title: code || (this.linkError ? 'NO CODE YET' : 'GETTING A CODE'),
            subtitle: this.linkError || `ENTER IT AT ${String(this.host || 'THIS SITE').toUpperCase()}/LINK ON YOUR PHONE`
        };
    }

    /** Resolves when the launch has decided what the guest sees: never rejects. */
    async start() {
        const club = this.club;
        try {
            await club.initPromise;
            if (this._disposed) return;
            const canEnter = await club._vrEntryReady;
            const base = club.vrHelper && club.vrHelper.baseExperience;
            if (this._disposed || !canEnter || !base || !this.payment) return this._manual();
            this._watchXR(base);

            const prepared = await this.payment.autoPrepare();
            if (this._disposed) return;
            if (prepared.state === 'ready') {
                this.mode = 'member';
            } else if (prepared.state === 'needs-access') {
                this.mode = 'preview';
                this.payment.setPreview(true);
            } else {
                club.showErrorMessage(prepared.message || 'VR access could not be prepared. Press Enter VR to try again.');
                return this._manual();
            }
            try {
                await base.enterXRAsync('immersive-vr', 'local-floor');
            } catch (error) {
                // A browser may insist on a click for the session: the normal Enter VR button still works.
                club.showErrorMessage('Press Enter VR to start.');
                this._manual();
            }
        } catch (error) {
            this._manual();
        }
    }

    /** Hand over to the regular 2D flow: nothing here may keep the guest out of the club. */
    _manual() {
        if (this.mode === 'manual') return;
        this.mode = 'manual';
        this._clearTimeout(this._previewTimer);
        this._previewTimer = null;
        this._linkToken++;
        this.link = null;
        this.payment?.setPreview?.(false);
        this.setVeil(false);
        // The guarded toggle refuses to close a locked menu; this launch no longer owns it.
        const menu = this.club._vrQuickMenuRoot;
        if (menu && menu.isEnabled()) menu.setEnabled(false);
    }

    _watchXR(base) {
        this._xrObserver = base.onStateChangedObservable.add(state => {
            if (this._disposed) return;
            if (state === BABYLON.WebXRState.IN_XR) this._enteredXR();
            else if (state === BABYLON.WebXRState.NOT_IN_XR) this._manual();
        });
    }

    _enteredXR() {
        this._armGesture();
        if (this.welcomePending) {
            this._showPage('welcome');
            return;
        }
        this._afterWelcome();
    }

    _afterWelcome() {
        if (this.mode !== 'preview') return;
        this.club.showErrorMessage('Free preview. Open the menu and choose ACCESS to link your account.');
        this._previewTimer = this._setTimeout(() => this._lock(), ImmersiveLaunch.PREVIEW_MS);
        this._startLinkLoop();
    }

    handleMenuAction(action) {
        if (this._disposed) return;
        if (action === 'welcomeSafe' || action === 'welcomeFull') {
            if (!this.welcomePending) return;
            this.club.setPhotosensitiveSafeMode(action === 'welcomeSafe');
            this.welcomePending = false;
            this.club.toggleVRQuickMenu(false);
            this._afterWelcome();
        } else if (action === 'accessNewCode') {
            if (this.approved) return;
            this.link = null;
            this.linkError = '';
            this._refreshAccessPage();
            this._startLinkLoop(true);
        } else if (action === 'accessExit') {
            void this.exit();
        }
    }

    /** Leaves VR and closes the app window (a Quest app has no other way out of a locked pairing screen). */
    async exit() {
        const base = this.club.vrHelper && this.club.vrHelper.baseExperience;
        try { if (base) await base.exitXRAsync(); } catch (_) { /* leaving anyway */ }
        try { window.close(); } catch (_) { /* a tab that was not opened by a script keeps its window */ }
    }

    _lock() {
        this._previewTimer = null;
        if (this.mode !== 'preview' || this._disposed) return;
        this.mode = 'locked';
        this.setVeil(true);
        this._showPage('access');
        this._startLinkLoop();
    }

    _showPage(page) {
        const club = this.club;
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage(page);
    }

    _refreshAccessPage() {
        const club = this.club;
        if (club._vrQuickMenuRoot && club._vrQuickMenuRoot.isEnabled() && club._vrQuickMenuPage === 'access') {
            club._showVRQuickMenuPage('access');
        }
    }

    /** One loop per pairing: ask for a code, poll it, replace it when it expires, upgrade the session once approved. */
    async _startLinkLoop(force = false) {
        if (this._loopActive && !force) return;
        const token = ++this._linkToken;
        this._loopActive = true;
        const alive = () => token === this._linkToken && !this._disposed && this.needsAccess();
        try {
            while (alive()) {
                if (this.approved) {
                    if (await this._upgrade() || !alive()) break;
                    await this._sleep(ImmersiveLaunch.RETRY_MS);
                    continue;
                }
                if (!this.link) {
                    try {
                        this.link = await this.payment.linkStart();
                        this._linkExpiresAt = this._now() + this.link.expiresInMs;
                        this.linkError = '';
                    } catch (error) {
                        this.linkError = 'CANNOT REACH THE SERVER. RETRYING.';
                    }
                    if (!alive()) break;
                    this._refreshAccessPage();
                    if (!this.link) {
                        await this._sleep(ImmersiveLaunch.RETRY_MS);
                        continue;
                    }
                }
                await this._sleep(Math.max(1000, this.link.intervalMs || 3000));
                if (!alive()) break;
                let result;
                try {
                    result = await this.payment.linkPoll(this.link);
                    if (this.linkError) { this.linkError = ''; this._refreshAccessPage(); }
                } catch (error) {
                    this.linkError = 'CANNOT REACH THE SERVER. RETRYING.';
                    this._refreshAccessPage();
                    await this._sleep(ImmersiveLaunch.RETRY_MS);
                    continue;
                }
                if (!alive()) break;
                if (result === 'approved') {
                    this.approved = true;
                    this._refreshAccessPage();
                } else if (result === 'expired' || this._now() >= this._linkExpiresAt) {
                    this.link = null;
                    this._refreshAccessPage();
                }
            }
        } finally {
            if (token === this._linkToken) this._loopActive = false;
        }
    }

    /** Takes the VR lease for the session that is already running. Resolves true when this headset is now a member. */
    async _upgrade() {
        let ok = false;
        try {
            ok = await this.payment.upgradeToMember();
            if (!ok) this.linkError = 'LINKED, BUT VR COULD NOT START. RETRYING.';
        } catch (error) {
            this.linkError = error && error.body && error.body.error === 'vr_in_use'
                ? 'LINKED, BUT VR IS OPEN ON ANOTHER DEVICE. CLOSE IT.'
                : 'LINKED, BUT VR COULD NOT START. RETRYING.';
        }
        if (this._disposed) return false;
        if (!ok) {
            this._refreshAccessPage();
            return false;
        }
        this.mode = 'member';
        this.approved = false;
        this.link = null;
        this.linkError = '';
        this._clearTimeout(this._previewTimer);
        this._previewTimer = null;
        this.setVeil(false);
        this.club.toggleVRQuickMenu(false);
        this.club.showErrorMessage('Linked. Welcome to NOCTURNE.');
        return true;
    }

    /** Hides the world and keeps only the menu, silencing the music while the veil is up. */
    setVeil(on) {
        const club = this.club;
        const cameras = [club.vrHelper && club.vrHelper.baseExperience && club.vrHelper.baseExperience.camera,
            club.scene && club.scene.activeCamera].filter(Boolean);
        for (const camera of cameras) {
            camera.layerMask = on ? ImmersiveLaunch.VEIL_LAYER_MASK : ImmersiveLaunch.WORLD_LAYER_MASK;
        }
        const audio = club.audioElement;
        if (audio) {
            if (on && this._mutedBefore === null) {
                this._mutedBefore = audio.muted;
                audio.muted = true;
            } else if (!on && this._mutedBefore !== null) {
                audio.muted = this._mutedBefore;
                this._mutedBefore = null;
            }
        }
        this.veiled = !!on;
    }

    /** The first controller press is the guest's gesture: resume audio and the saved set, which autoplay would refuse. */
    _armGesture() {
        const scene = this.club.scene;
        if (this._gestureObserver || !scene || !scene.onPointerObservable) return;
        this._gestureObserver = scene.onPointerObservable.add(info => {
            if (info.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
            scene.onPointerObservable.remove(this._gestureObserver);
            this._gestureObserver = null;
            try {
                this.club._ensureAudioContext();
                const context = this.club.audioContext;
                if (context && context.state === 'suspended') void context.resume();
                const audio = this.club.audioElement;
                if (this.onFirstGesture && !(audio && !audio.paused)) this.onFirstGesture();
            } catch (_) { /* music is atmosphere, never a launch dependency */ }
        });
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._linkToken++;
        this._clearTimeout(this._previewTimer);
        this.setVeil(false);
        const base = this.club.vrHelper && this.club.vrHelper.baseExperience;
        if (this._xrObserver && base) base.onStateChangedObservable.remove(this._xrObserver);
        if (this._gestureObserver && this.club.scene) this.club.scene.onPointerObservable.remove(this._gestureObserver);
        this._xrObserver = null;
        this._gestureObserver = null;
    }
}

window.ImmersiveLaunch = ImmersiveLaunch;
