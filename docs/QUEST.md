# Quest distribution candidate

This branch has no built-in music, no artist DJ selection and no payment integration.
It opens as a **2D setup panel** so the photosensitivity/comfort choices and Quest
keyboard are available, then enters WebXR using **Enter VR**. Do not configure
`horizonOSAppMode: immersive`: that mode needs an auto-entry/in-world setup workflow
which this candidate deliberately does not implement.

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

Music → local file, direct HTTPS audio link or SoundCloud track/set page → optional name → Save & play.
Eight saved sets are available in VR via Previous/Next and Play saved set.
Finite sets play once, do not auto-queue and are seekable when the server supports it.
SoundCloud pages open only in SoundCloud's official visible iframe player. They are not
extracted or proxied, do not enter the Web Audio graph, and therefore have no VR Club seek,
volume, beat analysis, spatialization or multiplayer sharing.
Files use the existing device picker. Local files cannot be broadcast to a room.

No third-party host is implicitly trusted for room music. A guest must select
Listen along before contacting the host's audio provider. URLs are not proxied.
Do not publish private/signed URLs into public rooms. Users need permission to
play/share their audio; user-supplied links do not automatically clear public music rights.

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
- No paid unlock or receipt validation is implemented. Decide pricing only after
  this candidate works on hardware.
