'use strict';
// Bar dressing: bottles and the atlas that textures them.
//
// Every bottle on the back bar and counter is one vertex-coloured mesh: a lathe profile per bottle
// style (vodka, gin, rum, whisky, bourbon, tequila, champagne, three liqueurs, lager and wine), glass
// tinted by vertex colour, labels and caps sampled from one small atlas. One draw call carries all of
// them, which is what the headset can afford. The shapes are generic and the label names are
// descriptive words, not trademarks.
//
// Geometry is pure data (no Babylon), so tests can check it without an engine. Bottles face +z in their
// own frame; BarProps.layout() turns shelf descriptions into placements.

const BarProps = (() => {
    const SEGMENTS = 12;
    const CELL = 128;
    const ATLAS = 512;
    const LABEL_HALF_ARC = 1.15; // radians either side of the front that the label covers

    // Atlas rows/columns of 128 px cells. Row 0: plain glass, plain metal. Rows 1-3: labels.
    const LABELS = ['vodka', 'gin', 'rum', 'whisky', 'bourbon', 'tequila', 'champagne', 'aperitivo', 'curacao', 'bitter', 'lager', 'wine'];
    const cellOf = name => {
        if (name === 'glass') return [0, 0];
        if (name === 'metal') return [1, 0];
        const index = LABELS.indexOf(name);
        return [index % 4, 1 + Math.floor(index / 4)];
    };
    const cellUV = (name, fu, fv) => {
        const [col, row] = cellOf(name);
        // The cell is inset a little so mip filtering never reads a neighbour.
        const inset = 4 / ATLAS;
        const u0 = col * CELL / ATLAS + inset, u1 = (col + 1) * CELL / ATLAS - inset;
        const vTop = 1 - (row * CELL / ATLAS + inset), vBottom = 1 - ((row + 1) * CELL / ATLAS - inset);
        return [u0 + (u1 - u0) * fu, vBottom + (vTop - vBottom) * fv];
    };

    // Heights in metres, bottom to top: the straight body ends at bodyTop, the shoulder at shoulderTop,
    // the glass at neckTop and the closure at capTop. `square` > 2 rounds a square section (whisky).
    const STYLES = {
        vodka: { r: 0.039, bodyTop: 0.165, shoulderTop: 0.225, neckTop: 0.262, capTop: 0.290, neckR: 0.0155, capR: 0.0175, label: 'vodka', l0: 0.035, l1: 0.14, glass: [0.78, 0.86, 0.92], cap: [0.8, 0.8, 0.82] },
        gin: { r: 0.0365, bodyTop: 0.15, shoulderTop: 0.205, neckTop: 0.272, capTop: 0.300, neckR: 0.013, capR: 0.0155, label: 'gin', l0: 0.03, l1: 0.13, glass: [0.10, 0.42, 0.28], cap: [0.75, 0.75, 0.78], square: 3 },
        rum: { r: 0.041, bodyTop: 0.13, shoulderTop: 0.178, neckTop: 0.238, capTop: 0.272, neckR: 0.0175, capR: 0.0185, label: 'rum', l0: 0.03, l1: 0.12, glass: [0.28, 0.12, 0.05], cap: [0.35, 0.2, 0.1] },
        whisky: { r: 0.045, bodyTop: 0.15, shoulderTop: 0.188, neckTop: 0.228, capTop: 0.262, neckR: 0.0185, capR: 0.021, label: 'whisky', l0: 0.025, l1: 0.13, glass: [0.55, 0.30, 0.10], cap: [0.06, 0.06, 0.07], square: 3.4 },
        bourbon: { r: 0.043, bodyTop: 0.165, shoulderTop: 0.20, neckTop: 0.245, capTop: 0.275, neckR: 0.0175, capR: 0.02, label: 'bourbon', l0: 0.03, l1: 0.14, glass: [0.50, 0.26, 0.08], cap: [0.5, 0.05, 0.05], square: 4 },
        tequila: { r: 0.042, bodyTop: 0.115, shoulderTop: 0.172, neckTop: 0.214, capTop: 0.246, neckR: 0.017, capR: 0.019, label: 'tequila', l0: 0.025, l1: 0.105, glass: [0.80, 0.64, 0.34], cap: [0.08, 0.07, 0.06] },
        champagne: { r: 0.048, bodyTop: 0.15, shoulderTop: 0.235, neckTop: 0.298, capTop: 0.320, neckR: 0.0165, capR: 0.0195, label: 'champagne', l0: 0.03, l1: 0.13, glass: [0.04, 0.16, 0.07], cap: [0.85, 0.68, 0.22], foilFrom: 0.255 },
        aperitivo: { r: 0.037, bodyTop: 0.13, shoulderTop: 0.185, neckTop: 0.235, capTop: 0.260, neckR: 0.0145, capR: 0.0165, label: 'aperitivo', l0: 0.02, l1: 0.118, glass: [0.95, 0.38, 0.05], cap: [0.9, 0.9, 0.92] },
        curacao: { r: 0.035, bodyTop: 0.14, shoulderTop: 0.20, neckTop: 0.245, capTop: 0.268, neckR: 0.0145, capR: 0.0165, label: 'curacao', l0: 0.03, l1: 0.125, glass: [0.05, 0.40, 0.95], cap: [0.9, 0.9, 0.92] },
        bitter: { r: 0.036, bodyTop: 0.12, shoulderTop: 0.17, neckTop: 0.215, capTop: 0.240, neckR: 0.0145, capR: 0.0165, label: 'bitter', l0: 0.02, l1: 0.105, glass: [0.70, 0.05, 0.07], cap: [0.8, 0.8, 0.82] },
        lager: { r: 0.0315, bodyTop: 0.10, shoulderTop: 0.16, neckTop: 0.205, capTop: 0.212, neckR: 0.0125, capR: 0.0140, label: 'lager', l0: 0.04, l1: 0.095, glass: [0.30, 0.15, 0.04], cap: [0.85, 0.68, 0.22] },
        wine: { r: 0.0375, bodyTop: 0.175, shoulderTop: 0.212, neckTop: 0.275, capTop: 0.298, neckR: 0.0158, capR: 0.0168, label: 'wine', l0: 0.045, l1: 0.145, glass: [0.05, 0.18, 0.08], cap: [0.45, 0.04, 0.08], foilFrom: 0.262 }
    };

    const squareScale = (theta, n) => {
        if (!n || n === 2) return 1;
        const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
        return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
    };

    /** The profile of one bottle as bands of [y, radius] points. */
    function bands(style) {
        const s = STYLES[style];
        const out = [];
        const neck = [];
        const shoulder = [];
        const steps = 4;
        for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const ease = 0.5 * (1 + Math.cos(Math.PI * t));
            shoulder.push([s.bodyTop + (s.shoulderTop - s.bodyTop) * t, s.neckR + (s.r - s.neckR) * ease]);
        }
        out.push({ part: 'glass', pts: [[0, s.r * 0.82], [0.004, s.r * 0.96], [0.012, s.r], [s.l0, s.r]] });
        out.push({ part: 'label', pts: [[s.l0, s.r], [s.l1, s.r]] });
        out.push({ part: 'glass', pts: [[s.l1, s.r], [s.bodyTop, s.r], ...shoulder.slice(1)] });
        const foil = s.foilFrom !== undefined;
        const lipR = s.neckR * 1.1;
        if (foil) {
            neck.push([s.shoulderTop, s.neckR], [s.foilFrom, s.neckR]);
            out.push({ part: 'glass', pts: neck });
            out.push({ part: 'metal', pts: [[s.foilFrom, s.neckR + 0.0006], [s.neckTop, s.neckR + 0.0006], [s.neckTop, lipR + 0.001]], color: s.cap });
        } else {
            neck.push([s.shoulderTop, s.neckR], [s.neckTop - 0.007, s.neckR], [s.neckTop - 0.005, lipR], [s.neckTop, lipR]);
            out.push({ part: 'glass', pts: neck });
        }
        const capBottom = s.neckTop - 0.012;
        out.push({
            part: 'metal',
            pts: [[capBottom, s.capR], [s.capTop - 0.002, s.capR], [s.capTop, s.capR * 0.92], [s.capTop, 0]],
            color: s.cap,
            top: true
        });
        for (const band of out) {
            if (band.part === 'glass') band.color = s.glass;
            if (band.part === 'label') band.color = [1, 1, 1];
        }
        return out;
    }

    const cache = new Map();

    /**
     * Local-space geometry of one bottle style, flat arrays ready for a vertex buffer.
     * @returns {{positions:number[],normals:number[],uvs:number[],colors:number[],indices:number[],height:number}}
     */
    function bottleGeometry(style, segments = SEGMENTS) {
        const key = `${style}:${segments}`;
        if (cache.has(key)) return cache.get(key);
        const s = STYLES[style];
        if (!s) throw new Error(`Unknown bottle style: ${style}`);
        const positions = [], normals = [], uvs = [], colors = [], indices = [];
        for (const band of bands(style)) {
            const rings = band.pts.length;
            const stride = segments + 1;
            const grid = [];
            for (let i = 0; i < rings; i++) {
                const [y, radius] = band.pts[i];
                const row = [];
                for (let k = 0; k <= segments; k++) {
                    const theta = -Math.PI + (2 * Math.PI * k) / segments;
                    const reach = radius * squareScale(theta, s.square);
                    row.push([Math.sin(theta) * reach, y, Math.cos(theta) * reach, theta]);
                }
                grid.push(row);
            }
            const base = positions.length / 3;
            for (let i = 0; i < rings; i++) {
                for (let k = 0; k <= segments; k++) {
                    const p = grid[i][k];
                    const left = grid[i][Math.max(0, k - 1)], right = grid[i][Math.min(segments, k + 1)];
                    const below = grid[Math.max(0, i - 1)][k], above = grid[Math.min(rings - 1, i + 1)][k];
                    const du = [right[0] - left[0], right[1] - left[1], right[2] - left[2]];
                    const dv = [above[0] - below[0], above[1] - below[1], above[2] - below[2]];
                    let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
                    let length = Math.hypot(n[0], n[1], n[2]);
                    if (length < 1e-12) { n = [0, 1, 0]; length = 1; }
                    positions.push(p[0], p[1], p[2]);
                    normals.push(n[0] / length, n[1] / length, n[2] / length);
                    let uv;
                    if (band.part === 'label') {
                        // Babylon is left-handed: a viewer facing a +z surface has -x on their right, so u
                        // must grow toward -x (against theta) for the lettering to read left to right.
                        const across = Math.min(0.5, Math.max(-0.5, -p[3] / (2 * LABEL_HALF_ARC)));
                        const along = (p[1] - band.pts[0][0]) / (band.pts[rings - 1][0] - band.pts[0][0]);
                        uv = cellUV(s.label, 0.5 + across, along);
                    } else {
                        uv = cellUV(band.part === 'metal' ? 'metal' : 'glass', 0.5, 0.5);
                    }
                    uvs.push(uv[0], uv[1]);
                    colors.push(band.color[0], band.color[1], band.color[2], 1);
                }
            }
            for (let i = 0; i < rings - 1; i++) {
                for (let k = 0; k < segments; k++) {
                    const a = base + i * stride + k, b = a + stride, c = a + 1, d = b + 1;
                    indices.push(a, b, c, c, b, d);
                }
            }
        }
        const geometry = { positions, normals, uvs, colors, indices, height: s.capTop };
        cache.set(key, geometry);
        return geometry;
    }

    /**
     * Merge placed bottles into one set of arrays.
     * @param {{style:string,x:number,y:number,z:number,yaw?:number,scale?:number}[]} placements
     */
    function mergePlacements(placements, segments = SEGMENTS) {
        const positions = [], normals = [], uvs = [], colors = [], indices = [];
        for (const placement of placements) {
            const g = bottleGeometry(placement.style, segments);
            const yaw = placement.yaw || 0, scale = placement.scale || 1;
            // Babylon's Y rotation: local +z goes to (sin yaw, cos yaw).
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            const base = positions.length / 3;
            for (let i = 0; i < g.positions.length; i += 3) {
                const x = g.positions[i] * scale, y = g.positions[i + 1] * scale, z = g.positions[i + 2] * scale;
                positions.push(placement.x + x * cos + z * sin, placement.y + y, placement.z - x * sin + z * cos);
                const nx = g.normals[i], ny = g.normals[i + 1], nz = g.normals[i + 2];
                normals.push(nx * cos + nz * sin, ny, -nx * sin + nz * cos);
            }
            for (let i = 0; i < g.uvs.length; i++) uvs.push(g.uvs[i]);
            for (let i = 0; i < g.colors.length; i++) colors.push(g.colors[i]);
            for (let i = 0; i < g.indices.length; i++) indices.push(base + g.indices[i]);
        }
        return { positions, normals, uvs, colors, indices };
    }

    /** Small deterministic generator so the shelves look the same on every load. */
    function seeded(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * Stock one shelf: groups of the same bottle, a gap, the next group. Bottles stand on the board at
     * `y`, spaced along z, all facing `yaw`.
     * `avoid` lists keep-out spans (shelf uprights): a bottle never stands across one.
     * @param {{x:number,y:number,z0:number,z1:number,styles:string[],yaw:number,seed:number,gap?:number,avoid?:{z:number,half:number}[]}} shelf
     */
    function stockShelf({ x, y, z0, z1, styles, yaw, seed, gap = 0.12, avoid = [] }) {
        const random = seeded(seed);
        const out = [];
        let z = z0;
        let styleIndex = Math.floor(random() * styles.length);
        while (z < z1) {
            const style = styles[styleIndex % styles.length];
            const group = 2 + Math.floor(random() * 3);
            for (let i = 0; i < group; i++) {
                const width = STYLES[style].r * 2 * (STYLES[style].square ? 1.08 : 1);
                for (const zone of avoid) {
                    if (z + width > zone.z - zone.half && z < zone.z + zone.half) z = zone.z + zone.half;
                }
                if (z + width > z1) return out;
                out.push({ style, x, y, z: z + width / 2, yaw: yaw + (random() - 0.5) * 0.18, scale: 1 });
                z += width + 0.012;
            }
            z += gap + random() * 0.3;
            styleIndex += 1 + Math.floor(random() * 2);
        }
        return out;
    }

    // ---------------------------------------------------------------------------------------------
    // Atlas painting (needs a 2D canvas context; Babylon DynamicTexture or a plain canvas)
    // ---------------------------------------------------------------------------------------------

    const LABEL_ART = {
        vodka: { bg: '#f4f7fb', ink: '#1b4b9a', band: '#1b4b9a', title: 'VODKA', sub: 'POLAR · 40% VOL' },
        gin: { bg: '#123a2a', ink: '#f2ead0', band: '#c9a84c', title: 'GIN', sub: 'LONDON DRY' },
        rum: { bg: '#15110d', ink: '#e0b24a', band: '#7a1f12', title: 'RUM', sub: 'AÑEJO · 12 YEARS' },
        whisky: { bg: '#efe2c0', ink: '#3b2312', band: '#3b2312', title: 'WHISKY', sub: 'SINGLE MALT' },
        bourbon: { bg: '#111', ink: '#f2ead0', band: '#b3261e', title: 'BOURBON', sub: 'STRAIGHT · 45%' },
        tequila: { bg: '#f0d9a0', ink: '#1d1d1d', band: '#d9561f', title: 'TEQUILA', sub: 'BLANCO' },
        champagne: { bg: '#0d0d0d', ink: '#e8c75a', band: '#e8c75a', title: 'CHAMPAGNE', sub: 'BRUT RÉSERVE' },
        aperitivo: { bg: '#e8571d', ink: '#fff6e8', band: '#fff6e8', title: 'APERITIVO', sub: 'ORANGE BITTER' },
        curacao: { bg: '#0b4fb3', ink: '#e6f3ff', band: '#e6f3ff', title: 'CURAÇAO', sub: 'BLUE LIQUEUR' },
        bitter: { bg: '#a50d1b', ink: '#fff2df', band: '#fff2df', title: 'BITTER', sub: 'RED APERITIF' },
        lager: { bg: '#f1c232', ink: '#8a1c12', band: '#8a1c12', title: 'LAGER', sub: 'PALE · 4.8%' },
        wine: { bg: '#f1e8d3', ink: '#5a1220', band: '#5a1220', title: 'VINO ROSSO', sub: 'RESERVA' }
    };

    function fitText(ctx, text, maxWidth, size, family) {
        let px = size;
        ctx.font = `bold ${px}px ${family}`;
        while (ctx.measureText(text).width > maxWidth && px > 8) {
            px -= 2;
            ctx.font = `bold ${px}px ${family}`;
        }
        return px;
    }

    /**
     * Paint the albedo and the packed occlusion/roughness/metallic atlases (ORM: R occlusion, G roughness,
     * B metallic). Glass is smooth, labels are paper, caps and foil are metal.
     */
    function paintAtlas(albedo, orm) {
        albedo.fillStyle = '#ffffff';
        albedo.fillRect(0, 0, ATLAS, ATLAS);
        const fillOrm = (col, row, roughness, metallic) => {
            orm.fillStyle = `rgb(255,${Math.round(roughness * 255)},${Math.round(metallic * 255)})`;
            orm.fillRect(col * CELL, row * CELL, CELL, CELL);
        };
        orm.fillStyle = 'rgb(255,150,0)';
        orm.fillRect(0, 0, ATLAS, ATLAS);
        fillOrm(0, 0, 0.07, 0);
        fillOrm(1, 0, 0.22, 1);
        const family = '"Arial Narrow", Arial, Helvetica, sans-serif';
        LABELS.forEach(name => {
            const art = LABEL_ART[name];
            const [col, row] = cellOf(name);
            const x = col * CELL, y = row * CELL;
            albedo.save();
            albedo.beginPath();
            albedo.rect(x, y, CELL, CELL);
            albedo.clip();
            albedo.fillStyle = art.bg;
            albedo.fillRect(x, y, CELL, CELL);
            // Flat edges: the label clamps at its sides where the glass turns away.
            albedo.fillStyle = art.band;
            albedo.fillRect(x, y + CELL * 0.12, CELL, CELL * 0.06);
            albedo.fillRect(x, y + CELL * 0.82, CELL, CELL * 0.06);
            albedo.textAlign = 'center';
            albedo.textBaseline = 'middle';
            albedo.fillStyle = art.ink;
            const titleSize = fitText(albedo, art.title, CELL * 0.5, 34, family);
            albedo.fillText(art.title, x + CELL / 2, y + CELL * 0.45);
            albedo.font = `bold ${Math.max(8, Math.round(titleSize * 0.36))}px ${family}`;
            albedo.fillText(art.sub, x + CELL / 2, y + CELL * 0.68);
            albedo.restore();
            // Foil-stamped champagne and rum lettering catches the light.
            if (name === 'champagne' || name === 'rum') {
                orm.fillStyle = 'rgb(255,70,90)';
                orm.fillRect(x + CELL * 0.2, y + CELL * 0.3, CELL * 0.6, CELL * 0.3);
            }
        });
    }

    return { STYLES, LABELS, SEGMENTS, ATLAS, bottleGeometry, mergePlacements, stockShelf, paintAtlas, seeded };
})();
window.BarProps = BarProps;
