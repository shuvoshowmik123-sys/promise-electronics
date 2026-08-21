/**
 * Keeps the field you are typing into above the on-screen keyboard.
 *
 * QA-25 measured it for the first time: with a 336px keyboard up, six of the
 * eleven fields on the catch-up form sat underneath it — the work description
 * by 46px, the price boxes by 106px, the date by 166px — and the page never
 * moved. You could type, and not see what you typed.
 *
 * Browsers do scroll a focused element into view when the keyboard opens, but
 * only reliably when the page itself scrolls. This admin shell scrolls inside
 * a container (`[data-admin-mobile-scroll]`), and the browser's own attempt
 * lands on the wrong box or does nothing at all.
 *
 * `visualViewport` is what actually reports a keyboard: the layout viewport
 * stays 852px tall while the visual one shrinks to what is left. Listening to
 * that is the only way a web page learns a keyboard exists.
 */
import { useEffect } from "react";

/** Space kept between the field and the top of the keyboard. */
const BREATHING_ROOM = 16;

export function useKeyboardAwareScroll(enabled = true) {
    useEffect(() => {
        if (!enabled) return;
        const vv = window.visualViewport;
        if (!vv) return;

        let frame = 0;

        const bringFocusedIntoView = () => {
            cancelAnimationFrame(frame);
            /**
             * One frame later: the viewport resize and the browser's own
             * scrolling attempt both land first, so measuring immediately reads
             * a position that is about to change.
             */
            frame = requestAnimationFrame(() => {
                const el = document.activeElement as HTMLElement | null;
                if (!el) return;
                const typing = el.matches("input, textarea, select, [contenteditable=true]");
                if (!typing) return;

                const visibleBottom = vv.height + vv.offsetTop;
                const box = el.getBoundingClientRect();
                const overlap = box.bottom + BREATHING_ROOM - visibleBottom;
                if (overlap <= 0 && box.top >= 0) return;

                /**
                 * Scroll the container the shell actually scrolls, not the
                 * window — scrolling the window here does nothing, which is
                 * why the page appeared frozen with a field underneath the
                 * keyboard.
                 */
                const scroller = el.closest<HTMLElement>("[data-admin-mobile-scroll]");
                if (scroller) {
                    scroller.scrollBy({ top: overlap > 0 ? overlap : box.top - BREATHING_ROOM, behavior: "smooth" });
                } else {
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                }
            });
        };

        vv.addEventListener("resize", bringFocusedIntoView);
        // Also on focus: tapping a field lower down should lift it even before
        // the keyboard animation has finished changing the viewport.
        document.addEventListener("focusin", bringFocusedIntoView);

        return () => {
            cancelAnimationFrame(frame);
            vv.removeEventListener("resize", bringFocusedIntoView);
            document.removeEventListener("focusin", bringFocusedIntoView);
        };
    }, [enabled]);
}
