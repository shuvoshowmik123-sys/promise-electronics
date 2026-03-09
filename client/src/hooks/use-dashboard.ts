import { useQuery } from "@tanstack/react-query";
import { JobTicket } from "@shared/schema";

interface DashboardStats {
    totalRevenue: number;
    revenueChange: number;
    activeJobs: number;
    pendingServiceRequests: number;
    lowStockItems: number;
    jobStatusDistribution: { name: string; value: number }[];
    weeklyRevenue: { name: string; revenue: number }[];
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
    };
}

export function useDashboardStats() {
    return useQuery<DashboardStats>({
        queryKey: ["dashboardStats"],
        queryFn: async () => {
            const response = await fetch("/api/admin/dashboard", { credentials: "include" });
            if (!response.ok) throw new Error("Failed to fetch dashboard stats");
            return response.json();
        },
        refetchInterval: 60000,
    });
}

export function useJobOverview() {
    return useQuery<JobOverview>({
        queryKey: ["jobOverview"],
        queryFn: async () => {
            const response = await fetch("/api/admin/job-overview");
            if (!response.ok) throw new Error("Failed to fetch job overview");
            return response.json();
        },
        refetchInterval: 30000,
    });
}

export function useRecentActivity() {
    return useQuery<{ activityLogs: { action: string; user: string; time: string; type: string }[] }>({
        queryKey: ["recentActivity"],
        queryFn: async () => {
            const response = await fetch("/api/admin/reports?period=this_month");
            if (!response.ok) throw new Error("Failed to fetch activity");
            return response.json();
        },
        refetchInterval: 60000,
    });
}
