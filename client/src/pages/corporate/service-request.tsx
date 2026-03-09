
import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { corporatePortalApi, BulkRow, BulkUploadResult } from "@/lib/api";
import { useCorporateApiErrorHandler } from "@/lib/corporateApiErrorHandler";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
    Loader2,
    Send,
    Upload,
    Download,
    File as FileIcon,
    AlertCircle,
    Plus,
    ChevronRight,
    ChevronLeft,
    Monitor,
    ClipboardList,
    CheckCircle2,
    CloudUpload,
    FileText,
    ArrowRight,
    Pencil,
    Trash2,
    Save,
    X
} from "lucide-react";
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from "framer-motion";
import { autoMapColumns, applyMapping, FieldMapping } from "@/lib/columnMapper";
import { ColumnMappingDialog } from "@/components/corporate/ColumnMappingDialog";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
    deviceModel: z.string().min(2, {
        message: "Device model must be at least 2 characters.",
    }),
    serialNumber: z.string().min(2, {
        message: "Serial number is required.",
    }),
    description: z.string().min(10, {
        message: "Please provide a detailed description of the issue.",
    }),
    priority: z.enum(["Low", "Medium", "High", "Critical"]),
});

const bulkSchema = z.object({
    corporateJobNumber: z.string().min(1),
    deviceBrand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    reportedDefect: z.string().min(1),
    initialStatus: z.enum(["OK", "NG"]).optional(),
    physicalCondition: z.string().optional(),
    accessories: z.string().optional(),
    notes: z.string().optional(),
});

// Error row with detailed info for inline editing
interface ErrorRow {
    rowIndex: number;       // original row number in the file
    data: Record<string, any>;  // the raw row data
    errors: string[];       // human-readable error messages
}

export default function CorporateServiceRequest() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { handleError } = useCorporateApiErrorHandler();

    // Wizard State
    const [step, setStep] = useState(1);
    const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            deviceModel: "",
            serialNumber: "",
            description: "",
            priority: "Medium",
        },
    });

    const [parsedRows, setParsedRows] = useState<BulkRow[]>([]);
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Inline error editing state
    const [editingErrorIndex, setEditingErrorIndex] = useState<number | null>(null);
    const [editingRowData, setEditingRowData] = useState<Record<string, any>>({});

    // Smart Mapping State
    const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
    const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
    const [showMappingDialog, setShowMappingDialog] = useState(false);
    const [columnMappings, setColumnMappings] = useState<FieldMapping[]>([]);

    const singleMutation = useMutation({
        mutationFn: corporatePortalApi.createServiceRequest,
        onMutate: async (newRequest) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ["corporateJobs"] });
            await queryClient.cancelQueries({ queryKey: ["corporateDashboard"] });

            // Snapshot previous data
            const previousJobs = queryClient.getQueriesData({ queryKey: ["corporateJobs"] });
            const previousDashboard = queryClient.getQueryData(["corporateDashboard"]);

            // Optimistic Job Object
            const optimisticJob = {
                id: `temp-${Date.now()}`,
                corporateJobNumber: "Creating...",
                device: newRequest.deviceModel,
                tvSerialNumber: newRequest.serialNumber,
                status: "Pending",
                createdAt: new Date().toISOString(),
                isOptimistic: true // Flag for UI styling
            };

            // Update Jobs List (Prepend to all job lists)
            queryClient.setQueriesData({ queryKey: ["corporateJobs"] }, (old: any) => {
                if (!old?.items) return old;
                return {
                    ...old,
                    items: [optimisticJob, ...old.items],
                    pagination: {
                        ...old.pagination,
                        total: (old.pagination?.total || 0) + 1
                    }
                };
            });

            // Update Dashboard Stats and Activity
            queryClient.setQueryData(["corporateDashboard"], (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    activeJobs: (old.activeJobs || 0) + 1,
                    pendingApprovals: (old.pendingApprovals || 0) + 1,
                    recentActivity: [
                        {
                            id: optimisticJob.id,
                            device: optimisticJob.device,
                            status: optimisticJob.status,
                            updatedAt: optimisticJob.createdAt,
                            isOptimistic: true
                        },
                        ...(old.recentActivity || [])
                    ].slice(0, 5)
                };
            });

            return { previousJobs, previousDashboard };
        },
        onSuccess: () => {
            toast({
                title: "Request Submitted Successfully",
                description: "Your repair ticket has been queued for diagnosis.",
            });
            // Navigation handles the view switch
            setLocation("/corporate/dashboard");
        },
        onError: (error, _newRequest, context) => {
            // Rollback on error
            if (context?.previousJobs) {
                context.previousJobs.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            if (context?.previousDashboard) {
                queryClient.setQueryData(["corporateDashboard"], context.previousDashboard);
            }
            handleError(error, "Service Request Submission");
        },
        onSettled: () => {
            // Always refetch to ensure data consistency
            queryClient.invalidateQueries({ queryKey: ["corporateDashboard"] });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
        },
    });

    const bulkMutation = useMutation({
        mutationFn: corporatePortalApi.bulkServiceRequestsJson,
        onSuccess: (data: BulkUploadResult) => {
            toast({
                title: `${data.success} Tickets Created`,
                description: `${data.failed} entries failed validation.`,
            });
            queryClient.invalidateQueries({ queryKey: ["corporateDashboard"] });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            setParsedRows([]);
            setParseErrors([]);
        },
        onError: (error) => {
            handleError(error, "Bulk Upload");
        },
    });

    function onSingleSubmit(values: z.infer<typeof formSchema>) {
        if (step < 3) {
            setStep(step + 1);
            return;
        }
        singleMutation.mutate(values);
    }

    const nextStep = async () => {
        const fields = step === 1 ? ['deviceModel', 'serialNumber'] : ['description', 'priority'];
        const isValid = await form.trigger(fields as any);
        if (isValid) setStep(step + 1);
    };

    const prevStep = () => setStep(step - 1);

    const validateAndSetRows = async (rows: BulkRow[]) => {
        setIsParsing(true);
        const errors: string[] = [];
        const validRows: BulkRow[] = [];
        const badRows: ErrorRow[] = [];

        // 1. Schema Validation
        rows.forEach((row, index) => {
            try {
                bulkSchema.parse(row);
                validRows.push(row);
            } catch (err: any) {
                const fieldErrors: string[] = [];
                if (err.errors) {
                    err.errors.forEach((e: any) => {
                        const field = e.path?.join('.') || 'unknown';
                        fieldErrors.push(`${field}: ${e.message}`);
                    });
                }
                const summary = fieldErrors.length > 0 ? fieldErrors.join(', ') : 'Invalid data';
                errors.push(`Row ${index + 2}: ${summary}`);
                badRows.push({
                    rowIndex: index + 2,
                    data: { ...row },
                    errors: fieldErrors.length > 0 ? fieldErrors : ['Invalid data'],
                });
            }
        });

        // 2. Duplicate Check
        if (validRows.length > 0) {
            try {
                const jobNumbers = validRows.map(r => r.corporateJobNumber);
                const { existing } = await corporatePortalApi.checkExistingJobs(jobNumbers);

                if (existing && existing.length > 0) {
                    const existingSet = new Set(existing);
                    const nonDuplicates: BulkRow[] = [];

                    validRows.forEach((row) => {
                        if (existingSet.has(row.corporateJobNumber)) {
                            // Use strict equality to find original object index
                            const originalIndex = rows.indexOf(row);
                            const displayIndex = originalIndex >= 0 ? originalIndex + 2 : 0;

                            errors.push(`Row ${displayIndex}: Duplicate Job ${row.corporateJobNumber}`);
                            badRows.push({
                                rowIndex: displayIndex,
                                data: { ...row },
                                errors: [`corporateJobNumber: Job Number already exists in system`]
                            });
                        } else {
                            nonDuplicates.push(row);
                        }
                    });

                    // Replace validRows
                    validRows.splice(0, validRows.length, ...nonDuplicates);

                    toast({
                        variant: "destructive",
                        title: "Duplicates Found",
                        description: `${existing.length} jobs skipped as they already exist.`,
                    });
                }
            } catch (error) {
                console.error("Failed to check duplicates:", error);
                toast({
                    variant: "destructive",
                    title: "Validation Warning",
                    description: "Could not verify duplicate jobs. Proceed with caution.",
                });
            }
        }

        setParsedRows(validRows);
        setParseErrors(errors);
        setErrorRows(badRows);
        setIsParsing(false);

        if (validRows.length > 0) {
            toast({
                title: "Validation Complete",
                description: `Ready to upload ${validRows.length} records. ${badRows.length > 0 ? `Found ${badRows.length} errors.` : ''}`,
            });
        }
    };

    const handleFileParse = (file: File) => {
        setIsParsing(true);
        setParseErrors([]);
        setParsedRows([]);
        setRawRows([]);
        setErrorRows([]);

        const processRawData = (rows: Record<string, string>[], headers: string[]) => {
            setRawRows(rows);
            setUploadedHeaders(headers);

            // 1. Auto-Map Columns
            const { mappings, allRequiredMapped } = autoMapColumns(headers);
            setColumnMappings(mappings);

            if (allRequiredMapped) {
                // 2a. If all good, apply mapping directly
                const mappedRows = applyMapping(rows, mappings);
                validateAndSetRows(mappedRows);
            } else {
                // 2b. Show mapping dialog
                setIsParsing(false);
                setShowMappingDialog(true);
            }
        };

        if (file.name.endsWith('.csv')) {
            Papa.parse<Record<string, string>>(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results: any) => {
                    const rows = results.data;
                    const headers = results.meta.fields || [];
                    processRawData(rows, headers);
                },
                error: (error: any) => {
                    setParseErrors([error.message]);
                    setIsParsing(false);
                },
            });
        } else if (file.name.endsWith('.xlsx')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: "" });

                // Get headers from first row
                const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
                processRawData(rows, headers);
            };
            reader.readAsBinaryString(file);
        } else {
            setParseErrors(["Unsupported file format. Please use CSV or XLSX."]);
            setIsParsing(false);
        }
    };

    const handleConfirmMapping = (newMappings: FieldMapping[]) => {
        setIsParsing(true);
        setShowMappingDialog(false);

        // Wait a tick to let UI update? No need.
        const mappedRows = applyMapping(rawRows, newMappings);
        validateAndSetRows(mappedRows);
    };

    const handleBulkSubmit = () => {
        if (parsedRows.length === 0) return;
        bulkMutation.mutate(parsedRows as any); // Type assertion for API compatibility
    };

    // Inline error correction handlers
    const startEditingError = (errorIndex: number) => {
        setEditingErrorIndex(errorIndex);
        setEditingRowData({ ...errorRows[errorIndex].data });
    };

    const saveEditedRow = () => {
        if (editingErrorIndex === null) return;
        try {
            const validated = bulkSchema.parse(editingRowData);
            // Move from error rows to valid rows
            setParsedRows(prev => [...prev, validated as BulkRow]);
            setErrorRows(prev => prev.filter((_, i) => i !== editingErrorIndex));
            setParseErrors(prev => prev.filter((_, i) => i !== editingErrorIndex));
            setEditingErrorIndex(null);
            setEditingRowData({});
            toast({
                title: "Row Fixed ✓",
                description: "The corrected row has been added to the upload queue.",
            });
        } catch (err: any) {
            // Still invalid — show new errors
            const fieldErrors: string[] = [];
            if (err.errors) {
                err.errors.forEach((e: any) => {
                    const field = e.path?.join('.') || 'unknown';
                    fieldErrors.push(`${field}: ${e.message}`);
                });
            }
            // Update the error row with new data and errors
            setErrorRows(prev => prev.map((row, i) =>
                i === editingErrorIndex
                    ? { ...row, data: { ...editingRowData }, errors: fieldErrors }
                    : row
            ));
            toast({
                title: "Still has errors",
                description: fieldErrors.join(', '),
                variant: "destructive",
            });
        }
    };

    const removeErrorRow = (errorIndex: number) => {
        setErrorRows(prev => prev.filter((_, i) => i !== errorIndex));
        setParseErrors(prev => prev.filter((_, i) => i !== errorIndex));
        if (editingErrorIndex === errorIndex) {
            setEditingErrorIndex(null);
            setEditingRowData({});
        }
    };

    const downloadTemplate = () => {
        const csvContent = `corporateJobNumber,deviceBrand,model,serialNumber,reportedDefect,initialStatus,physicalCondition,accessories,notes
J001,Sony,Bravia K65XR70,123456789,No power,NG,Minor scratches,Remote+HDMI cable,"Power button not responding"
J002,Samsung,QLED Q80C,987654321,Screen flickering,OK,,All cables,Intermittent issue`;
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'service-request-template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const slideVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 20 : -20,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 20 : -20,
            opacity: 0
        })
    };

    return (
        <div className="max-w-4xl mx-auto space-y-10 pb-20">
            {/* Page Title */}
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-black tracking-tight text-slate-900 mt-8">Intake <span className="text-[var(--corp-blue)]">Wizard</span></h1>
                <p className="text-slate-500 font-medium">Simplify your repair requests with our smart intake system.</p>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'single' | 'bulk')} className="w-full">
                <div className="flex justify-center mb-8">
                    <TabsList className="bg-slate-100 p-1 rounded-2xl h-14">
                        <TabsTrigger
                            value="single"
                            className="rounded-xl px-10 h-12 font-bold data-[state=active]:bg-white data-[state=active]:text-[var(--corp-blue)] data-[state=active]:shadow-sm transition-all"
                        >
                            Single Ticket
                        </TabsTrigger>
                        <TabsTrigger
                            value="bulk"
                            className="rounded-xl px-10 h-12 font-bold data-[state=active]:bg-white data-[state=active]:text-[var(--corp-blue)] data-[state=active]:shadow-sm transition-all"
                        >
                            Batch Upload
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="single" className="mt-0 focus-visible:outline-none">
                    <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
                        {/* Step Indicator */}
                        <div className="bg-slate-50/50 px-10 py-6 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                {[1, 2, 3].map((s) => (
                                    <div key={s} className="flex items-center gap-3">
                                        <div className={`
                                            w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all duration-300
                                            ${step >= s ? "bg-[var(--corp-blue)] text-white shadow-lg shadow-blue-100" : "bg-white text-slate-300 border border-slate-200"}
                                        `}>
                                            {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                                        </div>
                                        <span className={`text-xs font-bold uppercase tracking-widest hidden sm:inline ${step >= s ? "text-slate-900" : "text-slate-300"}`}>
                                            {s === 1 ? "Device" : s === 2 ? "Issue" : "Confirm"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <Badge variant="outline" className="bg-blue-50 text-[var(--corp-blue)] border-blue-100 font-black text-[10px] tracking-wider py-1 px-3">
                                STEP {step} OF 3
                            </Badge>
                        </div>

                        <CardContent className="p-10">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSingleSubmit)} className="space-y-8">
                                    <AnimatePresence mode="wait" custom={step}>
                                        {step === 1 && (
                                            <motion.div
                                                key="step1"
                                                custom={step}
                                                variants={slideVariants}
                                                initial="enter"
                                                animate="center"
                                                exit="exit"
                                                transition={{ duration: 0.2 }}
                                                className="space-y-8"
                                            >
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                                        <Monitor className="h-5 w-5 text-[var(--corp-blue)]" />
                                                        Device Specification
                                                    </h3>
                                                    <p className="text-sm text-slate-400">Specify the equipment details requiring service.</p>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    <FormField
                                                        control={form.control}
                                                        name="deviceModel"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs font-black uppercase text-slate-500 tracking-tighter">Model Name / Type</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        placeholder="e.g. Sony Bravia 65 UHD"
                                                                        className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-[var(--corp-blue)] transition-all"
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="serialNumber"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-xs font-black uppercase text-slate-500 tracking-tighter">Tag / Serial Number</FormLabel>
                                                                <FormControl>
                                                                    <div className="relative">
                                                                        <Input
                                                                            placeholder="e.g. SN-VJ-99120"
                                                                            className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-[var(--corp-blue)] transition-all font-mono"
                                                                            {...field}
                                                                        />
                                                                    </div>
                                                                </FormControl>
                                                                <FormMessage className="text-[10px] font-bold" />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </motion.div>
                                        )}

                                        {step === 2 && (
                                            <motion.div
                                                key="step2"
                                                custom={step}
                                                variants={slideVariants}
                                                initial="enter"
                                                animate="center"
                                                exit="exit"
                                                transition={{ duration: 0.2 }}
                                                className="space-y-8"
                                            >
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                                        <ClipboardList className="h-5 w-5 text-[var(--corp-blue)]" />
                                                        Service Details
                                                    </h3>
                                                    <p className="text-sm text-slate-400">Describe the failure state and set ticket priority.</p>
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name="priority"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-black uppercase text-slate-500 tracking-tighter">Urgency Level</FormLabel>
                                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                <FormControl>
                                                                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:border-[var(--corp-blue)] transition-all">
                                                                        <SelectValue placeholder="Set Priority" />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent className="rounded-xl">
                                                                    <SelectItem value="Low">Low - Maintenance Only</SelectItem>
                                                                    <SelectItem value="Medium">Medium - Default Flow</SelectItem>
                                                                    <SelectItem value="High">High - Priority Support</SelectItem>
                                                                    <SelectItem value="Critical">Critical - Immediate Action</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage className="text-[10px] font-bold" />
                                                        </FormItem>
                                                    )}
                                                />

                                                <FormField
                                                    control={form.control}
                                                    name="description"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="text-xs font-black uppercase text-slate-500 tracking-tighter">Detailed Fault Report</FormLabel>
                                                            <FormControl>
                                                                <Textarea
                                                                    placeholder="Describe the problem (e.g. Lines on screen, No sound output)..."
                                                                    className="min-h-[140px] rounded-2xl bg-slate-50 border-transparent focus:bg-white focus:border-[var(--corp-blue)] transition-all resize-none p-5"
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage className="text-[10px] font-bold" />
                                                        </FormItem>
                                                    )}
                                                />
                                            </motion.div>
                                        )}

                                        {step === 3 && (
                                            <motion.div
                                                key="step3"
                                                custom={step}
                                                variants={slideVariants}
                                                initial="enter"
                                                animate="center"
                                                exit="exit"
                                                transition={{ duration: 0.2 }}
                                                className="space-y-8"
                                            >
                                                <div className="space-y-2 text-center">
                                                    <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                                                        <CheckCircle2 className="h-8 w-8 text-[var(--corp-blue)]" />
                                                    </div>
                                                    <h3 className="text-2xl font-black text-slate-900">Verify Request</h3>
                                                    <p className="text-sm text-slate-400">Review your intake details before final submission.</p>
                                                </div>

                                                <div className="bg-slate-50 rounded-3xl p-8 space-y-6">
                                                    <div className="grid grid-cols-2 gap-8 text-sm">
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Device</p>
                                                            <p className="font-bold text-slate-800">{form.getValues().deviceModel}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Serial Number</p>
                                                            <p className="font-mono font-medium text-[var(--corp-blue)]">{form.getValues().serialNumber}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority</p>
                                                            <Badge className="bg-white text-slate-700 border-slate-200 font-bold px-3 py-1 rounded-full shadow-none">{form.getValues().priority}</Badge>
                                                        </div>
                                                    </div>
                                                    <Separator className="bg-slate-200/50" />
                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fault Description</p>
                                                        <p className="text-slate-600 text-sm italic leading-relaxed">"{form.getValues().description}"</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-10">
                                        {step > 1 ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={prevStep}
                                                className="h-12 px-6 rounded-xl font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                            >
                                                <ChevronLeft className="mr-2 h-4 w-4" /> Back
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => setLocation("/corporate/dashboard")}
                                                className="h-12 px-6 rounded-xl font-bold text-slate-400"
                                            >
                                                Discard
                                            </Button>
                                        )}

                                        {step < 3 ? (
                                            <Button
                                                type="button"
                                                onClick={nextStep}
                                                className="h-12 px-10 rounded-xl bg-slate-900 text-white font-bold corp-btn-glow"
                                            >
                                                Next Step <ChevronRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button
                                                type="submit"
                                                className="h-12 px-10 rounded-xl bg-[var(--corp-blue)] text-white font-black shadow-lg shadow-blue-100 corp-btn-glow"
                                                disabled={singleMutation.isPending}
                                            >
                                                {singleMutation.isPending ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="mr-2 h-4 w-4" />
                                                        Create Ticket
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="bulk" className="mt-0 focus-visible:outline-none">
                    <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden p-0">
                        <CardHeader className="bg-slate-50/50 px-10 py-8 border-b border-slate-100">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div>
                                    <CardTitle className="text-2xl font-black text-slate-900">Batch Processing</CardTitle>
                                    <CardDescription className="text-slate-400 font-medium mt-1">Efficiently upload multiple repair records via CSV.</CardDescription>
                                </div>
                                <Button onClick={downloadTemplate} variant="outline" className="h-12 px-6 rounded-xl border-slate-200 font-bold corp-btn-glow">
                                    <Download className="mr-2 h-4 w-4 text-[var(--corp-blue)]" />
                                    Get Template
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="p-10 space-y-10">
                            {/* Dropzone */}
                            {!parsedRows.length && !errorRows.length && (
                                <div
                                    className="relative group h-64 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-4 transition-all hover:border-[var(--corp-blue)] hover:bg-blue-50/20 cursor-pointer overflow-hidden"
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const file = e.dataTransfer.files[0];
                                        if (file) handleFileParse(file);
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                >
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-[var(--corp-blue)] group-hover:bg-white transition-all">
                                        <CloudUpload className="h-8 w-8" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-lg font-bold text-slate-700">Drop your file here</p>
                                        <p className="text-sm text-slate-400 mt-1">Support CSV & XLSX format up to 10MB</p>
                                    </div>
                                    <Button asChild variant="outline" className="rounded-xl font-bold border-slate-200 hover:bg-[var(--corp-blue)] hover:text-white transition-all">
                                        <label className="cursor-pointer">
                                            Choose File
                                            <input
                                                type="file"
                                                accept=".csv,.xlsx"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleFileParse(file);
                                                }}
                                            />
                                        </label>
                                    </Button>
                                </div>
                            )}

                            {isParsing && (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-[var(--corp-blue)]" />
                                    <p className="text-slate-400 font-bold animate-pulse">Analyzing document structure...</p>
                                </div>
                            )}

                            {/* Validation Errors with Inline Correction */}
                            <AnimatePresence>
                                {errorRows.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="bg-rose-50 rounded-2xl p-6 border border-rose-100"
                                    >
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3 text-rose-600">
                                                <AlertCircle className="h-5 w-5" />
                                                <h4 className="font-black text-sm uppercase tracking-wider">
                                                    Rows Needing Attention ({errorRows.length})
                                                </h4>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold"
                                                onClick={() => { setErrorRows([]); setParseErrors([]); }}
                                            >
                                                Dismiss All
                                            </Button>
                                        </div>

                                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                                            {errorRows.map((errorRow, i) => (
                                                <div
                                                    key={`err-${errorRow.rowIndex}-${i}`}
                                                    className={`bg-white rounded-xl border transition-all ${editingErrorIndex === i
                                                        ? 'border-blue-200 shadow-md shadow-blue-50'
                                                        : 'border-rose-100 hover:border-rose-200'
                                                        }`}
                                                >
                                                    {/* Error row header */}
                                                    <div className="flex items-center justify-between p-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-lg">
                                                                    Row {errorRow.rowIndex}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-mono truncate">
                                                                    {errorRow.data.corporateJobNumber || errorRow.data.serialNumber || '—'}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {errorRow.errors.map((err, j) => (
                                                                    <span key={j} className="text-[10px] text-rose-400 bg-rose-50/60 px-2 py-0.5 rounded-md font-medium">
                                                                        {err}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                                                            {editingErrorIndex !== i && (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                                        onClick={() => startEditingError(i)}
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-8 w-8 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                                                        onClick={() => removeErrorRow(i)}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Inline edit form */}
                                                    {editingErrorIndex === i && (
                                                        <div className="px-4 pb-4 pt-0 border-t border-slate-100">
                                                            <div className="grid grid-cols-2 gap-3 pt-3">
                                                                {[
                                                                    { key: 'corporateJobNumber', label: 'Job Number' },
                                                                    { key: 'deviceBrand', label: 'Brand' },
                                                                    { key: 'model', label: 'Model' },
                                                                    { key: 'serialNumber', label: 'Serial Number' },
                                                                    { key: 'reportedDefect', label: 'Reported Defect' },
                                                                ].map(field => {
                                                                    const hasError = errorRow.errors.some(e =>
                                                                        e.toLowerCase().startsWith(field.key.toLowerCase())
                                                                    );
                                                                    return (
                                                                        <div key={field.key} className={field.key === 'reportedDefect' ? 'col-span-2' : ''}>
                                                                            <label className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${hasError ? 'text-rose-500' : 'text-slate-400'}`}>
                                                                                {field.label} {hasError && '⚠'}
                                                                            </label>
                                                                            <Input
                                                                                value={editingRowData[field.key] || ''}
                                                                                onChange={(e) => setEditingRowData(prev => ({
                                                                                    ...prev, [field.key]: e.target.value
                                                                                }))}
                                                                                className={`h-9 text-xs rounded-lg ${hasError
                                                                                    ? 'border-rose-200 focus:border-rose-400 bg-rose-50/30'
                                                                                    : 'border-slate-200'
                                                                                    }`}
                                                                                placeholder={field.label}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="flex justify-end gap-2 mt-4">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="rounded-lg text-slate-400 hover:text-slate-600 font-bold text-xs"
                                                                    onClick={() => { setEditingErrorIndex(null); setEditingRowData({}); }}
                                                                >
                                                                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    className="rounded-lg bg-[var(--corp-blue)] text-white font-bold text-xs shadow-sm"
                                                                    onClick={saveEditedRow}
                                                                >
                                                                    <Save className="h-3.5 w-3.5 mr-1" /> Save & Fix
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {parsedRows.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-8"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
                                                    <FileText className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">Preview Data</h4>
                                                    <p className="text-xs text-slate-400 font-medium">Verified {parsedRows.length} repair records</p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                className="text-slate-400 h-10 hover:text-rose-500 hover:bg-rose-50 rounded-xl font-bold transition-all"
                                                onClick={() => { setParsedRows([]); setParseErrors([]); setErrorRows([]); }}
                                            >
                                                Discard File
                                            </Button>
                                        </div>

                                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                            <Table>
                                                <TableHeader className="bg-slate-50/50">
                                                    <TableRow className="hover:bg-transparent border-slate-100">
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400 py-4 pl-6">Job ID</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Device Specification</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Status</TableHead>
                                                        <TableHead className="text-[10px] font-black uppercase text-slate-400">Defect Info</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {parsedRows.slice(0, 5).map((row, i) => (
                                                        <TableRow key={i} className="border-slate-50 transition-colors">
                                                            <TableCell className="font-bold text-slate-700 text-xs pl-6">{row.corporateJobNumber}</TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-bold text-slate-800">{row.deviceBrand} {row.model}</span>
                                                                    <span className="text-[10px] text-slate-400 font-mono italic">{row.serialNumber}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge className={`px-2 py-0.5 rounded-full text-[9px] font-black shadow-none border ${row.initialStatus === 'OK' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                                                                    }`}>
                                                                    {row.initialStatus}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-slate-500 max-w-[150px] truncate italic">"{row.reportedDefect}"</TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {parsedRows.length > 5 && (
                                                        <TableRow className="hover:bg-transparent border-none">
                                                            <TableCell colSpan={4} className="text-center py-4 text-xs font-bold text-slate-300">
                                                                + {parsedRows.length - 5} additional records...
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                onClick={handleBulkSubmit}
                                                disabled={bulkMutation.isPending || isUploading}
                                                className="h-14 px-12 rounded-2xl bg-[var(--corp-blue)] text-white font-black shadow-lg shadow-blue-100 corp-btn-glow"
                                            >
                                                {bulkMutation.isPending ? (
                                                    <>
                                                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                                                        Processing Batch...
                                                    </>
                                                ) : (
                                                    <>
                                                        Proceed with Upload <ArrowRight className="ml-3 h-5 w-5" />
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <ColumnMappingDialog
                open={showMappingDialog}
                onOpenChange={setShowMappingDialog}
                uploadedHeaders={uploadedHeaders}
                initialMappings={columnMappings}
                onConfirm={handleConfirmMapping}
            />
        </div>
    );
}
