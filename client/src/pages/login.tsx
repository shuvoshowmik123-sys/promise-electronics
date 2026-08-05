import { useEffect, useState } from "react";
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
import { Mail, Lock, User, Phone, ArrowLeft, Loader2, MapPin, ShieldCheck, Sparkles, Wrench, HelpCircle, CheckCircle2 } from "lucide-react";
import { images } from "@/lib/app-config";

import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { useCustomerMobileChrome } from "@/contexts/CustomerMobileChromeContext";
import { customerAuthApi } from "@/lib/api";
import { classifyGoogleSignInError } from "@/lib/google-signin-error";
import { useExclusiveAuthAction } from "@/hooks/use-exclusive-auth-action";

function RecoveryHelpPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useCustomerLanguage();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [rPhone, setRPhone] = useState("");
  const [rTicket, setRTicket] = useState("");
  const [rMessage, setRMessage] = useState("");

  const { toast } = useToast();

  // Activation and password reset both happen through a staff-issued one-time
  // link, so this panel only opens a support request — it never sets a password.
  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await customerAuthApi.requestRecovery({
        phone: rPhone ? `+880${rPhone.replace(/\D/g, "")}` : undefined,
        ticketNumber: rTicket || undefined,
        message: rMessage || undefined,
      });
      setDone(true);
    } catch {
      toast({ title: "Failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={compact ? "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3" : "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-black text-slate-950">Request sent</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          If your details match an account, our team will send you a one-time setup link on WhatsApp or Messenger.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3" : "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
          <HelpCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-950">{t("login.recoveryTitle")}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Tell us how to find you. Our team will send a one-time setup link you can use to choose your own password.
          </p>
        </div>
      </div>

      <form onSubmit={submitRequest} className="mt-3 space-y-2" data-testid="form-recovery-request">
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="Phone (1XXXXXXXXX)"
            value={rPhone}
            onChange={(e) => setRPhone(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
            maxLength={10}
            className={compact ? "h-9 rounded-xl pl-9 text-sm" : "h-10 rounded-2xl pl-9 text-sm"}
            autoComplete="username"
            data-testid="input-recovery-phone"
          />
        </div>
        <Input
          placeholder="Ticket number (optional)"
          value={rTicket}
          onChange={(e) => setRTicket(e.target.value)}
          className={compact ? "h-9 rounded-xl text-sm" : "h-10 rounded-2xl text-sm"}
          data-testid="input-recovery-ticket"
        />
        <Input
          placeholder="Message to support (optional)"
          value={rMessage}
          onChange={(e) => setRMessage(e.target.value)}
          className={compact ? "h-9 rounded-xl text-sm" : "h-10 rounded-2xl text-sm"}
          data-testid="input-recovery-message"
        />
        <Button type="submit" disabled={busy} className="h-9 w-full rounded-2xl bg-emerald-600 text-sm font-black hover:bg-emerald-700" data-testid="button-recovery-submit">
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Request setup link
        </Button>
      </form>
      <p className="mt-2 text-[11px] leading-4 text-slate-500">{t("login.recoveryNote")}</p>
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, register, loginWithGoogle } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const { setBottomNavSuppressed } = useCustomerMobileChrome();
  /**
   * One authentication action at a time, decided synchronously.
   *
   * A `useState` guard could not do this: React state does not update
   * synchronously, so two events in the same tick both read null and both
   * proceed. The hook takes the decision on a ref; the state it exposes drives
   * labels and disabled attributes only.
   */
  const auth = useExclusiveAuthAction();
  const isAuthBusy = auth.isBusy;
  const isLoading = auth.activeAction === "phone" || auth.activeAction === "register";
  const isGoogleLoading = auth.activeAction === "google";
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);

  /**
   * Finish the Google sign-in the way the phone sign-in finishes.
   *
   * Both Google buttons were `onClick={loginWithGoogle}` — the bare context
   * function. Two consequences, and the first is the one customers hit:
   *
   * On SUCCESS nothing navigated. This page has no redirect on auth state (its
   * only effect suppresses the bottom nav), and setLocation("/") lives inside
   * the phone-login and register handlers, which Google never reaches. So the
   * session was created correctly and the customer was left staring at the
   * login screen with "Continue with Google" still on it — which reads as "it
   * didn't work", and appeared to fix itself on refresh because reloading
   * re-reads the session and routes them.
   *
   * On FAILURE the rejected promise had no handler at all, so a Firebase or
   * API error produced silence rather than a message.
   */
  const handleGoogleSignIn = async () => {
    // Synchronous, BEFORE any await: a second tap in the same tick loses here
    // rather than opening a second popup.
    if (!auth.acquire("google")) return;
    try {
      await loginWithGoogle();
      toast({
        title: t("login.successTitle"),
        description: t("login.successDesc"),
      });
      setLocation("/");
    } catch (error: unknown) {
      toast({
        title: t("login.googleFailed"),
        // Classified to a translation key, never the raw provider text.
        description: t(classifyGoogleSignInError(error)),
        variant: "destructive",
      });
    } finally {
      auth.release("google");
    }
  };

  useEffect(() => {
    setBottomNavSuppressed(showRecoveryHelp);
    return () => setBottomNavSuppressed(false);
  }, [setBottomNavSuppressed, showRecoveryHelp]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Enter in the phone form while Google is signing in must not start a
    // second sign-in against the same session. Synchronous, before any await.
    if (!auth.acquire("phone")) return;

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
      auth.release("phone");
      return;
    }

    const fullPhone = "+880" + phoneSuffix.replace(/\D/g, '');

    try {
      await login(fullPhone, password);
      toast({
        title: t("login.successTitle"),
        description: t("login.successDesc"),
      });
      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      auth.release("phone");
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!auth.acquire("register")) return;

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
      auth.release("register");
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Registration Failed",
        description: t("login.passwordMismatch"),
        variant: "destructive",
      });
      auth.release("register");
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
      auth.release("register");
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
                      autoComplete="username"
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
                        autoComplete="current-password"
                        data-testid="input-mobile-login-password"
                        required
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowRecoveryHelp((value) => !value)} className="text-left text-xs font-black text-emerald-700" data-testid="button-mobile-recovery-help">
                    {t("login.recoveryHelp")}
                  </button>
                  <label className="flex min-h-10 items-center gap-3 rounded-2xl bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" data-testid="checkbox-mobile-remember" />
                    {t("login.rememberMe")}
                  </label>
                  <Button type="submit" className="h-11 w-full rounded-2xl bg-emerald-600 text-base font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700" disabled={isAuthBusy} data-testid="button-mobile-login-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Authenticating...
                      </>
                    ) : (
                      t("login.signIn")
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full rounded-2xl border-slate-200 text-sm font-bold"
                    onClick={handleGoogleSignIn}
                    disabled={isAuthBusy}
                    data-testid="button-mobile-google-signin"
                  >
                    {isGoogleLoading ? t("login.googleSigningIn") : t("login.google")}
                  </Button>
                </form>
                {showRecoveryHelp && <RecoveryHelpPanel compact />}
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
                      <Input id="mobile-register-name" name="name" autoComplete="name" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.namePlaceholder")} data-testid="input-mobile-register-name" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile-register-phone" className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("login.phone")}</Label>
                    <PhoneInput id="mobile-register-phone" name="phone" placeholder="1XXXXXXXXX" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50" autoComplete="username" data-testid="input-mobile-register-phone" required />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-email" name="email" type="email" autoComplete="email" className="h-12 rounded-2xl border-slate-200 pl-11" placeholder={t("login.emailPlaceholder")} data-testid="input-mobile-register-email" />
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-address" name="address" className="h-12 rounded-2xl border-slate-200 pl-11" placeholder={t("login.addressPlaceholder")} data-testid="input-mobile-register-address" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-password" name="password" type="password" autoComplete="new-password" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.passwordPlaceholder")} data-testid="input-mobile-register-password" required />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input id="mobile-register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" className="h-12 rounded-2xl border-emerald-100 bg-emerald-50/50 pl-11" placeholder={t("login.confirmPasswordPlaceholder")} data-testid="input-mobile-register-confirm-password" required />
                    </div>
                  </div>
                  <Button type="submit" className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700" disabled={isAuthBusy} data-testid="button-mobile-register-submit">
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
                        autoComplete="username"
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
                        autoComplete="current-password"
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
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={isAuthBusy} data-testid="button-login-submit">
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
                    onClick={handleGoogleSignIn}
                    disabled={isAuthBusy}
                    data-testid="button-google-signin"
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {isGoogleLoading ? "Signing in…" : t("login.google")}
                  </Button>
                </CardFooter>
              </form>
              {showRecoveryHelp && <RecoveryHelpPanel />}
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
                        autoComplete="name"
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
                        autoComplete="username"
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
                        autoComplete="email"
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
                        autoComplete="new-password"
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
                        autoComplete="new-password"
                        data-testid="input-register-confirm-password"
                        required
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={isAuthBusy} data-testid="button-register-submit">
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
