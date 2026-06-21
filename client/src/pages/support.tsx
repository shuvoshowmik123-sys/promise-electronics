import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Phone, Mail, MessageSquare, Send, MapPin, Clock, Headphones } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { publicSettingsApi } from "@/lib/api";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { PillButton, SectionEyebrow } from "@/components/customer/mobile-kit";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export default function SupportPage() {
    const { toast } = useToast();
    const { t } = useCustomerLanguage();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: settings = [] } = useQuery({
        queryKey: ["public-settings"],
        queryFn: publicSettingsApi.getAll,
    });

    const getSettingValue = (key: string, defaultValue: string) => {
        const setting = settings.find((s) => s.key === key);
        return setting?.value || defaultValue;
    };

    const supportPhone = getSettingValue("support_phone", "+880 1944-488999");
    const supportEmail = getSettingValue("support_email", "support@promiseelectronics.com");
    const whatsappNumber = getSettingValue("whatsapp_number", "8801944488999");
    const address = getSettingValue("contact_address", "House 12, Road 5, Dhanmondi, Dhaka 1205");
    const businessHours = getSettingValue("business_hours", "Sat - Thu: 9:00 AM - 8:00 PM");

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.target as HTMLFormElement);
        // Get values directly from the input elements by name
        const form = e.target as HTMLFormElement;
        const nameInput = form.elements.namedItem('name') as HTMLInputElement;
        const phoneInput = form.elements.namedItem('phone') as HTMLInputElement;
        const messageInput = form.elements.namedItem('message') as HTMLTextAreaElement;

        const data = {
            name: nameInput.value,
            phone: "+880" + phoneInput.value,
            message: messageInput.value,
        };

        try {
            const response = await fetch("/api/inquiries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!response.ok) throw new Error("Failed to send message");

            toast({
                title: "Message Sent",
                description: "We'll get back to you shortly.",
            });
            form.reset();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to send message. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const faqs = [
        { question: t("support.faq1Q"), answer: t("support.faq1A") },
        { question: t("support.faq2Q"), answer: t("support.faq2A") },
        { question: t("support.faq3Q"), answer: t("support.faq3A") },
        { question: t("support.faq4Q"), answer: t("support.faq4A") },
    ];

    return (
        <>
            <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50/70 via-white to-white px-4 pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-[calc(env(safe-area-inset-top)+16px)]">
                <div className="mx-auto max-w-[520px] sm:max-w-[560px]">
                <div className="mb-5 rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                            <Headphones className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <SectionEyebrow>{t("support.eyebrow")}</SectionEyebrow>
                            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{t("support.title")}</h1>
                            <p className="mt-1 text-sm leading-6 text-slate-500">{t("support.subtitle")}</p>
                        </div>
                    </div>
                </div>

                {/* Contact Actions */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <a href={`tel:${supportPhone.replace(/\s/g, '')}`} className="contents">
                        <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[1.35rem] border border-emerald-100 bg-white p-3 shadow-sm transition-transform active:scale-95">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                                <Phone className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{t("support.callUs")}</span>
                        </div>
                    </a>

                    <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="contents">
                        <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[1.35rem] border border-emerald-100 bg-white p-3 shadow-sm transition-transform active:scale-95">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{t("support.whatsapp")}</span>
                        </div>
                    </a>

                    <a href={`mailto:${supportEmail}`} className="contents">
                        <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[1.35rem] border border-emerald-100 bg-white p-3 shadow-sm transition-transform active:scale-95">
                            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                <Mail className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{t("support.email")}</span>
                        </div>
                    </a>
                </div>

                {/* Contact Info Card */}
                <Card className="mb-8 border border-emerald-100 bg-white shadow-sm">
                    <CardContent className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-emerald-600 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{t("support.visitCenter")}</h3>
                                <p className="text-xs text-slate-500 mt-1">{address}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-emerald-600 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">{t("support.businessHours")}</h3>
                                <p className="text-xs text-slate-500 mt-1">{businessHours}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Message Form */}
                <div className="mb-8">
                    <div className="mb-4">
                        <SectionEyebrow>{t("support.messageDesk")}</SectionEyebrow>
                        <h2 className="mt-2 text-lg font-black text-slate-900">{t("support.sendMessage")}</h2>
                    </div>
                    <Card className="border border-emerald-100 bg-white shadow-sm">
                        <CardContent className="p-5">
                            <form onSubmit={handleSendMessage} className="space-y-4 pb-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">{t("support.yourName")}</label>
                                    <Input name="name" placeholder={t("support.yourName")} required className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/40" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">{t("support.yourPhone")}</label>
                                    <PhoneInput name="phone" placeholder="1XXXXXXXXX" required className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/40" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">{t("support.message")}</label>
                                    <Textarea name="message" placeholder={t("support.messagePlaceholder")} required className="min-h-[120px] rounded-2xl border-emerald-100 bg-emerald-50/40" />
                                </div>
                                <PillButton type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? t("support.sending") : t("support.send")} <Send className="w-4 h-4 ml-2" />
                                </PillButton>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* FAQs */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">{t("support.faq")}</h2>
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`} className="rounded-[1.25rem] border border-emerald-100 bg-white px-4 shadow-sm">
                                <AccordionTrigger className="text-sm font-medium text-slate-800 hover:no-underline">{faq.question}</AccordionTrigger>
                                <AccordionContent className="text-xs text-slate-500 leading-relaxed">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
                </div>
            </div>
        </>
    );
}
