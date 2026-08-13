import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { createProfileDismissHandler } from "@/lib/profile-completion-dismiss";
import { toast } from "sonner";
import { Loader2, Phone, MapPin, User, Sparkles, CheckCircle2, KeyRound } from "lucide-react";
import { customerAuthApi } from "@/lib/api";

interface ProfileCompletionModalProps {
  open: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
}

export function ProfileCompletionModal({
  open,
  onComplete,
  onSkip,
}: ProfileCompletionModalProps) {
  const { customer, updateProfile } = useCustomerAuth();
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // Set when the number they typed turns out to be their own, on another account.
  const [needsLink, setNeedsLink] = useState(false);
  const [linkPhone, setLinkPhone] = useState("");
  const [linkCode, setLinkCode] = useState("");

  // Update form values when customer data is available
  useEffect(() => {
    if (customer) {
      setName(customer.name || "");
      setPhone(customer.phone || "");
      setAddress(customer.address || "");
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone) {
      toast.error("Phone number is required");
      return;
    }

    if (phone.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile({
        name: name || undefined,
        phone,
        address: address || undefined,
      });
      toast.success("Profile saved! Your details will be auto-filled for future orders.");
      onComplete?.();
    } catch (error: any) {
      /**
       * "Try a different number" was the wrong advice, and it left the
       * customer stuck.
       *
       * The number is already in use because it is on THEIR OWN account —
       * the one they made with a phone and a password. They then signed in
       * with Google, nothing matched (registration does not require an email,
       * so there was nothing to match on), and a second empty account was
       * made for them. Telling them to invent a different phone number would
       * make the split permanent.
       *
       * So this is where we offer to put the two back together.
       */
      if (error?.code === "PHONE_EXISTS" ||
          error?.message?.toLowerCase().includes("already in use") ||
          error?.message?.toLowerCase().includes("already registered")) {
        setLinkPhone(phone);
        setNeedsLink(true);
      } else {
        toast.error(error?.message || "Failed to update profile");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLink = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setIsLoading(true);
    try {
      const result = await customerAuthApi.completeAccountLink({ phone: linkPhone, code: linkCode });
      toast.success(
        result.movedRows > 0
          ? "Accounts joined. Your repairs are back where they belong."
          : "Accounts joined.",
      );
      // Their session now belongs to the other account, so everything on
      // screen is stale. A reload is the honest way to re-read all of it.
      window.location.assign("/");
    } catch (err: any) {
      toast.error(err?.message || "That code did not work.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = createProfileDismissHandler(onSkip);

  if (needsLink) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[450px]" data-testid="modal-account-link">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <DialogTitle className="text-xl font-heading">You already have an account</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              That number is on an account you made earlier — the one with all your repairs on it.
              Call or visit the shop and we will give you a 6-digit code to join the two together.
              Nothing is lost.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLink} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="link-phone">Your phone number</Label>
              <Input
                id="link-phone"
                type="tel"
                value={linkPhone}
                onChange={(ev) => setLinkPhone(ev.target.value)}
                data-testid="input-link-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-code">Code from the shop</Label>
              <Input
                id="link-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={linkCode}
                onChange={(ev) => setLinkCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center font-mono text-lg tracking-[0.4em]"
                data-testid="input-link-code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || linkCode.length !== 6} data-testid="button-join-accounts">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Join my accounts
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setNeedsLink(false)}
              disabled={isLoading}
            >
              Use a different number instead
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[450px]" data-testid="modal-profile-completion">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-xl font-heading">One-Time Setup</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Welcome! Please complete your profile once. Your details will be <span className="font-medium text-primary">automatically filled</span> for all future orders and service requests.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-800">
            <p className="font-medium">Save time on future orders!</p>
            <p className="text-green-700">Fill this once and we'll remember your details for faster checkout.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="profile-name"
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10"
                data-testid="input-profile-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone Number *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="profile-phone"
                type="tel"
                placeholder="01XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-10"
                data-testid="input-profile-phone"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Required for order delivery and service updates
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-address">Delivery Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="profile-address"
                type="text"
                placeholder="House, Road, Area, District"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="pl-10"
                data-testid="input-profile-address"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-save-profile">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save & Continue"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onSkip?.()}
            disabled={isLoading}
            data-testid="button-skip-profile"
          >
            Skip for now — browse first
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            You can finish this later. A phone number is still required to place an order or service request.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
