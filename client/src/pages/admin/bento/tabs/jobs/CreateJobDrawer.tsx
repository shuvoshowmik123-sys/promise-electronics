import { useState, useEffect, useMemo, useRef } from "react";
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
import {
    AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, ChevronUp, Cpu,
    Layers, Loader2, MessageSquare, Monitor, Package, Plus, ShieldCheck, Sparkles,
    Trash2, UploadCloud, User, UserCheck, Wrench,
} from "lucide-react";
import { jobTicketsApi, aiApi, adminCustomersApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { InsertJobTicket, JobTicket } from "@shared/schema";
import { PANEL_TYPES, MISSING_PARTS_LIST } from "@shared/constants";
import type { AdminCustomer } from "@/lib/api/types";

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

const TICKET_TYPE_OPTIONS = [
    { value: "full_device", label: "Full TV", icon: Monitor, desc: "Customer brought a complete TV" },
    { value: "panel_only", label: "Panel Batch", icon: Layers, desc: "One or more panel models" },
    { value: "motherboard_only", label: "Motherboard", icon: Cpu, desc: "Board or circuit repair" },
    { value: "parts_only", label: "Parts/Other", icon: Package, desc: "Small parts or other work" },
] as const;

type TicketType = typeof TICKET_TYPE_OPTIONS[number]["value"];

const CREATE_JOB_STEPS = [
    { title: "Job Type", helper: "Choose what kind of work this is." },
    { title: "Customer", helper: "Write who owns this job." },
    { title: "Device", helper: "Write what came in and what is wrong." },
    { title: "Missing Parts", helper: "Tick anything missing at intake." },
    { title: "Assign", helper: "Choose priority and technician." },
    { title: "Review", helper: "Check once before creating the job." },
] as const;

const RECEIVED_ACCESSORY_OPTIONS = ["Remote", "Stand", "Screws", "Wall Mount", "AC Cord", "Adapter"] as const;
const COMMON_SCREEN_SIZES = ["24", "32", "40", "43", "50", "55", "65", "75"] as const;
const PRIORITY_OPTIONS = [
    { value: "Low", label: "Low", helper: "Can wait", className: "border-slate-200 bg-white text-slate-600 hover:border-slate-300" },
    { value: "Medium", label: "Normal", helper: "Regular job", className: "border-blue-500 bg-blue-50 text-blue-700" },
    { value: "High", label: "Urgent", helper: "Do sooner", className: "border-orange-500 bg-orange-50 text-orange-700" },
    { value: "Critical", label: "Very Urgent", helper: "Top priority", className: "border-red-500 bg-red-50 text-red-700" },
] as const;

type JobMode = "single" | "corporate_bulk";

interface CreateJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    technicianUsers: { id: string; name: string; role: string; skills?: string | null }[];
    tvInches: string[];
}

export function CreateJobDrawer({ isOpen, onClose, technicianUsers, tvInches }: CreateJobDrawerProps) {
    const queryClient = useQueryClient();
    const autoFilledPhoneRef = useRef("");

    const [activeStep, setActiveStep] = useState(0);
    const [jobMode, setJobMode] = useState<JobMode>("single");
    const [formData, setFormData] = useState<Partial<InsertJobTicket> & { ticketType?: TicketType; quantity?: number }>({
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
    const [missingParts, setMissingParts] = useState<string[]>([]);
    const [showMissingParts, setShowMissingParts] = useState(true);
    const [customMissingPart, setCustomMissingPart] = useState("");
    const [receivedAccessories, setReceivedAccessories] = useState<string[]>([]);
    const [customAccessory, setCustomAccessory] = useState("");
    const [customScreenSize, setCustomScreenSize] = useState("");

    const { data: customers = [] } = useQuery({
        queryKey: ["admin-customers"],
        queryFn: adminCustomersApi.getAll,
        enabled: isOpen,
        staleTime: 60_000,
    });

    const { data: existingJobsData } = useQuery({
        queryKey: ["jobTickets", "model-suggestions"],
        queryFn: () => jobTicketsApi.getAll("all"),
        enabled: isOpen,
        staleTime: 60_000,
    });

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
            setActiveStep(0);
            setJobMode("single");
            setFormData({ status: "Pending", priority: "Medium", technician: "Unassigned", assignedTechnicianId: undefined, ticketType: "full_device" });
            setPanelItems([emptyPanelItem()]);
            setSelectedAssistedBy([]);
            setChatHandlerAccepted(false);
            setMissingParts([]);
            setShowMissingParts(true);
            setCustomMissingPart("");
            setReceivedAccessories([]);
            setCustomAccessory("");
            setCustomScreenSize("");
            autoFilledPhoneRef.current = "";
        }
    }, [isOpen]);

    const createMutation = useMutation({
        mutationFn: (data: Record<string, unknown>) => jobTicketsApi.create(data as InsertJobTicket & Record<string, unknown>),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            onClose();
            toast.success("Job created successfully");
        },
        onError: () => toast.error("Failed to create job"),
    });

    const ticketType = formData.ticketType || "full_device";
    const isCorporateMode = jobMode === "corporate_bulk";
    const isPanelBatch = ticketType === "panel_only";
    const validPanelItems = panelItems.filter(p => p.panelModel.trim());
    const totalPanelPieces = panelItems.reduce((s, p) => s + (p.quantity || 0), 0);
    const selectedTicket = TICKET_TYPE_OPTIONS.find(option => option.value === ticketType);
    const assignedName = formData.technician && formData.technician !== "Unassigned" ? formData.technician : "Not assigned";
    const activeStepInfo = CREATE_JOB_STEPS[activeStep];
    const isLastStep = activeStep === CREATE_JOB_STEPS.length - 1;
    const customerSearch = `${formData.customer || ""} ${formData.customerPhone || ""}`.trim().toLowerCase();
    const customerMatches = customerSearch.length >= 2
        ? customers.filter((customer: AdminCustomer) => {
            const phone = (customer.phone || "").replace(/\D/g, "");
            const typedPhone = (formData.customerPhone || "").replace(/\D/g, "");
            return customer.name.toLowerCase().includes(customerSearch)
                || customer.phone.toLowerCase().includes(customerSearch)
                || (typedPhone.length >= 4 && phone.endsWith(typedPhone.slice(-4)));
        }).slice(0, 5)
        : [];
    const existingJobs = existingJobsData?.items ?? [];
    const deviceQuery = (formData.device || "").trim().toLowerCase();
    const deviceSuggestions = useMemo(() => {
        if (activeStep !== 2 || isPanelBatch || deviceQuery.length < 2) return [];

        const byDevice = new Map<string, { device: string; screenSize: string; issue: string; count: number }>();
        existingJobs.forEach((job: JobTicket) => {
            const device = job.device?.trim();
            if (!device) return;

            const haystack = `${device} ${job.screenSize || ""} ${job.issue || ""}`.toLowerCase();
            if (!haystack.includes(deviceQuery)) return;

            const key = device.toLowerCase();
            const current = byDevice.get(key);
            if (current) {
                current.count += 1;
                if (!current.screenSize && job.screenSize) current.screenSize = job.screenSize;
                if (!current.issue && job.issue) current.issue = job.issue;
            } else {
                byDevice.set(key, {
                    device,
                    screenSize: job.screenSize || "",
                    issue: job.issue || "",
                    count: 1,
                });
            }
        });

        return Array.from(byDevice.values())
            .sort((a, b) => b.count - a.count || a.device.localeCompare(b.device))
            .slice(0, 6);
    }, [activeStep, deviceQuery, existingJobs, isPanelBatch]);
    const screenSizeChoices = useMemo(() => {
        const values = new Set<string>();
        deviceSuggestions.forEach(suggestion => {
            if (suggestion.screenSize) values.add(suggestion.screenSize);
        });
        [...COMMON_SCREEN_SIZES, ...tvInches].forEach(size => {
            if (size) values.add(size);
        });
        return Array.from(values).slice(0, 12);
    }, [deviceSuggestions, tvInches]);

    useEffect(() => {
        if (!isOpen || activeStep !== 1 || phoneDigits.length < 10 || autoFilledPhoneRef.current === phoneDigits) return;

        const exactCustomer = customers.find((customer: AdminCustomer) => {
            const phone = (customer.phone || "").replace(/\D/g, "");
            return phone.endsWith(phoneDigits);
        });

        if (exactCustomer) {
            autoFilledPhoneRef.current = phoneDigits;
            setFormData(prev => ({
                ...prev,
                customer: prev.customer || exactCustomer.name,
                customerPhone: prev.customerPhone || exactCustomer.phone,
                customerAddress: prev.customerAddress || exactCustomer.address || "",
            }));
        }
    }, [activeStep, customers, formData.customerPhone, isOpen, phoneDigits]);

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
        if (panelItems.length === 1) return;
        setPanelItems(prev => prev.filter((_, i) => i !== index));
    };

    const getStepMessage = () => {
        if (activeStep === 1 && !formData.customer?.trim()) return "Enter customer name to continue.";
        if (activeStep === 2 && isPanelBatch && validPanelItems.length === 0) return "Add at least one panel model.";
        if (activeStep === 2 && ticketType === "full_device" && !formData.device?.trim()) return "Enter TV/device model.";
        if (activeStep === 2 && ticketType === "full_device" && !formData.issue?.trim()) return "Enter the customer problem.";
        if (activeStep === 2 && ticketType !== "full_device" && !isPanelBatch && !formData.device?.trim()) return "Enter item or board model.";
        return "";
    };

    const canGoNext = isCorporateMode || !getStepMessage();

    const goNext = () => {
        if (isCorporateMode) {
            onClose();
            window.location.hash = "#b2b";
            toast.success("Open B2B Workspace for corporate bulk jobs");
            return;
        }
        const message = getStepMessage();
        if (message) {
            toast.error(message);
            return;
        }
        setActiveStep(step => Math.min(CREATE_JOB_STEPS.length - 1, step + 1));
    };

    const goBack = () => {
        setActiveStep(step => Math.max(0, step - 1));
    };

    const applyCustomer = (customer: AdminCustomer) => {
        setFormData(prev => ({
            ...prev,
            customer: customer.name,
            customerPhone: customer.phone,
            customerAddress: customer.address || prev.customerAddress,
        }));
        toast.success("Customer details filled");
    };

    const applyDeviceSuggestion = (suggestion: { device: string; screenSize: string }) => {
        setFormData(prev => ({
            ...prev,
            device: suggestion.device,
            screenSize: ticketType === "full_device" && suggestion.screenSize ? suggestion.screenSize : prev.screenSize,
        }));
        if (suggestion.screenSize) setCustomScreenSize(suggestion.screenSize);
    };

    const selectScreenSize = (size: string) => {
        setCustomScreenSize("");
        setFormData(prev => ({ ...prev, screenSize: size }));
    };

    const addCustomMissingPart = () => {
        const value = customMissingPart.trim();
        if (!value || missingParts.includes(value)) return;
        setMissingParts(prev => [...prev, value]);
        setCustomMissingPart("");
    };

    const addCustomAccessory = () => {
        const value = customAccessory.trim();
        if (!value || receivedAccessories.includes(value)) return;
        setReceivedAccessories(prev => [...prev, value]);
        setCustomAccessory("");
    };

    const handleCreate = () => {
        if (!formData.customer) { toast.error("Customer name is required"); return; }

        if (isPanelBatch) {
            if (!validPanelItems.length) { toast.error("Add at least one panel model"); return; }
        } else if (ticketType === "full_device" && (!formData.device || !formData.issue)) {
            toast.error("Device and Issue are required for full TV jobs");
            return;
        }

        const jobData: Record<string, unknown> = { ...formData };

        if (jobData.customerPhone) {
            jobData.customerPhone = "+880" + (jobData.customerPhone as string).replace(/^(\+880|880)/, "");
        }

        if (isPanelBatch) {
            jobData.panelItems = JSON.stringify(validPanelItems);
            const summary = validPanelItems.map(p => `${p.panelInches || "?"} inch ${p.panelType} x${p.quantity}`).join(", ");
            jobData.device = `Panel Batch (${totalPanelPieces} pcs)`;
            jobData.issue = `Panel repair/replacement: ${summary}`;
        }

        if (missingParts.length > 0) {
            jobData.missingParts = JSON.stringify(missingParts);
        }

        if (receivedAccessories.length > 0) {
            jobData.receivedAccessories = receivedAccessories.join(", ");
        }

        const finalAssisted = [...selectedAssistedBy];
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
        if (!issue) { toast.error("Enter problem first"); return; }
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
                <SheetHeader className="mb-5 border-b border-slate-100 pb-4 mt-6">
                    <SheetTitle className="text-2xl font-bold font-heading flex items-center gap-2 text-slate-800">
                        <Wrench className="w-6 h-6 text-blue-600" /> New Job
                    </SheetTitle>
                    <SheetDescription>
                        Step {activeStep + 1} of {CREATE_JOB_STEPS.length}: {activeStepInfo.title}
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-5 pb-32">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Step</div>
                                <div className="text-base font-bold text-slate-800">{activeStepInfo.title}</div>
                                <div className="text-xs text-slate-500">{activeStepInfo.helper}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Job No.</div>
                                <div className="font-mono text-sm font-bold text-blue-700">{nextJobNumber || "Loading..."}</div>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-6 gap-1.5">
                            {CREATE_JOB_STEPS.map((step, index) => (
                                <button
                                    key={step.title}
                                    type="button"
                                    onClick={() => index <= activeStep && setActiveStep(index)}
                                    className={`h-2 rounded-full transition-colors ${index <= activeStep ? "bg-blue-600" : "bg-slate-200"}`}
                                    aria-label={step.title}
                                />
                            ))}
                        </div>
                    </div>

                    {activeStep === 0 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setJobMode("single")}
                                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                                        jobMode === "single"
                                            ? "border-blue-500 bg-blue-50 text-blue-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 font-bold">
                                        <Wrench className="h-4 w-4" /> Single Customer Job
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">Use this for one TV, one board, one parts job, or one panel batch.</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setJobMode("corporate_bulk")}
                                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                                        jobMode === "corporate_bulk"
                                            ? "border-sky-500 bg-sky-50 text-sky-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 font-bold">
                                        <Building2 className="h-4 w-4" /> Corporate / Bulk Job
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">Use B2B Workspace for company jobs, full TV bulk, and uploaded job lists.</div>
                                </button>
                            </div>

                            {isCorporateMode && (
                                <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                                    <div className="flex items-start gap-3">
                                        <UploadCloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                                        <div>
                                            <div className="text-sm font-bold text-sky-800">Corporate bulk upload belongs in B2B Workspace.</div>
                                            <div className="mt-1 text-xs text-sky-700">Press Next to leave this drawer and open the corporate job area. This keeps normal jobs simple for new staff.</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!isCorporateMode && (
                                <>
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
                            <div className="space-y-2">
                                <Label>Corporate Reference No. <span className="text-slate-400 font-normal">(single job only)</span></Label>
                                <Input placeholder="Optional reference..." value={formData.corporateJobNumber || ""} onChange={(e) => setFormData({ ...formData, corporateJobNumber: e.target.value })} className="bg-slate-50" />
                                <p className="text-[11px] text-slate-500">For many corporate jobs, use the separate Corporate Jobs tab bulk upload.</p>
                            </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeStep === 1 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-blue-600 flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100 uppercase tracking-wider">
                                <User className="w-4 h-4" /> Customer Details
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Customer Name *</Label>
                                    <Input placeholder="Customer name" value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} className="bg-slate-50" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone Number</Label>
                                    <PhoneInput value={formData.customerPhone || ""} onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })} />
                                </div>
                            </div>
                            {customerMatches.length > 0 && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2">
                                    <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">Existing customer found</div>
                                    <div className="space-y-1">
                                        {customerMatches.map((customer: AdminCustomer) => (
                                            <button
                                                key={customer.id}
                                                type="button"
                                                onClick={() => applyCustomer(customer)}
                                                className="w-full rounded-lg bg-white px-3 py-2 text-left hover:bg-blue-50 border border-blue-100 transition-colors"
                                            >
                                                <div className="text-sm font-bold text-slate-800">{customer.name}</div>
                                                <div className="text-xs text-slate-500">{customer.phone}{customer.address ? ` · ${customer.address}` : ""}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
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
                                                    Messenger match handled by <span className="text-blue-700">{messengerSession.claimedByName}</span>
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {chatHandlerAccepted ? "Chat handler added to assignment" : "Add this staff member as chat handler?"}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xs font-semibold text-slate-700">Messenger session found</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">No staff claimed this chat yet.</p>
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
                                <Textarea placeholder="Pickup or delivery address..." value={formData.customerAddress || ""} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={3} className="bg-slate-50 resize-none" />
                            </div>
                        </div>
                    )}

                    {activeStep === 2 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-purple-600 flex items-center gap-2 bg-purple-50 p-2 rounded-lg border border-purple-100 uppercase tracking-wider">
                                <Monitor className="w-4 h-4" />
                                {isPanelBatch ? `Panel Batch (${totalPanelPieces} pcs total)` : "Device and Problem"}
                            </h4>

                            {isPanelBatch ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500">Add one row per panel model. The inch may auto-fill from the model number.</p>
                                    <div className="overflow-x-auto -mx-1 px-1 pb-1" role="region" aria-label="Panel batch table" tabIndex={0}>
                                        <div className="min-w-[520px]">
                                            <div className="grid gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto" }}>
                                                <span>Model No.</span>
                                                <span>Inch</span>
                                                <span>Type</span>
                                                <span>Qty</span>
                                                <span>Fault</span>
                                                <span></span>
                                            </div>
                                            {panelItems.map((item, idx) => (
                                                <div key={idx} className="grid gap-1 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 2fr auto" }}>
                                                    <Input placeholder="BOE HV430FHB" value={item.panelModel} onChange={e => updatePanelItem(idx, "panelModel", e.target.value)} className="bg-slate-50 font-mono text-xs h-9" />
                                                    <Input placeholder="43" value={item.panelInches} onChange={e => updatePanelItem(idx, "panelInches", e.target.value)} className="bg-slate-50 text-xs h-9" />
                                                    <Select value={item.panelType} onValueChange={v => updatePanelItem(idx, "panelType", v)}>
                                                        <SelectTrigger className="bg-slate-50 h-9 text-xs"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {PANEL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <Input type="number" min={1} value={item.quantity} onChange={e => updatePanelItem(idx, "quantity", parseInt(e.target.value) || 1)} className="bg-slate-50 text-xs h-9" />
                                                    <Input placeholder="Cracked, lines..." value={item.fault} onChange={e => updatePanelItem(idx, "fault", e.target.value)} className="bg-slate-50 text-xs h-9" />
                                                    <button type="button" onClick={() => removePanelRow(idx)} disabled={panelItems.length === 1} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                            <Button type="button" variant="outline" size="sm" onClick={addPanelRow} className="mt-1 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 w-full h-9">
                                                <Plus size={14} className="mr-1" /> Add Panel Model
                                            </Button>
                                        </div>
                                    </div>
                                    {validPanelItems.length > 0 && (
                                        <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                                            <strong>Batch summary:</strong>{" "}
                                            {validPanelItems.map(p => `${p.panelInches || "?"} inch ${p.panelType} x${p.quantity}`).join(" · ")}
                                            {" "}= <strong>{totalPanelPieces} pcs total</strong>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{ticketType === "motherboard_only" ? "Board Model / Device" : ticketType === "parts_only" ? "Part / Item Name" : "Device / Model"} *</Label>
                                            <Input
                                                placeholder={ticketType === "motherboard_only" ? "Type board model..." : ticketType === "parts_only" ? "Type part name..." : "Type TV model..."}
                                                value={formData.device || ""}
                                                onChange={e => setFormData({ ...formData, device: e.target.value })}
                                                className="bg-slate-50"
                                            />
                                            {deviceSuggestions.length > 0 && (
                                                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2">
                                                    <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">Model suggestions</div>
                                                    <div className="space-y-1">
                                                        {deviceSuggestions.map(suggestion => (
                                                            <button
                                                                key={suggestion.device}
                                                                type="button"
                                                                onClick={() => applyDeviceSuggestion(suggestion)}
                                                                className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-left transition-colors hover:bg-blue-50"
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-sm font-bold text-slate-800">{suggestion.device}</span>
                                                                    {suggestion.screenSize && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{suggestion.screenSize}</span>}
                                                                </div>
                                                                <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                                                                    Used {suggestion.count} time{suggestion.count === 1 ? "" : "s"}{suggestion.issue ? ` - ${suggestion.issue}` : ""}
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {ticketType === "full_device" && (
                                            <div className="space-y-2">
                                                <Label>Screen Size</Label>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {screenSizeChoices.map(size => (
                                                        <button
                                                            key={size}
                                                            type="button"
                                                            onClick={() => selectScreenSize(size)}
                                                            className={`rounded-lg border px-2 py-2 text-xs font-bold transition-colors ${
                                                                formData.screenSize === size
                                                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                                                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
                                                            }`}
                                                        >
                                                            {size}
                                                        </button>
                                                    ))}
                                                </div>
                                                <Input
                                                    placeholder="Or write custom size..."
                                                    value={customScreenSize || (screenSizeChoices.includes(formData.screenSize || "") ? "" : formData.screenSize || "")}
                                                    onChange={e => {
                                                        setCustomScreenSize(e.target.value);
                                                        setFormData({ ...formData, screenSize: e.target.value });
                                                    }}
                                                    className="bg-slate-50"
                                                />
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
                                        <Label>{ticketType === "full_device" ? "Problem *" : "Problem / Note"}</Label>
                                        <Textarea placeholder="Write the problem in simple words..." value={formData.issue || ""} onChange={e => setFormData({ ...formData, issue: e.target.value })} rows={4} className="bg-slate-50 resize-none" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeStep === 3 && (
                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={() => setShowMissingParts(v => !v)}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border text-sm font-bold uppercase tracking-wider transition-colors ${
                                    missingParts.length > 0
                                        ? "bg-orange-50 border-orange-200 text-orange-700"
                                        : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    Missing Parts at Intake
                                    {missingParts.length > 0 && (
                                        <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                                            {missingParts.length}
                                        </span>
                                    )}
                                </span>
                                {showMissingParts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            {showMissingParts && (
                                <div className="border border-orange-100 rounded-xl p-3 bg-orange-50/50">
                                    <p className="text-[11px] text-slate-500 mb-3">If nothing is missing, leave everything unchecked and press Next.</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {MISSING_PARTS_LIST.map(part => (
                                            <label key={part} className="flex items-center gap-2 cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={missingParts.includes(part)}
                                                    onChange={e => {
                                                        setMissingParts(prev =>
                                                            e.target.checked
                                                                ? [...prev, part]
                                                                : prev.filter(p => p !== part)
                                                        );
                                                    }}
                                                    className="w-3.5 h-3.5 accent-orange-500 shrink-0"
                                                />
                                                <span className="text-xs text-slate-700 group-hover:text-orange-700 transition-colors leading-tight">{part}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <Input
                                            placeholder="Other missing item..."
                                            value={customMissingPart}
                                            onChange={e => setCustomMissingPart(e.target.value)}
                                            className="bg-white"
                                        />
                                        <Button type="button" variant="outline" onClick={addCustomMissingPart} className="shrink-0">Add</Button>
                                    </div>
                                    {missingParts.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {missingParts.map(part => (
                                                <button
                                                    key={part}
                                                    type="button"
                                                    onClick={() => setMissingParts(prev => prev.filter(item => item !== part))}
                                                    className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-200"
                                                >
                                                    {part} x
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Received accessories / add-ons</div>
                                <p className="mt-1 text-[11px] text-slate-500">Tick what came with the TV. Add custom items if needed.</p>
                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {RECEIVED_ACCESSORY_OPTIONS.map(accessory => (
                                        <label key={accessory} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={receivedAccessories.includes(accessory)}
                                                onChange={e => {
                                                    setReceivedAccessories(prev =>
                                                        e.target.checked
                                                            ? [...prev, accessory]
                                                            : prev.filter(item => item !== accessory)
                                                    );
                                                }}
                                                className="w-3.5 h-3.5 accent-blue-600 shrink-0"
                                            />
                                            <span className="text-xs text-slate-700 group-hover:text-blue-700 transition-colors leading-tight">{accessory}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <Input
                                        placeholder="Other accessory..."
                                        value={customAccessory}
                                        onChange={e => setCustomAccessory(e.target.value)}
                                        className="bg-white"
                                    />
                                    <Button type="button" variant="outline" onClick={addCustomAccessory} className="shrink-0">Add</Button>
                                </div>
                                {receivedAccessories.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {receivedAccessories.map(accessory => (
                                            <button
                                                key={accessory}
                                                type="button"
                                                onClick={() => setReceivedAccessories(prev => prev.filter(item => item !== accessory))}
                                                className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-200"
                                            >
                                                {accessory} x
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeStep === 4 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-emerald-600 flex items-center gap-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100 uppercase tracking-wider">
                                <ShieldCheck className="w-4 h-4" /> Assignment
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Priority Level</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {PRIORITY_OPTIONS.map(priority => {
                                            const selected = formData.priority === priority.value;
                                            return (
                                                <button
                                                    key={priority.value}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, priority: priority.value as InsertJobTicket["priority"] })}
                                                    className={`rounded-xl border-2 px-3 py-2 text-left transition-all ${
                                                        selected
                                                            ? priority.className
                                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                                    }`}
                                                >
                                                    <div className="text-sm font-bold">{priority.label}</div>
                                                    <div className="text-[11px] opacity-75">{priority.helper}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
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
                    )}

                    {activeStep === 5 && (
                        <div className="space-y-4">
                            <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 uppercase tracking-wider">
                                <CheckCircle2 className="w-4 h-4 text-blue-600" /> Review Before Create
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Job Type</div>
                                    <div className="font-semibold text-slate-800">{selectedTicket?.label || "Full TV"}</div>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</div>
                                    <div className="font-semibold text-slate-800">{formData.customer || "Missing"}</div>
                                    <div className="text-xs text-slate-500">{formData.customerPhone || "No phone"}</div>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device / Work</div>
                                    <div className="font-semibold text-slate-800">{isPanelBatch ? `Panel Batch (${totalPanelPieces} pcs)` : formData.device || "Missing"}</div>
                                    <div className="text-xs text-slate-500 line-clamp-2">{isPanelBatch ? validPanelItems.map(p => p.panelModel).join(", ") : formData.issue || "No problem note"}</div>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assign</div>
                                    <div className="font-semibold text-slate-800">{assignedName}</div>
                                    <div className="text-xs text-slate-500">Priority: {formData.priority || "Medium"}</div>
                                </div>
                            </div>
                            {missingParts.length > 0 && (
                                <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Missing Parts</div>
                                    <div className="text-sm font-medium text-orange-800">{missingParts.join(", ")}</div>
                                </div>
                            )}
                            {receivedAccessories.length > 0 && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Received Accessories</div>
                                    <div className="text-sm font-medium text-blue-800">{receivedAccessories.join(", ")}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {getStepMessage() && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                            {getStepMessage()}
                        </div>
                    )}
                </div>

                <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-100 flex flex-row items-center justify-between gap-3 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-slate-200 bg-white">Cancel</Button>
                    <div className="flex items-center gap-2">
                        {activeStep > 0 && (
                            <Button variant="outline" onClick={goBack} className="rounded-xl border-slate-200 bg-white">
                                <ArrowLeft className="w-4 h-4 mr-2" /> Back
                            </Button>
                        )}
                        {!isLastStep ? (
                            <Button onClick={goNext} disabled={!canGoNext} className="rounded-xl px-7 shadow-md bg-blue-600 hover:bg-blue-700 font-bold tracking-wide">
                                {isCorporateMode ? "Open B2B Workspace" : "Next"} <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button onClick={handleCreate} disabled={createMutation.isPending} className="rounded-xl px-7 shadow-md bg-blue-600 hover:bg-blue-700 font-bold tracking-wide">
                                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                Create Job
                            </Button>
                        )}
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
