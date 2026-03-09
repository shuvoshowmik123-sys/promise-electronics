import { format } from "date-fns";

interface CorporateSingleJobPrintProps {
    job: any;
}

export function CorporateSingleJobPrint({ job }: CorporateSingleJobPrintProps) {
    if (!job) return null;

    return (
        <div className="print-content hidden print:block p-6 max-w-[210mm] mx-auto bg-white text-black font-sans h-full flex flex-col justify-between">
            {/* Header */}
            <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold uppercase tracking-wider">Repair Job Slip</h1>
                    <p className="text-sm mt-1 text-gray-600">Internal Record</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-bold">{job.corporateJobNumber}</h2>
                    <p className="text-sm">Date: {job.createdAt ? format(new Date(job.createdAt), "dd MMM yyyy") : "-"}</p>
                </div>
            </div>

            {/* Main Info Grid */}
            <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-4 flex-grow">
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Company / Project</h3>
                    <p className="font-semibold text-lg">{job.companyName || "N/A"}</p>
                </div>
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Technician</h3>
                    <p className="font-medium text-lg">{job.technician || "Unassigned"}</p>
                </div>

                <div className="col-span-2 border-t border-dashed border-gray-300 my-2"></div>

                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Device</h3>
                    <p className="font-medium">{job.device}</p>
                </div>
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Serial Number</h3>
                    <p className="font-mono">{job.tvSerialNumber}</p>
                </div>

                <div className="col-span-2">
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Company Claim</h3>
                    <p className="p-3 bg-gray-50 border border-gray-200 rounded text-sm">{job.reportedDefect}</p>
                </div>

                <div className="col-span-2">
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Problem Found (Diagnosis)</h3>
                    <p className="p-3 bg-gray-50 border border-gray-200 rounded text-sm min-h-[60px]">
                        {job.problemFound || "Pending Diagnosis"}
                    </p>
                </div>
            </div>

            {/* Status & Validation */}
            <div className="border-t-2 border-black pt-4 flex justify-between items-center">
                <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-1">Current Status</h3>
                    <span className="inline-block px-3 py-1 border border-black font-bold uppercase text-sm">
                        {job.status}
                    </span>
                </div>

                <div className="text-right">
                    <div className="h-16 w-32 border border-gray-300 flex items-end justify-center pb-2">
                        <span className="text-xs text-gray-400">Signature / Initial</span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-xs text-gray-400">
                <p>Generated via Promise Integrated System</p>
            </div>
        </div>
    );
}
