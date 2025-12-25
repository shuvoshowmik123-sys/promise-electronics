import NativeLayout from "../NativeLayout";
import { Link } from "wouter";
import { ChevronLeft, Loader2, Tv, Wrench, Users, Award, MapPin, Phone, Mail, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { images } from "@/lib/mock-data";

export default function About() {
    const { data: settings = [], isLoading } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const getSetting = (key: string, defaultValue: string): string => {
        const setting = settings.find((s) => s.key === key);
        return setting?.value || defaultValue;
    };

    const getSettingArray = (key: string, defaultValue: string[]): string[] => {
        const setting = settings.find((s) => s.key === key);
        if (setting?.value) {
            try {
                return JSON.parse(setting.value);
            } catch {
                return defaultValue;
            }
        }
        return defaultValue;
    };

    const siteName = getSetting("site_name", "Promise Electronics");
    const supportPhone = getSetting("support_phone", "+880 1700-000000");
    const logoUrl = getSetting("logo_url", "");
    const aboutTitle = getSetting("about_title", "Your Trusted Electronics Partner in Bangladesh");
    const aboutDescription = getSetting("about_description", "Promise Electronics has been serving Bangladesh since 2010, providing expert TV repair services and genuine electronic parts. We are committed to delivering quality service with transparency and trust.");
    const aboutMission = getSetting("about_mission", "To provide affordable, reliable, and expert electronics repair services while offering genuine spare parts to every household in Bangladesh.");
    const aboutVision = getSetting("about_vision", "To become the most trusted electronics service provider in Bangladesh, known for quality, integrity, and customer satisfaction.");
    const capabilities = getSettingArray("about_capabilities", [
        "Expert TV Repair for all major brands",
        "Genuine spare parts and accessories",
        "Home service across Dhaka",
        "Corporate maintenance contracts",
        "24/7 customer support",
        "90-day service warranty"
    ]);
    const teamDescription = getSetting("about_team", "Our team consists of certified technicians with over 10 years of experience in electronics repair. Each technician undergoes rigorous training to stay updated with the latest technologies.");
    const address = getSetting("about_address", "House 123, Road 45, Gulshan-2, Dhaka 1212, Bangladesh");
    const email = getSetting("about_email", "support@promise-electronics.com");
    const workingHours = getSetting("about_working_hours", "Saturday - Thursday: 9:00 AM - 8:00 PM");

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)]">
            <main className="flex-1 px-4 py-6 pb-24 overflow-y-auto scrollbar-hide space-y-8">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                ) : (
                    <>
                        {/* Hero Section */}
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-24 h-24 bg-[var(--color-native-card)] rounded-full shadow-sm flex items-center justify-center p-4 border border-[var(--color-native-border)]">
                                <img src={logoUrl || images.logo} alt="Logo" className="w-full h-full object-contain" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-[var(--color-native-text)]">{siteName}</h2>
                                <p className="text-sm text-[var(--color-native-text-muted)] mt-1">{aboutTitle}</p>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-[var(--color-native-card)] rounded-2xl p-5 shadow-sm border border-[var(--color-native-border)]">
                            <h3 className="font-bold text-[var(--color-native-text)] mb-3">Who We Are</h3>
                            <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed">
                                {aboutDescription}
                            </p>
                        </div>

                        {/* Mission & Vision */}
                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-[var(--color-native-card)] rounded-2xl p-5 shadow-sm border border-[var(--color-native-border)]">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        <Award className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-[var(--color-native-text)]">Our Mission</h3>
                                </div>
                                <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed">
                                    {aboutMission}
                                </p>
                            </div>

                            <div className="bg-[var(--color-native-card)] rounded-2xl p-5 shadow-sm border border-[var(--color-native-border)]">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
                                        <Tv className="w-4 h-4" />
                                    </div>
                                    <h3 className="font-bold text-[var(--color-native-text)]">Our Vision</h3>
                                </div>
                                <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed">
                                    {aboutVision}
                                </p>
                            </div>
                        </div>

                        {/* Capabilities */}
                        <div>
                            <h3 className="font-bold text-[var(--color-native-text)] mb-4 px-1">What We Offer</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {capabilities.map((capability, index) => (
                                    <div key={index} className="bg-[var(--color-native-card)] rounded-xl p-4 shadow-sm border border-[var(--color-native-border)] flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">
                                            <Wrench className="w-4 h-4" />
                                        </div>
                                        <span className="text-sm font-medium text-[var(--color-native-text)]">{capability}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Team */}
                        <div className="bg-[var(--color-native-card)] rounded-2xl p-5 shadow-sm border border-[var(--color-native-border)] text-center">
                            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto mb-3">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-[var(--color-native-text)] mb-2">Our Expert Team</h3>
                            <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed">
                                {teamDescription}
                            </p>
                        </div>

                        {/* Contact Info */}
                        <div>
                            <h3 className="font-bold text-[var(--color-native-text)] mb-4 px-1">Contact Us</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div className="bg-[var(--color-native-card)] rounded-xl p-4 shadow-sm border border-[var(--color-native-border)] flex items-start gap-3">
                                    <MapPin className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Address</p>
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{address}</p>
                                    </div>
                                </div>
                                <div className="bg-[var(--color-native-card)] rounded-xl p-4 shadow-sm border border-[var(--color-native-border)] flex items-start gap-3">
                                    <Phone className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Phone</p>
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{supportPhone}</p>
                                    </div>
                                </div>
                                <div className="bg-[var(--color-native-card)] rounded-xl p-4 shadow-sm border border-[var(--color-native-border)] flex items-start gap-3">
                                    <Mail className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Email</p>
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{email}</p>
                                    </div>
                                </div>
                                <div className="bg-[var(--color-native-card)] rounded-xl p-4 shadow-sm border border-[var(--color-native-border)] flex items-start gap-3">
                                    <Clock className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Working Hours</p>
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{workingHours}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </NativeLayout>
    );
}
