import type { CDPSession, Page } from '@playwright/test';

/**
 * Trustworthy admin-mobile audit instrumentation.
 *
 * Why this exists: mouse.wheel and synthetic TouchEvents cannot reliably test
 * phone-like scrolling or top/bottom chrome hide timing. This module drives
 * REAL compositor touch via CDP `Input.dispatchTouchEvent` and measures the
 * observable consequences (scroll delta, chrome boxes, ghost bars, reachability)
 * so audit evidence is trustworthy. It must run in a touch context
 * (iPhone-15 / `hasTouch: true`); in a non-touch browser CDP touch is a no-op.
 */

export type Point = { x: number; y: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ease-out so the gesture decelerates like a real finger lift (drives velocity-based chrome hide). */
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Real touch swipe with deceleration. start→end is the finger path;
 * a finger swipe UP (start.y high, end.y low) scrolls content DOWN.
 */
export async function touchSwipe(
  page: Page,
  start: Point,
  end: Point,
  opts: { steps?: number; durationMs?: number; client?: CDPSession } = {},
) {
  const steps = opts.steps ?? 24;
  const durationMs = opts.durationMs ?? 360;
  const client = opts.client ?? (await page.context().newCDPSession(page));
  const perStep = durationMs / steps;

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: start.x, y: start.y, id: 0 }],
  });
  for (let i = 1; i <= steps; i++) {
    const t = easeOut(i / steps);
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, id: 0 }],
    });
    await sleep(perStep);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return client;
}

export async function swipeContentDown(page: Page, distance = 420, client?: CDPSession) {
  const vp = page.viewportSize() ?? { width: 390, height: 844 };
  const startY = Math.min(vp.height * 0.78, vp.height - 90);
  return touchSwipe(page, { x: vp.width / 2, y: startY }, { x: vp.width / 2, y: startY - distance }, { client });
}

export async function swipeContentUp(page: Page, distance = 420, client?: CDPSession) {
  const vp = page.viewportSize() ?? { width: 390, height: 844 };
  const startY = vp.height * 0.28;
  return touchSwipe(page, { x: vp.width / 2, y: startY }, { x: vp.width / 2, y: startY + distance }, { client });
}

/** Locate the tallest real overflow-scroll surface (the page's primary scroll container). */
export async function findPrimaryScroll(page: Page) {
  return page.evaluate(() => {
    const surfaces = [...document.querySelectorAll<HTMLElement>('*')].filter((e) => {
      const s = getComputedStyle(e);
      return (s.overflowY === 'auto' || s.overflowY === 'scroll')
        && e.scrollHeight > e.clientHeight + 8
        && e.clientHeight > 120;
    });
    surfaces.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    const el = surfaces[0];
    if (!el) return null;
    return {
      cls: (el.className || '').toString().slice(0, 80),
      scrollTop: Math.round(el.scrollTop),
      maxScroll: el.scrollHeight - el.clientHeight,
      count: surfaces.length,
    };
  });
}

/** Wait until a real scroll container exists (data loaded). Returns it or null on timeout. */
export async function waitForPrimaryScroll(page: Page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const c = await findPrimaryScroll(page);
    if (c) return c;
    await sleep(250);
  }
  return null;
}

/**
 * Capture global admin chrome state. The admin shell hides the bottom dock and
 * top island together by applying `opacity-0 pointer-events-none` (+ translate),
 * both on list scroll and while a detail/action surface is open. We therefore
 * judge "visible" by opacity + pointer-events on the actual chrome ELEMENTS, not
 * by coordinate math (the floating dock sits in the layout viewport, which
 * differs from window.innerHeight on mobile and breaks edge-based heuristics).
 */
export async function captureChromeState(page: Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const isShown = (el: Element | null) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      if (parseFloat(s.opacity || '1') <= 0.05) return false;
      if (s.pointerEvents === 'none') return false;
      return true;
    };

    // Bottom dock: the mobile-only floating <nav> fixed near the bottom.
    let dockEl: Element | null = null;
    document.querySelectorAll<HTMLElement>('nav').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width > vw * 0.4 && r.height >= 40 && r.height <= 120) dockEl = el;
    });

    // Top island: the floating glass tools — `md:hidden absolute top-4 right-4
    // z-[60]` containing scan/search/bell. It is position:absolute and narrow,
    // so match by its stable z-[60] class + top placement, not by width.
    let topEl: Element | null = null;
    document.querySelectorAll<HTMLElement>('div').forEach((el) => {
      if (topEl) return;
      const cls = (el.className || '').toString();
      if (!cls.includes('z-[60]')) return;
      const s = getComputedStyle(el);
      if (s.position !== 'absolute' && s.position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.top <= vh * 0.25 && r.height >= 24 && r.height <= 120) topEl = el;
    });

    const dockShown = isShown(dockEl);
    const topShown = isShown(topEl);
    return {
      vh, vw,
      dockFound: !!dockEl,
      topFound: !!topEl,
      dockVisible: dockShown === true,
      topVisible: topShown === true,
    };
  });
}

/**
 * Detect ghost/white bars: a fixed/empty strip at the very bottom that is not the
 * dock, or a gap where the page background shows through after a chrome transition.
 */
export async function detectGhostBars(page: Page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const issues: string[] = [];
    // sample a column of points up from the bottom edge; if the bottom 4px is a
    // fixed element with no text and not the dock, flag it.
    const bottomEl = document.elementFromPoint(vw / 2, vh - 2) as HTMLElement | null;
    if (bottomEl) {
      const s = getComputedStyle(bottomEl);
      const txt = (bottomEl.textContent || '').trim();
      const isNav = !!bottomEl.closest('nav,[role="navigation"]');
      if ((s.position === 'fixed' || s.position === 'sticky') && !isNav && txt.length === 0 && bottomEl.getBoundingClientRect().height < 40) {
        issues.push(`bottom-fixed-empty:${bottomEl.tagName}.${(bottomEl.className || '').toString().slice(0, 30)}`);
      }
    }
    return { issues };
  });
}

export type ScrollPassResult = {
  tab: string;
  container: Awaited<ReturnType<typeof findPrimaryScroll>>;
  reachedBottom: boolean;
  steps: number;
  chromeTopHidWhileScrolling: boolean;
  chromeDockHidWhileScrolling: boolean;
  chromeRestoredAtTop: boolean;
  ghostIssues: string[];
};

/**
 * Full trustworthy scroll pass for one Daily Ops tab:
 *  1. record chrome at rest
 *  2. swipe to bottom in finger-sized steps, watching chrome hide together
 *  3. confirm bottom reachable, no ghost bar
 *  4. swipe back to top, confirm chrome restores
 * Screenshots are saved by the caller around this for visual evidence.
 */
export async function scrollPass(page: Page, tab: string, evidence?: (label: string) => Promise<void>): Promise<ScrollPassResult> {
  const client = await page.context().newCDPSession(page);
  const container = await waitForPrimaryScroll(page);
  const atRest = await captureChromeState(page);
  await evidence?.('rest');

  let reachedBottom = false;
  let topHid = false;
  let dockHid = false;
  let steps = 0;
  const ghost = new Set<string>();

  if (container && container.maxScroll > 30) {
    for (let i = 0; i < 12; i++) {
      steps++;
      await swipeContentDown(page, 460, client);
      await sleep(220);
      const chrome = await captureChromeState(page);
      if (atRest.topVisible && !chrome.topVisible) topHid = true;
      if (atRest.dockVisible && !chrome.dockVisible) dockHid = true;
      const g = await detectGhostBars(page);
      g.issues.forEach((x) => ghost.add(x));
      const cur = await findPrimaryScroll(page);
      if (cur && cur.scrollTop >= cur.maxScroll - 4) { reachedBottom = true; break; }
    }
    await evidence?.('bottom');

    // swipe back up to top
    for (let i = 0; i < 14; i++) {
      await swipeContentUp(page, 480, client);
      await sleep(180);
      const cur = await findPrimaryScroll(page);
      if (cur && cur.scrollTop <= 4) break;
    }
  } else {
    reachedBottom = true; // content fits; nothing to scroll past
  }

  await sleep(300);
  const restored = await captureChromeState(page);
  await evidence?.('restored');
  const chromeRestoredAtTop = (!atRest.topVisible || restored.topVisible) && (!atRest.dockVisible || restored.dockVisible);

  return {
    tab,
    container,
    reachedBottom,
    steps,
    chromeTopHidWhileScrolling: topHid,
    chromeDockHidWhileScrolling: dockHid,
    chromeRestoredAtTop,
    ghostIssues: [...ghost],
  };
}
