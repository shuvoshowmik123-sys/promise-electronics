import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── LAYOUT PRIMITIVES ────────────────────────────────────────────────────────
// Every mobile admin tab MUST use these three wrappers.
// They enforce the shared vibe: fixed layout, sticky header, scroll area with
// glass-island hide event. Desktop is always untouched inside these wrappers.

/**
 * Root wrapper for any mobile tab.
 * Sets layout: fixed equivalent — flex-col, h-full, overflow-hidden.
 * Use as the outermost element of every redesigned tab component.
 */
export function MobileTabLayout({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col h-full overflow-hidden", className)}>
            {children}
        </div>
    );
}

/**
 * Sticky header block — never scrolls.
 * Contains: KPI strip / title row → quick actions → tab switcher → sub-tab switcher.
 * Only rendered on mobile (md:hidden). Desktop renders its own header inside children.
 */
export function MobileTabHeader({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn(
            "md:hidden flex-none bg-[#f8fafc] border-b border-slate-100/80 z-30 px-3 space-y-1 pb-1.5",
            className,
        )}>
            {children}
        </div>
    );
}

/**
 * Scrollable content area — the only scrolling surface on mobile.
 * Fires admin:mobile-chrome to hide the glass island at 24px scroll.
 * bg matches page bg so no gap shows between content and bottom nav.
 */
export function MobileScrollContent({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#f8fafc] px-3 pt-0 space-y-2 pb-4",
                className,
            )}
            onScroll={(e) => {
                if (window.innerWidth >= 768) return;
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
                    detail: { hidden: (e.currentTarget as HTMLDivElement).scrollTop > 24 },
                }));
            }}
        >
            {children}
        </div>
    );
}
// ─────────────────────────────────────────────────────────────────────────────

type MobileKpiItem = {
    label: string;
    value: ReactNode;
    meta?: ReactNode;
    icon?: ReactNode;
    tone?: "emerald" | "blue" | "amber" | "rose" | "violet" | "slate";
    onClick?: () => void;
};

const toneClasses: Record<NonNullable<MobileKpiItem["tone"]>, string> = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
};

export function MobileKpiGrid({ items, className }: { items: MobileKpiItem[]; className?: string }) {
    return (
        <div className={cn("grid grid-cols-2 gap-2 md:hidden", className)}>
            {items.map((item) => {
                const content = (
                    <>
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</span>
                            {item.icon && (
                                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", toneClasses[item.tone || "slate"])}>
                                    {item.icon}
                                </span>
                            )}
                        </div>
                        <div className="mt-2 truncate text-[19px] font-black leading-tight tracking-tight text-slate-950">{item.value}</div>
                        {item.meta && <div className="mt-1 truncate text-[11px] font-medium text-slate-500">{item.meta}</div>}
                    </>
                );

                return item.onClick ? (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="min-h-[96px] rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.98]"
                    >
                        {content}
                    </button>
                ) : (
                    <div key={item.label} className="min-h-[96px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        {content}
                    </div>
                );
            })}
        </div>
    );
}

export function MobileMicroMetricGrid({ items, className }: { items: MobileKpiItem[]; className?: string }) {
    return (
        <div className={cn("grid grid-cols-2 gap-1 md:hidden", className)}>
            {items.map((item) => {
                const content = (
                    <>
                        <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">{item.label}</span>
                            {item.icon && <span className={cn("shrink-0", toneClasses[item.tone || "slate"])}>{item.icon}</span>}
                        </div>
                        <div className="truncate text-[14px] font-black leading-tight text-slate-950">{item.value}</div>
                        {item.meta && <div className="truncate text-[10px] font-medium text-slate-500">{item.meta}</div>}
                    </>
                );

                return item.onClick ? (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="min-h-[50px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm active:scale-[0.99]"
                    >
                        {content}
                    </button>
                ) : (
                    <div key={item.label} className="min-h-[50px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
                        {content}
                    </div>
                );
            })}
        </div>
    );
}

export function MobileSectionHeader({ title, meta, action }: { title: string; meta?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 md:hidden">
            <div className="min-w-0">
                <h2 className="truncate text-sm font-black uppercase tracking-wide text-slate-900">{title}</h2>
                {meta && <p className="truncate text-xs text-slate-500">{meta}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

type MobileActionItem = {
    key: string;
    title: ReactNode;
    meta?: ReactNode;
    icon?: ReactNode;
    tone?: MobileKpiItem["tone"];
    onClick?: () => void;
};

export function MobileActionList({ title, empty, items, className }: { title: string; empty: ReactNode; items: MobileActionItem[]; className?: string }) {
    return (
        <div className={cn("rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:hidden", className)}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">{title}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{items.length}</span>
            </div>
            {items.length === 0 ? (
                <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">{empty}</div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => {
                        const body = (
                            <>
                                {item.icon && (
                                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", toneClasses[item.tone || "slate"])}>
                                        {item.icon}
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-slate-900">{item.title}</span>
                                    {item.meta && <span className="block truncate text-xs text-slate-500">{item.meta}</span>}
                                </span>
                                {item.onClick && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                            </>
                        );

                        return item.onClick ? (
                            <button
                                key={item.key}
                                type="button"
                                onClick={item.onClick}
                                className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left active:scale-[0.99]"
                            >
                                {body}
                            </button>
                        ) : (
                            <div key={item.key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                {body}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function MobileCommandRail({ items, className }: { items: Array<MobileActionItem & { badge?: ReactNode }>; className?: string }) {
    return (
        <div className={cn("grid grid-cols-3 gap-1 md:hidden", className)}>
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    className="flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-black text-slate-800 shadow-sm active:scale-[0.99]"
                >
                    {item.icon}
                    <span className="truncate">{item.title}</span>
                    {item.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", toneClasses[item.tone || "slate"])}>{item.badge}</span>}
                </button>
            ))}
        </div>
    );
}

export function MobileRecordList({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("space-y-2 pb-24 md:hidden", className)}>{children}</div>;
}

type SegmentItem<T extends string> = {
    value: T;
    label: string;
    badge?: ReactNode;
    icon?: ReactNode;
};

export function MobileSegmentTabs<T extends string>({
    value,
    items,
    onChange,
    tone = "slate",
    className,
}: {
    value: T;
    items: SegmentItem<T>[];
    onChange: (value: T) => void;
    tone?: MobileKpiItem["tone"];
    className?: string;
}) {
    return (
        <div className={cn("-mx-0.5 overflow-x-auto pb-0.5 md:hidden", className)} style={{ scrollbarWidth: "none" }}>
            <div className="flex min-w-max gap-1 px-0.5">
                {items.map((item) => {
                    const active = item.value === value;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => onChange(item.value)}
                            className={cn(
                                "flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition-colors",
                                active ? toneClasses[tone || "slate"] : "border-slate-200 bg-white text-slate-500"
                            )}
                        >
                            {item.icon}
                            {item.label}
                            {item.badge}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
