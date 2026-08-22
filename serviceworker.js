// VR Club Service Worker alias.
// Some hosts expect /serviceworker.js; the implementation lives in sw.js.
// No `const VERSION` here: importScripts shares the worker global scope, so
// redeclaring it would throw before the worker ever installed.
//
// If you register THIS file rather than ./sw.js, register it with
// `{ updateViaCache: 'none' }`: ServiceWorkerRegistration.updateViaCache defaults
// to 'imports', so an importScripts() target is served from the HTTP cache - and
// scripts/serve.mjs would otherwise pin sw.js for a year behind `immutable`.
// (serve.mjs now special-cases worker scripts as `no-cache` for the same reason.)
//
// SERVICE_WORKER_VERSION: vrclub-v20260823-1
importScripts('./sw.js');
