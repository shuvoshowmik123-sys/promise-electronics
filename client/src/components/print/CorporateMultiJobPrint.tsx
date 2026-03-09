import { format } from "date-fns";

interface CorporateMultiJobPrintProps {
    jobs: any[];
    client: any;
}

export function CorporateMultiJobPrint({ jobs, client }: CorporateMultiJobPrintProps) {
    if (!jobs || jobs.length === 0) return null;

    return (
        <div className="print-content hidden print:block p-4 max-w-[297mm] mx-auto bg-white text-black font-sans landscape:w-full">
            <div className="mb-6 border-b pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold uppercase">Service Job Report</h1>
                    <p className="text-lg font-semibold text-gray-700">{client?.companyName || "Client Report"}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-600">Generated: {format(new Date(), "dd MMM yyyy, hh:mm a")}</p>
                    <p className="text-sm font-bold">Total Jobs: {jobs.length}</p>
                </div>
            </div>

            <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-100 border-b-2 border-black">
                    <tr>
                        <th className="p-2 border border-gray-300 w-12">#</th>
                        <th className="p-2 border border-gray-300 w-32">Job No</th>
                        <th className="p-2 border border-gray-300 w-24">Date</th>
                        <th className="p-2 border border-gray-300 w-40">Device</th>
                        <th className="p-2 border border-gray-300 w-32">Serial No</th>
                        <th className="p-2 border border-gray-300">Reported Defect</th>
                        <th className="p-2 border border-gray-300">Problem Found</th>
                        <th className="p-2 border border-gray-300 w-24">Status</th>
                        <th className="p-2 border border-gray-300 w-24">Technician</th>
                    </tr>
                </thead>
                <tbody>
                    {jobs.map((job, index) => (
                        <tr key={job.id} className="border-b border-gray-200 break-inside-avoid">
                            <td className="p-2 border border-gray-300 text-center">{index + 1}</td>
                            <td className="p-2 border border-gray-300 font-bold">{job.corporateJobNumber}</td>
                            <td className="p-2 border border-gray-300">
                                {job.createdAt ? format(new Date(job.createdAt), "dd MMM yyyy") : "-"}
                            </td>
                            <td className="p-2 border border-gray-300">{job.device}</td>
                            <td className="p-2 border border-gray-300 font-mono">{job.tvSerialNumber}</td>
                            <td className="p-2 border border-gray-300">{job.reportedDefect}</td>
                            <td className="p-2 border border-gray-300">{job.problemFound || "-"}</td>
                            <td className="p-2 border border-gray-300">
                                <span className={`inline-block px-1 rounded text-[10px] font-bold uppercase
                    ${job.status === 'Ready' ? 'bg-green-100 text-green-800' : ''}
                    ${job.status === 'Delivered' ? 'bg-blue-100 text-blue-800' : ''}
                 `}>
                                    {job.status}
                                </span>
                            </td>
                            <td className="p-2 border border-gray-300">{job.technician || "Unassigned"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="mt-8 pt-8 border-t flex justify-between text-xs text-gray-500">
                <div>
                    <p className="mb-8">Prepared By: _________________</p>
                </div>
                <div>
                    <p className="mb-8">Received By: _________________</p>
                </div>
            </div>
        </div>
    );
}
