import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Smartphone, CheckCircle2, Loader2, ShieldCheck, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

interface PaymentGatewayModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    amount: number;
    onSuccess: () => void;
}

export function PaymentGatewayModal({ isOpen, onOpenChange, amount, onSuccess }: PaymentGatewayModalProps) {
    const [method, setMethod] = useState<"card" | "bkash">("card");
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Form State
    const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
    const [expiry, setExpiry] = useState("12/26");
    const [cvc, setCvc] = useState("123");
    const [bkashNumber, setBkashNumber] = useState("01712345678");

    const handlePayment = () => {
        setIsProcessing(true);

        // Simulate network delay and processing
        setTimeout(() => {
            setIsProcessing(false);
            setIsSuccess(true);

            // Simulate success delay before closing
            setTimeout(() => {
                setIsSuccess(false);
                onOpenChange(false);
                onSuccess();
                toast({
                    title: "Payment Successful",
                    description: `Successfully processed ৳${amount.toLocaleString()}`,
                });
            }, 1500);
        }, 2000);
    };

    return (
        <Dialog open={isOpen} onOpenChange={!isProcessing && !isSuccess ? onOpenChange : undefined}>
            <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden border-0 shadow-2xl rounded-2xl">

                {/* Header Area */}
                <div className="bg-slate-900 text-white p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                    <DialogHeader className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs font-medium text-slate-300 uppercase tracking-widest">Secure Checkout</span>
                            </div>
                            <ShieldCheck className="w-8 h-8 text-slate-700" />
                        </div>
                        <DialogTitle className="text-2xl font-black">Pay & Approve</DialogTitle>
                        <DialogDescription className="text-slate-300">
                            Provide payment to authorize the repair.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="mt-6 flex items-end gap-2">
                        <span className="text-sm font-medium text-slate-400 mb-1">Total Due:</span>
                        <span className="text-4xl font-black tracking-tight">৳{amount.toLocaleString()}</span>
                    </div>
                </div>

                <div className="p-6">
                    <AnimatePresence mode="wait">
                        {isSuccess ? (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="py-12 flex flex-col items-center justify-center text-center space-y-4"
                            >
                                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                    <CheckCircle2 className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900">Payment Approved</h3>
                                <p className="text-slate-500">Your repair has been officially authorized.</p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Payment Method Selector */}
                                <div className="grid grid-cols-2 gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={`h-14 flex flex-col gap-1 rounded-xl border-2 transition-all ${method === 'card' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                        onClick={() => setMethod('card')}
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        <span className="text-xs font-semibold">Credit Card</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className={`h-14 flex flex-col gap-1 rounded-xl border-2 transition-all ${method === 'bkash' ? 'border-pink-600 bg-pink-50 text-pink-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                        onClick={() => setMethod('bkash')}
                                    >
                                        <Smartphone className="w-5 h-5" />
                                        <span className="text-xs font-semibold">bKash Mobile</span>
                                    </Button>
                                </div>

                                {/* Dynamic Payment Form */}
                                <div className="space-y-4">
                                    {method === 'card' ? (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Card Number (Mock)</Label>
                                                <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="font-mono bg-slate-50 border-slate-200" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Expiry</Label>
                                                    <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} className="font-mono bg-slate-50 border-slate-200" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CVC</Label>
                                                    <Input value={cvc} type="password" onChange={(e) => setCvc(e.target.value)} className="font-mono bg-slate-50 border-slate-200" />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-pink-500 uppercase tracking-widest">bKash Account Number</Label>
                                                <Input value={bkashNumber} onChange={(e) => setBkashNumber(e.target.value)} className="font-mono bg-pink-50/50 border-pink-200 focus-visible:ring-pink-500" placeholder="01X XXXX XXXX" />
                                            </div>
                                            <div className="p-4 bg-pink-50 rounded-xl border border-pink-100 flex items-start gap-3">
                                                <Smartphone className="w-5 h-5 text-pink-600 mt-0.5" />
                                                <p className="text-xs text-pink-800 leading-relaxed font-medium">
                                                    A verification code and PIN prompt will be sent to your mobile device upon confirming.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <DialogFooter>
                                    <Button
                                        className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-blue-500/20"
                                        disabled={isProcessing}
                                        onClick={handlePayment}
                                    >
                                        {isProcessing ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            `Securely Pay ৳${amount.toLocaleString()}`
                                        )}
                                    </Button>
                                </DialogFooter>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
