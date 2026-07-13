import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Loader2, CheckCircle, XCircle, Lock, Eye, EyeOff } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { fetchApi } from "@/lib/api/httpClient";

type TokenState =
    | { status: "loading" }
    | { status: "invalid"; reason: string }
    | { status: "valid"; type: "setup" | "reset"; email: string | null; username: string | null; expiresAt: string }
    | { status: "done"; message: string };

export default function CorporateSetupPage() {
    const params = useParams<{ token: string }>();
    const token = params.token;
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [tokenState, setTokenState] = useState<TokenState>({ status: "loading" });
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setTokenState({ status: "invalid", reason: "Missing setup token." });
            return;
        }
        fetchApi<{ valid: boolean; reason?: string; type?: string; email?: string | null; username?: string | null; expiresAt?: string }>(
            `/corporate/setup/${token}`,
            { method: "GET" }
        )
            .then((data) => {
                if (!data.valid) {
                    const messages: Record<string, string> = {
                        used: "This link has already been used.",
                        expired: "This link has expired. Please ask your admin to resend.",
                        not_found: "This link is invalid or does not exist.",
                    };
                    setTokenState({ status: "invalid", reason: messages[data.reason ?? "not_found"] ?? "This link is no longer valid." });
                } else {
                    setTokenState({
                        status: "valid",
                        type: (data.type as "setup" | "reset") ?? "setup",
                        email: data.email ?? null,
                        username: data.username ?? null,
                        expiresAt: data.expiresAt ?? "",
                    });
                }
            })
            .catch(() => {
                setTokenState({ status: "invalid", reason: "Failed to validate link. Please try again." });
            });
    }, [token]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 8) {
            toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
            return;
        }
        if (password !== confirmPassword) {
            toast({ title: "Passwords do not match", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await fetchApi<{ success: boolean; message: string }>(
                `/corporate/setup/${token}`,
                { method: "POST", body: JSON.stringify({ password, confirmPassword }) }
            );
            setTokenState({ status: "done", message: result.message });
        } catch (err: any) {
            toast({ title: "Error", description: err?.message ?? "Failed to complete setup.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    const isSetup = tokenState.status === "valid" && tokenState.type === "setup";
    const title = isSetup ? "Set up your account" : "Reset your password";
    const description = isSetup
        ? "Create a password to activate your corporate portal account."
        : "Enter a new password for your corporate portal account.";

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-slate-200">
                <CardHeader className="text-center space-y-2">
                    <div className="flex justify-center mb-2">
                        <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-800">Promise Electronics</CardTitle>
                    <CardDescription className="text-slate-500">Corporate Portal</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {tokenState.status === "loading" && (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-500">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Validating link…</span>
                        </div>
                    )}

                    {tokenState.status === "invalid" && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <XCircle className="w-10 h-10 text-red-500" />
                            <p className="font-semibold text-slate-800">Link unavailable</p>
                            <p className="text-sm text-slate-500">{tokenState.reason}</p>
                            <Button variant="outline" className="mt-2" onClick={() => setLocation("/corporate/login")}>
                                Back to login
                            </Button>
                        </div>
                    )}

                    {tokenState.status === "valid" && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="text-center pb-2 border-b border-slate-100">
                                <p className="font-semibold text-slate-800">{title}</p>
                                <p className="text-sm text-slate-500 mt-1">{description}</p>
                                {tokenState.username && (
                                    <p className="text-xs text-slate-400 mt-1">Username: <span className="font-mono text-slate-600">{tokenState.username}</span></p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700">New password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="At least 8 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-9 pr-9"
                                        required
                                        minLength={8}
                                        maxLength={64}
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        onClick={() => setShowPassword((v) => !v)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700">Confirm password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Re-enter your password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pl-9"
                                        required
                                        minLength={8}
                                        maxLength={64}
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-blue-900 hover:bg-blue-800 text-white"
                                disabled={isSubmitting}
                            >
                                {isSubmitting && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
                                {isSetup ? "Activate account" : "Set new password"}
                            </Button>
                        </form>
                    )}

                    {tokenState.status === "done" && (
                        <div className="flex flex-col items-center gap-3 py-6 text-center">
                            <CheckCircle className="w-10 h-10 text-emerald-500" />
                            <p className="font-semibold text-slate-800">Done!</p>
                            <p className="text-sm text-slate-500">{tokenState.message}</p>
                            <Button className="mt-2 bg-blue-900 hover:bg-blue-800 text-white" onClick={() => setLocation("/corporate/login")}>
                                Go to login
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
