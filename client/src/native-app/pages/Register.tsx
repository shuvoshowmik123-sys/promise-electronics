import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Phone, Lock, Loader2 } from "lucide-react";
import NativeLayout from "../NativeLayout";
import { useTranslation } from "react-i18next";

export default function Register() {
    const [, setLocation] = useLocation();
    const { register } = useCustomerAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const { t } = useTranslation();

    // Form State
    const [name, setName] = useState("");
    const [phoneSuffix, setPhoneSuffix] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        if (phoneSuffix.length !== 10) {
            toast({
                title: "Invalid Phone Number",
                description: "Please enter a valid 10-digit mobile number.",
                variant: "destructive",
            });
            return;
        }

        if (password !== confirmPassword) {
            toast({
                title: "Password Mismatch",
                description: "Passwords do not match.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        const fullPhone = "+880" + phoneSuffix;

        try {
            await register({
                name,
                phone: fullPhone,
                password,
            });
            toast({
                title: "Account Created",
                description: "Welcome to Promise Electronics!",
            });
            setLocation("/native/home");
        } catch (error: any) {
            toast({
                title: "Registration Failed",
                description: error.message || "Could not create account.",
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
                    onClick={() => setLocation("/native/login")}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm active:scale-95 transition-transform"
                >
                    <ArrowLeft className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                </button>
                <div className="flex items-center gap-2 opacity-80">
                    <span className="text-xs font-bold tracking-widest uppercase text-[var(--color-native-text)]">Create Account</span>
                </div>
                <div className="w-10" />
            </div>

            <main className="flex-1 flex flex-col px-6 pt-4 pb-8 overflow-y-auto scrollbar-hide">
                {/* Hero */}
                <div className="mb-8 flex flex-col items-center text-center">
                    <img
                        src="/login-welcome.png"
                        alt="Welcome to Promise Electronics"
                        className="w-48 h-auto mb-4 object-contain"
                    />
                    <p className="text-[var(--color-native-text-muted)] text-sm max-w-[260px]">
                        {t('auth.create_account_subtitle')}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleRegister} className="flex flex-col gap-5 w-full">

                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-native-text-muted)] ml-4">{t('auth.full_name')}</label>
                        <div className="relative flex h-14 w-full items-center rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-input)] dark:bg-slate-900 px-4 shadow-sm focus-within:border-[var(--color-native-primary)] focus-within:ring-1 focus-within:ring-[var(--color-native-primary)] transition-all">
                            <User className="w-5 h-5 text-[var(--color-native-text-muted)] mr-3" />
                            <input
                                type="text"
                                className="flex-1 bg-transparent border-none p-0 text-lg font-medium text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]/50 focus:ring-0 focus:outline-none"
                                placeholder="Customer Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

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

                    {/* Confirm Password Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--color-native-text-muted)] ml-4">{t('auth.confirm_password')}</label>
                        <div className="relative flex h-14 w-full items-center rounded-full border border-[var(--color-native-border)] bg-[var(--color-native-input)] px-4 shadow-sm focus-within:border-[var(--color-native-primary)] focus-within:ring-1 focus-within:ring-[var(--color-native-primary)] transition-all overflow-hidden">
                            <Lock className="w-5 h-5 text-[var(--color-native-text-muted)] mr-3" />
                            <input
                                type="password"
                                className="flex-1 bg-transparent border-none p-0 text-lg font-medium text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)]/50 focus:ring-0 focus:outline-none"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {/* Register Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-full bg-[var(--color-native-primary)] text-white font-bold text-lg shadow-lg shadow-[var(--color-native-primary)]/20 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <span className="relative z-10">{t('auth.create_account')}</span>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-auto pt-8 text-center">
                    <p className="text-sm text-[var(--color-native-text-muted)]">
                        {t('auth.already_have_account')}{" "}
                        <Link href="/native/login" className="text-[var(--color-native-primary)] font-bold hover:underline">
                            {t('auth.sign_in')}
                        </Link>
                    </p>
                </div>
            </main>
        </NativeLayout>
    );
}
