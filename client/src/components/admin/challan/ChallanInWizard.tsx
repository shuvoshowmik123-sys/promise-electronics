import { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, ArrowRight, ArrowLeft, AlertCircle, WrenchIcon, Search } from "lucide-react";
import { DeviceEntryTable } from "./DeviceEntryTable";
import { FixMissingDataModal } from "./FixMissingDataModal";
import { Device, getIncompleteRows, validateDevice } from "./validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChallanMetadata } from "./types";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ColumnMappingDialog } from "@/components/corporate/ColumnMappingDialog";
import { applyMapping, autoMapColumns, type FieldMapping } from "@/lib/columnMapper";

interface Props {
    clientId: string;
    onClose: () => void;
    userName: string;
}

type WorkItemType = "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";

const workTypeOptions: {
    value: WorkItemType;
    label: string;
    helper: string;
    ticketType: "full_device" | "panel_only" | "motherboard_only" | "parts_only";
    jobType: "standard" | "warranty_claim";
}[] = [
    { value: "full_tv", label: "Full TV", helper: "Complete TV received for service.", ticketType: "full_device", jobType: "standard" },
    { value: "panel", label: "Panel", helper: "Single panel service work.", ticketType: "panel_only", jobType: "standard" },
    { value: "panel_batch", label: "Panel Batch", helper: "Multiple panels from one challan.", ticketType: "panel_only", jobType: "standard" },
    { value: "board", label: "Board", helper: "Board or motherboard repair.", ticketType: "motherboard_only", jobType: "standard" },
    { value: "parts", label: "Parts", helper: "Parts received for service work.", ticketType: "parts_only", jobType: "standard" },
    { value: "parts_sale", label: "Parts Sale", helper: "Parts sold or supplied to client.", ticketType: "parts_only", jobType: "standard" },
    { value: "crr", label: "CRR / Reservice", helper: "Returned service warranty work.", ticketType: "full_device", jobType: "warranty_claim" },
];

export function ChallanInWizard({ clientId, onClose, userName }: Props) {
    const [step, setStep] = useState(1);
    const [workType, setWorkType] = useState<WorkItemType>("full_tv");
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Step 1: Metadata State
    const [metadata, setMetadata] = useState<ChallanMetadata>({
        receivedDate: new Date(),
        receivedBy: userName,
        notes: "",
        vehicleNo: "",
        driverName: ""
    });

    // Step 2: Devices State
    const [devices, setDevices] = useState<Device[]>([]);
    const [importFileName, setImportFileName] = useState("");
    const [importError, setImportError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [mappingOpen, setMappingOpen] = useState(false);
    const [pendingHeaders, setPendingHeaders] = useState<string[]>([]);
    const [pendingRows, setPendingRows] = useState<Record<string, string>[]>([]);
    const [pendingMappings, setPendingMappings] = useState<FieldMapping[]>([]);

    // Fix Data Modal State
    const [showFixModal, setShowFixModal] = useState(false);

    // Calculate incomplete rows
    const incompleteRows = useMemo(() => getIncompleteRows(devices), [devices]);
    const validRowsCount = devices.length - incompleteRows.length;
    const ignoredRowsCount = devices.filter((device) => device.reviewAction === "ignore").length;
    const duplicateRowsCount = devices.filter((device) => Boolean(device.duplicateHint)).length;
    const crrRowsCount = devices.filter((device) => device.reviewAction === "crr").length;

    const { data: client } = useQuery({
        queryKey: ["corporateClient", clientId],
        queryFn: () => corporateApi.getOne(clientId),
        enabled: Boolean(clientId),
    });

    const { data: existingJobsResult } = useQuery({
        queryKey: ["corporateJobs", clientId, "duplicate-precheck"],
        queryFn: () => corporateApi.getClientJobs(clientId, 1, 1000),
        enabled: Boolean(clientId),
    });

    const existingJobs = existingJobsResult?.jobs || [];
    const importProfile = ((client as any)?.ruleProfile || {}).importProfile as { mappings?: FieldMapping[]; sourceColumns?: string[]; sampleFileName?: string } | undefined;

    const enrichDevice = (device: Device): Device => {
        const serial = device.serialNumber?.trim().toLowerCase();
        const jobRef = device.corporateJobNumber?.trim().toLowerCase();
        const matchedJob = existingJobs.find((job: any) => {
            const oldSerial = String(job.tvSerialNumber || "").trim().toLowerCase();
            const oldRef = String(job.corporateJobNumber || "").trim().toLowerCase();
            return (serial && oldSerial && serial === oldSerial) || (jobRef && oldRef && jobRef === oldRef);
        });

        if (!matchedJob) return device;

        return {
            ...device,
            duplicateHint: `Previous job ${matchedJob.id || matchedJob.corporateJobNumber}`,
            duplicateMatchJobId: matchedJob.id,
            reviewAction: device.reviewAction || "new_job",
        };
    };

    const normalizeStatus = (status?: string, initialStatus?: string): Pick<Device, "initialStatus" | "status"> => {
        const text = String(status || initialStatus || "").toLowerCase().trim();
        if (["ok", "okay", "declared ok", "done", "ready"].includes(text)) return { initialStatus: "OK", status: "Declared OK" };
        if (["ng", "not good", "not ok", "declared ng", "declared not ok", "bad"].includes(text)) return { initialStatus: "NG", status: "Declared NG" };
        if (["pending", "hold", "waiting"].includes(text)) return { initialStatus: "NG", status: "Pending" };
        return { initialStatus: "NG", status: "Received" };
    };

    const rowsToDevices = (rows: any[]) => rows.map((row) => {
        const status = normalizeStatus(row.status, row.initialStatus);
        return enrichDevice({
            id: crypto.randomUUID(),
            corporateJobNumber: String(row.corporateJobNumber || row.externalJobRef || "").trim(),
            deviceBrand: String(row.deviceBrand || row.brand || "").trim(),
            model: String(row.model || "").trim(),
            serialNumber: String(row.serialNumber || "").trim(),
            reportedDefect: String(row.reportedDefect || row.problem || row.issue || "").trim(),
            initialStatus: status.initialStatus,
            status: status.status,
            customerName: row.customerName,
            externalJobRef: row.externalJobRef,
            challanNumber: row.challanNumber,
            itemType: row.itemType,
            batchNumber: row.batchNumber,
            receivedDate: row.receivedDate,
        });
    });

    const saveImportProfileMutation = useMutation({
        mutationFn: (mappings: FieldMapping[]) => {
            const existingRuleProfile = ((client as any)?.ruleProfile || {}) as Record<string, unknown>;
            return corporateApi.updateRules(clientId, {
                clientType: (client as any)?.clientType || "corporate",
                defaultBatchClearanceDays: Number((client as any)?.defaultBatchClearanceDays || 7),
                serviceWarrantyEnabled: (client as any)?.serviceWarrantyEnabled !== false,
                defaultServiceWarrantyDays: Number((client as any)?.defaultServiceWarrantyDays || 30),
                clientClass: (client as any)?.clientClass,
                paymentTerms: Number((client as any)?.paymentTerms || 30),
                billingCycle: (client as any)?.billingCycle || "monthly",
                ruleProfile: {
                    ...existingRuleProfile,
                    importProfile: {
                        sourceColumns: pendingHeaders,
                        mappings,
                        sampleFileName: importFileName,
                        lastConfirmedAt: new Date().toISOString(),
                        requiredFields: ["corporateJobNumber", "deviceBrand", "model", "serialNumber", "reportedDefect"],
                    },
                },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporateClient", clientId] });
            queryClient.invalidateQueries({ queryKey: ["corporate-clients"] });
        },
    });

    // Mutation
    const createChallanInMutation = useMutation({
        mutationFn: async () => {
            if (devices.length === 0) throw new Error("No devices added");
            const selectedType = workTypeOptions.find((type) => type.value === workType) || workTypeOptions[0];

            const items = devices.filter((device) => device.reviewAction !== "ignore").map(d => ({
                corporateJobNumber: d.corporateJobNumber,
                deviceModel: `${d.deviceBrand} ${d.model}`, // Combine for backward compatibility
                serialNumber: d.serialNumber,
                initialStatus: d.initialStatus,
                reportedDefect: d.reportedDefect,
                status: d.status || (d.initialStatus === "OK" ? "Declared OK" : d.initialStatus === "NG" ? "Declared NG" : "Received"),
                workType,
                ticketType: selectedType.ticketType,
                jobType: d.reviewAction === "crr" || workType === "crr" ? "warranty_claim" : selectedType.jobType,
                parentJobId: d.duplicateMatchJobId,
                crrReviewStatus: d.reviewAction,
                crrReason: d.crrReason,
            }));

            return corporateApi.createChallanIn({
                corporateClientId: clientId,
                workType,
                items,
                receivedBy: metadata.receivedBy,
                receivedAt: metadata.receivedDate
            });
        },
        onSuccess: (data) => {
            toast({ title: "Incoming Work Added", description: `Successfully imported ${data.jobIds.length} items.` });
            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            onClose();
        },
        onError: (err) => {
            toast({ variant: "destructive", title: "Failed to create", description: err.message });
        }
    });

    // File Parsing Mutation (handles both Excel and DOCX)
    const parseFileMutation = useMutation({
        mutationFn: async (file: File) => {
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
                return corporateApi.parseExcel(file, { clientId });
            } else if (fileName.endsWith('.docx')) {
                return corporateApi.parseDocx(file);
            } else if (fileName.endsWith('.pptx')) {
                return corporateApi.parsePptx(file);
            } else if (fileName.endsWith('.ppt')) {
                throw new Error("Legacy .ppt files are not supported yet. Please upload .pptx, .docx, .xlsx, or .csv.");
            } else {
                throw new Error("Unsupported file type. Please upload .xlsx, .csv, .docx, or .pptx");
            }
        },
        onSuccess: (data) => {
            setImportError("");
            const headers = Array.isArray(data.headers) ? data.headers : [];
            const rawRows = Array.isArray(data.rawRows) ? data.rawRows : [];
            const savedMappings = importProfile?.mappings || [];
            const savedColumns = importProfile?.sourceColumns || [];
            const canUseSavedMapping = savedMappings.length > 0 && savedColumns.every((column) => headers.includes(column));

            if (rawRows.length > 0 && headers.length > 0 && !canUseSavedMapping) {
                setPendingHeaders(headers);
                setPendingRows(rawRows);
                setPendingMappings(autoMapColumns(headers).mappings);
                setMappingOpen(true);
                toast({ title: "Review Mapping", description: "This file format needs mapping before rows are added." });
                return;
            }

            const mappedRows = rawRows.length > 0 && canUseSavedMapping ? applyMapping(rawRows, savedMappings) : data.devices;
            const newDevices = rowsToDevices(mappedRows || []);

            const invalidCount = newDevices.filter((d: any) => !d.corporateJobNumber).length;
            if (invalidCount > 0) {
                toast({
                    variant: "destructive",
                    title: "Import Warning",
                    description: `${invalidCount} devices are missing Job Reference Numbers. Please edit them in the table before submitting.`
                });
            } else {
                toast({ title: "Import Successful", description: `Added ${newDevices.length} devices from file.` });
            }

            setDevices(prev => [...prev, ...newDevices]);
        },
        onError: (err) => {
            setImportError(err.message);
            toast({ variant: "destructive", title: "Import Failed", description: err.message });
        }
    });

    const handleFileUpload = (file: File) => {
        setImportFileName(file.name);
        setImportError("");
        parseFileMutation.mutate(file);
    };

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const hasInvalidDevices = devices.filter((device) => device.reviewAction !== "ignore").some(d => !validateDevice(d).isComplete);
    const visibleRowsCount = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return devices.length;
        return devices.filter((device, index) => [
            index + 1,
            device.corporateJobNumber,
            device.deviceBrand,
            device.model,
            device.serialNumber,
            device.reportedDefect,
            device.status,
            device.duplicateHint,
            device.reviewAction,
        ].filter(Boolean).join(" ").toLowerCase().includes(query)).length;
    }, [devices, searchQuery]);

    return (
        <div className="flex h-full min-h-0 flex-col bg-white">
            {/* Wizard Header / Stepper */}
            <div className="shrink-0 border-b bg-slate-950 px-6 py-4 text-white">
                <div className="flex justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold">
                        {step === 1 && "Choose Work Type"}
                        {step === 2 && "Receive Details"}
                        {step === 3 && "Add Items"}
                        {step === 4 && "Review & Submit"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Step {step} of 4
                    </p>
                </div>

                {/* Progress Visual */}
                <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className={`h-2 w-12 rounded-full ${step >= s ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    ))}
                </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
                {step === 1 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                        {workTypeOptions.map((type) => (
                            <button
                                key={type.value}
                                type="button"
                                onClick={() => setWorkType(type.value)}
                                className={`rounded-xl border p-4 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/50 ${workType === type.value ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20" : "border-slate-200 bg-white"}`}
                            >
                                <div className="font-bold text-slate-900">{type.label}</div>
                                <div className="mt-1 text-xs text-slate-500">{type.helper}</div>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4 max-w-md mx-auto py-4">
                        <div className="grid gap-2">
                            <Label>Received By</Label>
                            <Input
                                value={metadata.receivedBy}
                                onChange={e => setMetadata({ ...metadata, receivedBy: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label>Received Date</Label>
                            <Input
                                type="date"
                                value={metadata.receivedDate.toISOString().split('T')[0]}
                                onChange={(e) => {
                                    const date = e.target.value ? new Date(e.target.value) : new Date();
                                    setMetadata({ ...metadata, receivedDate: date });
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Vehicle No (Optional)</Label>
                                <Input
                                    value={metadata.vehicleNo}
                                    onChange={e => setMetadata({ ...metadata, vehicleNo: e.target.value })}
                                    placeholder="e.g. DHA-GA-12..."
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Driver Name (Optional)</Label>
                                <Input
                                    value={metadata.driverName}
                                    onChange={e => setMetadata({ ...metadata, driverName: e.target.value })}
                                    placeholder="Name of driver"
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label>Extra Notes</Label>
                            <Textarea
                                value={metadata.notes}
                                onChange={e => setMetadata({ ...metadata, notes: e.target.value })}
                                placeholder="Any special instructions..."
                            />
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4">
                        {incompleteRows.length > 0 && (
                            <Alert variant="destructive" className="mb-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Incomplete Data Detected</AlertTitle>
                                <AlertDescription className="flex items-center justify-between mt-2">
                                    <span>{incompleteRows.length} rows are missing required fields</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-white/80 hover:bg-white text-destructive border-destructive/50"
                                        onClick={() => setShowFixModal(true)}
                                    >
                                        <WrenchIcon className="mr-2 h-4 w-4" />
                                        Fix Missing Data
                                    </Button>
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">{devices.length} rows added</span>
                                    {searchQuery && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{visibleRowsCount} matching</span>}
                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{validRowsCount} valid</span>
                                    {incompleteRows.length > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">{incompleteRows.length} incomplete</span>}
                                    {duplicateRowsCount > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{duplicateRowsCount} duplicate/CRR checks</span>}
                                    {crrRowsCount > 0 && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{crrRowsCount} CRR / Re-service</span>}
                                    {ignoredRowsCount > 0 && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">{ignoredRowsCount} ignored</span>}
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    Received date: {metadata.receivedDate.toLocaleDateString()} · auto-filled from system date
                                </div>
                            </div>
                            <input
                                type="file"
                                id="excel-upload"
                                className="hidden"
                                accept=".xlsx, .csv, .docx, .pptx"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                    e.currentTarget.value = "";
                                }}
                            />
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => document.getElementById('excel-upload')?.click()} disabled={parseFileMutation.isPending}>
                                {parseFileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                Import File
                            </Button>
                        </div>

                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Smart search rows by serial, model, problem, customer, ref, NG, CRR, missing, or any word..."
                                className="h-11 rounded-xl pl-10"
                            />
                        </div>

                        {(importFileName || parseFileMutation.isPending || importError) && (
                            <div className={`rounded-xl border p-3 text-sm ${importError ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                                <div className="font-semibold">
                                    {parseFileMutation.isPending ? "Importing file..." : importError ? "Import failed" : "File imported"}
                                </div>
                                {importFileName && <div className="mt-1 break-all text-xs opacity-80">{importFileName}</div>}
                                {!importError && !parseFileMutation.isPending && <div className="mt-1 text-xs opacity-80">{devices.length} total rows currently in this challan.</div>}
                                {importError && <div className="mt-2 text-xs">{importError}</div>}
                            </div>
                        )}

                        <DeviceEntryTable
                            devices={devices}
                            searchQuery={searchQuery}
                            onAddDevice={d => setDevices([...devices, enrichDevice(d)])}
                            onRemoveDevice={idx => setDevices(devices.filter((_, i) => i !== idx))}
                            onUpdateDevice={(idx, updated) => {
                                const newDevices = [...devices];
                                newDevices[idx] = updated;
                                setDevices(newDevices);
                            }}
                        />
                    </div>
                )}

                {/* Fix Missing Data Modal */}
                <FixMissingDataModal
                    open={showFixModal}
                    onClose={() => setShowFixModal(false)}
                    incompleteRows={incompleteRows}
                    onUpdateDevice={(idx, updated) => {
                        const newDevices = [...devices];
                        newDevices[idx] = updated;
                        setDevices(newDevices);
                    }}
                    onRemoveDevice={(idx) => setDevices(devices.filter((_, i) => i !== idx))}
                />

                {step === 4 && (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border">
                            <h3 className="font-semibold mb-2">Summary</h3>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-muted-foreground">Work Type:</span>
                                <span className="font-medium">{workTypeOptions.find((type) => type.value === workType)?.label}</span>

                                <span className="text-muted-foreground">Total Devices:</span>
                                <span className="font-medium text-lg">{devices.length}</span>

                                <span className="text-muted-foreground">Submitting:</span>
                                <span className="font-medium">{devices.length - ignoredRowsCount}</span>

                                <span className="text-muted-foreground">CRR / Re-service:</span>
                                <span>{crrRowsCount}</span>

                                <span className="text-muted-foreground">Received By:</span>
                                <span>{metadata.receivedBy}</span>

                                <span className="text-muted-foreground">Notes:</span>
                                <span>{metadata.notes || "None"}</span>
                            </div>
                        </div>

                        {hasInvalidDevices && (
                            <div className="bg-destructive/10 p-3 rounded-md text-destructive text-sm font-medium">
                                Error: {devices.filter(d => !d.corporateJobNumber).length} items are missing a Job Reference number. Please go back and fix them.
                            </div>
                        )}

                        <div className="border rounded-md overflow-hidden opacity-80">
                            {/* Mini Read-Only Table Preview */}
                            <table className="w-full text-sm">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="p-2 text-left">Ref</th>
                                        <th className="p-2 text-left">Device</th>
                                        <th className="p-2 text-left">Serial</th>
                                        <th className="p-2 text-left">Status</th>
                                        <th className="p-2 text-left">Issue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map((d, i) => (
                                        <tr key={i} className="border-t">
                                            <td className={`p-2 ${!d.corporateJobNumber ? 'bg-destructive/10 text-destructive' : ''}`}>
                                                {d.corporateJobNumber || "MISSING"}
                                            </td>
                                            <td className="p-2">{d.deviceBrand} {d.model}</td>
                                            <td className="p-2 font-mono text-xs">{d.serialNumber || "MISSING"}</td>
                                            <td className="p-2">{d.status === "Received" ? "New" : d.status === "Declared OK" ? "OK" : d.status === "Declared NG" ? "NG" : d.status || "New"}</td>
                                            <td className="p-2">
                                                <div>{d.reportedDefect}</div>
                                                {d.duplicateHint && <Badge variant="outline" className="mt-1 border-amber-300 bg-amber-50 text-amber-700">{d.reviewAction || "review"} · {d.duplicateHint}</Badge>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Wizard Footer */}
            <div className="border-t pt-4 mt-2 flex justify-between">
                {step > 1 ? (
                    <Button variant="ghost" onClick={prevStep}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                    </Button>
                ) : (
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                )}

                {step < 4 ? (
                    <Button onClick={nextStep} disabled={step === 3 && devices.length === 0}>
                        Next
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                ) : (
                    <Button
                        onClick={() => createChallanInMutation.mutate()}
                        disabled={createChallanInMutation.isPending || devices.length === 0 || hasInvalidDevices}
                    >
                        {createChallanInMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm & Submit
                    </Button>
                )}
            </div>
            <ColumnMappingDialog
                open={mappingOpen}
                onOpenChange={setMappingOpen}
                uploadedHeaders={pendingHeaders}
                initialMappings={pendingMappings}
                sampleRows={pendingRows.slice(0, 5)}
                title="Review Receive Work Mapping"
                description="Map this client's file columns before adding rows to the intake table."
                onConfirm={(mappings) => {
                    const mappedRows = applyMapping(pendingRows, mappings);
                    setDevices((prev) => [...prev, ...rowsToDevices(mappedRows)]);
                    setPendingMappings(mappings);
                    setMappingOpen(false);
                    saveImportProfileMutation.mutate(mappings);
                }}
            />
        </div>
    );
}
