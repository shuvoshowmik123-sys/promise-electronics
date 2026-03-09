import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Wrench, AlertCircle, Loader2, Phone, MapPin, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { motion } from "framer-motion";

interface JobTrackingInfo {
  id: string;
  device: string;
  screenSize: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  estimatedCost: string | null;
  deadline: string | null;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; bgColor: string; label: string; description: string }> = {
  "Pending": {
    icon: <Clock className="w-10 h-10" />,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    label: "Pending",
    description: "Your job is in queue and will be assigned to a technician shortly."
  },
  "In Progress": {
    icon: <Wrench className="w-10 h-10" />,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    label: "In Progress",
    description: "A technician is actively working on your device."
  },
  "Waiting for Parts": {
    icon: <Clock className="w-10 h-10" />,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    label: "Waiting for Parts",
    description: "We're waiting for replacement parts to arrive."
  },
  "Completed": {
    icon: <CheckCircle className="w-10 h-10" />,
    color: "text-green-600",
    bgColor: "bg-green-100",
    label: "Completed",
    description: "Your repair is complete! You can pick up your device."
  },
  "Ready": {
    icon: <CheckCircle className="w-10 h-10" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    label: "Ready for Pickup",
    description: "Your device is ready to be picked up."
  },
  "Delivered": {
    icon: <CheckCircle className="w-10 h-10" />,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    label: "Delivered",
    description: "Your device has been delivered to you."
  },
  "Closed": {
    icon: <CheckCircle className="w-10 h-10" />,
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    label: "Closed",
    description: "This job has been finalized and closed."
  },
  "Cancelled": {
    icon: <AlertCircle className="w-10 h-10" />,
    color: "text-red-600",
    bgColor: "bg-red-100",
    label: "Cancelled",
    description: "This job has been cancelled."
  },
};

export default function TrackJobPage() {
  usePageTitle("Job Status");
  const [, navigate] = useLocation();
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      setJobId(id);
    }
  }, []);

  const { data: job, isLoading, error } = useQuery<JobTrackingInfo>({
    queryKey: ["job-tracking", jobId],
    queryFn: async () => {
      const response = await fetch(`/api/job-tickets/track/${jobId}`);
      if (!response.ok) {
        throw new Error("Job not found");
      }
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: 30000,
  });

  const statusInfo = job ? (statusConfig[job.status] || statusConfig["Pending"]) : null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (!jobId) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No Job ID Provided</h2>
              <p className="text-muted-foreground mb-6">
                Please scan a valid QR code from your job ticket to track your repair status.
              </p>
              <Link href="/">
                <Button className="w-full" data-testid="button-go-home">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Return to Home
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900">Loading Job Status...</h2>
              <p className="text-muted-foreground mt-2">Please wait while we fetch your repair information.</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (error || !job) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h2>
              <p className="text-muted-foreground mb-6">
                We couldn't find a job with ID <span className="font-mono font-bold">#{jobId}</span>.
                Please check your ticket and try again.
              </p>
              <div className="space-y-3">
                <Link href="/">
                  <Button className="w-full" data-testid="button-go-home-error">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Return to Home
                  </Button>
                </Link>
                <Link href="/repair">
                  <Button variant="outline" className="w-full" data-testid="button-new-request">
                    Submit New Repair Request
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const getStepIndex = (status: string | undefined) => {
    if (status === 'Cancelled') return -1;
    if (status === 'Pending') return 0;
    if (status === 'Waiting for Parts') return 1;
    if (status === 'In Progress') return 1;
    if (status === 'Ready') return 2;
    if (status === 'Completed' || status === 'Delivered' || status === 'Closed') return 3;
    return 0;
  };

  const currentStep = getStepIndex(job?.status);
  const steps = ["Received", "In Repair", "Ready", "Complete"];

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl animate-in slide-in-from-bottom-4 duration-300 shadow-2xl border-0 rounded-[2rem] overflow-hidden">
          {/* Header Banner */}
          <div className={`p-8 text-center text-white ${job?.status === 'Cancelled' ? 'bg-red-500' : 'bg-gradient-to-br from-blue-600 to-indigo-700'}`}>
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center p-3 shadow-inner">
                {statusInfo?.icon}
              </div>
            </div>
            <h2 className="text-3xl font-black tracking-tighter mb-1">Repair Tracker</h2>
            <p className="text-blue-100 font-medium tracking-widest uppercase text-xs">
              Ticket <span className="font-bold text-white">#{job.id}</span>
            </p>
          </div>

          <CardContent className="p-8">
            {/* PIZZA TRACKER UI */}
            {job.status !== 'Cancelled' ? (
              <div className="mb-10 mt-2 relative">
                {/* Background Line */}
                <div className="absolute top-5 left-0 w-full h-1 bg-slate-100" />

                {/* Animated Progress Line */}
                <motion.div
                  className="absolute top-5 left-0 h-1 bg-blue-500 origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: currentStep / 2 }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                />

                <div className="flex justify-between relative z-10">
                  {steps.map((step, index) => {
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                      <div key={step} className="flex flex-col items-center gap-2">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: index * 0.2 }}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-colors duration-500 ${isActive ? 'bg-blue-600 text-white shadow-blue-500/30' :
                            isCompleted ? 'bg-blue-500 text-white' :
                              'bg-white border-2 border-slate-100 text-slate-300'
                            }`}
                        >
                          {isCompleted ? <CheckCircle className="w-5 h-5" /> : index + 1}
                        </motion.div>
                        <span className={`text-[11px] uppercase tracking-widest font-bold ${isActive ? 'text-blue-600' : isCompleted ? 'text-slate-600' : 'text-slate-400'
                          }`}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-8 text-center">
                <Badge variant="destructive" className="px-4 py-2 text-base">Cancelled</Badge>
              </div>
            )}

            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-slate-800 mb-2">{statusInfo?.label}</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto">
                {statusInfo?.description}
              </p>
            </div>

            <div className="bg-slate-50/50 p-6 rounded-2xl space-y-4 border border-slate-100">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-400 font-medium text-sm">Device</span>
                <span className="font-bold text-slate-700 text-sm text-right" data-testid="text-device">
                  {job.device} {job.screenSize ? `\n(${job.screenSize})` : ""}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span className="text-slate-400 font-medium text-sm">Received</span>
                <span className="font-bold text-slate-700 text-sm" data-testid="text-received-date">
                  {formatDate(job.createdAt)}
                </span>
              </div>
              {job.deadline && !job.completedAt && (
                <div className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-400 font-medium text-sm">Expected Completion</span>
                  <span className="font-bold text-blue-600 text-sm" data-testid="text-deadline">
                    {formatDate(job.deadline)}
                  </span>
                </div>
              )}
              {job.completedAt && (
                <div className="flex justify-between border-b border-slate-100 pb-3">
                  <span className="text-slate-400 font-medium text-sm">Completed</span>
                  <span className="font-bold text-emerald-600 text-sm" data-testid="text-completed-date">
                    {formatDate(job.completedAt)}
                  </span>
                </div>
              )}
              {job.estimatedCost && (
                <div className="flex justify-between pb-1">
                  <span className="text-slate-400 font-medium text-sm">Estimated Cost</span>
                  <span className="font-black text-slate-800" data-testid="text-cost">
                    ৳{parseFloat(job.estimatedCost).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-center gap-3">
              <Link href="/">
                <Button variant="ghost" className="rounded-xl h-12 px-6 font-bold text-slate-500 bg-slate-50 hover:bg-slate-100" data-testid="button-home">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
              <Link href="/repair">
                <Button className="rounded-xl h-12 px-6 font-bold bg-slate-900 text-white hover:bg-slate-800" data-testid="button-new-repair">
                  New Repair Request
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
