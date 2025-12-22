import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, LogOut, AlertCircle, Wrench, Calendar } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { attendanceApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { JobTicket } from "@shared/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function TechnicianDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAdminAuth();

  // Get assigned jobs for current technician
  const { data: assignedJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["technicianJobs", currentUser?.name],
    queryFn: () => attendanceApi.getJobsByTechnician(currentUser?.name || ""),
    enabled: !!currentUser?.name,
  });

  // Get today's attendance
  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ["todayAttendance"],
    queryFn: attendanceApi.getToday,
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: () => attendanceApi.checkIn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
      toast({
        title: "Checked In",
        description: `You've checked in at ${format(new Date(), "h:mm a")}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: () => attendanceApi.checkOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
      toast({
        title: "Checked Out",
        description: `You've checked out at ${format(new Date(), "h:mm a")}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter jobs by status
  const activeJobs = assignedJobs.filter((job: JobTicket) => job.status === "In Progress" || job.status === "Pending");
  const completedJobs = assignedJobs.filter((job: JobTicket) => job.status === "Completed");
  const todayJobs = activeJobs.filter((job: JobTicket) => {
    const createdDate = new Date(job.createdAt).toDateString();
    const today = new Date().toDateString();
    return createdDate === today || job.status === "In Progress";
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-100 text-red-700 hover:bg-red-200";
      case "Medium":
        return "bg-orange-100 text-orange-700 hover:bg-orange-200";
      default:
        return "bg-slate-100 text-slate-700 hover:bg-slate-200";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Progress":
        return "bg-blue-100 text-blue-700";
      case "Pending":
        return "bg-yellow-100 text-yellow-700";
      case "Completed":
        return "bg-green-100 text-green-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="page-title">Technician Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome, {currentUser?.name || "Technician"}. You have {activeJobs.length} active job{activeJobs.length !== 1 ? "s" : ""}.
            </p>
          </div>
          <div className="flex gap-2">
            {!todayAttendance ? (
              <Button
                onClick={() => checkInMutation.mutate()}
                disabled={checkInMutation.isPending}
                data-testid="button-check-in"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {checkInMutation.isPending ? "Checking In..." : "Check In"}
              </Button>
            ) : todayAttendance.checkOutTime ? (
              <Badge variant="outline" className="px-4 py-2 text-green-600 border-green-300">
                <CheckCircle className="w-4 h-4 mr-2" />
                Attendance Complete
              </Badge>
            ) : (
              <Button
                variant="outline"
                onClick={() => checkOutMutation.mutate()}
                disabled={checkOutMutation.isPending}
                data-testid="button-check-out"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {checkOutMutation.isPending ? "Checking Out..." : "Check Out"}
              </Button>
            )}
          </div>
        </div>

        {/* Attendance Status Card */}
        {todayAttendance && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">Today's Attendance</p>
                    <p className="text-sm text-green-600">
                      Check-in: {format(new Date(todayAttendance.checkInTime), "h:mm a")}
                      {todayAttendance.checkOutTime && (
                        <> | Check-out: {format(new Date(todayAttendance.checkOutTime), "h:mm a")}</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-blue-50 border-blue-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">Active Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900" data-testid="stat-active-jobs">{activeJobs.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Completed Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900" data-testid="stat-completed-jobs">{completedJobs.length}</div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700">Total Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900" data-testid="stat-total-assigned">{assignedJobs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* My Assigned Jobs */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            My Assigned Jobs
          </h2>

          {jobsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading jobs...</div>
          ) : activeJobs.length === 0 ? (
            <Card className="bg-slate-50">
              <CardContent className="py-8 text-center text-muted-foreground">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No active jobs assigned to you</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeJobs.map((job: JobTicket) => (
                <Card key={job.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow" data-testid={`card-job-${job.id}`}>
                  <CardContent className="p-4 pt-5">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="font-mono" data-testid={`badge-job-id-${job.id}`}>{job.id}</Badge>
                      <Badge className={getPriorityColor(job.priority)}>
                        {job.priority} Priority
                      </Badge>
                    </div>
                    <h3 className="font-bold text-lg mb-1">{job.device}</h3>
                    {job.screenSize && (
                      <p className="text-xs text-muted-foreground mb-1">{job.screenSize}</p>
                    )}
                    <p className="text-muted-foreground text-sm mb-3">{job.issue}</p>

                    <div className="flex items-center justify-between mb-3">
                      <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{format(new Date(job.createdAt), "MMM d, yyyy")}</span>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground mb-3">
                      <strong>Customer:</strong> {job.customer}
                    </div>

                    {job.estimatedCost && (
                      <div className="text-sm font-medium text-primary">
                        Est. Cost: ৳{parseFloat(job.estimatedCost).toLocaleString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Scheduled Work / Today's Jobs */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Today's Schedule
          </h2>

          {todayJobs.length === 0 ? (
            <Card className="bg-slate-50">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No jobs scheduled for today</p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white rounded-lg border shadow-sm divide-y">
              {todayJobs.map((job: JobTicket, index: number) => (
                <div key={job.id} className="flex gap-4 items-center p-4" data-testid={`schedule-job-${job.id}`}>
                  <div className="w-20 text-center">
                    <span className="text-xs font-bold text-muted-foreground bg-slate-100 px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                  </div>
                  <div className={`flex-1 p-3 rounded border ${job.priority === "High" ? "bg-red-50 border-red-200" :
                      job.priority === "Medium" ? "bg-orange-50 border-orange-200" :
                        "bg-blue-50 border-blue-200"
                    }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs">{job.id}</span>
                      <Badge className={getStatusColor(job.status)} variant="secondary">{job.status}</Badge>
                    </div>
                    <p className="font-medium">{job.device}</p>
                    <p className="text-sm text-muted-foreground">{job.issue}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Jobs History */}
        {completedJobs.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Completed Jobs
            </h2>
            <div className="bg-white rounded-lg border shadow-sm">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Job ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Device</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {completedJobs.slice(0, 5).map((job: JobTicket) => (
                    <tr key={job.id} data-testid={`row-completed-job-${job.id}`}>
                      <td className="px-4 py-3 font-mono text-sm">{job.id}</td>
                      <td className="px-4 py-3 text-sm">{job.device}</td>
                      <td className="px-4 py-3 text-sm">{job.customer}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {job.completedAt ? format(new Date(job.completedAt), "MMM d, yyyy") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
