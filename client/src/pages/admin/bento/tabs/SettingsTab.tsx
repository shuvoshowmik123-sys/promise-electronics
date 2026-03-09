import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Settings, Globe, PenTool, Users, Database, Save,
    Smartphone, FileText, MessageSquare, Loader2,
    Search, X, Wrench, Star, Upload, LayoutTemplate, Building2, Clock3, PlayCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { drawerApi, settingsApi } from "@/lib/api"; // Correct import
import { containerVariants, itemVariants } from "../shared";
import { BentoCard } from "../shared/BentoCard";

// Sections
import GeneralSection from "./settings/GeneralSection";
import ServiceConfigSection from "./settings/ServiceConfigSection";
import { ServiceConfigEditor } from "./settings/ServiceConfigEditor";
import CmsHomeSection, {
    InfoBox, HomepageStat, FAQItem, ContactInfo, HomepageBrand,
    ProblemNavItem, BeforeAfterItem, PricingItem
} from "./settings/CmsHomeSection";
import AboutUsSection, { TeamMember } from "./settings/AboutUsSection";

export default function SettingsTab() {
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
    const [aboutDescription, setAboutDescription] = useState("");
    const [aboutMission, setAboutMission] = useState("");
    const [aboutVision, setAboutVision] = useState("");
    const [aboutCapabilities, setAboutCapabilities] = useState<string[]>([]);
    const [aboutTeam, setAboutTeam] = useState("");
    const [aboutAddress, setAboutAddress] = useState("");
    const [aboutEmail, setAboutEmail] = useState("");
    const [aboutWorkingHours, setAboutWorkingHours] = useState("");
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
                        case "about_description": setAboutDescription(val); break;
                        case "about_mission": setAboutMission(val); break;
                        case "about_vision": setAboutVision(val); break;
                        case "about_capabilities": setAboutCapabilities(parse(val, [])); break;
                        case "about_team": setAboutTeam(val); break;
                        case "about_address": setAboutAddress(val); break;
                        case "about_email": setAboutEmail(val); break;
                        case "about_working_hours": setAboutWorkingHours(val); break;
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
                about_description: aboutDescription,
                about_mission: aboutMission,
                about_vision: aboutVision,
                about_capabilities: JSON.stringify(aboutCapabilities),
                about_team: aboutTeam,
                about_address: aboutAddress,
                about_email: aboutEmail,
                about_working_hours: aboutWorkingHours,
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 max-w-[1600px] mx-auto"
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

                {/* Row 1 & 2: General Section (includes Status Cards & Ops) */}
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
            </div>

            {/* Modal for Full Editors */}
            <AnimatePresence>
                {selectedPanel && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedPanel(null)}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
                        >
                            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    {selectedPanel === "cmshome" ? <LayoutTemplate className="w-6 h-6 text-indigo-500" /> : <Building2 className="w-6 h-6 text-emerald-500" />}
                                    {selectedPanel === "cmshome" ? "Homepage CMS Editor" : "About Us Editor"}
                                </h2>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedPanel(null)} className="h-10 w-10 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200">
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                                {selectedPanel === "cmshome" && (
                                    <CmsHomeSection
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
                                    />
                                )}
                                {selectedPanel === "about" && (
                                    <AboutUsSection
                                        aboutTitle={aboutTitle} setAboutTitle={setAboutTitle}
                                        aboutDescription={aboutDescription} setAboutDescription={setAboutDescription}
                                        aboutMission={aboutMission} setAboutMission={setAboutMission}
                                        aboutVision={aboutVision} setAboutVision={setAboutVision}
                                        aboutCapabilities={aboutCapabilities} setAboutCapabilities={setAboutCapabilities}
                                        aboutTeam={aboutTeam} setAboutTeam={setAboutTeam}
                                        aboutAddress={aboutAddress} setAboutAddress={setAboutAddress}
                                        aboutEmail={aboutEmail} setAboutEmail={setAboutEmail}
                                        aboutWorkingHours={aboutWorkingHours} setAboutWorkingHours={setAboutWorkingHours}
                                        teamMembers={teamMembers} setTeamMembers={setTeamMembers}
                                    />
                                )}
                            </div>
                            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setSelectedPanel(null)}>Close Editor</Button>
                                {/* Note: Since save hits the main state, closing and saving from the main Header is preferred, but we can also just let them close it and save later */}
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setSelectedPanel(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save & Close
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Expanding Modals for Settings (Replaced Sheets based on user feedback) */}
            <AnimatePresence>
                {/* Identity Popup */}
                {activeSheet === 'identity' && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={() => setActiveSheet(null)}
                        />
                        <motion.div
                            layoutId="card-identity"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-md max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-indigo-500" /> Business Identity
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">Update your company's core public information.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
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

                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Finance & Locale Popup */}
                {activeSheet === 'finance' && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={() => setActiveSheet(null)}
                        />
                        <motion.div
                            layoutId="card-finance"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-md max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Database className="w-5 h-5 text-emerald-500" /> Finance & Locale
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">Configure currency, taxes, and timezone settings.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
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
                            </div>

                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setActiveSheet(null)}>Cancel</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Catalog Popup */}
                {activeSheet === 'catalog' && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" style={{ pointerEvents: 'auto' }}>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={() => setActiveSheet(null)}
                        />
                        <motion.div
                            layoutId="card-catalog"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-4xl max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Wrench className="w-5 h-5 text-blue-500" /> Service Catalogs
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">Manage all the master tags used for filtering and categorizing items.</p>
                                </div>
                                <Button variant="ghost" size="icon" className="rounded-full -mr-2 text-slate-500" onClick={() => setActiveSheet(null)}>
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="p-4 overflow-y-auto custom-scrollbar">
                                {/* Note on save mechanism */}
                                <div className="flex items-start gap-2 bg-blue-50 text-blue-800 p-3 rounded-xl border border-blue-100 text-sm mb-6 mx-2">
                                    <Star className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                                    <p>Changes made here are auto-synced locally. Remember to click <strong>Save Changes</strong> to push everything to the server when you are done.</p>
                                </div>

                                <ServiceConfigEditor
                                    serviceCategories={serviceCategories} setServiceCategories={setServiceCategories}
                                    shopCategories={shopCategories} setShopCategories={setShopCategories}
                                    tvBrands={tvBrands} setTvBrands={setTvBrands}
                                    tvInches={tvInches} setTvInches={setTvInches}
                                    commonSymptoms={commonSymptoms} setCommonSymptoms={setCommonSymptoms}
                                    serviceFilterCategories={serviceFilterCategories} setServiceFilterCategories={setServiceFilterCategories}
                                />
                            </div>

                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setActiveSheet(null)}>Close</Button>
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setActiveSheet(null); handleSaveAll(); }}>
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Changes
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
