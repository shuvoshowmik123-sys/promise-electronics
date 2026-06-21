import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/usePageTitle";
import { serviceCatalogApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PillButton, StatusChip } from "@/components/customer/mobile-kit";
import {
  Tv,
  Monitor,
  Smartphone,
  LayoutGrid,
  Cpu,
  Zap,
  Volume2,
  Gamepad2,
  Wrench,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Share2,
} from "lucide-react";
import React, { useState } from "react";
import { QueryErrorState } from "@/components/customer/QueryErrorState";

interface ServiceWithImages {
  id: string;
  name: string;
  description: string | null;
  category: string;
  minPrice: number | null;
  maxPrice: number | null;
  estimatedDays: string | null;
  icon: string | null;
  isActive: boolean | null;
  displayOrder: number | null;
  images?: string | null;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Tv: ({ className }) => <Tv className={cn("h-12 w-12", className)} />,
  Monitor: ({ className }) => <Monitor className={cn("h-12 w-12", className)} />,
  Smartphone: ({ className }) => <Smartphone className={cn("h-12 w-12", className)} />,
  LayoutGrid: ({ className }) => <LayoutGrid className={cn("h-12 w-12", className)} />,
  Cpu: ({ className }) => <Cpu className={cn("h-12 w-12", className)} />,
  Zap: ({ className }) => <Zap className={cn("h-12 w-12", className)} />,
  Volume2: ({ className }) => <Volume2 className={cn("h-12 w-12", className)} />,
  Gamepad2: ({ className }) => <Gamepad2 className={cn("h-12 w-12", className)} />,
};

function ServiceIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const IconComponent = iconMap[name || ""] || ((props: { className?: string }) => <Wrench className={cn("h-12 w-12", props.className)} />);
  return <IconComponent className={className} />;
}

function formatPrice(price: number | string | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return null;
  return `৳${numPrice.toLocaleString('en-BD')}`;
}

function parseImages(imagesJson: string | null): string[] {
  if (!imagesJson) return [];
  try {
    return JSON.parse(imagesJson);
  } catch {
    return [];
  }
}

function ImageGallery({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) {
    return null;
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-100">
        <img
          src={images[currentIndex]}
          alt={`Service image ${currentIndex + 1}`}
          className="w-full h-full object-cover"
          data-testid="img-service-main"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-colors"
              data-testid="button-prev-image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-colors"
              data-testid="button-next-image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${index === currentIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  data-testid={`button-dot-${index}`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${index === currentIndex ? 'border-primary' : 'border-transparent'
                }`}
              data-testid={`button-thumbnail-${index}`}
            >
              <img
                src={img}
                alt={`Thumbnail ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileImageGallery({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
      <img
        src={images[currentIndex]}
        alt={`Service image ${currentIndex + 1}`}
        className="w-full h-full object-cover"
        data-testid="mobile-service-image"
      />
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-2 w-2 rounded-full transition-colors ${index === currentIndex ? 'bg-blue-600' : 'bg-slate-300'}`}
              data-testid={`mobile-gallery-dot-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const features = [
  "Free diagnostic assessment",
  "90-day warranty on repairs",
  "Pickup & delivery available",
  "Genuine replacement parts",
];

export default function ServiceDetailsPage() {
  const [, params] = useRoute("/services/:id");
  const [, setLocation] = useLocation();
  const serviceId = params?.id;

  const { data: services = [], isLoading, isError, refetch } = useQuery<ServiceWithImages[]>({
    queryKey: ["serviceCatalog"],
    queryFn: serviceCatalogApi.getAll as () => Promise<ServiceWithImages[]>,
    staleTime: 5 * 60 * 1000,
  });

  const service = services.find((s) => s.id === serviceId);

  usePageTitle(service ? `${service.name} - Promise Electronics` : "Service Details");

  const images = service ? parseImages(service.images ?? null) : [];

  const handleGetQuote = () => {
    if (service) {
      setLocation(`/get-quote?service=${encodeURIComponent(service.name)}`);
    }
  };

  const handleShare = async () => {
    if (!service) return;
    const shareData = {
      title: service.name,
      text: `${service.name} - Promise Electronics`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // share cancelled or failed
      }
    }
  };

  if (isLoading) {
    return (
      <>
        <main className="md:hidden flex min-h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] flex-1 items-center justify-center p-4" data-testid="mobile-loading-state">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-sm border border-slate-100">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-full" />
          </div>
        </main>

        <main className="hidden md:block flex-1 py-12">
          <div className="container mx-auto px-4">
            <Skeleton className="h-8 w-32 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <Skeleton className="aspect-video rounded-xl" />
              <div className="space-y-6">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <main className="md:hidden flex min-h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] flex-1 items-center justify-center p-4" data-testid="mobile-error-state">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm border border-slate-100 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <Wrench className="h-8 w-8" />
            </div>
            <h1 className="text-xl font-bold mb-2">Failed to load service details</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Something went wrong while loading the service. Please try again.
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => refetch()} className="w-full rounded-full" data-testid="mobile-error-retry-button">
                Try Again
              </Button>
              <Button variant="outline" onClick={() => setLocation('/services')} className="w-full rounded-full" data-testid="mobile-error-back-button">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Services
              </Button>
            </div>
          </div>
        </main>

        <main className="hidden md:block flex-1 py-12">
          <div className="container mx-auto px-4">
            <QueryErrorState
              message="Failed to load service details"
              onRetry={() => refetch()}
              actionButton={<Button variant="outline" onClick={() => setLocation('/services')}><ArrowLeft className="mr-2 h-4 w-4" />Back to Services</Button>}
            />
          </div>
        </main>
      </>
    );
  }

  if (!service) {
    return (
      <>
        <main className="md:hidden flex min-h-[calc(100dvh-8rem-env(safe-area-inset-bottom))] flex-1 items-center justify-center p-4" data-testid="mobile-not-found-state">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm border border-slate-100 text-center">
            <Wrench className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Service Not Found</h1>
            <p className="text-sm text-muted-foreground mb-6">
              The service you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation('/services')} className="w-full rounded-full" data-testid="mobile-not-found-back-button">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>
          </div>
        </main>

        <main className="hidden md:block flex-1 py-12">
          <div className="container mx-auto px-4 text-center">
            <Wrench className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Service Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The service you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation('/services')} data-testid="button-back-to-services">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="md:hidden flex-1 bg-slate-50" data-testid="mobile-service-details">
        <div className="pb-24">
          <div className="sticky top-0 z-20 flex items-center justify-between bg-white/85 px-4 py-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setLocation('/services')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
              data-testid="mobile-back-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
              data-testid="mobile-share-button"
            >
              <Share2 className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 pt-3 pb-6 space-y-5">
            {images.length > 0 ? (
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm" data-testid="mobile-gallery-card">
                <MobileImageGallery images={images} />
              </div>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-3xl bg-blue-50 text-blue-600" data-testid="mobile-icon-placeholder">
                <ServiceIcon name={service.icon} className="h-24 w-24" />
              </div>
            )}

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900" data-testid="mobile-service-name">
                {service.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {service.category && (
                  <Badge variant="outline" data-testid="mobile-service-category">
                    {service.category}
                  </Badge>
                )}
                {service.estimatedDays && (
                  <StatusChip tone="neutral" className="text-xs" data-testid="mobile-service-estimated-days">
                    <Clock className="h-3 w-3" />
                    {service.estimatedDays}
                  </StatusChip>
                )}
              </div>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-blue-50 to-white p-6 border border-blue-100">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Estimated Price Range</p>
              <p className="text-3xl font-bold text-blue-700" data-testid="mobile-service-price">
                {formatPrice(service.minPrice) && formatPrice(service.maxPrice)
                  ? `${formatPrice(service.minPrice)} - ${formatPrice(service.maxPrice)}`
                  : formatPrice(service.minPrice) || formatPrice(service.maxPrice) || 'Contact for pricing'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Final price will be determined after inspection of your device
              </p>
            </div>

            <p className="text-base text-slate-600 leading-relaxed" data-testid="mobile-service-description">
              {service.description}
            </p>

            <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 space-y-3">
              {features.map((feature, index) => (
                <div key={feature} className="flex items-center gap-3" data-testid={`mobile-feature-${index}`}>
                  <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{feature}</span>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3">How It Works</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { step: "1", title: "Request Quote", desc: "Tell us about your device issue" },
                  { step: "2", title: "Get Quote", desc: "We'll send you an estimate" },
                  { step: "3", title: "Schedule", desc: "Pick a convenient time" },
                  { step: "4", title: "Get Repaired", desc: "We fix & deliver back" },
                ].map((item) => (
                  <div key={item.step} className="rounded-2xl bg-slate-50 p-3">
                    <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {item.step}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-100 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <PillButton onClick={handleGetQuote} data-testid="mobile-get-quote-button">
            Get a Quote
          </PillButton>
        </div>
      </main>

      <main className="hidden md:block flex-1">
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/services')}
              className="mb-6"
              data-testid="button-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              <div>
                {images.length > 0 ? (
                  <ImageGallery images={images} />
                ) : (
                  <div className="aspect-video w-full rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <div className="text-primary">
                      <ServiceIcon name={service.icon} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <ServiceIcon name={service.icon} />
                    </div>
                    {service.estimatedDays && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {service.estimatedDays}
                      </Badge>
                    )}
                  </div>
                  <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2" data-testid="text-service-name">
                    {service.name}
                  </h1>
                  {service.category && (
                    <Badge variant="outline" className="mb-4">{service.category}</Badge>
                  )}
                </div>

                <p className="text-lg text-muted-foreground leading-relaxed" data-testid="text-service-description">
                  {service.description}
                </p>

                <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 rounded-xl">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Estimated Price Range</p>
                  <p className="text-3xl md:text-4xl font-bold text-primary" data-testid="text-service-price">
                    {formatPrice(service.minPrice) && formatPrice(service.maxPrice)
                      ? `${formatPrice(service.minPrice)} - ${formatPrice(service.maxPrice)}`
                      : formatPrice(service.minPrice) || formatPrice(service.maxPrice) || 'Contact for pricing'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Final price will be determined after inspection of your device
                  </p>
                </div>

                <div className="space-y-3">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Button
                  size="lg"
                  className="w-full md:w-auto"
                  onClick={handleGetQuote}
                  data-testid="button-get-quote"
                >
                  Get a Quote for This Service
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-primary/5 py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground mb-8">
                Our simple 4-step process ensures a hassle-free repair experience
              </p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm mb-3">1</div>
                  <h3 className="font-semibold mb-1">Request Quote</h3>
                  <p className="text-sm text-muted-foreground">Tell us about your device issue</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm mb-3">2</div>
                  <h3 className="font-semibold mb-1">Get Quote</h3>
                  <p className="text-sm text-muted-foreground">We'll send you an estimate</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm mb-3">3</div>
                  <h3 className="font-semibold mb-1">Schedule</h3>
                  <p className="text-sm text-muted-foreground">Pick a convenient time</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm mb-3">4</div>
                  <h3 className="font-semibold mb-1">Get Repaired</h3>
                  <p className="text-sm text-muted-foreground">We fix & deliver back</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
