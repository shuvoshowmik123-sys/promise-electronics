export function promiseQaObserverInit(options = {}) {
  if (window.__promiseQaObserver) return;

  const config = {
    geometryIntervalMs: Number(options.geometryIntervalMs || 500),
    layoutShiftThreshold: Number(options.layoutShiftThreshold || 0.005),
    jitterAmplitudePx: Number(options.jitterAmplitudePx || 3),
    jitterWindowMs: Number(options.jitterWindowMs || 2200),
  };
  const startedAt = performance.now();
  const dedupe = new Map();
  const shiftHistory = new Map();
  const positionHistory = new Map();
  let lastInputAt = 0;
  const state = {
    lastMutationAt: performance.now(),
    lastLayoutAt: 0,
    layoutShiftScore: 0,
    scanCount: 0,
    horizontalOverflowPx: 0,
    visibleActionCount: 0,
  };

  const compactSelector = (element) => {
    if (!(element instanceof Element)) return "unknown";
    const testId = element.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    if (element.id) return `#${CSS.escape(element.id)}`;
    const role = element.getAttribute("role");
    if (role) return `${element.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
    const classes = [...element.classList].filter((name) => !name.includes(":"))
      .slice(0, 2)
      .map((name) => `.${CSS.escape(name)}`)
      .join("");
    return `${element.tagName.toLowerCase()}${classes}`;
  };

  const emit = (issue) => {
    const now = performance.now();
    const signature = `${issue.code}:${issue.target || "page"}`;
    if (now - (dedupe.get(signature) || 0) < 2000) return;
    dedupe.set(signature, now);
    Promise.resolve(window.__promiseQaEmit?.({
      ...issue,
      atMs: Math.round(now),
      pathname: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
    })).catch(() => {});
  };

  const visible = (element, rect) => {
    const style = getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number.parseFloat(style.opacity || "1") > 0.05;
  };

  const actionableSelector = [
    "button",
    "a[href]",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "[role=button]",
    "[role=link]",
    "[role=checkbox]",
    "[role=radio]",
    "[role=switch]",
    "[role=tab]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const scanGeometry = () => {
    state.scanCount += 1;
    const root = document.documentElement;
    const overflow = Math.max(0, root.scrollWidth - innerWidth);
    state.horizontalOverflowPx = Math.round(overflow);
    if (overflow > 2) {
      emit({
        code: "HORIZONTAL_OVERFLOW",
        severity: "HIGH",
        target: "document",
        overflowPx: Math.round(overflow),
      });
    }

    let visibleActionCount = 0;
    for (const element of document.querySelectorAll(actionableSelector)) {
      if (element.closest("[data-qa-ignore-observer]")) continue;
      const rect = element.getBoundingClientRect();
      if (!visible(element, rect)) continue;
      if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
      visibleActionCount += 1;
      const target = compactSelector(element);
      if (rect.left < -2 || rect.right > innerWidth + 2) {
        emit({
          code: "ACTION_OUT_OF_VIEWPORT",
          severity: "HIGH",
          target,
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }

      const x = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
      const y = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== element && !element.contains(hit) && !hit.contains(element)) {
        emit({
          code: "ACTION_OCCLUDED",
          severity: "HIGH",
          target,
          coveringTarget: compactSelector(hit),
        });
      }
    }
    state.visibleActionCount = visibleActionCount;

    const bottom = document.elementFromPoint(innerWidth / 2, Math.max(0, innerHeight - 2));
    if (bottom) {
      const style = getComputedStyle(bottom);
      const rect = bottom.getBoundingClientRect();
      const isNavigation = Boolean(bottom.closest("nav,[role=navigation]"));
      if ((style.position === "fixed" || style.position === "sticky")
        && !isNavigation
        && rect.height > 0
        && rect.height < 40
        && !(bottom.textContent || "").trim()) {
        emit({
          code: "BOTTOM_GHOST_BAR",
          severity: "MEDIUM",
          target: compactSelector(bottom),
          heightPx: Math.round(rect.height),
        });
      }
    }

    if (performance.now() - startedAt > 2500) {
      const bodyText = (document.body?.innerText || "").trim();
      const visibleImages = [...document.images].some((image) => {
        const rect = image.getBoundingClientRect();
        return visible(image, rect) && rect.bottom > 0 && rect.top < innerHeight;
      });
      if (!bodyText && !visibleImages && visibleActionCount === 0) {
        emit({ code: "EMPTY_VIEWPORT", severity: "HIGH", target: "document" });
      }
    }

    return {
      horizontalOverflowPx: state.horizontalOverflowPx,
      visibleActionCount: state.visibleActionCount,
      scanCount: state.scanCount,
    };
  };

  const sampleMotion = () => {
    const now = performance.now();
    if (now - lastInputAt < 550) return;
    for (const element of document.querySelectorAll(actionableSelector)) {
      if (element.closest("[data-qa-ignore-observer]")) continue;
      if (element.getAnimations().some((animation) => animation.playState === "running")) continue;
      const rect = element.getBoundingClientRect();
      if (!visible(element, rect) || rect.bottom <= 0 || rect.top >= innerHeight) continue;
      const target = compactSelector(element);
      const history = (positionHistory.get(target) || [])
        .filter((item) => now - item.at <= config.jitterWindowMs);
      const previous = history.at(-1);
      const x = Math.round(rect.x * 10) / 10;
      const y = Math.round(rect.y * 10) / 10;
      if (previous) {
        const dx = x - previous.x;
        const dy = y - previous.y;
        const amplitude = Math.max(Math.abs(dx), Math.abs(dy));
        if (amplitude >= config.jitterAmplitudePx) {
          history.push({
            at: now,
            x,
            y,
            direction: Math.sign(Math.abs(dx) >= Math.abs(dy) ? dx : dy),
            amplitude,
          });
        } else {
          history.push({ at: now, x, y, direction: 0, amplitude: 0 });
        }
      } else {
        history.push({ at: now, x, y, direction: 0, amplitude: 0 });
      }
      const moved = history.filter((item) => item.direction !== 0);
      let reversals = 0;
      for (let index = 1; index < moved.length; index += 1) {
        if (moved[index - 1].direction !== moved[index].direction) reversals += 1;
      }
      if (moved.length >= 4 && reversals >= 2) {
        emit({
          code: "LAYOUT_JITTER",
          severity: "HIGH",
          target,
          occurrences: moved.length,
          reversals,
          amplitudePx: Math.round(Math.max(...moved.map((item) => item.amplitude))),
          windowMs: config.jitterWindowMs,
          detector: "live-geometry",
        });
      }
      positionHistory.set(target, history.slice(-20));
    }
  };

  const mutationObserver = new MutationObserver(() => {
    state.lastMutationAt = performance.now();
  });
  mutationObserver.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  try {
    const layoutObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput || entry.value < config.layoutShiftThreshold) continue;
        state.lastLayoutAt = performance.now();
        state.layoutShiftScore += entry.value;
        const sources = entry.sources || [];
        emit({
          code: "LAYOUT_SHIFT",
          severity: entry.value >= 0.1 ? "HIGH" : "MEDIUM",
          target: compactSelector(sources[0]?.node),
          score: Number(entry.value.toFixed(4)),
          cumulativeScore: Number(state.layoutShiftScore.toFixed(4)),
        });

        for (const source of sources) {
          if (!source.node) continue;
          const target = compactSelector(source.node);
          const dx = source.currentRect.x - source.previousRect.x;
          const dy = source.currentRect.y - source.previousRect.y;
          const amplitude = Math.max(Math.abs(dx), Math.abs(dy));
          if (amplitude < config.jitterAmplitudePx) continue;
          const direction = Math.sign(Math.abs(dx) >= Math.abs(dy) ? dx : dy);
          const history = (shiftHistory.get(target) || [])
            .filter((item) => performance.now() - item.at <= config.jitterWindowMs);
          history.push({ at: performance.now(), direction, amplitude });
          shiftHistory.set(target, history);
          let reversals = 0;
          for (let index = 1; index < history.length; index += 1) {
            if (history[index - 1].direction !== history[index].direction) reversals += 1;
          }
          if (history.length >= 4 && reversals >= 2) {
            emit({
              code: "LAYOUT_JITTER",
              severity: "HIGH",
              target,
              occurrences: history.length,
              reversals,
              amplitudePx: Math.round(Math.max(...history.map((item) => item.amplitude))),
              windowMs: config.jitterWindowMs,
            });
          }
        }
      }
    });
    layoutObserver.observe({ type: "layout-shift", buffered: true });
  } catch {}

  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 200) continue;
        emit({
          code: "MAIN_THREAD_STALL",
          severity: entry.duration >= 600 ? "HIGH" : "MEDIUM",
          target: "document",
          durationMs: Math.round(entry.duration),
        });
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {}

  for (const eventName of ["pointerdown", "touchstart", "keydown", "wheel"]) {
    window.addEventListener(eventName, () => {
      lastInputAt = performance.now();
    }, { capture: true, passive: true });
  }
  const timer = window.setInterval(scanGeometry, config.geometryIntervalMs);
  const motionTimer = window.setInterval(sampleMotion, 120);
  window.addEventListener("pagehide", () => {
    window.clearInterval(timer);
    window.clearInterval(motionTimer);
  }, { once: true });
  window.__promiseQaObserver = {
    scanNow: scanGeometry,
    snapshot: () => ({
      ...state,
      layoutShiftScore: Number(state.layoutShiftScore.toFixed(4)),
      now: performance.now(),
      pathname: location.pathname,
      viewport: { width: innerWidth, height: innerHeight },
    }),
  };
  scanGeometry();
}
