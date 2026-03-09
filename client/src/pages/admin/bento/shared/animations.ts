import { Variants, PanInfo } from "framer-motion";
import { variants } from "@/lib/motion";
export const containerVariants: Variants = {
    hidden: variants.staggerContainer.initial as any,
    visible: variants.staggerContainer.animate as any
};

export const itemVariants: Variants = {
    hidden: variants.staggerItem.initial as any,
    visible: variants.staggerItem.animate as any
};

// Lightweight variant for bulk/form cards where entrance should be minimal
export const liteItemVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { duration: 0.25, ease: "easeOut" }
    }
};

export const tableRowVariants: Variants = {
    hidden: { x: -10, opacity: 0 },
    visible: {
        x: 0,
        opacity: 1,
        transition: {
            type: "spring" as const,
            stiffness: 150,
            damping: 15
        }
    }
};

export const bounceItemVariants: Variants = {
    hidden: { y: 40, opacity: 0, scale: 0.85 },
    visible: {
        y: 0,
        opacity: 1,
        scale: 1,
        transition: {
            type: "spring",
            stiffness: 260,
            damping: 12,
            mass: 0.8,
        }
    }
};

// ============================================
// DRAG AND DROP ANIMATIONS
// ============================================

/**
 * Drag handle variants - for items that can be dragged
 */
export const dragHandleVariants: Variants = {
    idle: { scale: 1, color: "rgb(148, 163, 184)" }, // slate-400
    hover: { scale: 1.2, color: "rgb(59, 130, 246)" }, // blue-500
    active: { scale: 1.1, color: "rgb(37, 99, 235)" } // blue-600
};

/**
 * Draggable item variants - for the item being dragged
 */
export const draggableItemVariants: Variants = {
    idle: {
        scale: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        zIndex: 1
    },
    drag: {
        scale: 1.02,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        zIndex: 50,
        transition: {
            type: "spring",
            stiffness: 300,
            damping: 30
        }
    },
    drop: {
        scale: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        zIndex: 1,
        transition: {
            type: "spring",
            stiffness: 400,
            damping: 25
        }
    }
};

/**
 * Drop zone variants - placeholder where items can be dropped
 */
export const dropZoneVariants: Variants = {
    idle: {
        scale: 1,
        borderColor: "rgb(226, 232, 240)", // slate-200
        backgroundColor: "rgba(248, 250, 252, 0.5)" // slate-50/50
    },
    active: {
        scale: 1.02,
        borderColor: "rgb(59, 130, 246)", // blue-500
        backgroundColor: "rgba(59, 130, 246, 0.05)", // blue-500/5
        transition: {
            type: "spring",
            stiffness: 300,
            damping: 25
        }
    },
    hover: {
        scale: 1.01,
        borderColor: "rgb(96, 165, 250)", // blue-400
        backgroundColor: "rgba(59, 130, 246, 0.1)", // blue-500/10
        transition: {
            duration: 0.2
        }
    }
};

/**
 * Placeholder variants - shown when item is being dragged away
 */
export const placeholderVariants: Variants = {
    idle: {
        opacity: 0.3,
        scale: 0.95,
        backgroundColor: "rgb(241, 245, 249)" // slate-100
    },
    drag: {
        opacity: 0.5,
        scale: 0.98,
        backgroundColor: "rgb(226, 232, 240)", // slate-200
        transition: {
            duration: 0.2
        }
    }
};

/**
 * Sortable list reorder animation
 */
export const sortableListVariants: Variants = {
    idle: {
        transition: {
            staggerChildren: 0.03
        }
    },
    reorder: {
        transition: {
            staggerChildren: 0.05
        }
    }
};

/**
 * Swipe to delete variants
 */
export const swipeToDeleteVariants: Variants = {
    idle: { x: 0 },
    swiping: {
        x: 0,
        transition: {
            type: "spring",
            stiffness: 300,
            damping: 30
        }
    },
    deleting: {
        x: -300,
        opacity: 0,
        transition: {
            type: "spring",
            stiffness: 200,
            damping: 25
        }
    },
    restoring: {
        x: 0,
        opacity: 1,
        transition: {
            type: "spring",
            stiffness: 300,
            damping: 25
        }
    }
};

/**
 * Grab cursor style
 */
export const grabCursor = {
    cursor: "grab",
    userSelect: "none" as const
};

/**
 * Grabbing cursor style (when actively dragging)
 */
export const grabbingCursor = {
    cursor: "grabbing",
    userSelect: "none" as const
};

/**
 * Drag constraints - useful for keeping drag within bounds
 */
export const dragConstraints = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
};

/**
 * Create drag event handlers for sortable lists
 */
export interface DragEvents {
    onDragStart?: () => void;
    onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
}

/**
 * Check if drag ended with enough velocity to trigger action
 */
export const isDragVelocityEnough = (info: PanInfo, threshold: number = 500): boolean => {
    return Math.abs(info.velocity.x) > threshold || Math.abs(info.velocity.y) > threshold;
};

/**
 * Check if drag distance is enough to trigger action
 */
export const isDragDistanceEnough = (info: PanInfo, threshold: number = 50): boolean => {
    return Math.abs(info.offset.x) > threshold || Math.abs(info.offset.y) > threshold;
};
