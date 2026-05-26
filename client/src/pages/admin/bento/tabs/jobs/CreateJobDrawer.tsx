import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { Wrench, User, Monitor, ShieldCheck, Loader2, Sparkles, ArrowRight, Layers, Cpu, Package, Plus, Trash2, MessageSquare, UserCheck } from "lucide-react";
import { jobTicketsApi, aiApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { InsertJobTicket } from "@shared/schema";
import { PANEL_TYPES } from "@shared/constants";

// ─── Panel model parser ───────────────────────────────────────────────────────
// Extracts inch size from common panel model numbers
// e.g. "BOE HV430FHB-N10" → "43", "SDC LA550FHB" → "55"
function parsePanelModel(model: string): { inches: string; type: string } {
    const clean = model.toUpperCase();
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

// ─── Panel batch row type ─────────────────────────────────────────────────────
export interface PanelItem {
    panelModel: string;
    panelInches: string;
    panelType: string;
    quantity: number;
    fault: string;
}

function emptyPanelItem(): PanelItem {
    return { panelModel: "", panelInches: "", panelType: "LED", quantity: 1, fault: "" };
}

// ─── Ticket type options ──────────────────────────────────────────────────────
const TICKET_TYPE_OPTIONS = [
    { value: "full_device",     label: "Full Device",  icon: Monitor, desc: "Complete TV repair" },
    { value: "panel_only",      label: "Panel Batch",  icon: Layers,  desc: "Multiple panel models" },
    { value: "motherboard_only",label: "Motherboard",  icon: Cpu,     desc: "Main board repair" },
    { value: "parts_only",      label: "Parts/Other",  icon: Package, desc: "Generic parts job" },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────
interface CreateJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    technicianUsers: any[];
    tvInches: string[];
}

export function CreateJobDrawer({ isOpen, onClose, technicianUsers, tvInches }: CreateJobDrawerProps) {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState<Partial<InsertJobTicket> & { ticketType?: string; quantity?: number }>({
        status: "Pending",
        priority: "Medium",
        technician: "Unassigned",
        assignedTechnicianId: undefined,
        ticketType: "full_device",
    });
    const [panelItems, setPanelItems] = useState<PanelItem[]>([emptyPanelItem()]);
    const [nextJobNumber, setNextJobNumber] = useState<string>("");
    const [selectedAssistedBy, setSelectedAssistedBy] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [chatHandlerAccepted, setChatHandlerAccepted] = useState(false);

    // Brain session lookup — finds which staff handled this customer on Messenger
    const phoneDigits = (formData.customerPhone || "").replace(/\D/g, "").slice(-10);
    const { data: messengerSession } = useQuery({
        queryKey: ["brain-session-phone", phoneDigits],
        queryFn: async () => {
            const res = await fetch(`/api/brain/sessions/by-phone/${phoneDigits}`);
            if (!res.ok) return null;
            return res.json();
        },
        enabled: phoneDigits.length >= 10 && isOpen,
        staleTime: 60_000,
    });

    useEffect(() => {
        if (isOpen) {
            jobTicketsApi.getNextNumber().then(({ nextNumber }) => setNextJobNumber(nextNumber)).catch(() => setNextJobNumber(""));
        } else {
            setFormData({ status: "Pending", priority: "Medium", technician: "Unassigned", assignedTechnicianId: undefined, ticketType: "full_device" });
            setPanelItems([emptyPanelItem()]);
            setSelectedAssistedBy([]);
            setChatHandlerAccepted(false);
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

    const ticketType = formData.ticketType || "full_device";
    const isPanelBatch = ticketType === "panel_only";

    // ── Panel item helpers ────────────────────────────────────────────────────
    const updatePanelItem = (index: number, field: keyof PanelItem, value: string | number) => {
        setPanelItems(prev => {
            const next = [...prev];
            if (field === "panelModel" && typeof value === "string") {
                const parsed = parsePanelModel(value);
                next[index] = {
                    ...next[index],
                    panelModel: value,
                    panelInches: next[index].panelInches || parsed.inches,
                    panelType: next[index].panelType || parsed.type,
                };
            } else {
                next[index] = { ...next[index], [field]: value };
            }
            return next;
        });
    };

    const addPanelRow = () => setPanelItems(prev => [...prev, emptyPanelItem()]);

    const removePanelRow = (index: number) => {
        if (panelItems.length === 1) return; // keep at least one row
        setPanelItems(prev => prev.filter((_, i) => i !== index));
    };

    const totalPanelPieces = panelItems.reduce((s, p) => s + (p.quantity || 0), 0);

    // ── Submission ────────────────────────────────────────────────────────────
    const handleCreate = () => {
        if (!formData.customer) { toast.error("Customer name is required"); return; }

        if (isPanelBatch) {
            const valid = panelItems.filter(p => p.panelModel.trim());
            if (!valid.length) { toast.error("Add at least one panel model"); return; }
        } else if (ticketType === "full_device" && (!formData.device || !formData.issue)) {
            toast.error("Device and Issue are required for full device tickets");
            return;
        }

        const jobData: any = { ...formData };

        if (jobData.customerPhone) {
            jobData.customerPhone = "+880" + jobData.customerPhone.replace(/^(\+880|880)/, "");
        }

        if (isPanelBatch) {
            const validItems = panelItems.filter(p => p.panelModel.trim());
            jobData.panelItems = JSON.stringify(validItems);
            // Auto-generate device/issue summary for display
            const summary = validItems.map(p => `${p.panelInches || "?"}″ ${p.panelType} ×${p.quantity}`).join(", ");
            jobData.device = `Panel Batch (${totalPanelPieces} pcs)`;
            jobData.issue = `Panel repair/replacement: ${summary}`;
        }

        const finalAssisted = [...selectedAssistedBy];
        // Phase 6: auto-include Messenger ChatHandler in assistedBy
        if (chatHandlerAccepted && messengerSession?.claimedByUserId && !finalAssisted.includes(messengerSession.claimedByUserId)) {
            finalAssisted.push(messengerSession.claimedByUserId);
        }
        if (finalAssisted.length > 0) {
            jobData.assistedByIds = JSON.stringify(finalAssisted);
            jobData.assistedByNames = finalAssisted
                .map(id => technicianUsers.find(t => t.id === id)?.name ?? messengerSession?.claimedByName ?? id)
                .filter(Boolean).join(", ") || null;
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

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-2xl bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl overflow-y-auto z-[250]">
                <SheetHeader className="mb-6 border-b border-slate-100 pb-4 mt-6">
                    <SheetTitle className="text-2xl font-bold font-heading flex items-center gap-2 text-slate-800">
                        <Wrench className="w-6 h-6 text-blue-600" /> Create Job Ticket
                    </SheetTitle>
                    <SheetDescription>Register a new repair job.</SheetDescription>
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

                    {/* Ticket Type */}
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

                    {/* Customer */}
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
                        {/* Messenger ChatHandler suggestion (Phase 6) */}
                        {messengerSession?.found && (
                            <div className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                                chatHandlerAccepted
                                    ? "bg-green-50 border-green-200"
                                    : "bg-blue-50 border-blue-200"
                            }`}>
                                <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${chatHandlerAccepted ? "text-green-600" : "text-blue-500"}`} />
                                <div className="flex-1 min-w-0">
                                    {messengerSession.claimedByName ? (
                                        <>
                                            <p className="text-xs font-semibold text-slate-700">
                                                Messenger match — handled by <span className="text-blue-700">{messengerSession.claimedByName}</span>
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                {chatHandlerAccepted
                                                    ? "ChatHandler added to commission assignments"
                                                    : "Add as ChatHandler for commission tracking?"}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xs font-semibold text-slate-700">
                                                Messenger session found — no staff claimed yet
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                Go to AI Brain → claim this session to track commission
                                            </p>
                                        </>
                                    )}
                                </div>
                                {messengerSession.claimedByName && !chatHandlerAccepted && (
                                    <button
                                        type="button"
                                        onClick={() => setChatHandlerAccepted(true)}
                                        className="h-7 px-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold shrink-0 hover:bg-blue-700 transition-colors flex items-center gap-1"
                                    >
                                        <UserCheck className="h-3 w-3" /> Add
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Textarea placeholder="Delivery/Pickup address..." value={formData.customerAddress || ""} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={2} className="bg-slate-50 resize-none" />
                        </div>
                    </div>

                    {/* Device / Panel Section */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-purple-600 flex items-center gap-2 bg-purple-50 p-2 rounded-lg border border-purple-100 uppercase tracking-wider">
                            <Monitor className="w-4 h-4" />
                            {isPanelBatch ? `Panel Batch (${totalPanelPieces} pcs total)` : "Device Details"}
                        </h4>

                        {isPanelBatch ? (
                            /* ── Panel batch table ── */
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500">Add one row per panel model. Each row = one model type from this customer's batch.</p>

                                {/* Column headers */}
                                <div className="grid gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto" }}>
                                    <span>Model No.</span>
                                    <span>Inch</span>
                                    <span>Type</span>
                                    <span>Qty</span>
                                    <span>Fault</span>
                                    <span></span>
                                </div>

                                {panelItems.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="grid gap-1 items-center"
                                        style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto" }}
                                    >
                                        {/* Model */}
                                        <Input
                                            placeholder="BOE HV430FHB"
                                            value={item.panelModel}
                                            onChange={e => updatePanelItem(idx, "panelModel", e.target.value)}
                                            className="bg-slate-50 font-mono text-xs h-9"
                                        />
                                        {/* Inch */}
                                        <Input
                                            placeholder="43"
                                            value={item.panelInches}
                                            onChange={e => updatePanelItem(idx, "panelInches", e.target.value)}
                                            className="bg-slate-50 text-xs h-9"
                                        />
                                        {/* Type */}
                                        <Select value={item.panelType} onValueChange={v => updatePanelItem(idx, "panelType", v)}>
                                            <SelectTrigger className="bg-slate-50 h-9 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {PANEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        {/* Qty */}
                                        <Input
                                            type="number"
                                            min={1}
                                            value={item.quantity}
                                            onChange={e => updatePanelItem(idx, "quantity", parseInt(e.target.value) || 1)}
                                            className="bg-slate-50 text-xs h-9"
                                        />
                                        {/* Fault */}
                                        <Input
                                            placeholder="Cracked, lines..."
                                            value={item.fault}
                                            onChange={e => updatePanelItem(idx, "fault", e.target.value)}
                                            className="bg-slate-50 text-xs h-9"
                                        />
                                        {/* Remove */}
                                        <button
                                            type="button"
                                            onClick={() => removePanelRow(idx)}
                                            disabled={panelItems.length === 1}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addPanelRow}
                                    className="mt-1 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 w-full"
                                >
                                    <Plus size={14} className="mr-1" /> Add Panel Model
                                </Button>

                                {/* Summary */}
                                {totalPanelPieces > 0 && (
                                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                                        <strong>Batch summary:</strong>{" "}
                                        {panelItems.filter(p => p.panelModel).map(p =>
                                            `${p.panelInches || "?"}″ ${p.panelType} ×${p.quantity}`
                                        ).join(" · ")}
                                        {" "}= <strong>{totalPanelPieces} pcs total</strong>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* ── Standard device fields ── */
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{ticketType === "motherboard_only" ? "Board Model / Device" : "Device / Model"}</Label>
                                        <Input
                                            placeholder={ticketType === "motherboard_only" ? "Samsung T-CON board..." : "Samsung 55' UHD"}
                                            value={formData.device || ""}
                                            onChange={e => setFormData({ ...formData, device: e.target.value })}
                                            className="bg-slate-50"
                                        />
                                    </div>
                                    {ticketType === "full_device" && (
                                        <div className="space-y-2">
                                            <Label>Screen Size</Label>
                                            <Select value={formData.screenSize || ""} onValueChange={v => setFormData({ ...formData, screenSize: v })}>
                                                <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Select size" /></SelectTrigger>
                                                <SelectContent>{tvInches.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    {ticketType === "parts_only" && (
                                        <div className="space-y-2">
                                            <Label>Quantity</Label>
                                            <Input type="number" min={1} value={formData.quantity ?? 1} onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })} className="bg-slate-50" />
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label>Issue Description</Label>
                                    <Textarea
                                        placeholder="Describe the problem..."
                                        value={formData.issue || ""}
                                        onChange={e => setFormData({ ...formData, issue: e.target.value })}
                                        rows={3}
                                        className="bg-slate-50 resize-none"
                                    />
                                </div>
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
                                <Select value={formData.priority || "Medium"} onValueChange={v => setFormData({ ...formData, priority: v as any })}>
                                    <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="High">High</SelectItem>
                                        <SelectItem value="Critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-end">
                                <Button variant="ghost" size="sm" type="button" className="h-9 px-3 text-[11px] bg-purple-100 text-purple-700 hover:bg-purple-200 uppercase tracking-wider font-bold rounded w-full" onClick={() => handleSuggestTechnician(formData.issue || "")} disabled={isSuggesting}>
                                    {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />} AI Assign
                                </Button>
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
                        {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                        {isPanelBatch ? `Submit Batch (${totalPanelPieces} pcs)` : "Submit Ticket"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
