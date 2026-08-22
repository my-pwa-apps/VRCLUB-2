// ESLint flat config.
//
// This project has no build step and no module system: js/*.js are classic browser
// scripts that share one global scope and publish their classes onto `window`.
// That means `no-undef` needs the full browser global set plus the first-party
// classes, and the intentional `window.Foo = Foo` exports must not be flagged.

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    console: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    indexedDB: 'readonly',
    fetch: 'readonly',
    Request: 'readonly',
    Response: 'readonly',
    Headers: 'readonly',
    AbortController: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    Blob: 'readonly',
    File: 'readonly',
    FileReader: 'readonly',
    FormData: 'readonly',
    Image: 'readonly',
    Audio: 'readonly',
    AudioContext: 'readonly',
    webkitAudioContext: 'readonly',
    Worker: 'readonly',
    performance: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    queueMicrotask: 'readonly',
    matchMedia: 'readonly',
    screen: 'readonly',
    location: 'readonly',
    history: 'readonly',
    alert: 'readonly',
    XMLHttpRequest: 'readonly',
    DOMParser: 'readonly',
    CustomEvent: 'readonly',
    Event: 'readonly',
    KeyboardEvent: 'readonly',
    PointerEvent: 'readonly',
    HTMLElement: 'readonly',
    HTMLCanvasElement: 'readonly',
    getComputedStyle: 'readonly',
    structuredClone: 'readonly',
    TextEncoder: 'readonly',
    TextDecoder: 'readonly',
    crypto: 'readonly'
};

// Third-party runtime + the first-party classes published onto `window` by
// sibling classic scripts. index.html's load order guarantees availability.
const projectGlobals = {
    BABYLON: 'readonly',
    AudioUtils: 'readonly',
    ROOM_BOUNDS: 'readonly',
    CLUB_POSITIONS: 'readonly',
    VRClubCore: 'readonly',
    VRClubLifecycle: 'readonly',
    VRClubRendering: 'readonly',
    VRClubEnvironment: 'readonly',
    VRClubFixtures: 'readonly',
    VRClubEffects: 'readonly',
    VRClubAnimationCore: 'readonly',
    VRClubAnimationFixtures: 'readonly',
    VRClubAnimationFinish: 'readonly',
    VRClubUI: 'readonly',
    VRClubAudioCrowd: 'readonly',
    IndexedDBAssetCache: 'readonly',
    InFlightRegistry: 'readonly',
    fetchWithTimeout: 'readonly',
    fetchBufferWithTimeout: 'readonly',
    fetchBlobWithTimeout: 'readonly',
    TextureLoader: 'readonly',
    ModelLoader: 'readonly',
    MaterialFactory: 'readonly',
    LightFactory: 'readonly',
    VJDirector: 'readonly',
    ShowDirector: 'readonly',
    LEDPatterns: 'readonly',
    VRClub: 'readonly',
    log: 'readonly',
    module: 'readonly'
};

const sharedRules = {
    'no-undef': 'error',
    'no-unused-vars': ['warn', {
        args: 'after-used',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none'
    }],
    // Classic scripts deliberately publish classes/functions into one shared
    // global scope. no-undef still catches misspellings within that contract.
    'no-implicit-globals': 'off',
    'no-var': 'error',
    'prefer-const': ['warn', { destructuring: 'all' }],
    'no-const-assign': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-class-members': 'error',
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'eqeqeq': ['error', 'smart'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'error',
    'no-self-compare': 'error',
    'no-template-curly-in-string': 'warn',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['error', { allowEmptyCatch: true }]
};

export default [
    {
        ignores: [
            'node_modules/**',
            'js/vendor/**',
            // Build output: minified vendor bundles here are megabytes of generated
            // code that no rule applies to, and linting them cost ~13 s per run.
            'dist/**'
        ]
    },
    {
        // Service worker. Previously matched NO config block, so it was visited with
        // no languageOptions and no rules - a typo in the worker shipped unchallenged.
        files: ['sw.js', 'serviceworker.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: {
                self: 'readonly',
                caches: 'readonly',
                clients: 'readonly',
                fetch: 'readonly',
                console: 'readonly',
                importScripts: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                URL: 'readonly',
                Promise: 'readonly'
            }
        },
        rules: sharedRules
    },
    {
        // First-party browser scripts (classic, shared global scope).
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: { ...browserGlobals, ...projectGlobals }
        },
        rules: sharedRules
    },
    {
        // Node tooling and tests.
        files: ['scripts/**/*.mjs', 'test/**/*.mjs', 'eslint.config.mjs'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                queueMicrotask: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                globalThis: 'readonly',
                structuredClone: 'readonly',
                __dirname: 'readonly'
            }
        },
        rules: {
            ...sharedRules,
            // The URL-policy table intentionally contains a javascript: sample
            // to prove that browser code rejects it.
            'no-script-url': 'off'
        }
    },
    {
        // Playwright evaluate/init callbacks execute in the browser, even though
        // their containing spec is a Node ESM module.
        files: ['test/e2e/**/*.mjs'],
        languageOptions: {
            globals: browserGlobals
        }
    }
];
