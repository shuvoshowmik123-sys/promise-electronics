import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Phone, Mail, MessageSquare, Send, MapPin, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function SupportPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
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
            phone: phoneInput.value,
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
        {
            question: "How do I track my repair?",
            answer: "You can track your repair status by entering your Job Ticket ID in the 'Track Order' section on the home page or the dedicated tracking page."
        },
        {
            question: "What is the warranty period?",
            answer: "We offer a 90-day warranty on all repairs and replaced parts. If the same issue recurs within this period, we will fix it free of charge."
        },
        {
            question: "Do you offer home service?",
            answer: "Yes, we offer home pickup and delivery services across Dhaka. Our technicians can also visit your home for minor repairs and diagnosis."
        },
        {
            question: "What payment methods do you accept?",
            answer: "We accept Cash, bKash, Nagad, and all major Credit/Debit cards."
        }
    ];

    return (
        <PublicLayout>
            <div className="min-h-screen bg-slate-50 pb-24 pt-4 px-4">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-heading font-bold text-slate-800">Help & Support</h1>
                    <p className="text-sm text-slate-500">We're here to help you with any questions</p>
                </div>

                {/* Contact Actions */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <a href={`tel:${supportPhone.replace(/\s/g, '')}`} className="contents">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Phone className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">Call Us</span>
                        </div>
                    </a>

                    <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="contents">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                            <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                                <MessageSquare className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">WhatsApp</span>
                        </div>
                    </a>

                    <a href={`mailto:${supportEmail}`} className="contents">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
                                <Mail className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-700">Email</span>
                        </div>
                    </a>
                </div>

                {/* Contact Info Card */}
                <Card className="mb-8 border-none shadow-neumorph bg-white">
                    <CardContent className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">Visit Our Center</h3>
                                <p className="text-xs text-slate-500 mt-1">{address}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <h3 className="font-bold text-slate-800 text-sm">Business Hours</h3>
                                <p className="text-xs text-slate-500 mt-1">{businessHours}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Message Form */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Send us a Message</h2>
                    <Card className="border-none shadow-neumorph bg-white">
                        <CardContent className="p-5">
                            <form onSubmit={handleSendMessage} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">Name</label>
                                    <Input name="name" placeholder="Your Name" required className="bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">Phone Number</label>
                                    <Input name="phone" placeholder="017..." type="tel" required className="bg-slate-50 border-slate-200" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">Message</label>
                                    <Textarea name="message" placeholder="How can we help you?" required className="bg-slate-50 border-slate-200 min-h-[100px]" />
                                </div>
                                <Button type="submit" className="w-full" disabled={isSubmitting}>
                                    {isSubmitting ? "Sending..." : "Send Message"} <Send className="w-4 h-4 ml-2" />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* FAQs */}
                <div className="mb-8">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Frequently Asked Questions</h2>
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {faqs.map((faq, index) => (
                            <AccordionItem key={index} value={`item-${index}`} className="bg-white border border-slate-100 rounded-xl px-4 shadow-sm">
                                <AccordionTrigger className="text-sm font-medium text-slate-800 hover:no-underline">{faq.question}</AccordionTrigger>
                                <AccordionContent className="text-xs text-slate-500 leading-relaxed">
                                    {faq.answer}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </PublicLayout>
    );
}
