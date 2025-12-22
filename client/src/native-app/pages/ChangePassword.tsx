import NativeLayout from "../NativeLayout";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { customerAuthApi } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function ChangePassword() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { isLoading, isAuthenticated } = useCustomerAuth();
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const changePasswordSchema = z.object({
        currentPassword: z.string().min(1, t('change_password.current_password_required')),
        newPassword: z.string().min(6, t('change_password.password_min_length')),
        confirmPassword: z.string().min(6, t('change_password.password_min_length')),
    }).refine((data) => data.newPassword === data.confirmPassword, {
        message: t('change_password.passwords_do_not_match'),
        path: ["confirmPassword"],
    });

    type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

    const form = useForm<ChangePasswordForm>({
        resolver: zodResolver(changePasswordSchema),
    });

    if (!isLoading && !isAuthenticated) {
        setLocation("/native/login");
        return null;
    }

    const onSubmit = async (data: ChangePasswordForm) => {
        try {
            await customerAuthApi.changePassword({
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
            toast({
                title: t('change_password.success_title'),
                description: t('change_password.success_message'),
            });
            setLocation("/native/settings");
        } catch (error: any) {
            toast({
                title: t('change_password.error_title'),
                description: error.message || t('change_password.error_message'),
                variant: "destructive",
            });
        }
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] flex flex-col h-full">
            <header className="flex items-center justify-between px-4 py-2 sticky top-0 z-10 bg-[var(--color-native-bg)]">
                <Link href="/native/settings">
                    <button aria-label="Go back" className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-native-text)]">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h2 className="text-[var(--color-native-text)] text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-10">{t('change_password.title')}</h2>
            </header>

            <main className="flex-1 px-6 pt-4 pb-24 overflow-y-auto scrollbar-hide">
                <div className="mb-6">
                    <h1 className="text-[var(--color-native-text)] tracking-tight text-[28px] font-bold leading-tight mb-2">Create new password</h1>
                    <p className="text-[var(--color-native-text-muted)] text-base font-normal leading-normal">
                        Your new password must be different from previous used passwords.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                ) : (
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* Current Password Field */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[var(--color-native-text)] text-sm font-medium pl-1" htmlFor="currentPassword">{t('change_password.current_password')}</label>
                            <div className="relative flex items-center">
                                <input
                                    className="w-full bg-[var(--color-native-input)] border border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] rounded-full h-14 px-5 focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all shadow-sm text-base"
                                    id="currentPassword"
                                    placeholder="Enter current password"
                                    type={showCurrentPassword ? "text" : "password"}
                                    {...form.register("currentPassword")}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute right-4 text-[var(--color-native-text-muted)] flex items-center justify-center p-1 hover:text-[var(--color-native-text)] transition-colors"
                                >
                                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {form.formState.errors.currentPassword && (
                                <p className="text-sm text-red-500 pl-1">{form.formState.errors.currentPassword.message}</p>
                            )}
                        </div>

                        {/* New Password Field */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[var(--color-native-text)] text-sm font-medium pl-1" htmlFor="newPassword">{t('change_password.new_password')}</label>
                            <div className="relative flex items-center">
                                <input
                                    className="w-full bg-[var(--color-native-input)] border border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] rounded-full h-14 px-5 focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all shadow-sm text-base"
                                    id="newPassword"
                                    placeholder="Enter new password"
                                    type={showNewPassword ? "text" : "password"}
                                    {...form.register("newPassword")}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-4 text-[var(--color-native-text-muted)] flex items-center justify-center p-1 hover:text-[var(--color-native-text)] transition-colors"
                                >
                                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {form.formState.errors.newPassword && (
                                <p className="text-sm text-red-500 pl-1">{form.formState.errors.newPassword.message}</p>
                            )}
                        </div>

                        {/* Confirm Password Field */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[var(--color-native-text)] text-sm font-medium pl-1" htmlFor="confirmPassword">{t('change_password.confirm_new_password')}</label>
                            <div className="relative flex items-center">
                                <input
                                    className="w-full bg-[var(--color-native-input)] border border-[var(--color-native-border)] text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] rounded-full h-14 px-5 focus:border-[var(--color-native-primary)] focus:ring-1 focus:ring-[var(--color-native-primary)] focus:outline-none transition-all shadow-sm text-base"
                                    id="confirmPassword"
                                    placeholder="Re-enter new password"
                                    type={showConfirmPassword ? "text" : "password"}
                                    {...form.register("confirmPassword")}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-4 text-[var(--color-native-text-muted)] flex items-center justify-center p-1 hover:text-[var(--color-native-text)] transition-colors"
                                >
                                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {form.formState.errors.confirmPassword && (
                                <p className="text-sm text-red-500 pl-1">{form.formState.errors.confirmPassword.message}</p>
                            )}
                        </div>

                        {/* Password Requirements Card */}
                        <div className="mt-8 bg-[var(--color-native-card)] rounded-[24px] p-5 shadow-sm border border-[var(--color-native-border)]">
                            <h3 className="text-[var(--color-native-text)] font-bold text-sm mb-4 uppercase tracking-wider opacity-80">Security Requirements</h3>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3">
                                    <CheckCircle className="text-[var(--color-native-primary)] w-5 h-5" />
                                    <span className="text-[var(--color-native-text)] text-sm font-medium">At least 6 characters</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle className="text-[var(--color-native-border)] w-5 h-5" />
                                    <span className="text-[var(--color-native-text-muted)] text-sm font-medium">Contains a number</span>
                                </li>
                                <li className="flex items-center gap-3">
                                    <CheckCircle className="text-[var(--color-native-border)] w-5 h-5" />
                                    <span className="text-[var(--color-native-text-muted)] text-sm font-medium">Contains a special symbol</span>
                                </li>
                            </ul>
                        </div>

                        {/* Bottom Action Button */}
                        <div className="fixed bottom-0 left-0 w-full p-4 bg-[var(--color-native-bg)]/90 backdrop-blur-sm border-t border-transparent z-20">
                            <button
                                type="submit"
                                disabled={form.formState.isSubmitting}
                                className="w-full bg-[var(--color-native-primary)] hover:opacity-90 active:scale-[0.98] transition-all text-white font-bold text-lg h-14 rounded-full shadow-lg shadow-[var(--color-native-primary)]/25 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {form.formState.isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    t('change_password.update_password')
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </main>
        </NativeLayout>
    );
}
