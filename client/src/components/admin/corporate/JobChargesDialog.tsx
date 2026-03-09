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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Trash2, Plus, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobTicketsApi, serviceCatalogApi } from "@/lib/api";
import { JobTicket, InsertJobTicket } from "@shared/schema";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";

interface JobChargesDialogProps {
    job: JobTicket | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ChargeItem {
    id: string; // temp id for UI
    description: string;
    amount: number;
    type: "service" | "part";
    serviceId?: string; // Link to catalog
}

export function JobChargesDialog({ job, open, onOpenChange }: JobChargesDialogProps) {
    const queryClient = useQueryClient();

    // Local state for charges (draft until saved)
    const [charges, setCharges] = useState<ChargeItem[]>([]);

    // Form state for new charge
    const [openCombobox, setOpenCombobox] = useState(false);
    const [selectedServiceId, setSelectedServiceId] = useState("");
    const [description, setDescription] = useState("");
    const [amount, setAmount] = useState("");
    const [type, setType] = useState<"service" | "part">("service");

    // Fetch Service Catalog
    const { data: serviceCatalog = [] } = useQuery({
        queryKey: ["service-catalog", "active"],
        queryFn: () => serviceCatalogApi.getActiveServiceCatalog(),
        staleTime: 5 * 60 * 1000,
    });

    const selectedService = useMemo(() =>
        serviceCatalog.find(s => s.id === selectedServiceId),
        [selectedServiceId, serviceCatalog]);

    // Load existing charges when dialog opens
    useEffect(() => {
        if (job && open) {
            if (job.charges && Array.isArray(job.charges)) {
                // @ts-ignore - jsonb type is any
                setCharges(job.charges.map((c: any, index: number) => ({ ...c, id: index.toString() })));
            } else {
                setCharges([]);
            }
        }
    }, [job, open]);

    // Handle Service Selection
    useEffect(() => {
        if (selectedService) {
            setDescription(selectedService.name);
            // Default to avg or min? User said "between the rate".
            // Let's set it to empty or min to encourage input.
            // Or set placeholder.
            setAmount(selectedService.minPrice.toString());
        }
    }, [selectedService]);

    const addCharge = () => {
        if (!description || !amount) {
            toast.error("Please enter description and amount");
            return;
        }
        const val = parseFloat(amount);
        if (isNaN(val) || val < 0) {
            toast.error("Invalid amount");
            return;
        }

        // Validation against catalog range (Optional warning)
        if (selectedService) {
            if (val < selectedService.minPrice || val > selectedService.maxPrice) {
                toast.message("Note: Price is outside standard range", {
                    description: `Standard: ${selectedService.minPrice} - ${selectedService.maxPrice}`
                });
            }
        }

        const newCharge: ChargeItem = {
            id: Math.random().toString(36).substr(2, 9),
            description,
            amount: val,
            type,
            serviceId: selectedServiceId || undefined,
        };

        setCharges([...charges, newCharge]);

        // Reset form
        setDescription("");
        setAmount("");
        setSelectedServiceId("");
        setType("service");
    };

    const removeCharge = (id: string) => {
        setCharges(charges.filter(c => c.id !== id));
    };

    const totalAmount = charges.reduce((sum, c) => sum + c.amount, 0);

    const updateJobMutation = useMutation({
        mutationFn: (data: Partial<InsertJobTicket>) => {
            if (!job) throw new Error("No job selected");
            return jobTicketsApi.update(job.id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            toast.success("Charges saved successfully");
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to save charges");
        },
    });

    const handleSave = () => {
        // Sanitize charges (remove temp id)
        const sanitizedCharges = charges.map(({ id, ...rest }) => rest);

        updateJobMutation.mutate({
            charges: sanitizedCharges,
            estimatedCost: totalAmount, // Update total estimated cost
            // status: "Ready for Billing"? Maybe not auto-change status.
        });
    };

    if (!job) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Adjust Charges: Job #{job.id}</DialogTitle>
                    <DialogDescription>
                        Add services and parts. Rate range guidance applies.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Add Charge Form */}
                    <div className="p-5 bg-slate-50 border border-slate-100/60 rounded-xl">
                        <div className="grid gap-4">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <Label className="mb-2 block font-medium">Service / Item</Label>
                                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openCombobox}
                                                className="w-full justify-between bg-white border-slate-200"
                                            >
                                                {description || "Select service..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search services..." />
                                                <CommandList>
                                                    <CommandEmpty>No service found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {serviceCatalog.map((service) => (
                                                            <CommandItem
                                                                key={service.id}
                                                                value={service.name}
                                                                onSelect={() => {
                                                                    setSelectedServiceId(service.id);
                                                                    setOpenCombobox(false);
                                                                }}
                                                            >
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        selectedServiceId === service.id ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                <div>
                                                                    <p>{service.name}</p>
                                                                    <span className="text-xs text-muted-foreground">Rate: {service.minPrice} - {service.maxPrice}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="w-[120px]">
                                    <Label className="mb-2 block font-medium">Amount</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="bg-white border-slate-200"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <Button onClick={addCharge} size="icon" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"><Plus className="h-4 w-4" /></Button>
                                </div>
                            </div>

                            {selectedService && (
                                <div className="text-xs font-medium flex items-center gap-1.5 bg-blue-50/50 text-blue-700 p-3 rounded-lg border border-blue-100/50">
                                    <Info className="h-4 w-4" />
                                    Recommended Rate: {selectedService.minPrice} - {selectedService.maxPrice} BDT
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Charges Table */}
                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {charges.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                            No charges added yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    charges.map((charge) => (
                                        <TableRow key={charge.id}>
                                            <TableCell>{charge.description}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="uppercase text-[10px]">{charge.type}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{charge.amount.toFixed(2)}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeCharge(charge.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <div className="flex justify-between items-center p-4 bg-muted/20 border-t">
                            <span className="font-bold">Total Estimated Cost</span>
                            <span className="text-lg font-bold">{totalAmount.toFixed(2)} BDT</span>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={updateJobMutation.isPending}>
                        {updateJobMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Charges
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
