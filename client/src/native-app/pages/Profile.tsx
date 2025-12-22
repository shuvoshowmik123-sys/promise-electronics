import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import NativeLayout from "../NativeLayout";
import {
    User,
    Settings,
    LogOut,
    MapPin,
    Headphones,
    Wrench,
    Package,
    CreditCard,
    ArrowUpRight,
    Edit2,
    ShieldCheck,
    Lock
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function Profile() {
    const { customer, logout } = useCustomerAuth();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { t } = useTranslation();

    const handleLogout = async () => {
        try {
            await logout();
            setLocation("/native/login");
            toast({
                title: t('profile.logged_out'),
                description: t('profile.see_you_soon'),
            });
        } catch (error) {
            toast({
                title: t('profile.error'),
                description: t('profile.failed_logout'),
                variant: "destructive",
            });
        }
    };

    if (!customer) {
        return (
            <NativeLayout className="pb-32 bg-[var(--color-native-bg)]">
                <header className="sticky top-0 z-20 bg-[var(--color-native-surface)]/90 backdrop-blur-md px-6 py-4 shadow-sm flex items-center justify-center transition-all duration-300">
                    <h1 className="text-lg font-bold tracking-tight text-[var(--color-native-text)]">{t('profile.title')}</h1>
                </header>
                <main className="grid grid-cols-2 gap-4 px-5 pt-4 pb-24">
                    {/* Welcome Guest Card */}
                    <div className="col-span-2 relative overflow-hidden rounded-[2.5rem] bg-[var(--color-native-card)] p-6 shadow-sm border border-[var(--color-native-border)] flex items-center gap-6 group hover:border-[var(--color-native-primary)]/30 transition-all duration-300">
                        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-native-primary)]/5 blur-3xl group-hover:bg-[var(--color-native-primary)]/10 transition-all"></div>
                        <div className="relative h-20 w-20 shrink-0 flex items-center justify-center rounded-full bg-[var(--color-native-input)] border-2 border-[var(--color-native-surface)] shadow-md text-[var(--color-native-text-muted)]">
                            <User className="w-10 h-10" />
                        </div>
                        <div className="flex flex-col flex-1 min-w-0 z-10">
                            <h2 className="text-[22px] font-bold leading-tight truncate text-[var(--color-native-text)]">{t('home.guest')}</h2>
                            <p className="text-sm font-medium text-[var(--color-native-text-muted)] truncate mb-3">{t('profile.login_message')}</p>
                            <Link href="/native/login">
                                <button className="flex w-fit items-center gap-2 rounded-full bg-[var(--color-native-primary)] px-6 py-2 text-xs font-bold text-white hover:bg-[var(--color-native-primary)]/90 transition-colors shadow-lg shadow-[var(--color-native-primary)]/20">
                                    <span>{t('profile.log_in')}</span>
                                </button>
                            </Link>
                        </div>
                    </div>

                    {/* Locked Cards */}
                    <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 border border-[var(--color-native-border)] min-h-[160px] opacity-60 select-none cursor-not-allowed">
                        <div className="absolute right-5 top-5">
                            <Lock className="text-[var(--color-native-text-muted)] w-5 h-5" />
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] grayscale">
                            <MapPin className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text-muted)] whitespace-pre-line">{t('profile.my_addresses')}</h3>
                            <p className="mt-1 text-[11px] font-medium text-[var(--color-native-text-muted)]">Login to view</p>
                        </div>
                    </div>

                    <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 border border-[var(--color-native-border)] min-h-[160px] opacity-60 select-none cursor-not-allowed">
                        <div className="absolute right-5 top-5">
                            <Lock className="text-[var(--color-native-text-muted)] w-5 h-5" />
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] grayscale">
                            <Headphones className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text-muted)] whitespace-pre-line">{t('profile.help_support')}</h3>
                            <p className="mt-1 text-[11px] font-medium text-[var(--color-native-text-muted)]">Login to access</p>
                        </div>
                    </div>

                    <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 border border-[var(--color-native-border)] min-h-[160px] opacity-60 select-none cursor-not-allowed">
                        <div className="absolute right-5 top-5">
                            <Lock className="text-[var(--color-native-text-muted)] w-5 h-5" />
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] grayscale">
                            <Wrench className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text-muted)] whitespace-pre-line">{t('profile.repair_history')}</h3>
                        </div>
                    </div>

                    <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 border border-[var(--color-native-border)] min-h-[160px] opacity-60 select-none cursor-not-allowed">
                        <div className="absolute right-5 top-5">
                            <Lock className="text-[var(--color-native-text-muted)] w-5 h-5" />
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] grayscale">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text-muted)] whitespace-pre-line">{t('profile.order_history')}</h3>
                        </div>
                    </div>

                    <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 border border-[var(--color-native-border)] min-h-[160px] opacity-60 select-none cursor-not-allowed">
                        <div className="absolute right-5 top-5">
                            <Lock className="text-[var(--color-native-text-muted)] w-5 h-5" />
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] grayscale">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text-muted)] whitespace-pre-line">Payment{"\n"}Methods</h3>
                        </div>
                    </div>

                    {/* App Settings - Enabled */}
                    <Link href="/native/settings">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group min-h-[160px]">
                            <div className="absolute right-0 top-0 p-5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowUpRight className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)]">
                                <Settings className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.app_settings')}</h3>
                            </div>
                        </div>
                    </Link>
                </main>
            </NativeLayout>
        );
    }

    return (
        <NativeLayout className="pb-32">
            <main className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="grid grid-cols-2 gap-4 px-5 pt-4 pb-24">
                    {/* Profile Card */}
                    <div className="col-span-2 relative overflow-hidden rounded-[2.5rem] bg-[var(--color-native-card)] p-6 shadow-sm border border-[var(--color-native-border)] flex items-center gap-6 group">
                        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-native-primary)]/5 blur-3xl"></div>

                        <div className="relative h-20 w-20 shrink-0">
                            <div className="absolute inset-0 rounded-full bg-[var(--color-native-primary)]/20 blur-xl scale-90"></div>
                            <div className="relative h-full w-full rounded-full border-2 border-[var(--color-native-surface)] bg-[var(--color-native-input)] shadow-md overflow-hidden flex items-center justify-center">
                                {customer.profileImageUrl ? (
                                    <img
                                        src={customer.profileImageUrl}
                                        alt={customer.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <User className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col flex-1 min-w-0 z-10">
                            <h2 className="text-[22px] font-bold leading-tight truncate text-[var(--color-native-text)]">{customer.name}</h2>
                            <p className="text-sm font-medium text-[var(--color-native-text-muted)] truncate mb-3">{customer.email || customer.phone}</p>
                            <Link href="/native/settings/edit-profile">
                                <button className="flex w-fit items-center gap-2 rounded-full bg-[var(--color-native-input)] px-4 py-1.5 text-xs font-bold text-[var(--color-native-text)] hover:bg-[var(--color-native-primary)] hover:text-white transition-colors">
                                    <span>{t('profile.edit_profile')}</span>
                                    <Edit2 className="w-3 h-3" />
                                </button>
                            </Link>
                        </div>
                    </div>

                    {/* My Addresses */}
                    <Link href="/native/addresses">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="absolute right-0 top-0 p-5">
                                <ArrowUpRight className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                                <MapPin className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.my_addresses')}</h3>
                                <p className="mt-1 text-[11px] font-medium text-[var(--color-native-text-muted)]">{t('profile.manage_locations')}</p>
                            </div>
                        </div>
                    </Link>

                    {/* Help & Support */}
                    <Link href="/native/support">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="absolute right-0 top-0 p-5">
                                <ArrowUpRight className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
                                <Headphones className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.help_support')}</h3>
                                <p className="mt-1 text-[11px] font-medium text-[var(--color-native-text-muted)]">{t('profile.faq_chat')}</p>
                            </div>
                        </div>
                    </Link>

                    {/* Repair History */}
                    <Link href="/native/repair-history">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                                <Wrench className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.repair_history')}</h3>
                            </div>
                        </div>
                    </Link>

                    {/* Order History */}
                    <Link href="/native/orders">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                                <Package className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.order_history')}</h3>
                            </div>
                        </div>
                    </Link>

                    {/* Warranties */}
                    <Link href="/native/warranties">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.my_warranties')}</h3>
                                <p className="mt-1 text-[11px] font-medium text-[var(--color-native-text-muted)]">{t('profile.view_coverage')}</p>
                            </div>
                        </div>
                    </Link>

                    {/* App Settings */}
                    <Link href="/native/settings">
                        <div className="relative flex flex-col justify-between overflow-hidden rounded-[2rem] bg-[var(--color-native-card)] p-5 shadow-sm border border-[var(--color-native-border)] active:scale-[0.98] min-h-[160px]">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-native-input)] text-[var(--color-native-text-muted)]">
                                <Settings className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-[17px] font-bold leading-tight text-[var(--color-native-text)] whitespace-pre-line">{t('profile.app_settings')}</h3>
                            </div>
                        </div>
                    </Link>



                </div>
            </main>
        </NativeLayout>
    );
}
