import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import { serviceCatalogApi, settingsApi } from "@/lib/api";
import { Tv, Monitor, Smartphone, LayoutGrid, Cpu, Zap, Volume2, Gamepad2, Wrench, Clock, ArrowRight, Search, ChevronLeft, ChevronRight, X, Filter, Eye, CheckCircle } from "lucide-react";
import type { ServiceCatalog, Setting } from "@shared/schema";

const iconMap: Record<string, React.ReactNode> = {
  Tv: <Tv className="h-8 w-8" />,
  Monitor: <Monitor className="h-8 w-8" />,
  Smartphone: <Smartphone className="h-8 w-8" />,
  LayoutGrid: <LayoutGrid className="h-8 w-8" />,
  Cpu: <Cpu className="h-8 w-8" />,
  Zap: <Zap className="h-8 w-8" />,
  Volume2: <Volume2 className="h-8 w-8" />,
  Gamepad2: <Gamepad2 className="h-8 w-8" />,
};

function formatPrice(price: number | string | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice)) return null;
  return `৳${numPrice.toLocaleString('en-BD')}`;
}

function ServiceCard({ service, onGetQuote, onViewDetails }: { service: ServiceCatalog; onGetQuote: () => void; onViewDetails: () => void }) {
  const icon = iconMap[service.icon || ""] || <Wrench className="h-6 w-6" />;
  
  return (
    <Card className="group relative overflow-hidden bg-slate-100 shadow-neumorph hover:shadow-neumorph-lg transition-all duration-300 border-none flex flex-col h-full rounded-2xl" data-testid={`card-service-${service.id}`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-12 translate-x-12 group-hover:scale-150 transition-transform duration-500" />
      
      <CardHeader className="pb-2 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 rounded-xl bg-white shadow-neumorph-inset flex items-center justify-center text-primary group-hover:shadow-neumorph transition-shadow">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold leading-tight line-clamp-2">{service.name}</CardTitle>
          </div>
        </div>
        {service.description && (
          <CardDescription className="text-xs line-clamp-2 text-muted-foreground/80">
            {service.description}
          </CardDescription>
        )}
      </CardHeader>
      
      <CardContent className="flex-grow pt-2 pb-3">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-100/50 p-3 rounded-xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Price Range</span>
            {service.estimatedDays && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-200 bg-amber-50 text-amber-700">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                {service.estimatedDays}
              </Badge>
            )}
          </div>
          <p className="text-lg font-bold text-emerald-700">
            {formatPrice(service.minPrice) && formatPrice(service.maxPrice) 
              ? `${formatPrice(service.minPrice)} - ${formatPrice(service.maxPrice)}`
              : formatPrice(service.minPrice) || formatPrice(service.maxPrice) || 'Contact us'}
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="pt-0 pb-4 gap-2">
        <Button 
          variant="ghost"
          size="sm"
          className="flex-1 h-9 text-xs hover:bg-slate-100"
          onClick={onViewDetails}
          disabled={!service.id}
          data-testid={`button-view-details-${service.id}`}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Details
        </Button>
        <Button 
          size="sm"
          className="flex-1 h-9 text-xs bg-primary hover:bg-primary/90 shadow-sm"
          onClick={onGetQuote}
          data-testid={`button-get-quote-${service.id}`}
        >
          Get Quote
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function ServiceCardSkeleton() {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <Skeleton className="w-14 h-14 rounded-xl" />
          <Skeleton className="w-16 h-5 rounded-full" />
        </div>
        <Skeleton className="h-6 w-3/4 mt-4" />
        <Skeleton className="h-4 w-full mt-2" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="flex-grow">
        <Skeleton className="h-24 w-full rounded-lg" />
      </CardContent>
      <CardFooter className="pt-4">
        <Skeleton className="h-10 w-full" />
      </CardFooter>
    </Card>
  );
}

const ITEMS_PER_PAGE = 8;

export default function ServicesPage() {
  usePageTitle("Our Services - TV Repair & Electronics");
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedService, setSelectedService] = useState<ServiceCatalog | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: services = [], isLoading, error } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: serviceCatalogApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 30000,
  });

  // Get service filter categories from settings (syncs with Admin Settings → Service Filter)
  const categories = useMemo(() => {
    const serviceFilterSetting = settings.find((s: Setting) => s.key === "service_filter_categories");
    if (serviceFilterSetting?.value) {
      try {
        const parsed = JSON.parse(serviceFilterSetting.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback to defaults
      }
    }
    return ["LED TV Repair", "LCD TV Repair", "Smart TV Repair", "Monitor Repair", "Projector Repair"];
  }, [settings]);
  
  const filteredServices = useMemo(() => {
    let result = [...services];
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(service => 
        service.name.toLowerCase().includes(query) ||
        (service.description?.toLowerCase().includes(query))
      );
    }
    
    if (selectedCategory !== "all") {
      result = result.filter(service => service.category === selectedCategory);
    }
    
    result.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    
    return result;
  }, [services, searchQuery, selectedCategory]);
  
  const totalPages = Math.ceil(filteredServices.length / ITEMS_PER_PAGE);
  const paginatedServices = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredServices.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredServices, currentPage]);
  
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };
  
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };
  
  const handleGetQuote = (service: ServiceCatalog) => {
    setLocation(`/get-quote?service=${encodeURIComponent(service.name)}`);
  };
  
  const handleViewDetails = (service: ServiceCatalog) => {
    setSelectedService(service);
    setIsModalOpen(true);
  };
  
  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || "Other Services";
    // Only include services whose category is in the service_filter_categories
    if (categories.includes(category)) {
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(service);
    }
    return acc;
  }, {} as Record<string, ServiceCatalog[]>);
  
  const hasActiveFilters = searchQuery.trim() !== "" || selectedCategory !== "all";
  const showGroupedView = !hasActiveFilters;
  const showPagination = hasActiveFilters && totalPages > 1;
  
  return (
    <PublicLayout>
      <main className="flex-1">
        {/* Neumorphic Hero Section */}
        <section className="bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-12 md:py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <Badge className="mb-4 shadow-neumorph-sm bg-white border-none" variant="secondary">Professional Repair Services</Badge>
              <h1 className="text-3xl md:text-5xl font-heading font-bold mb-4" data-testid="text-services-title">
                Expert TV & Electronics <span className="text-primary">Repair Services</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                Get transparent pricing with no hidden fees. Request a free quote and we'll inspect your device 
                before providing a final price.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Free Pickup Available
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  90-Day Warranty
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  Expert Technicians
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Neumorphic Services Section */}
        <section className="py-12 md:py-16 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
          <div className="container mx-auto px-4">
            <div className="mb-8 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Input
                    placeholder="Search services..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10 pr-10 rounded-full bg-white shadow-neumorph-inset border-none focus-visible:ring-primary/30"
                    data-testid="input-search-services"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => handleSearchChange("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Filter className="h-4 w-4 text-muted-foreground mr-1" />
                  <Button
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleCategoryChange("all")}
                    data-testid="filter-category-all"
                  >
                    All Services
                  </Button>
                  {categories.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleCategoryChange(category)}
                      data-testid={`filter-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              )}
              
              {hasActiveFilters && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing {filteredServices.length} of {services.length} services</span>
                  {hasActiveFilters && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory("all");
                        setCurrentPage(1);
                      }}
                      className="text-primary"
                      data-testid="button-clear-filters"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </div>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ServiceCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-destructive mb-4">Failed to load services. Please try again.</p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            ) : filteredServices.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  {hasActiveFilters ? "No services match your search criteria." : "No services available at the moment."}
                </p>
                {hasActiveFilters && (
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedCategory("all");
                      setCurrentPage(1);
                    }}
                    data-testid="button-clear-filters-empty"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : showGroupedView ? (
              <div className="space-y-12">
                {Object.entries(groupedServices).map(([category, categoryServices]) => (
                  <div key={category}>
                    <div className="flex items-center gap-4 mb-6">
                      <h2 className="text-2xl font-bold" data-testid={`text-category-${category.toLowerCase().replace(/\s+/g, '-')}`}>
                        {category}
                      </h2>
                      <div className="flex-1 h-px bg-border"></div>
                      <Badge variant="outline">{categoryServices.length} services</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {categoryServices.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map((service) => (
                        <ServiceCard 
                          key={service.id} 
                          service={service} 
                          onGetQuote={() => handleGetQuote(service)}
                          onViewDetails={() => handleViewDetails(service)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {paginatedServices.map((service) => (
                    <ServiceCard 
                      key={service.id} 
                      service={service} 
                      onGetQuote={() => handleGetQuote(service)}
                      onViewDetails={() => handleViewDetails(service)}
                    />
                  ))}
                </div>
                
                {showPagination && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(page)}
                          data-testid={`button-page-${page}`}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        
        <section className="bg-primary/5 py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">How Our Quote Process Works</h2>
              <p className="text-muted-foreground mb-8">
                Get a hassle-free repair experience with our transparent pricing process
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
                <div className="bg-white rounded-lg md:rounded-xl p-3 md:p-6 shadow-sm">
                  <div className="w-8 h-8 md:w-10 md:h-10 text-sm md:text-base rounded-full bg-primary text-white flex items-center justify-center font-bold mx-auto mb-2 md:mb-4">1</div>
                  <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2">Request Quote</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">Tell us about your device and the issue you're facing</p>
                </div>
                <div className="bg-white rounded-lg md:rounded-xl p-3 md:p-6 shadow-sm">
                  <div className="w-8 h-8 md:w-10 md:h-10 text-sm md:text-base rounded-full bg-primary text-white flex items-center justify-center font-bold mx-auto mb-2 md:mb-4">2</div>
                  <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2">Get Your Quote</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">We'll review and send you a price estimate</p>
                </div>
                <div className="bg-white rounded-lg md:rounded-xl p-3 md:p-6 shadow-sm">
                  <div className="w-8 h-8 md:w-10 md:h-10 text-sm md:text-base rounded-full bg-primary text-white flex items-center justify-center font-bold mx-auto mb-2 md:mb-4">3</div>
                  <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2">Accept & Schedule</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">Choose pickup option and schedule your service</p>
                </div>
                <div className="bg-white rounded-lg md:rounded-xl p-3 md:p-6 shadow-sm">
                  <div className="w-8 h-8 md:w-10 md:h-10 text-sm md:text-base rounded-full bg-primary text-white flex items-center justify-center font-bold mx-auto mb-2 md:mb-4">4</div>
                  <h3 className="font-semibold text-sm md:text-base mb-1 md:mb-2">Get It Repaired</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">We fix your device and deliver it back to you</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        <section className="py-12 md:py-16 bg-primary text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">Not Sure Which Service You Need?</h2>
            <p className="text-primary-foreground/80 mb-6 max-w-2xl mx-auto">
              No problem! Submit a general quote request and our experts will diagnose your device 
              and recommend the best solution.
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              onClick={() => setLocation('/get-quote')}
              data-testid="button-general-quote"
            >
              Get a Free Quote
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          {selectedService && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-md">
                    {iconMap[selectedService.icon || ""] || <Wrench className="h-6 w-6" />}
                  </div>
                  <div>
                    <DialogTitle className="text-xl">{selectedService.name}</DialogTitle>
                    {selectedService.category && (
                      <Badge variant="secondary" className="mt-1 text-xs">{selectedService.category}</Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>
              
              <div className="space-y-4">
                {selectedService.description && (
                  <DialogDescription className="text-sm text-foreground/80">
                    {selectedService.description}
                  </DialogDescription>
                )}
                
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-100/50 p-4 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Price Range</span>
                    {selectedService.estimatedDays && (
                      <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-700">
                        <Clock className="h-3 w-3 mr-1" />
                        {selectedService.estimatedDays}
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {formatPrice(selectedService.minPrice) && formatPrice(selectedService.maxPrice) 
                      ? `${formatPrice(selectedService.minPrice)} - ${formatPrice(selectedService.maxPrice)}`
                      : formatPrice(selectedService.minPrice) || formatPrice(selectedService.maxPrice) || 'Contact for pricing'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Final price after inspection</p>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">What's Included:</h4>
                  <ul className="space-y-1.5">
                    {(() => {
                      let features: string[] = [];
                      if (selectedService.features) {
                        try {
                          features = JSON.parse(selectedService.features);
                        } catch {
                          features = [];
                        }
                      }
                      if (features.length === 0) {
                        features = [
                          "Free diagnosis and inspection",
                          "90-day service warranty",
                          "Free pickup & delivery in Dhaka",
                          "Expert certified technicians"
                        ];
                      }
                      return features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ));
                    })()}
                  </ul>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setIsModalOpen(false)}
                    data-testid="button-modal-close"
                  >
                    Close
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={() => {
                      setIsModalOpen(false);
                      setLocation(`/get-quote?service=${encodeURIComponent(selectedService.name)}`);
                    }}
                    data-testid="button-modal-get-quote"
                  >
                    Get a Quote
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
