import { useEffect, useMemo, useRef, useState } from "react";
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
  HelpCircle,
  Loader2,
  MapPin,
  Phone,
  Search,
  Truck,
  Tv,
  Upload,
  VolumeX,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PickupLocationPicker } from "@/components/maps/PickupLocationPicker";
import { PushMomentOfValue } from "@/components/notifications/PushMomentOfValue";
import { CarouselSelector, ScreenSizeGlyph } from "@/components/mobile/CarouselSelector";
import { SearchPickerOverlay } from "@/components/mobile/SearchPickerOverlay";
import { mergePinAddress } from "@/lib/pickup-address";
import { resolveServiceIcon } from "@/lib/service-icons";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { customerAuthApi, publicAreaMapApi, publicSettingsApi, quoteRequestsApi, serviceCatalogApi, serviceRequestsApi } from "@/lib/api";
import { materialIntakeKey, resolveIntakeIdempotencyKey } from "@/lib/intake-idempotency";
import { getApiUrl } from "@/lib/config";
import { getIKFolder } from "@/lib/imagekit-config";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { toast } from "sonner";
import { NOT_SURE_SERVICE } from "@/lib/service-constants";

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

const DEFAULT_PROBLEM_OPTIONS = [
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

// NOT_SURE_SERVICE imported from @/lib/service-constants — shared with desktop Get Quote

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
  const { customer, register, isAuthenticated } = useCustomerAuth();
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
  const [serviceAreaId, setServiceAreaId] = useState("");
  // PICKUP-MAP-PIN-01 — pin is optional; a typed address alone stays valid.
  const [pickupLatitude, setPickupLatitude] = useState<number | null>(null);
  const [pickupLongitude, setPickupLongitude] = useState<number | null>(null);
  const [pickupLocationSource, setPickupLocationSource] = useState<"map_pin" | "gps" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brandSearchOpen, setBrandSearchOpen] = useState(false);
  /**
   * CUSTOMER-SERVICE-INTENT-01A — quote mode only.
   *
   * NOT_SURE_SERVICE is a UI-only sentinel; it is translated to serviceId: null
   * on submit and is never sent to the API. This replaces the previous
   * `services[0]?.id || "general_repair"` fallback, which recorded a service the
   * customer never chose (and an id that does not exist in the catalogue).
   */
  const [serviceId, setServiceId] = useState<string>(NOT_SURE_SERVICE);
  const [serviceSearchOpen, setServiceSearchOpen] = useState(false);
  /** Address line contributed by the last pin, so re-pinning replaces it instead of stacking. */
  const lastPinAddressRef = useRef<string | null>(null);
  const [customerName, setCustomerName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(normalizePhone(customer?.phone || ""));
  const [address, setAddress] = useState(customer?.address || "");
  /**
   * Whether the customer has edited a contact field by hand.
   *
   * The three useState calls above only read `customer` on the FIRST render,
   * and authentication resolves asynchronously — so on mobile the fields stayed
   * blank for anyone whose session had not arrived by then. Desktop had a sync
   * effect for exactly this; the wizard had none.
   *
   * Syncing must not clobber typing, hence the flag: once the customer touches
   * a field, a late-arriving session no longer overwrites it.
   */
  const contactTouched = useRef(false);
  const [ticketNumber, setTicketNumber] = useState("");
  const [setupRequestState, setSetupRequestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountCreated, setAccountCreated] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const payloadMaterialRef = useRef<string | null>(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // Fill contact details once the session arrives. Matches the effect desktop
  // Repair Request has had all along; without it the mobile wizard asked a
  // signed-in customer to retype the name and number it already knew.
  useEffect(() => {
    if (!isAuthenticated || !customer) return;
    if (contactTouched.current) return;
    setCustomerName(customer.name || "");
    setPhone(normalizePhone(customer.phone || ""));
    setAddress(customer.address || "");
  }, [isAuthenticated, customer]);

  // Pre-fill from calculator query params (?brand=...&size=...&issue=...)
  const wizardHydrated = useRef(false);
  useEffect(() => {
    if (wizardHydrated.current) return;
    wizardHydrated.current = true;
    const params = new URLSearchParams(window.location.search);
    const qBrand = params.get("brand");
    const qSize  = params.get("size");
    const qIssue = params.get("issue");
    const qServiceMode = params.get("serviceMode");
    const qServiceAreaId = params.get("serviceAreaId");
    if (qBrand) setBrand(decodeURIComponent(qBrand));
    if (qSize)  setScreenSize(decodeURIComponent(qSize));
    if (qIssue) setPrimaryIssue(decodeURIComponent(qIssue));
    if (qServiceMode === "pickup") setServicePreference("home_pickup");
    if (qServiceMode === "service_center") setServicePreference("service_center");
    if (qServiceAreaId) setServiceAreaId(qServiceAreaId);
  }, []);

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

  /** Active catalogue services only — a deactivated service must not be offerable. */
  const activeServices = useMemo(
    () => services.filter((service) => service.isActive !== false),
    [services],
  );

  /**
   * CUSTOMER-SERVICE-INTENT-01A — resolve ?service=<id or exact name>.
   *
   * Runs in its own effect (not the param-hydration effect above) because the
   * catalogue arrives asynchronously and cannot be matched on first mount.
   * Matches by exact id first, then by exact case-insensitive name. Anything
   * unmatched — including an inactive service — deliberately leaves the
   * selection on "Not sure" rather than guessing a nearest match.
   */
  const serviceParamResolved = useRef(false);
  useEffect(() => {
    if (mode !== "quote") return;
    if (serviceParamResolved.current) return;
    if (activeServices.length === 0) return;

    const raw = new URLSearchParams(window.location.search).get("service");
    serviceParamResolved.current = true;
    if (!raw) return;

    const wanted = decodeURIComponent(raw).trim();
    if (!wanted) return;

    const byId = activeServices.find((service) => service.id === wanted);
    const match =
      byId ??
      activeServices.find(
        (service) => (service.name || "").trim().toLocaleLowerCase() === wanted.toLocaleLowerCase(),
      );
    if (match) setServiceId(match.id);
  }, [mode, activeServices]);

  const { data: serviceAreas = [] } = useQuery({
    queryKey: ["public-service-area-list"],
    queryFn: publicAreaMapApi.getList,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const selectedServiceArea = serviceAreas.find((area) => area.id === serviceAreaId);

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

  // Build problem options from settings; map known issues to existing metadata
  const problemOptions = useMemo(() => {
    const symptoms = getSettingArray(settings, "common_symptoms", []);
    const effective = symptoms.length > 0 ? symptoms : getSettingArray(settings, "common_issues", []);
    if (effective.length === 0) return DEFAULT_PROBLEM_OPTIONS;
    return effective.map(symptom => {
      const match = DEFAULT_PROBLEM_OPTIONS.find(
        p => p.en.toLowerCase() === symptom.toLowerCase() || p.id.toLowerCase() === symptom.toLowerCase()
      );
      if (match) return match;
      return {
        id: symptom,
        bn: symptom,
        en: symptom,
        icon: Wrench,
        followUpTitle: null as string | null,
        followUps: [] as string[],
      };
    });
  }, [settings]);

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
    formData.append("folder", getIKFolder("/service-requests"));

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
    mutationFn: (data: Parameters<typeof serviceRequestsApi.create>[0]) => {
      const material = materialIntakeKey(data);
      const key = resolveIntakeIdempotencyKey(material, idempotencyKeyRef, payloadMaterialRef);
      return serviceRequestsApi.create(data, key);
    },
    onSuccess: (data: any) => {
      if (data?.code === "DUPLICATE_REQUEST_WINDOW") {
        toast.info("We already received a similar request. Our team will contact you soon.");
        setStep(6);
        return;
      }
      setTicketNumber(data.ticketNumber || data.id);
      queryClient.invalidateQueries({ queryKey: ["customer-service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      setStep(6);
    },
    onError: (error: any) => {
      if (error?.code === "IDEMPOTENCY_CONFLICT") {
        toast.error("The request details changed. Please review and try again.");
        idempotencyKeyRef.current = null;
        payloadMaterialRef.current = null;
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to submit request");
      }
    },
  });

  const quoteMutation = useMutation({
    mutationFn: (data: Parameters<typeof quoteRequestsApi.submit>[0]) => {
      const material = materialIntakeKey(data);
      const key = resolveIntakeIdempotencyKey(material, idempotencyKeyRef, payloadMaterialRef);
      return quoteRequestsApi.submit(data, key);
    },
    onSuccess: (data: any) => {
      if (data?.code === "DUPLICATE_REQUEST_WINDOW") {
        toast.info("We already received a similar request. Our team will contact you soon.");
        setStep(6);
        return;
      }
      setTicketNumber(data.ticketNumber || data.id);
      setStep(6);
    },
    onError: (error: any) => {
      if (error?.code === "IDEMPOTENCY_CONFLICT") {
        toast.error("The request details changed. Please review and try again.");
        idempotencyKeyRef.current = null;
        payloadMaterialRef.current = null;
      } else {
        toast.error(error instanceof Error ? error.message : "Failed to submit quote request");
      }
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

  const submit = async () => {
    if (!canContinue()) {
      toast.error("Please add your name and phone number");
      return;
    }

    const safePhone = phone.startsWith("+880") ? phone : `+880${normalizePhone(phone)}`;
    const safeName = customerName.trim();
    const safeAddress = address.trim();

    // Create the account BEFORE submitting, when a password was given.
    //
    // Ordering is the whole fix. Submitting first makes intake create an
    // unclaimed account for this phone, which then refuses the customer's own
    // registration ("contact support to activate online access") for a record
    // they made seconds earlier. Registering first means intake sees a real
    // session and links to it, so that record is never created.
    //
    // A failure here must not cost them the repair request — it is optional, so
    // fall through and submit anonymously.
    if (!customer && accountPassword.length >= 6 && !accountCreated) {
      try {
        await register({
          name: safeName,
          phone: safePhone,
          address: safeAddress || undefined,
          password: accountPassword,
        });
        setAccountCreated(true);
        toast.success("Account created — this repair will be saved to it.");
      } catch (error: any) {
        const message = String(error?.message || "");
        if (/already registered/i.test(message)) {
          toast.error("This number already has an account. Sign in to link this repair.");
        } else {
          toast.error("Could not create the account. Submitting your request anyway.");
        }
      }
    }

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
        serviceAreaId: serviceAreaId || undefined,
        // Pin only travels with a pickup request — a drop-off has no pickup location.
        pickupLatitude: servicePreference === "home_pickup" ? pickupLatitude ?? undefined : undefined,
        pickupLongitude: servicePreference === "home_pickup" ? pickupLongitude ?? undefined : undefined,
        pickupLocationSource:
          servicePreference === "home_pickup" ? pickupLocationSource ?? undefined : undefined,
      });
      return;
    }

    quoteMutation.mutate({
      // CUSTOMER-SERVICE-INTENT-01A — "Not sure" submits null. Previously this
      // was `services[0]?.id || "general_repair"`, which recorded a service the
      // customer never picked (and a non-existent id) as their request.
      serviceId: serviceId === NOT_SURE_SERVICE ? null : serviceId,
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

  /**
   * Ask staff to verify this customer and issue a one-time setup link.
   *
   * Deliberately does NOT create, activate, or authenticate anything: an
   * anonymous browser submitting a repair request is not proof that it owns the
   * phone number. The response is the same generic acknowledgement whether or
   * not an account exists, so this cannot be used to probe account state.
   */
  const requestOnlineAccess = async () => {
    if (setupRequestState === "sending" || setupRequestState === "sent") return;
    setSetupRequestState("sending");
    try {
      await customerAuthApi.requestRecovery({
        phone: phone.startsWith("+880") ? phone : `+880${normalizePhone(phone)}`,
        name: customerName.trim() || undefined,
        ticketNumber: ticketNumber || undefined,
        message: "Online access requested from the repair confirmation screen.",
      });
      setSetupRequestState("sent");
    } catch {
      // Never block tracking on this — the ticket number above still works.
      setSetupRequestState("error");
    }
  };

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
            {selectedServiceArea && (
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                {t("wizard.areaSuccessPrefix")} {selectedServiceArea.blockOrSector || selectedServiceArea.subareaName || selectedServiceArea.areaName}.
              </p>
            )}
            <div className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs font-medium text-emerald-700">{t("wizard.ticketNumber")}</p>
              <p className="mt-1 font-mono text-xl font-bold text-slate-950">#{ticketNumber}</p>
            </div>
            <PushMomentOfValue portal="customer" t={t} className="mt-5" />

            {/* Online access for anonymous submitters.
              *
              * Intake creates an unclaimed account for this phone so the request
              * has an owner. Registering against it is refused (correctly — an
              * anonymous browser is not proof of phone ownership), which left the
              * customer with no route to an account at all. This asks staff to
              * verify and send a one-time setup link.
              *
              * It never activates anything, never takes a password, and never
              * reveals whether an account already exists. Tracking above keeps
              * working regardless of what happens here. */}
            {!customer && (
              <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left">
                {setupRequestState === "sent" ? (
                  <p className="text-sm leading-6 text-slate-700" data-testid="setup-access-sent">
                    Request sent. Our team will call you to verify your identity and send a
                    one-time account setup link.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-900">Want to track this online?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      We will call you to confirm it is you, then send a one-time setup link.
                    </p>
                    {setupRequestState === "error" && (
                      <p className="mt-2 text-xs font-medium text-amber-700" data-testid="setup-access-error">
                        Could not send that request. You can still track with your ticket number above.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      className="mt-3 h-12 w-full rounded-2xl border-emerald-300 bg-white"
                      disabled={setupRequestState === "sending"}
                      onClick={requestOnlineAccess}
                      data-testid="button-setup-online-access"
                    >
                      {setupRequestState === "sending" ? "Sending…" : "Set up online access"}
                    </Button>
                  </>
                )}
              </div>
            )}

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
            <div className="space-y-5 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              {/* CUSTOMER-SERVICE-INTENT-01A — quote mode only. The customer's
                  pick is advisory; the technician's diagnosis decides the work. */}
              {mode === "quote" && (
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label>{t("wizard.serviceType")}</Label>
                    <span className="truncate text-xs font-bold text-emerald-700">
                      {serviceId === NOT_SURE_SERVICE
                        ? t("wizard.notSureShort")
                        : activeServices.find((s) => s.id === serviceId)?.name ?? t("wizard.notSureShort")}
                    </span>
                  </div>
                  <CarouselSelector
                    ariaLabel={t("wizard.serviceType")}
                    // "Not sure" is first and is the default selection.
                    options={[NOT_SURE_SERVICE, ...activeServices.map((s) => s.id)]}
                    value={serviceId}
                    onSelect={setServiceId}
                    cardClassName="h-[84px] w-[104px]"
                    formatLabel={(option) =>
                      option === NOT_SURE_SERVICE
                        ? t("wizard.notSureService")
                        : activeServices.find((s) => s.id === option)?.name ?? option
                    }
                    renderVisual={(option, selected) => {
                      // Closed registry only — never a dynamic component lookup
                      // from admin-editable text.
                      const Icon =
                        option === NOT_SURE_SERVICE
                          ? HelpCircle
                          : resolveServiceIcon(activeServices.find((s) => s.id === option)?.icon);
                      return (
                        <Icon
                          className={cn("h-5 w-5", selected ? "text-emerald-700" : "text-slate-500")}
                          aria-hidden
                        />
                      );
                    }}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setServiceSearchOpen(true)}
                        className="flex h-[84px] w-[104px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 px-2 text-emerald-700"
                      >
                        <Search className="h-4 w-4" aria-hidden />
                        <span className="text-[12px] font-bold leading-tight">{t("wizard.searchAll")}</span>
                      </button>
                    }
                  />
                  <p className="text-xs leading-snug text-slate-500">{t("wizard.serviceAdvisoryNote")}</p>
                  {serviceId !== NOT_SURE_SERVICE && (() => {
                    const picked = activeServices.find((s) => s.id === serviceId);
                    if (!picked || picked.minPrice == null || picked.maxPrice == null) return null;
                    return (
                      <p className="text-xs font-semibold text-slate-600">
                        {t("wizard.estimatedRange")}: ৳{picked.minPrice} – ৳{picked.maxPrice}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>{t("wizard.brand")}</Label>
                  {brand && <span className="truncate text-xs font-bold text-emerald-700">{brand}</span>}
                </div>
                <CarouselSelector
                  ariaLabel={t("wizard.brand")}
                  options={tvBrands}
                  value={brand}
                  onSelect={setBrand}
                  cardClassName="h-[54px] w-[88px]"
                  // Search lives as the last card in the row rather than its own
                  // full-width bar, so it costs zero extra vertical space and the
                  // card never feels congested.
                  trailing={
                    <button
                      type="button"
                      onClick={() => setBrandSearchOpen(true)}
                      className="flex h-[54px] w-[88px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 px-2 text-emerald-700"
                    >
                      <Search className="h-4 w-4" aria-hidden />
                      <span className="text-[12px] font-bold leading-tight">{t("wizard.searchAll")}</span>
                    </button>
                  }
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>{t("wizard.screenSizeQuestion")}</Label>
                  {screenSize && <span className="truncate text-xs font-bold text-emerald-700">{screenSize}</span>}
                </div>
                <CarouselSelector
                  ariaLabel={t("wizard.screenSizeQuestion")}
                  options={screenSizes}
                  value={screenSize}
                  onSelect={setScreenSize}
                  cardClassName="h-[84px] w-[70px]"
                  // Card shows 43" so it never truncates in a 70px card; the
                  // stored value stays "43 inch" and the heading echoes it in full.
                  formatLabel={(option) => option.replace(/\s*inch$/i, '"')}
                  renderVisual={(option, selected) => <ScreenSizeGlyph option={option} selected={selected} />}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("wizard.model")}</Label>
                <Input value={modelNumber} onChange={(event) => setModelNumber(event.target.value)} className="h-12 rounded-2xl border-emerald-100" placeholder={t("wizard.optional")} />
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
                { id: "home_pickup", title: t("wizard.pickupDrop"), icon: Truck },
                // Was a hardcoded English title with an unused `bn` field, so this
                // option never translated for Bangla users. Use the t() key.
                { id: "service_center", title: t("wizard.dropOff"), icon: MapPin },
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
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("wizard.pickupAddress")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="h-9 gap-1.5 rounded-full border-emerald-200 text-emerald-700"
                  >
                    <MapPin className="h-4 w-4" />
                    {t("pickupPin.open")}
                  </Button>
                </div>
                <Textarea value={address} onChange={(event) => { contactTouched.current = true; setAddress(event.target.value); }} className="min-h-24 rounded-2xl border-emerald-100" placeholder="Area, road, house..." />
                {pickupLatitude != null && pickupLongitude != null && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <MapPin className="h-3.5 w-3.5" />
                    {t("pickupPin.pinned")} ({pickupLatitude.toFixed(5)}, {pickupLongitude.toFixed(5)})
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <Label>{t("wizard.serviceArea")}</Label>
              <Select value={serviceAreaId || "none"} onValueChange={(value) => setServiceAreaId(value === "none" ? "" : value)}>
                <SelectTrigger className="h-12 rounded-xl border-emerald-100"><SelectValue placeholder={t("wizard.serviceArea")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("wizard.noServiceArea")}</SelectItem>
                  {serviceAreas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {[area.blockOrSector, area.subareaName, area.areaName, area.city].filter(Boolean).join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-relaxed text-slate-500">{t("wizard.serviceAreaHint")}</p>
            </div>
          </motion.div>
        )}

        {step === 5 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">{t("wizard.finalStep")}</h1>
              <p className="mt-2 text-sm text-slate-600">{t("wizard.finalDesc")}</p>
            </div>
            {/* A real <form> with autocomplete attributes, so Chrome and iOS
              * offer to save the credential. Without name/autoComplete and a
              * username field next to the password, browsers skip the save
              * prompt entirely and the customer never gets their password
              * remembered. */}
            <form
              className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm"
              onSubmit={(event) => event.preventDefault()}
            >
              <div className="space-y-2">
                <Label htmlFor="wizard-name">{t("wizard.name")}</Label>
                <Input
                  id="wizard-name"
                  name="name"
                  autoComplete="name"
                  value={customerName}
                  onChange={(event) => { contactTouched.current = true; setCustomerName(event.target.value); }}
                  className="h-12 rounded-2xl border-emerald-100"
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-phone">{t("wizard.phone")}</Label>
                <PhoneInput
                  id="wizard-phone"
                  name="username"
                  autoComplete="username"
                  value={phone}
                  onChange={(event) => { contactTouched.current = true; setPhone(event.target.value); }}
                  className="h-12 rounded-2xl border-emerald-100"
                  placeholder="1XXXXXXXXX"
                />
              </div>

              {/* Optional account creation, offered only to signed-out visitors.
                * When a password is given the account is created BEFORE the
                * request is submitted, so intake links to a real account and
                * never creates the unclaimed row that used to block this person
                * from registering with their own number afterwards. */}
              {!customer && (
                <div className="space-y-2 border-t border-emerald-100 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label htmlFor="wizard-password">Create a password (optional)</Label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Set one now and you can track this repair online straight away.
                      </p>
                    </div>
                  </div>
                  <Input
                    id="wizard-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    className="h-12 rounded-2xl border-emerald-100"
                    placeholder="At least 6 characters"
                    data-testid="input-wizard-password"
                  />
                  {accountPassword.length > 0 && accountPassword.length < 6 && (
                    <p className="text-xs font-medium text-amber-700">
                      Password must be at least 6 characters.
                    </p>
                  )}
                </div>
              )}
            </form>
            <div className="rounded-3xl bg-emerald-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">{t("wizard.summary")}</p>
              <p className="mt-2">{brand || "TV"} {screenSize} - {selectedProblem?.en || primaryIssue}</p>
              <p>{servicePreference === "home_pickup" ? t("wizard.pickupDrop") : servicePreference === "service_center" ? t("wizard.dropOff") : t("wizard.callFirst")}</p>
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
            onClick={step === 5 ? () => void submit() : nextStep}
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
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/92 px-6 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="max-w-xs text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <h2 className="mt-5 text-xl font-bold text-slate-950">{t("wizard.submittingTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("wizard.submittingBody")}</p>
          </div>
        </div>
      )}
      {/* CUSTOMER-SERVICE-INTENT-01A — reuses the keyboard-safe overlay: input
          pinned top, results scroll beneath, so the field and several matches
          stay visible above the software keyboard. Searches by service NAME and
          maps the chosen name back to its id. */}
      <SearchPickerOverlay
        open={serviceSearchOpen}
        title={t("wizard.serviceType")}
        placeholder={t("wizard.searchServicePlaceholder")}
        emptyLabel={t("wizard.noServiceMatch")}
        options={activeServices.map((s) => s.name)}
        value={activeServices.find((s) => s.id === serviceId)?.name ?? ""}
        onSelect={(name) => {
          const match = activeServices.find((s) => s.name === name);
          if (match) setServiceId(match.id);
        }}
        onClose={() => setServiceSearchOpen(false)}
      />
      <SearchPickerOverlay
        open={brandSearchOpen}
        title={t("wizard.selectBrand")}
        placeholder={t("wizard.searchBrandPlaceholder")}
        emptyLabel={t("wizard.noBrandMatch")}
        options={tvBrands}
        value={brand}
        onSelect={setBrand}
        onClose={() => setBrandSearchOpen(false)}
      />
      <PickupLocationPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialLatitude={pickupLatitude}
        initialLongitude={pickupLongitude}
        onConfirm={(location) => {
          setPickupLatitude(location.latitude);
          setPickupLongitude(location.longitude);
          setPickupLocationSource(location.source);
          // Append rather than overwrite. OSM rarely knows Dhaka house/flat
          // numbers, so a customer's "House 42, Flat 3B" is better data than the
          // reverse-geocoded line — the rider gets both, typed detail first.
          if (location.address) {
            const resolved = location.address;
            setAddress((current) => mergePinAddress(current, resolved, lastPinAddressRef.current));
            lastPinAddressRef.current = resolved;
          }
          setPickerOpen(false);
        }}
      />
    </main>
  );
}
