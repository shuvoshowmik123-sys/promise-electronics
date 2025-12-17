import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef, useEffect } from "react";
import { Upload, CheckCircle, Loader2, X, Film, Image, UserPlus, Calendar } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { settingsApi, serviceRequestsApi } from "@/lib/api";
import { toast } from "sonner";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { usePageTitle } from "@/hooks/usePageTitle";

interface CloudinaryMedia {
  url: string;
  publicId: string;
  resourceType: "image" | "video";
}

interface UploadedFile {
  name: string;
  type: string;
  preview: string;
  objectUrl: string;
  publicId: string;
  resourceType: "image" | "video";
}

export default function RepairRequestPage() {
  usePageTitle("Request TV Repair Service");
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [accountCreatedDuringSession, setAccountCreatedDuringSession] = useState(false);
  const { isAuthenticated, customer, register, updateProfile, checkAuth } = useCustomerAuth();
  
  const [brand, setBrand] = useState("");
  const [screenSize, setScreenSize] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [primaryIssue, setPrimaryIssue] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [servicePreference, setServicePreference] = useState("home_pickup");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [scheduledVisitDate, setScheduledVisitDate] = useState<Date | null>(null);
  const [showVisitDatePicker, setShowVisitDatePicker] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const clearError = (field: string) => {
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: false }));
    }
  };
  
  // Auto-fill customer info when logged in
  useEffect(() => {
    if (isAuthenticated && customer) {
      setCustomerName(customer.name || "");
      setPhone(customer.phone || "");
      setAddress(customer.address || "");
    }
  }, [isAuthenticated, customer]);

  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createRequestMutation = useMutation({
    mutationFn: serviceRequestsApi.create,
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || "");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to submit request");
      setIsSubmitting(false);
    },
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

  const tvBrands = getSettingArray("tv_brands", ["Sony", "Samsung", "LG", "Walton", "Vision"]);
  const tvInches = getSettingArray("tv_inches", ["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"]);
  const serviceCategories = getSettingArray("service_categories", ["No Power", "No Display", "Broken Screen", "Sound Issue", "Software"]);
  const commonSymptoms = getSettingArray("common_symptoms", ["Blinking Red Light", "Lines on Screen", "Dim Picture", "Wifi Not Connecting", "Remote Not Working", "Burning Smell"]);

  const nextStep = () => {
    if (step === 1) {
      const errors: Record<string, boolean> = {};
      const missingFields: string[] = [];
      
      if (!brand) {
        errors.brand = true;
        missingFields.push("Brand");
      }
      if (!screenSize) {
        errors.screenSize = true;
        missingFields.push("Screen Size");
      }
      
      if (missingFields.length > 0) {
        setValidationErrors(prev => ({ ...prev, ...errors }));
        toast.error(`Please fill required fields: ${missingFields.join(", ")}`);
        return;
      }
    }
    
    if (step === 2) {
      if (!primaryIssue) {
        setValidationErrors(prev => ({ ...prev, primaryIssue: true }));
        toast.error("Please select the primary issue");
        return;
      }
    }
    
    if (step === 3) {
      const errors: Record<string, boolean> = {};
      const missingFields: string[] = [];
      
      if (!isAuthenticated) {
        if (!customerName.trim()) {
          errors.customerName = true;
          missingFields.push("Full Name");
        }
        if (!phone.trim()) {
          errors.phone = true;
          missingFields.push("Phone Number");
        }
      }
      
      // Address required when pickup service is selected
      if (servicePreference === "home_pickup") {
        const effectiveAddress = isAuthenticated && customer?.address ? customer.address : address;
        if (!effectiveAddress?.trim()) {
          errors.address = true;
          missingFields.push("Pickup Address");
        }
      }
      
      // Visit date required when service center is selected
      if (servicePreference === "service_center" && !scheduledVisitDate) {
        errors.scheduledVisitDate = true;
        missingFields.push("Visit Date");
      }
      
      if (missingFields.length > 0) {
        setValidationErrors(prev => ({ ...prev, ...errors }));
        toast.error(`Please fill required fields: ${missingFields.join(", ")}`);
        return;
      }
      
      if (isAuthenticated) {
        handleSubmit();
        return;
      }
      setStep(4);
      return;
    }
    
    if (step === 4) {
      const errors: Record<string, boolean> = {};
      const missingFields: string[] = [];
      
      if (!password) {
        errors.password = true;
        missingFields.push("Password");
      } else if (password.length < 6) {
        errors.password = true;
        toast.error("Password must be at least 6 characters");
        setValidationErrors(prev => ({ ...prev, ...errors }));
        return;
      }
      
      if (!confirmPassword) {
        errors.confirmPassword = true;
        missingFields.push("Confirm Password");
      } else if (password !== confirmPassword) {
        errors.confirmPassword = true;
        toast.error("Passwords do not match");
        setValidationErrors(prev => ({ ...prev, ...errors }));
        return;
      }
      
      if (missingFields.length > 0) {
        setValidationErrors(prev => ({ ...prev, ...errors }));
        toast.error(`Please fill required fields: ${missingFields.join(", ")}`);
        return;
      }
      
      handleSubmit();
      return;
    }
    setStep(s => s + 1);
  };
  
  const prevStep = () => setStep(s => s - 1);

  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Upload directly to Cloudinary with automatic compression
  const uploadToCloudinary = async (file: File): Promise<CloudinaryMedia> => {
    // First get upload params from our server (includes signature for security)
    const paramsResponse = await fetch("/api/cloudinary/upload-params", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceType: file.type.startsWith("video/") ? "video" : "image",
      }),
    });

    if (!paramsResponse.ok) {
      const errorData = await paramsResponse.json().catch(() => ({}));
      if (paramsResponse.status === 503) {
        throw new Error("Upload service not configured. Please contact support.");
      }
      throw new Error(errorData.error || "Failed to get upload parameters");
    }

    const params = await paramsResponse.json();
    const { cloudName, apiKey, signature, timestamp, folder, transformation } = params;

    // Upload directly to Cloudinary (bypasses our server for the actual file)
    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("folder", folder);
    // Apply automatic compression transformations (from server to match signature)
    formData.append("transformation", transformation);

    const resourceType = file.type.startsWith("video/") ? "video" : "image";
    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "Failed to upload file");
    }

    const result = await uploadResponse.json();
    // Return both URL and publicId (needed for deletion later)
    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType,
    };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const maxFiles = 10; // Reasonable limit for UI/UX

    if (files.length + selectedFiles.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }
    // No file size limit - Cloudinary handles compression automatically

    setIsUploadingFiles(true);
    const newFiles: UploadedFile[] = [];
    
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const isVideo = file.type.startsWith("video/");
        setUploadProgress(`${isVideo ? "Compressing & uploading" : "Uploading"} ${i + 1} of ${selectedFiles.length}...`);
        
        const reader = new FileReader();
        const preview = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        // Upload to Cloudinary (automatically compresses images and videos)
        const cloudinaryMedia = await uploadToCloudinary(file);
        
        newFiles.push({
          name: file.name,
          type: file.type,
          preview,
          objectUrl: cloudinaryMedia.url,
          publicId: cloudinaryMedia.publicId,
          resourceType: cloudinaryMedia.resourceType,
        });
      }

      setFiles([...files, ...newFiles]);
      toast.success(`${newFiles.length} file(s) uploaded & optimized successfully`);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload files. Please try again.");
    } finally {
      setIsUploadingFiles(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      if (!isAuthenticated && password) {
        await register({
          name: customerName,
          phone,
          address: address || undefined,
          password,
        });
        setAccountCreatedDuringSession(true);
        toast.success("Account created successfully!");
      } else if (isAuthenticated && customer) {
        // Update customer profile with the form data if they're logged in
        // This saves their phone/address if they skipped profile completion earlier
        const needsUpdate = 
          (phone && phone !== customer.phone) || 
          (address && address !== customer.address) ||
          (customerName && customerName !== customer.name);
        
        if (needsUpdate) {
          try {
            await updateProfile({
              name: customerName || undefined,
              phone: phone || undefined,
              address: address || undefined,
            });
            // Clear the skipped flag since we now have their info
            sessionStorage.removeItem('profileCompletionSkipped');
            await checkAuth(); // Refresh customer data
          } catch (profileError: any) {
            // Don't block the repair request if profile update fails
            // Just log the error - user can update later
            console.log("Profile update during repair request:", profileError);
            if (profileError?.message?.toLowerCase().includes("already in use")) {
              toast.error("This phone number is already in use by another account. Your repair request will still be submitted.");
            }
          }
        }
      }
      
      // Store full media objects with publicId for cleanup (30-day auto-deletion)
      const mediaData = files.map(f => ({
        url: f.objectUrl,
        publicId: f.publicId,
        resourceType: f.resourceType,
      }));
      
      const result = await createRequestMutation.mutateAsync({
        brand,
        screenSize: screenSize || undefined,
        modelNumber: modelNumber || undefined,
        primaryIssue,
        symptoms: JSON.stringify(selectedSymptoms),
        description: description || undefined,
        mediaUrls: mediaData.length > 0 ? JSON.stringify(mediaData) : undefined,
        customerName,
        phone,
        address: address || undefined,
        servicePreference,
        scheduledPickupDate: scheduledVisitDate ? scheduledVisitDate.toISOString() : undefined,
        status: "Pending",
        requestIntent: "repair",
        serviceMode: servicePreference === "home_pickup" ? "pickup" : "service_center",
      });
      
      setTicketNumber(result.ticketNumber || "");
      setStep(5);
      setIsSubmitting(false);
    } catch (error: any) {
      console.error("Submit error:", error);
      if (error.message?.includes("already registered")) {
        toast.error("This phone number is already registered. Please login instead.");
      } else {
        toast.error(error.message || "Failed to submit request");
      }
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

  const isImage = (type: string) => type.startsWith("image/");
  const isVideo = (type: string) => type.startsWith("video/");

  return (
    <PublicLayout>
      <div className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-3xl md:text-4xl font-heading font-bold mb-4">TV Repair Request</h1>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Submit your repair request online. Our technicians will diagnose the issue and get your device back to you in perfect condition.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-between mb-12 relative">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -z-10 -translate-y-1/2"></div>
            {((isAuthenticated && !accountCreatedDuringSession) ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5]).map((s) => {
              const wasAuthenticatedAtStart = isAuthenticated && !accountCreatedDuringSession;
              const getStepLabel = (stepNum: number) => {
                if (stepNum === 1) return "Device Info";
                if (stepNum === 2) return "Problem";
                if (stepNum === 3) return "Contact";
                if (wasAuthenticatedAtStart) {
                  if (stepNum === 4) return "Submit";
                  if (stepNum === 5) return "Done";
                } else {
                  if (stepNum === 4) return "Account";
                  if (stepNum === 5) return "Done";
                }
                return "";
              };
              const isComplete = s < step;
              const isCurrent = s === step;
              const isDone = s === 5 && step === 5;
              
              return (
                <div key={s} className={`flex flex-col items-center gap-2 bg-background p-2 ${s <= step ? 'text-primary' : 'text-muted-foreground'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-colors ${
                    s <= step ? 'bg-primary text-white border-primary' : 'bg-white border-slate-300'
                  }`}>
                    {isComplete ? <CheckCircle className="w-6 h-6" /> : s}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">
                    {getStepLabel(s)}
                  </span>
                </div>
              );
            })}
          </div>

          <Card className="border-none shadow-xl">
            <CardContent className="p-8">
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Device Details</h2>
                    <p className="text-muted-foreground">Tell us about the TV you need repaired.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Brand *</Label>
                      <Select value={brand} onValueChange={(val) => { setBrand(val); clearError('brand'); }}>
                        <SelectTrigger data-testid="select-brand" className={validationErrors.brand ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select Brand" />
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
                    
                    <div className="space-y-2">
                      <Label>Screen Size *</Label>
                      <Select value={screenSize} onValueChange={(val) => { setScreenSize(val); clearError('screenSize'); }}>
                        <SelectTrigger data-testid="select-size" className={validationErrors.screenSize ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select Size" />
                        </SelectTrigger>
                        <SelectContent>
                          {tvInches.map((inch) => (
                            <SelectItem 
                              key={inch} 
                              value={inch}
                              data-testid={`option-size-${inch.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {inch}
                            </SelectItem>
                          ))}
                          <SelectItem value="Other" data-testid="option-size-other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Model Number (Optional)</Label>
                    <Input 
                      placeholder="e.g. KD-55X80J" 
                      value={modelNumber}
                      onChange={(e) => setModelNumber(e.target.value)}
                      data-testid="input-model"
                    />
                    <p className="text-xs text-muted-foreground">Usually found on the back sticker of your TV.</p>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={nextStep} size="lg" data-testid="button-next-1">Next Step</Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Problem Description</h2>
                    <p className="text-muted-foreground">What issues are you facing?</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Primary Issue *</Label>
                    <Select value={primaryIssue} onValueChange={(val) => { setPrimaryIssue(val); clearError('primaryIssue'); }}>
                      <SelectTrigger data-testid="select-issue" className={validationErrors.primaryIssue ? 'border-red-500' : ''}>
                        <SelectValue placeholder="Select Issue Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceCategories.map((category) => (
                          <SelectItem 
                            key={category} 
                            value={category}
                            data-testid={`option-issue-${category.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Common Symptoms (Select all that apply)</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {commonSymptoms.map((sym) => (
                        <div key={sym} className="flex items-center space-x-2" data-testid={`symptom-checkbox-${sym.toLowerCase().replace(/\s+/g, '-')}`}>
                          <Checkbox 
                            id={sym} 
                            checked={selectedSymptoms.includes(sym)}
                            onCheckedChange={() => toggleSymptom(sym)}
                          />
                          <label htmlFor={sym} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                            {sym}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Detailed Description</Label>
                    <Textarea 
                      placeholder="Please describe exactly what happens..." 
                      className="h-32"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      data-testid="input-description"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Upload Photos/Video (Optional)</Label>
                    <div 
                      className={`border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors ${isUploadingFiles ? 'cursor-wait' : 'cursor-pointer'}`}
                      onClick={() => !isUploadingFiles && fileInputRef.current?.click()}
                      data-testid="file-upload-area"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={isUploadingFiles}
                        data-testid="file-input"
                      />
                      {isUploadingFiles ? (
                        <>
                          <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-2" />
                          <p className="text-sm font-medium">{uploadProgress || "Uploading..."}</p>
                        </>
                      ) : (
                        <>
                          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                          <p className="text-sm font-medium">Click to upload images or video</p>
                          <p className="text-xs text-muted-foreground">Auto-compressed for fast upload, up to 10 files</p>
                        </>
                      )}
                    </div>

                    {files.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                        {files.map((file, index) => (
                          <div key={index} className="relative group rounded-lg overflow-hidden border bg-slate-100" data-testid={`uploaded-file-${index}`}>
                            {isImage(file.type) && (
                              <img
                                src={file.preview}
                                alt={file.name}
                                className="w-full h-24 object-cover"
                              />
                            )}
                            {isVideo(file.type) && (
                              <div className="w-full h-24 flex items-center justify-center bg-slate-200">
                                <Film className="h-8 w-8 text-slate-500" />
                              </div>
                            )}
                            {!isImage(file.type) && !isVideo(file.type) && (
                              <div className="w-full h-24 flex items-center justify-center bg-slate-200">
                                <Image className="h-8 w-8 text-slate-500" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(index);
                              }}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`remove-file-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <p className="text-xs truncate px-2 py-1 bg-white/80">{file.name}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={prevStep} size="lg" data-testid="button-back-2">Back</Button>
                    <Button onClick={nextStep} size="lg" data-testid="button-next-2">Next Step</Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Contact Information</h2>
                    <p className="text-muted-foreground">Where should we provide service?</p>
                  </div>

                  {isAuthenticated && customer ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Using your account details</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name:</span>{" "}
                          <span className="font-medium">{customer.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          <span className="font-medium">{customer.phone}</span>
                        </div>
                      </div>
                      {customer.address && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Address:</span>{" "}
                          <span className="font-medium">{customer.address}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Full Name *</Label>
                        <Input 
                          placeholder="Your Name" 
                          value={customerName}
                          onChange={(e) => { setCustomerName(e.target.value); clearError('customerName'); }}
                          className={validationErrors.customerName ? 'border-red-500' : ''}
                          data-testid="input-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number *</Label>
                        <Input 
                          placeholder="+880 1..." 
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value); clearError('phone'); }}
                          className={validationErrors.phone ? 'border-red-500' : ''}
                          data-testid="input-phone"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base">Service Preference</Label>
                    <RadioGroup value={servicePreference} onValueChange={(val) => { setServicePreference(val); clearError('address'); clearError('scheduledVisitDate'); }}>
                      <div className="flex items-center space-x-2 border p-4 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <RadioGroupItem value="home_pickup" id="home_pickup" data-testid="radio-pickup" />
                        <Label htmlFor="home_pickup" className="flex-1 cursor-pointer">
                          <span className="font-bold block">Pickup & Drop Service</span>
                          <span className="text-muted-foreground text-sm">We collect your device, repair it, and deliver it back. (Additional charge applies)</span>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 border p-4 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <RadioGroupItem value="service_center" id="service_center" data-testid="radio-center" />
                        <Label htmlFor="service_center" className="flex-1 cursor-pointer">
                          <span className="font-bold block">Service Center Visit</span>
                          <span className="text-muted-foreground text-sm">You bring the device to our nearest branch.</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {servicePreference === "home_pickup" && (
                    <div className="space-y-2">
                      <Label>Pickup Address *</Label>
                      <Textarea 
                        placeholder="House No, Road No, Area, District"
                        value={address}
                        onChange={(e) => { setAddress(e.target.value); clearError('address'); }}
                        className={validationErrors.address ? 'border-red-500' : ''}
                        data-testid="input-address"
                      />
                      <p className="text-xs text-muted-foreground">We'll collect your device from this address.</p>
                    </div>
                  )}

                  {servicePreference === "service_center" && (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg border ${validationErrors.scheduledVisitDate ? 'border-red-500 bg-red-50' : 'bg-blue-50 border-blue-200'}`}>
                        <p className="font-medium mb-2 flex items-center gap-2 text-blue-800">
                          <Calendar className="w-4 h-4" />
                          Select your planned visit date *
                        </p>
                        <p className="text-sm text-blue-700 mb-3">
                          Choose a date when you plan to bring your TV to our service center. <span className="text-blue-600 font-medium">(Fridays closed)</span>
                        </p>
                        
                        {!scheduledVisitDate && !showVisitDatePicker && (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start text-left font-normal bg-white"
                            onClick={() => setShowVisitDatePicker(true)}
                            data-testid="button-select-visit-date"
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            Select Date
                          </Button>
                        )}
                        
                        {showVisitDatePicker && (
                          <div className="bg-white rounded-lg border p-3">
                            <CalendarComponent
                              mode="single"
                              selected={scheduledVisitDate || undefined}
                              onSelect={(date: Date | undefined) => {
                                if (date) {
                                  setScheduledVisitDate(date);
                                  setShowVisitDatePicker(false);
                                  clearError('scheduledVisitDate');
                                }
                              }}
                              disabled={(date: Date) => date < new Date() || date.getDay() === 5}
                              initialFocus
                            />
                            <div className="flex justify-end mt-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowVisitDatePicker(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {scheduledVisitDate && !showVisitDatePicker && (
                          <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-5 h-5 text-green-600" />
                              <div>
                                <p className="font-medium text-green-800">
                                  {format(scheduledVisitDate, "EEEE, MMMM d, yyyy")}
                                </p>
                                <p className="text-xs text-green-600">Planned visit date</p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowVisitDatePicker(true)}
                              data-testid="button-change-visit-date"
                            >
                              Change
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={prevStep} size="lg" data-testid="button-back-3">Back</Button>
                    <Button onClick={nextStep} size="lg" disabled={isSubmitting} data-testid="button-next-3">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : isAuthenticated ? (
                        "Submit Request"
                      ) : (
                        "Next Step"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {step === 4 && (!isAuthenticated || accountCreatedDuringSession) && (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Create Your Account</h2>
                    <p className="text-muted-foreground">Set a password to track your repair request and manage future orders.</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                      <UserPlus className="w-5 h-5" />
                      <span className="font-medium">Your account details</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name:</span>{" "}
                        <span className="font-medium">{customerName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{" "}
                        <span className="font-medium">{phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input 
                        type="password"
                        placeholder="Enter password (min 6 characters)"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                        className={validationErrors.password ? 'border-red-500' : ''}
                        data-testid="input-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm Password *</Label>
                      <Input 
                        type="password"
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
                        className={validationErrors.confirmPassword ? 'border-red-500' : ''}
                        data-testid="input-confirm-password"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    By creating an account, you'll be able to track your repair status online and manage future service requests.
                  </p>

                  <div className="flex justify-between pt-4">
                    <Button variant="outline" onClick={prevStep} size="lg" data-testid="button-back-4">Back</Button>
                    <Button onClick={nextStep} size="lg" disabled={isSubmitting} data-testid="button-submit">
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        "Create Account & Submit"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300 text-center">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-3xl font-heading font-bold text-green-700">Request Received!</h2>
                    <p className="text-lg text-muted-foreground">
                      Your Ticket Number: <span className="font-mono font-bold text-foreground">#{ticketNumber}</span>
                    </p>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      We have received your service request. Our team will contact you shortly to confirm the details.
                    </p>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-lg max-w-md mx-auto text-left space-y-4 border">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Service Type</span>
                      <span className="font-medium">{servicePreference === "home_pickup" ? "Pickup & Drop" : "Service Center"}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-muted-foreground">Device</span>
                      <span className="font-medium">{brand} {screenSize ? `${screenSize}"` : ""} TV</span>
                    </div>
                    {servicePreference === "service_center" && scheduledVisitDate && (
                      <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Visit Date</span>
                        <span className="font-medium">{format(scheduledVisitDate, "MMM d, yyyy")}</span>
                      </div>
                    )}
                    <div className="flex justify-between pb-2">
                      <span className="text-muted-foreground">Est. Response</span>
                      <span className="font-medium">Within 2 Hours</span>
                    </div>
                  </div>

                  {!isAuthenticated && (
                    <div className="bg-primary/5 border border-primary/20 p-6 rounded-lg max-w-md mx-auto">
                      <UserPlus className="w-8 h-8 text-primary mx-auto mb-3" />
                      <h3 className="font-bold text-lg mb-2">Track Your Order Online</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Create a free account to track your repair status in real-time and get updates.
                      </p>
                      <Button 
                        onClick={() => setShowAuthModal(true)} 
                        className="w-full"
                        data-testid="button-signup-prompt"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create Account to Track
                      </Button>
                    </div>
                  )}

                  {isAuthenticated && customer && (
                    <div className="bg-green-50 border border-green-200 p-6 rounded-lg max-w-md mx-auto">
                      <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                      <h3 className="font-bold text-lg mb-2">Order Linked to Your Account</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        Hi {customer.name}! This order has been linked to your account. You can track it anytime.
                      </p>
                      <Link href="/track-order">
                        <Button className="w-full" data-testid="button-view-orders">
                          View My Orders
                        </Button>
                      </Link>
                    </div>
                  )}

                  <div className="flex justify-center gap-4 pt-4">
                    <Link href="/">
                      <Button variant="outline" size="lg" data-testid="button-home">Return Home</Button>
                    </Link>
                    <Link href="/track-order">
                      <Button size="lg" data-testid="button-track">Track Status</Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CustomerAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        defaultTab="register"
        prefillData={{
          name: customerName,
          phone: phone,
        }}
        onSuccess={() => {
          setShowAuthModal(false);
          toast.success("Account created! Your order has been linked.");
        }}
      />
    </PublicLayout>
  );
}
