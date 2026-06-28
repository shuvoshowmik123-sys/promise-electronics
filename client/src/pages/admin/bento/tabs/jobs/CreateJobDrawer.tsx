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
    AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, ChevronUp, Cpu,
    Layers, Loader2, MessageSquare, Monitor, Package, Plus, ShieldCheck, Sparkles,
    Trash2, UploadCloud, User, UserCheck, Wrench,
} from "lucide-react";
import { jobTicketsApi, aiApi, adminCustomersApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { InsertJobTicket, JobTicket } from "@shared/schema";
import { MISSING_PARTS_LIST } from "@shared/constants";
import type { AdminCustomer } from "@/lib/api/types";

const PANEL_MODEL_MEMORY_KEY = "promise.panelModelMemory.v1";

interface PanelModelMemoryItem {
    model: string;
    inches: string;
    usedAt: number;
}

function normalizePanelModel(model: string) {
    return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parsePanelModel(model: string): { inches: string; type: string } {
    const clean = normalizePanelModel(model);
    const knownCodes: Record<string, string> = {
        "315": "32",
        "546": "55",
    };
    for (const [code, inch] of Object.entries(knownCodes)) {
        if (clean.includes(code)) return { inches: inch, type: "LED" };
    }

    const sizeCode = clean.match(/(?:^|[A-Z])([2-9]\d{2})(?:[A-Z]|\d|$)/)?.[1];
    if (sizeCode) {
        const roundedInches = Math.round(Number(sizeCode) / 10);
        if (roundedInches >= 19 && roundedInches <= 98) {
            return { inches: String(roundedInches), type: "LED" };
        }
    }
    return { inches: "", type: "LED" };
}

function loadPanelModelMemory(): PanelModelMemoryItem[] {
    try {
        const raw = window.localStorage.getItem(PANEL_MODEL_MEMORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(item => typeof item?.model === "string")
            .map(item => ({
                model: item.model,
                inches: typeof item.inches === "string" ? item.inches : parsePanelModel(item.model).inches,
                usedAt: typeof item.usedAt === "number" ? item.usedAt : 0,
            }))
            .slice(0, 80);
    } catch {
        return [];
    }
}

function normalizeDigits(value: string | null | undefined) {
    return (value || "").replace(/\D/g, "");
}

function isDemoCustomerRecord(customer: Partial<AdminCustomer> | null | undefined) {
    if (!customer) return false;
    const name = (customer.name || "").toLowerCase();
    const address = (customer.address || "").toLowerCase();
    const phone = normalizeDigits(customer.phone);
    const demoPhones = ["01700000000", "01234567890", "8801234567890", "1234567890"];
    return demoPhones.includes(phone)
        || name.includes("demo")
        || name.includes("test")
        || name.includes("promise electronics")
        || address.includes("promise electronics")
        || address.includes("office address")
        || address.includes("dhanmondi, dhaka 1205");
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
    { title: "Intake Check", helper: "Capture only what matters for this job type." },
    { title: "Assign", helper: "Choose priority and technician." },
    { title: "Review", helper: "Check once before creating the job." },
] as const;

const RECEIVED_ACCESSORY_OPTIONS = ["Remote", "Stand", "Screws", "Wall Mount", "AC Cord", "Adapter"] as const;
const BOARD_ATTACHMENT_OPTIONS = ["Heatsink", "Shield Plate", "LVDS Cable", "IR/WiFi Board", "Button Board", "Cable Set"] as const;
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
    const [panelModelMemory, setPanelModelMemory] = useState<PanelModelMemoryItem[]>([]);

    const { data: customers = [] } = useQuery({
        queryKey: ["admin-customers"],
        queryFn: adminCustomersApi.getAll,
        enabled: isOpen,
        staleTime: 60_000,
    });

    const { data: existingJobsData } = useQuery({
        queryKey: ["jobTickets", "model-suggestions"],
        queryFn: () => jobTicketsApi.getAll("walk-in"),
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
            setPanelModelMemory(loadPanelModelMemory());
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
    const intakeTitle = ticketType === "full_device" ? "Missing Parts" : ticketType === "panel_only" ? "Panel Check" : ticketType === "motherboard_only" ? "Board Check" : "Item Check";
    const intakeHelper = ticketType === "full_device"
        ? "Tick missing TV body parts and received accessories."
        : ticketType === "panel_only"
            ? "Panel model, inch, quantity, and fault are already captured."
            : ticketType === "motherboard_only"
                ? "Track board attachments only if they came with the board."
                : "No TV body checklist needed for parts-only jobs.";
    const stepTitle = activeStep === 3 ? intakeTitle : activeStepInfo.title;
    const stepHelper = activeStep === 3 ? intakeHelper : activeStepInfo.helper;
    const missingPartOptions = ticketType === "full_device" ? MISSING_PARTS_LIST : [];
    const accessoryOptions = ticketType === "full_device"
        ? RECEIVED_ACCESSORY_OPTIONS
        : ticketType === "motherboard_only"
            ? BOARD_ATTACHMENT_OPTIONS
            : [];
    const customerSearch = `${formData.customer || ""} ${formData.customerPhone || ""}`.trim().toLowerCase();
    const customerMatches = customerSearch.length >= 2
        ? customers.filter((customer: AdminCustomer) => {
            const phone = (customer.phone || "").replace(/\D/g, "");
            const typedPhone = (formData.customerPhone || "").replace(/\D/g, "");
            return customer.name.toLowerCase().includes(customerSearch)
                || (customer.phone || "").toLowerCase().includes(customerSearch)
                || (typedPhone.length >= 4 && phone.endsWith(typedPhone.slice(-4)));
        }).slice(0, 5)
        : [];
    const matchedCustomer = phoneDigits.length >= 10
        ? customers.find((customer: AdminCustomer) => normalizeDigits(customer.phone).endsWith(phoneDigits))
        : undefined;
    const isReferenceChatMatch = Boolean(messengerSession?.found);
    const isDemoReferenceCustomer = isDemoCustomerRecord(matchedCustomer);
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

    useEffect(() => {
        if (ticketType !== "full_device") {
            setMissingParts([]);
            setCustomMissingPart("");
        }
        if (ticketType === "panel_only" || ticketType === "parts_only") {
            setReceivedAccessories([]);
            setCustomAccessory("");
        }
    }, [ticketType]);

    const updatePanelItem = (index: number, field: keyof PanelItem, value: string | number) => {
        setPanelItems(prev => {
            const next = [...prev];
            if (field === "panelModel" && typeof value === "string") {
                const parsed = parsePanelModel(value);
                const remembered = panelModelMemory.find(item => normalizePanelModel(item.model) === normalizePanelModel(value));
                next[index] = {
                    ...next[index],
                    panelModel: value,
                    panelInches: remembered?.inches || parsed.inches || next[index].panelInches,
                    panelType: next[index].panelType || parsed.type,
                };
            } else {
                next[index] = { ...next[index], [field]: value };
            }
            return next;
        });
    };

    const getPanelModelSuggestions = (query: string) => {
        const normalizedQuery = normalizePanelModel(query);
        if (normalizedQuery.length < 2) return [];
        return panelModelMemory
            .filter(item => normalizePanelModel(item.model).includes(normalizedQuery))
            .sort((a, b) => b.usedAt - a.usedAt)
            .slice(0, 5);
    };

    const applyPanelModelSuggestion = (index: number, suggestion: PanelModelMemoryItem) => {
        setPanelItems(prev => {
            const next = [...prev];
            next[index] = {
                ...next[index],
                panelModel: suggestion.model,
                panelInches: suggestion.inches || parsePanelModel(suggestion.model).inches || next[index].panelInches,
                panelType: next[index].panelType || "LED",
            };
            return next;
        });
    };

    const rememberPanelModels = (items: PanelItem[]) => {
        const saved = new Map(panelModelMemory.map(item => [normalizePanelModel(item.model), item]));
        const now = Date.now();
        items.forEach(item => {
            const model = item.panelModel.trim();
            if (!model) return;
            saved.set(normalizePanelModel(model), {
                model,
                inches: item.panelInches || parsePanelModel(model).inches,
                usedAt: now,
            });
        });
        const next = Array.from(saved.values()).sort((a, b) => b.usedAt - a.usedAt).slice(0, 80);
        setPanelModelMemory(next);
        window.localStorage.setItem(PANEL_MODEL_MEMORY_KEY, JSON.stringify(next));
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
        delete jobData.corporateJobNumber;
        delete jobData.corporateClientId;
        delete jobData.corporateChallanId;
        delete jobData.batchId;

        if (jobData.customerPhone) {
            jobData.customerPhone = "+880" + (jobData.customerPhone as string).replace(/^(\+880|880)/, "");
        }

        if (isPanelBatch) {
            rememberPanelModels(validPanelItems);
            jobData.panelItems = JSON.stringify(validPanelItems);
            const summary = validPanelItems.map(p => `${p.panelInches || "?"} inch ${p.panelModel} x${p.quantity}`).join(", ");
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
            <SheetContent className="flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-slate-50 p-0 shadow-2xl z-[250] sm:h-full sm:max-w-2xl sm:border-l sm:border-white/20 sm:bg-white/95 sm:p-6 sm:backdrop-blur-xl [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:p-2 [&>button]:shadow-sm sm:[&>button]:bg-transparent sm:[&>button]:shadow-none">
                <SheetHeader className="shrink-0 border-b border-slate-200/70 bg-slate-50/95 px-5 pb-3 pt-7 text-left backdrop-blur sm:mb-5 sm:mt-6 sm:border-slate-100 sm:bg-transparent sm:px-0 sm:pb-4 sm:pt-0">
                    <SheetTitle className="flex items-center gap-2 font-heading text-2xl font-bold text-slate-900 sm:text-slate-800">
                        <Wrench className="w-6 h-6 text-blue-600" /> New Job
                    </SheetTitle>
                    <SheetDescription className="text-sm text-slate-500">
                        Step {activeStep + 1} of {CREATE_JOB_STEPS.length}: {stepTitle}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-32 pt-4 sm:space-y-5 sm:px-0 sm:pt-0">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-xl sm:border-slate-100 sm:bg-slate-50/70 sm:shadow-none">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Step</div>
                                <div className="text-base font-bold text-slate-800">{stepTitle}</div>
                                <div className="hidden text-xs text-slate-500 sm:block">{stepHelper}</div>
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
                                    className={`rounded-2xl border-2 p-4 text-left shadow-sm transition-all sm:rounded-xl sm:shadow-none ${
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
                                    className={`rounded-2xl border-2 p-4 text-left shadow-sm transition-all sm:rounded-xl sm:shadow-none ${
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
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-2">
                                {TICKET_TYPE_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, ticketType: value }))}
                                        className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left shadow-sm transition-all sm:flex-col sm:gap-1 sm:rounded-xl sm:p-3 sm:text-center sm:shadow-none ${
                                            ticketType === value
                                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                                : "border-slate-200 bg-white hover:border-blue-300 text-slate-600"
                                        }`}
                                    >
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm sm:h-auto sm:w-auto sm:bg-transparent sm:shadow-none">
                                            <Icon size={18} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-base font-bold sm:text-xs">{label}</span>
                                            <span className="block text-xs leading-tight text-slate-500 sm:text-[10px]">{desc}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 sm:rounded-xl">
                                Normal jobs are for individual customers only. Use B2B Workspace for company, batch, or challan work.
                            </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeStep === 1 && (
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-2 text-sm font-bold uppercase tracking-wider text-blue-600">
                                <User className="w-4 h-4" /> Customer Details
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Customer Name *</Label>
                                    <Input placeholder="Customer name" value={formData.customer || ""} onChange={(e) => setFormData({ ...formData, customer: e.target.value })} className="h-12 rounded-xl bg-white shadow-sm sm:h-10 sm:bg-slate-50 sm:shadow-none" />
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
                            {isReferenceChatMatch && (
                                <div className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                                    chatHandlerAccepted
                                        ? "bg-green-50 border-green-200"
                                        : isDemoReferenceCustomer
                                            ? "bg-amber-50 border-amber-200"
                                            : "bg-blue-50 border-blue-200"
                                }`}>
                                    <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${chatHandlerAccepted ? "text-green-600" : isDemoReferenceCustomer ? "text-amber-600" : "text-blue-500"}`} />
                                    <div className="flex-1 min-w-0">
                                        {messengerSession.claimedByName ? (
                                            <>
                                                <p className="text-xs font-semibold text-slate-700">
                                                    Imported chat reference: <span className={isDemoReferenceCustomer ? "text-amber-700" : "text-blue-700"}>{messengerSession.claimedByName}</span>
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {chatHandlerAccepted
                                                        ? "Reference kept for this intake"
                                                        : isDemoReferenceCustomer
                                                            ? "Likely demo/office customer. Use as sample reference only."
                                                            : "Scraped history only. Not a verified handler record yet."}
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xs font-semibold text-slate-700">Imported chat reference found</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">No reliable staff handler is recorded for this old chat.</p>
                                            </>
                                        )}
                                    </div>
                                    {messengerSession.claimedByName && !chatHandlerAccepted && (
                                        <button
                                            type="button"
                                            onClick={() => setChatHandlerAccepted(true)}
                                            className="h-7 px-2 rounded-lg bg-blue-600 text-white text-[11px] font-bold shrink-0 hover:bg-blue-700 transition-colors flex items-center gap-1"
                                        >
                                            <UserCheck className="h-3 w-3" /> Keep ref
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>Address</Label>
                                <Textarea placeholder="Pickup or delivery address..." value={formData.customerAddress || ""} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={3} className="resize-none rounded-xl bg-white shadow-sm sm:bg-slate-50 sm:shadow-none" />
                            </div>
                        </div>
                    )}

                    {activeStep === 2 && (
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 p-2 text-sm font-bold uppercase tracking-wider text-purple-600">
                                <Monitor className="w-4 h-4" />
                                {isPanelBatch ? `Panel Batch (${totalPanelPieces} pcs total)` : "Device and Problem"}
                            </h4>

                            {isPanelBatch ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500">Add each panel model. Inch auto-fills from known model codes and your saved entries.</p>
                                    <div className="space-y-3 sm:hidden">
                                        {panelItems.map((item, idx) => (
                                            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                                <div className="mb-3 flex items-center justify-between">
                                                    <div>
                                                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Panel</div>
                                                        <div className="text-sm font-bold text-slate-800">Panel {idx + 1}</div>
                                                    </div>
                                                    <button type="button" onClick={() => removePanelRow(idx)} disabled={panelItems.length === 1} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="space-y-1.5">
                                                        <Label>Model No.</Label>
                                                        <Input placeholder="V315, ST546, BOE HV430..." value={item.panelModel} onChange={e => updatePanelItem(idx, "panelModel", e.target.value)} className="h-12 rounded-xl bg-slate-50 font-mono text-sm" />
                                                        {getPanelModelSuggestions(item.panelModel).length > 0 && (
                                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                                {getPanelModelSuggestions(item.panelModel).map(suggestion => (
                                                                    <button
                                                                        key={`${suggestion.model}-${suggestion.usedAt}`}
                                                                        type="button"
                                                                        onClick={() => applyPanelModelSuggestion(idx, suggestion)}
                                                                        className="shrink-0 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs font-bold text-blue-700"
                                                                    >
                                                                        <span className="font-mono">{suggestion.model}</span>
                                                                        {suggestion.inches && <span className="ml-2 text-blue-500">{suggestion.inches}"</span>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1.5">
                                                            <Label>Inch</Label>
                                                            <Input placeholder="43" value={item.panelInches} onChange={e => updatePanelItem(idx, "panelInches", e.target.value)} className="h-12 rounded-xl bg-slate-50 text-sm" />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label>Qty</Label>
                                                            <Input type="number" min={1} value={item.quantity} onChange={e => updatePanelItem(idx, "quantity", parseInt(e.target.value) || 1)} className="h-12 rounded-xl bg-slate-50 text-sm" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <Label>Fault</Label>
                                                        <Input placeholder="Cracked, lines..." value={item.fault} onChange={e => updatePanelItem(idx, "fault", e.target.value)} className="h-12 rounded-xl bg-slate-50 text-sm" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <Button type="button" variant="outline" onClick={addPanelRow} className="h-12 w-full rounded-xl border-dashed border-blue-300 bg-white font-bold text-blue-600 hover:bg-blue-50">
                                            <Plus size={16} className="mr-2" /> Add Panel Model
                                        </Button>
                                    </div>
                                    <div className="hidden overflow-x-auto -mx-1 px-1 pb-1 sm:block" role="region" aria-label="Panel batch table" tabIndex={0}>
                                        <div className="min-w-[520px]">
                                            <datalist id="panel-model-memory">
                                                {panelModelMemory.map(item => (
                                                    <option key={`${item.model}-${item.usedAt}`} value={item.model}>
                                                        {item.inches ? `${item.inches} inch` : "Saved panel"}
                                                    </option>
                                                ))}
                                            </datalist>
                                            <div className="grid gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr auto" }}>
                                                <span>Model No.</span>
                                                <span>Inch</span>
                                                <span>Qty</span>
                                                <span>Fault</span>
                                                <span></span>
                                            </div>
                                            {panelItems.map((item, idx) => (
                                                <div key={idx} className="grid gap-1 items-center" style={{ gridTemplateColumns: "2fr 1fr 1fr 2fr auto" }}>
                                                    <Input list="panel-model-memory" placeholder="V315, ST546, BOE HV430..." value={item.panelModel} onChange={e => updatePanelItem(idx, "panelModel", e.target.value)} className="bg-slate-50 font-mono text-xs h-9" />
                                                    <Input placeholder="43" value={item.panelInches} onChange={e => updatePanelItem(idx, "panelInches", e.target.value)} className="bg-slate-50 text-xs h-9" />
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
                                            {validPanelItems.map(p => `${p.panelInches || "?"} inch ${p.panelModel} x${p.quantity}`).join(" · ")}
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
                                                className="h-12 rounded-xl bg-white shadow-sm sm:h-10 sm:bg-slate-50 sm:shadow-none"
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
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Model Number</Label>
                                                    <Input
                                                        placeholder="e.g. UA55BU8000"
                                                        value={(formData as any).modelNumber || ""}
                                                        onChange={e => setFormData({ ...formData, modelNumber: e.target.value } as any)}
                                                        className="h-12 rounded-xl bg-white shadow-sm sm:h-10 sm:bg-slate-50 sm:shadow-none font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Serial Number</Label>
                                                    <Input
                                                        placeholder="Optional — enter if visible"
                                                        value={(formData as any).serialNumber || ""}
                                                        onChange={e => setFormData({ ...formData, serialNumber: e.target.value } as any)}
                                                        className="h-12 rounded-xl bg-white shadow-sm sm:h-10 sm:bg-slate-50 sm:shadow-none font-mono"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {ticketType === "full_device" && (
                                            <div className="space-y-2">
                                                <Label>Screen Size</Label>
                                                <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
                                                    {screenSizeChoices.map(size => (
                                                        <button
                                                            key={size}
                                                            type="button"
                                                            onClick={() => selectScreenSize(size)}
                                                            className={`min-w-14 rounded-xl border px-3 py-2 text-sm font-bold transition-colors sm:min-w-0 sm:rounded-lg sm:px-2 sm:text-xs ${
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
                                                    className="h-12 rounded-xl bg-white shadow-sm sm:h-10 sm:bg-slate-50 sm:shadow-none"
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
                                        <Textarea placeholder="Write the problem in simple words..." value={formData.issue || ""} onChange={e => setFormData({ ...formData, issue: e.target.value })} rows={4} className="resize-none rounded-xl bg-white shadow-sm sm:bg-slate-50 sm:shadow-none" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeStep === 3 && (
                        <div className="space-y-3">
                            {ticketType === "panel_only" || ticketType === "parts_only" ? (
                                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                                    <div className="flex items-start gap-3">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                                        <div>
                                            <div className="text-sm font-bold text-blue-900">
                                                {ticketType === "panel_only" ? "Panel batch details are already captured" : "Parts-only job does not need TV body checks"}
                                            </div>
                                            <p className="mt-1 text-xs text-blue-700">
                                                {ticketType === "panel_only"
                                                    ? "Model, inch, quantity, and fault are enough for this intake. No motherboard, T-con, stand, or remote checklist is shown."
                                                    : "Use the item/model and problem note from the previous step. Add special notes there if needed."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {missingPartOptions.length > 0 && (
                                        <>
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
                                                    Missing TV Body Parts
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
                                                    <p className="text-[11px] text-slate-500 mb-3">Only for incomplete full-TV intake. If nothing is missing, leave this empty.</p>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {missingPartOptions.map(part => (
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
                                        </>
                                    )}
                                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                            {ticketType === "motherboard_only" ? "Received board attachments" : "Received accessories / add-ons"}
                                        </div>
                                        <p className="mt-1 text-[11px] text-slate-500">
                                            {ticketType === "motherboard_only"
                                                ? "Tick only what physically came with the board."
                                                : "Tick what came with the TV. Add custom items if needed."}
                                        </p>
                                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {accessoryOptions.map(accessory => (
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
                                                placeholder={ticketType === "motherboard_only" ? "Other board attachment..." : "Other accessory..."}
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
                                </>
                            )}
                        </div>
                    )}

                    {activeStep === 4 && (
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-2 text-sm font-bold uppercase tracking-wider text-emerald-600">
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
                                    issue={formData.issue}
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
                            <h4 className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-2 text-sm font-bold uppercase tracking-wider text-slate-700 shadow-sm sm:bg-slate-50 sm:shadow-none">
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

                <SheetFooter className="absolute bottom-0 left-0 right-0 z-10 flex flex-row items-center justify-between gap-2 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.06)] backdrop-blur sm:gap-3 sm:border-slate-100 sm:bg-white/90">
                    <Button variant="outline" onClick={onClose} className="hidden rounded-xl border-slate-200 bg-white sm:inline-flex">Cancel</Button>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        {activeStep > 0 && (
                            <Button variant="outline" onClick={goBack} className="h-12 min-w-16 rounded-xl border-slate-200 bg-white px-3 sm:h-10 sm:min-w-0">
                                <ArrowLeft className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Back</span>
                            </Button>
                        )}
                        {!isLastStep ? (
                            <Button onClick={goNext} disabled={!canGoNext} className="h-12 flex-1 rounded-xl bg-blue-600 px-7 font-bold tracking-wide shadow-md hover:bg-blue-700 sm:h-10 sm:flex-none">
                                {isCorporateMode ? "Open B2B Workspace" : activeStep === 0 ? "Continue to customer" : activeStep === 1 ? "Continue to device" : activeStep === 2 ? "Continue to parts" : activeStep === 3 ? "Continue to assign" : "Continue to review"} <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleCreate} disabled={createMutation.isPending} className="h-12 flex-1 rounded-xl bg-blue-600 px-7 font-bold tracking-wide shadow-md hover:bg-blue-700 sm:h-10 sm:flex-none">
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
