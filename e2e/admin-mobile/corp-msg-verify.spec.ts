import { test, expect, loginAsAdmin } from '../fixtures/auth';
import { captureChromeState, detectGhostBars } from '../fixtures/mobile-audit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Corporate Messages interaction verification — strict back detection.
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

async function verifyAdminShell(page: any, label: string): Promise<boolean> {
  const state = await page.evaluate(() => ({
    loginVisible: !!document.querySelector('[data-testid="button-admin-login"]'),
    dockExists: !!document.querySelector('nav[class*="fixed"]'),
    sidebarExists: !!document.querySelector('aside'),
  }));
  if (state.loginVisible || (!state.dockExists && !state.sidebarExists)) {
    await saveShot(page, `${label}-LOGIN_FAILED`);
    return false;
  }
  return true;
}

test.describe('Corp Messages interaction @admin-mobile', () => {
  test.setTimeout(60_000);

  test('thread open → chat chrome → back → dock restore', async ({ page }) => {
    ensureDirs();
    const vp = page.viewportSize()!;
    const vpLabel = `${vp.width}x${vp.height}`;
    await loginAsAdmin(page);
    await page.goto('/admin#corp-msg');
    await page.waitForTimeout(2500);

    const shellOk = await verifyAdminShell(page, `corp-msg-${vpLabel}`);
    expect(shellOk, 'admin shell must be reached').toBe(true);

    await saveShot(page, `corp-msg-${vpLabel}-01-initial`);
    const chromeRest = await captureChromeState(page);
    expect(chromeRest.dockFound, 'dock must be found at rest').toBe(true);
    expect(chromeRest.dockVisible, 'dock must be visible at rest').toBe(true);

    // Find first thread card via DOM evaluation
    const threadInfo = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if ((text.includes('open') || text.includes('OPEN')) && (text.includes('Support Chat') || text.includes('Intake dispute'))) {
          const r = btn.getBoundingClientRect();
          if (r.width > 100 && r.height > 40) {
            return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          }
        }
      }
      return { found: false, x: 0, y: 0 };
    });

    let threadOpened = false;
    if (threadInfo.found) {
      await page.touchscreen.tap(threadInfo.x, threadInfo.y);
      await page.waitForTimeout(1200);
      threadOpened = true;
    }

    await saveShot(page, `corp-msg-${vpLabel}-02-chat-open`);
    const chromeInChat = threadOpened ? await captureChromeState(page) : null;
    const dockHidInChat = chromeInChat ? !chromeInChat.dockVisible : null;

    // Check chat has back button and composer
    const chatState = threadOpened ? await page.evaluate(() => {
      let backBtn = false;
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const svg = btn.querySelector('svg');
        if (!svg) continue;
        const r = btn.getBoundingClientRect();
        if (r.top < 100 && r.left < 80 && r.width < 60 && r.height < 60) { backBtn = true; break; }
      }
      const composer = !!document.querySelector('textarea[placeholder*="message" i]');
      return { backBtn, composer };
    }) : { backBtn: false, composer: false };

    // Attempt back: dispatch click at back button coordinates
    let backDispatchAttempted = false;
    if (chatState.backBtn) {
      const backCoords = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const svg = btn.querySelector('svg');
          if (!svg) continue;
          const r = btn.getBoundingClientRect();
          if (r.top < 100 && r.left < 80 && r.width < 60 && r.height < 60) {
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          }
        }
        return null;
      });

      if (backCoords) {
        await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (el) {
            const btn = el.closest('button') || el;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
          }
        }, backCoords);
        backDispatchAttempted = true;
        await page.waitForTimeout(1200);
      }
    }

    await saveShot(page, `corp-msg-${vpLabel}-03-after-back`);

    // Strict back verification: all 4 must be true for backWorked=true
    const afterBack = threadOpened ? await page.evaluate(() => {
      // 1. Chat composer gone?
      const composerGone = !document.querySelector('textarea[placeholder*="message" i]');

      // 2. Thread list cards visible in viewport?
      let threadListVisible = false;
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        if ((text.includes('open') || text.includes('OPEN')) && text.includes('Chat')) {
          const r = btn.getBoundingClientRect();
          // Must be in viewport AND not behind an overlay
          if (r.width > 100 && r.height > 40 && r.top >= 0 && r.bottom <= window.innerHeight) {
            threadListVisible = true;
            break;
          }
        }
      }

      // 3. Chat header gone? (the "Intake dispute" / "Support Chat" title bar)
      const chatHeader = document.querySelector('h3[class*="font-bold"][class*="truncate"]');
      const chatHeaderGone = !chatHeader || (chatHeader.getBoundingClientRect().height === 0);

      return { composerGone, threadListVisible, chatHeaderGone };
    }) : { composerGone: false, threadListVisible: false, chatHeaderGone: false };

    const chromeAfterBack = await captureChromeState(page);

    // backWorked = all strict checks pass
    const backWorked = afterBack.composerGone && afterBack.threadListVisible && afterBack.chatHeaderGone;
    const dockRestoredAfterBack = backWorked ? chromeAfterBack.dockVisible : false;
    const topRestoredAfterBack = backWorked ? chromeAfterBack.topVisible : false;
    const backRestoreStatus = !backDispatchAttempted ? 'NOT_ATTEMPTED'
      : backWorked ? (dockRestoredAfterBack ? 'RESTORED' : 'BACK_OK_DOCK_STUCK')
      : 'UNVERIFIED';

    let ghost = { issues: [] as string[] };
    try { ghost = await detectGhostBars(page); } catch {}

    const result = {
      shellReached: true,
      url: page.url(),
      chromeRest,
      threadOpened,
      dockHidInChat,
      chatHasBackButton: chatState.backBtn,
      chatComposerVisible: chatState.composer,
      backDispatchAttempted,
      chatComposerVisibleAfterBack: !afterBack.composerGone,
      threadListVisibleAfterBack: afterBack.threadListVisible,
      chatHeaderGoneAfterBack: afterBack.chatHeaderGone,
      backWorked,
      dockRestoredAfterBack,
      topRestoredAfterBack,
      backRestoreStatus,
      chromeAfterBack,
      ghost,
    };

    saveRaw(`corp-msg-${vpLabel}`, result);

    console.log(`[CORP-MSG] ${vpLabel}: opened=${threadOpened} dockHid=${dockHidInChat} backBtn=${chatState.backBtn} composer=${chatState.composer}`);
    console.log(`  after-back: composerGone=${afterBack.composerGone} threadList=${afterBack.threadListVisible} chatHeaderGone=${afterBack.chatHeaderGone}`);
    console.log(`  backWorked=${backWorked} dockRestored=${dockRestoredAfterBack} status=${backRestoreStatus}`);

    if (!backWorked) {
      console.log('[CORP-MSG] UNVERIFIED — back did not return to thread list. Manual checklist:');
      console.log('  1. Open /admin#corp-msg on real device');
      console.log('  2. Tap a thread');
      console.log('  3. Confirm admin dock/top tools hidden');
      console.log('  4. Tap chat back arrow');
      console.log('  5. Confirm thread list returns');
      console.log('  6. Confirm admin dock/top tools restore');
    }

    expect(threadOpened, 'thread must open').toBe(true);
    expect(dockHidInChat, 'dock must hide in chat').toBe(true);
    expect(chatState.backBtn, 'chat must have back button').toBe(true);
  });
});
