import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { corporateApi } from "@/lib/api/corporateApi";
import { Loader2, X, Save, User as UserIcon, Mail } from "lucide-react";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";

interface EditProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: EditProfileDialogProps) {
    const { toast } = useToast();
    const { user, refreshUser } = useCorporateAuth();

    const [name, setName] = useState(user?.name || "");
    const [email, setEmail] = useState(user?.email || "");

    useEffect(() => {
        if (open && user) {
            setName(user.name || "");
            setEmail(user.email || "");
        }
    }, [open, user]);

    const updateProfileMutation = useMutation({
        mutationFn: async (data: { name: string; email: string }) => {
            const res = await fetch("/api/corporate/portal/profile", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-XSRF-TOKEN": getCookie('XSRF-TOKEN') || ""
                },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || "Failed to update profile");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Profile Updated", description: "Your details have been successfully saved." });
            refreshUser();
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: error.message || "Something went wrong."
            });
        }
    });

    const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
    };

    const handleSave = () => {
        if (!name.trim()) {
            toast({ variant: "destructive", title: "Validation Error", description: "Name is required." });
            return;
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast({ variant: "destructive", title: "Validation Error", description: "A valid email is required." });
            return;
        }

        updateProfileMutation.mutate({ name, email });
    };

    if (!user) return null;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onOpenChange(false)}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden z-10 border border-slate-100"
                    >
                        {/* Native Blue Header */}
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 relative text-white">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-4 top-4 rounded-full text-white/70 hover:text-white hover:bg-white/20"
                                onClick={() => onOpenChange(false)}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight">Edit Profile</h2>
                                <p className="mt-1 text-sm text-blue-100/90 font-medium">
                                    Update your personal information.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <UserIcon className="w-4 h-4 text-blue-500" />
                                        Full Name
                                    </Label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your full name"
                                        className="rounded-xl border-slate-200 focus-visible:ring-blue-500 h-11"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-indigo-500" />
                                        Email Address
                                    </Label>
                                    <Input
                                        value={email}
                                        type="email"
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="your.email@example.com"
                                        className="rounded-xl border-slate-200 focus-visible:ring-blue-500 h-11"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="bg-slate-50 border-t border-slate-100 p-5 flex items-center justify-end gap-3 shrink-0">
                            <Button
                                variant="ghost"
                                className="rounded-xl text-slate-600 hover:text-slate-900"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={updateProfileMutation.isPending}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20 px-6 font-bold"
                            >
                                {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
