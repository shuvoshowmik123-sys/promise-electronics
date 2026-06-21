import type { BrowserContext, Locator, Page } from '@playwright/test';

export async function installPointerOverlay(context: BrowserContext) {
  await context.addInitScript(() => {
    const win = window as Window & { __promisePointerOverlayInstalled?: boolean };
    if (win.__promisePointerOverlayInstalled) return;
    win.__promisePointerOverlayInstalled = true;

    const ensureOverlay = () => {
      if (document.getElementById('__promise_pointer_overlay')) return;

      const style = document.createElement('style');
      style.id = '__promise_pointer_overlay_style';
      style.textContent = `
        #__promise_pointer_overlay {
          position: fixed;
          z-index: 2147483647;
          width: 22px;
          height: 22px;
          margin-left: -11px;
          margin-top: -11px;
          border: 2px solid rgba(16,185,129,.95);
          border-radius: 999px;
          background: rgba(16,185,129,.22);
          box-shadow: 0 0 0 6px rgba(16,185,129,.12), 0 10px 24px rgba(15,23,42,.18);
          pointer-events: none;
          opacity: 0;
          transform: translate3d(-100px,-100px,0) scale(.9);
          transition: opacity .12s ease, transform .08s linear;
        }
        .__promise_touch_ripple {
          position: fixed;
          z-index: 2147483646;
          width: 42px;
          height: 42px;
          margin-left: -21px;
          margin-top: -21px;
          border-radius: 999px;
          border: 2px solid rgba(16,185,129,.75);
          background: rgba(16,185,129,.12);
          pointer-events: none;
          animation: __promise_touch_ripple .48s ease-out forwards;
        }
        @keyframes __promise_touch_ripple {
          from { opacity: .95; transform: scale(.45); }
          to { opacity: 0; transform: scale(1.35); }
        }
      `;
      document.head.appendChild(style);

      const dot = document.createElement('div');
      dot.id = '__promise_pointer_overlay';
      document.body.appendChild(dot);
    };

    const moveDot = (x: number, y: number, pressed = false) => {
      ensureOverlay();
      const dot = document.getElementById('__promise_pointer_overlay');
      if (!dot) return;
      dot.style.opacity = '1';
      dot.style.transform = `translate3d(${x}px,${y}px,0) scale(${pressed ? 1.25 : 1})`;
    };

    const ripple = (x: number, y: number) => {
      ensureOverlay();
      const node = document.createElement('div');
      node.className = '__promise_touch_ripple';
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      document.body.appendChild(node);
      window.setTimeout(() => node.remove(), 520);
    };

    window.addEventListener('DOMContentLoaded', ensureOverlay);
    window.addEventListener('pointermove', (event) => moveDot(event.clientX, event.clientY));
    window.addEventListener('pointerdown', (event) => {
      moveDot(event.clientX, event.clientY, true);
      ripple(event.clientX, event.clientY);
    });
    window.addEventListener('pointerup', (event) => moveDot(event.clientX, event.clientY));
    window.addEventListener('touchstart', (event) => {
      const touch = event.touches[0];
      if (touch) {
        moveDot(touch.clientX, touch.clientY, true);
        ripple(touch.clientX, touch.clientY);
      }
    }, { passive: true });
    window.addEventListener('touchmove', (event) => {
      const touch = event.touches[0];
      if (touch) moveDot(touch.clientX, touch.clientY, true);
    }, { passive: true });
  });
}

export async function tapLikeHuman(locator: Locator, page: Page) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    await locator.tap();
    return;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(80);
  await page.touchscreen.tap(x, y).catch(async () => {
    await page.mouse.down();
    await page.waitForTimeout(70);
    await page.mouse.up();
  });
}

export async function swipeUp(page: Page, distance = 420) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  await dragBy(page, viewport.width / 2, viewport.height * 0.72, 0, -distance);
}

export async function swipeDown(page: Page, distance = 360) {
  const viewport = page.viewportSize() || { width: 390, height: 844 };
  await dragBy(page, viewport.width / 2, viewport.height * 0.35, 0, distance);
}

export async function dragSheetDown(page: Page, handle: Locator, distance = 420) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error('Drag handle is not visible');
  await dragBy(page, box.x + box.width / 2, box.y + box.height / 2, 0, distance);
}

export async function holdPress(locator: Locator, page: Page, ms = 750) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Hold target is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

export async function typeLikeHuman(locator: Locator, text: string, delay = 60) {
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
  await locator.pressSequentially(text, { delay });
}

async function dragBy(page: Page, startX: number, startY: number, deltaX: number, deltaY: number) {
  await page.mouse.move(startX, startY, { steps: 8 });
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 18 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(220);
}
