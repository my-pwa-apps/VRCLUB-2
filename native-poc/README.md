# Native Quest POC

This is a feasibility build, not a store release.

It packages the production web payload inside an Android APK:

```text
APK -> file:///android_asset/web/index.html -> local HTML/JS/models/textures
```

It does **not** use the public TWA URL. The `debug` build bypasses entitlement so it can be tested before the Meta Platform
SDK is connected. The `release` build shows a locked screen until a real Meta
entitlement adapter is added; do not publish it as a paid app yet.

## Build

From the repository root:

```powershell
npm run build:native-poc
Set-Location native-poc
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The repository currently does not include a Gradle wrapper. Install a compatible
Gradle 8.x distribution or generate a wrapper locally; do not commit a downloaded
SDK, keystore or APK.

## What this proves

- The launch path has no public URL entry.
- The production payload can be copied into an APK asset directory.
- JavaScript, local storage, models and textures can be served from the APK.
- A future native entitlement gate has an explicit release boundary.

## What it does not prove

Android WebView is not the same runtime as Quest Browser. A real Quest test must
verify immersive WebXR, controllers, audio, WebGL performance and SoundCloud
iframe behaviour. If WebView cannot create an immersive session, this POC must
become a native OpenXR bridge or the project should retain the browser/TWA route.
