import { useState } from "react";
import { Link, useLocation } from "wouter";
import { navItems, images } from "@/lib/mock-data";
import { Search, ShoppingCart, User, Menu, LogOut, UserCircle, Globe, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCart } from "@/contexts/CartContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { ProfileCompletionModal } from "@/components/auth/ProfileCompletionModal";
import { MobileBottomNav } from "./MobileBottomNav";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [profileSkipped, setProfileSkipped] = useState(() => {
    return sessionStorage.getItem('profileCompletionSkipped') === 'true';
  });
  const { customer, isAuthenticated, logout, needsProfileCompletion, checkAuth } = useCustomerAuth();
  const { itemCount } = useCart();


  const handleSkipProfile = () => {
    sessionStorage.setItem('profileCompletionSkipped', 'true');
    setProfileSkipped(true);
  };

  const showProfileModal = isAuthenticated && needsProfileCompletion && !profileSkipped;

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setLocation(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setShowMobileSearch(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const getSettingValue = (key: string, defaultValue: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const supportPhone = getSettingValue("support_phone", "+880 1700-000000");
  const businessHours = getSettingValue("business_hours", "9:00 AM - 9:00 PM");
  const siteName = getSettingValue("site_name", "Promise Electronics");
  const logoUrl = getSettingValue("logo_url", "");

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground py-2 px-4 text-sm hidden sm:block">
        <div className="container mx-auto flex justify-between items-center">
          <p>📞 Hotline: {supportPhone} | 🕒 {businessHours}</p>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <div id="google_translate_element"></div>
          </div>
        </div>
      </div>

      {/* Main Header - Neumorphic */}
      <header className="bg-slate-100 sticky top-0 z-50 shadow-neumorph-sm border-b border-slate-200/50 pt-[env(safe-area-inset-top)]">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4 sm:gap-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 text-xl sm:text-2xl font-heading font-bold text-primary tracking-tight flex-shrink-0" data-testid="link-logo">
              <img src={logoUrl || images.logo} alt="Logo" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
              <span className="hidden sm:inline">
                PROMISE<span className="text-foreground">ELECTRONICS</span>
              </span>
            </Link>

            {/* Search Bar (Desktop) - Neumorphic */}
            <div className="hidden md:flex flex-1 max-w-2xl relative">
              <Input
                placeholder="Search products, parts, or services..."
                className="w-full pl-4 pr-12 rounded-full bg-white border-none shadow-neumorph-inset focus-visible:ring-primary/30 focus-visible:ring-2"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                data-testid="input-search"
              />
              <Button
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full shadow-neumorph hover:shadow-neumorph-inset transition-shadow"
                onClick={handleSearch}
                data-testid="button-search"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Actions - Neumorphic */}
            <div className="hidden md:flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative rounded-full shadow-neumorph hover:shadow-neumorph-inset transition-shadow bg-slate-100" onClick={() => setLocation("/cart")} data-testid="button-cart-desktop">
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center shadow-sm" data-testid="text-cart-count">{itemCount}</span>
                )}
              </Button>

              {isAuthenticated && customer ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 rounded-full shadow-neumorph hover:shadow-neumorph-inset transition-shadow border-none bg-slate-100" data-testid="button-user-menu">
                      <UserCircle className="h-5 w-5" />
                      <span className="max-w-[100px] truncate">{customer.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setLocation("/my-profile")} data-testid="menu-my-profile">
                      <User className="mr-2 h-4 w-4" />
                      My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/track-order")} data-testid="menu-my-orders">
                      <Search className="mr-2 h-4 w-4" />
                      My Orders
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/my-warranties")} data-testid="menu-my-warranties">
                      <Shield className="mr-2 h-4 w-4" />
                      My Warranties
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600" data-testid="menu-logout">
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={() => setShowAuthModal(true)} className="rounded-full shadow-neumorph hover:shadow-neumorph-inset transition-shadow" data-testid="button-signin">
                  <User className="mr-2 h-4 w-4" /> Sign In
                </Button>
              )}
            </div>

            {/* Mobile Actions & Menu */}
            <div className="flex items-center gap-2 md:hidden">
              <Button variant="ghost" size="icon" onClick={() => setShowMobileSearch(!showMobileSearch)} data-testid="button-search-mobile">
                <Search className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="relative" onClick={() => setLocation("/cart")} data-testid="button-cart-mobile">
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center" data-testid="text-cart-count-mobile">{itemCount}</span>
                )}
              </Button>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-menu"><Menu className="h-6 w-6" /></Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <div className="flex flex-col h-full">
                    <div className="mb-4">
                      <h2 className="text-xl font-heading font-bold text-primary">PROMISE<span className="text-foreground">ELECTRONICS</span></h2>
                    </div>

                    {!isAuthenticated && (
                      <Button className="w-full mb-4" onClick={() => setShowAuthModal(true)} data-testid="button-mobile-signin">
                        Sign In / Register
                      </Button>
                    )}

                    {isAuthenticated && customer && (
                      <div className="mb-4 p-4 bg-primary/5 rounded-lg">
                        <p className="font-medium">{customer.name}</p>
                        <p className="text-sm text-muted-foreground">{customer.phone}</p>
                      </div>
                    )}

                    <nav className="flex flex-col gap-4">
                      {navItems.map((item, index) => (
                        <div key={item.href}>
                          <Link href={item.href} className={`text-lg font-medium py-2 border-b border-slate-100 block ${location === item.href ? 'text-primary' : 'text-foreground'}`} data-testid={`link-nav-${item.href.replace(/\//g, '')}`}>
                            {item.label}
                          </Link>
                          {index === 0 && isAuthenticated && (
                            <Link href="/my-profile" className={`text-lg font-medium py-2 border-b border-slate-100 block mt-4 ${location === '/my-profile' ? 'text-primary' : 'text-foreground'}`} data-testid="link-nav-my-profile">
                              My Profile
                            </Link>
                          )}
                        </div>
                      ))}
                    </nav>

                    {isAuthenticated && (
                      <div className="mt-auto">
                        <Button variant="outline" className="w-full" onClick={handleLogout} data-testid="button-mobile-logout">
                          <LogOut className="mr-2 h-4 w-4" />
                          Logout
                        </Button>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Secondary Nav - Neumorphic Pills */}
          <nav className="hidden md:flex gap-4 mt-4 text-sm font-medium">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-full transition-all duration-200 ${location === item.href ? 'text-primary bg-white shadow-neumorph-inset font-semibold' : 'text-muted-foreground hover:text-primary hover:bg-white/50'}`}
                data-testid={`link-secondary-nav-${item.href.replace(/\//g, '')}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile Search Bar - Neumorphic */}
      {showMobileSearch && (
        <div className="md:hidden bg-slate-100 border-b border-slate-200/50 px-4 py-3 shadow-neumorph-sm">
          <div className="flex gap-2">
            <Input
              placeholder="Search products..."
              className="flex-1 bg-white shadow-neumorph-inset border-none rounded-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
              data-testid="input-search-mobile"
            />
            <Button onClick={handleSearch} className="rounded-full shadow-neumorph" data-testid="button-search-mobile-submit">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1 pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Neumorphic Footer */}
      <footer className="hidden md:block bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 text-slate-300 py-12 relative overflow-hidden">
        <div className="container mx-auto px-4 grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white text-xl font-heading font-bold mb-4">PROMISE ELECTRONICS</h3>
            <p className="text-sm leading-relaxed">
              Your trusted partner for electronics sales and professional repair services in Bangladesh.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/about" className="hover:text-white">About Us</a></li>
              <li><a href="/terms-and-conditions" className="hover:text-white">Terms & Conditions</a></li>
              <li><a href="/privacy-policy" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="/warranty-policy" className="hover:text-white">Service Warranty Policy</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Services</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" className="hover:text-white">TV Repair</a></li>
              <li><a href="#" className="hover:text-white">Corporate Maintenance</a></li>
              <li><a href="/shop" className="hover:text-white">Parts Replacement</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>Dhaka, Bangladesh</li>
              <li>support@promise-electronics.com</li>
              <li>{supportPhone}</li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-12 pt-8 border-t border-slate-800 text-center text-xs">
          © 2025 Promise Electronics. All rights reserved.
        </div>
      </footer>

      <CustomerAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        defaultTab="login"
      />

      <ProfileCompletionModal
        open={showProfileModal}
        onComplete={() => {
          sessionStorage.removeItem('profileCompletionSkipped');
          setProfileSkipped(false);
          checkAuth();
        }}
        onSkip={handleSkipProfile}
      />
    </div>
  );
}
