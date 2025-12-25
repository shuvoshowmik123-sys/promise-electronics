import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, Loader2 } from "lucide-react";
import NativeLayout from "../NativeLayout";
import { useTranslation } from "react-i18next";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { CapacitorHttp } from '@capacitor/core';
import { API_BASE_URL } from "@/lib/config";

export default function Login() {
    const [, setLocation] = useLocation();
    const { login } = useCustomerAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const { t } = useTranslation();

    // Form State
    const [phoneSuffix, setPhoneSuffix] = useState("");
    const [password, setPassword] = useState("");

    const handleGoogleLogin = async () => {
        setIsGoogleLoading(true);
        try {
            // Use native Google Sign-In
            const googleUser = await GoogleAuth.signIn();
            const idToken = googleUser.authentication.idToken;

            // Send token to backend for verification
            const response = await CapacitorHttp.post({
                url: `${API_BASE_URL}/api/customer/google/native-login`,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: { idToken },
            });

            if (response.status === 200) {
                toast({
                    title: "Welcome!",
                    description: "Logged in with Google.",
                });
                setLocation("/native/home");
            } else {
                throw new Error(response.data?.error || "Google login failed");
            }
        } catch (error: any) {
            console.error("Google login error:", error);
            toast({
                title: "Google Login Failed",
                description: error.message || "Could not sign in with Google",
                variant: "destructive",
            });
        } finally {
            setIsGoogleLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        if (phoneSuffix.length !== 10) {
            toast({
                title: "Invalid Phone Number",
                description: "Please enter a valid 10-digit mobile number.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        const fullPhone = "+880" + phoneSuffix;

        try {
            await login(fullPhone, password);
            toast({
                title: "Welcome Back!",
                description: "Successfully logged in.",
            });
            setLocation("/native/home");
        } catch (error: any) {
            toast({
                title: "Login Failed",
                description: error.message || "Invalid credentials",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 pt-[calc(1rem+env(safe-area-inset-top))]">
                <button
                    onClick={() => setLocation("/native/home")}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm active:scale-95 transition-transform"
                >
                    <ArrowLeft className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                </button>

                <div className="w-10" />
            </div>

            <main className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-y-auto scrollbar-hide">
                {/* Hero */}
                <div className="mb-8 flex flex-col items-center text-center">
                    <img
                        src="/tv-daktar-logo.png"
                        alt="Promise Electronics"
                        className="w-32 h-32 mb-4 object-contain"
                    />
                    <p className="text-[var(--color-native-text-muted)] text-sm max-w-[260px]">
                        {t('auth.sign_in_subtitle')}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="flex flex-col gap-5 w-full">

                    {/* Phone Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-native-text-muted)] ml-4">{t('auth.mobile_number')}</label>
                        <div className="relative flex h-14 w-full items-center rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-input)] px-4 shadow-sm focus-within:border-[var(--color-native-primary)] focus-within:ring-1 focus-within:ring-[var(--color-native-primary)] transition-all overflow-hidden">
                            <span className="text-[var(--color-native-text)] font-semibold text-lg mr-1 select-none">+880</span>
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="flex-1 min-w-0 bg-transparent border-none p-0 text-lg font-medium text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]/50 focus:ring-0 focus:outline-none"
                                placeholder="1XXXXXXXXX"
                                maxLength={10}
                                value={phoneSuffix}
                                onChange={(e) => setPhoneSuffix(e.target.value.replace(/\D/g, ''))}
                                onKeyDown={(e) => {
                                    // Allow: backspace, delete, tab, escape, enter
                                    if ([46, 8, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
                                        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                        (e.ctrlKey === true && [65, 67, 86, 88].indexOf(e.keyCode) !== -1) ||
                                        // Allow: home, end, left, right
                                        (e.keyCode >= 35 && e.keyCode <= 39)) {
                                        return;
                                    }
                                    // Ensure that it is a number and stop the keypress
                                    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                                        e.preventDefault();
                                    }
                                }}
                                required
                            />
                        </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-native-text-muted)] ml-4">{t('auth.password')}</label>
                        <div className="relative flex h-14 w-full items-center rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-input)] px-4 shadow-sm focus-within:border-[var(--color-native-primary)] focus-within:ring-1 focus-within:ring-[var(--color-native-primary)] transition-all overflow-hidden">
                            <Lock className="w-5 h-5 text-[var(--color-native-text-muted)] mr-3" />
                            <input
                                type="password"
                                className="flex-1 bg-transparent border-none p-0 text-lg font-medium text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]/50 focus:ring-0 focus:outline-none"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Sign In Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-[var(--color-native-primary)] text-white font-bold text-lg shadow-lg shadow-[var(--color-native-primary)]/20 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <span className="relative z-10">{t('auth.sign_in')}</span>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-4 py-2">
                        <div className="h-px flex-1 bg-[var(--color-native-border)]" />
                        <span className="text-xs font-medium text-[var(--color-native-text-muted)] uppercase tracking-wider">{t('auth.or')}</span>
                        <div className="h-px flex-1 bg-[var(--color-native-border)]" />
                    </div>

                    {/* Google Button */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={isGoogleLoading}
                        className="relative w-full flex h-14 items-center justify-center gap-3 rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-card)] text-[var(--color-native-text)] font-medium text-base hover:bg-[var(--color-native-input)] active:scale-[0.98] transition-all disabled:opacity-70"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('auth.continue_google')}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-auto pt-8 text-center">
                    <p className="text-sm text-[var(--color-native-text-muted)]">
                        {t('auth.no_account')}{" "}
                        <Link href="/native/register" className="text-[var(--color-native-primary)] font-bold hover:underline">
                            {t('auth.create_account')}
                        </Link>
                    </p>
                </div>
            </main>
        </NativeLayout>
    );
}
