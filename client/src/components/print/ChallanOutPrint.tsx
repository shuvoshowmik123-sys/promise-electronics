import { forwardRef } from "react";
import { format } from "date-fns";

export type ChallanOutItem = {
    id: string; // Job ID
    jobNo: string;
    brand: string;
    model: string;
    serial: string;
    problem: string;
    status: string;
    accessories?: string;
};

export type ChallanOutData = {
    id: string; // Challan ID
    date: Date;
    clientName: string;
    clientAddress: string;
    clientPhone?: string;
    items: ChallanOutItem[];
    receiverName?: string;
    receiverPhone?: string;
    notes?: string;
};

interface ChallanOutPrintProps {
    data: ChallanOutData;
}

export const ChallanOutPrint = forwardRef<HTMLDivElement, ChallanOutPrintProps>(({ data }, ref) => {
    // Default Company Info (Promise Electronics)
    // In a real app, this might come from a context or prop if it changes
    const company = {
        name: "PROMISE ELECTRONICS",
        address: "Shahidul Islam, Naya Paltan, Dhaka",
        phone: "01713-080706",
        logo: "/logo.png" // Assumes public/logo.png exists, or we handle image loading
    };

    return (
        <div
            ref={ref}
            className="bg-white p-8 max-w-[210mm] mx-auto font-sans text-black print:p-6"
            style={{ minHeight: "297mm" }} // A4 Height
        >
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-2xl font-bold uppercase tracking-wide border-b-2 border-black inline-block pb-1 mb-2">
                    CHALLAN
                </h1>
                <h2 className="text-xl font-bold">{company.name}</h2>
                <p className="text-sm font-medium mt-1">Date: {format(data.date, "dd/MM/yyyy")}</p>
            </div>

            {/* From / To Section */}
            <div className="flex justify-between mb-8 text-sm">
                <div className="w-[45%]">
                    <h3 className="font-bold border-b border-gray-400 mb-2 pb-1">From</h3>
                    <p className="font-bold text-lg">{company.name}</p>
                    <p className="whitespace-pre-line">{company.address}</p>
                    <p>Phone: {company.phone}</p>
                </div>

                <div className="w-[45%]">
                    <h3 className="font-bold border-b border-gray-400 mb-2 pb-1">To</h3>
                    <p className="font-bold text-lg">{data.clientName}</p>
                    <p className="whitespace-pre-line">{data.clientAddress}</p>
                    {data.clientPhone && <p>Phone: {data.clientPhone}</p>}
                </div>
            </div>

            {/* Challan Details (If separate info needed) */}
            <div className="mb-4 text-right">
                <p className="text-sm font-bold">Challan No: {data.id}</p>
            </div>

            {/* Items Table */}
            <table className="w-full border-collapse border border-black mb-8 text-sm">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black px-2 py-1 w-12 text-center">S/N</th>
                        <th className="border border-black px-2 py-1 text-left">TV Detail</th>
                        <th className="border border-black px-2 py-1 w-24 text-center">Job No</th>
                        <th className="border border-black px-2 py-1 w-32 text-center">Serial No</th>
                        <th className="border border-black px-2 py-1 w-24 text-center">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item, index) => (
                        <tr key={item.id}>
                            <td className="border border-black px-2 py-1 text-center">{index + 1}</td>
                            <td className="border border-black px-2 py-1">
                                <span className="font-medium">{item.brand} {item.model}</span>
                                {item.problem && <div className="text-xs text-gray-600">Defect: {item.problem}</div>}
                            </td>
                            <td className="border border-black px-2 py-1 text-center">{item.jobNo}</td>
                            <td className="border border-black px-2 py-1 text-center font-mono text-xs">{item.serial}</td>
                            <td className="border border-black px-2 py-1 text-center font-medium">
                                {item.status === 'OK' ? 'OK' :
                                    item.status === 'NG' ? 'NG' :
                                        item.status === 'Completed' ? 'OK' : item.status}
                            </td>
                        </tr>
                    ))}
                    {/* Empty Rows Filler (Optional, to fill page if needed) */}
                    {Array.from({ length: Math.max(0, 10 - data.items.length) }).map((_, i) => (
                        <tr key={`empty-${i}`}>
                            <td className="border border-black px-2 py-4">&nbsp;</td>
                            <td className="border border-black px-2 py-4">&nbsp;</td>
                            <td className="border border-black px-2 py-4">&nbsp;</td>
                            <td className="border border-black px-2 py-4">&nbsp;</td>
                            <td className="border border-black px-2 py-4">&nbsp;</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Summary */}
            <div className="flex justify-end mb-12 text-sm">
                <div className="border border-black px-4 py-2">
                    <p><strong>Total Items:</strong> {data.items.length}</p>
                </div>
            </div>

            {/* Terms / Notes */}
            {data.notes && (
                <div className="mb-12 text-sm border p-2">
                    <p className="font-bold">Notes:</p>
                    <p>{data.notes}</p>
                </div>
            )}

            {/* Footer Signatures */}
            <div className="flex justify-between items-end mt-auto" style={{ marginTop: "100px" }}>
                <div className="text-center">
                    <div className="border-t border-black w-48 pt-2">
                        <p className="font-bold">For {company.name}</p>
                        <p className="text-xs text-gray-500">Authorized Signature</p>
                    </div>
                </div>

                <div className="text-center">
                    {data.receiverName && <p className="mb-2 font-medium">{data.receiverName}</p>}
                    <div className="border-t border-black w-48 pt-2">
                        <p className="font-bold">Received By</p>
                        {data.receiverPhone && <p className="text-xs text-gray-500">Phone: {data.receiverPhone}</p>}
                    </div>
                </div>
            </div>

            <div className="text-center text-xs text-gray-400 mt-8">
                Generated by Promise Integrated System
            </div>
        </div>
    );
});

ChallanOutPrint.displayName = "ChallanOutPrint";
