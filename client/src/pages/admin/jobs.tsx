import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, MoreHorizontal, QrCode, Printer, Loader2, Eye, Edit, Calendar as CalendarIcon, User, Wrench, FileText, X, Wifi, Download, Clock, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobTicketsApi, settingsApi, adminUsersApi, aiApi } from "@/lib/api";
import { useState, useRef, useEffect, useCallback } from "react";
import { playNotificationSound, type NotificationTone } from "@/lib/notification-sound";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import type { InsertJobTicket, JobTicket } from "@shared/schema";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminSSE } from "@/contexts/AdminSSEContext";

export default function AdminJobsPage() {
  const { hasPermission } = useAdminAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobTicket | null>(null);
  const [formData, setFormData] = useState<Partial<InsertJobTicket>>({
    status: "Pending",
    priority: "Medium",
    technician: "Unassigned",
  });
  const [nextJobNumber, setNextJobNumber] = useState<string>("");
  const [editFormData, setEditFormData] = useState<Partial<InsertJobTicket>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterTechnician, setFilterTechnician] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { sseSupported } = useAdminSSE();
  const previousJobCountRef = useRef(0);
  const queryClient = useQueryClient();
  const [isSuggesting, setIsSuggesting] = useState(false);

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ["jobTickets"],
    queryFn: jobTicketsApi.getAll,
    // Use polling as fallback when SSE is not supported
    refetchInterval: sseSupported ? false : 10000,
  });

  const jobs = jobsData || [];

  // Sync selectedJob with latest data from query cache
  useEffect(() => {
    if (selectedJob && jobs.length > 0) {
      const updatedJob = jobs.find(j => j.id === selectedJob.id);
      if (updatedJob && updatedJob !== selectedJob) {
        setSelectedJob(updatedJob);
        setEditFormData({
          id: updatedJob.id,
          customer: updatedJob.customer,
          device: updatedJob.device,
          issue: updatedJob.issue,
          status: updatedJob.status,
          priority: updatedJob.priority,
          technician: updatedJob.technician || "Unassigned",
          screenSize: updatedJob.screenSize || "",
          notes: updatedJob.notes || "",
          estimatedCost: updatedJob.estimatedCost || undefined,
          deadline: updatedJob.deadline || undefined,
          serviceWarrantyDays: updatedJob.serviceWarrantyDays || 0,
          partsWarrantyDays: updatedJob.partsWarrantyDays || 0,
        });
      }
    }
  }, [jobs, selectedJob]);

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const getCurrencySymbol = () => {
    const currencySetting = settings?.find(s => s.key === "currency_symbol");
    return currencySetting?.value || "৳";
  };

  const notificationTone = (settings.find(s => s.key === "notification_tone")?.value as NotificationTone) || "default";

  // Play notification sound when new jobs arrive via polling
  useEffect(() => {
    if (jobs.length > 0 && previousJobCountRef.current > 0) {
      if (jobs.length > previousJobCountRef.current) {
        playNotificationSound(notificationTone);
      }
    }
    previousJobCountRef.current = jobs.length;
  }, [jobs.length, notificationTone]);

  const { data: users = [] } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: adminUsersApi.getAll,
  });

  const getSettingArray = (key: string, defaultValue: string[]): string[] => {
    const setting = settings.find((s) => s.key === key);
    if (setting?.value) {
      try {
        return JSON.parse(setting.value);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  };

  const tvInches = getSettingArray("tv_inches", ["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"]);
  const technicians = users.filter(u => u.role === "Technician").map(u => u.name);

  // Filter jobs based on search query and filters
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = searchQuery === "" ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customerPhone?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "all" || job.status === filterStatus;
    const matchesPriority = filterPriority === "all" || job.priority === filterPriority;
    const matchesTechnician = filterTechnician === "all" ||
      (filterTechnician === "Unassigned" && (!job.technician || job.technician === "Unassigned")) ||
      job.technician === filterTechnician;

    return matchesSearch && matchesStatus && matchesPriority && matchesTechnician;
  });

  // Export jobs to CSV
  const handleExport = () => {
    const headers = ["Job ID", "Customer", "Phone", "Device", "Issue", "Technician", "Priority", "Status", "Created At"];
    const csvData = filteredJobs.map(job => [
      job.id,
      job.customer || "",
      job.customerPhone || "",
      job.device || "",
      `"${(job.issue || "").replace(/"/g, '""')}"`,
      job.technician || "Unassigned",
      job.priority || "",
      job.status || "",
      job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm") : ""
    ]);

    const csvContent = [headers.join(","), ...csvData.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `job-tickets-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    toast.success("Jobs exported successfully");
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterPriority("all");
    setFilterTechnician("all");
  };

  const hasActiveFilters = filterStatus !== "all" || filterPriority !== "all" || filterTechnician !== "all";

  // Fetch next job number when create dialog opens
  useEffect(() => {
    if (createDialogOpen) {
      jobTicketsApi.getNextNumber().then(({ nextNumber }) => {
        setNextJobNumber(nextNumber);
      }).catch(() => {
        setNextJobNumber("");
      });
    }
  }, [createDialogOpen]);

  const createMutation = useMutation({
    mutationFn: jobTicketsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
      setCreateDialogOpen(false);
      setFormData({
        status: "Pending",
        priority: "Medium",
        technician: "Unassigned",
      });
      toast.success("Job ticket created successfully");
    },
    onError: () => {
      toast.error("Failed to create job ticket");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertJobTicket> }) =>
      jobTicketsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
      setEditDialogOpen(false);
      setSelectedJob(null);
      toast.success("Job ticket updated successfully");
    },
    onError: () => {
      toast.error("Failed to update job ticket");
    },
  });

  const handleCreate = () => {
    if (!formData.customer || !formData.device || !formData.issue) {
      toast.error("Please fill in all required fields (Customer, Device, Issue)");
      return;
    }
    // ID will be auto-generated by the backend if not provided
    createMutation.mutate(formData);
  };

  const handleViewDetails = (job: JobTicket) => {
    setSelectedJob(job);
    setViewDialogOpen(true);
  };

  const handleEditJob = (job: JobTicket) => {
    setSelectedJob(job);
    setEditFormData({
      id: job.id,
      customer: job.customer,
      device: job.device,
      issue: job.issue,
      status: job.status,
      priority: job.priority,
      technician: job.technician || "Unassigned",
      screenSize: job.screenSize || "",
      notes: job.notes || "",
      estimatedCost: job.estimatedCost || undefined,
      deadline: job.deadline || undefined,
      serviceWarrantyDays: job.serviceWarrantyDays || 0,
      partsWarrantyDays: job.partsWarrantyDays || 0,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateJob = () => {
    if (!selectedJob) return;

    const dataToUpdate: Record<string, any> = { ...editFormData };

    // Calculate warranty expiry dates when status is Completed
    if (dataToUpdate.status === "Completed") {
      const completedAt = new Date();
      dataToUpdate.completedAt = completedAt;

      if (dataToUpdate.serviceWarrantyDays && dataToUpdate.serviceWarrantyDays > 0) {
        const serviceExpiry = new Date(completedAt);
        serviceExpiry.setDate(serviceExpiry.getDate() + dataToUpdate.serviceWarrantyDays);
        dataToUpdate.serviceExpiryDate = serviceExpiry;
      }

      if (dataToUpdate.partsWarrantyDays && dataToUpdate.partsWarrantyDays > 0) {
        const partsExpiry = new Date(completedAt);
        partsExpiry.setDate(partsExpiry.getDate() + dataToUpdate.partsWarrantyDays);
        dataToUpdate.partsExpiryDate = partsExpiry;
      }
    }

    updateMutation.mutate({ id: selectedJob.id, data: dataToUpdate });
    updateMutation.mutate({ id: selectedJob.id, data: dataToUpdate });
  };

  const handleSuggestTechnician = async (issue: string) => {
    if (!issue) {
      toast.error("Please enter an issue description first");
      return;
    }

    setIsSuggesting(true);
    try {
      const suggestion = await aiApi.suggestTechnician(issue);
      if (suggestion) {
        // Find technician name by ID
        const tech = users.find(u => u.id === suggestion.technicianId);
        if (tech) {
          if (createDialogOpen) {
            setFormData(prev => ({ ...prev, technician: tech.name }));
          } else if (editDialogOpen) {
            setEditFormData(prev => ({ ...prev, technician: tech.name }));
          }
          toast.success(`AI Suggested: ${tech.name}`, { description: suggestion.reason });
        } else {
          toast.error("Suggested technician not found in list");
        }
      } else {
        toast.error("AI could not make a suggestion");
      }
    } catch (error) {
      toast.error("Failed to get AI suggestion");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handlePrintTicket = (job: JobTicket) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the ticket");
      return;
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job Ticket - ${job.id}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; color: #0066cc; }
          .subtitle { font-size: 12px; color: #666; }
          .ticket-id { font-size: 28px; font-weight: bold; font-family: monospace; margin: 10px 0; }
          .section { margin: 15px 0; }
          .label { font-size: 12px; color: #666; margin-bottom: 2px; }
          .value { font-size: 14px; font-weight: 500; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .status-pending { background: #f1f5f9; color: #475569; }
          .status-progress { background: #dbeafe; color: #1d4ed8; }
          .status-completed { background: #dcfce7; color: #166534; }
          .priority { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
          .priority-high { background: #fee2e2; color: #dc2626; }
          .priority-medium { background: #fef3c7; color: #d97706; }
          .priority-low { background: #f1f5f9; color: #64748b; }
          .footer { margin-top: 30px; padding-top: 10px; border-top: 1px dashed #ccc; text-align: center; font-size: 11px; color: #666; }
          .detail-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; margin: 10px 0; border-radius: 4px; }
          .detail-title { font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 8px; text-transform: uppercase; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Promise Electronics</div>
          <div class="subtitle">TV Repair & Electronics Service</div>
        </div>
        
        <div class="ticket-id">${job.id}</div>
        ${job.corporateJobNumber ? `<div style="text-align: center; font-size: 12px; color: #666;">Corporate Job #: ${job.corporateJobNumber}</div>` : ''}
        
        <div class="section">
          <div class="label">Customer</div>
          <div class="value">${job.customer}</div>
        </div>
        
        ${job.customerPhone || job.customerAddress ? `
        <div class="detail-box">
          <div class="detail-title">Customer Contact</div>
          ${job.customerPhone ? `<div class="grid"><div class="label">Phone</div><div class="value">${job.customerPhone}</div></div>` : ''}
          ${job.customerAddress ? `<div style="margin-top: 5px;"><div class="label">Address</div><div class="value">${job.customerAddress}</div></div>` : ''}
        </div>
        ` : ''}
        
        <div class="section">
          <div class="label">Device</div>
          <div class="value">${job.device}</div>
        </div>
        
        ${job.tvSerialNumber || job.screenSize ? `
        <div class="detail-box">
          <div class="detail-title">Device Details</div>
          <div class="grid">
            ${job.screenSize ? `<div><div class="label">Screen Size</div><div class="value">${job.screenSize}</div></div>` : ''}
            ${job.tvSerialNumber ? `<div><div class="label">Serial Number</div><div class="value" style="font-family: monospace;">${job.tvSerialNumber}</div></div>` : ''}
          </div>
        </div>
        ` : ''}
        
        <div class="section">
          <div class="label">Issue</div>
          <div class="value">${job.issue}</div>
        </div>
        
        <div class="grid">
          <div class="section">
            <div class="label">Status</div>
            <span class="status ${job.status === 'Completed' ? 'status-completed' : job.status === 'In Progress' ? 'status-progress' : 'status-pending'}">${job.status}</span>
          </div>
          <div class="section">
            <div class="label">Priority</div>
            <span class="priority ${job.priority === 'High' ? 'priority-high' : job.priority === 'Medium' ? 'priority-medium' : 'priority-low'}">${job.priority}</span>
          </div>
        </div>
        
        <div class="grid">
          <div class="section">
            <div class="label">Technician</div>
            <div class="value">${job.technician || 'Unassigned'}</div>
          </div>
          <div class="section">
            <div class="label">Date Created</div>
            <div class="value">${job.createdAt ? format(new Date(job.createdAt), 'dd MMM yyyy') : 'N/A'}</div>
          </div>
        </div>
        
        ${job.estimatedCost ? `
        <div class="section">
          <div class="label">Estimated Cost</div>
          <div class="value">${getCurrencySymbol()} ${job.estimatedCost}</div>
        </div>
        ` : ''}
        
        ${job.notes ? `
        <div class="section">
          <div class="label">Notes</div>
          <div class="value">${job.notes}</div>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 15px 0;">
          <img src="${getQRCodeUrl(job.id)}" alt="QR Code" style="width: 120px; height: 120px; margin: 0 auto;" />
          <p style="font-size: 10px; color: #666; margin-top: 5px;">Scan for status update</p>
        </div>
        
        <div class="footer">
          <p>Keep this ticket for your reference.</p>
          <p>Contact: +880 1673999995</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 250);

    toast.success("Print dialog opened");
  };

  const handleGenerateQR = (job: JobTicket) => {
    setSelectedJob(job);
    setQrDialogOpen(true);
  };

  const getQRCodeUrl = (jobId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const trackingUrl = `${origin}/track?id=${encodeURIComponent(jobId)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(trackingUrl)}`;
  };

  const handleDownloadQR = () => {
    if (!selectedJob) return;

    const link = document.createElement('a');
    link.href = getQRCodeUrl(selectedJob.id);
    link.download = `QR-${selectedJob.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR Code downloaded");
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-heading font-bold">Job Tickets</h1>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${sseSupported
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
                }`}>
                <Wifi className={`w-3 h-3 ${sseSupported ? "text-green-600" : "text-blue-600"}`} />
                {sseSupported ? "Live" : "Auto-refresh"}
              </div>
            </div>
            <p className="text-muted-foreground">Manage repair jobs, assignments, and status updates.</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            {hasPermission("canCreate") && (
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto" data-testid="button-create-job">
                  <Plus className="w-4 h-4" /> Create New Ticket
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Job Ticket</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="jobId">Job Number (Auto-generated)</Label>
                    <Input
                      id="jobId"
                      value={nextJobNumber || "Loading..."}
                      disabled
                      className="bg-slate-100 font-mono"
                      data-testid="input-job-id"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="corporateJobNumber">Corporate Job No. (Optional)</Label>
                    <Input
                      id="corporateJobNumber"
                      placeholder="e.g., CORP-2025-001"
                      value={formData.corporateJobNumber || ""}
                      onChange={(e) => setFormData({ ...formData, corporateJobNumber: e.target.value })}
                      data-testid="input-corporate-job-number"
                    />
                  </div>
                </div>

                <Separator />
                <h4 className="font-medium text-sm text-muted-foreground">Customer Information</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer">Customer Name *</Label>
                    <Input
                      id="customer"
                      placeholder="John Doe"
                      value={formData.customer || ""}
                      onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                      data-testid="input-customer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerPhone">Phone Number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm select-none">
                        +880
                      </span>
                      <Input
                        id="customerPhone"
                        placeholder="1XXXXXXXXX"
                        value={formData.customerPhone || ""}
                        onChange={(e) => {
                          let value = e.target.value;
                          // Remove any non-digit characters
                          value = value.replace(/\D/g, '');
                          // Remove leading 0 if present
                          if (value.startsWith('0')) {
                            value = value.slice(1);
                          }
                          // Limit to 10 digits
                          value = value.slice(0, 10);
                          setFormData({ ...formData, customerPhone: value });
                        }}
                        className="rounded-l-none"
                        maxLength={10}
                        data-testid="input-customer-phone"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerAddress">Address</Label>
                  <Textarea
                    id="customerAddress"
                    placeholder="Customer address..."
                    value={formData.customerAddress || ""}
                    onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                    rows={2}
                    data-testid="input-customer-address"
                  />
                </div>

                <Separator />
                <h4 className="font-medium text-sm text-muted-foreground">Device Information</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="device">Device/Model *</Label>
                    <Input
                      id="device"
                      placeholder="Samsung TV UA55AU7000"
                      value={formData.device || ""}
                      onChange={(e) => setFormData({ ...formData, device: e.target.value })}
                      data-testid="input-device"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tvSerialNumber">TV Serial Number</Label>
                    <Input
                      id="tvSerialNumber"
                      placeholder="e.g., SN123456789"
                      value={formData.tvSerialNumber || ""}
                      onChange={(e) => setFormData({ ...formData, tvSerialNumber: e.target.value })}
                      data-testid="input-tv-serial"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="screenSize">Screen Size</Label>
                  <Select
                    value={formData.screenSize || ""}
                    onValueChange={(value) => setFormData({ ...formData, screenSize: value })}
                  >
                    <SelectTrigger data-testid="select-screen-size">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {tvInches.map((inch) => (
                        <SelectItem key={inch} value={inch}>{inch}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
                <h4 className="font-medium text-sm text-muted-foreground">Issue & Assignment</h4>

                <div className="space-y-2">
                  <Label htmlFor="issue">Issue Description *</Label>
                  <Textarea
                    id="issue"
                    placeholder="Describe the problem..."
                    value={formData.issue || ""}
                    onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                    data-testid="input-issue"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData({ ...formData, priority: value as "Low" | "Medium" | "High" })}
                    >
                      <SelectTrigger data-testid="select-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="technician">Assign To</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        onClick={() => handleSuggestTechnician(formData.issue || "")}
                        disabled={isSuggesting}
                        type="button"
                      >
                        {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                        AI Suggest
                      </Button>
                    </div>
                    <Select
                      value={formData.technician || ""}
                      onValueChange={(value) => setFormData({ ...formData, technician: value })}
                    >
                      <SelectTrigger data-testid="select-technician">
                        <SelectValue placeholder="Select Technician" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unassigned">Unassigned</SelectItem>
                        {technicians.map((tech) => (
                          <SelectItem key={tech} value={tech} data-testid={`option-technician-${tech.toLowerCase().replace(/\s+/g, '-')}`}>
                            {tech}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Deadline / Due Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-start text-left font-normal ${!formData.deadline ? "text-muted-foreground" : ""}`}
                        data-testid="button-deadline-picker"
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        {formData.deadline ? format(new Date(formData.deadline), "PPP") : "Select deadline (optional)"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.deadline ? new Date(formData.deadline as string | Date) : undefined}
                        onSelect={(date) => setFormData({ ...formData, deadline: date || undefined })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-job">
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Ticket
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Job ID, Phone, or Name..."
                className="pl-9"
                data-testid="input-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant={showFilters ? "default" : "outline"}
                className="gap-2 flex-1 sm:flex-none"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <Filter className="w-4 h-4" /> Filters
                {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">!</Badge>}
              </Button>
              <Button variant="outline" onClick={handleExport} data-testid="button-export">
                <Download className="w-4 h-4 mr-2" /> Export
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-4 pt-2 border-t">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
                    <SelectValue placeholder="All Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Technician</Label>
                <Select value={filterTechnician} onValueChange={setFilterTechnician}>
                  <SelectTrigger className="w-[160px]" data-testid="select-filter-technician">
                    <SelectValue placeholder="All Technicians" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Technicians</SelectItem>
                    <SelectItem value="Unassigned">Unassigned</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech} value={tech}>{tech}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="w-4 h-4 mr-1" /> Clear filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Problem</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {jobs.length === 0 ? "No job tickets found. Create one to get started." : "No jobs match your search or filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredJobs.map((job) => (
                      <TableRow
                        key={job.id}
                        data-testid={`row-job-${job.id}`}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => handleViewDetails(job)}
                      >
                        <TableCell className="font-medium font-mono" data-testid={`text-job-id-${job.id}`}>{job.id}</TableCell>
                        <TableCell>{job.customer}</TableCell>
                        <TableCell>{job.device}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{job.issue}</TableCell>
                        <TableCell>
                          {!job.technician || job.technician === "Unassigned" ? (
                            <span className="text-muted-foreground italic text-xs">Unassigned</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                {job.technician.charAt(0)}
                              </div>
                              {job.technician}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={job.priority === "High" ? "destructive" : job.priority === "Medium" ? "secondary" : "outline"}>
                            {job.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            job.status === "Completed" ? "bg-green-500" :
                              job.status === "In Progress" ? "bg-blue-500" :
                                "bg-slate-500"
                          }>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${job.id}`}>
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleViewDetails(job)}>
                                <Eye className="w-4 h-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              {hasPermission("canEdit") && (
                                <DropdownMenuItem onClick={() => handleEditJob(job)}>
                                  <Edit className="w-4 h-4 mr-2" /> Edit Job
                                </DropdownMenuItem>
                              )}
                              {hasPermission("canEdit") && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => updateMutation.mutate({ id: job.id, data: { status: "In Progress" } })}>
                                    Mark In Progress
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateMutation.mutate({ id: job.id, data: { status: "Completed" } })}>
                                    Mark Completed
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              {hasPermission("canPrintJobTickets") && (
                                <DropdownMenuItem onClick={() => handlePrintTicket(job)}>
                                  <Printer className="w-4 h-4 mr-2" /> Print Ticket
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleGenerateQR(job)}>
                                <QrCode className="w-4 h-4 mr-2" /> Generate QR
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Job Ticket Details
            </DialogTitle>
            <DialogDescription>
              Viewing details for ticket {selectedJob?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ticket ID</p>
                  <p className="text-2xl font-mono font-bold">{selectedJob.id}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={selectedJob.priority === "High" ? "destructive" : selectedJob.priority === "Medium" ? "secondary" : "outline"}>
                    {selectedJob.priority} Priority
                  </Badge>
                  <Badge className={
                    selectedJob.status === "Completed" ? "bg-green-500" :
                      selectedJob.status === "In Progress" ? "bg-blue-500" :
                        "bg-slate-500"
                  }>
                    {selectedJob.status}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Customer</span>
                    </div>
                    <p className="font-medium">{selectedJob.customer}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Technician</span>
                    </div>
                    <p className="font-medium">{selectedJob.technician || "Unassigned"}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Device</p>
                  <p className="font-medium">{selectedJob.device}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-2">Issue Description</p>
                  <p className="font-medium">{selectedJob.issue}</p>
                </CardContent>
              </Card>

              {/* Full Details Section - Only visible to permitted users */}
              {hasPermission("canViewFullJobDetails") && (
                <>
                  {(selectedJob.customerPhone || selectedJob.customerAddress) && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="pt-4">
                        <p className="text-sm font-medium text-blue-700 mb-3">Customer Contact Details</p>
                        <div className="grid grid-cols-2 gap-4">
                          {selectedJob.customerPhone && (
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Phone</p>
                              <p className="font-medium">{selectedJob.customerPhone}</p>
                            </div>
                          )}
                          {selectedJob.customerAddress && (
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Address</p>
                              <p className="font-medium">{selectedJob.customerAddress}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {(selectedJob.tvSerialNumber || selectedJob.screenSize || selectedJob.corporateJobNumber) && (
                    <Card className="bg-slate-50 border-slate-200">
                      <CardContent className="pt-4">
                        <p className="text-sm font-medium text-slate-700 mb-3">Device & Job Details</p>
                        <div className="grid grid-cols-3 gap-4">
                          {selectedJob.corporateJobNumber && (
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Corporate Job #</p>
                              <p className="font-medium font-mono">{selectedJob.corporateJobNumber}</p>
                            </div>
                          )}
                          {selectedJob.tvSerialNumber && (
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">TV Serial Number</p>
                              <p className="font-medium font-mono">{selectedJob.tvSerialNumber}</p>
                            </div>
                          )}
                          {selectedJob.screenSize && (
                            <div>
                              <p className="text-sm text-muted-foreground mb-1">Screen Size</p>
                              <p className="font-medium">{selectedJob.screenSize}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {selectedJob.notes && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground mb-2">Notes</p>
                    <p className="font-medium">{selectedJob.notes}</p>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Created</span>
                    </div>
                    <p className="font-medium">
                      {selectedJob.createdAt ? format(new Date(selectedJob.createdAt), "PPP 'at' p") : "N/A"}
                    </p>
                  </CardContent>
                </Card>

                {selectedJob.deadline && (
                  <Card className="bg-orange-50 border-orange-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-orange-600" />
                        <span className="text-sm text-orange-600">Deadline</span>
                      </div>
                      <p className="font-medium text-orange-700">
                        {format(new Date(selectedJob.deadline), "PPP")}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {selectedJob.estimatedCost && (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground mb-2">Estimated Cost</p>
                      <p className="font-medium text-lg">{getCurrencySymbol()} {selectedJob.estimatedCost}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {selectedJob.completedAt && (
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarIcon className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-600">Completed</span>
                    </div>
                    <p className="font-medium text-green-700">
                      {format(new Date(selectedJob.completedAt), "PPP 'at' p")}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            {hasPermission("canPrintJobTickets") && (
              <Button variant="outline" onClick={() => selectedJob && handlePrintTicket(selectedJob)}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            )}
            <Button variant="outline" onClick={() => selectedJob && handleGenerateQR(selectedJob)}>
              <QrCode className="w-4 h-4 mr-2" /> QR Code
            </Button>
            {hasPermission("canEdit") && (
              <Button onClick={() => {
                if (selectedJob) {
                  handleEditJob(selectedJob);
                  setViewDialogOpen(false);
                }
              }}>
                <Edit className="w-4 h-4 mr-2" /> Edit Job
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Job Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Job Ticket</DialogTitle>
            <DialogDescription>Update details for ticket {selectedJob?.id}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job ID</Label>
                <Input value={editFormData.id || ""} disabled className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-customer">Customer Name *</Label>
                <Input
                  id="edit-customer"
                  value={editFormData.customer || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, customer: e.target.value })}
                  data-testid="input-edit-customer"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-device">Device *</Label>
                <Input
                  id="edit-device"
                  value={editFormData.device || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, device: e.target.value })}
                  data-testid="input-edit-device"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-screen-size">Screen Size</Label>
                <Select
                  value={editFormData.screenSize || ""}
                  onValueChange={(value) => setEditFormData({ ...editFormData, screenSize: value })}
                >
                  <SelectTrigger data-testid="select-edit-screen-size">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {tvInches.map((inch) => (
                      <SelectItem key={inch} value={inch}>{inch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-issue">Issue Description *</Label>
              <Textarea
                id="edit-issue"
                value={editFormData.issue || ""}
                onChange={(e) => setEditFormData({ ...editFormData, issue: e.target.value })}
                data-testid="input-edit-issue"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editFormData.status}
                  onValueChange={(value) => setEditFormData({ ...editFormData, status: value as "Pending" | "In Progress" | "Completed" | "Cancelled" })}
                >
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-priority">Priority</Label>
                <Select
                  value={editFormData.priority}
                  onValueChange={(value) => setEditFormData({ ...editFormData, priority: value as "Low" | "Medium" | "High" })}
                >
                  <SelectTrigger data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-technician">Assign To</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={() => handleSuggestTechnician(editFormData.issue || "")}
                    disabled={isSuggesting}
                    type="button"
                  >
                    {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    AI Suggest
                  </Button>
                </div>
                <Select
                  value={editFormData.technician || ""}
                  onValueChange={(value) => setEditFormData({ ...editFormData, technician: value })}
                >
                  <SelectTrigger data-testid="select-edit-technician">
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unassigned">Unassigned</SelectItem>
                    {technicians.map((tech) => (
                      <SelectItem key={tech} value={tech} data-testid={`option-edit-technician-${tech.toLowerCase().replace(/\s+/g, '-')}`}>
                        {tech}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cost">Estimated Cost ({getCurrencySymbol()})</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  placeholder="0.00"
                  value={editFormData.estimatedCost || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, estimatedCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                  data-testid="input-edit-cost"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deadline / Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-start text-left font-normal ${!editFormData.deadline ? "text-muted-foreground" : ""}`}
                    data-testid="button-edit-deadline-picker"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    {editFormData.deadline ? format(new Date(editFormData.deadline), "PPP") : "Select deadline (optional)"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editFormData.deadline ? new Date(editFormData.deadline as string | Date) : undefined}
                    onSelect={(date) => setEditFormData({ ...editFormData, deadline: date || undefined })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {/* Dual Warranty Section - visible when status is Completed */}
            {editFormData.status === "Completed" && (
              <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
                <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Warranty Settings
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-service-warranty">Service Warranty</Label>
                    <Select
                      value={String(editFormData.serviceWarrantyDays || 0)}
                      onValueChange={(value) => setEditFormData({ ...editFormData, serviceWarrantyDays: parseInt(value) })}
                    >
                      <SelectTrigger data-testid="select-service-warranty">
                        <SelectValue placeholder="Select service warranty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None</SelectItem>
                        <SelectItem value="30">30 Days</SelectItem>
                        <SelectItem value="60">60 Days</SelectItem>
                        <SelectItem value="90">90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Covers technician workmanship</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-parts-warranty">Parts Warranty</Label>
                    <Select
                      value={String(editFormData.partsWarrantyDays || 0)}
                      onValueChange={(value) => setEditFormData({ ...editFormData, partsWarrantyDays: parseInt(value) })}
                    >
                      <SelectTrigger data-testid="select-parts-warranty">
                        <SelectValue placeholder="Select parts warranty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">None (No parts replaced)</SelectItem>
                        <SelectItem value="90">3 Months (Board)</SelectItem>
                        <SelectItem value="180">6 Months</SelectItem>
                        <SelectItem value="365">1 Year (Panel)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Covers replaced hardware</p>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Add any additional notes..."
                value={editFormData.notes || ""}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateJob} disabled={updateMutation.isPending} data-testid="button-save-job">
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Code
            </DialogTitle>
            <DialogDescription>
              Scan this QR code to track job {selectedJob?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedJob && (
            <div className="flex flex-col items-center py-6">
              <div className="border rounded-lg p-4 bg-white">
                <img
                  src={getQRCodeUrl(selectedJob.id)}
                  alt={`QR Code for ${selectedJob.id}`}
                  className="w-[200px] h-[200px]"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Customers can scan this to check their repair status online.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setQrDialogOpen(false)}>
              Close
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleDownloadQR}>
              Download QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
