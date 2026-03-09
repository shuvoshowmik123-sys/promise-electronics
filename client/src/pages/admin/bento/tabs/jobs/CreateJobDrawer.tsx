import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Wrench, User, Monitor, ShieldCheck, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { jobTicketsApi, aiApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { InsertJobTicket } from "@shared/schema";

interface CreateJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    technicianUsers: any[];
    tvInches: string[];
}

export function CreateJobDrawer({
    isOpen,
    onClose,
    technicianUsers,
    tvInches
}: CreateJobDrawerProps) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<Partial<InsertJobTicket>>({
        status: "Pending",
        priority: "Medium",
        technician: "Unassigned",
        assignedTechnicianId: undefined,
    });
    const [nextJobNumber, setNextJobNumber] = useState<string>("");
    const [selectedAssistedBy, setSelectedAssistedBy] = useState<string[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            jobTicketsApi.getNextNumber().then(({ nextNumber }) => {
                setNextJobNumber(nextNumber);
            }).catch(() => { setNextJobNumber(""); });
        } else {
            // Reset form when closed
            setFormData({
                status: "Pending",
                priority: "Medium",
                technician: "Unassigned",
                assignedTechnicianId: undefined,
            });
            setSelectedAssistedBy([]);
        }
    }, [isOpen]);

    const createMutation = useMutation({
        mutationFn: (data: Partial<InsertJobTicket>) => jobTicketsApi.create(data as any),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            onClose();
            toast.success("Job ticket created successfully");
        },
        onError: () => toast.error("Failed to create job ticket"),
    });

    const handleCreate = () => {
        if (!formData.customer || !formData.device || !formData.issue) {
            toast.error("Please fill in all required fields (Customer, Device, Issue)");
            return;
        }

        const jobData: any = { ...formData };
        if (jobData.customerPhone) {
            jobData.customerPhone = "+880" + jobData.customerPhone.replace(/^(\+880|880)/, '');
        }

        if (selectedAssistedBy.length > 0) {
            jobData.assistedByIds = JSON.stringify(selectedAssistedBy);
            const assistantNames = selectedAssistedBy
                .map(id => technicianUsers.find(t => t.id === id)?.name)
                .filter(Boolean).join(", ");
            jobData.assistedByNames = assistantNames || null;
        }

        createMutation.mutate(jobData);
    };

    const handleSuggestTechnician = async (issue: string) => {
        if (!issue) {
            toast.error("Please enter an issue description first");
            return;
        }
        setIsSuggesting(true);
        try {
            const suggestion = await aiApi.suggestTechnician(issue);
            if (suggestion) {
                const tech = technicianUsers.find(u => u.id === suggestion.technicianId);
                if (tech) {
                    setFormData(prev => ({ ...prev, technician: tech.name, assignedTechnicianId: tech.id }));
                    toast.success(`AI Suggested: ${tech.name}`, { description: suggestion.reason });
                } else toast.error("Suggested technician not found in list");
            } else toast.error("AI could not make a suggestion");
        } catch {
            toast.error("Failed to get AI suggestion");
        } finally { setIsSuggesting(false); }
    };

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-2xl bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl overflow-y-auto z-[250]">
                <SheetHeader className="mb-6 border-b border-slate-100 pb-4 mt-6">
                    <SheetTitle className="text-2xl font-bold font-heading flex items-center gap-2 text-slate-800">
                        <Wrench className="w-6 h-6 text-blue-600" /> Create Job Ticket
                    </SheetTitle>
                    <SheetDescription>Register a new repair item and assign a technician.</SheetDescription>
                </SheetHeader>
                <div className="space-y-8 pb-24">
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
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Textarea placeholder="Delivery/Pickup address..." value={formData.customerAddress || ""} onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })} rows={2} className="bg-slate-50 resize-none" />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-purple-600 flex items-center gap-2 bg-purple-50 p-2 rounded-lg border border-purple-100 uppercase tracking-wider">
                            <Monitor className="w-4 h-4" /> Device Registration
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Device / Model *</Label>
                                <Input placeholder="Samsung 55' UHD" value={formData.device || ""} onChange={(e) => setFormData({ ...formData, device: e.target.value })} className="bg-slate-50" />
                            </div>
                            <div className="space-y-2">
                                <Label>Screen Size</Label>
                                <Select value={formData.screenSize || ""} onValueChange={(value) => setFormData({ ...formData, screenSize: value })}>
                                    <SelectTrigger className="bg-slate-50"><SelectValue placeholder="Select size" /></SelectTrigger>
                                    <SelectContent>{tvInches.map((inch) => <SelectItem key={inch} value={inch}>{inch}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Issue Description *</Label>
                            <Textarea placeholder="Describe the hardware or software problem in detail..." value={formData.issue || ""} onChange={(e) => setFormData({ ...formData, issue: e.target.value })} rows={3} className="bg-slate-50 resize-none" />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-bold text-sm text-emerald-600 flex items-center gap-2 bg-emerald-50 p-2 rounded-lg border border-emerald-100 uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4" /> Assignment & Priority
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Priority Level</Label>
                                <Select value={formData.priority || "Medium"} onValueChange={(value) => setFormData({ ...formData, priority: value as any })}>
                                    <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low - Standard</SelectItem>
                                        <SelectItem value="Medium">Medium - Regular</SelectItem>
                                        <SelectItem value="High">High - Urgent</SelectItem>
                                        <SelectItem value="Critical">Critical - Immediate</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Assign Technician</Label>
                                    <Button variant="ghost" size="sm" type="button" className="h-5 px-2 text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-200 uppercase tracking-wider font-bold rounded" onClick={() => handleSuggestTechnician(formData.issue || "")} disabled={isSuggesting}>
                                        {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />} AI Assign
                                    </Button>
                                </div>
                            </div>

                            <TechnicianPicker
                                users={technicianUsers}
                                assignedTechnicianId={formData.assignedTechnicianId}
                                assistedByIds={selectedAssistedBy}
                                onAssignedChange={(id, name) => setFormData({ ...formData, assignedTechnicianId: id, technician: name })}
                                onAssistedChange={setSelectedAssistedBy}
                            />

                            <div className="space-y-2">
                            </div>
                        </div>
                    </div>
                </div>
                <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-100 flex flex-row justify-end space-x-3 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
                    <Button variant="outline" onClick={onClose} className="rounded-xl border-slate-200 bg-white">Cancel</Button>
                    <Button onClick={handleCreate} disabled={createMutation.isPending} className="rounded-xl px-8 shadow-md bg-blue-600 hover:bg-blue-700 font-bold tracking-wide">
                        {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Submit Ticket
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
