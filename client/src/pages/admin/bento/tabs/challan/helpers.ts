import { format } from "date-fns";

export interface LineItem {
    tvDetail?: string;
    description?: string;
    jobNo?: string;
    serialNumber?: string;
    status: string;
    defect?: string;
    remarks?: string;
}

export function getLineItems(challan: any): LineItem[] {
    if (!challan?.lineItems) return [];
    if (Array.isArray(challan.lineItems)) return challan.lineItems;
    try {
        const parsed = JSON.parse(challan.lineItems);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") return [parsed];
        if (typeof parsed === "string") {
            const nested = JSON.parse(parsed);
            if (Array.isArray(nested)) return nested;
            if (nested && typeof nested === "object") return [nested];
            return [];
        }
        return [];
    } catch {
        return [];
    }
}

export function getChallanStatusBadge(status: string) {
    switch (status) {
        case "Pending":
            return { variant: "outline", className: "bg-amber-50 text-amber-700 border-amber-200", icon: "Clock", label: "Pending" };
        case "Delivered":
            return { variant: "outline", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "CheckCircle", label: "Delivered" };
        case "Received":
            return { variant: "outline", className: "bg-blue-50 text-blue-700 border-blue-200", icon: "CheckCircle2", label: "Received" };
        default:
            return { variant: "secondary", className: "", icon: "", label: status };
    }
}

export async function buildChallanPdf(challan: any) {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const itemsList = getLineItems(challan);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 42;
    let y = 44;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("DELIVERY CHALLAN", pageWidth / 2, y, { align: "center" });
    y += 22;
    doc.setFontSize(12);
    doc.text("Promise Electronics", pageWidth / 2, y, { align: "center" });
    y += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Challan: ${challan.id}`, margin, y);
    doc.text(`Date: ${challan.createdAt ? format(new Date(challan.createdAt), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}`, pageWidth - margin, y, { align: "right" });
    y += 22;
    doc.text(`Status: ${challan.status || "Pending"}`, margin, y);
    doc.text(`Type: ${challan.type || "Customer"}`, pageWidth - margin, y, { align: "right" });
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.text("Receiver", margin, y);
    doc.text("Transport", pageWidth / 2 + 10, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    [
        challan.receiver || "Receiver not set",
        challan.receiverPhone || "No phone",
        challan.receiverAddress || "No address",
    ].forEach((line) => {
        doc.text(doc.splitTextToSize(line, 220), margin, y);
        y += 14;
    });
    let rightY = y - 42;
    [
        challan.vehicleNo || "Vehicle not set",
        challan.driverName || "Driver not set",
        challan.driverPhone || "Driver phone not set",
    ].forEach((line) => {
        doc.text(doc.splitTextToSize(line, 220), pageWidth / 2 + 10, rightY);
        rightY += 14;
    });
    y = Math.max(y, rightY) + 18;

    doc.setFont("helvetica", "bold");
    doc.text("Items", margin, y);
    y += 16;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;

    doc.setFontSize(9);
    const rows = itemsList.length > 0 ? itemsList : [{ tvDetail: "No items listed", jobNo: "-", serialNumber: "-", status: "-", defect: "" }];
    rows.forEach((item, index) => {
        const detail = `${index + 1}. ${item.tvDetail || item.description || "Item"}`;
        const meta = [`Job: ${item.jobNo || "-"}`, `Serial: ${item.serialNumber || "-"}`, `Status: ${item.status || "OK"}`].join("   ");
        const defect = item.defect || item.remarks || "";
        const lines = doc.splitTextToSize(`${detail}\n${meta}${defect ? `\n${defect}` : ""}`, pageWidth - margin * 2);
        if (y + lines.length * 12 > 780) {
            doc.addPage();
            y = 44;
        }
        doc.setFont("helvetica", "normal");
        doc.text(lines, margin, y);
        y += lines.length * 12 + 10;
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
    });

    doc.setFont("helvetica", "bold");
    doc.text("For Promise Electronics", margin, 805);
    doc.text("Received By", pageWidth - margin, 805, { align: "right" });
    return doc;
}