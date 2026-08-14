import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { customerAuthApi } from "@/lib/api";
import { PhoneInput } from "@/components/ui/phone-input";
import { toE164Bd } from "@/lib/phone";

type Stage = "loading" | "invalid" | "form" | "success";

export default function ResetPage() {
    const { completeResetLink } = useCustomerAuth();
    const { toast } = useToast();

    const [stage, setStage] = useState<Stage>("loading");
    const [token, setToken] = useState("");

    // form fields
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    // Read token from fragment on mount, strip from address bar immediately
    useEffect(() => {
        const hash = window.location.hash;
        const match = hash.match(/[#&]t=([^&]+)/);
        if (!match) {
            setStage("invalid");
            return;
        }
        const raw = match[1];
        setToken(raw);
        history.replaceState(null, "", window.location.pathname + window.location.search);

        customerAuthApi.verifyResetLink(raw)
            .then(({ valid }) => setStage(valid ? "form" : "invalid"))
            .catch(() => setStage("invalid"));
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!phone.trim()) {
            toast({ title: "Phone required", variant: "destructive" });
            return;
        }
        // Matches the server contract (min 6) used by every other password path.
        if (password.length < 6) {
            toast({ title: "Password must be at least 6 characters", variant: "destructive" });
            return;
        }
        if (password !== confirmPassword) {
            toast({ title: "Passwords do not match", variant: "destructive" });
            return;
        }

        setBusy(true);
        try {
            /**
             * The field hands back the ten local digits, so there is nothing left
             * to guess about. This used to re-implement the country-code rules
             * inline — a fourth copy of a rule that belongs in one place.
             */
            const normalized = toE164Bd(phone);
            if (!normalized) {
                toast({ title: "Enter your mobile number", variant: "destructive" });
                setBusy(false);
                return;
            }

            await completeResetLink({ token, phone: normalized, password, confirmPassword });
            setStage("success");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
            toast({ title: "Could not activate account", description: msg, variant: "destructive" });
            // Re-verify in case link was just consumed or expired
            try {
                const { valid } = await customerAuthApi.verifyResetLink(token);
                if (!valid) setStage("invalid");
            } catch {
                // ignore
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-12">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
            >
                {stage === "loading" && (
                    <Card>
                        <CardContent className="flex flex-col items-center gap-4 py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Verifying your link…</p>
                        </CardContent>
                    </Card>
                )}

                {stage === "invalid" && (
                    <Card>
                        <CardHeader className="text-center">
                            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
                            <CardTitle>Link expired or already used</CardTitle>
                            <CardDescription>
                                This setup link is no longer valid. It may have expired (24 hours) or already been used.
                                Contact our team for a new link.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Button asChild variant="outline" className="w-full">
                                <Link href="/login">Back to login</Link>
                            </Button>
                            <Button asChild className="w-full">
                                <Link href="/support">Contact support</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {stage === "form" && (
                    <Card>
                        <CardHeader className="text-center">
                            <ShieldCheck className="w-10 h-10 text-primary mx-auto mb-2" />
                            <CardTitle>Set up your account</CardTitle>
                            <CardDescription>
                                Enter the phone number you gave us and choose a password. This link works once.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reset-phone">Phone number</Label>
                                    <PhoneInput
                                        id="reset-phone"
                                        name="phone"
                                        autoComplete="username"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        disabled={busy}
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground">The number you provided when booking</p>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reset-password">New password</Label>
                                    <div className="relative">
                                        <Input
                                            id="reset-password"
                                            name="password"
                                            type={showPw ? "text" : "password"}
                                            autoComplete="new-password"
                                            placeholder="At least 6 characters"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            disabled={busy}
                                            required
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPw(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            tabIndex={-1}
                                            aria-label={showPw ? "Hide password" : "Show password"}
                                        >
                                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reset-confirm">Confirm password</Label>
                                    <div className="relative">
                                        <Input
                                            id="reset-confirm"
                                            name="confirmPassword"
                                            type={showConfirm ? "text" : "password"}
                                            autoComplete="new-password"
                                            placeholder="Repeat your password"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            disabled={busy}
                                            required
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                            tabIndex={-1}
                                            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                                        >
                                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <Button type="submit" disabled={busy} className="w-full mt-2">
                                    {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Activate account
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {stage === "success" && (
                    <Card>
                        <CardHeader className="text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                            <CardTitle>Account activated!</CardTitle>
                            <CardDescription>
                                Your account is ready. You're now signed in.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Button asChild className="w-full">
                                <Link href="/my-repairs">View my repairs</Link>
                            </Button>
                            <Button asChild variant="outline" className="w-full">
                                <Link href="/home">Go to home</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </motion.div>
        </div>
    );
}
