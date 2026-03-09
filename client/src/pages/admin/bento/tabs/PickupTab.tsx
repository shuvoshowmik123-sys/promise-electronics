import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Clock, Calendar, Truck, Search, Briefcase, MoreVertical, Eye,
    CheckCircle, User, Zap, AlertCircle, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { adminPickupsApi, serviceRequestsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BentoCard, DashboardSkeleton } from "../shared";
import type { PickupSchedule } from "@shared/schema";

type PickupWithServiceRequest = PickupSchedule & {
    serviceRequest?: {
        id: string;
        brand?: string;
        customerName?: string;
        phone?: string;
    };
};

export default function PickupTab() {
    const queryClient = useQueryClient();
    const [pickupSearchQuery, setPickupSearchQuery] = useState("");
    const [pickupFilterStatus, setPickupFilterStatus] = useState("all");
    const [pickupFilterTier, setPickupFilterTier] = useState("all");

    // Dialog States
    const [selectedPickup, setSelectedPickup] = useState<PickupWithServiceRequest | null>(null);
    const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);

    // Form States
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
    const [assignedStaff, setAssignedStaff] = useState("");
    const [pickupNotes, setPickupNotes] = useState("");

    const { data: serviceRequestsData } = useQuery({
        queryKey: ["service-requests"],
        queryFn: () => serviceRequestsApi.getAll()
    });

    const { data: pickupsData, isLoading: isPickupsLoading } = useQuery({
        queryKey: ["adminPickups"],
        queryFn: () => adminPickupsApi.getAll()
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

    if (isPickupsLoading) return <DashboardSkeleton />;

    const serviceRequests = serviceRequestsData?.items || [];
    const rawPickups = pickupsData || [];

    const enrichedPickups: PickupWithServiceRequest[] = rawPickups.map((pickup: any) => {
        const sr = serviceRequests.find((r: any) => r.id === pickup.serviceRequestId);
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

    const pickups = enrichedPickups.filter(pickup => {
        const matchesSearch =
            pickupSearchQuery === "" ||
            pickup.serviceRequest?.customerName?.toLowerCase().includes(pickupSearchQuery.toLowerCase()) ||
            pickup.serviceRequest?.phone?.includes(pickupSearchQuery) ||
            pickup.serviceRequestId.toLowerCase().includes(pickupSearchQuery.toLowerCase()) ||
            pickup.pickupAddress?.toLowerCase().includes(pickupSearchQuery.toLowerCase());

        const matchesStatus = pickupFilterStatus === "all" || pickup.status === pickupFilterStatus;
        const matchesTier = pickupFilterTier === "all" || pickup.tier === pickupFilterTier;

        return matchesSearch && matchesStatus && matchesTier;
    });

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case "Emergency":
                return <Badge variant="destructive" className="flex items-center gap-1"><Zap className="w-3 h-3" /> Emergency</Badge>;
            case "Priority":
                return <Badge className="bg-orange-500 hover:bg-orange-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Priority</Badge>;
            default:
                return <Badge variant="outline" className="flex items-center gap-1 text-slate-600 border-slate-200"><Package className="w-3 h-3" /> Regular</Badge>;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Pending":
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
            case "Scheduled":
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Calendar className="w-3 h-3 mr-1" /> Scheduled</Badge>;
            case "PickedUp":
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><Truck className="w-3 h-3 mr-1" /> Picked Up</Badge>;
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-cyan-500 to-blue-600" title="Pending Pickups" icon={<Clock size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{pickups.filter((p: any) => p.status === 'Pending').length}</div>
                    <div className="text-white/80 text-sm mt-2">Needs Scheduling</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-blue-500 to-indigo-600" title="Scheduled" icon={<Calendar size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{pickups.filter((p: any) => p.status === 'Scheduled').length}</div>
                    <div className="text-white/80 text-sm mt-2">Upcoming</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-2 h-full min-h-[200px] bg-gradient-to-br from-purple-500 to-fuchsia-600" title="Completed" icon={<Truck size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex justify-between items-end">
                    <div>
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{pickups.filter((p: any) => ['PickedUp', 'Delivered'].includes(p.status)).length}</div>
                        <div className="text-white/80 text-sm mt-2">Total Completed</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white/90">{pickups.filter((p: any) => p.status === 'Delivered').length}</div>
                        <div className="text-white/60 text-xs">Delivered Successfully</div>
                    </div>
                </div>
            </BentoCard>

            <BentoCard className="col-span-1 md:col-span-4 min-h-[600px] bg-white border-slate-200 shadow-sm" title="Pickup Schedule" icon={<Truck size={24} className="text-blue-600" />} variant="ghost" disableHover>
                <div className="h-full flex flex-col p-4 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="relative flex-1 w-full md:w-auto">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                                placeholder="Search customer, phone, address..."
                                className="pl-10 bg-white border-slate-200"
                                value={pickupSearchQuery}
                                onChange={(e) => setPickupSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                            <Select value={pickupFilterStatus} onValueChange={setPickupFilterStatus}>
                                <SelectTrigger className="w-[140px] bg-white border-slate-200">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                                    <SelectItem value="PickedUp">Picked Up</SelectItem>
                                    <SelectItem value="Delivered">Delivered</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={pickupFilterTier} onValueChange={setPickupFilterTier}>
                                <SelectTrigger className="w-[140px] bg-white border-slate-200">
                                    <SelectValue placeholder="Tier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Tiers</SelectItem>
                                    <SelectItem value="Regular">Regular</SelectItem>
                                    <SelectItem value="Priority">Priority</SelectItem>
                                    <SelectItem value="Emergency">Emergency</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["adminPickups"] })} className="bg-white border-slate-200">
                                <Briefcase className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                        <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-white rounded-lg mb-2 sticky top-0 z-10 border-b border-slate-100">
                            <div className="col-span-3">Customer</div>
                            <div className="col-span-3">Address</div>
                            <div className="col-span-1">Tier</div>
                            <div className="col-span-2">Scheduled</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-1 text-right">Actions</div>
                        </div>
                        {pickups.map((pickup: any) => (
                            <div key={pickup.id} className="grid grid-cols-12 gap-4 items-center p-4 bg-white hover:bg-slate-50 rounded-xl transition-all group border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md">
                                <div className="col-span-3">
                                    <div className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">{pickup.serviceRequest?.customerName || "Unknown"}</div>
                                    <div className="text-xs text-slate-500">{pickup.serviceRequest?.phone}</div>
                                </div>
                                <div className="col-span-3 text-slate-600 text-xs truncate" title={pickup.pickupAddress}>
                                    {pickup.pickupAddress || "\u2014"}
                                </div>
                                <div className="col-span-1">
                                    {getTierBadge(pickup.tier)}
                                </div>
                                <div className="col-span-2 text-xs text-slate-500 font-mono">
                                    {pickup.scheduledDate ? (
                                        <div>
                                            <div className="font-medium text-slate-700">{format(new Date(pickup.scheduledDate), 'MMM d, yyyy')}</div>
                                            <div className="text-[10px] opacity-70">{format(new Date(pickup.scheduledDate), 'h:mm a')}</div>
                                        </div>
                                    ) : <span className="text-slate-400 italic">Not Set</span>}
                                </div>
                                <div className="col-span-2">
                                    {getStatusBadge(pickup.status)}
                                    {pickup.assignedStaff && <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><User className="w-3 h-3" /> {pickup.assignedStaff}</div>}
                                </div>
                                <div className="col-span-1 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <MoreVertical className="h-4 w-4 text-slate-400" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => { setSelectedPickup(pickup); setViewDialogOpen(true); }}>
                                                <Eye className="w-4 h-4 mr-2" /> View Details
                                            </DropdownMenuItem>
                                            {pickup.status === "Pending" && (
                                                <DropdownMenuItem onClick={() => handleOpenScheduleDialog(pickup)}>
                                                    <Calendar className="w-4 h-4 mr-2" /> Schedule
                                                </DropdownMenuItem>
                                            )}
                                            {pickup.status === "Scheduled" && (
                                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: pickup.id, status: "PickedUp" })}>
                                                    <Truck className="w-4 h-4 mr-2" /> Mark Picked Up
                                                </DropdownMenuItem>
                                            )}
                                            {pickup.status === "PickedUp" && (
                                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: pickup.id, status: "Delivered" })}>
                                                    <CheckCircle className="w-4 h-4 mr-2" /> Mark Delivered
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                        {pickups.length === 0 && (
                            <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                No pickups match your filters.
                            </div>
                        )}
                    </div>
                </div>

                {/* Dialogs */}
                <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Schedule Pickup</DialogTitle>
                            <DialogDescription>Set the pickup date and assign staff.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {selectedPickup?.serviceRequest && (
                                <div className="bg-slate-50 p-3 rounded-lg text-sm border border-slate-100">
                                    <p className="font-semibold text-slate-700">{selectedPickup.serviceRequest.customerName}</p>
                                    <p className="text-slate-500">{selectedPickup.serviceRequest.phone}</p>
                                    <p className="text-slate-500">{selectedPickup.serviceRequest.brand}</p>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>Pickup Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduledDate && "text-muted-foreground")}>
                                            <Calendar className="mr-2 h-4 w-4" />
                                            {scheduledDate ? format(scheduledDate, "PPP") : "Select date"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarUI
                                            mode="single"
                                            selected={scheduledDate}
                                            onSelect={(date) => setScheduledDate(date)}
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
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea
                                    value={pickupNotes}
                                    onChange={(e) => setPickupNotes(e.target.value)}
                                    placeholder="Special instructions..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveSchedule} disabled={updatePickupMutation.isPending}>
                                {updatePickupMutation.isPending ? "Saving..." : "Save Schedule"}
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
                                    <div className="bg-slate-50 p-4 rounded-lg space-y-2 border border-slate-100">
                                        <div className="flex items-center gap-2 text-sm text-slate-700">
                                            <User className="w-4 h-4 text-slate-400" />
                                            <span className="font-medium">{selectedPickup.serviceRequest.customerName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-700">
                                            <Truck className="w-4 h-4 text-slate-400" />
                                            <span>{selectedPickup.pickupAddress || "No address"}</span>
                                        </div>
                                    </div>
                                )}
                                {selectedPickup.scheduledDate && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        <span>Scheduled: {format(new Date(selectedPickup.scheduledDate), "PPP")}</span>
                                    </div>
                                )}
                                {selectedPickup.assignedStaff && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <User className="w-4 h-4 text-slate-400" />
                                        <span>Staff: {selectedPickup.assignedStaff}</span>
                                    </div>
                                )}
                                {selectedPickup.pickupNotes && (
                                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm">
                                        <p className="font-medium text-amber-800 mb-1">Notes:</p>
                                        <p className="text-amber-700">{selectedPickup.pickupNotes}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
                            <Button onClick={() => { setViewDialogOpen(false); handleOpenScheduleDialog(selectedPickup!); }}>
                                Edit Schedule
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </BentoCard>
        </div>
    );
}
