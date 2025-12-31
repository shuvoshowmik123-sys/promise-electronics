import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MediaViewer } from "@/components/MediaViewer";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { playNotificationSound, type NotificationTone } from "@/lib/notification-sound";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { serviceRequestsApi, adminQuotesApi, settingsApi, adminStageApi, jobTicketsApi } from "@/lib/api";
import { useAdminSSE } from "@/contexts/AdminSSEContext";
import type { ServiceRequest } from "@shared/schema";
import { PICKUP_STATUS_FLOW, SERVICE_CENTER_STATUS_FLOW, INTERNAL_STATUS_FLOW, getStageFlow } from "@shared/schema";
import { format } from "date-fns";
import { Search, Eye, Trash2, Clock, CheckCircle, ArrowRightCircle, XCircle, Image, Film, Phone, MapPin, Tv, AlertTriangle, Loader2, Wifi, FileQuestion, DollarSign, Send, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";

export default function AdminServiceRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"all" | "quotes" | "requests">("all");
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQuotePriceDialog, setShowQuotePriceDialog] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<ServiceRequest | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");

  const [showScheduleDateDialog, setShowScheduleDateDialog] = useState(false);
  const [pendingTrackingStatus, setPendingTrackingStatus] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [currentMediaUrls, setCurrentMediaUrls] = useState<string[]>([]);

  // Pending changes state for the details dialog (only saved when clicking Update)
  const [pendingChanges, setPendingChanges] = useState<{
    status: string;
    trackingStatus: string;
    paymentStatus: string;
    scheduledPickupDate: Date | null;
  } | null>(null);

  // Confirmation dialog state for status changes
  const [showStatusConfirmDialog, setShowStatusConfirmDialog] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    type: 'internal' | 'tracking';
    newValue: string;
    message: string;
  } | null>(null);

  const { sseSupported } = useAdminSSE();
  const previousRequestCountRef = useRef(0);
  const queryClient = useQueryClient();

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["service-requests"],
    queryFn: serviceRequestsApi.getAll,
    staleTime: 0,
    refetchOnMount: "always",
    // Use polling as fallback when SSE is not supported
    refetchInterval: sseSupported ? false : 10000,
  });

  const requests = requestsData || [];

  // Sync selectedRequest with latest data from query cache
  useEffect(() => {
    if (selectedRequest && requests.length > 0) {
      const updatedRequest = requests.find(r => r.id === selectedRequest.id);
      if (updatedRequest && updatedRequest !== selectedRequest) {
        setSelectedRequest(updatedRequest);
      }
    }
  }, [requests, selectedRequest]);

  // Fetch settings
  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const getCurrencySymbol = () => {
    const currencySetting = settings?.find(s => s.key === "currency_symbol");
    return currencySetting?.value || "৳";
  };

  // Get notification tone from settings
  const notificationTone = useMemo(() => {
    const setting = settings.find(s => s.key === "notification_tone");
    return (setting?.value as NotificationTone) || "default";
  }, [settings]);

  // Play notification sound when new requests arrive via polling
  useEffect(() => {
    if (requests.length > 0 && previousRequestCountRef.current > 0) {
      if (requests.length > previousRequestCountRef.current) {
        playNotificationSound(notificationTone);
      }
    }
    previousRequestCountRef.current = requests.length;
  }, [requests.length, notificationTone]);



  const developerMode = settings.find(s => s.key === "developer_mode")?.value === "true";

  // Query for next valid stages when a request is selected
  const { data: nextStagesData } = useQuery({
    queryKey: ["next-stages", selectedRequest?.id],
    queryFn: () => selectedRequest ? adminStageApi.getNextStages(selectedRequest.id) : null,
    enabled: !!selectedRequest?.id && showDetailsDialog,
  });

  // Query for job ticket when request is converted (to check technician assignment)
  const { data: convertedJobData } = useQuery({
    queryKey: ["job-ticket", selectedRequest?.convertedJobId],
    queryFn: () => selectedRequest?.convertedJobId ? jobTicketsApi.getOne(selectedRequest.convertedJobId) : null,
    enabled: !!selectedRequest?.convertedJobId && showDetailsDialog,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ServiceRequest> }) =>
      serviceRequestsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      toast.success("Request updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update request");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceRequestsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      toast.success("Request deleted successfully");
      setShowDeleteDialog(false);
      setRequestToDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete request");
    },
  });

  const quotePriceMutation = useMutation({
    mutationFn: ({ id, quoteAmount, quoteNotes }: { id: string; quoteAmount: number; quoteNotes?: string }) =>
      adminQuotesApi.updatePrice(id, { quoteAmount, quoteNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      toast.success("Quote price sent to customer");
      setShowQuotePriceDialog(false);
      setQuoteAmount("");
      setQuoteNotes("");
    },
    onError: () => {
      toast.error("Failed to send quote price");
    },
  });

  const stageTransitionMutation = useMutation({
    mutationFn: ({ id, stage, actorName }: { id: string; stage: string; actorName?: string }) =>
      adminStageApi.transitionStage(id, { stage, actorName }),
    onSuccess: (updatedRequest) => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["next-stages", updatedRequest.id] });
      setSelectedRequest(updatedRequest);
      toast.success(`Stage updated to "${formatStageName(updatedRequest.stage || "")}"`);
      if (updatedRequest.convertedJobId) {
        toast.success(`Job ticket ${updatedRequest.convertedJobId} created automatically!`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update stage");
    },
  });

  const expectedDatesMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { expectedPickupDate?: string | null; expectedReturnDate?: string | null; expectedReadyDate?: string | null } }) =>
      adminStageApi.updateExpectedDates(id, data),
    onSuccess: (updatedRequest) => {
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
      setSelectedRequest(updatedRequest);
      toast.success("Expected dates updated");
    },
    onError: () => {
      toast.error("Failed to update expected dates");
    },
  });

  const formatStageName = (stage: string): string => {
    const stageLabels: Record<string, string> = {
      intake: "Intake",
      assessment: "Assessment",
      awaiting_customer: "Awaiting Customer",
      authorized: "Authorized",
      pickup_scheduled: "Pickup Scheduled",
      picked_up: "Picked Up",
      awaiting_dropoff: "Awaiting Drop-off",
      device_received: "Device Received",
      in_repair: "In Repair",
      ready: "Ready",
      out_for_delivery: "Out for Delivery",
      completed: "Completed",
      closed: "Closed",
    };
    return stageLabels[stage] || stage;
  };

  const getStageColor = (stage: string): string => {
    const stageColors: Record<string, string> = {
      intake: "bg-gray-100 text-gray-700 border-gray-300",
      assessment: "bg-blue-50 text-blue-700 border-blue-200",
      awaiting_customer: "bg-amber-50 text-amber-700 border-amber-200",
      authorized: "bg-green-50 text-green-700 border-green-200",
      pickup_scheduled: "bg-purple-50 text-purple-700 border-purple-200",
      picked_up: "bg-indigo-50 text-indigo-700 border-indigo-200",
      awaiting_dropoff: "bg-orange-50 text-orange-700 border-orange-200",
      device_received: "bg-teal-50 text-teal-700 border-teal-200",
      in_repair: "bg-cyan-50 text-cyan-700 border-cyan-200",
      ready: "bg-lime-50 text-lime-700 border-lime-200",
      out_for_delivery: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
      completed: "bg-green-100 text-green-800 border-green-300",
      closed: "bg-slate-100 text-slate-700 border-slate-300",
    };
    return stageColors[stage] || "bg-gray-100 text-gray-700 border-gray-300";
  };

  const getQuoteStatusBadge = (quoteStatus: string | null | undefined) => {
    switch (quoteStatus) {
      case "Pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><FileQuestion className="w-3 h-3 mr-1" /> Quote Pending</Badge>;
      case "Quoted":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><DollarSign className="w-3 h-3 mr-1" /> Quoted</Badge>;
      case "Accepted":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Accepted</Badge>;
      case "Declined":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Declined</Badge>;
      case "Converted":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><ArrowRightCircle className="w-3 h-3 mr-1" /> Converted</Badge>;
      default:
        return null;
    }
  };

  const handleSendQuote = () => {
    if (selectedRequest && quoteAmount) {
      quotePriceMutation.mutate({
        id: selectedRequest.id,
        quoteAmount: parseFloat(quoteAmount),
        quoteNotes: quoteNotes || undefined,
      });
    }
  };

  const openQuotePriceDialog = (request: ServiceRequest) => {
    setSelectedRequest(request);
    setQuoteAmount(request.quoteAmount?.toString() || "");
    setQuoteNotes(request.quoteNotes || "");
    setShowQuotePriceDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "Reviewed":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Eye className="w-3 h-3 mr-1" /> Reviewed</Badge>;
      case "Converted":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Converted</Badge>;
      case "Closed":
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200"><XCircle className="w-3 h-3 mr-1" /> Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMediaUrls = (mediaUrlsStr: string | null): string[] => {
    if (!mediaUrlsStr) return [];
    try {
      const parsed = JSON.parse(mediaUrlsStr);
      // Handle both old format (array of strings) and new format (array of objects with url property)
      return parsed.map((item: string | { url: string }) =>
        typeof item === 'string' ? item : item.url
      );
    } catch {
      return [];
    }
  };

  const getSymptoms = (symptomsStr: string | null): string[] => {
    if (!symptomsStr) return [];
    try {
      return JSON.parse(symptomsStr);
    } catch {
      return [];
    }
  };

  const isImage = (url: string) => {
    return url.startsWith("data:image/") || url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  };

  const isVideo = (url: string) => {
    return url.startsWith("data:video/") || url.match(/\.(mp4|webm|mov|avi)$/i);
  };

  const filteredRequests = requests.filter((request) => {
    const matchesSearch =
      request.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.phone.includes(searchTerm) ||
      request.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.brand.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || request.status === statusFilter;

    const matchesViewMode =
      viewMode === "all" ||
      (viewMode === "quotes" && request.isQuote) ||
      (viewMode === "requests" && !request.isQuote);

    return matchesSearch && matchesStatus && matchesViewMode;
  });

  const quoteCount = requests.filter(r => r.isQuote).length;
  const pendingQuoteCount = requests.filter(r => r.isQuote && r.quoteStatus === "Pending").length;

  // Get the appropriate tracking status flow based on service preference
  const getTrackingStatusFlow = (servicePreference: string | null | undefined): readonly string[] => {
    if (servicePreference === "service_center" || servicePreference === "center") {
      return SERVICE_CENTER_STATUS_FLOW;
    }
    return PICKUP_STATUS_FLOW;
  };

  // Check if a status should be disabled (is before current status in flow)
  const isStatusDisabled = (status: string, currentStatus: string, flow: readonly string[]): boolean => {
    // Developer mode bypasses all status restrictions
    if (developerMode) return false;

    const currentIndex = flow.indexOf(currentStatus);
    const statusIndex = flow.indexOf(status);
    // Disable if status is before current (can only move forward)
    // Also allow staying at current status
    return statusIndex < currentIndex && statusIndex !== -1 && currentIndex !== -1;
  };

  // Get internal status disabled state
  const isInternalStatusDisabled = (status: string, currentStatus: string): boolean => {
    // Developer mode bypasses all status restrictions
    if (developerMode) return false;

    const flow = INTERNAL_STATUS_FLOW as readonly string[];
    const currentIndex = flow.indexOf(currentStatus);
    const statusIndex = flow.indexOf(status);
    return statusIndex < currentIndex && statusIndex !== -1 && currentIndex !== -1;
  };

  // Get description for status change confirmation
  const getStatusChangeDescription = (type: 'internal' | 'tracking', from: string, to: string): string => {
    if (type === 'internal') {
      switch (to) {
        case "Reviewed":
          return "Changing to 'Reviewed' indicates the request has been assessed.";
        case "Converted":
          return "Changing to 'Converted' will create a job ticket for this request. This action cannot be undone.";
        case "Closed":
          return "Changing to 'Closed' will mark this request as complete. The customer will be notified.";
        default:
          return `Changing status from '${from}' to '${to}'.`;
      }
    } else {
      return `The customer tracking status will change from '${from}' to '${to}'. The customer will see this update in their order tracking.`;
    }
  };

  // Handle internal status change with confirmation
  const handleInternalStatusWithConfirm = (newStatus: string) => {
    if (!pendingChanges || !selectedRequest) return;
    const currentStatus = selectedRequest.status;

    // Show confirmation dialog
    setPendingStatusChange({
      type: 'internal',
      newValue: newStatus,
      message: getStatusChangeDescription('internal', currentStatus, newStatus)
    });
    setShowStatusConfirmDialog(true);
  };

  // Handle tracking status change with confirmation
  const handleTrackingStatusWithConfirm = (newStatus: string) => {
    if (!pendingChanges || !selectedRequest) return;
    const currentStatus = selectedRequest.trackingStatus;

    // Job-related statuses that require the request to be converted first
    const jobRelatedStatuses = [
      "Technician Assigned",
      "Diagnosis Completed",
      "Parts Pending",
      "Repairing",
      "Ready for Delivery",
      "Delivered"
    ];

    // Validate job-related statuses - require converted status (use persisted status, not pending)
    if (jobRelatedStatuses.includes(newStatus)) {
      if (selectedRequest.status !== "Converted") {
        toast.error(`Cannot set '${newStatus}' - request must be converted to a job first`);
        return;
      }
      // For Technician Assigned specifically, remind about technician requirement
      if (newStatus === "Technician Assigned") {
        toast.info("Note: A technician must be assigned to the job for this status to save");
      }
    }

    // Show confirmation dialog
    setPendingStatusChange({
      type: 'tracking',
      newValue: newStatus,
      message: getStatusChangeDescription('tracking', currentStatus, newStatus)
    });
    setShowStatusConfirmDialog(true);
  };

  // Confirm status change
  const confirmStatusChange = () => {
    if (!pendingStatusChange || !pendingChanges) return;

    if (pendingStatusChange.type === 'internal') {
      // Apply internal status change - don't auto-map to job statuses until technician is assigned
      const status = pendingStatusChange.newValue;
      // Only auto-set tracking status for terminal states, not job-related statuses
      // Job-related tracking (Technician Assigned, etc.) requires technician to be assigned to the job first
      let trackingStatus = pendingChanges.trackingStatus;
      if (status === "Closed") {
        trackingStatus = "Delivered";
      }
      // Note: When converting to job, tracking status stays at current pre-job stage (Queued/Received)
      // Admin must assign technician to job first, then update tracking status manually
      setPendingChanges({ ...pendingChanges, status, trackingStatus });
    } else {
      // Apply tracking status change
      setPendingChanges({ ...pendingChanges, trackingStatus: pendingStatusChange.newValue });
    }

    setShowStatusConfirmDialog(false);
    setPendingStatusChange(null);
  };

  const handleViewDetails = (request: ServiceRequest) => {
    setSelectedRequest(request);
    // Initialize pending changes with current values
    setPendingChanges({
      status: request.status,
      trackingStatus: request.trackingStatus,
      paymentStatus: request.paymentStatus || "Due",
      scheduledPickupDate: request.scheduledPickupDate ? new Date(request.scheduledPickupDate) : null,
    });
    setShowDetailsDialog(true);
    if (request.status === "Pending") {
      // Also update pendingChanges to reflect the auto-review
      setPendingChanges(prev => prev ? { ...prev, status: "Reviewed" } : null);
      updateMutation.mutate({ id: request.id, data: { status: "Reviewed" } });
    }
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!selectedRequest || !pendingChanges) return false;
    return (
      pendingChanges.status !== selectedRequest.status ||
      pendingChanges.trackingStatus !== selectedRequest.trackingStatus ||
      pendingChanges.paymentStatus !== (selectedRequest.paymentStatus || "Due") ||
      (pendingChanges.scheduledPickupDate?.toISOString() || null) !==
      (selectedRequest.scheduledPickupDate ? new Date(selectedRequest.scheduledPickupDate).toISOString() : null)
    );
  };

  // Save all pending changes
  const handleSaveChanges = async () => {
    if (!selectedRequest || !pendingChanges) return;

    const updateData: any = {};

    if (pendingChanges.status !== selectedRequest.status) {
      updateData.status = pendingChanges.status;
    }
    if (pendingChanges.trackingStatus !== selectedRequest.trackingStatus) {
      updateData.trackingStatus = pendingChanges.trackingStatus;
    }
    if (pendingChanges.paymentStatus !== (selectedRequest.paymentStatus || "Due")) {
      updateData.paymentStatus = pendingChanges.paymentStatus;
    }
    if ((pendingChanges.scheduledPickupDate?.toISOString() || null) !==
      (selectedRequest.scheduledPickupDate ? new Date(selectedRequest.scheduledPickupDate).toISOString() : null)) {
      updateData.scheduledPickupDate = pendingChanges.scheduledPickupDate?.toISOString() || null;
    }

    if (Object.keys(updateData).length === 0) return;

    updateMutation.mutate({
      id: selectedRequest.id,
      data: updateData
    }, {
      onSuccess: (updatedRequest) => {
        setSelectedRequest(updatedRequest);
        // Reset pending changes to match saved data
        setPendingChanges({
          status: updatedRequest.status,
          trackingStatus: updatedRequest.trackingStatus,
          paymentStatus: updatedRequest.paymentStatus || "Due",
          scheduledPickupDate: updatedRequest.scheduledPickupDate ? new Date(updatedRequest.scheduledPickupDate) : null,
        });
        if (pendingChanges.status === "Converted" && updatedRequest.convertedJobId) {
          toast.success(`Job ticket ${updatedRequest.convertedJobId} created automatically!`);
        }
      }
    });
  };

  // Close dialog and discard unsaved changes
  const handleCloseDialog = () => {
    setShowDetailsDialog(false);
    setPendingChanges(null);
  };

  const handleDeleteConfirm = () => {
    if (requestToDelete) {
      deleteMutation.mutate(requestToDelete.id);
    }
  };

  const pendingCount = requests.filter(r => r.status === "Pending").length;

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-heading font-bold" data-testid="page-title">Service Requests</h1>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${sseSupported
                ? "bg-green-100 text-green-700"
                : "bg-blue-100 text-blue-700"
                }`}>
                <Wifi className={`w-3 h-3 ${sseSupported ? "text-green-600" : "text-blue-600"}`} />
                {sseSupported ? "Live" : "Auto-refresh"}
              </div>
            </div>
            <p className="text-muted-foreground">View and manage customer repair requests from the website</p>
          </div>
          {pendingCount > 0 && (
            <Badge className="bg-yellow-500 text-white text-lg px-4 py-2">
              <AlertTriangle className="w-4 h-4 mr-2" />
              {pendingCount} New Request{pendingCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-row items-center justify-between">
                <CardTitle>All Requests</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, ticket..."
                      className="pl-10 w-[250px]"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="search-input"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="filter-status">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Reviewed">Reviewed</SelectItem>
                      <SelectItem value="Converted">Converted</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">
                    All ({requests.length})
                  </TabsTrigger>
                  <TabsTrigger value="quotes" data-testid="tab-quotes" className="relative">
                    Quote Requests ({quoteCount})
                    {pendingQuoteCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                        {pendingQuoteCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="requests" data-testid="tab-requests">
                    Service Requests ({requests.length - quoteCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tv className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No service requests found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Issue</TableHead>
                    {viewMode !== "requests" && <TableHead>Quote</TableHead>}
                    <TableHead>Media</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => {
                    const mediaUrls = getMediaUrls(request.mediaUrls);
                    return (
                      <TableRow key={request.id} data-testid={`request-row-${request.id}`}>
                        <TableCell className="font-mono text-sm">{request.ticketNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.customerName}</p>
                            <p className="text-sm text-muted-foreground">{request.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{request.brand}</p>
                            <p className="text-sm text-muted-foreground">{request.screenSize ? `${request.screenSize}"` : ""}</p>
                          </div>
                        </TableCell>
                        <TableCell>{request.primaryIssue}</TableCell>
                        {viewMode !== "requests" && (
                          <TableCell>
                            {request.isQuote ? (
                              <div className="space-y-1">
                                {getQuoteStatusBadge(request.quoteStatus)}
                                {request.quoteAmount && (
                                  <p className="text-sm font-medium text-primary">
                                    {getCurrencySymbol()}{Number(request.quoteAmount).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          {mediaUrls.length > 0 ? (
                            <Badge variant="outline" className="gap-1">
                              <Image className="w-3 h-3" />
                              {mediaUrls.length}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(request.createdAt), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {request.isQuote && request.quoteStatus === "Pending" && (
                              <Button
                                size="sm"
                                onClick={() => openQuotePriceDialog(request)}
                                data-testid={`send-quote-${request.id}`}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Quote
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(request)}
                              data-testid={`view-request-${request.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setRequestToDelete(request);
                                setShowDeleteDialog(true);
                              }}
                              data-testid={`delete-request-${request.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDetailsDialog} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Service Request Details
                {developerMode && (
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">Dev Mode</Badge>
                )}
              </span>
              {selectedRequest && getStatusBadge(selectedRequest.status)}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Ticket Number</Label>
                  <p className="font-mono font-bold text-lg">{selectedRequest.ticketNumber}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Submitted</Label>
                  <p>{format(new Date(selectedRequest.createdAt), "PPP 'at' p")}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Customer Information
                </h3>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{selectedRequest.customerName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedRequest.phone}</p>
                  </div>
                  {selectedRequest.address && (
                    <div className="col-span-2">
                      <Label className="text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Address
                      </Label>
                      <p>{selectedRequest.address}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Service Preference</Label>
                    <p className="font-medium capitalize">{selectedRequest.servicePreference === "pickup" || selectedRequest.servicePreference === "home_pickup" ? "Pickup & Drop" : "Service Center Visit"}</p>
                  </div>
                  {selectedRequest.scheduledPickupDate && selectedRequest.servicePreference !== "pickup" && selectedRequest.servicePreference !== "home_pickup" && (
                    <div>
                      <Label className="text-muted-foreground">Customer's Planned Visit Date</Label>
                      <p className="font-medium text-primary">{format(new Date(selectedRequest.scheduledPickupDate), "EEEE, MMMM d, yyyy")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Service Center Visit Date Banner - prominent display when customer has scheduled */}
              {selectedRequest.scheduledPickupDate && selectedRequest.servicePreference !== "pickup" && selectedRequest.servicePreference !== "home_pickup" && (
                <div className="border-t pt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-800">Scheduled Service Center Visit</h4>
                        <p className="text-sm text-blue-600">
                          Customer plans to bring their TV on <span className="font-semibold">{format(new Date(selectedRequest.scheduledPickupDate), "EEEE, MMMM d, yyyy")}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Tv className="w-4 h-4" /> Device Information
                </h3>
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-muted-foreground">Brand</Label>
                    <p className="font-medium">{selectedRequest.brand}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Screen Size</Label>
                    <p className="font-medium">{selectedRequest.screenSize ? `${selectedRequest.screenSize}"` : "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Model</Label>
                    <p className="font-medium">{selectedRequest.modelNumber || "-"}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Issue Details
                </h3>
                <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
                  <div>
                    <Label className="text-muted-foreground">Primary Issue</Label>
                    <p className="font-medium">{selectedRequest.primaryIssue}</p>
                  </div>
                  {getSymptoms(selectedRequest.symptoms).length > 0 && (
                    <div>
                      <Label className="text-muted-foreground">Symptoms</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {getSymptoms(selectedRequest.symptoms).map((symptom, i) => (
                          <Badge key={i} variant="secondary">{symptom}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRequest.description && (
                    <div>
                      <Label className="text-muted-foreground">Description</Label>
                      <p className="text-sm">{selectedRequest.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {getMediaUrls(selectedRequest.mediaUrls).length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Image className="w-4 h-4" /> Uploaded Media
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    These files will be automatically deleted 30 days after submission
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {getMediaUrls(selectedRequest.mediaUrls).map((url, index) => (
                      <div key={index} className="relative rounded-lg overflow-hidden border bg-slate-100">
                        {isImage(url) ? (
                          <img
                            src={url}
                            alt={`Upload ${index + 1}`}
                            className="w-full h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => {
                              setCurrentMediaUrls(getMediaUrls(selectedRequest.mediaUrls));
                              setMediaViewerIndex(index);
                              setMediaViewerOpen(true);
                            }}
                            data-testid={`media-thumbnail-${index}`}
                          />
                        ) : isVideo(url) ? (
                          <div
                            className="w-full h-40 relative cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => {
                              setCurrentMediaUrls(getMediaUrls(selectedRequest.mediaUrls));
                              setMediaViewerIndex(index);
                              setMediaViewerOpen(true);
                            }}
                            data-testid={`media-thumbnail-${index}`}
                          >
                            <video
                              src={url}
                              className="w-full h-40 object-cover pointer-events-none"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Film className="h-10 w-10 text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-40 flex items-center justify-center bg-slate-200">
                            <Film className="h-12 w-12 text-slate-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedRequest.quoteStatus === "Declined" && (
                <div className="border-t pt-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-red-800">Quote Declined by Customer</h4>
                        <p className="text-sm text-red-600">This service request is closed and cannot be edited.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning when quote has not been sent yet - block status changes until admin sends quote */}
              {selectedRequest.isQuote && (!selectedRequest.quoteStatus || selectedRequest.quoteStatus === "Pending") && (
                <div className="border-t pt-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                        <Clock className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-amber-800">Quote Not Sent Yet</h4>
                        <p className="text-sm text-amber-600">Please send the quote to the customer first before changing status.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning when quote sent but waiting for customer response */}
              {selectedRequest.isQuote && selectedRequest.quoteStatus === "Quoted" && (
                <div className="border-t pt-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-800">Waiting for Customer Response</h4>
                        <p className="text-sm text-blue-600">Quote has been sent. Waiting for customer to accept or decline.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                // Unified blocking logic for service center visits
                const isServiceCenter = selectedRequest.servicePreference === "service_center" || selectedRequest.servicePreference === "center";
                // Terminal state is only "Closed" - "Converted" is not terminal, it unlocks job-related tracking
                const isClosedState = selectedRequest.status === "Closed";
                const hasScheduledDate = !!selectedRequest.scheduledPickupDate;

                // Quote-based: block until quote is SENT (Quoted, Accepted, Declined, or Converted)
                // Simple rule: can't change status until admin sends the quote
                // Use Boolean() to ensure we always get a boolean, not null
                const quoteBlocked = Boolean(selectedRequest.isQuote) &&
                  !["Quoted", "Accepted", "Converted"].includes(selectedRequest.quoteStatus || "");

                // ===== SEPARATE BLOCKING LOGIC FOR EACH DROPDOWN =====

                // Internal Status: Block until TV is at service center
                // For pickup mode: Customer Tracking must be at or past "Received" 
                // For service center mode: Customer Tracking must be at or past "Queued"
                // Use the EFFECTIVE tracking status (pending change if exists, otherwise persisted)
                const effectiveTrackingStatus = pendingChanges?.trackingStatus || selectedRequest.trackingStatus || "";
                const trackingStatusFlow = getTrackingStatusFlow(selectedRequest.servicePreference);
                const deviceReceivedThreshold = isServiceCenter ? "Queued" : "Received";
                const thresholdIndex = trackingStatusFlow.indexOf(deviceReceivedThreshold);
                const currentTrackingIndex = trackingStatusFlow.indexOf(effectiveTrackingStatus);
                // Device is at center if tracking is at or past the threshold (Received/Queued)
                const isDeviceAtCenter = currentTrackingIndex >= thresholdIndex && thresholdIndex !== -1;
                const isConverted = selectedRequest.status === "Converted";
                // Internal is locked if: closed state, OR quote blocked, OR device not at center
                // Note: Converted status does NOT block - admin should be able to move from Converted to Closed
                const isInternalBlocked = isClosedState || (!developerMode && (quoteBlocked || !isDeviceAtCenter));

                // Customer Tracking: The dropdown itself is NEVER fully blocked
                // Instead, individual job-related items are disabled until Converted AND technician assigned
                // Pre-job states (Request Received â†’ Received / Awaiting Drop-off â†’ Queued) are always available
                const hasJobTicket = !!selectedRequest.convertedJobId;
                // Check if job has technician assigned (from convertedJobData query)
                // Technician field defaults to "Unassigned" when no one is assigned
                const hasTechnicianAssigned = !!(convertedJobData?.technician && convertedJobData.technician !== "Unassigned");
                // Job-related tracking statuses require both conversion AND technician assignment
                const canUseJobStatuses = isConverted && hasTechnicianAssigned;
                // Only block entire dropdown in closed state or if quote blocked
                const isTrackingBlocked = isClosedState || (!developerMode && quoteBlocked);

                // Legacy: isTerminalState for code that still needs it (e.g. stage transitions)
                const isTerminalState = isClosedState;

                return (
                  <div className="border-t pt-4 space-y-4">
                    {/* Workflow Stage Section - Single source of truth for stage progression */}
                    <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold text-slate-700">Workflow Stage</Label>
                        {selectedRequest.serviceMode && (
                          <Badge variant="outline" className="text-xs">
                            {selectedRequest.serviceMode === "pickup" ? "ðŸš— Home Pickup" : "ðŸª Service Center"}
                          </Badge>
                        )}
                      </div>

                      {/* Current stage display */}
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className={`${getStageColor(selectedRequest.stage || "intake")} border px-3 py-1`}>
                          {formatStageName(selectedRequest.stage || "intake")}
                        </Badge>
                        {selectedRequest.convertedJobId && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Job: {selectedRequest.convertedJobId}
                          </Badge>
                        )}
                      </div>

                      {/* Stage transition dropdown */}
                      {(nextStagesData?.validNextStages?.length || 0) > 0 && !isTerminalState && (
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Move to next stage:</Label>
                          <div className="flex gap-2">
                            <Select
                              onValueChange={(newStage) => {
                                stageTransitionMutation.mutate({
                                  id: selectedRequest.id,
                                  stage: newStage,
                                });
                              }}
                              disabled={stageTransitionMutation.isPending}
                            >
                              <SelectTrigger className="w-full" data-testid="select-next-stage">
                                <SelectValue placeholder="Select next stage..." />
                              </SelectTrigger>
                              <SelectContent>
                                {nextStagesData?.validNextStages?.map((stage) => (
                                  <SelectItem key={stage} value={stage}>
                                    {formatStageName(stage)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {stageTransitionMutation.isPending && (
                            <p className="text-xs text-blue-600 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Updating stage...
                            </p>
                          )}
                        </div>
                      )}

                      {/* Show stage progress */}
                      {nextStagesData?.stageFlow && (
                        <div className="mt-4 pt-3 border-t border-slate-200">
                          <Label className="text-xs text-muted-foreground block mb-2">Progress:</Label>
                          <div className="flex flex-wrap gap-1">
                            {nextStagesData.stageFlow.map((stage, idx) => {
                              const currentIdx = nextStagesData.stageFlow.indexOf(selectedRequest.stage || "intake");
                              const isPast = idx < currentIdx;
                              const isCurrent = stage === (selectedRequest.stage || "intake");
                              return (
                                <div
                                  key={stage}
                                  className={`text-xs px-2 py-0.5 rounded ${isCurrent
                                    ? "bg-blue-600 text-white font-medium"
                                    : isPast
                                      ? "bg-green-100 text-green-700"
                                      : "bg-gray-100 text-gray-500"
                                    }`}
                                >
                                  {formatStageName(stage)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Expected dates based on service mode */}
                      {selectedRequest.serviceMode && (
                        <div className="mt-4 pt-3 border-t border-slate-200 space-y-3">
                          <Label className="text-xs font-medium text-slate-600 block">Expected Dates</Label>

                          {selectedRequest.serviceMode === "pickup" ? (
                            <>
                              {/* Pickup mode: Expected pickup and return dates */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">
                                    <Calendar className="w-3 h-3 inline mr-1" />
                                    Pickup Date
                                  </Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs">
                                        {selectedRequest.expectedPickupDate
                                          ? format(new Date(selectedRequest.expectedPickupDate), "MMM d, yyyy")
                                          : "Set date..."}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent
                                        mode="single"
                                        selected={selectedRequest.expectedPickupDate ? new Date(selectedRequest.expectedPickupDate) : undefined}
                                        onSelect={(date) => {
                                          if (date) {
                                            expectedDatesMutation.mutate({
                                              id: selectedRequest.id,
                                              data: { expectedPickupDate: date.toISOString() }
                                            });
                                          }
                                        }}
                                        disabled={(date) => date < new Date()}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground block mb-1">
                                    <Calendar className="w-3 h-3 inline mr-1" />
                                    Return Date
                                  </Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs">
                                        {selectedRequest.expectedReturnDate
                                          ? format(new Date(selectedRequest.expectedReturnDate), "MMM d, yyyy")
                                          : "Set date..."}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent
                                        mode="single"
                                        selected={selectedRequest.expectedReturnDate ? new Date(selectedRequest.expectedReturnDate) : undefined}
                                        onSelect={(date) => {
                                          if (date) {
                                            expectedDatesMutation.mutate({
                                              id: selectedRequest.id,
                                              data: { expectedReturnDate: date.toISOString() }
                                            });
                                          }
                                        }}
                                        disabled={(date) => date < new Date()}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Service center mode: Expected ready date */}
                              <div>
                                <Label className="text-xs text-muted-foreground block mb-1">
                                  <Calendar className="w-3 h-3 inline mr-1" />
                                  Ready for Pickup Date
                                </Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="w-full justify-start text-left text-xs">
                                      {selectedRequest.expectedReadyDate
                                        ? format(new Date(selectedRequest.expectedReadyDate), "MMM d, yyyy")
                                        : "Set date..."}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                      mode="single"
                                      selected={selectedRequest.expectedReadyDate ? new Date(selectedRequest.expectedReadyDate) : undefined}
                                      onSelect={(date) => {
                                        if (date) {
                                          expectedDatesMutation.mutate({
                                            id: selectedRequest.id,
                                            data: { expectedReadyDate: date.toISOString() }
                                          });
                                        }
                                      }}
                                      disabled={(date) => date < new Date()}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </>
                          )}

                          {expectedDatesMutation.isPending && (
                            <p className="text-xs text-blue-600 flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Saving date...
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-muted-foreground mb-2 block">Internal Status</Label>
                      {isInternalBlocked && !isClosedState && (
                        <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                          {quoteBlocked
                            ? "Internal status locked until quote is sent to customer"
                            : isServiceCenter
                              ? "Internal status locked until customer tracking shows 'Queued' (device at service center)"
                              : "Internal status locked until customer tracking shows 'Received' (device picked up)"}
                        </div>
                      )}
                      {isConverted && !isClosedState && (
                        <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded-md text-xs text-green-700">
                          <CheckCircle className="w-3 h-3 inline mr-1" />
                          Converted to job - customer tracking job statuses are now unlocked
                        </div>
                      )}
                      <Select
                        value={pendingChanges?.status || selectedRequest.status}
                        onValueChange={handleInternalStatusWithConfirm}
                        disabled={isInternalBlocked}
                      >
                        <SelectTrigger className="w-full" data-testid="update-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem
                            value="Pending"
                            disabled={isInternalStatusDisabled("Pending", selectedRequest.status)}
                            className={isInternalStatusDisabled("Pending", selectedRequest.status) ? "text-muted-foreground line-through opacity-50" : ""}
                          >
                            Pending
                          </SelectItem>
                          <SelectItem
                            value="Reviewed"
                            disabled={isInternalStatusDisabled("Reviewed", selectedRequest.status)}
                            className={isInternalStatusDisabled("Reviewed", selectedRequest.status) ? "text-muted-foreground line-through opacity-50" : ""}
                          >
                            Reviewed
                          </SelectItem>
                          <SelectItem
                            value="Converted"
                            disabled={isInternalStatusDisabled("Converted", selectedRequest.status)}
                            className={isInternalStatusDisabled("Converted", selectedRequest.status) ? "text-muted-foreground line-through opacity-50" : ""}
                          >
                            Converted to Job
                          </SelectItem>
                          <SelectItem
                            value="Closed"
                            disabled={isInternalStatusDisabled("Closed", selectedRequest.status)}
                            className={isInternalStatusDisabled("Closed", selectedRequest.status) ? "text-muted-foreground line-through opacity-50" : ""}
                          >
                            Closed
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Status can only move forward in the workflow</p>
                      {selectedRequest.status === "Converted" && selectedRequest.convertedJobId && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                          <p className="text-sm text-green-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Job Created: <a href={`/admin/jobs?highlight=${selectedRequest.convertedJobId}`} className="font-medium underline hover:text-green-800">{selectedRequest.convertedJobId}</a>
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-muted-foreground mb-2 block">
                        Customer Tracking Status
                        {(selectedRequest.servicePreference === "service_center" || selectedRequest.servicePreference === "center") && (
                          <Badge variant="outline" className="ml-2 text-xs">Service Center Visit</Badge>
                        )}
                      </Label>
                      {isTrackingBlocked && !isClosedState && quoteBlocked && (
                        <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                          Customer tracking locked until quote is sent to customer
                        </div>
                      )}
                      {!isTrackingBlocked && !isConverted && (
                        <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Pre-job statuses available. Job-related statuses require converting to job first.
                        </div>
                      )}
                      {!isTrackingBlocked && isConverted && !hasTechnicianAssigned && (
                        <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                          <AlertTriangle className="w-3 h-3 inline mr-1" />
                          Job created but no technician assigned. Assign a technician to the <a href={`/admin/jobs?highlight=${selectedRequest.convertedJobId}`} className="font-medium underline">job ticket</a> to unlock job-related statuses.
                        </div>
                      )}
                      <Select
                        value={pendingChanges?.trackingStatus || selectedRequest.trackingStatus}
                        onValueChange={handleTrackingStatusWithConfirm}
                        disabled={isTrackingBlocked}
                      >
                        <SelectTrigger className="w-full" data-testid="update-tracking-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const isServiceCenterMode = selectedRequest.servicePreference === "service_center" || selectedRequest.servicePreference === "center";
                            const currentStatus = selectedRequest.trackingStatus;
                            const statusFlow = getTrackingStatusFlow(selectedRequest.servicePreference);

                            // Job statuses require both conversion AND technician assignment
                            const jobStatusBlocked = !canUseJobStatuses;
                            const jobStatusHint = !isConverted ? " (Requires job)" : (!hasTechnicianAssigned ? " (Assign technician)" : "");

                            if (isServiceCenterMode) {
                              return (
                                <>
                                  <SelectItem
                                    value="Awaiting Drop-off"
                                    disabled={isStatusDisabled("Awaiting Drop-off", currentStatus, statusFlow)}
                                    className={isStatusDisabled("Awaiting Drop-off", currentStatus, statusFlow) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Awaiting Drop-off
                                  </SelectItem>
                                  <SelectItem
                                    value="Queued"
                                    disabled={isStatusDisabled("Queued", currentStatus, statusFlow)}
                                    className={isStatusDisabled("Queued", currentStatus, statusFlow) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Queued (Waiting at Service Center)
                                  </SelectItem>
                                  <SelectItem
                                    value="Technician Assigned"
                                    disabled={isStatusDisabled("Technician Assigned", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Technician Assigned", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Technician Assigned{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Diagnosis Completed"
                                    disabled={isStatusDisabled("Diagnosis Completed", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Diagnosis Completed", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Diagnosis Completed{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Parts Pending"
                                    disabled={isStatusDisabled("Parts Pending", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Parts Pending", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Parts Pending{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Repairing"
                                    disabled={isStatusDisabled("Repairing", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Repairing", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Repairing{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Ready for Delivery"
                                    disabled={isStatusDisabled("Ready for Delivery", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Ready for Delivery", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Ready for Pickup{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Delivered"
                                    disabled={isStatusDisabled("Delivered", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Delivered", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Delivered{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem value="Cancelled" className="text-red-600">Cancelled</SelectItem>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <SelectItem
                                    value="Request Received"
                                    disabled={isStatusDisabled("Request Received", currentStatus, statusFlow)}
                                    className={isStatusDisabled("Request Received", currentStatus, statusFlow) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Request Received
                                  </SelectItem>
                                  <SelectItem
                                    value="Arriving to Receive"
                                    disabled={isStatusDisabled("Arriving to Receive", currentStatus, statusFlow)}
                                    className={isStatusDisabled("Arriving to Receive", currentStatus, statusFlow) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Arriving to Receive
                                  </SelectItem>
                                  <SelectItem
                                    value="Received"
                                    disabled={isStatusDisabled("Received", currentStatus, statusFlow)}
                                    className={isStatusDisabled("Received", currentStatus, statusFlow) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Received (TV at Service Center)
                                  </SelectItem>
                                  <SelectItem
                                    value="Technician Assigned"
                                    disabled={isStatusDisabled("Technician Assigned", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Technician Assigned", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Technician Assigned{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Diagnosis Completed"
                                    disabled={isStatusDisabled("Diagnosis Completed", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Diagnosis Completed", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Diagnosis Completed{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Parts Pending"
                                    disabled={isStatusDisabled("Parts Pending", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Parts Pending", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Parts Pending{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Repairing"
                                    disabled={isStatusDisabled("Repairing", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Repairing", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Repairing{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Ready for Delivery"
                                    disabled={isStatusDisabled("Ready for Delivery", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Ready for Delivery", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Ready for Delivery{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem
                                    value="Delivered"
                                    disabled={isStatusDisabled("Delivered", currentStatus, statusFlow) || jobStatusBlocked}
                                    className={(isStatusDisabled("Delivered", currentStatus, statusFlow) || jobStatusBlocked) ? "text-muted-foreground line-through opacity-50" : ""}
                                  >
                                    Delivered{jobStatusHint}
                                  </SelectItem>
                                  <SelectItem value="Cancelled" className="text-red-600">Cancelled</SelectItem>
                                </>
                              );
                            }
                          })()}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">This is what the customer sees. Status can only move forward.</p>

                      {(pendingChanges?.trackingStatus === "Arriving to Receive" || pendingChanges?.trackingStatus === "Awaiting Drop-off") && (
                        <div className={`mt-3 p-3 rounded-md border ${pendingChanges?.scheduledPickupDate ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-300"}`}>
                          <Label className={`text-sm font-medium mb-2 block ${pendingChanges?.scheduledPickupDate ? "text-green-800" : "text-amber-800"}`}>
                            <Calendar className="w-4 h-4 inline mr-1" />
                            {pendingChanges?.trackingStatus === "Arriving to Receive" ? "Scheduled Pickup Date" : "Expected Drop-off Date"}
                            {!pendingChanges?.scheduledPickupDate && (
                              <span className="ml-2 text-xs font-normal text-amber-600">(Required - Please set a date!)</span>
                            )}
                          </Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant={pendingChanges?.scheduledPickupDate ? "outline" : "default"}
                                className={`w-full justify-start text-left font-normal ${!pendingChanges?.scheduledPickupDate ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse" : ""}`}
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                {pendingChanges?.scheduledPickupDate
                                  ? format(new Date(pendingChanges.scheduledPickupDate), "EEEE, MMMM d, yyyy")
                                  : "Click to select date..."}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={pendingChanges?.scheduledPickupDate || undefined}
                                onSelect={(date) => {
                                  if (date && pendingChanges) {
                                    setPendingChanges({ ...pendingChanges, scheduledPickupDate: date });
                                  }
                                }}
                                disabled={(date) => date < new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <p className={`text-xs mt-1 ${pendingChanges?.scheduledPickupDate ? "text-green-600" : "text-amber-600"}`}>
                            {pendingChanges?.scheduledPickupDate
                              ? "Customer can see this date in their tracking"
                              : "Customer is waiting to see this date!"
                            }
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-muted-foreground mb-2 block">Payment Status</Label>
                      <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-md border">
                        {(selectedRequest.paymentStatus || "Due") === "Paid" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle className="w-3 h-3 mr-1" /> Paid
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <Clock className="w-3 h-3 mr-1" /> Due
                          </Badge>
                        )}
                        {selectedRequest.convertedJobId ? (
                          <p className="text-xs text-muted-foreground">
                            Payment status is linked to the{" "}
                            <a href={`/admin/pos?jobId=${selectedRequest.convertedJobId}`} className="text-primary underline hover:text-primary/80">
                              POS invoice
                            </a>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Auto-updates when invoice is generated from Job Ticket
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog}>
              Close
            </Button>
            <Button
              onClick={handleSaveChanges}
              disabled={!hasUnsavedChanges() || updateMutation.isPending || selectedRequest?.quoteStatus === "Declined"}
              data-testid="button-update-service-request"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Update
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Service Request</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this request? This action cannot be undone.</p>
          <p className="text-sm text-muted-foreground">
            Ticket: {requestToDelete?.ticketNumber}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              data-testid="confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showStatusConfirmDialog} onOpenChange={setShowStatusConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Status Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusChange?.message}
              <br /><br />
              <strong>Note:</strong> Once changed, you cannot revert to a previous status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowStatusConfirmDialog(false);
              setPendingStatusChange(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>
              Yes, Change Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showQuotePriceDialog} onOpenChange={setShowQuotePriceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Send Quote Price
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ticket:</span>
                  <span className="font-mono font-medium">{selectedRequest.ticketNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer:</span>
                  <span>{selectedRequest.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Device:</span>
                  <span>{selectedRequest.brand} {selectedRequest.screenSize ? `${selectedRequest.screenSize}"` : ""}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Issue:</span>
                  <span>{selectedRequest.primaryIssue}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quoteAmount">Quote Amount (BDT) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{getCurrencySymbol()}</span>
                  <Input
                    id="quoteAmount"
                    type="number"
                    placeholder="Enter price"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="pl-8"
                    data-testid="input-quote-amount"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quoteNotes">Notes for Customer (Optional)</Label>
                <Textarea
                  id="quoteNotes"
                  placeholder="Add any details about the repair, parts needed, etc."
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  rows={3}
                  data-testid="input-quote-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuotePriceDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendQuote}
              disabled={!quoteAmount || quotePriceMutation.isPending}
              data-testid="button-send-quote-confirm"
            >
              {quotePriceMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Quote
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDateDialog} onOpenChange={setShowScheduleDateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {pendingTrackingStatus === "Arriving to Receive"
                ? "Schedule Pickup Date"
                : "Set Drop-off Deadline"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingTrackingStatus === "Arriving to Receive"
                ? "Select the date when our team will arrive to collect the TV from the customer."
                : "Select the deadline by which the customer should bring their TV to the service center."}
            </p>

            <div className="flex justify-center">
              <CalendarComponent
                mode="single"
                selected={scheduledDate}
                onSelect={setScheduledDate}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </div>

            {scheduledDate && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
                <p className="text-sm text-blue-800">
                  Selected: <span className="font-bold">{format(scheduledDate, "EEEE, MMMM d, yyyy")}</span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowScheduleDateDialog(false);
              setPendingTrackingStatus(null);
              setScheduledDate(undefined);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest && pendingTrackingStatus && scheduledDate) {
                  updateMutation.mutate({
                    id: selectedRequest.id,
                    data: {
                      trackingStatus: pendingTrackingStatus,
                      scheduledPickupDate: scheduledDate.toISOString()
                    } as any
                  });
                  setSelectedRequest({
                    ...selectedRequest,
                    trackingStatus: pendingTrackingStatus,
                    scheduledPickupDate: scheduledDate
                  } as ServiceRequest);
                  setShowScheduleDateDialog(false);
                  setPendingTrackingStatus(null);
                  setScheduledDate(undefined);
                  toast.success(`Status updated with scheduled date: ${format(scheduledDate, "MMM d, yyyy")}`);
                }
              }}
              disabled={!scheduledDate || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirm & Update
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MediaViewer
        urls={currentMediaUrls}
        initialIndex={mediaViewerIndex}
        isOpen={mediaViewerOpen}
        onClose={() => setMediaViewerOpen(false)}
      />
    </>
  );
}
