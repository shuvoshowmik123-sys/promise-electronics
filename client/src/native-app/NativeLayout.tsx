import { ReactNode } from "react";
import { motion } from "framer-motion";

interface NativeLayoutProps {
    children: ReactNode;
    className?: string;
}

export default function NativeLayout({ children, className = "" }: NativeLayoutProps) {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`h-full overflow-hidden w-full bg-[var(--color-native-bg)] text-[var(--color-native-text)] flex flex-col pb-[env(safe-area-inset-bottom)] ${className}`}
        >
            {children}
        </motion.div>
    );
}

