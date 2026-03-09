import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface CreateCorporateClientDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateCorporateClientDialog({ open, onOpenChange }: CreateCorporateClientDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        companyName: "",
        shortCode: "",
        contactPerson: "",
        contactPhone: "",
        address: "",
        billingCycle: "monthly",
        paymentTerms: "30",
        portalUsername: "",
        portalPassword: "",
    });

    const mutation = useMutation({
        mutationFn: async (data: any) => {
            return corporateApi.create({
                ...data,
                paymentTerms: parseInt(data.paymentTerms),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporate-clients"] });
            toast({
                title: "Client Added",
                description: "Corporate client has been successfully registered.",
            });
            onOpenChange(false);
            setFormData({
                companyName: "",
                shortCode: "",
                contactPerson: "",
                contactPhone: "",
                address: "",
                billingCycle: "monthly",
                paymentTerms: "30",
                portalUsername: "",
                portalPassword: "",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to Add Client",
                description: error.message || "An error occurred while creating the client.",
                variant: "destructive"
            });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.companyName || !formData.shortCode) {
            toast({
                title: "Validation Error",
                description: "Company Name and Short Code are required.",
                variant: "destructive"
            });
            return;
        }
        mutation.mutate(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl">Add Corporate Client</DialogTitle>
                    <DialogDescription>
                        Register a new B2B partner and set up their corporate portal access.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="companyName">Company Name <span className="text-red-500">*</span></Label>
                            <Input
                                id="companyName"
                                value={formData.companyName}
                                onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                                placeholder="E.g., Acme Corp"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="shortCode">Short Code <span className="text-red-500">*</span></Label>
                            <Input
                                id="shortCode"
                                value={formData.shortCode}
                                onChange={(e) => setFormData(prev => ({ ...prev, shortCode: e.target.value.toUpperCase() }))}
                                placeholder="E.g., ACM"
                                maxLength={5}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contactPerson">Primary Contact</Label>
                            <Input
                                id="contactPerson"
                                value={formData.contactPerson}
                                onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                                placeholder="Contact Name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPhone">Contact Phone</Label>
                            <Input
                                id="contactPhone"
                                value={formData.contactPhone}
                                onChange={(e) => setFormData(prev => ({ ...prev, contactPhone: e.target.value }))}
                                placeholder="Phone Number"
                            />
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="address">Billing Address</Label>
                            <Input
                                id="address"
                                value={formData.address}
                                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="Full Address"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="billingCycle">Billing Cycle</Label>
                            <Select
                                value={formData.billingCycle}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, billingCycle: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select cycle" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="paymentTerms">Payment Terms (Days)</Label>
                            <Select
                                value={formData.paymentTerms}
                                onValueChange={(val) => setFormData(prev => ({ ...prev, paymentTerms: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select terms" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="15">Net 15</SelectItem>
                                    <SelectItem value="30">Net 30</SelectItem>
                                    <SelectItem value="60">Net 60</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="portalUsername">Portal Username</Label>
                            <Input
                                id="portalUsername"
                                value={formData.portalUsername}
                                onChange={(e) => setFormData(prev => ({ ...prev, portalUsername: e.target.value }))}
                                placeholder="Login ID for B2B Portal"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="portalPassword">Portal Password</Label>
                            <Input
                                id="portalPassword"
                                type="password"
                                value={formData.portalPassword}
                                onChange={(e) => setFormData(prev => ({ ...prev, portalPassword: e.target.value }))}
                                placeholder="Leave blank to auto-generate"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Client
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
