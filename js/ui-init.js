'use strict';
/**
 * UI Initialization Script
 * Handles splash screen, VJ controls, and audio menu
 * Optimized for Quest 3S browser
 */

// Debug mode - set false for production
const UI_DEBUG = false;
const uiLog = {
    info: (...args) => UI_DEBUG && console.log('[UI]', ...args),
    warn: (...args) => console.warn('[UI]', ...args),
    error: (...args) => console.error('[UI]', ...args)
};

function ensureMusicLibrary(club) {
    if (!club.musicLibrary) club.musicLibrary = new window.MusicLibrary(club);
    return club.musicLibrary;
}

/** Now-playing text for the audio menu, set when the entry music starts (the menu may not exist yet). */
let entryNowPlaying = '';

/**
 * Every UI timing constant in one place. These were previously six different
 * hard-coded setTimeout values with no rationale, one of which (the 1500 ms label
 * revert) raced the 2000 ms state poller.
 */
const UI_TIMING = Object.freeze({
    buttonFlashMs: 400,
    macroFlashMs: 250,
    statePollMs: 2000,
    bpmPollMs: 1000,
    statusMs: 3000,
    splashFadeMs: 500
});

/**
 * The only DOM-driven properties the VJ panel is allowed to toggle on the club
 * instance. `vrClubInstance[button.dataset.control] = !...` was previously an
 * unrestricted dynamic property write keyed by a DOM attribute - `__proto__` or
 * `constructor` would have written straight through to Object.prototype.
 */
const TOGGLE_CONTROLS = Object.freeze(new Set([
    'lightsActive', 'lasersActive', 'ledWallActive', 'ledMonochrome',
    'strobesActive', 'mirrorBallActive', 'laserSheetActive',
    'smokeActive', 'spotStrobeActive'
]));

// One list of names for every surface (this panel, the VR menu and the desk at the DJ table).
const SPOT_MODE_NAMES = VRClubUI.SPOT_MODE_NAMES;
const SPOT_PATTERN_NAMES = VRClubUI.SPOT_PATTERN_NAMES;

/** Shared teardown list. Module-scoped rather than on `window` so an injected
 *  element with a matching id cannot clobber it via named window access. */
const uiTeardowns = [];

/** Keep a `pressed` toggle's class and its ARIA state in lockstep. */
function setToggleState(button, on) {
    if (!button) return;
    button.classList.toggle('active', !!on);
    if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(!!on));
}

// =============================================================================
// SPLASH SCREEN PARTICLES
// =============================================================================

// Create floating particles on splash screen
(function initSplashParticles() {
    const splashBg = document.getElementById('splashScreen');
    if (!splashBg) return;
    
    // Reduced particle count for mobile/VR performance
    const particleCount = 15;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'splash-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (8 + Math.random() * 4) + 's';
        if (Math.random() > 0.5) {
            particle.style.background = '#00ffff';
            particle.style.boxShadow = '0 0 8px #00ffff';
        }
        splashBg.appendChild(particle);
    }
})();

// =============================================================================
// SETTINGS PANEL
// =============================================================================
// Removed. The panel's only content was the Enter VR button, which is now a
// top-level control (see initVRButton below). Deleting it also removed the third
// near-identical open/close/Escape/outside-click implementation.

// =============================================================================
// SPLASH SCREEN HANDLER
// =============================================================================

const splashScreen = document.getElementById('splashScreen');
const enterClubBtn = document.getElementById('enterClubBtn');
const splashLoading = document.getElementById('splashLoading');
const canvas = document.getElementById('canvas');
const mainExperience = document.getElementById('mainExperience');

// Photosensitive Safe Mode, offered BEFORE the scene renders.
//
// Strobes are on by default, so a control that only exists inside a
// panel the user has to open after entering is not a mitigation - the exposure has
// already happened. This mirrors VRClubCore's own resolution: Safe Mode is on only when
// the guest has explicitly chosen it; it is never switched on automatically.
(function initSplashSafeMode() {
    const btn = document.getElementById('splashSafeModeBtn');
    const state = document.getElementById('splashSafeModeState');
    if (!btn || !state) return;

    const read = () => (window.VRClubCore && typeof VRClubCore.resolvePhotosensitiveSafeMode === 'function')
        ? VRClubCore.resolvePhotosensitiveSafeMode()
        : false;

    const render = (on) => {
        btn.setAttribute('aria-pressed', String(on));
        state.textContent = on ? 'ON' : 'OFF';
    };

    render(read());

    btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        try { localStorage.setItem('vrclub.safeMode', next ? '1' : '0'); } catch (_) { /* ignore */ }
        // If the club already exists (RETRY path), apply immediately.
        if (window.vrClub && typeof window.vrClub.setPhotosensitiveSafeMode === 'function') {
            window.vrClub.setPhotosensitiveSafeMode(next);
        }
        render(next);
    });
})();

// VR Comfort is a press-to-enable toggle, like Safe Mode above it: a headset guest reads one line
// and presses it once. The club mirrors the state back here through setVRComfortMode().
(function initSplashVRComfort() {
    const btn = document.getElementById('splashVRComfortBtn');
    const state = document.getElementById('splashVRComfortState');
    if (!btn || !state) return;

    const render = (on) => {
        btn.setAttribute('aria-pressed', String(on));
        state.textContent = on ? 'ON' : 'OFF';
    };
    render(VRClubCore.resolveVRComfortMode());

    btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        try { localStorage.setItem('vrclub.vrComfort', next ? '1' : '0'); } catch (_) {}
        // If the club already exists (RETRY path), apply immediately.
        if (window.vrClub) window.vrClub.setVRComfortMode(next);
        render(next);
    });
})();

function announceNowPlaying(label) {
    entryNowPlaying = `\u25B6 ${label}`;
    const nowPlaying = document.getElementById('audioNowPlaying');
    if (nowPlaying) nowPlaying.textContent = entryNowPlaying;
    const playLabel = document.getElementById('playStreamBtnLabel');
    if (playLabel) playLabel.textContent = 'Pause';
    const playBtn = document.getElementById('playStreamBtn');
    if (playBtn) playBtn.setAttribute('aria-label', 'Pause audio');
}

/** Resume only an explicitly saved set, with the ENTER click's autoplay permission. */
function startEntryMusic(club, pointAtAudioMenu) {
    try { club._ensureAudioContext(); } catch (err) { uiLog.warn(`Audio context unavailable: ${err.message}`); }
    const library = ensureMusicLibrary(club);
    const item = library.current();
    const nowPlaying = document.getElementById('audioNowPlaying');
    if (!item) {
        entryNowPlaying = 'No music included. Open Music to add your own set.';
        if (nowPlaying) nowPlaying.textContent = entryNowPlaying;
        pointAtAudioMenu();
        return;
    }
    entryNowPlaying = `Starting ${item.name}\u2026`;
    if (nowPlaying) nowPlaying.textContent = entryNowPlaying;
    const retryOnGesture = () => {
        document.removeEventListener('pointerdown', retryOnGesture);
        document.removeEventListener('keydown', retryOnGesture);
        const audio = club.audioElement;
        if ((audio && !audio.paused) || club._audioStreamUrl !== item.url) return;
        library.play().catch(error => club.showErrorMessage(`Could not play your set: ${error.message}`));
    };
    library.play().then(() => announceNowPlaying(item.name)).catch((err) => {
        // Music is atmosphere, not a startup dependency - but failing silently leaves the
        // guest in a club that looks alive and makes no sound, with no indication that the
        // fix is behind the audio button.
        uiLog.warn(`Saved music unavailable: ${err.message}`);
        entryNowPlaying = 'No audio yet';
        if (nowPlaying) nowPlaying.textContent = entryNowPlaying;
        pointAtAudioMenu();
        const canRetry = err && err.name === 'NotAllowedError';
        if (canRetry) {
            document.addEventListener('pointerdown', retryOnGesture);
            document.addEventListener('keydown', retryOnGesture);
            uiTeardowns.push(() => {
                document.removeEventListener('pointerdown', retryOnGesture);
                document.removeEventListener('keydown', retryOnGesture);
            });
        } else if (club.showErrorMessage) {
            club.showErrorMessage('Your set could not play. Open Music to try another link or a local file.');
        }
    });
}

// Enter Club Button
if (enterClubBtn) {
    enterClubBtn.addEventListener('click', function() {
        // A previous init failed and left a dead instance behind. Reloading is the only
        // honest "retry": re-running the menu initialisers against the same DOM
        // double-binds every listener, and the rejected initPromise can never resolve.
        if (window.vrClub) {
            window.location.reload();
            return;
        }

        // Babylon needs a measurable canvas when the engine is constructed. The
        // splash remains above it until init resolves.
        canvas.classList.remove('hidden');
        if (mainExperience) mainExperience.removeAttribute('inert');

        // Create and start audio directly inside the Enter click. Deferring either
        // operation loses the browser's transient user activation and audible
        // playback is then blocked by autoplay policy.
        window.vrClub = new VRClub();
        ensureMusicLibrary(window.vrClub);

        const pointAtAudioMenu = () => {
            const audioToggle = document.getElementById('audioToggle');
            if (audioToggle) {
                audioToggle.classList.add('needs-attention');
                setTimeout(() => audioToggle.classList.remove('needs-attention'), 6000);
            }
        };

        // Only explicitly saved user music may resume. Keep this in the click for autoplay permission.
        startEntryMusic(window.vrClub, pointAtAudioMenu);
        
        // Show loading state
        enterClubBtn.style.display = 'none';
        splashLoading.classList.add('visible');
        const progressBar = document.getElementById('splashProgressBar');
        const progressRoot = progressBar && progressBar.parentElement;
        const progressStage = document.getElementById('splashLoadingStage');
        if (progressBar) progressBar.style.width = '0%';
        if (progressRoot) progressRoot.setAttribute('aria-valuenow', '0');
        if (progressStage) progressStage.textContent = 'Preparing renderer...';
        
        // Initialize UI menus now that VRClub exists (it is constructed synchronously
        // above, so there is nothing to wait for).
        initMenus();

        // Hide the splash only when init() has actually RESOLVED.
        //
        // This used to be a flat `setTimeout(..., 1000)`, which was wrong in both
        // directions:
        //  - On success the splash vanished after ~1.5 s while init() was still
        //    downloading textures and models, so the user stared at a black canvas
        //    with no indication that anything was happening.
        //  - On failure it fought _handleFatalInitError(), which re-shows the splash
        //    with a RETRY button - the timer would hide the retry UI again.
        hideSplashWhenReady();
    });
}

/**
 * Keep "Loading club experience…" on screen until the scene is genuinely ready.
 * Falls back to hiding after a hard cap so a wedged init can never trap the user
 * behind an opaque overlay with no escape.
 */
function hideSplashWhenReady() {
    const HARD_CAP_MS = 120000; // generous: cold cache on a Quest over Wi-Fi is slow
    let done = false;

    const hide = () => {
        if (done) return;
        done = true;
        splashLoading.classList.remove('visible');
        splashScreen.classList.add('hidden');
        setTimeout(() => { splashScreen.style.display = 'none'; }, UI_TIMING.splashFadeMs);
        // The splash is a modal overlay; until it is gone the scene's controls must
        // stay out of the tab order or focus walks behind it invisibly.
        if (mainExperience) mainExperience.removeAttribute('inert');
        if (canvas) canvas.focus({ preventScroll: true });
    };

    const capTimer = setTimeout(() => {
        uiLog.warn('Splash hard cap reached before init() resolved \u2014 showing the scene anyway.');
        hide();
    }, HARD_CAP_MS);

    const promise = window.vrClub && window.vrClub.initPromise;
    if (!promise || typeof promise.then !== 'function') {
        // No promise to await (older instance shape) - fail open rather than hang.
        clearTimeout(capTimer);
        setTimeout(hide, 1000);
        return;
    }

    promise.then(() => {
        clearTimeout(capTimer);
        hide();
    }).catch(() => {
        // _handleFatalInitError() has already restored the splash and swapped the
        // button to RETRY. Leave that UI alone and cancel our own hide.
        clearTimeout(capTimer);
        done = true;
    });
}

// =============================================================================
// VJ MENU CONTROLS
// =============================================================================

let vrClubInstance = null;
let menusInitialised = false;
let buttonStateInterval = null;
let bpmInterval = null;
let vjMacros = { drop: null, blackout: null };

/**
 * Wire the VJ and audio panels to the club instance. Guarded against re-entry:
 * running the initialisers twice against the same DOM double-binds every listener,
 * so each toggle would fire twice and cancel itself out.
 */
function initMenus() {
    if (menusInitialised || !window.vrClub) return;
    menusInitialised = true;
    vrClubInstance = window.vrClub;
    initVJMenu();
    initAudioMenu();
    initNetworkMenu();
    initKeyboardShortcuts();
    uiLog.info('VJ/Audio menus initialized');
}

function initVJMenu() {
    const vjToggle = document.getElementById('vjToggle');
    const vjMenu = document.getElementById('vjMenu');
    const vjMinimize = document.getElementById('vjMinimize');
    const vjClose = document.getElementById('vjClose');
    const spotSpeed = document.getElementById('spotSpeed');
    const spotSpeedValue = document.getElementById('spotSpeedValue');
    const vjTitle = document.getElementById('vjMenuTitle');
    
    if (!vjToggle || !vjMenu) return;
    
    const teardowns = uiTeardowns;
    const closeVJMenu = (restoreFocus = true) => {
        vjMenu.classList.add('hidden');
        vjToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) vjToggle.focus();
    };
    const openVJMenu = () => {
        vjMenu.classList.remove('hidden', 'minimized');
        vjToggle.setAttribute('aria-expanded', 'true');
        updateButtonStates();
        if (vjTitle) vjTitle.focus();
    };

    vjToggle.addEventListener('click', () => {
        if (vjMenu.classList.contains('hidden')) openVJMenu();
        else closeVJMenu();
    });
    
    // Minimize/maximize VJ menu.
    // Writes to the inner <span>, never to the button's textContent: the latter
    // destroys the aria-hidden wrapper and exposes a bare "−" glyph to screen readers.
    if (vjMinimize) {
        vjMinimize.addEventListener('click', () => {
            const minimized = vjMenu.classList.toggle('minimized');
            const glyph = vjMinimize.querySelector('span') || vjMinimize;
            glyph.textContent = minimized ? '+' : '\u2212';
            vjMinimize.setAttribute('aria-label', minimized ? 'Expand VJ panel' : 'Minimize VJ panel');
            vjMinimize.setAttribute('aria-expanded', String(!minimized));
        });
    }
    
    // Close VJ menu
    if (vjClose) {
        vjClose.addEventListener('click', () => closeVJMenu());
    }

    const onVJKeyDown = e => {
        if (e.key === 'Escape' && !vjMenu.classList.contains('hidden')) {
            e.preventDefault();
            closeVJMenu();
        }
    };
    document.addEventListener('keydown', onVJKeyDown);
    teardowns.push(() => document.removeEventListener('keydown', onVJKeyDown));
    
    // Handle VJ control buttons
    const vjButtons = document.querySelectorAll('.vj-button[data-control]');
    const goboDisplayName = name => name === 'circle' ? 'OPEN' : String(name || 'circle').toUpperCase();

    // Show the auto-detected graphics tier on the quality button so the label never
    // reads "AUTO" once we actually know what was picked.
    const qualityButton = document.querySelector('.vj-button[data-control="cycleGraphicsQuality"]');
    if (qualityButton && vrClubInstance.graphicsTier) {
        qualityButton.textContent = `QUALITY: ${vrClubInstance.graphicsTier.toUpperCase()}`;
    }

    // Show Director readout: which movement / set-piece is currently playing.
    // Declared as a function so the button handlers below can call it before
    // this point in the file is reached at runtime.
    const showReadout = document.getElementById('showMovementReadout');
    function updateShowReadout() {
        if (!showReadout || !vrClubInstance.showDirector) return;
        const s = vrClubInstance.showDirector;
        if (!s.enabled) { showReadout.textContent = 'OFF'; return; }
        const st = s.getStatus();
        showReadout.textContent = st.setPiece ? `⚡ ${st.setPiece}` : st.movement;
    }
    const showToggleBtn = document.querySelector('.vj-button[data-control="toggleShow"]');
    if (showToggleBtn && vrClubInstance.showDirector) {
        setToggleState(showToggleBtn, vrClubInstance.showDirector.enabled);
    }
    updateShowReadout();

    // Restore every VJ control to a known-good state. Without this the only way back
    // from an exploratory session was a full page reload.
    const resetBtn = document.getElementById('vjResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (typeof vrClubInstance.resetVJControls === 'function') {
                vrClubInstance.resetVJControls();
            }
            const modeBtn = document.querySelector('.vj-button[data-control="cycleSpotMode"]');
            if (modeBtn) modeBtn.textContent = `MODE: ${SPOT_MODE_NAMES[vrClubInstance.spotlightMode]}`;
            const patBtn = document.querySelector('.vj-button[data-control="cyclePattern"]');
            if (patBtn) patBtn.textContent = `AIM PATH: ${SPOT_PATTERN_NAMES[vrClubInstance.spotlightPattern]}`;
            const goboBtn = document.querySelector('.vj-button[data-control="cycleGoboPattern"]');
            if (goboBtn) goboBtn.textContent = `IMAGE: ${goboDisplayName(vrClubInstance.goboPatterns[vrClubInstance.goboPatternIndex])}`;
            updateButtonStates();
            if (vrClubInstance.showErrorMessage) vrClubInstance.showErrorMessage('VJ controls reset to defaults');
        });
    }

    /**
     * Brief press confirmation. The handle is tracked so a teardown mid-flash cannot
     * leave a button stuck in its pressed styling, and so the timers are releasable.
     */
    const pendingFlashes = new Set();
    function flashButton(button, background) {
        if (!button) return;
        button.style.transform = 'scale(1.06)';
        if (background) {
            button.style.background = background;
            button.style.boxShadow = `0 0 18px ${background}`;
        }
        const id = setTimeout(() => {
            pendingFlashes.delete(id);
            button.style.transform = '';
            button.style.background = '';
            button.style.boxShadow = '';
        }, UI_TIMING.buttonFlashMs);
        pendingFlashes.add(id);
    }
    teardowns.push(() => {
        pendingFlashes.forEach(clearTimeout);
        pendingFlashes.clear();
    });

    vjButtons.forEach(button => {
        button.addEventListener('click', () => {
            const control = button.getAttribute('data-control');
            
            if (control === 'changeColor') {
                const color = vrClubInstance.cycleSpotColor();
                flashButton(button, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.8)`);
                
            } else if (control === 'cycleGraphicsQuality') {
                // Cycle render quality. Auto-detection is conservative, so this lets a
                // user on a strong GPU opt into ULTRA (SSR + PCSS + supersampling) or
                // drop to BALANCED if their frame rate is suffering.
                const tiers = ['balanced', 'high', 'ultra'];
                const next = tiers[(tiers.indexOf(vrClubInstance.graphicsTier) + 1) % tiers.length];
                vrClubInstance.setGraphicsTier(next);
                button.textContent = `QUALITY: ${next.toUpperCase()}`;

            } else if (control === 'toggleShow') {
                // Hand the rig between the composed show and the legacy auto-cycler.
                const show = vrClubInstance.showDirector;
                if (show) {
                    const on = show.setEnabled(!show.enabled);
                    button.textContent = `SHOW: ${on ? 'ON' : 'OFF'}`;
                    setToggleState(button, on);
                    updateShowReadout();
                }

            } else if (control === 'nextMovement') {
                const show = vrClubInstance.showDirector;
                if (show && show.isDriving()) {
                    show.nextMovement();
                    updateShowReadout();
                }

            } else if (control === 'showCountdown') {
                // Fire THE COUNTDOWN: 4 bars of escalation into one beat of black.
                const show = vrClubInstance.showDirector;
                if (show && show.isDriving()) {
                    show.triggerShowDrop();
                    updateShowReadout();
                }

            } else if (control === 'changeMirrorBallColor') {
                const color = vrClubInstance.cycleMirrorBallColor();
                flashButton(button, `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.8)`);
                
            } else if (control === 'cycleSpotMode') {
                // Cycle spotlight mode. The label stays on the new value: a control
                // surface that reverts to a generic word hides its own state, forcing
                // the user to change the state again just to read it.
                vrClubInstance.spotlightMode = (vrClubInstance.spotlightMode + 1) % SPOT_MODE_NAMES.length;
                button.textContent = `MODE: ${SPOT_MODE_NAMES[vrClubInstance.spotlightMode]}`;
                flashButton(button);
                
            } else if (control === 'cyclePattern') {
                vrClubInstance.spotlightPattern = (vrClubInstance.spotlightPattern + 1) % SPOT_PATTERN_NAMES.length;
                button.textContent = `AIM PATH: ${SPOT_PATTERN_NAMES[vrClubInstance.spotlightPattern]}`;
                flashButton(button);
                
            } else if (control === 'goboActive') {
                const isActive = vrClubInstance.toggleGobo ? vrClubInstance.toggleGobo() : false;
                setToggleState(button, isActive);
                flashButton(button);
                
            } else if (control === 'cycleGoboPattern') {
                const patternName = vrClubInstance.nextGoboPattern
                    ? vrClubInstance.nextGoboPattern()
                    : 'circle';
                button.textContent = `IMAGE: ${goboDisplayName(patternName)}`;
                flashButton(button);
                
            } else if (control === 'reverseGoboSpin') {
                // Reverse gobo rotation direction - use VRClub properties directly
                const newSpeed = -(vrClubInstance.goboRotationSpeed || 1.0);
                vrClubInstance.setGoboRotationSpeed(newSpeed);
                
                const goboSpeedSlider = document.getElementById('goboSpeed');
                const goboSpeedValue = document.getElementById('goboSpeedValue');
                if (goboSpeedSlider) {
                    goboSpeedSlider.value = newSpeed;
                    goboSpeedSlider.setAttribute('aria-valuetext', `${newSpeed.toFixed(1)}x`);
                }
                if (goboSpeedValue) goboSpeedValue.textContent = `${newSpeed.toFixed(1)}x`;
                flashButton(button);
                
            } else if (TOGGLE_CONTROLS.has(control)) {
                // Allow-listed boolean toggle. Anything not in the set is ignored rather
                // than written straight onto the instance by name.
                vrClubInstance[control] = !vrClubInstance[control];

                // Same exclusivity rule the in-world desk applies, and the same
                // explanation - silently discarding three of the user's choices with
                // no feedback is what made this feel broken.
                const note = vrClubInstance.applyFixtureExclusivity(control);
                if (note && vrClubInstance.showErrorMessage) vrClubInstance.showErrorMessage(note);
                updateButtonStates();
                
                // Activate VJ manual mode for toggle controls
                vrClubInstance.lastVJInteraction = performance.now() / 1000;
                vrClubInstance.vjManualMode = true;

            } else {
                uiLog.warn(`Unhandled VJ control: ${control}`);
            }
        });
    });
    
    // Handle speed slider - controls ALL light types simultaneously
    if (spotSpeed && spotSpeedValue) {
        spotSpeed.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            // Update ALL speed multipliers for unified control
            vrClubInstance.spotlightSpeed = value;
            vrClubInstance.laserSpeed = value;
            vrClubInstance.mirrorBallSpeed = value;
            vrClubInstance.ledWallSpeed = value;
            vrClubInstance.strobeSpeed = value;
            const text = `${value.toFixed(1)}x`;
            spotSpeedValue.textContent = text;
            // The visible label is a sibling <div>; without aria-valuetext a screen
            // reader announces the bare number "1" with no unit.
            spotSpeed.setAttribute('aria-valuetext', text);
        });
    }
    
    // Handle gobo speed slider - use VRClub properties directly
    const goboSpeed = document.getElementById('goboSpeed');
    const goboSpeedValue = document.getElementById('goboSpeedValue');
    if (goboSpeed && goboSpeedValue) {
        goboSpeed.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            vrClubInstance.setGoboRotationSpeed(value);
            const text = `${value.toFixed(1)}x`;
            goboSpeedValue.textContent = text;
            goboSpeed.setAttribute('aria-valuetext', text);
        });
    }

    // === VJ DIRECTOR: Live Macros (DROP / BLACKOUT / LOCK / TAP / Master / BPM) ===
    const vjDir = () => vrClubInstance && vrClubInstance.vjDirector;
    const dropBtn = document.getElementById('vjDropBtn');
    const blackoutBtn = document.getElementById('vjBlackoutBtn');
    const lockBtn = document.getElementById('vjLockBtn');
    const tapBtn = document.getElementById('vjTapBtn');
    const masterSlider = document.getElementById('vjMasterSlider');
    const masterValue = document.getElementById('vjMasterValue');
    const bpmReadout = document.getElementById('vjBpmReadout');

    const flashBtn = (btn) => {
        if (!btn) return;
        btn.classList.add('active');
        const id = setTimeout(() => {
            pendingFlashes.delete(id);
            btn.classList.remove('active');
        }, UI_TIMING.macroFlashMs);
        pendingFlashes.add(id);
    };

    // Exposed so the keyboard shortcuts can drive the same macros.
    vjMacros = { drop: null, blackout: null };

    if (dropBtn) {
        vjMacros.drop = () => {
            const d = vjDir();
            if (d) { d.triggerDrop(); flashBtn(dropBtn); }
        };
        dropBtn.addEventListener('click', vjMacros.drop);
    }
    if (blackoutBtn) {
        vjMacros.blackout = () => {
            const d = vjDir();
            if (d) { d.blackout(800); flashBtn(blackoutBtn); }
        };
        blackoutBtn.addEventListener('click', vjMacros.blackout);
    }
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) { d.lockToCenter(4000); flashBtn(lockBtn); }
        });
    }
    if (tapBtn) {
        tapBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) {
                const newBpm = d.tapTempo();
                flashBtn(tapBtn);
                if (newBpm && bpmReadout) bpmReadout.textContent = newBpm.toFixed(0);
            }
        });
    }
    if (masterSlider) {
        masterSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            const d = vjDir();
            if (d) d.setMasterIntensity(v);
            const text = `${Math.round(v * 100)}%`;
            if (masterValue) masterValue.textContent = text;
            masterSlider.setAttribute('aria-valuetext', text);
        });
    }
    // Refresh BPM readout from director's auto-detection
    if (bpmReadout) {
        clearInterval(bpmInterval);
        bpmInterval = setInterval(() => {
            if (document.hidden) return;
            const d = vjDir();
            if (d) bpmReadout.textContent = d.bpm.toFixed(0);
            updateShowReadout();
        }, UI_TIMING.bpmPollMs);
    }

    // === ACCESSIBILITY: Photosensitive Safe Mode + Bass Haptics ===
    const safeModeBtn = document.getElementById('vjSafeModeBtn');
    const bassHapticsBtn = document.getElementById('vjBassHapticsBtn');
    const vrComfortBtn = document.getElementById('vjVRComfortBtn');
    if (vrComfortBtn) {
        setToggleState(vrComfortBtn, vrClubInstance.vrComfortMode);
        vrComfortBtn.addEventListener('click', () => {
            vrClubInstance.setVRComfortMode(!vrClubInstance.vrComfortMode);
        });
    }
    const splashSafeState = document.getElementById('splashSafeModeState');
    const splashSafeBtn = document.getElementById('splashSafeModeBtn');
    if (safeModeBtn) {
        setToggleState(safeModeBtn, vrClubInstance.photosensitiveSafeMode);
        safeModeBtn.addEventListener('click', () => {
            const next = !vrClubInstance.photosensitiveSafeMode;
            vrClubInstance.setPhotosensitiveSafeMode(next);
            setToggleState(safeModeBtn, next);
            // Keep the splash control in agreement in case the user reopens it.
            if (splashSafeBtn) splashSafeBtn.setAttribute('aria-pressed', String(next));
            if (splashSafeState) splashSafeState.textContent = next ? 'ON' : 'OFF';
        });
    }
    if (bassHapticsBtn) {
        setToggleState(bassHapticsBtn, vrClubInstance.bassHapticsEnabled);
        bassHapticsBtn.addEventListener('click', () => {
            const next = !vrClubInstance.bassHapticsEnabled;
            vrClubInstance.setBassHapticsEnabled(next);
            setToggleState(bassHapticsBtn, next);
        });
    }

    // === WHO IS IN THE CLUB: dancers, bystanders, the DJ ===
    // Every action lives on VRClub (setPeopleVisible / togglePeopleVisible); this surface only presses and renders,
    // exactly like the VR quick menu's COMFORT page.
    const peopleButtons = [...document.querySelectorAll('.vj-button[data-people]')];
    function renderPeopleButtons() {
        for (const button of peopleButtons) {
            const category = button.getAttribute('data-people');
            const names = category === 'all' ? ['dancers', 'bystanders', 'dj'] : [category];
            setToggleState(button, names.every(name => vrClubInstance.isPeopleVisible(name)));
        }
    }
    for (const button of peopleButtons) {
        button.addEventListener('click', () => {
            const category = button.getAttribute('data-people');
            const here = vrClubInstance.togglePeopleVisible(category);
            renderPeopleButtons();
            flashButton(button);
            if (vrClubInstance.showErrorMessage) {
                const who = category === 'all' ? 'Everyone' : button.textContent.trim().toLowerCase();
                const label = who.charAt(0).toUpperCase() + who.slice(1);
                vrClubInstance.showErrorMessage(here ? `${label}: back in the club` : `${label}: sent home`);
            }
        });
    }
    renderPeopleButtons();

    // Update button states periodically
    function updateButtonStates() {
        if (!vrClubInstance || vjMenu.classList.contains('hidden')) return;
        renderPeopleButtons();
        
        vjButtons.forEach(button => {
            const control = button.getAttribute('data-control');
            if (!control) return;
            // Read the state from wherever it actually lives. The previous substring
            // test (`!control.includes('change'|'cycle'|'reverse')`) let `toggleShow`
            // fall into the generic branch and read `vrClubInstance.toggleShow`, which
            // is undefined - so the poller stripped .active off the SHOW button every
            // two seconds while its own label still read "SHOW: ON".
            if (control === 'goboActive') {
                setToggleState(button, vrClubInstance.goboEnabled);
            } else if (control === 'toggleShow') {
                setToggleState(button, !!(vrClubInstance.showDirector && vrClubInstance.showDirector.enabled));
            } else if (TOGGLE_CONTROLS.has(control)) {
                setToggleState(button, vrClubInstance[control]);
            }
            // Momentary actions (changeColor, cycle*, nextMovement, showCountdown,
            // reverseGoboSpin) carry no persistent state and are deliberately skipped.
        });
        
        // Update speed slider
        if (spotSpeed && spotSpeedValue) {
            const text = `${vrClubInstance.spotlightSpeed.toFixed(1)}x`;
            spotSpeed.value = vrClubInstance.spotlightSpeed;
            spotSpeedValue.textContent = text;
            spotSpeed.setAttribute('aria-valuetext', text);
        }
        
        // Update gobo speed slider - use VRClub properties directly
        if (goboSpeed && goboSpeedValue) {
            const speed = vrClubInstance.goboRotationSpeed || 1.0;
            const text = `${speed.toFixed(1)}x`;
            goboSpeed.value = speed;
            goboSpeedValue.textContent = text;
            goboSpeed.setAttribute('aria-valuetext', text);
        }
    }
    
    // Update button states periodically (low frequency: VR frame budget).
    // The interval and the XR observers are all registered with the shared teardown
    // list so they can actually be released - previously they ran forever and kept
    // the whole VRClub instance reachable.
    clearInterval(buttonStateInterval);
    buttonStateInterval = setInterval(() => {
        if (document.hidden) return; // don't poll a backgrounded tab
        updateButtonStates();
    }, UI_TIMING.statePollMs);

    teardowns.push(() => {
        clearInterval(buttonStateInterval);
        buttonStateInterval = null;
        clearInterval(bpmInterval);
        bpmInterval = null;
    });
    
    // Hide VJ menu in VR mode (wait for scene to be ready)
    if (vrClubInstance && vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        const scene = vrClubInstance.scene;
        const onInit = scene.onXRSessionInit.add(() => {
            closeVJMenu(false);
            vjToggle.style.display = 'none';
        });
        
        const onEnded = scene.onXRSessionEnded.add(() => {
            vjToggle.style.display = ''; // back to the stylesheet's layout (icon over word)
        });

        teardowns.push(() => {
            scene.onXRSessionInit.remove(onInit);
            scene.onXRSessionEnded.remove(onEnded);
        });
    }
    
    uiLog.info('VJ desktop menu initialized');
}

/**
 * Release every timer and observer registered by the UI layer.
 * Called from VRClub.dispose() and on pagehide.
 */
function teardownVJUI() {
    for (const fn of uiTeardowns.splice(0)) {
        try { fn(); } catch (err) { uiLog.warn('VJ UI teardown step failed:', err); }
    }
}
window.teardownVJUI = teardownVJUI;
window.addEventListener('pagehide', teardownVJUI);

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================

/**
 * Global shortcuts for the actions a user actually wants mid-set. Deliberately
 * unmodified single keys, but never while a text field has focus and never when a
 * modifier is held (so Ctrl+B, Cmd+1 etc. reach the browser unchanged).
 */
function initKeyboardShortcuts() {
    /** A field you type into: every key belongs to it. */
    const isTextTarget = (target) => {
        if (!target) return false;
        if (target.isContentEditable) return true;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
        return typeof target.closest === 'function' && !!target.closest('[contenteditable="true"]');
    };
    /** A button or link: it only uses Space and Enter, so a letter shortcut still works while one has focus. */
    const isActivatable = (target) => {
        if (!target) return false;
        if (/^(BUTTON|SUMMARY)$/.test(target.tagName)) return true;
        if (target.tagName === 'A' && target.href) return true;
        return typeof target.closest === 'function' && !!target.closest('[role="button"], [role="link"]');
    };
    const onKey = (e) => {
        const t = e.target;
        if (e.defaultPrevented || isTextTarget(t)) return;
        // Closing a panel leaves focus on its button; M and T must still work then. Space and Enter stay the button's.
        if (isActivatable(t) && (e.key === ' ' || e.key === 'Enter')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const club = vrClubInstance;
        if (!club) return;

        switch (e.key) {
            case ' ': {
                const el = club.audioElement;
                if (!el) return;
                e.preventDefault();
                if (!club.guardHostControl('music')) break;
                if (el.paused) el.play().catch(() => {}); else el.pause();
                break;
            }
            case 'b': case 'B':
                if (vjMacros.blackout) {
                    e.preventDefault();
                    if (club.guardHostControl('lights')) vjMacros.blackout();
                }
                break;
            case 'm': case 'M': {
                // In a room: the microphone on or off, without hunting for the button.
                const mp = club.multiplayer;
                if (mp && mp.connected) { e.preventDefault(); mp.toggleMic(); }
                break;
            }
            case 't': case 'T': {
                const mp = club.multiplayer;
                if (mp && mp.connected) { e.preventDefault(); openSocialChat(); }
                break;
            }
            case 'f': case 'F':
                if (vjMacros.drop) {
                    e.preventDefault();
                    if (club.guardHostControl('lights')) vjMacros.drop();
                }
                break;
            case '1': case '2': case '3': case '4': case '5': case '6': {
                const presets = ['arrival', 'danceFloor', 'djBooth', 'lightingGallery', 'balcony', 'street'];
                e.preventDefault();
                club.moveCameraToPreset(presets[Number(e.key) - 1]);
                break;
            }
            default:
                break;
        }
    };
    document.addEventListener('keydown', onKey);
    uiTeardowns.push(() => document.removeEventListener('keydown', onKey));
}

// =============================================================================
// AUDIO MENU
// =============================================================================

function initAudioMenu() {
    const audioToggle = document.getElementById('audioToggle');
    const audioMenu = document.getElementById('audioMenu');
    const audioMinimize = document.getElementById('audioMinimize');
    const audioClose = document.getElementById('audioClose');
    const streamUrl = document.getElementById('streamUrl');
    const playStreamBtn = document.getElementById('playStreamBtn');
    const playStreamBtnLabel = document.getElementById('playStreamBtnLabel');
    const audioFileInput = document.getElementById('audioFileInput');
    const audioFileName = document.getElementById('audioFileName');
    const audioStatus = document.getElementById('audioStatus');
    const audioTitle = document.getElementById('audioMenuTitle');
    const nowPlaying = document.getElementById('audioNowPlaying');
    const volume = document.getElementById('audioVolume');
    const volumeValue = document.getElementById('audioVolumeValue');
    const ambience = document.getElementById('crowdAmbience');
    const ambienceValue = document.getElementById('crowdAmbienceValue');
    
    if (!audioToggle || !audioMenu) return;

    if (streamUrl && !streamUrl.value) {
        const remembered = ensureMusicLibrary(vrClubInstance).current()?.url;
        if (remembered && vrClubInstance._isSafeAudioUrl(remembered)) streamUrl.value = remembered;
    }

    /** Update the play/pause affordance without destroying its icon/label spans. */
    const setPlayLabel = (playing) => {
        if (playStreamBtnLabel) playStreamBtnLabel.textContent = playing ? 'Pause' : 'Play';
        if (playStreamBtn) playStreamBtn.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    };
    const setNowPlaying = (text) => { if (nowPlaying) nowPlaying.textContent = text; };
    const setSliderText = (slider, valueEl, value) => {
        const text = `${Math.round(value * 100)}%`;
        if (valueEl) valueEl.textContent = text;
        if (slider) slider.setAttribute('aria-valuetext', text);
    };

    if (vrClubInstance.audioElement && !vrClubInstance.audioElement.paused) {
        setPlayLabel(true);
        setNowPlaying(entryNowPlaying || '\u25B6 Playing');
    }
    
    const teardowns = uiTeardowns;
    const closeAudioMenu = (restoreFocus = true) => {
        audioMenu.classList.add('hidden');
        audioToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) audioToggle.focus();
    };
    const openAudioMenu = () => {
        audioMenu.classList.remove('hidden', 'minimized');
        audioToggle.setAttribute('aria-expanded', 'true');
        audioToggle.classList.remove('needs-attention');
        if (audioTitle) audioTitle.focus();
    };
    window.openMusicSetup = () => {
        openAudioMenu();
        document.getElementById('djStyle').value = vrClubInstance._djWanted || vrClubInstance._djId || vrClubInstance._initialDJId();
        if (streamUrl) streamUrl.focus();
    };
    window.openClubCredits = () => {
        const credits = document.getElementById('modelCredits');
        credits.open = true;
        credits.scrollIntoView();
        credits.querySelector('summary').focus();
    };
    teardowns.push(() => {
        delete window.openMusicSetup;
        delete window.openClubCredits;
    });

    audioToggle.addEventListener('click', () => {
        if (audioMenu.classList.contains('hidden')) openAudioMenu();
        else closeAudioMenu();
    });
    
    // Minimize/maximize. See the note on the VJ panel: writing to textContent would
    // delete the aria-hidden <span> and leave the label describing the wrong action.
    if (audioMinimize) {
        audioMinimize.addEventListener('click', () => {
            const minimized = audioMenu.classList.toggle('minimized');
            const glyph = audioMinimize.querySelector('span') || audioMinimize;
            glyph.textContent = minimized ? '+' : '\u2212';
            audioMinimize.setAttribute('aria-label', minimized ? 'Expand audio panel' : 'Minimize audio panel');
            audioMinimize.setAttribute('aria-expanded', String(!minimized));
        });
    }
    
    // Close
    if (audioClose) {
        audioClose.addEventListener('click', () => closeAudioMenu());
    }

    const onAudioKeyDown = e => {
        if (e.key === 'Escape' && !audioMenu.classList.contains('hidden')) {
            e.preventDefault();
            closeAudioMenu();
        }
    };
    document.addEventListener('keydown', onAudioKeyDown);
    teardowns.push(() => document.removeEventListener('keydown', onAudioKeyDown));
    
    // Show status message.
    // The handle is stored and cleared: an untracked timer per call meant an earlier
    // message's 3 s timer would blank a later message after a few hundred ms, and
    // repeated calls accumulated unbounded pending timers.
    let statusTimer = null;
    function showStatus(message, type = 'success') {
        if (!audioStatus) return;
        clearTimeout(statusTimer);
        audioStatus.textContent = message;
        audioStatus.className = `audio-status ${type}`;
        audioStatus.style.display = 'block';
        // role="alert" for failures so the message is announced immediately.
        audioStatus.setAttribute('role', type === 'error' ? 'alert' : 'status');
        statusTimer = setTimeout(() => {
            audioStatus.style.display = 'none';
        }, UI_TIMING.statusMs);
    }
    teardowns.push(() => clearTimeout(statusTimer));

    // Connectivity. The cached club and local files work offline; internet radio does
    // not. Say so, rather than letting a failed stream look like a broken club.
    const onConnectivityChange = () => {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (audioMenu) audioMenu.dataset.offline = String(offline);
        if (offline) {
            showStatus('Offline \u2014 radio streams need a connection; local files still play.', 'error');
        } else {
            showStatus('Back online \u2014 radio streams are available again.', 'success');
        }
    };
    window.addEventListener('online', onConnectivityChange);
    window.addEventListener('offline', onConnectivityChange);
    teardowns.push(() => {
        window.removeEventListener('online', onConnectivityChange);
        window.removeEventListener('offline', onConnectivityChange);
    });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) onConnectivityChange();

    // Music playback level: this controls only the chosen stream/file, not generated ambience.
    if (volume && volumeValue) {
        const current = Number.isFinite(vrClubInstance._audioVolume)
            ? vrClubInstance._audioVolume
            : (vrClubInstance.audioElement ? vrClubInstance.audioElement.volume : 1);
        volume.value = String(current);
        setSliderText(volume, volumeValue, current);
        volume.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (vrClubInstance.setAudioVolume) vrClubInstance.setAudioVolume(v);
            setSliderText(volume, volumeValue, v);
        });
    }

    // User-owned crowd-bed level. Kept distinct from the per-frame acoustic ducking.
    if (ambience && ambienceValue && typeof vrClubInstance.getCrowdAmbienceLevel === 'function') {
        const current = vrClubInstance.getCrowdAmbienceLevel();
        if (vrClubInstance.setCrowdAmbienceLevel) vrClubInstance.setCrowdAmbienceLevel(current);
        ambience.value = String(current);
        setSliderText(ambience, ambienceValue, current);
        ambience.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (vrClubInstance.setCrowdAmbienceLevel) vrClubInstance.setCrowdAmbienceLevel(v);
            setSliderText(ambience, ambienceValue, v);
        });
    }

    // Play stream URL
    if (playStreamBtn && streamUrl) {
        playStreamBtn.addEventListener('click', () => {
            const url = streamUrl.value.trim();
            if (!vrClubInstance.guardHostControl('music')) return;
            streamUrl.setCustomValidity('');
            if (!url) {
                streamUrl.setCustomValidity('Enter an audio stream URL.');
                streamUrl.reportValidity();
                showStatus('Please enter a stream URL', 'error');
                return;
            }
            if (!vrClubInstance._isSafeAudioUrl(url)) {
                streamUrl.setCustomValidity('Use an http://, https:// or blob: audio URL without embedded credentials.');
                streamUrl.reportValidity();
                showStatus('Invalid URL. Use http://, https:// or blob:', 'error');
                return;
            }

            const activeAudio = vrClubInstance.audioElement;
            const requestedUrl = new URL(url, window.location.href).href;
            if (activeAudio && !activeAudio.paused && activeAudio.src === requestedUrl) {
                activeAudio.pause();
                setPlayLabel(false);
                showStatus('Stream paused', 'success');
                // If this guest is the room host, tell everyone else to pause too.
                if (vrClubInstance.networkManager && vrClubInstance.networkManager.isHost()) {
                    vrClubInstance.networkManager.sendMusic({ url: requestedUrl, playing: false, position: activeAudio.currentTime });
                }
                return;
            }
            // Paused on this very source part-way through: resume it, do not start it over.
            if (activeAudio && activeAudio.paused && !activeAudio.ended && activeAudio.src === requestedUrl && activeAudio.currentTime > 0) {
                vrClubInstance.toggleAudioPlayback();
                setPlayLabel(true);
                showStatus('Resumed', 'success');
                return;
            }

            playUrl(url, document.getElementById('setName').value);
        });
    }

    const library = ensureMusicLibrary(vrClubInstance);
    const savedSets = document.getElementById('savedSets');
    const renderSets = (playing) => {
        savedSets.replaceChildren();
        if (!library.items.length) savedSets.add(new Option('No saved sets yet', ''));
        library.items.forEach((item, index) => savedSets.add(new Option(item.name, String(index))));
        savedSets.value = library.items.length ? String(library.selected) : '';
        const item = library.current();
        streamUrl.value = item ? item.url : '';
        document.getElementById('setName').value = item ? item.name : '';
        if (playing) announceNowPlaying(playing.name);
        if (vrClubInstance._vrQuickMenuVisible) vrClubInstance._refreshVRQuickMenu();
    };
    library.onChange = renderSets;
    renderSets();
    savedSets.addEventListener('change', () => {
        try { library.select(Number(savedSets.value)); }
        catch (error) { showStatus(error.message, 'error'); }
    });
    document.getElementById('playSavedSetBtn').addEventListener('click', () => {
        library.play().catch(error => showStatus(error.message, 'error'));
    });
    document.getElementById('removeSavedSetBtn').addEventListener('click', () => {
        try { library.remove(); }
        catch (error) { showStatus(error.message, 'error'); }
    });
    const djStyle = document.getElementById('djStyle');
    djStyle.value = vrClubInstance._initialDJId();
    djStyle.addEventListener('change', () => {
        vrClubInstance.chooseDJ(djStyle.value).catch(error => {
            djStyle.value = vrClubInstance._djId || vrClubInstance._initialDJId();
            showStatus(error.message, 'error');
        });
    });
    teardowns.push(() => { library.onChange = null; });

    // Position in the episode. The slider and the labels follow the audio (4 times a second while the
    // panel is open); dragging seeks on release, and the -30s / +30s buttons nudge.
    const seekSection = document.getElementById('audioSeekSection');
    const seek = document.getElementById('audioSeek');
    const seekElapsed = document.getElementById('audioSeekElapsed');
    const seekTotal = document.getElementById('audioSeekTotal');
    const seekBack = document.getElementById('audioSeekBack');
    const seekForward = document.getElementById('audioSeekForward');
    let seekDragging = false;
    const SEEK_STEPS = 1000;
    const renderSeek = () => {
        if (!seek || !seekSection) return;
        const info = vrClubInstance.getPlaybackInfo();
        // Keep the Play/Pause label honest when something else (the VR menu, a media key) changed it.
        if (vrClubInstance._audioKind === 'soundcloud') {
            if (playStreamBtnLabel) playStreamBtnLabel.textContent = 'Player open';
            if (playStreamBtn) playStreamBtn.setAttribute('aria-label', 'SoundCloud player open');
            if (volume) {
                volume.disabled = true;
                volume.title = 'Use the SoundCloud player volume control';
            }
        } else if (streamUrl && streamUrl.value && vrClubInstance.audioElement && vrClubInstance.audioElement.src) {
            setPlayLabel(info.playing);
            if (volume) {
                volume.disabled = false;
                volume.title = 'Music playback volume';
            }
        }
        seekSection.hidden = !info.seekable;
        if (!info.seekable) return;
        const shown = seekDragging ? (Number(seek.value) / SEEK_STEPS) * info.duration : info.position;
        if (!seekDragging) seek.value = String(Math.round((info.position / info.duration) * SEEK_STEPS));
        seekElapsed.textContent = AudioUtils.formatClock(shown);
        seekTotal.textContent = AudioUtils.formatClock(info.duration);
        seek.setAttribute('aria-valuetext', `${AudioUtils.formatClock(shown)} of ${AudioUtils.formatClock(info.duration)}`);
    };
    if (seek) {
        seek.addEventListener('input', () => { seekDragging = true; renderSeek(); });
        // 'change' fires on release (and on a keyboard step): that is when the media is actually asked to move.
        seek.addEventListener('change', () => {
            vrClubInstance.seekAudioFraction(Number(seek.value) / SEEK_STEPS);
            seekDragging = false;
            renderSeek();
        });
    }
    if (seekBack) seekBack.addEventListener('click', () => { vrClubInstance.seekAudioBy(-30); renderSeek(); });
    if (seekForward) seekForward.addEventListener('click', () => { vrClubInstance.seekAudioBy(30); renderSeek(); });
    const seekTimer = setInterval(() => { if (!audioMenu.classList.contains('hidden')) renderSeek(); }, 250);
    teardowns.push(() => clearInterval(seekTimer));
    audioToggle.addEventListener('click', renderSeek);

    /** Start an http(s) URL and publish it as the room's music if this guest hosts. */
    function playUrl(url, label) {
        try { library.save(url, label); }
        catch (error) { showStatus(error.message, 'error'); return Promise.resolve(false); }
        return library.play()
            .then(() => {
                const soundcloud = library.current().kind === 'soundcloud';
                showStatus(soundcloud ? 'SoundCloud player opened' : `Playing: ${library.current().name}`, 'success');
                if (soundcloud) {
                    playStreamBtnLabel.textContent = 'Player open';
                    playStreamBtn.setAttribute('aria-label', 'SoundCloud player open');
                } else {
                    setPlayLabel(true);
                }
                setNowPlaying(`\u25B6 ${library.current().name}`);
            })
            .catch(err => {
                showStatus(`Error: ${err.message}`, 'error');
                setNowPlaying('No audio yet');
            });
    }
    
    // Handle file upload
    if (audioFileInput && audioFileName) {
        audioFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            // `accept="audio/*"` is a picker hint, not a constraint. Without this the
            // user gets a raw MediaError string from the decoder instead of an answer.
            if (file.type && !file.type.startsWith('audio/')) {
                showStatus(`That doesn't look like an audio file (${file.type})`, 'error');
                return;
            }
            
            audioFileName.textContent = `\ud83d\udcc4 ${file.name}`;
            
            vrClubInstance.startAudioFromFile(file)
                .then(() => {
                    showStatus(`\ud83c\udfb5 Playing: ${file.name}`, 'success');
                    setPlayLabel(true);
                    setNowPlaying(`\u25B6 ${file.name}`);
                    const net = vrClubInstance.networkManager;
                    if (net && net.connected && net.isHost()) {
                        showStatus(`\ud83c\udfb5 Playing: ${file.name} (local files play only for you)`, 'success');
                    }
                })
                .catch(err => showStatus(`Error: ${err.message}`, 'error'));
        });
    }
    
    // Hide in VR mode. Observer handles are stored and released - the previous
    // version dropped them, so the closures (and transitively the whole VRClub
    // instance) could never be collected.
    if (vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        const scene = vrClubInstance.scene;
        const onInit = scene.onXRSessionInit.add(() => {
            closeAudioMenu(false);
            audioToggle.style.display = 'none';
        });
        const onEnded = scene.onXRSessionEnded.add(() => {
            audioToggle.style.display = ''; // back to the stylesheet's layout (icon over word)
        });
        teardowns.push(() => {
            scene.onXRSessionInit.remove(onInit);
            scene.onXRSessionEnded.remove(onEnded);
        });
    }
    
    uiLog.info('Audio menu initialized');
}

// =============================================================================
// MULTIPLAYER (NETWORK) MENU
// =============================================================================

/**
 * In someone else's room the host owns the music and the lights. Every control in the lighting and audio panels that
 * would change them is dimmed and swallowed (one capture-phase listener per panel, so a control added later is covered
 * too), and a note says whose they are. A guest's own comfort settings stay live: Safe Mode, VR comfort, haptics,
 * graphics quality, and the music and ambience volumes.
 */
function initRoomGuestLock(mp) {
    const club = vrClubInstance;
    const panels = [
        { id: 'vjMenu', what: 'show controls', keep: '#vjSafeModeBtn, #vjVRComfortBtn, #vjBassHapticsBtn, #vjMinimize, #vjClose, [data-control="cycleGraphicsQuality"], [data-people]' },
        { id: 'audioMenu', what: 'music', keep: '#audioMinimize, #audioClose, #audioVolume, #crowdAmbience, #djStyle' }
    ];
    const renders = [];
    for (const panel of panels) {
        const root = document.getElementById(panel.id);
        const content = root && root.querySelector('.vj-content, .audio-content');
        if (!root || !content) continue;
        const note = document.createElement('div');
        note.className = 'room-guest-note';
        note.hidden = true;
        note.setAttribute('role', 'status');
        content.insertBefore(note, content.firstChild);

        const controls = [...root.querySelectorAll('button, input, label.audio-file-label')].filter(el => !el.matches(panel.keep));
        for (const el of controls) el.classList.add('host-owned');
        // Buttons and inputs are really disabled, not only dimmed: a guest cannot reach them with the keyboard, and a
        // screen reader announces them as unavailable. The capture listener below stays as a second line.
        const disableable = controls.filter(el => el.tagName === 'INPUT' || el.tagName === 'BUTTON');

        const block = (e) => {
            if (!club.isFollowingHost()) return;
            const hit = e.target && e.target.closest ? e.target.closest('.host-owned') : null;
            if (!hit) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.type === 'click') club.guardHostControl(panel.what);
        };
        for (const type of ['click', 'keydown', 'input', 'change']) root.addEventListener(type, block, true);
        uiTeardowns.push(() => { for (const type of ['click', 'keydown', 'input', 'change']) root.removeEventListener(type, block, true); });

        renders.push(() => {
            const following = mp.following;
            note.hidden = !following;
            if (following) {
                const host = mp.hostName();
                note.textContent = `${host || 'The host'} is the host: they choose the ${panel.what}, and yours follow. Leave the room to take over.`;
            }
            for (const el of disableable) {
                // Preserve controls disabled for their own reasons when leaving the room.
                if (following && !el.dataset.hostLocked) { el.dataset.hostLocked = el.disabled ? 'was' : '1'; el.disabled = true; }
                else if (!following && el.dataset.hostLocked) { el.disabled = el.dataset.hostLocked === 'was'; delete el.dataset.hostLocked; }
            }
            root.classList.toggle('room-guest-locked', following);
        });
    }
    const render = () => { for (const fn of renders) fn(); };
    uiTeardowns.push(mp.onChange(render));
    render();
}

/** Opens the chat box of the social bar (set by initSocialBar; a no-op until then). */
let openSocialChat = () => {};

/**
 * The social bar: the three things you do in a room - talk, react, type - one press away at the bottom of the screen,
 * shown only while in a room and never in VR (the quick menu's TALK / REACT / CHAT row is the headset's version).
 * It only calls ClubMultiplayer and redraws from onChange, like the panel. Messages are drawn with textContent.
 */
function initSocialBar(mp) {
    const club = vrClubInstance;
    const bar = document.getElementById('socialBar');
    if (!bar) return;
    const micBtn = document.getElementById('socialMic');
    const micLabel = document.getElementById('socialMicLabel');
    const reactBtn = document.getElementById('socialReact');
    const chatBtn = document.getElementById('socialChat');
    const tray = document.getElementById('socialReactTray');
    const box = document.getElementById('socialChatBox');
    const log = document.getElementById('socialChatLog');
    const form = document.getElementById('socialChatForm');
    const input = document.getElementById('socialChatInput');
    const badge = document.getElementById('socialChatBadge');
    const peek = document.getElementById('socialPeek');
    let inVR = false;
    let seen = 0;
    let peekTimer = null;

    const setOpen = (button, pop, open) => {
        if (!pop || !button) return;
        pop.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        button.classList.toggle('active', open);
    };
    const closeAll = () => { setOpen(reactBtn, tray, false); setOpen(chatBtn, box, false); };

    const renderLog = () => {
        if (!log) return;
        log.replaceChildren();
        const entries = mp.chat.slice(-30);
        if (!entries.length) {
            const empty = document.createElement('li');
            empty.className = 'social-chat-empty';
            empty.textContent = 'No messages yet. Say hi!';
            log.appendChild(empty);
        }
        for (const entry of entries) {
            const item = document.createElement('li');
            item.className = entry.self ? 'social-chat-self' : '';
            const who = document.createElement('strong');
            who.textContent = entry.self ? 'You' : entry.name;
            item.append(who, document.createTextNode(`: ${entry.text}`));
            log.appendChild(item);
        }
        log.scrollTop = log.scrollHeight;
    };

    const showPeek = (entry) => {
        if (!peek) return;
        peek.textContent = `${entry.name}: ${entry.text}`;
        peek.hidden = false;
        clearTimeout(peekTimer);
        peekTimer = setTimeout(() => { peek.hidden = true; }, 6000);
    };

    const render = () => {
        const visible = mp.connected && !inVR;
        bar.hidden = !visible;
        if (!visible) closeAll();
        if (micBtn) {
            micBtn.setAttribute('aria-pressed', String(mp.micEnabled));
            micBtn.classList.toggle('active', mp.micEnabled);
            if (micLabel) micLabel.textContent = mp.micEnabled ? 'Mic on' : 'Mic off';
        }
        for (const button of tray ? tray.querySelectorAll('[data-gesture="dance"]') : []) {
            button.setAttribute('aria-pressed', String(mp.dancing));
            button.classList.toggle('active', mp.dancing);
        }
        // A message that arrives while the box is closed: a short peek above the bar and a count on the button.
        const chatOpen = box && !box.hidden;
        const fresh = mp.chat.slice(seen).filter(entry => !entry.self);
        if (mp.chat.length < seen) seen = 0;
        if (fresh.length && !chatOpen) showPeek(fresh[fresh.length - 1]);
        seen = mp.chat.length;
        if (chatOpen && mp.chatUnread) mp.markChatRead();
        if (badge) {
            badge.hidden = !mp.chatUnread || chatOpen;
            badge.textContent = String(Math.min(99, mp.chatUnread));
        }
        if (chatBtn) chatBtn.setAttribute('aria-label', mp.chatUnread ? `Chat, ${mp.chatUnread} new` : 'Chat');
        if (chatOpen || fresh.length) renderLog();
    };

    openSocialChat = () => {
        if (!mp.connected) return;
        setOpen(reactBtn, tray, false);
        setOpen(chatBtn, box, true);
        if (peek) peek.hidden = true;
        mp.markChatRead();
        renderLog();
        render();
        if (input) input.focus();
    };

    if (micBtn) micBtn.addEventListener('click', () => mp.toggleMic());
    if (reactBtn) reactBtn.addEventListener('click', () => {
        const open = tray.hidden;
        setOpen(chatBtn, box, false);
        setOpen(reactBtn, tray, open);
    });
    if (chatBtn) chatBtn.addEventListener('click', () => {
        if (box.hidden) openSocialChat();
        else setOpen(chatBtn, box, false);
    });
    if (tray) {
        for (const button of tray.querySelectorAll('[data-emoji]')) button.addEventListener('click', () => mp.sendEmoji(button.dataset.emoji));
        for (const button of tray.querySelectorAll('[data-gesture]')) button.addEventListener('click', () => mp.sendGesture(button.dataset.gesture));
    }
    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (mp.sendChat(input.value)) input.value = '';
        renderLog();
        input.focus();
    });
    // Escape closes the open tray or chat box; Escape in the message field also leaves it.
    const onKey = (e) => {
        if (e.key !== 'Escape' || (tray.hidden && box.hidden)) return;
        closeAll();
        if (document.activeElement === input) input.blur();
    };
    document.addEventListener('keydown', onKey);
    uiTeardowns.push(() => document.removeEventListener('keydown', onKey));
    uiTeardowns.push(() => clearTimeout(peekTimer));

    if (club.scene && club.scene.onXRSessionInit) {
        const onInit = club.scene.onXRSessionInit.add(() => { inVR = true; render(); });
        const onEnded = club.scene.onXRSessionEnded.add(() => { inVR = false; render(); });
        uiTeardowns.push(() => {
            club.scene.onXRSessionInit.remove(onInit);
            club.scene.onXRSessionEnded.remove(onEnded);
        });
    }
    uiTeardowns.push(mp.onChange(render));
    render();
}

function initNetworkMenu() {
    const networkToggle = document.getElementById('networkToggle');
    const networkMenu = document.getElementById('networkMenu');
    const networkMinimize = document.getElementById('networkMinimize');
    const networkClose = document.getElementById('networkClose');
    const networkTitle = document.getElementById('networkMenuTitle');
    const serverUrlInput = document.getElementById('networkServerUrl');
    const roomInput = document.getElementById('networkRoom');
    const nameInput = document.getElementById('networkName');
    const connectBtn = document.getElementById('networkConnectBtn');
    const connectBtnLabel = document.getElementById('networkConnectBtnLabel');
    const micBtn = document.getElementById('networkMicBtn');
    const micBtnLabel = document.getElementById('networkMicBtnLabel');
    const statusEl = document.getElementById('networkStatus');
    const peerCountEl = document.getElementById('networkPeerCount');
    const emojiButtons = [...document.querySelectorAll('#networkEmojiGrid [data-emoji]')];
    const gestureButtons = [...document.querySelectorAll('#networkGestureGrid [data-gesture]')];
    const listenAlongSection = document.getElementById('networkListenAlong');
    const listenAlongBtn = document.getElementById('networkListenAlongBtn');
    const musicInfoEl = document.getElementById('networkMusicInfo');
    const avatarSection = document.getElementById('networkAvatarSection');
    const poolButtons = [...document.querySelectorAll('#networkAvatarPool [data-avatar-pool]')];
    const avatarEl = document.getElementById('networkAvatar');
    const avatarBtn = document.getElementById('networkAvatarBtn');
    const autoNodBtn = document.getElementById('networkAutoNod');
    const peopleList = document.getElementById('networkPeopleList');
    const blockedList = document.getElementById('networkBlockedList');
    const personalSpaceBtn = document.getElementById('networkPersonalSpace');
    const nameTagsBtn = document.getElementById('networkNameTags');
    const muteAllBtn = document.getElementById('networkMuteAll');
    const lockBtn = document.getElementById('networkLockRoom');
    const privateRoomBtn = document.getElementById('networkPrivateRoom');
    const inviteBtn = document.getElementById('networkInviteBtn');
    const joinSection = document.getElementById('networkJoin');
    const roomActions = document.getElementById('networkRoomActions');
    const roomInfo = document.getElementById('networkRoomInfo');
    const leaveBtn = document.getElementById('networkLeaveBtn');
    const inRoomSections = ['networkTalk', 'networkReact', 'networkPeople'].map(id => document.getElementById(id)).filter(Boolean);
    const duckBtn = document.getElementById('networkDuck');
    const openChatBtn = document.getElementById('networkOpenChat');
    const hostTools = document.getElementById('networkHostTools');

    if (!networkToggle || !networkMenu) return;

    const teardowns = uiTeardowns;
    // One session for the whole club: the VR quick menu's ONLINE pages drive the very same object.
    const mp = vrClubInstance.multiplayer || new ClubMultiplayer(vrClubInstance);

    if (serverUrlInput) serverUrlInput.value = mp.serverUrl;
    if (roomInput) roomInput.value = mp.room;
    if (nameInput) nameInput.value = mp.name;

    const closeNetworkMenu = (restoreFocus = true) => {
        networkMenu.classList.add('hidden');
        networkToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) networkToggle.focus();
    };
    const openNetworkMenu = () => {
        networkMenu.classList.remove('hidden', 'minimized');
        networkToggle.setAttribute('aria-expanded', 'true');
        if (networkTitle) networkTitle.focus();
    };

    networkToggle.addEventListener('click', () => {
        if (networkMenu.classList.contains('hidden')) openNetworkMenu();
        else closeNetworkMenu();
    });

    if (networkMinimize) {
        networkMinimize.addEventListener('click', () => {
            const minimized = networkMenu.classList.toggle('minimized');
            const glyph = networkMinimize.querySelector('span') || networkMinimize;
            glyph.textContent = minimized ? '+' : '\u2212';
            networkMinimize.setAttribute('aria-label', minimized ? 'Expand multiplayer panel' : 'Minimize multiplayer panel');
            networkMinimize.setAttribute('aria-expanded', String(!minimized));
        });
    }
    if (networkClose) networkClose.addEventListener('click', () => closeNetworkMenu());

    const onNetworkKeyDown = (e) => {
        if (e.key === 'Escape' && !networkMenu.classList.contains('hidden')) {
            e.preventDefault();
            closeNetworkMenu();
        }
    };
    document.addEventListener('keydown', onNetworkKeyDown);
    teardowns.push(() => document.removeEventListener('keydown', onNetworkKeyDown));

    // ---- rendering: one function redraws the panel from the controller's state ------------------------------------
    const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };
    const setPressed = (button, on) => {
        if (!button) return;
        button.setAttribute('aria-pressed', String(!!on));
        button.classList.toggle('active', !!on);
    };
    const label = (id) => (ClubMultiplayer.AVATAR_LABELS[id] || id || 'Guest');
    /** A small button inside a list row. Built with the DOM API: first-party code never builds markup from strings. */
    const rowButton = (text, title, onClick, danger = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `vj-button network-person-btn${danger ? ' network-danger' : ''}`;
        button.textContent = text;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.addEventListener('click', onClick);
        return button;
    };
    /** Kick and ban cannot be undone by the host, so a first press only arms the button; a second one within 4 s acts. */
    const armed = new Map();
    const confirmed = (key) => {
        const until = armed.get(key) || 0;
        if (until > Date.now()) { armed.delete(key); return true; }
        armed.set(key, Date.now() + 4000);
        setTimeout(render, 4100);
        render();
        return false;
    };

    const renderPeople = () => {
        if (!peopleList) return;
        peopleList.replaceChildren();
        const host = mp.isHost();
        for (const person of mp.people()) {
            const item = document.createElement('li');
            item.className = 'network-person';
            const who = document.createElement('span');
            who.className = 'network-person-name';
            who.textContent = `${person.isHost ? '\u{1F451} ' : ''}${person.name}${person.speaking ? ' \u{1F5E3}\uFE0F' : ''}${person.muted ? ' (muted)' : ''}`;
            who.title = label(person.avatar);
            item.appendChild(who);
            item.appendChild(rowButton(person.muted ? 'Unmute' : 'Mute', `${person.muted ? 'Unmute' : 'Mute'} ${person.name}`,
                () => mp.togglePeerMute(person.id)));
            item.appendChild(rowButton('Block', `Block ${person.name}: you will not see or hear each other`, () => mp.blockPeer(person.id)));
            if (host) {
                const kickKey = `kick:${person.id}`, banKey = `ban:${person.id}`;
                item.appendChild(rowButton(armed.has(kickKey) && armed.get(kickKey) > Date.now() ? 'Sure?' : 'Kick',
                    `Remove ${person.name} from the room (they can come back)`, () => { if (confirmed(kickKey)) mp.kickPeer(person.id); }, true));
                item.appendChild(rowButton(armed.has(banKey) && armed.get(banKey) > Date.now() ? 'Sure?' : 'Ban',
                    `Remove ${person.name} and keep them out of this room`, () => { if (confirmed(banKey)) mp.banPeer(person.id); }, true));
            }
            peopleList.appendChild(item);
        }
    };

    const renderBlocked = () => {
        if (!blockedList) return;
        blockedList.replaceChildren();
        const list = mp.blockedList();
        if (list.length === 0) {
            const none = document.createElement('li');
            none.className = 'audio-file-name';
            none.textContent = 'Nobody.';
            blockedList.appendChild(none);
            return;
        }
        for (const entry of list) {
            const item = document.createElement('li');
            item.className = 'network-person';
            const who = document.createElement('span');
            who.className = 'network-person-name';
            who.textContent = entry.name || 'Guest';
            item.appendChild(who);
            item.appendChild(rowButton('Unblock', `Unblock ${entry.name || 'this guest'}`, () => mp.unblock(entry.pid)));
            blockedList.appendChild(item);
        }
    };

    function render() {
        const connected = mp.connected, connecting = mp.connecting;
        setStatus(mp.statusText());
        // Before joining only the join form shows; once in a room, the things you can do there.
        if (joinSection) joinSection.hidden = connected;
        if (roomActions) roomActions.hidden = !connected;
        for (const section of inRoomSections) section.hidden = !connected;
        if (hostTools) hostTools.hidden = !(connected && mp.isHost());
        if (roomInfo && connected) {
            const code = /^private-(\d{6})$/.exec(mp.currentRoom || '');
            roomInfo.textContent = code
                ? `Private room. Friends join with the code ${code[1].slice(0, 3)} ${code[1].slice(3)}, or the invite link. The first person in a room is its host: they choose the music and the lights.`
                : 'The first person in a room is its host: they choose the music and the lights. Send the invite link to bring friends here.';
        }
        if (connectBtnLabel) connectBtnLabel.textContent = connecting ? 'Cancel' : 'Join room';
        for (const input of [nameInput, roomInput, serverUrlInput]) if (input) input.disabled = connecting;
        if (micBtn) {
            setToggleState(micBtn, mp.micEnabled);
            if (micBtnLabel) micBtnLabel.textContent = mp.micEnabled ? 'Turn my microphone off' : 'Turn my microphone on';
        }
        if (duckBtn) {
            duckBtn.textContent = `Lower the music while people talk: ${mp.duckForVoice ? 'ON' : 'OFF'}`;
            setPressed(duckBtn, mp.duckForVoice);
        }
        gestureButtons.forEach(btn => { if (btn.dataset.gesture === 'dance') setPressed(btn, mp.dancing); });
        if (peerCountEl) {
            const n = connected ? mp.client.peerCount : 0;
            peerCountEl.textContent = n === 0 ? 'Nobody else here yet. Send someone the invite link.' : `${n} other ${n === 1 ? 'person' : 'people'} here`;
        }
        if (avatarSection) avatarSection.hidden = !connected;
        for (const btn of poolButtons) btn.setAttribute('aria-checked', String(btn.dataset.avatarPool === mp.avatarPool));
        if (avatarEl) avatarEl.textContent = mp.selfAvatar ? `Others see you as: ${label(mp.selfAvatar)}` : 'Choosing your character\u2026';
        if (autoNodBtn) {
            autoNodBtn.textContent = `Nod your head to nod (VR): ${mp.autoNod ? 'ON' : 'OFF'}`;
            setPressed(autoNodBtn, mp.autoNod);
        }
        if (nameTagsBtn) {
            nameTagsBtn.textContent = `Name tags: ${mp.nameTags ? 'ON' : 'OFF'}`;
            setPressed(nameTagsBtn, mp.nameTags);
        }
        if (personalSpaceBtn) {
            personalSpaceBtn.textContent = `Personal space: ${mp.personalSpace ? 'ON' : 'OFF'}`;
            setPressed(personalSpaceBtn, mp.personalSpace);
        }
        if (muteAllBtn) {
            muteAllBtn.hidden = !connected;
            muteAllBtn.textContent = `Mute everyone: ${mp.muteAll ? 'ON' : 'OFF'}`;
            setPressed(muteAllBtn, mp.muteAll);
        }
        if (lockBtn) {
            lockBtn.textContent = `Lock room: ${mp.locked ? 'ON (nobody new can join)' : 'OFF'}`;
            setPressed(lockBtn, mp.locked);
        }
        const pending = mp.pendingMusicInfo();
        if (listenAlongSection) listenAlongSection.hidden = !pending;
        if (pending && musicInfoEl) {
            musicInfoEl.textContent = pending.playing
                ? `The host is playing music from ${pending.origin}. Press Listen along to hear it too (that site will see your IP address).`
                : `The host paused music from ${pending.origin}.`;
        }
        renderPeople();
        renderBlocked();
    }
    const unsubscribe = mp.onChange(render);
    teardowns.push(unsubscribe);
    render();

    // ---- actions: every one is a call into the controller ----------------------------------------------------------
    if (listenAlongBtn) listenAlongBtn.addEventListener('click', () => mp.acceptListenAlong());

    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            if (mp.connected || mp.connecting) { mp.disconnect(); return; }
            mp.connect({
                serverUrl: serverUrlInput && serverUrlInput.value,
                room: roomInput && ClubMultiplayer.roomFromCode(roomInput.value),
                name: nameInput && nameInput.value
            });
        });
    }
    // Enter in the name or room field joins, as a form would.
    for (const input of [nameInput, roomInput]) {
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && connectBtn && !mp.connected) { e.preventDefault(); connectBtn.click(); } });
    }
    if (leaveBtn) leaveBtn.addEventListener('click', () => mp.disconnect());
    if (duckBtn) duckBtn.addEventListener('click', () => mp.setDuckForVoice(!mp.duckForVoice));
    if (openChatBtn) openChatBtn.addEventListener('click', () => { closeNetworkMenu(false); openSocialChat(); });

    if (micBtn) micBtn.addEventListener('click', () => mp.toggleMic());
    for (const btn of emojiButtons) btn.addEventListener('click', () => mp.sendEmoji(btn.dataset.emoji));
    for (const btn of gestureButtons) btn.addEventListener('click', () => mp.sendGesture(btn.dataset.gesture));
    if (avatarBtn) avatarBtn.addEventListener('click', () => mp.rerollAvatar());
    for (const btn of poolButtons) btn.addEventListener('click', () => mp.setAvatarPool(btn.dataset.avatarPool));
    if (autoNodBtn) autoNodBtn.addEventListener('click', () => mp.setAutoNod(!mp.autoNod));
    if (personalSpaceBtn) personalSpaceBtn.addEventListener('click', () => mp.setPersonalSpace(!mp.personalSpace));
    if (nameTagsBtn) nameTagsBtn.addEventListener('click', () => mp.setNameTags(!mp.nameTags));
    if (muteAllBtn) muteAllBtn.addEventListener('click', () => mp.setMuteAll(!mp.muteAll));
    if (lockBtn) lockBtn.addEventListener('click', () => mp.setLocked(!mp.locked));
    if (privateRoomBtn) {
        privateRoomBtn.addEventListener('click', () => {
            if (mp.joinNewPrivateRoom() && roomInput) roomInput.value = mp.currentRoom;
        });
    }
    if (inviteBtn) {
        inviteBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(mp.inviteUrl());
                vrClubInstance.showErrorMessage('Invite link copied: anyone who opens it joins this room');
            } catch (_) {
                vrClubInstance.showErrorMessage(`Could not copy. Share the room code instead: ${mp.currentRoom}`);
            }
        });
    }
    // The music and the lights are the host's, and the host's alone: the panels tell a guest so and stand down.
    initRoomGuestLock(mp);
    // Talk, react and type, one press away while in a room.
    initSocialBar(mp);

    // Hide in VR mode, matching the VJ/audio panels.
    if (vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        const scene = vrClubInstance.scene;
        const onInit = scene.onXRSessionInit.add(() => {
            closeNetworkMenu(false);
            networkToggle.style.display = 'none';
        });
        const onEnded = scene.onXRSessionEnded.add(() => {
            networkToggle.style.display = ''; // back to the stylesheet's layout (icon over word)
        });
        teardowns.push(() => {
            scene.onXRSessionInit.remove(onInit);
            scene.onXRSessionEnded.remove(onEnded);
        });
    }

    uiLog.info('Multiplayer menu initialized');
}

// =============================================================================
// SERVICE WORKER REGISTRATION (PWA Offline Shell & Fast Startup)
// =============================================================================

let swUpdateAccepted = false;

const onWindowLoadRegisterSW = () => {
    // Register sw.js on same-origin http(s)
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (window.location.protocol !== 'https:' && !isLocal) return;

    // updateViaCache: 'none' — scripts/serve.mjs marks non-HTML assets
    // `immutable, max-age=1y`, which would otherwise pin a worker update for a year.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
        uiLog.info('⚡ Service Worker registered for fast offline shell');

        // Update UX. The worker no longer calls skipWaiting() unconditionally, so a
        // new build waits until the user accepts it rather than hot-swapping the
        // controller under a page that was built from the previous bundle.
        const promptForUpdate = (worker) => {
            if (!worker) return;
            let prompt = document.getElementById('swUpdatePrompt');
            if (prompt) return;

            prompt = document.createElement('div');
            prompt.id = 'swUpdatePrompt';
            prompt.className = 'sw-update-prompt';
            prompt.setAttribute('role', 'status');

            const message = document.createElement('span');
            message.textContent = 'A new version is ready.';
            const reload = document.createElement('button');
            reload.type = 'button';
            reload.textContent = 'Reload now';
            reload.addEventListener('click', () => {
                reload.disabled = true;
                reload.textContent = 'Reloading…';
                swUpdateAccepted = true;
                worker.postMessage({ type: 'SKIP_WAITING' });
            }, { once: true });

            prompt.append(message, reload);
            document.body.appendChild(prompt);
            uiTeardowns.push(() => prompt.remove());
        };

        if (registration.waiting) promptForUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    promptForUpdate(installing);
                }
            });
        });
    }).catch(err => {
        uiLog.info('Service Worker registration skipped:', err);
    });
};

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', onWindowLoadRegisterSW);

    // Reload exactly once when a newly activated worker takes control.
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // The first install also calls clients.claim(), which fires controllerchange.
        // Reloading then destroys a club that may still be parsing its startup GLBs.
        // Only a user-approved update should reload the current page.
        if (!swUpdateAccepted || swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
    });
}
