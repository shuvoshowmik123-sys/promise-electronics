import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Scroll Progress Bar
 *
 * A thin gradient bar fixed at the very top of the viewport
 * that fills from left to right as the user scrolls down.
 * Uses Framer Motion's useScroll + useSpring for smoothness.
 *
 * Brand gradient: Tech Blue → Teal
 */
export function ScrollProgressBar() {
    const { scrollYProgress } = useScroll();
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001,
    });

    return (
        <motion.div
            className="fixed top-0 left-0 right-0 h-[3px] z-[100] origin-left"
            style={{
                scaleX,
                background: "linear-gradient(90deg, hsl(199 89% 48%), hsl(173 58% 39%))",
            }}
        />
    );
}
