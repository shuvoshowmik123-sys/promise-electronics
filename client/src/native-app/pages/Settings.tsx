import NativeLayout from "../NativeLayout";
import { Link } from "wouter";
import {
    ChevronLeft,
    Palette,
    Sun,
    Moon,
    Monitor,
    Bell,
    Lock,
    ChevronRight,
    Globe,
    CreditCard,
    MapPin,
    ExternalLink,
    FileText,
    LogOut,
    User,
    Check
} from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useNativeTheme } from "@/contexts/NativeThemeContext";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import AnimatedButton from "../components/AnimatedButton";
import { getApiUrl } from "@/lib/config";

export default function Settings() {
    const { customer, logout, updateProfile } = useCustomerAuth();
    const { theme, setTheme, isDark } = useNativeTheme();
    const { toast } = useToast();
    const { t, i18n } = useTranslation();
    const [isLanguageSheetOpen, setIsLanguageSheetOpen] = useState(false);



    // Parse preferences from JSON string
    const [preferences, setPreferences] = useState<{
        pushEnabled?: boolean;
        orderUpdates?: boolean;
        promotionalOffers?: boolean;
    }>({});

    useEffect(() => {
        if (customer?.preferences) {
            try {
                setPreferences(JSON.parse(customer.preferences));
            } catch (e) {
                console.error("Failed to parse preferences", e);
            }
        }
    }, [customer]);

    const handlePreferenceChange = async (key: string, value: boolean) => {
        const newPreferences = { ...preferences, [key]: value };
        setPreferences(newPreferences);

        try {
            await updateProfile({ preferences: JSON.stringify(newPreferences) });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to update settings",
                variant: "destructive",
            });
            // Revert state on error
            setPreferences(preferences);
        }
    };



    const linkGoogleAccount = async () => {
        try {
            const googleUser = await GoogleAuth.signIn();
            const idToken = googleUser.authentication.idToken;

            // Send token to backend
            const response = await fetch(getApiUrl('/api/customer/google/native-login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });

            if (response.ok) {
                const data = await response.json();
                toast({ title: "Success", description: "Google Account linked!" });
                // Force reload to update user state or manually update context if possible
                window.location.reload();
            } else {
                throw new Error("Backend linking failed");
            }
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to link Google Account", variant: "destructive" });
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error("Logout failed:", error);
        } finally {
            // Always redirect to login after logout attempt
            window.location.replace("/native/login");
        }
    };

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        setIsLanguageSheetOpen(false);
    };

    const currentLanguage = i18n.language === 'bn' ? 'বাংলা' : 'English (US)';

    return (
        <NativeLayout>
            <main className="flex-1 px-4 pb-24 max-w-md mx-auto w-full pt-2 overflow-y-auto scrollbar-hide">
                <div className="mb-6 mt-2">
                    <h2 className="text-sm font-medium text-[var(--color-native-text-muted)] uppercase tracking-wider ml-1">{t('settings.personalize')}</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Appearance Card */}
                    <div className="col-span-2 bg-[var(--color-native-card)] p-5 rounded-[1rem] shadow-sm border border-[var(--color-native-border)]">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 rounded-full bg-[var(--color-native-primary)]/20 flex items-center justify-center text-[var(--color-native-primary)]">
                                    <Palette className="w-5 h-5" />
                                </div>
                                <span className="font-bold text-lg text-[var(--color-native-text)]">{t('settings.appearance')}</span>
                            </div>
                            <div className="relative grid grid-cols-3 h-12 w-full items-center rounded-full bg-[var(--color-native-input)] p-1 border border-[var(--color-native-border)] overflow-hidden">
                                {/* Sliding Background Indicator */}
                                <div
                                    className={`absolute inset-y-1 left-1 w-[calc(33.33%-2.66px)] rounded-full bg-[var(--color-native-surface)] dark:bg-slate-600 shadow-sm transition-transform duration-300 ease-in-out ${theme === "light" ? "translate-x-0" :
                                        theme === "dark" ? "translate-x-full" :
                                            "translate-x-[200%]"
                                        }`}
                                />

                                <label className="relative z-10 flex cursor-pointer h-full items-center justify-center px-2">
                                    <span className={`flex items-center gap-2 truncate text-sm font-medium transition-colors duration-200 ${theme === "light" ? "text-[var(--color-native-primary)]" : "text-[var(--color-native-text-muted)]"}`}>
                                        <Sun className="w-4 h-4" />
                                        {t('settings.light')}
                                    </span>
                                    <input
                                        checked={theme === "light"}
                                        onChange={() => setTheme("light")}
                                        className="hidden"
                                        name="theme_toggle"
                                        type="radio"
                                        value="light"
                                    />
                                </label>
                                <label className="relative z-10 flex cursor-pointer h-full items-center justify-center px-2">
                                    <span className={`flex items-center gap-2 truncate text-sm font-medium transition-colors duration-200 ${theme === "dark" ? "text-[var(--color-native-primary)]" : "text-[var(--color-native-text-muted)]"}`}>
                                        <Moon className="w-4 h-4" />
                                        {t('settings.dark')}
                                    </span>
                                    <input
                                        checked={theme === "dark"}
                                        onChange={() => setTheme("dark")}
                                        className="hidden"
                                        name="theme_toggle"
                                        type="radio"
                                        value="dark"
                                    />
                                </label>
                                <label className="relative z-10 flex cursor-pointer h-full items-center justify-center px-2">
                                    <span className={`flex items-center gap-2 truncate text-sm font-medium transition-colors duration-200 ${theme === "system" ? "text-[var(--color-native-primary)]" : "text-[var(--color-native-text-muted)]"}`}>
                                        <Monitor className="w-4 h-4" />
                                        {t('settings.auto')}
                                    </span>
                                    <input
                                        checked={theme === "system"}
                                        onChange={() => setTheme("system")}
                                        className="hidden"
                                        name="theme_toggle"
                                        type="radio"
                                        value="system"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Push Notifications Card */}
                    <div className="col-span-1 bg-[var(--color-native-card)] p-5 rounded-[1rem] shadow-sm border border-[var(--color-native-border)] flex flex-col justify-between aspect-square group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-5 opacity-10 pointer-events-none">
                            <Bell className="w-16 h-16 rotate-12" />
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[var(--color-native-primary)] flex items-center justify-center text-white shadow-lg shadow-[var(--color-native-primary)]/20 z-10">
                            <Bell className="w-5 h-5" />
                        </div>
                        <div className="z-10">
                            <div className="flex justify-between items-end">
                                <span className="font-bold text-base leading-tight text-[var(--color-native-text)]">{t('settings.push_notification')}</span>
                                <Switch
                                    checked={preferences.pushEnabled ?? true}
                                    onCheckedChange={(checked) => handlePreferenceChange('pushEnabled', checked)}
                                    className="transition-none data-[state=checked]:bg-[var(--color-native-primary)] data-[state=unchecked]:bg-[var(--color-native-input)] border-[var(--color-native-border)] [&>span]:bg-[var(--color-native-surface)]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Privacy & Data Card */}
                    <Link href="/native/privacy-policy">
                        <AnimatedButton variant="cardExpand" className="w-full col-span-1 bg-[var(--color-native-card)] p-5 rounded-[1rem] shadow-sm border border-[var(--color-native-border)] flex flex-col justify-between aspect-square cursor-pointer group text-left">
                            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500">
                                <Lock className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex justify-between items-end w-full">
                                    <span className="font-bold text-base leading-tight text-[var(--color-native-text)]">{t('settings.privacy_data')}</span>
                                    <div className="w-8 h-8 rounded-full bg-transparent flex items-center justify-center group-hover:bg-[var(--color-native-surface)] group-hover:translate-x-1 transition-all">
                                        <ChevronRight className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                                    </div>
                                </div>
                            </div>
                        </AnimatedButton>
                    </Link>



                    {/* General Section */}
                    <div className="col-span-2 bg-[var(--color-native-card)] rounded-[1rem] shadow-sm border border-[var(--color-native-border)] overflow-hidden mt-2">
                        <div className="p-5 pb-2">
                            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-native-text-muted)]">{t('settings.general')}</span>
                        </div>
                        <div className="flex flex-col">
                            <Sheet open={isLanguageSheetOpen} onOpenChange={setIsLanguageSheetOpen}>
                                <SheetTrigger asChild>
                                    <button className="flex items-center justify-between p-5 hover:bg-[var(--color-native-input)] border-b border-[var(--color-native-border)] w-full">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-500/20 text-blue-500 w-8 h-8 rounded-full flex items-center justify-center">
                                                <Globe className="w-5 h-5" />
                                            </div>
                                            <span className="font-medium text-base text-[var(--color-native-text)]">{t('settings.language')}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[var(--color-native-text-muted)]">
                                            <span className="text-sm">{currentLanguage}</span>
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="rounded-t-[2rem] p-0 border-t border-[var(--color-native-border)] bg-[var(--color-native-surface)]">
                                    <SheetHeader className="p-6 pb-2 text-left">
                                        <SheetTitle className="text-xl font-bold text-[var(--color-native-text)]">{t('settings.language')}</SheetTitle>
                                    </SheetHeader>
                                    <div className="p-4 flex flex-col gap-2">
                                        <button
                                            onClick={() => changeLanguage('en')}
                                            className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-native-input)] transition-colors"
                                        >
                                            <span className="font-medium text-lg text-[var(--color-native-text)]">English (US)</span>
                                            {i18n.language !== 'bn' && <Check className="w-5 h-5 text-[var(--color-native-primary)]" />}
                                        </button>
                                        <button
                                            onClick={() => changeLanguage('bn')}
                                            className="flex items-center justify-between p-4 rounded-xl hover:bg-[var(--color-native-input)] transition-colors"
                                        >
                                            <span className="font-medium text-lg text-[var(--color-native-text)]">বাংলা</span>
                                            {i18n.language === 'bn' && <Check className="w-5 h-5 text-[var(--color-native-primary)]" />}
                                        </button>
                                    </div>
                                    <div className="h-8"></div>
                                </SheetContent>
                            </Sheet>

                            {customer && (
                                <Link href="/native/settings/change-password">
                                    <AnimatedButton variant="rowExpand" className="w-full flex items-center justify-between p-5 hover:bg-[var(--color-native-input)] border-b border-[var(--color-native-border)] text-left">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-purple-500/20 text-purple-500 w-8 h-8 rounded-full flex items-center justify-center">
                                                <Lock className="w-5 h-5" />
                                            </div>
                                            <span className="font-medium text-base text-[var(--color-native-text)]">{t('settings.change_password')}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[var(--color-native-text-muted)]">
                                            <ChevronRight className="w-5 h-5" />
                                        </div>
                                    </AnimatedButton>
                                </Link>
                            )}


                            {customer && !customer.googleSub && (
                                <AnimatedButton
                                    onClick={linkGoogleAccount}
                                    className="w-full flex items-center justify-between p-5 hover:bg-[var(--color-native-input)] border-b border-[var(--color-native-border)]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="bg-red-500/10 text-red-500 w-8 h-8 rounded-full flex items-center justify-center">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                                            </svg>
                                        </div>
                                        <span className="font-medium text-base text-[var(--color-native-text)]">Link Google Account</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[var(--color-native-text-muted)]">
                                        <ChevronRight className="w-5 h-5" />
                                    </div>
                                </AnimatedButton>
                            )}
                            <button className="flex items-center justify-between p-5 hover:bg-[var(--color-native-input)]">
                                <div className="flex items-center gap-3">
                                    <div className="bg-pink-500/20 text-pink-500 w-8 h-8 rounded-full flex items-center justify-center">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium text-base text-[var(--color-native-text)]">{t('settings.location_services')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[var(--color-native-text-muted)]">
                                    <span className="text-sm">{t('settings.while_using')}</span>
                                    <ChevronRight className="w-5 h-5" />
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Info Links */}
                    <div className="col-span-2 bg-[var(--color-native-card)] p-1 rounded-[1rem] shadow-sm border border-[var(--color-native-border)] flex flex-col gap-1 mt-2">
                        <Link href="/native/about">
                            <AnimatedButton variant="rowExpand" className="w-full flex items-center justify-between p-4 rounded-md group text-left">
                                <span className="font-medium text-[var(--color-native-text)]">{t('settings.about')}</span>
                                <ExternalLink className="w-5 h-5 text-[var(--color-native-text-muted)] group-hover:text-[var(--color-native-primary)]" />
                            </AnimatedButton>
                        </Link>
                        <div className="h-px bg-[var(--color-native-border)] mx-4"></div>
                        <Link href="/native/terms-and-conditions">
                            <AnimatedButton variant="rowExpand" className="w-full flex items-center justify-between p-4 rounded-md group text-left">
                                <span className="font-medium text-[var(--color-native-text)]">{t('settings.terms')}</span>
                                <FileText className="w-5 h-5 text-[var(--color-native-text-muted)] group-hover:text-[var(--color-native-primary)]" />
                            </AnimatedButton>
                        </Link>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 flex flex-col items-center gap-6">
                    <div className="bg-[var(--color-native-card)] px-4 py-1.5 rounded-full border border-[var(--color-native-border)] shadow-sm">
                        <span className="text-xs font-medium text-[var(--color-native-text-muted)]">{t('settings.version')} 2.4.0 (Build 302)</span>
                    </div>
                    {customer && (
                        <AnimatedButton
                            onClick={handleLogout}
                            className="col-span-2 flex items-center justify-between rounded-[2rem] bg-red-500/10 p-5 text-red-500 active:scale-[0.99] mt-2 w-full"
                        >
                            <span className="font-bold tracking-wide text-lg">{t('settings.logout')}</span>
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-native-surface)] shadow-sm">
                                <LogOut className="w-5 h-5" />
                            </div>
                        </AnimatedButton>
                    )}
                </div>
                <div className="h-10"></div>
            </main>
        </NativeLayout>
    );
}

