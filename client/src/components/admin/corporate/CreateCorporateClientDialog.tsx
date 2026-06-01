import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { ColumnMappingDialog } from "@/components/corporate/ColumnMappingDialog";
import { autoMapColumns, type FieldMapping } from "@/lib/columnMapper";

interface CreateCorporateClientDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type ClientType = "limited_company" | "corporate" | "regular" | "panel_batch" | "parts_buyer" | "service_online_partner";
type WorkType = "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";
type PortalUserDraft = { name: string; username: string; password: string; contact: string };
type PaymentMode = "pay_now" | "credit_30_working_days" | "credit_60_working_days" | "partial_now_partial_credit" | "batch_payment" | "custom";

const clientTypeLabels: Record<ClientType, string> = {
    limited_company: "Limited Company",
    corporate: "Corporate",
    regular: "Regular",
    panel_batch: "Panel / Batch Client",
    parts_buyer: "Parts Buyer",
    service_online_partner: "Service / Online Partner",
};

const workTypeLabels: Record<WorkType, string> = {
    full_tv: "Full TV",
    panel: "Panel",
    panel_batch: "Panel Batch",
    board: "Board",
    parts: "Parts Service",
    parts_sale: "Parts Sale",
    crr: "CRR / Re-service",
};

const initialForm = {
    companyName: "",
    shortCode: "",
    contactPerson: "",
    contactPhone: "",
    address: "",
    billingCycle: "monthly",
    paymentTerms: "30",
    paymentMode: "credit_30_working_days" as PaymentMode,
    partialPaymentRule: "",
    sendsBatches: true,
    requiresChallanIn: true,
    requiresChallanOut: true,
    creditAllowed: true,
    batchClearanceDays: "7",
    serviceWarrantyEnabled: true,
    serviceWarrantyDays: "30",
    crrRule: "no_charge_inside_service_warranty",
    reminderRule: "due_soon_and_overdue",
    notes: "",
};

const wizardSteps = [
    "Identity",
    "Client Type",
    "Work Rules",
    "Payment",
    "Service Warranty",
    "Portal Users",
    "Sample File",
    "Import Mapping",
    "Review",
];

const paymentModeLabels: Record<PaymentMode, string> = {
    pay_now: "Pay Now",
    credit_30_working_days: "30 Working Days",
    credit_60_working_days: "60 Working Days",
    partial_now_partial_credit: "Partial Now + Partial Credit",
    batch_payment: "Batch Payment",
    custom: "Custom",
};

export function CreateCorporateClientDialog({ open, onOpenChange }: CreateCorporateClientDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState(initialForm);
    const [workTypes, setWorkTypes] = useState<WorkType[]>(["full_tv"]);
    const [clientTypeOverride, setClientTypeOverride] = useState<ClientType | "auto">("auto");
    const [portalUsers, setPortalUsers] = useState<PortalUserDraft[]>([
        { name: "", username: "", password: "", contact: "" },
    ]);
    const [sampleFileName, setSampleFileName] = useState("");
    const [sampleHeaders, setSampleHeaders] = useState<string[]>([]);
    const [sampleRows, setSampleRows] = useState<Record<string, unknown>[]>([]);
    const [importMappings, setImportMappings] = useState<FieldMapping[]>([]);
    const [isMappingOpen, setIsMappingOpen] = useState(false);
    const [createdClientCreds, setCreatedClientCreds] = useState<Array<{ name: string; username: string; password: string }>>([]);

    const recommendedClientType = useMemo<ClientType>(() => {
        if (workTypes.includes("parts_sale") && workTypes.length <= 2) return "parts_buyer";
        if (workTypes.includes("panel_batch") || (formData.sendsBatches && workTypes.includes("panel"))) return "panel_batch";
        if (portalUsers.some((user) => user.username.trim()) || formData.paymentMode !== "pay_now") return "limited_company";
        if (workTypes.includes("crr")) return "service_online_partner";
        return "corporate";
    }, [formData.paymentMode, formData.sendsBatches, portalUsers, workTypes]);

    const selectedClientType = clientTypeOverride === "auto" ? recommendedClientType : clientTypeOverride;

    const paymentTermsDays = useMemo(() => {
        if (formData.paymentMode === "credit_60_working_days") return 60;
        if (formData.paymentMode === "pay_now") return 0;
        return 30;
    }, [formData.paymentMode]);

    const sampleImportMutation = useMutation({
        mutationFn: (file: File) => {
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith(".xlsx") || fileName.endsWith(".csv")) return corporateApi.parseExcel(file);
            if (fileName.endsWith(".docx")) return corporateApi.parseDocx(file);
            if (fileName.endsWith(".pptx")) return corporateApi.parsePptx(file);
            if (fileName.endsWith(".ppt")) throw new Error("Legacy .ppt files are not supported yet. Please upload .pptx, .docx, .xlsx, or .csv.");

            throw new Error("Unsupported file type. Please upload .xlsx, .csv, .docx, or .pptx.");
        },
        onSuccess: (data: any) => {
            const headers = Array.isArray(data.headers) ? data.headers : [];
            const rawRows = Array.isArray(data.rawRows) ? data.rawRows : [];
            const mapped = autoMapColumns(headers).mappings;
            setSampleHeaders(headers);
            setSampleRows(rawRows.slice(0, 5));
            setImportMappings(mapped);
            setIsMappingOpen(true);
            toast({
                title: "Sample File Read",
                description: `${headers.length} columns found. Review the import mapping before saving.`,
            });
        },
        onError: (error: Error) => {
            toast({ title: "Sample Import Failed", description: error.message, variant: "destructive" });
        },
    });

    const mutation = useMutation({
        mutationFn: async () => {
            const paymentTerms = paymentTermsDays;
            const defaultBatchClearanceDays = parseInt(formData.batchClearanceDays, 10);
            const defaultServiceWarrantyDays = formData.serviceWarrantyEnabled ? parseInt(formData.serviceWarrantyDays, 10) : 0;
            const preparedPortalUsers = portalUsers
                .map((user) => ({
                    name: user.name.trim(),
                    username: user.username.trim(),
                    password: user.password,
                    email: user.contact.includes("@") ? user.contact.trim() : "",
                    phone: user.contact.includes("@") ? "" : user.contact.trim(),
                }))
                .filter((user) => user.username && user.password);
            const primaryPortalUser = preparedPortalUsers[0];

            return corporateApi.create({
                companyName: formData.companyName.trim(),
                shortCode: formData.shortCode.trim().toUpperCase(),
                contactPerson: formData.contactPerson.trim(),
                contactPhone: formData.contactPhone ? `+880${formData.contactPhone}` : "",
                address: formData.address.trim(),
                billingCycle: formData.billingCycle,
                paymentTerms,
                portalUsername: primaryPortalUser?.username,
                portalPassword: primaryPortalUser?.password,
                portalUsers: preparedPortalUsers,
                clientClass: selectedClientType === "regular" ? "b2b_normal" : "b2b_corporate",
                clientType: selectedClientType,
                defaultBatchClearanceDays,
                serviceWarrantyEnabled: formData.serviceWarrantyEnabled,
                defaultServiceWarrantyDays,
                ruleProfile: {
                    allowedWorkTypes: workTypes,
                    sendsBatches: formData.sendsBatches,
                    requiresChallanIn: formData.requiresChallanIn,
                    requiresChallanOut: formData.requiresChallanOut,
                    creditAllowed: formData.creditAllowed,
                    paymentMode: formData.paymentMode,
                    paymentLabel: paymentModeLabels[formData.paymentMode],
                    partialPaymentRule: formData.partialPaymentRule.trim(),
                    crrRule: formData.crrRule,
                    reminderRule: formData.reminderRule,
                    notes: formData.notes.trim(),
                    importProfile: sampleHeaders.length ? {
                        sourceColumns: sampleHeaders,
                        mappings: importMappings,
                        sampleFileName,
                        lastConfirmedAt: new Date().toISOString(),
                        requiredFields: ["corporateJobNumber", "deviceBrand", "model", "serialNumber", "reportedDefect"],
                    } : undefined,
                },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporate-clients"] });
            const credentialReceipt = portalUsers
                .map((portalUser) => ({
                    name: portalUser.name.trim(),
                    username: portalUser.username.trim(),
                    password: portalUser.password,
                }))
                .filter((portalUser) => portalUser.username && portalUser.password);
            setCreatedClientCreds(credentialReceipt);
            toast({
                title: "Client Added",
                description: "B2B profile and working rules were saved.",
            });
            onOpenChange(false);
            setStep(1);
            setFormData(initialForm);
            setWorkTypes(["full_tv"]);
            setClientTypeOverride("auto");
            setPortalUsers([{ name: "", username: "", password: "", contact: "" }]);
            setSampleFileName("");
            setSampleHeaders([]);
            setSampleRows([]);
            setImportMappings([]);
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to Add Client",
                description: error.message || "An error occurred while creating the client.",
                variant: "destructive"
            });
        }
    });

    const toggleWorkType = (type: WorkType) => {
        setWorkTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
    };

    const setContactPhone = (value: string) => {
        const digits = value.replace(/\D/g, "").replace(/^880/, "").replace(/^0+/, "").slice(0, 10);
        setFormData({ ...formData, contactPhone: digits });
    };

    const updatePortalUser = (index: number, updates: Partial<PortalUserDraft>) => {
        setPortalUsers((current) => current.map((user, itemIndex) => itemIndex === index ? { ...user, ...updates } : user));
    };

    const addPortalUser = () => {
        setPortalUsers((current) => [...current, { name: "", username: "", password: "", contact: "" }]);
    };

    const removePortalUser = (index: number) => {
        setPortalUsers((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));
    };

    const nextStep = () => {
        if (step === 1 && (!formData.companyName.trim() || !formData.shortCode.trim())) {
            toast({ title: "Missing Details", description: "Company Name and Short Code are required.", variant: "destructive" });
            return;
        }
        if (step === 2 && workTypes.length === 0) {
            toast({ title: "Choose Work Type", description: "Select at least one goods/work type.", variant: "destructive" });
            return;
        }
        setStep((current) => Math.min(current + 1, wizardSteps.length));
    };

    const submit = () => {
        if (!formData.companyName.trim() || !formData.shortCode.trim()) {
            toast({ title: "Missing Details", description: "Company Name and Short Code are required.", variant: "destructive" });
            return;
        }
        mutation.mutate();
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-screen w-screen max-w-none overflow-hidden p-0 sm:rounded-none">
                <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[280px_1fr]">
                    <aside className="shrink-0 overflow-hidden border-r bg-slate-950 p-4 text-white lg:p-5">
                        <DialogHeader className="space-y-1">
                            <DialogTitle className="text-2xl text-white lg:text-xl">Add B2B Client</DialogTitle>
                            <DialogDescription className="text-slate-300 lg:text-xs">
                                Create the client profile, working rules, batch clearance, and portal setup.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="mt-4 rounded-xl bg-white/5 p-3 lg:mt-5 lg:p-2.5">
                            <div className="mb-3 flex items-center justify-between gap-3 lg:mb-2">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Setup progress</div>
                                    <div className="text-sm font-bold text-white">Step {step} of {wizardSteps.length}</div>
                                    <div className="mt-0.5 text-[11px] font-semibold text-emerald-200">Recommended: {clientTypeLabels[recommendedClientType]}</div>
                                </div>
                                <div className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-black text-emerald-200">
                                    {Math.round((step / wizardSteps.length) * 100)}%
                                </div>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${(step / wizardSteps.length) * 100}%` }} />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-3 lg:block lg:space-y-1">
                            {wizardSteps.map((label, index) => {
                                const number = index + 1;
                                const isActive = step === number;
                                const isDone = step > number;
                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setStep(number)}
                                        className={`group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition lg:w-full lg:py-1.5 ${isActive ? "border-emerald-400 bg-emerald-400/10" : isDone ? "border-emerald-400/20 bg-emerald-400/5 hover:bg-emerald-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/10"}`}
                                    >
                                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black lg:h-5 lg:w-5 lg:text-[10px] ${isActive ? "bg-emerald-400 text-slate-950" : isDone ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-slate-300"}`}>
                                            {number}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-bold text-white lg:text-sm">{label}</span>
                                            <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-slate-500 2xl:block">
                                                {isDone ? "Done" : isActive ? "Current" : "Pending"}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 overflow-y-auto p-6">
                            {step === 1 && (
                                <div className="mx-auto max-w-3xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Company basics</h2>
                                        <p className="text-sm text-slate-500">Only ask what the manager needs to start the relationship.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <Field label="Company Name" required>
                                            <Input value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} placeholder="1000FIX" />
                                        </Field>
                                        <Field label="Short Code" required>
                                            <Input value={formData.shortCode} onChange={(e) => setFormData({ ...formData, shortCode: e.target.value.toUpperCase() })} placeholder="1KF" maxLength={8} />
                                        </Field>
                                        <Field label="Primary Contact">
                                            <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} placeholder="Contact name" />
                                        </Field>
                                        <Field label="Contact Phone">
                                            <div className="flex rounded-md border border-input bg-white">
                                                <div className="flex items-center border-r bg-slate-50 px-3 text-sm font-bold text-slate-600">+880</div>
                                                <Input className="border-0 focus-visible:ring-0" inputMode="numeric" value={formData.contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="1XXXXXXXXX" />
                                            </div>
                                        </Field>
                                        <div className="md:col-span-2">
                                            <Field label="Billing Address">
                                                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Full address" />
                                            </Field>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {step === 2 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">What do they give us?</h2>
                                        <p className="text-sm text-slate-500">This decides the recommended client type and allowed intake flow.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        {(Object.keys(workTypeLabels) as WorkType[]).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => toggleWorkType(type)}
                                                className={`rounded-lg border p-4 text-left transition ${workTypes.includes(type) ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="font-semibold text-slate-900">{workTypeLabels[type]}</span>
                                                    {workTypes.includes(type) && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="rounded-lg border bg-slate-50 p-4">
                                        <Label>Client Type</Label>
                                        <Select value={clientTypeOverride} onValueChange={(value) => setClientTypeOverride(value as ClientType | "auto")}>
                                            <SelectTrigger className="mt-2 bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="auto">Auto Recommend: {clientTypeLabels[recommendedClientType]}</SelectItem>
                                                {(Object.keys(clientTypeLabels) as ClientType[]).map((type) => (
                                                    <SelectItem key={type} value={type}>{clientTypeLabels[type]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}

                            {step === 3 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Working rules</h2>
                                        <p className="text-sm text-slate-500">Rules keep batch clearance, service warranty, CRR, and billing reminders visible.</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <Field label="Batch Clearance Days">
                                            <Input type="number" min={1} value={formData.batchClearanceDays} onChange={(e) => setFormData({ ...formData, batchClearanceDays: e.target.value })} />
                                        </Field>
                                        <Field label="Billing Cycle">
                                            <Select value={formData.billingCycle} onValueChange={(value) => setFormData({ ...formData, billingCycle: value })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="weekly">Weekly</SelectItem>
                                                    <SelectItem value="monthly">Monthly</SelectItem>
                                                    <SelectItem value="batch">Per Batch</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <RuleCheck label="Sends work in batches" checked={formData.sendsBatches} onChange={(checked) => setFormData({ ...formData, sendsBatches: checked })} />
                                        <RuleCheck label="Requires challan in" checked={formData.requiresChallanIn} onChange={(checked) => setFormData({ ...formData, requiresChallanIn: checked })} />
                                        <RuleCheck label="Requires challan out" checked={formData.requiresChallanOut} onChange={(checked) => setFormData({ ...formData, requiresChallanOut: checked })} />
                                    </div>
                                    <Field label="Client Notes">
                                        <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Special CRR, billing, or batch communication rules" />
                                    </Field>
                                </div>
                            )}

                            {step === 4 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Payment rules</h2>
                                        <p className="text-sm text-slate-500">Choose how this client normally clears bills.</p>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {(Object.keys(paymentModeLabels) as PaymentMode[]).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, paymentMode: mode, creditAllowed: mode !== "pay_now" })}
                                                className={`rounded-xl border p-4 text-left transition ${formData.paymentMode === mode ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                            >
                                                <div className="font-bold text-slate-900">{paymentModeLabels[mode]}</div>
                                                <div className="mt-1 text-xs text-slate-500">{mode === "pay_now" ? "No credit by default." : mode.includes("partial") ? "Some paid now, remaining bill tracked." : "Credit/reminder flow enabled."}</div>
                                            </button>
                                        ))}
                                    </div>
                                    {(formData.paymentMode === "partial_now_partial_credit" || formData.paymentMode === "custom") && (
                                        <Field label="Payment Rule Note">
                                            <Textarea value={formData.partialPaymentRule} onChange={(e) => setFormData({ ...formData, partialPaymentRule: e.target.value })} placeholder="Example: 40% on delivery, remaining in 30 working days." />
                                        </Field>
                                    )}
                                    <RuleCheck label="Credit allowed" checked={formData.creditAllowed} onChange={(checked) => setFormData({ ...formData, creditAllowed: checked })} />
                                </div>
                            )}

                            {step === 5 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Service warranty + CRR / Re-service</h2>
                                        <p className="text-sm text-slate-500">CRR is connected to service warranty. No-service-warranty must stay explicit.</p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <RuleCheck label="Service warranty enabled" checked={formData.serviceWarrantyEnabled} onChange={(checked) => setFormData({ ...formData, serviceWarrantyEnabled: checked })} />
                                        <Field label="Service Warranty Days">
                                            <Input type="number" min={0} disabled={!formData.serviceWarrantyEnabled} value={formData.serviceWarrantyDays} onChange={(e) => setFormData({ ...formData, serviceWarrantyDays: e.target.value })} />
                                        </Field>
                                    </div>
                                    <Field label="CRR / Re-service Rule">
                                        <Select value={formData.crrRule} onValueChange={(value) => setFormData({ ...formData, crrRule: value })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="no_charge_inside_service_warranty">No charge inside service warranty</SelectItem>
                                                <SelectItem value="admin_review_outside_service_warranty">Admin review outside service warranty</SelectItem>
                                                <SelectItem value="manual_approval_every_crr">Manual approval for every CRR</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                </div>
                            )}

                            {step === 6 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Portal users</h2>
                                        <p className="text-sm text-slate-500">Create one or more logins for the same corporate client.</p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <Label>Portal Users</Label>
                                            <Button type="button" variant="outline" size="sm" onClick={addPortalUser}>Add User</Button>
                                        </div>
                                        {portalUsers.map((portalUser, index) => (
                                            <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                                                <Input value={portalUser.name} onChange={(e) => updatePortalUser(index, { name: e.target.value })} placeholder="Person name" />
                                                <Input value={portalUser.contact} onChange={(e) => updatePortalUser(index, { contact: e.target.value })} placeholder="Phone or email" />
                                                <Input value={portalUser.username} onChange={(e) => updatePortalUser(index, { username: e.target.value })} placeholder="Username" />
                                                <Input type="password" value={portalUser.password} onChange={(e) => updatePortalUser(index, { password: e.target.value })} placeholder="Password" />
                                                <Button type="button" variant="ghost" disabled={portalUsers.length === 1} onClick={() => removePortalUser(index)}>Remove</Button>
                                            </div>
                                        ))}
                                        <p className="text-xs text-slate-500">Leave all portal user fields blank if portal access should be created later.</p>
                                    </div>
                                </div>
                            )}

                            {step === 7 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Sample import file</h2>
                                        <p className="text-sm text-slate-500">Upload one client Office file so the system can learn their format.</p>
                                    </div>
                                    <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
                                        <input
                                            id="client-sample-import"
                                            type="file"
                                            accept=".xlsx,.csv,.docx,.pptx"
                                            className="hidden"
                                            onChange={(event) => {
                                                const file = event.currentTarget.files?.[0];
                                                if (!file) return;
                                                setSampleFileName(file.name);
                                                sampleImportMutation.mutate(file);
                                                event.currentTarget.value = "";
                                            }}
                                        />
                                        <Button type="button" disabled={sampleImportMutation.isPending} onClick={() => document.getElementById("client-sample-import")?.click()}>
                                            {sampleImportMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Upload Sample File
                                        </Button>
                                        <div className="mt-4 text-sm text-slate-600">{sampleFileName || "No sample file uploaded yet."}</div>
                                        {sampleHeaders.length > 0 && <div className="mt-2 text-xs text-slate-500">{sampleHeaders.length} columns detected. Mapping is ready for review.</div>}
                                    </div>
                                </div>
                            )}

                            {step === 8 && (
                                <div className="mx-auto max-w-5xl space-y-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-900">Import mapping</h2>
                                            <p className="text-sm text-slate-500">Wire client columns to Promise fields. This mapping will be reused in Receive Work.</p>
                                        </div>
                                        <Button type="button" variant="outline" disabled={sampleHeaders.length === 0} onClick={() => setIsMappingOpen(true)}>Open Mapping GUI</Button>
                                    </div>
                                    {sampleHeaders.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">Upload a sample file first. You can also skip and create mapping later during Receive Work.</div>
                                    ) : (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {importMappings.map((mapping, index) => (
                                                <div key={`${mapping.sourceColumn || mapping.targetField || "fallback"}-${index}`} className="rounded-xl border bg-white p-4">
                                                    <div className="text-xs uppercase text-slate-400">Promise source</div>
                                                    <div className="font-bold text-slate-900">
                                                        {(mapping.sourceType || "column") === "column" && (mapping.sourceColumn || "No column selected")}
                                                        {mapping.sourceType === "default" && `Fixed value: ${mapping.defaultValue || "Not set"}`}
                                                        {mapping.sourceType === "auto" && "Auto-detect from row"}
                                                        {mapping.sourceType === "review" && "Ask during row review"}
                                                    </div>
                                                    <div className="mt-3 text-xs uppercase text-slate-400">Promise field</div>
                                                    <div className="font-semibold text-emerald-700">{mapping.targetField || "Ignored"}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {step === 9 && (
                                <div className="mx-auto max-w-4xl space-y-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-900">Final review</h2>
                                        <p className="text-sm text-slate-500">Save only after the profile reflects the real relationship.</p>
                                    </div>
                                    <div className="rounded-lg border bg-white p-5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge>{clientTypeLabels[selectedClientType]}</Badge>
                                            <Badge variant="outline">{formData.batchClearanceDays} day batch clearance</Badge>
                                            <Badge variant="outline">{formData.serviceWarrantyEnabled ? `${formData.serviceWarrantyDays} day service warranty` : "No service warranty"}</Badge>
                                            <Badge variant="outline">{paymentModeLabels[formData.paymentMode]}</Badge>
                                            {sampleHeaders.length > 0 && <Badge variant="outline">{sampleHeaders.length} import columns mapped</Badge>}
                                        </div>
                                        <div className="mt-4 text-sm text-slate-600">
                                            {workTypes.map((type) => workTypeLabels[type]).join(", ")}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="!flex-row items-center justify-between gap-3 border-t bg-white p-4 sm:space-x-0">
                            <Button type="button" variant="outline" onClick={() => step === 1 ? onOpenChange(false) : setStep((current) => current - 1)}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                {step === 1 ? "Cancel" : "Back"}
                            </Button>
                            {step < wizardSteps.length ? (
                                <Button type="button" onClick={nextStep}>
                                    Next
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            ) : (
                                <Button type="button" onClick={submit} disabled={mutation.isPending}>
                                    {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Client
                                </Button>
                            )}
                        </DialogFooter>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        <ColumnMappingDialog
            open={isMappingOpen}
            onOpenChange={setIsMappingOpen}
            uploadedHeaders={sampleHeaders}
            initialMappings={importMappings}
            sampleRows={sampleRows}
            title="Client Import Mapping"
            description="Map this client's Excel columns to Promise fields. Saved mapping will be used in Receive Work."
            onConfirm={(mappings) => {
                setImportMappings(mappings);
                setIsMappingOpen(false);
            }}
        />
        <Dialog open={createdClientCreds.length > 0} onOpenChange={(nextOpen) => !nextOpen && setCreatedClientCreds([])}>
            <DialogContent className="max-w-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle>Portal Credential Receipt</DialogTitle>
                    <DialogDescription>
                        Copy these portal credentials now. Passwords are not recoverable after this screen is closed.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {createdClientCreds.map((credential) => (
                        <div key={credential.username} className="grid gap-2 rounded-xl border bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr]">
                            <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Name</div>
                                <div className="font-semibold text-slate-900">{credential.name || "Portal User"}</div>
                            </div>
                            <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Username</div>
                                <div className="font-mono text-sm text-blue-700">{credential.username}</div>
                            </div>
                            <div>
                                <div className="text-xs font-bold uppercase text-slate-400">Password</div>
                                <div className="font-mono text-sm font-bold text-emerald-700">{credential.password}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => navigator.clipboard.writeText(createdClientCreds.map((credential) => `${credential.name || "Portal User"}\nUsername: ${credential.username}\nPassword: ${credential.password}`).join("\n\n"))}
                    >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy All
                    </Button>
                    <Button onClick={() => setCreatedClientCreds([])}>Done</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <Label>{label} {required && <span className="text-red-500">*</span>}</Label>
            {children}
        </div>
    );
}

function RuleCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-4">
            <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
            <span className="font-medium text-slate-800">{label}</span>
        </label>
    );
}
