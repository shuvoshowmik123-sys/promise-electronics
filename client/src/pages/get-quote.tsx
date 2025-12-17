import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { serviceCatalogApi, quoteRequestsApi, settingsApi } from "@/lib/api";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Tv, ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Loader2, Phone, MapPin, Truck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function GetQuotePage() {
  usePageTitle("Get a Free Quote - TV Repair");
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const preselectedService = searchParams.get("service") || "";
  
  const { isAuthenticated, customer } = useCustomerAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");
  
  const [serviceType, setServiceType] = useState(preselectedService);
  const [brand, setBrand] = useState("");
  const [screenSize, setScreenSize] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [primaryIssue, setPrimaryIssue] = useState("");
  const [description, setDescription] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [servicePreference, setServicePreference] = useState<"home_pickup" | "service_center" | "both" | "">(""); 
  
  // Validation error states
  const [errors, setErrors] = useState<{
    serviceType?: boolean;
    brand?: boolean;
    primaryIssue?: boolean;
    customerName?: boolean;
    phone?: boolean;
    servicePreference?: boolean;
  }>({});
  
  const screenSizes = ["24 Inch", "32 Inch", "40 Inch", "43 Inch", "50 Inch", "55 Inch", "65 Inch", "75 Inch", "Other"];
  
  // Normalize phone number: remove +880, 880, or leading 0, keep only last 10 digits
  const normalizePhone = (rawPhone: string): string => {
    let digits = rawPhone.replace(/\D/g, '');
    // Remove leading 880 (country code without +)
    if (digits.startsWith('880')) {
      digits = digits.slice(3);
    }
    // Remove leading 0 if present
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    // Take only last 10 digits
    return digits.slice(0, 10);
  };
  
  useEffect(() => {
    if (isAuthenticated && customer) {
      setCustomerName(customer.name || "");
      setPhone(normalizePhone(customer.phone || ""));
    }
  }, [isAuthenticated, customer]);
  
  const { data: services = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: serviceCatalogApi.getAll,
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 0,
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
  
  const getSettingValue = (key: string, defaultValue: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };
  
  const serviceCenterContact = getSettingValue("service_center_contact", "01700-000000");
  
  const tvBrands = getSettingArray("tv_brands", ["Sony", "Samsung", "LG", "Walton", "Vision"]);
  const commonIssues = getSettingArray("common_issues", [
    "No Power / Won't Turn On",
    "No Picture / Black Screen",
    "Display Lines / Broken Panel",
    "Sound Issues / No Audio",
    "Smart TV Apps Not Working",
    "Remote Not Responding",
    "Other Issue"
  ]);
  
  const submitQuoteMutation = useMutation({
    mutationFn: quoteRequestsApi.submit,
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || "");
      setStep(3);
      setIsSubmitting(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit quote request");
      setIsSubmitting(false);
    },
  });
  
  const handleSubmit = async () => {
    if (!customerName.trim() || !phone.trim()) {
      toast.error("Please enter your name and phone number");
      return;
    }
    
    if (!brand || !primaryIssue) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setIsSubmitting(true);
    
    // Find the selected service to get its ID
    const selectedService = services.find(s => s.name === serviceType);
    const serviceId = selectedService?.id || services[0]?.id || "";
    
    if (!serviceId) {
      toast.error("Please select a service type");
      setIsSubmitting(false);
      return;
    }
    
    // Map servicePreference to new serviceMode field
    const serviceMode = servicePreference === "home_pickup" ? "pickup" : 
                        servicePreference === "service_center" ? "service_center" : undefined;
    
    submitQuoteMutation.mutate({
      serviceId,
      brand,
      screenSize: screenSize || undefined,
      modelNumber: modelNumber || undefined,
      primaryIssue,
      description: description || undefined,
      customerName: customerName.trim(),
      phone: `+880${phone.trim()}`,
      servicePreference: servicePreference || undefined,
      address: address || undefined,
      requestIntent: "quote",
      serviceMode,
    });
  };
  
  const selectedService = services.find(s => s.name === serviceType);
  
  // Validation function for Step 1
  const validateStep1 = (): boolean => {
    const newErrors: typeof errors = {};
    let hasError = false;
    
    if (!serviceType) {
      newErrors.serviceType = true;
      hasError = true;
    }
    if (!brand) {
      newErrors.brand = true;
      hasError = true;
    }
    if (!primaryIssue) {
      newErrors.primaryIssue = true;
      hasError = true;
    }
    
    setErrors(newErrors);
    
    if (hasError) {
      if (!serviceType) {
        toast.error("Please select a Service Type");
      } else if (!brand) {
        toast.error("Please select a TV Brand");
      } else if (!primaryIssue) {
        toast.error("Please select the Main Issue");
      }
      return false;
    }
    return true;
  };
  
  // Validation function for Step 2
  const validateStep2 = (): boolean => {
    const newErrors: typeof errors = {};
    let hasError = false;
    
    if (!customerName.trim()) {
      newErrors.customerName = true;
      hasError = true;
    }
    if (!phone.trim()) {
      newErrors.phone = true;
      hasError = true;
    }
    if (!servicePreference) {
      newErrors.servicePreference = true;
      hasError = true;
    }
    
    setErrors(newErrors);
    
    if (hasError) {
      if (!customerName.trim()) {
        toast.error("Please enter your name");
      } else if (!phone.trim()) {
        toast.error("Please enter your phone number");
      } else if (!servicePreference) {
        toast.error("Please select a service preference");
      }
      return false;
    }
    return true;
  };
  
  const handleNextStep = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };
  
  const handleSubmitWithValidation = () => {
    if (validateStep2()) {
      handleSubmit();
    }
  };
  
  // Clear error when field is filled
  const clearError = (field: keyof typeof errors) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: false }));
    }
  };
  
  return (
    <PublicLayout>
      {/* Neumorphic Get Quote Page */}
      <main className="flex-1 py-8 md:py-12 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 min-h-screen">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Button 
              variant="ghost" 
              className="mb-6" 
              onClick={() => setLocation('/services')}
              data-testid="button-back-to-services"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>
          </motion.div>
          
          {/* Neumorphic Step Progress Indicator */}
          <motion.div 
            className="mb-8 bg-slate-100 shadow-neumorph rounded-2xl p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-between mb-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-base transition-all duration-300 ${
                    step >= s 
                      ? 'bg-primary text-white shadow-neumorph-sm' 
                      : 'bg-white shadow-neumorph-inset text-slate-400'
                  }`}>
                    {step > s ? <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" /> : s}
                  </div>
                  {s < 3 && (
                    <div className={`h-1 mx-1 md:mx-2 rounded-full transition-all duration-300 flex-1 md:flex-none md:w-[100px] ${step > s ? 'bg-primary' : 'bg-slate-200'}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm">
              <span className={step >= 1 ? 'text-primary font-medium' : 'text-slate-400'}>Device Info</span>
              <span className={step >= 2 ? 'text-primary font-medium' : 'text-slate-400'}>Contact</span>
              <span className={step >= 3 ? 'text-primary font-medium' : 'text-slate-400'}>Complete</span>
            </div>
          </motion.div>
          
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl" data-testid="card-step-1">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-neumorph-inset flex items-center justify-center">
                      <Tv className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Tell Us About Your Device</CardTitle>
                      <CardDescription>Help us understand what needs to be repaired</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Service Type *</Label>
                    <Select value={serviceType} onValueChange={(v) => { setServiceType(v); clearError('serviceType'); }}>
                      <SelectTrigger className={`bg-white shadow-neumorph-inset ${errors.serviceType ? 'border-2 border-red-500' : 'border-none'}`} data-testid="select-service-type">
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((service) => (
                          <SelectItem key={service.id} value={service.name} data-testid={`option-service-${service.id}`}>
                            {service.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="General TV Repair" data-testid="option-service-general">
                          General TV Repair
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {selectedService && (
                      <div className="p-3 bg-white shadow-neumorph-inset rounded-xl text-sm">
                        <p className="text-muted-foreground">{selectedService.description}</p>
                        <p className="font-medium text-primary mt-1">
                          Estimated: ৳{Number(selectedService.minPrice).toLocaleString()} - ৳{Number(selectedService.maxPrice).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>TV Brand *</Label>
                    <Select value={brand} onValueChange={(v) => { setBrand(v); clearError('brand'); }}>
                      <SelectTrigger className={`bg-white shadow-neumorph-inset ${errors.brand ? 'border-2 border-red-500' : 'border-none'}`} data-testid="select-brand">
                        <SelectValue placeholder="Select your TV brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {tvBrands.map((b) => (
                          <SelectItem key={b} value={b} data-testid={`option-brand-${b.toLowerCase()}`}>
                            {b}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other" data-testid="option-brand-other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Screen Size (Inch)</Label>
                      <Select value={screenSize} onValueChange={setScreenSize}>
                        <SelectTrigger className="bg-white shadow-neumorph-inset border-none" data-testid="select-screen-size">
                          <SelectValue placeholder="Select size" />
                        </SelectTrigger>
                        <SelectContent>
                          {screenSizes.map((size) => (
                            <SelectItem key={size} value={size} data-testid={`option-size-${size.toLowerCase().replace(/\s+/g, '-')}`}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Model Number</Label>
                      <Input
                        placeholder="e.g., UA50AU7700"
                        className="bg-white shadow-neumorph-inset border-none text-sm md:text-base placeholder:text-xs md:placeholder:text-sm"
                        value={modelNumber}
                        onChange={(e) => setModelNumber(e.target.value)}
                        data-testid="input-model-number"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Main Issue *</Label>
                    <Select value={primaryIssue} onValueChange={(v) => { setPrimaryIssue(v); clearError('primaryIssue'); }}>
                      <SelectTrigger className={`bg-white shadow-neumorph-inset ${errors.primaryIssue ? 'border-2 border-red-500' : 'border-none'}`} data-testid="select-issue">
                        <SelectValue placeholder="What's wrong with your TV?" />
                      </SelectTrigger>
                      <SelectContent>
                        {commonIssues.map((issue) => (
                          <SelectItem key={issue} value={issue} data-testid={`option-issue-${issue.toLowerCase().replace(/\s+/g, '-')}`}>
                            {issue}
                          </SelectItem>
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
                      rows={4}
                      data-testid="input-description"
                    />
                  </div>
                  
                  <div className="flex justify-end pt-4">
                    <Button 
                      onClick={handleNextStep}
                      className="shadow-neumorph-sm hover:shadow-neumorph"
                      data-testid="button-next"
                    >
                      Next Step
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl" data-testid="card-step-2">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-neumorph-inset flex items-center justify-center">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Contact Information</CardTitle>
                      <CardDescription>We'll send your quote to this number</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!isAuthenticated && (
                    <div className="p-4 bg-blue-50/50 shadow-neumorph-inset rounded-xl">
                      <p className="text-sm text-blue-800">
                        Already have an account?{" "}
                        <button 
                          className="font-medium underline"
                          onClick={() => setShowAuthModal(true)}
                          data-testid="button-login-prompt"
                        >
                          Sign in
                        </button>{" "}
                        to auto-fill your details.
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label>Your Name *</Label>
                    <Input
                      placeholder="Enter your name"
                      className={`bg-white shadow-neumorph-inset ${errors.customerName ? 'border-2 border-red-500' : 'border-none'}`}
                      value={customerName}
                      onChange={(e) => { setCustomerName(e.target.value); clearError('customerName'); }}
                      data-testid="input-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Phone Number *</Label>
                    <div className="flex">
                      <div className={`flex items-center px-3 bg-slate-200 rounded-l-md text-sm font-medium text-slate-700 ${errors.phone ? 'border-2 border-r-0 border-red-500' : ''}`}>
                        +880
                      </div>
                      <Input
                        placeholder="1XXXXXXXXX"
                        className={`bg-white shadow-neumorph-inset rounded-l-none ${errors.phone ? 'border-2 border-l-0 border-red-500' : 'border-none'}`}
                        value={phone}
                        onChange={(e) => { 
                          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setPhone(digits); 
                          clearError('phone'); 
                        }}
                        maxLength={10}
                        data-testid="input-phone"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">We'll contact you at this number with your quote</p>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Service Preference *</Label>
                    <RadioGroup 
                      value={servicePreference} 
                      onValueChange={(value) => { setServicePreference(value as typeof servicePreference); clearError('servicePreference'); }}
                      className="space-y-3"
                    >
                      <div className={`flex items-start space-x-3 p-3 bg-white shadow-neumorph-inset rounded-xl ${errors.servicePreference ? 'border-2 border-red-500' : ''}`}>
                        <RadioGroupItem value="home_pickup" id="home_pickup" className="mt-1" data-testid="radio-home-pickup" />
                        <label htmlFor="home_pickup" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 font-medium">
                            <Truck className="h-4 w-4 text-primary" />
                            Home Pickup
                          </div>
                          <p className="text-sm text-muted-foreground">We'll collect your TV from your location</p>
                        </label>
                      </div>
                      
                      <div className={`flex items-start space-x-3 p-3 bg-white shadow-neumorph-inset rounded-xl ${errors.servicePreference ? 'border-2 border-red-500' : ''}`}>
                        <RadioGroupItem value="service_center" id="service_center" className="mt-1" data-testid="radio-service-center" />
                        <label htmlFor="service_center" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 font-medium">
                            <MapPin className="h-4 w-4 text-primary" />
                            Service Center Visit
                          </div>
                          <p className="text-sm text-muted-foreground">Bring your TV to our service center</p>
                        </label>
                      </div>
                      
                      <div className={`flex items-start space-x-3 p-3 bg-white shadow-neumorph-inset rounded-xl ${errors.servicePreference ? 'border-2 border-red-500' : ''}`}>
                        <RadioGroupItem value="both" id="both" className="mt-1" data-testid="radio-both" />
                        <label htmlFor="both" className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 font-medium">
                            <Clock className="h-4 w-4 text-primary" />
                            Both Options
                          </div>
                          <p className="text-sm text-muted-foreground">We'll discuss the best option with you</p>
                        </label>
                      </div>
                    </RadioGroup>
                    
                    {servicePreference === "service_center" && (
                      <div className="p-4 bg-green-50/50 shadow-neumorph-inset rounded-xl border-l-4 border-green-500">
                        <p className="text-sm text-green-800 font-medium mb-1">Welcome to Promise Electronics!</p>
                        <p className="text-sm text-green-700">
                          Please call us at <span className="font-semibold">{serviceCenterContact}</span> before visiting our service center. 
                          We'll prepare everything for your arrival.
                        </p>
                      </div>
                    )}
                    
                    {servicePreference === "home_pickup" && (
                      <div className="space-y-2">
                        <Label>Pickup Address</Label>
                        <Textarea
                          placeholder="Enter your full address for pickup..."
                          className="bg-white shadow-neumorph-inset border-none"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          rows={2}
                          data-testid="input-address"
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white shadow-neumorph-inset p-4 rounded-xl">
                    <h4 className="font-medium mb-2">Quote Summary</h4>
                    <div className="text-sm space-y-1">
                      <p><span className="text-muted-foreground">Service:</span> {serviceType || "General Repair"}</p>
                      <p><span className="text-muted-foreground">Brand:</span> {brand}</p>
                      {screenSize && <p><span className="text-muted-foreground">Screen Size:</span> {screenSize}</p>}
                      {modelNumber && <p><span className="text-muted-foreground">Model:</span> {modelNumber}</p>}
                      <p><span className="text-muted-foreground">Issue:</span> {primaryIssue}</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-between pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setStep(1)}
                      className="bg-white shadow-neumorph-sm border-none"
                      data-testid="button-back"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button 
                      onClick={handleSubmitWithValidation}
                      disabled={isSubmitting}
                      className="shadow-neumorph-sm hover:shadow-neumorph"
                      data-testid="button-submit-quote"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          Get My Quote
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="text-center bg-slate-100 shadow-neumorph border-none rounded-2xl" data-testid="card-step-3">
                <CardContent className="py-12">
                  <div className="w-20 h-20 rounded-full bg-green-100 shadow-neumorph-inset flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="h-10 w-10 text-green-600" />
                  </div>
                  
                  <h2 className="text-2xl font-bold mb-2">Quote Request Submitted!</h2>
                  <p className="text-muted-foreground mb-6">
                    We've received your request and will send you a quote within 24 hours.
                  </p>
                  
                  {ticketNumber && (
                    <div className="bg-white shadow-neumorph-inset p-4 rounded-xl inline-block mb-6">
                      <p className="text-sm text-muted-foreground mb-1">Your Reference Number</p>
                      <p className="text-2xl font-mono font-bold text-primary" data-testid="text-ticket-number">{ticketNumber}</p>
                    </div>
                  )}
                  
                  <div className="bg-blue-50/50 shadow-neumorph-inset rounded-xl p-4 mb-6 text-left max-w-md mx-auto">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900">What happens next?</h4>
                        <ul className="text-sm text-blue-800 mt-2 space-y-1">
                          <li>1. Our team will review your request</li>
                          <li>2. You'll receive a quote via phone/SMS</li>
                          <li>3. Accept the quote to schedule pickup</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50/50 shadow-neumorph-inset rounded-xl p-4 mb-6 text-left max-w-md mx-auto">
                    <h4 className="font-medium text-amber-900 mb-2">Terms & Conditions</h4>
                    <ul className="text-xs text-amber-800 space-y-1.5">
                      <li>• This quote is valid for <strong>30 days</strong> from the date it is issued.</li>
                      <li>• Prices are based on current parts availability and may vary.</li>
                      <li>• If parts become unavailable, you may need to request a new quote.</li>
                      <li>• After 30 days, you will need to re-submit your service request.</li>
                    </ul>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button 
                      variant="outline" 
                      onClick={() => setLocation(`/track-order?ticket=${ticketNumber}`)}
                      className="bg-white shadow-neumorph-sm border-none"
                      data-testid="button-track-quote"
                    >
                      Track Quote Status
                    </Button>
                    <Button 
                      onClick={() => setLocation('/services')}
                      className="shadow-neumorph-sm hover:shadow-neumorph"
                      data-testid="button-browse-more"
                    >
                      Browse More Services
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
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
    </PublicLayout>
  );
}
