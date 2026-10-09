import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activity = readFileSync(path.join(root, 'native-poc', 'app', 'src', 'main', 'java', 'com', 'vrclub', 'poc', 'MainActivity.java'), 'utf8');
const build = readFileSync(path.join(root, 'native-poc', 'app', 'build.gradle'), 'utf8');

test('native POC loads the payload from APK assets and has no public launch URL', () => {
    assert.match(activity, /file:\/\/\/android_asset\/web\/index\.html/);
    assert.doesNotMatch(activity, /https?:\/\/(?!localhost)/);
    assert.match(activity, /isSessionSupported\('immersive-vr'\)/);
    assert.match(build, /verifyWebPayload/);
});

test('native POC keeps release entitlement locked until Meta integration exists', () => {
    assert.match(build, /debug[\s\S]*POC_BYPASS_ENTITLEMENT.*true/);
    assert.match(build, /release[\s\S]*POC_BYPASS_ENTITLEMENT.*false/);
    assert.match(activity, /EntitlementGate\.isAllowed\(\)/);
    assert.match(readFileSync(path.join(root, 'native-poc', 'app', 'src', 'main', 'java', 'com', 'vrclub', 'poc', 'EntitlementGate.java'), 'utf8'),
        /BuildConfig\.POC_BYPASS_ENTITLEMENT/);
});
