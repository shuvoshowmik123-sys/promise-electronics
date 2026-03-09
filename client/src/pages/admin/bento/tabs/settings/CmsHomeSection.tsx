import { useState } from "react";
import {
    LayoutTemplate, MessageSquare, Phone, MapPin,
    ShoppingBag, HelpCircle, Image as ImageIcon,
    DollarSign, Map, Plus, Trash2, Upload, X,
    ChevronDown, Monitor, Smartphone, GripVertical, ExternalLink
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TagListCard } from "./TagListCard";
import { cn } from "@/lib/utils";

// --- Interfaces ---
export interface InfoBox { id: number; title: string; description: string }
export interface HomepageStat { id: number; value: string; suffix: string; label: string; iconName: string }
export interface FAQItem { id: number; question: string; answer: string }
export interface ContactInfo {
    addressLines: string[]; phoneNumbers: string[]; emails: string[];
    workingHoursLines: string[]; whatsappNumber: string;
}
export interface HomepageBrand { id: number; name: string; logoUrl: string }
export interface ProblemNavItem { id: number; title: string; icon: string; iconUrl: string }
export interface BeforeAfterItem { id: number; title: string; beforeImage: string; afterImage: string }
export interface PricingItem { id: number; service: string; price: string; note: string }

interface CmsHomeSectionProps {
    heroTitle: string; setHeroTitle: (v: string) => void;
    heroSubtitle: string; setHeroSubtitle: (v: string) => void;
    heroAnimationType: string; setHeroAnimationType: (v: string) => void;
    heroImages: string[]; setHeroImages: (v: string[]) => void;
    mobileHeroImages: string[]; setMobileHeroImages: (v: string[]) => void;
    infoBoxes: InfoBox[]; setInfoBoxes: (v: InfoBox[]) => void;
    homepageStats: HomepageStat[]; setHomepageStats: (v: HomepageStat[]) => void;
    faqItems: FAQItem[]; setFaqItems: (v: FAQItem[]) => void;
    contactInfo: ContactInfo; setContactInfo: (v: ContactInfo) => void;
    serviceAreas: string[]; setServiceAreas: (v: string[]) => void;
    homepageBrands: HomepageBrand[]; setHomepageBrands: (v: HomepageBrand[]) => void;
    problemNavItems: ProblemNavItem[]; setProblemNavItems: (v: ProblemNavItem[]) => void;
    beforeAfterGallery: BeforeAfterItem[]; setBeforeAfterGallery: (v: BeforeAfterItem[]) => void;
    pricingTable: PricingItem[]; setPricingTable: (v: PricingItem[]) => void;
    trackRepairEnabled: boolean; setTrackRepairEnabled: (v: boolean) => void;
    googleMapUrl: string; setGoogleMapUrl: (v: string) => void;
    onUploadBrandLogo?: (id: number, file: File) => Promise<void>;
    onUploadProblemIcon?: (id: number, file: File) => Promise<void>;
}

// ─── Collapsible Section Shell ──────────────────────────────────────────────
function CmsSection({
    title, icon, description, badge, children, defaultOpen = true, className
}: {
    title: string; icon: React.ReactNode; description?: string;
    badge?: React.ReactNode; children: React.ReactNode;
    defaultOpen?: boolean; className?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={cn(
            "rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-200",
            open && "shadow-md",
            className
        )}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 p-4 md:p-5 text-left hover:bg-slate-50/50 transition-colors rounded-2xl"
            >
                <div className={cn(
                    "p-2 rounded-xl ring-1 shrink-0 transition-colors",
                    open ? "bg-blue-50 text-blue-600 ring-blue-100" : "bg-slate-50 text-slate-400 ring-slate-100"
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                        {badge}
                    </div>
                    {description && <p className="text-xs text-slate-400 mt-0.5 truncate">{description}</p>}
                </div>
                <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                    open && "rotate-180"
                )} />
            </button>
            {open && (
                <div className="px-4 md:px-5 pb-5 pt-0">
                    <Separator className="mb-4" />
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Inline Image Preview ───────────────────────────────────────────────────
function ImagePreview({ url }: { url: string }) {
    if (!url || url.trim() === "") return null;
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 cursor-pointer">
                        <img
                            src={url}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="p-0 rounded-xl overflow-hidden shadow-xl border-0">
                    <img src={url} alt="Preview" className="max-w-[280px] max-h-[180px] object-contain" />
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

// ─── Item Count Badge ───────────────────────────────────────────────────────
function CountBadge({ count, label }: { count: number; label?: string }) {
    return (
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-semibold bg-slate-100 text-slate-500 border-0">
            {count} {label || "items"}
        </Badge>
    );
}

// ─── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ message, onAdd, addLabel }: { message: string; onAdd?: () => void; addLabel?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Plus className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500 text-center">{message}</p>
            {onAdd && (
                <Button size="sm" variant="outline" onClick={onAdd} className="mt-3 text-xs">
                    <Plus className="w-3 h-3 mr-1.5" /> {addLabel || "Add Item"}
                </Button>
            )}
        </div>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function CmsHomeSection({
    heroTitle, setHeroTitle, heroSubtitle, setHeroSubtitle, heroAnimationType, setHeroAnimationType,
    heroImages, setHeroImages, mobileHeroImages, setMobileHeroImages,
    infoBoxes, setInfoBoxes, homepageStats, setHomepageStats, faqItems, setFaqItems,
    contactInfo, setContactInfo, serviceAreas, setServiceAreas,
    homepageBrands, setHomepageBrands, problemNavItems, setProblemNavItems,
    beforeAfterGallery, setBeforeAfterGallery, pricingTable, setPricingTable,
    trackRepairEnabled, setTrackRepairEnabled, googleMapUrl, setGoogleMapUrl,
    onUploadBrandLogo, onUploadProblemIcon
}: CmsHomeSectionProps) {

    // --- Local State for New Items ---
    const [newInfoBox, setNewInfoBox] = useState({ title: "", description: "" });
    const [newFaq, setNewFaq] = useState({ question: "", answer: "" });
    const [newBrand, setNewBrand] = useState("");
    const [newProblem, setNewProblem] = useState({ title: "", icon: "HelpCircle" });
    const [newBeforeAfter, setNewBeforeAfter] = useState({ title: "", before: "", after: "" });
    const [newPricing, setNewPricing] = useState({ service: "", price: "", note: "" });

    // --- Handlers ---
    const handleHeroImageChange = (index: number, val: string, isMobile: boolean) => {
        const list = isMobile ? [...mobileHeroImages] : [...heroImages];
        list[index] = val;
        isMobile ? setMobileHeroImages(list) : setHeroImages(list);
    };
    const addHeroImage = (isMobile: boolean) => {
        isMobile ? setMobileHeroImages([...mobileHeroImages, ""]) : setHeroImages([...heroImages, ""]);
    };
    const removeHeroImage = (index: number, isMobile: boolean) => {
        const list = isMobile ? mobileHeroImages.filter((_, i) => i !== index) : heroImages.filter((_, i) => i !== index);
        isMobile ? setMobileHeroImages(list) : setHeroImages(list);
    };
    const addInfoBox = () => {
        if (newInfoBox.title) {
            setInfoBoxes([...infoBoxes, { ...newInfoBox, id: Date.now() }]);
            setNewInfoBox({ title: "", description: "" });
        }
    };
    const addFaq = () => {
        if (newFaq.question && newFaq.answer) {
            setFaqItems([...faqItems, { ...newFaq, id: Date.now() }]);
            setNewFaq({ question: "", answer: "" });
        }
    };
    const addBrand = () => {
        if (newBrand) {
            setHomepageBrands([...homepageBrands, { id: Date.now(), name: newBrand, logoUrl: "" }]);
            setNewBrand("");
        }
    };
    const addProblem = () => {
        if (newProblem.title) {
            setProblemNavItems([...problemNavItems, { ...newProblem, id: Date.now(), iconUrl: "" }]);
            setNewProblem({ title: "", icon: "HelpCircle" });
        }
    };
    const addBeforeAfter = () => {
        if (newBeforeAfter.title && newBeforeAfter.before && newBeforeAfter.after) {
            setBeforeAfterGallery([...beforeAfterGallery, {
                id: Date.now(),
                title: newBeforeAfter.title,
                beforeImage: newBeforeAfter.before,
                afterImage: newBeforeAfter.after
            }]);
            setNewBeforeAfter({ title: "", before: "", after: "" });
        }
    };
    const addPricing = () => {
        if (newPricing.service && newPricing.price) {
            setPricingTable([...pricingTable, { ...newPricing, id: Date.now() }]);
            setNewPricing({ service: "", price: "", note: "" });
        }
    };
    const updateContactArray = (key: keyof ContactInfo, index: number, val: string) => {
        if (Array.isArray(contactInfo[key])) {
            const arr = [...(contactInfo[key] as string[])];
            arr[index] = val;
            setContactInfo({ ...contactInfo, [key]: arr });
        }
    };
    const addContactItem = (key: keyof ContactInfo) => {
        if (Array.isArray(contactInfo[key])) {
            setContactInfo({ ...contactInfo, [key]: [...(contactInfo[key] as string[]), ""] });
        }
    };
    const removeContactItem = (key: keyof ContactInfo, index: number) => {
        if (Array.isArray(contactInfo[key])) {
            const arr = (contactInfo[key] as string[]).filter((_, i) => i !== index);
            setContactInfo({ ...contactInfo, [key]: arr });
        }
    };

    // ─── Slide List Renderer ────────────────────────────────────────────────
    const renderSlideList = (images: string[], isMobile: boolean, deviceIcon: React.ReactNode, deviceLabel: string) => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {deviceIcon}
                    <span className="text-xs font-semibold text-slate-600">{deviceLabel}</span>
                    <CountBadge count={images.filter(u => u.trim() !== "").length} label="active" />
                </div>
                <Button size="sm" variant="outline" onClick={() => addHeroImage(isMobile)} className="h-7 text-xs gap-1.5 rounded-lg">
                    <Plus className="w-3 h-3" /> Add Slide
                </Button>
            </div>

            {images.length === 0 ? (
                <EmptyState message={`No ${deviceLabel.toLowerCase()} slides configured.`} onAdd={() => addHeroImage(isMobile)} addLabel="Add First Slide" />
            ) : (
                <div className="space-y-2">
                    {images.map((img, i) => (
                        <div key={i} className="flex items-center gap-2 group p-2 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                            <div className="flex items-center justify-center w-6 shrink-0">
                                <span className="text-[10px] font-bold text-slate-400 tabular-nums">{i + 1}</span>
                            </div>
                            <ImagePreview url={img} />
                            <Input
                                value={img}
                                onChange={(e) => handleHeroImageChange(i, e.target.value, isMobile)}
                                placeholder={`Paste image URL for slide ${i + 1}...`}
                                className="flex-1 h-9 text-xs bg-white border-slate-200 focus:border-blue-300 rounded-lg"
                            />
                            {img && img.trim() !== "" && (
                                <a href={img} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-500 shrink-0">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => removeHeroImage(i, isMobile)}
                                className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0 opacity-0 group-hover:opacity-100 transition-all rounded-lg">
                                <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ─── Contact Field Renderer ─────────────────────────────────────────────
    const renderContactField = (label: string, key: keyof ContactInfo, placeholder: string) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600">{label}</Label>
                <Button size="sm" variant="ghost" onClick={() => addContactItem(key)} className="h-6 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 rounded-md gap-1">
                    <Plus className="w-3 h-3" /> Add
                </Button>
            </div>
            {(contactInfo[key] as string[]).length === 0 ? (
                <p className="text-[11px] text-slate-400 italic pl-1">No {label.toLowerCase()} added yet.</p>
            ) : (
                (contactInfo[key] as string[]).map((val, i) => (
                    <div key={i} className="flex gap-2 items-center">
                        <Input value={val} onChange={(e) => updateContactArray(key, i, e.target.value)}
                            placeholder={placeholder} className="h-8 text-xs bg-white border-slate-200 flex-1 rounded-lg" />
                        <button onClick={() => removeContactItem(key, i)}
                            className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1 rounded hover:bg-red-50">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div className="space-y-4 pb-20">

            {/* ═══════════════════════════════════════════════════════════════
                1) HERO SECTION — Full width, always open by default
               ═══════════════════════════════════════════════════════════════ */}
            <CmsSection
                title="Hero Section"
                icon={<LayoutTemplate className="w-5 h-5" />}
                description="Configure the hero banner text, animation, and slide images"
                badge={<CountBadge count={heroImages.filter(u => u.trim() !== "").length + mobileHeroImages.filter(u => u.trim() !== "").length} label="slides" />}
            >
                <div className="space-y-6">
                    {/* Text & Animation Config */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-1.5">
                            <Label className="text-xs font-medium text-slate-600">Hero Title</Label>
                            <Input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)}
                                placeholder="Welcome to Promise Electronics"
                                className="bg-white border-slate-200 focus:border-blue-300" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-slate-600">Animation Style</Label>
                            <Select value={heroAnimationType} onValueChange={setHeroAnimationType}>
                                <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fade">Fade</SelectItem>
                                    <SelectItem value="slide">Slide</SelectItem>
                                    <SelectItem value="zoom">Zoom</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">Hero Subtitle</Label>
                        <Textarea value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)}
                            placeholder="Your trusted electronics repair partner in Dhaka..."
                            className="bg-white border-slate-200 min-h-[60px] focus:border-blue-300" />
                    </div>

                    <Separator />

                    {/* Desktop Slides */}
                    {renderSlideList(heroImages, false, <Monitor className="w-4 h-4 text-slate-500" />, "Desktop Slides")}

                    <Separator className="opacity-50" />

                    {/* Mobile Slides */}
                    {renderSlideList(mobileHeroImages, true, <Smartphone className="w-4 h-4 text-slate-500" />, "Mobile Slides")}
                </div>
            </CmsSection>

            {/* ═══════════════════════════════════════════════════════════════
                2) CONTENT SECTIONS — Two-column layout
               ═══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Info Boxes */}
                <CmsSection
                    title="Info Boxes"
                    icon={<MessageSquare className="w-5 h-5" />}
                    description="Highlight cards shown below the hero banner"
                    badge={<CountBadge count={infoBoxes.length} />}
                    defaultOpen={false}
                >
                    <div className="space-y-3">
                        {infoBoxes.length === 0 ? (
                            <EmptyState message="No info boxes configured." onAdd={() => setNewInfoBox({ title: "New Box", description: "" })} addLabel="Add Info Box" />
                        ) : (
                            infoBoxes.map((box, i) => (
                                <div key={box.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2 group hover:border-blue-200 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className="text-[10px] h-5 font-mono">#{i + 1}</Badge>
                                        <Button size="icon" variant="ghost" onClick={() => setInfoBoxes(infoBoxes.filter(b => b.id !== box.id))}
                                            className="h-6 w-6 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <Input value={box.title} onChange={(e) => { const n = [...infoBoxes]; n[i].title = e.target.value; setInfoBoxes(n); }}
                                        placeholder="Title" className="h-8 text-sm bg-white border-slate-200 font-medium" />
                                    <Input value={box.description} onChange={(e) => { const n = [...infoBoxes]; n[i].description = e.target.value; setInfoBoxes(n); }}
                                        placeholder="Description" className="h-8 text-xs bg-white border-slate-200" />
                                </div>
                            ))
                        )}
                        {/* Add new row */}
                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                            <Input value={newInfoBox.title} onChange={(e) => setNewInfoBox({ ...newInfoBox, title: e.target.value })}
                                placeholder="Title" className="bg-white text-sm" />
                            <Input value={newInfoBox.description} onChange={(e) => setNewInfoBox({ ...newInfoBox, description: e.target.value })}
                                placeholder="Description" className="bg-white text-sm flex-[2]" />
                            <Button onClick={addInfoBox} disabled={!newInfoBox.title} size="icon" className="shrink-0 rounded-lg">
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </CmsSection>

                {/* Homepage Stats */}
                <CmsSection
                    title="Homepage Stats"
                    icon={<DollarSign className="w-5 h-5" />}
                    description="Counter numbers displayed on the homepage"
                    badge={<CountBadge count={homepageStats.length} label="stats" />}
                    defaultOpen={false}
                >
                    <div className="space-y-3">
                        {homepageStats.length === 0 ? (
                            <EmptyState message="No stats configured." />
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {homepageStats.map((stat, i) => (
                                    <div key={stat.id} className="p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 space-y-2">
                                        <Badge variant="outline" className="text-[10px] h-5 font-mono">Stat {i + 1}</Badge>
                                        <Input value={stat.value} onChange={(e) => { const n = [...homepageStats]; n[i].value = e.target.value; setHomepageStats(n); }}
                                            placeholder="Value (e.g. 5000)" className="h-8 text-xs bg-white border-slate-200" />
                                        <Input value={stat.label} onChange={(e) => { const n = [...homepageStats]; n[i].label = e.target.value; setHomepageStats(n); }}
                                            placeholder="Label (e.g. Repairs Done)" className="h-8 text-xs bg-white border-slate-200" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CmsSection>

                {/* FAQ Section */}
                <CmsSection
                    title="FAQ"
                    icon={<HelpCircle className="w-5 h-5" />}
                    description="Frequently asked questions shown on the homepage"
                    badge={<CountBadge count={faqItems.length} label="questions" />}
                    defaultOpen={false}
                    className="lg:col-span-2"
                >
                    <div className="space-y-3">
                        {faqItems.length === 0 ? (
                            <EmptyState message="No FAQ items configured." onAdd={() => setNewFaq({ question: "Sample question?", answer: "" })} addLabel="Add FAQ" />
                        ) : (
                            faqItems.map((faq, i) => (
                                <div key={faq.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2 group hover:border-blue-200 transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px] h-5 font-mono shrink-0">Q{i + 1}</Badge>
                                                <Input value={faq.question} onChange={(e) => { const n = [...faqItems]; n[i].question = e.target.value; setFaqItems(n); }}
                                                    className="h-8 font-medium bg-white border-slate-200 text-sm" placeholder="Question" />
                                            </div>
                                            <Textarea value={faq.answer} onChange={(e) => { const n = [...faqItems]; n[i].answer = e.target.value; setFaqItems(n); }}
                                                className="bg-white border-slate-200 text-xs min-h-[50px]" placeholder="Answer" />
                                        </div>
                                        <Button size="icon" variant="ghost" onClick={() => setFaqItems(faqItems.filter(f => f.id !== faq.id))}
                                            className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                        {/* Add new FAQ */}
                        <div className="p-3 rounded-xl border-2 border-dashed border-slate-200 bg-white/50 space-y-2">
                            <Input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                                placeholder="New question..." className="bg-white text-sm" />
                            <div className="flex gap-2">
                                <Textarea value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                                    placeholder="Answer..." className="bg-white text-xs min-h-[40px] flex-1" />
                                <Button onClick={addFaq} disabled={!newFaq.question || !newFaq.answer}
                                    className="self-end shrink-0 rounded-lg" size="sm">
                                    <Plus className="w-4 h-4 mr-1.5" /> Add
                                </Button>
                            </div>
                        </div>
                    </div>
                </CmsSection>

                {/* Contact Info */}
                <CmsSection
                    title="Contact Info"
                    icon={<Phone className="w-5 h-5" />}
                    description="Phone numbers, emails, and addresses displayed on homepage"
                    defaultOpen={false}
                >
                    <div className="space-y-5 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
                        {renderContactField("Phone Numbers", "phoneNumbers", "+880 1XXX-XXXXXX")}
                        <Separator className="opacity-50" />
                        {renderContactField("Email Addresses", "emails", "email@example.com")}
                        <Separator className="opacity-50" />
                        {renderContactField("Address Lines", "addressLines", "123 Street, City")}
                        <Separator className="opacity-50" />
                        {renderContactField("Working Hours", "workingHoursLines", "Sat-Thu: 10AM – 8PM")}
                        <Separator className="opacity-50" />
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">WhatsApp Number</Label>
                            <Input value={contactInfo.whatsappNumber || ""} onChange={(e) => setContactInfo({ ...contactInfo, whatsappNumber: e.target.value })}
                                placeholder="+880 1XXXXXXXXX" className="h-8 text-xs bg-white border-slate-200 rounded-lg" />
                        </div>
                    </div>
                </CmsSection>

                {/* Service Areas */}
                <CmsSection
                    title="Service Areas"
                    icon={<MapPin className="w-5 h-5" />}
                    description="Locations displayed in the service coverage section"
                    badge={<CountBadge count={serviceAreas.length} label="areas" />}
                    defaultOpen={false}
                >
                    <TagListCard
                        title=""
                        icon={null}
                        items={serviceAreas}
                        setItems={setServiceAreas}
                        placeholder="Add area (e.g. Uttara)"
                        accentColor="rose"
                    />
                </CmsSection>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                3) BRANDS & PRICING — Full width sections
               ═══════════════════════════════════════════════════════════════ */}
            <CmsSection
                title="Brands We Service"
                icon={<ShoppingBag className="w-5 h-5" />}
                description="Brand logos and names displayed on the homepage"
                badge={<CountBadge count={homepageBrands.length} label="brands" />}
                defaultOpen={false}
            >
                <div className="space-y-4">
                    {homepageBrands.length === 0 ? (
                        <EmptyState message="No brands configured." onAdd={() => setNewBrand("New Brand")} addLabel="Add Brand" />
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {homepageBrands.map((brand) => (
                                <div key={brand.id} className="group relative flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                                    <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden border border-slate-100 shrink-0">
                                        {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
                                    </div>
                                    <span className="text-xs font-medium text-slate-700 truncate flex-1">{brand.name}</span>
                                    <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <label className="cursor-pointer text-blue-500 hover:text-blue-600 p-1 rounded hover:bg-blue-50">
                                            <Upload className="w-3 h-3" />
                                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadBrandLogo?.(brand.id, e.target.files[0])} />
                                        </label>
                                        <button onClick={() => setHomepageBrands(homepageBrands.filter(b => b.id !== brand.id))}
                                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 pt-3 border-t border-slate-100 max-w-sm">
                        <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
                            placeholder="New brand name" className="bg-white text-sm" />
                        <Button onClick={addBrand} disabled={!newBrand} size="sm" className="shrink-0 rounded-lg">
                            <Plus className="w-4 h-4 mr-1.5" /> Add
                        </Button>
                    </div>
                </div>
            </CmsSection>

            {/* Pricing Table */}
            <CmsSection
                title="Pricing Table"
                icon={<DollarSign className="w-5 h-5" />}
                description="Service pricing displayed on the homepage"
                badge={<CountBadge count={pricingTable.length} label="services" />}
                defaultOpen={false}
            >
                <div className="space-y-3">
                    {pricingTable.length === 0 ? (
                        <EmptyState message="No pricing items configured." onAdd={() => setNewPricing({ service: "Screen Repair", price: "500", note: "" })} addLabel="Add Pricing" />
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="text-xs font-semibold text-slate-600 h-9">Service</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 h-9 w-28">Price</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 h-9">Note</TableHead>
                                        <TableHead className="w-[40px] h-9"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pricingTable.map((item, i) => (
                                        <TableRow key={item.id} className="group hover:bg-blue-50/30">
                                            <TableCell className="p-1.5">
                                                <Input value={item.service} onChange={(e) => { const n = [...pricingTable]; n[i].service = e.target.value; setPricingTable(n); }}
                                                    className="h-8 bg-transparent border-0 focus:bg-white focus:border-slate-200 px-2 text-sm rounded-lg" />
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <Input value={item.price} onChange={(e) => { const n = [...pricingTable]; n[i].price = e.target.value; setPricingTable(n); }}
                                                    className="h-8 bg-transparent border-0 focus:bg-white focus:border-slate-200 px-2 text-sm w-24 rounded-lg font-mono" />
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <Input value={item.note} onChange={(e) => { const n = [...pricingTable]; n[i].note = e.target.value; setPricingTable(n); }}
                                                    className="h-8 bg-transparent border-0 focus:bg-white focus:border-slate-200 px-2 text-xs text-slate-500 rounded-lg" />
                                            </TableCell>
                                            <TableCell className="p-1.5">
                                                <button onClick={() => setPricingTable(pricingTable.filter(p => p.id !== item.id))}
                                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-red-50">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {/* Add new pricing */}
                    <div className="flex gap-2 pt-2">
                        <Input value={newPricing.service} onChange={(e) => setNewPricing({ ...newPricing, service: e.target.value })}
                            placeholder="Service name" className="bg-white text-sm" />
                        <Input value={newPricing.price} onChange={(e) => setNewPricing({ ...newPricing, price: e.target.value })}
                            placeholder="Price" className="bg-white text-sm w-28" />
                        <Input value={newPricing.note} onChange={(e) => setNewPricing({ ...newPricing, note: e.target.value })}
                            placeholder="Note (optional)" className="bg-white text-sm" />
                        <Button onClick={addPricing} disabled={!newPricing.service || !newPricing.price} size="icon" className="shrink-0 rounded-lg">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CmsSection>

            {/* ═══════════════════════════════════════════════════════════════
                4) WIDGETS — Track Repair & Map
               ═══════════════════════════════════════════════════════════════ */}
            <CmsSection
                title="Widgets & Integrations"
                icon={<Map className="w-5 h-5" />}
                description="Track repair toggle and Google Maps embed configuration"
                defaultOpen={false}
            >
                <div className="space-y-5">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-blue-50/50 border border-slate-100">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-semibold text-slate-700">Track Repair Widget</Label>
                            <p className="text-xs text-slate-400">Show "Check Repair Status" button on the hero section</p>
                        </div>
                        <Switch checked={trackRepairEnabled} onCheckedChange={setTrackRepairEnabled} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-600">Google Map Embed URL</Label>
                        <Input value={googleMapUrl} onChange={(e) => setGoogleMapUrl(e.target.value)}
                            placeholder="https://www.google.com/maps/embed?pb=..."
                            className="bg-white border-slate-200 text-xs" />
                        {googleMapUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 h-[180px]">
                                <iframe src={googleMapUrl} title="Map Preview" className="w-full h-full border-0" loading="lazy" />
                            </div>
                        )}
                    </div>
                </div>
            </CmsSection>

        </div>
    );
}
