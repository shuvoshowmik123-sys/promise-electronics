import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { customerServiceRequestsApi, shopOrdersApi, settingsApi, customerWarrantiesApi, type WarrantyInfo } from "@/lib/api";
import type { ServiceRequest, ServiceRequestEvent, Order } from "@shared/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Package,
  Wrench,
  CheckCircle,
  Clock,
  Truck,
  Search,
  User,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Loader2,
  LogOut,
  ChevronRight,
  ShoppingBag,
  XCircle,
  ClipboardCheck,
  FileText,
  DollarSign,
  CheckCircle2,
  X,
  Shield,
  AlertTriangle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TrackingTimeline } from "@/components/mobile/TrackingTimeline";

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
  { stage: "intake", label: "Request Received", icon: Package, description: "Your request is being reviewed" },
  { stage: "assessment", label: "Under Assessment", icon: Search, description: "Reviewing your repair needs" },
  { stage: "awaiting_customer", label: "Awaiting Your Response", icon: Clock, description: "Please review and accept the quote" },
  { stage: "authorized", label: "Authorized", icon: CheckCircle2, description: "Your repair has been approved" },
  { stage: "pickup_scheduled", label: "Pickup Scheduled", icon: Calendar, description: "We will collect your device" },
  { stage: "picked_up", label: "Device Collected", icon: Truck, description: "Your device has been picked up" },
  { stage: "in_repair", label: "Repair in Progress", icon: Wrench, description: "Your device is being repaired" },
  { stage: "ready", label: "Repair Complete", icon: CheckCircle, description: "Your device is ready" },
  { stage: "out_for_delivery", label: "Out for Delivery", icon: Truck, description: "Your device is on its way back" },
  { stage: "completed", label: "Completed", icon: CheckCircle2, description: "Device returned to you" },
];

const serviceCenterStageSteps = [
  { stage: "intake", label: "Request Received", icon: Package, description: "Your request is being reviewed" },
  { stage: "assessment", label: "Under Assessment", icon: Search, description: "Reviewing your repair needs" },
  { stage: "awaiting_customer", label: "Awaiting Your Response", icon: Clock, description: "Please review and accept the quote" },
  { stage: "authorized", label: "Authorized", icon: CheckCircle2, description: "Your repair has been approved" },
  { stage: "awaiting_dropoff", label: "Awaiting Drop-off", icon: MapPin, description: "Please bring your device to our center" },
  { stage: "device_received", label: "Device Received", icon: CheckCircle, description: "Your device is at our service center" },
  { stage: "in_repair", label: "Repair in Progress", icon: Wrench, description: "Your device is being repaired" },
  { stage: "ready", label: "Ready for Pickup", icon: CheckCircle2, description: "Your device is ready for collection" },
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting...
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

function ServiceRequestTimeline({ order, events, warranty }: { order: ServiceRequest; events: ServiceRequestEvent[]; warranty?: WarrantyInfo }) {
  const isCancelled = order.trackingStatus === "Cancelled" || order.stage === "closed";
  const isClosed = order.stage === "closed";

  // Derive effective service mode from new field or legacy servicePreference
  const effectiveServiceMode = order.serviceMode ||
    (order.servicePreference === "home_pickup" ? "pickup" :
      order.servicePreference === "service_center" ? "service_center" : null);

  // Use new stage-based tracking only if stage is present
  const useNewStageSystem = !!order.stage && order.stage !== "intake";

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

            {/* NEW: Stage-based timeline */}
            {useNewStageSystem ? (
              <div className="relative">
                {stageSteps.map((step, index) => {
                  const isCurrent = index === currentStageIndex;
                  const isComplete = index < currentStageIndex;
                  const Icon = step.icon;

                  return (
                    <div key={step.stage} className="flex gap-3 md:gap-4 pb-6 md:pb-8 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${isCurrent
                          ? "bg-primary text-white animate-pulse"
                          : isComplete
                            ? "bg-green-500 text-white"
                            : "bg-slate-100 text-slate-400"
                          }`}>
                          <Icon className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                        {index < stageSteps.length - 1 && (
                          <div className={`w-0.5 flex-1 mt-2 ${isComplete ? "bg-green-500" : "bg-slate-200"
                            }`} />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className={`font-medium ${isCurrent ? "text-primary" : isComplete ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                          {isCurrent && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Current</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Legacy timeline */
              <div className="relative">
                {filteredSteps.map((step, index) => {
                  const isCurrent = index === currentStepIndex;
                  const event = events.find(e => e.status === step.status);
                  const Icon = step.icon;

                  return (
                    <div key={step.status} className="flex gap-3 md:gap-4 pb-6 md:pb-8 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${isCurrent
                          ? "bg-primary text-white animate-pulse"
                          : index < currentStepIndex
                            ? "bg-green-500 text-white"
                            : "bg-slate-100 text-slate-400"
                          }`}>
                          <Icon className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                        {index < filteredSteps.length - 1 && (
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
                        {event && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            <span>{format(new Date(event.occurredAt), "MMM d, yyyy h:mm a")}</span>
                            {event.message && <span className="block mt-1 text-primary">{event.message}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

function ServiceRequestCard({ order, onClick }: { order: ServiceRequest; onClick: () => void }) {
  const isQuote = order.isQuote;
  const quoteStatusDisplay = isQuote ? getQuoteStatusDisplay(order.quoteStatus) : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      data-testid={`card-service-request-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isQuote ? "bg-purple-100" : "bg-orange-100"
              }`}>
              {isQuote ? (
                <FileText className="w-6 h-6 text-purple-600" />
              ) : (
                <Wrench className="w-6 h-6 text-orange-600" />
              )}
            </div>
            <div>
              <p className="font-medium">
                #{order.ticketNumber}
                {isQuote && <span className="ml-2 text-xs text-purple-600 font-normal">Quote</span>}
              </p>
              <p className="text-sm text-muted-foreground">{order.brand} - {order.primaryIssue}</p>
              {isQuote && order.quoteAmount && (
                <p className="text-sm font-medium text-primary mt-1">
                  Quoted: ৳{Number(order.quoteAmount).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(order.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quoteStatusDisplay ? (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${quoteStatusDisplay.bg} ${quoteStatusDisplay.color}`}>
                {quoteStatusDisplay.text}
              </span>
            ) : (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.trackingStatus === "Delivered"
                ? "bg-green-100 text-green-700"
                : order.trackingStatus === "Repairing"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700"
                }`}>
                {order.trackingStatus}
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductOrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      data-testid={`card-product-order-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">#{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">
                ৳{Number(order.total).toLocaleString()} - {order.paymentMethod}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(order.createdAt!), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrackOrderPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [, setLocation] = useLocation();
  const { customer, isAuthenticated, isLoading: authLoading, logout } = useCustomerAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<"service" | "product" | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sseConnectedRef = useRef(false);
  const [sseSupported, setSseSupported] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    const orderType = params.get("type") as "service" | "product" | null;
    if (orderId) {
      setSelectedOrderId(orderId);
      setSelectedOrderType(orderType || "service");
    }
  }, []);

  const { data: serviceRequests, isLoading: serviceLoading } = useQuery({
    queryKey: ["/customer/service-requests"],
    queryFn: () => customerServiceRequestsApi.getAll(),
    enabled: isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: productOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/customer/orders"],
    queryFn: () => shopOrdersApi.getAll(),
    enabled: isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: serviceRequestDetails } = useQuery({
    queryKey: ["/customer/service-requests", selectedOrderId],
    queryFn: () => customerServiceRequestsApi.getOne(selectedOrderId!),
    enabled: !!selectedOrderId && selectedOrderType === "service" && isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: productOrderDetails } = useQuery({
    queryKey: ["/customer/orders/detail", selectedOrderId],
    queryFn: () => shopOrdersApi.getOne(selectedOrderId!),
    enabled: !!selectedOrderId && selectedOrderType === "product" && isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const serviceCenterContact = settings.find(s => s.key === "service_center_contact")?.value || "01700-000000";

  const acceptQuoteMutation = useMutation({
    mutationFn: ({ id, pickupTier, address, servicePreference, scheduledVisitDate }: { id: string; pickupTier: string | null; address: string; servicePreference: "home_pickup" | "service_center"; scheduledVisitDate?: Date | null }) =>
      customerServiceRequestsApi.acceptQuote(id, pickupTier, address, servicePreference, scheduledVisitDate),
    onSuccess: (data) => {
      const isServiceCenter = data.servicePreference === "service_center";
      toast({
        title: "Quote Accepted!",
        description: isServiceCenter
          ? "Please bring your TV to our service center."
          : "Your service request has been confirmed. We'll schedule the pickup soon.",
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept quote",
        variant: "destructive",
      });
    },
  });

  const declineQuoteMutation = useMutation({
    mutationFn: (id: string) => customerServiceRequestsApi.declineQuote(id),
    onSuccess: () => {
      toast({
        title: "Quote Declined",
        description: "You've declined this quote. Feel free to request a new one anytime.",
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to decline quote",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      return;
    }

    let mounted = true;
    let connectionTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      if (!mounted) return;

      try {
        const eventSource = new EventSource("/api/customer/events", { withCredentials: true });
        eventSourceRef.current = eventSource;
        sseConnectedRef.current = false;

        connectionTimeout = setTimeout(() => {
          if (!sseConnectedRef.current && mounted) {
            console.log("SSE connection timeout, falling back to polling");
            eventSource.close();
            setSseSupported(false);
          }
        }, 5000);

        eventSource.onopen = () => {
          if (mounted) {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            sseConnectedRef.current = true;
            setSseSupported(true);
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "connected") {
              return;
            }

            // Determine if this is a service request or product order update
            // Service requests have trackingStatus field, product orders have data.status field
            const isServiceRequest = data.type === "order_update" ||
              (data.type === "order_updated" && data.trackingStatus !== undefined);
            const isProductOrder = data.type === "order_created" ||
              data.type === "order_accepted" ||
              data.type === "order_declined" ||
              (data.type === "order_updated" && data.data?.orderNumber !== undefined);

            // Handle service request updates
            if (isServiceRequest) {
              queryClient.refetchQueries({ queryKey: ["/customer/service-requests"] });

              if (data.orderId === selectedOrderId) {
                queryClient.refetchQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
              }

              const statusMessage = data.trackingStatus === "Cancelled"
                ? "Request has been cancelled"
                : data.convertedJobId
                  ? `Converted to Job #${data.convertedJobId}`
                  : `Status updated to ${data.trackingStatus || data.status}`;

              toast({
                title: "Service Request Updated!",
                description: statusMessage,
              });
            }

            // Handle product order updates
            if (isProductOrder) {
              queryClient.refetchQueries({ queryKey: ["/customer/orders"] });

              if (data.data?.id === selectedOrderId) {
                queryClient.refetchQueries({ queryKey: ["/customer/orders/detail", selectedOrderId] });
              }

              let toastTitle = "Order Updated!";
              let statusMessage = "";

              if (data.type === "order_created") {
                toastTitle = "Order Placed!";
                statusMessage = `Order #${data.data?.orderNumber} has been submitted`;
              } else if (data.type === "order_accepted") {
                toastTitle = "Order Accepted!";
                statusMessage = `Your order #${data.data?.orderNumber} has been accepted`;
              } else if (data.type === "order_declined") {
                toastTitle = "Order Declined";
                statusMessage = data.data?.declineReason || "Your order has been declined";
              } else {
                statusMessage = `Order status: ${data.data?.status}`;
              }

              toast({
                title: toastTitle,
                description: statusMessage,
              });
            }
          } catch (e) {
            console.error("SSE message parse error:", e);
          }
        };

        eventSource.onerror = () => {
          if (connectionTimeout) clearTimeout(connectionTimeout);
          eventSource.close();
          sseConnectedRef.current = false;

          if (mounted) {
            console.log("SSE error, using polling mode");
            setSseSupported(false);
          }
        };
      } catch (e) {
        console.error("Failed to create EventSource:", e);
        setSseSupported(false);
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isAuthenticated, selectedOrderId, queryClient, toast]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowAuthModal(true);
    }
  }, [authLoading, isAuthenticated]);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handleBackToList = () => {
    setSelectedOrderId(null);
    setSelectedOrderType(null);
    window.history.replaceState({}, "", "/track-order");
  };

  const isLoading = serviceLoading || ordersLoading;
  const allServiceRequests = serviceRequests || [];
  const allProductOrders = productOrders || [];
  const totalOrders = allServiceRequests.length + allProductOrders.length;

  if (authLoading) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  // Mobile View
  if (isMobile && selectedOrderId && selectedOrderType === "service" && serviceRequestDetails) {
    return (
      <PublicLayout>
        <div className="min-h-screen bg-slate-50 pb-24 pt-4 px-4">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </Button>
            <h1 className="text-xl font-heading font-bold text-slate-800">Tracking Details</h1>
          </div>

          {/* Ticket Info Card */}
          <div className="bg-white rounded-2xl p-5 shadow-neumorph mb-6">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-lg font-bold text-slate-800">{serviceRequestDetails.brand} TV</h2>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                #{serviceRequestDetails.ticketNumber}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mb-4">{serviceRequestDetails.primaryIssue}</p>
            <div className="flex gap-2 text-xs">
              <div className="px-2 py-1 rounded bg-slate-100 text-slate-600">
                {format(new Date(serviceRequestDetails.createdAt), "MMM d, yyyy")}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <h3 className="text-lg font-bold text-slate-800 px-2 mb-2">Repair Progress</h3>
          <TrackingTimeline order={serviceRequestDetails} />
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2">Track Your Orders</h1>
              <p className="text-slate-300">
                View the status of your orders and repair requests in real-time.
              </p>
            </div>
            {isAuthenticated && customer && (
              <div className="hidden md:flex items-center gap-4">
                <div className="text-right">
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-slate-400">{customer.phone}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {!isAuthenticated ? (
          <div className="max-w-md mx-auto text-center py-12">
            <Package className="w-20 h-20 mx-auto mb-6 text-primary/30" />
            <h2 className="text-2xl font-bold mb-3">Sign In to Track Orders</h2>
            <p className="text-muted-foreground mb-6">
              Login or create an account to view and track your orders in real-time.
            </p>
            <Button size="lg" onClick={() => setShowAuthModal(true)} data-testid="button-open-auth">
              Sign In / Register
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : selectedOrderId && selectedOrderType ? (
          <div className="max-w-2xl mx-auto">
            <Button
              variant="ghost"
              className="mb-4"
              onClick={handleBackToList}
              data-testid="button-back-to-orders"
            >
              &larr; Back to Orders
            </Button>
            {selectedOrderType === "service" && serviceRequestDetails ? (
              serviceRequestDetails.isQuote && serviceRequestDetails.quoteStatus !== "Accepted" ? (
                <QuoteDetailView
                  order={serviceRequestDetails}
                  onAccept={(pickupTier, address, servicePreference, scheduledVisitDate) =>
                    acceptQuoteMutation.mutate({ id: serviceRequestDetails.id, pickupTier, address, servicePreference, scheduledVisitDate })
                  }
                  onDecline={() => declineQuoteMutation.mutate(serviceRequestDetails.id)}
                  isAccepting={acceptQuoteMutation.isPending}
                  isDeclining={declineQuoteMutation.isPending}
                  serviceCenterContact={serviceCenterContact}
                />
              ) : (
                <ServiceRequestTimelineWithWarranty
                  order={serviceRequestDetails}
                  events={(serviceRequestDetails as any).timeline || []}
                />
              )
            ) : selectedOrderType === "product" && productOrderDetails ? (
              <ProductOrderTimeline order={productOrderDetails as Order & { items?: any[] }} />
            ) : (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        ) : totalOrders > 0 ? (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Your Orders ({totalOrders})</h2>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({totalOrders})
                </TabsTrigger>
                <TabsTrigger value="products" data-testid="tab-products">
                  <ShoppingBag className="w-4 h-4 mr-1" /> Products ({allProductOrders.length})
                </TabsTrigger>
                <TabsTrigger value="repairs" data-testid="tab-repairs">
                  <Wrench className="w-4 h-4 mr-1" /> Repairs ({allServiceRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4 mt-4">
                {[...allProductOrders.map(o => ({ ...o, type: "product" as const })),
                ...allServiceRequests.map(o => ({ ...o, type: "service" as const }))]
                  .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                  .map(order =>
                    order.type === "product" ? (
                      <ProductOrderCard
                        key={`product-${order.id}`}
                        order={order as Order}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setSelectedOrderType("product");
                        }}
                      />
                    ) : (
                      <ServiceRequestCard
                        key={`service-${order.id}`}
                        order={order as ServiceRequest}
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setSelectedOrderType("service");
                        }}
                      />
                    )
                  )}
              </TabsContent>

              <TabsContent value="products" className="space-y-4 mt-4">
                {allProductOrders.length === 0 ? (
                  <Card className="text-center p-8">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No product orders yet</p>
                    <Button className="mt-4" onClick={() => setLocation("/shop")} data-testid="button-shop-now">
                      Shop Now
                    </Button>
                  </Card>
                ) : (
                  allProductOrders.map(order => (
                    <ProductOrderCard
                      key={order.id}
                      order={order}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setSelectedOrderType("product");
                      }}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="repairs" className="space-y-4 mt-4">
                {allServiceRequests.length === 0 ? (
                  <Card className="text-center p-8">
                    <Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No repair requests yet</p>
                    <Button className="mt-4" onClick={() => setLocation("/repair")} data-testid="button-submit-request">
                      Submit Repair Request
                    </Button>
                  </Card>
                ) : (
                  allServiceRequests.map(order => (
                    <ServiceRequestCard
                      key={order.id}
                      order={order}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setSelectedOrderType("service");
                      }}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <Card className="max-w-md mx-auto text-center p-8">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">No Orders Found</h2>
            <p className="text-muted-foreground mb-6">
              You haven't placed any orders or repair requests yet.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setLocation("/shop")} data-testid="button-shop-now">
                <ShoppingBag className="w-4 h-4 mr-2" /> Shop Now
              </Button>
              <Button variant="outline" onClick={() => setLocation("/repair")} data-testid="button-submit-request">
                <Wrench className="w-4 h-4 mr-2" /> Repair Request
              </Button>
            </div>
          </Card>
        )}
      </div>

      <CustomerAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        defaultTab="login"
        onSuccess={() => setShowAuthModal(false)}
        title="Track Your Order"
        description="Sign in or create an account to track your repair orders and view their status."
      />
    </PublicLayout>
  );
}
