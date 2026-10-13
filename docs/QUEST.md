# Quest distribution candidate

This branch has no built-in music or artist DJ selection. Desktop mode is free;
immersive VR is protected by a server-verified one-time Stripe purchase.
It opens as a **2D setup panel** so the photosensitivity/comfort choices and Quest
keyboard are available, then enters WebXR using **Enter VR**. For a headset app that
opens straight into VR, start the wrapper at `https://your-domain.example/?immersive=1`
and configure `horizonOSAppMode: immersive`; see
[Immersive launch and headset pairing](#immersive-launch-and-headset-pairing).
The plain URL keeps the setup-panel flow.

## Build and test

```powershell
npm run check
npm run lint
npm test
npm run build:quest
npm run test:e2e -- "music-defaults.spec.mjs|podcast.spec.mjs|vr-session.spec.mjs"
```

Deploy **only `dist/`** to a permanent public HTTPS URL. Never publish the repository,
`quest-package/`, a signing key, an app secret or environment files.
The old podcast source/Worker utilities and Mixamo GLBs are not part of this payload.
The bundled Apache licence, CC licences, MIT licence, asset register and notices must
remain available. VR COMFORT → CREDITS / LICENCES returns to their setup-panel disclosure.

## Prepare an Android wrapper

> The scripted route is in [Build and publish the app](#build-and-publish-the-app-sidequest-or-meta-horizon-store):
> `quest:keystore`, `quest:prepare`, `quest:apk` and `quest:doctor` do the steps below, check the result and know about
> the SideQuest (no App ID) and immersive variants. This section explains the pieces.

You need:

- A Meta developer organisation, accepted distribution agreement and a real Horizon App ID.
- A permanent reverse-domain Android package ID under your control.
- A signing keystore **outside the repository**, its alias and SHA-256 certificate fingerprint.
  Back it up; every update must use the same package identity and signing key.
- A supported JDK/Android SDK and Meta's `@meta-quest/bubblewrap-cli`.
  Install these deliberately using the current [Meta guide](https://github.com/meta-quest/agentic-tools/blob/main/skills/hz-store-pwa/SKILL.md).
  The preparation command does not install tools, generate keys, sign or upload.

Example (replace every value; the fingerprint must contain all 32 hex pairs):

```powershell
npm run quest:prepare -- --url "https://your-domain.example/nocturne/" --package-id "com.yourcompany.nocturne" --app-id "YOUR_NUMERIC_META_APP_ID" --fingerprint "YOUR_CERT_SHA256" --keystore "C:\PrivateSigning\nocturne.keystore" --alias "nocturne" --version-code 1
npm run build:quest
```

This generates ignored `quest-package/twa-manifest.json` and `assetlinks.json`.
The next build copies the public certificate association into
`dist/.well-known/assetlinks.json`. **Digital Asset Links must be served at the
origin root**, even if the app is deployed under `/nocturne/`:
`https://your-domain.example/.well-known/assetlinks.json`. Copy/publish it there too.
Use a host that serves `.well-known` files; do not assume a subdirectory deployment
or GitHub Pages will establish the origin-root association.

Check the live manifest, icons, licences and asset links return HTTP 200 and correct
content types. The manifest can be served as `application/json`; assetlinks must be
JSON and must not require login. Verify the actual certificate with `keytool`, not
an invented fingerprint.

In a terminal with Meta Bubblewrap installed and configured:

```powershell
Set-Location "D:\Git Repos\VRCLUB\quest-package"
# Set BUBBLEWRAP_KEYSTORE_PASSWORD and BUBBLEWRAP_KEY_PASSWORD privately in this shell.
# Never put their values in source files, command history examples or the manifest.
bubblewrap update
bubblewrap build
```

Check Bubblewrap's final version code (update may increment it). Verify the generated
APK using Android `apksigner`, install it on a real headset, and test the complete
setup-panel → Enter VR → ADD LINKS → setup-panel → Enter VR path. A 2D wrapper's
WebXR permissions/return behaviour is a **real-device release gate**, not something
the desktop emulator proves.

Only then upload to your app's ALPHA channel using Meta's current tooling. Store
submission requires your account authentication; no credentials are requested,
stored or fabricated here. This preparation is not approval from Meta.

## Native packaging proof of concept

The `POC` branch also contains `native-poc/`, a feasibility APK that copies the
production payload into `file:///android_asset/web/` instead of opening the public
TWA URL. Build its local payload with `npm run build:native-poc`, then build
`native-poc/app` with Gradle. The debug variant has an explicit temporary entitlement
bypass for local testing; the release variant must not be published until a real
Meta entitlement adapter is implemented and tested.

This POC does not establish that Android WebView supports the full immersive WebXR
surface used by the club. A physical Quest test is required. If immersive sessions
or controller input fail in WebView, the native route needs an OpenXR bridge or a
larger native renderer port; the TWA remains the supported browser route.

## User music

Music → local file, direct HTTPS audio link or one SoundCloud track page → optional name → Play now (saves and plays) or Save to my sets (keeps whatever is playing).
Eight saved sets are available in VR via Previous/Next and Play saved set.
Finite sets play once, do not auto-queue and are seekable when the server supports it.
SoundCloud tracks play as analysed audio when their creator publishes them to podcast players.
The Worker obtains the track id from SoundCloud's public oEmbed response, verifies the public
podcast stream and relays it through the normal Web Audio graph; it never scrapes or unlocks
audio SoundCloud does not publish that way. Playlists are not supported. An unavailable track
stays saved and shows a persistent explanation. The guest may then explicitly choose
**Open in SoundCloud player**; only that fallback uses the visible iframe and the independent
120 BPM crowd/DJ clock, without club seeking, analysis, spatialization or room sharing.
Deploy `worker/` changes before relying on the resolver or stream routes in production.
Files use the existing device picker. A room host can offer a local file to consenting
listeners over the separate WebRTC music connection; the file is not uploaded to the Worker.

No third-party host is implicitly trusted for room music. A guest must select
Listen along before contacting the host's audio provider. Direct URLs are not proxied;
the verified SoundCloud podcast-stream route above is the documented exception.
Do not publish private/signed URLs into public rooms. Users need permission to
play/share their audio; user-supplied links do not automatically clear public music rights.

## Stripe-gated immersive VR

The browser never unlocks VR from a local flag or a Stripe success redirect. The
`/payments/claim` Worker route retrieves the Checkout Session from Stripe, checks
that it is paid and for the NOCTURNE VR product, records the purchase in D1, and
issues an HttpOnly session cookie. The `checkout.session.completed`,
`charge.refunded` and `charge.dispute.created` webhooks keep the entitlement
correct. Desktop preview remains available when payment is unavailable.

Apply the D1 migration to the configured database:

```powershell
Set-Location worker
npx wrangler d1 migrations apply nocturne-vr-entitlements --remote
```

The Worker config binds `api.mitwee.nl` as its custom domain and uses
`nocturne.mitwee.nl` as the app origin. Cloudflare must have the `mitwee.nl`
zone active in the same account, and the Pages project must have
`nocturne.mitwee.nl` attached before the app is published there. The Worker
custom domain creates its DNS record automatically; do not replace an existing
DNS record manually.

Configure the non-secret variables in `worker/wrangler.toml`:

```toml
APP_ORIGIN = "https://nocturne.mitwee.nl"
ALLOWED_ORIGINS = "https://nocturne-vr.pages.dev,https://nocturne.mitwee.nl"
STRIPE_PRICE_ID = "price_..." # Use a test-mode price for the test rollout.
STRIPE_MODE = "test" # Set to "live" only with the live price, API key and webhook.
```

Set secrets interactively; never put them in Git, browser code or command
arguments:

```powershell
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put SESSION_SECRET
```

Create a Stripe webhook for `https://api.mitwee.nl/payments/webhook`
with `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`charge.refunded` and `charge.dispute.created`. Use Stripe test mode first and
exercise a successful checkout, a cancelled checkout, a refund and a revoked
session before switching to live keys. Never paste secret values into chat,
source files or command arguments; set them directly at the interactive
`wrangler secret put` prompt. Use test-mode values for all three secrets and a
test-mode `STRIPE_PRICE_ID` together. `SESSION_SECRET` is independent of Stripe mode:
keep it unchanged when switching so redeemed invitations stay valid.

Checkout uses dashboard-managed payment methods, not a card-only override. Enable
Google Pay in Stripe settings; it still appears only on eligible browsers/wallets.
PayPal requires Stripe activation and linking a PayPal account. Do not assume the
Quest browser supports Google Pay merely because desktop Chrome does.

Before going live, apply `0004_payment_modes.sql`, create a live EUR 1.99 one-time
price and a live webhook, securely upload `STRIPE_LIVE_SECRET_KEY` and
`STRIPE_LIVE_WEBHOOK_SECRET`, then set the live
price and `STRIPE_MODE = "live"` and deploy. The migration labels existing purchases
as test payments; they do not grant live access. Invitations are unchanged. Checkout,
claim and webhook mode checks reject mismatched test/live configuration.
The live secrets are staged under separate names so uploading them does not alter the
running test deployment before the live-mode release. The test secrets can remain for rollback.

### Restore access and registered devices

`0005_access_recovery.sql` preserves purchases/invitations and adds hashed server
sessions, two device slots per account, short-lived email challenges, VR leases and
recovery audit history. `ACCESS_RECOVERY_ENABLED = "1"` enables the verified-email
rollout. The Worker sends transactional verification email from `access@mitwee.nl`
through the `EMAIL` binding; the domain must be onboarded to Cloudflare Email Sending.
Email Sending is a paid-plan beta, distinct from free forwarding to verified addresses.

Open **Access** (or the VR access dialog), enter the purchasing email and
request a verification code. Codes have eight digits, expire after ten minutes,
work once and allow at most five attempts. Requests are rate-limited by email,
client IP and globally; the generic email response does not reveal purchases.
Verification alone never grants VR: a valid live purchase or unrevoked invitation
must exist. Refunds/disputes are rechecked.

Name and register the device. At two devices, explicitly choose an old device to
replace; its sessions are revoked. Clearing cookies loses the device credential,
not the account grant: verify email again and replace the old slot if necessary.
Cookies last one year. Expired/missing cookies are recoverable by verified email.
Device names are user labels, not fingerprinting or proof of a physical device.
Copying a cookie remains possible; this is not DRM.

**Prepare VR** obtains a 90-second account-wide lease before the next Enter VR click,
preserving WebXR user activation. Only one device/tab can hold it. While in XR the
client renews every 20 seconds; revoked access/device or an expired lease exits XR.
The client uses the server's remaining lease duration and a monotonic clock, so
changing the device clock cannot extend access or prematurely expire it.
A crash/disconnection releases the lease by expiry. Temporary network failures cannot
extend access beyond the last confirmed expiry. Desktop preview is unaffected.

Existing paid cookies require receipt-email verification once before registering.
Existing anonymous invitation cookies can use **Link existing access** to bind the
grant to a verified email; afterward the old anonymous cookie cannot restore it.
When those old cookies are already lost, support must independently identify the
original recipient, ask them to verify an email, and use the protected dashboard's
legacy recovery action. It transfers the existing grant, never duplicates one.
Do not accept receipt screenshots or a supplied email address as proof of ownership.

## Single-use VR invitations

An owner can give someone VR access without payment. In the Quest browser, press
**Enter VR** (or **Access**), then **Use invitation code**. Enter its eight
digits with the on-screen numeric keypad, choose an email, request its verification
code, and enter those eight digits with the keypad. **Verify email** activates the
staged invitation automatically and registers this browser if a device slot is free.
Each invitation step shows only the current email or code entry, with a highlighted
next-action button. After activation, **Prepare VR** receives focus; preparation
replaces the device controls with two instructions: **Close**, then **Enter VR**.
If both slots are occupied, explicitly replace one. Then select **Prepare VR**.
After confirmation, use **Close** at the dialog's top right and press **Enter VR** again; asynchronous
redemption deliberately does not launch XR.

These remain bearer codes before use: someone can forward a
code **before** using it, but only the first verified-email redemption succeeds. The
grant then belongs to that account and is recoverable by email. Simultaneous
requests are tested against the real schema/SQL: exactly one gets a grant.
New codes are eight cryptographically random digits (including leading zeros).
Redemption attempts have persistent IP, verified-account and global rate limits.
Only their domain-separated SHA-256 hashes reach
D1, and consumption plus the entitlement grant is a single atomic SQL update.
No new secret or public code-generation endpoint is required.
The Access menu accepts numeric invitations only. Previously issued
letter-and-number hashes remain unchanged on the server. Numeric invitations and
verification codes need no headset keyboard. Email entry still uses the browser keyboard.
The invitation stays only in tab memory during verification, not browser storage.
No invitation is consumed before the email is verified; an already entitled email
restores its existing access without spending the staged invitation.

### Private issuance

The live administrator dashboard is **https://api.mitwee.nl/admin/invitations**.
Cloudflare Access protects `api.mitwee.nl/admin` and its subpaths; its Allow policy
admits only `garfieldapp@outlook.com`. Sign in through Access's email one-time PIN
(the account's configured identity provider). The application session lasts six
hours. Cloudflare account dashboard membership by itself is not an admin login.

The Worker independently verifies the Access JWT signature against the configured
team's rotating signing keys, issuer, application audience, expiry and signed
email allow-list. Every admin route, including the HTML and script, requires this
check. The `workers.dev` hostname refuses admin routes outright. Missing Access
configuration or signing-key failures fail closed. The public payment, redemption
and multiplayer routes are not behind Access.

In the dashboard:
- **Generate invitations** issues 1–20 codes with an optional private label. Save
  each code immediately and send it privately: plaintext is returned only by that
  issuance response and is never stored in D1 or shown in the list.
- **Issued invitations** lists identifiers, labels, issuance actor/time, redemption
  and revocation state, with pages of 50 records. Labels do not bind codes to a person.
- **Revoke** needs explicit confirmation and cancels an unused or redeemed grant.
  Issuance and revocation write an atomic `invitation_audit` event with the signed
  administrator email; audit records never contain plaintext codes.
- A lost issuance response can leave an issued batch with no recoverable codes.
  Check the list, revoke that batch if needed, then issue replacements.
- **Recovery support** shows the latest 50 recovery/device audit events for an account.
  Legacy recovery requires explicit confirmation, a verified recipient email and an
  existing redeemed, unlinked invitation. It records the signed administrator identity.

Backend settings in `worker/wrangler.toml` are `INVITATION_ADMIN_ORIGIN`,
`INVITATION_ADMINS`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` (none are secrets).
Apply `0003_invitation_admin.sql` before deploying dashboard code. To change
administrators, update **both** the exact-email Access policy and
`INVITATION_ADMINS`, then redeploy the Worker. Never add a Bypass/Everyone policy.
If recreating the Access application, replace `ACCESS_AUD` with its new audience.
Rollback: remove/deny the app's Allow policy to stop admin login; keep the audit
and invitation data. Ordinary VR access remains unaffected.

The CLI below remains available for owners with authenticated D1 write access:

Run from the repository root. Choose a **new** private output folder outside the
repository and every web-server root; its parent must already exist.

```powershell
npm run vr:codes -- --count 5 --out "$env:USERPROFILE\Nocturne-invites-2026-10-09"
```

This creates `invitations.json` (private codes and their hashes for your records) and
`invitations.sql` (hashes only). It prints no codes, refuses existing output folders,
and checks real parent paths to reject repository symlink aliases. Unix permissions
are restrictive; on Windows, choose a user-private folder with appropriate ACLs.
Do not use a shared/synced folder, commit either file, or paste codes into logs/chat.

Before distributing codes, apply the new migration and import the SQL through your
authenticated Wrangler account:

```powershell
Set-Location worker
npx wrangler d1 migrations apply nocturne-vr-entitlements --remote
npx wrangler d1 execute nocturne-vr-entitlements --remote --file "$env:USERPROFILE\Nocturne-invites-2026-10-09\invitations.sql"
```

Then deploy the updated Worker and built Pages site using the existing release
process. Generating files alone does **not** activate codes or publish the dialog.
Give each recipient just their own code from `invitations.json`, privately.
Re-importing the SQL is safe: it never resets redemption or revocation.

### Persistence and revocation

The grant and registered devices survive app/Worker updates in D1. Redeemed codes
stay used; email recovery restores the same grant, never reactivates the code.
Preserve the API hostname, database and session secret during updates. Old anonymous
invitations need the one-time linkage described above, not an automatic identity guess.

The owner can revoke an invitation by its non-secret `hash` from the private
records. This cancels an unused code or its redeemed grant, without altering paid
entitlements:

```powershell
npx wrangler d1 execute nocturne-vr-entitlements --remote --command "UPDATE vr_invitations SET revoked_at = datetime('now') WHERE code_hash = '<64-character hash>'"
```

Revocation takes effect on entitlement checks and the active XR lease renewal.
Another valid grant or purchase for the account still permits access. Wrong, reused and revoked codes get
the same unavailable-code response. Plaintext codes never appear in the database
or redemption error logs.

## Immersive launch and headset pairing

`?immersive=1` on the start URL makes the club do what the 2D splash and Access dialog do, inside the headset
(`js/immersiveLaunch.js`; the website and the plain URL are unchanged):

1. **Photosensitivity.** A guest with no saved choice is held in Safe Mode for the session only and sees a locked
   WELCOME page (SAFE MODE / FULL LIGHTS). The answer is saved like the splash toggle.
2. **Access.** `VRPayment.autoPrepare()` verifies the account and takes the VR lease. A registered, entitled
   headset enters VR at once. Any other headset gets a **two-minute free preview** (`ImmersiveLaunch.PREVIEW_MS`),
   then the world is veiled and only a locked pairing screen is drawn: an eight-digit code and `<host>/link`.
   The headset polls `/payments/link/poll`; when the owner approves on a phone it takes the lease for the session
   that is already running (`VRPayment.upgradeToMember()`) and the veil lifts. HOME → ACCESS reaches the code during
   the preview; EXIT VR closes the app from the locked screen.
3. **Anything else hands over to the normal 2D flow** (`manual`): another device holds the lease, the service is
   down, the browser refuses the automatic session (Enter VR then works as usual), or the guest leaves VR.
   Desktop mode stays free, so nothing here is a barrier on its own.

The pairing is an OAuth-style device code (`worker/src/deviceLink.js`, migration `0007_device_links.sql`, phone page
`link/`): `start` (headset, anonymous), `approve` (phone, verified session; registers the headset as one of the two
device slots) and `poll` (headset, with its secret). Only hashes are stored; codes live ten minutes, approval is
rate limited, and the phone page makes the owner confirm before handing the headset access. Deploy the Worker and
run the migration (`wrangler d1 migrations apply`) before relying on it.

The veil is the XR camera's layer mask (world on the default layers, the quick menu also on an extra one), so the
headset keeps tracking. The music is muted while it is up.

**Not proven here:** whether Meta's `horizonOSAppMode: immersive` wrapper starts a WebXR session without a click,
and whether a controller press counts as the user activation that lets audio start. Both are real-device gates; the
fallbacks (the Enter VR button, the first-press audio retry) are in place. Tests: `test/immersive-launch.test.mjs`
(state machine on stubs), `test/e2e/immersive-launch.spec.mjs` (Quest emulator: automatic entry, welcome, preview,
veil, approval) and `test/e2e/link-page.spec.mjs` (the phone page).

## Build and publish the app (SideQuest or Meta Horizon Store)

**SideQuest hosting.** The SideQuest build lives on its own host, `https://sidequest-nocturne.mitwee.nl/`, served by the
Cloudflare Pages project `nocturne-sidequest` (production branch `SideQuest`), separate from the main site
(`nocturne-vr`, branch `Quest`). Deploy it with `npm run deploy:sidequest`; it never touches the main domain. The shared
API (`api.mitwee.nl`) accepts both sites: `APP_ORIGIN` is the main one and `EXTRA_APP_ORIGINS` in `worker/wrangler.toml`
lists the SideQuest one (also in `ALLOWED_ORIGINS` for the multiplayer relay). Checkout returns, CORS and the emails'
"enter it only at" line follow the origin that made the request. One-time dashboard step: Workers & Pages →
`nocturne-sidequest` → Custom domains → add `sidequest-nocturne.mitwee.nl` (Cloudflare creates the DNS record itself).
Until then the same site answers at `https://nocturne-sidequest.pages.dev/`, but the API refuses that origin. Use
`--url https://sidequest-nocturne.mitwee.nl/` in `quest:prepare`: the Digital Asset Links file must be served from the
host the app opens. The page's canonical URL still names the main site, so search engines treat the SideQuest host as a copy.

Everything below runs from the repository root in PowerShell. `npm run quest:doctor` lists what is still missing at any
point (add `-- --url https://nocturne.mitwee.nl/` after the site is deployed to check it too). Only the steps marked
**YOU** need your accounts, passwords or a headset. Pick the package id once (chosen: `nocturne.vrnightclub`): it can never change.

1. **Deploy the backend and site** (section above): D1 migration, `npm run deploy:worker`, `npm run deploy:cloudflare`.
2. **YOU: create the signing key once.**
   ```powershell
   npm run quest:keystore -- --path "C:\PrivateSigning\nocturne.keystore"
   ```
   `keytool` asks for a password (use one password for the store and the key) and your name. **Back the file up twice,
   off this machine.** Losing it means you can never update the app. Then, in every shell that builds:
   ```powershell
   $env:BUBBLEWRAP_KEYSTORE_PASSWORD = Read-Host -MaskInput "Keystore password"
   $env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD
   ```
3. **Prepare the wrapper** (reads the key's fingerprint itself):
   ```powershell
   # SideQuest: no Meta App ID exists
   npm run quest:prepare -- --url https://sidequest-nocturne.mitwee.nl/ --package-id nocturne.vrnightclub --keystore "C:\PrivateSigning\nocturne.keystore" --alias nocturne --target sidequest --mode immersive --version-code 1
   # Meta Horizon Store: add your numeric App ID from the developer dashboard
   npm run quest:prepare -- --url https://sidequest-nocturne.mitwee.nl/ --package-id nocturne.vrnightclub --keystore "C:\PrivateSigning\nocturne.keystore" --alias nocturne --target meta --app-id YOUR_APP_ID --mode immersive --version-code 1
   ```
   `--mode immersive` starts the club at `/?immersive=1` with `horizonOSAppMode: immersive`; `--mode 2D` keeps the
   setup-panel flow.
4. **Publish Digital Asset Links, then check.** `npm run deploy:sidequest` (or `deploy:cloudflare` for the main site) builds `dist/` (which now carries
   `.well-known/assetlinks.json` from `quest-package/`) and publishes it. Then
   `npm run quest:doctor -- --url https://sidequest-nocturne.mitwee.nl/` must show no FAIL.
5. **Build and verify the APK:** `npm run quest:apk`. It runs Meta's Bubblewrap (through `npx`, pinned; the Google
   `@bubblewrap/cli` of the same command name ignores `horizonOSAppMode`), builds on Node 20.11.1 because newer Node
   cannot start Gradle's `.bat` on Windows (`spawn EINVAL`), keeps your version code (`--skipVersionUpgrade`), and
   fails unless `apksigner` shows the APK is signed with the certificate named in `assetlinks.json`. The result is
   `quest-package/release/nocturne-<version>-code<N>-immersive.apk`. This pipeline was run end to end with a
   throwaway key; the first run downloads the JDK and Android SDK through Bubblewrap if they are missing.
6. **YOU: test on a headset.** Enable developer mode, connect it, then
   `adb install -r quest-package\release\<the apk>`. Check: the app opens straight into VR (no URL bar), the first-run
   WELCOME choice, a linked headset enters at once, an unlinked one gets the preview and then the pairing code,
   music starts after the first controller press, and Y/B opens the menu. Anything that fails is a release blocker.
7. **Store art and text:** `npm run quest:art` writes `quest-package/store-art/` (SideQuest banner and icon).
   Draft listing text, tags and disclosures are in [STORE_LISTING.md](STORE_LISTING.md).
8. **YOU: submit.**
   - *SideQuest:* log in at dashboard.sidequestvr.com, create the app with the same package id, fill in the text,
     upload the art and screenshots (`screenshots/`) and the APK (or a direct link), and submit. Review is light.
   - *Meta Horizon Store:* an organisation admin must sign the Developer Distribution Agreement; create the app,
     note its App ID and App Secret (API tab), then upload to a test channel first:
     `ovr-platform-util upload-quest-build --app-id <id> --apk <apk> --channel ALPHA --age-group MIXED_AGES --app-secret <secret>`
     (take the secret from the dashboard; never commit it). Move through BETA/RC to STORE after review.
     **Check Meta's current store policy on external purchases first:** the VR access is sold through Stripe and
     account pairing, which Meta may not allow in a store app. SideQuest has no such rule.
9. **Updating.** Web-only changes need only `npm run deploy:cloudflare`. For a new APK (icon, name, version, mode),
   re-run step 3 with a higher `--version-code`, then steps 5 and 8 with the SAME keystore and package id.

Not proven on a real headset: that Meta's immersive wrapper opens the session without a click, and that the first
controller press starts the music (step 6 checks both).

## Remaining release gates

- Real Quest 3/3S sustained frame-time, memory, cold-start, thermal and controller testing.
  Emulator results are behavioural evidence, not headset performance certification.
- The broader controller/locomotion regression did not finish in the desktop SwiftShader
  diagnostic runs here. Re-run it on the release machine; successful XR entry alone
  does not clear that regression or the hardware gate.
- Real installation, signing verification and Digital Asset Links verification.
- Test CORS/playback with your intended user-link hosts. Standard streaming-service
  webpage links are unsupported; no unauthorised stream extraction is implemented.
- Retain source licence evidence for graffiti; identify exact wall/ceiling texture
  sources. Review third-party product marks before marketing. See `ASSETS.md`.
- Review the shipped privacy notice for your operator/contact details, retention,
  territories and actual multiplayer service. Obtain legal advice for music sharing
  and any applicable privacy/age/moderation obligations.
- Store listing, screenshots, comfort/content/age disclosures, privacy URL, support
  contact and review requirements in the current Meta dashboard.
- Configure Stripe test-mode secrets and the test-mode price, then run the payment
  flow on a real Quest before enabling live mode.
