import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/usePageTitle";
import { serviceCatalogApi } from "@/lib/api";
import { Tv, Monitor, Smartphone, LayoutGrid, Cpu, Zap, Volume2, Gamepad2, Wrench, Clock, ArrowRight, ArrowLeft, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface ServiceWithImages {
  id: string;
  name: string;
  description: string | null;
  category: string;
  minPrice: string | null;
  maxPrice: string | null;
  estimatedDays: string | null;
  icon: string | null;
  isActive: boolean | null;
  displayOrder: number | null;
  images?: string | null;
}

const iconMap: Record<string, React.ReactNode> = {
  Tv: <Tv className="h-12 w-12" />,
  Monitor: <Monitor className="h-12 w-12" />,
  Smartphone: <Smartphone className="h-12 w-12" />,
  LayoutGrid: <LayoutGrid className="h-12 w-12" />,
  Cpu: <Cpu className="h-12 w-12" />,
  Zap: <Zap className="h-12 w-12" />,
  Volume2: <Volume2 className="h-12 w-12" />,
  Gamepad2: <Gamepad2 className="h-12 w-12" />,
};

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
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentIndex ? 'bg-white' : 'bg-white/50'
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
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                index === currentIndex ? 'border-primary' : 'border-transparent'
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

export default function ServiceDetailsPage() {
  const [, params] = useRoute("/services/:id");
  const [, setLocation] = useLocation();
  const serviceId = params?.id;
  
  const { data: services = [], isLoading, error } = useQuery<ServiceWithImages[]>({
    queryKey: ["serviceCatalog"],
    queryFn: serviceCatalogApi.getAll as () => Promise<ServiceWithImages[]>,
    staleTime: 5 * 60 * 1000,
  });
  
  const service = services.find((s) => s.id === serviceId);
  
  usePageTitle(service ? `${service.name} - Promise Electronics` : "Service Details");
  
  const icon = service ? (iconMap[service.icon || ""] || <Wrench className="h-12 w-12" />) : null;
  const images = service ? parseImages(service.images ?? null) : [];
  
  const handleGetQuote = () => {
    if (service) {
      setLocation(`/get-quote?service=${encodeURIComponent(service.name)}`);
    }
  };
  
  if (isLoading) {
    return (
      <PublicLayout>
        <main className="flex-1 py-12">
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
      </PublicLayout>
    );
  }
  
  if (error) {
    return (
      <PublicLayout>
        <main className="flex-1 py-12">
          <div className="container mx-auto px-4 text-center">
            <Wrench className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Something Went Wrong</h1>
            <p className="text-muted-foreground mb-6">
              We couldn't load the service details. Please try again later.
            </p>
            <Button onClick={() => setLocation('/services')} data-testid="button-error-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Services
            </Button>
          </div>
        </main>
      </PublicLayout>
    );
  }
  
  if (!service) {
    return (
      <PublicLayout>
        <main className="flex-1 py-12">
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
      </PublicLayout>
    );
  }
  
  return (
    <PublicLayout>
      <main className="flex-1">
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
                    <div className="text-primary">{icon}</div>
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      {icon}
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
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Free diagnostic assessment</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>90-day warranty on repairs</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Pickup & delivery available</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Genuine replacement parts</span>
                  </div>
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
    </PublicLayout>
  );
}
