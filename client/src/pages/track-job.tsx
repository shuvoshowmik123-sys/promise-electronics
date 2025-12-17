import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Wrench, AlertCircle, Loader2, Phone, MapPin, ArrowLeft } from "lucide-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";

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
      <PublicLayout>
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
      </PublicLayout>
    );
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900">Loading Job Status...</h2>
              <p className="text-muted-foreground mt-2">Please wait while we fetch your repair information.</p>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  if (error || !job) {
    return (
      <PublicLayout>
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
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md animate-in slide-in-from-bottom-4 duration-300">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div className={`w-20 h-20 ${statusInfo?.bgColor} ${statusInfo?.color} rounded-full flex items-center justify-center mx-auto`}>
                {statusInfo?.icon}
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">Job Status</h2>
                <p className="text-lg text-muted-foreground">
                  Ticket: <span className="font-mono font-bold text-foreground">#{job.id}</span>
                </p>
              </div>

              <Badge 
                variant="outline" 
                className={`text-lg px-4 py-2 ${statusInfo?.color} border-current`}
                data-testid="badge-status"
              >
                {statusInfo?.label}
              </Badge>

              <p className="text-muted-foreground">
                {statusInfo?.description}
              </p>

              <div className="bg-slate-50 p-6 rounded-lg text-left space-y-4 border">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Device</span>
                  <span className="font-medium" data-testid="text-device">
                    {job.device} {job.screenSize ? `(${job.screenSize})` : ""}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Received</span>
                  <span className="font-medium" data-testid="text-received-date">
                    {formatDate(job.createdAt)}
                  </span>
                </div>
                {job.deadline && !job.completedAt && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Expected Completion</span>
                    <span className="font-medium text-blue-600" data-testid="text-deadline">
                      {formatDate(job.deadline)}
                    </span>
                  </div>
                )}
                {job.completedAt && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium" data-testid="text-completed-date">
                      {formatDate(job.completedAt)}
                    </span>
                  </div>
                )}
                {job.estimatedCost && (
                  <div className="flex justify-between pb-2">
                    <span className="text-muted-foreground">Estimated Cost</span>
                    <span className="font-medium text-green-600" data-testid="text-cost">
                      ৳{parseFloat(job.estimatedCost).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Need Help?</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Contact us for any questions about your repair.
                </p>
                <div className="flex flex-col gap-2 text-sm">
                  <a href="tel:+8801234567890" className="flex items-center justify-center gap-2 text-primary hover:underline" data-testid="link-call-support">
                    <Phone className="w-4 h-4" />
                    Call Support
                  </a>
                </div>
              </div>

              <div className="flex justify-center gap-4 pt-4">
                <Link href="/">
                  <Button variant="outline" size="lg" data-testid="button-home">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Home
                  </Button>
                </Link>
                <Link href="/repair">
                  <Button size="lg" data-testid="button-new-repair">
                    New Repair
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
