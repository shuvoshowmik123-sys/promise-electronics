import { useState, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, AlertTriangle, CheckCircle, FileText, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface RestoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function RestoreDialog({ open, onOpenChange }: RestoreDialogProps) {
    const [step, setStep] = useState<'upload' | 'analyze' | 'restoring' | 'success'>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const resetState = () => {
        setStep('upload');
        setFile(null);
        setPassword("");
        setError(null);
        setMetadata(null);
        setAnalysis(null);
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            resetState();
        }
        onOpenChange(newOpen);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleValidate = async () => {
        if (!file || !password) {
            setError("Please select a file and enter the password");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("password", password);

            const res = await fetch("/api/admin/restore/validate", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Validation failed");
            }

            setMetadata(data.metadata);
            setAnalysis(data.analysis);
            setStep('analyze');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!file || !password) return;

        setIsLoading(true);
        setError(null);
        setStep('restoring');

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("password", password);

            const res = await fetch("/api/admin/restore/execute", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Restore failed");
            }

            setStep('success');
            toast({
                title: "System Restored Successfully",
                description: data.message,
            });

        } catch (err: any) {
            setError(err.message);
            setStep('analyze'); // Go back to analysis on error
        } finally {
            setIsLoading(false);
        }
    };

    const renderAnalysisStep = () => {
        if (!analysis) return null;

        return (
            <div className="space-y-4">
                <div className="bg-muted p-3 rounded-md mb-2">
                    <h4 className="font-semibold text-sm mb-1">Backup Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Version: <span className="font-mono">{metadata?.version}</span></div>
                        <div>Date: <span className="font-mono">{new Date(metadata?.timestamp).toLocaleString()}</span></div>
                        <div>Tables: <span className="font-mono">{analysis.summary.totalTables}</span></div>
                        <div>Status:
                            {analysis.summary.mismatched > 0 ?
                                <span className="text-yellow-600 font-bold ml-1">Schema Drift Detected</span> :
                                <span className="text-green-600 font-bold ml-1">Perfect Match</span>
                            }
                        </div>
                    </div>
                </div>

                <ScrollArea className="h-[250px] w-full rounded-md border p-4">
                    <div className="space-y-2">
                        {analysis.tables.map((table: any) => (
                            <div key={table.name} className="flex items-start space-x-2 text-sm border-b pb-2 last:border-0">
                                {table.status === 'ok' && <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />}
                                {table.status === 'mismatch' && <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />}
                                {table.status === 'extra' && <XCircle className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />}

                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{table.name}</span>
                                        <div className="flex gap-1">
                                            {table.status === 'mismatch' && <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">Attention</Badge>}
                                            {table.status === 'extra' && <Badge variant="outline" className="text-xs">Ignored</Badge>}
                                        </div>
                                    </div>
                                    <p className={`text-xs mt-0.5 ${table.status === 'mismatch' ? 'text-yellow-700' : 'text-muted-foreground'}`}>
                                        {table.message}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <Alert variant={analysis.summary.mismatched > 0 ? "default" : "default"} className={analysis.summary.mismatched > 0 ? "border-yellow-500 bg-yellow-50" : ""}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Review Verification</AlertTitle>
                    <AlertDescription>
                        {analysis.summary.mismatched > 0
                            ? "Some tables have schema differences. New columns will be filled with defaults. Verify above before proceeding."
                            : "Schema matches perfectly. Data is safe to restore."}
                    </AlertDescription>
                </Alert>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>System Restoration</DialogTitle>
                    <DialogDescription>
                        {step === 'upload' && "Upload a valid backup file to begin restoration."}
                        {step === 'analyze' && "Review the backup content and schema compatibility."}
                        {step === 'restoring' && "Restoring system data... Do not close this window."}
                        {step === 'success' && "Restoration Complete."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div className="grid w-full items-center gap-1.5">
                                <Label htmlFor="backup-file">Backup File</Label>
                                <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
                                    onClick={() => fileInputRef.current?.click()}>
                                    <input
                                        type="file"
                                        id="backup-file"
                                        className="hidden"
                                        ref={fileInputRef}
                                        accept=".json" // Our backups are encrypted JSON
                                        onChange={handleFileChange}
                                    />
                                    {file ? (
                                        <div className="text-center">
                                            <FileText className="w-8 h-8 mx-auto text-primary mb-2" />
                                            <p className="font-medium text-sm">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                            <p className="font-medium text-sm">Click to select backup file</p>
                                            <p className="text-xs text-muted-foreground">Supports .json encrypted backups</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid w-full items-center gap-1.5">
                                <Label htmlFor="password">Decryption Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter secret key used during backup"
                                />
                            </div>
                        </div>
                    )}

                    {step === 'analyze' && renderAnalysisStep()}

                    {step === 'restoring' && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Restoring database records...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <CheckCircle className="h-12 w-12 text-green-500" />
                            <p className="text-lg font-medium">Restoration Successful</p>
                            <p className="text-center text-muted-foreground text-sm">
                                The system has been restored to the selected backup point.<br />
                                Please refresh the page to see changes.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step === 'upload' && (
                        <Button onClick={handleValidate} disabled={isLoading || !file || !password}>
                            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</> : "Verify Backup"}
                        </Button>
                    )}

                    {step === 'analyze' && (
                        <>
                            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
                            <Button
                                variant={analysis?.summary.mismatched > 0 ? "destructive" : "default"}
                                onClick={handleRestore}
                                disabled={isLoading}
                            >
                                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restoring...</> : "Execute Restore"}
                            </Button>
                        </>
                    )}

                    {step === 'success' && (
                        <Button onClick={() => window.location.reload()}>
                            Reload Application
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
