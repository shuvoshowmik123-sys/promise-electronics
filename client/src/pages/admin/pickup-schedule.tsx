import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Truck, Calendar as CalendarIcon, Clock, MapPin, User, Loader2, CheckCircle, Package, Zap, AlertTriangle, RefreshCw, Eye } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminPickupsApi, serviceRequestsApi } from "@/lib/api";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { PickupSchedule } from "@shared/schema";

type PickupWithServiceRequest = PickupSchedule & {
  serviceRequest?: {
    id: string;
    brand?: string;
    customerName?: string;
    phone?: string;
  };
};

export default function AdminPickupSchedulePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [selectedPickup, setSelectedPickup] = useState<PickupWithServiceRequest | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [assignedStaff, setAssignedStaff] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [sseSupported, setSseSupported] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseConnectedRef = useRef(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    let connectionTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      if (!mounted) return;

      try {
        const eventSource = new EventSource("/api/admin/events", { withCredentials: true });
        eventSourceRef.current = eventSource;
        sseConnectedRef.current = false;

        connectionTimeout = setTimeout(() => {
          if (!sseConnectedRef.current && mounted) {
            eventSource.close();
            setSseSupported(false);
          }
        }, 5000);

        eventSource.onopen = () => {
          if (mounted) {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            sseConnectedRef.current = true;
            setSseSupported(true);
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "pickup_updated" || data.type === "service_request_updated") {
              queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            }
          } catch (e) {
            console.error("SSE parse error:", e);
          }
        };

        eventSource.onerror = () => {
          if (connectionTimeout) clearTimeout(connectionTimeout);
          eventSource.close();
          sseConnectedRef.current = false;
          if (mounted) {
            setSseSupported(false);
          }
        };
      } catch (e) {
        console.error("SSE connection failed:", e);
        setSseSupported(false);
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  const { data: pickups = [], isLoading, refetch } = useQuery({
    queryKey: ["adminPickups", filterStatus],
    queryFn: () => filterStatus === "all" 
      ? adminPickupsApi.getAll() 
      : adminPickupsApi.getAll(filterStatus),
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: serviceRequests = [] } = useQuery({
    queryKey: ["serviceRequests"],
    queryFn: () => serviceRequestsApi.getAll(),
  });

  const updatePickupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PickupSchedule> }) =>
      adminPickupsApi.update(id, data),
    onSuccess: () => {
      toast.success("Pickup schedule updated successfully");
      queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
      setScheduleDialogOpen(false);
      setSelectedPickup(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update pickup schedule");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminPickupsApi.updateStatus(id, status),
    onSuccess: () => {
      toast.success("Status updated successfully");
      queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  const enrichedPickups: PickupWithServiceRequest[] = pickups.map(pickup => {
    const sr = serviceRequests.find(r => r.id === pickup.serviceRequestId);
    return {
      ...pickup,
      serviceRequest: sr ? {
        id: sr.id,
        brand: sr.brand,
        customerName: sr.customerName,
        phone: sr.phone,
      } : undefined,
    };
  });

  const filteredPickups = enrichedPickups.filter(pickup => {
    const matchesSearch =
      searchQuery === "" ||
      pickup.serviceRequest?.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pickup.serviceRequest?.phone?.includes(searchQuery) ||
      pickup.serviceRequestId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pickup.pickupAddress?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTier = filterTier === "all" || pickup.tier === filterTier;

    return matchesSearch && matchesTier;
  });

  const pendingCount = enrichedPickups.filter(p => p.status === "Pending").length;
  const scheduledCount = enrichedPickups.filter(p => p.status === "Scheduled").length;
  const pickedUpCount = enrichedPickups.filter(p => p.status === "PickedUp").length;
  const deliveredCount = enrichedPickups.filter(p => p.status === "Delivered").length;

  const regularCount = enrichedPickups.filter(p => p.tier === "Regular").length;
  const priorityCount = enrichedPickups.filter(p => p.tier === "Priority").length;
  const emergencyCount = enrichedPickups.filter(p => p.tier === "Emergency").length;

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "Emergency":
        return <Badge variant="destructive" className="flex items-center gap-1"><Zap className="w-3 h-3" /> Emergency</Badge>;
      case "Priority":
        return <Badge className="bg-orange-500 hover:bg-orange-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Priority</Badge>;
      default:
        return <Badge variant="outline" className="flex items-center gap-1"><Package className="w-3 h-3" /> Regular</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "Scheduled":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><CalendarIcon className="w-3 h-3 mr-1" /> Scheduled</Badge>;
      case "PickedUp":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Truck className="w-3 h-3 mr-1" /> Picked Up</Badge>;
      case "Delivered":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><CheckCircle className="w-3 h-3 mr-1" /> Delivered</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleOpenScheduleDialog = (pickup: PickupWithServiceRequest) => {
    setSelectedPickup(pickup);
    setScheduledDate(pickup.scheduledDate ? new Date(pickup.scheduledDate) : undefined);
    setAssignedStaff(pickup.assignedStaff || "");
    setPickupNotes(pickup.pickupNotes || "");
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = () => {
    if (!selectedPickup) return;
    updatePickupMutation.mutate({
      id: selectedPickup.id,
      data: {
        scheduledDate: scheduledDate || null,
        assignedStaff: assignedStaff || null,
        pickupNotes: pickupNotes || null,
        status: scheduledDate ? "Scheduled" : selectedPickup.status,
      } as any,
    });
  };

  const handleStatusChange = (pickupId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: pickupId, status: newStatus });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pickup & Delivery Schedule</h1>
            <p className="text-muted-foreground">
              Manage device pickup and delivery appointments
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sseSupported && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                Live
              </Badge>
            )}
            <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-pickups">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Scheduling</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">{pendingCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Scheduled</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{scheduledCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Picked Up</CardDescription>
              <CardTitle className="text-2xl text-green-600">{pickedUpCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Delivered</CardDescription>
              <CardTitle className="text-2xl text-purple-600">{deliveredCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle>By Tier</CardTitle>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4" /> Regular: {regularCount}
                </span>
                <span className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="w-4 h-4" /> Priority: {priorityCount}
                </span>
                <span className="flex items-center gap-2 text-red-600">
                  <Zap className="w-4 h-4" /> Emergency: {emergencyCount}
                </span>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by customer name, phone, or address..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-pickups"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]" data-testid="select-filter-status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Scheduled">Scheduled</SelectItem>
              <SelectItem value="PickedUp">Picked Up</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTier} onValueChange={setFilterTier}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-tier">
              <SelectValue placeholder="Filter by tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="Regular">Regular</SelectItem>
              <SelectItem value="Priority">Priority</SelectItem>
              <SelectItem value="Emergency">Emergency</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-pickups">All ({enrichedPickups.length})</TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending-pickups">Needs Scheduling ({pendingCount})</TabsTrigger>
            <TabsTrigger value="today" data-testid="tab-today-pickups">Today's Pickups</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <PickupTable
              pickups={filteredPickups}
              isLoading={isLoading}
              getTierBadge={getTierBadge}
              getStatusBadge={getStatusBadge}
              onSchedule={handleOpenScheduleDialog}
              onView={(pickup) => { setSelectedPickup(pickup); setViewDialogOpen(true); }}
              onStatusChange={handleStatusChange}
            />
          </TabsContent>

          <TabsContent value="pending">
            <PickupTable
              pickups={filteredPickups.filter(p => p.status === "Pending")}
              isLoading={isLoading}
              getTierBadge={getTierBadge}
              getStatusBadge={getStatusBadge}
              onSchedule={handleOpenScheduleDialog}
              onView={(pickup) => { setSelectedPickup(pickup); setViewDialogOpen(true); }}
              onStatusChange={handleStatusChange}
            />
          </TabsContent>

          <TabsContent value="today">
            <PickupTable
              pickups={filteredPickups.filter(p => {
                if (!p.scheduledDate) return false;
                const today = new Date();
                const schedDate = new Date(p.scheduledDate);
                return schedDate.toDateString() === today.toDateString();
              })}
              isLoading={isLoading}
              getTierBadge={getTierBadge}
              getStatusBadge={getStatusBadge}
              onSchedule={handleOpenScheduleDialog}
              onView={(pickup) => { setSelectedPickup(pickup); setViewDialogOpen(true); }}
              onStatusChange={handleStatusChange}
            />
          </TabsContent>
        </Tabs>

        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Pickup</DialogTitle>
              <DialogDescription>
                Set the pickup date and assign staff for this appointment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {selectedPickup?.serviceRequest && (
                <div className="bg-muted p-3 rounded-lg space-y-1">
                  <p className="font-medium">{selectedPickup.serviceRequest.customerName}</p>
                  <p className="text-sm text-muted-foreground">{selectedPickup.serviceRequest.phone}</p>
                  <p className="text-sm">{selectedPickup.serviceRequest.brand}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Pickup Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledDate ? format(scheduledDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Assigned Staff</Label>
                <Input
                  value={assignedStaff}
                  onChange={(e) => setAssignedStaff(e.target.value)}
                  placeholder="Enter staff name"
                  data-testid="input-assigned-staff"
                />
              </div>
              <div className="space-y-2">
                <Label>Pickup Notes</Label>
                <Textarea
                  value={pickupNotes}
                  onChange={(e) => setPickupNotes(e.target.value)}
                  placeholder="Add any special instructions..."
                  data-testid="textarea-pickup-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveSchedule}
                disabled={updatePickupMutation.isPending}
                data-testid="button-save-schedule"
              >
                {updatePickupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pickup Details</DialogTitle>
            </DialogHeader>
            {selectedPickup && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  {getTierBadge(selectedPickup.tier)}
                  {getStatusBadge(selectedPickup.status)}
                </div>
                {selectedPickup.serviceRequest && (
                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{selectedPickup.serviceRequest.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedPickup.pickupAddress || "No address"}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Request ID: {selectedPickup.serviceRequestId}
                    </div>
                  </div>
                )}
                {selectedPickup.scheduledDate && (
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                    <span>Scheduled: {format(new Date(selectedPickup.scheduledDate), "PPP")}</span>
                  </div>
                )}
                {selectedPickup.assignedStaff && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>Staff: {selectedPickup.assignedStaff}</span>
                  </div>
                )}
                {selectedPickup.pickupNotes && (
                  <div className="bg-yellow-50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">Notes:</p>
                    <p className="text-sm">{selectedPickup.pickupNotes}</p>
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  Tier Cost: ৳{selectedPickup.tierCost}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={() => { setViewDialogOpen(false); handleOpenScheduleDialog(selectedPickup!); }}>
                Edit Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

interface PickupTableProps {
  pickups: PickupWithServiceRequest[];
  isLoading: boolean;
  getTierBadge: (tier: string) => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
  onSchedule: (pickup: PickupWithServiceRequest) => void;
  onView: (pickup: PickupWithServiceRequest) => void;
  onStatusChange: (id: string, status: string) => void;
}

function PickupTable({ pickups, isLoading, getTierBadge, getStatusBadge, onSchedule, onView, onStatusChange }: PickupTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pickups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Truck className="w-12 h-12 mb-4 opacity-50" />
        <p>No pickups found</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pickups.map((pickup) => (
            <TableRow key={pickup.id} data-testid={`row-pickup-${pickup.id}`}>
              <TableCell>
                <div>
                  <p className="font-medium">{pickup.serviceRequest?.customerName || "Unknown"}</p>
                  <p className="text-sm text-muted-foreground">{pickup.serviceRequest?.phone}</p>
                </div>
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {pickup.pickupAddress || "—"}
              </TableCell>
              <TableCell>{getTierBadge(pickup.tier)}</TableCell>
              <TableCell>
                {pickup.scheduledDate 
                  ? format(new Date(pickup.scheduledDate), "MMM d, yyyy")
                  : <span className="text-muted-foreground">Not set</span>
                }
              </TableCell>
              <TableCell>{getStatusBadge(pickup.status)}</TableCell>
              <TableCell>{pickup.assignedStaff || "—"}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView(pickup)}
                    data-testid={`button-view-pickup-${pickup.id}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {pickup.status === "Pending" && (
                    <Button
                      size="sm"
                      onClick={() => onSchedule(pickup)}
                      data-testid={`button-schedule-pickup-${pickup.id}`}
                    >
                      <CalendarIcon className="w-4 h-4 mr-1" />
                      Schedule
                    </Button>
                  )}
                  {pickup.status === "Scheduled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(pickup.id, "PickedUp")}
                      data-testid={`button-mark-pickedup-${pickup.id}`}
                    >
                      <Truck className="w-4 h-4 mr-1" />
                      Mark Picked Up
                    </Button>
                  )}
                  {pickup.status === "PickedUp" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(pickup.id, "Delivered")}
                      data-testid={`button-mark-delivered-${pickup.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Mark Delivered
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
