import { useState } from "react";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Phone, ArrowLeft, Loader2, MapPin, ShieldCheck, Sparkles, Wrench, HelpCircle, MessageCircle } from "lucide-react";
import { images } from "@/lib/mock-data";

import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

function RecoveryHelpPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useCustomerLanguage();
  const steps = [t("login.recoveryStep1"), t("login.recoveryStep2"), t("login.recoveryStep3")];

  return (
    <div className={compact ? "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3" : "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <HelpCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-950">{t("login.recoveryTitle")}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{t("login.recoveryDesc")}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-emerald-700">{index + 1}</span>
            <span>{step}</span>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Link href="/support">
          <Button type="button" className="h-10 w-full rounded-2xl bg-emerald-600 text-sm font-black hover:bg-emerald-700" data-testid="button-open-recovery-support">
            <MessageCircle className="mr-2 h-4 w-4" />
            {t("login.openSupport")}
          </Button>
        </Link>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{t("login.recoveryNote")}</p>
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, register, loginWithGoogle } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const phoneSuffix = formData.get("phone") as string;
    const password = formData.get("password") as string;

    // Validate 10-digit phone number
    if (phoneSuffix.replace(/\D/g, '').length !== 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit mobile number.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const fullPhone = "+880" + phoneSuffix.replace(/\D/g, '');

    try {
      await login(fullPhone, password);
      toast({
        title: "Login Successful",
        description: "Welcome back to Promise Electronics!",
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phoneSuffix = formData.get("phone") as string;
    const email = formData.get("email") as string;
    const address = formData.get("address") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    // Validate 10-digit phone number
    if (phoneSuffix.replace(/\D/g, '').length !== 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit mobile number.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Registration Failed",
        description: t("login.passwordMismatch"),
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const fullPhone = "+880" + phoneSuffix.replace(/\D/g, '');

    try {
      await register({
        name,
        phone: fullPhone,
        email: email || undefined,
        address: address || undefined,
        password,
      });
      toast({
        title: "Registration Successful",
        description: "Your account has been created. Welcome to Promise Electronics!",
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Registration Failed",
        description: error.message || "Please check your details and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <motion.div variants={variants.pageEnter} initial="initial" animate="animate" exit="exit" className="md:hidden min-h-[100dvh] overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.20),transparent_34%),linear-gradient(180deg,#f8fffb_0%,#ffffff_48%,#f3fbf7_100%)] px-4 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(7.25rem+env(safe-area-inset-bottom))]">
        <motion.div variants={variants.sectionEnter} className="mx-auto flex min-h-[calc(100dvh-8.5rem-env(safe-area-inset-bottom))] max-w-[520px] flex-col gap-3 sm:max-w-[560px]">
          <div className="shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-100 bg-white shadow-lg shadow-emerald-100">
                <img src={images.logo} alt="Promise Electronics" className="h-8 w-8 object-contain" />
              </Link>
              <span className="rounded-full border border-emerald-100 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-emerald-700 shadow-sm">
                {t("login.promiseCare")}
              </span>
            </div>

            <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-slate-950 via-emerald-900 to-emerald-600 p-3 text-white shadow-xl shadow-emerald-100">
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
              <div className="relative space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-emerald-50">
                  <Sparkles className="h-3 w-3" />
                  {t("login.customerPortal")}
                </div>
                <div>
                  <h1 className="text-xl font-black leading-tight tracking-tight">
                    {t("login.heroTitle")}
                  </h1>
                  <p className="mt-1 text-xs leading-5 text-emerald-50/90">
                    {t("login.heroSubtitle")}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Wrench, label: t("profile.repairs") },
                    { icon: ShieldCheck, label: t("profile.warranty") },
                    { icon: Phone, label: t("common.support") },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl bg-white/14 p-1.5 text-center backdrop-blur">
                      <item.icon className="mx-auto mb-0.5 h-3.5 w-3.5" />
                      <p className="text-[10px] font-bold">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="flex-1 pb-2">
            <Tabs defaultValue="login" className="rounded-[1.75rem] border border-emerald-100 bg-white/95 p-2.5 shadow-xl shadow-slate-200/60">
              <TabsList className="grid h-10 w-full grid-cols-2 rounded-full bg-slate-100 p-1">
                <TabsTrigger value="login" className="rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm" data-testid="tab-mobile-login">
                  {t("login.signIn")}
                </TabsTrigger>
                <TabsTrigger value="register" className="rounded-full text-sm font-bold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm" data-testid="tab-mobile-register">
                  {t("login.register")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-3">
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-950">{t("login.welcomeBack")}</h2>
                    <p className="text-xs text-slate-500">{t("login.signInDesc")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mobile-login-phone" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("login.phone")}</Label>
                    <PhoneInput
                      id="mobile-login-phone"
                      name="phone"
                      placeholder="1XXXXXXXXX"
                      className="h-11 rounded-2xl border-emerald-100 bg-emerald-50/50"
                      data-testid="input-mobile-login-phone"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mobile-login-password" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("login.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="mobile-login-password"
                        name="password"
                        type="password"
                        placeholder={t("login.passwordPlaceholder")}
                        className="h-11 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11"
                        data-testid="input-mobile-login-password"
                        required
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowRecoveryHelp((value) => !value)} className="text-left text-xs font-black text-emerald-700" data-testid="button-mobile-recovery-help">
                    {t("login.recoveryHelp")}
                  </button>
                  {showRecoveryHelp && <RecoveryHelpPanel compact />}
                  <label className="flex min-h-10 items-center gap-3 rounded-2xl bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" data-testid="checkbox-mobile-remember" />
                    {t("login.rememberMe")}
                  </label>
                  <Button type="submit" className="h-11 w-full rounded-2xl bg-emerald-600 text-base font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700" disabled={isLoading} data-testid="button-mobile-login-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      t("login.signIn")
                    )}
                  </Button>
                  <Button type="button" variant="outline" className="h-10 w-full rounded-2xl border-slate-200 text-sm font-bold" onClick={loginWithGoogle} data-testid="button-mobile-google-signin">
                    {t("login.google")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">{t("login.createAccount")}</h2>
                    <p className="text-sm text-slate-500">{t("login.joinDesc")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile-register-name" className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("login.fullName")}</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-name" name="name" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.namePlaceholder")} data-testid="input-mobile-register-name" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile-register-phone" className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("login.phone")}</Label>
                    <PhoneInput id="mobile-register-phone" name="phone" placeholder="1XXXXXXXXX" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50" data-testid="input-mobile-register-phone" required />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-email" name="email" type="email" className="h-12 rounded-2xl border-slate-200 pl-11" placeholder={t("login.emailPlaceholder")} data-testid="input-mobile-register-email" />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-address" name="address" className="h-12 rounded-2xl border-slate-200 pl-11" placeholder={t("login.addressPlaceholder")} data-testid="input-mobile-register-address" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-password" name="password" type="password" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.passwordPlaceholder")} data-testid="input-mobile-register-password" required />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-confirm-password" name="confirmPassword" type="password" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.confirmPasswordPlaceholder")} data-testid="input-mobile-register-confirm-password" required />
                    </div>
                  </div>
                  <Button type="submit" className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700" disabled={isLoading} data-testid="button-mobile-register-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      t("login.createAccount")
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </motion.div>
      </motion.div>

    <motion.div variants={variants.pageEnter} initial="initial" animate="animate" exit="exit" className="hidden min-h-[100dvh] bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50 items-start justify-center p-4 pt-[calc(env(safe-area-inset-top)+24px)] pb-10 md:flex md:items-center md:pt-4">
      <motion.div variants={variants.sectionEnter} className="w-full max-w-md">
        <div className="text-center mb-4 md:mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-xl md:text-2xl font-heading font-bold text-primary mb-1 md:mb-2">
            PROMISE<span className="text-foreground">ELECTRONICS</span>
          </Link>
          <p className="text-sm text-muted-foreground">{t("login.tagline")}</p>
        </div>

        <Card className="rounded-[1.75rem] border-blue-100 shadow-sm md:shadow-lg overflow-hidden">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="tab-login">{t("login.signIn")}</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">{t("login.register")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardHeader>
                  <CardTitle>{t("login.welcomeBack")}</CardTitle>
                  <CardDescription>{t("login.signInDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-phone">{t("login.phone")}</Label>
                    <div>
                      <PhoneInput
                        id="login-phone"
                        name="phone"
                        placeholder="1XXXXXXXXX"
                        data-testid="input-login-phone"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t("login.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        data-testid="input-login-password"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded border-gray-300" data-testid="checkbox-remember" />
                      <span>{t("login.rememberMe")}</span>
                    </label>
                    <button type="button" onClick={() => setShowRecoveryHelp((value) => !value)} className="font-semibold text-primary hover:underline" data-testid="link-forgot-password">
                      {t("login.recoveryHelp")}
                    </button>
                  </div>
                  {showRecoveryHelp && <RecoveryHelpPanel />}
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      t("login.signIn")
                    )}
                  </Button>
                  <div className="relative w-full">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">{t("login.orContinue")}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={loginWithGoogle}
                    data-testid="button-google-signin"
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {t("login.google")}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister}>
                <CardHeader>
                  <CardTitle>{t("login.createAccount")}</CardTitle>
                  <CardDescription>{t("login.joinDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">{t("login.fullName")}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-name"
                        name="name"
                        type="text"
                        placeholder="Your full name"
                        className="pl-10"
                        data-testid="input-register-name"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-phone">{t("login.phone")}</Label>
                    <div>
                      <PhoneInput
                        id="register-phone"
                        name="phone"
                        placeholder="1XXXXXXXXX"
                        data-testid="input-register-phone"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">{t("login.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        name="email"
                        type="email"
                        placeholder="your@email.com"
                        className="pl-10"
                        data-testid="input-register-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-address">Address (Optional)</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-address"
                        name="address"
                        type="text"
                        placeholder="House, Road, Area, District"
                        className="pl-10"
                        data-testid="input-register-address"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">{t("login.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        data-testid="input-register-password"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">{t("login.confirmPassword")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        data-testid="input-register-confirm-password"
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      t("login.createAccount")
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    {t("login.terms")}{" "}
                    <a href="#" className="text-primary hover:underline">{t("login.termsLink")}</a>{" "}
                    and{" "}
                    <a href="#" className="text-primary hover:underline">{t("login.privacyLink")}</a>
                  </p>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <div className="mt-4 md:mt-8">
          <Link href="/">
            <Button variant="outline" className="w-full gap-2 border-2 border-dashed border-primary/20 hover:border-primary hover:bg-primary/5 transition-all duration-300 h-12 text-base font-medium">
              <ArrowLeft className="h-4 w-4" />
              {t("login.backHome")}
            </Button>
          </Link>
        </div>
      </motion.div>
    </motion.div>
    </>
  );
}
