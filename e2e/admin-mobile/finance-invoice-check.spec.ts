import { test, expect, loginAsAdmin } from '../fixtures/auth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Finance invoice preview clipping check at 390x844.
 * Records whether the invoice dialog content overflows horizontally.
 * @admin-mobile
 */

const RAW_DIR = path.resolve('d:/PromiseIntegratedSystem/PromiseIntegratedSystem/.qa/admin-mobile-native-audit/raw');
const SHOT_DIR = path.resolve('d:/PromiseIntegratedSystem/PromiseIntegratedSystem/.qa/admin-mobile-native-audit/screenshots');

function ensureDirs() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}
function saveRaw(name: string, data: any) { fs.writeFileSync(path.join(RAW_DIR, `${name}.json`), JSON.stringify(data, null, 2)); }
async function saveShot(page: any, name: string) { fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), await page.screenshot()); }

test.describe('Finance invoice clipping @admin-mobile', () => {
  test.setTimeout(60_000);

  test('check invoice dialog horizontal clipping', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#finance');
    await page.waitForFunction(() => !document.body.textContent?.includes('Loading financial data'), { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Find and click View button
    const viewBtn = page.locator('button').filter({ hasText: /^View$/ }).first();
    if (!await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      saveRaw(`finance-invoice-clip-${vpLabel}`, { noViewButton: true });
      return;
    }

    await viewBtn.scrollIntoViewIfNeeded();
    await viewBtn.click();
    await page.waitForTimeout(1000);

    await saveShot(page, `finance-invoice-clip-${vpLabel}-01-dialog`);

    // Check for horizontal overflow inside the dialog
    const clipState = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      if (!dialog) return { dialogFound: false };
      const r = dialog.getBoundingClientRect();
      const s = getComputedStyle(dialog);
      const overflowX = dialog.scrollWidth > dialog.clientWidth;
      const clippedRight = r.right > window.innerWidth;
      const clippedLeft = r.left < 0;

      // Check the invoice content inside
      const tables = dialog.querySelectorAll('table');
      let tableOverflow = false;
      tables.forEach(t => {
        if (t.scrollWidth > t.clientWidth + 2) tableOverflow = true;
      });

      return {
        dialogFound: true,
        dialogWidth: Math.round(r.width),
        dialogLeft: Math.round(r.left),
        dialogRight: Math.round(r.right),
        viewportWidth: window.innerWidth,
        overflowX,
        clippedRight,
        clippedLeft,
        tableCount: tables.length,
        tableOverflow,
        dialogOverflowStyle: s.overflowX,
      };
    });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    saveRaw(`finance-invoice-clip-${vpLabel}`, clipState);
    console.log(`[FINANCE-CLIP] ${vpLabel}: dialogFound=${clipState.dialogFound} width=${(clipState as any).dialogWidth} overflowX=${(clipState as any).overflowX} tableOverflow=${(clipState as any).tableOverflow} clippedRight=${(clipState as any).clippedRight}`);
  });
});
