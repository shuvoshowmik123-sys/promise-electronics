import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, Smartphone, Bell, Image, Settings, AlertTriangle, Phone, MapPin, Clock, GripVertical, Upload } from "lucide-react";
import { settingsApi } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface HeroSlide {
    title1: string;
    title2: string;
    subtitle: string;
    image: string;
}

interface MobileAppSettings {
    // Hero slides
    heroSlides: HeroSlide[];
    // Banner
    bannerEnabled: boolean;
    bannerText: string;
    bannerType: "info" | "success" | "warning" | "urgent";
    bannerLink: string;
    // Popup
    popupEnabled: boolean;
    popupImage: string;
    popupTitle: string;
    popupDescription: string;
    popupButtonText: string;
    popupButtonLink: string;
    popupShowOnce: boolean;
    // App Control
    maintenanceMode: boolean;
    maintenanceMessage: string;
    minVersion: string;
    // Contact
    contactPhone: string;
    contactWhatsapp: string;
    contactAddress: string;
    businessHours: string;
}

const defaultSettings: MobileAppSettings = {
    heroSlides: [
        { title1: "Your TV,", title2: "Our Care.", subtitle: "Expert repairs at your doorstep.", image: "" },
        { title1: "Fast &", title2: "Reliable.", subtitle: "Same-day service available.", image: "" },
        { title1: "Quality", title2: "Parts Only.", subtitle: "Genuine components guaranteed.", image: "" },
    ],
    bannerEnabled: false,
    bannerText: "",
    bannerType: "info",
    bannerLink: "none",
    popupEnabled: false,
    popupImage: "",
    popupTitle: "",
    popupDescription: "",
    popupButtonText: "Learn More",
    popupButtonLink: "none",
    popupShowOnce: true,
    maintenanceMode: false,
    maintenanceMessage: "We're updating our systems. Please check back soon.",
    minVersion: "1.0.0",
    contactPhone: "",
    contactWhatsapp: "",
    contactAddress: "",
    businessHours: "",
};

export default function MobileAppSettingsTab() {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState<MobileAppSettings>(defaultSettings);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch settings
    const { data: allSettings = [], isLoading } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
        staleTime: 0,
    });

    // Load settings from database
    useEffect(() => {
        if (allSettings.length > 0) {
            const newSettings = { ...defaultSettings };

            allSettings.forEach((setting) => {
                switch (setting.key) {
                    case "mobile_hero_slides":
                        try {
                            newSettings.heroSlides = JSON.parse(setting.value);
                        } catch (e) {
                            console.error("Failed to parse hero slides");
                        }
                        break;
                    case "mobile_banner_enabled":
                        newSettings.bannerEnabled = setting.value === "true";
                        break;
                    case "mobile_banner_text":
                        newSettings.bannerText = setting.value;
                        break;
                    case "mobile_banner_type":
                        newSettings.bannerType = setting.value as any;
                        break;
                    case "mobile_banner_link":
                        newSettings.bannerLink = setting.value;
                        break;
                    case "mobile_popup_enabled":
                        newSettings.popupEnabled = setting.value === "true";
                        break;
                    case "mobile_popup_image":
                        newSettings.popupImage = setting.value;
                        break;
                    case "mobile_popup_title":
                        newSettings.popupTitle = setting.value;
                        break;
                    case "mobile_popup_description":
                        newSettings.popupDescription = setting.value;
                        break;
                    case "mobile_popup_button_text":
                        newSettings.popupButtonText = setting.value;
                        break;
                    case "mobile_popup_button_link":
                        newSettings.popupButtonLink = setting.value;
                        break;
                    case "mobile_popup_show_once":
                        newSettings.popupShowOnce = setting.value === "true";
                        break;
                    case "mobile_maintenance_mode":
                        newSettings.maintenanceMode = setting.value === "true";
                        break;
                    case "mobile_maintenance_message":
                        newSettings.maintenanceMessage = setting.value;
                        break;
                    case "mobile_min_version":
                        newSettings.minVersion = setting.value;
                        break;
                    case "mobile_contact_phone":
                        newSettings.contactPhone = setting.value;
                        break;
                    case "mobile_contact_whatsapp":
                        newSettings.contactWhatsapp = setting.value;
                        break;
                    case "mobile_contact_address":
                        newSettings.contactAddress = setting.value;
                        break;
                    case "mobile_business_hours":
                        newSettings.businessHours = setting.value;
                        break;
                }
            });

            setSettings(newSettings);
        }
    }, [allSettings]);

    const upsertMutation = useMutation({
        mutationFn: settingsApi.upsert,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings"] });
        },
    });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const settingsToSave = [
                { key: "mobile_hero_slides", value: JSON.stringify(settings.heroSlides) },
                { key: "mobile_banner_enabled", value: settings.bannerEnabled.toString() },
                { key: "mobile_banner_text", value: settings.bannerText },
                { key: "mobile_banner_type", value: settings.bannerType },
                { key: "mobile_banner_link", value: settings.bannerLink },
                { key: "mobile_popup_enabled", value: settings.popupEnabled.toString() },
                { key: "mobile_popup_image", value: settings.popupImage },
                { key: "mobile_popup_title", value: settings.popupTitle },
                { key: "mobile_popup_description", value: settings.popupDescription },
                { key: "mobile_popup_button_text", value: settings.popupButtonText },
                { key: "mobile_popup_button_link", value: settings.popupButtonLink },
                { key: "mobile_popup_show_once", value: settings.popupShowOnce.toString() },
                { key: "mobile_maintenance_mode", value: settings.maintenanceMode.toString() },
                { key: "mobile_maintenance_message", value: settings.maintenanceMessage },
                { key: "mobile_min_version", value: settings.minVersion },
                { key: "mobile_contact_phone", value: settings.contactPhone },
                { key: "mobile_contact_whatsapp", value: settings.contactWhatsapp },
                { key: "mobile_contact_address", value: settings.contactAddress },
                { key: "mobile_business_hours", value: settings.businessHours },
            ];

            await Promise.all(settingsToSave.map((s) => upsertMutation.mutateAsync(s)));
            toast.success("Mobile app settings saved successfully!");
        } catch (error) {
            toast.error("Failed to save mobile app settings");
        } finally {
            setIsSaving(false);
        }
    };

    const updateHeroSlide = (index: number, field: keyof HeroSlide, value: string) => {
        const newSlides = [...settings.heroSlides];
        newSlides[index] = { ...newSlides[index], [field]: value };
        setSettings({ ...settings, heroSlides: newSlides });
    };

    const addHeroSlide = () => {
        setSettings({
            ...settings,
            heroSlides: [...settings.heroSlides, { title1: "", title2: "", subtitle: "", image: "" }],
        });
    };

    const removeHeroSlide = (index: number) => {
        const newSlides = settings.heroSlides.filter((_, i) => i !== index);
        setSettings({ ...settings, heroSlides: newSlides });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Save Button */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Smartphone className="w-5 h-5" />
                        Mobile App Configuration
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Control content and settings displayed in the Android app
                    </p>
                </div>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Mobile Settings
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Hero Slides */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Image className="w-5 h-5" />
                            Hero Carousel Slides
                        </CardTitle>
                        <CardDescription>
                            Configure the rotating hero section on the app home screen
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {settings.heroSlides.map((slide, index) => (
                            <div key={index} className="p-4 border rounded-lg space-y-3">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline">Slide {index + 1}</Badge>
                                    {settings.heroSlides.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeHeroSlide(index)}
                                        >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Title Line 1</Label>
                                        <Input
                                            value={slide.title1}
                                            onChange={(e) => updateHeroSlide(index, "title1", e.target.value)}
                                            placeholder="Your TV,"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Title Line 2</Label>
                                        <Input
                                            value={slide.title2}
                                            onChange={(e) => updateHeroSlide(index, "title2", e.target.value)}
                                            placeholder="Our Care."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Subtitle</Label>
                                    <Input
                                        value={slide.subtitle}
                                        onChange={(e) => updateHeroSlide(index, "subtitle", e.target.value)}
                                        placeholder="Expert repairs at your doorstep."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Image URL</Label>
                                    <Input
                                        value={slide.image}
                                        onChange={(e) => updateHeroSlide(index, "image", e.target.value)}
                                        placeholder="https://example.com/image.jpg"
                                    />
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" onClick={addHeroSlide} className="w-full">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Slide
                        </Button>
                    </CardContent>
                </Card>

                {/* Announcement Banner */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            Announcement Banner
                        </CardTitle>
                        <CardDescription>
                            Show a message strip on the home screen
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Enable Banner</Label>
                            <Switch
                                checked={settings.bannerEnabled}
                                onCheckedChange={(checked) => setSettings({ ...settings, bannerEnabled: checked })}
                            />
                        </div>

                        {settings.bannerEnabled && (
                            <>
                                <div className="space-y-2">
                                    <Label>Banner Text</Label>
                                    <Input
                                        value={settings.bannerText}
                                        onChange={(e) => setSettings({ ...settings, bannerText: e.target.value })}
                                        placeholder="🎉 Eid Special: 20% off all repairs!"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Banner Type</Label>
                                    <Select
                                        value={settings.bannerType}
                                        onValueChange={(value: any) => setSettings({ ...settings, bannerType: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="info">Info (Blue)</SelectItem>
                                            <SelectItem value="success">Success (Green)</SelectItem>
                                            <SelectItem value="warning">Warning (Orange)</SelectItem>
                                            <SelectItem value="urgent">Urgent (Red)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Tap Action</Label>
                                    <Select
                                        value={settings.bannerLink}
                                        onValueChange={(value) => setSettings({ ...settings, bannerLink: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No Action</SelectItem>
                                            <SelectItem value="shop">Open Shop</SelectItem>
                                            <SelectItem value="repair">Open Repair Request</SelectItem>
                                            <SelectItem value="chat">Open Chat</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Promotional Popup */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Image className="w-5 h-5" />
                            Promotional Popup
                        </CardTitle>
                        <CardDescription>
                            Full-screen popup when app opens (like Daraz)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Enable Popup</Label>
                            <Switch
                                checked={settings.popupEnabled}
                                onCheckedChange={(checked) => setSettings({ ...settings, popupEnabled: checked })}
                            />
                        </div>

                        {settings.popupEnabled && (
                            <>
                                <div className="space-y-2">
                                    <Label>Popup Image URL</Label>
                                    <Input
                                        value={settings.popupImage}
                                        onChange={(e) => setSettings({ ...settings, popupImage: e.target.value })}
                                        placeholder="https://example.com/promo.jpg"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Title</Label>
                                    <Input
                                        value={settings.popupTitle}
                                        onChange={(e) => setSettings({ ...settings, popupTitle: e.target.value })}
                                        placeholder="🎉 Eid Special Sale!"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Textarea
                                        value={settings.popupDescription}
                                        onChange={(e) => setSettings({ ...settings, popupDescription: e.target.value })}
                                        placeholder="Get 20% off on all repairs this Eid!"
                                        rows={2}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label>Button Text</Label>
                                        <Input
                                            value={settings.popupButtonText}
                                            onChange={(e) => setSettings({ ...settings, popupButtonText: e.target.value })}
                                            placeholder="Book Now"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Button Action</Label>
                                        <Select
                                            value={settings.popupButtonLink}
                                            onValueChange={(value) => setSettings({ ...settings, popupButtonLink: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Close Only</SelectItem>
                                                <SelectItem value="shop">Open Shop</SelectItem>
                                                <SelectItem value="repair">Open Repair Request</SelectItem>
                                                <SelectItem value="chat">Open Chat</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label>Show Once Per Session</Label>
                                        <p className="text-xs text-muted-foreground">Only show once each time app opens</p>
                                    </div>
                                    <Switch
                                        checked={settings.popupShowOnce}
                                        onCheckedChange={(checked) => setSettings({ ...settings, popupShowOnce: checked })}
                                    />
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* App Control */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="w-5 h-5" />
                            App Control
                        </CardTitle>
                        <CardDescription>
                            Maintenance mode and version control
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                                <div>
                                    <Label>Maintenance Mode</Label>
                                    <p className="text-xs text-muted-foreground">Block app access temporarily</p>
                                </div>
                            </div>
                            <Switch
                                checked={settings.maintenanceMode}
                                onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                            />
                        </div>

                        {settings.maintenanceMode && (
                            <div className="space-y-2">
                                <Label>Maintenance Message</Label>
                                <Textarea
                                    value={settings.maintenanceMessage}
                                    onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                                    placeholder="We're updating our systems..."
                                    rows={2}
                                />
                            </div>
                        )}

                        <Separator />

                        <div className="space-y-2">
                            <Label>Minimum App Version</Label>
                            <Input
                                value={settings.minVersion}
                                onChange={(e) => setSettings({ ...settings, minVersion: e.target.value })}
                                placeholder="1.0.0"
                            />
                            <p className="text-xs text-muted-foreground">
                                Users with older versions will be prompted to update
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Phone className="w-5 h-5" />
                            Contact Information
                        </CardTitle>
                        <CardDescription>
                            Contact details shown in the mobile app
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                Phone Number
                            </Label>
                            <Input
                                value={settings.contactPhone}
                                onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                                placeholder="+880 1234-567890"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                                WhatsApp Number
                            </Label>
                            <Input
                                value={settings.contactWhatsapp}
                                onChange={(e) => setSettings({ ...settings, contactWhatsapp: e.target.value })}
                                placeholder="8801234567890"
                            />
                            <p className="text-xs text-muted-foreground">Without + sign, just digits</p>
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Address
                            </Label>
                            <Textarea
                                value={settings.contactAddress}
                                onChange={(e) => setSettings({ ...settings, contactAddress: e.target.value })}
                                placeholder="House 123, Road 45, Gulshan-2, Dhaka"
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Business Hours
                            </Label>
                            <Input
                                value={settings.businessHours}
                                onChange={(e) => setSettings({ ...settings, businessHours: e.target.value })}
                                placeholder="Sat-Thu: 10AM - 8PM"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
