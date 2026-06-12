import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { publicSettingsApi, customerServiceRequestsApi, customerWarrantiesApi, type WarrantyInfo } from "@/lib/api";
import type { ServiceRequest, ServiceRequestEvent, Order } from "@shared/schema";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Package, Wrench, CheckCircle, Clock, Truck, Search, User,
  Phone, MapPin, Calendar, CreditCard, Loader2, XCircle,
  ClipboardCheck, FileText, DollarSign, CheckCircle2, X,
  Shield,
} from "lucide-react";
const serviceTrackingSteps = [
  { status: "Request Received", icon: Package, description: "Your request is being reviewed by our team" },
  { status: "Arriving to Receive", icon: Truck, description: "Our team is on the way to collect your TV" },
  { status: "Awaiting Drop-off", icon: MapPin, description: "Please bring your TV to our service center" },
  { status: "Received", icon: CheckCircle, description: "Your TV has been received at our service center" },
  { status: "Technician Assigned", icon: User, description: "A technician has been assigned to your job" },
  { status: "Diagnosis Completed", icon: Search, description: "Issue has been diagnosed" },
  { status: "Parts Pending", icon: Clock, description: "Waiting for replacement parts" },
  { status: "Repairing", icon: Wrench, description: "Repair work in progress" },
  { status: "Ready for Delivery", icon: CheckCircle, description: "Your device is ready for pickup/delivery" },
  { status: "Delivered", icon: Truck, description: "Order completed successfully" },
];

// NEW: Stage-based tracking for unified workflow
const pickupStageSteps = [
  { stage: "intake", label: "Request", icon: Package, description: "We received your service request" },
  { stage: "assessment", label: "Review", icon: Search, description: "Our team is reviewing your repair need" },
  { stage: "awaiting_customer", label: "Your Approval", icon: Clock, description: "Please review the quote or next instruction" },
  { stage: "authorized", label: "Approved", icon: CheckCircle2, description: "Your service is approved for pickup or repair" },
  { stage: "pickup_scheduled", label: "Pickup", icon: Calendar, description: "Pickup is scheduled for your device" },
  { stage: "picked_up", label: "Custody Confirmed", icon: Shield, description: "Your device handover was confirmed by OTP" },
  { stage: "in_repair", label: "Repair", icon: Wrench, description: "Your device is being repaired" },
  { stage: "ready", label: "Bill / Payment", icon: CreditCard, description: "Please complete payment if any amount is due" },
  { stage: "out_for_delivery", label: "Delivery", icon: Truck, description: "Your device is being returned to you" },
  { stage: "completed", label: "Completed", icon: CheckCircle2, description: "Device returned to you" },
];

const serviceCenterStageSteps = [
  { stage: "intake", label: "Request", icon: Package, description: "We received your service request" },
  { stage: "assessment", label: "Review", icon: Search, description: "Our team is reviewing your repair need" },
  { stage: "awaiting_customer", label: "Your Approval", icon: Clock, description: "Please review the quote or next instruction" },
  { stage: "authorized", label: "Approved", icon: CheckCircle2, description: "Your service is approved for drop-off or repair" },
  { stage: "awaiting_dropoff", label: "Drop-off", icon: MapPin, description: "Please bring your device to our service center" },
  { stage: "device_received", label: "Custody Confirmed", icon: Shield, description: "Your device handover was confirmed by OTP" },
  { stage: "in_repair", label: "Repair", icon: Wrench, description: "Your device is being repaired" },
  { stage: "ready", label: "Bill / Payment", icon: CreditCard, description: "Please complete payment if any amount is due" },
  { stage: "completed", label: "Completed", icon: CheckCircle2, description: "Device collected by you" },
];

// Helper to get filtered stage steps based on requestIntent
function getStageSteps(serviceMode: string | null, requestIntent: string | null) {
  const steps = serviceMode === "pickup" ? pickupStageSteps : serviceCenterStageSteps;
  // If direct repair (not quote), skip the awaiting_customer stage
  if (requestIntent === "repair") {
    return steps.filter(s => s.stage !== "awaiting_customer");
  }
  return steps;
}

type CustomerActionTone = "emerald" | "amber" | "blue" | "slate";
type CustomerNextAction = {
  tone: CustomerActionTone;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  payment?: boolean;
};

function getCustomerNextAction(order: ServiceRequest, serviceMode: string | null): CustomerNextAction {
  const stage = order.stage || "intake";
  const paymentDue = order.paymentStatus !== "Paid" && Number(order.totalAmount || order.quoteAmount || 0) > 0;
  const isPickup = serviceMode === "pickup";

  if (order.quoteStatus === "Quoted") {
    return {
      tone: "amber",
      icon: FileText,
      title: "Review your quote",
      body: "Approve the quote and choose pickup or service-center visit to continue.",
    };
  }

  if (stage === "pickup_scheduled") {
    return {
      tone: "blue",
      icon: Shield,
      title: "Keep OTP ready for pickup",
      body: "Give the OTP only when our staff receives your TV.",
    };
  }

  if (stage === "awaiting_dropoff") {
    return {
      tone: "blue",
      icon: MapPin,
      title: "Visit the service center",
      body: "Bring your TV to our service center. Use the OTP only during handover.",
    };
  }

  if (stage === "ready" && paymentDue) {
    return {
      tone: "amber",
      icon: CreditCard,
      title: "Payment needed",
      body: "Send payment details for staff verification before delivery or collection.",
      payment: true,
    };
  }

  if (stage === "ready") {
    return {
      tone: "emerald",
      icon: Shield,
      title: isPickup ? "Ready for delivery" : "Ready for collection",
      body: "Give the OTP only when receiving your repaired TV.",
    };
  }

  if (stage === "out_for_delivery") {
    return {
      tone: "emerald",
      icon: Truck,
      title: "Delivery in progress",
      body: "Keep your phone available. Device release requires your OTP.",
    };
  }

  if (stage === "completed" || stage === "closed") {
    return {
      tone: "emerald",
      icon: CheckCircle2,
      title: "Service completed",
      body: "Your device has been returned and the service journey is complete.",
    };
  }

  return {
    tone: "slate",
    icon: Clock,
    title: "No action needed now",
    body: "We will update this page when the next step is ready.",
  };
}

function CustomerNextActionCard({ order, serviceMode }: { order: ServiceRequest; serviceMode: string | null }) {
  const action = getCustomerNextAction(order, serviceMode);
  const Icon = action.icon;
  const toneClass = action.tone === "emerald"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : action.tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : action.tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`mb-5 rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide opacity-75">Next step</p>
          <h3 className="mt-1 text-base font-bold text-slate-950">{action.title}</h3>
          <p className="mt-1 text-sm font-medium">{action.body}</p>
        </div>
      </div>
      {action.payment && <PaymentSubmissionCard order={order} />}
    </div>
  );
}

const productOrderSteps = [
  { status: "Pending", icon: Clock, description: "Your order is being reviewed" },
  { status: "Accepted", icon: ClipboardCheck, description: "Order confirmed by seller" },
  { status: "Processing", icon: Package, description: "Your order is being prepared" },
  { status: "Shipped", icon: Truck, description: "Your order is on the way" },
  { status: "Delivered", icon: CheckCircle, description: "Order delivered successfully" },
];

const pickupTiers = [
  { id: "Regular", name: "Regular Pickup", description: "Scheduled within 3-5 days", price: 0 },
  { id: "Priority", name: "Priority Pickup", description: "Within 1-2 days", price: 500 },
  { id: "Emergency", name: "Emergency Pickup", description: "Same day service", price: 1000 },
];

type TrackingType = "service" | "product";

function parseTrackingQuery(search: string): { orderId: string | null; type: TrackingType } {
  const params = new URLSearchParams(search);
  const order = params.get("order");
  const legacyId = params.get("id");
  const ticket = params.get("ticket");
  const resolved = order || legacyId || ticket;
  const rawType = params.get("type");
  const type: TrackingType = rawType === "product" ? "product" : "service";

  return { orderId: resolved, type };
}

function buildTrackingUrl(orderId: string, type: TrackingType): string {
  return `/track-order?order=${encodeURIComponent(orderId)}&type=${type}`;
}

function getQuoteStatusDisplay(quoteStatus: string | null) {
  switch (quoteStatus) {
    case "Pending":
      return { text: "Quote Pending", bg: "bg-yellow-100", color: "text-yellow-700" };
    case "Quoted":
      return { text: "Quote Ready", bg: "bg-blue-100", color: "text-blue-700" };
    case "Accepted":
      return { text: "Quote Accepted", bg: "bg-green-100", color: "text-green-700" };
    case "Declined":
      return { text: "Quote Declined", bg: "bg-red-100", color: "text-red-700" };
    case "Converted":
      return { text: "Converted", bg: "bg-purple-100", color: "text-purple-700" };
    case "Expired":
      return { text: "Expired", bg: "bg-gray-100", color: "text-gray-700" };
    default:
      return null;
  }
}

function QuoteDetailView({
  order,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
  serviceCenterContact
}: {
  order: ServiceRequest;
  onAccept: (pickupTier: string | null, address: string, servicePreference: "home_pickup" | "service_center", scheduledVisitDate?: Date | null) => void;
  onDecline: () => void;
  isAccepting: boolean;
  isDeclining: boolean;
  serviceCenterContact: string;
}) {
  const [selectedTier, setSelectedTier] = useState("Regular");
  const [address, setAddress] = useState(order.address || "");
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [chosenServiceType, setChosenServiceType] = useState<"home_pickup" | "service_center" | "">(
    order.servicePreference === "home_pickup" ? "home_pickup" :
      order.servicePreference === "service_center" ? "service_center" : ""
  );
  const [addressError, setAddressError] = useState(false);
  const [serviceTypeError, setServiceTypeError] = useState(false);
  const [scheduledVisitDate, setScheduledVisitDate] = useState<Date | null>(null);
  const [showVisitDatePicker, setShowVisitDatePicker] = useState(false);
  const [visitDateChoice, setVisitDateChoice] = useState<"date" | "later" | null>(null);

  const quoteStatusDisplay = getQuoteStatusDisplay(order.quoteStatus);

  const showBothOptions = order.servicePreference === "both" || !order.servicePreference;
  const showOnlyPickup = order.servicePreference === "home_pickup";
  const showOnlyServiceCenter = order.servicePreference === "service_center";

  const isQuoteExpired = () => {
    if (!order.quotedAt) return false;
    const quotedDate = new Date(order.quotedAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - quotedDate.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 30;
  };

  const quoteExpired = isQuoteExpired();

  const handleAcceptClick = () => {
    if (showAcceptForm) {
      let hasError = false;

      if (!chosenServiceType) {
        toast.error("Please select a service option (Home Pickup or Service Center)");
        setServiceTypeError(true);
        hasError = true;
      }
      if (chosenServiceType === "home_pickup" && !address.trim()) {
        toast.error("Please enter your pickup address");
        setAddressError(true);
        hasError = true;
      }
      if (chosenServiceType === "service_center" && !visitDateChoice) {
        toast.error("Please select a visit date or click 'Decide Later'");
        hasError = true;
      }

      if (hasError) return;

      onAccept(
        chosenServiceType === "home_pickup" ? selectedTier : null,
        address,
        chosenServiceType as "home_pickup" | "service_center",
        chosenServiceType === "service_center" && visitDateChoice === "date" ? scheduledVisitDate : null
      );
    } else {
      setShowAcceptForm(true);
      if (showOnlyPickup) setChosenServiceType("home_pickup");
      if (showOnlyServiceCenter) setChosenServiceType("service_center");
    }
  };

  const canConfirm = () => {
    if (!chosenServiceType) return false;
    if (chosenServiceType === "home_pickup" && !address.trim()) return false;
    if (chosenServiceType === "service_center" && !visitDateChoice) return false;
    return true;
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Quote #{order.ticketNumber}
            </CardTitle>
            <CardDescription>
              {order.brand} - {order.primaryIssue}
            </CardDescription>
          </div>
          {quoteStatusDisplay && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${quoteStatusDisplay.bg} ${quoteStatusDisplay.color}`}>
              {quoteStatusDisplay.text}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>Submitted: {format(new Date(order.createdAt), "MMM d, yyyy")}</span>
          </div>
        </div>

        {order.quoteStatus === "Pending" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Awaiting Quote</p>
                <p className="text-sm text-yellow-700">Our team is reviewing your request and will provide a quote soon.</p>
              </div>
            </div>
          </div>
        )}

        {order.quoteStatus === "Quoted" && !quoteExpired && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <DollarSign className="w-8 h-8 text-blue-600 mt-1" />
              <div className="flex-1">
                <p className="font-medium text-blue-800">Quote Ready!</p>
                <p className="text-2xl font-bold text-primary mt-2">
                  ৳{Number(order.quoteAmount).toLocaleString()}
                </p>
                {order.quoteNotes && (
                  <p className="text-sm text-muted-foreground mt-2">{order.quoteNotes}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Quoted on: {order.quotedAt ? format(new Date(order.quotedAt), "MMM d, yyyy h:mm a") : "N/A"}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Valid for 30 days from quote date
                </p>
              </div>
            </div>
          </div>
        )}

        {order.quoteStatus === "Accepted" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Quote Accepted</p>
                <p className="text-sm text-green-700">
                  Amount: ৳{Number(order.quoteAmount).toLocaleString()}
                  {order.pickupTier && ` | Pickup: ${order.pickupTier}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {order.quoteStatus === "Declined" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <p className="font-medium text-red-800">Quote Declined</p>
                <p className="text-sm text-red-700">You declined this quote. Feel free to request a new one.</p>
              </div>
            </div>
          </div>
        )}

        {order.quoteStatus === "Quoted" && quoteExpired && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="w-8 h-8 text-orange-600 mt-1" />
              <div className="flex-1">
                <p className="font-medium text-orange-800">Quote Expired</p>
                <p className="text-sm text-orange-700 mt-1">
                  Sorry, this quote has expired. Quotes are valid for 30 days from the date issued.
                  Parts prices and availability may have changed.
                </p>
                <p className="text-sm text-orange-700 mt-2">
                  Please submit a new service request to receive an updated quote.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => window.location.href = "/get-quote"}
                  data-testid="button-resubmit-quote"
                >
                  Request New Quote
                </Button>
              </div>
            </div>
          </div>
        )}

        {showAcceptForm && order.quoteStatus === "Quoted" && !quoteExpired && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            {showBothOptions && (
              <div>
                <Label className="text-base font-medium">How would you like to proceed? *</Label>
                <RadioGroup value={chosenServiceType} onValueChange={(v) => { setChosenServiceType(v as typeof chosenServiceType); setServiceTypeError(false); }} className="mt-3 space-y-3">
                  <div className={`flex items-center space-x-3 p-3 rounded-lg border ${chosenServiceType === "home_pickup" ? 'border-primary bg-primary/5' : serviceTypeError ? 'border-2 border-red-500' : 'border-border'}`}>
                    <RadioGroupItem value="home_pickup" id="service-home-pickup" data-testid="radio-service-home-pickup" />
                    <Label htmlFor="service-home-pickup" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-primary" />
                        <span className="font-medium">Home Pickup</span>
                      </div>
                      <p className="text-sm text-muted-foreground">We'll collect your TV from your location</p>
                    </Label>
                  </div>
                  <div className={`flex items-center space-x-3 p-3 rounded-lg border ${chosenServiceType === "service_center" ? 'border-primary bg-primary/5' : serviceTypeError ? 'border-2 border-red-500' : 'border-border'}`}>
                    <RadioGroupItem value="service_center" id="service-service-center" data-testid="radio-service-service-center" />
                    <Label htmlFor="service-service-center" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span className="font-medium">Service Center Visit</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Bring your TV to our service center</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {(chosenServiceType === "home_pickup" || showOnlyPickup) && (
              <>
                <div>
                  <Label className="text-base font-medium">Select Pickup Option</Label>
                  <RadioGroup value={selectedTier} onValueChange={setSelectedTier} className="mt-3 space-y-3">
                    {pickupTiers.map((tier) => (
                      <div key={tier.id} className={`flex items-center space-x-3 p-3 rounded-lg border ${selectedTier === tier.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                        <RadioGroupItem value={tier.id} id={tier.id} data-testid={`radio-tier-${tier.id}`} />
                        <Label htmlFor={tier.id} className="flex-1 cursor-pointer">
                          <span className="font-medium">{tier.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            {tier.price > 0 ? `+৳${tier.price}` : "(Free)"}
                          </span>
                          <p className="text-sm text-muted-foreground">{tier.description}</p>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div>
                  <Label htmlFor="pickup-address">Pickup Address *</Label>
                  <Input
                    id="pickup-address"
                    placeholder="Enter your pickup address"
                    value={address}
                    onChange={(e) => { setAddress(e.target.value); setAddressError(false); }}
                    className={`mt-2 ${addressError ? 'border-2 border-red-500' : ''}`}
                    data-testid="input-pickup-address"
                  />
                </div>

                <div className="p-3 bg-background rounded-lg border">
                  <div className="flex justify-between text-sm">
                    <span>Quote Amount:</span>
                    <span>৳{Number(order.quoteAmount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Pickup Charge:</span>
                    <span>৳{pickupTiers.find(t => t.id === selectedTier)?.price || 0}</span>
                  </div>
                  <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-primary">
                      ৳{(Number(order.quoteAmount) + (pickupTiers.find(t => t.id === selectedTier)?.price || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </>
            )}

            {(chosenServiceType === "service_center" || showOnlyServiceCenter) && (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="font-medium text-green-800 mb-2">Welcome to Promise Electronics!</p>
                  <p className="text-sm text-green-700 mb-3">
                    Please call us at <span className="font-semibold">{serviceCenterContact}</span> before visiting our service center.
                    We'll prepare everything for your arrival.
                  </p>
                  <div className="p-3 bg-white rounded-lg border border-green-200">
                    <div className="flex justify-between font-bold">
                      <span>Total Amount:</span>
                      <span className="text-primary">৳{Number(order.quoteAmount).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border ${!visitDateChoice ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'}`}>
                  <p className={`font-medium mb-2 flex items-center gap-2 ${!visitDateChoice ? 'text-amber-800' : 'text-blue-800'}`}>
                    <Calendar className="w-4 h-4" />
                    When will you visit? *
                  </p>
                  <p className={`text-sm mb-3 ${!visitDateChoice ? 'text-amber-700' : 'text-blue-700'}`}>
                    {!visitDateChoice
                      ? "Please select a visit date or click 'Decide Later' to continue."
                      : "Select your planned visit date so we can prepare for your arrival."
                    }
                  </p>

                  {!visitDateChoice && !showVisitDatePicker && (
                    <div className="flex gap-2">
                      <Button
                        variant={!visitDateChoice ? "default" : "outline"}
                        className={`flex-1 ${!visitDateChoice ? 'animate-pulse' : ''}`}
                        onClick={() => setShowVisitDatePicker(true)}
                        data-testid="button-select-visit-date"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Select Date
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setVisitDateChoice("later")}
                        data-testid="button-decide-later"
                      >
                        Decide Later
                      </Button>
                    </div>
                  )}

                  {showVisitDatePicker && (
                    <div className="bg-white rounded-lg border p-3">
                      <CalendarComponent
                        mode="single"
                        selected={scheduledVisitDate || undefined}
                        onSelect={(date: Date | undefined) => {
                          if (date) {
                            setScheduledVisitDate(date);
                            setVisitDateChoice("date");
                            setShowVisitDatePicker(false);
                          }
                        }}
                        disabled={(date: Date) => date < new Date()}
                        initialFocus
                      />
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowVisitDatePicker(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {visitDateChoice === "date" && scheduledVisitDate && !showVisitDatePicker && (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-200">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800">
                            {format(scheduledVisitDate, "EEEE, MMMM d, yyyy")}
                          </p>
                          <p className="text-xs text-green-600">Planned visit date</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowVisitDatePicker(true)}
                        data-testid="button-change-visit-date"
                      >
                        Change
                      </Button>
                    </div>
                  )}

                  {visitDateChoice === "later" && !showVisitDatePicker && (
                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-700">
                            You'll decide later
                          </p>
                          <p className="text-xs text-slate-500">Call us before visiting</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setVisitDateChoice(null);
                          setShowVisitDatePicker(true);
                        }}
                        data-testid="button-choose-date-instead"
                      >
                        Select Date
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-6">
          <h4 className="font-medium mb-3">Device Details</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Brand:</span> {order.brand}
            </div>
            <div>
              <span className="text-muted-foreground">Screen Size:</span> {order.screenSize || "N/A"}
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Issue:</span> {order.primaryIssue}
            </div>
            {order.description && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Description:</span> {order.description}
              </div>
            )}
          </div>
        </div>

        {order.quoteStatus === "Quoted" && !quoteExpired && (
          <div className="flex justify-center pt-4">
            <div className="flex gap-3 w-full max-w-md">
              <Button
                variant="outline"
                className="flex-1 text-red-600 hover:bg-red-50"
                onClick={onDecline}
                disabled={isDeclining || isAccepting}
                data-testid="button-decline-quote"
              >
                {isDeclining ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Declining...
                  </>
                ) : (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Decline Quote
                  </>
                )}
              </Button>
              <Button
                className="flex-1"
                onClick={handleAcceptClick}
                disabled={isAccepting || isDeclining}
                data-testid="button-accept-quote"
              >
                {isAccepting ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirming...
                  </>
                ) : showAcceptForm ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm & Accept
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Accept Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WarrantyInfoCard({ warranty }: { warranty: WarrantyInfo }) {
  const hasActiveWarranty = warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive;

  return (
    <div className={`mt-6 p-4 rounded-lg border ${hasActiveWarranty ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`} data-testid="warranty-info-card">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasActiveWarranty ? 'bg-green-500' : 'bg-amber-500'} text-white`}>
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <h4 className={`font-semibold ${hasActiveWarranty ? 'text-green-800' : 'text-amber-800'}`}>
            Warranty Coverage
          </h4>
          <p className={`text-sm ${hasActiveWarranty ? 'text-green-600' : 'text-amber-600'}`}>
            {hasActiveWarranty ? 'Your repair is covered under warranty' : 'Warranty has expired'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {warranty.serviceWarranty.days > 0 && (
          <div className={`p-3 rounded-lg ${warranty.serviceWarranty.isActive ? 'bg-white border border-green-200' : 'bg-white/50 border border-amber-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Service Warranty</span>
              <Badge className={warranty.serviceWarranty.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                {warranty.serviceWarranty.isActive ? 'Active' : 'Expired'}
              </Badge>
            </div>
            <p className="text-lg font-bold">{warranty.serviceWarranty.days} Days</p>
            {warranty.serviceWarranty.expiryDate && (
              <p className="text-xs text-muted-foreground">
                {warranty.serviceWarranty.isActive
                  ? `Expires: ${format(new Date(warranty.serviceWarranty.expiryDate), "MMM d, yyyy")} (${warranty.serviceWarranty.remainingDays} days left)`
                  : `Expired: ${format(new Date(warranty.serviceWarranty.expiryDate), "MMM d, yyyy")}`
                }
              </p>
            )}
          </div>
        )}

        {warranty.partsWarranty.days > 0 && (
          <div className={`p-3 rounded-lg ${warranty.partsWarranty.isActive ? 'bg-white border border-green-200' : 'bg-white/50 border border-amber-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Parts Warranty</span>
              <Badge className={warranty.partsWarranty.isActive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                {warranty.partsWarranty.isActive ? 'Active' : 'Expired'}
              </Badge>
            </div>
            <p className="text-lg font-bold">{warranty.partsWarranty.days} Days</p>
            {warranty.partsWarranty.expiryDate && (
              <p className="text-xs text-muted-foreground">
                {warranty.partsWarranty.isActive
                  ? `Expires: ${format(new Date(warranty.partsWarranty.expiryDate), "MMM d, yyyy")} (${warranty.partsWarranty.remainingDays} days left)`
                  : `Expired: ${format(new Date(warranty.partsWarranty.expiryDate), "MMM d, yyyy")}`
                }
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentSubmissionCard({ order }: { order: ServiceRequest }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"bkash_send_money" | "nagad_send_money">("bkash_send_money");
  const [senderNumber, setSenderNumber] = useState(order.phone || "");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState(String(order.totalAmount || order.quoteAmount || ""));
  const { data: settings = [] } = useQuery({
    queryKey: ["public-settings"],
    queryFn: publicSettingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const paymentSubmissions = ((order as any).paymentSubmissions || []) as any[];
  const latestPayment = paymentSubmissions[0];
  const hasPendingPayment = paymentSubmissions.some((payment) => payment.status === "pending" || payment.status === "staff_verified");
  const verifiedPayment = paymentSubmissions.find((payment) => payment.status === "applied_to_invoice");
  const rejectedPayment = paymentSubmissions.find((payment) => payment.status === "rejected");
  const paymentStatusLabel = (status: string) => {
    if (status === "applied_to_invoice") return "Verified";
    if (status === "staff_verified") return "Staff Checked";
    if (status === "rejected") return "Rejected";
    return "Pending";
  };
  const paymentStatusClass = (status: string) => {
    if (status === "applied_to_invoice") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (status === "rejected") return "border-red-200 bg-red-50 text-red-700";
    return "border-amber-200 bg-amber-50 text-amber-700";
  };
  const paymentHistory = paymentSubmissions.length > 0 ? (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Attempts</p>
      <div className="mt-2 space-y-2">
        {paymentSubmissions.slice(0, 5).map((payment) => (
          <div key={payment.id} className="rounded-lg border border-slate-100 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{payment.transactionId || "No transaction ID"}</p>
                <p className="text-xs text-slate-500">
                  {payment.senderNumber || "No sender number"} - BDT {payment.amount}
                  {payment.submittedAt ? ` - ${format(new Date(payment.submittedAt), "MMM d, h:mm a")}` : ""}
                </p>
              </div>
              <Badge variant="outline" className={paymentStatusClass(payment.status)}>
                {paymentStatusLabel(payment.status)}
              </Badge>
            </div>
            {payment.status === "rejected" && payment.rejectionReason && (
              <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{payment.rejectionReason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  ) : null;
  // NEVER fall back to a fake number — a customer would send real money to it
  // and lose it. If unset, show a "contact shop" notice and block submission.
  const rawSendMoneyNumber = method === "bkash_send_money"
    ? settings.find((setting) => setting.key === "bkash_send_money_number")?.value
    : settings.find((setting) => setting.key === "nagad_send_money_number")?.value;
  const sendMoneyNumber = (rawSendMoneyNumber || "").trim();
  const sendMoneyConfigured = sendMoneyNumber.length > 0;

  const submitPaymentMutation = useMutation({
    mutationFn: () => customerServiceRequestsApi.submitPayment(order.id, {
      method,
      senderNumber,
      transactionId,
      amount: Number(amount),
    }),
    onSuccess: () => {
      toast.success("Payment verification submitted");
      setTransactionId("");
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests", order.id] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
    },
    onError: (error: Error) => toast.error(error.message || "Failed to submit payment verification"),
  });

  if (verifiedPayment || order.paymentStatus === "Paid") {
    return (
      <div className="mt-6 space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <h4 className="font-semibold text-emerald-900">Payment Verified</h4>
              <p className="text-sm text-emerald-700">
                {verifiedPayment?.transactionId ? `Transaction ${verifiedPayment.transactionId} has been accepted.` : "Payment has been accepted."}
              </p>
            </div>
          </div>
        </div>
        {paymentHistory}
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-slate-900">Submit Send Money Payment</h4>
          <p className="text-sm text-slate-500">Send money first, then submit the sender number, transaction ID, and amount.</p>
        </div>
        {latestPayment && (
          <Badge variant="outline" className={
            latestPayment.status === "rejected"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }>
            {latestPayment.status === "rejected" ? "Rejected" : "Pending"}
          </Badge>
        )}
      </div>

      {sendMoneyConfigured ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Send Money to this number</p>
          <p className="mt-1 font-mono text-lg font-bold text-blue-950">{sendMoneyNumber}</p>
          <p className="mt-1 text-xs text-blue-700">{method === "bkash_send_money" ? "bKash Send Money" : "Nagad Send Money"}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-800">Online payment not available right now</p>
          <p className="mt-1 text-xs text-amber-700">Please contact the shop to pay. (No {method === "bkash_send_money" ? "bKash" : "Nagad"} number is configured yet.)</p>
        </div>
      )}

      {rejectedPayment?.rejectionReason && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Previous submission rejected: {rejectedPayment.rejectionReason}
        </div>
      )}

      {hasPendingPayment ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your payment details are waiting for staff statement verification.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <RadioGroup value={method} onValueChange={(value) => setMethod(value as typeof method)} className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2 rounded-xl border p-3">
              <RadioGroupItem value="bkash_send_money" id="payment-bkash" />
              <Label htmlFor="payment-bkash">bKash</Label>
            </div>
            <div className="flex items-center space-x-2 rounded-xl border p-3">
              <RadioGroupItem value="nagad_send_money" id="payment-nagad" />
              <Label htmlFor="payment-nagad">Nagad</Label>
            </div>
          </RadioGroup>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Sender Number</Label>
              <Input value={senderNumber} onChange={(event) => setSenderNumber(event.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Transaction ID</Label>
              <Input value={transactionId} onChange={(event) => setTransactionId(event.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Amount</Label>
              <Input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1" />
            </div>
          </div>
          <Button
            onClick={() => submitPaymentMutation.mutate()}
            disabled={submitPaymentMutation.isPending || !sendMoneyConfigured || !senderNumber.trim() || !transactionId.trim() || !Number(amount)}
            className="w-full"
          >
            {submitPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Verification
          </Button>
        </div>
      )}
      <div className="mt-4">{paymentHistory}</div>
    </div>
  );
}

function ServiceRequestTimeline({ order, events, warranty }: { order: ServiceRequest; events: ServiceRequestEvent[]; warranty?: WarrantyInfo }) {
  const isCancelled = order.trackingStatus === "Cancelled" || order.stage === "closed";
  const isClosed = order.stage === "closed";

  // Derive effective service mode from new field or legacy servicePreference
  const effectiveServiceMode = order.serviceMode ||
    (order.servicePreference === "home_pickup" ? "pickup" :
      order.servicePreference === "service_center" ? "service_center" : null);

  // Use new stage-based tracking only if stage is present
  const useNewStageSystem = !!order.stage;

  // Filter steps based on service preference - show only relevant pickup/dropoff steps (legacy)
  const isHomePickup = effectiveServiceMode === "pickup";
  const isServiceCenter = effectiveServiceMode === "service_center";

  // Legacy filtering
  const filteredSteps = serviceTrackingSteps.filter(step => {
    if (isHomePickup && step.status === "Awaiting Drop-off") return false;
    if (isServiceCenter && step.status === "Arriving to Receive") return false;
    return true;
  });

  // New stage-based steps - use effectiveServiceMode for legacy support
  const stageSteps = useNewStageSystem ? getStageSteps(effectiveServiceMode, order.requestIntent) : [];
  const currentStageIndex = useNewStageSystem ? stageSteps.findIndex(s => s.stage === order.stage) : -1;

  // Legacy status index
  const currentStepIndex = isCancelled ? -1 : filteredSteps.findIndex(s => s.status === order.trackingStatus);

  // Display job number - use convertedJobId if converted, otherwise use ticketNumber
  const displayJobNumber = order.convertedJobId || order.ticketNumber;
  const isConverted = order.status === "Converted" && order.convertedJobId;

  // Expected dates display helper - uses effectiveServiceMode for legacy support
  const renderExpectedDates = () => {
    const dateCards: React.ReactElement[] = [];

    if (effectiveServiceMode === "pickup") {
      if (order.expectedPickupDate) {
        dateCards.push(
          <div key="pickup" className="p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                <Truck className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div>
                <p className="font-semibold text-blue-900">Expected Pickup</p>
                <p className="text-blue-700 text-lg font-bold">
                  {format(new Date(order.expectedPickupDate), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-blue-600">We will collect your device on this date</p>
              </div>
            </div>
          </div>
        );
      }
      if (order.expectedReturnDate) {
        dateCards.push(
          <div key="return" className="p-3 md:p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                <Truck className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div>
                <p className="font-semibold text-green-900">Expected Return</p>
                <p className="text-green-700 text-lg font-bold">
                  {format(new Date(order.expectedReturnDate), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-green-600">Your device will be delivered back</p>
              </div>
            </div>
          </div>
        );
      }
    } else if (effectiveServiceMode === "service_center") {
      if (order.expectedReadyDate) {
        dateCards.push(
          <div key="ready" className="p-3 md:p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <div>
                <p className="font-semibold text-green-900">Expected Ready Date</p>
                <p className="text-green-700 text-lg font-bold">
                  {format(new Date(order.expectedReadyDate), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-green-600">Your device will be ready for pickup</p>
              </div>
            </div>
          </div>
        );
      }
    }

    if (dateCards.length === 0) return null;

    return (
      <div className="space-y-3 mb-4">
        {dateCards}
      </div>
    );
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              {isConverted ? (
                <>Job #{displayJobNumber}</>
              ) : (
                <>Repair #{displayJobNumber}</>
              )}
            </CardTitle>
            <CardDescription>
              {order.brand} - {order.primaryIssue}
            </CardDescription>
            {isConverted && order.ticketNumber && (
              <p className="text-xs text-muted-foreground mt-1">
                Original Request: {order.ticketNumber}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {isCancelled && !isClosed ? (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                Cancelled
              </span>
            ) : isClosed ? (
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                Closed
              </span>
            ) : (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${order.paymentStatus === "Paid"
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
                }`}>
                {order.paymentStatus}
              </span>
            )}
            {isConverted && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                Converted to Job
              </span>
            )}
            {effectiveServiceMode && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${effectiveServiceMode === "pickup"
                ? "bg-orange-100 text-orange-700"
                : "bg-purple-100 text-purple-700"
                }`}>
                {effectiveServiceMode === "pickup" ? "Home Pickup" : "Service Center"}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isCancelled && !isClosed ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-red-700 mb-2">Request Cancelled</h3>
            <p className="text-muted-foreground max-w-md">
              This service request has been cancelled. If you have any questions, please contact our support team.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Submitted: {format(new Date(order.createdAt), "MMM d, yyyy")}</span>
                </div>
                {/* Legacy scheduled pickup display */}
                {!useNewStageSystem && order.scheduledPickupDate && (order.trackingStatus === "Arriving to Receive" || order.trackingStatus === "Awaiting Drop-off") && (
                  <div className="flex items-center gap-1 text-primary font-medium">
                    <Truck className="w-4 h-4" />
                    <span>
                      {order.trackingStatus === "Arriving to Receive"
                        ? `Pickup Date: ${format(new Date(order.scheduledPickupDate), "MMM d, yyyy")}`
                        : `Drop-off by: ${format(new Date(order.scheduledPickupDate), "MMM d, yyyy")}`
                      }
                    </span>
                  </div>
                )}
                {order.estimatedDelivery && (
                  <div className="flex items-center gap-1">
                    <Truck className="w-4 h-4" />
                    <span>Est. Delivery: {format(new Date(order.estimatedDelivery), "MMM d, yyyy")}</span>
                  </div>
                )}
              </div>

              {/* NEW: Display expected dates prominently for new stage system */}
              {useNewStageSystem && renderExpectedDates()}

              {/* Legacy scheduled pickup card */}
              {!useNewStageSystem && order.scheduledPickupDate && (order.trackingStatus === "Arriving to Receive" || order.trackingStatus === "Awaiting Drop-off") && (
                <div className="p-3 md:p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-blue-900">
                        {order.trackingStatus === "Arriving to Receive"
                          ? "Scheduled Pickup"
                          : "Drop-off Deadline"
                        }
                      </p>
                      <p className="text-blue-700 text-lg font-bold">
                        {format(new Date(order.scheduledPickupDate), "EEEE, MMMM d, yyyy")}
                      </p>
                      <p className="text-sm text-blue-600 mt-1">
                        {order.trackingStatus === "Arriving to Receive"
                          ? "Our team will arrive to collect your TV on this date"
                          : "Please bring your TV to our service center by this date"
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {useNewStageSystem && <CustomerNextActionCard order={order} serviceMode={effectiveServiceMode} />}

            {/* NEW: Stage-based timeline as Accordion */}
            {useNewStageSystem ? (
              <Accordion
                type="single"
                collapsible
                defaultValue={currentStageIndex >= 0 ? stageSteps[currentStageIndex].stage : undefined}
                className="w-full space-y-3"
              >
                {stageSteps.map((step, index) => {
                  const isCurrent = index === currentStageIndex;
                  const isComplete = index < currentStageIndex;
                  const Icon = step.icon;

                  // Find any relevant events for this stage (could match by stage or label for legacy data)
                  const stepEvents = events.filter(e => e.status === step.label || e.status === step.stage);

                  return (
                    <AccordionItem
                      key={step.stage}
                      value={step.stage}
                      className={`border rounded-lg px-4 ${isCurrent ? 'bg-primary/5 border-primary/30' : isComplete ? 'bg-slate-50 border-slate-200' : 'bg-white border-dashed border-slate-200 text-slate-400'}`}
                    >
                      <AccordionTrigger className={`hover:no-underline py-4 ${!isCurrent && !isComplete ? 'pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-4 text-left">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCurrent
                            ? "bg-primary text-white shadow-md animate-pulse"
                            : isComplete
                              ? "bg-green-500 text-white shadow-sm"
                              : "bg-slate-100 text-slate-400"
                            }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className={`font-semibold text-base ${isCurrent ? "text-primary" : isComplete ? "text-slate-800" : "text-slate-400"}`}>
                              {step.label}
                            </p>
                            <p className="text-sm font-normal text-muted-foreground line-clamp-1">{step.description}</p>
                          </div>
                          <div className="mr-2">
                            {isCurrent && <Badge className="bg-primary/20 text-primary hover:bg-primary/20 pointer-events-none">Active</Badge>}
                            {isComplete && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 pointer-events-none"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</Badge>}
                          </div>
                        </div>
                      </AccordionTrigger>
                      {(isCurrent || isComplete) && (
                        <AccordionContent className="pb-4 pt-1 pl-18">
                          <div className="ml-14 pl-4 border-l-2 border-slate-100 space-y-3">
                            <p className="text-sm text-slate-600">{step.description}</p>

                            {stepEvents.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Updates</p>
                                {stepEvents.map((event, i) => (
                                  <div key={i} className="text-sm bg-white p-3 rounded-md border text-slate-700 shadow-sm">
                                    <div className="flex items-center gap-2 mb-1 text-xs text-slate-500">
                                      <Clock className="w-3 h-3" />
                                      {format(new Date(event.occurredAt), "MMM d, yyyy h:mm a")}
                                    </div>
                                    {event.message && <p>{event.message}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      )}
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              /* Legacy timeline as Accordion */
              <Accordion
                type="single"
                collapsible
                defaultValue={currentStepIndex >= 0 ? filteredSteps[currentStepIndex].status : undefined}
                className="w-full space-y-3"
              >
                {filteredSteps.map((step, index) => {
                  const isCurrent = index === currentStepIndex;
                  const isComplete = index < currentStepIndex;
                  const stepEvents = events.filter(e => e.status === step.status);
                  const Icon = step.icon;

                  return (
                    <AccordionItem
                      key={step.status}
                      value={step.status}
                      className={`border rounded-lg px-4 ${isCurrent ? 'bg-primary/5 border-primary/30' : isComplete ? 'bg-slate-50 border-slate-200' : 'bg-white border-dashed border-slate-200 text-slate-400'}`}
                    >
                      <AccordionTrigger className={`hover:no-underline py-4 ${!isCurrent && !isComplete ? 'pointer-events-none' : ''}`}>
                        <div className="flex items-center gap-4 text-left">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCurrent
                            ? "bg-primary text-white shadow-md animate-pulse"
                            : isComplete
                              ? "bg-green-500 text-white shadow-sm"
                              : "bg-slate-100 text-slate-400"
                            }`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <p className={`font-semibold text-base ${isCurrent ? "text-primary" : isComplete ? "text-slate-800" : "text-slate-400"}`}>
                              {step.status}
                            </p>
                            <p className="text-sm font-normal text-muted-foreground line-clamp-1">{step.description}</p>
                          </div>
                          <div className="mr-2">
                            {isCurrent && <Badge className="bg-primary/20 text-primary hover:bg-primary/20 pointer-events-none">Active</Badge>}
                            {isComplete && <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 pointer-events-none"><CheckCircle2 className="w-3 h-3 mr-1" /> Done</Badge>}
                          </div>
                        </div>
                      </AccordionTrigger>
                      {(isCurrent || isComplete) && (
                        <AccordionContent className="pb-4 pt-1 pl-18">
                          <div className="ml-14 pl-4 border-l-2 border-slate-100 space-y-3">
                            <p className="text-sm text-slate-600">{step.description}</p>

                            {stepEvents.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Updates</p>
                                {stepEvents.map((event, i) => (
                                  <div key={i} className="text-sm bg-white p-3 rounded-md border text-slate-700 shadow-sm">
                                    <div className="flex items-center gap-2 mb-1 text-xs text-slate-500">
                                      <Clock className="w-3 h-3" />
                                      {format(new Date(event.occurredAt), "MMM d, yyyy h:mm a")}
                                    </div>
                                    {event.message && <p>{event.message}</p>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      )}
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            <div className="mt-6 pt-6 border-t">
              <h4 className="font-medium mb-3">Device Details</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Brand:</span> {order.brand}
                </div>
                <div>
                  <span className="text-muted-foreground">Screen Size:</span> {order.screenSize || "N/A"}
                </div>
                {order.modelNumber && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Model:</span> {order.modelNumber}
                  </div>
                )}
                <div className="col-span-2">
                  <span className="text-muted-foreground">Issue:</span> {order.primaryIssue}
                </div>
              </div>
            </div>

            {/* Warranty Info Card - show for completed jobs */}
            {warranty && (order.trackingStatus === "Delivered" || order.stage === "completed") && (
              <WarrantyInfoCard warranty={warranty} />
            )}
            {!useNewStageSystem && <PaymentSubmissionCard order={order} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProductOrderTimeline({ order }: { order: Order & { items?: any[] } }) {
  const isDeclined = order.status === "Declined";
  const steps = isDeclined ? [] : productOrderSteps;
  const currentStepIndex = steps.findIndex(s => s.status === order.status);

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Order #{order.orderNumber}</CardTitle>
            <CardDescription>
              {order.items?.length || 0} item(s) - Cash on Delivery
            </CardDescription>
          </div>
          <Badge
            variant={
              order.status === "Delivered" ? "default" :
                order.status === "Declined" ? "destructive" :
                  order.status === "Pending" ? "secondary" : "outline"
            }
            className={order.status === "Delivered" ? "bg-green-500" : ""}
          >
            {order.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Ordered: {format(new Date(order.createdAt!), "MMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <CreditCard className="w-4 h-4" />
              <span>Total: ৳{Number(order.total).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {isDeclined ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="font-medium text-red-700">Order Declined</p>
                <p className="text-sm text-red-600">{order.declineReason || "The seller was unable to process your order."}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            {steps.map((step, index) => {
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const Icon = step.icon;

              return (
                <div key={step.status} className="flex gap-4 pb-8 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCurrent
                      ? "bg-primary text-white animate-pulse"
                      : index < currentStepIndex
                        ? "bg-green-500 text-white"
                        : "bg-slate-100 text-slate-400"
                      }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`w-0.5 flex-1 mt-2 ${index < currentStepIndex ? "bg-green-500" : "bg-slate-200"
                        }`} />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className={`font-medium ${isCurrent ? "text-primary" : index < currentStepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.status}
                      {isCurrent && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Current</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {order.items && order.items.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <h4 className="font-medium mb-3">Order Items</h4>
            <div className="space-y-3">
              {order.items.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium">{item.productName}</span>
                    {item.variantName && <span className="text-muted-foreground ml-2">({item.variantName})</span>}
                    <span className="text-muted-foreground"> x{item.quantity}</span>
                  </div>
                  <span>৳{Number(item.total).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <h4 className="font-medium mb-3">Delivery Details</h4>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>{order.customerAddress}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{order.customerPhone}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between items-center">
            <span className="font-medium">Order Total</span>
            <span className="text-xl font-bold text-primary">৳{Number(order.total).toLocaleString()}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Payment: Cash on Delivery</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceRequestTimelineWithWarranty({ order, events }: { order: ServiceRequest; events: ServiceRequestEvent[] }) {
  const { data: warranties = [] } = useQuery({
    queryKey: ["/customer/warranties"],
    queryFn: () => customerWarrantiesApi.getAll(),
    enabled: order.trackingStatus === "Delivered" || order.stage === "completed",
  });

  const warranty = warranties.find(w =>
    w.jobId === order.convertedJobId ||
    w.device?.toLowerCase().includes(order.brand?.toLowerCase() || "")
  );

  return <ServiceRequestTimeline order={order} events={events} warranty={warranty} />;
}

export { QuoteDetailView, ServiceRequestTimelineWithWarranty, ProductOrderTimeline };