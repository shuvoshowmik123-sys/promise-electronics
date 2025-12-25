import NativeLayout from "../NativeLayout";
import { useLocation, Link } from "wouter";
import { Loader2, User, ChevronRight, Phone, Mail, Lock, Camera, Image, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { takePhoto, selectFromGallery, isNative } from "@/lib/native-features";

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
    const [profileImage, setProfileImage] = useState<string>("");
    const [isPhotoDialogOpen, setIsPhotoDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            // Load existing profile image
            if (customer.profileImageUrl) {
                // Check if it's already a data URL or a regular URL
                if (customer.profileImageUrl.startsWith('data:') || customer.profileImageUrl.startsWith('http')) {
                    setProfileImage(customer.profileImageUrl);
                }
            }
        }
    }, [customer, form]);

    const onSubmit = async (data: EditProfileForm) => {
        setIsSaving(true);
        try {
            await updateProfile({
                name: data.name,
                phone: data.phone,
                email: data.email || undefined,

                profileImageUrl: profileImage,
            });
            console.log("Profile update request sent. Image length:", profileImage?.length);
            toast({
                title: "Success",
                description: "Profile updated successfully",
            });
            setLocation("/native/profile");
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

    const handleTakePhoto = async () => {
        setIsUploadingPhoto(true);
        setIsPhotoDialogOpen(false);
        try {
            const photo = await takePhoto();
            if (photo) {
                setProfileImage(photo);
                toast({
                    title: "Photo captured",
                    description: "Your profile photo has been updated",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to take photo",
                variant: "destructive",
            });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleSelectFromGallery = async () => {
        setIsUploadingPhoto(true);
        setIsPhotoDialogOpen(false);
        try {
            const photo = await selectFromGallery();
            if (photo) {
                setProfileImage(photo);
                toast({
                    title: "Photo selected",
                    description: "Your profile photo has been updated",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to select photo",
                variant: "destructive",
            });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    // Web fallback for file input
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImage(reader.result as string);
                setIsPhotoDialogOpen(false);
                toast({
                    title: "Photo selected",
                    description: "Your profile photo has been updated",
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setProfileImage("");
        setIsPhotoDialogOpen(false);
        toast({
            title: "Photo removed",
            description: "Profile photo has been removed",
        });
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
                                onClick={() => setIsPhotoDialogOpen(true)}
                            >
                                <div className="h-32 w-32 rounded-full border-4 border-[var(--color-native-surface)] shadow-sm bg-[var(--color-native-input)] overflow-hidden flex items-center justify-center">
                                    {isUploadingPhoto ? (
                                        <Loader2 className="w-10 h-10 animate-spin text-[var(--color-native-primary)]" />
                                    ) : profileImage ? (
                                        <img
                                            src={profileImage}
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
                                onClick={() => setIsPhotoDialogOpen(true)}
                                className="mt-4 text-[var(--color-native-primary)] font-bold text-sm tracking-wide"
                            >
                                {profileImage ? "Change Photo" : "Add Photo"}
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

            {/* Hidden file input for web fallback */}
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
            />

            {/* Photo Selection Dialog */}
            <Dialog open={isPhotoDialogOpen} onOpenChange={setIsPhotoDialogOpen}>
                <DialogContent className="max-w-[90vw] rounded-3xl p-0 overflow-hidden bg-[var(--color-native-card)] border-[var(--color-native-border)]">
                    <DialogHeader className="px-6 pt-6 pb-4">
                        <DialogTitle className="text-xl font-bold text-[var(--color-native-text)]">
                            Profile Photo
                        </DialogTitle>
                    </DialogHeader>
                    <div className="px-6 pb-6 space-y-3">
                        {/* Take Photo Option */}
                        <button
                            type="button"
                            onClick={isNative ? handleTakePhoto : () => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[var(--color-native-input)] hover:bg-[var(--color-native-border)] active:scale-[0.98] transition-all"
                        >
                            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <Camera className="w-6 h-6 text-blue-500" />
                            </div>
                            <div className="text-left">
                                <p className="font-bold text-[var(--color-native-text)]">
                                    {isNative ? "Take Photo" : "Upload Photo"}
                                </p>
                                <p className="text-xs text-[var(--color-native-text-muted)]">
                                    {isNative ? "Use your camera" : "Select a file from your device"}
                                </p>
                            </div>
                        </button>

                        {/* Select from Gallery Option - Only on native */}
                        {isNative && (
                            <button
                                type="button"
                                onClick={handleSelectFromGallery}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[var(--color-native-input)] hover:bg-[var(--color-native-border)] active:scale-[0.98] transition-all"
                            >
                                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                                    <Image className="w-6 h-6 text-purple-500" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-[var(--color-native-text)]">Choose from Gallery</p>
                                    <p className="text-xs text-[var(--color-native-text-muted)]">Select from your photos</p>
                                </div>
                            </button>
                        )}

                        {/* Remove Photo Option - Only if photo exists */}
                        {profileImage && (
                            <button
                                type="button"
                                onClick={handleRemovePhoto}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 active:scale-[0.98] transition-all"
                            >
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <X className="w-6 h-6 text-red-500" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-red-500">Remove Photo</p>
                                    <p className="text-xs text-red-400">Delete your profile photo</p>
                                </div>
                            </button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </NativeLayout>
    );
}

