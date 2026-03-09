import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Wrench, AlertCircle, Loader2, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { PaymentGatewayModal } from "@/components/shared/PaymentGatewayModal";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface QuoteDetails {
    id: string;
    device: string;
    status: string;
    createdAt: string;
    estimatedCost: string | null;
    tasks: Array<{ id: string; name: string }>;
    parts: Array<{ id: string; name: string; quantity: number }>;
}

interface QuoteApprovalResponse {
    serviceRequestId?: string;
    jobId?: string;
    trackingType?: "service" | "product";
}

export default function QuoteApprovalPage() {
    usePageTitle("1-Click Approval");
    const [, navigate] = useLocation();
    const [match, params] = useRoute("/quote/:token");
    const token = params?.token;

    const [showPayment, setShowPayment] = useState(false);

    const { data: quote, isLoading, error } = useQuery<QuoteDetails>({
        queryKey: ["public-quote", token],
        queryFn: async () => {
            const response = await fetch(`/api/public/quote/${token}`);
            if (!response.ok) {
                throw new Error("Quote not found or invalid token");
            }
            return response.json();
        },
        enabled: !!token,
        retry: false
    });

    const approveMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch(`/api/public/quote/${token}/approve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (!response.ok) {
                throw new Error("Approval failed");
            }
            return response.json() as Promise<QuoteApprovalResponse>;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["public-quote", token] });
            const serviceRequestId = data?.serviceRequestId;
            const trackingType = data?.trackingType || "service";
            if (!serviceRequestId && !data?.jobId) {
                toast({
                    variant: "destructive",
                    title: "Tracking Redirect Error",
                    description: "Approval succeeded but tracking id is unavailable. Please use Track Order.",
                });
                return;
            }
            // Redirect to tracker after brief delay
            setTimeout(() => {
                if (serviceRequestId) {
                    navigate(`/track-order?order=${encodeURIComponent(serviceRequestId)}&type=${trackingType}`);
                } else {
                    navigate(`/track?id=${encodeURIComponent(data.jobId || '')}`);
                }
            }, 3000);
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Approval Error",
                description: err.message || "Failed to approve the quote. Please contact support.",
            });
        }
    });

    const handlePaymentSuccess = () => {
        approveMutation.mutate();
    };

    const isAlreadyApproved = quote?.status === "Approved" || quote?.status === "In Progress" || quote?.status === "Completed";
    const cost = parseFloat(quote?.estimatedCost || "0");

    if (!token) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md border-0 shadow-xl rounded-2xl">
                        <CardContent className="p-8 text-center">
                            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Invalid Access Link</h2>
                            <p className="text-slate-500 mb-6">This quote approval link is invalid or has expired.</p>
                            <Button onClick={() => navigate("/")} className="w-full h-12 rounded-xl">Return Home</Button>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    if (isLoading) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                </div>
            </>
        );
    }

    if (error || !quote) {
        return (
            <>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md border-0 shadow-xl rounded-2xl">
                        <CardContent className="p-8 text-center flex flex-col items-center">
                            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Quote Not Found</h2>
                            <p className="text-slate-500 mb-6 font-medium leading-relaxed">We couldn't locate this repair estimate. It may have been rescinded or merged.</p>
                            <Button onClick={() => navigate("/")} variant="outline" className="w-full h-12 rounded-xl border-2 hover:bg-slate-50">Return Home</Button>
                        </CardContent>
                    </Card>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8">

                <div className="w-full max-w-lg relative z-10">

                    {/* Main Card */}
                    <Card className="border-0 shadow-2xl rounded-[2rem] overflow-hidden bg-white">
                        <div className={`p-8 pb-10 text-white relative ${isAlreadyApproved ? 'bg-gradient-to-br from-emerald-600 to-emerald-800' : 'bg-gradient-to-br from-slate-900 to-slate-800'}`}>
                            <div className="absolute top-0 right-0 p-6 opacity-20">
                                <FileText className="w-32 h-32 -rotate-12 translate-x-8 -translate-y-8" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <Badge variant="outline" className={`border-white/20 bg-white/10 text-white backdrop-blur-md px-3 py-1 font-bold tracking-widest uppercase text-xs rounded-lg`}>
                                        TICKET #{quote.id}
                                    </Badge>
                                    {isAlreadyApproved && (
                                        <div className="flex items-center gap-1.5 text-emerald-200 text-sm font-bold bg-emerald-900/40 px-3 py-1 rounded-full border border-emerald-500/30">
                                            <ShieldCheck className="w-4 h-4" /> Paid & Approved
                                        </div>
                                    )}
                                </div>

                                <h2 className="text-4xl font-black tracking-tight mb-2">Repair Estimate</h2>
                                <p className="text-slate-300 font-medium text-lg">{quote.device}</p>
                            </div>
                        </div>

                        <CardContent className="p-8 -mt-6 bg-white rounded-t-[2rem] relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">

                            {!isAlreadyApproved ? (
                                <>
                                    {/* Cost Summary Banner */}
                                    <div className="bg-blue-50/80 p-6 rounded-2xl border border-blue-100 flex items-center justify-between mb-8 shadow-inner">
                                        <div>
                                            <span className="block text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">Total Due</span>
                                            <span className="block text-4xl font-black text-slate-900 leading-none">৳{cost.toLocaleString()}</span>
                                        </div>
                                        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm border border-blue-50">
                                            <ShieldCheck className="w-7 h-7 text-blue-600" />
                                        </div>
                                    </div>

                                    {/* Tasks and Parts */}
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <Wrench className="w-4 h-4" /> Labor & Services
                                            </h3>
                                            {quote.tasks?.length > 0 ? (
                                                <div className="space-y-2">
                                                    {quote.tasks.map(t => (
                                                        <div key={t.id} className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            <div className="mt-0.5"><CheckCircle2 className="w-4 h-4 text-emerald-500" /></div>
                                                            <span className="text-slate-700 font-medium text-sm leading-snug">{t.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-slate-400 text-sm italic py-2 px-3 bg-slate-50 rounded-lg">Standard labor applies.</p>
                                            )}
                                        </div>

                                        {quote.parts?.length > 0 && (
                                            <div>
                                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4" /> Requested Parts
                                                </h3>
                                                <div className="space-y-2">
                                                    {quote.parts.map(p => (
                                                        <div key={p.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            <span className="text-slate-700 font-medium text-sm">{p.name}</span>
                                                            <span className="text-slate-500 font-bold bg-white px-2 py-0.5 rounded shadow-sm text-xs border border-slate-100">Qty: {p.quantity}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="mt-10 space-y-3">
                                        <Button
                                            className="w-full h-14 text-lg font-bold rounded-xl shadow-xl shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 transition-all hover:scale-[1.02]"
                                            onClick={() => setShowPayment(true)}
                                        >
                                            Approve & Pay ৳{cost.toLocaleString()}
                                            <ArrowRight className="w-5 h-5 ml-2" />
                                        </Button>
                                        <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest pt-2">
                                            Secure 1-Click Link Verification
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <AnimatePresence>
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="py-10 text-center space-y-6"
                                    >
                                        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner shadow-emerald-200">
                                            <CheckCircle2 className="w-12 h-12" />
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-2xl font-black text-slate-900">Quote Approved</h3>
                                            <p className="text-slate-500 font-medium px-4">
                                                Thank you! Your payment was received and the repair is officially in progress.
                                            </p>
                                        </div>
                                        <div className="pt-6">
                                            <Button
                                                variant="outline"
                                                className="h-12 rounded-xl px-8 border-2 font-bold hover:bg-slate-50"
                                                onClick={() => navigate("/track-order?type=service")}
                                            >
                                                Track Repair Pipeline
                                            </Button>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                            )}

                        </CardContent>
                    </Card>
                </div>

            </div>

            <PaymentGatewayModal
                isOpen={showPayment}
                onOpenChange={setShowPayment}
                amount={cost}
                onSuccess={handlePaymentSuccess}
            />
        </>
    );
}
