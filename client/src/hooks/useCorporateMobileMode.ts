import { useEffect, useState } from "react";

function getCorporateMobileMode() {
    if (typeof window === "undefined") return false;

    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;

    if (width < 768) return true;

    const isTouch = navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
    return isTouch && height < 700;
}

export function useCorporateMobileMode() {
    const [isMobile, setIsMobile] = useState(getCorporateMobileMode);

    useEffect(() => {
        const update = () => setIsMobile(getCorporateMobileMode());
        window.addEventListener("resize", update, { passive: true });
        window.addEventListener("orientationchange", update);
        window.visualViewport?.addEventListener("resize", update);
        update();

        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
            window.visualViewport?.removeEventListener("resize", update);
        };
    }, []);

    return isMobile;
}
