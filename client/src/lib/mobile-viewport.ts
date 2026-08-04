/**
 * Whether a viewport should get the mobile layout.
 *
 * Detection used to be `window.innerWidth < 768` and nothing else. A phone
 * rotated to landscape is 844–932px wide, so it crossed that line and the user
 * was handed the desktop layout mid-rotation — a layout never designed for a
 * 390px-tall viewport, and jarring for a customer who only turned their phone
 * sideways.
 *
 * Width alone cannot tell a rotated phone from a small laptop window. Two more
 * signals can:
 *
 *   - **Height.** A landscape phone is ~390–430px tall. A desktop window that
 *     narrow is still normally tall.
 *   - **Pointer type.** `(pointer: coarse)` means a finger. Desktops report
 *     `fine` even when the window is small.
 *
 * Requiring both keeps a genuinely small desktop window on the desktop layout,
 * where it belongs.
 */

export const MOBILE_BREAKPOINT = 768;
export const SHORT_VIEWPORT_HEIGHT = 500;

export type ViewportProbe = {
    width: number;
    height: number;
    coarsePointer: boolean;
};

export function detectIsMobileViewport({ width, height, coarsePointer }: ViewportProbe): boolean {
    // Portrait phones and narrow windows alike.
    if (width < MOBILE_BREAKPOINT) return true;

    // Wide but short and touched — a phone on its side.
    return coarsePointer && height < SHORT_VIEWPORT_HEIGHT;
}
