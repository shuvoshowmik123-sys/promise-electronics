/**
 * The workshop sticker that goes on the television.
 *
 * A technician standing in front of twenty sets needs to find one of them, and
 * pulling a phone out for each is slower than reading. So the printed text is
 * the primary way to identify a set and the QR is the way to reach the full
 * job — the backup and the detail, not the first move.
 *
 * The rule that shapes everything here: PRINT ONLY WHAT NEVER CHANGES.
 *
 * Status, price, assigned technician and deadline all move during a repair. A
 * sticker that names them starts lying the same afternoon, and a lying label on
 * a customer's television is worse than a blank one. Those live behind the QR,
 * where they are always current. What is printed is what was true when the set
 * arrived and will still be true when it leaves.
 *
 * Not to be confused with the warranty seal, which is a different job entirely:
 * this one identifies a repair in progress and comes off at the end; that one
 * proves a finished repair was ours and must never come off. This sticker
 * deliberately carries no warranty code — one photographed on the day of
 * intake could otherwise be claimed against months later.
 */
import { forwardRef } from "react";

import { QrImage } from "./QrImage";

export type JobStickerData = {
    id: string;
    /** The number people say out loud. */
    jobNumber: string;
    customer?: string | null;
    customerPhone?: string | null;
    device?: string | null;
    screenSize?: string | null;
    issue?: string | null;
    /** Who took it in. */
    receivedBy?: string | null;
    createdAt: string | Date;
};

/** 50 x 25 mm — big enough for a scannable code and four readable lines. */
export const STICKER_MM = { width: 50, height: 25 };

const shortDate = (value: string | Date): string => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
};

/**
 * The last four digits, never the whole number.
 *
 * Enough to match the person collecting against the record, and useless to
 * anybody who photographs a television in a workshop.
 */
const phoneTail = (phone?: string | null): string => {
    const digits = String(phone ?? "").replace(/\D/g, "");
    return digits.length >= 4 ? `···${digits.slice(-4)}` : "";
};

const firstName = (name?: string | null): string =>
    String(name ?? "").trim().split(/\s+/)[0]?.slice(0, 12) ?? "";

const initial = (name?: string | null): string =>
    String(name ?? "").trim().charAt(0).toUpperCase();

export function JobSticker({ job, appBaseUrl }: { job: JobStickerData; appBaseUrl: string }) {
    const target = `${appBaseUrl.replace(/\/$/, "")}/tech/job/${job.id}`;
    const set = [job.device, job.screenSize].filter(Boolean).join(" ").trim();

    return (
        <div
            className="job-sticker"
            style={{
                width: `${STICKER_MM.width}mm`,
                height: `${STICKER_MM.height}mm`,
                display: "flex",
                alignItems: "center",
                gap: "1.5mm",
                padding: "1.5mm",
                boxSizing: "border-box",
                border: "0.2mm solid #94a3b8",
                borderRadius: "1mm",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: "#000",
                background: "#fff",
                overflow: "hidden",
            }}
        >
            <QrImage value={target} size={68} style={{ width: "19mm", height: "19mm", flexShrink: 0 }} />

            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.15 }}>
                {/* The number and the date: what it is, and how long it has sat. */}
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1mm" }}>
                    <span style={{ fontSize: "13px", fontWeight: 900, letterSpacing: "-0.3px" }}>
                        #{job.jobNumber}
                    </span>
                    <span style={{ fontSize: "6.5px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap" }}>
                        {shortDate(job.createdAt)}
                    </span>
                </div>

                <div style={{ borderTop: "0.2mm solid #cbd5e1", margin: "0.6mm 0" }} />

                {/* The set, then the fault: how a technician finds it on a shelf. */}
                <div style={{
                    fontSize: "8px", fontWeight: 800, textTransform: "uppercase",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                    {set || "—"}
                </div>
                <div style={{
                    fontSize: "7.5px", fontWeight: 500,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                    {job.issue || "—"}
                </div>

                {/* Who it belongs to, and who took it in. */}
                <div style={{
                    display: "flex", alignItems: "baseline", justifyContent: "space-between",
                    gap: "1mm", fontSize: "6.5px", color: "#475569", fontWeight: 600,
                }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {[firstName(job.customer), phoneTail(job.customerPhone)].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {initial(job.receivedBy) && (
                        <span style={{
                            border: "0.2mm solid #94a3b8", borderRadius: "0.6mm",
                            padding: "0 0.8mm", fontWeight: 800, flexShrink: 0,
                        }}>
                            {initial(job.receivedBy)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * A sheet of them for an ordinary A4 printer.
 *
 * Four across and ten down on plain sticker paper, because a shop that has to
 * buy a label printer before it can label anything will go on writing on
 * masking tape. A label roll can be added later by printing one sticker per
 * page; the sticker itself does not change.
 */
export const JobStickerSheet = forwardRef<HTMLDivElement, {
    jobs: JobStickerData[];
    appBaseUrl: string;
    /** Repeat one job to fill a sheet — useful when a set needs a spare. */
    copies?: number;
}>(({ jobs, appBaseUrl, copies = 1 }, ref) => {
    const all = jobs.flatMap((job) => Array.from({ length: Math.max(1, copies) }, () => job));

    return (
        <div ref={ref} className="job-sticker-sheet" style={{ background: "#fff" }}>
            <style>{`
                @media print {
                    @page { size: A4; margin: 8mm; }
                    /* A sticker split across a page break is wasted paper and a
                       wasted adhesive sheet, which is not cheap in a workshop. */
                    .job-sticker { break-inside: avoid; page-break-inside: avoid; }
                }
            `}</style>
            <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(4, ${STICKER_MM.width}mm)`,
                gap: "2mm",
                justifyContent: "start",
            }}>
                {all.map((job, index) => (
                    <JobSticker key={`${job.id}-${index}`} job={job} appBaseUrl={appBaseUrl} />
                ))}
            </div>
        </div>
    );
});
JobStickerSheet.displayName = "JobStickerSheet";
