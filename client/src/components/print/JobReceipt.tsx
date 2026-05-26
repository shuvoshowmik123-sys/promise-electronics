/**
 * JobReceipt — Customer copy
 * QR code links to: promiseelectronics.com/track/{ticketId}
 * Compact thermal-style layout for 80mm printers
 */
import { forwardRef } from "react";

interface JobReceiptProps {
    job: {
        id: string;
        customer: string | null;
        customerPhone: string | null;
        device: string | null;
        issue: string | null;
        ticketType?: string | null;
        panelModel?: string | null;
        panelInches?: string | null;
        panelType?: string | null;
        quantity?: number | null;
        status: string;
        technician?: string | null;
        estimatedCost?: number | null;
        createdAt: string | Date;
        warrantyDays?: number | null;
    };
    jobNumber: string;
    company: {
        name: string;
        address: string;
        phone: string;
        trackingBaseUrl?: string;
    };
}

function formatDate(d: string | Date) {
    return new Date(d).toLocaleString("en-BD", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true
    });
}

function getDeviceLabel(job: JobReceiptProps["job"]): string {
    if (job.ticketType === "panel_only" && job.panelModel) {
        return `Panel: ${job.panelModel}${job.panelInches ? ` (${job.panelInches}")` : ""}${job.panelType ? ` ${job.panelType}` : ""}`;
    }
    if (job.ticketType === "motherboard_only") return `Motherboard: ${job.device || ""}`;
    if (job.ticketType === "parts_only") return `Parts: ${job.device || ""}`;
    return job.device || "-";
}

export const JobReceipt = forwardRef<HTMLDivElement, JobReceiptProps>(({ job, jobNumber, company }, ref) => {
    const trackingUrl = `${company.trackingBaseUrl || "https://promiseelectronics.com"}/track/${job.id}`;

    return (
        <div
            ref={ref}
            className="print-receipt font-mono text-black bg-white"
            style={{ width: "80mm", padding: "4mm", fontSize: "11px", lineHeight: "1.4" }}
        >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: "6px" }}>
                <div style={{ fontSize: "14px", fontWeight: "bold", fontFamily: "sans-serif" }}>{company.name}</div>
                <div style={{ fontSize: "10px", color: "#555" }}>{company.address}</div>
                <div style={{ fontSize: "10px", color: "#555" }}>Tel: {company.phone}</div>
                <div style={{ borderTop: "1px dashed #999", margin: "5px 0" }} />
                <div style={{ fontSize: "13px", fontWeight: "bold", fontFamily: "sans-serif" }}>JOB RECEIPT</div>
                <div style={{ fontSize: "10px", color: "#666" }}>Customer Copy</div>
            </div>

            {/* Job Info */}
            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                <tbody>
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px", whiteSpace: "nowrap" }}>Job #:</td><td style={{ fontWeight: "bold" }}>{jobNumber}</td></tr>
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px", whiteSpace: "nowrap" }}>Date:</td><td>{formatDate(job.createdAt)}</td></tr>
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px", whiteSpace: "nowrap" }}>Customer:</td><td>{job.customer || "-"}</td></tr>
                    {job.customerPhone && <tr><td style={{ fontWeight: "bold", paddingRight: "4px" }}>Phone:</td><td>{job.customerPhone}</td></tr>}
                </tbody>
            </table>

            <div style={{ borderTop: "1px dashed #999", margin: "5px 0" }} />

            {/* Device Info */}
            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
                <tbody>
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px", whiteSpace: "nowrap" }}>Device:</td><td style={{ wordBreak: "break-word" }}>{getDeviceLabel(job)}</td></tr>
                    {job.quantity && job.quantity > 1 && <tr><td style={{ fontWeight: "bold", paddingRight: "4px" }}>Qty:</td><td>{job.quantity}</td></tr>}
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px" }}>Issue:</td><td style={{ wordBreak: "break-word" }}>{job.issue || "-"}</td></tr>
                    <tr><td style={{ fontWeight: "bold", paddingRight: "4px" }}>Status:</td><td>{job.status}</td></tr>
                    {job.estimatedCost != null && (
                        <tr><td style={{ fontWeight: "bold", paddingRight: "4px" }}>Est. Cost:</td><td>৳{job.estimatedCost.toFixed(0)}</td></tr>
                    )}
                </tbody>
            </table>

            <div style={{ borderTop: "1px dashed #999", margin: "5px 0" }} />

            {/* Warranty notice */}
            <div style={{ fontSize: "10px", color: "#444", marginBottom: "6px" }}>
                Warranty: {job.warrantyDays ?? 30} days from delivery date.
                Keep this receipt for warranty claims.
            </div>

            {/* QR Code — rendered via CSS/SVG data URL approach using tracking URL as text */}
            <div style={{ textAlign: "center", marginBottom: "6px" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "3px" }}>Scan to track your repair:</div>
                {/* QR code rendered as an img using Google Charts API at print time */}
                <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(trackingUrl)}`}
                    alt="Tracking QR"
                    style={{ width: "80px", height: "80px", display: "block", margin: "0 auto" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div style={{ fontSize: "9px", color: "#777", marginTop: "2px", wordBreak: "break-all" }}>
                    {trackingUrl}
                </div>
            </div>

            <div style={{ borderTop: "1px dashed #999", margin: "5px 0" }} />
            <div style={{ fontSize: "10px", textAlign: "center", color: "#555" }}>
                Thank you for choosing {company.name}!
            </div>
        </div>
    );
});

JobReceipt.displayName = "JobReceipt";
