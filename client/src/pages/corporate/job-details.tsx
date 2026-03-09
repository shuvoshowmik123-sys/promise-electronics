import { useRoute, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { corporatePortalApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { corporateQueryConfig } from "@/lib/corporateApiErrorHandler";
import {
    Loader2,
    ArrowLeft,
    Printer,
    Calendar,
    Clock,
    Wrench,
    CheckCircle2,
    ShieldCheck,
    Smartphone,
    AlertCircle,
    Info,
    ChevronRight,
    Tag,
    History,
    ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";


export default function CorporateJobDetails() {
    const [, params] = useRoute("/corporate/jobs/:id");
    const id = params?.id;
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const { data: job, isLoading, error } = useQuery({
        queryKey: ["corporateJob", id],
        queryFn: () => corporatePortalApi.getJob(id!),
        enabled: !!id,
        ...corporateQueryConfig,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[var(--corp-blue)]" />
                    <p className="text-slate-400 animate-pulse font-medium">Loading ticket details...</p>
                </div>
            </div>
        );
    }

    if (error || !id) {
        return (
            <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-4">
                    <AlertCircle className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Job Not Found</h2>
                <p className="text-slate-500 mt-2 max-w-xs mx-auto">We couldn't retrieve the details for this ticket. It might have been deleted or the ID is incorrect.</p>
                <Link href="/corporate/jobs">
                    <Button variant="outline" className="mt-6 rounded-xl corp-btn-glow">
                        Back to Job Tracker
                    </Button>
                </Link>
            </div>
        );
    }

    if (!job) return null;

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "Pending":
                return { icon: Clock, class: "bg-amber-50 text-amber-600 border-amber-100", label: "Pending Review" };
            case "In Progress":
                return { icon: Wrench, class: "bg-blue-50 text-[var(--corp-blue)] border-blue-100", label: "In Repair" };
            case "Completed":
                return { icon: CheckCircle2, class: "bg-emerald-50 text-emerald-600 border-emerald-100", label: "Completed" };
            case "Delivered":
                return { icon: ShieldCheck, class: "bg-purple-50 text-purple-600 border-purple-100", label: "Delivered" };
            case "Cancelled":
                return { icon: AlertCircle, class: "bg-rose-50 text-rose-600 border-rose-100", label: "Cancelled" };
            default:
                return { icon: Info, class: "bg-slate-50 text-slate-600 border-slate-100", label: status };
        }
    };

    const statusConfig = getStatusConfig(job.status);

    // Derived timeline steps from job status
    const timelineSteps = [
        { label: "Service Requested", date: job.createdAt, status: "completed" },
        { label: "Under Diagnosis", date: job.createdAt, status: job.status !== 'Pending' ? 'completed' : 'active' },
        { label: "Repair Finished", date: job.completedAt, status: job.status === 'Completed' || job.status === 'Delivered' ? 'completed' : 'pending' },
        { label: "Unit Delivered", date: null, status: job.status === 'Delivered' ? 'completed' : 'pending' },
    ];

    return (
        <div
            className="space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-4"
        >
            {/* Minimal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <Link href="/corporate/jobs">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-10 w-10 rounded-xl border-slate-100 shadow-sm p-0 group corp-btn-glow"
                            aria-label="Go back to job list"
                        >
                            <ArrowLeft className="h-5 w-5 text-slate-500 group-hover:text-[var(--corp-blue)] transition-colors" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black text-slate-900">
                                Ticket <span className="text-[var(--corp-blue)]">#{job.corporateJobNumber || job.id.substring(0, 8)}</span>
                            </h1>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            Submitted on {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-none ${statusConfig.class}`}>
                        <statusConfig.icon className="w-3.5 h-3.5 mr-2" />
                        {statusConfig.label}
                    </Badge>
                    {job.priority && (
                        <Badge variant="outline" className={cn(
                            "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-none",
                            job.priority === 'Critical' ? "bg-red-50 text-red-600 border-red-100" :
                                job.priority === 'High' ? "bg-orange-50 text-orange-600 border-orange-100" :
                                    "bg-slate-50 text-slate-500 border-slate-100"
                        )}>
                            {job.priority} Priority
                        </Badge>
                    )}
                    <Button variant="outline" onClick={() => window.print()} className="rounded-xl border-slate-100 h-10 px-4 text-xs font-bold corp-btn-glow">
                        <Printer className="h-4 w-4 mr-2" /> Print Details
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Left Column: Device & Issue */}
                <div className="lg:col-span-2 space-y-8">
                    <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
                        <CardHeader className="border-b border-slate-50 pb-6">
                            <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Smartphone className="h-5 w-5 text-[var(--corp-blue)]" />
                                Device Specification
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-8 space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Model Name</p>
                                    <p className="text-lg font-bold text-slate-800">{job.device}</p>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Serial Number</p>
                                    <div className="flex items-center gap-2">
                                        <code className="bg-slate-50 px-3 py-1.5 rounded-lg text-sm font-mono text-slate-600 border border-slate-100">{job.tvSerialNumber}</code>
                                        <Badge variant="secondary" className="bg-blue-50 text-[var(--corp-blue)] text-[9px] font-black py-0">VERIFIED</Badge>
                                    </div>
                                </div>
                            </div>

                            <Separator className="bg-slate-50" />

                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-[var(--corp-blue)]" />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fault Reported</p>
                                </div>
                                <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-100/50 relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--corp-blue)] opacity-20"></div>
                                    <p className="text-slate-600 text-sm leading-relaxed leading-6 italic">
                                        "{job.issue}"
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timeline Tracker */}
                    <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
                        <CardHeader className="border-b border-slate-50 pb-6">
                            <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <History className="h-5 w-5 text-[var(--corp-blue)]" />
                                Progress Tracker
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-10 px-10">
                            <div className="relative">
                                {/* Vertical connection line */}
                                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100"></div>

                                <div className="space-y-12 relative">
                                    {timelineSteps.map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-8 group">
                                            <div className={`
                                                relative z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300
                                                ${step.status === 'completed' ? "bg-[var(--corp-blue)] border-[var(--corp-blue)]" :
                                                    step.status === 'active' ? "bg-white border-[var(--corp-blue)] shadow-[0_0_10px_rgba(37,99,235,0.3)] animate-pulse" :
                                                        "bg-white border-slate-200"}
                                            `}>
                                                {step.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-white" />}
                                                {step.status === 'active' && <div className="w-2 h-2 rounded-full bg-[var(--corp-blue)]"></div>}
                                            </div>
                                            <div className="flex-1 -mt-1">
                                                <h4 className={`text-sm font-bold ${step.status === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>
                                                    {step.label}
                                                </h4>
                                                {step.date && (
                                                    <p className="text-xs text-slate-400 mt-1">
                                                        {new Date(step.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(step.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                                {!step.date && <p className="text-[10px] text-slate-300 italic mt-1 font-medium">Expected soon</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Meta info */}
                <div className="space-y-8">
                    <Card className="border-none shadow-sm rounded-2xl bg-[var(--corp-blue)] text-white overflow-hidden relative">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>

                        <CardHeader>
                            <CardTitle className="text-white/80 text-sm font-black uppercase tracking-widest">Support Access</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 relative z-10">
                            <p className="text-sm font-medium leading-relaxed">
                                Need an update or have questions about this specific repair? Our corporate support team is ready to assist.
                            </p>
                            <Button
                                onClick={() => {
                                    const params = new URLSearchParams({
                                        jobRef: job.id,
                                        jobNo: job.corporateJobNumber || `PRM-REF-${job.id.substring(0, 6)}`,
                                        device: job.device || "",
                                        status: job.status || "",
                                        priority: job.priority || "",
                                    });
                                    setLocation(`/corporate/messages?${params.toString()}`);
                                }}
                                className="w-full bg-white text-[var(--corp-blue)] hover:bg-blue-50 font-black rounded-xl h-12 corp-btn-glow flex items-center gap-2"
                            >
                                <MessageSquare className="h-4 w-4" />
                                Message Manager
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm rounded-2xl bg-white overflow-hidden">
                        <CardHeader className="border-b border-slate-50">
                            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <Info className="h-4 w-4 text-slate-400" />
                                Action Logs
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="p-6 space-y-6">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-medium italic">Service Category</span>
                                    <span className="font-bold text-slate-700">Premium B2B</span>
                                </div>
                                <Separator className="bg-slate-50" />
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-medium italic">Priority Level</span>
                                    <span className={`font-bold px-2 py-0.5 rounded ${job.priority === 'Critical' ? 'bg-red-50 text-red-600' :
                                        job.priority === 'High' ? 'bg-orange-50 text-orange-600' :
                                            'bg-blue-50 text-blue-600'
                                        }`}>
                                        {job.priority || "Standard"}
                                    </span>
                                </div>
                                <Separator className="bg-slate-50" />
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-400 font-medium italic">Account Reference</span>
                                    <span className="font-bold text-slate-700 uppercase tracking-tighter">
                                        {job.corporateJobNumber || `PRM-REF-${job.id.substring(0, 6)}`}
                                    </span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-6 flex flex-col items-center gap-3 text-center">
                                <p className="text-[10px] text-slate-400 leading-relaxed max-w-[180px]">
                                    Digital confirmation of repair. This document is verifiable by our admin.
                                </p>
                                <Button onClick={() => toast({ title: "Digital Invoice", description: "Invoice generation is in progress." })} variant="link" className="text-[var(--corp-blue)] text-[10px] font-black uppercase p-0 h-auto flex items-center gap-1">
                                    View Digital Invoice <ArrowUpRight className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
