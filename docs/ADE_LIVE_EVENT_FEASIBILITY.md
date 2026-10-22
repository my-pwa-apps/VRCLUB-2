# Live venue DJ presence in NOCTURNE

Independent ADE pitch exploration, 18 October 2026.

## Recommendation

**Start with an authorized audio-only mixer feed; consider likeness later.**
This worktree now implements a browser broadcaster, event-owned SFU audio and
bounded automatic overflow across eight social rooms. This is separate from the
static ADE dressing and is not deployed merely by editing this branch.
See [the audio-only runbook](SCALING.md#live-audio-events-and-automatic-overflow).
The current procedural DJ remains fictional and music-driven.

The video and tracked-likeness options below remain future research, not shipped
features. A video performer would be flat, not a freely viewable 3D person; a
tracked likeness would require artist-approved assets and motion. Neither has
been implemented. No screen is added to the current club.

The ambition is a shared musical moment for people unable to attend IRL, with
desktop access as a first-class option. NOCTURNE is a virtual companion room, not
an exact replica of a participating Amsterdam venue. Do not promise identical
sound, atmosphere, accessibility or social experience.

## Capture options

| Option | What the guest actually sees | Venue setup | Principal trade-off | Decision |
|---|---|---|---|---|
| Conventional video | Real DJ on a flat in-booth screen | Camera, capture interface, mixer feed, encoder | Recognisable and practical, but no viewpoint parallax; camera angle can include a second set of decks | Future option, not current scope |
| Cut-out video | Camera image with its background removed | Controlled backdrop or real-time segmentation | Still flat; darkness, haze, hair and hands make edges unstable | Rehearsal experiment, not baseline |
| Tracked likeness | Optimised artist-specific rigged 3D character | Body tracking, optional gloves/face camera, capture PC, calibration and a bridge | Can be viewed in 3D, but retargeting, hands and deck contact are hard | Second phase with consenting artist |
| Markerless multi-camera motion | 3D rig driven by camera-derived movement | Several calibrated, unobstructed cameras and processing | Decks hide the lower body/hands; club light and occlusion need testing | Compare in rehearsal before buying a suit |
| Volumetric video | Reconstructed moving surface, with some viewpoint freedom | Specialist synchronised multi-camera capture, lighting and reconstruction | Cost, footprint, deck occlusion, compression and headset decode budget | Not the first club pilot |

Xsens documents live stage avatars and a 20 ms capture example [S1]; that is **not**
Internet-to-headset latency. Rokoko's own Unity plugin supports body, face and
finger data, custom bone mapping and a receiving port [S2]. This proves a capture
ecosystem exists, not that either product streams directly into Babylon. No
vendor plugin, native runtime, copied SDK or artist asset was added here.
8i demonstrates entertainment use of volumetric performances [S3]; a live
nightclub installation and browser delivery require a vendor-specific quote/test.

An artist likeness needs an approved scan or model, wardrobe and headphones,
rigging, skinning and potentially facial blendshapes. Retain recognisable silhouette
and clothing within Quest budgets; do not promise a film-quality digital human.
Use licensed assets, not scraped photos, unauthorised scans or imitated artist motion.

## Venue requirements

### Minimum camera/audio pilot

- Written venue and artist participation; a rights owner for the broadcast.
- Fixed close camera facing the DJ, avoiding identifiable audience members where
  possible; camera mount and cabling approved by venue staff.
- Clean, isolated stereo booth/FOH mixer output into a proper audio interface.
  Keep it separate from the PA feed; no interruption to the performance.
- Capture interface and encoder PC or hardware encoder, wired to a managed uplink.
- Broadcast operator, sound engineer contact, monitoring return, intercom and stop button.
- Sustained uplink headroom, a tested backup path and power protection.
- A sound check and a private full-length rehearsal in the real booth.

Working encoder target: 1080p30 video around 4-6 Mbit/s plus stereo audio. Test
720p30 for weaker clients. Reserve at least twice the measured encoder bitrate as
a starting network planning margin; this is not a guarantee. Survey congestion,
packet loss, venue firewall and cellular backup before approving the site.

### Additional tracked-avatar pilot

- Artist-approved capture wear, or a surveyed multi-camera area.
- Tracking technician, calibration space and an accurately measured deck frame.
- A PC receiving the capture vendor's output on the venue network.
- Skeleton/hand retargeting to the optimised likeness, explicit coordinate and
  metre conventions, performer identity and rig version.
- Shared capture timestamps for pose, camera and audio; drift monitoring.
- Test glove bulk, heat, magnets, tracking drift, blocked wrists and interaction
  with actual knobs, headphones and jog wheels. A suit that captures a dance is
  not proof that it captures a DJ's fine hand work.

The artist must be able to decline equipment or stop tracking without affecting
their physical performance. Design the video-only fallback before using mocap live.

## Future video / tracked-likeness architecture (not implemented)

```text
VENUE                                      BROADCAST SERVICES
camera + mixer -> encoder ----------------> managed media ingest / fan-out
                    capture timestamp         | audio + video
tracking -> vendor capture -> pose bridge -> authenticated pose fan-out
                    same capture timeline     | timestamped rig samples
                                              v
                                       WEBXR / DESKTOP CLIENT
                                  authorised event manifest + one clock
                                  media receiver / delayed pose buffer
                                  video screen or live artist rig
                                  existing PA + analysis + light show
                                              |
                                  small social room / moderation / voice
```

The media path is one-to-many. Do not send festival audio/video through the legacy
eight-person mesh or treat the integrated 32-person SFU social-audio transport as
a cleared, synchronised live-event broadcast service. Do not broadcast thousands of viewers
through one existing room Durable Object. A shared event manifest identifies
the artist asset/version, authorised playback, schedule and presentation mode;
social-room state is a different concern. Global room sharding and moderation
require additional engineering.

### Ticketing and room capacity

Organisers could sell tickets for the VR part alone, or bundle physical attendance
and digital access into a whole-experience ticket. Keep desktop access in scope
for the digital offer. Agree access windows, territories, live/replay rights,
pricing, revenue sharing, refunds and support before offering paid tickets.
The existing account/VR access gate is not an event-ticketing system.

ADE or a participating venue could configure multiple social rooms for one event,
each with a fixed maximum number of networked guests. This branch integrates
QuestDev's SFU experiment with QuestProtect safety and configures the shared relay
for 32 guests in all rooms. Credentials, migration and the coordinated production
deployment completed on 19 October 2026; see [SCALING.md](SCALING.md).
Select a pilot cap up to that limit after physical-device testing, not ticket demand. Room count
does not establish total service capacity: validate concurrent media delivery,
relay load and moderation separately before setting the ticket inventory.

Production work includes server-verified event entitlements, organiser room setup,
capacity-aware allocation/reservations for friends, full-room handling and staffed
moderation. A shared performance timeline must keep playback aligned across rooms.
These are proposed additions, not features demonstrated by the current preview.

The integrated safety controls provide desktop/VR guidance, Report & block,
host-only session report notifications and public-room audience restrictions.
SFU subscriptions obey blocks and private-room recipient choices on the server,
not only in the UI. Appoint trusted event hosts/moderators and provide an
independent escalation route: reports currently reach the room host (even when
the host is the reported person), not an ADE safety team or persistent evidence
store. Existing access recovery remains unchanged and does not validate event tickets.
See [SCALING.md](SCALING.md) for rollout prerequisites and unmeasured limits.

WHIP ingest and WHEP playback are candidates for low-latency media delivery.
One current managed-service example documents WebRTC delivery, OBS configuration
and browser playback [S4]. Provider latency is not a promise for this app. Use an
adapter and choose a service after trials, commercial terms and access-control
validation. HLS/LL-HLS is an alternative when device compatibility or scale beats
interactivity; measure its additional delay. No vendor infrastructure is provisioned.

Browsers cannot consume a venue vendor's raw UDP socket. The venue bridge must
convert output into bounded, validated, authenticated Internet-deliverable samples.
Do not reuse guest presence frames as full-body performer motion: they currently
carry player position and optional arms, not a timestamped complete performance.

For a true live rig, implement a dedicated retargeting/playback path; suspend the
procedural `DJPerformer` while it owns that rig. The same bone cannot be driven by
both an authored clip and live motion. Preserve world-space conventions, measured
deck contact, light budgets and allocation constraints. Start with a bounded
30 Hz pose stream and interpolate at render rate; profile before adding fingers
or face channels. An example uncompressed payload of 55 quaternion joints is
55 x 4 x 4 x 30 = 26,400 bytes/s per viewer **before** positions, metadata, transport
and any compression. It is an engineering estimate, not a measured feed.

## Synchronisation is the central risk

Use the same clock and capture-time identity for audio, video and motion. Audio is
the playback master. Delay the faster path to the slower path; do not simply play
poses on receipt while video buffers. Account for the PA's spatial propagation and
Web Audio processing as well as video decode. Track capture time, media playback
time, pose age, jitter and end-to-end delay separately.

- Start receivers only on an explicit listening/entry gesture and disclose streaming providers.
- Render audio and video from one synchronised media source where possible.
- Buffer/interpolate pose samples against that media clock, including late joins.
- On stale motion, show a truthful "tracking unavailable" state; do not pass off
  procedural motion as live. Hold briefly, then transition to the labelled video fallback.
- On media loss, show "broadcast interrupted" and silence that event source. The
  app's normal automatic house-set fallback must not silently claim the set continues.
- Stop/revoke delivery on the event operator's command; handle expiry, reconnect
  and discontinuities without a false LIVE indicator.

Working pilot targets (acceptance criteria to measure, **not** achieved results):
audio/video skew within +/-80 ms; motion/audio skew within +/-100 ms for at least
95% of a 30-minute rehearsal; drift under 50 ms across that rehearsal; stale motion
identified within 1 second; broadcast-loss indication within 3 seconds. Measure
with a visible clap/slate and reference recording at source and client. Set a
separate end-to-end delay target after the service trial; sub-second provider
marketing is not this measurement.

Current audio controls assume ordinary files, streams or host listening. A real
event needs a source adapter integrated with entry/resume, live non-seekable transport,
autoplay, analysis, gain, spatial PA, host/guest roles, access and teardown. Do not
bypass existing host controls with an unrelated video/audio element.

## Rights, identity and privacy gates

No public pilot until an accountable rights specialist confirms the scope in writing:

1. **ADE identity**: permission for name/logo treatment, event listing, sponsorship
   claims and venue dressing. Contact ADE through its official channels [S5, S6].
   Plain-text ADE in this private pitch is not a claim of partnership.
2. **Artist**: likeness, name, motion/face capture, model production, territories,
   duration, promotion, recording/replay, deletion and approval/withdrawal process.
   No synthetic imitation presented as the artist performing live.
3. **Venue/promoter**: camera location, capture, transmission, insurance and the
   physical/digital ticket arrangement. An IRL performance licence is not assumed
   to cover an online audiovisual broadcast.
4. **Music**: repertoire/composition, recordings/master rights, audiovisual use,
   applicable territories, live vs replay, paid access and reporting. BumaStemra's
   own livestream page warns it does not represent all rights [S7]. Sena describes
   its musicians/producers remit [S8]; **do not assume an audio webcasting licence
   clears video, every master, worldwide rights or interactive/on-demand use**.
   Ask the relevant societies, labels, publishers and counsel what this service needs.
5. **People/data**: minimisation, capture notices and any necessary releases,
   GDPR lawful basis and controller/processor roles, retention, international
   transfers, safeguarding and audience moderation. Treat recognisable performance
   data carefully; whether biometric special-category rules apply depends on use,
   not merely on calling it an avatar.

Use the existing original club set and fictional character for presentations until
real materials are authorised. No artist footage is bundled in this branch. The owner's supplied ADE26 mark and
key visual are retained solely for the pitch; no public-use licence is assumed,
and default production builds exclude them. See the
[brandpack notice](../licenses/ade-brandpack-notice.txt). No actual music licence price is estimated here.

## Pilot stages and indicative budget

These are planning allowances in EUR, **not supplier quotes**, excluding VAT,
rights/artist/venue fees and ongoing operations. Validate locally with suppliers.

| Stage | Deliverable / go-no-go | Working allowance |
|---|---|---|
| 0: discovery | Artist, venue, access advisers, rights scope, measurements and service shortlist | EUR 2k-5k |
| 1: private video rehearsal | One camera, stereo feed, end-to-end receiver and monitoring | EUR 8k-20k including engineering/crew/equipment |
| 2: likeness + mocap rehearsal | Approved optimised model, capture rental, bridge, retargeting and sync | Additional EUR 15k-40k |
| 3: invited pilot | One cleared set, small moderated audience, measured physical-headset results | Quote after stages 0-2 |

Volumetric capture is a separately quoted research track, not included. Schedule a
few weeks for a video pilot and additional weeks for likeness/tracking work, subject
to rights and availability; do not promise a particular ADE edition.

Bandwidth model: 100 viewers x 1.5 hours x 60 = **9,000 delivered viewer-minutes**.
At an assumed 5 Mbit/s combined media bitrate, that is approximately **337.5 GB**
of client delivery (decimal GB, before protocol overhead). At 1,000 viewers it is
90,000 minutes / 3.375 TB. Apply a selected provider's current delivery, ingest,
transcoding and storage pricing to these units; never equate source uplink with
viewer egress. Pose fan-out, voice and staffing are additional.

## Risks and measurable go/no-go

| Risk | Mitigation / pilot evidence |
|---|---|
| Performer looks generic or hands miss decks | Artist approval plus measured alignment in the real booth; compare video honestly |
| Tracking fails in club conditions | Full rehearsal with actual lighting, haze, equipment and wardrobe; operator fallback |
| Audio and gesture disagree | Timestamped slate test and the skew/drift targets above |
| Quest decode + club render overload | Compare same-scene A/B with and without video on physical Quest 3/3S; target the selected native refresh budget; emulator is not evidence |
| Uplink or service failure | Disconnect rehearsal, monitored backup path, clear interruption state and stop control |
| Unlicensed or unauthorised appearance | Rights checklist signed before private distribution or publicity |
| Accessibility claim exceeds experience | Paid input from disabled guests; desktop, seated, safe-mode, volume, keyboard and readable status tests |
| Social abuse or overselling capacity | Invite-only first pilot, staffed moderation and independent load testing |

## What this branch actually does

Run `npm run ade:assets` for development, or `npm run build:ade-pitch` for a private
production-format preview. Open `/?liveEvent=demo` and enter normally. It adds the
supplied official ADE26 anniversary mark, with an independent-pitch
label in the information panel. The panel has its own Close button,
Escape dismissal and an Event concept button to reopen it. Yellow logo signs are
attached to the side/front walls, repeated marks cover the DJ-table fascia, and
entrance plaques and two double-sided hanging flags flank the street door.
Decorative branding does not cover the LED wall. Static signs share materials and
are merged per artwork (four meshes total); headset cost remains unmeasured.
The existing fictional procedural DJ stays. The black XXX key visual, video screen,
local video playback and layout comparison controls were removed at the owner's
request. There is no real likeness, live ingest or audio/video-sync demonstration.

The regular club remains unchanged without the query parameter. On the dedicated
ADE site, or with the explicit pitch opt-in, the same static branding stays visible
while offline, joining, connected and in VR. Joining from an ordinary club build
does not enable ADE artwork: this is site presentation, not a relay-owned event
identity or a shared broadcast. A real event still needs server-authoritative
event identity and shared playback semantics. Teardown releases textures,
materials, meshes, listeners and the DOM-panel timer.

The official campaign artwork is not treated as freely redistributable.
`design/ade-brandpack/` retains the two supplied originals; `npm run ade:assets`
checks their SHA-256 hashes and creates bounded PNG/WebP derivatives without
cropping or recolouring. Default production builds exclude `concept-assets/`.
Only an explicit ADE build includes the logo; the removed campaign image is not shipped.
In a default production build the concept reports that pitch artwork is unavailable
rather than substituting an invented official identity. No brandpack fonts or
animated idents are used. The owner requested publication at
`https://nocturne-ade.mitwee.nl/` as a public non-indexed pitch. `npm run build:ade-site`
enables dressing without a query parameter, sets noindex/nofollow meta and HTTP
headers, and removes search/social metadata, structured data and the sitemap.
This does not restrict access or grant rights in the artwork.

The branch started at committed Quest revision `0691e9a`; the original checkout's
unfinished changes were deliberately not copied. Deployment uses the separate
`nocturne-ade` Pages project; the ordinary club remains separate. Nothing is sent to ADE.

## Verified public references

Reviewed 18 October 2026. Capabilities and pricing may change. Vendor pages establish
vendor capabilities only, not this app's implementation or performance.

- **S1** [Xsens live entertainment](https://www.xsens.com/entertainment/live-entertainment).
- **S2** [Rokoko's official Unity live plugin](https://github.com/Rokoko/rokoko-studio-live-unity):
  capture channels, receiving port, custom mapping and T-pose requirement. Consult
  vendor licensing separately; no plugin code is included.
- **S3** [8i entertainment / volumetric work](https://8i.com/).
- **S4** [Cloudflare Stream WebRTC documentation](https://developers.cloudflare.com/stream/webrtc-beta/):
  WHIP/WHEP, OBS settings and current service status. One candidate, not a commitment.
- **S5** [ADE partners](https://www.amsterdam-dance-event.nl/en/partners/).
- **S6** [ADE FAQ and contact](https://www.amsterdam-dance-event.nl/en/faq-and-contact/).
- **S7** [BumaStemra: livestreaming a music event](https://bumastemra.nl/licentie/livestreaming-muziekevenement/).
- **S8** [Sena: official remit](https://sena.nl/en).
