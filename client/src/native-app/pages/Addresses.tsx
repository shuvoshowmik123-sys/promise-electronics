import NativeLayout from "../NativeLayout";
import { Plus, MapPin, Trash2, Edit2, Check, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { getApiUrl } from "@/lib/config";

type Address = {
    id: string;
    label: string;
    address: string;
    isDefault: boolean;
};

export default function Addresses() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);

    // Form State
    const [label, setLabel] = useState("");
    const [addressText, setAddressText] = useState("");
    const [isDefault, setIsDefault] = useState(false);

    const { data: addresses = [], isLoading } = useQuery<Address[]>({
        queryKey: ["customer-addresses"],
        queryFn: async () => {
            const res = await fetch(getApiUrl("/api/customer/addresses"));
            if (!res.ok) throw new Error("Failed to fetch addresses");
            return res.json();
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: { label: string; address: string; isDefault: boolean }) => {
            const res = await fetch(getApiUrl("/api/customer/addresses"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to create address");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
            setIsAddOpen(false);
            resetForm();
            toast({ title: "Success", description: "Address added successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async (data: { id: string; label: string; address: string; isDefault: boolean }) => {
            const res = await fetch(getApiUrl(`/api/customer/addresses/${data.id}`), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: data.label,
                    address: data.address,
                    isDefault: data.isDefault,
                }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to update address");
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
            setEditingAddress(null);
            resetForm();
            toast({ title: "Success", description: "Address updated successfully" });
        },
        onError: (error: Error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(getApiUrl(`/api/customer/addresses/${id}`), {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete address");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-addresses"] });
            toast({ title: "Success", description: "Address deleted successfully" });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to delete address", variant: "destructive" });
        },
    });

    const resetForm = () => {
        setLabel("");
        setAddressText("");
        setIsDefault(false);
    };

    const handleEdit = (addr: Address) => {
        setEditingAddress(addr);
        setLabel(addr.label);
        setAddressText(addr.address);
        setIsDefault(addr.isDefault);
    };

    const handleSave = () => {
        if (!label || !addressText) {
            toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
            return;
        }

        if (editingAddress) {
            updateMutation.mutate({ id: editingAddress.id, label, address: addressText, isDefault });
        } else {
            createMutation.mutate({ label, address: addressText, isDefault });
        }
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-32">
            <main className="flex-1 px-4 pt-6 space-y-4 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                    <div className="text-center py-10 text-[var(--color-native-text-muted)]">Loading addresses...</div>
                ) : addresses.length === 0 ? (
                    <div className="text-center py-10 text-[var(--color-native-text-muted)]">
                        <MapPin className="w-12 h-12 mx-auto text-[var(--color-native-border)] mb-3" />
                        <p>No addresses found.</p>
                        <p className="text-xs mt-1">Add an address to speed up checkout.</p>
                    </div>
                ) : (
                    addresses.map((addr) => (
                        <div key={addr.id} className="bg-[var(--color-native-card)] p-4 rounded-2xl border border-[var(--color-native-border)] shadow-sm relative group">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-[var(--color-native-text)]">{addr.label}</span>
                                    {addr.isDefault && (
                                        <span className="bg-[var(--color-native-primary)]/20 text-[var(--color-native-primary)] text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            Default
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(addr)}
                                        className="p-1.5 rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)]"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteMutation.mutate(addr.id)}
                                        className="p-1.5 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed">{addr.address}</p>
                        </div>
                    ))
                )}

                <button
                    onClick={() => {
                        resetForm();
                        setIsAddOpen(true);
                    }}
                    className="w-full py-4 rounded-2xl border-2 border-dashed border-[var(--color-native-border)] text-[var(--color-native-text-muted)] font-bold flex items-center justify-center gap-2 active:bg-[var(--color-native-input)] transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    Add New Address
                </button>
            </main>

            {/* Add/Edit Dialog */}
            <Dialog open={isAddOpen || !!editingAddress} onOpenChange={(open) => {
                if (!open) {
                    setIsAddOpen(false);
                    setEditingAddress(null);
                }
            }}>
                <DialogContent className="sm:max-w-[425px] w-[90%] rounded-2xl bg-[var(--color-native-card)] border-[var(--color-native-border)] text-[var(--color-native-text)]">
                    <DialogHeader>
                        <DialogTitle className="text-[var(--color-native-text)]">{editingAddress ? "Edit Address" : "Add New Address"}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="label" className="text-[var(--color-native-text)]">Label (e.g., Home, Office)</Label>
                            <Input
                                id="label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Home"
                                className="bg-[var(--color-native-input)] border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="address" className="text-[var(--color-native-text)]">Full Address</Label>
                            <Textarea
                                id="address"
                                value={addressText}
                                onChange={(e) => setAddressText(e.target.value)}
                                placeholder="House #123, Road #4, Block B..."
                                className="min-h-[100px] bg-[var(--color-native-input)] border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]"
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="default"
                                checked={isDefault}
                                onCheckedChange={(checked) => setIsDefault(checked as boolean)}
                                className="border-[var(--color-native-border)] data-[state=checked]:bg-[var(--color-native-primary)] data-[state=checked]:text-white"
                            />
                            <Label htmlFor="default" className="text-[var(--color-native-text)]">Set as default address</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSave} className="w-full bg-[var(--color-native-primary)] text-white hover:bg-[var(--color-native-primary)]/90">
                            {editingAddress ? "Update Address" : "Save Address"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </NativeLayout>
    );
}
