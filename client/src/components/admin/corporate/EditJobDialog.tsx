import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { corporateApi, inventoryApi } from "@/lib/api";
import { Loader2, Plus, X, AlertTriangle, Pencil, Check, ShieldCheck, Save, Settings } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Badge } from "@/components/ui/badge";
import { VoiceTextInput } from "@/components/ui/VoiceTextInput";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";

interface EditJobDialogProps {
    job: any;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    technicians: { id: string; name: string; role?: string }[];
}

interface ServiceLineItem {
    id: string;
    inventoryItemId: string;
    name: string;
    basePrice: number;
    customPrice: number; // Allow custom pricing per client
}

interface ProductLineItem {
    id: string;
    inventoryItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    isSerialized?: boolean;
    serialNumbers?: string[];
}

const PROBLEM_OPTIONS = [
    { value: "backlight", label: "Backlight Issue" },
    { value: "no_power", label: "No Power" },
    { value: "software", label: "Software Issue" },
    { value: "panel_damage", label: "Panel Damage" },
    { value: "board_repair", label: "Board Repair" },
    { value: "power_supply", label: "Power Supply" },
    { value: "mainboard", label: "Mainboard Issue" },
    { value: "tcon", label: "T-Con Board" },
    { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
    { value: "Pending", label: "Pending" },
    { value: "Diagnosing", label: "Diagnosing" },
    { value: "Pending Parts", label: "Pending Parts" },
    { value: "In Progress", label: "In Progress" },
    { value: "Ready", label: "Ready" },
    { value: "Delivered", label: "Delivered" },
];

export function EditJobDialog({ job, open, onOpenChange, technicians }: EditJobDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();
    const isSuperAdmin = user?.role === "Super Admin";

    // Form state
    const [status, setStatus] = useState(job?.status || "Pending");
    const [technician, setTechnician] = useState(job?.technician || "");
    const [assignedTechnicianId, setAssignedTechnicianId] = useState<string | null>(job?.assignedTechnicianId || null);
    const [assistedByIds, setAssistedByIds] = useState<string[]>(job?.assistedByIds || []);
    const [problemsFound, setProblemsFound] = useState<string[]>([]);
    const [otherProblemText, setOtherProblemText] = useState("");
    const [notes, setNotes] = useState(job?.notes || "");

    // Company Claim editing
    const [isEditingClaim, setIsEditingClaim] = useState(false);
    const [editedClaim, setEditedClaim] = useState(job?.reportedDefect || "");

    // Service types applied
    const [serviceLines, setServiceLines] = useState<ServiceLineItem[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<string>("");

    // Products/Parts used
    const [productLines, setProductLines] = useState<ProductLineItem[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>("");
    const [productQuantity, setProductQuantity] = useState(1);

    // Warranty
    const [warrantyDays, setWarrantyDays] = useState(30); // 1 month default
    const [gracePeriodDays, setGracePeriodDays] = useState(7); // 7 days grace default

    // Fetch inventory for services and products
    const { data: inventoryData } = useQuery({
        queryKey: ["inventory"],
        queryFn: () => inventoryApi.getAll(),
    });

    // Filter inventory into services and products
    const serviceItems = inventoryData?.filter((item: any) =>
        item.category?.toLowerCase().includes('service') ||
        item.type === 'service'
    ) || [];

    const productItems = inventoryData?.filter((item: any) =>
        !item.category?.toLowerCase().includes('service') &&
        item.type !== 'service' &&
        (item.stock || 0) > 0
    ) || [];

    // Sync form when job changes
    useEffect(() => {
        if (job) {
            setStatus(job.status || "Pending");
            setTechnician(job.technician || "");
            setAssignedTechnicianId(job.assignedTechnicianId || null);
            setAssistedByIds(job.assistedByIds || []);
            setEditedClaim(job.reportedDefect || "");

            // Parse problemFound
            const pf = (job as any).problemFound;
            if (pf) {
                const problems = typeof pf === 'string' ? pf.split(',').map((s: string) => s.trim()) : pf;
                // Check if there's an "other:" prefix for custom text
                const otherEntry = problems.find((p: string) => p.startsWith('other:'));
                if (otherEntry) {
                    setOtherProblemText(otherEntry.replace('other:', '').trim());
                    setProblemsFound(problems.filter((p: string) => !p.startsWith('other:')).concat(['other']));
                } else {
                    setProblemsFound(problems);
                    setOtherProblemText("");
                }
            } else {
                setProblemsFound([]);
                setOtherProblemText("");
            }

            setNotes(job.notes || "");

            // Parse existing service lines and product lines if stored
            if ((job as any).serviceLines) {
                try {
                    setServiceLines(JSON.parse((job as any).serviceLines));
                } catch { setServiceLines([]); }
            }
            if ((job as any).productLines) {
                try {
                    setProductLines(JSON.parse((job as any).productLines));
                } catch { setProductLines([]); }
            }

            // Warranty settings
            setWarrantyDays((job as any).warrantyDays || 30);
            setGracePeriodDays((job as any).gracePeriodDays || 7);
        }
    }, [job]);

    // Toggle problem selection
    const toggleProblem = (value: string) => {
        if (value === 'other' && problemsFound.includes('other')) {
            setOtherProblemText(""); // Clear other text when deselecting
        }
        setProblemsFound(prev =>
            prev.includes(value)
                ? prev.filter(p => p !== value)
                : [...prev, value]
        );
    };

    // Add service line
    const addServiceLine = () => {
        if (!selectedServiceId) return;
        const item = serviceItems.find((i: any) => i.id === selectedServiceId);
        if (!item) return;

        // Check if already added
        if (serviceLines.some(s => s.inventoryItemId === selectedServiceId)) {
            toast({ variant: "destructive", title: "Already added", description: "This service is already in the list." });
            return;
        }

        setServiceLines(prev => [...prev, {
            id: crypto.randomUUID(),
            inventoryItemId: item.id,
            name: item.name,
            basePrice: Number(item.price) || 0,
            customPrice: Number(item.price) || 0,
        }]);
        setSelectedServiceId("");
    };

    // Update service price
    const updateServicePrice = (lineId: string, newPrice: number) => {
        setServiceLines(prev => prev.map(s =>
            s.id === lineId ? { ...s, customPrice: newPrice } : s
        ));
    };

    // Remove service line
    const removeServiceLine = (lineId: string) => {
        setServiceLines(prev => prev.filter(s => s.id !== lineId));
    };

    // Add product line
    const addProductLine = () => {
        if (!selectedProductId || productQuantity < 1) return;
        const item = productItems.find((i: any) => i.id === selectedProductId);
        if (!item) return;

        // Check stock
        if ((item.stock || 0) < productQuantity) {
            toast({ variant: "destructive", title: "Insufficient stock", description: `Only ${item.stock} available.` });
            return;
        }

        // Check if already added - if so, update quantity (only if NOT serialized, or else allow it but we usually keep them combined)
        const existingIndex = productLines.findIndex(p => p.inventoryItemId === selectedProductId);
        if (existingIndex >= 0 && !item.isSerialized) {
            setProductLines(prev => prev.map((p, idx) =>
                idx === existingIndex
                    ? { ...p, quantity: p.quantity + productQuantity }
                    : p
            ));
        } else {
            setProductLines(prev => [...prev, {
                id: crypto.randomUUID(),
                inventoryItemId: item.id,
                name: item.name,
                quantity: productQuantity,
                unitPrice: Number(item.price) || 0,
                isSerialized: item.isSerialized ?? false,
                serialNumbers: Array(productQuantity).fill(""),
            }]);
        }
        setSelectedProductId("");
        setProductQuantity(1);
    };

    const updateProductSerial = (lineId: string, index: number, serial: string) => {
        setProductLines(prev => prev.map(p => {
            if (p.id !== lineId) return p;
            const newSerials = [...(p.serialNumbers || [])];
            newSerials[index] = serial;
            return { ...p, serialNumbers: newSerials };
        }));
    };

    // Remove product line
    const removeProductLine = (lineId: string) => {
        setProductLines(prev => prev.filter(p => p.id !== lineId));
    };

    // Calculate totals
    const serviceTotalBDT = serviceLines.reduce((sum, s) => sum + s.customPrice, 0);
    const productTotalBDT = productLines.reduce((sum, p) => sum + (p.unitPrice * p.quantity), 0);
    const grandTotalBDT = serviceTotalBDT + productTotalBDT;

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            return corporateApi.updateJob(job.id, data);
        },
        onSuccess: () => {
            toast({ title: "Job Updated", description: "Changes saved successfully." });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: error.message || "Failed to update job."
            });
        }
    });

    // Request claim change (for non-Super Admin)
    const requestClaimChangeMutation = useMutation({
        mutationFn: async (newClaim: string) => {
            // This would create an approval request
            const response = await fetch('/api/approvals/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'company_claim_change',
                    jobId: job.id,
                    jobNumber: job.corporateJobNumber || job.ticketNumber,
                    oldValue: job.reportedDefect,
                    newValue: newClaim,
                    requestedBy: user?.id,
                    requestedByName: user?.name,
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.message || 'Failed to submit request');
            }
            return response.json();
        },
        onSuccess: () => {
            toast({ title: "Request Submitted", description: "Super Admin will be notified to approve." });
            setIsEditingClaim(false);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Request Failed", description: error.message });
        }
    });

    const handleSave = () => {
        // Build problemFound string including "other:" prefix for custom text
        let problemFoundStr = problemsFound
            .filter((p: string) => p !== 'other')
            .join(', ');
        if (problemsFound.includes('other') && otherProblemText.trim()) {
            problemFoundStr += (problemFoundStr ? ', ' : '') + `other:${otherProblemText.trim()}`;
        }

        updateMutation.mutate({
            status,
            technician: technician || null,
            assignedTechnicianId,
            assistedByIds,
            problemFound: problemFoundStr,
            notes,
            // Store service and product lines as JSON
            serviceLines: JSON.stringify(serviceLines),
            productLines: JSON.stringify(productLines),
            estimatedCost: grandTotalBDT,
            warrantyDays,
            gracePeriodDays,
            // If Super Admin edited claim directly
            ...(isSuperAdmin && editedClaim !== job.reportedDefect ? { reportedDefect: editedClaim } : {}),
        });
    };

    if (!job) return null;

    return (
        <AnimatePresence>
            {open && job && (
                <div className="fixed inset-0 z-40 flex justify-end">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onOpenChange(false)}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="relative w-full sm:max-w-[600px] h-full bg-slate-50 shadow-2xl overflow-hidden flex flex-col z-10 border-l border-slate-200/50"
                    >
                        {/* Native Blue Header */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 sm:p-8 shrink-0 relative text-white">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-4 top-4 rounded-full text-white/70 hover:text-white hover:bg-white/20"
                                onClick={() => onOpenChange(false)}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                                    Edit Job Details
                                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-none font-mono tracking-wider">
                                        {job.corporateJobNumber}
                                    </Badge>
                                </h1>
                                <p className="mt-2 text-sm text-blue-100/90 font-medium">
                                    {job.device} • SN: {job.tvSerialNumber || "N/A"}
                                </p>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 px-4 sm:px-6 py-6">
                            <div className="grid gap-5">
                                {/* Bento Section: Status & Technician */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Assignment & Status
                                    </h3>
                                    <div className="grid gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-slate-600">Current Status</Label>
                                            <Select value={status} onValueChange={setStatus}>
                                                <SelectTrigger className="rounded-xl border-slate-200">
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STATUS_OPTIONS.map((opt) => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2 rounded-xl border border-slate-100 p-4 bg-slate-50/50">
                                            <TechnicianPicker
                                                users={technicians.map(t => ({ ...t, role: t.role || 'Technician' }))}
                                                assignedTechnicianId={assignedTechnicianId}
                                                assistedByIds={assistedByIds}
                                                onAssignedChange={(id, name) => {
                                                    setAssignedTechnicianId(id);
                                                    setTechnician(name);
                                                }}
                                                onAssistedChange={setAssistedByIds}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Bento Section: Core Problems & Claim */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-orange-500" /> Diagnostics & Claim
                                    </h3>

                                    <div className="space-y-5">
                                        {/* Company Claim */}
                                        <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-slate-600 flex items-center gap-2 font-medium">
                                                    Corporate Client Claim
                                                    {!isSuperAdmin && <Badge variant="outline" className="text-[10px] bg-white">Read-only</Badge>}
                                                </Label>
                                                {isSuperAdmin ? (
                                                    <Button variant="ghost" size="sm" onClick={() => setIsEditingClaim(!isEditingClaim)} className="h-8 text-blue-600">
                                                        <Pencil className="h-3 w-3 mr-1" />
                                                        {isEditingClaim ? 'Cancel' : 'Modify'}
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-orange-600 h-8 hover:bg-orange-50"
                                                        onClick={() => setIsEditingClaim(!isEditingClaim)}
                                                    >
                                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                                        Request Override
                                                    </Button>
                                                )}
                                            </div>

                                            {isEditingClaim ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={editedClaim}
                                                        onChange={(e) => setEditedClaim(e.target.value)}
                                                        className="rounded-xl"
                                                        rows={2}
                                                    />
                                                    {!isSuperAdmin && (
                                                        <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                                                            <AlertTriangle className="h-4 w-4 shrink-0" />
                                                            <span>Changes require Super Admin approval.</span>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="ml-auto bg-white"
                                                                onClick={() => requestClaimChangeMutation.mutate(editedClaim)}
                                                                disabled={requestClaimChangeMutation.isPending}
                                                            >
                                                                Submit Request
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-slate-700 font-medium">
                                                    {job.reportedDefect || "No claim specified"}
                                                </div>
                                            )}
                                        </div>

                                        {/* Problem Found Checkboxes */}
                                        <div className="space-y-3">
                                            <Label className="text-slate-600 font-medium">Confirmed Problems (Select all that apply)</Label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {PROBLEM_OPTIONS.map((option) => (
                                                    <div
                                                        key={option.value}
                                                        className={`flex items-center gap-3 p-3 border rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${problemsFound.includes(option.value) ? 'bg-blue-50/50 border-blue-200' : 'border-slate-100'
                                                            }`}
                                                        onClick={() => toggleProblem(option.value)}
                                                    >
                                                        <Checkbox
                                                            checked={problemsFound.includes(option.value)}
                                                            onCheckedChange={() => toggleProblem(option.value)}
                                                            className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                        />
                                                        <span className={`text-sm ${problemsFound.includes(option.value) ? 'text-blue-900 font-medium' : 'text-slate-600'}`}>{option.label}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {problemsFound.includes('other') && (
                                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
                                                    <Input
                                                        placeholder="Describe the specific custom problem..."
                                                        value={otherProblemText}
                                                        onChange={(e) => setOtherProblemText(e.target.value)}
                                                        className="border-blue-200 bg-blue-50/30 rounded-xl"
                                                    />
                                                </motion.div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Bento Section: Services Applied */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Services Rendered
                                    </h3>

                                    <div className="flex gap-2 mb-4">
                                        <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                            <SelectTrigger className="flex-1 rounded-xl">
                                                <SelectValue placeholder="Add a service type..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {serviceItems.map((item: any) => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.name} <span className="text-muted-foreground ml-1">- ৳{item.price}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button onClick={addServiceLine} className="rounded-xl w-12 shrink-0 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700" variant="ghost">
                                            <Plus className="h-5 w-5" />
                                        </Button>
                                    </div>

                                    {serviceLines.length > 0 ? (
                                        <div className="space-y-2">
                                            {serviceLines.map((line) => (
                                                <div key={line.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                                    <span className="flex-1 text-sm font-medium text-slate-700">{line.name}</span>
                                                    <span className="text-xs text-slate-400 hidden sm:inline-block">Base: ৳{line.basePrice}</span>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs shadow-none">৳</span>
                                                        <Input
                                                            type="number"
                                                            value={line.customPrice}
                                                            onChange={(e) => updateServicePrice(line.id, parseFloat(e.target.value) || 0)}
                                                            className="w-24 h-9 pl-6 pr-2 text-right rounded-lg bg-white"
                                                        />
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0" onClick={() => removeServiceLine(line.id)}>
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <div className="text-right text-sm font-medium pt-2 pr-2 text-slate-600">
                                                Subtotal: <span className="text-slate-900 ml-1">৳{serviceTotalBDT.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                            No services logged yet.
                                        </div>
                                    )}
                                </div>

                                {/* Bento Section: Parts Used */}
                                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                    <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Hardware & Parts
                                    </h3>

                                    <div className="flex gap-2 mb-4">
                                        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                                            <SelectTrigger className="flex-1 rounded-xl">
                                                <SelectValue placeholder="Add an inventory part..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {productItems.map((item: any) => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.name} <span className="text-muted-foreground ml-1">(Stock: {item.stock}) - ৳{item.price}</span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={productQuantity}
                                            onChange={(e) => setProductQuantity(parseInt(e.target.value) || 1)}
                                            className="w-20 rounded-xl"
                                            placeholder="Qty"
                                        />
                                        <Button onClick={addProductLine} className="rounded-xl w-12 shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700" variant="ghost">
                                            <Plus className="h-5 w-5" />
                                        </Button>
                                    </div>

                                    {productLines.length > 0 ? (
                                        <div className="space-y-3">
                                            {productLines.map((line) => (
                                                <div key={line.id} className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                                                    <div className="flex items-center gap-3">
                                                        <span className="flex-1 text-sm font-medium text-slate-700">{line.name}</span>
                                                        <span className="text-xs bg-white border px-2 py-1 rounded-md text-slate-500 font-mono">x{line.quantity}</span>
                                                        <span className="text-sm font-semibold text-slate-900 w-20 text-right">৳{(line.unitPrice * line.quantity).toLocaleString()}</span>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0" onClick={() => removeProductLine(line.id)}>
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>

                                                    {line.isSerialized && (
                                                        <div className="pl-2 border-l-2 border-emerald-200 mt-1 space-y-2">
                                                            {Array.from({ length: line.quantity }).map((_, i) => (
                                                                <div key={`${line.id}-${i}`} className="flex items-center gap-2">
                                                                    <span className="text-xs text-slate-400 font-mono w-4">{i + 1}.</span>
                                                                    <Input
                                                                        placeholder="Scan or type serial number..."
                                                                        value={line.serialNumbers?.[i] || ""}
                                                                        onChange={(e) => updateProductSerial(line.id, i, e.target.value)}
                                                                        className="h-8 text-xs font-mono bg-white border-slate-200 focus-visible:ring-emerald-500"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <div className="text-right text-sm font-medium pt-2 pr-2 text-slate-600">
                                                Subtotal: <span className="text-slate-900 ml-1">৳{productTotalBDT.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                            No parts consumed yet.
                                        </div>
                                    )}
                                </div>

                                {/* Summary & Warranty Split Matrix */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {/* Grand Total */}
                                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700 text-white flex flex-col justify-center">
                                        <span className="text-slate-400 text-sm font-medium mb-1">Total Estimated Cost</span>
                                        <div className="text-3xl font-bold tracking-tight">
                                            ৳{grandTotalBDT.toLocaleString()} <span className="text-base font-normal text-slate-400">BDT</span>
                                        </div>
                                    </div>

                                    {/* Warranty Settings */}
                                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center">
                                        <Label className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                            Corporate Warranty
                                        </Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Standard</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        value={warrantyDays}
                                                        onChange={(e) => setWarrantyDays(parseInt(e.target.value) || 30)}
                                                        className="rounded-xl pr-10"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">dys</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Grace</Label>
                                                <div className="relative">
                                                    <Input
                                                        type="number"
                                                        value={gracePeriodDays}
                                                        onChange={(e) => setGracePeriodDays(parseInt(e.target.value) || 7)}
                                                        className="rounded-xl pr-10"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">dys</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div className="space-y-4 pt-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 flex items-center">
                                            <Settings className="w-4 h-4 mr-1.5" />
                                            Job Notes & Diagnosis
                                        </label>
                                        <VoiceTextInput
                                            value={notes}
                                            onChange={setNotes}
                                            placeholder="Enter detailed diagnostic notes, required parts, or repair strategy..."
                                            className="min-h-[120px] bg-slate-50/50"
                                        />
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="bg-white border-t border-slate-100 p-4 sm:p-5 shrink-0 flex items-center justify-end gap-3 rounded-b-[24px] sm:rounded-b-[2rem]">
                            <Button variant="ghost" className="rounded-xl text-slate-600 hover:text-slate-900" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={updateMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 px-6"
                            >
                                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Job Details
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
