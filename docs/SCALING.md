# 32-person rooms: SFU audio, safety and bounded presence

This branch combines QuestDev's scaling experiment (`8de2fd1`) with QuestProtect's
safety controls (`486d2ae`, `20d8c60`). The shared production relay was deployed on
19 October 2026 with 32 guests in every room, not just ADE rooms. Changing these
files alone does not deploy a service. Capacity is an admission limit, not a
headset performance claim.
The development-only free-VR bypass and development-host routing were not imported;
the real account/access gate and existing host-music behavior are retained.

## Configuration

The shared relay uses `worker/wrangler.toml`:

| Variable | Value / purpose |
| --- | --- |
| `ROOM_CAPACITY` | Integer `8` through `32`; unconfigured default `8`. Shared production: `32`. |
| `MEDIA_TRANSPORT` | `mesh` (default) or `sfu`. Shared production: `sfu`; required above eight guests. |
| `SFU_APP_ID` | App ID from a separately provisioned Cloudflare Realtime SFU application. |
| `SFU_APP_SECRET` | That app's secret, stored as a Worker secret, never in browser code or committed configuration. |

SFU mode fails configuration validation without both app credentials. It does **not**
fall back to mesh on API, negotiation, or connectivity errors. A welcome frame advertises
`capacity`, `mediaTransport`, and `poseBatch`. Existing deployments with unset variables
remain eight-person mesh rooms. Old browsers can still use mesh rooms; SFU rooms require
the updated media client, and the backend rejects old clients before socket admission
and rejects mesh signaling in those rooms.

## Live audio events and automatic overflow

This worktree implements audio-only live events, but **editing it does not deploy
them**. Deploy the updated Worker and every participating frontend. The
`LIVE_AUDIO_EVENT` binding points at SQLite-backed `LiveAudioEvent`;
Wrangler migration `v2-live-audio-events` creates that class on Worker deployment.
It reuses existing SFU credentials and D1's `access_rate_limits` table
(migration 0005); there is no new D1 migration. Ordinary rooms are unchanged.

### DJ and audience workflow

1. Join a room as its host. In **Online / Live DJ event**, enter a title and
   choose **Create live event**. VR has the same actions under
   **ONLINE / LIVE DJ EVENT**, using a default title.
2. **Copy private DJ link** and send it only to the performer. Keep the original:
   its publisher secret is issued on create/replacement, not recoverable later.
3. The DJ opens the lightweight `broadcast/` page on the mixer/interface computer.
   Choose **Allow audio and find inputs**, select the recording input, then
   **Start broadcasting**. Browser permission is called microphone permission;
   no camera is requested.
4. Route the stereo master/interface loopback to an OS recording input.
   ASIO-only output is not directly available to a browser; use interface loopback
   or an intentionally configured virtual audio cable. Check both meters,
   clipping and reported channels/sample rate. Monitor on hardware, not the
   delayed club return. Keep the tab open and prevent computer sleep.
5. Send **Copy audience link**, never the private DJ link, to attendees.
   `?event=<UUID>` automatically chooses available room capacity.
6. **Stop broadcasting** releases capture without ending the event.
   The owner can **Replace DJ invitation** to disconnect the old publisher,
   or **End live event**. Destructive controls require a second press within
   four seconds.

Music capture requests stereo/48 kHz, echo cancellation/noise suppression/AGC off.
Voice settings are unchanged. Opus SDP requests stereo and a 192 kbit/s target;
music senders also set a maximum bitrate. Those are requests, not guarantees of
stereo hardware or sustained network bitrate. The page reports actual input
settings and mono/unreported channels/voice-processing warnings. It has no local
speaker monitor and uploads no recording. Only broadcast music with the required
artist, venue and music permissions. No Twitch extraction, video or likeness is added.

### Admission and authority

One event-owned SFU publication goes directly to each admitted listener, without
room-host retransmission. The coordinator reserves actual capacity rather than
using directory counts, creating at most **eight private/unlisted social rooms**
at the configured room size (up to 32): **256 is a software cap, not a load-tested
audience guarantee**. Existing attendees never move. Different rooms cannot see
or voice-chat with each other. Real received audio enters the existing PA,
analyser, kick/rhythm taps, crowd, procedural DJ and lighting. Network delays
can differ; exact cross-headset beat alignment is not promised.

Any admitted host can create. The creator's pid retains rotation/end authority
after social host changes. Publisher invitations/events expire after **12 hours**;
rotation does not extend expiry. Only domain-separated capability hashes persist.
The DJ secret travels in a fragment, is removed from the address bar immediately
and authenticates in the first media WebSocket frame, never a query string.
Provider credentials/session locators remain server-side.

Listener tickets are private to admitted social members, allowing one active
listener connection each. Departure, applicable two-way blocks and moderation
revoke access. Root locks/bans are checked before overflow admission; event-room
kicks/bans cannot be bypassed through another event room. Blocking the event
creator, or being blocked by them, also removes the event subscription.
These are not ticket checks, age verification or an independent moderation service.

Creation requires D1-backed issuance limits: **60 globally, 5/IP and 3/pid per hour**.
Missing D1 or a failed limit operation must refuse creation, not bypass the caps.
A persisted **60-second per-room cooldown** applies even to failed attempts,
alongside one active event/root, a 0.2/s burst-two socket bucket and one pending
management request/socket.
Reservations last **15 seconds**, membership/media liveness **45 seconds** and
initial media authentication **10 seconds**. Even empty events expire at 12 hours.
Transient media failures retry at most three times with backoff; authorization
revocation is terminal. Interruptions are explicit and never substitute the house
set; **Listen again** retries an admitted listener. Stop, input loss, page exit,
revocation and final failure clean up tracks, audio contexts, sockets and timers.
End/expiry sends ended status before detaching rooms/restoring ordinary host music.
Old event invitations stay invalid; former overflow rooms stay private/unlisted.

### Validation limits

Coordinator tests exercise admission/overflow, leases and moderation against the
real backend classes. Browser tests use real Opus/stereo audio with a local,
test-only media bridge. These are not a production-provider rehearsal or a
256-person, venue-uplink, sustained-bitrate, physical-Quest latency/frame-time
measurement. Rehearse the actual interface, provider, network and headsets
privately before announcing a set.
See [Cloudflare's current pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)
for SFU egress; voice, Workers and Durable Objects also consume resources.

## Owner-only DEV room 000032

Use the normal **Join room** flow and enter **000032** (`private-000032`).
This is available on the updated ADE, Quest and SideQuest frontends.
No developer panel, per-visitor configuration or extra credentials
are needed. The device must already have the verified owner's API session
(headset pairing supplies it); otherwise verify the owner email through Access.
Knowing the code, supplying an email header or possessing an old invitation
cookie does not authorize admission. Ordinary VR entitlements and leases remain
unchanged; this is not a free-VR bypass.

Configuration in `worker/wrangler.toml`:

| Variable | Purpose |
| --- | --- |
| `DEV_ROOM_ENABLED` | Only the exact value `"1"` enables this one reserved room; unset/disabled refuses it. |
| `DEV_ROOM_OWNERS` | Comma-separated verified account emails permitted to enter, independent of Cloudflare Access administrator permissions. |

The client preflights `POST /payments/dev-room` using the existing credentialed,
exact-origin payment API. Only this room then opens its socket on the API host,
where the HttpOnly cookie is available. The public relay rechecks the hashed
server session, expiry, session/device revocation and owner allow-list before
resolving the Durable Object. It strips incoming authorization headers, creates
its own internal admission marker and removes the cookie before forwarding.
No account credential enters JavaScript or a WebSocket URL. Denial is explicit,
does not schedule connection retries, and a cancelled preflight cannot reconnect.
Account authorization is checked on entry/reconnection, not continuously on an
already admitted socket. No schema migration, new secret or SFU application is required.

The first real owner starts the simulation. `worker/src/devAttendees.js` gives
each guest individual activity choices on a measured navigation graph, not a shared
tour: dance, watch from a wall or balcony, chat indoors/outside, get fresh air, sit
at one of four available bar stools, either couch cushion or either balcony chair,
or visit a toilet. The resident bar regular's stool is never assigned. Guests linger
for roughly one to three minutes instead of continually circulating. At most three
ordinary guests walk simultaneously; others continue their activity rather than
queue on a corridor. Entire swept paths are reserved before departure. Human
obstructions can cause safe backtracking, never teleports. An occupied destination
is skipped or an approach is cancelled if a real player occupies it.

Real players have chair and stool priority. Selecting an NPC's seat requests `dev-seat`;
the NPC stands and leaves before the client seats the player. Occupied toilets are
the exception: their red door remains locked from outside, and neither pressing
the door nor selecting the toilet asks its occupant to leave. When an occupant
departs, the toilet door opens before walking, and seat reuse is held for 30 seconds.
The client waits for both server
occupancy and the rendered body to clear; a 15-second timeout reports that the guest
cannot yet move, rather than placing two bodies on one seat. Pending waits are
cancelled on stand, another selection, disconnect or disposal. Real occupied
furniture/toilets are never evicted. Requests are DEV-only, known-seat allow-listed
and rate-limited.

The 31 guests have distinct fictional international first names, such as Amina,
Hiroto, Priya, Kwame, Thandi and Minh. These are not real visitor/account identities.
Nearby resting guests turn toward one another and occasionally wave, nod or show
a greeting emoji. Two- and three-person groups take turns in occasional short
scripted fictional conversations shown as ordinary chat balloons, at most one
room-wide utterance per five seconds. Assets with a talking clip use it; others
keep their idle and gestures. Seated guests retain their seated pose.
Dancers face the booth and occasionally nod or cheer
with a raised-hands emoji toward the DJ. These are ordinary overhead reactions,
not a private message to the DJ, a new targeting protocol or a scripted DJ reply.
Reactions use the existing allow-lists and block-aware routing, with at least
23 seconds between a guest's social events; nobody waves instead of walking on a stair.
This is deterministic scripted behavior, not AI conversation, synthetic voice,
complete pedestrian simulation or physical prop handling.
Unit tests check actual walking surfaces, fixed-NPC clearance and furniture assignments,
and run 31 attendees for a simulated hour across five seeds and 4/10/20 Hz updates,
requiring every attendee to change activities without body overlaps or position
jumps. The hour-long tests require at most three ordinary walkers on every update and
no walking queue lasting more than 1.2 seconds (including the toilet-door opening);
the browser regression checks architectural clearance in the loaded club.

* The capacity counts **everyone present**, normally one owner and 31 fictional
  guests. Another authorized owner replaces one simulated guest; departure
  refills the spare place. No overflow past the configured capacity is allowed.
* Simulated guests use the ordinary join/state/gesture/avatar path, with explicit
  `simulated` metadata and persistent `state.dancing` for late joins, unblocks
  and detailed-body loading. Human state sanitization does not accept that field.
* They cannot host or receive host transfers. Blocks remain two-way; kicked or
  banned simulated guests are not immediately replaced or rerolled to evade it.
  The host's room lock still applies to new real arrivals.
* There are **no synthetic WebSockets or SFU members**: only real owners join
  media membership. Bots publish no voice, microphone or music; their fictional
  scripted chat is explicitly part of the simulation.
  Normal host music/lights and personal safety settings remain in use.
* Leaving the last real owner clears simulated membership, world state and
  pose/sweep timers. DEV owners must heartbeat from admission, including before
  their first ping; a lost connection is removed after 30 seconds of inactivity,
  checked by the ten-second sweeper. Synthetic guests cannot keep a room alive.
* While an owner remains connected the active 20 Hz room timer incurs Durable
  Object activity/cost. There is no autonomous unattended bot service.

This tests relay **outgoing presence fanout**, movement/animation, full-detail
pose cadence, retained bodies and client rendering. It does **not** test 31
inbound sockets, 32 independent WebRTC/SFU senders, real network congestion,
human behavior, moderation staffing or physical-headset frame time.
All tiers retain each remote guest's assigned Quaternius body; the 17 looks can
repeat. Only clearly unseen poses can pause. Use real clients for media
load and a physical headset's performance report for headset measurements.

To disable the feature, set `DEV_ROOM_ENABLED = "0"` and redeploy the Worker.
Normal public/private rooms do not gain simulated attendees.

### DEV-room release

The initial DEV-room release used Worker version `944ae909-cb98-46ef-8eea-ced720b2b626`.
Its ADE frontend was deployed at <https://a11d9b38.nocturne-ade.pages.dev>,
serving `assets/app-b6e1aae623ba.js` and service worker `vrclub-v0c0105df1939`.
The custom host's index, bundle and service worker were verified byte-for-byte,
with its non-indexing headers intact. Anonymous and spoofed-owner preflights
and WebSocket upgrades return 401 on the deployed service; wrong-origin
preflights return 403. The 722-test suite and real relay/browser/VR regression
pass. Positive owner authorization is covered with real SQLite sessions locally;
a live owner-cookie/headset join still needs an owner-device check.

The immersive-appearance update was deployed with shared Worker version
`86f0ffb6-6b10-4419-8a40-aa5123436763` and ADE deployment
<https://f111b1c1.nocturne-ade.pages.dev>, bundle `assets/app-5a55a6131ccf.js`,
service worker `vrclub-v23f949b1aa71`. All 724 tests and the DEV-room, tracked-arm
and 31-body desktop/VR browser regressions pass. The custom host's index, bundle
and service worker match the build byte-for-byte; non-indexing and anonymous
DEV-room rejection remain intact. The four verified-owner accounts remain configured.
The ordinary/SideQuest frontends have not received this appearance update.

The named/social-attendee update supersedes that Worker with version
`88e9e99f-ac64-4a70-890d-746482f6d382`. The ADE frontend remains on the same
verified build; no new frontend protocol is needed. All 726 tests and the real
DEV-room relay/browser/VR regression pass, including visible emoji rendering and
architectural clearance of the dispersed stops. Live anonymous/wrong-origin
admission remains 401/403. Leave and rejoin `000032` to start with the new guests.

The individual-activity update supersedes that release with shared Worker
`f5c889f1-6ac4-4c03-82cf-ff3dadb660e6` and ADE deployment
<https://67b25109.nocturne-ade.pages.dev>, bundle `assets/app-2d1d6e47b567.js`,
service worker `vrclub-vbd3a5d37dfc4`. All 731 tests pass. The real relay/browser/VR
regression verifies visible scripted chat balloons, real-player seat handover,
requests to vacate simulated toilets, architectural navigation clearance and
cleanup. Syntax and focused lint pass with one pre-existing unused-argument warning.
The custom host's index, JavaScript bundle and service worker match the build
byte-for-byte; noindex and anonymous/wrong-origin 401/403 checks remain intact.
Reload the ADE site and rejoin `000032` to use the new client and fresh simulation.
The ordinary and SideQuest frontends are unchanged; normal rooms gain no NPCs.
Naturalness and 32-person frame time still need a physical-headset check.

## Coordinated rollout

1. Provision or explicitly choose an SFU application for the shared relay; validate
   its quotas, billing and network requirements. Store both `SFU_APP_ID` and
   `SFU_APP_SECRET` as Worker secrets. Never put the secret in a frontend build.
2. Back up the entitlement D1 database and apply pending migrations, including
   `0009_room_capacity.sql`, before deploying the updated Worker. Migration 0009
   rebuilds only `public_rooms` with a 32-person count constraint, preserves its
   rows and expiry index, and does not change access/payment/account tables.
3. Publish SFU-capable frontends to **every site using the shared relay**, not only
   the ADE site. They remain compatible with the current eight-person mesh relay.
   Updating this branch does not update other branches or deployed sites.
4. Deploy the shared Worker with the prepared credentials and 32/SFU settings,
   using a planned maintenance window for active rooms. An SFU configuration with
   missing credentials fails explicitly; it never falls back to a 32-person mesh.
5. Validate microphone/music, public/private audiences, reports, blocks, handover,
   late joining, room occupancy and 32/33 admission on an isolated rehearsal
   deployment first, then smoke-test the deployed shared service and real headsets.

Old cached frontends cannot use SFU rooms: their upgrade request receives HTTP 426.
Guests must reload/update. Do not switch the shared relay before updating the sites.
Rollback requires `ROOM_CAPACITY=8` together with `MEDIA_TRANSPORT=mesh`; the expanded
directory schema can stay in place. No new Durable Object class migration is needed:
SFU cleanup uses the existing class's KV storage and alarms, including on the
shared relay's existing non-SQLite objects.

### Production rollout completed on 19 October 2026

The owner's Cloudflare account now has a dedicated `nocturne-production` SFU app.
Its `SFU_APP_ID` and `SFU_APP_SECRET` are installed as secrets on the shared
`vrclub-network` Worker. The existing `nocturne-dev` app and development relay
were left unchanged. Secret values were not written to the repository or logs.

The supported production frontends were published before switching the relay:

| Pages project | Production branch | Deployment |
| --- | --- | --- |
| `nocturne-vr` | `Quest` | `ed6c4a85-0ab2-4896-8b8a-2361dd1e9951` |
| `nocturne-sidequest` | `SideQuest` | `d4479860-a8fd-48c0-9d82-195af0c604fc` |
| `nocturne-ade` | `explore/ade-live-dj` | `b066208e-b2ce-4cb3-bc1d-94a3cce316b1` |

All three serve `assets/app-acdd9502aa43.js`. The ordinary and SideQuest sites
retain their normal metadata and no automatic ADE dressing; the ADE site retains
its dedicated dressing and noindex/nofollow metadata and HTTP headers.

A private SQL backup of the entitlement database was saved outside the repository.
Only pending migration `0009_room_capacity.sql` was applied; the expanded count
constraint, expiry index, and migration history were checked afterward. The shared
Worker version is `bf374783-cfd2-4030-b95a-83dc110290aa`, with capacity 32 and SFU
transport. Its existing access/payment bindings, secrets and custom API route
remain configured. No pending D1 migrations remain.

Verification: all 704 Node tests passed; the current client passed isolated live
32/33 admission and real SFU voice/music, recipient/block revocation and handover
tests without changing the development deployment. The production directory and
access API returned HTTP 200. Two private production smoke guests received
32/SFU welcomes, exchanged real SFU microphone RTP and host music, and left their
test room empty. Fake microphones and muted output were used. An initial production
attempt encountered an ICE failure; a retry with serialized publication setup
passed and verified increasing voice/music counters with no client errors. This
is not a 32-person audio-load test or physical-headset performance evidence.

These were direct deployments from the integrated ADE worktree. On 20 October
2026 the shared source updates were also merged into Quest and SideQuest, including
the optional character styles and owner-only DEV room. Their source trees exclude
ADE artwork, event dressing and pitch build/deployment commands, and retain their
existing deployment targets and normal metadata. This source integration does not
redeploy the Worker or apply migrations. Future releases must retain the SFU-capable
client before publishing against this relay.
The optional CC0 character cast brings the ordinary production payload to about
115 MiB; CI caps it at 120 MiB. Characters still load on demand for the selected
style and tier, not as an initial download of the entire cast.
Visitors never configure credentials; updated clients select the transport from
the relay's welcome. Reload old open tabs before joining.

## QuestProtect policy in both transports

The DOM and VR menus share first-use safety guidance, Report & block, and host-only
session report notifications. This is menu guidance, not a server admission check;
direct invitation joins retain their existing automatic connection behavior.
Public-room selected-recipient chat is rejected by
the relay; SFU `media-control` also rejects selected voice audiences in public rooms.
Private rooms retain independent chat and voice audiences, including all 31 other
guests. Blocks revoke SFU subscriptions as well as presence/chat signaling.
Reports go to the current room host, are rate-limited, and are not a persistent
or independently staffed event-reporting service. A host can themselves be reported;
the current protocol does not provide an independent escalation channel.
Official events still need trusted hosts/moderators, published escalation/contact
procedures, rights and ticket/admission enforcement; no ADE role or event ticket
entitlement is introduced here.

## Rendering and appearance limits

Every remote guest retains their assigned Quaternius body, independent of tier
or distance. Body construction is serialized across frames; loading or failed
appearances never expose a blue capsule. Failures are reported and retried.
Only poses clearly behind the viewer pause (130-degree hold / 115-degree resume,
with nearby guests always animated); an active restroom mirror keeps poses running.
Hidden/outdoor culling remains local and never changes shared positions or membership.
The assignable pool remains 17 people: appearances can repeat once exhausted.
Changed poses, including hands, are batched at up to 20 Hz regardless of distance;
stationary senders still heartbeat at roughly 2 Hz and send seat/height changes.
This deliberately increases simultaneous skeleton work and relay bandwidth compared
with the old 6/10/14-body and distant-2-Hz limits. Full 32-person physical-headset
frame time and traffic costs remain unmeasured.

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
* `musicRx`: one receiving connection for the current host, only while music listening
  is enabled.

The existing `NetworkClient` microphone, music, recipient, and callback APIs are retained.
Voice streams continue through `AvatarManager`'s per-guest spatial audio and mute controls;
music continues through the existing network-music audio graph. Voice recipient selection
does not change chat selection. Muting one's own microphone does not stop receiving
others. Disabling music listening closes music only. The existing app enables host-music
listening on room connection; the transport's listening authorization does not introduce
a new consent step. The transport never stops a host-owned music capture track.

The host's existing `show` frames also carry optional `dj` (room DJ presence) and
`audioFx` (nine allow-listed 0..1 control values). These fields are independent of
automatic/manual lighting, retained for late joiners, host-only and block-aware.
A guest's personal DJ hide wins without persisting the host's choice. URL listeners
apply host effects locally; file broadcasts already contain the processed mix.
While receiving one, the local effect graph is neutral even though knob readouts
retain host values, preventing doubled wet effects, noise sweeps or crossfader cuts.
Leaving/losing the host restores local settings; becoming host keeps current
effects. New clients and relay are needed for this behavior; old clients ignore
these optional fields, and an old relay strips them. This is not sample-accurate
modulation or audio synchronization.

The 19 October follow-up deployed this protocol as Worker version
`a084e575-2808-4420-9982-30596b858638` and the ADE client as Pages deployment
`210cf57f.nocturne-ade.pages.dev` (bundle `app-542e5eeaf615.js`, also verified on
`nocturne-ade.mitwee.nl`). The normal and SideQuest frontend deployments were not
changed by this follow-up; both participants need the updated ADE client for the
new DJ/effect behavior. No database migration was required. Production verification
used three temporary clients in one private room: 32-person SFU admission metadata,
all nine effect settings, DJ absence and retained late-join state. No media was
published; actual effects and VR visibility were exercised in browser regressions,
not rechecked on physical headsets.

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

* All distances and floors: at most 20 Hz, including hands.
* Identical poses are coalesced; the relay never invents extra sender updates.
* Visibility-based pose holds happen only on the receiving client.

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

No real SFU credentials are needed for these mocked tests. Once an owner has uploaded
rehearsal credentials and deployed an isolated relay, run the opt-in real browser test:

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

The source experiment records that its isolated development relay's live two-browser fixture passed on 10 October 2026,
including real microphone/music RTP, recipient withdrawal, two-way blocking/unblocking,
Listen Along withdrawal, and music after host handover. This does not replace headset
or 32-person media load testing, and is not evidence that this combined branch has
been deployed or tested against a real SFU.

Official references retrieved for this implementation (10 October 2026):

* [Connection API and OpenAPI schema](https://developers.cloudflare.com/realtime/sfu/api/)
* [Publish/receive/ICE connection patterns](https://developers.cloudflare.com/realtime/sfu/get-started/connection-patterns/)
* [Negotiation, forced closure, lost responses and teardown](https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/)
* [Per-track errors and explicit already-closed outcomes](https://developers.cloudflare.com/realtime/sfu/observability/error-codes/)
