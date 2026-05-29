/**
 * ClientClassBadge — shows client type pill on job cards, sessions, customer rows.
 * Reads clientClass string from job/session data.
 * Null/undefined → renders nothing (online walk-in = default, no badge needed).
 */

type Props = {
    clientClass?: string | null;
    size?: "sm" | "xs";
};

const CLASS_CONFIG: Record<string, { label: string; color: string }> = {
    repeat:        { label: "Repeat",     color: "bg-violet-100 text-violet-700" },
    reference:     { label: "Referred",   color: "bg-pink-100 text-pink-700" },
    technician:    { label: "Technician", color: "bg-red-100 text-red-700 font-bold" },
    b2b_normal:    { label: "B2B",        color: "bg-indigo-100 text-indigo-700" },
    b2b_corporate: { label: "Corporate",  color: "bg-amber-100 text-amber-800 font-bold" },
};

export function ClientClassBadge({ clientClass, size = "sm" }: Props) {
    if (!clientClass || clientClass === "online") return null;
    const cfg = CLASS_CONFIG[clientClass];
    if (!cfg) return null;

    const sizeClass = size === "xs"
        ? "text-[9px] px-1 py-0"
        : "text-[10px] px-1.5 py-0.5";

    return (
        <span className={`inline-flex items-center rounded font-semibold uppercase tracking-wide ${cfg.color} ${sizeClass}`}>
            {cfg.label}
        </span>
    );
}
