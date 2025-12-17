import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Clock, 
  CalendarClock, 
  CalendarDays, 
  Truck, 
  Wrench, 
  AlertTriangle, 
  User, 
  Loader2,
  RefreshCw
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface JobTicket {
  id: number;
  ticketNumber: string;
  customerName: string;
  phoneNumber: string;
  deviceType: string;
  brand: string;
  model: string;
  problemDescription: string;
  status: string;
  priority: string;
  estimatedCost: string | null;
  technician: string | null;
  deadline: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface JobOverview {
  dueToday: JobTicket[];
  dueTomorrow: JobTicket[];
  dueThisWeek: JobTicket[];
  readyForDelivery: JobTicket[];
  technicianWorkloads: { technician: string; jobs: JobTicket[] }[];
  stats: {
    totalDueToday: number;
    totalDueTomorrow: number;
    totalDueThisWeek: number;
    totalReadyForDelivery: number;
    totalInProgress: number;
  };
}

async function fetchJobOverview(): Promise<JobOverview> {
  const response = await fetch("/api/admin/job-overview", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch job overview");
  }
  return response.json();
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "Urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    case "High":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
    case "Medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "Completed":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "In Progress":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    case "Pending":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

function JobCard({ job }: { job: JobTicket }) {
  const isOverdue = job.deadline && new Date(job.deadline) < new Date();
  
  return (
    <div 
      className={`p-3 rounded-lg border ${isOverdue ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-border bg-card'}`}
      data-testid={`job-card-${job.id}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-medium" data-testid={`text-ticket-number-${job.id}`}>
          {job.ticketNumber}
        </span>
        <div className="flex gap-1">
          <Badge variant="outline" className={getPriorityColor(job.priority)}>
            {job.priority}
          </Badge>
          <Badge variant="outline" className={getStatusColor(job.status)}>
            {job.status}
          </Badge>
        </div>
      </div>
      <div className="space-y-1 text-sm">
        <p className="font-medium">{job.customerName}</p>
        <p className="text-muted-foreground">{job.deviceType} - {job.brand} {job.model}</p>
        {job.technician && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> {job.technician}
          </p>
        )}
        {job.deadline && (
          <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            <Clock className="w-3 h-3" /> 
            {isOverdue ? 'Overdue: ' : 'Due: '}
            {format(new Date(job.deadline), 'MMM d, h:mm a')}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AdminOverview() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ["jobOverview"],
    queryFn: fetchJobOverview,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const setupSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource("/api/admin/events", { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "job_ticket_created" || 
              data.type === "job_ticket_updated" || 
              data.type === "job_ticket_deleted") {
            queryClient.invalidateQueries({ queryKey: ["jobOverview"] });
            
            if (data.type === "job_ticket_updated" && data.data?.status === "Completed") {
              toast.success(`Job ${data.data.ticketNumber} marked as completed`, {
                description: "Ready for customer pickup"
              });
            }
          }
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setTimeout(setupSSE, 5000);
      };
    };

    setupSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !overview) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mb-4 text-destructive" />
          <p>Failed to load job overview data</p>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </AdminLayout>
    );
  }

  const { stats, dueToday, dueTomorrow, dueThisWeek, readyForDelivery, technicianWorkloads } = overview;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live Job Overview</h1>
          <p className="text-muted-foreground">Real-time monitoring of all active repair jobs</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          data-testid="button-refresh-overview"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
        <Card data-testid="card-due-today">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-due-today">
              {stats.totalDueToday}
            </div>
            <p className="text-xs text-muted-foreground">Jobs due today</p>
          </CardContent>
        </Card>
        <Card data-testid="card-due-tomorrow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Tomorrow</CardTitle>
            <CalendarClock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600" data-testid="text-due-tomorrow">
              {stats.totalDueTomorrow}
            </div>
            <p className="text-xs text-muted-foreground">Jobs due tomorrow</p>
          </CardContent>
        </Card>
        <Card data-testid="card-due-week">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="text-due-week">
              {stats.totalDueThisWeek}
            </div>
            <p className="text-xs text-muted-foreground">Next 7 days</p>
          </CardContent>
        </Card>
        <Card data-testid="card-ready-delivery">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready for Delivery</CardTitle>
            <Truck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-ready-delivery">
              {stats.totalReadyForDelivery}
            </div>
            <p className="text-xs text-muted-foreground">Completed jobs</p>
          </CardContent>
        </Card>
        <Card data-testid="card-in-progress">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Wrench className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-in-progress">
              {stats.totalInProgress}
            </div>
            <p className="text-xs text-muted-foreground">Being worked on</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <Card className="col-span-1" data-testid="card-due-today-list">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-red-500" />
              Due Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {dueToday.length > 0 ? (
                <div className="space-y-3">
                  {dueToday.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Clock className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No jobs due today</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="col-span-1" data-testid="card-due-tomorrow-list">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="w-4 h-4 text-orange-500" />
              Due Tomorrow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {dueTomorrow.length > 0 ? (
                <div className="space-y-3">
                  {dueTomorrow.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <CalendarClock className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No jobs due tomorrow</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="col-span-1" data-testid="card-ready-delivery-list">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="w-4 h-4 text-green-500" />
              Ready for Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              {readyForDelivery.length > 0 ? (
                <div className="space-y-3">
                  {readyForDelivery.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Truck className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No jobs ready for delivery</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-technician-workloads">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Technician Workloads
          </CardTitle>
        </CardHeader>
        <CardContent>
          {technicianWorkloads.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {technicianWorkloads.map(({ technician, jobs }) => (
                <div 
                  key={technician} 
                  className="p-4 rounded-lg border bg-card"
                  data-testid={`technician-workload-${technician.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium">{technician}</span>
                    </div>
                    <Badge variant="secondary">{jobs.length} jobs</Badge>
                  </div>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2">
                      {jobs.map(job => (
                        <div 
                          key={job.id} 
                          className="text-sm p-2 rounded bg-muted/50 flex items-center justify-between"
                        >
                          <span className="font-mono text-xs">{job.ticketNumber}</span>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(job.status)}`}>
                            {job.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <User className="w-12 h-12 mb-4 opacity-50" />
              <p>No active jobs assigned to technicians</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
