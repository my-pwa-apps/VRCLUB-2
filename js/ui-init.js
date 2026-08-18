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

const DEFAULT_AUDIO_STREAM = Object.freeze({
    name: 'SUNSHINE LIVE - Techno',
    url: 'https://stream.sunshine-live.de/techno/mp3-192/stream.sunshine-live.de/'
});

/** localStorage key for the last stream the guest actually played. */
const LAST_STREAM_KEY = 'vrclub.lastStreamUrl';

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
    'strobesActive', 'blindersActive', 'mirrorBallActive', 'laserSheetActive',
    'smokeActive', 'spotStrobeActive'
]));

const SPOT_MODE_NAMES = Object.freeze(['STROBE+SWEEP', 'SWEEP ONLY', 'STROBE STATIC', 'STATIC']);
const SPOT_PATTERN_NAMES = Object.freeze(['RANDOM', 'STATIC DOWN', 'MIRROR SWEEP', 'CROSSED BEAMS']);

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
// Strobes and blinders are on by default, so a control that only exists inside a
// panel the user has to open after entering is not a mitigation - the exposure has
// already happened. This mirrors VRClubCore's own resolution order: an explicit
// stored choice wins, otherwise prefers-reduced-motion opts the user in.
(function initSplashSafeMode() {
    const btn = document.getElementById('splashSafeModeBtn');
    const state = document.getElementById('splashSafeModeState');
    if (!btn || !state) return;

    const read = () => {
        try {
            const stored = localStorage.getItem('vrclub.safeMode');
            if (stored !== null) return stored === '1';
        } catch (_) { /* private browsing */ }
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (_) { return false; }
    };

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

        let startUrl = DEFAULT_AUDIO_STREAM.url;
        try {
            const remembered = localStorage.getItem(LAST_STREAM_KEY);
            if (remembered && window.vrClub._isSafeAudioUrl(remembered)) startUrl = remembered;
        } catch (_) { /* ignore */ }

        window.vrClub.startAudioStream(startUrl).catch((err) => {
            // Music is atmosphere, not a startup dependency - but failing silently
            // leaves the guest in a club that looks alive and makes no sound, with no
            // indication that the fix is behind the audio button.
            uiLog.warn(`Default stream unavailable: ${err.message}`);
            const audioToggle = document.getElementById('audioToggle');
            if (audioToggle) {
                audioToggle.classList.add('needs-attention');
                setTimeout(() => audioToggle.classList.remove('needs-attention'), 6000);
            }
            if (window.vrClub.showErrorMessage) {
                window.vrClub.showErrorMessage('No music yet \u2014 open \ud83c\udfb5 to pick a station or play a local file.');
            }
        });
        
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
            if (patBtn) patBtn.textContent = `PATTERN: ${SPOT_PATTERN_NAMES[vrClubInstance.spotlightPattern]}`;
            const goboBtn = document.querySelector('.vj-button[data-control="cycleGoboPattern"]');
            if (goboBtn) goboBtn.textContent = `GOBO: ${(vrClubInstance.goboPatterns[vrClubInstance.goboPatternIndex] || 'circle').toUpperCase()}`;
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
                button.textContent = `PATTERN: ${SPOT_PATTERN_NAMES[vrClubInstance.spotlightPattern]}`;
                flashButton(button);
                
            } else if (control === 'goboActive') {
                const isActive = vrClubInstance.toggleGobo ? vrClubInstance.toggleGobo() : false;
                setToggleState(button, isActive);
                flashButton(button);
                
            } else if (control === 'cycleGoboPattern') {
                const patternName = vrClubInstance.nextGoboPattern
                    ? vrClubInstance.nextGoboPattern()
                    : 'circle';
                button.textContent = `GOBO: ${patternName.toUpperCase()}`;
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
            vrClubInstance.blinderSpeed = value;
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

    // Update button states periodically
    function updateButtonStates() {
        if (!vrClubInstance || vjMenu.classList.contains('hidden')) return;
        
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
            vjToggle.style.display = 'block';
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
    const onKey = (e) => {
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const club = vrClubInstance;
        if (!club) return;

        switch (e.key) {
            case ' ': {
                const el = club.audioElement;
                if (!el) return;
                e.preventDefault();
                if (el.paused) el.play().catch(() => {}); else el.pause();
                break;
            }
            case 'b': case 'B':
                if (vjMacros.blackout) { e.preventDefault(); vjMacros.blackout(); }
                break;
            case 'f': case 'F':
                if (vjMacros.drop) { e.preventDefault(); vjMacros.drop(); }
                break;
            case '1': case '2': case '3': case '4': {
                const presets = ['arrival', 'danceFloor', 'djBooth', 'lightingGallery'];
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
    
    if (!audioToggle || !audioMenu) return;

    if (streamUrl && !streamUrl.value) {
        // Prefill with whatever the guest last actually played, so the single
        // highest-friction input in the app (a URL typed on a Quest virtual
        // keyboard) does not have to be re-entered every session.
        let remembered = null;
        try { remembered = localStorage.getItem(LAST_STREAM_KEY); } catch (_) { /* ignore */ }
        streamUrl.value = (remembered && vrClubInstance._isSafeAudioUrl(remembered))
            ? remembered
            : DEFAULT_AUDIO_STREAM.url;
    }

    /** Update the play/pause affordance without destroying its icon/label spans. */
    const setPlayLabel = (playing) => {
        if (playStreamBtnLabel) playStreamBtnLabel.textContent = playing ? 'Pause' : 'Play';
        if (playStreamBtn) playStreamBtn.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
    };
    const setNowPlaying = (text) => { if (nowPlaying) nowPlaying.textContent = text; };

    if (vrClubInstance.audioElement && !vrClubInstance.audioElement.paused) {
        setPlayLabel(true);
        setNowPlaying(`\u25B6 ${DEFAULT_AUDIO_STREAM.name}`);
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

    // Volume. There was previously no volume or mute control anywhere in the app.
    if (volume && volumeValue) {
        volume.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            if (vrClubInstance.setAudioVolume) vrClubInstance.setAudioVolume(v);
            const text = `${Math.round(v * 100)}%`;
            volumeValue.textContent = text;
            volume.setAttribute('aria-valuetext', text);
        });
    }

    // Play stream URL
    if (playStreamBtn && streamUrl) {
        playStreamBtn.addEventListener('click', () => {
            const url = streamUrl.value.trim();
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
                return;
            }

            vrClubInstance.startAudioStream(url)
                .then(() => {
                    showStatus('\ud83c\udfb5 Stream playing!', 'success');
                    setPlayLabel(true);
                    setNowPlaying(`\u25B6 ${url}`);
                    try { localStorage.setItem(LAST_STREAM_KEY, url); } catch (_) { /* ignore */ }
                })
                .catch(err => {
                    showStatus(`Error: ${err.message}`, 'error');
                    setNowPlaying('No audio yet');
                });
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
            audioToggle.style.display = 'block';
        });
        teardowns.push(() => {
            scene.onXRSessionInit.remove(onInit);
            scene.onXRSessionEnded.remove(onEnded);
        });
    }
    
    uiLog.info('Audio menu initialized');
}

// =============================================================================
// SERVICE WORKER REGISTRATION (PWA Offline Shell & Fast Startup)
// =============================================================================

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
            const club = window.vrClub;
            if (club && club.showErrorMessage) {
                club.showErrorMessage('A new version is ready — reload to update.');
            }
            worker.postMessage({ type: 'SKIP_WAITING' });
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
        if (swRefreshing) return;
        swRefreshing = true;
        window.location.reload();
    });
}


