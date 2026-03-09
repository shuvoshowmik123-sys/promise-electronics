import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
    Wrench,
    Package,
    CheckCircle2,
    Camera,
    Clock
} from "lucide-react";
import { format } from "date-fns";
import { BentoCard } from "../admin/bento/shared";
import { Button } from "@/components/ui/button";
import { jobTicketsApi } from "@/lib/api";
import { TechJobDrawer } from "./TechJobDrawer";
import { ScannerWidget } from "@/components/tech/ScannerWidget";
import { toast } from "sonner";

export function TechDashboard() {
    const [selectedJob, setSelectedJob] = useState<any | null>(null);
    const [isScanning, setIsScanning] = useState(false);

    // Phase I fix — use /api/technician/jobs (filtered to THIS technician only)
    const { data: jobs = [] } = useQuery({
        queryKey: ['technician-jobs'],
        queryFn: () =>
            fetch('/api/technician/jobs', { credentials: 'include' })
                .then(r => r.json()) as Promise<any[]>,
        refetchInterval: 30000,
    });

    // Simplified metrics for the technician
    const myActiveJobs = jobs.filter(j => j.status === 'In Progress' || j.status === 'Pending').length;
    const pendingPartsInfo = jobs.filter(j => j.status === 'Pending Parts').length;
    const completedToday = jobs.filter((j: any) =>
        j.status === 'Completed' && j.completedAt && new Date(j.completedAt).toDateString() === new Date().toDateString()
    ).length;

    const handleScanResult = (result: string) => {
        setIsScanning(false);
        // Clean up the URL if they scanned a full QR link instead of just an ID
        const jobId = result.split('/').pop()?.trim() || result.trim();

        const matchedJob = jobs.find((j: any) => j.id === jobId || j.corporateJobNumber === jobId);

        if (matchedJob) {
            setSelectedJob(matchedJob);
            toast.success("Job Ticket Found!");
        } else {
            toast.error("Ticket not found in your active queue.");
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tech Workbench</h1>
                    <p className="text-slate-500 mt-1">
                        Focus zone. {myActiveJobs} jobs waiting in your queue.
                    </p>
                </div>

                {/* The prominent Scanner CTA for Phase 3.2 */}
                <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg w-full md:w-auto"
                    onClick={() => setIsScanning(true)}
                >
                    <Camera className="w-5 h-5 mr-2" />
                    Scan Ticket / Part
                </Button>
            </div>

            {/* Primary Metrics Layer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <BentoCard
                    title="Active Repairs"
                    icon={<Wrench className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-blue-500 to-cyan-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{myActiveJobs}</h2>
                        <p className="text-sm opacity-80">Jobs assigned to you</p>
                    </div>
                </BentoCard>
                <BentoCard
                    title="Pending Parts"
                    icon={<Package className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-orange-500 to-amber-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{pendingPartsInfo}</h2>
                        <p className="text-sm opacity-80">Awaiting inventory check</p>
                    </div>
                </BentoCard>
                <BentoCard
                    title="Completed Today"
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-emerald-500 to-teal-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{completedToday}</h2>
                        <p className="text-sm opacity-80">Invoices finalized</p>
                    </div>
                </BentoCard>
            </div>

            {/* Active Jobs Pipeline */}
            <h2 className="text-xl font-semibold mt-8 mb-4">Immediate Priority</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {jobs.filter((j: any) => j.status === 'In Progress' || j.status === 'Pending').slice(0, 6).map((job: any) => (
                    <BentoCard key={job.id} className="cursor-pointer hover:border-blue-200 transition-colors shadow-sm" onClick={() => setSelectedJob(job)}>
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                #{job.id.substring(0, 8)}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${job.priority === 'High' || job.priority === 'Urgent'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-slate-100 text-slate-700'
                                }`}>
                                {job.priority || 'Normal'}
                            </span>
                        </div>

                        <h3 className="font-medium text-slate-900 truncate mb-1">{job.device}</h3>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10">{job.issue}</p>

                        <div className="flex items-center text-xs text-slate-500 mt-auto pt-3 border-t border-slate-100">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {format(new Date(job.createdAt), "MMM d, h:mm a")}
                        </div>
                    </BentoCard>
                ))}
                {myActiveJobs === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-50" />
                        <p>Queue is empty! Great job.</p>
                    </div>
                )}
            </div>

            {/* Mobile-Friendly Detail Drawer */}
            <TechJobDrawer
                job={selectedJob}
                open={!!selectedJob}
                onOpenChange={(open) => !open && setSelectedJob(null)}
            />

            {/* Hardware-Accelerated Scanner Overlay */}
            {isScanning && (
                <ScannerWidget
                    onScan={handleScanResult}
                    onClose={() => setIsScanning(false)}
                />
            )}
        </div>
    );
}
