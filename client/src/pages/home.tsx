import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Wrench, Package, Users, ChevronLeft, ChevronRight, ShoppingCart, MessageSquare, Calendar, Search, Truck, MapPin, Phone, Mail, Star, HelpCircle, Award, Zap, Heart, Power, MonitorOff, Maximize, VolumeX, WifiOff, AlignJustify, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { images } from "@/lib/mock-data";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { settingsApi, inventoryApi, reviewsApi, customerServiceRequestsApi, shopOrdersApi } from "@/lib/api";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { InventoryItem, CustomerReview } from "@shared/schema";
import { ActiveRepairCard } from "@/components/mobile/ActiveRepairCard";
import { QuickActionsGrid } from "@/components/mobile/QuickActionsGrid";
import { ScrollableList } from "@/components/ui/ScrollableList";
import { MobileHero } from "@/components/mobile/MobileHero";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, value, { duration: 2, ease: "easeOut" });
      return controls.stop;
    }
  }, [isInView, value, count]);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [rounded]);

  return (
    <span ref={ref}>
      {displayValue}{suffix}
    </span>
  );
}

const defaultHeroSlides = [
  images.hero,
  images.showroom,
  images.repair
];

export default function HomePage() {
  usePageTitle();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { addItem } = useCart();
  const [trackTicket, setTrackTicket] = useState("");
  const [, setLocation] = useLocation();
  const { customer } = useCustomerAuth();

  const { data: serviceRequests = [] } = useQuery({
    queryKey: ["customer-service-requests"],
    queryFn: () => customerServiceRequestsApi.getAll(),
    enabled: !!customer,
  });

  const { data: customerOrders = [] } = useQuery({
    queryKey: ["customer-orders"],
    queryFn: () => shopOrdersApi.getAll(),
    enabled: !!customer,
  });

  const recentActivities = useMemo(() => {
    const activities: {
      id: string;
      type: 'order' | 'repair';
      title: string;
      status: string;
      date: string | Date;
      message: string;
      link: string;
    }[] = [];

    // Add Service Requests
    serviceRequests.forEach(req => {
      activities.push({
        id: req.id,
        type: 'repair',
        title: `Repair Service`,
        status: req.trackingStatus,
        date: req.createdAt,
        message: `${req.brand} ${req.modelNumber || ''} - ${req.trackingStatus}`,
        link: `/native/repair/${req.id}`
      });
    });

    // Add Orders
    customerOrders.forEach(order => {
      activities.push({
        id: order.id,
        type: 'order',
        title: `Order #${order.orderNumber || order.id.slice(0, 8)}`,
        status: order.status,
        date: order.createdAt,
        message: `${order.items?.length || 0} items - ${order.status}`,
        link: `/customer/orders/${order.id}` // Assuming this route exists, otherwise generic /shop
      });
    });

    // Sort by Date Descending
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [serviceRequests, customerOrders]);

  const activeTicket = useMemo(() => {
    if (!serviceRequests.length) return null;
    // Prioritize active statuses
    const active = serviceRequests.find(req =>
      !["Closed", "Cancelled", "Delivered", "Completed"].includes(req.status) &&
      !["Delivered", "Cancelled"].includes(req.trackingStatus)
    );
    // If no active, maybe show the most recent one? For now, let's show the most recent active one.
    return active || null;
  }, [serviceRequests]);

  const mapStatusToCardStatus = (status: string): "received" | "diagnosing" | "repairing" | "ready" => {
    const s = status.toLowerCase();
    if (s.includes("diagn") || s.includes("assess")) return "diagnosing";
    if (s.includes("repair") || s.includes("wait") || s.includes("part")) return "repairing";
    if (s.includes("ready") || s.includes("deliver")) return "ready";
    return "received";
  };

  const calculateProgress = (status: string): number => {
    const s = status.toLowerCase();
    if (s.includes("request") || s.includes("arriv") || s.includes("receiv")) return 25;
    if (s.includes("diagn") || s.includes("assess")) return 50;
    if (s.includes("repair") || s.includes("wait") || s.includes("part")) return 75;
    if (s.includes("ready")) return 100;
    return 10;
  };

  const handleTrack = () => {
    if (trackTicket.trim()) {
      setLocation(`/track-order?id=${trackTicket.trim()}`);
    }
  };

  const handleViewDetails = (item: InventoryItem) => {
    setSelectedItem(item);
    setCurrentImageIndex(0);
    setIsDetailOpen(true);
  };

  const handleAddToCart = (item: InventoryItem) => {
    const itemImages = parseImages(item.images);
    addItem({
      productId: item.id,
      name: item.name,
      price: Number(item.price),
      image: itemImages.length > 0 ? itemImages[0] : undefined,
    });
  };

  const { data: settings = [], isLoading: isSettingsLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ["home-inventory"],
    queryFn: inventoryApi.getWebsiteItems,
  });

  const { data: approvedReviews = [] } = useQuery({
    queryKey: ["approved-reviews"],
    queryFn: reviewsApi.getApproved,
  });

  const parseImages = (imagesJson: string | null): string[] => {
    if (!imagesJson) return [];
    try {
      return JSON.parse(imagesJson);
    } catch {
      return [];
    }
  };

  const getSettingValue = (key: string, defaultValue: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const heroTitle = getSettingValue("hero_title", "Expert Care for Your Premium Electronics");
  const heroSubtitle = getSettingValue("hero_subtitle", "We combine expert repair services with a premium marketplace. From 4K TV repairs to authentic parts, Promise Electronics is your integrated solution.");
  const heroAnimationType = getSettingValue("hero_animation_type", "fade");

  const animationVariants = useMemo(() => {
    const variants = {
      fade: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 }
      },
      "slide-left": {
        initial: { opacity: 0, x: 100 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -100 }
      },
      "slide-right": {
        initial: { opacity: 0, x: -100 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 100 }
      },
      "slide-up": {
        initial: { opacity: 0, y: 50 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -50 }
      },
      "slide-down": {
        initial: { opacity: 0, y: -50 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 50 }
      },
      "zoom-in": {
        initial: { opacity: 0, scale: 0.8 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.2 }
      },
      "zoom-out": {
        initial: { opacity: 0, scale: 1.2 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.8 }
      },
      flip: {
        initial: { opacity: 0, rotateY: 90 },
        animate: { opacity: 1, rotateY: 0 },
        exit: { opacity: 0, rotateY: -90 }
      }
    } as const;
    return variants[heroAnimationType as keyof typeof variants] || variants.fade;
  }, [heroAnimationType]);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const heroSlides = useMemo(() => {
    // While settings are loading, return empty to show skeleton
    if (isSettingsLoading) return [];

    const heroImagesSetting = settings.find((s) => s.key === "hero_images");
    if (heroImagesSetting?.value) {
      try {
        const parsed = JSON.parse(heroImagesSetting.value);
        if (Array.isArray(parsed)) {
          const validImages = parsed.filter((url: string) => url && url.trim() !== "");
          if (validImages.length > 0) {
            return validImages;
          }
        }
      } catch (e) {
        console.error("Failed to parse hero images setting");
      }
    }
    return defaultHeroSlides;
  }, [settings, isSettingsLoading]);

  const mobileHeroSlides = useMemo(() => {
    const mobileHeroImagesSetting = settings.find((s) => s.key === "mobile_hero_images");
    if (mobileHeroImagesSetting?.value) {
      try {
        const parsed = JSON.parse(mobileHeroImagesSetting.value);
        if (Array.isArray(parsed)) {
          const validImages = parsed.filter((url: string) => url && url.trim() !== "");
          if (validImages.length > 0) {
            return validImages;
          }
        }
      } catch (e) {
        console.error("Failed to parse mobile hero images setting");
      }
    }
    return [];
  }, [settings]);

  const activeHeroSlides = useMemo(() => {
    if (isMobile && mobileHeroSlides.length > 0) {
      return mobileHeroSlides;
    }
    return heroSlides;
  }, [isMobile, mobileHeroSlides, heroSlides]);

  interface TeamMember {
    id: string;
    name: string;
    role: string;
    photoUrl: string;
    bio?: string;
  }

  const teamMembers = useMemo((): TeamMember[] => {
    const teamSetting = settings.find((s) => s.key === "team_members");
    if (teamSetting?.value) {
      try {
        const parsed = JSON.parse(teamSetting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse team members setting");
      }
    }
    return [];
  }, [settings]);

  const iconMap: Record<string, LucideIcon> = {
    Users,
    Wrench,
    Clock,
    ShieldCheck,
    Star,
    Award,
    Zap,
    Heart,
    Power,
    MonitorOff,
    Maximize,
    VolumeX,
    WifiOff,
    AlignJustify,
    HelpCircle,
  };

  // NEW: Settings Parsing
  const trackRepairEnabled = getSettingValue("home_track_repair_enabled", "true") === "true";

  const problemNavItems = useMemo(() => {
    const setting = settings.find(s => s.key === "home_problems_list");
    if (setting?.value) {
      try { return JSON.parse(setting.value); } catch (e) { console.error("Failed to parse problems list"); }
    }
    return [
      { id: "1", title: "No Power", icon: "Power" },
      { id: "2", title: "No Picture", icon: "MonitorOff" },
      { id: "3", title: "Broken Screen", icon: "Maximize" },
      { id: "4", title: "Sound Issue", icon: "VolumeX" },
      { id: "5", title: "WiFi Issue", icon: "WifiOff" },
      { id: "6", title: "Lines on Screen", icon: "AlignJustify" },
    ];
  }, [settings]);

  const beforeAfterGallery = useMemo(() => {
    const setting = settings.find(s => s.key === "home_before_after_gallery");
    if (setting?.value) {
      try { return JSON.parse(setting.value); } catch (e) { console.error("Failed to parse gallery"); }
    }
    return [];
  }, [settings]);

  const pricingTable = useMemo(() => {
    const setting = settings.find(s => s.key === "home_pricing_table");
    if (setting?.value) {
      try { return JSON.parse(setting.value); } catch (e) { console.error("Failed to parse pricing"); }
    }
    return [
      { id: "1", service: "General Diagnosis", price: "Free", note: "If service is taken" },
      { id: "2", service: "Software Update", price: "500", note: "Starting from" },
      { id: "3", service: "Backlight Repair", price: "1500", note: "Starting from" },
      { id: "4", service: "Motherboard Repair", price: "2500", note: "Starting from" },
    ];
  }, [settings]);

  const googleMapUrl = getSettingValue("home_google_map_url", "");

  interface HomepageStat {
    id: string;
    value: number;
    suffix: string;
    label: string;
    iconName: string;
  }

  const defaultStats: HomepageStat[] = [
    { id: "1", value: 500, suffix: "+", label: "Happy Customers", iconName: "Users" },
    { id: "2", value: 1000, suffix: "+", label: "TVs Repaired", iconName: "Wrench" },
    { id: "3", value: 5, suffix: "+", label: "Years Experience", iconName: "Clock" },
    { id: "4", value: 10, suffix: "+", label: "Expert Technicians", iconName: "ShieldCheck" },
  ];

  const homepageStats = useMemo((): HomepageStat[] => {
    const statsSetting = settings.find((s) => s.key === "homepage_stats");
    if (statsSetting?.value) {
      try {
        const parsed = JSON.parse(statsSetting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse homepage stats setting");
      }
    }
    return defaultStats;
  }, [settings]);

  interface FAQItem {
    id: string;
    question: string;
    answer: string;
  }

  const defaultFAQs: FAQItem[] = [
    { id: "1", question: "How long does a typical repair take?", answer: "Most repairs are completed within 24-48 hours. For complex issues like panel replacements, it may take 3-5 business days. We'll provide an accurate timeline after diagnosis." },
    { id: "2", question: "Do you offer warranty on repairs?", answer: "Yes! All our repairs come with a 90-day warranty covering both parts and labor. If the same issue recurs within this period, we'll fix it free of charge." },
    { id: "3", question: "What brands do you service?", answer: "We service all major TV brands including Samsung, LG, Sony, Panasonic, Philips, Toshiba, TCL, Hisense, and many more. Our technicians are trained on both LCD and LED/OLED technologies." },
    { id: "4", question: "How much does a TV repair cost?", answer: "Repair costs vary depending on the issue. Common repairs range from ৳1,500 to ৳8,000. Panel replacements may cost more. We provide a free diagnosis and transparent quote before any work begins." },
    { id: "5", question: "Do you offer home pickup and delivery?", answer: "Yes, we offer convenient pickup and delivery services across Dhaka. Our team will safely transport your TV to our service center and return it after repair at a nominal fee." },
    { id: "6", question: "What payment methods do you accept?", answer: "We accept cash, bKash, Nagad, bank transfers, and all major credit/debit cards. Payment is only required after your TV is successfully repaired and tested." },
  ];

  const faqItems = useMemo((): FAQItem[] => {
    const faqSetting = settings.find((s) => s.key === "faq_items");
    if (faqSetting?.value) {
      try {
        const parsed = JSON.parse(faqSetting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse FAQ items setting");
      }
    }
    return defaultFAQs;
  }, [settings]);

  interface ContactInfo {
    addressLines: string[];
    phoneNumbers: string[];
    emails: string[];
    workingHoursLines: string[];
    whatsappNumber: string;
  }

  const defaultContactInfo: ContactInfo = {
    addressLines: ["House 12, Road 5", "Dhanmondi, Dhaka 1205", "Bangladesh"],
    phoneNumbers: ["+880 1234-567890", "+880 1234-567891"],
    emails: ["info@promiseelectronics.com", "support@promiseelectronics.com"],
    workingHoursLines: ["Saturday - Thursday", "9:00 AM - 8:00 PM", "Friday: Closed"],
    whatsappNumber: "8801234567890",
  };

  const contactInfo = useMemo((): ContactInfo => {
    const contactSetting = settings.find((s) => s.key === "homepage_contact_info");
    if (contactSetting?.value) {
      try {
        const parsed = JSON.parse(contactSetting.value);
        if (parsed && typeof parsed === "object") {
          return { ...defaultContactInfo, ...parsed };
        }
      } catch (e) {
        console.error("Failed to parse contact info setting");
      }
    }
    return defaultContactInfo;
  }, [settings]);

  const defaultServiceAreas = [
    "Gulshan", "Banani", "Dhanmondi", "Uttara", "Mirpur", "Mohammadpur",
    "Bashundhara", "Baridhara", "Motijheel", "Tejgaon", "Farmgate", "Badda",
    "Rampura", "Khilgaon", "Shyamoli", "Mohakhali", "Lalmatia", "Elephant Road"
  ];

  const serviceAreas = useMemo((): string[] => {
    const areasSetting = settings.find((s) => s.key === "service_areas");
    if (areasSetting?.value) {
      try {
        const parsed = JSON.parse(areasSetting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse service areas setting");
      }
    }
    return defaultServiceAreas;
  }, [settings]);

  interface HomepageBrand {
    id: string;
    name: string;
    logoUrl: string;
  }

  const defaultBrands: HomepageBrand[] = [
    { id: "1", name: "Samsung", logoUrl: "" },
    { id: "2", name: "LG", logoUrl: "" },
    { id: "3", name: "Sony", logoUrl: "" },
    { id: "4", name: "Panasonic", logoUrl: "" },
    { id: "5", name: "Philips", logoUrl: "" },
    { id: "6", name: "Toshiba", logoUrl: "" },
    { id: "7", name: "TCL", logoUrl: "" },
    { id: "8", name: "Hisense", logoUrl: "" },
  ];

  const homepageBrands = useMemo((): HomepageBrand[] => {
    const brandsSetting = settings.find((s) => s.key === "homepage_brands");
    if (brandsSetting?.value) {
      try {
        const parsed = JSON.parse(brandsSetting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse homepage brands setting");
      }
    }
    return defaultBrands;
  }, [settings]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % activeHeroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeHeroSlides.length]);

  useEffect(() => {
    setCurrentSlide(0);
  }, [isMobile]);

  // Mobile Dashboard Logic
  if (isMobile) {
    return (
      <PublicLayout>
        <div className="min-h-screen bg-slate-50 pb-24 pt-4 px-4">
          {/* Mobile Hero */}
          <div className="mb-6 -mx-4">
            {activeHeroSlides.length > 0 ? (
              <MobileHero heroImage={activeHeroSlides[0]} />
            ) : (
              /* Skeleton Loader for Mobile Hero */
              <div className="relative w-full h-[85vh] overflow-hidden bg-slate-200 animate-pulse">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-300/30 via-transparent to-slate-400/50" />
                <div className="absolute bottom-8 left-4 right-4">
                  <div className="bg-slate-300/50 backdrop-blur-xl rounded-3xl p-6">
                    <div className="h-10 bg-slate-400/50 rounded-lg mb-2 w-3/4" />
                    <div className="h-4 bg-slate-400/40 rounded mb-6 w-full" />
                    <div className="h-14 bg-slate-400/60 rounded-xl w-full" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-slate-800">
                Hello, {customer?.name ? customer.name.split(' ')[0] : 'Guest'}
              </h1>
              <p className="text-sm text-slate-500">Welcome to Promise Electronics</p>
            </div>
            <Link href="/my-profile">
              <div className="relative cursor-pointer">
                {(customer as any)?.avatar ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-neumorph bg-slate-100">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${(customer as any).avatar}`}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-100 rounded-full shadow-neumorph text-slate-600 relative">
                    <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-100"></div>
                    <Users className="w-6 h-6" />
                  </div>
                )}
              </div>
            </Link>
          </div>

          {/* Active Repair Card (Real Data) */}
          {activeTicket ? (
            <Link href={`/native/repair/${activeTicket.id}`}>
              <ActiveRepairCard
                device={`${activeTicket.brand} ${activeTicket.modelNumber || ''}`}
                ticketId={activeTicket.ticketNumber || activeTicket.id}
                status={mapStatusToCardStatus(activeTicket.trackingStatus)}
                progress={calculateProgress(activeTicket.trackingStatus)}
              />
            </Link>
          ) : (
            // Fallback or Empty State (Optional: Only show if we want to prompt them)
            null
          )}

          {/* Quick Actions */}
          <QuickActionsGrid />

          {/* Recent Activity / Promo */}
          <div className="mb-6">

            <h3 className="text-lg font-bold text-slate-800 mb-3">Recent Updates</h3>
            {recentActivities.length > 0 ? (
              <ScrollableList className="flex gap-4 pb-4 -mx-4 px-4">
                {recentActivities.map((activity) => (
                  <Link key={`${activity.type}-${activity.id}`} href={activity.link}>
                    <div className="min-w-[240px] bg-slate-100 rounded-xl p-4 shadow-neumorph shrink-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${activity.type === 'repair' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                          }`}>
                          {activity.type === 'repair' ? <Wrench className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700">{activity.title}</p>
                          <p className="text-[10px] text-slate-500">
                            {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2">{activity.message}</p>
                    </div>
                  </Link>
                ))}
              </ScrollableList>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 text-sm">No recent activity</p>
              </div>
            )}
          </div>

          {/* Problem-Based Navigation (Mobile) */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4">What's Wrong?</h3>
            <div className="grid grid-cols-3 gap-3">
              {problemNavItems.slice(0, 6).map((item: any) => {
                const Icon = iconMap[item.icon] || HelpCircle;
                return (
                  <Link key={item.id} href="/repair">
                    <div className="p-3 rounded-xl bg-white shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center gap-2 aspect-square">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-primary">
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt={item.title} className="w-5 h-5 object-contain" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-slate-700 leading-tight">{item.title}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Why Choose Us (Mobile) */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Why Choose Us?</h3>
            <div className="space-y-3">
              {[
                { icon: ShieldCheck, title: "Certified Experts", desc: "Factory-trained technicians" },
                { icon: Clock, title: "Fast Service", desc: "24-48 hour turnaround" },
                { icon: CheckCircle2, title: "Genuine Parts", desc: "Authentic parts warranty" }
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{feature.title}</h4>
                    <p className="text-xs text-slate-500">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {/* Mobile Hero Section */}
      <div className="md:hidden">
        {activeHeroSlides.length > 0 ? (
          <MobileHero heroImage={activeHeroSlides[0]} />
        ) : (
          /* Skeleton Loader */
          <div className="relative w-full h-[85vh] overflow-hidden bg-slate-200 animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-300/30 via-transparent to-slate-400/50" />
            <div className="absolute bottom-8 left-4 right-4">
              <div className="bg-slate-300/50 backdrop-blur-xl rounded-3xl p-6">
                <div className="h-10 bg-slate-400/50 rounded-lg mb-2 w-3/4" />
                <div className="h-4 bg-slate-400/40 rounded mb-6 w-full" />
                <div className="h-14 bg-slate-400/60 rounded-xl w-full" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Hero Section - Split Layout */}
      <section className="hidden md:block relative bg-gradient-to-br from-slate-50 via-white to-slate-100 overflow-hidden">
        <div className="container mx-auto px-4 py-12 md:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left Side - Text Content */}
            <motion.div
              className="space-y-6 order-2 lg:order-1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7 }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 px-4 py-1.5 text-sm font-medium">
                #1 Trusted Electronics Service in Bangladesh
              </Badge>
              <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-heading font-bold leading-tight text-slate-900">
                {heroTitle.includes("Premium Electronics") ? (
                  <>
                    {heroTitle.split("Premium Electronics")[0]}
                    <span className="text-primary">Premium Electronics</span>
                    {heroTitle.split("Premium Electronics")[1]}
                  </>
                ) : (
                  heroTitle
                )}
              </h1>
              <p className="text-base md:text-lg text-slate-600 leading-relaxed max-w-xl">
                {heroSubtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link href="/repair">
                  <Button size="lg" className="text-sm md:text-lg h-12 md:h-14 px-6 md:px-8 shadow-lg shadow-primary/25 w-full sm:w-auto">
                    <Wrench className="mr-2 h-5 w-5" /> Book Repair Service
                  </Button>
                </Link>
                <Link href="/shop">
                  <Button size="lg" variant="outline" className="text-sm md:text-lg h-12 md:h-14 px-6 md:px-8 border-slate-300 hover:bg-slate-100 text-slate-800 w-full sm:w-auto">
                    Browse Shop <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>

              {/* Track Repair Widget */}
              {trackRepairEnabled && (
                <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm rounded-xl shadow-neumorph-sm border border-slate-200 max-w-md">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Check Repair Status</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter Ticket Number (e.g. TR-1234)"
                      className="flex-1 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      value={trackTicket}
                      onChange={(e) => setTrackTicket(e.target.value)}
                    />
                    <Button onClick={handleTrack} disabled={!trackTicket.trim()}>
                      Track
                    </Button>
                  </div>
                </div>
              )}

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center gap-3 pt-6 text-sm">
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">90-Day Warranty</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">Certified Technicians</span>
                </div>
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1.5 rounded-full">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="font-medium">Fast Turnaround</span>
                </div>
              </div>
            </motion.div>

            {/* Right Side - Hero Image */}
            <motion.div
              className="relative order-1 lg:order-2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-slate-300/50">
                {activeHeroSlides.length > 0 ? (
                  <>
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={`${isMobile ? 'mobile' : 'desktop'}-${currentSlide}`}
                        src={activeHeroSlides[currentSlide]}
                        alt="Electronics Workshop"
                        className="w-full h-64 md:h-80 lg:h-[450px] object-cover"
                        initial={animationVariants.initial}
                        animate={animationVariants.animate}
                        exit={animationVariants.exit}
                        transition={{ duration: 0.8, ease: "easeInOut" }}
                      />
                    </AnimatePresence>
                    {/* Slide Navigation Dots */}
                    {activeHeroSlides.length > 1 && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {activeHeroSlides.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setCurrentSlide(index)}
                            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${currentSlide === index
                              ? 'bg-white w-8'
                              : 'bg-white/50 hover:bg-white/75'
                              }`}
                            aria-label={`Go to slide ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Skeleton Loader for Desktop Hero */
                  <div className="w-full h-64 md:h-80 lg:h-[450px] bg-slate-200 animate-pulse">
                    <div className="w-full h-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-200 relative overflow-hidden">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    </div>
                  </div>
                )}
              </div>
              {/* Decorative Elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            </motion.div>
          </div>
        </div>
      </section >

      {/* Problem-Based Navigation */}
      < section className="py-16 bg-white" >
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-heading font-bold text-slate-900 mb-4">What's Wrong With Your TV?</h2>
            <p className="text-slate-600">Select your issue to find the right solution</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {problemNavItems.map((item: any) => {
              const Icon = iconMap[item.icon] || HelpCircle;
              return (
                <Link key={item.id} href="/repair">
                  <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 hover:shadow-neumorph hover:-translate-y-1 transition-all duration-300 cursor-pointer text-center group">
                    <div className="w-12 h-12 mx-auto mb-4 bg-white rounded-full shadow-sm flex items-center justify-center overflow-hidden text-slate-500 group-hover:text-primary transition-colors">
                      {item.iconUrl ? (
                        <img src={item.iconUrl} alt={item.title} className="w-8 h-8 object-contain" />
                      ) : (
                        <Icon className="w-6 h-6" />
                      )}
                    </div>
                    <h3 className="font-medium text-slate-900 group-hover:text-primary transition-colors">{item.title}</h3>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section >

      {/* Stats Counter Section */}
      < section className="py-20 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50" >
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {homepageStats.map((stat, i) => {
              const IconComponent = iconMap[stat.iconName] || Users;
              return (
                <motion.div
                  key={stat.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <Card className="border-none bg-slate-100 shadow-neumorph hover:shadow-neumorph-inset transition-all duration-300 text-center">
                    <CardContent className="pt-6 pb-6 px-4">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-white shadow-neumorph-inset rounded-xl flex items-center justify-center mx-auto mb-4 text-primary">
                        <IconComponent className="h-6 w-6 md:h-7 md:w-7" />
                      </div>
                      <div className="text-2xl md:text-4xl font-bold text-primary mb-1">
                        <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                      </div>
                      <p className="text-xs md:text-sm text-muted-foreground font-medium">{stat.label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section >

      {/* Services Section - Neumorphic */}
      < section className="py-20 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100" >
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">Why Choose Promise Electronics?</h2>
            <p className="text-muted-foreground">We bring professionalism and transparency to the electronics service industry.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: "Certified Technicians",
                desc: "Our team consists of factory-trained experts specializing in major global brands."
              },
              {
                icon: Clock,
                title: "Quick Turnaround",
                desc: "Priority service options available with 24-48 hour delivery for urgent repairs."
              },
              {
                icon: CheckCircle2,
                title: "Genuine Parts",
                desc: "We use only authentic replacement parts with warranty coverage on all repairs."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
              >
                <Card className="border-none bg-slate-100 shadow-neumorph hover:shadow-neumorph-inset transition-all duration-300 group">
                  <CardContent className="pt-4 pb-4 px-3 md:pt-8 md:pb-8 md:px-6 text-center">
                    <div className="w-10 h-10 md:w-16 md:h-16 bg-white shadow-neumorph-inset rounded-xl md:rounded-2xl flex items-center justify-center mx-auto mb-3 md:mb-6 text-primary group-hover:shadow-neumorph transition-shadow">
                      <feature.icon className="h-5 w-5 md:h-8 md:w-8" />
                    </div>
                    <h3 className="text-base md:text-xl font-bold mb-2 md:mb-3">{feature.title}</h3>
                    <p className="text-xs md:text-base text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section >

      {/* Before & After Gallery */}
      {
        beforeAfterGallery.length > 0 && (
          <section className="py-20 bg-slate-900 text-white overflow-hidden">
            <div className="container mx-auto px-4">
              <div className="text-center mb-16">
                <Badge className="bg-primary text-white mb-4 hover:bg-primary">Real Results</Badge>
                <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4">See The Difference</h2>
                <p className="text-slate-400">We bring dead TVs back to life. Check out our recent repairs.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {beforeAfterGallery.map((item: any) => (
                  <div key={item.id} className="bg-slate-800 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
                    <div className="grid grid-cols-2 relative">
                      <div className="relative group">
                        <img src={item.beforeImage} alt="Before" className="w-full h-48 md:h-64 object-cover" />
                        <div className="absolute top-4 left-4 bg-red-500/90 text-white text-xs font-bold px-2 py-1 rounded">BEFORE</div>
                      </div>
                      <div className="relative group">
                        <img src={item.afterImage} alt="After" className="w-full h-48 md:h-64 object-cover" />
                        <div className="absolute top-4 right-4 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded">AFTER</div>
                      </div>
                      {/* Divider Line */}
                      <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/20 -translate-x-1/2 z-10">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                          <ArrowRight className="w-4 h-4 text-slate-900" />
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span>Successfully Repaired & Delivered</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )
      }

      {/* Pricing Table */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="bg-slate-100 text-slate-800 border-slate-200 mb-4 hover:bg-slate-200">Transparent Pricing</Badge>
              <h2 className="text-3xl md:text-4xl font-heading font-bold text-slate-900 mb-6">No Hidden Charges.<br />Fair & Honest Repair Costs.</h2>
              <p className="text-slate-600 text-lg mb-8">
                We believe in complete transparency. You'll know exactly what you're paying for before we start any work. Diagnosis is always free if you choose to repair with us.
              </p>
              <div className="flex gap-4">
                <Link href="/repair">
                  <Button size="lg" className="shadow-lg shadow-primary/20">Get a Free Quote</Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline">Contact Us</Button>
                </Link>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 shadow-neumorph overflow-hidden">
              <div className="p-6 bg-slate-100 border-b border-slate-200">
                <h3 className="font-bold text-xl text-slate-800">Common Service Rates</h3>
              </div>
              <div className="divide-y divide-slate-200">
                {pricingTable.map((item: any) => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                    <div>
                      <h4 className="font-medium text-slate-900">{item.service}</h4>
                      {item.note && <p className="text-xs text-slate-500">{item.note}</p>}
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-primary text-lg">৳{item.price}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500">
                * Final price depends on specific model and parts required.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">How It Works</h2>
            <p className="text-muted-foreground">Get your TV repaired in 4 simple steps</p>
          </motion.div>

          <div className="relative">
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent -translate-y-1/2" />
            <div className="grid md:grid-cols-4 gap-8 relative">
              {[
                { step: 1, icon: Calendar, title: "Book Online", desc: "Schedule your repair request through our website or call us directly." },
                { step: 2, icon: Search, title: "Expert Diagnosis", desc: "Our technicians diagnose the issue and provide a transparent quote." },
                { step: 3, icon: Wrench, title: "Professional Repair", desc: "We repair your TV using genuine parts with skilled expertise." },
                { step: 4, icon: Truck, title: "Fast Delivery", desc: "Your repaired TV is delivered back to you with warranty." },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  className="text-center relative"
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                >
                  <div className="relative inline-block mb-6">
                    <div className="w-20 h-20 bg-slate-100 shadow-neumorph rounded-2xl flex items-center justify-center mx-auto text-primary">
                      <item.icon className="h-10 w-10" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                      {item.step}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{item.desc}</p>
                  {i < 3 && (
                    <div className="hidden md:block absolute top-10 -right-4 text-primary/40">
                      <ArrowRight className="h-6 w-6" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Brands We Service Section */}
      <section className="py-20 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 overflow-hidden">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">Brands We Service</h2>
            <p className="text-muted-foreground">Expert repair services for all major TV brands</p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-slate-100 to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-slate-100 to-transparent z-10 pointer-events-none" />
            <motion.div
              className="flex gap-8 md:gap-12"
              animate={{ x: [0, -(homepageBrands.length * 160)] }}
              transition={{ duration: Math.max(homepageBrands.length * 4, 20), repeat: Infinity, ease: "linear" }}
            >
              {[...Array(2)].map((_, setIndex) => (
                <div key={setIndex} className="flex gap-8 md:gap-12 flex-shrink-0">
                  {homepageBrands.map((brand, i) => (
                    <div
                      key={`${setIndex}-${brand.id}`}
                      className="flex-shrink-0 w-32 md:w-40 h-20 bg-white shadow-neumorph-sm rounded-xl flex items-center justify-center hover:shadow-neumorph transition-shadow overflow-hidden"
                      data-testid={`brand-carousel-${brand.id}`}
                    >
                      {brand.logoUrl ? (
                        <img
                          src={brand.logoUrl}
                          alt={brand.name}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <span className="text-lg md:text-xl font-bold text-slate-600 tracking-wide">{brand.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Featured Products - Neumorphic */}
      {
        inventoryItems.length > 0 && (
          <section className="py-20 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
            <div className="container mx-auto px-4">
              <motion.div
                className="flex justify-between items-end mb-12"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <div>
                  <h2 className="text-3xl font-heading font-bold text-foreground mb-2">Featured Products</h2>
                  <p className="text-muted-foreground">Latest electronics and accessories from our collection</p>
                </div>
                <Link href="/shop">
                  <Button variant="link" className="text-primary shadow-neumorph-sm px-4 py-2 rounded-full bg-white">View All Products &rarr;</Button>
                </Link>
              </motion.div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {inventoryItems.slice(0, 4).map((item, index) => {
                  const itemImages = parseImages(item.images);
                  const firstImage = itemImages.length > 0 ? itemImages[0] : null;

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="group overflow-hidden bg-slate-100 shadow-neumorph hover:shadow-neumorph-lg transition-all duration-300 border-none">
                        <div className="aspect-[4/3] overflow-hidden bg-white m-2 md:m-3 rounded-lg md:rounded-xl shadow-neumorph-inset p-2 md:p-4 flex items-center justify-center relative">
                          {firstImage ? (
                            <img
                              src={firstImage}
                              alt={item.name}
                              className="object-contain h-full w-full group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Package className="h-8 w-8 md:h-12 md:w-12 text-muted-foreground" />
                          )}
                          <div className="absolute top-1 left-1 md:top-2 md:left-2 bg-yellow-400 text-yellow-950 text-[10px] md:text-xs font-bold px-1.5 py-0.5 md:px-2 md:py-1 rounded">
                            In Stock
                          </div>
                        </div>
                        <CardContent className="p-2 md:p-4">
                          <div className="text-[9px] md:text-xs text-muted-foreground mb-0.5 md:mb-1">{item.category}</div>
                          <h3 className="font-bold text-xs md:text-base text-foreground line-clamp-2 mb-1 md:mb-2 min-h-[2.5rem] md:h-12 group-hover:text-primary transition-colors">
                            {item.name}
                          </h3>
                          <div className="flex items-baseline gap-0.5 md:gap-1 mb-1.5 md:mb-3">
                            <span className="text-xs md:text-lg font-bold text-primary">৳{Number(item.price).toLocaleString()}</span>
                            <span className="text-[8px] md:text-xs text-muted-foreground">/ unit</span>
                          </div>
                          <Button
                            className="w-full text-[10px] md:text-sm h-7 md:h-10 px-2 md:px-4 bg-slate-900 hover:bg-slate-800 shadow-neumorph hover:shadow-neumorph-inset"
                            onClick={() => handleViewDetails(item)}
                            data-testid={`button-view-details-${item.id}`}
                          >
                            View Details
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        )
      }

      {/* Meet the Experts */}
      {
        teamMembers.length > 0 && (
          <section className="py-20 bg-white">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-2xl mx-auto mb-16">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-4">Meet Our Experts</h2>
                <p className="text-slate-600">The skilled hands behind every successful repair</p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {teamMembers.map((member) => (
                  <div key={member.id} className="group text-center">
                    <div className="relative mb-6 mx-auto w-48 h-48 rounded-full overflow-hidden shadow-neumorph ring-4 ring-slate-50 group-hover:ring-primary/20 transition-all duration-300">
                      <img
                        src={member.photoUrl || "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&h=400&fit=crop"}
                        alt={member.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">{member.name}</h3>
                    <p className="text-primary font-medium text-sm mb-3">{member.role}</p>
                    {member.bio && <p className="text-slate-500 text-sm line-clamp-2">{member.bio}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )
      }

      {/* Customer Testimonials Section */}
      <section className="py-20 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">What Our Customers Say</h2>
            <p className="text-muted-foreground">Trusted by hundreds of satisfied customers across Dhaka</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {(approvedReviews.length > 0 ? approvedReviews.slice(0, 6) : [
              { id: "1", customerName: "Rahman Chowdhury", rating: 5, content: "Excellent service! My Samsung TV was repaired within 24 hours. Very professional team and transparent pricing. Highly recommended!", title: null, customerId: "", isApproved: true, createdAt: new Date() },
              { id: "2", customerName: "Fatima Begum", rating: 5, content: "My LG TV had a screen issue and I thought it was gone. Promise Electronics fixed it at a fraction of the replacement cost. Amazing work!", title: null, customerId: "", isApproved: true, createdAt: new Date() },
              { id: "3", customerName: "Kamal Ahmed", rating: 5, content: "Fast pickup and delivery service. The technician explained everything clearly before the repair. Great customer service throughout.", title: null, customerId: "", isApproved: true, createdAt: new Date() },
            ] as CustomerReview[]).map((review, i) => {
              const initials = review.customerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              return (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, duration: 0.5 }}
                  data-testid={`review-card-${review.id}`}
                >
                  <Card className="border-none bg-slate-100 shadow-neumorph hover:shadow-neumorph-inset transition-all duration-300 h-full">
                    <CardContent className="pt-6 pb-6 px-6">
                      <div className="flex gap-1 mb-4">
                        {[...Array(review.rating)].map((_, starIndex) => (
                          <Star key={starIndex} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        ))}
                        {[...Array(5 - review.rating)].map((_, starIndex) => (
                          <Star key={`empty-${starIndex}`} className="h-5 w-5 text-gray-300" />
                        ))}
                      </div>
                      {review.title && <p className="font-semibold text-sm mb-2">{review.title}</p>}
                      <p className="text-sm text-muted-foreground leading-relaxed mb-6 italic">"{review.content}"</p>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{review.customerName}</p>
                          <p className="text-xs text-muted-foreground">Verified Customer</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Service Areas Section */}
      <section className="py-20 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">We Serve All Over Dhaka & Beyond</h2>
            <p className="text-muted-foreground">Pickup and delivery services available in all major areas</p>
          </motion.div>

          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {serviceAreas.map((area, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03, duration: 0.3 }}
                className="bg-white shadow-neumorph-sm rounded-lg px-4 py-3 flex items-center gap-2 hover:shadow-neumorph transition-shadow"
              >
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700">{area}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Our Team Section - Photo Collage Animation */}
      <section className="py-20 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 overflow-hidden">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 bg-white shadow-neumorph-sm text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Users className="h-4 w-4" />
              Meet Our Experts
            </div>
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">Our Team</h2>
            <p className="text-muted-foreground">
              The skilled professionals behind Promise Electronics, dedicated to delivering excellence in every repair.
            </p>
          </motion.div>

          {/* Photo Collage Stack Animation */}
          <div className="relative max-w-4xl mx-auto h-[400px] md:h-[500px]">
            {/* Stacking photo frames with animation */}
            {(teamMembers.length > 0 ? teamMembers.slice(0, 5) : Array(5).fill(null)).map((member, index) => {
              const positions = [
                { x: '5%', y: '10%', rotate: -12, scale: 0.9 },
                { x: '60%', y: '5%', rotate: 8, scale: 0.85 },
                { x: '15%', y: '50%', rotate: -6, scale: 0.88 },
                { x: '55%', y: '45%', rotate: 10, scale: 0.92 },
                { x: '35%', y: '25%', rotate: -3, scale: 1 },
              ];
              const pos = positions[index];

              return (
                <motion.div
                  key={member?.id || index}
                  className="absolute w-32 h-40 md:w-44 md:h-56 bg-white rounded-lg shadow-neumorph-lg overflow-hidden"
                  style={{ left: pos.x, top: pos.y }}
                  initial={{ opacity: 0, scale: 0.5, rotate: pos.rotate - 20, y: 100 }}
                  whileInView={{
                    opacity: 1,
                    scale: pos.scale,
                    rotate: pos.rotate,
                    y: 0
                  }}
                  viewport={{ once: true }}
                  transition={{
                    delay: index * 0.15,
                    duration: 0.6,
                    type: "spring",
                    stiffness: 100
                  }}
                  whileHover={{
                    scale: pos.scale + 0.1,
                    rotate: 0,
                    zIndex: 50,
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)"
                  }}
                  data-testid={`team-photo-frame-${index}`}
                >
                  {/* Polaroid style frame */}
                  <div className="h-[70%] bg-slate-200 flex items-center justify-center overflow-hidden">
                    {member?.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                        <Users className="w-10 h-10 md:w-12 md:h-12 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="h-[30%] p-2 md:p-3 flex flex-col justify-center">
                    <p className="font-bold text-xs md:text-sm text-slate-800 truncate">
                      {member?.name || 'Team Member'}
                    </p>
                    <p className="text-[10px] md:text-xs text-slate-500 truncate">
                      {member?.role || 'Position'}
                    </p>
                  </div>
                </motion.div>
              );
            })}

            {/* Decorative floating elements */}
            <motion.div
              className="absolute -bottom-4 -left-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="absolute -top-4 -right-4 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl pointer-events-none"
              animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.3, 0.5] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-20 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-white shadow-neumorph-sm text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
              <HelpCircle className="h-4 w-4" />
              FAQ
            </div>
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">Find answers to common questions about our services</p>
          </motion.div>

          <motion.div
            className="max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="border-none bg-slate-100 shadow-neumorph">
              <CardContent className="pt-6 pb-6 px-6">
                <Accordion type="single" collapsible className="w-full">
                  {faqItems.map((faq, i) => (
                    <AccordionItem key={faq.id} value={`item-${i}`} className="border-b border-slate-200/50">
                      <AccordionTrigger className="text-left font-medium py-4 hover:no-underline hover:text-primary">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed pb-4">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center max-w-2xl mx-auto mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl font-heading font-bold text-foreground mb-4">Get In Touch</h2>
            <p className="text-muted-foreground">Have questions? Contact us through any of these channels</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: MapPin,
                title: "Our Address",
                lines: contactInfo.addressLines
              },
              {
                icon: Phone,
                title: "Phone",
                lines: contactInfo.phoneNumbers
              },
              {
                icon: Mail,
                title: "Email",
                lines: contactInfo.emails
              },
              {
                icon: Clock,
                title: "Working Hours",
                lines: contactInfo.workingHoursLines
              },
            ].map((contact, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <Card className="border-none bg-slate-100 shadow-neumorph hover:shadow-neumorph-inset transition-all duration-300 text-center h-full">
                  <CardContent className="pt-6 pb-6 px-4">
                    <div className="w-14 h-14 bg-white shadow-neumorph-inset rounded-xl flex items-center justify-center mx-auto mb-4 text-primary">
                      <contact.icon className="h-7 w-7" />
                    </div>
                    <h3 className="font-bold text-lg mb-3">{contact.title}</h3>
                    {contact.lines.map((line, lineIndex) => (
                      <p key={lineIndex} className="text-sm text-muted-foreground">{line}</p>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="flex justify-center mt-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a
              href={`https://wa.me/${contactInfo.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white h-12 px-6 rounded-full shadow-lg">
                <MessageSquare className="h-5 w-5 mr-2" />
                Chat on WhatsApp
              </Button>
            </a>
          </motion.div>
        </div>
      </section>

      {/* CTA Section - Neumorphic with Parallax */}
      <section className="py-24 bg-gradient-to-br from-primary via-primary/95 to-primary relative overflow-hidden">
        <motion.div
          className="container mx-auto px-4 relative z-10 text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-6">
            Have a Broken TV? Don't Throw It Away!
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto mb-10">
            Get a free diagnosis today. Our experts can fix 95% of display and power issues for a fraction of the cost of a new device.
          </p>
          <Link href="/repair">
            <Button size="lg" variant="secondary" className="h-10 md:h-14 px-4 md:px-8 text-sm md:text-lg font-bold shadow-sm md:shadow-neumorph-lg active:shadow-neumorph-inset md:hover:shadow-neumorph-inset transition-shadow rounded-full">
              Start Repair Request
            </Button>
          </Link>
        </motion.div>
        {/* Background decorative circles with parallax effect */}
        <motion.div
          className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl pointer-events-none"
          initial={{ scale: 0.8 }}
          whileInView={{ scale: 1.2 }}
          viewport={{ once: true }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-96 h-96 bg-black/10 rounded-full translate-x-1/3 translate-y-1/3 blur-3xl pointer-events-none"
          initial={{ scale: 1 }}
          whileInView={{ scale: 1.3 }}
          viewport={{ once: true }}
          transition={{ duration: 3, repeat: Infinity, repeatType: "reverse", delay: 0.5 }}
        />
      </section>

      {/* Product Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedItem ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedItem.name}</DialogTitle>
                <DialogDescription>
                  {selectedItem.description || "View product information and images"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {(() => {
                    const itemImages = parseImages(selectedItem.images);
                    return itemImages.length > 0 ? (
                      <>
                        <div className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden">
                          <img
                            src={itemImages[currentImageIndex]}
                            alt={`${selectedItem.name} - Image ${currentImageIndex + 1}`}
                            className="w-full h-full object-contain"
                          />
                          {itemImages.length > 1 && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80"
                                onClick={() => setCurrentImageIndex((i) => (i === 0 ? itemImages.length - 1 : i - 1))}
                                data-testid="button-prev-image"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80"
                                onClick={() => setCurrentImageIndex((i) => (i === itemImages.length - 1 ? 0 : i + 1))}
                                data-testid="button-next-image"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                        {itemImages.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {itemImages.map((img, i) => (
                              <button
                                key={i}
                                onClick={() => setCurrentImageIndex(i)}
                                className={`w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${i === currentImageIndex ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-slate-300"
                                  }`}
                                data-testid={`thumbnail-${i}`}
                              >
                                <img src={img} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="aspect-square bg-slate-100 rounded-lg flex items-center justify-center">
                        <Package className="h-20 w-20 text-muted-foreground" />
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Category</p>
                    <Badge variant="outline">{selectedItem.category}</Badge>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Price</p>
                    <p className="text-2xl font-bold text-primary">৳{Number(selectedItem.price).toLocaleString()}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Availability</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={selectedItem.status === "Out of Stock" ? "destructive" : selectedItem.status === "Low Stock" ? "secondary" : "outline"}
                        className={selectedItem.status === "Low Stock" ? "bg-orange-100 text-orange-700" : ""}
                      >
                        {selectedItem.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">({selectedItem.stock} units)</span>
                    </div>
                  </div>

                  {selectedItem.description && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Description</p>
                      <p className="text-sm">{selectedItem.description}</p>
                    </div>
                  )}

                  <div className="pt-4 space-y-3">
                    {selectedItem.itemType === "service" ? (
                      <Button
                        className="w-full bg-teal-600 hover:bg-teal-700"
                        size="lg"
                        onClick={() => {
                          setIsDetailOpen(false);
                          window.location.href = "/repair";
                        }}
                        data-testid="button-get-quote-detail"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" /> Get Quote
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={selectedItem.status === "Out of Stock"}
                        onClick={() => {
                          handleAddToCart(selectedItem);
                          setIsDetailOpen(false);
                        }}
                        data-testid="button-add-to-cart-detail"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart
                      </Button>
                    )}
                    <p className="text-xs text-center text-muted-foreground">
                      {selectedItem.itemType === "service" ? "Request a free service quote" : "Cash on Delivery available"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
              <DialogDescription>Loading product information...</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
      {/* Google Map Section */}
      {
        googleMapUrl && (
          <section className="h-[400px] w-full bg-slate-100 relative">
            <iframe
              src={googleMapUrl}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="grayscale hover:grayscale-0 transition-all duration-500"
            ></iframe>
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-4 rounded-xl shadow-lg max-w-xs hidden md:block">
              <h3 className="font-bold text-slate-900 mb-1">Visit Our Center</h3>
              <p className="text-sm text-slate-600 mb-2">{contactInfo.addressLines.join(", ")}</p>
              <Button size="sm" className="w-full" asChild>
                <a href={googleMapUrl} target="_blank" rel="noopener noreferrer">Get Directions</a>
              </Button>
            </div>
          </section>
        )
      }
    </PublicLayout >
  );
}
