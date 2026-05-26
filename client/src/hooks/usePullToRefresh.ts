/**
 * usePullToRefresh — Phase 4
 * Detects downward swipe at the top of a scroll container and calls onRefresh.
 * Works on touch and mouse (desktop dev testing).
 */
import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 70; // px to trigger refresh
const MAX_PULL = 120;      // px cap for visual feedback

interface Options {
    onRefresh: () => Promise<void> | void;
    disabled?: boolean;
}

export function usePullToRefresh({ onRefresh, disabled }: Options) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const startY = useRef(0);
    const pulling = useRef(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || disabled) return;

        const onTouchStart = (e: TouchEvent) => {
            if (el.scrollTop !== 0) return;
            startY.current = e.touches[0].clientY;
            pulling.current = true;
        };

        const onTouchMove = (e: TouchEvent) => {
            if (!pulling.current || isRefreshing) return;
            const delta = Math.max(0, e.touches[0].clientY - startY.current);
            if (delta > 0 && el.scrollTop === 0) {
                e.preventDefault();
                setPullDistance(Math.min(delta, MAX_PULL));
            }
        };

        const onTouchEnd = async () => {
            if (!pulling.current) return;
            pulling.current = false;
            if (pullDistance >= PULL_THRESHOLD) {
                setIsRefreshing(true);
                try {
                    await onRefresh();
                } finally {
                    setIsRefreshing(false);
                }
            }
            setPullDistance(0);
        };

        el.addEventListener("touchstart", onTouchStart, { passive: true });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);

        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
        };
    }, [onRefresh, disabled, pullDistance, isRefreshing]);

    const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
    const triggered = pullDistance >= PULL_THRESHOLD;

    return { containerRef, pullDistance, isRefreshing, progress, triggered };
}
