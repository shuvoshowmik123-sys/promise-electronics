import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BentoCardProps extends HTMLMotionProps<"div"> {
    className?: string;
    title?: string;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    variant?: "default" | "vibrant" | "glass" | "outline" | "ghost";
    colSpan?: number;
    spotlightColor?: string; // kept for API compat — no longer used at runtime
    onClick?: () => void;
    layoutId?: string;
    disableHover?: boolean;
    enableRise?: boolean;
    as?: any; // captured + discarded to prevent spreading
}

// ─── Variant class maps ───────────────────────────────────────────────────────
// All hover/animation effects (.bc-hover, .bc-rise, .bc-glass, .bc-icon-tint)
// are defined statically in index.css, processed by Vite at build time.
// This eliminates the previous JS injection which was unreliable under HMR.
const variantBase = {
    default: "bg-white border-slate-200/60 shadow-sm",
    vibrant: "border-transparent text-white shadow-xl shadow-blue-900/10",
    // Glass: gradient-based frost illusion — visually ~identical to backdrop-blur
    // but costs zero GPU compositing layers (see .bc-glass in index.css)
    glass: "border-white/60 shadow-sm",
    outline: "bg-transparent border-slate-200 border-dashed shadow-none",
    ghost: "bg-transparent border-none shadow-none",
};

// ─── Component ────────────────────────────────────────────────────────────────
export function BentoCard({
    children,
    className,
    title,
    icon,
    onClick,
    layoutId,
    variant = "default",
    spotlightColor: _spotlightColor, // consumed + discarded
    disableHover = false,
    enableRise = true,
    as: _unusedAs,                   // consumed + discarded
    ...props
}: BentoCardProps) {

    // ── Class composition ──────────────────────────────────────────────────
    const cardClass = cn(
        // Base structural classes — NO overflow-hidden here (it clips box-shadow + hover rise!)
        "relative rounded-[2rem] border p-6 flex flex-col",
        // Variant background/border
        variantBase[variant],
        // Glass frost illusion (no backdrop-blur)
        variant === "glass" && "bc-glass",
        // Hover effects (shimmer ::before + border glow) — only if not disabled
        !disableHover && "bc-hover",
        // Hover rise + perspective tilt — only if not disabled and enabled
        !disableHover && enableRise && "bc-rise",
        // Click cursor
        onClick && "bc-clickable",
        // Consumer class overrides last
        className
    );

    // ── Shared inner content ───────────────────────────────────────────────
    const inner = (
        <>
            {/* Header */}
            {(title || icon) && (
                <div className="flex items-start justify-between mb-6 relative z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className={cn(
                                "p-2.5 rounded-2xl ring-1 bc-icon-tint",
                                variant === "vibrant"
                                    ? "bg-white/20 text-white ring-white/30"
                                    : "bg-slate-50 text-slate-500 ring-slate-100"
                            )}>
                                {icon}
                            </div>
                        )}
                        {title && (
                            <h3 className={cn(
                                "text-sm font-bold uppercase tracking-widest",
                                variant === "vibrant" ? "text-white/80" : "text-slate-400"
                            )}>
                                {title}
                            </h3>
                        )}
                    </div>
                </div>
            )}
            {/* Content — Removed overflow-hidden to prevent clipping text and logos */}
            <div className="flex-1 min-h-0 w-full flex flex-col relative z-10">
                {children}
            </div>
        </>
    );

    // ── Motion path: use motion.div when parent passes Framer variant props ──
    // This allows entrance stagger via containerVariants to work unmodified.
    // Otherwise render a plain <div> — zero Framer overhead at all.
    const hasMotionProps = Boolean(
        props.variants || props.animate || props.initial || props.exit || layoutId
    );

    if (hasMotionProps) {
        return (
            <motion.div
                {...props}
                layoutId={layoutId}
                onClick={onClick}
                className={cardClass}
            >
                {inner}
            </motion.div>
        );
    }

    // Plain div path — strip any motion-specific props that would be invalid on <div>
    const {
        variants: _v, animate: _a, initial: _i, exit: _e, transition: _t,
        whileHover: _wh, whileTap: _wt, whileFocus: _wf, whileInView: _wiv,
        viewport: _vp, onAnimationStart: _oas, onAnimationComplete: _oac,
        ...divProps
    } = props as any;

    return (
        <div
            {...divProps}
            onClick={onClick}
            className={cardClass}
        >
            {inner}
        </div>
    );
}
