# Development rooms: SFU audio and bounded presence

This implementation is development-only until explicitly provisioned and deployed.
It creates no Cloudflare application, modifies no production deployment, and changes
no payment or access records. Capacity is an admission limit, not a headset performance
claim.

## Configuration

Set these on the **development relay only**:

| Variable | Value / purpose |
| --- | --- |
| `ROOM_CAPACITY` | Integer `8` through `32`; default `8`. Development target: `32`. |
| `MEDIA_TRANSPORT` | `mesh` (default) or `sfu`. Development target: `sfu`. |
| `SFU_APP_ID` | App ID from a separately provisioned Cloudflare Realtime SFU application. |
| `SFU_APP_SECRET` | That app's secret, stored as a Worker secret, never in browser code or committed configuration. |

SFU mode fails configuration validation without both app credentials. It does **not**
fall back to mesh on API, negotiation, or connectivity errors. A welcome frame advertises
`capacity`, `mediaTransport`, and `poseBatch`. Existing deployments with unset variables
remain eight-person mesh rooms. Old browsers can still use mesh rooms; SFU rooms require
the updated media client, and the backend rejects mesh signaling in those rooms.

The existing origin allow-list, room admission/moderation, and heartbeat rules still
apply. Media requests are authorized through the admitted room WebSocket, not a public
HTTP API. The relay has no arbitrary SFU session/track proxy.

## Audio flow

`js/sfuClient.js` is loaded before `networkClient.js`; the production build derives this
order from `index.html`.

Each guest has at most four audio-only PeerConnections:

* `voicePub`: one microphone upstream, independent of the number of recipients.
* `voiceRx`: one receiving connection with separately addressable tracks for authorized
  speakers (up to 31 in a 32-person room).
* `musicPub`: one host-only broadcast upstream.
* `musicRx`: one receiving connection for the current host, only after **Listen Along**.

The existing `NetworkClient` microphone, music, recipient, and callback APIs are retained.
Voice streams continue through `AvatarManager`'s per-guest spatial audio and mute controls;
music continues through the existing network-music audio graph. Voice recipient selection
does not change chat selection. Muting one's own microphone does not stop receiving
others. Leaving Listen Along closes music only. The transport never stops a host-owned
music capture track.

The backend owns provider session IDs and publication names. Browser catalogs contain
only room-member IDs, source kind, and an opaque publication version. Clients ask to
subscribe to members, never arbitrary provider locators. The backend independently checks
membership, two-way blocks, the publisher's **Everyone / Selected people** voice audience,
and host/Listen Along music authorization at allocation time and again after API awaits.

Publication uses `sessions/new`, then `tracks/new` with an audio-only local offer.
The browser gathers ICE candidates, applies the SFU answer, waits for connection, and
acknowledges readiness before the backend advertises the publication.
Gathering waits at most five seconds; when STUN gathering is still pending but usable
host candidates exist, it submits the gathered offer rather than failing valid outbound
ICE. An offer without any candidate still fails. Connection establishment has a 30-second
ceiling, and room requests a 45-second ceiling to cover serialized provider cleanup calls.

Reception uses a separate session and batches of at most eight remote tracks per request.
The browser maps receiving `mid` values to guests **before** applying the SFU offer, gathers
its answer's ICE candidates, then the backend submits `/renegotiate`. Further mutations
wait for that exchange and connection readiness. Both browser queues and backend queues
serialize mutations; unfinished SDP sessions are never reused after failure.

## Permission revocation and recovery

Audience, block, Listen Along, membership, and host changes trigger backend reconciliation.
If any track on a receiving connection loses authorization, the relay **force-closes all
known receiving mids** and retires that connection; allowed sources are rebuilt on a fresh
session. This deliberately also retires pending negotiations. Local playback ends promptly
when the new catalog/reset arrives. Host transfer removes the previous host's publication
and resets Listen Along; the new host must advertise their own source.

Failed forced closes retain unresolved mids and retry in order. If revoking a receiver
fails, the affected publications are withdrawn and force-closed too, with an explicit
client error instead of silently continuing delivery. As with any external SFU,
server-side termination cannot be instantaneous during a provider outage; retries continue,
and honest clients stop their local PeerConnections immediately.

Known live and unresolved allocations are persisted in Durable Object storage under
`sfuCleanup`, so an object restart closes its former owned resources rather than forgetting
them. Pending API mutations are recorded before the call. A lost allocation response
retires its session, inspects it for late track allocations, and force-closes discovered
mids until session expiry confirms cleanup. Provider session expiry and explicit
`close_track_error` results are handled as appropriate cleanup outcomes. Durable Object
alarms and an active-room retry timer retain failed cleanup work. No secret is persisted
in these records.

API responses and SDP bodies are size-bounded; API calls, ICE gathering, connection waits,
and client request waits have deadlines. Per-socket token buckets, at most two queued
media operations per member, four named session slots, and at most four new sessions per
member per second bound hostile clients. Public errors are generic and never expose
credential-bearing API URLs or provider response bodies. A failed microphone publication
stops capture; retry by turning the mic on again. Music can be re-advertised by the host.
Reconnecting reconstructs media under fresh room and provider identities.
New session allocations stop if the unresolved cleanup backlog reaches 128 sessions;
the relay does not accumulate unbounded replacement resources during an SFU outage.

## Pose transport

Updated clients opt in with `poseBatch=1`. Legacy clients still receive immediate `state`
frames. For capable recipients, a 50 ms room timer sends one `states` frame containing the
latest changed pose for each visible guest:

* Under 12 metres (3D distance, including height): at most 20 Hz, including hands.
* Farther away: at most 2 Hz, hands omitted.
* Until the recipient has supplied a pose: full-detail near behavior.

The welcome includes full current snapshots for late joiners. Coalescing reads current
membership and blocks at flush time, so queued stale or blocked guests cannot leak back
in. The timer and delivery bookkeeping are cleared when the room empties. Host, show,
chat, and music control messages are not distance-filtered; their existing block rules
remain authoritative.

## Verification and remaining limits

`node --test test\sfu.test.mjs` covers server authorization and revocation, partial/lost
responses, forced-close retry, durable cleanup recovery, microphone/music client flow,
31 separately mapped incoming voice tracks, capacity, and pose coalescing. Existing
networking and real-browser mesh tests remain the compatibility baseline.

No real SFU credentials are needed for these mocked tests. Once the parent has uploaded
the development secrets and deployed the isolated relay, run the opt-in real browser test:

```powershell
$env:VRCLUB_SFU_RELAY_URL = 'wss://<isolated-dev-relay>.workers.dev'
npx playwright test sfu-media.spec.mjs
```

The fixture uses two fake-device microphones, real PeerConnections/SFU RTP, a generated
host audio tone, and a unique unlisted test room. It refuses the known production relay,
requires a development hostname, and needs no account/payment data or browser SFU secret.
It skips without the explicit relay URL. A real development headset smoke test is still
required: verify two microphones,
selected recipients, two-way blocks, host music, Listen Along revocation, and host handover.
Tests do not measure 32-person Quest rendering, voice decoding cost, real network latency,
SFU quotas/billing, or headset frame time. ICE currently uses Cloudflare's public STUN
service; restrictive networks requiring authenticated TURN are not provisioned by this
change. There is intentionally no mesh fallback.

The isolated development relay's live two-browser fixture passed on 10 October 2026,
including real microphone/music RTP, recipient withdrawal, two-way blocking/unblocking,
Listen Along withdrawal, and music after host handover. This does not replace headset
or 32-person media load testing.

Official references retrieved for this implementation (10 October 2026):

* [Connection API and OpenAPI schema](https://developers.cloudflare.com/realtime/sfu/api/)
* [Publish/receive/ICE connection patterns](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/)
* [Negotiation, forced closure, lost responses and teardown](https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/)
* [Per-track errors and explicit already-closed outcomes](https://developers.cloudflare.com/realtime/sfu/observability/error-codes/)
