import { useEffect } from "react";
import { motion, type PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";

interface MobileBottomSheetFrameProps {
    children: React.ReactNode;
    className?: string;
    onClose: () => void;
    closeOffset?: number;
    closeVelocity?: number;
}

export function MobileBottomSheetFrame({
    children,
    className,
    onClose,
    closeOffset = 120,
    closeVelocity = 700,
}: MobileBottomSheetFrameProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > closeOffset || info.velocity.y > closeVelocity) onClose();
    };

    return (
        <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.28 }}
            onDragEnd={handleDragEnd}
            className={cn("select-none touch-pan-y", className)}
        >
            {children}
        </motion.div>
    );
}

export function MobileBottomSheetHandle({ className }: { className?: string }) {
    return <div className={cn("mx-auto h-1.5 w-10 rounded-full bg-slate-300", className)} aria-hidden />;
}
