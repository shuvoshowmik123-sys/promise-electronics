import { motion, HTMLMotionProps, TargetAndTransition, Transition } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Animation variant types for different button styles
export type AnimationVariant =
    | 'default'      // Standard tap scale
    | 'iconExpand'   // Icon scales up more prominently
    | 'cardExpand'   // Card-like expansion effect
    | 'rowExpand'    // List row highlight + expand
    | 'pulse'        // Glow/pulse effect for CTAs
    | 'iconSlide'    // Back button slide effect
    | 'iconSpin'     // Rotating icon (settings gear)
    | 'avatarZoom'   // Avatar zoom effect
    | 'textHighlight'; // Text link highlight

// Animation configurations for each variant - INCREASED INTENSITY
const animationConfigs: Record<AnimationVariant, {
    whileTap: TargetAndTransition;
    whileHover?: TargetAndTransition;
    transition: Transition;
}> = {
    default: {
        whileTap: { scale: 0.88, opacity: 0.85 },
        whileHover: { scale: 1.03 },
        transition: { type: "spring", stiffness: 600, damping: 15 }
    },
    iconExpand: {
        whileTap: { scale: 0.85, opacity: 0.7 },
        whileHover: { scale: 1.05 },
        transition: { type: "spring", stiffness: 700, damping: 12 }
    },
    cardExpand: {
        whileTap: { scale: 0.94, y: 4 },
        whileHover: { scale: 1.02, y: -3 },
        transition: { type: "spring", stiffness: 500, damping: 20 }
    },
    rowExpand: {
        whileTap: { scale: 0.96, x: 8, opacity: 0.9 },
        whileHover: { x: 4 },
        transition: { type: "spring", stiffness: 600, damping: 18 }
    },
    pulse: {
        whileTap: { scale: 0.88, opacity: 0.9 },
        whileHover: { scale: 1.05 },
        transition: { type: "spring", stiffness: 600, damping: 12 }
    },
    iconSlide: {
        whileTap: { scale: 0.85, x: -8 },
        whileHover: { x: -3 },
        transition: { type: "spring", stiffness: 700, damping: 15 }
    },
    iconSpin: {
        whileTap: { scale: 0.94, y: 4 },
        whileHover: { scale: 1.02, y: -3 },
        transition: { type: "spring", stiffness: 500, damping: 20 }
    },
    avatarZoom: {
        whileTap: { scale: 1.15 },
        whileHover: { scale: 1.1 },
        transition: { type: "spring", stiffness: 600, damping: 12 }
    },
    textHighlight: {
        whileTap: { scale: 0.95, opacity: 0.6 },
        whileHover: { opacity: 0.75 },
        transition: { duration: 0.12 }
    }
};

interface AnimatedButtonProps extends HTMLMotionProps<"button"> {
    children: ReactNode;
    className?: string;
    disableHaptics?: boolean;
    variant?: AnimationVariant;
}

export default function AnimatedButton({
    children,
    className,
    onTapStart,
    disableHaptics = false,
    variant = 'default',
    ...props
}: AnimatedButtonProps) {
    const config = animationConfigs[variant];

    const handleTapStart = async (event: any, info: any) => {
        if (!disableHaptics) {
            try {
                // Different haptic intensity based on variant
                const style = variant === 'pulse' || variant === 'cardExpand'
                    ? ImpactStyle.Medium
                    : ImpactStyle.Light;
                await Haptics.impact({ style });
            } catch (error) {
                // Silently fail on non-supported platforms
            }
        }

        if (onTapStart) {
            onTapStart(event, info);
        }
    };

    return (
        <motion.button
            whileTap={config.whileTap}
            whileHover={config.whileHover}
            transition={config.transition}
            className={cn("active:opacity-90 transition-shadow", className)}
            onTapStart={handleTapStart}
            {...props}
        >
            {children}
        </motion.button>
    );
}

// Animated Link wrapper for navigation with animation
interface AnimatedNavLinkProps {
    children: ReactNode;
    className?: string;
    variant?: AnimationVariant;
    disableHaptics?: boolean;
}

export function AnimatedNavLink({
    children,
    className,
    variant = 'default',
    disableHaptics = false
}: AnimatedNavLinkProps) {
    const config = animationConfigs[variant];

    const handleTap = async () => {
        if (!disableHaptics) {
            try {
                const style = variant === 'pulse' || variant === 'cardExpand'
                    ? ImpactStyle.Medium
                    : ImpactStyle.Light;
                await Haptics.impact({ style });
            } catch (error) {
                // Silently fail
            }
        }
    };

    return (
        <motion.div
            whileTap={config.whileTap}
            whileHover={config.whileHover}
            transition={config.transition}
            className={cn("cursor-pointer", className)}
            onTapStart={handleTap}
        >
            {children}
        </motion.div>
    );
}
