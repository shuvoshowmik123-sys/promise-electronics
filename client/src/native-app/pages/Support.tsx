import NativeLayout from "../NativeLayout";
import { Phone, Mail, MessageCircle, MapPin, Clock, ChevronRight, HelpCircle, FileText, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";

export default function Support() {
    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const supportPhone = settings.find(s => s.key === "support_phone")?.value || "+880 1700-000000";
    const supportEmail = settings.find(s => s.key === "about_email")?.value || "support@promise-electronics.com";
    const businessHours = settings.find(s => s.key === "business_hours")?.value || "9:00 AM - 9:00 PM";

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-32">
            <header className="sticky top-0 z-20 bg-[var(--color-native-surface)]/90 backdrop-blur-md px-6 pt-6 pb-4 shadow-sm border-b border-[var(--color-native-border)] transition-colors duration-200">
                <h1 className="text-2xl font-bold text-[var(--color-native-text)]">Help Center</h1>
                <p className="text-sm text-[var(--color-native-text-muted)]">How can we help you today?</p>
            </header>

            <main className="flex-1 px-4 pt-6 space-y-6 overflow-y-auto scrollbar-hide">
                {/* Contact Options - Bento Grid */}
                <section className="grid grid-cols-2 gap-3">
                    {/* Call Us - Large Square */}
                    <a href={`tel:${supportPhone}`} className="col-span-1 row-span-2 bg-blue-600 rounded-3xl p-5 flex flex-col justify-between text-white shadow-lg shadow-blue-200/20 active:scale-[0.98] transition-transform">
                        <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                            <Phone className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg leading-tight mb-1">Call Support</h3>
                            <p className="text-blue-100 text-xs mb-3">Speak with an agent directly</p>
                            <div className="bg-white/20 backdrop-blur-md rounded-full px-3 py-1.5 text-xs font-medium inline-block">
                                {supportPhone}
                            </div>
                        </div>
                    </a>

                    {/* WhatsApp - Wide Rectangle */}
                    <a href="https://wa.me/8801700000000" className="col-span-1 bg-[#25D366] rounded-3xl p-5 flex flex-col justify-between text-white shadow-lg shadow-green-200/20 active:scale-[0.98] transition-transform">
                        <div className="flex justify-between items-start">
                            <div className="bg-white/20 w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <MessageCircle className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div className="mt-2">
                            <h3 className="font-bold text-base">WhatsApp</h3>
                            <p className="text-green-100 text-[10px]">Chat instantly</p>
                        </div>
                    </a>

                    {/* Email - Wide Rectangle */}
                    <a href={`mailto:${supportEmail}`} className="col-span-1 bg-slate-800 rounded-3xl p-5 flex flex-col justify-between text-white shadow-lg shadow-slate-200/20 active:scale-[0.98] transition-transform">
                        <div className="flex justify-between items-start">
                            <div className="bg-white/20 w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                <Mail className="w-5 h-5 text-white" />
                            </div>
                        </div>
                        <div className="mt-2">
                            <h3 className="font-bold text-base">Email Us</h3>
                            <p className="text-slate-300 text-[10px]">Get a response in 24h</p>
                        </div>
                    </a>
                </section>

                {/* Quick Links */}
                <section className="space-y-3">
                    <h3 className="text-lg font-bold px-2 text-[var(--color-native-text)]">Common Topics</h3>

                    <div className="bg-[var(--color-native-card)] rounded-2xl border border-[var(--color-native-border)] overflow-hidden">
                        <button className="w-full flex items-center justify-between p-4 border-b border-[var(--color-native-border)] active:bg-[var(--color-native-input)]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <span className="font-medium text-sm text-[var(--color-native-text)]">Business Hours</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-[var(--color-native-text-muted)]">{businessHours}</span>
                                <ChevronRight className="w-4 h-4 text-[var(--color-native-text-muted)]" />
                            </div>
                        </button>

                        <button className="w-full flex items-center justify-between p-4 border-b border-[var(--color-native-border)] active:bg-[var(--color-native-input)]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <span className="font-medium text-sm text-[var(--color-native-text)]">Service Centers</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--color-native-text-muted)]" />
                        </button>

                        <button className="w-full flex items-center justify-between p-4 border-b border-[var(--color-native-border)] active:bg-[var(--color-native-input)]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <ShieldCheck className="w-4 h-4" />
                                </div>
                                <span className="font-medium text-sm text-[var(--color-native-text)]">Warranty Policy</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--color-native-text-muted)]" />
                        </button>

                        <button className="w-full flex items-center justify-between p-4 active:bg-[var(--color-native-input)]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <span className="font-medium text-sm text-[var(--color-native-text)]">Terms of Service</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--color-native-text-muted)]" />
                        </button>
                    </div>
                </section>

                {/* FAQ Teaser */}
                <section>
                    <div className="bg-gradient-to-br from-[var(--color-native-bg)] to-[var(--color-native-card)] rounded-2xl p-5 border border-[var(--color-native-border)]">
                        <div className="flex items-start gap-4">
                            <div className="bg-[var(--color-native-card)] p-3 rounded-xl shadow-sm">
                                <HelpCircle className="w-6 h-6 text-[var(--color-native-text)]" />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-[var(--color-native-text)] mb-1">Frequently Asked Questions</h3>
                                <p className="text-xs text-[var(--color-native-text-muted)] mb-3 leading-relaxed">
                                    Find answers to common questions about repairs, pricing, and warranties.
                                </p>
                                <button className="text-xs font-bold text-[var(--color-native-primary)] bg-[var(--color-native-primary)]/10 px-3 py-1.5 rounded-full">
                                    View FAQs
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                <div className="h-40"></div>
            </main>
        </NativeLayout >
    );
}
