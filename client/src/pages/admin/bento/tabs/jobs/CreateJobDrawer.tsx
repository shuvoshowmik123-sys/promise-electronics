import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Wrench, User, Monitor, ShieldCheck, Loader2, Sparkles, ArrowRight, Layers, Cpu, Package } from "lucide-react";
import { jobTicketsApi, aiApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { InsertJobTicket } from "@shared/schema";
import { PANEL_TYPES } from "@shared/constants";

// Panel model parser: extracts inch from common panel model numbers
// e.g. "BOE HV430FHB-N10" → "43", "SDC LA550FHB" → "55"
function parsePanelModel(model: string): { inches: string; type: string } {
    const clean = model.toUpperCase();
    // Look for 3-digit inch codes: 320=32, 390=39, 400=40, 430=43, 490=49, 500=50, 550=55, 580=58, 650=65, 750=75, 850=85
    const inchMap: Record<string, string> = {
        "850": "85", "750": "75", "650": "65", "580": "58", "550": "55",
        "500": "50", "490": "49", "430": "43", "400": "40", "390": "39",
        "320": "32", "280": "28", "240": "24", "220": "22"
    };
    for (const [code, inch] of Object.entries(inchMap)) {
        if (clean.includes(code)) return { inches: inch, type: "LED" };
    }
    return { inches: "", type: "LED" };
}

const TICKET_TYPE_OPTIONS = [
    { value: "full_device", label: "Full Device", icon: Monitor, desc: "Complete TV repair" },
    { value: "panel_only", label: "Panel Only", icon: Layers, desc: "Panel repair/replacement" },
    { value: "motherboard_only", label: "Motherboard", icon: Cpu, desc: "Main board repair" },
    { value: "parts_only", label: "Parts/Other", icon: Package, desc: "Generic parts job" },
] as const;

interface CreateJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    technicianUsers: any[];
    tvInches: string[];
}

export function CreateJobDrawer({
    isOpen,
    onClose,
    technicianUsers,
    tvInches
}: CreateJobDrawerProps) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<Partial<InsertJobTicket> & { ticketType?: string; panelModel?: string; panelInches?: string; panelType?: string; quantity?: number }>({
        status: "Pending",
        priority: "Medium",
        technician: "Unassigned",
        assignedTechnicianId: undefined,
        ticketType: "full_device",
        quantity: 1,
    });
    const [nextJobNumber, setNextJobNumber] = useState<string>("");
    const [selectedAssistedBy, setSelectedAssistedBy] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            jobTicketsApi.getNextNumber().then(({ nextNumber }) => {
                setNextJobNumber(nextNumber);
            }).catch(() => { setNextJobNumber(""); });
        } else {
            setFormData({
                status: "Pending",
                priority: "Medium",
                technician: "Unassigned",
                assignedTechnicianId: undefined,
                ticketType: "full_device",
                quantity: 1,
            });
            setSelectedAssistedBy([]);
        }
    }, [isOpen]);

    const createMutation = useMutation({
        mutationFn: (data: any) => jobTicketsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            onClose();
            toast.success("Job ticket created successfully");
        },
        onError: () => toast.error("Failed to create job ticket"),
    });

    const handleCreate = () => {
        const ticketType = formData.ticketType || "full_device";

        // Validation rules per ticket type
        if (ticketType === "full_device" && (!formData.customer || !formData.device || !formData.issue)) {
            toast.error("Customer, Device, and Issue are required");
            return;
        }
        if (ticketType === "panel_only" && (!formData.customer || !formData.panelModel)) {
            toast.error("Customer and Panel Model are required");
            return;
        }
        if ((ticketType === "motherboard_only" || ticketType === "parts_only") && !formData.customer) {
            toast.error("Customer is required");
            return;
        }

        const jobData: any = { ...formData };
        if (jobData.customerPhone) {
            jobData.customerPhone = "+880" + jobData.customerPhone.replace(/^(\+880|880)/, '');
        }

        // Auto-fill device/issue for panel tickets
        if (ticketType === "panel_only" && formData.panelModel) {
            if (!jobData.device) jobData.device = `Panel: ${formData.panelModel}`;
            if (!jobData.issue) jobData.issue = `Panel repair/replacement - ${formData.panelModel}`;
        }
        if (ticketType === "motherboard_only") {
            if (!jobData.issue) jobData.issue = "Motherboard repair";
        }

        if (selectedAssistedBy.length > 0) {
            jobData.assistedByIds = JSON.stringify(selectedAssistedBy);
            const assistantNames = selectedAssistedBy
                .map(id => technicianUsers.find(t => t.id === id)?.name)
                .filter(Boolean).join(", ");
            jobData.assistedByNames = assistantNames || null;
        }

        createMutation.mutate(jobData);
    };

    const handleSuggestTechnician = async (issue: string) => {
        if (!issue) { toast.error("Enter issue description first"); return; }
        setIsSuggesting(true);
        try {
            const suggestion = await aiApi.suggestTechnician(issue);
            if (suggestion) {
                const tech = technicianUsers.find(u => u.id === suggestion.technicianId);
                if (tech) {
                    setFormData(prev => ({ ...prev, technician: tech.name, assignedTechnicianId: tech.id }));
                    toast.success(`AI Suggested: ${tech.name}`, { description: suggestion.reason });
                } else toast.error("Suggested technician not found");
            } else toast.error("AI could not suggest");
        } catch { toast.error("Failed to get AI suggestion"); }
        finally { setIsSuggesting(false); }
    };

    const ticketType = formData.ticketType || "full_device";
    const isPanelJob = ticketType === "panel_only";
    const isFullDevice = ticketType === "full_device";

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-2xl bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl overflow-y-auto z-[250]">
                <SheetHeader className="mb-6 border-b border-slate-100 pb-4 mt-6">
                    <SheetTitle className="text-2xl font-bold font-heading flex items-center gap-2 text-slate-800">
                        <Wrench className="w-6 h-6 text-blue-600" /> Create Job Ticket
                    </SheetTitle>
                    <SheetDescription>Register a new repair item and assign a technician.</SheetDescription>
                </SheetHeader>

                <div className="space-y-8 pb-24">
                    {/* Job Number */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Job Number</Label>
                            <Input value={nextJobNumber || "Loading..."} disabled className="bg-slate-100 font-mono font-bold text-slate-500 border-dashed" />
                        </div>
                        <div className="space-y-2">
                            <Label>Corporate Job No.</Label>
                            <Input placeholder="Optional reference..." value={formData.corporateJobNumber || ""} onChange={(e) => setFormData({ ...formData, corporateJobNumber: e.target.value })} className="bg-slate-50" />
                        </div>
                    </div>

                    {/* Ticket Type Selector */}
                    <div className="space-y-3">
                        <h4 className="font-bold text-sm text-slate-700 uppercase tracking-wider">Ticket Type</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {TICKET_TYPE_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, ticketType: value }))}
                                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                                        ticketType === value
                                            ? "border-blue-500 bg-blue-50 text-blue-700"
                                            : "border-slate-200 bg-white hover:border-blue-300 text-slate-600"
                                    }`}
                                >
                                    <Icon size={18} />
                                    <span className="text-xs font-bold">{label}</span>
                                    <span className="text-[10px] text-slate-500 leading-tight">{desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Customer Details */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-blue-600 flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100 uppercase tracking-wider">
                            <User className="w-4 h-4" /> Customer Details
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Customer Name *</Label>
                                <Input placeholder="John Doe" value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} className="bg-slate-50" />
                            </div>
                            <div className="space-y-2">
                                <Label>Phone Number</Label>
                                <PhoneInput value={formData.customerPhone || ""} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Textarea placeholder="Delivery/Pickup address..." value={formData.customerAddress || ""} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={2} className="bg-slate-50 resize-none" />
                        </div>
                    </div>

                    {/* Device / Panel Details */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-purple-600 flex items-center gap-2 bg-purple-50 p-2 rounded-lg border border-purple-100 uppercase tracking-wider">
                            <Monitor className="w-4 h-4" />
                            {isPanelJob ? "Panel Details" : "Device Registration"}
                        </h4>

                        {isPanelJob ? (
                            /* Panel-specific fields */
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Panel Model Number *</Label>
                                    <Input
                                        placeholder="e.g. BOE HV430FHB-N10"
                                        value={formData.panelModel || ""}
                                        onChange={(e) => {
                                            const model = e.target.value;
                                            const parsed = parsePanelModel(model);
                                            setFormData(prev => ({
                                                ...prev,
                                                panelModel: model,
                                                panelInches: prev.panelInches || parsed.inches,
                                                panelType: prev.panelType || parsed.type,
                                            }));
                                        }}
                                        className="bg-slate-50 font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-2">
                                        <Label>Size (inches)</Label>
                                        <Input
                                            placeholder="43"
                                            value={formData.panelInches || ""}
                                            onChange={(e) => setFormData({ ...formData, panelInches: e.target.value })}
                                            className="bg-slate-50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Panel Type</Label>
                                        <Select value={formData.panelType || "LED"} onValueChange={(v) => setFormData({ ...formData, panelType: v })}>
                                            <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {PANEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Quantity</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={formData.quantity ?? 1}
                                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                            className="bg-slate-50"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Full device / motherboard / parts fields */
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{ticketType === "motherboard_only" ? "Board Model / Device" : "Device / Model"} {isFullDevice && "*"}</Label>
                                        <Input
                                            placeholder={ticketType === "motherboard_only" ? "Samsung main board T-CON..." : "Samsung 55' UHD"}
                                            value={formData.device || ""}
                                            onChange={(e) => setFormData({ ...formData, device: e.target.value })}
                                            className="bg-slate-50"
                                        />
                                    </div>
                                    {isFullDevice && (
                                        <div className="space-y-2">
                                            <Label>Screen Size</Label>
                                            <Select value={formData.screenSize || ""} onValueChange={(value) => setFormData({ ...formData, screenSize: value })}>
                                                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Select size" /></SelectTrigger>
                                                <SelectContent>{tvInches.map((inch) => <SelectItem key={inch} value={inch}>{inch}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {ticketType === "parts_only" && (
                                        <div className="space-y-2">
                                            <Label>Quantity</Label>
                                            <Input type="number" min={1} value={formData.quantity ?? 1} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })} className="bg-slate-50" />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Issue Description {isFullDevice && "*"}</Label>
                                    <Textarea
                                        placeholder="Describe the problem in detail..."
                                        value={formData.issue || ""}
                                        onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                                        rows={3}
                                        className="bg-slate-50 resize-none"
                                    />
                                </div>
                            </div>
                        )}

                        {isPanelJob && (
                            <div className="space-y-2">
                                <Label>Fault Description</Label>
                                <Textarea
                                    placeholder="Describe the fault (cracked, lines, backlight out...)"
                                    value={formData.issue || ""}
                                    onChange={(e) => setFormData({ ...formData, issue: e.target.value })}
                                    rows={2}
                                    className="bg-slate-50 resize-none"
                                />
                            </div>
                        )}
                    </div>

                    {/* Assignment & Priority */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-emerald-600 flex items-center gap-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100 uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4" /> Assignment & Priority
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Priority Level</Label>
                                <Select value={formData.priority || "Medium"} onValueChange={(value) => setFormData({ ...formData, priority: value as any })}>
                                    <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low - Standard</SelectItem>
                                        <SelectItem value="Medium">Medium - Regular</SelectItem>
                                        <SelectItem value="High">High - Urgent</SelectItem>
                                        <SelectItem value="Critical">Critical - Immediate</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Assign Technician</Label>
                                    <Button variant="ghost" size="sm" type="button" className="h-5 px-2 text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-200 uppercase tracking-wider font-bold rounded" onClick={() => handleSuggestTechnician(formData.issue || "")} disabled={isSuggesting}>
                                        {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />} AI Assign
                                    </Button>
                                </div>
                            </div>

                            <TechnicianPicker
                                users={technicianUsers}
                                ticketType={ticketType}
                                assignedTechnicianId={formData.assignedTechnicianId}
                                assistedByIds={selectedAssistedBy}
                                onAssignedChange={(id, name) => setFormData({ ...formData, assignedTechnicianId: id, technician: name })}
                                onAssistedChange={setSelectedAssistedBy}
                            />
                            <div />
                        </div>
                    </div>
                </div>

                <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-100 flex flex-row justify-end space-x-3 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-slate-200 bg-white">Cancel</Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending} className="rounded-xl px-8 shadow-md bg-blue-600 hover:bg-blue-700 font-bold tracking-wide">
                        {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Submit Ticket
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
