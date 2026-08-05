import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { useExclusiveAuthAction } from "@/hooks/use-exclusive-auth-action";
import { classifyGoogleSignInError } from "@/lib/google-signin-error";
import { toast } from "sonner";
import { Loader2, Phone, Lock, User, Mail, MapPin } from "lucide-react";

interface CustomerAuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "register";
  onSuccess?: () => void;
  prefillData?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  title?: string;
  description?: string;
}

/** Local field chrome only — does not change shared Input primitive. */
const fieldClass =
  "h-12 rounded-2xl border-slate-200 bg-white pl-10 text-base md:text-base shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-400";

const phoneFieldClass =
  "h-12 rounded-2xl border-slate-200 bg-white pl-[5rem] text-base md:text-base shadow-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:border-emerald-400";

const primaryActionClass =
  "h-12 w-full rounded-full text-base font-semibold shadow-sm";

const googleActionClass =
  "h-12 w-full rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50 [&_svg]:!size-5";

export function CustomerAuthModal({
  open,
  onOpenChange,
  defaultTab = "login",
  onSuccess,
  prefillData,
  title = "Welcome Back",
  description = "Sign in to your account to continue.",
}: CustomerAuthModalProps) {
  const { login, register, loginWithGoogle } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const [activeTab, setActiveTab] = useState(defaultTab);
  /**
   * Same exclusive-action policy as the login page.
   *
   * This modal is the wider surface — repair request, quote, intake wizard,
   * checkout, profile, tracking and PublicLayout all open it — and it had the
   * weaker guard: one boolean that React updates asynchronously, so two clicks
   * in a tick both passed. It also displayed `e.message`, i.e. raw Firebase or
   * API text, straight to the customer.
   */
  const auth = useExclusiveAuthAction();
  const isLoading = auth.isBusy;

  const handleGoogleSignIn = async () => {
    // Synchronous, before any await.
    if (!auth.acquire("google")) return;
    try {
      await loginWithGoogle();
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      // Classified to a translation key — never the provider's own text.
      toast.error(t(classifyGoogleSignInError(e)));
    } finally {
      auth.release("google");
    }
  };

  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState(prefillData?.name || "");
  const [registerPhone, setRegisterPhone] = useState(prefillData?.phone || "");
  const [registerEmail, setRegisterEmail] = useState(prefillData?.email || "");
  const [registerAddress, setRegisterAddress] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone || !loginPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    // Validate 10-digit phone number
    const cleanPhone = loginPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    const fullPhone = "+880" + cleanPhone;

    if (!auth.acquire("phone")) return;
    try {
      await login(fullPhone, loginPassword);
      toast.success("Logged in successfully!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      auth.release("phone");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName || !registerPhone || !registerPassword) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate 10-digit phone number
    const cleanPhone = registerPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }

    if (registerPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const fullPhone = "+880" + cleanPhone;

    if (!auth.acquire("register")) return;
    try {
      await register({
        name: registerName,
        phone: fullPhone,
        email: registerEmail || undefined,
        address: registerAddress || undefined,
        password: registerPassword,
      });
      toast.success("Account created successfully!");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    } finally {
      auth.release("register");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Close control lives in shared DialogContent. Style it only for this modal
        via direct-child selectors — no global dialog.tsx change (BOT scope).
      */}
      <DialogContent
        className="sm:max-w-[425px] gap-5 p-5 sm:p-6 [&>button]:right-3 [&>button]:top-3 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:border [&>button]:border-slate-200 [&>button]:bg-white [&>button]:opacity-100 [&>button]:shadow-sm [&>button]:ring-offset-background [&>button]:transition-colors [&>button]:hover:bg-slate-50 [&>button]:hover:opacity-100 [&>button]:focus:outline-none [&>button]:focus-visible:ring-2 [&>button]:focus-visible:ring-emerald-500/30 [&>button]:focus-visible:ring-offset-2 [&>button_svg]:h-4 [&>button_svg]:w-4"
        data-testid="modal-customer-auth"
      >
        <DialogHeader className="space-y-1.5 pr-12 text-left">
          <DialogTitle className="text-xl font-heading">{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            type="button"
            variant="outline"
            className={googleActionClass}
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            data-testid="button-google-signin"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with phone
              </span>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")} className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-full bg-slate-100 p-1">
            <TabsTrigger
              value="login"
              className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
              data-testid="tab-login"
            >
              Login
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="rounded-full text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
              data-testid="tab-register"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-0 space-y-4 pt-4">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-phone">Phone Number</Label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-3 flex items-center gap-1.5 text-muted-foreground pointer-events-none">
                    <Phone className="h-4.5 w-4.5" />
                    <span className="text-base font-medium select-none text-foreground">+880</span>
                  </div>
                  <Input
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1XXXXXXXXX"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                    maxLength={10}
                    className={phoneFieldClass}
                    autoComplete="username"
                    data-testid="input-login-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={fieldClass}
                    autoComplete="current-password"
                    data-testid="input-login-password"
                  />
                </div>
              </div>

              <Button type="submit" className={primaryActionClass} disabled={isLoading} data-testid="button-login-submit">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-0 space-y-4 pt-4">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="register-name">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="register-name"
                    type="text"
                    placeholder="Your full name"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    className={fieldClass}
                    autoComplete="name"
                    data-testid="input-register-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-phone">Phone Number *</Label>
                <div className="relative flex items-center">
                  <div className="absolute inset-y-0 left-3 flex items-center gap-1.5 text-muted-foreground pointer-events-none">
                    <Phone className="h-4.5 w-4.5" />
                    <span className="text-base font-medium select-none text-foreground">+880</span>
                  </div>
                  <Input
                    id="register-phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1XXXXXXXXX"
                    value={registerPhone}
                    onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, '').replace(/^0+/, ''))}
                    maxLength={10}
                    className={phoneFieldClass}
                    autoComplete="username"
                    data-testid="input-register-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-email">Email (Optional)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="your@email.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className={fieldClass}
                    autoComplete="email"
                    data-testid="input-register-email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-address">Address (Optional)</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="register-address"
                    type="text"
                    placeholder="House, Road, Area, District"
                    value={registerAddress}
                    onChange={(e) => setRegisterAddress(e.target.value)}
                    className={fieldClass}
                    data-testid="input-register-address"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-password">Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className={fieldClass}
                    autoComplete="new-password"
                    data-testid="input-register-password"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="register-confirm-password">Confirm Password *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground" />
                  <Input
                    id="register-confirm-password"
                    type="password"
                    placeholder="Confirm your password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    className={fieldClass}
                    autoComplete="new-password"
                    data-testid="input-register-confirm-password"
                  />
                </div>
              </div>

              <Button type="submit" className={primaryActionClass} disabled={isLoading} data-testid="button-register-submit">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
