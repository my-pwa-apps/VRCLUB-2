'use strict';
// The club restroom's wall art: event posters, a backlit NOCTURNE light box, a sticker sheet, marker tags and the
// safety and hygiene signs a real club restroom has. Everything is painted at runtime into ONE 2048 x 1024 atlas (no
// image files, no web fonts that a headset might lack) and placed as flat quads, so the whole wall treatment is two
// draw calls (lit posters and decals, one emissive light box).
//
// This file is pure data and Canvas 2D painters (no Babylon): the cells, the placement plan and the surfaces the
// placements must sit on are checked by unit tests without an engine. The words are generic, never real brands.

const RestroomArt = (() => {
    const ATLAS = { width: 2048, height: 1024 };

    // Atlas cells in pixels: x, y, w, h. Aspect ratios match the quads that sample them.
    const CELLS = {
        lightbox: [0, 0, 640, 896],
        flyerSun: [640, 0, 448, 640],
        stickers: [1536, 0, 512, 512],
        tags: [640, 640, 512, 384],
        help: [1152, 640, 448, 384],
        hygiene: [1600, 640, 448, 384]
    };
    // Stickers and tags are die-cut: their atlas background is transparent and the material alpha-tests it.
    const TRANSPARENT = new Set(['stickers', 'tags']);

    // Surfaces a poster may sit on, in the club's own coordinates. `normal` is the way the surface faces (into the room),
    // `at` its plane, `lateral` the free range along the wall and `y` the free height range.
    const SURFACES = {
        back: { normal: '+x', at: -16.4, lateral: [-4.575, -2.825], y: [0.2, 3.0] },
        dividerA: { normal: '+z', at: -4.575, lateral: [-16.4, -14.45], y: [0.2, 2.1] },
        dividerAIn: { normal: '-z', at: -4.625, lateral: [-16.4, -14.45], y: [0.2, 2.1] },
        dividerB: { normal: '-z', at: -2.825, lateral: [-16.4, -14.45], y: [0.2, 2.1] },
        wallEntrance: { normal: '-z', at: -1.2, lateral: [-16.4, -14.45], y: [0.2, 2.1] }
    };

    // The placements. `along` is x for a wall facing +-z and z for one facing +-x; w and h are the quad's size in metres.
    // Deliberately sparse: a backlit poster, one flyer and one sign in the aisle, and one thing to read inside each stall.
    const PLAN = [
        // The end of the aisle: a backlit NOCTURNE poster in a dark steel box.
        { cell: 'lightbox', kind: 'lightbox', surface: 'back', along: -3.7, y: 1.6, w: 0.9, h: 1.26 },
        { cell: 'flyerSun', kind: 'poster', surface: 'dividerA', along: -15.4, y: 1.5, w: 0.42, h: 0.6 },
        { cell: 'hygiene', kind: 'poster', surface: 'dividerB', along: -15.4, y: 1.5, w: 0.56, h: 0.48 },
        // Inside the stalls, where somebody sits long enough to read it.
        { cell: 'help', kind: 'poster', surface: 'dividerAIn', along: -15.2, y: 1.5, w: 0.42, h: 0.36 },
        { cell: 'tags', kind: 'decal', surface: 'wallEntrance', along: -15.2, y: 1.3, w: 0.5, h: 0.375 }
    ];

    // Art on the two stall doors, in the leaf's own frame: `along` runs from the hinge toward the free edge.
    // `side` 'out' is the hall face, 'in' the face the person on the toilet sees. Just a few stickers on the inside.
    const DOORS = [
        { cell: 'stickers', side: 'in', along: 0.62, y: 1.2, w: 0.42, h: 0.42 }
    ];

    /** A small deterministic generator, so the atlas is the same on every device and every load. */
    const rng = seed => () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

    /** Texture coordinates for a cell, inset a little so mip filtering never reads a neighbour. */
    function uv(cell) {
        const [x, y, w, h] = CELLS[cell];
        const inset = 3;
        return {
            u0: (x + inset) / ATLAS.width, u1: (x + w - inset) / ATLAS.width,
            vTop: 1 - (y + inset) / ATLAS.height, vBottom: 1 - (y + h - inset) / ATLAS.height
        };
    }

    // Wrap text into lines no wider than maxWidth, drawn centred from y.
    function paragraph(ctx, text, cx, y, maxWidth, lineHeight) {
        const lines = [];
        let line = '';
        for (const word of text.split(' ')) {
            const next = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
        return y + lines.length * lineHeight;
    }

    function spaced(ctx, value) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = value;
    }

    const BOLD = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
    const SCRIPT = '"Brush Script MT", "Segoe Script", "Comic Sans MS", cursive';

    // --- the backlit NOCTURNE poster ---------------------------------------------------------------------------------
    function paintLightbox(ctx, W, H) {
        const random = rng(11);
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#05031a');
        sky.addColorStop(0.55, '#1a0638');
        sky.addColorStop(1, '#4a0f56');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 110; i++) {
            ctx.fillStyle = rgba(255, 255, 255, 0.25 + random() * 0.6);
            const s = random() < 0.1 ? 3 : 1.6;
            ctx.fillRect(random() * W, random() * H * 0.62, s, s);
        }
        // A crescent moon.
        const moon = ctx.createRadialGradient(W * 0.72, H * 0.17, 8, W * 0.72, H * 0.17, 110);
        moon.addColorStop(0, '#fff6e0');
        moon.addColorStop(1, '#bfa9ff');
        ctx.fillStyle = moon;
        ctx.beginPath(); ctx.arc(W * 0.72, H * 0.17, 82, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0c0522';
        ctx.beginPath(); ctx.arc(W * 0.72 + 38, H * 0.17 - 14, 74, 0, Math.PI * 2); ctx.fill();
        // The skyline with a few lit windows.
        let x = -10;
        while (x < W) {
            const bw = 34 + random() * 54, bh = 90 + random() * 230;
            ctx.fillStyle = '#06020f';
            ctx.fillRect(x, H - bh, bw, bh);
            for (let wy = H - bh + 12; wy < H - 14; wy += 18) {
                for (let wx = x + 7; wx < x + bw - 9; wx += 14) {
                    if (random() < 0.22) {
                        ctx.fillStyle = random() < 0.3 ? '#ff6ad5' : '#ffd88a';
                        ctx.fillRect(wx, wy, 6, 8);
                    }
                }
            }
            x += bw + 2;
        }
        // The wordmark, in the club's own letterforms, as a neon tube with a halo.
        const logo = typeof window !== 'undefined' ? window.NocturneLogo : null;
        if (logo && typeof Path2D !== 'undefined') {
            const path = new Path2D(logo.path());
            const scale = (W * 0.84) / logo.WIDTH;
            ctx.save();
            ctx.translate(W * 0.08, H * 0.4);
            ctx.scale(scale, scale);
            ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.miterLimit = 10;
            const run = (width, colour, blur, glow) => {
                ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.shadowBlur = blur; ctx.shadowColor = glow;
                ctx.stroke(path);
            };
            const T = logo.STROKE * 1.35;   // a heavier tube than the street sign: a poster is seen from further away
            run(T * 1.3, 'rgba(255,60,200,0.9)', 46, 'rgba(255,40,190,1)');
            run(T * 1.15, 'rgba(255,170,235,0.95)', 18, 'rgba(255,60,200,1)');
            run(T, '#ffe6f8', 0, 'rgba(0,0,0,0)');
            run(T * 0.42, '#ffffff', 0, 'rgba(0,0,0,0)');
            ctx.restore();
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#9fe8ff';
        ctx.font = `700 24px ${BOLD}`;
        spaced(ctx, '5px');
        ctx.fillText('ALL NIGHT  /  EVERY NIGHT', W / 2, H * 0.58);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `600 17px ${BOLD}`;
        spaced(ctx, '3px');
        ctx.fillText('DEEP HOUSE  -  TECHNO  -  AFTER HOURS', W / 2, H * 0.635);
        spaced(ctx, '0px');
        ctx.strokeStyle = 'rgba(159,232,255,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 18, W - 36, H - 36);
        ctx.strokeStyle = 'rgba(255,60,200,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(28, 28, W - 56, H - 56);
    }

    // --- a retro sunburst rave flyer -----------------------------------------------------------------------------------
    function paintFlyerSun(ctx, W, H) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#2b0a5e');
        bg.addColorStop(0.55, '#d6247f');
        bg.addColorStop(1, '#ff9a3c');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H * 0.6;
        for (let i = 0; i < 24; i++) {
            ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0)';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, H, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }
        const sun = ctx.createLinearGradient(0, cy - 120, 0, cy + 120);
        sun.addColorStop(0, '#fff27a');
        sun.addColorStop(1, '#ff4fa3');
        ctx.fillStyle = sun;
        ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c11a72';
        for (let i = 0; i < 6; i++) ctx.fillRect(cx - 124, cy + 14 + i * 20, 248, 3 + i * 1.6);
        ctx.fillStyle = '#240a4f';
        ctx.fillRect(0, cy + 112, W, H - cy - 112);
        ctx.strokeStyle = 'rgba(80,235,255,0.85)';
        ctx.lineWidth = 2;
        for (let i = -8; i <= 8; i++) {
            ctx.beginPath(); ctx.moveTo(cx + i * 14, cy + 112); ctx.lineTo(cx + i * 70, H); ctx.stroke();
        }
        for (let i = 1; i <= 6; i++) {
            const y = cy + 112 + (i * i) * 4.6;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.font = `900 96px ${BOLD}`;
        ctx.lineWidth = 10; ctx.strokeStyle = '#ff2f9a';
        ctx.strokeText('DEEP', cx, 112);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('DEEP', cx, 112);
        ctx.font = `900 50px ${BOLD}`;
        ctx.lineWidth = 7;
        ctx.strokeText('HOUSE NIGHTS', cx, 170);
        ctx.fillText('HOUSE NIGHTS', cx, 170);
        ctx.fillStyle = '#fff';
        ctx.font = `700 22px ${BOLD}`;
        spaced(ctx, '3px');
        ctx.fillText('VOL. 07  -  SATURDAY  -  23:00 TILL LATE', cx, H - 26);
        spaced(ctx, '0px');
    }

    // --- a die-cut sticker sheet ---------------------------------------------------------------------------------------
    function stickerPath(ctx, kind, r) {
        ctx.beginPath();
        if (kind === 'star') {
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r;
                ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d);
            }
            ctx.closePath();
        } else if (kind === 'heart') {
            ctx.moveTo(0, r * 0.9);
            ctx.bezierCurveTo(-r * 1.3, r * 0.1, -r * 0.7, -r * 0.9, 0, -r * 0.35);
            ctx.bezierCurveTo(r * 0.7, -r * 0.9, r * 1.3, r * 0.1, 0, r * 0.9);
        } else if (kind === 'bolt') {
            ctx.moveTo(r * 0.25, -r); ctx.lineTo(-r * 0.55, r * 0.1); ctx.lineTo(-r * 0.05, r * 0.1);
            ctx.lineTo(-r * 0.3, r); ctx.lineTo(r * 0.6, -r * 0.18); ctx.lineTo(r * 0.08, -r * 0.18); ctx.closePath();
        } else if (kind === 'label') {
            const w = r * 1.9, h = r * 1.05, c = r * 0.18;
            ctx.moveTo(-w + c, -h); ctx.lineTo(w - c, -h); ctx.quadraticCurveTo(w, -h, w, -h + c);
            ctx.lineTo(w, h - c); ctx.quadraticCurveTo(w, h, w - c, h); ctx.lineTo(-w + c, h);
            ctx.quadraticCurveTo(-w, h, -w, h - c); ctx.lineTo(-w, -h + c); ctx.quadraticCurveTo(-w, -h, -w + c, -h);
            ctx.closePath();
        } else {
            ctx.arc(0, 0, r, 0, Math.PI * 2);
        }
    }

    function drawSticker(ctx, kind, cx, cy, r, rot, text) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.lineJoin = 'round';
        // The die-cut border.
        stickerPath(ctx, kind, r + 5);
        ctx.fillStyle = '#f6f3ea';
        ctx.fill();
        ctx.lineWidth = 10; ctx.strokeStyle = '#f6f3ea'; ctx.stroke();
        stickerPath(ctx, kind, r);
        if (kind === 'smiley') {
            ctx.fillStyle = '#ffd400'; ctx.fill();
            ctx.fillStyle = '#101010';
            ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.2, r * 0.11, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.2, r * 0.11, 0, Math.PI * 2); ctx.fill();
            ctx.lineWidth = r * 0.12; ctx.lineCap = 'round'; ctx.strokeStyle = '#101010';
            ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.5, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
        } else if (kind === 'star') {
            ctx.fillStyle = '#ff2f9a'; ctx.fill();
        } else if (kind === 'heart') {
            ctx.fillStyle = '#e8222f'; ctx.fill();
        } else if (kind === 'bolt') {
            ctx.fillStyle = '#ffe14a'; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#101010'; ctx.stroke();
        } else if (kind === 'record') {
            ctx.fillStyle = '#111'; ctx.fill();
            ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
            for (const f of [0.85, 0.7, 0.55]) { ctx.beginPath(); ctx.arc(0, 0, r * f, 0, Math.PI * 2); ctx.stroke(); }
            ctx.fillStyle = '#00c2ff';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2); ctx.fill();
        } else if (kind === 'eye') {
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#6a2bd9';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2); ctx.fill();
        } else if (kind === 'label') {
            ctx.fillStyle = text.bg; ctx.fill();
            ctx.fillStyle = text.fg;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `900 ${r * 0.62}px ${BOLD}`;
            ctx.fillText(text.top, 0, text.sub ? -r * 0.28 : 0);
            if (text.sub) { ctx.font = `700 ${r * 0.42}px ${BOLD}`; ctx.fillText(text.sub, 0, r * 0.42); }
        }
        ctx.restore();
    }

    function paintStickers(ctx, W, H) {
        const random = rng(23);
        const layout = [
            ['smiley', 0.17, 0.17, 54], ['label', 0.58, 0.14, 50, { bg: '#d8212b', fg: '#fff', top: 'HELLO', sub: 'my name is' }],
            ['record', 0.89, 0.2, 50], ['star', 0.1, 0.52, 56], ['label', 0.38, 0.45, 48, { bg: '#111', fg: '#c6ff00', top: 'NO FILTER' }],
            ['eye', 0.7, 0.5, 52], ['heart', 0.93, 0.62, 44], ['bolt', 0.22, 0.84, 52],
            ['label', 0.55, 0.78, 50, { bg: '#ff2f9a', fg: '#fff', top: 'AFTER HOURS' }], ['smiley', 0.89, 0.88, 42],
            ['record', 0.4, 0.2, 38]
        ];
        for (const [kind, fx, fy, r, text] of layout) {
            drawSticker(ctx, kind, fx * W, fy * H, r * 0.92, (random() - 0.5) * 0.7, text);
        }
    }

    // --- marker tags ------------------------------------------------------------------------------------------------------
    function paintTags(ctx, W, H) {
        const random = rng(41);
        const marker = (colour, width) => { ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
        const wobble = (points, jitter) => {
            ctx.beginPath();
            points.forEach(([px, py], i) => {
                const x = px + (random() - 0.5) * jitter, y = py + (random() - 0.5) * jitter;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save(); ctx.translate(W * 0.34, H * 0.28); ctx.rotate(-0.12);
        marker('#101010', 11); ctx.font = `italic 900 98px ${SCRIPT}`; ctx.strokeText('RAVE ON', 0, 0);
        marker('#ff2f9a', 6); ctx.strokeText('RAVE ON', 0, 0);
        ctx.restore();
        marker('#00d9ff', 7);
        wobble([[40, 118], [150, 128], [250, 114], [330, 124]], 6);
        ctx.save(); ctx.translate(W * 0.74, H * 0.62); ctx.rotate(0.1);
        marker('#101010', 9); ctx.font = `italic 800 62px ${SCRIPT}`; ctx.strokeText('4EVER', 0, 0);
        marker('#c6ff00', 5); ctx.strokeText('4EVER', 0, 0);
        ctx.restore();
        // A heart, a crown, a few arrows and a tally.
        marker('#ff2f9a', 7);
        ctx.beginPath(); ctx.moveTo(78, 282); ctx.bezierCurveTo(30, 238, 70, 206, 78, 232); ctx.bezierCurveTo(88, 206, 128, 238, 78, 282); ctx.stroke();
        marker('#ffe14a', 6);
        wobble([[330, 212], [338, 168], [358, 196], [378, 160], [398, 196], [418, 168], [426, 212], [330, 212]], 3);
        marker('#ffffff', 6);
        for (let i = 0; i < 4; i++) wobble([[190 + i * 16, 300], [194 + i * 16, 350]], 2);
        wobble([[184, 336], [274, 306]], 3);
        marker('#101010', 6);
        wobble([[420, 292], [470, 262]], 3); wobble([[470, 262], [452, 262]], 0); wobble([[470, 262], [466, 280]], 0);
        marker('#00d9ff', 5);
        ctx.beginPath(); ctx.arc(W * 0.12, H * 0.62, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W * 0.12, H * 0.62, 7, 0, Math.PI * 2); ctx.fill();
    }

    // --- "need help?" safety poster ----------------------------------------------------------------------------------------
    function paintHelp(ctx, W, H) {
        ctx.fillStyle = '#073b4c';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#06d6a0';
        ctx.fillRect(0, 0, W, 14);
        ctx.fillRect(0, H - 14, W, 14);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 64px ${BOLD}`;
        ctx.fillText('NEED HELP?', W / 2, 96);
        // Two speech bubbles.
        ctx.fillStyle = '#06d6a0';
        ctx.beginPath(); ctx.ellipse(W * 0.33, 160, 62, 34, 0, 0, Math.PI * 2); ctx.moveTo(W * 0.3, 190); ctx.lineTo(W * 0.26, 218); ctx.lineTo(W * 0.37, 192); ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.ellipse(W * 0.67, 168, 62, 34, 0, 0, Math.PI * 2); ctx.moveTo(W * 0.7, 198); ctx.lineTo(W * 0.74, 226); ctx.lineTo(W * 0.63, 200); ctx.fill();
        ctx.fillStyle = '#073b4c';
        for (const [bx, by] of [[0.3, 160], [0.33, 160], [0.36, 160], [0.64, 168], [0.67, 168], [0.7, 168]]) {
            ctx.beginPath(); ctx.arc(W * bx, by, 5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 31px ${BOLD}`;
        const end = paragraph(ctx, 'Ask any member of staff.', W / 2, 270, W - 50, 36);
        ctx.fillStyle = '#d9fff3';
        ctx.font = `600 24px ${BOLD}`;
        paragraph(ctx, 'We will take you somewhere quiet and sort it out. Nobody gets left on their own.', W / 2, end + 14, W - 60, 30);
    }

    // --- hygiene and no smoking --------------------------------------------------------------------------------------------
    function paintHygiene(ctx, W, H) {
        ctx.fillStyle = '#f1efe8';
        ctx.fillRect(0, 0, W, H);
        // Left: a blue mandatory sign with a tap, water and two hands.
        ctx.fillStyle = '#0b5cab';
        ctx.fillRect(14, 14, W / 2 - 22, H - 28);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(60, 120); ctx.lineTo(60, 80); ctx.quadraticCurveTo(60, 56, 90, 56); ctx.lineTo(140, 56); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(140, 56); ctx.lineTo(140, 78); ctx.stroke();
        for (const dx of [-14, 0, 14]) {
            ctx.beginPath(); ctx.ellipse(140 + dx, 104 + Math.abs(dx) * 0.4, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(112, 176, 52, 22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(112, 176, 36, 10, 0, 0, Math.PI * 2); ctx.fillStyle = '#0b5cab'; ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = `900 26px ${BOLD}`;
        paragraph(ctx, 'WASH YOUR HANDS', W / 4 + 2, 252, W / 2 - 40, 30);
        ctx.font = `600 18px ${BOLD}`;
        ctx.fillText('20 seconds, with soap', W / 4 + 2, 336);
        // Right: a red prohibition sign, a cigarette struck through.
        const cx = W * 0.75, cy = 150, r = 82;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 16; ctx.strokeStyle = '#d6202b';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - 52, cy - 8, 84, 15);
        ctx.fillStyle = '#e8a23a';
        ctx.fillRect(cx + 32, cy - 8, 22, 15);
        ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(cx + 36, cy - 22); ctx.quadraticCurveTo(cx + 22, cy - 42, cx + 38, cy - 58); ctx.stroke();
        ctx.strokeStyle = '#d6202b'; ctx.lineWidth = 16;
        ctx.beginPath(); ctx.moveTo(cx - r * 0.71, cy - r * 0.71); ctx.lineTo(cx + r * 0.71, cy + r * 0.71); ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.font = `900 24px ${BOLD}`;
        ctx.fillText('NO SMOKING', cx, 290);
        ctx.font = `600 18px ${BOLD}`;
        ctx.fillText('Thank you', cx, 336);
    }

    const PAINTERS = {
        lightbox: paintLightbox, flyerSun: paintFlyerSun,
        stickers: paintStickers, tags: paintTags, help: paintHelp, hygiene: paintHygiene
    };

    /** Paint every cell of the atlas into a 2D context sized ATLAS.width x ATLAS.height. */
    function paint(ctx) {
        ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
        for (const [name, [x, y, w, h]] of Object.entries(CELLS)) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.translate(x, y);
            if (!TRANSPARENT.has(name)) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, w, h);
            }
            PAINTERS[name](ctx, w, h);
            ctx.restore();
        }
    }

    /**
     * World-space quad for a placement: its centre, the unit vector along its width ("right", as the viewer sees it) and
     * the way it faces. Facing +z means the viewer looks toward -z, so their right-hand side is -x.
     */
    function frame(placement) {
        const surface = SURFACES[placement.surface];
        const lift = placement.kind === 'lightbox' ? 0.058 : 0.003;
        switch (surface.normal) {
            case '+x': return { centre: [surface.at + lift, placement.y, placement.along], right: [0, 0, 1], normal: [1, 0, 0] };
            case '-x': return { centre: [surface.at - lift, placement.y, placement.along], right: [0, 0, -1], normal: [-1, 0, 0] };
            case '+z': return { centre: [placement.along, placement.y, surface.at + lift], right: [-1, 0, 0], normal: [0, 0, 1] };
            default: return { centre: [placement.along, placement.y, surface.at - lift], right: [1, 0, 0], normal: [0, 0, -1] };
        }
    }

    return { ATLAS, CELLS, TRANSPARENT, SURFACES, PLAN, DOORS, uv, paint, frame };
})();

window.RestroomArt = RestroomArt;
