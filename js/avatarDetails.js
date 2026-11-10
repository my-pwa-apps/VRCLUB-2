'use strict';

class AvatarDetails {
    static NPCS = {
        idris: { bald: true, facialHair: 'beard' },
        ellis: { bald: true, glasses: 'round' },
        ren: { bald: true, glasses: 'square', print: 'light' },
        amara: { glasses: 'heart' },
        asha: { glasses: 'star' },
        felix: { hat: 'fedora' },
        malik: { glasses: 'sunglasses', hat: 'cap', facialHair: 'stubble' },
        luca: { hat: 'beanie', print: 'sound' },
        eden: { hat: 'bucket' },
        diego: { print: 'orbit' },
        noah: { print: 'signal' },
        jonas: { print: 'sound' },
        rosa: { print: 'signal', cropped: true },
        iris: { print: 'orbit', cropped: true },
        alex: { print: 'light', cropped: true }
    };

    static PRINTS = {
        sound: { text: '\u97f3', meaning: 'sound', paths: [
            [[0.5, 0.06], [0.5, 0.13]], [[0.17, 0.18], [0.83, 0.18]],
            [[0.3, 0.24], [0.38, 0.35]], [[0.7, 0.24], [0.62, 0.35]],
            [[0.12, 0.4], [0.88, 0.4]], [[0.27, 0.49], [0.27, 0.92], [0.73, 0.92], [0.73, 0.49], [0.27, 0.49]],
            [[0.27, 0.7], [0.73, 0.7]]
        ] },
        light: { text: '\u5149', meaning: 'light', paths: [
            [[0.5, 0.06], [0.5, 0.4]], [[0.22, 0.17], [0.32, 0.31]], [[0.78, 0.17], [0.66, 0.31]],
            [[0.12, 0.43], [0.88, 0.43]], [[0.39, 0.46], [0.37, 0.65], [0.26, 0.83], [0.12, 0.91]],
            [[0.6, 0.46], [0.6, 0.83], [0.68, 0.9], [0.85, 0.9], [0.89, 0.75]]
        ] },
        orbit: { paths: [0.19, 0.32, 0.44].map((r, ring) => Array.from({ length: 15 }, (_, i) => {
            const angle = i / 14 * Math.PI * 1.65 + ring * 0.7;
            return [0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle)];
        })) },
        signal: { paths: Array.from({ length: 4 }, (_, row) => Array.from({ length: 11 }, (_, i) =>
            [0.08 + i * 0.084, 0.21 + row * 0.19 + Math.sin(i / 10 * Math.PI * 2 + row * 0.6) * 0.09])) }
    };

    static look(character, sourceId) {
        const id = character ? Object.keys(window.CharacterCatalog?.people || {})
            .find(key => window.CharacterCatalog.people[key].url === character.url) : window.CharacterCatalog?.npcs[sourceId];
        return this.NPCS[id] || null;
    }

    static applyNPC(meshes, character, factory, name, sourceId) {
        const look = this.look(character, sourceId);
        if (!look) return;
        for (const mesh of meshes) if (look.bald || look.hat) {
            if (/hair/i.test(mesh.material?.name || '')) mesh.setEnabled(false);
        }
        const details = this.create(meshes, character, factory, name);
        details.update(look);
        meshes.push(details.mesh);
    }

    static phone(meshes, factory, name) {
        const body = meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices());
        const bones = body?.skeleton.bones || [];
        const head = bones.find(bone => /(^|_)Head$/i.test(bone.name))?.getTransformNode();
        const hands = bones.filter(bone => /Wrist\.[LR]$/.test(bone.name))
            .map(bone => ({ node: bone.getTransformNode(), side: bone.name.slice(-1) })).filter(hand => hand.node);
        if (!head || hands.length !== 2) throw new Error('The phone caller needs measured head and wrist joints.');
        head.computeWorldMatrix(true);
        hands.forEach(hand => hand.node.computeWorldMatrix(true));
        hands.sort((a, b) => BABYLON.Vector3.DistanceSquared(a.node.getAbsolutePosition(), head.getAbsolutePosition()) -
            BABYLON.Vector3.DistanceSquared(b.node.getAbsolutePosition(), head.getAbsolutePosition()));
        const { node: hand, side } = hands[0];
        const finger = label => {
            const node = bones.find(bone => bone.name.endsWith(`${label}2.${side}`))?.getTransformNode();
            if (!node) throw new Error(`The caller has no ${label} finger landmark.`);
            node.computeWorldMatrix(true);
            return node.getAbsolutePosition();
        };
        // Joint 1 is a coincident metacarpal helper on the modular cast; joint 2 is the actual knuckle.
        const up = finger('Middle').subtract(hand.getAbsolutePosition());
        let right = finger('Index').subtract(finger('Pinky'));
        if (up.lengthSquared() < 0.0001 || right.lengthSquared() < 0.0001) throw new Error('The caller has degenerate palm landmarks.');
        up.normalize(); right.normalize();
        const normal = BABYLON.Vector3.Cross(right, up).normalize();
        if (normal.lengthSquared() < 0.5) throw new Error('The caller has no measurable palm plane.');
        right = BABYLON.Vector3.Cross(up, normal).normalize();
        if (BABYLON.Vector3.Dot(normal, head.getAbsolutePosition().subtract(hand.getAbsolutePosition())) < 0) {
            normal.negateInPlace(); right.negateInPlace();
        }
        const center = BABYLON.Vector3.Center(hand.getAbsolutePosition(), finger('Middle'))
            .add(normal.scale(0.014)).add(up.scale(0.02));
        const color = hex => {
            const c = BABYLON.Color3.FromHexString(hex).toLinearSpace();
            return new BABYLON.Color4(c.r, c.g, c.b, 1);
        };
        const box = (suffix, width, height, depth, z, hex) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(`${name}_${suffix}`, {
                width, height, depth, faceColors: Array.from({ length: 6 }, () => color(hex))
            }, body.getScene());
            mesh.position.z = z;
            return mesh;
        };
        const parts = [
            box('phoneCase', 0.068, 0.142, 0.009, 0, '#292c38'),
            box('phoneScreen', 0.059, 0.127, 0.001, 0.005, '#547d8c'),
            box('phoneSpeaker', 0.017, 0.002, 0.001, 0.006, '#13151a')
        ];
        parts[2].position.y = 0.061;
        const phone = BABYLON.Mesh.MergeMeshes(parts, true, true);
        if (!phone) throw new Error('Could not build the caller phone.');
        phone.name = `${name}_phone`;
        phone.material = factory.createPBRMaterial('callerPhone', {
            baseColor: [1, 1, 1], metallic: 0.2, roughness: 0.5
        }, true);
        const world = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromXYZAxesToRef(right, up, normal, world);
        world.setTranslation(center);
        phone.parent = hand;
        phone.rotationQuaternion = BABYLON.Quaternion.Identity();
        if (!world.multiply(hand.getWorldMatrix().clone().invert()).decompose(phone.scaling, phone.rotationQuaternion, phone.position)) {
            phone.dispose();
            throw new Error('The caller phone has an invalid hand transform.');
        }
        phone.isPickable = false;
        phone.alwaysSelectAsActiveMesh = true;
        phone.metadata = { vrclubPhone: true };
        return phone;
    }

    static create(meshes, character, factory, name) {
        const body = meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() &&
            /wardrobe_skin|_opaque$|^Crowd$/i.test(mesh.material?.name || ''));
        if (!body) throw new Error('The character has no skin mesh for fitted accessories.');
        const head = body.skeleton.bones.find(bone => /(^|_)Head$/i.test(bone.name));
        if (!head) throw new Error('The character has no head joint for fitted accessories.');
        const eye = character?.eye || this._eyes(body);
        const mesh = new BABYLON.Mesh(`${name}_adornments`, body.getScene());
        mesh.parent = body.parent;
        mesh.skeleton = body.skeleton;
        mesh.material = factory.createPBRMaterial('avatarAdornment', {
            baseColor: [1, 1, 1], metallic: 0.12, roughness: 0.65, backFaceCulling: false
        }, true);
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.metadata = { vrclubAdornment: true };
        const face = this._face(body, eye);
        let signature = '';
        return {
            mesh,
            update: look => {
                const id = window.CharacterCatalog?.players[look.base];
                const requestedPrint = look.outfit === 'casual' ? this.NPCS[id]?.print || ['orbit', 'signal', 'sound', 'light'][Number(look.base.slice(1)) % 4] :
                    look.outfit === 'original' ? this.NPCS[id]?.print : look.print;
                const print = (/^Crowd$/i.test(body.material?.name || '') ||
                    character?.printSurfaces?.[look.outfit || 'original'] === true) ? requestedPrint : null;
                const next = JSON.stringify([look.glasses, look.facialHair, look.hat, look.hairColor, look.skin, print, look.outfit, look.top]);
                if (next === signature) return;
                const geometry = this._geometry(face, look);
                const data = new BABYLON.VertexData();
                Object.assign(data, geometry);
                mesh.metadata.vrclubAuthoredGlasses = window.AvatarAccessoryAssets?.[look.glasses] ? look.glasses : null;
                mesh.metadata.vrclubAuthoredGlassesVertexCount =
                    window.AvatarAccessoryAssets?.[look.glasses]?.positions.length / 3 || 0;
                data.matricesIndices = [];
                data.matricesWeights = [];
                for (let i = 0; i < data.positions.length / 3; i++) {
                    data.matricesIndices.push(head.getIndex(), 0, 0, 0);
                    data.matricesWeights.push(1, 0, 0, 0);
                }
                mesh.metadata.vrclubPrint = print || null;
                mesh.metadata.vrclubPrintVertexStart = data.positions.length / 3;
                if (print) {
                    const clothes = look.outfit ? meshes.filter(part => part.name.includes(`wardrobe_outfit_${look.outfit}`) &&
                        /wardrobe_top_/.test(part.material?.name || '')) : [body];
                    const cropped = look.outfit ? look.outfit === 'original' && this.NPCS[id]?.cropped : look.cropped;
                    const graphic = this._printGeometry(clothes, body, print, look.top || (print === 'sound' && look.hat === 'beanie' ? '#c8c0a8' : '#303444'), cropped);
                    const offset = data.positions.length / 3;
                    for (const key of ['positions', 'colors', 'matricesIndices', 'matricesWeights']) data[key].push(...graphic[key]);
                    data.indices.push(...graphic.indices.map(index => index + offset));
                }
                if (!data.indices.length) { mesh.setEnabled(false); signature = next; return; }
                data.normals = [];
                BABYLON.VertexData.ComputeNormals(data.positions, data.indices, data.normals);
                data.applyToMesh(mesh);
                mesh.setEnabled(true);
                signature = next;
            }
        };
    }

    static _printGeometry(clothes, body, kind, top, cropped = false) {
        const pattern = this.PRINTS[kind];
        if (!pattern || !clothes.length) throw new Error(`No fitted garment for the ${kind} print.`);
        const positions = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        let high = -Infinity;
        for (let i = 1; i < positions.length; i += 3) high = Math.max(high, positions[i]);
        // Outfit masks can remove every leg vertex, so use the head's floor-relative bind height.
        const size = high * (cropped ? 0.09 : 0.125), cy = high * (cropped ? 0.765 : 0.7);
        const left = -size / 2, bottom = cy - size / 2;
        const triangles = [];
        for (const mesh of clothes) {
            const p = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind), indices = mesh.getIndices();
            const joints = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
            const weights = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
            if (!joints || !weights) throw new Error(`${mesh.name} has no clothing skin weights.`);
            for (let i = 0; i < indices.length; i += 3) {
                const tri = Array.from(indices.slice(i, i + 3), index => ({
                    p: Array.from(p.slice(index * 3, index * 3 + 3)),
                    joints: Array.from(joints.slice(index * 4, index * 4 + 4)),
                    weights: Array.from(weights.slice(index * 4, index * 4 + 4))
                }));
                if (Math.max(...tri.map(v => v.p[0])) < left || Math.min(...tri.map(v => v.p[0])) > left + size ||
                    Math.max(...tri.map(v => v.p[1])) < bottom || Math.min(...tri.map(v => v.p[1])) > bottom + size) continue;
                triangles.push(tri);
            }
        }
        if (!triangles.length) throw new Error(`${body.name} has no measurable shirt front.`);
        const zs = triangles.flatMap(tri => tri.map(v => v.p[2])), midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
        const front = triangles.filter(tri => tri.reduce((sum, v) => sum + v.p[2], 0) / 3 > midZ);
        const g = { positions: [], indices: [], colors: [], matricesIndices: [], matricesWeights: [] };
        const tint = BABYLON.Color3.FromHexString(top);
        const ink = BABYLON.Color3.FromHexString(tint.r * 0.2126 + tint.g * 0.7152 + tint.b * 0.0722 > 0.6 ? '#26313c' : '#e3ddca')
            .toLinearSpace().asArray();
        const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        for (const path of pattern.paths) for (let segment = 1; segment < path.length; segment++) {
            // People replace glTF's root reflection; reverse local X so lettering reads from outside.
            const a = [left + (1 - path[segment - 1][0]) * size, bottom + (1 - path[segment - 1][1]) * size];
            const b = [left + (1 - path[segment][0]) * size, bottom + (1 - path[segment][1]) * size];
            const dx = b[0] - a[0], dy = b[1] - a[1], r = size * 0.018 / Math.hypot(dx, dy);
            const polygon = [[a[0] - dy * r, a[1] + dx * r], [b[0] - dy * r, b[1] + dx * r],
                [b[0] + dy * r, b[1] - dx * r], [a[0] + dy * r, a[1] - dx * r]];
            for (const tri of front) {
                const [aa, bb, cc] = tri.map(v => v.p), det = cross(aa, bb, cc);
                if (Math.abs(det) < 1e-9) continue;
                let clipped = polygon;
                for (let edge = 0; edge < 3 && clipped.length; edge++) {
                    const v = tri[edge].p, w = tri[(edge + 1) % 3].p, output = [];
                    for (let i = 0; i < clipped.length; i++) {
                        const p = clipped[i], q = clipped[(i + 1) % clipped.length];
                        const d = cross(v, w, p) * Math.sign(det), e = cross(v, w, q) * Math.sign(det);
                        if (d >= 0) output.push(p);
                        if ((d >= 0) !== (e >= 0)) {
                            const t = d / (d - e);
                            output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
                        }
                    }
                    clipped = output;
                }
                clipped = clipped.filter((p, i) => Math.hypot(p[0] - clipped[(i + 1) % clipped.length][0], p[1] - clipped[(i + 1) % clipped.length][1]) > 1e-8);
                clipped = clipped.filter((p, i) => Math.abs(cross(clipped[(i + clipped.length - 1) % clipped.length], p, clipped[(i + 1) % clipped.length])) > 1e-10);
                if (clipped.length < 3) continue;
                const start = g.positions.length / 3;
                for (const point of clipped) {
                    const mix = [cross(point, bb, cc) / det, cross(aa, point, cc) / det, cross(aa, bb, point) / det];
                    g.positions.push(point[0], point[1], mix.reduce((z, weight, i) => z + weight * tri[i].p[2], 0) + 0.0015);
                    g.colors.push(...ink, 1);
                    const influences = new Map();
                    tri.forEach((v, i) => v.joints.forEach((joint, j) => influences.set(joint, (influences.get(joint) || 0) + v.weights[j] * mix[i])));
                    const selected = [...influences].filter(([, weight]) => weight > 1e-7).sort((a, b) => b[1] - a[1]).slice(0, 4);
                    const total = selected.reduce((sum, [, weight]) => sum + weight, 0);
                    if (!(total > 0)) throw new Error(`${body.name} has an unweighted print vertex.`);
                    for (let j = 0; j < 4; j++) {
                        g.matricesIndices.push(selected[j]?.[0] || 0);
                        g.matricesWeights.push(selected[j] ? selected[j][1] / total : 0);
                    }
                }
                for (let i = 1; i < clipped.length - 1; i++) {
                    if (Math.abs(cross(clipped[0], clipped[i], clipped[i + 1])) > 1e-10) g.indices.push(start, start + i, start + i + 1);
                }
            }
        }
        if (!g.indices.length) throw new Error(`${body.name} has no printable shirt surface.`);
        return g;
    }

    static _eyes(body) {
        const p = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const c = body.getVerticesData(BABYLON.VertexBuffer.ColorKind);
        if (!c) throw new Error('The lightweight character has no painted eye landmarks.');
        const stride = c.length / (p.length / 3), eye = [0, 0, 0];
        let top = -Infinity, count = 0;
        for (let i = 1; i < p.length; i += 3) top = Math.max(top, p[i]);
        for (let i = 0; i < p.length / 3; i++) {
            if (p[i * 3 + 1] < top * 0.85 ||
                [0.0307, 0.0185, 0.0116].some((v, j) => Math.abs(c[i * stride + j] - v) > 0.003)) continue;
            for (let j = 0; j < 3; j++) eye[j] += p[i * 3 + j];
            count++;
        }
        if (count < 4) throw new Error('The lightweight character has no measurable eyes.');
        return eye.map(v => v / count);
    }

    static _face(body, eye) {
        const p = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const indices = body.getIndices();
        const triangles = [];
        let top = eye[1], half = 0;
        for (let i = 0; i < p.length; i += 3) {
            if (Math.abs(p[i] - eye[0]) < 0.13 && p[i + 1] > eye[1] - 0.025) {
                top = Math.max(top, p[i + 1]);
                if (p[i + 1] < eye[1] + 0.055) half = Math.max(half, Math.abs(p[i] - eye[0]));
            }
        }
        half = Math.min(0.1, Math.max(0.06, half));
        let back = Infinity, frontZ = -Infinity;
        for (let i = 0; i < p.length; i += 3) {
            if (p[i + 1] > eye[1] + 0.035 && Math.abs(p[i] - eye[0]) < half * 1.1) {
                back = Math.min(back, p[i + 2]); frontZ = Math.max(frontZ, p[i + 2]);
            }
        }
        if (!(frontZ > back)) throw new Error(`${body.name} has no measurable crown for headwear.`);
        for (let i = 0; i < indices.length; i += 3) {
            const tri = Array.from(indices.slice(i, i + 3), index => Array.from(p.slice(index * 3, index * 3 + 3)));
            if (Math.max(...tri.map(v => v[1])) > eye[1] - 0.18 &&
                Math.min(...tri.map(v => v[0])) < eye[0] + half * 1.15 &&
                Math.max(...tri.map(v => v[0])) > eye[0] - half * 1.15) triangles.push(tri);
        }
        const front = (x, y) => {
            let z = -Infinity;
            for (const [a, b, c] of triangles) {
                const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                if (Math.abs(det) < 1e-10) continue;
                const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
                const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
                if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) z = Math.max(z, u * a[2] + v * b[2] + (1 - u - v) * c[2]);
            }
            if (!Number.isFinite(z)) throw new Error(`An accessory target (${x.toFixed(3)}, ${y.toFixed(3)}) lies outside ${body.name}'s measured face.`);
            return z + 0.002;
        };
        const project = (x, y) => {
            const edges = [];
            for (const tri of triangles) for (let i = 0; i < 3; i++) {
                const a = tri[i], b = tri[(i + 1) % 3];
                if (Math.abs(a[1] - b[1]) < 1e-8 || y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue;
                edges.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
            }
            if (!edges.length) throw new Error(`Facial hair falls outside ${body.name}'s head.`);
            const xx = Math.max(Math.min(...edges) + 0.001, Math.min(Math.max(...edges) - 0.001, x));
            return [xx, y, front(xx, y)];
        };
        const bottom = eye[1] + 0.03 * half / 0.08;
        const scalp = [];
        for (let i = 0; i < p.length; i += 3) {
            if (p[i + 1] >= bottom) scalp.push([p[i], p[i + 1], p[i + 2]]);
        }
        if (!scalp.length) throw new Error(`${body.name} has no measurable scalp for headwear.`);
        const bounds = [0, 2].map(axis => [
            Math.min(...scalp.map(point => point[axis])), Math.max(...scalp.map(point => point[axis]))
        ]);
        const crown = {
            x: (bounds[0][0] + bounds[0][1]) / 2, z: (bounds[1][0] + bounds[1][1]) / 2,
            rx: (bounds[0][1] - bounds[0][0]) / 2, rz: (bounds[1][1] - bounds[1][0]) / 2,
            bottom, top: Math.max(...scalp.map(point => point[1])), power: 2, profile: []
        };
        if (!(crown.rx > 0 && crown.rz > 0 && crown.top > bottom)) {
            throw new Error(`${body.name} has degenerate headwear landmarks.`);
        }
        const radial = point => (Math.abs((point[0] - crown.x) / crown.rx) ** crown.power +
            Math.abs((point[2] - crown.z) / crown.rz) ** crown.power) ** (1 / crown.power);
        // The lightweight heads are boxier; enlarging a circular hat to cover their corners oversizes every side.
        while (crown.power < 8 && Math.max(...scalp.map(radial)) > 1.03) crown.power++;
        for (let j = 0; j <= 12; j++) {
            const y = bottom + (crown.top - bottom) * j / 12;
            crown.profile.push(Math.max(0, ...scalp.filter(point => point[1] >= y).map(radial)));
        }
        return { eye, top, half, front, project, crown, centerZ: (back + frontZ) / 2, radiusZ: (frontZ - back) / 2 };
    }

    static _appendAuthoredGlasses(g, face, asset) {
        const [cx, ey] = face.eye;
        const [[minX, maxX], [minY, maxY], [, maxZ]] = asset.bounds;
        const scale = face.half * 1.8 / (maxX - minX);
        const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
        const faceZ = face.front(cx, ey) + 0.004;
        const offset = g.positions.length / 3;
        for (let i = 0; i < asset.positions.length; i += 3) {
            const x = cx + (asset.positions[i] - centerX) * scale;
            const y = ey + (asset.positions[i + 1] - centerY) * scale;
            const z = faceZ + (asset.positions[i + 2] - maxZ) * scale;
            g.positions.push(x, y, z);
            g.colors.push(asset.colors[i], asset.colors[i + 1], asset.colors[i + 2], 1);
        }
        g.indices.push(...asset.indices.map(index => index + offset));
    }

    static _geometry(face, look) {
        const g = { positions: [], indices: [], colors: [] };
        const colour = hex => BABYLON.Color3.FromHexString(hex).toLinearSpace().asArray();
        const dark = colour(look.hairColor || '#30251e'), gold = colour('#dfa954');
        let smooth = null;
        const vertex = (p, c) => {
            const key = smooth && [...p, ...c].join(',');
            if (smooth?.has(key)) return smooth.get(key);
            const i = g.positions.length / 3;
            g.positions.push(...p); g.colors.push(...c, 1);
            smooth?.set(key, i);
            return i;
        };
        const quad = (a, b, c, d, color) => {
            const i = [a, b, c, d].map(p => vertex(p, color));
            g.indices.push(i[0], i[1], i[2], i[0], i[2], i[3]);
        };
        const tube = (a, b, r, color) => {
            const dir = BABYLON.Vector3.FromArray(b).subtract(BABYLON.Vector3.FromArray(a)).normalize();
            const u = BABYLON.Vector3.Cross(dir, Math.abs(dir.y) < 0.9 ? BABYLON.Vector3.Up() : BABYLON.Vector3.Right()).normalize().scale(r);
            const v = BABYLON.Vector3.Cross(dir, u).normalize().scale(r);
            const ring = p => [u, v, u.negate(), v.negate()].map(d => [p[0] + d.x, p[1] + d.y, p[2] + d.z]);
            const ar = ring(a), br = ring(b);
            for (let j = 0; j < 4; j++) quad(ar[j], ar[(j + 1) % 4], br[(j + 1) % 4], br[j], color);
        };
        const [cx, ey, ez] = face.eye, s = face.half / 0.08;
        const authoredGlasses = window.AvatarAccessoryAssets?.[look.glasses];
        if (authoredGlasses) this._appendAuthoredGlasses(g, face, authoredGlasses);
        if (look.glasses && look.glasses !== 'none' && !authoredGlasses) {
            const z = Math.max(face.front(cx, ey - 0.008), face.front(cx - 0.03 * s, ey), face.front(cx + 0.03 * s, ey)) + 0.006;
            const frameColor = ['heart', 'star'].includes(look.glasses) ? colour('#df4d9b') : gold;
            for (const side of [-1, 1]) {
                const x = cx + side * 0.032 * s, points = [];
                const count = look.glasses === 'star' ? 10 : look.glasses === 'square' || look.glasses === 'sunglasses' ? 4 : 20;
                for (let i = 0; i < count; i++) {
                    const t = i / count * Math.PI * 2;
                    let dx, dy;
                    if (look.glasses === 'heart') {
                        dx = Math.pow(Math.sin(t), 3) * 0.027;
                        dy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.0015;
                    } else if (count === 4) {
                        dx = [-0.026, 0.026, 0.026, -0.026][i];
                        dy = [-0.019, -0.019, 0.019, 0.019][i];
                    } else {
                        const r = look.glasses === 'star' && i % 2 ? 0.013 : 0.026;
                        dx = Math.cos(t) * r; dy = Math.sin(t) * r;
                    }
                    points.push([x + dx * s, ey + dy * s, z]);
                }
                points.forEach((p, i) => tube(p, points[(i + 1) % count], 0.0018 * s, frameColor));
                if (look.glasses === 'sunglasses') quad(...points.slice().reverse(), colour('#191e29'));
                tube([x + side * 0.026 * s, ey, z], [cx + side * face.half, ey - 0.005, ez - 0.065 * s], 0.0018 * s, frameColor);
            }
            tube([cx - 0.007 * s, ey + 0.003 * s, z], [cx + 0.007 * s, ey + 0.003 * s, z], 0.0018 * s, frameColor);
        }
        const strip = (width, y, height, bend, color) => {
            const points = [];
            for (let i = 0; i <= 12; i++) {
                const t = i / 12 * 2 - 1, x = cx + t * width * s;
                const yy = ey + (y + bend * t * t) * s;
                points.push([face.project(x, yy), face.project(x, yy - height * s)]);
            }
            for (let i = 1; i < points.length; i++) quad(points[i - 1][0], points[i][0], points[i][1], points[i - 1][1], color);
        };
        if (look.facialHair && look.facialHair !== 'none') {
            if (['stubble', 'beard'].includes(look.facialHair)) {
                const color = look.facialHair === 'stubble' ? dark.map((c, i) => c * 0.45 + colour(look.skin || '#aa8064')[i] * 0.55) : dark;
                strip(0.038, -0.093, 0.027, 0.025, color);
            }
        }
        if (look.hat && look.hat !== 'none') {
            const hatColor = colour({ cap: '#793c9c', beanie: '#307e71', fedora: '#292936', bucket: '#252a31' }[look.hat]);
            smooth = new Map();
            const bucket = look.hat === 'bucket', fedora = look.hat === 'fedora';
            const crown = face.crown, y = crown.bottom;
            const h = crown.top - y + 0.006 * s;
            const curve = value => Math.sign(value) * Math.abs(value) ** (2 / crown.power);
            const ring = (radius, yy, angle, brim = 0) => [crown.x + curve(Math.cos(angle)) * (crown.rx * radius + brim), yy,
                crown.z + curve(Math.sin(angle)) * (crown.rz * radius + brim)];
            const radius = j => Math.max(crown.profile[Math.max(0, j - 1)] + 0.004 * s / Math.min(crown.rx, crown.rz),
                bucket || fedora ? crown.profile[0] * (1 - 0.12 * j / 12) : 0);
            const height = j => y + h * j / 12;
            for (let j = 0; j < 12; j++) for (let i = 0; i < 24; i++) {
                const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2;
                quad(ring(radius(j), height(j), a), ring(radius(j), height(j), b),
                    ring(radius(j + 1), height(j + 1), b), ring(radius(j + 1), height(j + 1), a),
                    fedora && j === 1 ? dark : hatColor);
            }
            for (let i = 0; i < 24; i++) {
                const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2;
                if (fedora || bucket) {
                    const brimY = y - (bucket ? 0.012 : 0.003) * s;
                    quad(ring(radius(0), brimY, a, 0.024 * s), ring(radius(0), brimY, b, 0.024 * s),
                        ring(radius(0), y, b), ring(radius(0), y, a), hatColor);
                }
                g.indices.push(vertex(ring(radius(12), y + h, a), hatColor),
                    vertex(ring(radius(12), y + h, b), hatColor),
                    vertex([crown.x, y + h - (fedora ? 0.004 * s : 0), crown.z], hatColor));
            }
            if (look.hat === 'cap') {
                const z = crown.z + crown.rz * radius(0) * 0.5, tip = crown.z + crown.rz * radius(0) + 0.045 * s;
                quad([crown.x - crown.rx * 0.8, y, z], [crown.x + crown.rx * 0.8, y, z],
                    [crown.x + crown.rx * 0.75, y - 0.005 * s, tip],
                    [crown.x - crown.rx * 0.75, y - 0.005 * s, tip], hatColor);
            }
        }
        return g;
    }
}

window.AvatarDetails = AvatarDetails;
