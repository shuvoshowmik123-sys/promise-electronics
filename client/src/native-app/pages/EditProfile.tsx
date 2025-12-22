import NativeLayout from "../NativeLayout";
import { useLocation, Link } from "wouter";
import { Loader2, User, Check, ChevronRight, Phone, Mail, Lock, Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const AVATAR_SEEDS = [
    "Felix", "Aneka", "Zoe", "Jack", "Bella",
    "Leo", "Mia", "Max", "Lily", "Sam",
    "Chloe", "Oscar", "Ruby", "Charlie", "Luna"
];

const editProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    phone: z.string().min(10, "Phone number must be valid"),
    email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

type EditProfileForm = z.infer<typeof editProfileSchema>;

export default function EditProfile() {
    const { customer, updateProfile, isLoading, isAuthenticated } = useCustomerAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [selectedAvatar, setSelectedAvatar] = useState<string>("");
    const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    if (!isLoading && !isAuthenticated) {
        setLocation("/native/login");
        return null;
    }

    const form = useForm<EditProfileForm>({
        resolver: zodResolver(editProfileSchema),
        defaultValues: {
            name: "",
            phone: "",
            email: "",
        },
    });

    // Update form values when customer data is loaded
    useEffect(() => {
        if (customer) {
            form.reset({
                name: customer.name || "",
                phone: customer.phone || "",
                email: customer.email || "",
            });
            setSelectedAvatar(customer.profileImageUrl || "");
        }
    }, [customer, form]);

    const onSubmit = async (data: EditProfileForm) => {
        setIsSaving(true);
        try {
            await updateProfile({
                name: data.name,
                phone: data.phone,
                email: data.email || undefined,
                profileImageUrl: selectedAvatar || undefined,
            });
            toast({
                title: "Success",
                description: "Profile updated successfully",
            });
            setLocation("/native/settings");
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update profile",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarSelect = (seed: string) => {
        setSelectedAvatar(seed);
        setIsAvatarDialogOpen(false);
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)]">
            <main className="flex-1 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                ) : (
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-full">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center justify-center pt-8 pb-6 px-4">
                            <div
                                className="relative group cursor-pointer"
                                onClick={() => setIsAvatarDialogOpen(true)}
                            >
                                <div className="h-32 w-32 rounded-full border-4 border-[var(--color-native-surface)] shadow-sm bg-[var(--color-native-input)] overflow-hidden flex items-center justify-center">
                                    {selectedAvatar ? (
                                        <img
                                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedAvatar}`}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <User className="w-16 h-16 text-[var(--color-native-text-muted)]" />
                                    )}
                                </div>
                                {/* Camera Badge */}
                                <div className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-native-primary)] text-black border-2 border-[var(--color-native-surface)] shadow-md transition-transform active:scale-95">
                                    <Camera className="w-5 h-5" />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAvatarDialogOpen(true)}
                                className="mt-4 text-[var(--color-native-primary)] font-bold text-sm tracking-wide"
                            >
                                Edit Photo
                            </button>
                        </div>

                        {/* Form Section */}
                        <div className="w-full max-w-[600px] mx-auto px-6 flex flex-col gap-6">
                            {/* Full Name */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[var(--color-native-text)] text-sm font-bold ml-1">
                                    Full Name
                                </label>
                                <div className="relative flex items-center">
                                    <User className="absolute left-4 w-5 h-5 text-[var(--color-native-text-muted)]" />
                                    <input
                                        {...form.register("name")}
                                        className="w-full rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-surface)] h-14 pl-12 pr-4 text-base font-normal text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all"
                                        placeholder="Enter your full name"
                                        type="text"
                                    />
                                </div>
                                {form.formState.errors.name && (
                                    <p className="text-sm text-red-500 ml-1">{form.formState.errors.name.message}</p>
                                )}
                            </div>

                            {/* Phone Number */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[var(--color-native-text)] text-sm font-bold ml-1">
                                    Phone Number
                                </label>
                                <div className="relative flex items-center">
                                    <Phone className="absolute left-4 w-5 h-5 text-[var(--color-native-text-muted)]" />
                                    <input
                                        {...form.register("phone")}
                                        className="w-full rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-surface)] h-14 pl-12 pr-4 text-base font-normal text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all"
                                        placeholder="Enter your phone number"
                                        type="tel"
                                    />
                                </div>
                                {form.formState.errors.phone && (
                                    <p className="text-sm text-red-500 ml-1">{form.formState.errors.phone.message}</p>
                                )}
                            </div>

                            {/* Email Address */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[var(--color-native-text)] text-sm font-bold ml-1">
                                    Email Address
                                </label>
                                <div className="relative flex items-center">
                                    <Mail className="absolute left-4 w-5 h-5 text-[var(--color-native-text-muted)]" />
                                    <input
                                        {...form.register("email")}
                                        className="w-full rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-surface)] h-14 pl-12 pr-4 text-base font-normal text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all"
                                        placeholder="Enter your email address"
                                        type="email"
                                    />
                                </div>
                                {form.formState.errors.email && (
                                    <p className="text-sm text-red-500 ml-1">{form.formState.errors.email.message}</p>
                                )}
                            </div>

                            {/* Security Section */}
                            <div className="flex flex-col gap-2 pt-2">
                                <label className="text-[var(--color-native-text)] text-sm font-bold ml-1">
                                    Security
                                </label>
                                <Link href="/native/settings/change-password">
                                    <button
                                        type="button"
                                        className="w-full flex items-center justify-between rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-surface)] h-14 px-4 active:bg-[var(--color-native-input)] transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Lock className="w-5 h-5 text-[var(--color-native-text-muted)] ml-1" />
                                            <span className="text-base font-medium text-[var(--color-native-text)]">
                                                Change Password
                                            </span>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                                    </button>
                                </Link>
                            </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="mt-10 w-full max-w-[600px] mx-auto px-6 pb-8 flex flex-col items-center gap-6">
                            {/* Main CTA */}
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full h-14 rounded-full bg-[var(--color-native-primary)] text-black font-bold text-lg shadow-lg hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <span>Save Changes</span>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </main>

            {/* Avatar Selection Dialog */}
            <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
                <DialogContent className="max-w-[90vw] rounded-3xl p-0 overflow-hidden bg-[var(--color-native-card)] border-[var(--color-native-border)]">
                    <DialogHeader className="px-6 pt-6 pb-4">
                        <DialogTitle className="text-xl font-bold text-[var(--color-native-text)]">
                            Choose Avatar
                        </DialogTitle>
                    </DialogHeader>
                    <div className="px-6 pb-6">
                        <div className="grid grid-cols-5 gap-3">
                            {AVATAR_SEEDS.map((seed) => (
                                <button
                                    key={seed}
                                    type="button"
                                    onClick={() => handleAvatarSelect(seed)}
                                    className={`relative aspect-square rounded-full overflow-hidden border-2 transition-all ${selectedAvatar === seed
                                            ? "border-[var(--color-native-primary)] ring-2 ring-[var(--color-native-primary)]/30 scale-105"
                                            : "border-transparent hover:border-[var(--color-native-border)]"
                                        }`}
                                >
                                    <img
                                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`}
                                        alt={seed}
                                        className="w-full h-full bg-[var(--color-native-input)]"
                                    />
                                    {selectedAvatar === seed && (
                                        <div className="absolute inset-0 bg-[var(--color-native-primary)]/20 flex items-center justify-center">
                                            <Check className="w-6 h-6 text-[var(--color-native-primary)] drop-shadow-md" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </NativeLayout>
    );
}
