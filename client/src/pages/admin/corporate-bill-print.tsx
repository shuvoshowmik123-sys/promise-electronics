import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { corporateApi, settingsApi } from "@/lib/api";
import { format } from "date-fns";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CorporateBillPrint() {
    const { id } = useParams();

    // Fetch bill details
    const { data: bill, isLoading: billLoading, error: billError } = useQuery({
        queryKey: ["corporateBill", id],
        queryFn: () => corporateApi.getBill(id || ""),
        enabled: !!id
    });

    // Fetch client details for BILL TO section
    const { data: client, isLoading: clientLoading } = useQuery({
        queryKey: ["corporateClient", bill?.corporateClientId],
        queryFn: () => corporateApi.getOne(bill?.corporateClientId || ""),
        enabled: !!bill?.corporateClientId
    });

    // Fetch logo from settings
    const { data: logoSetting } = useQuery({
        queryKey: ["setting", "logo_url"],
        queryFn: () => settingsApi.getOne("logo_url"),
    });

    const logoUrl = logoSetting?.value || "";

    const isLoading = billLoading || clientLoading;

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

    const lineItems = bill.lineItems || [];
    const subtotal = bill.grandTotal || 0;

    // Generate a sequential invoice number style (like #PS0090)
    const invoiceNo = `#PS${bill.billNumber?.replace(/\D/g, '').slice(-4) || '0001'}`;
    const invoiceDate = format(new Date(bill.createdAt), "d/MMM/yy");

    return (
        <div className="min-h-screen bg-gray-100 p-4 print:p-0 print:bg-white">
            {/* Print Button - Hidden in Print */}
            <div className="print:hidden max-w-4xl mx-auto mb-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => window.history.back()}>
                    Back
                </Button>
                <Button onClick={() => window.print()} className="gap-2">
                    <Printer className="h-4 w-4" />
                    Print Invoice
                </Button>
            </div>

            {/* Invoice Container - A4 styled */}
            <div className="max-w-4xl mx-auto bg-white shadow-lg print:shadow-none p-8 print:p-6" style={{ minHeight: '297mm' }}>

                {/* Header Section */}
                <div className="flex justify-between items-start mb-8">
                    {/* Company Info - Left */}
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: '#1a5276' }}>
                            Promise Electronics
                        </h1>
                        <p className="text-sm text-gray-600 mt-1">
                            111, Hossain Tower (8th Floor)
                        </p>
                        <p className="text-sm text-gray-600">
                            Naya Paltan Bax Culvert Road, Dhaka
                        </p>
                        <p className="text-sm text-gray-600">
                            E-mail: promise.electronics12@gmail.com
                        </p>
                        <p className="text-sm text-gray-600">
                            Phone No: +88 01713-080706
                        </p>
                    </div>

                    {/* Invoice Title & Logo - Right */}
                    <div className="text-right">
                        <h2 className="text-3xl font-bold" style={{ color: '#d35400' }}>
                            INVOICE
                        </h2>
                        {/* Logo from settings */}
                        <div className="mt-2 flex justify-end">
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt="Company Logo"
                                    className="w-20 h-20 object-contain rounded-full border-2 border-orange-500"
                                    style={{ borderColor: '#d35400' }}
                                />
                            ) : (
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-xs"
                                    style={{
                                        background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)',
                                        border: '3px solid #d35400'
                                    }}
                                >
                                    <span className="text-center leading-tight">Promise</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bill To & Invoice Info */}
                <div className="flex justify-between items-start mb-8 border-t pt-4">
                    {/* Bill To - Left */}
                    <div>
                        <p className="font-bold text-sm" style={{ color: '#1a5276' }}>BILL TO</p>
                        <p className="font-semibold mt-1" style={{ color: '#d35400' }}>
                            {client?.companyName || bill.corporateClientId}
                        </p>
                        {client?.contactPerson && (
                            <p className="text-sm text-gray-600">
                                Contact: {client.contactPerson}
                            </p>
                        )}
                        {client?.contactPhone && (
                            <p className="text-sm text-gray-600">
                                Phone: {client.contactPhone}
                            </p>
                        )}
                    </div>

                    {/* Invoice Details - Right */}
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

                {/* Line Items Table */}
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
                                // Build repair details description
                                const repairDetails = [
                                    item.device,
                                    item.defect
                                ].filter(Boolean).join(' - ') || 'Repair Service';

                                // Use full job number without stripping characters
                                const jobNo = item.jobNo || item.corporateJobNumber || `JOB-${index + 1}`;

                                return (
                                    <tr
                                        key={item.jobId || index}
                                        className="border-b border-gray-200"
                                        style={{ backgroundColor: index % 2 === 0 ? '#fff9f5' : 'white' }}
                                    >
                                        <td className="py-3 px-3">{repairDetails}</td>
                                        <td className="py-3 px-3 text-center font-mono">{jobNo}</td>
                                        <td className="py-3 px-3 text-center font-mono text-xs">
                                            {item.serial || '-'}
                                        </td>
                                        <td className="py-3 px-3 text-right tabular-nums">
                                            {(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-3 px-3 text-right tabular-nums font-medium">
                                            {(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Subtotal */}
                <div className="flex justify-end mb-16">
                    <div
                        className="flex gap-8 items-center py-2 px-4 font-semibold"
                        style={{ backgroundColor: '#fff3e6', borderTop: '2px solid #d35400' }}
                    >
                        <span>SUBTOTAL (AIT & VAT Excluded) :</span>
                        <span className="tabular-nums text-lg">
                            {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                {/* Footer - Thank You */}
                <div className="absolute bottom-8 left-8 right-8 print:relative print:mt-16">
                    <p className="text-sm italic" style={{ color: '#1a5276' }}>
                        Thank you for your business
                    </p>
                </div>
            </div>

            {/* Print Styles */}
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 10mm;
                    }
                    body { 
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact;
                    }
                    .print\\:hidden { display: none !important; }
                    .print\\:p-0 { padding: 0 !important; }
                    .print\\:bg-white { background-color: white !important; }
                    .print\\:shadow-none { box-shadow: none !important; }
                }
            `}</style>
        </div>
    );
}
