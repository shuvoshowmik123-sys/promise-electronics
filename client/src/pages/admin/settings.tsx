import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Save, Plus, Trash2, Globe, Image as ImageIcon, Settings as SettingsIcon, PenTool, Loader2, Info, Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, ArrowUp, ArrowDown, Pencil, Users, AlertTriangle, Search, X, FileText, Star, MessageSquare, Power, MonitorOff, Maximize, VolumeX, WifiOff, AlignJustify, HelpCircle, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect, useRef, useMemo } from "react";
import { images } from "@/lib/mock-data";
import { settingsApi, inventoryApi, policiesApi, adminReviewsApi, type Policy } from "@/lib/api";
import type { CustomerReview } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { playNotificationSound, NOTIFICATION_TONES, type NotificationTone } from "@/lib/notification-sound";

const POLICY_DEFINITIONS = [
  { slug: "privacy", title: "Privacy Policy", description: "How you collect, use, and protect customer data" },
  { slug: "warranty", title: "Warranty Policy", description: "Terms and conditions for product and service warranties" },
  { slug: "terms", title: "Terms & Conditions", description: "General terms of service for your business" },
];

function ReviewsModerationTab() {
  const queryClient = useQueryClient();
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: adminReviewsApi.getAll,
  });

  const toggleApprovalMutation = useMutation({
    mutationFn: ({ id, isApproved }: { id: string; isApproved: boolean }) =>
      adminReviewsApi.toggleApproval(id, isApproved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["approved-reviews"] });
      toast.success("Review updated");
    },
    onError: () => toast.error("Failed to update review"),
  });

  const deleteMutation = useMutation({
    mutationFn: adminReviewsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["approved-reviews"] });
      toast.success("Review deleted");
    },
    onError: () => toast.error("Failed to delete review"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Customer Reviews Moderation
        </CardTitle>
        <CardDescription>
          Approve or reject customer reviews before they appear on the homepage
        </CardDescription>
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-medium mb-2">No Reviews Yet</h3>
            <p className="text-muted-foreground">
              Customer reviews will appear here once submitted.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="max-w-[300px]">Review</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review: CustomerReview) => (
                <TableRow key={review.id} data-testid={`review-row-${review.id}`}>
                  <TableCell className="font-medium">{review.customerName}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    {review.title && <p className="font-medium text-sm">{review.title}</p>}
                    <p className="text-sm text-muted-foreground line-clamp-2">{review.content}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={review.isApproved ? "default" : "secondary"}>
                      {review.isApproved ? "Approved" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={review.isApproved ? "outline" : "default"}
                        onClick={() => toggleApprovalMutation.mutate({ id: review.id, isApproved: !review.isApproved })}
                        disabled={toggleApprovalMutation.isPending}
                        data-testid={`button-toggle-approval-${review.id}`}
                      >
                        {review.isApproved ? <XCircle className="w-4 h-4 mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                        {review.isApproved ? "Reject" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(review.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-review-${review.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PoliciesTab({ onEdit }: { onEdit: (policy: { slug: string; title: string; content: string; isPublished: boolean }) => void }) {
  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["admin-policies"],
    queryFn: policiesApi.getAll,
  });

  const getPolicyData = (slug: string) => policies.find((p) => p.slug === slug);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {POLICY_DEFINITIONS.map((def) => {
        const policy = getPolicyData(def.slug);
        return (
          <Card key={def.slug} data-testid={`card-policy-${def.slug}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-lg">{def.title}</CardTitle>
                </div>
                {policy ? (
                  <Badge variant={policy.isPublished ? "default" : "secondary"} data-testid={`badge-policy-status-${def.slug}`}>
                    {policy.isPublished ? "Published" : "Draft"}
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid={`badge-policy-status-${def.slug}`}>Not Created</Badge>
                )}
              </div>
              <CardDescription>{def.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  {policy?.updatedAt ? (
                    <span data-testid={`text-policy-updated-${def.slug}`}>
                      Last updated: {new Date(policy.updatedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span data-testid={`text-policy-updated-${def.slug}`}>Not created yet</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onEdit({
                    slug: def.slug,
                    title: policy?.title || def.title,
                    content: policy?.content || "",
                    isPublished: policy?.isPublished || false,
                  })}
                  data-testid={`button-edit-policy-${def.slug}`}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {policy ? "Edit Policy" : "Create Policy"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAdminAuth();
  const isSuperAdmin = user?.role === "Super Admin";

  // Delete All Data state
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [heroTitle, setHeroTitle] = useState("Expert Care for Your Premium Electronics");
  const [heroSubtitle, setHeroSubtitle] = useState("We combine expert repair services with a premium marketplace. From 4K TV repairs to authentic parts, Promise Electronics is your integrated solution.");
  const [heroAnimationType, setHeroAnimationType] = useState("fade");
  const [siteName, setSiteName] = useState("Promise Electronics");
  const [supportPhone, setSupportPhone] = useState("+880 1700-000000");
  const [serviceCenterContact, setServiceCenterContact] = useState("01700-000000");
  const [businessHours, setBusinessHours] = useState("9:00 AM - 9:00 PM");
  const [currencySymbol, setCurrencySymbol] = useState("à§³");
  const [vatPercentage, setVatPercentage] = useState("5");
  const [timezone, setTimezone] = useState("asia-dhaka");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowRegistrations, setAllowRegistrations] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [heroImages, setHeroImages] = useState<string[]>(["", "", ""]);
  const [mobileHeroImages, setMobileHeroImages] = useState<string[]>(["", "", ""]);
  const [serviceCategories, setServiceCategories] = useState<string[]>(["No Power", "No Display", "Broken Screen", "Sound Issue", "Software"]);
  const [shopCategories, setShopCategories] = useState<string[]>(["Televisions", "Spare Parts", "Accessories", "Audio Systems", "Cables"]);
  const [tvBrands, setTvBrands] = useState<string[]>(["Sony", "Samsung", "LG", "Walton", "Vision"]);
  const [tvInches, setTvInches] = useState<string[]>(["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"]);
  const [commonSymptoms, setCommonSymptoms] = useState<string[]>(["Blinking Red Light", "Lines on Screen", "Dim Picture", "Wifi Not Connecting", "Remote Not Working", "Burning Smell"]);
  const [serviceFilterCategories, setServiceFilterCategories] = useState<string[]>(["LED TV Repair", "LCD TV Repair", "Smart TV Repair", "Monitor Repair", "Projector Repair"]);
  const [newCategory, setNewCategory] = useState("");
  const [newFilterCategory, setNewFilterCategory] = useState("");
  const [newShopCategory, setNewShopCategory] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newInch, setNewInch] = useState("");
  const [newSymptom, setNewSymptom] = useState("");
  const [nativeHomeBannerImage, setNativeHomeBannerImage] = useState("https://images.unsplash.com/photo-1593784991095-a205069470b6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80");
  const [notificationTone, setNotificationTone] = useState<NotificationTone>("default");

  // About Us settings
  const [aboutTitle, setAboutTitle] = useState("Your Trusted Electronics Partner in Bangladesh");
  const [aboutDescription, setAboutDescription] = useState("Promise Electronics has been serving Bangladesh since 2010, providing expert TV repair services and genuine electronic parts. We are committed to delivering quality service with transparency and trust.");
  const [aboutMission, setAboutMission] = useState("To provide affordable, reliable, and expert electronics repair services while offering genuine spare parts to every household in Bangladesh.");
  const [aboutVision, setAboutVision] = useState("To become the most trusted electronics service provider in Bangladesh, known for quality, integrity, and customer satisfaction.");
  const [aboutCapabilities, setAboutCapabilities] = useState<string[]>(["Expert TV Repair for all major brands", "Genuine spare parts and accessories", "Home service across Dhaka", "Corporate maintenance contracts", "24/7 customer support", "90-day service warranty"]);
  const [aboutTeam, setAboutTeam] = useState("Our team consists of certified technicians with over 10 years of experience in electronics repair. Each technician undergoes rigorous training to stay updated with the latest technologies.");
  const [aboutAddress, setAboutAddress] = useState("House 123, Road 45, Gulshan-2, Dhaka 1212, Bangladesh");
  const [aboutEmail, setAboutEmail] = useState("support@promise-electronics.com");
  const [aboutWorkingHours, setAboutWorkingHours] = useState("Saturday - Thursday: 9:00 AM - 8:00 PM");
  const [newCapability, setNewCapability] = useState("");

  // Team Members
  interface TeamMember {
    id: string;
    name: string;
    role: string;
    photoUrl: string;
    bio?: string;
  }
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [newMember, setNewMember] = useState<TeamMember>({ id: "", name: "", role: "", photoUrl: "", bio: "" });

  // Info Boxes (feature highlights on home page)
  interface InfoBox {
    id: string;
    title: string;
    description: string;
  }
  const [infoBoxes, setInfoBoxes] = useState<InfoBox[]>([
    { id: "1", title: "Certified Technicians", description: "Expert repair by trained professionals" },
    { id: "2", title: "Quick Turnaround", description: "Most repairs completed within 24-48 hours" },
    { id: "3", title: "Genuine Parts", description: "We use only original manufacturer parts" },
  ]);
  const [newInfoBox, setNewInfoBox] = useState<InfoBox>({ id: "", title: "", description: "" });

  // Homepage Stats
  interface HomepageStat {
    id: string;
    value: number;
    suffix: string;
    label: string;
    iconName: string;
  }
  const [homepageStats, setHomepageStats] = useState<HomepageStat[]>([
    { id: "1", value: 500, suffix: "+", label: "Happy Customers", iconName: "Users" },
    { id: "2", value: 1000, suffix: "+", label: "TVs Repaired", iconName: "Wrench" },
    { id: "3", value: 5, suffix: "+", label: "Years Experience", iconName: "Clock" },
    { id: "4", value: 10, suffix: "+", label: "Expert Technicians", iconName: "ShieldCheck" },
  ]);

  // FAQ Items
  interface FAQItem {
    id: string;
    question: string;
    answer: string;
  }
  const defaultFAQs: FAQItem[] = [
    { id: "1", question: "How long does a typical repair take?", answer: "Most repairs are completed within 24-48 hours. For complex issues like panel replacements, it may take 3-5 business days. We'll provide an accurate timeline after diagnosis." },
    { id: "2", question: "Do you offer warranty on repairs?", answer: "Yes! All our repairs come with a 90-day warranty covering both parts and labor. If the same issue recurs within this period, we'll fix it free of charge." },
    { id: "3", question: "What brands do you service?", answer: "We service all major TV brands including Samsung, LG, Sony, Panasonic, Philips, Toshiba, TCL, Hisense, and many more. Our technicians are trained on both LCD and LED/OLED technologies." },
    { id: "4", question: "How much does a TV repair cost?", answer: "Repair costs vary depending on the issue. Common repairs range from à§³1,500 to à§³8,000. Panel replacements may cost more. We provide a free diagnosis and transparent quote before any work begins." },
    { id: "5", question: "Do you offer home pickup and delivery?", answer: "Yes, we offer convenient pickup and delivery services across Dhaka. Our team will safely transport your TV to our service center and return it after repair at a nominal fee." },
    { id: "6", question: "What payment methods do you accept?", answer: "We accept cash, bKash, Nagad, bank transfers, and all major credit/debit cards. Payment is only required after your TV is successfully repaired and tested." },
  ];
  const [faqItems, setFaqItems] = useState<FAQItem[]>(defaultFAQs);
  const [newFaq, setNewFaq] = useState<FAQItem>({ id: "", question: "", answer: "" });

  // Homepage Contact Info
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
  const [contactInfo, setContactInfo] = useState<ContactInfo>(defaultContactInfo);

  // Service Areas
  const defaultServiceAreas = [
    "Gulshan", "Banani", "Dhanmondi", "Uttara", "Mirpur", "Mohammadpur",
    "Bashundhara", "Baridhara", "Motijheel", "Tejgaon", "Farmgate", "Badda",
    "Rampura", "Khilgaon", "Shyamoli", "Mohakhali", "Lalmatia", "Elephant Road"
  ];
  const [serviceAreas, setServiceAreas] = useState<string[]>(defaultServiceAreas);
  const [newServiceArea, setNewServiceArea] = useState("");

  // Homepage Brands
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
  const [homepageBrands, setHomepageBrands] = useState<HomepageBrand[]>(defaultBrands);
  const [newBrandName, setNewBrandName] = useState("");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [isUploadingBrandLogo, setIsUploadingBrandLogo] = useState<string | null>(null);

  // NEW: Track Repair Widget
  const [trackRepairEnabled, setTrackRepairEnabled] = useState(true);

  // NEW: Problem-Based Navigation
  interface ProblemNavItem {
    id: string;
    title: string;
    icon: string;
    iconUrl?: string; // Custom uploaded icon URL
  }
  const [problemNavItems, setProblemNavItems] = useState<ProblemNavItem[]>([
    { id: "1", title: "No Power", icon: "Power" },
    { id: "2", title: "No Picture", icon: "MonitorOff" },
    { id: "3", title: "Broken Screen", icon: "Maximize" },
    { id: "4", title: "Sound Issue", icon: "VolumeX" },
    { id: "5", title: "WiFi Issue", icon: "WifiOff" },
    { id: "6", title: "Lines on Screen", icon: "AlignJustify" },
  ]);
  const [newProblemItem, setNewProblemItem] = useState<ProblemNavItem>({ id: "", title: "", icon: "HelpCircle", iconUrl: "" });
  const [isUploadingProblemIcon, setIsUploadingProblemIcon] = useState<string | null>(null);

  // NEW: Before/After Gallery
  interface BeforeAfterItem {
    id: string;
    title: string;
    beforeImage: string;
    afterImage: string;
  }
  const [beforeAfterGallery, setBeforeAfterGallery] = useState<BeforeAfterItem[]>([]);
  const [newBeforeAfter, setNewBeforeAfter] = useState<BeforeAfterItem>({ id: "", title: "", beforeImage: "", afterImage: "" });

  // NEW: Pricing Table
  interface PricingItem {
    id: string;
    service: string;
    price: string;
    note?: string;
  }
  const [pricingTable, setPricingTable] = useState<PricingItem[]>([
    { id: "1", service: "General Diagnosis", price: "Free", note: "If service is taken" },
    { id: "2", service: "Software Update", price: "500", note: "Starting from" },
    { id: "3", service: "Backlight Repair", price: "1500", note: "Starting from" },
    { id: "4", service: "Motherboard Repair", price: "2500", note: "Starting from" },
  ]);
  const [newPricingItem, setNewPricingItem] = useState<PricingItem>({ id: "", service: "", price: "", note: "" });

  // NEW: Google Map
  const [googleMapUrl, setGoogleMapUrl] = useState("");

  // Bulk Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Policy editing state
  const [editingPolicy, setEditingPolicy] = useState<{ slug: string; title: string; content: string; isPublished: boolean } | null>(null);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);

  // Settings Search
  const [settingsSearch, setSettingsSearch] = useState("");
  const [activeTab, setActiveTab] = useState("cms");

  // Searchable sections metadata
  const settingsSections = [
    { id: "site-identity", tab: "general", title: "Site Identity & Branding", keywords: ["site name", "logo", "branding", "company name"] },
    { id: "business-operations", tab: "general", title: "Business Operations", keywords: ["phone", "support", "hours", "business hours", "currency", "vat", "tax", "timezone"] },
    { id: "system-controls", tab: "general", title: "System Controls", keywords: ["maintenance", "registrations", "developer mode", "dev mode"] },
    { id: "delete-data", tab: "general", title: "Delete All Data", keywords: ["delete", "reset", "clear data", "danger"] },
    { id: "hero-section", tab: "cms", title: "Hero Section Configuration", keywords: ["hero", "banner", "headline", "title", "subtitle", "animation", "slideshow", "images"] },
    { id: "promotional-banners", tab: "cms", title: "Promotional Banners", keywords: ["banner", "promotion", "sale", "announcement"] },
    { id: "info-boxes", tab: "cms", title: "Info Boxes", keywords: ["info", "features", "highlights", "certified", "technicians"] },
    { id: "homepage-stats", tab: "cms", title: "Homepage Stats", keywords: ["stats", "statistics", "counter", "customers", "repaired", "experience", "technicians", "numbers"] },
    { id: "homepage-faq", tab: "cms", title: "FAQ Section", keywords: ["faq", "questions", "answers", "frequently asked", "help"] },
    { id: "homepage-contact", tab: "cms", title: "Contact Info Section", keywords: ["contact", "address", "phone", "email", "whatsapp", "working hours"] },
    { id: "homepage-service-areas", tab: "cms", title: "Service Areas", keywords: ["service areas", "locations", "dhaka", "delivery", "pickup", "areas"] },
    { id: "homepage-brands", tab: "cms", title: "Brands We Service", keywords: ["brands", "logos", "samsung", "lg", "sony", "manufacturer", "carousel"] },
    { id: "track-repair", tab: "cms", title: "Track Repair Widget", keywords: ["track", "repair", "widget", "hero"] },
    { id: "problem-nav", tab: "cms", title: "Problem Navigation", keywords: ["problems", "issues", "symptoms", "navigation"] },
    { id: "before-after", tab: "cms", title: "Before & After Gallery", keywords: ["gallery", "before", "after", "comparison"] },
    { id: "pricing-table", tab: "cms", title: "Pricing Table", keywords: ["pricing", "cost", "table", "charges"] },
    { id: "google-map", tab: "cms", title: "Google Map Embed", keywords: ["map", "location", "google map", "embed"] },
    { id: "about-company", tab: "about", title: "About Company", keywords: ["about", "company", "description", "mission", "vision"] },
    { id: "company-contact", tab: "about", title: "Contact Information", keywords: ["contact", "address", "email", "working hours", "location"] },
    { id: "team-members", tab: "about", title: "Team Members", keywords: ["team", "staff", "employees", "members", "people"] },
    { id: "service-categories", tab: "service", title: "Service Categories", keywords: ["service", "categories", "repair types", "issue types"] },
    { id: "shop-categories", tab: "service", title: "Shop Categories", keywords: ["shop", "product categories", "store"] },
    { id: "tv-brands", tab: "service", title: "TV Brands", keywords: ["tv", "brands", "sony", "samsung", "lg", "walton"] },
    { id: "tv-sizes", tab: "service", title: "TV Sizes", keywords: ["tv", "sizes", "inches", "screen size"] },
    { id: "common-symptoms", tab: "service", title: "Common Symptoms", keywords: ["symptoms", "problems", "issues", "faults"] },
    { id: "service-filter", tab: "service", title: "Service Filter Categories", keywords: ["filter", "service filter", "led", "lcd", "smart tv", "monitor"] },
    { id: "data-import", tab: "data-import", title: "Bulk Import Inventory", keywords: ["import", "csv", "bulk", "upload", "inventory"] },
    { id: "policies", tab: "policies", title: "Policies", keywords: ["privacy", "warranty", "terms", "policy", "legal"] },
  ];

  const filteredSections = settingsSections.filter((section) => {
    if (!settingsSearch.trim()) return true;
    const searchLower = settingsSearch.toLowerCase();
    return (
      section.title.toLowerCase().includes(searchLower) ||
      section.keywords.some((kw) => kw.toLowerCase().includes(searchLower))
    );
  });

  const matchingTabs = Array.from(new Set(filteredSections.map((s) => s.tab)));

  const isSectionVisible = (sectionId: string) => {
    if (!settingsSearch.trim()) return true;
    return filteredSections.some((s) => s.id === sectionId);
  };

  // Auto-switch to first matching tab when search results change
  useEffect(() => {
    if (settingsSearch.trim() && matchingTabs.length > 0 && !matchingTabs.includes(activeTab)) {
      setActiveTab(matchingTabs[0]);
    }
  }, [settingsSearch, matchingTabs, activeTab]);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });

  useEffect(() => {
    if (settings.length > 0) {
      settings.forEach((setting) => {
        switch (setting.key) {
          case "hero_title":
            setHeroTitle(setting.value);
            break;
          case "hero_subtitle":
            setHeroSubtitle(setting.value);
            break;
          case "hero_animation_type":
            setHeroAnimationType(setting.value);
            break;
          case "site_name":
            setSiteName(setting.value);
            break;
          case "support_phone":
            setSupportPhone(setting.value);
            break;
          case "service_center_contact":
            setServiceCenterContact(setting.value);
            break;
          case "business_hours":
            setBusinessHours(setting.value);
            break;
          case "currency_symbol":
            setCurrencySymbol(setting.value);
            break;
          case "timezone":
            setTimezone(setting.value);
            break;
          case "vat_percentage":
            setVatPercentage(setting.value);
            break;
          case "maintenance_mode":
            setMaintenanceMode(setting.value === "true");
            break;
          case "allow_registrations":
            setAllowRegistrations(setting.value === "true");
            break;
          case "developer_mode":
            setDeveloperMode(setting.value === "true");
            break;
          case "logo_url":
            setLogoUrl(setting.value);
            break;
          case "hero_images":
            try {
              const parsed = JSON.parse(setting.value);
              if (Array.isArray(parsed)) {
                setHeroImages(parsed.length >= 3 ? parsed : [...parsed, ...Array(3 - parsed.length).fill("")]);
              }
            } catch (e) {
              console.error("Failed to parse hero images");
            }
            break;
          case "mobile_hero_images":
            try {
              const parsed = JSON.parse(setting.value);
              if (Array.isArray(parsed)) {
                setMobileHeroImages(parsed.length >= 3 ? parsed : [...parsed, ...Array(3 - parsed.length).fill("")]);
              }
            } catch (e) {
              console.error("Failed to parse mobile hero images");
            }
            break;
          case "service_categories":
            try {
              setServiceCategories(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse service categories");
            }
            break;
          case "service_filter_categories":
            try {
              setServiceFilterCategories(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse service filter categories");
            }
            break;
          case "tv_brands":
            try {
              setTvBrands(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse TV brands");
            }
            break;
          case "tv_inches":
            try {
              setTvInches(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse TV inches");
            }
            break;
          case "common_symptoms":
            try {
              setCommonSymptoms(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse common symptoms");
            }
            break;
          case "shop_categories":
            try {
              setShopCategories(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse shop categories");
            }
            break;
          case "about_title":
            setAboutTitle(setting.value);
            break;
          case "about_description":
            setAboutDescription(setting.value);
            break;
          case "about_mission":
            setAboutMission(setting.value);
            break;
          case "about_vision":
            setAboutVision(setting.value);
            break;
          case "about_capabilities":
            try {
              setAboutCapabilities(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse about capabilities");
            }
            break;
          case "about_team":
            setAboutTeam(setting.value);
            break;
          case "about_address":
            setAboutAddress(setting.value);
            break;
          case "about_email":
            setAboutEmail(setting.value);
            break;
          case "about_working_hours":
            setAboutWorkingHours(setting.value);
            break;
          case "team_members":
            try {
              setTeamMembers(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse team members");
            }
            break;
          case "info_boxes":
            try {
              setInfoBoxes(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse info boxes");
            }
            break;
          case "homepage_stats":
            try {
              setHomepageStats(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse homepage stats");
            }
            break;
          case "faq_items":
            try {
              setFaqItems(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse FAQ items");
            }
            break;
          case "homepage_contact_info":
            try {
              setContactInfo(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse contact info");
            }
            break;
          case "service_areas":
            try {
              setServiceAreas(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse service areas");
            }
            break;
          case "homepage_brands":
            try {
              setHomepageBrands(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse homepage brands");
            }
            break;
          case "home_track_repair_enabled":
            setTrackRepairEnabled(setting.value === "true");
            break;
          case "home_problems_list":
            try {
              setProblemNavItems(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse problem list");
            }
            break;
          case "home_before_after_gallery":
            try {
              setBeforeAfterGallery(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse before/after gallery");
            }
            break;
          case "home_pricing_table":
            try {
              setPricingTable(JSON.parse(setting.value));
            } catch (e) {
              console.error("Failed to parse pricing table");
            }
            break;
          case "home_google_map_url":
            setGoogleMapUrl(setting.value);
            break;
          case "native_home_banner_image":
            setNativeHomeBannerImage(setting.value);
            break;
          case "notification_tone":
            setNotificationTone(setting.value as NotificationTone);
            break;
        }
      });
    }
  }, [settings]);

  const upsertMutation = useMutation({
    mutationFn: settingsApi.upsert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to save setting");
    },
  });

  const handleSaveAll = async () => {
    const settingsToSave = [
      { key: "hero_title", value: heroTitle },
      { key: "hero_subtitle", value: heroSubtitle },
      { key: "hero_animation_type", value: heroAnimationType },
      { key: "site_name", value: siteName },
      { key: "support_phone", value: supportPhone },
      { key: "service_center_contact", value: serviceCenterContact },
      { key: "business_hours", value: businessHours },
      { key: "currency_symbol", value: currencySymbol },
      { key: "vat_percentage", value: vatPercentage },
      { key: "timezone", value: timezone },
      { key: "maintenance_mode", value: maintenanceMode.toString() },
      { key: "allow_registrations", value: allowRegistrations.toString() },
      { key: "developer_mode", value: developerMode.toString() },
      { key: "logo_url", value: logoUrl },
      { key: "hero_images", value: JSON.stringify(heroImages.filter(url => url && url.trim() !== "")) },
      { key: "mobile_hero_images", value: JSON.stringify(mobileHeroImages.filter(url => url && url.trim() !== "")) },
      { key: "service_categories", value: JSON.stringify(serviceCategories) },
      { key: "service_filter_categories", value: JSON.stringify(serviceFilterCategories) },
      { key: "shop_categories", value: JSON.stringify(shopCategories) },
      { key: "tv_brands", value: JSON.stringify(tvBrands) },
      { key: "tv_inches", value: JSON.stringify(tvInches) },
      { key: "common_symptoms", value: JSON.stringify(commonSymptoms) },
      { key: "about_title", value: aboutTitle },
      { key: "about_description", value: aboutDescription },
      { key: "about_mission", value: aboutMission },
      { key: "about_vision", value: aboutVision },
      { key: "about_capabilities", value: JSON.stringify(aboutCapabilities) },
      { key: "about_team", value: aboutTeam },
      { key: "about_address", value: aboutAddress },
      { key: "about_email", value: aboutEmail },
      { key: "about_working_hours", value: aboutWorkingHours },
      { key: "team_members", value: JSON.stringify(teamMembers) },
      { key: "info_boxes", value: JSON.stringify(infoBoxes) },
      { key: "homepage_stats", value: JSON.stringify(homepageStats) },
      { key: "faq_items", value: JSON.stringify(faqItems) },
      { key: "homepage_contact_info", value: JSON.stringify(contactInfo) },
      { key: "service_areas", value: JSON.stringify(serviceAreas) },
      { key: "homepage_brands", value: JSON.stringify(homepageBrands) },
      { key: "home_track_repair_enabled", value: trackRepairEnabled.toString() },
      { key: "home_problems_list", value: JSON.stringify(problemNavItems) },
      { key: "home_before_after_gallery", value: JSON.stringify(beforeAfterGallery) },
      { key: "home_pricing_table", value: JSON.stringify(pricingTable) },
      { key: "home_google_map_url", value: googleMapUrl },
      { key: "native_home_banner_image", value: nativeHomeBannerImage },
      { key: "notification_tone", value: notificationTone },
    ];

    try {
      await Promise.all(settingsToSave.map((setting) => upsertMutation.mutateAsync(setting)));
      toast.success("All settings saved successfully");
    } catch (error) {
      toast.error("Failed to save some settings");
    }
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !serviceCategories.includes(newCategory.trim())) {
      setServiceCategories([...serviceCategories, newCategory.trim()]);
      setNewCategory("");
    }
  };

  const handleDeleteCategory = (index: number) => {
    setServiceCategories(serviceCategories.filter((_, i) => i !== index));
  };

  const handleAddFilterCategory = () => {
    if (newFilterCategory.trim() && !serviceFilterCategories.includes(newFilterCategory.trim())) {
      setServiceFilterCategories([...serviceFilterCategories, newFilterCategory.trim()]);
      setNewFilterCategory("");
    }
  };

  const handleDeleteFilterCategory = (index: number) => {
    setServiceFilterCategories(serviceFilterCategories.filter((_, i) => i !== index));
  };

  const handleAddBrand = () => {
    if (newBrand.trim() && !tvBrands.includes(newBrand.trim())) {
      setTvBrands([...tvBrands, newBrand.trim()]);
      setNewBrand("");
    }
  };

  const handleDeleteBrand = (index: number) => {
    setTvBrands(tvBrands.filter((_, i) => i !== index));
  };

  const handleAddInch = () => {
    if (newInch.trim() && !tvInches.includes(newInch.trim())) {
      setTvInches([...tvInches, newInch.trim()]);
      setNewInch("");
    }
  };

  const handleDeleteInch = (index: number) => {
    setTvInches(tvInches.filter((_, i) => i !== index));
  };

  const handleAddSymptom = () => {
    if (newSymptom.trim() && !commonSymptoms.includes(newSymptom.trim())) {
      setCommonSymptoms([...commonSymptoms, newSymptom.trim()]);
      setNewSymptom("");
    }
  };

  const handleDeleteSymptom = (index: number) => {
    setCommonSymptoms(commonSymptoms.filter((_, i) => i !== index));
  };

  const handleAddShopCategory = () => {
    if (newShopCategory.trim() && !shopCategories.includes(newShopCategory.trim())) {
      setShopCategories([...shopCategories, newShopCategory.trim()]);
      setNewShopCategory("");
    }
  };

  const handleDeleteShopCategory = (index: number) => {
    setShopCategories(shopCategories.filter((_, i) => i !== index));
  };

  const handleAddCapability = () => {
    if (newCapability.trim() && !aboutCapabilities.includes(newCapability.trim())) {
      setAboutCapabilities([...aboutCapabilities, newCapability.trim()]);
      setNewCapability("");
    }
  };

  const handleDeleteCapability = (index: number) => {
    setAboutCapabilities(aboutCapabilities.filter((_, i) => i !== index));
  };

  // Team Member CRUD
  const handleAddTeamMember = () => {
    if (newMember.name.trim() && newMember.role.trim()) {
      const member: TeamMember = {
        id: `member-${Date.now()}`,
        name: newMember.name.trim(),
        role: newMember.role.trim(),
        photoUrl: newMember.photoUrl.trim(),
        bio: newMember.bio?.trim() || "",
      };
      setTeamMembers([...teamMembers, member]);
      setNewMember({ id: "", name: "", role: "", photoUrl: "", bio: "" });
      toast.success("Team member added. Click 'Save Settings' to persist changes.");
    } else {
      toast.error("Please enter name and role");
    }
  };

  const handleUpdateTeamMember = () => {
    if (editingMember && editingMember.name.trim() && editingMember.role.trim()) {
      const updatedMembers = teamMembers.map(m =>
        m.id === editingMember.id ? editingMember : m
      );
      setTeamMembers(updatedMembers);
      setEditingMember(null);
      toast.success("Team member updated");
    }
  };

  // NEW: Handlers for new sections
  const handleAddProblemItem = () => {
    if (newProblemItem.title.trim()) {
      setProblemNavItems([...problemNavItems, { ...newProblemItem, id: Date.now().toString() }]);
      setNewProblemItem({ id: "", title: "", icon: "HelpCircle", iconUrl: "" });
    }
  };

  const handleDeleteProblemItem = (id: string) => {
    setProblemNavItems(problemNavItems.filter(item => item.id !== id));
  };

  const handleUploadProblemIcon = async (itemId: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setIsUploadingProblemIcon(itemId);

    try {
      const paramsResponse = await fetch("/api/cloudinary/upload-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "image" }),
      });

      if (!paramsResponse.ok) {
        const errorData = await paramsResponse.json().catch(() => ({}));
        if (paramsResponse.status === 503) {
          throw new Error("Image upload is not configured. Please contact support.");
        }
        throw new Error(errorData.message || "Failed to prepare upload");
      }

      const params = await paramsResponse.json();
      const { cloudName, apiKey, signature, timestamp, folder, transformation } = params;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("transformation", transformation);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      const result = await uploadResponse.json();
      setProblemNavItems(problemNavItems.map(item => item.id === itemId ? { ...item, iconUrl: result.secure_url } : item));
      toast.success("Icon uploaded. Click 'Save Settings' to persist.");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload icon");
    } finally {
      setIsUploadingProblemIcon(null);
    }
  };

  const handleRemoveProblemIcon = (itemId: string) => {
    setProblemNavItems(problemNavItems.map(item => item.id === itemId ? { ...item, iconUrl: "" } : item));
    toast.success("Icon removed. Click 'Save Settings' to persist.");
  };

  const handleAddBeforeAfter = () => {
    if (newBeforeAfter.title.trim() && newBeforeAfter.beforeImage && newBeforeAfter.afterImage) {
      setBeforeAfterGallery([...beforeAfterGallery, { ...newBeforeAfter, id: Date.now().toString() }]);
      setNewBeforeAfter({ id: "", title: "", beforeImage: "", afterImage: "" });
    }
  };

  const handleDeleteBeforeAfter = (id: string) => {
    setBeforeAfterGallery(beforeAfterGallery.filter(item => item.id !== id));
  };

  const handleAddPricingItem = () => {
    if (newPricingItem.service.trim() && newPricingItem.price.trim()) {
      setPricingTable([...pricingTable, { ...newPricingItem, id: Date.now().toString() }]);
      setNewPricingItem({ id: "", service: "", price: "", note: "" });
    }
  };

  const handleDeletePricingItem = (id: string) => {
    setPricingTable(pricingTable.filter(item => item.id !== id));
  };

  const handleDeleteTeamMember = (id: string) => {
    setTeamMembers(teamMembers.filter(m => m.id !== id));
    toast.success("Team member removed");
  };

  const moveTeamMember = (index: number, direction: "up" | "down") => {
    const newMembers = [...teamMembers];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < teamMembers.length) {
      [newMembers[index], newMembers[newIndex]] = [newMembers[newIndex], newMembers[index]];
      setTeamMembers(newMembers);
    }
  };

  // Info Box CRUD
  const handleAddInfoBox = () => {
    if (newInfoBox.title.trim()) {
      const infoBox: InfoBox = {
        id: `infobox-${Date.now()}`,
        title: newInfoBox.title.trim(),
        description: newInfoBox.description.trim(),
      };
      setInfoBoxes([...infoBoxes, infoBox]);
      setNewInfoBox({ id: "", title: "", description: "" });
      toast.success("Info box added. Click 'Save Settings' to persist changes.");
    } else {
      toast.error("Please enter a title");
    }
  };

  const handleUpdateInfoBox = (id: string, field: "title" | "description", value: string) => {
    setInfoBoxes(infoBoxes.map(box =>
      box.id === id ? { ...box, [field]: value } : box
    ));
  };

  const handleDeleteInfoBox = (id: string) => {
    setInfoBoxes(infoBoxes.filter(box => box.id !== id));
    toast.success("Info box removed");
  };

  // Homepage Stats handlers
  const handleUpdateStat = (id: string, field: keyof HomepageStat, value: string | number) => {
    setHomepageStats(homepageStats.map(stat =>
      stat.id === id ? { ...stat, [field]: field === "value" ? Number(value) : value } : stat
    ));
  };

  // FAQ handlers
  const handleAddFaq = () => {
    if (newFaq.question.trim() && newFaq.answer.trim()) {
      const faq: FAQItem = {
        id: `faq-${Date.now()}`,
        question: newFaq.question.trim(),
        answer: newFaq.answer.trim(),
      };
      setFaqItems([...faqItems, faq]);
      setNewFaq({ id: "", question: "", answer: "" });
      toast.success("FAQ added. Click 'Save Settings' to persist changes.");
    } else {
      toast.error("Please enter both question and answer");
    }
  };

  const handleUpdateFaq = (id: string, field: "question" | "answer", value: string) => {
    setFaqItems(faqItems.map(faq =>
      faq.id === id ? { ...faq, [field]: value } : faq
    ));
  };

  const handleDeleteFaq = (id: string) => {
    setFaqItems(faqItems.filter(faq => faq.id !== id));
    toast.success("FAQ removed");
  };

  // Contact Info handlers
  const handleUpdateContactArray = (field: keyof ContactInfo, index: number, value: string) => {
    if (field === "whatsappNumber") return;
    const arr = [...(contactInfo[field] as string[])];
    arr[index] = value;
    setContactInfo({ ...contactInfo, [field]: arr });
  };

  const handleAddContactArrayItem = (field: keyof ContactInfo) => {
    if (field === "whatsappNumber") return;
    const arr = [...(contactInfo[field] as string[]), ""];
    setContactInfo({ ...contactInfo, [field]: arr });
  };

  const handleRemoveContactArrayItem = (field: keyof ContactInfo, index: number) => {
    if (field === "whatsappNumber") return;
    const arr = (contactInfo[field] as string[]).filter((_, i) => i !== index);
    setContactInfo({ ...contactInfo, [field]: arr });
  };

  // Service Areas handlers
  const handleAddServiceArea = () => {
    if (newServiceArea.trim() && !serviceAreas.includes(newServiceArea.trim())) {
      setServiceAreas([...serviceAreas, newServiceArea.trim()]);
      setNewServiceArea("");
      toast.success("Service area added. Click 'Save Settings' to persist.");
    } else if (serviceAreas.includes(newServiceArea.trim())) {
      toast.error("This area already exists");
    }
  };

  const handleDeleteServiceArea = (index: number) => {
    setServiceAreas(serviceAreas.filter((_, i) => i !== index));
    toast.success("Service area removed");
  };

  // Homepage Brands handlers
  const handleAddBrandItem = () => {
    if (newBrandName.trim() && !homepageBrands.some(b => b.name.toLowerCase() === newBrandName.trim().toLowerCase())) {
      setHomepageBrands([...homepageBrands, { id: Date.now().toString(), name: newBrandName.trim(), logoUrl: "" }]);
      setNewBrandName("");
      toast.success("Brand added. Click 'Save Settings' to persist.");
    } else if (homepageBrands.some(b => b.name.toLowerCase() === newBrandName.trim().toLowerCase())) {
      toast.error("This brand already exists");
    }
  };

  const handleDeleteBrandItem = (id: string) => {
    setHomepageBrands(homepageBrands.filter(b => b.id !== id));
    toast.success("Brand removed");
  };

  const handleUpdateBrandName = (id: string, name: string) => {
    setHomepageBrands(homepageBrands.map(b => b.id === id ? { ...b, name } : b));
  };

  const handleUploadBrandLogo = async (brandId: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setIsUploadingBrandLogo(brandId);

    try {
      const paramsResponse = await fetch("/api/cloudinary/upload-params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType: "image" }),
      });

      if (!paramsResponse.ok) {
        const errorData = await paramsResponse.json().catch(() => ({}));
        if (paramsResponse.status === 503) {
          throw new Error("Image upload is not configured. Please contact support.");
        }
        throw new Error(errorData.message || "Failed to prepare upload");
      }

      const params = await paramsResponse.json();
      const { cloudName, apiKey, signature, timestamp, folder, transformation } = params;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("transformation", transformation);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload image");
      }

      const result = await uploadResponse.json();
      setHomepageBrands(homepageBrands.map(b => b.id === brandId ? { ...b, logoUrl: result.secure_url } : b));
      toast.success("Logo uploaded. Click 'Save Settings' to persist.");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload logo");
    } finally {
      setIsUploadingBrandLogo(null);
    }
  };

  const handleRemoveBrandLogo = (brandId: string) => {
    setHomepageBrands(homepageBrands.map(b => b.id === brandId ? { ...b, logoUrl: "" } : b));
    toast.success("Logo removed. Click 'Save Settings' to persist.");
  };

  // CSV Template download
  const handleDownloadTemplate = () => {
    const headers = ["id", "name", "category", "description", "stock", "price", "status", "lowStockThreshold", "showOnWebsite"];
    const sampleData = [
      ["INV-001", "Samsung LED Panel 32\"", "Spare Parts", "Original Samsung replacement panel", "15", "12500", "In Stock", "3", "true"],
      ["INV-002", "Universal Remote Control", "Accessories", "Compatible with most TV brands", "50", "450", "In Stock", "10", "true"],
      ["INV-003", "LG Power Board", "Spare Parts", "Power supply board for LG TVs", "8", "3500", "Low Stock", "5", "false"],
    ];

    const csvContent = [
      headers.join(","),
      ...sampleData.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventory_template_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("Template downloaded successfully!");
  };

  // CSV file parsing
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length < 2) {
      setCsvErrors(["CSV file must have at least a header row and one data row"]);
      return;
    }

    const headers = parseCSVRow(lines[0]);
    const requiredHeaders = ["name", "category", "price"];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

    if (missingHeaders.length > 0) {
      setCsvErrors([`Missing required columns: ${missingHeaders.join(", ")}`]);
      return;
    }

    const errors: string[] = [];
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVRow(lines[i]);

      if (values.length !== headers.length) {
        errors.push(`Row ${i}: Column count mismatch (expected ${headers.length}, got ${values.length})`);
        continue;
      }

      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });

      // Validate required fields
      if (!row.name) {
        errors.push(`Row ${i}: Name is required`);
        continue;
      }
      if (!row.category) {
        errors.push(`Row ${i}: Category is required`);
        continue;
      }
      if (!row.price || isNaN(parseFloat(row.price))) {
        errors.push(`Row ${i}: Valid price is required`);
        continue;
      }

      data.push(row);
    }

    setCsvData(data);
    setCsvErrors(errors);
    setImportResult(null);

    if (data.length > 0) {
      toast.success(`Parsed ${data.length} items from CSV`);
    }
  };

  const handleBulkImport = async () => {
    if (csvData.length === 0) {
      toast.error("No data to import");
      return;
    }

    setIsImporting(true);
    try {
      const result = await inventoryApi.bulkImport(csvData);
      setImportResult(result);

      if (result.imported > 0) {
        toast.success(`Successfully imported ${result.imported} items`);
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
      }

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} items failed to import`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to import items");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearImport = () => {
    setCsvData([]);
    setCsvErrors([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleHeroImageChange = (index: number, url: string) => {
    const updated = [...heroImages];
    updated[index] = url;
    setHeroImages(updated);
  };

  const handleMobileHeroImageChange = (index: number, url: string) => {
    const updated = [...mobileHeroImages];
    updated[index] = url;
    setMobileHeroImages(updated);
  };

  const handleDeleteAllData = async () => {
    if (deleteConfirmation !== "DELETE ALL") {
      toast.error("Please type 'DELETE ALL' to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/admin/data/all", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmation: "DELETE ALL" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete data");
      }

      const result = await response.json();
      toast.success("All business data has been deleted successfully!");

      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();

      setShowDeleteAllDialog(false);
      setDeleteConfirmation("");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete data");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">System Settings</h1>
              <p className="text-muted-foreground">Manage site configuration, content, and user permissions.</p>
            </div>
            <Button
              className="gap-2"
              onClick={handleSaveAll}
              disabled={upsertMutation.isPending}
              data-testid="button-save-all"
            >
              {upsertMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" /> Save Changes
            </Button>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search settings (e.g., logo, vat, hero, team)..."
              value={settingsSearch}
              onChange={(e) => setSettingsSearch(e.target.value)}
              className="pl-10 pr-10"
              data-testid="input-settings-search"
            />
            {settingsSearch && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSettingsSearch("")}
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {settingsSearch && (
            <div className="text-sm text-muted-foreground">
              Found {filteredSections.length} matching section{filteredSections.length !== 1 ? "s" : ""}
              {matchingTabs.length > 0 && ` in ${matchingTabs.length} tab${matchingTabs.length !== 1 ? "s" : ""}`}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6 overflow-x-auto">
              <TabsTrigger value="general" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-general"><SettingsIcon className="w-4 h-4 mr-2" /> General</TabsTrigger>
              <TabsTrigger value="cms" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-cms"><Globe className="w-4 h-4 mr-2" /> Home Page (CMS)</TabsTrigger>
              <TabsTrigger value="about" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-about"><Info className="w-4 h-4 mr-2" /> About Us</TabsTrigger>
              <TabsTrigger value="service" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-service"><PenTool className="w-4 h-4 mr-2" /> Service Config</TabsTrigger>
              <TabsTrigger value="data-import" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-data-import"><FileSpreadsheet className="w-4 h-4 mr-2" /> Data Import</TabsTrigger>
              <TabsTrigger value="policies" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-policies"><FileText className="w-4 h-4 mr-2" /> Policies</TabsTrigger>
              <TabsTrigger value="reviews" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-reviews"><MessageSquare className="w-4 h-4 mr-2" /> Reviews</TabsTrigger>
            </TabsList>

            <TabsContent value="cms" className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {isSectionVisible("hero-section") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Hero Section Configuration</CardTitle>
                      <CardDescription>Customize the main banner on the home page for seasonal promotions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Hero Heading</Label>
                        <Input
                          value={heroTitle}
                          onChange={(e) => setHeroTitle(e.target.value)}
                          data-testid="input-hero-title"
                        />
                        <p className="text-xs text-muted-foreground">Main headline visible to all visitors.</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Hero Subtext</Label>
                        <Textarea
                          value={heroSubtitle}
                          onChange={(e) => setHeroSubtitle(e.target.value)}
                          className="min-h-[100px]"
                          data-testid="textarea-hero-subtitle"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Slide Animation Style</Label>
                        <Select value={heroAnimationType} onValueChange={setHeroAnimationType}>
                          <SelectTrigger data-testid="select-hero-animation">
                            <SelectValue placeholder="Select animation style" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fade">Fade</SelectItem>
                            <SelectItem value="slide-left">Slide Left</SelectItem>
                            <SelectItem value="slide-right">Slide Right</SelectItem>
                            <SelectItem value="slide-up">Slide Up</SelectItem>
                            <SelectItem value="slide-down">Slide Down</SelectItem>
                            <SelectItem value="zoom-in">Zoom In</SelectItem>
                            <SelectItem value="zoom-out">Zoom Out</SelectItem>
                            <SelectItem value="flip">Flip</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Choose how hero images transition between slides.</p>
                      </div>

                      <Separator className="my-4" />

                      <div className="space-y-4">
                        <div>
                          <Label className="text-base font-semibold">Hero Slideshow Images</Label>
                          <p className="text-xs text-muted-foreground mt-1">Add image URLs for the rotating hero background. These images will cycle automatically on the homepage.</p>
                        </div>

                        <div className="grid gap-4">
                          {heroImages.map((imageUrl, index) => (
                            <div key={index} className="border rounded-lg p-4 space-y-3" data-testid={`hero-slide-${index}`}>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">Slide {index + 1}</Badge>
                                {imageUrl && <Badge variant="secondary" className="text-xs">Active</Badge>}
                              </div>
                              <div className="flex gap-3 items-start">
                                <div className="w-24 h-16 border rounded overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={`Hero ${index + 1}`} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <Input
                                    placeholder="Enter image URL (e.g., https://example.com/hero.jpg)"
                                    value={imageUrl}
                                    onChange={(e) => handleHeroImageChange(index, e.target.value)}
                                    data-testid={`input-hero-image-${index}`}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">Recommended: 1920x1080px or larger (landscape)</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="my-6" />

                      {/* Mobile Hero Images */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-base font-semibold">Mobile Hero Images (Portrait)</Label>
                          <Badge variant="secondary" className="text-xs">For phones</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Upload portrait-oriented images optimized for mobile phone screens. These will be shown on devices with screen width &lt; 768px.
                        </p>
                        <div className="space-y-4">
                          {mobileHeroImages.map((imageUrl, index) => (
                            <div key={index} className="space-y-2 p-4 border rounded-lg bg-slate-50/50" data-testid={`mobile-hero-image-slot-${index}`}>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">Mobile Slide {index + 1}</Badge>
                                {imageUrl && <Badge variant="secondary" className="text-xs">Active</Badge>}
                              </div>
                              <div className="flex gap-3 items-start">
                                <div className="w-16 h-24 border rounded overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt={`Mobile Hero ${index + 1}`} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <Input
                                    placeholder="Enter mobile image URL (e.g., https://example.com/hero-mobile.jpg)"
                                    value={imageUrl}
                                    onChange={(e) => handleMobileHeroImageChange(index, e.target.value)}
                                    data-testid={`input-mobile-hero-image-${index}`}
                                  />
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Recommended: <span className="font-medium">375Ã—667px</span> to <span className="font-medium">430Ã—932px</span> (portrait 9:16 ratio)
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator className="my-6" />

                      {/* Native App Home Banner */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-base font-semibold">Native App Home Banner</Label>
                          <Badge variant="secondary" className="text-xs">Mobile App</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          This image appears on the home screen of the native mobile app.
                        </p>
                        <div className="flex gap-3 items-start">
                          <div className="w-24 h-16 border rounded overflow-hidden bg-slate-100 flex-shrink-0 flex items-center justify-center">
                            {nativeHomeBannerImage ? (
                              <img src={nativeHomeBannerImage} alt="Native Banner" className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <Input
                              placeholder="Enter image URL"
                              value={nativeHomeBannerImage}
                              onChange={(e) => setNativeHomeBannerImage(e.target.value)}
                              data-testid="input-native-banner-image"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Recommended: High quality landscape image.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("promotional-banners") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Promotional Banners</CardTitle>
                      <CardDescription>Manage active banners for sales and announcements (Coming Soon).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">Banner management will be available in a future update.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("info-boxes") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Info Boxes</CardTitle>
                      <CardDescription>Manage the feature highlights on the home page (e.g., "Certified Technicians"). Click Save Settings to persist changes.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {infoBoxes.map((box, i) => (
                          <div key={box.id} className="flex items-center gap-4" data-testid={`infobox-${i}`}>
                            <Input
                              value={box.title}
                              onChange={(e) => handleUpdateInfoBox(box.id, "title", e.target.value)}
                              placeholder="Title"
                              className="w-48"
                              data-testid={`input-infobox-title-${i}`}
                            />
                            <Input
                              value={box.description}
                              onChange={(e) => handleUpdateInfoBox(box.id, "description", e.target.value)}
                              placeholder="Description..."
                              className="flex-1"
                              data-testid={`input-infobox-desc-${i}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteInfoBox(box.id)}
                              className="text-red-500 hover:text-red-700"
                              data-testid={`button-delete-infobox-${i}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-4 pt-2 border-t">
                          <Input
                            value={newInfoBox.title}
                            onChange={(e) => setNewInfoBox({ ...newInfoBox, title: e.target.value })}
                            placeholder="New title..."
                            className="w-48"
                            data-testid="input-new-infobox-title"
                          />
                          <Input
                            value={newInfoBox.description}
                            onChange={(e) => setNewInfoBox({ ...newInfoBox, description: e.target.value })}
                            placeholder="New description..."
                            className="flex-1"
                            onKeyDown={(e) => e.key === "Enter" && handleAddInfoBox()}
                            data-testid="input-new-infobox-desc"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={handleAddInfoBox}
                            disabled={!newInfoBox.title.trim()}
                            data-testid="button-add-infobox"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("homepage-stats") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Homepage Stats</CardTitle>
                      <CardDescription>Edit the animated statistics counter section on the homepage. These numbers are displayed prominently to showcase your business achievements.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        {homepageStats.map((stat, i) => (
                          <div key={stat.id} className="border rounded-lg p-4 space-y-3" data-testid={`stat-${i}`}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">Stat {i + 1}</Badge>
                              <Select
                                value={stat.iconName}
                                onValueChange={(value) => handleUpdateStat(stat.id, "iconName", value)}
                              >
                                <SelectTrigger className="w-32 h-8" data-testid={`select-stat-icon-${i}`}>
                                  <SelectValue placeholder="Icon" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Users">Users</SelectItem>
                                  <SelectItem value="Wrench">Wrench</SelectItem>
                                  <SelectItem value="Clock">Clock</SelectItem>
                                  <SelectItem value="ShieldCheck">Shield</SelectItem>
                                  <SelectItem value="Star">Star</SelectItem>
                                  <SelectItem value="Award">Award</SelectItem>
                                  <SelectItem value="Zap">Zap</SelectItem>
                                  <SelectItem value="Heart">Heart</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">Value</Label>
                                <Input
                                  type="number"
                                  value={stat.value}
                                  onChange={(e) => handleUpdateStat(stat.id, "value", e.target.value)}
                                  placeholder="500"
                                  data-testid={`input-stat-value-${i}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Suffix</Label>
                                <Input
                                  value={stat.suffix}
                                  onChange={(e) => handleUpdateStat(stat.id, "suffix", e.target.value)}
                                  placeholder="+"
                                  data-testid={`input-stat-suffix-${i}`}
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Label</Label>
                              <Input
                                value={stat.label}
                                onChange={(e) => handleUpdateStat(stat.id, "label", e.target.value)}
                                placeholder="Happy Customers"
                                data-testid={`input-stat-label-${i}`}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Click "Save Settings" at the bottom to persist changes.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("homepage-faq") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>FAQ Section</CardTitle>
                      <CardDescription>Manage the Frequently Asked Questions displayed on the homepage. Add, edit, or remove Q&A pairs.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {faqItems.map((faq, i) => (
                          <div key={faq.id} className="border rounded-lg p-4 space-y-3" data-testid={`faq-item-${i}`}>
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">FAQ {i + 1}</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteFaq(faq.id)}
                                className="text-red-500 hover:text-red-700 h-8 w-8"
                                data-testid={`button-delete-faq-${i}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Question</Label>
                              <Input
                                value={faq.question}
                                onChange={(e) => handleUpdateFaq(faq.id, "question", e.target.value)}
                                placeholder="Enter question..."
                                data-testid={`input-faq-question-${i}`}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Answer</Label>
                              <Textarea
                                value={faq.answer}
                                onChange={(e) => handleUpdateFaq(faq.id, "answer", e.target.value)}
                                placeholder="Enter answer..."
                                className="min-h-[80px]"
                                data-testid={`input-faq-answer-${i}`}
                              />
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-4 space-y-3">
                          <h4 className="text-sm font-medium">Add New FAQ</h4>
                          <div className="space-y-2">
                            <Input
                              value={newFaq.question}
                              onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                              placeholder="Enter question..."
                              data-testid="input-new-faq-question"
                            />
                          </div>
                          <div className="space-y-2">
                            <Textarea
                              value={newFaq.answer}
                              onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                              placeholder="Enter answer..."
                              className="min-h-[60px]"
                              data-testid="input-new-faq-answer"
                            />
                          </div>
                          <Button
                            onClick={handleAddFaq}
                            disabled={!newFaq.question.trim() || !newFaq.answer.trim()}
                            data-testid="button-add-faq"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add FAQ
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Click "Save Settings" at the bottom to persist changes.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("homepage-contact") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Contact Info Section</CardTitle>
                      <CardDescription>Manage the contact information displayed on the homepage footer section.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Address Lines</Label>
                            <Button variant="ghost" size="sm" onClick={() => handleAddContactArrayItem("addressLines")} data-testid="button-add-address">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {contactInfo.addressLines.map((line, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={line}
                                onChange={(e) => handleUpdateContactArray("addressLines", i, e.target.value)}
                                placeholder="Address line..."
                                data-testid={`input-address-${i}`}
                              />
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveContactArrayItem("addressLines", i)} className="text-red-500 flex-shrink-0" data-testid={`button-delete-address-${i}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Phone Numbers</Label>
                            <Button variant="ghost" size="sm" onClick={() => handleAddContactArrayItem("phoneNumbers")} data-testid="button-add-phone">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {contactInfo.phoneNumbers.map((phone, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={phone}
                                onChange={(e) => handleUpdateContactArray("phoneNumbers", i, e.target.value)}
                                placeholder="Phone number..."
                                data-testid={`input-phone-${i}`}
                              />
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveContactArrayItem("phoneNumbers", i)} className="text-red-500 flex-shrink-0" data-testid={`button-delete-phone-${i}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Email Addresses</Label>
                            <Button variant="ghost" size="sm" onClick={() => handleAddContactArrayItem("emails")} data-testid="button-add-email">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {contactInfo.emails.map((email, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={email}
                                onChange={(e) => handleUpdateContactArray("emails", i, e.target.value)}
                                placeholder="Email address..."
                                data-testid={`input-email-${i}`}
                              />
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveContactArrayItem("emails", i)} className="text-red-500 flex-shrink-0" data-testid={`button-delete-email-${i}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">Working Hours Lines</Label>
                            <Button variant="ghost" size="sm" onClick={() => handleAddContactArrayItem("workingHoursLines")} data-testid="button-add-hours">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {contactInfo.workingHoursLines.map((line, i) => (
                            <div key={i} className="flex gap-2">
                              <Input
                                value={line}
                                onChange={(e) => handleUpdateContactArray("workingHoursLines", i, e.target.value)}
                                placeholder="Working hours line..."
                                data-testid={`input-hours-${i}`}
                              />
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveContactArrayItem("workingHoursLines", i)} className="text-red-500 flex-shrink-0" data-testid={`button-delete-hours-${i}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="font-medium">WhatsApp Number</Label>
                          <p className="text-xs text-muted-foreground">Enter the number without + or spaces (e.g., 8801234567890)</p>
                          <Input
                            value={contactInfo.whatsappNumber}
                            onChange={(e) => setContactInfo({ ...contactInfo, whatsappNumber: e.target.value })}
                            placeholder="8801234567890"
                            data-testid="input-whatsapp"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Click "Save Settings" at the bottom to persist changes.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("homepage-service-areas") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Service Areas</CardTitle>
                      <CardDescription>Manage the locations/areas displayed on the homepage where you offer pickup and delivery services.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {serviceAreas.map((area, i) => (
                          <Badge key={i} variant="secondary" className="px-3 py-1.5 text-sm" data-testid={`badge-service-area-${i}`}>
                            {area}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-2 hover:bg-transparent"
                              onClick={() => handleDeleteServiceArea(i)}
                              data-testid={`button-delete-service-area-${i}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add new area (e.g., Uttara)"
                          value={newServiceArea}
                          onChange={(e) => setNewServiceArea(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && handleAddServiceArea()}
                          data-testid="input-new-service-area"
                        />
                        <Button onClick={handleAddServiceArea} disabled={!newServiceArea.trim()} data-testid="button-add-service-area">
                          <Plus className="h-4 w-4 mr-2" /> Add
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Click "Save Settings" at the bottom to persist changes.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("homepage-brands") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Brands We Service</CardTitle>
                      <CardDescription>Manage the brands displayed in the carousel on the homepage. You can add brand logos for visual display.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {homepageBrands.map((brand) => (
                          <div key={brand.id} className="flex items-center gap-4 p-3 border rounded-lg" data-testid={`brand-item-${brand.id}`}>
                            <div className="w-20 h-16 bg-slate-100 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                              {brand.logoUrl ? (
                                <img src={brand.logoUrl} alt={brand.name} className="w-full h-full object-contain p-1" />
                              ) : (
                                <span className="text-xs text-muted-foreground text-center px-1">No Logo</span>
                              )}
                            </div>
                            <div className="flex-1">
                              {editingBrandId === brand.id ? (
                                <Input
                                  value={brand.name}
                                  onChange={(e) => handleUpdateBrandName(brand.id, e.target.value)}
                                  onBlur={() => setEditingBrandId(null)}
                                  onKeyPress={(e) => e.key === "Enter" && setEditingBrandId(null)}
                                  autoFocus
                                  data-testid={`input-brand-name-${brand.id}`}
                                />
                              ) : (
                                <span
                                  className="font-medium cursor-pointer hover:text-primary"
                                  onClick={() => setEditingBrandId(brand.id)}
                                  data-testid={`text-brand-name-${brand.id}`}
                                >
                                  {brand.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadBrandLogo(brand.id, file);
                                    e.target.value = "";
                                  }}
                                  data-testid={`input-brand-logo-${brand.id}`}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUploadingBrandLogo === brand.id}
                                  asChild
                                >
                                  <span className="cursor-pointer">
                                    {isUploadingBrandLogo === brand.id ? (
                                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading</>
                                    ) : (
                                      <><Upload className="h-4 w-4 mr-1" /> {brand.logoUrl ? "Change" : "Upload"} Logo</>
                                    )}
                                  </span>
                                </Button>
                              </label>
                              {brand.logoUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveBrandLogo(brand.id)}
                                  className="text-orange-500"
                                  data-testid={`button-remove-brand-logo-${brand.id}`}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteBrandItem(brand.id)}
                                className="text-red-500"
                                data-testid={`button-delete-brand-${brand.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Input
                          placeholder="Add new brand (e.g., Xiaomi)"
                          value={newBrandName}
                          onChange={(e) => setNewBrandName(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && handleAddBrandItem()}
                          data-testid="input-new-brand"
                        />
                        <Button onClick={handleAddBrandItem} disabled={!newBrandName.trim()} data-testid="button-add-brand">
                          <Plus className="h-4 w-4 mr-2" /> Add Brand
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">Click "Save Settings" at the bottom to persist changes. Logos are optional - brands without logos will display as text.</p>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("track-repair") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Track Repair Widget</CardTitle>
                      <CardDescription>Enable or disable the "Check Repair Status" widget in the Hero section.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="track-repair-mode"
                          checked={trackRepairEnabled}
                          onCheckedChange={setTrackRepairEnabled}
                          data-testid="switch-track-repair"
                        />
                        <Label htmlFor="track-repair-mode">Show Track Repair Widget</Label>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("problem-nav") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Problem Navigation</CardTitle>
                      <CardDescription>Manage the "What's Wrong With Your TV?" section. Add common issues to help users find solutions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {problemNavItems.map((item) => (
                            <div key={item.id} className="border rounded-lg p-4 space-y-3" data-testid={`problem-item-${item.id}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                                    {item.iconUrl ? (
                                      <img src={item.iconUrl} alt={item.title} className="w-full h-full object-contain" />
                                    ) : (
                                      <HelpCircle className="w-6 h-6 text-slate-500" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">{item.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.iconUrl ? "Custom Icon" : `Icon: ${item.icon}`}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteProblemItem(item.id)}
                                  className="text-red-500 hover:text-red-700"
                                  data-testid={`button-delete-problem-${item.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              {/* Icon Upload Section */}
                              <div className="flex gap-2 items-center">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  id={`problem-icon-upload-${item.id}`}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUploadProblemIcon(item.id, file);
                                    e.target.value = "";
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => document.getElementById(`problem-icon-upload-${item.id}`)?.click()}
                                  disabled={isUploadingProblemIcon === item.id}
                                >
                                  {isUploadingProblemIcon === item.id ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-3 w-3 mr-1" />
                                      {item.iconUrl ? "Change Icon" : "Upload Icon"}
                                    </>
                                  )}
                                </Button>
                                {item.iconUrl && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveProblemIcon(item.id)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="border-t pt-4 flex gap-4 items-end">
                          <div className="space-y-2 flex-1">
                            <Label>Problem Title</Label>
                            <Input
                              value={newProblemItem.title}
                              onChange={(e) => setNewProblemItem({ ...newProblemItem, title: e.target.value })}
                              placeholder="e.g. No Power"
                              data-testid="input-new-problem-title"
                            />
                          </div>
                          <div className="space-y-2 w-48">
                            <Label>Icon</Label>
                            <Select
                              value={newProblemItem.icon}
                              onValueChange={(value) => setNewProblemItem({ ...newProblemItem, icon: value })}
                            >
                              <SelectTrigger data-testid="select-new-problem-icon">
                                <SelectValue placeholder="Select Icon" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Power">Power</SelectItem>
                                <SelectItem value="MonitorOff">No Display</SelectItem>
                                <SelectItem value="Maximize">Broken Screen</SelectItem>
                                <SelectItem value="VolumeX">No Sound</SelectItem>
                                <SelectItem value="WifiOff">WiFi Issue</SelectItem>
                                <SelectItem value="AlignJustify">Lines</SelectItem>
                                <SelectItem value="HelpCircle">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleAddProblemItem} disabled={!newProblemItem.title.trim()} data-testid="button-add-problem">
                            <Plus className="h-4 w-4 mr-2" /> Add
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("before-after") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Before & After Gallery</CardTitle>
                      <CardDescription>Showcase your repair work with comparison photos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {beforeAfterGallery.map((item) => (
                          <div key={item.id} className="border rounded-lg p-4 space-y-3" data-testid={`gallery-item-${item.id}`}>
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium">{item.title}</h4>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteBeforeAfter(item.id)}
                                className="text-red-500 hover:text-red-700 h-8 w-8"
                                data-testid={`button-delete-gallery-${item.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Before Image</p>
                                <div className="h-24 bg-slate-100 rounded overflow-hidden">
                                  <img src={item.beforeImage} alt="Before" className="w-full h-full object-cover" />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">After Image</p>
                                <div className="h-24 bg-slate-100 rounded overflow-hidden">
                                  <img src={item.afterImage} alt="After" className="w-full h-full object-cover" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="border-t pt-4 space-y-4">
                          <h4 className="text-sm font-medium">Add New Comparison</h4>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Title / Caption</Label>
                              <Input
                                value={newBeforeAfter.title}
                                onChange={(e) => setNewBeforeAfter({ ...newBeforeAfter, title: e.target.value })}
                                placeholder="e.g. Samsung 55' Panel Repair"
                                data-testid="input-new-gallery-title"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Before Image URL</Label>
                              <Input
                                value={newBeforeAfter.beforeImage}
                                onChange={(e) => setNewBeforeAfter({ ...newBeforeAfter, beforeImage: e.target.value })}
                                placeholder="https://..."
                                data-testid="input-new-gallery-before"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>After Image URL</Label>
                              <Input
                                value={newBeforeAfter.afterImage}
                                onChange={(e) => setNewBeforeAfter({ ...newBeforeAfter, afterImage: e.target.value })}
                                placeholder="https://..."
                                data-testid="input-new-gallery-after"
                              />
                            </div>
                          </div>
                          <Button
                            onClick={handleAddBeforeAfter}
                            disabled={!newBeforeAfter.title.trim() || !newBeforeAfter.beforeImage || !newBeforeAfter.afterImage}
                            data-testid="button-add-gallery"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Comparison
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("pricing-table") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Pricing Table</CardTitle>
                      <CardDescription>Display transparent starting prices for common services.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Service</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pricingTable.map((item) => (
                                <TableRow key={item.id} data-testid={`pricing-item-${item.id}`}>
                                  <TableCell className="font-medium">{item.service}</TableCell>
                                  <TableCell>{item.price}</TableCell>
                                  <TableCell className="text-muted-foreground">{item.note}</TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeletePricingItem(item.id)}
                                      className="text-red-500 hover:text-red-700 h-8 w-8"
                                      data-testid={`button-delete-pricing-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="border-t pt-4 flex gap-4 items-end">
                          <div className="space-y-2 flex-1">
                            <Label>Service Name</Label>
                            <Input
                              value={newPricingItem.service}
                              onChange={(e) => setNewPricingItem({ ...newPricingItem, service: e.target.value })}
                              placeholder="e.g. Backlight Repair"
                              data-testid="input-new-pricing-service"
                            />
                          </div>
                          <div className="space-y-2 w-32">
                            <Label>Price</Label>
                            <Input
                              value={newPricingItem.price}
                              onChange={(e) => setNewPricingItem({ ...newPricingItem, price: e.target.value })}
                              placeholder="1500"
                              data-testid="input-new-pricing-price"
                            />
                          </div>
                          <div className="space-y-2 flex-1">
                            <Label>Note (Optional)</Label>
                            <Input
                              value={newPricingItem.note}
                              onChange={(e) => setNewPricingItem({ ...newPricingItem, note: e.target.value })}
                              placeholder="Starting from..."
                              data-testid="input-new-pricing-note"
                            />
                          </div>
                          <Button onClick={handleAddPricingItem} disabled={!newPricingItem.service.trim() || !newPricingItem.price.trim()} data-testid="button-add-pricing">
                            <Plus className="h-4 w-4 mr-2" /> Add
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("google-map") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Google Map Embed</CardTitle>
                      <CardDescription>Enter the Google Maps Embed URL to display your location on the homepage.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label>Embed URL (src attribute from iframe)</Label>
                        <Input
                          value={googleMapUrl}
                          onChange={(e) => setGoogleMapUrl(e.target.value)}
                          placeholder="https://www.google.com/maps/embed?pb=..."
                          data-testid="input-google-map"
                        />
                        <p className="text-xs text-muted-foreground">
                          Go to Google Maps {'>'} Share {'>'} Embed a map {'>'} Copy HTML. Then paste ONLY the URL inside the src="..." quotes here.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="about" className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {isSectionVisible("about-company") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>About Page Header</CardTitle>
                      <CardDescription>Customize the main header and introduction for the About Us page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Page Title</Label>
                        <Input
                          value={aboutTitle}
                          onChange={(e) => setAboutTitle(e.target.value)}
                          placeholder="Your Trusted Electronics Partner"
                          data-testid="input-about-title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company Description</Label>
                        <Textarea
                          value={aboutDescription}
                          onChange={(e) => setAboutDescription(e.target.value)}
                          placeholder="Tell visitors about your company..."
                          className="min-h-[120px]"
                          data-testid="textarea-about-description"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("about-company") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Mission & Vision</CardTitle>
                      <CardDescription>Define your company's mission and vision statements.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Mission Statement</Label>
                        <Textarea
                          value={aboutMission}
                          onChange={(e) => setAboutMission(e.target.value)}
                          placeholder="Our mission is to..."
                          className="min-h-[80px]"
                          data-testid="textarea-about-mission"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vision Statement</Label>
                        <Textarea
                          value={aboutVision}
                          onChange={(e) => setAboutVision(e.target.value)}
                          placeholder="Our vision is to..."
                          className="min-h-[80px]"
                          data-testid="textarea-about-vision"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("about-company") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Our Capabilities</CardTitle>
                      <CardDescription>List the services and capabilities your company offers.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {aboutCapabilities.map((capability, index) => (
                          <Badge key={index} variant="secondary" className="px-3 py-1.5 text-sm" data-testid={`badge-capability-${index}`}>
                            {capability}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 ml-2 hover:bg-transparent"
                              onClick={() => handleDeleteCapability(index)}
                              data-testid={`button-delete-capability-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add new capability..."
                          value={newCapability}
                          onChange={(e) => setNewCapability(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleAddCapability()}
                          data-testid="input-new-capability"
                        />
                        <Button onClick={handleAddCapability} data-testid="button-add-capability">
                          <Plus className="h-4 w-4 mr-2" /> Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("company-contact") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Team Description</CardTitle>
                      <CardDescription>Describe your team and their expertise.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={aboutTeam}
                        onChange={(e) => setAboutTeam(e.target.value)}
                        placeholder="Our team consists of..."
                        className="min-h-[100px]"
                        data-testid="textarea-about-team"
                      />
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("company-contact") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Contact Information</CardTitle>
                      <CardDescription>Update your contact details shown on the About page.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input
                          value={aboutAddress}
                          onChange={(e) => setAboutAddress(e.target.value)}
                          placeholder="Your business address"
                          data-testid="input-about-address"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          value={aboutEmail}
                          onChange={(e) => setAboutEmail(e.target.value)}
                          placeholder="contact@yourcompany.com"
                          data-testid="input-about-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Working Hours</Label>
                        <Input
                          value={aboutWorkingHours}
                          onChange={(e) => setAboutWorkingHours(e.target.value)}
                          placeholder="Mon-Fri: 9AM - 6PM"
                          data-testid="input-about-hours"
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("team-members") && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Our Team Members
                      </CardTitle>
                      <CardDescription>Add team members with photos to display on the home page "Our Team" section.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input
                            value={newMember.name}
                            onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                            placeholder="John Doe"
                            data-testid="input-team-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role / Position</Label>
                          <Input
                            value={newMember.role}
                            onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                            placeholder="Senior Technician"
                            data-testid="input-team-role"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Photo URL</Label>
                          <Input
                            value={newMember.photoUrl}
                            onChange={(e) => setNewMember({ ...newMember, photoUrl: e.target.value })}
                            placeholder="https://example.com/photo.jpg"
                            data-testid="input-team-photo"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>&nbsp;</Label>
                          <Button onClick={handleAddTeamMember} className="w-full" data-testid="button-add-team-member">
                            <Plus className="h-4 w-4 mr-2" /> Add Member
                          </Button>
                        </div>
                      </div>

                      {newMember.photoUrl && (
                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                          <img
                            src={newMember.photoUrl}
                            alt="Preview"
                            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23e2e8f0" width="64" height="64" rx="32"/><text x="32" y="36" text-anchor="middle" fill="%2394a3b8" font-size="10">Photo</text></svg>'; }}
                          />
                          <span className="text-sm text-muted-foreground">Photo preview</span>
                        </div>
                      )}

                      {teamMembers.length === 0 ? (
                        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">No team members added yet.</p>
                          <p className="text-sm text-muted-foreground">Add team members above to display on the home page.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {teamMembers.map((member, index) => (
                            <div key={member.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border" data-testid={`team-member-${index}`}>
                              <img
                                src={member.photoUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23e2e8f0" width="64" height="64" rx="32"/><text x="32" y="36" text-anchor="middle" fill="%2394a3b8" font-size="10">Photo</text></svg>'}
                                alt={member.name}
                                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow flex-shrink-0"
                                referrerPolicy="no-referrer"
                                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23e2e8f0" width="64" height="64" rx="32"/><text x="32" y="36" text-anchor="middle" fill="%2394a3b8" font-size="10">Photo</text></svg>'; }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{member.name}</p>
                                <p className="text-sm text-muted-foreground truncate">{member.role}</p>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveTeamMember(index, "up")} disabled={index === 0} data-testid={`button-move-up-${index}`}>
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveTeamMember(index, "down")} disabled={index === teamMembers.length - 1} data-testid={`button-move-down-${index}`}>
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingMember(member)} data-testid={`button-edit-member-${index}`}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteTeamMember(member.id)} data-testid={`button-delete-member-${index}`}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="general" className="mt-6 space-y-6">
              {(isSectionVisible("site-identity") || isSectionVisible("business-operations") || isSectionVisible("system-controls")) && (
                <Card>
                  <CardHeader>
                    <CardTitle>System Configuration</CardTitle>
                    <CardDescription>Global settings for the application.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Site Name</Label>
                        <Input
                          value={siteName}
                          onChange={(e) => setSiteName(e.target.value)}
                          data-testid="input-site-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Support Phone</Label>
                        <Input
                          value={supportPhone}
                          onChange={(e) => setSupportPhone(e.target.value)}
                          data-testid="input-support-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Service Center Contact</Label>
                        <Input
                          value={serviceCenterContact}
                          onChange={(e) => setServiceCenterContact(e.target.value)}
                          placeholder="e.g., 01700-000000"
                          data-testid="input-service-center-contact"
                        />
                        <p className="text-xs text-muted-foreground">Phone number shown on the get-quote page for service center visits.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Business Hours</Label>
                        <Input
                          value={businessHours}
                          onChange={(e) => setBusinessHours(e.target.value)}
                          placeholder="e.g., 9:00 AM - 9:00 PM"
                          data-testid="input-business-hours"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Currency Symbol</Label>
                        <Input
                          value={currencySymbol}
                          onChange={(e) => setCurrencySymbol(e.target.value)}
                          data-testid="input-currency-symbol"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>VAT Percentage (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={vatPercentage}
                          onChange={(e) => setVatPercentage(e.target.value)}
                          data-testid="input-vat-percentage"
                        />
                        <p className="text-xs text-muted-foreground">Tax rate applied to POS transactions.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Time Zone</Label>
                        <Select value={timezone} onValueChange={setTimezone}>
                          <SelectTrigger data-testid="select-timezone">
                            <SelectValue placeholder="Select Timezone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="asia-dhaka">Asia/Dhaka (GMT+6)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Site Logo</Label>
                      <div className="flex items-center gap-4">
                        <div className="h-16 w-16 border rounded-lg overflow-hidden bg-white flex items-center justify-center">
                          <img src={logoUrl || images.logo} alt="Site Logo" className="h-full w-full object-contain" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input
                            placeholder="Enter logo URL (e.g., https://example.com/logo.png)"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            data-testid="input-logo-url"
                          />
                          <p className="text-xs text-muted-foreground">Enter a URL to your logo image. Recommended size: 128x128px or larger.</p>
                        </div>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Notification Tone</Label>
                        <p className="text-sm text-muted-foreground">Select the sound for new request notifications.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={notificationTone} onValueChange={(v) => setNotificationTone(v as NotificationTone)}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select tone" />
                          </SelectTrigger>
                          <SelectContent>
                            {NOTIFICATION_TONES.map((tone) => (
                              <SelectItem key={tone.value} value={tone.value}>
                                {tone.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => playNotificationSound(notificationTone)}
                          title="Test Sound"
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <Separator className="my-4" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Maintenance Mode</Label>
                        <p className="text-sm text-muted-foreground">Disable public access to the site.</p>
                      </div>
                      <Switch
                        checked={maintenanceMode}
                        onCheckedChange={setMaintenanceMode}
                        data-testid="switch-maintenance-mode"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Allow New Registrations</Label>
                        <p className="text-sm text-muted-foreground">Enable or disable new customer signups.</p>
                      </div>
                      <Switch
                        checked={allowRegistrations}
                        onCheckedChange={setAllowRegistrations}
                        data-testid="switch-allow-registrations"
                      />
                    </div>

                    <Separator className="my-4" />

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          Developer Mode
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">Testing</Badge>
                        </Label>
                        <p className="text-sm text-muted-foreground">Bypass date validations and status restrictions for testing.</p>
                      </div>
                      <Switch
                        checked={developerMode}
                        onCheckedChange={setDeveloperMode}
                        data-testid="switch-developer-mode"
                      />
                    </div>
                    {developerMode && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Developer Mode Active</p>
                            <p className="text-xs text-yellow-700">Date validations and status flow restrictions are disabled. Disable before going to production.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="service" className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {isSectionVisible("service-categories") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Service Categories</CardTitle>
                      <CardDescription>These categories are used in the inventory when adding services and in the customer portal services tab. Click Save Settings to persist changes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {serviceCategories.map((cat, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`service-category-${i}`}>
                          <Input
                            value={cat}
                            onChange={(e) => {
                              const updated = [...serviceCategories];
                              updated[i] = e.target.value;
                              setServiceCategories(updated);
                            }}
                            data-testid={`input-service-category-${i}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCategory(i)}
                            data-testid={`button-delete-category-${i}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          placeholder="New category name..."
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                          data-testid="input-new-category"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleAddCategory}
                          disabled={!newCategory.trim()}
                          data-testid="button-add-category"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("service-filter") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Service Filter (Customer Portal)</CardTitle>
                      <CardDescription>Categories for filtering services in customer portal and inventory service items. Click Save Settings to persist changes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {serviceFilterCategories.map((cat, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`service-filter-${i}`}>
                          <Input
                            value={cat}
                            onChange={(e) => {
                              const updated = [...serviceFilterCategories];
                              updated[i] = e.target.value;
                              setServiceFilterCategories(updated);
                            }}
                            data-testid={`input-service-filter-${i}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteFilterCategory(i)}
                            data-testid={`button-delete-filter-${i}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          placeholder="New filter category..."
                          value={newFilterCategory}
                          onChange={(e) => setNewFilterCategory(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddFilterCategory()}
                          data-testid="input-new-filter-category"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleAddFilterCategory}
                          disabled={!newFilterCategory.trim()}
                          data-testid="button-add-filter-category"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("tv-brands") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>TV Brands</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {tvBrands.map((brand, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`brand-${i}`}>
                          <Input
                            value={brand}
                            onChange={(e) => {
                              const updated = [...tvBrands];
                              updated[i] = e.target.value;
                              setTvBrands(updated);
                            }}
                            data-testid={`input-brand-${i}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteBrand(i)}
                            data-testid={`button-delete-brand-${i}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          placeholder="New brand name..."
                          value={newBrand}
                          onChange={(e) => setNewBrand(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddBrand()}
                          data-testid="input-new-brand"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleAddBrand}
                          data-testid="button-add-brand"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isSectionVisible("tv-sizes") && (
                  <Card>
                    <CardHeader>
                      <CardTitle>TV Screen Sizes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {tvInches.map((inch, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`inch-${i}`}>
                          <Input
                            value={inch}
                            onChange={(e) => {
                              const updated = [...tvInches];
                              updated[i] = e.target.value;
                              setTvInches(updated);
                            }}
                            data-testid={`input-inch-${i}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteInch(i)}
                            data-testid={`button-delete-inch-${i}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <Input
                          placeholder="New screen size (e.g., 42 inch)..."
                          value={newInch}
                          onChange={(e) => setNewInch(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddInch()}
                          data-testid="input-new-inch"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleAddInch}
                          data-testid="button-add-inch"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {isSectionVisible("shop-categories") && (
                <Card>
                  <CardHeader>
                    <CardTitle>Shop Categories</CardTitle>
                    <CardDescription>Categories available in the shop page filters for TV spare parts</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {shopCategories.map((cat, i) => (
                      <div key={i} className="flex items-center gap-2" data-testid={`shop-category-${i}`}>
                        <Input
                          value={cat}
                          onChange={(e) => {
                            const updated = [...shopCategories];
                            updated[i] = e.target.value;
                            setShopCategories(updated);
                          }}
                          data-testid={`input-shop-category-${i}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteShopCategory(i)}
                          data-testid={`button-delete-shop-category-${i}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        placeholder="New category name..."
                        value={newShopCategory}
                        onChange={(e) => setNewShopCategory(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddShopCategory()}
                        data-testid="input-new-shop-category"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleAddShopCategory}
                        data-testid="button-add-shop-category"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isSectionVisible("common-symptoms") && (
                <Card>
                  <CardHeader>
                    <CardTitle>Common Symptoms</CardTitle>
                    <CardDescription>Symptom options shown in repair request form</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {commonSymptoms.map((symptom, i) => (
                        <div key={i} className="flex items-center gap-2" data-testid={`symptom-${i}`}>
                          <Input
                            value={symptom}
                            onChange={(e) => {
                              const updated = [...commonSymptoms];
                              updated[i] = e.target.value;
                              setCommonSymptoms(updated);
                            }}
                            data-testid={`input-symptom-${i}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSymptom(i)}
                            data-testid={`button-delete-symptom-${i}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Input
                        placeholder="New symptom..."
                        value={newSymptom}
                        onChange={(e) => setNewSymptom(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddSymptom()}
                        data-testid="input-new-symptom"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleAddSymptom}
                        data-testid="button-add-symptom"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveAll}
                  disabled={upsertMutation.isPending}
                  data-testid="button-save-service-config"
                >
                  {upsertMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" /> Save Service Config
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="data-import" className="mt-6 space-y-6">
              {isSectionVisible("data-import") && (
                <Card>
                  <CardHeader>
                    <CardTitle>Bulk Inventory Import</CardTitle>
                    <CardDescription>Upload a CSV file to bulk import inventory items. Download the template to see the required format.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
                        <Download className="w-4 h-4 mr-2" /> Download Template
                      </Button>
                      <div className="flex-1">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          onChange={handleFileSelect}
                          className="cursor-pointer"
                          data-testid="input-csv-file"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border">
                      <h4 className="font-medium mb-2">CSV Format Requirements:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li><strong>Required columns:</strong> name, category, price</li>
                        <li><strong>Optional columns:</strong> id, description, stock, status, lowStockThreshold, showOnWebsite</li>
                        <li><strong>Status values:</strong> "In Stock", "Low Stock", "Out of Stock"</li>
                        <li><strong>showOnWebsite:</strong> "true" or "false"</li>
                      </ul>
                    </div>

                    {csvErrors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-red-500" />
                          <h4 className="font-medium text-red-700">Parsing Errors</h4>
                        </div>
                        <ul className="text-sm text-red-600 space-y-1 list-disc list-inside max-h-40 overflow-y-auto">
                          {csvErrors.map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {csvData.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Preview ({csvData.length} items ready to import)</h4>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleClearImport} data-testid="button-clear-import">
                              <Trash2 className="w-4 h-4 mr-2" /> Clear
                            </Button>
                            <Button
                              onClick={handleBulkImport}
                              disabled={isImporting}
                              data-testid="button-import-inventory"
                            >
                              {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              <Upload className="w-4 h-4 mr-2" /> Import {csvData.length} Items
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-md border overflow-hidden max-h-96 overflow-y-auto">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead className="w-12">#</TableHead>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Stock</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {csvData.slice(0, 50).map((item, i) => (
                                <TableRow key={i} data-testid={`row-preview-${i}`}>
                                  <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                                  <TableCell className="font-mono text-xs">{item.id || "Auto"}</TableCell>
                                  <TableCell className="font-medium">{item.name}</TableCell>
                                  <TableCell>{item.category}</TableCell>
                                  <TableCell>{item.stock || "0"}</TableCell>
                                  <TableCell>à§³{parseFloat(item.price).toLocaleString()}</TableCell>
                                  <TableCell>
                                    <Badge variant={item.status === "In Stock" ? "default" : item.status === "Low Stock" ? "secondary" : "destructive"}>
                                      {item.status || "In Stock"}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                              {csvData.length > 50 && (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    ... and {csvData.length - 50} more items
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {importResult && (
                      <div className={`p-4 rounded-lg border ${importResult.imported > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {importResult.imported > 0 ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                          )}
                          <h4 className="font-medium">Import Results</h4>
                        </div>
                        <p className="text-sm" data-testid="text-import-result">
                          Successfully imported: <strong>{importResult.imported}</strong> items
                        </p>
                        {importResult.errors.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-red-600 font-medium">Failed: {importResult.errors.length} items</p>
                            <ul className="text-sm text-red-600 space-y-1 list-disc list-inside max-h-40 overflow-y-auto mt-1">
                              {importResult.errors.slice(0, 10).map((error, i) => (
                                <li key={i}>{error}</li>
                              ))}
                              {importResult.errors.length > 10 && (
                                <li>... and {importResult.errors.length - 10} more errors</li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="policies" className="mt-6 space-y-6">
              {isSectionVisible("policies") && (
                <PoliciesTab
                  onEdit={(policy) => {
                    setEditingPolicy(policy);
                    setShowPolicyDialog(true);
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="reviews" className="mt-6 space-y-6">
              <ReviewsModerationTab />
            </TabsContent>

          </Tabs>
        )}

        {/* Danger Zone - Super Admin Only */}
        {isSuperAdmin && isSectionVisible("delete-data") && (
          <Card className="border-red-200 bg-red-50/30 mt-6">
            <CardHeader>
              <CardTitle className="text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Danger Zone
              </CardTitle>
              <CardDescription className="text-red-600">
                These actions are irreversible. Please be absolutely certain before proceeding.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-white">
                <div>
                  <h4 className="font-medium text-red-800">Delete All Business Data</h4>
                  <p className="text-sm text-red-600">
                    Permanently delete all job tickets, service requests, customers, orders, inventory, finance records, and more. Admin users and settings will be preserved.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteAllDialog(true)}
                  data-testid="button-delete-all-data"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete All Data
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete All Data Confirmation Dialog */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete All Business Data
            </DialogTitle>
            <DialogDescription>
              This action will permanently delete ALL business data including:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Job Tickets</li>
              <li>Service Requests</li>
              <li>Customers</li>
              <li>Orders</li>
              <li>Inventory Items & Products</li>
              <li>POS Transactions</li>
              <li>Finance Records (Petty Cash, Due Records)</li>
              <li>Challans</li>
              <li>Attendance Records</li>
            </ul>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-sm text-yellow-800 font-medium">
                Admin users and settings will NOT be deleted.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-red-600 font-medium">
                Type "DELETE ALL" to confirm:
              </Label>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE ALL"
                className="font-mono"
                data-testid="input-delete-confirmation"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              setShowDeleteAllDialog(false);
              setDeleteConfirmation("");
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllData}
              disabled={deleteConfirmation !== "DELETE ALL" || isDeleting}
              data-testid="button-confirm-delete-all"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Everything
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>Update the team member's information.</DialogDescription>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                  data-testid="input-edit-member-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Role / Position</Label>
                <Input
                  value={editingMember.role}
                  onChange={(e) => setEditingMember({ ...editingMember, role: e.target.value })}
                  data-testid="input-edit-member-role"
                />
              </div>
              <div className="space-y-2">
                <Label>Photo URL</Label>
                <Input
                  value={editingMember.photoUrl}
                  onChange={(e) => setEditingMember({ ...editingMember, photoUrl: e.target.value })}
                  data-testid="input-edit-member-photo"
                />
              </div>
              {editingMember.photoUrl && (
                <div className="flex justify-center">
                  <img
                    src={editingMember.photoUrl}
                    alt="Preview"
                    className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect fill="%23e2e8f0" width="96" height="96" rx="48"/><text x="48" y="52" text-anchor="middle" fill="%2394a3b8" font-size="12">Photo</text></svg>'; }}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={handleUpdateTeamMember} data-testid="button-save-member">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PolicyEditDialog
        policy={editingPolicy}
        open={showPolicyDialog}
        onOpenChange={(open) => {
          setShowPolicyDialog(open);
          if (!open) setEditingPolicy(null);
        }}
      />
    </>
  );
}

function PolicyEditDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: { slug: string; title: string; content: string; isPublished: boolean } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (policy) {
      setTitle(policy.title);
      setContent(policy.content);
      setIsPublished(policy.isPublished);
    }
  }, [policy]);

  const handleSave = async () => {
    if (!policy) return;
    setIsSaving(true);
    try {
      await policiesApi.save({
        slug: policy.slug,
        title,
        content,
        isPublished,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-policies"] });
      toast.success("Policy saved successfully");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save policy");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {policy?.title || "Policy"}</DialogTitle>
          <DialogDescription>
            Update the policy content below. Markdown formatting is supported.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="policy-title">Title</Label>
            <Input
              id="policy-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Policy title"
              data-testid="input-policy-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="policy-content">Content</Label>
            <Textarea
              id="policy-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter policy content here... (Markdown supported)"
              className="min-h-[300px] font-mono text-sm"
              data-testid="textarea-policy-content"
            />
            <p className="text-xs text-muted-foreground">
              Markdown formatting is supported. Use **bold**, *italic*, ## headings, and - lists.
            </p>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="policy-published">Published</Label>
              <p className="text-sm text-muted-foreground">
                Make this policy visible on the website
              </p>
            </div>
            <Switch
              id="policy-published"
              checked={isPublished}
              onCheckedChange={setIsPublished}
              data-testid="switch-policy-published"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-policy">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Policy
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
