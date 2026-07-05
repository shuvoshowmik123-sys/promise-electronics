import { useState, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Settings, Globe, PenTool, Users, Database, Save,
    Smartphone, FileText, MessageSquare, Loader2,
    Search, X, Wrench, Star, Upload, LayoutTemplate, Building2, Clock3, PlayCircle,
    Shield, AlertTriangle, Code2, ChevronRight, ChevronDown, Percent,
    Phone, MapPin, Clock, Trash2, ShoppingBag, Tv, Ruler, AlertCircle, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { drawerApi, settingsApi } from "@/lib/api";
import { containerVariants, itemVariants, MobileScrollContent, MobileTabHeader, MobileTabLayout, MobileMarqueeText, MobileSegmentTabs } from "../shared";
import { BentoCard } from "../shared/BentoCard";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";

// Sections
import GeneralSection from "./settings/GeneralSection";
import ServiceConfigSection from "./settings/ServiceConfigSection";
import type { InfoBox, HomepageStat, FAQItem, ContactInfo, HomepageBrand, ProblemNavItem, BeforeAfterItem, PricingItem } from "./settings/CmsHomeSection";
import type { TeamMember } from "./settings/AboutUsSection";
const CmsHomeSection = lazy(() => import("./settings/CmsHomeSection"));
const AboutUsSection = lazy(() => import("./settings/AboutUsSection"));
const BulkImportSection = lazy(() => import("./settings/BulkImportSection"));
const ServiceConfigEditor = lazy(() => import("./settings/ServiceConfigEditor").then(m => ({ default: m.ServiceConfigEditor })));
import { TagListCard } from "./settings/TagListCard";

function BodyPortal({ children }: { children: React.ReactNode }) {
    if (typeof document === "undefined") return null;
    return createPortal(children, document.body);
}

interface SettingsTabProps {
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
}

function resolveSettingsDestination(query: string): { sheet?: 'identity' | 'finance' | 'catalog'; panel?: string } {
    const normalized = query.toLowerCase();
    if (/(logo|company|site|phone|contact|business|identity|profile)/.test(normalized)) return { sheet: "identity" };
    if (/(vat|tax|currency|timezone|drawer|day.?end|pos|invoice|payment|bkash|nagad)/.test(normalized)) return { sheet: "finance" };
    if (/(service|category|brand|inch|symptom|catalog|stock|shop)/.test(normalized)) return { sheet: "catalog" };
    if (/(home|homepage|hero|faq|pricing|banner|cms|website)/.test(normalized)) return { panel: "cmshome" };
    if (/(about|team|mission|vision|address)/.test(normalized)) return { panel: "about" };
    if (/(import|bulk|csv|data setup)/.test(normalized)) return { panel: "bulkimport" };
    return {};
}

export default function SettingsTab({ initialSearchQuery, onSearchConsumed }: SettingsTabProps = {}) {
    const { toast } = useToast();

    // Sheet State Management
    const [activeSheet, setActiveSheet] = useState<'identity' | 'finance' | 'catalog' | null>(null);

    // Listen for custom events from the read-only summary cards to open the correct sheet
    useEffect(() => {
        const handleOpenSheet = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (['identity', 'finance', 'catalog'].includes(customEvent.detail)) {
                setActiveSheet(customEvent.detail as any);
            }
        };
        document.addEventListener('open-sheet', handleOpenSheet);
        return () => document.removeEventListener('open-sheet', handleOpenSheet);
    }, []);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // --- General Section State ---
    const [siteName, setSiteName] = useState("");
    const [supportPhone, setSupportPhone] = useState("");
    const [serviceCenterContact, setServiceCenterContact] = useState("");
    const [businessHours, setBusinessHours] = useState("");
    const [currencySymbol, setCurrencySymbol] = useState("৳");
    const [vatPercentage, setVatPercentage] = useState("0");
    const [timezone, setTimezone] = useState("asia-dhaka");
    const [logoUrl, setLogoUrl] = useState("");
    // Customer Send Money (bKash/Nagad) numbers shown on the track page
    const [bkashSendMoney, setBkashSendMoney] = useState("");
    const [nagadSendMoney, setNagadSendMoney] = useState("");
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [allowRegistrations, setAllowRegistrations] = useState(true);
    const [developerMode, setDeveloperMode] = useState(false);
    const [drawerDayCloseEnabled, setDrawerDayCloseEnabled] = useState(true);
    const [drawerDayCloseTime, setDrawerDayCloseTime] = useState("23:59");
    const [drawerDayCloseTimezone, setDrawerDayCloseTimezone] = useState("Asia/Dhaka");
    const [runningDayCloseNow, setRunningDayCloseNow] = useState(false);

    // --- Service Config State ---
    const [serviceCategories, setServiceCategories] = useState<string[]>([]);
    const [shopCategories, setShopCategories] = useState<string[]>([]);
    const [tvBrands, setTvBrands] = useState<string[]>([]);
    const [tvInches, setTvInches] = useState<string[]>([]); // Renamed from tvSizes to match prop
    const [commonSymptoms, setCommonSymptoms] = useState<string[]>([]);
    const [serviceFilterCategories, setServiceFilterCategories] = useState<string[]>([]);

    // --- CMS / Home State ---
    const [heroTitle, setHeroTitle] = useState("");
    const [heroSubtitle, setHeroSubtitle] = useState("");
    const [heroAnimationType, setHeroAnimationType] = useState("fade");
    const [heroImages, setHeroImages] = useState<string[]>(["", "", ""]);
    const [mobileHeroImages, setMobileHeroImages] = useState<string[]>(["", "", ""]);

    const [infoBoxes, setInfoBoxes] = useState<InfoBox[]>([]);
    const [homepageStats, setHomepageStats] = useState<HomepageStat[]>([]);
    const [faqItems, setFaqItems] = useState<FAQItem[]>([]);
    const [contactInfo, setContactInfo] = useState<ContactInfo>({
        addressLines: [], phoneNumbers: [], emails: [], workingHoursLines: [], whatsappNumber: ""
    });
    const [serviceAreas, setServiceAreas] = useState<string[]>([]);
    const [homepageBrands, setHomepageBrands] = useState<HomepageBrand[]>([]);
    const [problemNavItems, setProblemNavItems] = useState<ProblemNavItem[]>([]);
    const [beforeAfterGallery, setBeforeAfterGallery] = useState<BeforeAfterItem[]>([]);
    const [pricingTable, setPricingTable] = useState<PricingItem[]>([]);
    const [trackRepairEnabled, setTrackRepairEnabled] = useState(true);
    const [googleMapUrl, setGoogleMapUrl] = useState("");

    // --- About Us State ---
    const [aboutTitle, setAboutTitle] = useState("");
    const [aboutTitleBn, setAboutTitleBn] = useState("");
    const [aboutDescription, setAboutDescription] = useState("");
    const [aboutDescriptionBn, setAboutDescriptionBn] = useState("");
    const [aboutMission, setAboutMission] = useState("");
    const [aboutMissionBn, setAboutMissionBn] = useState("");
    const [aboutVision, setAboutVision] = useState("");
    const [aboutVisionBn, setAboutVisionBn] = useState("");
    const [aboutCapabilities, setAboutCapabilities] = useState<string[]>([]);
    const [aboutCapabilitiesBn, setAboutCapabilitiesBn] = useState<string[]>([]);
    const [aboutTeam, setAboutTeam] = useState("");
    const [aboutTeamBn, setAboutTeamBn] = useState("");
    const [aboutAddress, setAboutAddress] = useState("");
    const [aboutAddressBn, setAboutAddressBn] = useState("");
    const [aboutEmail, setAboutEmail] = useState("");
    const [aboutWorkingHours, setAboutWorkingHours] = useState("");
    const [aboutWorkingHoursBn, setAboutWorkingHoursBn] = useState("");
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

    // --- Load Settings ---
    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const settings = await settingsApi.getAll(); // Direct array return

            settings.forEach((s: any) => {
                try {
                    const val = s.value;
                    // Helper to parse JSON safely
                    const parse = (v: any, def: any) => {
                        try { return typeof v === 'string' ? JSON.parse(v) : v; }
                        catch { return def; }
                    };

                    switch (s.key) {
                        // General
                        case "site_name": setSiteName(val); break;
                        case "support_phone": setSupportPhone(val); break;
                        case "service_center_contact": setServiceCenterContact(val); break;
                        case "business_hours": setBusinessHours(val); break;
                        case "currency_symbol": setCurrencySymbol(val); break;
                        case "vat_percentage": setVatPercentage(val); break;
                        case "timezone": setTimezone(val); break;
                        case "logo_url": setLogoUrl(val); break;
                        case "bkash_send_money_number": setBkashSendMoney(typeof val === "string" ? val : ""); break;
                        case "nagad_send_money_number": setNagadSendMoney(typeof val === "string" ? val : ""); break;
                        case "maintenance_mode": setMaintenanceMode(val === "true" || val === true); break;
                        case "allow_registrations": setAllowRegistrations(val === "true" || val === true); break;
                        case "developer_mode": setDeveloperMode(val === "true" || val === true); break;
                        case "drawer_day_close_enabled": setDrawerDayCloseEnabled(val === "true" || val === true); break;
                        case "drawer_day_close_time": setDrawerDayCloseTime(typeof val === "string" && val.trim() ? val : "23:59"); break;
                        case "drawer_day_close_timezone": setDrawerDayCloseTimezone(typeof val === "string" && val.trim() ? val : "Asia/Dhaka"); break;

                        // Service Config
                        case "service_categories": setServiceCategories(parse(val, [])); break;
                        case "shop_categories": setShopCategories(parse(val, [])); break;
                        case "tv_brands": setTvBrands(parse(val, [])); break;

                        case "tv_sizes": setTvInches(parse(val, [])); break;

                        case "common_symptoms": setCommonSymptoms(parse(val, [])); break;
                        case "service_filter_categories": setServiceFilterCategories(parse(val, [])); break;

                        // CMS / Home
                        case "hero_title": setHeroTitle(val); break;
                        case "hero_subtitle": setHeroSubtitle(val); break;
                        case "hero_animation_type": setHeroAnimationType(val); break;
                        case "hero_images": setHeroImages(parse(val, ["", "", ""])); break;
                        case "mobile_hero_images": setMobileHeroImages(parse(val, ["", "", ""])); break;
                        case "info_boxes": setInfoBoxes(parse(val, [])); break;
                        case "homepage_stats": setHomepageStats(parse(val, [])); break;
                        case "faq_items": setFaqItems(parse(val, [])); break;
                        case "homepage_contact_info": setContactInfo(parse(val, { addressLines: [], phoneNumbers: [], emails: [], workingHoursLines: [], whatsappNumber: "" })); break;
                        case "service_areas": setServiceAreas(parse(val, [])); break;
                        case "homepage_brands": setHomepageBrands(parse(val, [])); break;
                        case "home_problems_list": setProblemNavItems(parse(val, [])); break;
                        case "home_before_after_gallery": setBeforeAfterGallery(parse(val, [])); break;
                        case "home_pricing_table": setPricingTable(parse(val, [])); break;
                        case "home_track_repair_enabled": setTrackRepairEnabled(val === "true" || val === true); break;
                        case "home_google_map_url": setGoogleMapUrl(val); break;

                        // About Us
                        case "about_title": setAboutTitle(val); break;
                        case "about_title_bn": setAboutTitleBn(val); break;
                        case "about_description": setAboutDescription(val); break;
                        case "about_description_bn": setAboutDescriptionBn(val); break;
                        case "about_mission": setAboutMission(val); break;
                        case "about_mission_bn": setAboutMissionBn(val); break;
                        case "about_vision": setAboutVision(val); break;
                        case "about_vision_bn": setAboutVisionBn(val); break;
                        case "about_capabilities": setAboutCapabilities(parse(val, [])); break;
                        case "about_capabilities_bn": setAboutCapabilitiesBn(parse(val, [])); break;
                        case "about_team": setAboutTeam(val); break;
                        case "about_team_bn": setAboutTeamBn(val); break;
                        case "about_address": setAboutAddress(val); break;
                        case "about_address_bn": setAboutAddressBn(val); break;
                        case "about_email": setAboutEmail(val); break;
                        case "about_working_hours": setAboutWorkingHours(val); break;
                        case "about_working_hours_bn": setAboutWorkingHoursBn(val); break;
                        case "team_members": setTeamMembers(parse(val, [])); break;
                    }
                } catch (err) {
                    console.error(`Error parsing setting ${s.key}:`, err);
                }
            });
        } catch (error) {
            console.error("Failed to fetch settings:", error);
            toast({ title: "Error", description: "Failed to load settings", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            const settingsToSave = {
                // General
                site_name: siteName,
                support_phone: supportPhone,
                service_center_contact: serviceCenterContact,
                business_hours: businessHours,
                currency_symbol: currencySymbol,
                vat_percentage: vatPercentage,
                timezone: timezone,
                logo_url: logoUrl,
                bkash_send_money_number: bkashSendMoney,
                nagad_send_money_number: nagadSendMoney,
                // These are saved independently now, but included here for completeness
                maintenance_mode: maintenanceMode,
                allow_registrations: allowRegistrations,
                developer_mode: developerMode,
                drawer_day_close_enabled: drawerDayCloseEnabled,
                drawer_day_close_time: drawerDayCloseTime,
                drawer_day_close_timezone: drawerDayCloseTimezone,

                // Service Config
                service_categories: JSON.stringify(serviceCategories),
                shop_categories: JSON.stringify(shopCategories),
                tv_brands: JSON.stringify(tvBrands),

                tv_sizes: JSON.stringify(tvInches),

                common_symptoms: JSON.stringify(commonSymptoms),
                service_filter_categories: JSON.stringify(serviceFilterCategories),

                // CMS / Home
                hero_title: heroTitle,
                hero_subtitle: heroSubtitle,
                hero_animation_type: heroAnimationType,
                hero_images: JSON.stringify(heroImages.map(u => u.trim()).filter(u => u !== "")),
                mobile_hero_images: JSON.stringify(mobileHeroImages.map(u => u.trim()).filter(u => u !== "")),
                info_boxes: JSON.stringify(infoBoxes),
                homepage_stats: JSON.stringify(homepageStats),
                faq_items: JSON.stringify(faqItems),
                homepage_contact_info: JSON.stringify(contactInfo),
                service_areas: JSON.stringify(serviceAreas),
                homepage_brands: JSON.stringify(homepageBrands),
                home_problems_list: JSON.stringify(problemNavItems),
                home_before_after_gallery: JSON.stringify(beforeAfterGallery),
                home_pricing_table: JSON.stringify(pricingTable),
                home_track_repair_enabled: trackRepairEnabled,
                home_google_map_url: googleMapUrl,

                // About Us
                about_title: aboutTitle,
                about_title_bn: aboutTitleBn,
                about_description: aboutDescription,
                about_description_bn: aboutDescriptionBn,
                about_mission: aboutMission,
                about_mission_bn: aboutMissionBn,
                about_vision: aboutVision,
                about_vision_bn: aboutVisionBn,
                about_capabilities: JSON.stringify(aboutCapabilities),
                about_capabilities_bn: JSON.stringify(aboutCapabilitiesBn),
                about_team: aboutTeam,
                about_team_bn: aboutTeamBn,
                about_address: aboutAddress,
                about_address_bn: aboutAddressBn,
                about_email: aboutEmail,
                about_working_hours: aboutWorkingHours,
                about_working_hours_bn: aboutWorkingHoursBn,
                team_members: JSON.stringify(teamMembers),
            };

            const promises = Object.entries(settingsToSave).map(([key, value]) =>
                settingsApi.upsert({ key, value: String(value) })
            );

            const results = await Promise.allSettled(promises);
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            if (failed === 0) {
                toast({ title: "Success", description: "All settings saved successfully" });
            } else {
                toast({
                    title: "Partial Success",
                    description: `Saved ${succeeded} settings. ${failed} settings failed to save.`,
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error("Failed to save settings operations:", error);
            toast({ title: "Error", description: "A system error occurred while saving settings.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const getDayCloseReasonLabel = (reason?: string) => {
        switch (reason) {
            case "no_active_session":
                return "No active drawer session was found.";
            case "already_ran_today":
                return "Day-end already executed for today.";
            case "unsupported_status":
                return "Active drawer is in a status that cannot be day-closed.";
            case "day_close_in_progress":
                return "Another day-close run is already in progress.";
            default:
                return reason || "No operation needed.";
        }
    };

    const handleRunDayEndNow = async () => {
        try {
            setRunningDayCloseNow(true);
            const result = await drawerApi.runDayCloseNow();

            if (result.executed) {
                toast({
                    title: "Day-End Executed",
                    description: `Session ${result.sessionId || "unknown"} was closed and moved to ${result.updatedStatus || "counting"}.`,
                });
            } else {
                toast({
                    title: "Day-End Run Completed",
                    description: getDayCloseReasonLabel(result.reason),
                });
            }
        } catch (error) {
            console.error("Failed to run drawer day-close:", error);
            toast({
                title: "Run Failed",
                description: "Could not execute day-end drawer close.",
                variant: "destructive",
            });
        } finally {
            setRunningDayCloseNow(false);
        }
    };

    const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
    const [generalDialogTrigger, setGeneralDialogTrigger] = useState<string | null>(null);
    const [dangerExpanded, setDangerExpanded] = useState(false);
    const [mobileCatalogTab, setMobileCatalogTab] = useState<string>("service");

    useEffect(() => {
        if (!initialSearchQuery) return;
        setSearchQuery(initialSearchQuery);
        const destination = resolveSettingsDestination(initialSearchQuery);
        if (destination.sheet) setActiveSheet(destination.sheet);
        if (destination.panel) setSelectedPanel(destination.panel);
        onSearchConsumed?.();
    }, [initialSearchQuery]);

    useEffect(() => {
        const anyMobileSurfaceOpen = !!activeSheet || !!selectedPanel;
        if (!anyMobileSurfaceOpen || window.innerWidth >= 768) return;
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
        };
    }, [activeSheet, selectedPanel]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const catalogItems = [
        { label: "Service", count: serviceCategories.length, icon: Wrench, color: "text-blue-500", bg: "bg-blue-50" },
        { label: "Shop", count: shopCategories.length, icon: ShoppingBag, color: "text-emerald-500", bg: "bg-emerald-50" },
        { label: "Brands", count: tvBrands.length, icon: Tv, color: "text-purple-500", bg: "bg-purple-50" },
        { label: "Sizes", count: tvInches.length, icon: Ruler, color: "text-amber-500", bg: "bg-amber-50" },
        { label: "Symptoms", count: commonSymptoms.length, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" },
        { label: "Filters", count: serviceFilterCategories.length, icon: Filter, color: "text-cyan-500", bg: "bg-cyan-50" },
    ];

    const MobileSettingsRow = ({ icon: Icon, iconColor, iconBg, label, helper, right, onClick }: {
        icon: any; iconColor: string; iconBg: string; label: string; helper?: string;
        right: React.ReactNode; onClick?: () => void;
    }) => (
        <button type="button" onClick={onClick} className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-slate-50 transition-colors">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}>
                <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-900">{label}</p>
                {helper && <MobileMarqueeText className="text-[11px] text-slate-400 block" title={helper}>{helper}</MobileMarqueeText>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {right}
                {onClick && <ChevronRight className="h-4 w-4 text-slate-300" />}
            </div>
        </button>
    );

    const MobileSectionTitle = ({ children }: { children: string }) => (
        <p className="px-4 pt-5 pb-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{children}</p>
    );

    const MobilePanel = ({ children }: { children: React.ReactNode }) => (
        <div className="mx-4 rounded-[20px] border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">{children}</div>
    );

    const StatusPill = ({ label, tone }: { label: string; tone: string }) => (
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
    );

    return (
        <>
        {/* ═══════════════════════════════════════════════════════════════
            MOBILE SETTINGS VIEW
           ═══════════════════════════════════════════════════════════════ */}
        <MobileTabLayout className="md:hidden bg-slate-50">
            <MobileTabHeader className="px-4 pt-2 pb-3 space-y-3">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-[21px] font-extrabold text-slate-900">Settings</h1>
                        <p className="text-[12px] font-medium text-slate-500">System configuration</p>
                    </div>
                    <Button onClick={handleSaveAll} disabled={saving} size="sm" className="h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-3 gap-1.5 shrink-0 mt-0.5">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                    </Button>
                </div>
                <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search settings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 h-11 rounded-xl bg-white border-slate-200 text-sm"
                        />
                </div>
            </MobileTabHeader>

            <MobileScrollContent className="px-0 space-y-0 pt-1">

                {/* System Status */}
                <MobileSectionTitle>System Status</MobileSectionTitle>
                <MobilePanel>
                    <MobileSettingsRow icon={Shield} iconColor="text-blue-600" iconBg="bg-blue-100" label="Data & Backups" helper="Last backup 2:00 AM"
                        right={<StatusPill label="Secure" tone="bg-blue-50 text-blue-700" />} onClick={() => setGeneralDialogTrigger("data")} />
                    <MobileSettingsRow icon={AlertTriangle} iconColor={maintenanceMode ? "text-red-600" : "text-slate-500"} iconBg={maintenanceMode ? "bg-red-100" : "bg-slate-100"} label="Maintenance" helper={maintenanceMode ? "System is offline" : "System is live"}
                        right={<StatusPill label={maintenanceMode ? "Active" : "Off"} tone={maintenanceMode ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"} />} onClick={() => setGeneralDialogTrigger("maintenance")} />
                    <MobileSettingsRow icon={Users} iconColor={allowRegistrations ? "text-emerald-600" : "text-slate-500"} iconBg={allowRegistrations ? "bg-emerald-100" : "bg-slate-100"} label="Registrations" helper={allowRegistrations ? "New signups allowed" : "Signups blocked"}
                        right={<StatusPill label={allowRegistrations ? "Open" : "Closed"} tone={allowRegistrations ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"} />} onClick={() => setGeneralDialogTrigger("registration")} />
                    <MobileSettingsRow icon={Code2} iconColor={developerMode ? "text-amber-600" : "text-slate-500"} iconBg={developerMode ? "bg-amber-100" : "bg-slate-100"} label="Developer" helper={developerMode ? "Debug logs exposed" : "Production limits"}
                        right={<StatusPill label={developerMode ? "On" : "Off"} tone={developerMode ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"} />} onClick={() => setGeneralDialogTrigger("developer")} />
                </MobilePanel>

                {/* Business Identity */}
                <MobileSectionTitle>Business Identity</MobileSectionTitle>
                <MobilePanel>
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="h-12 w-12 shrink-0 rounded-2xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                            {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1.5" /> : <Globe className="h-5 w-5 text-slate-400" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-slate-900 truncate">{siteName || "Unnamed Business"}</p>
                            <p className="text-[12px] text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />{supportPhone || "No phone set"}</p>
                        </div>
                    </div>
                    <MobileSettingsRow icon={MapPin} iconColor="text-slate-500" iconBg="bg-slate-100" label="Location" helper={serviceCenterContact || "Not set"} right={null} />
                    <MobileSettingsRow icon={Clock} iconColor="text-slate-500" iconBg="bg-slate-100" label="Business Hours" helper={businessHours || "Not set"} right={null} />
                    <button type="button" onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'identity' }))} className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-blue-600 active:bg-blue-50 transition-colors">
                        <PenTool className="h-3.5 w-3.5" /> Edit Business Identity
                    </button>
                </MobilePanel>

                {/* Finance & Locale */}
                <MobileSectionTitle>Finance & Locale</MobileSectionTitle>
                <MobilePanel>
                    <MobileSettingsRow icon={Database} iconColor="text-amber-500" iconBg="bg-amber-50" label="Currency" right={<span className="text-[14px] font-bold text-amber-600 font-mono">{currencySymbol} BDT</span>} />
                    <MobileSettingsRow icon={Percent} iconColor="text-slate-500" iconBg="bg-slate-100" label="Global VAT" right={<span className="text-[14px] font-bold text-slate-700">{vatPercentage}%</span>} />
                    <MobileSettingsRow icon={Globe} iconColor="text-slate-500" iconBg="bg-slate-100" label="Timezone" right={<span className="text-[13px] font-semibold text-slate-600">{timezone}</span>} />
                    <button type="button" onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'finance' }))} className="flex items-center justify-center gap-2 w-full px-4 py-3 text-[13px] font-bold text-blue-600 active:bg-blue-50 transition-colors">
                        <PenTool className="h-3.5 w-3.5" /> Edit Finance Settings
                    </button>
                </MobilePanel>

                {/* POS Day-End */}
                <MobileSectionTitle>POS Day-End</MobileSectionTitle>
                <MobilePanel>
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-cyan-50">
                                <Clock3 className="h-4 w-4 text-cyan-600" />
                            </div>
                            <div>
                                <p className="text-[13px] font-semibold text-slate-900">Auto Day-End</p>
                                <p className="text-[11px] text-slate-400">Close sessions at cutoff</p>
                            </div>
                        </div>
                        <Switch checked={drawerDayCloseEnabled} onCheckedChange={setDrawerDayCloseEnabled} />
                    </div>
                    <div className="px-4 py-3 grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Cutoff Time</label>
                            <Input type="time" value={drawerDayCloseTime} onChange={(e) => setDrawerDayCloseTime(e.target.value || "23:59")} className="h-10 rounded-xl bg-slate-50 text-sm" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Timezone</label>
                            <Input value={drawerDayCloseTimezone} onChange={(e) => setDrawerDayCloseTimezone(e.target.value)} placeholder="Asia/Dhaka" className="h-10 rounded-xl bg-slate-50 text-sm" />
                        </div>
                    </div>
                    <div className="px-4 py-3">
                        <Button type="button" onClick={handleRunDayEndNow} disabled={runningDayCloseNow} className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold">
                            {runningDayCloseNow ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                            Run Day-End Now
                        </Button>
                    </div>
                </MobilePanel>

                {/* Service Catalogs */}
                <MobileSectionTitle>Service Catalogs</MobileSectionTitle>
                <MobilePanel>
                    {catalogItems.map((item, i) => (
                        <MobileSettingsRow key={i} icon={item.icon} iconColor={item.color} iconBg={item.bg} label={item.label}
                            right={<span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-bold text-slate-700">{item.count}</span>}
                            onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'catalog' }))} />
                    ))}
                </MobilePanel>

                {/* Website Content */}
                <MobileSectionTitle>Website Content</MobileSectionTitle>
                <MobilePanel>
                    <MobileSettingsRow icon={LayoutTemplate} iconColor="text-indigo-500" iconBg="bg-indigo-50" label="Homepage CMS" helper={`${infoBoxes.length} info boxes · ${faqItems.length} FAQs`}
                        right={null} onClick={() => setSelectedPanel("cmshome")} />
                    <MobileSettingsRow icon={Building2} iconColor="text-emerald-500" iconBg="bg-emerald-50" label="About Us Page" helper={`${teamMembers.length} team member${teamMembers.length !== 1 ? 's' : ''}`}
                        right={null} onClick={() => setSelectedPanel("about")} />
                </MobilePanel>

                {/* Data Setup */}
                <MobileSectionTitle>Data Setup</MobileSectionTitle>
                <MobilePanel>
                    <MobileSettingsRow icon={Upload} iconColor="text-blue-600" iconBg="bg-blue-50" label="Bulk Import Center" helper="CSV import for catalog, inventory & products"
                        right={null} onClick={() => setSelectedPanel("bulkimport")} />
                </MobilePanel>

                {/* Danger Zone */}
                <MobileSectionTitle>Advanced</MobileSectionTitle>
                <div className="mx-4 mb-6 rounded-[20px] border border-red-200 bg-white overflow-hidden">
                    <button type="button" onClick={() => setDangerExpanded(!dangerExpanded)} className="flex items-center gap-3 w-full px-4 py-3 text-left">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-red-100">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                        </div>
                        <div className="flex-1">
                            <p className="text-[13px] font-semibold text-red-700">Danger Zone</p>
                            <p className="text-[11px] text-red-400">Restricted destructive actions</p>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-red-300 transition-transform ${dangerExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {dangerExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-red-100">
                            <p className="text-[12px] text-red-600 mb-3">Deleting data is irreversible. All transactions, customers, and catalog data will be permanently removed.</p>
                            <Button variant="outline" className="w-full h-11 rounded-xl border-red-300 text-red-600 font-bold hover:bg-red-50" onClick={() => setGeneralDialogTrigger("delete")}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete All Data
                            </Button>
                        </div>
                    )}
                </div>
            </MobileScrollContent>
        </MobileTabLayout>

        {/* ═══════════════════════════════════════════════════════════════
            DESKTOP SETTINGS VIEW (existing layout, hidden on mobile)
           ═══════════════════════════════════════════════════════════════ */}
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="hidden md:block space-y-6 pb-24 md:pb-0 max-w-[1600px] mx-auto"
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/50 backdrop-blur-xl p-6 rounded-3xl border border-white/40 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
                    <p className="text-slate-500 mt-1">Manage global settings, content, and system preferences.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search settings..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-white/60 border-slate-200 focus:bg-white transition-all"
                        />
                    </div>
                    <Button
                        onClick={handleSaveAll}
                        disabled={saving}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* Main Bento Layout */}
            <div className="flex flex-col gap-6">

                {/* Row 1 & 2: General Section (visual cards — dialogs rendered separately below) */}
                <GeneralSection
                    siteName={siteName} setSiteName={setSiteName}
                    supportPhone={supportPhone} setSupportPhone={setSupportPhone}
                    serviceCenterContact={serviceCenterContact} setServiceCenterContact={setServiceCenterContact}
                    businessHours={businessHours} setBusinessHours={setBusinessHours}
                    currencySymbol={currencySymbol} setCurrencySymbol={setCurrencySymbol}
                    vatPercentage={vatPercentage} setVatPercentage={setVatPercentage}
                    timezone={timezone} setTimezone={setTimezone}
                    logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                    maintenanceMode={maintenanceMode} setMaintenanceMode={setMaintenanceMode}
                    allowRegistrations={allowRegistrations} setAllowRegistrations={setAllowRegistrations}
                    developerMode={developerMode} setDeveloperMode={setDeveloperMode}
                />

                {/* Row 3: Drawer Day-End Controls */}
                <motion.div variants={itemVariants} className="w-full">
                    <BentoCard
                        title="POS Day-End Drawer"
                        icon={<Clock3 className="w-5 h-5 text-cyan-600" />}
                        variant="glass"
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr_auto] gap-4 items-end">
                            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Auto Day-End Close</p>
                                        <p className="text-xs text-slate-500 mt-1">Close unresolved drawer sessions at cutoff and require review.</p>
                                    </div>
                                    <Switch
                                        checked={drawerDayCloseEnabled}
                                        onCheckedChange={setDrawerDayCloseEnabled}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cutoff Time</label>
                                <Input
                                    type="time"
                                    value={drawerDayCloseTime}
                                    onChange={(e) => setDrawerDayCloseTime(e.target.value || "23:59")}
                                    className="bg-white/80"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Timezone</label>
                                <Input
                                    value={drawerDayCloseTimezone}
                                    onChange={(e) => setDrawerDayCloseTimezone(e.target.value)}
                                    placeholder="Asia/Dhaka"
                                    className="bg-white/80"
                                />
                            </div>

                            <Button
                                type="button"
                                onClick={handleRunDayEndNow}
                                disabled={runningDayCloseNow}
                                className="h-10 bg-slate-900 hover:bg-slate-800 text-white"
                            >
                                {runningDayCloseNow ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                                Run Day-End Now
                            </Button>
                        </div>
                    </BentoCard>
                </motion.div>

                {/* Row 4: Service Config */}
                <div className="w-full">
                    <ServiceConfigSection
                        serviceCategories={serviceCategories} setServiceCategories={setServiceCategories}
                        shopCategories={shopCategories} setShopCategories={setShopCategories}
                        tvBrands={tvBrands} setTvBrands={setTvBrands}
                        tvInches={tvInches} setTvInches={setTvInches}
                        commonSymptoms={commonSymptoms} setCommonSymptoms={setCommonSymptoms}
                        serviceFilterCategories={serviceFilterCategories} setServiceFilterCategories={setServiceFilterCategories}
                    />
                </div>

                {/* Row 5: CMS & About Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* CMS Summary Card */}
                    <motion.div variants={itemVariants} className="h-full">
                        <BentoCard
                            className="cursor-pointer group relative overflow-hidden h-full hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                            title="Homepage CMS"
                            icon={<LayoutTemplate className="w-5 h-5 text-indigo-500" />}
                            variant="glass"
                            onClick={() => setSelectedPanel("cmshome")}
                        >
                            <div className="flex flex-col h-full justify-between pb-2 mt-2 relative z-10">
                                <div className="space-y-4">
                                    <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 group-hover:bg-indigo-50/50 group-hover:border-indigo-200/50 transition-colors">
                                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{heroTitle || "No Hero Title Set"}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{heroImages.filter(img => typeof img === 'string' && img.trim() !== "").length} Hero Images Active</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="px-2 py-1 bg-white border border-slate-200/60 rounded-md text-xs font-semibold text-slate-600 shadow-sm">{infoBoxes.length} Info Boxes</span>
                                        <span className="px-2 py-1 bg-white border border-slate-200/60 rounded-md text-xs font-semibold text-slate-600 shadow-sm">{faqItems.length} FAQs</span>
                                        <span className="px-2 py-1 bg-white border border-slate-200/60 rounded-md text-xs font-semibold text-slate-600 shadow-sm">{homepageBrands.length} Brands</span>
                                    </div>
                                </div>
                                <div className="text-indigo-600 font-semibold text-sm text-center pt-5 opacity-0 group-hover:opacity-100 transition-all">
                                    Open Full Editor &rarr;
                                </div>
                            </div>
                        </BentoCard>
                    </motion.div>

                    {/* About Us Summary Card */}
                    <motion.div variants={itemVariants} className="h-full">
                        <BentoCard
                            className="cursor-pointer group relative overflow-hidden h-full hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                            title="About Us Page"
                            icon={<Building2 className="w-5 h-5 text-emerald-500" />}
                            variant="glass"
                            onClick={() => setSelectedPanel("about")}
                        >
                            <div className="flex flex-col h-full justify-between pb-2 mt-2 relative z-10">
                                <div className="space-y-4">
                                    <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 group-hover:bg-emerald-50/50 group-hover:border-emerald-200/50 transition-colors">
                                        <p className="text-sm font-semibold text-slate-800 line-clamp-1">{aboutTitle || "About Promise"}</p>
                                    </div>
                                    <div className="flex items-center gap-4 py-1">
                                        <div className="flex -space-x-2">
                                            {teamMembers.slice(0, 4).map((member, i) => (
                                                <img key={i} src={member.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}`} className="w-9 h-9 flex-shrink-0 rounded-full border-2 border-white bg-slate-100 object-cover" />
                                            ))}
                                            {teamMembers.length > 4 && (
                                                <div className="w-9 h-9 flex-shrink-0 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                                                    +{teamMembers.length - 4}
                                                </div>
                                            )}
                                            {teamMembers.length === 0 && (
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No team members</span>
                                            )}
                                        </div>
                                        {teamMembers.length > 0 && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{teamMembers.length} Team Members</span>}
                                    </div>
                                </div>
                                <div className="text-emerald-600 font-semibold text-sm text-center pt-5 opacity-0 group-hover:opacity-100 transition-all">
                                    Open Full Editor &rarr;
                                </div>
                            </div>
                        </BentoCard>
                    </motion.div>
                </div>

                {/* Row 6: Bulk Import Center (desktop) */}
                <motion.div variants={itemVariants} className="h-full">
                    <BentoCard
                        className="cursor-pointer group relative overflow-hidden h-full hover:-translate-y-1 hover:shadow-xl transition-all duration-300"
                        title="Bulk Import Center"
                        icon={<Upload className="w-5 h-5 text-blue-600" />}
                        variant="glass"
                        onClick={() => setSelectedPanel("bulkimport")}
                    >
                        <div className="flex flex-col h-full justify-between pb-2 mt-2 relative z-10">
                            <div className="space-y-3">
                                <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 group-hover:bg-blue-50/50 group-hover:border-blue-200/50 transition-colors">
                                    <p className="text-sm font-semibold text-slate-800">CSV Bulk Import</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">First-Time Data Setup</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <span className="px-2 py-1 bg-white border border-slate-200/60 rounded-md text-xs font-semibold text-slate-600 shadow-sm">6 Import Types</span>
                                    <span className="px-2 py-1 bg-white border border-slate-200/60 rounded-md text-xs font-semibold text-slate-600 shadow-sm">Preview & Validate</span>
                                </div>
                            </div>
                            <div className="text-blue-600 font-semibold text-sm text-center pt-5 opacity-0 group-hover:opacity-100 transition-all">
                                Open Import Wizard &rarr;
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

        </motion.div>

            {/* GeneralSection dialogs — always mounted so mobile rows can trigger them */}
            <div className="contents md:hidden">
                <GeneralSection
                    siteName={siteName} setSiteName={setSiteName}
                    supportPhone={supportPhone} setSupportPhone={setSupportPhone}
                    serviceCenterContact={serviceCenterContact} setServiceCenterContact={setServiceCenterContact}
                    businessHours={businessHours} setBusinessHours={setBusinessHours}
                    currencySymbol={currencySymbol} setCurrencySymbol={setCurrencySymbol}
                    vatPercentage={vatPercentage} setVatPercentage={setVatPercentage}
                    timezone={timezone} setTimezone={setTimezone}
                    logoUrl={logoUrl} setLogoUrl={setLogoUrl}
                    maintenanceMode={maintenanceMode} setMaintenanceMode={setMaintenanceMode}
                    allowRegistrations={allowRegistrations} setAllowRegistrations={setAllowRegistrations}
                    developerMode={developerMode} setDeveloperMode={setDeveloperMode}
                    externalDialogTrigger={generalDialogTrigger}
                    onExternalDialogConsumed={() => setGeneralDialogTrigger(null)}
                />
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                SHARED MODALS — mobile uses MobileBottomSheetFrame, desktop keeps existing popups
                ═══════════════════════════════════════════════════════════════ */}

            {/* ─── CMS / About full editor — mobile near-full-screen bottom sheet ─── */}
            <BodyPortal><AnimatePresence>
                {selectedPanel && (
                    <div className="fixed inset-0 z-[260] flex items-end justify-center p-0 md:z-50 md:items-center md:p-12">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedPanel(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <MobileBottomSheetFrame onClose={() => setSelectedPanel(null)} className="relative flex h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl md:hidden">
                            <MobileBottomSheetHandle />
                            <div className="border-b border-slate-100 bg-white px-4 py-3">
                                <h2 className="flex min-w-0 items-center gap-2 text-base font-black text-slate-900">
                                    {selectedPanel === "cmshome" ? <LayoutTemplate className="w-5 h-5 text-indigo-500" /> : selectedPanel === "about" ? <Building2 className="w-5 h-5 text-emerald-500" /> : <Upload className="w-5 h-5 text-blue-600" />}
                                    <span className="truncate">{selectedPanel === "cmshome" ? "Homepage CMS" : selectedPanel === "about" ? "About Us" : "Bulk Import Center"}</span>
                                </h2>
                            </div>
                            <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50/30 px-3 pb-4">
                                {selectedPanel === "cmshome" && (
                                    <Suspense fallback={null}><CmsHomeSection
                                        heroTitle={heroTitle} setHeroTitle={setHeroTitle}
                                        heroSubtitle={heroSubtitle} setHeroSubtitle={setHeroSubtitle}
                                        heroAnimationType={heroAnimationType} setHeroAnimationType={setHeroAnimationType}
                                        heroImages={heroImages} setHeroImages={setHeroImages}
                                        mobileHeroImages={mobileHeroImages} setMobileHeroImages={setMobileHeroImages}
                                        infoBoxes={infoBoxes} setInfoBoxes={setInfoBoxes}
                                        homepageStats={homepageStats} setHomepageStats={setHomepageStats}
                                        faqItems={faqItems} setFaqItems={setFaqItems}
                                        contactInfo={contactInfo} setContactInfo={setContactInfo}
                                        serviceAreas={serviceAreas} setServiceAreas={setServiceAreas}
                                        homepageBrands={homepageBrands} setHomepageBrands={setHomepageBrands}
                                        problemNavItems={problemNavItems} setProblemNavItems={setProblemNavItems}
                                        beforeAfterGallery={beforeAfterGallery} setBeforeAfterGallery={setBeforeAfterGallery}
                                        pricingTable={pricingTable} setPricingTable={setPricingTable}
                                        trackRepairEnabled={trackRepairEnabled} setTrackRepairEnabled={setTrackRepairEnabled}
                                        googleMapUrl={googleMapUrl} setGoogleMapUrl={setGoogleMapUrl}
                                    /></Suspense>
                                )}
                                {selectedPanel === "about" && (
                                    <Suspense fallback={null}><AboutUsSection
                                        aboutTitle={aboutTitle} setAboutTitle={setAboutTitle}
                                        aboutTitleBn={aboutTitleBn} setAboutTitleBn={setAboutTitleBn}
                                        aboutDescription={aboutDescription} setAboutDescription={setAboutDescription}
                                        aboutDescriptionBn={aboutDescriptionBn} setAboutDescriptionBn={setAboutDescriptionBn}
                                        aboutMission={aboutMission} setAboutMission={setAboutMission}
                                        aboutMissionBn={aboutMissionBn} setAboutMissionBn={setAboutMissionBn}
                                        aboutVision={aboutVision} setAboutVision={setAboutVision}
                                        aboutVisionBn={aboutVisionBn} setAboutVisionBn={setAboutVisionBn}
                                        aboutCapabilities={aboutCapabilities} setAboutCapabilities={setAboutCapabilities}
                                        aboutCapabilitiesBn={aboutCapabilitiesBn} setAboutCapabilitiesBn={setAboutCapabilitiesBn}
                                        aboutTeam={aboutTeam} setAboutTeam={setAboutTeam}
                                        aboutTeamBn={aboutTeamBn} setAboutTeamBn={setAboutTeamBn}
                                        aboutAddress={aboutAddress} setAboutAddress={setAboutAddress}
                                        aboutAddressBn={aboutAddressBn} setAboutAddressBn={setAboutAddressBn}
                                        aboutEmail={aboutEmail} setAboutEmail={setAboutEmail}
                                        aboutWorkingHours={aboutWorkingHours} setAboutWorkingHours={setAboutWorkingHours}
                                        aboutWorkingHoursBn={aboutWorkingHoursBn} setAboutWorkingHoursBn={setAboutWorkingHoursBn}
                                        teamMembers={teamMembers} setTeamMembers={setTeamMembers}
                                    /></Suspense>
                                )}
                                {selectedPanel === "bulkimport" && (
                                    <Suspense fallback={null}><BulkImportSection /></Suspense>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSelectedPanel(null)}>Close</Button>
                                {selectedPanel !== "bulkimport" && (
                                    <Button className="h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setSelectedPanel(null); handleSaveAll(); }}>
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        Save & Close
                                    </Button>
                                )}
                            </div>
                        </MobileBottomSheetFrame>

                        {/* Desktop popup — unchanged */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative hidden md:flex h-auto max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
                            style={selectedPanel === "bulkimport" ? { maxWidth: "56rem" } : undefined}
                        >
                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-6">
                                <h2 className="flex min-w-0 items-center gap-3 text-2xl font-black text-slate-900">
                                    {selectedPanel === "cmshome" ? <LayoutTemplate className="w-6 h-6 text-indigo-500" /> : selectedPanel === "about" ? <Building2 className="w-6 h-6 text-emerald-500" /> : <Upload className="w-6 h-6 text-blue-600" />}
                                    <span className="truncate">{selectedPanel === "cmshome" ? "Homepage CMS Editor" : selectedPanel === "about" ? "About Us Editor" : "Bulk Import Center"}</span>
                                </h2>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedPanel(null)} className="h-10 w-10 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200">
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50/30 p-6">
                                {selectedPanel === "cmshome" && (
                                    <Suspense fallback={null}><CmsHomeSection
                                        heroTitle={heroTitle} setHeroTitle={setHeroTitle}
                                        heroSubtitle={heroSubtitle} setHeroSubtitle={setHeroSubtitle}
                                        heroAnimationType={heroAnimationType} setHeroAnimationType={setHeroAnimationType}
                                        heroImages={heroImages} setHeroImages={setHeroImages}
                                        mobileHeroImages={mobileHeroImages} setMobileHeroImages={setMobileHeroImages}
                                        infoBoxes={infoBoxes} setInfoBoxes={setInfoBoxes}
                                        homepageStats={homepageStats} setHomepageStats={setHomepageStats}
                                        faqItems={faqItems} setFaqItems={setFaqItems}
                                        contactInfo={contactInfo} setContactInfo={setContactInfo}
                                        serviceAreas={serviceAreas} setServiceAreas={setServiceAreas}
                                        homepageBrands={homepageBrands} setHomepageBrands={setHomepageBrands}
                                        problemNavItems={problemNavItems} setProblemNavItems={setProblemNavItems}
                                        beforeAfterGallery={beforeAfterGallery} setBeforeAfterGallery={setBeforeAfterGallery}
                                        pricingTable={pricingTable} setPricingTable={setPricingTable}
                                        trackRepairEnabled={trackRepairEnabled} setTrackRepairEnabled={setTrackRepairEnabled}
                                        googleMapUrl={googleMapUrl} setGoogleMapUrl={setGoogleMapUrl}
                                    /></Suspense>
                                )}
                                {selectedPanel === "about" && (
                                    <Suspense fallback={null}><AboutUsSection
                                        aboutTitle={aboutTitle} setAboutTitle={setAboutTitle}
                                        aboutTitleBn={aboutTitleBn} setAboutTitleBn={setAboutTitleBn}
                                        aboutDescription={aboutDescription} setAboutDescription={setAboutDescription}
                                        aboutDescriptionBn={aboutDescriptionBn} setAboutDescriptionBn={setAboutDescriptionBn}
                                        aboutMission={aboutMission} setAboutMission={setAboutMission}
                                        aboutMissionBn={aboutMissionBn} setAboutMissionBn={setAboutMissionBn}
                                        aboutVision={aboutVision} setAboutVision={setAboutVision}
                                        aboutVisionBn={aboutVisionBn} setAboutVisionBn={setAboutVisionBn}
                                        aboutCapabilities={aboutCapabilities} setAboutCapabilities={setAboutCapabilities}
                                        aboutCapabilitiesBn={aboutCapabilitiesBn} setAboutCapabilitiesBn={setAboutCapabilitiesBn}
                                        aboutTeam={aboutTeam} setAboutTeam={setAboutTeam}
                                        aboutTeamBn={aboutTeamBn} setAboutTeamBn={setAboutTeamBn}
                                        aboutAddress={aboutAddress} setAboutAddress={setAboutAddress}
                                        aboutAddressBn={aboutAddressBn} setAboutAddressBn={setAboutAddressBn}
                                        aboutEmail={aboutEmail} setAboutEmail={setAboutEmail}
                                        aboutWorkingHours={aboutWorkingHours} setAboutWorkingHours={setAboutWorkingHours}
                                        aboutWorkingHoursBn={aboutWorkingHoursBn} setAboutWorkingHoursBn={setAboutWorkingHoursBn}
                                        teamMembers={teamMembers} setTeamMembers={setTeamMembers}
                                    /></Suspense>
                                )}
                                {selectedPanel === "bulkimport" && (
                                    <Suspense fallback={null}><BulkImportSection /></Suspense>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white p-5 md:flex-row md:justify-end">
                                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setSelectedPanel(null)}>Close</Button>
                                {selectedPanel !== "bulkimport" && (
                                    <Button className="h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setSelectedPanel(null); handleSaveAll(); }}>
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        Save & Close
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence></BodyPortal>

            {/* ─── Identity editor — mobile bottom sheet + desktop popup ─── */}
            <BodyPortal><AnimatePresence>
                {activeSheet === 'identity' && (
                    <div className="fixed inset-0 z-[260] flex items-end justify-center p-0 md:items-center md:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setActiveSheet(null)}
                            className="absolute inset-0 bg-slate-900/40"
                        />
                        <MobileBottomSheetFrame onClose={() => setActiveSheet(null)} className="relative z-10 flex h-auto max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:hidden">
                            <MobileBottomSheetHandle />
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
                                        <Globe className="w-5 h-5 text-indigo-500" /> Business Identity
                                    </h2>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">Update public business information.</p>
                                </div>
                            </div>
                            <div className="custom-scrollbar space-y-4 overflow-y-auto p-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Site Name</label>
                                    <Input placeholder="Enter site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Logo Image URL</label>
                                    <Input placeholder="/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                    {logoUrl && <img src={logoUrl} alt="Logo Preview" className="h-10 object-contain mt-2 border rounded-md p-1 bg-white" />}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Support Phone</label>
                                    <Input placeholder="Phone number" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Service Center Address</label>
                                    <Input placeholder="Full address" value={serviceCenterContact} onChange={(e) => setServiceCenterContact(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Business Hours</label>
                                    <Input placeholder="e.g. Mon-Fri 9AM-6PM" value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </MobileBottomSheetFrame>

                        {/* Desktop popup — unchanged */}
                        <motion.div
                            className="relative z-10 hidden md:flex h-auto max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-6">
                                <div>
                                    <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
                                        <Globe className="w-5 h-5 text-indigo-500" /> Business Identity
                                    </h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Update public business information.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="custom-scrollbar space-y-6 overflow-y-auto p-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Site Name</label>
                                    <Input placeholder="Enter site name" value={siteName} onChange={(e) => setSiteName(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Logo Image URL</label>
                                    <Input placeholder="/logo.png" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                    {logoUrl && <img src={logoUrl} alt="Logo Preview" className="h-10 object-contain mt-2 border rounded-md p-1 bg-white" />}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Support Phone</label>
                                    <Input placeholder="Phone number" value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Service Center Address</label>
                                    <Input placeholder="Full address" value={serviceCenterContact} onChange={(e) => setServiceCenterContact(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Business Hours</label>
                                    <Input placeholder="e.g. Mon-Fri 9AM-6PM" value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-5 md:flex-row md:justify-end md:rounded-b-3xl">
                                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence></BodyPortal>

            {/* ─── Finance editor — mobile bottom sheet + desktop popup ─── */}
            <BodyPortal><AnimatePresence>
                {activeSheet === 'finance' && (
                    <div className="fixed inset-0 z-[260] flex items-end justify-center p-0 md:items-center md:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setActiveSheet(null)}
                            className="absolute inset-0 bg-slate-900/40"
                        />
                        <MobileBottomSheetFrame onClose={() => setActiveSheet(null)} className="relative z-10 flex h-auto max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:hidden">
                            <MobileBottomSheetHandle />
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
                                        <Database className="w-5 h-5 text-emerald-500" /> Finance & Locale
                                    </h2>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">Configure money and timezone.</p>
                                </div>
                            </div>
                            <div className="custom-scrollbar space-y-4 overflow-y-auto p-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Currency Symbol</label>
                                    <Input placeholder="$" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className="bg-slate-50 focus:bg-white font-mono text-lg transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">VAT / Tax Percentage</label>
                                    <div className="relative">
                                        <Input type="number" step="0.1" placeholder="0" value={vatPercentage} onChange={(e) => setVatPercentage(e.target.value)} className="bg-slate-50 focus:bg-white pr-8 transition-colors" />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Timezone</label>
                                    <Input placeholder="Asia/Riyadh" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                    <p className="text-xs text-slate-500 mt-1">Accepts standard IANA timezone formats.</p>
                                </div>
                                <div className="pt-2 border-t border-slate-100 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">Customer Send Money Numbers</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Customers send money to these and submit the transaction for verification. Leave blank to hide that option.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">bKash Send Money Number</label>
                                        <Input placeholder="01XXXXXXXXX" value={bkashSendMoney} onChange={(e) => setBkashSendMoney(e.target.value)} className="bg-slate-50 focus:bg-white font-mono transition-colors" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Nagad Send Money Number</label>
                                        <Input placeholder="01XXXXXXXXX" value={nagadSendMoney} onChange={(e) => setNagadSendMoney(e.target.value)} className="bg-slate-50 focus:bg-white font-mono transition-colors" />
                                    </div>
                                    <p className="text-xs text-amber-600">⚠ Double-check these — customers will send real money to these numbers.</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </MobileBottomSheetFrame>

                        {/* Desktop popup — unchanged */}
                        <motion.div
                            className="relative z-10 hidden md:flex h-auto max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-6">
                                <div>
                                    <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
                                        <Database className="w-5 h-5 text-emerald-500" /> Finance & Locale
                                    </h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Configure money and timezone.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="custom-scrollbar space-y-6 overflow-y-auto p-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Currency Symbol</label>
                                    <Input placeholder="$" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} className="bg-slate-50 focus:bg-white font-mono text-lg transition-colors" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">VAT / Tax Percentage</label>
                                    <div className="relative">
                                        <Input type="number" step="0.1" placeholder="0" value={vatPercentage} onChange={(e) => setVatPercentage(e.target.value)} className="bg-slate-50 focus:bg-white pr-8 transition-colors" />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Timezone</label>
                                    <Input placeholder="Asia/Riyadh" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="bg-slate-50 focus:bg-white transition-colors" />
                                    <p className="text-xs text-slate-500 mt-1">Accepts standard IANA timezone formats.</p>
                                </div>
                                <div className="pt-2 border-t border-slate-100 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">Customer Send Money Numbers</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Customers send money to these and submit the transaction for verification. Leave blank to hide that option.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">bKash Send Money Number</label>
                                        <Input placeholder="01XXXXXXXXX" value={bkashSendMoney} onChange={(e) => setBkashSendMoney(e.target.value)} className="bg-slate-50 focus:bg-white font-mono transition-colors" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Nagad Send Money Number</label>
                                        <Input placeholder="01XXXXXXXXX" value={nagadSendMoney} onChange={(e) => setNagadSendMoney(e.target.value)} className="bg-slate-50 focus:bg-white font-mono transition-colors" />
                                    </div>
                                    <p className="text-xs text-amber-600">⚠ Double-check these — customers will send real money to these numbers.</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-5 md:flex-row md:justify-end md:rounded-b-3xl">
                                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence></BodyPortal>

            {/* ─── Catalog editor — mobile bottom sheet with segment tabs + desktop popup ─── */}
            <BodyPortal><AnimatePresence>
                {activeSheet === 'catalog' && (
                    <div className="fixed inset-0 z-[260] flex items-end justify-center p-0 md:items-center md:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setActiveSheet(null)}
                            className="absolute inset-0 bg-slate-900/40"
                        />
                        <MobileBottomSheetFrame onClose={() => setActiveSheet(null)} className="relative z-10 flex h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:hidden">
                            <MobileBottomSheetHandle />
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
                                        <Wrench className="w-5 h-5 text-blue-500" /> Service Catalogs
                                    </h2>
                                    <p className="mt-0.5 text-xs font-medium text-slate-500">Manage tags used by services and stock.</p>
                                </div>
                            </div>
                            <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                                <MobileSegmentTabs
                                    value={mobileCatalogTab}
                                    onChange={setMobileCatalogTab}
                                    items={[
                                        { value: "service", label: "Service" },
                                        { value: "shop", label: "Shop" },
                                        { value: "brands", label: "Brands" },
                                        { value: "sizes", label: "Sizes" },
                                        { value: "symptoms", label: "Symptoms" },
                                        { value: "filters", label: "Filters" },
                                    ]}
                                />
                            </div>
                            <div className="custom-scrollbar flex-1 overflow-y-auto p-3">
                                <div className="flex items-start gap-2 bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 text-xs mb-3">
                                    <Star className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
                                    <p>Changes sync locally. Click <strong>Save Changes</strong> to push to server.</p>
                                </div>
                                {mobileCatalogTab === "service" && (
                                    <TagListCard title="Service Categories" icon={<Wrench className="w-5 h-5 text-blue-500" />} items={serviceCategories} setItems={setServiceCategories} placeholder="e.g. TV Repair, AC Servicing" accentColor="blue" />
                                )}
                                {mobileCatalogTab === "shop" && (
                                    <TagListCard title="Shop Categories" icon={<ShoppingBag className="w-5 h-5 text-emerald-500" />} items={shopCategories} setItems={setShopCategories} placeholder="e.g. Spare Parts, Accessories" accentColor="emerald" />
                                )}
                                {mobileCatalogTab === "brands" && (
                                    <TagListCard title="TV Brands" icon={<Tv className="w-5 h-5 text-purple-500" />} items={tvBrands} setItems={setTvBrands} placeholder="e.g. Samsung, LG, Sony" accentColor="purple" />
                                )}
                                {mobileCatalogTab === "sizes" && (
                                    <TagListCard title="TV Sizes (Inches)" icon={<Ruler className="w-5 h-5 text-amber-500" />} items={tvInches} setItems={setTvInches} placeholder="e.g. 32, 43, 55" accentColor="amber" />
                                )}
                                {mobileCatalogTab === "symptoms" && (
                                    <TagListCard title="Common Symptoms" icon={<AlertCircle className="w-5 h-5 text-rose-500" />} items={commonSymptoms} setItems={setCommonSymptoms} placeholder="e.g. No display, Lines on screen" accentColor="rose" />
                                )}
                                {mobileCatalogTab === "filters" && (
                                    <TagListCard title="Service Filter Categories" icon={<Filter className="w-5 h-5 text-cyan-500" />} items={serviceFilterCategories} setItems={setServiceFilterCategories} placeholder="e.g. Premium, Budget" accentColor="cyan" />
                                )}
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setActiveSheet(null)}>Close</Button>
                                <Button className="h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </MobileBottomSheetFrame>

                        {/* Desktop popup — unchanged */}
                        <motion.div
                            className="relative z-10 hidden md:flex h-auto max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
                        >
                            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-6">
                                <div>
                                    <h2 className="flex items-center gap-2 text-xl font-black text-slate-900">
                                        <Wrench className="w-5 h-5 text-blue-500" /> Service Catalogs
                                    </h2>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Manage tags used by services and stock.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
                                <div className="flex items-start gap-2 bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 text-sm mb-6 mx-2">
                                    <Star className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                                    <p>Changes made here are auto-synced locally. Remember to click <strong>Save Changes</strong> to push everything to the server when you are done.</p>
                                </div>
                                <Suspense fallback={null}><ServiceConfigEditor
                                    serviceCategories={serviceCategories} setServiceCategories={setServiceCategories}
                                    shopCategories={shopCategories} setShopCategories={setShopCategories}
                                    tvBrands={tvBrands} setTvBrands={setTvBrands}
                                    tvInches={tvInches} setTvInches={setTvInches}
                                    commonSymptoms={commonSymptoms} setCommonSymptoms={setCommonSymptoms}
                                    serviceFilterCategories={serviceFilterCategories} setServiceFilterCategories={setServiceFilterCategories}
                                /></Suspense>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50 p-5 md:flex-row md:justify-end md:rounded-b-3xl">
                                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setActiveSheet(null)}>Close</Button>
                                <Button className="h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence></BodyPortal>
        </>
    );
}
