// Worker entry point. The runtime treats every export of this module as a handler or a
// Durable Object class, so the relay's constants and helpers (exported for tests) live in
// relay.js and only the two real entry points are re-exported here.
export { ClubRoom, default } from './relay.js';
