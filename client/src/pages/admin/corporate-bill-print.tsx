import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { corporateApi, settingsApi } from "@/lib/api";
import { format } from "date-fns";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLUMN_LABELS: Record<string, string> = {
    clientJobNumber: "Client Job No.",
    promiseJobNumber: "Promise Job No.",
    tvSerial: "TV Serial",
    brandModel: "Brand / Model",
    tvSize: "TV Size",
    service: "Service",
    amount: "Amount",
};

/** A4 portrait in CSS mm — one canonical invoice canvas for screen + PDF. */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function useA4FitScale(enabled: boolean) {
    const stageRef = useRef<HTMLDivElement>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        if (!enabled) return;
        const stage = stageRef.current;
        const page = pageRef.current;
        if (!stage || !page) return;

        const update = () => {
            const pageWidth = page.offsetWidth;
            if (pageWidth <= 0) return;
            const pad = 16;
            const available = Math.max(0, stage.clientWidth - pad);
            const next = Math.min(1, available / pageWidth);
            setScale(Number.isFinite(next) && next > 0 ? next : 1);
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(stage);
        window.addEventListener("resize", update);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [enabled]);

    return { stageRef, pageRef, scale };
}

export default function CorporateBillPrint() {
    const { id } = useParams();

    const { data: bill, isLoading: billLoading, error: billError } = useQuery({
        queryKey: ["corporateBill", id],
        queryFn: () => corporateApi.getBill(id || ""),
        enabled: !!id
    });

    const isItemized = bill?.itemizedMode === true;

    const { data: details } = useQuery({
        queryKey: ["corporateBillDetails", id],
        queryFn: () => corporateApi.getBillDetails(id || ""),
        enabled: !!id && isItemized,
    });

    const { data: client, isLoading: clientLoading } = useQuery({
        queryKey: ["corporateClient", bill?.corporateClientId],
        queryFn: () => corporateApi.getOne(bill?.corporateClientId || ""),
        enabled: !!bill?.corporateClientId
    });

    const { data: logoSetting } = useQuery({
        queryKey: ["setting", "logo_url"],
        queryFn: () => settingsApi.getOne("logo_url"),
    });

    const logoUrl = logoSetting?.value || "";
    const isLoading = billLoading || clientLoading;
    const a4Fit = useA4FitScale(!isLoading && !!bill && isItemized);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (billError || !bill) {
        return (
            <div className="flex items-center justify-center h-screen text-destructive bg-white">
                Failed to load bill details.
            </div>
        );
    }

    if (isItemized) {
        const snapshot = (bill.layoutSnapshot && typeof bill.layoutSnapshot === "object")
            ? bill.layoutSnapshot as { enabledColumns?: string[]; recipientPolicy?: string }
            : { enabledColumns: [], recipientPolicy: "company_only" };
        const recipient = (bill.recipientSnapshot && typeof bill.recipientSnapshot === "object")
            ? bill.recipientSnapshot as { companyName?: string; contactPerson?: string | null; contactPhone?: string | null; billingAddress?: string | null }
            : { companyName: client?.companyName };
        const columns = (snapshot.enabledColumns && snapshot.enabledColumns.length > 0)
            ? snapshot.enabledColumns
            : ["promiseJobNumber", "service", "amount"];
        const lines = (details?.lines ?? []) as any[];
        const lineValue = (line: any, col: string) =>
            col === "amount" ? `৳ ${Number(line.amount || 0).toFixed(2)}` : (line[col] ?? "—");

        const billToName = recipient.companyName || client?.companyName || bill.corporateClientId;
        const invoiceDateLabel = format(new Date(bill.createdAt), "d/MMM/yy");
        const grandTotalLabel = (bill.grandTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
        const scale = a4Fit.scale;

        return (
            <div
                className="min-h-screen bg-neutral-200 print:bg-white print:p-0"
                data-testid="corporate-bill-print-workspace"
            >
                {/* Normal-size controls stay outside the scaled A4 page */}
                <div className="print:hidden sticky top-0 z-20 border-b border-neutral-300/80 bg-neutral-200 px-3 py-2 sm:px-4">
                    <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => window.history.back()}
                            data-testid="corporate-bill-print-back"
                        >
                            Back
                        </Button>
                        <Button
                            onClick={() => window.print()}
                            className="gap-2"
                            data-testid="corporate-bill-print-action"
                        >
                            <Printer className="h-4 w-4" /> Print Invoice
                        </Button>
                    </div>
                </div>

                <div
                    ref={a4Fit.stageRef}
                    className="corp-bill-a4-stage overflow-x-hidden px-2 py-3 sm:px-4 sm:py-6 print:p-0 print:overflow-visible"
                    data-testid="corporate-bill-print-stage"
                    data-a4-scale={scale.toFixed(4)}
                >
                    <div
                        className="corp-bill-a4-frame mx-auto print:mx-0"
                        style={{
                            width: scale < 1 ? `calc(${A4_WIDTH_MM}mm * ${scale})` : `${A4_WIDTH_MM}mm`,
                            height: scale < 1 ? `calc(${A4_HEIGHT_MM}mm * ${scale})` : undefined,
                            minHeight: scale >= 1 ? `${A4_HEIGHT_MM}mm` : undefined,
                        }}
                        data-testid="corporate-bill-print-frame"
                    >
                        {/* Single canonical A4 document — flex column so short-page footer sits at bottom */}
                        <div
                            ref={a4Fit.pageRef}
                            className="print-content corp-bill-a4-page relative flex flex-col bg-white shadow-lg print:shadow-none"
                            style={{
                                width: `${A4_WIDTH_MM}mm`,
                                minHeight: `${A4_HEIGHT_MM}mm`,
                                boxSizing: "border-box",
                                padding: "12mm 12mm 14mm",
                                transform: scale < 1 ? `scale(${scale})` : undefined,
                                transformOrigin: "top left",
                                opacity: 1,
                                filter: "none",
                            }}
                            data-testid="corporate-bill-print-document"
                        >
                            <div className="mb-8 flex items-start justify-between gap-6">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-bold" style={{ color: "#1a5276" }}>
                                        Promise Electronics
                                    </h1>
                                    <p className="mt-1 text-sm text-gray-600">111, Hossain Tower (8th Floor)</p>
                                    <p className="text-sm text-gray-600">Naya Paltan Bax Culvert Road, Dhaka</p>
                                    <p className="text-sm text-gray-600">E-mail: promise.electronics12@gmail.com</p>
                                    <p className="text-sm text-gray-600">Phone No: +88 01713-080706</p>
                                </div>
                                <div className="shrink-0 text-right">
                                    <h2 className="text-3xl font-bold" style={{ color: "#d35400" }}>
                                        INVOICE
                                    </h2>
                                    <div className="mt-2 flex justify-end">
                                        {logoUrl ? (
                                            <img
                                                src={logoUrl}
                                                alt="Company Logo"
                                                className="h-20 w-20 rounded-full border-2 object-contain"
                                                style={{ borderColor: "#d35400" }}
                                            />
                                        ) : (
                                            <div
                                                className="flex h-20 w-20 items-center justify-center rounded-full text-xs font-bold text-white"
                                                style={{
                                                    background: "linear-gradient(135deg, #1a5276 0%, #2980b9 100%)",
                                                    border: "3px solid #d35400",
                                                }}
                                            >
                                                <span className="text-center leading-tight">Promise</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mb-8 flex items-start justify-between gap-6 border-t pt-4">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold" style={{ color: "#1a5276" }}>
                                        BILL TO
                                    </p>
                                    <p
                                        className="mt-1 font-semibold"
                                        style={{ color: "#d35400" }}
                                        data-testid="corporate-bill-print-bill-to"
                                    >
                                        {billToName}
                                    </p>
                                    {snapshot.recipientPolicy === "attention_person" && (
                                        <>
                                            {recipient.contactPerson && (
                                                <p className="text-sm text-gray-600">Attn: {recipient.contactPerson}</p>
                                            )}
                                            {recipient.contactPhone && (
                                                <p className="text-sm text-gray-600">Phone: {recipient.contactPhone}</p>
                                            )}
                                            {recipient.billingAddress && (
                                                <p className="text-sm text-gray-600">{recipient.billingAddress}</p>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="shrink-0 space-y-1.5 text-right">
                                    <div className="flex items-center justify-end gap-4">
                                        <span className="text-sm font-semibold" style={{ color: "#1a5276" }}>
                                            Invoice No:
                                        </span>
                                        <span
                                            className="font-medium"
                                            style={{ color: "#d35400" }}
                                            data-testid="corporate-bill-print-number"
                                        >
                                            {bill.billNumber}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-end gap-4">
                                        <span className="text-sm font-semibold" style={{ color: "#1a5276" }}>
                                            Invoice Date:
                                        </span>
                                        <span data-testid="corporate-bill-print-date">{invoiceDateLabel}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="corp-bill-print-table mb-8" data-testid="corporate-bill-print-lines-table">
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr style={{ backgroundColor: "#d35400", color: "white" }}>
                                            {columns.map((col) => (
                                                <th key={col} className="px-3 py-2 text-left font-semibold">
                                                    {COLUMN_LABELS[col] || col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={columns.length}
                                                    className="px-3 py-6 text-center text-gray-500"
                                                >
                                                    No line items on this invoice.
                                                </td>
                                            </tr>
                                        ) : (
                                            lines.map((line: any, index: number) => (
                                                <tr
                                                    key={line.id || index}
                                                    className="border-b border-gray-200"
                                                    style={{
                                                        backgroundColor: index % 2 === 0 ? "#fff9f5" : "white",
                                                    }}
                                                    data-testid={`corporate-bill-print-line-row-${index}`}
                                                >
                                                    {columns.map((col) => (
                                                        <td key={col} className="px-3 py-3 tabular-nums">
                                                            {lineValue(line, col)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/*
                              Closing block: screen mt-auto pins short invoices to A4 bottom.
                              Print keeps subtotal+footer as one unbreakable unit so long tables
                              never emit a footer-only trailing page.
                            */}
                            <div
                                className="corp-bill-print-closing mt-auto pt-2"
                                data-testid="corporate-bill-print-closing"
                            >
                                <div className="mb-6 flex justify-end">
                                    <div
                                        className="flex items-center gap-8 px-4 py-2 font-semibold"
                                        style={{ backgroundColor: "#fff3e6", borderTop: "2px solid #d35400" }}
                                        data-testid="corporate-bill-print-subtotal"
                                    >
                                        <span>SUBTOTAL (AIT & VAT Excluded) :</span>
                                        <span className="text-lg tabular-nums">{grandTotalLabel}</span>
                                    </div>
                                </div>
                                <div data-testid="corporate-bill-print-footer">
                                    <p className="text-sm italic" style={{ color: "#1a5276" }}>
                                        Thank you for your business
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    @media print {
                        @page { size: A4 portrait; margin: 10mm; }
                        body {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .print\\:hidden { display: none !important; }
                        .corp-bill-a4-stage {
                            overflow: visible !important;
                            padding: 0 !important;
                        }
                        .corp-bill-a4-frame {
                            width: auto !important;
                            height: auto !important;
                            min-height: 0 !important;
                            margin: 0 !important;
                        }
                        .corp-bill-a4-page {
                            transform: none !important;
                            width: 100% !important;
                            /* Short invoices: keep A4 min height so closing block can sit low.
                               Long invoices: height grows with content; no forced empty pages. */
                            min-height: 277mm !important;
                            height: auto !important;
                            display: flex !important;
                            flex-direction: column !important;
                            box-shadow: none !important;
                            padding: 0 !important;
                            opacity: 1 !important;
                            filter: none !important;
                        }
                        .corp-bill-print-table {
                            break-inside: auto;
                        }
                        .corp-bill-print-table tr {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                        /* Subtotal + footer travel together; never a footer-only trailing page */
                        .corp-bill-print-closing {
                            margin-top: auto !important;
                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                            break-before: avoid-page;
                            page-break-before: avoid;
                        }
                        .corp-bill-print-closing [data-testid="corporate-bill-print-footer"] {
                            margin-top: 0.75rem !important;
                            break-inside: avoid !important;
                            page-break-inside: avoid !important;
                        }
                    }
                `}</style>
            </div>
        );
    }

    const lineItems = bill.lineItems || [];
    const subtotal = bill.grandTotal || 0;
    const invoiceNo = `#PS${bill.billNumber?.replace(/\D/g, '').slice(-4) || '0001'}`;
    const invoiceDate = format(new Date(bill.createdAt), "d/MMM/yy");

    return (
        <div className="min-h-screen bg-gray-100 p-4 print:p-0 print:bg-white">
            <div className="print:hidden max-w-4xl mx-auto mb-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => window.history.back()}>Back</Button>
                <Button onClick={() => window.print()} className="gap-2">
                    <Printer className="h-4 w-4" /> Print Invoice
                </Button>
            </div>
            <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none p-8 print:p-6" style={{ minHeight: '297mm' }}>
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: '#1a5276' }}>Promise Electronics</h1>
                        <p className="text-sm text-gray-600 mt-1">111, Hossain Tower (8th Floor)</p>
                        <p className="text-sm text-gray-600">Naya Paltan Bax Culvert Road, Dhaka</p>
                        <p className="text-sm text-gray-600">E-mail: promise.electronics12@gmail.com</p>
                        <p className="text-sm text-gray-600">Phone No: +88 01713-080706</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-3xl font-bold" style={{ color: '#d35400' }}>INVOICE</h2>
                        <div className="mt-2 flex justify-end">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Company Logo" className="w-20 h-20 object-contain rounded-full border-2 border-orange-500" style={{ borderColor: '#d35400' }} />
                            ) : (
                                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)', border: '3px solid #d35400' }}>
                                    <span className="text-center leading-tight">Promise</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex justify-between items-start mb-8 border-t pt-4">
                    <div>
                        <p className="font-bold text-sm" style={{ color: '#1a5276' }}>BILL TO</p>
                        <p className="font-semibold mt-1" style={{ color: '#d35400' }}>{client?.companyName || bill.corporateClientId}</p>
                        {client?.contactPerson && <p className="text-sm text-gray-600">Contact: {client.contactPerson}</p>}
                        {client?.contactPhone && <p className="text-sm text-gray-600">Phone: {client.contactPhone}</p>}
                    </div>
                    <div className="text-right">
                        <div className="flex gap-4 items-center">
                            <span className="font-semibold" style={{ color: '#1a5276' }}>Invoice No:</span>
                            <span style={{ color: '#d35400' }}>{invoiceNo}</span>
                        </div>
                        <div className="flex gap-4 items-center mt-1">
                            <span className="font-semibold" style={{ color: '#1a5276' }}>Invoice Date:</span>
                            <span>{invoiceDate}</span>
                        </div>
                    </div>
                </div>
                <div className="mb-8">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr style={{ backgroundColor: '#d35400', color: 'white' }}>
                                <th className="py-2 px-3 text-left font-semibold">Repair Details</th>
                                <th className="py-2 px-3 text-center font-semibold">Job No</th>
                                <th className="py-2 px-3 text-center font-semibold">Serial Number</th>
                                <th className="py-2 px-3 text-right font-semibold">UNIT PRICE</th>
                                <th className="py-2 px-3 text-right font-semibold">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item: any, index: number) => {
                                const repairDetails = [item.device, item.defect].filter(Boolean).join(' - ') || 'Repair Service';
                                const jobNo = item.jobNo || item.corporateJobNumber || `JOB-${index + 1}`;
                                return (
                                    <tr key={item.jobId || index} className="border-b border-gray-200" style={{ backgroundColor: index % 2 === 0 ? '#fff9f5' : 'white' }}>
                                        <td className="py-3 px-3">{repairDetails}</td>
                                        <td className="py-3 px-3 text-center font-mono">{jobNo}</td>
                                        <td className="py-3 px-3 text-center font-mono text-xs">{item.serial || '-'}</td>
                                        <td className="py-3 px-3 text-right tabular-nums">{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="py-3 px-3 text-right tabular-nums font-medium">{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mb-16">
                    <div className="flex gap-8 items-center py-2 px-4 font-semibold" style={{ backgroundColor: '#fff3e6', borderTop: '2px solid #d35400' }}>
                        <span>SUBTOTAL (AIT & VAT Excluded) :</span>
                        <span className="tabular-nums text-lg">{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
                <div className="absolute bottom-8 left-8 right-8 print:relative print:mt-16">
                    <p className="text-sm italic" style={{ color: '#1a5276' }}>Thank you for your business</p>
                </div>
            </div>
            <style>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .print\\:hidden { display: none !important; }
                    .print\\:p-0 { padding: 0 !important; }
                    .print\\:bg-white { background-color: white !important; }
                    .print\\:shadow-none { box-shadow: none !important; }
                }
            `}</style>
        </div>
    );
}
