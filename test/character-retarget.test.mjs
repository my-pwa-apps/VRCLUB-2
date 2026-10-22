import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { skeleton, sampler, pose, retarget, addAnimation } from '../scripts/characters/retarget.mjs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

test('Shipped stool and low-seat clips keep elbows bent and hands close instead of reaching straight ahead', async () => {
    for (const folder of ['avatars', 'characters', 'wardrobe']) {
        const directory = new URL(`../js/models/${folder}/`, import.meta.url);
        let checked = 0;
        for (const file of readdirSync(fileURLToPath(directory)).filter(file =>
            file.endsWith('.glb') && (folder !== 'avatars' || /^club-crowd-/.test(file)))) {
            const doc = await io.read(fileURLToPath(new URL(file, directory))), sk = skeleton(doc);
            for (const animation of doc.getRoot().listAnimations().filter(animation =>
                ['Seated_Loop', 'Seated_Low_Loop'].includes(animation.getName()))) {
                const clip = sampler(animation);
                const initial = pose(sk, clip, 0);
                const fixed = ['Body', 'Foot.L', 'Foot.R'].map(name => [name, initial.get(sk.named.get(name)).p]);
                for (let frame = 0; frame <= 12; frame++) {
                    const current = pose(sk, clip, clip.duration * frame / 12);
                    const at = name => current.get(sk.named.get(name)).p;
                    for (const [name, position] of fixed) {
                        assert.ok(at(name).subtract(position).length() < 0.02,
                            `${folder}/${file}/${clip.name}: ${name} lost its seated contact`);
                    }
                    for (const side of ['L', 'R']) {
                        const shoulder = at(`UpperArm.${side}`), elbow = at(`LowerArm.${side}`), wrist = at(`Wrist.${side}`);
                        const a = shoulder.subtract(elbow).normalize(), b = wrist.subtract(elbow).normalize();
                        const angle = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * 180 / Math.PI;
                        const label = `${folder}/${file}/${clip.name}/${side}/${frame}`;
                        assert.ok(angle > 65 && angle < 155, `${label}: elbow ${angle.toFixed(1)} degrees`);
                        assert.ok(wrist.y < shoulder.y - 0.15, `${label}: hands raised out in front`);
                        assert.ok(Math.abs(wrist.z - shoulder.z) < 0.30, `${label}: hands reach beyond the lap`);
                    }
                }
                checked++;
            }
        }
        assert.ok(checked >= (folder === 'wardrobe' ? 34 : 30), `${folder}: real shipped seated clips required`);
    }
});

test('Standing detailed idles follow anatomical source torso directions without accumulating bind-axis lean', async () => {
    const sourceDoc = await io.read(fileURLToPath(new URL('../js/models/avatars/club-crowd-m6.glb', import.meta.url)));
    const source = skeleton(sourceDoc);
    for (const id of ['idris', 'mei']) {
        const targetDoc = await io.read(fileURLToPath(new URL(`../design/characters/base/${id}.glb`, import.meta.url)));
        const target = skeleton(targetDoc);
        for (const node of target.order) {
            const rest = target.local.get(node);
            node.setTranslation(rest.p.asArray()).setRotation(rest.q.asArray()).setScale(rest.s.asArray());
        }
        for (const name of ['Idle', 'Idle_Loop', 'Idle_Talking_Loop']) {
            const clip = sampler(sourceDoc.getRoot().listAnimations().find(animation => animation.getName() === name));
            const result = retarget(source, target, clip, { fingers: true, shoulderHands: true });
            assert.ok(result.metrics.maxAnkleError < 0.005, `${id}/${name}: feet lost their planted targets`);
            assert.ok(result.metrics.maxHandError < 0.025, `${id}/${name}: hand reach changed`);
            addAnimation(targetDoc, target, result);
            const output = sampler(targetDoc.getRoot().listAnimations().at(-1));
            let min = Infinity, max = -Infinity;
            for (let frame = 0; frame <= 12; frame++) {
                const time = frame * clip.duration / 12;
                const src = pose(source, clip, time), dst = pose(target, output, time);
                const direction = (sk, p, hip, neck) => p.get(sk.named.get(neck)).p.subtract(p.get(sk.named.get(hip)).p).normalize();
                const from = direction(source, src, 'Body', 'Neck'), to = direction(target, dst, 'pelvis', 'neck_01');
                const difference = Math.acos(Math.min(1, Math.max(-1, from.x * to.x + from.y * to.y + from.z * to.z)));
                assert.ok(difference < 0.04, `${id}/${name}: torso diverges ${(difference * 180 / Math.PI).toFixed(1)} degrees from the source`);
                const tilt = Math.atan2(to.z, to.y);
                assert.ok(Math.abs(tilt) < 0.14, `${id}/${name}: stationary guest bows instead of standing`);
                min = Math.min(min, tilt); max = Math.max(max, tilt);
            }
            assert.ok(max - min > 0.0005, `${id}/${name}: standing breath/weight motion was erased`);
        }
    }
});

test('Shipped detailed people and wardrobe bodies stand upright throughout their idle clips', async () => {
    const direction = (sk, p) => p.get(sk.named.get('Neck')).p.subtract(p.get(sk.named.get('Body')).p).normalize();
    for (const folder of ['characters', 'wardrobe']) {
        const directory = new URL(`../js/models/${folder}/`, import.meta.url);
        let checked = 0;
        for (const file of readdirSync(fileURLToPath(directory)).filter(file => file.endsWith('.glb'))) {
            const doc = await io.read(fileURLToPath(new URL(file, directory)));
            const sk = skeleton(doc);
            for (const animation of doc.getRoot().listAnimations().filter(a =>
                ['Idle', 'Idle_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop'].includes(a.getName()))) {
                const clip = sampler(animation);
                for (let frame = 0; frame <= 12; frame++) {
                    const torso = direction(sk, pose(sk, clip, clip.duration * frame / 12));
                    assert.ok(Math.abs(Math.atan2(torso.z, torso.y)) < 0.14,
                        `${folder}/${file}/${clip.name}: regenerated idle still leans forward`);
                }
                checked++;
            }
        }
        assert.ok(checked >= (folder === 'characters' ? 31 : 17), `${folder}: actual shipped idles required`);
    }
});
