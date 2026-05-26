/**
 * JobTicketPrint — Internal work order
 * QR code links to: /tech/job/{ticketId} (in-app technician view)
 * A4 landscape friendly, more detail than customer receipt
 */
import { forwardRef } from "react";

interface JobTicketPrintProps {
    job: {
        id: string;
        customer: string | null;
        customerPhone: string | null;
        customerAddress?: string | null;
        device: string | null;
        issue: string | null;
        ticketType?: string | null;
        panelModel?: string | null;
        panelInches?: string | null;
        panelType?: string | null;
        quantity?: number | null;
        status: string;
        technician?: string | null;
        priority?: string | null;
        estimatedCost?: number | null;
        notes?: string | null;
        receivedAccessories?: string | null;
        createdAt: string | Date;
        deadline?: string | Date | null;
        warrantyDays?: number | null;
        assistedByNames?: string | null;
    };
    jobNumber: string;
    company: {
        name: string;
        address: string;
        phone: string;
        appBaseUrl?: string;
    };
}

function formatDate(d: string | Date | null | undefined) {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-BD", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true
    });
}

function getDeviceLabel(job: JobTicketPrintProps["job"]): string {
    if (job.ticketType === "panel_only" && job.panelModel) {
        const parts = [`Panel: ${job.panelModel}`];
        if (job.panelInches) parts.push(`${job.panelInches}"`);
        if (job.panelType) parts.push(job.panelType);
        return parts.join(" | ");
    }
    if (job.ticketType === "motherboard_only") return `Motherboard: ${job.device || ""}`;
    if (job.ticketType === "parts_only") return `Parts: ${job.device || ""}`;
    return job.device || "-";
}

const PRIORITY_COLORS: Record<string, string> = {
    "Critical": "#dc2626",
    "High": "#ea580c",
    "Medium": "#ca8a04",
    "Low": "#16a34a",
};

export const JobTicketPrint = forwardRef<HTMLDivElement, JobTicketPrintProps>(({ job, jobNumber, company }, ref) => {
    const techUrl = `${company.appBaseUrl || "https://promiseelectronics.com"}/tech/job/${job.id}`;
    const priorityColor = PRIORITY_COLORS[job.priority || "Medium"] || "#64748b";

    return (
        <div
            ref={ref}
            className="print-ticket font-sans text-black bg-white"
            style={{ width: "148mm", padding: "8mm", fontSize: "11px", lineHeight: "1.5", fontFamily: "Arial, sans-serif" }}
        >
            {/* Header Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                    <div style={{ fontSize: "16px", fontWeight: "bold" }}>{company.name}</div>
                    <div style={{ fontSize: "10px", color: "#666" }}>{company.address} | {company.phone}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "#1e40af" }}>#{jobNumber}</div>
                    <div style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: "bold",
                        color: "white",
                        backgroundColor: priorityColor
                    }}>
                        {(job.priority || "MEDIUM").toUpperCase()}
                    </div>
                </div>
            </div>

            <div style={{ borderTop: "2px solid #1e40af", marginBottom: "6px" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                {/* Left column */}
                <div>
                    <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "3px" }}>Customer</div>
                    <div style={{ fontWeight: "bold" }}>{job.customer || "-"}</div>
                    {job.customerPhone && <div style={{ fontSize: "10px", color: "#444" }}>{job.customerPhone}</div>}
                    {job.customerAddress && <div style={{ fontSize: "10px", color: "#666" }}>{job.customerAddress}</div>}
                </div>
                <div>
                    <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "3px" }}>Job Info</div>
                    <div style={{ fontSize: "10px" }}><strong>Created:</strong> {formatDate(job.createdAt)}</div>
                    {job.deadline && <div style={{ fontSize: "10px", color: "#dc2626" }}><strong>Deadline:</strong> {formatDate(job.deadline)}</div>}
                    <div style={{ fontSize: "10px" }}><strong>Status:</strong> {job.status}</div>
                </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: "6px" }} />

            {/* Device Section */}
            <div style={{ marginBottom: "8px" }}>
                <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "3px" }}>Device / Item</div>
                <div style={{ fontWeight: "bold", fontSize: "12px" }}>{getDeviceLabel(job)}</div>
                {job.quantity && job.quantity > 1 && <div style={{ fontSize: "10px" }}>Quantity: {job.quantity}</div>}
                <div style={{ marginTop: "4px" }}>
                    <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Issue / Fault</div>
                    <div style={{ padding: "4px 6px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "10px" }}>{job.issue || "-"}</div>
                </div>
                {job.receivedAccessories && (
                    <div style={{ marginTop: "4px", fontSize: "10px" }}><strong>Accessories Received:</strong> {job.receivedAccessories}</div>
                )}
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: "6px" }} />

            {/* Assignment */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <div>
                    <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Assigned Technician</div>
                    <div style={{ fontWeight: "bold" }}>{job.technician || "Unassigned"}</div>
                    {job.assistedByNames && <div style={{ fontSize: "10px", color: "#555" }}>Assist: {job.assistedByNames}</div>}
                </div>
                {job.estimatedCost != null && (
                    <div>
                        <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Estimated Cost</div>
                        <div style={{ fontWeight: "bold", fontSize: "13px", color: "#1e40af" }}>৳{job.estimatedCost.toFixed(0)}</div>
                    </div>
                )}
            </div>

            {job.notes && (
                <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Internal Notes</div>
                    <div style={{ padding: "4px 6px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "4px", fontSize: "10px" }}>{job.notes}</div>
                </div>
            )}

            {/* Work Completion Box */}
            <div style={{ border: "1px solid #d1d5db", borderRadius: "4px", padding: "6px", marginBottom: "8px" }}>
                <div style={{ fontSize: "9px", fontWeight: "bold", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Technician Sign-off</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "10px" }}>
                    <div>Work Done: ___________________________</div>
                    <div>Parts Used: ___________________________</div>
                    <div>Completed At: _______________________</div>
                    <div>Signature: ___________________________</div>
                </div>
            </div>

            {/* QR Code */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "9px", color: "#6b7280" }}>
                    <div>Scan to open in app:</div>
                    <div style={{ wordBreak: "break-all", maxWidth: "90mm" }}>{techUrl}</div>
                </div>
                <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(techUrl)}`}
                    alt="Job QR"
                    style={{ width: "60px", height: "60px" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "6px", paddingTop: "4px", fontSize: "9px", color: "#9ca3af", textAlign: "center" }}>
                INTERNAL USE ONLY — {company.name} Work Order
            </div>
        </div>
    );
});

JobTicketPrint.displayName = "JobTicketPrint";
