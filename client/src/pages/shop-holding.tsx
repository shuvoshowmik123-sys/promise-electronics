import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionEyebrow, PillButton } from "@/components/customer/mobile-kit";
import { Tv, Smartphone, Home, Wifi, Camera, Cable, CheckCircle2, Loader2, Send } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import { CustomerErrorBoundary } from "@/components/customer/CustomerErrorBoundary";

const PART_CATEGORIES = [
    { icon: Tv, label: "Television Parts", sub: "Panels, boards, remotes" },
    { icon: Smartphone, label: "Mobile & Tablet", sub: "Screens, batteries" },
    { icon: Home, label: "Home Appliances", sub: "AC, fridge, washing" },
    { icon: Camera, label: "CCTV & Security", sub: "Cameras, DVR, cables" },
    { icon: Wifi, label: "Networking", sub: "Routers, switches, SFP" },
    { icon: Cable, label: "Cables & Accessories", sub: "HDMI, power, adapters" },
];

const TRUST_ITEMS = [
    { label: "Genuine Parts", sub: "OEM and quality-certified components" },
    { label: "Fast Turnaround", sub: "Most parts sourced within 48 hours" },
    { label: "Expert Guidance", sub: "Our team helps you find the right part" },
];

export default function ShopHoldingPage() {
    usePageTitle("Parts & Accessories");

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !phone.trim() || !message.trim()) {
            toast.error("Please fill in all fields");
            return;
        }
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/inquiries", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), phone: phone.trim(), message: message.trim() }),
            });
            if (!res.ok) throw new Error("Failed");
            setSubmitted(true);
            toast.success("Quote request sent! We'll contact you shortly.");
        } catch {
            toast.error("Failed to send request. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <CustomerErrorBoundary>
            {/* Mobile hero card */}
            <div className="md:hidden bg-slate-50 px-4 pt-4 pb-3">
                <div className="rounded-[2rem] bg-white border border-blue-100 p-5 shadow-sm overflow-hidden relative">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-100/70" />
                    <SectionEyebrow>Parts & Accessories</SectionEyebrow>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                        Find the Part You Need
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Tell us what you're looking for and we'll source it with pricing.
                    </p>
                </div>
            </div>

            {/* Desktop hero */}
            <div className="hidden md:block bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 border-b border-slate-200/50 py-10">
                <div className="container mx-auto px-4">
                    <h1 className="text-3xl font-heading font-bold mb-2">Parts & Accessories</h1>
                    <p className="text-muted-foreground">
                        Request a quote for any part — we source genuine components and get back to you fast.
                    </p>
                </div>
            </div>

            <div className="bg-slate-50 md:bg-transparent container mx-auto px-4 py-4 md:py-8 pb-32 md:pb-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">

                    {/* Left column: categories + trust */}
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-base font-bold text-slate-800 mb-3">What We Source</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {PART_CATEGORIES.map(({ icon: Icon, label, sub }) => (
                                    <div
                                        key={label}
                                        className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm flex items-start gap-3"
                                    >
                                        <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-800 leading-tight">{label}</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
                            <h2 className="text-base font-bold text-slate-800 mb-3">Why Order Through Us</h2>
                            <div className="space-y-4">
                                {TRUST_ITEMS.map(({ label, sub }) => (
                                    <div key={label} className="flex items-start gap-3">
                                        <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{label}</p>
                                            <p className="text-xs text-slate-400">{sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right column: form */}
                    <div>
                        {submitted ? (
                            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-8 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
                                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-black text-slate-900">Request Sent!</h3>
                                <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto">
                                    Our team will contact you within a few hours about part availability and pricing.
                                </p>
                                <Button
                                    variant="outline"
                                    className="mt-5"
                                    onClick={() => {
                                        setSubmitted(false);
                                        setName("");
                                        setPhone("");
                                        setMessage("");
                                    }}
                                >
                                    Send Another Request
                                </Button>
                            </div>
                        ) : (
                            <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
                                <h3 className="font-black text-slate-900 text-lg mb-1">Request a Part Quote</h3>
                                <p className="text-sm text-slate-500 mb-5">
                                    Tell us what you need — we'll source it and send you a price.
                                </p>
                                <form onSubmit={handleSubmit} className="space-y-3">
                                    <Input
                                        placeholder="Your name"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="rounded-xl bg-slate-50 border-slate-200"
                                        required
                                    />
                                    <Input
                                        placeholder="Phone number"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="rounded-xl bg-slate-50 border-slate-200"
                                        required
                                    />
                                    <Textarea
                                        placeholder="What part do you need? Include the device model if you know it."
                                        value={message}
                                        onChange={e => setMessage(e.target.value)}
                                        className="rounded-xl bg-slate-50 border-slate-200 min-h-[100px]"
                                        required
                                    />
                                    <PillButton type="submit" disabled={isSubmitting} className="w-full">
                                        {isSubmitting ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <Send className="h-4 w-4 mr-2" />
                                        )}
                                        {isSubmitting ? "Sending..." : "Send Quote Request"}
                                    </PillButton>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </CustomerErrorBoundary>
    );
}
