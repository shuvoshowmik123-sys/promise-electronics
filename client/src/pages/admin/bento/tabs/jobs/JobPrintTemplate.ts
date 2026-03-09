import { format } from "date-fns";
import { JobTicket } from "@shared/schema";

const escapeHtml = (value: string | null | undefined): string => {
    if (!value) return "";
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

export function generatePrintHtml(
    job: JobTicket,
    qrUrl: string,
    trackingUrl: string,
    currencySymbol: string,
    logoUrl?: string
): string {
    const printedOn = format(new Date(), "dd MMM yyyy, h:mm a");
    const createdOn = job.createdAt ? format(new Date(job.createdAt), "dd MMM yyyy") : "N/A";
    const estimatedCost = typeof job.estimatedCost === "number"
        ? `${currencySymbol} ${job.estimatedCost}`
        : "To be assessed";
    const safeLogoUrl = escapeHtml(logoUrl || "");
    const safeTrackingUrl = escapeHtml(trackingUrl);

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title> </title>
        <style>
          @page {
            size: A4;
            margin: 10mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            width: 190mm;
            margin: 0 auto;
            padding: 7mm;
            border: 1px solid #cbd5e1;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 12px;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }

          .brand-logo {
            width: 58px;
            height: 58px;
            object-fit: cover;
            border: none;
            padding: 0;
            background: transparent;
            border-radius: 50%;
            display: block;
          }

          .brand-fallback {
            width: 58px;
            height: 58px;
            border: 1px solid #cbd5e1;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            text-align: center;
            line-height: 1.2;
          }

          .brand-name {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.3px;
          }

          .brand-subtitle {
            margin-top: 2px;
            font-size: 11px;
            color: #475569;
          }

          .meta {
            min-width: 245px;
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
          }

          .meta-title {
            font-size: 18px;
            font-weight: 800;
            margin-bottom: 6px;
          }

          .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 4px;
            font-size: 11px;
          }

          .label {
            font-size: 10px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 3px;
          }

          .value {
            font-size: 13px;
            font-weight: 600;
            line-height: 1.35;
            word-break: break-word;
          }

          .section {
            margin-bottom: 10px;
          }

          .section-box {
            border: 1px solid #dbe2ea;
            padding: 10px 12px;
          }

          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .grid-3 {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
          }

          .summary-chip {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            min-height: 54px;
          }

          .terms-list {
            margin: 6px 0 0 16px;
            padding: 0;
            font-size: 11px;
            line-height: 1.45;
            color: #334155;
          }

          .footer-row {
            display: grid;
            grid-template-columns: 1fr 170px;
            gap: 18px;
            align-items: end;
            margin-top: 12px;
          }

          .signature-block {
            width: 240px;
            border-top: 1px solid #0f172a;
            padding-top: 6px;
            margin-top: 22px;
          }

          .signature-date {
            width: 160px;
            border-top: 1px solid #0f172a;
            padding-top: 6px;
            margin-top: 18px;
          }

          .qr-panel {
            border: 1px solid #cbd5e1;
            padding: 10px;
            text-align: center;
          }

          .qr-img {
            width: 108px;
            height: 108px;
            display: block;
            margin: 0 auto 8px;
          }

          .qr-label {
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .qr-url {
            font-size: 10px;
            line-height: 1.35;
            color: #334155;
            word-break: break-word;
          }

          @media print {
            .page {
              width: auto;
              margin: 0;
              padding: 0;
              border: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="brand">
              ${safeLogoUrl
                ? `<img src="${safeLogoUrl}" alt="Promise Electronics Logo" class="brand-logo" />`
                : `<div class="brand-fallback">Promise<br/>Electronics</div>`}
              <div>
                <div class="brand-name">Promise Electronics</div>
                <div class="brand-subtitle">Job Ticket / Service Receipt</div>
              </div>
            </div>

            <div class="meta">
              <div class="meta-title">Claim Slip</div>
              <div class="meta-row"><span class="label">Job No</span><strong>${escapeHtml(job.id)}</strong></div>
              <div class="meta-row"><span class="label">Printed</span><span>${printedOn}</span></div>
            </div>
          </div>

          <div class="section section-box">
            <div class="grid-2">
              <div>
                <div class="label">Customer</div>
                <div class="value">${escapeHtml(job.customer || "Walk-in Customer")}</div>
              </div>
              <div>
                <div class="label">Phone</div>
                <div class="value">${escapeHtml(job.customerPhone || "Not provided")}</div>
              </div>
            </div>
            ${job.customerAddress ? `
              <div class="section" style="margin-top: 10px; margin-bottom: 0;">
                <div class="label">Address</div>
                <div class="value">${escapeHtml(job.customerAddress)}</div>
              </div>
            ` : ""}
          </div>

          <div class="section section-box">
            <div class="grid-2">
              <div>
                <div class="label">Device</div>
                <div class="value">${escapeHtml(job.device || "Not specified")}</div>
              </div>
              <div>
                <div class="label">Screen Size</div>
                <div class="value">${escapeHtml(job.screenSize || "Not specified")}</div>
              </div>
            </div>
            <div class="section" style="margin-top: 10px; margin-bottom: 0;">
              <div class="label">Serial / Model</div>
              <div class="value">${escapeHtml(job.tvSerialNumber || "Not specified")}</div>
            </div>
          </div>

          <div class="section section-box">
            <div class="label">Reported Issue</div>
            <div class="value">${escapeHtml(job.issue || "Not specified")}</div>
          </div>

          <div class="section section-box">
            <div class="label">Accessories Received</div>
            <div class="value">${escapeHtml(job.receivedAccessories || "Not specified")}</div>
          </div>

          <div class="section grid-3">
            <div class="summary-chip">
              <div class="label">Status</div>
              <div class="value">${escapeHtml(job.status || "Pending")}</div>
            </div>
            <div class="summary-chip">
              <div class="label">Priority</div>
              <div class="value">${escapeHtml(job.priority || "Not Set")}</div>
            </div>
            <div class="summary-chip">
              <div class="label">Assigned Tech</div>
              <div class="value">${escapeHtml(job.technician || "Pending Assignment")}</div>
            </div>
          </div>

          <div class="section grid-2">
            <div class="section-box">
              <div class="label">Created Date</div>
              <div class="value">${createdOn}</div>
            </div>
            <div class="section-box">
              <div class="label">Estimated Cost</div>
              <div class="value">${escapeHtml(estimatedCost)}</div>
            </div>
          </div>

          <div class="section section-box">
            <div class="label">Terms and Conditions</div>
            <ul class="terms-list">
              <li>Please keep this receipt and present it when collecting your device.</li>
              <li>Only the accessories listed on this receipt are treated as received by Promise Electronics.</li>
              <li>Estimated cost and delivery time are subject to inspection and diagnosis.</li>
              <li>If the device remains unclaimed for more than 90 days after notice, storage responsibility will be limited to the extent permitted by applicable practice and policy.</li>
            </ul>
          </div>

          <div class="footer-row">
            <div>
              <div class="signature-block">
                <div class="label">Customer Signature</div>
              </div>
              <div class="signature-date">
                <div class="label">Date</div>
              </div>
            </div>

            <div class="qr-panel">
              <img src="${escapeHtml(qrUrl)}" alt="Tracking QR Code" class="qr-img" />
              <div class="qr-label">Track Online</div>
              <div class="qr-url">Job No: ${escapeHtml(job.id)}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
}
