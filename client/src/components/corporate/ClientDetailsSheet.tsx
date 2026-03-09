
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
    SheetFooter
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { CorporateClient, InsertCorporateClient } from "@shared/schema";
import { corporateApi } from "@/lib/api";
import { Loader2, Plus, Building2, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ClientDetailsSheetProps {
    client: CorporateClient | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ClientDetailsSheet({ client, open, onOpenChange }: ClientDetailsSheetProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("details");

    if (!client) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        {client.companyName}
                    </SheetTitle>
                    <SheetDescription>
                        {client.shortCode} • {client.parentClientId ? "Branch" : "Master Client"}
                    </SheetDescription>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="details">Details & Settings</TabsTrigger>
                        <TabsTrigger value="branches" disabled={!!client.parentClientId}>
                            Branches
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="pt-4">
                        <EditClientForm client={client} />
                    </TabsContent>

                    <TabsContent value="branches" className="pt-4">
                        <BranchManager client={client} />
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}

function EditClientForm({ client }: { client: CorporateClient }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState<Partial<InsertCorporateClient>>({
        companyName: client.companyName,
        shortCode: client.shortCode,
        contactPerson: client.contactPerson || "",
        contactPhone: client.contactPhone || "",
        address: client.address || "",
        phone: client.phone || "",
        branchName: client.branchName || "", // Should be empty for master
    });

    const updateClientMutation = useMutation({
        mutationFn: async (data: Partial<InsertCorporateClient>) => {
            return await corporateApi.update(client.id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporateClients"] });
            toast({ title: "Success", description: "Client details updated" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateClientMutation.mutate(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                />
            </div>

            {client.parentClientId && (
                <div className="grid gap-2">
                    <Label htmlFor="branchName">Branch Name</Label>
                    <Input
                        id="branchName"
                        value={formData.branchName || ""}
                        onChange={e => setFormData({ ...formData, branchName: e.target.value })}
                        placeholder="e.g. Gulshan Branch"
                    />
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                        id="contactPerson"
                        value={formData.contactPerson || ""}
                        onChange={e => setFormData({ ...formData, contactPerson: e.target.value })}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <PhoneInput
                        id="contactPhone"
                        value={formData.contactPhone || ""}
                        onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                    id="address"
                    value={formData.address || ""}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Full address"
                />
            </div>

            <Button type="submit" disabled={updateClientMutation.isPending} className="w-full">
                {updateClientMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
            </Button>
        </form>
    );
}

function BranchManager({ client }: { client: CorporateClient }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [newBranchCode, setNewBranchCode] = useState("");

    // Fetch Branches
    const { data: branches, isLoading } = useQuery({
        queryKey: ["corporateBranches", client.id],
        queryFn: () => corporateApi.getBranches(client.id),
        enabled: !client.parentClientId
    });

    const createBranchMutation = useMutation({
        mutationFn: async () => {
            // Create a new client entry linked to this parent
            const branchData: InsertCorporateClient = {
                companyName: client.companyName + (newBranchName ? ` - ${newBranchName}` : ""),
                shortCode: newBranchCode,
                parentClientId: client.id,
                branchName: newBranchName,
                contactPerson: client.contactPerson, // Inherit defaults
                contactPhone: client.contactPhone,
                address: client.address,
                // Required fields
                pricingType: client.pricingType || "standard",
                billingCycle: client.billingCycle || "monthly",
                paymentTerms: client.paymentTerms || 30
            };
            return await corporateApi.create(branchData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporateBranches", client.id] });
            setIsAdding(false);
            setNewBranchName("");
            setNewBranchCode("");
            toast({ title: "Success", description: "Branch created successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    const handleCreateBranch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBranchName || !newBranchCode) return;
        createBranchMutation.mutate();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">Active Branches</h3>
                <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
                    {isAdding ? "Cancel" : "Add Branch"}
                </Button>
            </div>

            {isAdding && (
                <Card className="bg-muted/50 border-dashed">
                    <CardContent className="pt-6">
                        <form onSubmit={handleCreateBranch} className="space-y-3">
                            <div className="grid gap-2">
                                <Label>Branch Name</Label>
                                <Input
                                    placeholder="e.g. Uttara Branch"
                                    value={newBranchName}
                                    onChange={e => setNewBranchName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>Branch Code</Label>
                                <Input
                                    placeholder="e.g. 1KF-UTT"
                                    value={newBranchCode}
                                    onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                                    required
                                />
                            </div>
                            <Button type="submit" size="sm" disabled={createBranchMutation.isPending}>
                                {createBranchMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Branch
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-2">
                {isLoading ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">Loading branches...</div>
                ) : branches && branches.length > 0 ? (
                    branches.map(branch => (
                        <div key={branch.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                            <div className="flex items-center gap-3">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <div>
                                    <p className="font-medium text-sm">{branch.branchName || branch.companyName}</p>
                                    <p className="text-xs text-muted-foreground">{branch.shortCode}</p>
                                </div>
                            </div>
                            <Badge variant="outline" className="text-xs">Active</Badge>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                        No branches found. Add one to get started.
                    </div>
                )}
            </div>
        </div>
    );
}
