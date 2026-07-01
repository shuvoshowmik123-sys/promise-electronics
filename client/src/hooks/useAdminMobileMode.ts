import { useEffect, useState } from "react";

function computeMobile(): boolean {
    if (typeof window === "undefined") return false;
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    // Portrait phone: any width under 768
    if (w < 768) return true;
    // Landscape phone: touch device with viewport height under 700
    // (768x390 landscape → w=768 fails first rule, but h=390 < 700 + touch → mobile)
    const isTouch =
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches;
    if (isTouch && h < 700) return true;
    return false;
}

/**
 * Returns true when the current device should render admin mobile UI.
 *
 * true:  390x844 portrait, 430x932 portrait, 844x390 landscape, 932x430 landscape
 * false: 1440x900 desktop, 768x1024 tablet
 *
 * Listens to resize and orientationchange. visualViewport-aware for iOS toolbar
 * shrink/expand behavior.
 */
export function useAdminMobileMode(): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(() => computeMobile());

    useEffect(() => {
        const update = () => setIsMobile(computeMobile());

        window.addEventListener("resize", update, { passive: true });
        window.addEventListener("orientationchange", update, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", update);
        }

        // Sync once on mount in case SSR produced a different value
        update();

        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", update);
            }
        };
    }, []);

    return isMobile;
}
