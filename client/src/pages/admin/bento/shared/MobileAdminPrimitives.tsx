import { type CSSProperties, type ReactElement, type ReactNode, cloneElement, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
            "z-30 flex-none space-y-1 bg-[#f8fafc] px-3 pb-1.5",
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
    // rAF-throttle: coalesce many scroll events into one layout read per frame.
    const tickingRef = useRef(false);
    const syncScrollPosition = (el: HTMLDivElement) => {
        if (window.innerWidth >= 768) return;
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
            detail: { scrollTop: el.scrollTop, syncOnly: true },
        }));
    };
    const onScroll = (e: { currentTarget: HTMLDivElement }) => {
        if (window.innerWidth >= 768 || tickingRef.current) return;
        const el = e.currentTarget;
        tickingRef.current = true;
        requestAnimationFrame(() => {
            tickingRef.current = false;
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
                detail: { scrollTop: el.scrollTop },
            }));
        });
    };
    return (
        <div
            data-admin-mobile-scroll="true"
            className={cn(
                "flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#f8fafc] px-3 pt-0 space-y-2 pb-4",
                className,
            )}
            onPointerDown={(e) => syncScrollPosition(e.currentTarget)}
            onTouchStart={(e) => syncScrollPosition(e.currentTarget)}
            onScroll={onScroll}
            style={{ paddingBottom: "var(--admin-mobile-bottom-clearance, calc(5.5rem + env(safe-area-inset-bottom)))" } as CSSProperties}
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

export function MobileMarqueeText({
    children,
    className,
    title,
    speed = "normal",
}: {
    children: ReactNode;
    className?: string;
    title?: string;
    speed?: "normal" | "slow";
}) {
    const outerRef = useRef<HTMLSpanElement>(null);
    const innerRef = useRef<HTMLSpanElement>(null);
    const [overflow, setOverflow] = useState(false);
    const [distance, setDistance] = useState(0);
    const seed = useMemo(() => Math.random(), []);

    useEffect(() => {
        const measure = () => {
            const outer = outerRef.current;
            const inner = innerRef.current;
            if (!outer || !inner) return;
            const nextDistance = Math.max(0, inner.scrollWidth - outer.clientWidth + 24);
            setDistance(nextDistance);
            setOverflow(nextDistance > 28);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (outerRef.current) observer.observe(outerRef.current);
        if (innerRef.current) observer.observe(innerRef.current);
        return () => observer.disconnect();
    }, [children]);

    return (
        <span
            ref={outerRef}
            className={cn("mobile-marquee", className)}
            data-overflow={overflow ? "true" : undefined}
            title={title}
            style={{
                "--mobile-marquee-distance": `${distance}px`,
                "--mobile-marquee-delay": `${0.35 + seed * 1.2}s`,
                "--mobile-marquee-duration": speed === "slow" ? "10s" : "7.5s",
            } as CSSProperties}
        >
            <span ref={innerRef} className="mobile-marquee__track">
                {children}
            </span>
        </span>
    );
}

function MobileKpiCards({ items, className }: { items: MobileKpiItem[]; className?: string }) {
    return (
        <div className={cn("grid grid-cols-2 gap-1.5", className)}>
            {items.map((item) => {
                const content = (
                    <>
                        <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{item.label}</span>
                            {item.icon && (
                                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md", toneClasses[item.tone || "slate"])}>
                                    {isValidElement(item.icon) ? cloneElement(item.icon as ReactElement<{ className?: string }>, { className: "h-3 w-3" }) : item.icon}
                                </span>
                            )}
                        </div>
                        <MobileMarqueeText className="mt-0.5 text-[15px] font-black leading-tight tracking-tight text-slate-950">{item.value}</MobileMarqueeText>
                        {item.meta && <MobileMarqueeText className="text-[10px] font-medium text-slate-500">{item.meta}</MobileMarqueeText>}
                    </>
                );

                return item.onClick ? (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm active:scale-[0.98]"
                    >
                        {content}
                    </button>
                ) : (
                    <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
                        {content}
                    </div>
                );
            })}
        </div>
    );
}

export function MobileKpiGrid({
    items,
    className,
    collapsible = false,
    defaultOpen = false,
    summaryLabel = "Metrics",
}: {
    items: MobileKpiItem[];
    className?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    summaryLabel?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);

    if (!collapsible) {
        return <MobileKpiCards items={items} className={cn("md:hidden", className)} />;
    }

    return (
        <div className="space-y-2 md:hidden">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm active:scale-[0.99]"
                aria-expanded={open}
            >
                <div className="min-w-0">
                    <MobileMarqueeText className="text-[10px] font-black uppercase tracking-wide text-slate-500">{summaryLabel}</MobileMarqueeText>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-black">
                        {items.slice(0, 3).map((item) => (
                            <span key={item.label} className={cn("min-w-0", toneClasses[item.tone || "slate"].split(" ").slice(-1)[0])}>
                                {item.label} <span className="text-slate-950">{item.value}</span>
                            </span>
                        ))}
                    </div>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
            </button>
            {open && <MobileKpiCards items={items} className={className} />}
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
                            <MobileMarqueeText className="text-[9px] font-black uppercase tracking-wide text-slate-500">{item.label}</MobileMarqueeText>
                            {item.icon && <span className={cn("shrink-0", toneClasses[item.tone || "slate"])}>{item.icon}</span>}
                        </div>
                        <MobileMarqueeText className="text-[14px] font-black leading-tight text-slate-950">{item.value}</MobileMarqueeText>
                        {item.meta && <MobileMarqueeText className="text-[10px] font-medium text-slate-500">{item.meta}</MobileMarqueeText>}
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
                <MobileMarqueeText className="text-sm font-black uppercase tracking-wide text-slate-900" title={title}>{title}</MobileMarqueeText>
                {meta && <MobileMarqueeText className="text-xs text-slate-500">{meta}</MobileMarqueeText>}
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
                                    <MobileMarqueeText className="text-sm font-bold text-slate-900">{item.title}</MobileMarqueeText>
                                    {item.meta && <MobileMarqueeText className="text-xs text-slate-500">{item.meta}</MobileMarqueeText>}
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
                    <MobileMarqueeText>{item.title}</MobileMarqueeText>
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
