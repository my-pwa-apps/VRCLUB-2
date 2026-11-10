import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Renders the listing art for the SideQuest form from design/social-preview-source.png and the app icon, into
// quest-package/store-art/ (git-ignored). Sizes follow SideQuest's listing form (icon 580x470, banner 2048x370); check
// them against the form before uploading, and use the screenshots/ directory for the in-headset or club pictures.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'quest-package', 'store-art');
const dataUrl = async (dir, file, type) => `data:${type};base64,${(await readFile(path.join(ROOT, dir, file))).toString('base64')}`;
// Inline data URLs: a page set with setContent cannot read file:// images.
const art = await dataUrl('design', 'social-preview-source.png', 'image/png');
const icon = await dataUrl('icons', 'icon-512.png', 'image/png');

const pieces = [
    {
        file: 'sidequest-banner-2048x370.png', width: 2048, height: 370,
        // The wordmark sits at about 45% of the artwork's height; at 2048 px wide the artwork is 1365 px tall, so shift it up to show that band.
        html: `<body style="margin:0;width:2048px;height:370px;background:#000 url('${art}') 50% -428px/2048px auto no-repeat"></body>`
    },
    {
        file: 'sidequest-icon-580x470.png', width: 580, height: 470,
        html: `<body style="margin:0;width:580px;height:470px;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,#16203a,#05060f 70%)">
            <img src="${icon}" style="width:400px;height:400px;border-radius:72px;box-shadow:0 0 60px #2fd8e855"></body>`
    }
];

const browser = await chromium.launch();
try {
    await mkdir(out, { recursive: true });
    for (const piece of pieces) {
        const page = await browser.newPage({ viewport: { width: piece.width, height: piece.height } });
        await page.setContent(piece.html, { waitUntil: 'load' });
        await page.screenshot({ path: path.join(out, piece.file) });
        await page.close();
        console.log(`Wrote quest-package/store-art/${piece.file}`);
    }
} finally {
    await browser.close();
}
