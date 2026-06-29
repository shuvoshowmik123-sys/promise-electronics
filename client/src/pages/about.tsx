import { Card, CardContent } from "@/components/ui/card";
import { PillButton, SectionEyebrow } from "@/components/customer/mobile-kit";
import { useQuery } from "@tanstack/react-query";
import { publicSettingsApi } from "@/lib/api";
import { images } from "@/lib/app-config";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Award, CheckCircle, Clock, Mail, MapPin, Phone, ShieldCheck, Tv, Users, Wrench } from "lucide-react";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export default function AboutPage() {
  usePageTitle("About Us");
  const { t, language } = useCustomerLanguage();
  const { data: settings = [] } = useQuery({
    queryKey: ["public-settings"],
    queryFn: publicSettingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const getSetting = (key: string, defaultValue: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const getLocalizedSetting = (key: string, defaultValue: string): string => {
    if (language === "bn") {
      const banglaValue = getSetting(key + "_bn", "");
      if (banglaValue.trim()) return banglaValue;
    }
    return getSetting(key, defaultValue);
  };

  const getSettingArray = (key: string, defaultValue: string[]): string[] => {
    const setting = settings.find((s) => s.key === key);
    if (!setting?.value) return defaultValue;
    try {
      const parsed = JSON.parse(setting.value);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const getLocalizedSettingArray = (key: string, defaultValue: string[]): string[] => {
    if (language === "bn") {
      const banglaValue = getSettingArray(key + "_bn", []);
      if (banglaValue.length > 0) return banglaValue;
    }
    return getSettingArray(key, defaultValue);
  };

  const siteName = getSetting("site_name", "Promise Electronics");
  const supportPhone = getSetting("support_phone", "+880 1700-000000");
  const logoUrl = getSetting("logo_url", "");
  const aboutTitle = getLocalizedSetting("about_title", "Your trusted electronics partner in Bangladesh");
  const aboutDescription = getLocalizedSetting("about_description", "Promise Electronics provides expert TV repair, genuine parts, and transparent service for families and businesses across Dhaka.");
  const aboutMission = getLocalizedSetting("about_mission", "To make electronics repair reliable, understandable, and fair for every customer.");
  const aboutVision = getLocalizedSetting("about_vision", "To become Bangladesh's most trusted electronics service network.");
  const capabilities = getLocalizedSettingArray("about_capabilities", [
    "Expert TV repair for major brands",
    "Genuine spare parts and accessories",
    "Home pickup and delivery in Dhaka",
    "Corporate repair support",
    "Clear repair tracking",
    "Service warranty support",
  ]);
  const teamDescription = getLocalizedSetting("about_team", "Our technicians combine field experience with careful diagnosis, so customers understand what is happening before repair work begins.");
  const address = getLocalizedSetting("about_address", "Dhaka, Bangladesh");
  const email = getSetting("about_email", "support@promise-electronics.com");
  const workingHours = getLocalizedSetting("about_working_hours", "Saturday - Thursday: 9:00 AM - 8:00 PM");

  const stats = [
    { label: t("about.years"), value: "10+", icon: Clock },
    { label: t("about.repairs"), value: "5K+", icon: Wrench },
    { label: t("about.warranty"), value: "90d", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-emerald-50/40 pb-32 md:pb-0">
      <section className="md:hidden mx-auto max-w-[520px] px-4 pt-4 sm:max-w-[560px]">
        <div className="rounded-[2rem] bg-white border border-emerald-100 p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-3xl bg-blue-50 p-2 flex items-center justify-center">
              <img src={logoUrl || images.logo} alt={siteName + " logo"} className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <SectionEyebrow>{t("about.title")}</SectionEyebrow>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{t("about.heading")}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">{aboutTitle}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-2xl bg-slate-50 p-3 text-center">
                  <Icon className="mx-auto mb-1 h-4 w-4 text-emerald-600" />
                  <div className="text-lg font-black text-slate-950">{stat.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="hidden md:block bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-20">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl rounded-3xl bg-slate-100 p-12 text-center shadow-neumorph-lg">
            <div className="mx-auto mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-slate-100 p-4 shadow-neumorph">
              <img src={logoUrl || images.logo} alt={siteName + " logo"} className="h-full w-full object-contain" />
            </div>
            <h1 className="text-5xl font-bold text-slate-800">About {siteName}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-xl text-muted-foreground">{aboutTitle}</p>
            <div className="mx-auto mt-8 h-1 w-24 rounded-full bg-gradient-to-r from-primary to-teal-500" />
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-6 md:py-12">
        <div className="mx-auto max-w-[520px] space-y-5 sm:max-w-[560px] md:max-w-5xl md:space-y-8">
          <Card className="rounded-[1.75rem] border-none bg-white shadow-sm md:shadow-neumorph">
            <CardContent className="p-5 md:p-8">
              <SectionEyebrow>{t("about.who")}</SectionEyebrow>
              <h2 className="mt-3 text-xl md:text-2xl font-black text-slate-950">{t("about.guidance")}</h2>
              <p className="mt-3 text-sm md:text-lg leading-7 text-slate-600">{aboutDescription}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-[1.75rem] border-none bg-white shadow-sm md:shadow-neumorph">
              <CardContent className="p-5 md:p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Tv className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-950">{t("about.mission")}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{aboutMission}</p>
              </CardContent>
            </Card>
            <Card className="rounded-[1.75rem] border-none bg-white shadow-sm md:shadow-neumorph">
              <CardContent className="p-5 md:p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-950">{t("about.vision")}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{aboutVision}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[1.75rem] border-none bg-white shadow-sm md:shadow-neumorph">
            <CardContent className="p-5 md:p-8">
              <SectionEyebrow>{t("about.offer")}</SectionEyebrow>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {capabilities.map((capability) => (
                  <div key={capability} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600" />
                    <span className="text-sm font-semibold leading-6 text-slate-700">{capability}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-none bg-white shadow-sm md:shadow-neumorph">
            <CardContent className="p-5 md:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <SectionEyebrow>{t("about.team")}</SectionEyebrow>
                  <p className="mt-3 text-sm md:text-base leading-7 text-slate-600">{teamDescription}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-none bg-slate-900 text-white shadow-sm">
            <CardContent className="p-5 md:p-8">
              <SectionEyebrow className="text-emerald-200">{t("about.contact")}</SectionEyebrow>
              <div className="mt-5 space-y-4 text-sm text-slate-200">
                <div className="flex gap-3"><MapPin className="h-5 w-5 text-blue-300" /><span>{address}</span></div>
                <div className="flex gap-3"><Phone className="h-5 w-5 text-blue-300" /><span>{supportPhone}</span></div>
                <div className="flex gap-3"><Mail className="h-5 w-5 text-blue-300" /><span>{email}</span></div>
                <div className="flex gap-3"><Clock className="h-5 w-5 text-blue-300" /><span>{workingHours}</span></div>
              </div>
              <PillButton className="mt-6 md:max-w-xs" onClick={() => { window.location.href = "tel:" + supportPhone.replace(/\s/g, ""); }}>
                {t("about.callSupport")}
              </PillButton>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
