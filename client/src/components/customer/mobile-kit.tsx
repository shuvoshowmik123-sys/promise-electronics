import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Customer Portal — Mobile Design Kit
 * ───────────────────────────────────────────────────────────────
 * Shared primitives that lock the "Special Edition" mobile vibe:
 * light/airy surfaces, royal-blue primary, teal = "live/active",
 * fully-rounded pill buttons, soft cards, mono reference numbers.
 *
 * Palette (kept local via Tailwind so it doesn't touch the global
 * customer `--color-primary` used by the existing desktop site):
 *   primary  = blue-600/700
 *   live     = teal-600 / emerald
 * Used by all Phase 1+ customer mobile screens.
 */

// ── Pill button ────────────────────────────────────────────────
type PillVariant = "primary" | "secondary" | "ghost" | "dark";

const pillVariants: Record<PillVariant, string> = {
    primary: "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700",
    secondary: "border-2 border-emerald-600 bg-white text-emerald-600 hover:bg-emerald-50",
    dark: "bg-gradient-to-r from-[#0a0f1c] to-[#1b2a4a] text-white shadow-lg shadow-slate-300",
    ghost: "text-slate-600 hover:bg-slate-100",
};

export function PillButton({
    children,
    variant = "primary",
    icon,
    fullWidth = true,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: PillVariant;
    icon?: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <button
            className={cn(
                "inline-flex h-14 items-center justify-center gap-2 rounded-full px-7 text-sm font-black uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
                fullWidth && "w-full",
                pillVariants[variant],
                className,
            )}
            {...props}
        >
            {icon}
            {children}
        </button>
    );
}

// ── Segmented toggle ───────────────────────────────────────────
export function SegmentedToggle<T extends string>({
    value,
    onChange,
    options,
    className,
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
    className?: string;
}) {
    return (
        <div className={cn("flex rounded-full bg-emerald-50 p-1", className)}>
            {options.map((opt) => {
                const active = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            "flex-1 rounded-full py-2.5 text-sm font-bold transition active:scale-[0.98]",
                            active ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500",
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Quick-action icon tile ─────────────────────────────────────
export function IconTile({
    icon,
    label,
    onClick,
    className,
}: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn("flex flex-col items-center gap-2 transition active:scale-95", className)}
        >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                {icon}
            </span>
            <span className="text-center text-xs font-semibold leading-tight text-slate-600">{label}</span>
        </button>
    );
}

// ── Status chip ────────────────────────────────────────────────
export type StatusTone = "live" | "pending" | "done" | "delivered" | "cancelled" | "neutral";

const statusTones: Record<StatusTone, string> = {
    live: "bg-teal-50 text-teal-700",          // In Progress / active
    pending: "bg-amber-50 text-amber-700",
    done: "bg-emerald-50 text-emerald-700",
    delivered: "bg-purple-50 text-purple-700",
    cancelled: "bg-rose-50 text-rose-700",
    neutral: "bg-slate-100 text-slate-600",
};

export function StatusChip({
    children,
    tone = "neutral",
    className,
}: {
    children: React.ReactNode;
    tone?: StatusTone;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                statusTones[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}

// Map a raw job/order status string to a tone.
export function toneForStatus(status?: string): StatusTone {
    const s = (status || "").toLowerCase();
    if (s.includes("progress") || s.includes("diagnos") || s.includes("repair")) return "live";
    if (s.includes("pending") || s.includes("await") || s.includes("quote")) return "pending";
    if (s.includes("complete") || s.includes("ready") || s.includes("done") || s.includes("approved")) return "done";
    if (s.includes("deliver")) return "delivered";
    if (s.includes("cancel")) return "cancelled";
    return "neutral";
}

// ── Section eyebrow (tiny uppercase tracked label) ─────────────
export function SectionEyebrow({
    children,
    tone = "teal",
    className,
}: {
    children: React.ReactNode;
    tone?: "teal" | "blue" | "slate";
    className?: string;
}) {
    const toneClass = tone === "blue" ? "text-emerald-600" : tone === "slate" ? "text-slate-400" : "text-teal-600";
    return (
        <p className={cn("text-[11px] font-black uppercase tracking-[0.2em]", toneClass, className)}>
            {children}
        </p>
    );
}

// ── Google "G" glyph (multicolor) ─────────────────────────────
export function GoogleGlyph({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    );
}

// ── Reference badge (mono pill for TR-/SR-/Order numbers) ──────
export function RefBadge({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500",
                className,
            )}
        >
            {children}
        </span>
    );
}
