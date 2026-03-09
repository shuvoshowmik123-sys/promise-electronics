import { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, ArrowRight, ArrowLeft, Plus, AlertCircle, WrenchIcon } from "lucide-react";
import { DeviceEntryTable } from "./DeviceEntryTable";
import { FixMissingDataModal } from "./FixMissingDataModal";
import { getIncompleteRows, validateDevice } from "./validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChallanDevice, ChallanMetadata } from "./types";
import { Textarea } from "@/components/ui/textarea";

interface Props {
    clientId: string;
    onClose: () => void;
    userName: string;
}

export function ChallanInWizard({ clientId, onClose, userName }: Props) {
    const [step, setStep] = useState(1);
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
    const [devices, setDevices] = useState<ChallanDevice[]>([]);

    // Fix Data Modal State
    const [showFixModal, setShowFixModal] = useState(false);

    // Calculate incomplete rows
    const incompleteRows = useMemo(() => getIncompleteRows(devices), [devices]);

    // Mutation
    const createChallanInMutation = useMutation({
        mutationFn: async () => {
            if (devices.length === 0) throw new Error("No devices added");

            const items = devices.map(d => ({
                corporateJobNumber: d.corporateJobNumber,
                deviceModel: `${d.deviceBrand} ${d.model}`, // Combine for backward compatibility
                serialNumber: d.serialNumber,
                initialStatus: d.initialStatus,
                reportedDefect: d.reportedDefect
            }));

            return corporateApi.createChallanIn({
                corporateClientId: clientId,
                items,
                receivedBy: metadata.receivedBy
            });
        },
        onSuccess: (data) => {
            toast({ title: "Challan IN Created", description: `Successfully imported ${data.jobIds.length} devices.` });
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
                return corporateApi.parseExcel(file);
            } else if (fileName.endsWith('.docx')) {
                return corporateApi.parseDocx(file);
            } else {
                throw new Error("Unsupported file type. Please upload .xlsx, .csv, or .docx");
            }
        },
        onSuccess: (data) => {
            const newDevices = data.devices.map((d: any) => ({
                id: crypto.randomUUID(),
                corporateJobNumber: d.corporateJobNumber,
                deviceBrand: d.deviceBrand || "Unknown",
                model: d.model || "Unknown Model",
                serialNumber: d.serialNumber || "N/A",
                reportedDefect: d.reportedDefect || "Reported Issue",
                initialStatus: d.initialStatus as "OK" | "NG"
            }));

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
            toast({ variant: "destructive", title: "Import Failed", description: err.message });
        }
    });

    const handleFileUpload = (file: File) => {
        parseFileMutation.mutate(file);
    };

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    const hasInvalidDevices = devices.some(d => !d.corporateJobNumber || !d.corporateJobNumber.trim());

    return (
        <div className="flex flex-col h-[500px]">
            {/* Wizard Header / Stepper */}
            <div className="border-b pb-4 mb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold">
                        {step === 1 && "Start Challan IN"}
                        {step === 2 && "Add Devices"}
                        {step === 3 && "Review & Submit"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Step {step} of 3
                    </p>
                </div>

                {/* Progress Visual */}
                <div className="flex gap-1">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={`h-2 w-8 rounded-full ${step >= s ? 'bg-primary' : 'bg-muted'}`} />
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto px-1 py-2">
                {step === 1 && (
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

                {step === 2 && (
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

                        <div className="flex justify-between items-center">
                            <input
                                type="file"
                                id="excel-upload"
                                className="hidden"
                                accept=".xlsx, .csv, .docx"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                }}
                            />
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => document.getElementById('excel-upload')?.click()} disabled={parseFileMutation.isPending}>
                                {parseFileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                Import File
                            </Button>
                        </div>

                        <DeviceEntryTable
                            devices={devices}
                            onAddDevice={d => setDevices([...devices, d])}
                            onRemoveDevice={idx => setDevices(devices.filter((_, i) => i !== idx))}
                            onUpdateDevice={(idx, updated) => {
                                const newDevices = [...devices];
                                newDevices[idx] = updated;
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
                />

                {step === 3 && (
                    <div className="space-y-4">
                        <div className="bg-muted/30 p-4 rounded-lg border">
                            <h3 className="font-semibold mb-2">Summary</h3>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                                <span className="text-muted-foreground">Total Devices:</span>
                                <span className="font-medium text-lg">{devices.length}</span>

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
                                            <td className="p-2">{d.reportedDefect}</td>
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

                {step < 3 ? (
                    <Button onClick={nextStep} disabled={step === 2 && devices.length === 0}>
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
        </div>
    );
}
