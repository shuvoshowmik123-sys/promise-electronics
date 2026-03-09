import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
    Building2, FileText, Search, Plus, Loader2, Trash2, Edit, Save,
    XCircle, Clock, Copy, MoreVertical, Activity
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { formatTaka } from "@/lib/currency";
import { quotationsApi, adminCustomersApi } from "@/lib/api/adminApi";
import { Quotation, QuotationItem } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogFooter, DialogDescription, DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
    DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants, tableRowVariants } from "../shared/animations";

// Zod schema for quotation creation/editing
const quotationSchema = z.object({
    customerId: z.string().optional().nullable(),
    customerName: z.string().min(1, "Customer name is required"),
    customerPhone: z.string().min(1, "Customer phone is required"),
    customerEmail: z.string().optional().nullable(),
    customerAddress: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.string().default("Created"),
    items: z.array(z.object({
        id: z.string().optional(),
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0, "Price cannot be negative"),
    })).min(1, "At least one item is required")
});

type QuotationFormData = z.infer<typeof quotationSchema>;

export default function QuotationsTab() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingQuotation, setEditingQuotation] = useState<Quotation & { items: QuotationItem[] } | null>(null);

    // Print state
    const [printQuotation, setPrintQuotation] = useState<Quotation & { items: QuotationItem[] } | null>(null);

    // For the custom customer search dropdown
    const [customerSearchQuery, setCustomerSearchQuery] = useState("");
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    const handleDownloadPDF = async () => {
        const element = document.getElementById("quotation-print-preview");
        if (!element || !printQuotation) return;

        try {
            setIsGeneratingPDF(true);
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
            const imgData = canvas.toDataURL("image/png");

            const pdf = new jsPDF("p", "mm", "a4");
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Quotation_${printQuotation.quotationNumber}.pdf`);
            toast.success("PDF Downloaded successfully!");
        } catch (error) {
            console.error("PDF generation error:", error);
            toast.error("Failed to generate PDF.");
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    // Fetch data
    const { data: quotations = [], isLoading: isLoadingQuotations } = useQuery({
        queryKey: ["quotations"],
        queryFn: quotationsApi.getAll,
    });

    const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
        queryKey: ["customers"],
        queryFn: adminCustomersApi.getAll,
    });

    const checkAndPrint = async (id: string) => {
        try {
            const data = await quotationsApi.getOne(id);
            setPrintQuotation(data);
            // We no longer auto-print here.
            // The user will preview the layout in the new dialog and click Print manually.
        } catch (error) {
            toast.error("Failed to load quotation for printing");
        }
    };


    // Mutations
    const createMutation = useMutation({
        mutationFn: quotationsApi.create,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["quotations"] });
            setIsDialogOpen(false);
            toast.success("Quotation created. Generating printout...");
            if (data?.id) checkAndPrint(data.id);
        },
        onError: (err: any) => toast.error(`Failed to create quotation: ${err.message}`)
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => quotationsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["quotations"] });
            setIsDialogOpen(false);
            toast.success("Quotation updated successfully");
        },
        onError: (err: any) => toast.error(`Failed to update quotation: ${err.message}`)
    });

    const deleteMutation = useMutation({
        mutationFn: quotationsApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["quotations"] });
            toast.success("Quotation deleted");
        },
        onError: (err: any) => toast.error(`Failed to delete quotation: ${err.message}`)
    });

    // Form setup
    const form = useForm<QuotationFormData>({
        resolver: zodResolver(quotationSchema),
        defaultValues: {
            customerName: "",
            customerPhone: "",
            items: [{ description: "", quantity: 1, unitPrice: 0 }],
            status: "Created"
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "items"
    });

    // Handle Edit
    const handleEdit = async (id: string) => {
        try {
            const data = await quotationsApi.getOne(id);
            setEditingQuotation(data);
            form.reset({
                customerId: data.customerId,
                customerName: data.customerName,
                customerPhone: data.customerPhone,
                customerEmail: data.customerEmail,
                customerAddress: data.customerAddress,
                notes: data.notes,
                status: data.status,
                items: data.items.map(item => ({
                    id: item.id,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice
                }))
            });
            setIsDialogOpen(true);
        } catch (error) {
            toast.error("Failed to fetch quotation details");
        }
    };

    const handleCreateNew = () => {
        setEditingQuotation(null);
        form.reset({
            customerName: "",
            customerPhone: "",
            customerId: null,
            customerEmail: "",
            customerAddress: "",
            items: [{ description: "", quantity: 1, unitPrice: 0 }],
            status: "Created",
        });
        setIsDialogOpen(true);
    };

    const onSubmit = (data: QuotationFormData) => {
        // Calculate totals
        const items = data.items.map((item, index) => ({
            ...item,
            total: item.quantity * item.unitPrice,
            sortOrder: index
        }));

        const subtotal = items.reduce((acc, curr) => acc + curr.total, 0);
        // Using static tax rate of 0% and 0 discount for now unless you want inputs for them
        const taxRate = 0;
        const tax = 0;
        const discount = 0;
        const total = subtotal - discount + tax;

        const payload = {
            ...data,
            subtotal,
            taxRate,
            tax,
            discount,
            total,
            items
        };

        if (editingQuotation) {
            updateMutation.mutate({ id: editingQuotation.id, data: payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    // Calculate dynamic stats
    const stats = useMemo(() => {
        return { totalRows: quotations.length };
    }, [quotations]);

    const filteredQuotations = quotations.filter((q: Quotation) => {
        return q.quotationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            q.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            q.customerPhone.includes(searchTerm);
    });

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 print:hidden"
        >
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <BentoCard className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100" title="Total Quotations Generated" icon={<FileText size={20} className="text-blue-600" />}>
                    <div className="text-3xl font-black text-slate-800 mt-2">{stats.totalRows}</div>
                </BentoCard>
                <div className="md:col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-3xl p-6 flex flex-col justify-center items-start">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Create &amp; Print Quotations</h3>
                    <p className="text-sm text-slate-600">Quickly generate professional quotations for your customers. All generated quotations are permanently stored here as a ledger and can be reprinted at any time.</p>
                </div>
            </div>

            {/* Filters & Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search by ID, customer name, or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500 rounded-xl"
                        />
                    </div>
                </div>

                <Button
                    onClick={handleCreateNew}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    New Quotation
                </Button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto pb-8">
                <Table className="border-separate border-spacing-y-3 min-w-[900px]">
                    <TableHeader>
                        <TableRow className="border-none hover:bg-transparent data-[state=selected]:bg-transparent">
                            <TableHead className="font-semibold text-slate-500 uppercase tracking-wider text-xs px-6 w-[160px]">Quotation #</TableHead>
                            <TableHead className="font-semibold text-slate-500 uppercase tracking-wider text-xs">Customer</TableHead>
                            <TableHead className="font-semibold text-slate-500 uppercase tracking-wider text-xs">Date</TableHead>
                            <TableHead className="font-semibold text-slate-500 uppercase tracking-wider text-xs">Total</TableHead>
                            <TableHead className="text-right font-semibold text-slate-500 uppercase tracking-wider text-xs pr-6 w-[180px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoadingQuotations ? (
                            <TableRow className="bg-white rounded-2xl shadow-sm border border-slate-100">
                                <TableCell colSpan={6} className="h-32 text-center rounded-2xl">
                                    <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : filteredQuotations.length === 0 ? (
                            <TableRow className="bg-white rounded-2xl shadow-sm border border-slate-100">
                                <TableCell colSpan={6} className="h-32 text-center text-slate-500 rounded-2xl">
                                    No quotations found. Try adjusting your search or filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            <AnimatePresence>
                                {filteredQuotations.map((quotation: Quotation) => (
                                    <motion.tr
                                        key={quotation.id}
                                        variants={tableRowVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        layout
                                        className="group bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition-all"
                                    >
                                        <TableCell className="font-medium text-slate-900 w-[160px] rounded-l-2xl px-6 py-4 relative">
                                            <div className="absolute inset-y-0 left-0 w-1 bg-transparent group-hover:bg-blue-500 rounded-l-2xl transition-colors" />
                                            {quotation.quotationNumber}
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-800">{quotation.customerName}</span>
                                                <span className="text-xs text-slate-500">{quotation.customerPhone}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-800">
                                                    {format(new Date(quotation.createdAt), 'MMM d, yyyy')}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {format(new Date(quotation.createdAt), 'h:mm a')}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-800 py-4">
                                            {formatTaka(quotation.total)}
                                        </TableCell>
                                        <TableCell className="text-right rounded-r-2xl pr-6 py-4">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        checkAndPrint(quotation.id);
                                                    }}
                                                    className="h-8 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 rounded-lg px-3"
                                                >
                                                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                                                    Print
                                                </Button>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-800 rounded-lg shrink-0">
                                                            <MoreVertical className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-100 shadow-xl p-1">
                                                        <DropdownMenuItem
                                                            onClick={() => handleEdit(quotation.id)}
                                                            className="cursor-pointer text-sm py-2 px-3 hover:bg-slate-50 rounded-lg flex items-center mb-1"
                                                        >
                                                            <Edit className="mr-2 h-4 w-4 text-slate-500" />
                                                            Edit Customer / Items
                                                        </DropdownMenuItem>

                                                        <DropdownMenuSeparator className="bg-slate-100" />
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (confirm('Are you sure you want to delete this quotation? This cannot be undone.')) {
                                                                    deleteMutation.mutate(quotation.id);
                                                                }
                                                            }}
                                                            className="cursor-pointer text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 focus:text-rose-700 focus:bg-rose-50 py-2 px-3 rounded-lg flex items-center"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete Quotation
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </TableCell>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-2xl border-slate-100 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-slate-800">
                            {editingQuotation ? `Edit Quotation ${editingQuotation.quotationNumber}` : 'Create New Quotation'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Fill out the details below to generate a new quotation for a customer.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-4 px-1 custom-scrollbar">
                        <form id="quotation-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                            {/* Customer Section */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Customer Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="col-span-1 md:col-span-2 relative group flex justify-end">
                                        <div className="absolute left-0 top-0 pt-2 w-full">
                                            <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Select Existing Customer (Optional)</Label>
                                        </div>
                                        <Popover open={isCustomerDropdownOpen} onOpenChange={setIsCustomerDropdownOpen}>
                                            <PopoverTrigger asChild>
                                                <motion.div
                                                    initial={{ width: "250px" }}
                                                    animate={{
                                                        width: (isCustomerDropdownOpen || customerSearchQuery.length > 0 || form.watch("customerId")) ? "100%" : "250px"
                                                    }}
                                                    whileHover={{ width: "100%" }}
                                                    transition={{
                                                        type: "tween",
                                                        ease: [0.25, 1, 0.5, 1],
                                                        duration: 0.4
                                                    }}
                                                    className="relative mt-6 z-10 origin-right"
                                                    style={{ transformOrigin: "right center" }}
                                                >
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                                                        <Search className="h-4 w-4 text-slate-400 focus-within:text-blue-500 transition-colors duration-300" />
                                                    </div>

                                                    {form.watch("customerId") ? (
                                                        <div
                                                            className="w-full pl-10 pr-10 py-2 text-left bg-blue-50/50 border border-blue-200 rounded-xl shadow-sm text-blue-900 font-medium h-10 flex items-center justify-between cursor-pointer"
                                                            onClick={() => {
                                                                form.setValue("customerId", null);
                                                                form.setValue("customerName", "");
                                                                form.setValue("customerPhone", "");
                                                                form.setValue("customerEmail", "");
                                                                setCustomerSearchQuery("");
                                                                setTimeout(() => setIsCustomerDropdownOpen(true), 50);
                                                            }}
                                                        >
                                                            <span className="truncate">{customers.find((c: any) => c.id === form.watch("customerId"))?.name}</span>
                                                            <XCircle className="h-4 w-4 text-blue-400 hover:text-blue-600 transition-colors" />
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            value={customerSearchQuery}
                                                            onChange={(e) => {
                                                                setCustomerSearchQuery(e.target.value);
                                                                if (!isCustomerDropdownOpen) setIsCustomerDropdownOpen(true);
                                                            }}
                                                            onFocus={() => setIsCustomerDropdownOpen(true)}
                                                            placeholder="Search database..."
                                                            className="w-full pl-10 pr-10 py-2 bg-slate-50 hover:bg-white border-slate-200 hover:border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 h-10 text-[15px]"
                                                        />
                                                    )}

                                                    {!form.watch("customerId") && !customerSearchQuery && (
                                                        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none transition-opacity duration-300">
                                                            <div className="hidden sm:flex items-center gap-1 bg-white px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 border border-slate-200 shadow-sm">
                                                                <span className="text-[14px] leading-none">⌘</span>K
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            </PopoverTrigger>

                                            <PopoverContent
                                                className="w-[calc(100vw-3rem)] sm:w-[500px] md:w-[600px] p-0 rounded-xl border-slate-100 shadow-2xl overflow-hidden mt-1"
                                                align="end"
                                                sideOffset={8}
                                                onOpenAutoFocus={(e) => e.preventDefault()} // Prevent stealing focus from our custom input
                                            >
                                                <Command className="bg-white/95 backdrop-blur-xl" shouldFilter={false}>
                                                    <CommandList className="custom-scrollbar max-h-[300px]">
                                                        {customers.filter((c: any) =>
                                                            c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                                                            c.phone.includes(customerSearchQuery)
                                                        ).length === 0 ? (
                                                            <div className="py-8 space-y-3 flex flex-col items-center justify-center">
                                                                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center">
                                                                    <Search className="h-4 w-4 text-slate-400" />
                                                                </div>
                                                                <p className="text-sm text-slate-500 font-medium tracking-wide">No customer match found.</p>
                                                            </div>
                                                        ) : (
                                                            <CommandGroup className="p-2">
                                                                {customers
                                                                    .filter((c: any) =>
                                                                        c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                                                                        c.phone.includes(customerSearchQuery)
                                                                    )
                                                                    .map((customer: any) => (
                                                                        <CommandItem
                                                                            key={customer.id}
                                                                            value={`${customer.name} ${customer.phone}`}
                                                                            onSelect={() => {
                                                                                form.setValue("customerId", customer.id);
                                                                                form.setValue("customerName", customer.name);
                                                                                form.setValue("customerPhone", customer.phone);
                                                                                form.setValue("customerEmail", customer.email || "");
                                                                                setIsCustomerDropdownOpen(false);
                                                                            }}
                                                                            className="cursor-pointer py-3 px-3 rounded-lg hover:bg-slate-50/80 aria-selected:bg-blue-50/50 aria-selected:text-blue-900 transition-colors mb-1 last:mb-0"
                                                                        >
                                                                            <div className="flex items-center justify-between w-full">
                                                                                <div className="flex flex-col">
                                                                                    <span className="font-semibold text-slate-800 text-[15px]">{customer.name}</span>
                                                                                    {customer.email && <span className="text-[11px] text-slate-400 mt-0.5">{customer.email}</span>}
                                                                                </div>
                                                                                <div className="flex bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                                                                    <span className="text-xs text-slate-600 font-mono font-medium tracking-tight hover:text-blue-600 transition-colors">{customer.phone}</span>
                                                                                </div>
                                                                            </div>
                                                                        </CommandItem>
                                                                    ))}
                                                            </CommandGroup>
                                                        )}
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div>
                                        <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Full Name <span className="text-rose-500">*</span></Label>
                                        <Input {...form.register("customerName")} placeholder="John Doe" className="bg-white border-slate-200" />
                                        {form.formState.errors.customerName && <p className="text-xs text-rose-500 mt-1">{form.formState.errors.customerName.message}</p>}
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Phone Number <span className="text-rose-500">*</span></Label>
                                        <Input {...form.register("customerPhone")} placeholder="+971 50 123 4567" className="bg-white border-slate-200" />
                                        {form.formState.errors.customerPhone && <p className="text-xs text-rose-500 mt-1">{form.formState.errors.customerPhone.message}</p>}
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Email Address</Label>
                                        <Input {...form.register("customerEmail")} type="email" placeholder="john@example.com" className="bg-white border-slate-200" />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Address</Label>
                                        <Input {...form.register("customerAddress")} placeholder="123 Main St, Dubai" className="bg-white border-slate-200" />
                                    </div>
                                </div>
                            </div>

                            {/* Line Items Section */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Line Items</h3>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
                                        className="h-8 bg-blue-50 text-blue-600 hover:bg-blue-100 border-none px-3 rounded-lg"
                                    >
                                        <Plus className="h-3 w-3 mr-1.5" />
                                        Add Item
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    {fields.map((field, index) => {
                                        // Watch these fields to calculate row total
                                        const qty = form.watch(`items.${index}.quantity`);
                                        const price = form.watch(`items.${index}.unitPrice`);
                                        const rowTotal = (qty || 0) * (price || 0);

                                        return (
                                            <div key={field.id} className="flex gap-3 items-start bg-slate-50/50 p-3 rounded-xl border border-slate-100 group relative">
                                                <div className="absolute -left-2 top-3 h-5 w-5 bg-white border border-slate-200 text-slate-500 text-[10px] font-bold rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {index + 1}
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 font-semibold uppercase">Description</Label>
                                                    <Input
                                                        {...form.register(`items.${index}.description`)}
                                                        placeholder="Item description"
                                                        className="bg-white border-slate-200 h-9 text-sm"
                                                    />
                                                    {form.formState.errors.items?.[index]?.description && (
                                                        <p className="text-[10px] text-rose-500 leading-none">{form.formState.errors.items[index]?.description?.message}</p>
                                                    )}
                                                </div>
                                                <div className="w-20 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 font-semibold uppercase">Qty</Label>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                                                        className="bg-white border-slate-200 h-9 text-sm text-center"
                                                    />
                                                </div>
                                                <div className="w-28 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 font-semibold uppercase">Unit Price</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        {...form.register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                                                        className="bg-white border-slate-200 h-9 text-sm text-right"
                                                    />
                                                </div>
                                                <div className="w-28 space-y-1">
                                                    <Label className="text-[10px] text-slate-400 font-semibold uppercase text-right block">Total</Label>
                                                    <div className="h-9 flex items-center justify-end font-bold text-slate-800 text-sm bg-slate-100/50 px-3 rounded-lg border border-transparent">
                                                        {rowTotal.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="pt-5">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => remove(index)}
                                                        disabled={fields.length === 1}
                                                        className="h-9 w-9 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Totals Preview */}
                                <div className="flex justify-end pt-4 border-t border-slate-100 mt-6">
                                    <div className="w-64 space-y-2">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Subtotal</span>
                                            <span className="font-semibold text-slate-700">
                                                {formatTaka(form.watch("items")?.reduce((acc, curr) => acc + (curr.quantity * curr.unitPrice || 0), 0))}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center text-lg font-black text-slate-800 pt-2 border-t border-slate-100">
                                            <span>Total</span>
                                            <span>
                                                {formatTaka(form.watch("items")?.reduce((acc, curr) => acc + (curr.quantity * curr.unitPrice || 0), 0))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Notes & config */}
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Additional Info</h3>
                                <div>
                                    <Label className="text-xs text-slate-500 font-semibold mb-1.5 block">Terms & Notes for Customer</Label>
                                    <Textarea
                                        {...form.register("notes")}
                                        placeholder="Warranty applies to parts only. Prices valid for 14 days..."
                                        className="h-20 bg-white border-slate-200 resize-none rounded-xl"
                                    />
                                </div>
                            </div>

                        </form>
                    </div>

                    <DialogFooter className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between sm:justify-between">
                        <DialogClose asChild>
                            <Button type="button" variant="ghost" className="text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            type="submit"
                            form="quotation-form"
                            disabled={createMutation.isPending || updateMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-600/20 px-8"
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Save className="h-4 w-4 mr-2" />
                            )}
                            Save Quotation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Print Preview Dialog */}
            <Dialog open={!!printQuotation} onOpenChange={(open) => !open && setPrintQuotation(null)}>
                <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col p-0 overflow-hidden sm:rounded-xl border-slate-200 shadow-2xl print:hidden bg-slate-100 [&>button.absolute]:!right-6 [&>button.absolute]:!top-5 [&>button.absolute]:!bg-slate-100 [&>button.absolute]:!p-2 [&>button.absolute]:!opacity-100 [&>button.absolute]:hover:!bg-slate-200 [&>button.absolute]:!rounded-full">
                    <DialogHeader className="pl-8 pr-24 py-5 bg-white border-b border-slate-200 flex flex-row items-center justify-between shrink-0">
                        <div>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-600" />
                                Print Preview
                            </DialogTitle>
                            <DialogDescription className="mt-1">
                                Review the quotation layout before printing.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                variant="outline"
                                onClick={() => setPrintQuotation(null)}
                                className="rounded-xl border-slate-200 hover:bg-slate-50"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDownloadPDF}
                                disabled={isGeneratingPDF}
                                className="rounded-xl bg-slate-800 hover:bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                            >
                                {isGeneratingPDF ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-download h-4 w-4 mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                )}
                                Download PDF
                            </Button>
                            <Button
                                onClick={() => window.print()}
                                className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-printer h-4 w-4 mr-2"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
                                Print Document
                            </Button>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto w-full custom-scrollbar p-8">
                        {/* The visible preview paper on screen */}
                        {printQuotation && (
                            <div id="quotation-print-preview" className="max-w-[800px] mx-auto p-12 shadow-sm border rounded-xl min-h-[1100px]" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }}>

                                {/* Header / Company Info */}
                                <div className="flex justify-between items-start mb-10 border-b-2 pb-6" style={{ borderColor: '#1e293b' }}>
                                    <div className="flex items-center gap-4">
                                        <img src="/logo.png" alt="Promise Electronics Logo" className="h-16 w-16 object-contain rounded-md" />
                                        <div className="flex flex-col leading-none">
                                            <h1 className="text-3xl font-black tracking-tighter uppercase" style={{ color: '#0f172a' }}>Promise</h1>
                                            <span className="text-xs font-bold tracking-[0.3em] uppercase" style={{ color: '#64748b' }}>Electronics</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="text-4xl font-black uppercase tracking-widest mb-2" style={{ color: '#cbd5e1' }}>Quotation</h2>
                                        <div className="text-lg font-bold" style={{ color: '#1e293b' }}>{printQuotation.quotationNumber}</div>
                                        <div className="text-sm font-medium mt-1" style={{ color: '#64748b' }}>Date: {format(new Date(printQuotation.createdAt), 'MMMM d, yyyy')}</div>
                                    </div>
                                </div>

                                {/* Addresses: From / To */}
                                <div className="grid grid-cols-2 gap-8 mb-10">
                                    {/* FROM */}
                                    <div>
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>From</h3>
                                        <p className="text-sm font-medium" style={{ color: '#334155' }}>
                                            116 Hossain Tower, Lift 8<br />
                                            Box Culvert Road, Naya Paltan<br />
                                            Dhaka-1000, Bangladesh<br />
                                            <span className="mt-2 block" style={{ color: '#64748b' }}>
                                                Email: support@promise.com<br />
                                                Phone: +880 1968 123456
                                            </span>
                                        </p>
                                    </div>
                                    {/* TO */}
                                    <div className="text-right">
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>Quotation For</h3>
                                        <div className="text-base font-bold" style={{ color: '#1e293b' }}>{printQuotation.customerName}</div>
                                        <p className="text-sm mt-1" style={{ color: '#475569' }}>{printQuotation.customerPhone}</p>
                                        {printQuotation.customerEmail && <p className="text-sm" style={{ color: '#475569' }}>{printQuotation.customerEmail}</p>}
                                        {printQuotation.customerAddress && <p className="text-sm mt-1 whitespace-pre-wrap" style={{ color: '#475569' }}>{printQuotation.customerAddress}</p>}
                                    </div>
                                </div>

                                {/* Items Table */}
                                <table className="w-full mb-12">
                                    <thead>
                                        <tr className="border-b-2" style={{ borderColor: '#1e293b' }}>
                                            <th className="text-left py-3 text-xs font-bold uppercase tracking-wider w-[50%]" style={{ color: '#64748b' }}>Description</th>
                                            <th className="text-center py-3 text-xs font-bold uppercase tracking-wider w-[15%]" style={{ color: '#64748b' }}>Qty</th>
                                            <th className="text-right py-3 text-xs font-bold uppercase tracking-wider w-[15%]" style={{ color: '#64748b' }}>Unit Price</th>
                                            <th className="text-right py-3 text-xs font-bold uppercase tracking-wider w-[20%]" style={{ color: '#64748b' }}>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {printQuotation.items.map((item, index) => (
                                            <tr key={index} className="border-b" style={{ borderColor: '#e2e8f0' }}>
                                                <td className="py-4 text-sm font-medium" style={{ color: '#1e293b' }}>{item.description}</td>
                                                <td className="py-4 text-sm text-center" style={{ color: '#475569' }}>{item.quantity}</td>
                                                <td className="py-4 text-sm text-right" style={{ color: '#475569' }}>{item.unitPrice.toFixed(2)}</td>
                                                <td className="py-4 text-sm font-bold text-right" style={{ color: '#1e293b' }}>{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Totals */}
                                <div className="flex justify-end mb-16">
                                    <div className="w-[300px]">
                                        <div className="flex justify-between py-2 text-sm" style={{ color: '#475569' }}>
                                            <span>Subtotal</span>
                                            <span className="font-semibold">{formatTaka(printQuotation.subtotal)}</span>
                                        </div>
                                        <div className="flex justify-between py-3 border-t-2 font-bold text-xl mt-1" style={{ borderColor: '#1e293b', color: '#0f172a' }}>
                                            <span>Total</span>
                                            <span>{formatTaka(printQuotation.total)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Terms & Conditions and Signature */}
                                <div className="mt-12 pt-8 border-t-2" style={{ borderColor: '#f1f5f9' }}>
                                    <div className="grid grid-cols-2 gap-12">
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#1e293b' }}>Terms & Conditions</h3>
                                            <ul className="text-xs list-disc pl-4 space-y-1" style={{ color: '#64748b' }}>
                                                <li>Quotation is valid for 15 days from the date of issue.</li>
                                                <li>Payment terms: 100% advance or as discussed.</li>
                                                <li>Warranty: Standard manufacturer warranty applies unless stated otherwise.</li>
                                                <li>Items are subject to availability at the time of order confirmation.</li>
                                                {printQuotation.notes && <li className="font-medium mt-2 list-none -ml-4 pt-2 border-t" style={{ color: '#334155', borderColor: '#f1f5f9' }}>Additional Notes: {printQuotation.notes}</li>}
                                            </ul>
                                        </div>
                                        <div className="flex flex-col items-end justify-end">
                                            <div className="w-48 border-b-2 mb-2" style={{ borderColor: '#cbd5e1' }}></div>
                                            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Authorized Signature</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="mt-12 w-full text-center text-xs font-medium" style={{ color: '#94a3b8' }}>
                                    Thank you for your business.
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Hidden actual print layout (This replaces the entire screen during print) */}
            {printQuotation && typeof window !== "undefined" && createPortal(
                <div className="hidden print:block print-content absolute inset-0 bg-white z-[9999] px-0 py-0 printable-quotation text-slate-900">
                    <div className="max-w-[800px] mx-auto p-8">
                        <div className="flex justify-between items-start mb-10 border-b-2 border-slate-800 pb-6">
                            <div className="flex items-center gap-4">
                                <img src="/logo.png" alt="Promise Electronics Logo" className="h-16 w-16 object-contain rounded-md" />
                                <div className="flex flex-col leading-none">
                                    <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Promise</h1>
                                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-slate-500">Electronics</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <h2 className="text-4xl font-black uppercase tracking-widest text-slate-300 mb-2">Quotation</h2>
                                <div className="text-lg font-bold text-slate-800">{printQuotation.quotationNumber}</div>
                                <div className="text-sm font-medium text-slate-500 mt-1">Date: {format(new Date(printQuotation.createdAt), 'MMMM d, yyyy')}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-8 mb-10">
                            {/* FROM */}
                            <div>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">From</h3>
                                <p className="text-sm text-slate-700 font-medium">
                                    116 Hossain Tower, Lift 8<br />
                                    Box Culvert Road, Naya Paltan<br />
                                    Dhaka-1000, Bangladesh<br />
                                    <span className="mt-2 text-slate-500 block">
                                        Email: support@promise.com<br />
                                        Phone: +880 1968 123456
                                    </span>
                                </p>
                            </div>
                            {/* TO */}
                            <div className="text-right">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Quotation For</h3>
                                <div className="text-base font-bold text-slate-800">{printQuotation.customerName}</div>
                                <p className="text-sm text-slate-600 mt-1">{printQuotation.customerPhone}</p>
                                {printQuotation.customerEmail && <p className="text-sm text-slate-600">{printQuotation.customerEmail}</p>}
                                {printQuotation.customerAddress && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{printQuotation.customerAddress}</p>}
                            </div>
                        </div>

                        <table className="w-full mb-12">
                            <thead>
                                <tr className="border-b-2 border-slate-800">
                                    <th className="text-left py-3 text-xs font-bold uppercase tracking-wider text-slate-500 w-[50%]">Description</th>
                                    <th className="text-center py-3 text-xs font-bold uppercase tracking-wider text-slate-500 w-[15%]">Qty</th>
                                    <th className="text-right py-3 text-xs font-bold uppercase tracking-wider text-slate-500 w-[15%]">Unit Price</th>
                                    <th className="text-right py-3 text-xs font-bold uppercase tracking-wider text-slate-500 w-[20%]">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printQuotation.items.map((item, index) => (
                                    <tr key={index} className="border-b border-slate-200">
                                        <td className="py-4 text-sm font-medium text-slate-800">{item.description}</td>
                                        <td className="py-4 text-sm text-center text-slate-600">{item.quantity}</td>
                                        <td className="py-4 text-sm text-right text-slate-600">{item.unitPrice.toFixed(2)}</td>
                                        <td className="py-4 text-sm font-bold text-right text-slate-800">{(item.quantity * item.unitPrice).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="flex justify-end mb-16">
                            <div className="w-[300px]">
                                <div className="flex justify-between py-2 text-slate-600 text-sm">
                                    <span>Subtotal</span>
                                    <span className="font-semibold">{formatTaka(printQuotation.subtotal)}</span>
                                </div>
                                <div className="flex justify-between py-3 border-t-2 border-slate-800 text-slate-900 font-bold text-xl mt-1">
                                    <span>Total</span>
                                    <span>{formatTaka(printQuotation.total)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Terms & Conditions and Signature */}
                        <div className="mt-12 pt-8 border-t-2 border-slate-100">
                            <div className="grid grid-cols-2 gap-12">
                                <div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-3">Terms & Conditions</h3>
                                    <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1">
                                        <li>Quotation is valid for 15 days from the date of issue.</li>
                                        <li>Payment terms: 100% advance or as discussed.</li>
                                        <li>Warranty: Standard manufacturer warranty applies unless stated otherwise.</li>
                                        <li>Items are subject to availability at the time of order confirmation.</li>
                                        {printQuotation.notes && <li className="font-medium text-slate-700 mt-2 list-none -ml-4 pt-2 border-t border-slate-100">Additional Notes: {printQuotation.notes}</li>}
                                    </ul>
                                </div>
                                <div className="flex flex-col items-end justify-end">
                                    <div className="w-48 border-b-2 border-slate-300 mb-2"></div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Authorized Signature</div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="fixed bottom-12 w-full max-w-[800px] text-center text-xs text-slate-400 font-medium pb-8">
                            Thank you for your business.
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </motion.div >
    );
}
