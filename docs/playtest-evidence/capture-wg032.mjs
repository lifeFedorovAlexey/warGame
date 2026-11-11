import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir = 'docs/playtest-evidence/wg032';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  for (const mission of ['m01', 'm02']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.addInitScript(() => { localStorage.setItem('warGame.fieldRadio', 'off'); localStorage.setItem('warGame.fieldSound', 'off'); });
    await page.goto(`http://127.0.0.1:8766/campaign/${mission === 'm02' ? '?mission=m02' : ''}`);
    await page.waitForFunction(() => window.campaign?.ready, null, { timeout: 120000 });
    await page.locator('#begin').click();
    if (mission === 'm01') await page.evaluate(() => campaign.advance(40));
    await page.waitForFunction(() => campaign.state.active && !campaign.state.openingPlaying, null, { timeout: 120000 });
    await page.locator('#pause').click();
    await page.evaluate(() => { campaign.radio.dismiss(); campaign.select([]); campaign.world.fixedRenderScale = 1; campaign.world.renderer.setPixelRatio(1); });
    await page.screenshot({ path: `${dir}/${mission}-fog.png` });
    const views = mission === 'm01'
      ? [['overview', [25, 31], 1900], ['base1', [19, 31.5], 440], ['base2', [32, 27], 470]]
      : [['overview', [26, 88], 2150], ['east', [34, 77.4], 490], ['west', [15, 72], 600], ['radar', [30.5, 88.5], 330], ['energy', [26, 108.2], 670]];
    for (const [name, grid, distance] of views) {
      await page.evaluate(({ grid, distance }) => { const m = campaign.mission; m.explored.fill(255); m.visible.fill(255); m.visionSources = [{ x: grid[0], y: grid[1], radius: 90 }]; m.fogRevision++; campaign.world.centre(m.field.gridToWorld(grid), distance); }, { grid, distance });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${dir}/${mission}-${name}.png` });
      console.log('CAPTURE', mission, name);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/${mission}-narrow.png` });
    await page.close();
  }
} finally { await browser.close(); }
