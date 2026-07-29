import { useEffect } from "react";

/**
 * Locks background page scrolling while an overlay (bottom sheet, full-screen
 * picker, media viewer) is open.
 *
 * Why `position: fixed` and not just `overflow: hidden`:
 * iOS Safari and Android Chrome both ignore `overflow: hidden` on <body> for
 * touch scrolling. A drag that starts on a sheet still scrolls the page
 * underneath, which is exactly the glitch this fixes — dragging a sheet to
 * dismiss it also scrolled the content behind. Pinning the body and offsetting
 * it by the current scroll position is the only reliable cross-browser lock.
 *
 * Reference counted: several overlays can be open at once (the area-details
 * sheet and the expanded map, for example). Only the first lock captures the
 * scroll position and only the last release restores it, so a nested overlay
 * closing cannot jump the page to the top.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    overflow: string;
    overscrollBehavior: string;
} | null = null;

function applyLock(): void {
    if (typeof document === "undefined") return;
    lockCount += 1;
    if (lockCount > 1) return; // already locked by an outer overlay

    const body = document.body;
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    savedStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        overscrollBehavior: body.style.overscrollBehavior,
    };

    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "contain";
}

function releaseLock(): void {
    if (typeof document === "undefined") return;
    if (lockCount === 0) return;
    lockCount -= 1;
    if (lockCount > 0) return; // an outer overlay is still open

    const body = document.body;
    if (savedStyles) {
        body.style.position = savedStyles.position;
        body.style.top = savedStyles.top;
        body.style.left = savedStyles.left;
        body.style.right = savedStyles.right;
        body.style.width = savedStyles.width;
        body.style.overflow = savedStyles.overflow;
        body.style.overscrollBehavior = savedStyles.overscrollBehavior;
        savedStyles = null;
    }
    // Restore the exact position the user was at before the overlay opened.
    window.scrollTo(0, savedScrollY);
}

/**
 * @param active When true the page behind is locked. Safe to toggle; the lock
 *               is always released on unmount so a sheet that unmounts while
 *               open cannot strand the page in a locked state.
 */
export function useBodyScrollLock(active: boolean): void {
    useEffect(() => {
        if (!active) return;
        applyLock();
        return () => releaseLock();
    }, [active]);
}
