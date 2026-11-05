// Renders the social share image and PNG icons. Run: node scripts/generate-assets.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is not a project dependency; resolve a globally installed copy.
const { chromium } = createRequire(import.meta.url)('playwright');

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const og = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;box-sizing:border-box;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#eef0f5;
  background:radial-gradient(900px 500px at 90% -10%,rgba(245,158,11,.28),transparent 60%),radial-gradient(700px 400px at -10% 110%,rgba(96,165,250,.18),transparent 60%),#0d0f14">
  <div style="display:flex;align-items:center;gap:20px;font-size:44px;font-weight:800">
    <div style="width:72px;height:72px">${svg}</div>DropDuel
  </div>
  <div>
    <div style="font-size:76px;font-weight:800;line-height:1.02;letter-spacing:-.02em">DonutSMP gambling<br><span style="color:#f59e0b">you can verify.</span></div>
    <div style="margin-top:22px;font-size:30px;color:#a9afc0">Dispenser duels & coinflips · /pay to deposit · instant in-game payouts</div>
  </div>
  <div style="display:flex;gap:28px">
    ${[7, 3].map((n, i) => `<div style="width:120px;height:120px;border-radius:18px;background:linear-gradient(180deg,#4b5162,#2c303c);display:grid;place-items:center;box-shadow:inset 0 0 0 5px rgba(0,0,0,.35)">
      <div style="width:64px;height:64px;border-radius:10px;background:#07080c;display:grid;place-items:center;font-size:44px;font-weight:900;color:${i ? '#f43f5e' : '#22c55e'}">${n}</div></div>`).join('')}
    <div style="align-self:center;font-size:28px;color:#7a8196;margin-left:12px">Provably fair · HMAC-SHA256</div>
  </div>
</div></body></html>`;

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.screenshot({ path: 'public/og.png' });

for (const [name, size, pad] of [['icon-512.png', 512, 0.12], ['icon-192.png', 192, 0.12], ['apple-touch-icon.png', 180, 0.12], ['favicon-32.png', 32, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  const bg = name === 'favicon-32.png' ? 'transparent' : '#0d0f14';
  await page.setContent(`<body style="margin:0;background:${bg}"><div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${size * pad}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: bg === 'transparent' });
}
await browser.close();
console.log('assets written to public/');
