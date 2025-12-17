import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { toast } from "sonner";
import { Loader2, Phone, MapPin, User, Sparkles, CheckCircle2 } from "lucide-react";

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
      console.log("Profile save error:", error);
      console.log("Error code:", error?.code);
      console.log("Error message:", error?.message);
      
      // Check for duplicate phone error - check both the code and message
      if (error?.code === "PHONE_EXISTS" || 
          error?.message?.toLowerCase().includes("already in use") ||
          error?.message?.toLowerCase().includes("already registered")) {
        toast.error("This phone number is already in use. Please try a different number.");
      } else {
        toast.error(error?.message || "Failed to update profile");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
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
          {onSkip && (
            <Button 
              type="button" 
              variant="ghost" 
              className="w-full text-muted-foreground" 
              onClick={onSkip}
              disabled={isLoading}
              data-testid="button-skip-profile"
            >
              Skip for now
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
