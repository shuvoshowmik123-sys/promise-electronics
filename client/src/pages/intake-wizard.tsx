import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { serviceCatalogApi, serviceRequestsApi, settingsApi } from "@/lib/api";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
    Tv, ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, Truck, MapPin,
    MessageCircle, Bot, Sparkles
} from "lucide-react";
import { DaktarVaiChatIntake } from "@/components/DaktarVaiChatIntake";

/**
 * Booking Data extracted by Daktar Vai AI
 */
interface AIBookingData {
    customer_name?: string;
    phone?: string;
    brand?: string;
    model?: string;
    screenSize?: string;
    issue?: string;
    description?: string;
    address?: string;
}

type IntakeMethod = "manual" | "ai" | null;

export default function IntakeWizardPage() {
    usePageTitle("Start Repair - Promise Electronics");
    const [, setLocation] = useLocation();
    const { isAuthenticated, customer } = useCustomerAuth();
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Wizard State
    const [step, setStep] = useState(1);
    const [intakeMethod, setIntakeMethod] = useState<IntakeMethod>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ticketNumber, setTicketNumber] = useState("");

    // Form Data (manually filled OR AI-prefilled)
    const [brand, setBrand] = useState("");
    const [screenSize, setScreenSize] = useState("");
    const [modelNumber, setModelNumber] = useState("");
    const [primaryIssue, setPrimaryIssue] = useState("");
    const [description, setDescription] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [servicePreference, setServicePreference] = useState<"home_pickup" | "service_center" | "">("");
    const [requestIntent, setRequestIntent] = useState<"quote" | "repair">("repair");

    // Prefill from logged-in user
    useEffect(() => {
        if (isAuthenticated && customer) {
            setCustomerName(customer.name || "");
            setPhone(customer.phone || "");
            setAddress(customer.address || "");
        }
    }, [isAuthenticated, customer]);

    // Settings
    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
        staleTime: 5 * 60 * 1000,
    });

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

    const tvBrands = getSettingArray("tv_brands", ["Sony", "Samsung", "LG", "Walton", "Vision", "MI", "Hisense", "TCL", "Haier"]);
    const screenSizes = ["24 Inch", "32 Inch", "40 Inch", "43 Inch", "50 Inch", "55 Inch", "65 Inch", "75 Inch", "Other"];
    const commonIssues = getSettingArray("common_issues", [
        "No Power / Won't Turn On",
        "No Picture / Black Screen",
        "Display Lines / Broken Panel",
        "Sound Issues / No Audio",
        "Smart TV Apps Not Working",
        "Remote Not Responding",
        "Other Issue"
    ]);

    // API Mutation
    const submitMutation = useMutation({
        mutationFn: serviceRequestsApi.create,
        onSuccess: (data) => {
            setTicketNumber(data.ticketNumber || "");
            setStep(4); // Success Step
            setIsSubmitting(false);
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to submit request");
            setIsSubmitting(false);
        },
    });

    /**
     * Called when AI Chat extracts booking data
     */
    const handleAIBookingIntent = useCallback((data: AIBookingData) => {
        console.log("[IntakeWizard] AI Booking Data Received:", data);
        // Prefill form fields
        if (data.brand) setBrand(data.brand);
        if (data.model) setModelNumber(data.model);
        if (data.screenSize) setScreenSize(data.screenSize);
        if (data.issue) setPrimaryIssue(data.issue);
        if (data.description) setDescription(data.description);
        if (data.customer_name && !customerName) setCustomerName(data.customer_name);
        if (data.phone && !phone) setPhone(data.phone);
        if (data.address && !address) setAddress(data.address);
        // Jump to Step 2 (Decision Fork)
        setStep(2);
        toast.success("Details captured by Daktar Vai. Please confirm.");
    }, [customerName, phone, address]);

    const handleSubmit = async () => {
        // Validation
        if (!customerName.trim() || !phone.trim()) {
            toast.error("Please enter your name and phone number");
            return;
        }
        if (!brand || !primaryIssue) {
            toast.error("Please select brand and issue");
            return;
        }
        if (servicePreference === "home_pickup" && !address.trim()) {
            toast.error("Please enter your pickup address");
            return;
        }

        setIsSubmitting(true);

        submitMutation.mutate({
            brand,
            screenSize: screenSize || undefined,
            modelNumber: modelNumber || undefined,
            primaryIssue,
            description: description || undefined,
            customerName: customerName.trim(),
            phone: phone.trim(),
            address: address || undefined,
            servicePreference: servicePreference || undefined,
            status: "Pending",
            requestIntent,
            serviceMode: servicePreference === "home_pickup" ? "pickup" : "service_center",
            isQuote: requestIntent === "quote",
        });
    };

    return (
        <>
            <main className="flex-1 py-8 md:py-12 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 min-h-screen">
                <div className="container mx-auto px-4 max-w-3xl">
                    {/* Back Button */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        <Button
                            variant="ghost"
                            className="mb-6"
                            onClick={() => step > 1 ? setStep(step - 1) : setLocation('/')}
                        >
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {step > 1 ? "Back" : "Home"}
                        </Button>
                    </motion.div>

                    {/* Step Progress */}
                    <motion.div
                        className="mb-8 bg-slate-100 shadow-neumorph rounded-2xl p-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            {[1, 2, 3, 4].map((s) => (
                                <div key={s} className="flex items-center">
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base transition-all duration-300 ${step >= s
                                            ? 'bg-primary text-white shadow-neumorph-sm'
                                            : 'bg-white shadow-neumorph-inset text-slate-400'
                                        }`}>
                                        {step > s ? <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> : s}
                                    </div>
                                    {s < 4 && (
                                        <div className={`h-1 mx-1 md:mx-2 rounded-full transition-all duration-300 flex-1 md:flex-none md:w-[80px] ${step > s ? 'bg-primary' : 'bg-slate-200'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-xs md:text-sm">
                            <span className={step >= 1 ? 'text-primary font-medium' : 'text-slate-400'}>Start</span>
                            <span className={step >= 2 ? 'text-primary font-medium' : 'text-slate-400'}>Details</span>
                            <span className={step >= 3 ? 'text-primary font-medium' : 'text-slate-400'}>Confirm</span>
                            <span className={step >= 4 ? 'text-primary font-medium' : 'text-slate-400'}>Done</span>
                        </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                        {/* Step 1: Choose Method */}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -30 }}
                                transition={{ duration: 0.5 }}
                            >
                                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                                    <CardHeader className="text-center">
                                        <div className="w-16 h-16 rounded-full bg-white shadow-neumorph-inset flex items-center justify-center mx-auto mb-4">
                                            <Tv className="h-8 w-8 text-primary" />
                                        </div>
                                        <CardTitle className="text-2xl">How can we help you today?</CardTitle>
                                        <CardDescription>Choose how you'd like to start</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* AI Chat Option */}
                                        <button
                                            onClick={() => {
                                                setIntakeMethod("ai");
                                            }}
                                            className={`w-full p-6 rounded-xl text-left transition-all duration-300 ${intakeMethod === "ai"
                                                    ? "bg-blue-600 text-white shadow-neumorph"
                                                    : "bg-white shadow-neumorph-inset hover:shadow-neumorph"
                                                }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${intakeMethod === "ai" ? "bg-white/20" : "bg-blue-100"
                                                    }`}>
                                                    <Bot className={`h-6 w-6 ${intakeMethod === "ai" ? "text-white" : "text-blue-600"}`} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 font-bold text-lg">
                                                        Ask Daktar Vai
                                                        <Sparkles className={`h-4 w-4 ${intakeMethod === "ai" ? "text-yellow-300" : "text-yellow-500"}`} />
                                                    </div>
                                                    <p className={`text-sm mt-1 ${intakeMethod === "ai" ? "text-blue-100" : "text-muted-foreground"}`}>
                                                        Describe your problem. Our AI will diagnose and guide you.
                                                    </p>
                                                </div>
                                            </div>
                                        </button>

                                        {/* Manual Form Option */}
                                        <button
                                            onClick={() => {
                                                setIntakeMethod("manual");
                                                setStep(2);
                                            }}
                                            className={`w-full p-6 rounded-xl text-left transition-all duration-300 ${intakeMethod === "manual"
                                                    ? "bg-primary text-white shadow-neumorph"
                                                    : "bg-white shadow-neumorph-inset hover:shadow-neumorph"
                                                }`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${intakeMethod === "manual" ? "bg-white/20" : "bg-slate-100"
                                                    }`}>
                                                    <Tv className={`h-6 w-6 ${intakeMethod === "manual" ? "text-white" : "text-primary"}`} />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-bold text-lg">I Know My Issue</div>
                                                    <p className={`text-sm mt-1 ${intakeMethod === "manual" ? "text-primary-foreground" : "text-muted-foreground"}`}>
                                                        Fill out a quick form with your TV brand and problem.
                                                    </p>
                                                </div>
                                            </div>
                                        </button>

                                        {/* AI Chat Inline (if method=AI) */}
                                        {intakeMethod === "ai" && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-4"
                                            >
                                                <DaktarVaiChatIntake onBookingIntent={handleAIBookingIntent} />
                                            </motion.div>
                                        )}
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Step 2: Device Details (Manual OR AI-prefilled) */}
                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -30 }}
                                transition={{ duration: 0.5 }}
                            >
                                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                                    <CardHeader>
                                        <CardTitle>Device & Issue Details</CardTitle>
                                        <CardDescription>Confirm or edit the details below</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>TV Brand *</Label>
                                                <Select value={brand} onValueChange={setBrand}>
                                                    <SelectTrigger className="bg-white shadow-neumorph-inset border-none">
                                                        <SelectValue placeholder="Select brand" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {tvBrands.map((b) => (
                                                            <SelectItem key={b} value={b}>{b}</SelectItem>
                                                        ))}
                                                        <SelectItem value="Other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Screen Size</Label>
                                                <Select value={screenSize} onValueChange={setScreenSize}>
                                                    <SelectTrigger className="bg-white shadow-neumorph-inset border-none">
                                                        <SelectValue placeholder="Select size" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {screenSizes.map((size) => (
                                                            <SelectItem key={size} value={size}>{size}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Model Number (Optional)</Label>
                                            <Input
                                                placeholder="e.g., UA50AU7700"
                                                className="bg-white shadow-neumorph-inset border-none"
                                                value={modelNumber}
                                                onChange={(e) => setModelNumber(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Main Issue *</Label>
                                            <Select value={primaryIssue} onValueChange={setPrimaryIssue}>
                                                <SelectTrigger className="bg-white shadow-neumorph-inset border-none">
                                                    <SelectValue placeholder="What's wrong with your TV?" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {commonIssues.map((issue) => (
                                                        <SelectItem key={issue} value={issue}>{issue}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Additional Details (Optional)</Label>
                                            <Textarea
                                                placeholder="Describe the problem in more detail..."
                                                className="bg-white shadow-neumorph-inset border-none"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                rows={3}
                                            />
                                        </div>

                                        <div className="flex justify-end pt-4">
                                            <Button onClick={() => setStep(3)} className="shadow-neumorph-sm hover:shadow-neumorph">
                                                Next Step
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Step 3: Contact & Service Preference */}
                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -30 }}
                                transition={{ duration: 0.5 }}
                            >
                                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                                    <CardHeader>
                                        <CardTitle>Contact & Booking</CardTitle>
                                        <CardDescription>How should we proceed?</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        {!isAuthenticated && (
                                            <div className="p-4 bg-blue-50/50 shadow-neumorph-inset rounded-xl">
                                                <p className="text-sm text-blue-800">
                                                    Already have an account?{" "}
                                                    <button className="font-medium underline" onClick={() => setShowAuthModal(true)}>
                                                        Sign in
                                                    </button>{" "}
                                                    to auto-fill your details.
                                                </p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Your Name *</Label>
                                                <Input
                                                    placeholder="Enter your name"
                                                    className="bg-white shadow-neumorph-inset border-none"
                                                    value={customerName}
                                                    onChange={(e) => setCustomerName(e.target.value)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Phone Number *</Label>
                                                <Input
                                                    placeholder="+880 1..."
                                                    className="bg-white shadow-neumorph-inset border-none"
                                                    value={phone}
                                                    onChange={(e) => setPhone(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Request Intent: Quote or Repair */}
                                        <div className="space-y-3 p-4 bg-white shadow-neumorph-inset rounded-xl">
                                            <Label className="text-base font-semibold">What would you like to do?</Label>
                                            <RadioGroup value={requestIntent} onValueChange={(v) => setRequestIntent(v as "quote" | "repair")}>
                                                <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-50">
                                                    <RadioGroupItem value="quote" id="quote" />
                                                    <label htmlFor="quote" className="flex-1 cursor-pointer">
                                                        <div className="font-medium">Get a Quote First</div>
                                                        <p className="text-sm text-muted-foreground">We'll call you with pricing before confirming.</p>
                                                    </label>
                                                </div>
                                                <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-slate-50">
                                                    <RadioGroupItem value="repair" id="repair" />
                                                    <label htmlFor="repair" className="flex-1 cursor-pointer">
                                                        <div className="font-medium">Book Service Now</div>
                                                        <p className="text-sm text-muted-foreground">Schedule pickup or visit immediately.</p>
                                                    </label>
                                                </div>
                                            </RadioGroup>
                                        </div>

                                        {/* Service Preference (if Booking) */}
                                        {requestIntent === "repair" && (
                                            <div className="space-y-3">
                                                <Label className="text-base font-semibold">Service Preference</Label>
                                                <RadioGroup value={servicePreference} onValueChange={(v) => setServicePreference(v as typeof servicePreference)}>
                                                    <div className="flex items-start space-x-3 p-4 bg-white shadow-neumorph-inset rounded-xl">
                                                        <RadioGroupItem value="home_pickup" id="home_pickup" className="mt-1" />
                                                        <label htmlFor="home_pickup" className="flex-1 cursor-pointer">
                                                            <div className="flex items-center gap-2 font-medium">
                                                                <Truck className="h-4 w-4 text-primary" />
                                                                Home Pickup
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">We'll collect your TV from your location</p>
                                                        </label>
                                                    </div>
                                                    <div className="flex items-start space-x-3 p-4 bg-white shadow-neumorph-inset rounded-xl">
                                                        <RadioGroupItem value="service_center" id="service_center" className="mt-1" />
                                                        <label htmlFor="service_center" className="flex-1 cursor-pointer">
                                                            <div className="flex items-center gap-2 font-medium">
                                                                <MapPin className="h-4 w-4 text-primary" />
                                                                Service Center Visit
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">Bring your TV to our service center</p>
                                                        </label>
                                                    </div>
                                                </RadioGroup>

                                                {servicePreference === "home_pickup" && (
                                                    <div className="space-y-2 mt-4">
                                                        <Label>Pickup Address *</Label>
                                                        <Textarea
                                                            placeholder="Enter your full address..."
                                                            className="bg-white shadow-neumorph-inset border-none"
                                                            value={address}
                                                            onChange={(e) => setAddress(e.target.value)}
                                                            rows={2}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex justify-between pt-4">
                                            <Button variant="outline" onClick={() => setStep(2)} className="bg-white shadow-neumorph-sm border-none">
                                                <ArrowLeft className="mr-2 h-4 w-4" />
                                                Back
                                            </Button>
                                            <Button onClick={handleSubmit} disabled={isSubmitting} className="shadow-neumorph-sm hover:shadow-neumorph">
                                                {isSubmitting ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Submitting...
                                                    </>
                                                ) : (
                                                    <>
                                                        {requestIntent === "quote" ? "Get Quote" : "Book Service"}
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}

                        {/* Step 4: Success */}
                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                            >
                                <Card className="text-center bg-slate-100 shadow-neumorph border-none rounded-2xl">
                                    <CardContent className="py-12">
                                        <div className="w-20 h-20 rounded-full bg-green-100 shadow-neumorph-inset flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="h-10 w-10 text-green-600" />
                                        </div>

                                        <h2 className="text-2xl font-bold mb-2">
                                            {requestIntent === "quote" ? "Quote Request Submitted!" : "Booking Confirmed!"}
                                        </h2>
                                        <p className="text-muted-foreground mb-6">
                                            {requestIntent === "quote"
                                                ? "We'll review your request and send you a quote within 24 hours."
                                                : "Our team will contact you shortly to arrange pickup or schedule your visit."
                                            }
                                        </p>

                                        {ticketNumber && (
                                            <div className="bg-white shadow-neumorph-inset p-4 rounded-xl inline-block mb-6">
                                                <p className="text-sm text-muted-foreground mb-1">Your Reference Number</p>
                                                <p className="text-2xl font-mono font-bold text-primary">{ticketNumber}</p>
                                            </div>
                                        )}

                                        <div className="bg-blue-50/50 shadow-neumorph-inset rounded-xl p-4 mb-6 text-left max-w-md mx-auto">
                                            <div className="flex items-start gap-3">
                                                <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                                                <div>
                                                    <h4 className="font-medium text-blue-900">What happens next?</h4>
                                                    <ul className="text-sm text-blue-800 mt-2 space-y-1">
                                                        <li>1. Our team will review your request</li>
                                                        <li>2. You'll receive a call/SMS confirmation</li>
                                                        <li>3. {requestIntent === "quote" ? "Accept the quote to proceed" : "We'll arrange pickup/visit"}</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                            <Button
                                                variant="outline"
                                                onClick={() => setLocation(`/track-order?order=${encodeURIComponent(ticketNumber)}&type=service`)}
                                                className="bg-white shadow-neumorph-sm border-none"
                                            >
                                                Track Status
                                            </Button>
                                            <Button
                                                onClick={() => setLocation('/services')}
                                                className="shadow-neumorph-sm hover:shadow-neumorph"
                                            >
                                                Browse Services
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <CustomerAuthModal
                open={showAuthModal}
                onOpenChange={setShowAuthModal}
                defaultTab="login"
                onSuccess={() => {
                    setShowAuthModal(false);
                    toast.success("Logged in successfully!");
                }}
            />
        </>
    );
}
