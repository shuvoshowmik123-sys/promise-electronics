import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useToast } from "@/hooks/use-toast";
import NativeLayout from "../NativeLayout";
import { ArrowLeft, Upload, X, Loader2, CheckCircle, Smartphone, MapPin, Calendar as CalendarIcon, Camera, ChevronRight, AlertCircle, UserPlus, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { serviceRequestsApi, settingsApi, aiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { getApiUrl } from "@/lib/config";
import { ImageKitUpload } from "@/components/common/ImageKitUpload";
import { compressImage, getCompressionPreset, formatFileSize } from "@/lib/imageCompression";

interface UploadedFile {
    name: string;
    type: string;
    preview: string;
    objectUrl: string;
    publicId: string;
    resourceType: "image" | "video";
}

export default function RepairRequest() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [brand, setBrand] = useState("");
    const [screenSize, setScreenSize] = useState("");
    const [modelNumber, setModelNumber] = useState("");
    const [primaryIssue, setPrimaryIssue] = useState("");
    const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
    const [description, setDescription] = useState("");
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [servicePreference, setServicePreference] = useState("home_pickup");
    const [address, setAddress] = useState("");
    const [scheduledDate, setScheduledDate] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [ticketNumber, setTicketNumber] = useState("");
    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const { customer, isAuthenticated, register } = useCustomerAuth();

    useEffect(() => {
        if (isAuthenticated && customer) {
            setCustomerName(customer.name || "");
            setPhone(customer.phone || "");
            setAddress(customer.address || "");
        }
    }, [isAuthenticated, customer]);

    // ... (keep existing code)



    // Fetch Settings
    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    // Fetch Customer Addresses
    const { data: savedAddresses = [] } = useQuery({
        queryKey: ["customer-addresses"],
        queryFn: async () => {
            if (!isAuthenticated) return [];
            const res = await fetch(getApiUrl("/api/customer/addresses"));
            if (!res.ok) return [];
            return res.json();
        },
        enabled: isAuthenticated,
    });

    useEffect(() => {
        if (savedAddresses.length > 0 && !address) {
            const defaultAddr = savedAddresses.find((a: any) => a.isDefault);
            if (defaultAddr) {
                setAddress(defaultAddr.address);
            } else {
                setAddress(savedAddresses[0].address);
            }
        }
    }, [savedAddresses]);

    const getSettingArray = (key: string, defaultValue: string[]): string[] => {
        const setting = settings.find((s) => s.key === key);
        if (setting?.value) {
            try {
                return JSON.parse(setting.value);
            } catch {
                return defaultValue;
            }
        }
        return defaultValue;
    };

    const tvBrands = getSettingArray("tv_brands", ["Sony", "Samsung", "LG", "Walton", "Vision"]);
    const tvInches = getSettingArray("tv_inches", ["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"]);
    const serviceCategories = getSettingArray("service_categories", ["No Power", "No Display", "Broken Screen", "Sound Issue", "Software"]);
    const commonSymptoms = getSettingArray("common_symptoms", ["Blinking Red Light", "Lines on Screen", "Dim Picture", "Wifi Not Connecting", "Remote Not Working", "Burning Smell"]);

    // File Upload Logic
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAIInspect = async (file: UploadedFile) => {
        if (file.resourceType !== "image") {
            toast({ title: "Not an image", description: "AI can only analyze images", variant: "destructive" });
            return;
        }

        setIsAnalyzing(true);
        try {
            // Fetch the image and compress it before AI analysis
            const response = await fetch(file.objectUrl);
            const originalBlob = await response.blob();

            console.log(`[AI] Original image size: ${formatFileSize(originalBlob.size)}`);

            // Compress image for AI analysis (max 1024x1024, 85% quality)
            const compressionOptions = getCompressionPreset('ai-analysis');
            const compressed = await compressImage(originalBlob, compressionOptions);

            console.log(`[AI] Compressed to: ${formatFileSize(compressed.compressedSize)} (${compressed.compressionRatio.toFixed(1)}x smaller)`);

            // Use compressed base64 for AI analysis
            const diagnosis = await aiApi.inspectImage(compressed.base64);

            if (diagnosis) {
                setDescription(prev => {
                    const newDesc = `[AI Diagnosis]\nComponent: ${diagnosis.component}\nDamage: ${diagnosis.damage.join(", ")}\nLikely Cause: ${diagnosis.likelyCause}\nSeverity: ${diagnosis.severity}\n\n${prev}`;
                    return newDesc;
                });
                toast({ title: "AI Analysis Complete", description: "Diagnosis added to description." });
            } else {
                toast({ title: "Analysis Failed", description: "Could not analyze image.", variant: "destructive" });
            }
        } catch (error) {
            console.error("AI Inspect error:", error);
            toast({ title: "Analysis Failed", description: "An error occurred.", variant: "destructive" });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const queryClient = useQueryClient();

    const createRequestMutation = useMutation({
        mutationFn: serviceRequestsApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
            toast({ title: "Request Submitted", description: "We will contact you shortly." });
            setLocation("/native/bookings");
        },
        onError: (error: any) => {
            toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
        }
    });

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            console.log("Starting submission...");

            // Register if not authenticated and password provided
            if (!isAuthenticated && password) {
                console.log("Attempting registration...");
                try {
                    await register({
                        name: customerName,
                        phone,
                        address: address || undefined,
                        password,
                    });
                    console.log("Registration successful");
                    toast({ title: "Account Created", description: "Your account has been created successfully." });
                } catch (regError: any) {
                    console.error("Registration failed:", regError);
                    toast({
                        title: "Registration Failed",
                        description: regError.message || "Could not create account. Please try again.",
                        variant: "destructive"
                    });
                    setIsSubmitting(false);
                    return; // Stop if registration fails
                }
            }

            console.log("Uploading media...");
            const mediaData = files.map(f => ({
                url: f.objectUrl,
                publicId: f.publicId,
                resourceType: f.resourceType,
            }));

            console.log("Creating service request...");
            const result = await createRequestMutation.mutateAsync({
                brand,
                screenSize,
                modelNumber: modelNumber || undefined,
                primaryIssue,
                symptoms: JSON.stringify(selectedSymptoms),
                description: description || undefined,
                mediaUrls: JSON.stringify(mediaData),
                customerName: customerName || customer?.name || "",
                phone: phone || customer?.phone || "",
                address: address || undefined,
                servicePreference,
                scheduledPickupDate: scheduledDate ? new Date(scheduledDate) : undefined,
                status: "Pending",
                requestIntent: "repair",
                serviceMode: servicePreference === "home_pickup" ? "pickup" : "service_center",
            });

            console.log("Service request created:", result);
            setTicketNumber(result.ticketNumber || "");
            setStep(5);
        } catch (error: any) {
            console.error("Submission error:", error);
            toast({ title: "Submission Failed", description: error.message || "An unexpected error occurred", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleSymptom = (symptom: string) => {
        setSelectedSymptoms(prev =>
            prev.includes(symptom)
                ? prev.filter(s => s !== symptom)
                : [...prev, symptom]
        );
    };
    const handleNextStep = () => {
        const newErrors: Record<string, boolean> = {};

        if (step === 1) {
            if (!brand) newErrors.brand = true;
            if (!screenSize) newErrors.screenSize = true;

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                toast({ title: "Required Fields", description: "Please fill in all required fields", variant: "destructive" });
                return;
            }
            setStep(2);
        } else if (step === 2) {
            if (!primaryIssue) newErrors.primaryIssue = true;
            if (selectedSymptoms.length === 0) newErrors.symptoms = true;

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                toast({ title: "Required Fields", description: "Please select an issue and at least one symptom", variant: "destructive" });
                return;
            }
            setStep(3);
        } else if (step === 3) {
            if (!isAuthenticated) {
                if (!customerName) newErrors.customerName = true;
                if (!phone || phone.length < 10) newErrors.phone = true;
            }
            if (servicePreference === "home_pickup" && !address) newErrors.address = true;
            if (servicePreference === "service_center" && !scheduledDate) newErrors.scheduledDate = true;

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                toast({ title: "Required Fields", description: "Please fill in all contact details", variant: "destructive" });
                return;
            }

            if (isAuthenticated) {
                handleSubmit();
            } else {
                setStep(4);
            }
        } else if (step === 4) {
            if (!password || password.length < 6) newErrors.password = true;
            if (password !== confirmPassword) newErrors.confirmPassword = true;

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                toast({ title: "Invalid Password", description: "Please check your password fields", variant: "destructive" });
                return;
            }
            handleSubmit();
        }
    };

    return (
        <NativeLayout className="flex flex-col h-full bg-[var(--color-native-bg)]">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 bg-[var(--color-native-surface)] border-b border-[var(--color-native-border)] sticky top-0 z-10 transition-colors duration-200">
                <button
                    onClick={() => step === 1 ? setLocation("/native/home") : setStep(s => s - 1)}
                    className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)]"
                    {...(step > 1 ? { 'data-wizard-back': true } : {})}
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex-1">
                    <h1 className="text-3xl md:text-4xl font-heading font-bold mb-4 text-[var(--color-native-text)]">TV Repair Request</h1>
                    <div className="flex gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-[var(--color-native-primary)]" : "bg-[var(--color-native-border)]")} />
                        ))}
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto scrollbar-hide p-6">
                {step === 1 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">TV Brand *</label>
                            <div className={cn(
                                "grid grid-cols-2 gap-3",
                                errors.brand && "border border-red-500 rounded-xl p-2 animate-shake"
                            )}>
                                {tvBrands.map(b => (
                                    <button
                                        key={b}
                                        onClick={() => {
                                            setBrand(b);
                                            if (errors.brand) setErrors({ ...errors, brand: false });
                                        }}
                                        className={cn(
                                            "p-4 rounded-xl border text-sm font-medium transition-all",
                                            brand === b ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                        )}
                                    >
                                        {b}
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        setBrand("Other");
                                        if (errors.brand) setErrors({ ...errors, brand: false });
                                    }}
                                    className={cn(
                                        "p-4 rounded-xl border text-sm font-medium transition-all",
                                        brand === "Other" ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                    )}
                                >
                                    Other
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Screen Size *</label>
                            <div className={cn(
                                "grid grid-cols-3 gap-3",
                                errors.screenSize && "border border-red-500 rounded-xl p-2 animate-shake"
                            )}>
                                {tvInches.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            setScreenSize(s);
                                            if (errors.screenSize) setErrors({ ...errors, screenSize: false });
                                        }}
                                        className={cn(
                                            "p-3 rounded-xl border text-xs font-medium transition-all",
                                            screenSize === s ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        setScreenSize("Other");
                                        if (errors.screenSize) setErrors({ ...errors, screenSize: false });
                                    }}
                                    className={cn(
                                        "p-3 rounded-xl border text-xs font-medium transition-all",
                                        screenSize === "Other" ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                    )}
                                >
                                    Other
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Model Number (Optional)</label>
                            <input
                                type="text"
                                value={modelNumber}
                                onChange={(e) => setModelNumber(e.target.value)}
                                placeholder="e.g. KD-55X80J"
                                className="w-full p-4 rounded-xl border border-[var(--color-native-border)] bg-[var(--color-native-input)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]"
                            />
                            <p className="text-xs text-[var(--color-native-text-muted)]">Usually found on the back sticker of your TV.</p>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Primary Issue *</label>
                            <div className={cn(
                                "space-y-2",
                                errors.primaryIssue && "border border-red-500 rounded-xl p-2 animate-shake"
                            )}>
                                {serviceCategories.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => {
                                            setPrimaryIssue(c);
                                            if (errors.primaryIssue) setErrors({ ...errors, primaryIssue: false });
                                        }}
                                        className={cn(
                                            "w-full p-4 rounded-xl border text-left text-sm font-medium transition-all flex justify-between items-center",
                                            primaryIssue === c ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                        )}
                                    >
                                        {c}
                                        {primaryIssue === c && <CheckCircle className="w-5 h-5" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Common Symptoms</label>
                            <div className={cn(
                                "grid grid-cols-2 gap-3",
                                errors.symptoms && "border border-red-500 rounded-xl p-2 animate-shake"
                            )}>
                                {commonSymptoms.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            toggleSymptom(s);
                                            if (errors.symptoms) setErrors({ ...errors, symptoms: false });
                                        }}
                                        className={cn(
                                            "p-3 rounded-xl border text-xs font-medium transition-all text-left",
                                            selectedSymptoms.includes(s) ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]" : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the issue..."
                                className="w-full h-32 p-4 rounded-xl border border-[var(--color-native-border)] bg-[var(--color-native-input)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]"
                            />
                        </div>

                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Photos/Videos</label>
                            <div className="grid grid-cols-3 gap-3">
                                {files.map((f, i) => (
                                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-[var(--color-native-input)]">
                                        <img src={f.preview} alt="preview" className="w-full h-full object-cover" />
                                        <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1">
                                            <X className="w-3 h-3" />
                                        </button>
                                        {f.resourceType === "image" && (
                                            <button
                                                onClick={() => handleAIInspect(f)}
                                                disabled={isAnalyzing}
                                                className="absolute bottom-1 right-1 bg-purple-600/90 text-white rounded-full p-1.5 shadow-sm z-10"
                                            >
                                                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                                <ImageKitUpload
                                    folder="/service-requests"
                                    onUploadSuccess={(result) => {
                                        setFiles([...files, {
                                            name: result.name,
                                            type: result.url.includes("/video/") ? "video/mp4" : "image/jpeg",
                                            preview: result.thumbnailUrl || result.url,
                                            objectUrl: result.url,
                                            publicId: result.fileId,
                                            resourceType: result.url.includes("/video/") ? "video" : "image",
                                        }]);
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-[var(--color-native-text)]">Service Type</label>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => setServicePreference("home_pickup")}
                                    className={cn(
                                        "p-4 rounded-xl border text-left transition-all",
                                        servicePreference === "home_pickup" ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10" : "border-[var(--color-native-border)] bg-[var(--color-native-card)]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className={cn("p-2 rounded-full", servicePreference === "home_pickup" ? "bg-[var(--color-native-primary)]/20 text-[var(--color-native-primary)]" : "bg-[var(--color-native-input)] text-[var(--color-native-text-muted)]")}>
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <span className={cn("font-bold", servicePreference === "home_pickup" ? "text-[var(--color-native-primary)]" : "text-[var(--color-native-text)]")}>Home Pickup</span>
                                    </div>
                                    <p className="text-xs text-[var(--color-native-text-muted)] pl-[52px]">We collect your device from your address.</p>
                                </button>

                                <button
                                    onClick={() => setServicePreference("service_center")}
                                    className={cn(
                                        "p-4 rounded-xl border text-left transition-all",
                                        servicePreference === "service_center" ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10" : "border-[var(--color-native-border)] bg-[var(--color-native-card)]"
                                    )}
                                >
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className={cn("p-2 rounded-full", servicePreference === "service_center" ? "bg-[var(--color-native-primary)]/20 text-[var(--color-native-primary)]" : "bg-[var(--color-native-input)] text-[var(--color-native-text-muted)]")}>
                                            <CalendarIcon className="w-5 h-5" />
                                        </div>
                                        <span className={cn("font-bold", servicePreference === "service_center" ? "text-[var(--color-native-primary)]" : "text-[var(--color-native-text)]")}>Visit Center</span>
                                    </div>
                                    <p className="text-xs text-[var(--color-native-text-muted)] pl-[52px]">Bring your device to our service center.</p>
                                </button>
                            </div>
                        </div>

                        {servicePreference === "home_pickup" ? (
                            <div className="space-y-4">
                                <label className="text-sm font-bold text-[var(--color-native-text)]">Pickup Address *</label>
                                {savedAddresses.length > 0 && (
                                    <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                                        {savedAddresses.map((addr: any) => (
                                            <button
                                                key={addr.id}
                                                onClick={() => setAddress(addr.address)}
                                                className={cn(
                                                    "flex-shrink-0 px-4 py-2 rounded-lg border text-xs font-medium transition-all whitespace-nowrap",
                                                    address === addr.address
                                                        ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]"
                                                        : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                                )}
                                            >
                                                {addr.label}
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => setAddress("")}
                                            className={cn(
                                                "flex-shrink-0 px-4 py-2 rounded-lg border text-xs font-medium transition-all whitespace-nowrap",
                                                !savedAddresses.find((a: any) => a.address === address)
                                                    ? "border-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)]"
                                                    : "border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text-muted)]"
                                            )}
                                        >
                                            Enter Address
                                        </button>
                                    </div>
                                )}
                                <textarea
                                    value={address}
                                    readOnly={savedAddresses.some((a: any) => a.address === address)}
                                    onChange={(e) => {
                                        setAddress(e.target.value);
                                        if (errors.address) setErrors({ ...errors, address: false });
                                    }}
                                    placeholder="Enter full address..."
                                    className={cn(
                                        "w-full h-24 p-4 rounded-xl border placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]",
                                        errors.address ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]",
                                        savedAddresses.some((a: any) => a.address === address)
                                            ? "bg-gray-200 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
                                            : "bg-[var(--color-native-input)] text-black dark:text-white font-medium"
                                    )}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <label className="text-sm font-bold text-[var(--color-native-text)]">Preferred Visit Date *</label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            className={cn(
                                                "w-full p-4 rounded-xl border bg-[var(--color-native-input)] text-left flex items-center justify-between focus:outline-none focus:border-[var(--color-native-primary)]",
                                                !scheduledDate && "text-[var(--color-native-text-muted)]",
                                                scheduledDate && "text-[var(--color-native-text)]",
                                                errors.scheduledDate ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]"
                                            )}
                                        >
                                            {scheduledDate ? format(new Date(scheduledDate), "PPP") : <span>Pick a date</span>}
                                            <CalendarIcon className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 bg-[var(--color-native-card)] border-[var(--color-native-border)]" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={scheduledDate ? new Date(scheduledDate) : undefined}
                                            onSelect={(date) => {
                                                setScheduledDate(date ? format(date, "yyyy-MM-dd") : "");
                                                if (errors.scheduledDate) setErrors({ ...errors, scheduledDate: false });
                                            }}
                                            disabled={(date) => date.getDay() === 5 || date < new Date(new Date().setHours(0, 0, 0, 0))}
                                            initialFocus
                                            className="text-[var(--color-native-text)]"
                                        />
                                    </PopoverContent>
                                </Popover>
                                <div className="flex items-start gap-2 p-3 bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)] rounded-lg text-xs">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p>Our service center is closed on Fridays. Please choose another day.</p>
                                </div>
                            </div>
                        )}

                        {!isAuthenticated && (
                            <div className="space-y-4 pt-4 border-t border-[var(--color-native-border)]">
                                <h3 className="text-sm font-bold text-[var(--color-native-text)]">Contact Details</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-medium text-[var(--color-native-text-muted)] mb-1 block">Full Name *</label>
                                        <input
                                            type="text"
                                            value={customerName}
                                            onChange={(e) => {
                                                setCustomerName(e.target.value);
                                                if (errors.customerName) setErrors({ ...errors, customerName: false });
                                            }}
                                            className={cn(
                                                "w-full p-4 rounded-xl border bg-[var(--color-native-input)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]",
                                                errors.customerName ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]"
                                            )}
                                            placeholder="Your Name"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[var(--color-native-text-muted)] mb-1 block">Phone Number *</label>
                                        <div className={cn(
                                            "flex items-center w-full p-4 rounded-xl border bg-[var(--color-native-input)] focus-within:border-[var(--color-native-primary)]",
                                            errors.phone ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]"
                                        )}>
                                            <span className="text-[var(--color-native-text-muted)] mr-2 border-r border-[var(--color-native-border)] pr-2">+880</span>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                    setPhone(val);
                                                    if (errors.phone) setErrors({ ...errors, phone: false });
                                                }}
                                                className="flex-1 bg-transparent text-[var(--color-native-text)] focus:outline-none placeholder:text-[var(--color-native-text-muted)]"
                                                placeholder="1XXXXXXXXX"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {step === 4 && (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                        <div className="space-y-2">
                            <h2 className="text-xl font-bold text-[var(--color-native-text)]">Create Your Account</h2>
                            <p className="text-sm text-[var(--color-native-text-muted)]">Set a password to track your repair request and manage future orders.</p>
                        </div>

                        <div className="bg-[var(--color-native-primary)]/10 border border-[var(--color-native-primary)]/20 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[var(--color-native-primary)]">
                                <UserPlus className="w-5 h-5" />
                                <span className="font-medium">Your account details</span>
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex gap-2">
                                    <span className="text-[var(--color-native-text-muted)] w-14">Name:</span>
                                    <span className="font-medium text-[var(--color-native-text)]">{customerName}</span>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-[var(--color-native-text-muted)] w-14">Phone:</span>
                                    <span className="font-medium text-[var(--color-native-text)]">{phone.startsWith('+880') ? phone : `+880${phone}`}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-[var(--color-native-text-muted)] mb-1 block">Password *</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (errors.password) setErrors({ ...errors, password: false });
                                    }}
                                    className={cn(
                                        "w-full p-4 rounded-xl border bg-[var(--color-native-input)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]",
                                        errors.password ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]"
                                    )}
                                    placeholder="Min 6 characters"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[var(--color-native-text-muted)] mb-1 block">Confirm Password *</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => {
                                        setConfirmPassword(e.target.value);
                                        if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: false });
                                    }}
                                    className={cn(
                                        "w-full p-4 rounded-xl border bg-[var(--color-native-input)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:border-[var(--color-native-primary)]",
                                        errors.confirmPassword ? "border-red-500 animate-shake" : "border-[var(--color-native-border)]"
                                    )}
                                    placeholder="Re-enter password"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-50 py-10">
                        <div className="w-24 h-24 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-12 h-12" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-[var(--color-native-text)]">Request Received!</h2>
                            <p className="text-[var(--color-native-text-muted)]">Your Ticket Number:</p>
                            <p className="text-3xl font-mono font-bold text-[var(--color-native-primary)]">#{ticketNumber}</p>
                        </div>
                        <p className="text-sm text-[var(--color-native-text-muted)] max-w-xs">
                            We have received your request. Our team will contact you shortly.
                        </p>

                        <div className="w-full bg-[var(--color-native-card)] p-6 rounded-2xl text-left space-y-4 border border-[var(--color-native-border)]">
                            <div className="flex justify-between border-b border-[var(--color-native-border)] pb-3">
                                <span className="text-[var(--color-native-text-muted)] text-sm">Service Type</span>
                                <span className="font-bold text-[var(--color-native-text)]">{servicePreference === "home_pickup" ? "Pickup & Drop" : "Service Center"}</span>
                            </div>
                            <div className="flex justify-between border-b border-[var(--color-native-border)] pb-3">
                                <span className="text-[var(--color-native-text-muted)] text-sm">Device</span>
                                <span className="font-bold text-[var(--color-native-text)]">{brand} {screenSize ? `${screenSize}"` : ""} TV</span>
                            </div>
                            {servicePreference === "service_center" && scheduledDate && (
                                <div className="flex justify-between border-b border-[var(--color-native-border)] pb-3">
                                    <span className="text-[var(--color-native-text-muted)] text-sm">Visit Date</span>
                                    <span className="font-bold text-[var(--color-native-text)]">{format(new Date(scheduledDate), "MMM d, yyyy")}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-[var(--color-native-text-muted)] text-sm">Est. Response</span>
                                <span className="font-bold text-green-500">Within 2 Hours</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                {step < 5 && (
                    <div className="p-6 w-full pb-[env(safe-area-inset-bottom)]">
                        <button
                            onClick={handleNextStep}
                            disabled={isSubmitting}
                            className="w-full py-4 rounded-full bg-[var(--color-native-primary)] text-white font-bold shadow-lg shadow-[var(--color-native-primary)]/30 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (step === 3 && isAuthenticated) || step === 4 ? "Submit Request" : "Next Step"}
                            {!isSubmitting && <ChevronRight className="w-5 h-5" />}
                        </button>
                    </div>
                )}

                {step === 5 && (
                    <div className="p-6 bg-[var(--color-native-surface)] border-t border-[var(--color-native-border)] w-full pb-[env(safe-area-inset-bottom)] space-y-3">
                        <button
                            onClick={() => setLocation("/native/bookings")}
                            className="w-full py-4 rounded-full bg-[var(--color-native-primary)] text-white font-bold shadow-lg shadow-[var(--color-native-primary)]/30 flex items-center justify-center gap-2"
                        >
                            Track Status
                        </button>
                        <button
                            onClick={() => setLocation("/native/home")}
                            className="w-full py-4 rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text)] font-bold flex items-center justify-center gap-2"
                        >
                            Back to Home
                        </button>
                    </div>
                )}
            </main>
        </NativeLayout>
    );
}
