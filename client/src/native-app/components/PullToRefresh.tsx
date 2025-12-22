import { useState, useRef, useEffect } from "react";
import { motion, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const y = useMotionValue(0);
    const controls = useAnimation();

    // Touch state
    const touchStart = useRef(0);
    const isPulling = useRef(false);

    // Transform y value to rotation for the spinner
    const rotate = useTransform(y, [0, 80], [0, 360]);
    const opacity = useTransform(y, [0, 40], [0, 1]);

    const handleTouchStart = (e: React.TouchEvent) => {
        // Only enable pull if we are at the top
        if (scrollRef.current && scrollRef.current.scrollTop === 0) {
            touchStart.current = e.touches[0].clientY;
            isPulling.current = false;
        } else {
            touchStart.current = 0; // Invalid start
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStart.current || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const delta = currentY - touchStart.current;

        // If pulling down and at top
        if (delta > 0 && scrollRef.current?.scrollTop === 0) {
            isPulling.current = true;
            // Add resistance
            y.set(delta * 0.4);

            // Prevent native scroll/refresh if we are effectively pulling
            if (e.cancelable && delta > 5) {
                e.preventDefault();
            }
        } else {
            isPulling.current = false;
            y.set(0);
        }
    };

    const handleTouchEnd = async () => {
        touchStart.current = 0;

        if (isPulling.current) {
            isPulling.current = false;

            if (y.get() > 80) {
                setIsRefreshing(true);
                // Snap to loading position
                await controls.start({ y: 60, transition: { type: "spring", stiffness: 300, damping: 20 } });

                try {
                    await onRefresh();
                } finally {
                    setIsRefreshing(false);
                    // Snap back to top
                    controls.start({ y: 0, transition: { duration: 0.2 } });
                }
            } else {
                // Snap back if not pulled enough
                controls.start({ y: 0, transition: { type: "spring", stiffness: 300, damping: 20 } });
            }
        }
    };

    return (
        <div className="relative h-full overflow-hidden">
            {/* Loading Indicator */}
            <motion.div
                className="absolute top-0 left-0 right-0 flex justify-center pt-4 z-10 pointer-events-none"
                style={{ y, opacity }}
            >
                <div className="bg-[var(--color-native-card)] rounded-full p-2 shadow-md border border-[var(--color-native-border)]">
                    <motion.div style={{ rotate }} animate={isRefreshing ? { rotate: 360 } : {}}>
                        <Loader2 className={`w-5 h-5 text-[var(--color-native-primary)] ${isRefreshing ? 'animate-spin' : ''}`} />
                    </motion.div>
                </div>
            </motion.div>

            {/* Content */}
            <motion.div
                ref={scrollRef}
                className="h-full overflow-y-auto scrollbar-hide"
                style={{ y }}
                animate={controls}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {children}
            </motion.div>
        </div>
    );
}
