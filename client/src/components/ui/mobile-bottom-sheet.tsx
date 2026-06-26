import { useEffect } from "react";
import { motion, type PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";

interface MobileBottomSheetFrameProps {
    children: React.ReactNode;
    className?: string;
    onClose: () => void;
    closeOffset?: number;
    closeVelocity?: number;
    dragHandleOnly?: boolean;
}

export function MobileBottomSheetFrame({
    children,
    className,
    onClose,
    closeOffset = 120,
    closeVelocity = 700,
    dragHandleOnly = false,
}: MobileBottomSheetFrameProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > closeOffset || info.velocity.y > closeVelocity) onClose();
    };

    if (dragHandleOnly) {
        return (
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 340, damping: 34 }}
                className={cn("select-none", className)}
            >
                {children}
            </motion.div>
        );
    }

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

interface MobileBottomSheetDragHandleProps {
    className?: string;
    onClose: () => void;
    closeOffset?: number;
    closeVelocity?: number;
}

export function MobileBottomSheetDragHandle({
    className,
    onClose,
    closeOffset = 80,
    closeVelocity = 500,
}: MobileBottomSheetDragHandleProps) {
    const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (info.offset.y > closeOffset || info.velocity.y > closeVelocity) onClose();
    };

    return (
        <motion.div
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
            className={cn("flex shrink-0 cursor-grab items-center justify-center py-2.5 active:cursor-grabbing", className)}
        >
            <div className="h-1.5 w-10 rounded-full bg-slate-300" aria-hidden />
        </motion.div>
    );
}
