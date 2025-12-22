import NativeLayout from "../NativeLayout";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { useEffect } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        }
    }, [customer, form]);

    const onSubmit = async (data: EditProfileForm) => {
        try {
            await updateProfile({
                name: data.name,
                phone: data.phone,
                email: data.email || undefined,
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
        }
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)]">

            <main className="flex-1 px-4 py-6 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                ) : (
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-[var(--color-native-text)]">Full Name</Label>
                            <Input id="name" {...form.register("name")} className="bg-[var(--color-native-input)] border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]" />
                            {form.formState.errors.name && (
                                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone" className="text-[var(--color-native-text)]">Phone Number</Label>
                            <Input id="phone" {...form.register("phone")} className="bg-[var(--color-native-input)] border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]" />
                            {form.formState.errors.phone && (
                                <p className="text-sm text-red-500">{form.formState.errors.phone.message}</p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-[var(--color-native-text)]">Email Address</Label>
                            <Input id="email" type="email" {...form.register("email")} className="bg-[var(--color-native-input)] border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]" />
                            {form.formState.errors.email && (
                                <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-[var(--color-native-primary)] hover:bg-[var(--color-native-primary)]/90 text-white"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Changes
                        </Button>
                    </form>
                )}
            </main>
        </NativeLayout>
    );
}
