import { motion, HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface AnimatedButtonProps extends HTMLMotionProps<"button"> {
    children: ReactNode;
    className?: string;
    disableHaptics?: boolean;
}

export default function AnimatedButton({ children, className, onTapStart, disableHaptics = false, ...props }: AnimatedButtonProps) {
    const handleTapStart = async (event: any, info: any) => {
        if (!disableHaptics) {
            try {
                await Haptics.impact({ style: ImpactStyle.Light });
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
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={cn("active:opacity-80", className)}
            onTapStart={handleTapStart}
            {...props}
        >
            {children}
        </motion.button>
    );
}
