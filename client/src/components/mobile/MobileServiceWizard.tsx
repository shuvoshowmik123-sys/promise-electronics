import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  FileImage,
  Home,
  Loader2,
  MapPin,
  Phone,
  Tv,
  Upload,
  VolumeX,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { publicSettingsApi, quoteRequestsApi, serviceCatalogApi, serviceRequestsApi } from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { toast } from "sonner";

type WizardMode = "repair" | "quote";
type ServicePreference = "home_pickup" | "service_center" | "both";

interface UploadedFile {
  name: string;
  type: string;
  preview: string;
  objectUrl: string;
  fileId: string;
  resourceType: "image" | "video";
}

interface ImageKitMedia {
  url: string;
  fileId: string;
  resourceType: "image" | "video";
}

interface MobileServiceWizardProps {
  mode: WizardMode;
}

const problemOptions = [
  {
    id: "No Display",
    bn: "ডিসপ্লে নেই",
    en: "No Display",
    icon: Tv,
    followUpTitle: "Power light বা sound আছে?",
    followUps: ["Power light আছে", "Sound আছে", "দুটোই নেই"],
  },
  {
    id: "Lines on Screen",
    bn: "স্ক্রিনে লাইন",
    en: "Lines on Screen",
    icon: AlertTriangle,
    followUpTitle: "লাইনটা কেমন?",
    followUps: ["শুধু লাইন", "স্ক্রিন ভাঙা", "কালার সমস্যা"],
  },
  {
    id: "Power Problem",
    bn: "পাওয়ার সমস্যা",
    en: "Power Problem",
    icon: Zap,
    followUpTitle: "কোন ঘটনা হয়েছে?",
    followUps: ["Lightning/ঝড়", "Voltage issue", "হঠাৎ বন্ধ"],
  },
  {
    id: "Sound Issue",
    bn: "সাউন্ড সমস্যা",
    en: "Sound Issue",
    icon: VolumeX,
    followUpTitle: "সাউন্ডে কী হচ্ছে?",
    followUps: ["Sound নেই", "Sound কম", "Distorted sound"],
  },
  {
    id: "Smart TV Issue",
    bn: "স্মার্ট TV সমস্যা",
    en: "Smart TV Issue",
    icon: Wifi,
    followUpTitle: "Smart TV-তে কী সমস্যা?",
    followUps: ["App খুলছে না", "WiFi সমস্যা", "Software hang"],
  },
  {
    id: "Other Issue",
    bn: "অন্য সমস্যা",
    en: "Other Issue",
    icon: Wrench,
    followUpTitle: "সমস্যাটা একটু লিখুন",
    followUps: [],
  },
];

const tvTypes = ["LED", "Smart TV", "Android TV", "OLED/QLED", "Not sure"];
const screenSizes = ["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"];

function getSettingArray(settings: { key: string; value: string | null }[], key: string, fallback: string[]) {
  const setting = settings.find((item) => item.key === key);
  if (!setting?.value) return fallback;
  try {
    const parsed: unknown = JSON.parse(setting.value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : fallback;
  } catch {
    return fallback;
  }
}

function normalizePhone(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("880")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function MobileServiceWizard({ mode }: MobileServiceWizardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { customer } = useCustomerAuth();
  const { language, t } = useCustomerLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [primaryIssue, setPrimaryIssue] = useState("");
  const [smartAnswer, setSmartAnswer] = useState("");
  const [brand, setBrand] = useState("");
  const [tvType, setTvType] = useState("");
  const [screenSize, setScreenSize] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [servicePreference, setServicePreference] = useState<ServicePreference>("home_pickup");
  const [customerName, setCustomerName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(normalizePhone(customer?.phone || ""));
  const [address, setAddress] = useState(customer?.address || "");
  const [ticketNumber, setTicketNumber] = useState("");
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["public-settings"],
    queryFn: publicSettingsApi.getAll,
    staleTime: 0,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: serviceCatalogApi.getAll,
    staleTime: 5 * 60 * 1000,
    enabled: mode === "quote",
  });

  const getTvTypeLabel = (type: string) => {
    switch (type) {
      case "LED": return t("wizard.tvLed");
      case "Smart TV": return t("wizard.tvSmart");
      case "Android TV": return t("wizard.tvAndroid");
      case "OLED/QLED": return t("wizard.tvOled");
      case "Not sure": return t("wizard.notSure");
      default: return type;
    }
  };

  const tvBrands = getSettingArray(settings, "tv_brands", ["Samsung", "Sony", "LG", "Walton", "Vision", "Other"]);
  const selectedProblem = problemOptions.find((item) => item.id === primaryIssue);
  const totalSteps = 6;

  const issueDescription = useMemo(() => {
    const parts = [
      selectedProblem ? `${selectedProblem.bn} (${selectedProblem.en})` : primaryIssue,
      smartAnswer ? `Follow-up: ${smartAnswer}` : "",
      tvType ? `TV Type: ${tvType}` : "",
      description.trim(),
    ].filter(Boolean);
    return parts.join("\n");
  }, [description, primaryIssue, selectedProblem, smartAnswer, tvType]);

  const uploadToImageKit = async (file: File): Promise<ImageKitMedia> => {
    const authResponse = await fetch(getApiUrl("/api/upload/imagekit-auth"), {
      method: "GET",
      credentials: "include",
    });

    if (!authResponse.ok) {
      throw new Error("Upload service is not ready. You can submit without photos.");
    }

    const authParams = await authResponse.json() as { token: string; expire: number; signature: string };
    const urlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT;
    const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY;

    if (!urlEndpoint || !publicKey) {
      throw new Error("Upload service is not configured. You can submit without photos.");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("publicKey", publicKey);
    formData.append("signature", authParams.signature);
    formData.append("expire", authParams.expire.toString());
    formData.append("token", authParams.token);
    formData.append("fileName", file.name);
    formData.append("folder", "/service-requests");

    const uploadResponse = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error("Photo upload failed. You can submit without photos.");
    }

    const result = await uploadResponse.json() as { url: string; fileId: string };
    return {
      url: result.url,
      fileId: result.fileId,
      resourceType: file.type.startsWith("video/") ? "video" : "image",
    };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length) return;
    if (mode !== "repair") return;

    setIsUploadingFiles(true);
    try {
      const uploadedFiles: UploadedFile[] = [];
      for (const file of selectedFiles.slice(0, 5)) {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const uploaded = await uploadToImageKit(file);
        uploadedFiles.push({
          name: file.name,
          type: file.type,
          preview,
          objectUrl: uploaded.url,
          fileId: uploaded.fileId,
          resourceType: uploaded.resourceType,
        });
      }
      setFiles((current) => [...current, ...uploadedFiles].slice(0, 5));
      toast.success("Photo added");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Photo upload failed");
    } finally {
      setIsUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const repairMutation = useMutation({
    mutationFn: serviceRequestsApi.create,
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || data.id);
      queryClient.invalidateQueries({ queryKey: ["customer-service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      setStep(6);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
    },
  });

  const quoteMutation = useMutation({
    mutationFn: quoteRequestsApi.submit,
    onSuccess: (data) => {
      setTicketNumber(data.ticketNumber || data.id);
      setStep(6);
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Failed to submit quote request");
    },
  });

  const canContinue = () => {
    if (step === 1) return Boolean(primaryIssue);
    if (step === 2) return Boolean(brand && (screenSize || tvType));
    if (step === 4) return Boolean(servicePreference);
    if (step === 5) return Boolean(customerName.trim() && phone.trim());
    return true;
  };

  const nextStep = () => {
    if (!canContinue()) {
      toast.error("Please complete this step first");
      return;
    }
    setStep((current) => Math.min(totalSteps - 1, current + 1));
  };

  const submit = () => {
    if (!canContinue()) {
      toast.error("Please add your name and phone number");
      return;
    }

    const safePhone = phone.startsWith("+880") ? phone : `+880${normalizePhone(phone)}`;
    const safeName = customerName.trim();
    const safeAddress = address.trim();

    if (mode === "repair") {
      repairMutation.mutate({
        brand,
        screenSize: screenSize || undefined,
        modelNumber: modelNumber || undefined,
        primaryIssue,
        symptoms: JSON.stringify(smartAnswer ? [smartAnswer] : []),
        description: issueDescription || undefined,
        mediaUrls: files.length ? JSON.stringify(files.map((file) => ({
          url: file.objectUrl,
          fileId: file.fileId,
          resourceType: file.resourceType,
        }))) : undefined,
        customerName: safeName,
        phone: safePhone,
        address: safeAddress || undefined,
        servicePreference,
        status: "Pending",
        requestIntent: "repair",
        serviceMode: servicePreference === "home_pickup" ? "pickup" : "service_center",
      });
      return;
    }

    const selectedService = services[0];
    quoteMutation.mutate({
      serviceId: selectedService?.id || "general_repair",
      brand,
      screenSize: screenSize || undefined,
      modelNumber: modelNumber || undefined,
      primaryIssue,
      description: issueDescription || undefined,
      customerName: safeName,
      phone: safePhone,
      servicePreference,
      address: safeAddress || undefined,
      requestIntent: "quote",
      serviceMode: servicePreference === "home_pickup" ? "pickup" : "service_center",
    });
  };

  const isSubmitting = repairMutation.isPending || quoteMutation.isPending;

  if (step === 6) {
    return (
      <main className="min-h-screen bg-emerald-50 px-4 pb-28 pt-5">
        <div className="mx-auto max-w-md">
          <div className="rounded-[28px] bg-white p-6 text-center shadow-sm ring-1 ring-emerald-100">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <p className="text-sm font-semibold text-emerald-700">{t("wizard.received")}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">{t("wizard.willCall")}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {t("wizard.submitted")}
            </p>
            <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium text-emerald-700">{t("wizard.ticketNumber")}</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-950">#{ticketNumber}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-2xl border-emerald-200" asChild>
                <Link href="/home">{t("dock.home")}</Link>
              </Button>
              <Button className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700" asChild>
                <Link href={`/track-order?order=${encodeURIComponent(ticketNumber)}&type=service`}>{t("dock.track")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white pb-32">
      <div className="sticky top-0 z-20 border-b border-emerald-100 bg-white/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            onClick={() => (step === 1 ? setLocation("/home") : setStep((current) => current - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {t("wizard.step")} {step} {t("wizard.of")} {totalSteps - 1}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(step / (totalSteps - 1)) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-md px-4 pt-5">
        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-emerald-700">{t("common.promiseElectronics")}</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">{t("wizard.whatProblem")}</h1>
              <p className="mt-2 text-sm text-slate-600">{t("wizard.tapOption")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {problemOptions.map((problem) => {
                const Icon = problem.icon;
                const selected = primaryIssue === problem.id;
                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => {
                      setPrimaryIssue(problem.id);
                      setSmartAnswer("");
                    }}
                    className={`min-h-[104px] rounded-3xl border p-4 text-left transition active:scale-[0.98] ${selected ? "border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "border-emerald-100 bg-white text-slate-800 shadow-sm"}`}
                  >
                    <Icon className="mb-3 h-6 w-6" />
                    <span className="block text-sm font-bold">{language === "bn" ? problem.bn : problem.en}</span>
                    <span className={`mt-1 block text-xs ${selected ? "text-emerald-50" : "text-slate-500"}`}>{language === "bn" ? problem.en : problem.bn}</span>
                  </button>
                );
              })}
            </div>
            {selectedProblem && (
              <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-slate-900">{selectedProblem.followUpTitle}</p>
                {selectedProblem.followUps.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedProblem.followUps.map((answer) => (
                      <button
                        type="button"
                        key={answer}
                        onClick={() => setSmartAnswer(answer)}
                        className={`min-h-11 rounded-full border px-4 text-sm font-medium ${smartAnswer === answer ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {answer}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-3 min-h-24 rounded-2xl border-emerald-100"
                    placeholder={t("wizard.writeIssue")}
                  />
                )}
              </div>
            )}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t("wizard.aboutTv")}</h1>
              <p className="mt-2 text-sm text-slate-600">{t("wizard.aboutTvDesc")}</p>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <Label>{t("wizard.tvType")}</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {tvTypes.map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setTvType(type)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${tvType === type ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}
                  >
                    {getTvTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="space-y-2">
                <Label>{t("wizard.brand")}</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger className="h-12 rounded-2xl border-emerald-100">
                    <SelectValue placeholder={t("wizard.selectBrand")} />
                  </SelectTrigger>
                  <SelectContent>
                    {tvBrands.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t("wizard.size")}</Label>
                  <Select value={screenSize} onValueChange={setScreenSize}>
                    <SelectTrigger className="h-12 rounded-2xl border-emerald-100">
                      <SelectValue placeholder={t("wizard.size")} />
                    </SelectTrigger>
                    <SelectContent>
                      {screenSizes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("wizard.model")}</Label>
                  <Input value={modelNumber} onChange={(event) => setModelNumber(event.target.value)} className="h-12 rounded-2xl border-emerald-100" placeholder={t("wizard.optional")} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t("wizard.photoTitle")}</h1>
              <p className="mt-2 text-sm text-slate-600">{mode === "repair" ? t("wizard.photoDesc") : t("wizard.quotePhotoDesc")}</p>
            </div>
            {mode === "repair" ? (
              <div className="rounded-3xl border border-dashed border-emerald-300 bg-white p-5 text-center shadow-sm">
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingFiles}
                  className="mx-auto flex min-h-[132px] w-full flex-col items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"
                >
                  {isUploadingFiles ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
                  <span className="mt-3 text-sm font-bold">{isUploadingFiles ? t("wizard.uploading") : t("wizard.addPhoto")}</span>
                  <span className="mt-1 text-xs text-emerald-700/80">{t("wizard.skipStep")}</span>
                </button>
                {files.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {files.map((file, index) => (
                      <div key={`${file.fileId}-${index}`} className="overflow-hidden rounded-2xl bg-slate-100">
                        {file.type.startsWith("image/") ? (
                          <img src={file.preview} alt={file.name} className="h-20 w-full object-cover" />
                        ) : (
                          <div className="flex h-20 items-center justify-center text-emerald-700"><FileImage className="h-6 w-6" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="space-y-2 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <Label>{t("wizard.extraDetails")}</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 rounded-2xl border-emerald-100"
                placeholder="Example: TV turns on but screen stays black..."
              />
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t("wizard.serviceTitle")}</h1>
              <p className="mt-2 text-sm text-slate-600">{t("wizard.serviceDesc")}</p>
            </div>
            <div className="space-y-3">
              {[
                { id: "home_pickup", title: t("wizard.homeVisit"), icon: Home },
                { id: "service_center", title: "Drop-off", bn: "শপে নিয়ে আসব", icon: MapPin },
                { id: "both", title: t("wizard.callFirst"), icon: Phone },
              ].map((option) => {
                const Icon = option.icon;
                const selected = servicePreference === option.id;
                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setServicePreference(option.id as ServicePreference)}
                    className={`flex min-h-[86px] w-full items-center gap-4 rounded-3xl border p-4 text-left transition ${selected ? "border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "border-emerald-100 bg-white text-slate-800 shadow-sm"}`}
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${selected ? "bg-white/15" : "bg-emerald-50 text-emerald-700"}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <span>
                      <span className="block font-bold">{option.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {servicePreference === "home_pickup" && (
              <div className="space-y-2 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
                <Label>{t("wizard.pickupAddress")}</Label>
                <Textarea value={address} onChange={(event) => setAddress(event.target.value)} className="min-h-24 rounded-2xl border-emerald-100" placeholder="Area, road, house..." />
              </div>
            )}
          </motion.div>
        )}

        {step === 5 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t("wizard.finalStep")}</h1>
              <p className="mt-2 text-sm text-slate-600">{t("wizard.finalDesc")}</p>
            </div>
            <div className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="space-y-2">
                <Label>{t("wizard.name")}</Label>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="h-12 rounded-2xl border-emerald-100" placeholder="Your name" />
              </div>
              <div className="space-y-2">
                <Label>{t("wizard.phone")}</Label>
                <PhoneInput value={phone} onChange={(event) => setPhone(event.target.value)} className="h-12 rounded-2xl border-emerald-100" placeholder="1XXXXXXXXX" />
              </div>
            </div>
            <div className="rounded-3xl bg-emerald-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">{t("wizard.summary")}</p>
              <p className="mt-2">{brand || "TV"} {screenSize} - {selectedProblem?.en || primaryIssue}</p>
              <p>{servicePreference === "home_pickup" ? t("wizard.homeVisit") : servicePreference === "service_center" ? t("wizard.dropOff") : t("wizard.callFirst")}</p>
            </div>
          </motion.div>
        )}
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-emerald-100 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => (step === 1 ? setLocation("/home") : setStep((current) => current - 1))}
            className="h-12 min-w-12 rounded-2xl border-emerald-200 px-4"
          >
            {step === 1 ? <ArrowLeft className="h-5 w-5" /> : t("wizard.back")}
          </Button>
          <Button
            type="button"
            onClick={step === 5 ? submit : nextStep}
            disabled={isSubmitting}
            className="h-12 flex-1 rounded-2xl bg-emerald-600 font-bold hover:bg-emerald-700"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : step === 5 ? (
              mode === "quote" ? t("wizard.getQuote") : t("wizard.requestService")
            ) : (
              <>
                {t("wizard.continue")} <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </main>
  );
}
