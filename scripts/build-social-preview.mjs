import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Crops design/social-preview-source.png (the 3:2 artwork) to the 1200x630 link-preview image the page metadata declares.
// The wordmark sits at about 45% of the artwork's height, so a centred crop keeps it in the middle. Re-run after replacing
// the source.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = `data:image/png;base64,${(await readFile(path.join(ROOT, 'design', 'social-preview-source.png'))).toString('base64')}`;

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(`<body style="margin:0;width:1200px;height:630px;background:#000 url('${source}') 50% 50%/cover no-repeat"></body>`, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(ROOT, 'icons', 'social-preview.png') });
    console.log('Wrote icons/social-preview.png (1200x630)');
} finally {
    await browser.close();
}
