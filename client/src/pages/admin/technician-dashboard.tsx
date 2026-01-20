import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, LogOut, AlertCircle, Wrench, Calendar, Timer } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { attendanceApi, settingsApi, technicianApi, TechnicianJob } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function TechnicianDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAdminAuth();

  // Get personal stats from new API
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["technicianStats"],
    queryFn: technicianApi.getStats,
  });

  // Get personal jobs from new API (with pendingDays)
  const { data: myJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["technicianJobs"],
    queryFn: () => technicianApi.getJobs('all'),
  });

  // Get today's attendance
  const { data: todayAttendance } = useQuery({
    queryKey: ["todayAttendance"],
    queryFn: attendanceApi.getToday,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const getCurrencySymbol = () => {
    const currencySetting = settings?.find(s => s.key === "currency_symbol");
    return currencySetting?.value || "৳";
  };

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
  const pendingJobs = myJobs.filter((job) =>
    job.status !== "Completed" && job.status !== "Delivered" && job.status !== "Cancelled"
  );

  const getPendingDaysColor = (days: number) => {
    if (days > 3) return "bg-red-100 text-red-700 border-red-300";
    if (days > 1) return "bg-orange-100 text-orange-700 border-orange-300";
    return "bg-green-100 text-green-700 border-green-300";
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
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="page-title">Technician View</h1>
            <p className="text-muted-foreground">
              Welcome, {currentUser?.name || "Technician"}. You have {stats?.pending || 0} pending job{(stats?.pending || 0) !== 1 ? "s" : ""}.
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

        {/* Personal Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="bg-blue-50 border-blue-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900" data-testid="stat-assigned">
                {statsLoading ? "..." : stats?.assigned || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-700">In Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900" data-testid="stat-in-progress">
                {statsLoading ? "..." : stats?.inProgress || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900" data-testid="stat-completed">
                {statsLoading ? "..." : stats?.completed || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900" data-testid="stat-pending">
                {statsLoading ? "..." : stats?.pending || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Pending Jobs */}
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Timer className="w-5 h-5" />
            My Pending Jobs
            <Badge variant="destructive" className="ml-2">{pendingJobs.length}</Badge>
          </h2>

          {jobsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading jobs...</div>
          ) : pendingJobs.length === 0 ? (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="py-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p className="text-green-700 font-medium">No Pending Jobs!</p>
                <p className="text-green-600 text-sm">All caught up. Great work!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="bg-white rounded-lg border shadow-sm">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Job ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Device</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Pending</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingJobs.map((job: TechnicianJob) => (
                    <tr key={job.id} className="hover:bg-slate-50" data-testid={`row-pending-job-${job.id}`}>
                      <td className="px-4 py-3 font-mono text-sm">{job.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{job.device}</div>
                        {job.screenSize && <div className="text-xs text-muted-foreground">{job.screenSize}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm">{job.customer || job.customerName}</td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${getPendingDaysColor(job.pendingDays)} border`}>
                          <Clock className="w-3 h-3 mr-1" />
                          {job.pendingDays} day{job.pendingDays !== 1 ? 's' : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {job.estimatedCost ? `${getCurrencySymbol()}${Number(job.estimatedCost).toLocaleString()}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Completed Jobs Summary */}
        {stats && stats.completed > 0 && (
          <Card className="bg-slate-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-medium">Great Work!</p>
                  <p className="text-sm text-muted-foreground">
                    You've completed {stats.completed} job{stats.completed !== 1 ? 's' : ''} so far.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
