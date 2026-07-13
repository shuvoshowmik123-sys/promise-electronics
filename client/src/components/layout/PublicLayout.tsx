import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { navItems, images } from "@/lib/app-config";
import { CustomerLanguageProvider, useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { Search, ShoppingCart, User, LogOut, UserCircle, Globe, Shield, Facebook, Twitter, Instagram, Linkedin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { publicSettingsApi } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCart } from "@/contexts/CartContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { ProfileCompletionModal } from "@/components/auth/ProfileCompletionModal";
import { MobileBottomNav } from "./MobileBottomNav";
import { NetworkOfflineBanner } from "@/components/customer/NetworkOfflineBanner";
import { ScrollProgressBar } from "@/components/customer/ScrollProgressBar";

/** Matches homepage section motion: soft y + opacity, easeOut ~0.55–0.65s */
const HEADER_EASE = [0.22, 1, 0.36, 1] as const;

function DesktopLangToggle() {
  const { language, toggleLanguage } = useCustomerLanguage();
  return (
    <button
      onClick={toggleLanguage}
      className="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-blue-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      aria-label={language === "en" ? "Switch to Bangla" : "Switch to English"}
      data-testid="button-lang-toggle-desktop"
    >
      <Globe className="h-3.5 w-3.5 text-primary" />
      {language === "en" ? "বাংলা" : "English"}
    </button>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const isHeaderCompactRef = useRef(false);
  const [profileSkipped, setProfileSkipped] = useState(() => {
    return sessionStorage.getItem('profileCompletionSkipped') === 'true';
  });
  const { customer, isAuthenticated, logout, needsProfileCompletion, checkAuth } = useCustomerAuth();
  const { itemCount } = useCart();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let animationFrame = 0;
    const updateHeader = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        // Hysteresis: enter compact after 112px, leave earlier (56px) so return-to-top
        // animation can start while the user is still scrolling up — not only at the top edge.
        const nextCompact = isHeaderCompactRef.current ? window.scrollY > 56 : window.scrollY > 112;
        if (nextCompact !== isHeaderCompactRef.current) {
          isHeaderCompactRef.current = nextCompact;
          setIsHeaderCompact(nextCompact);
        }
      });
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateHeader);
    };
  }, []);


  const handleSkipProfile = () => {
    sessionStorage.setItem('profileCompletionSkipped', 'true');
    setProfileSkipped(true);
  };

  const showProfileModal = isAuthenticated && needsProfileCompletion && !profileSkipped;

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setLocation(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const { data: settings = [] } = useQuery({
    queryKey: ["public-settings"],
    queryFn: publicSettingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const getSettingValue = (key: string, defaultValue: string) => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const supportPhone = getSettingValue("support_phone", "+880 1700-000000");
  const supportPhoneHref = supportPhone.replace(/[^\d+]/g, "");
  const businessHours = getSettingValue("business_hours", "9:00 AM - 9:00 PM");
  const siteName = getSettingValue("site_name", "Promise Electronics");
  const logoUrl = getSettingValue("logo_url", "");
  const currentPath = location.split("?")[0].split("#")[0];

  const isImmersiveMobileRoute = true;
  const hideBottomNavRoutes = ["/repair", "/get-quote"];
  const hideBottomNav = hideBottomNavRoutes.includes(currentPath);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <CustomerLanguageProvider>
    <div className="customer-portal-shell min-h-screen flex flex-col bg-slate-50">
      <ScrollToTop />
      <ScrollProgressBar />
      <NetworkOfflineBanner />
      <header className="pointer-events-none sticky top-0 z-50 hidden h-24 md:block" aria-label="Customer site header">
        {/* Stable outer footprint (h-24). Capsule motion matches homepage fade/y language. */}
        <div className="mx-auto w-full max-w-[1600px] px-6 pt-4 lg:px-8">
          <motion.div
            data-compact={isHeaderCompact ? "true" : "false"}
            className="desktop-header-capsule pointer-events-auto relative grid h-[76px] w-full origin-top grid-cols-[auto_auto_minmax(9rem,1fr)_auto] items-center gap-3 rounded-3xl border border-slate-950/18 px-4 backdrop-blur-2xl will-change-transform lg:gap-4 lg:px-5 xl:gap-6"
            // First paint: soft drop-in (same family as hero copy opacity+y)
            initial={prefersReducedMotion ? false : { opacity: 0, y: -14, scale: 0.98 }}
            // Close (scroll down) vs open/return (scroll top) — slight, polished, not bouncy
            animate={
              isHeaderCompact
                ? {
                    opacity: 1,
                    y: -3,
                    scale: 0.985,
                    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.1), 0 14px 32px -18px rgba(15, 23, 42, 0.28)",
                    backgroundColor: "rgba(255, 255, 255, 0.94)",
                    borderColor: "rgba(15, 23, 42, 0.16)",
                  }
                : {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.12), 0 20px 48px -22px rgba(15, 23, 42, 0.32)",
                    backgroundColor: "rgba(255, 255, 255, 0.9)",
                    borderColor: "rgba(15, 23, 42, 0.2)",
                  }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    duration: isHeaderCompact ? 0.48 : 0.58,
                    ease: HEADER_EASE,
                  }
            }
          >
            <Link href="/home" className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" data-testid="link-logo">
              <motion.img
                src={logoUrl || images.logo}
                alt={`${siteName} logo`}
                className="h-9 w-9 origin-left object-contain"
                animate={{ scale: isHeaderCompact ? 0.89 : 1 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { duration: isHeaderCompact ? 0.48 : 0.58, ease: HEADER_EASE }
                }
              />
              <span className="font-heading text-base font-black tracking-tight text-primary lg:text-lg">
                PROMISE<span className="hidden text-slate-950 min-[1180px]:inline">ELECTRONICS</span>
              </span>
            </Link>

            <nav className="flex items-center gap-0.5" aria-label="Primary navigation">
              {navItems.map((item) => {
                const isActive = currentPath === item.href || (item.href === "/home" && currentPath === "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex h-10 items-center whitespace-nowrap rounded-full px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:px-3 lg:text-sm ${isActive ? "bg-blue-50 text-primary" : "text-slate-600 hover:bg-white hover:text-primary"}`}
                    data-testid={`link-secondary-nav-${item.href.replace(/\//g, '')}`}
                  >
                    {item.label}
                    {isActive && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary/70" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>

            <div className="relative min-w-0">
              <Input
                placeholder="Search products, parts, or services..."
                aria-label="Search products, parts, or services"
                className="h-10 w-full rounded-full border border-slate-200/80 bg-white/78 pl-4 pr-11 text-sm shadow-[0_6px_18px_rgba(15,23,42,0.07)] focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                data-testid="input-search"
              />
              <Button
                type="button"
                size="icon"
                aria-label="Submit search"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full shadow-none"
                onClick={handleSearch}
                data-testid="button-search"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <a
                href={`tel:${supportPhoneHref}`}
                aria-label={`Call hotline ${supportPhone}. Open ${businessHours}`}
                className="hidden h-11 min-w-[176px] items-center rounded-2xl border border-blue-200/80 bg-white/64 px-3.5 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-[1280px]:flex"
              >
                <span className="min-w-0 leading-tight">
                  <span className="block whitespace-nowrap text-xs font-bold text-slate-900">{supportPhone}</span>
                  <span className="mt-0.5 block whitespace-nowrap text-[10px] font-semibold text-slate-500">Open {businessHours}</span>
                </span>
              </a>
              <a
                href={`tel:${supportPhoneHref}`}
                aria-label={`Call hotline ${supportPhone}`}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-blue-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-[1280px]:hidden"
              >
                <Phone className="h-4 w-4" />
              </a>
              <DesktopLangToggle />
              <Button variant="ghost" size="icon" aria-label="Open cart" className="relative h-10 w-10 rounded-full text-slate-700 hover:bg-blue-50 hover:text-primary" onClick={() => setLocation("/cart")} data-testid="button-cart-desktop">
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-white shadow-sm" data-testid="text-cart-count">{itemCount}</span>
                )}
              </Button>

              {isAuthenticated && customer ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="h-10 max-w-[150px] gap-2 rounded-full border-blue-100 bg-white/80 px-3 text-slate-700 shadow-sm hover:bg-blue-50 hover:text-primary" data-testid="button-user-menu">
                      <UserCircle className="h-5 w-5 shrink-0" />
                      <span className="truncate" title={customer.name}>{customer.name}</span>
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
                <Button onClick={() => setShowAuthModal(true)} className="h-10 rounded-full px-4 shadow-[0_2px_5px_-3px_rgba(14,165,233,0.18)]" data-testid="button-signin">
                  <User className="mr-2 h-4 w-4" /> Sign In
                </Button>
              )}
            </div>

          </motion.div>
        </div>
      </header>

      <main className={`flex-1 ${currentPath === "/login" ? "pb-0" : isImmersiveMobileRoute ? "pb-28 md:pb-0" : "pb-20 md:pb-0"}`}>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      {!hideBottomNav && <MobileBottomNav />}

      {/* Neumorphic Footer */}
      <footer className="hidden md:block bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 text-slate-300 py-12 md:pb-12 relative overflow-hidden">
        <div className="container mx-auto px-4 grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white text-xl font-heading font-bold mb-4">PROMISE ELECTRONICS</h3>
            <p className="text-sm leading-relaxed mb-6">
              Your trusted partner for electronics sales and professional repair services in Bangladesh.
            </p>
            <div className="flex gap-4">
              <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-primary hover:text-white transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-primary hover:text-white transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-primary hover:text-white transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-primary hover:text-white transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">About Us</span></Link></li>
              <li><Link href="/terms-and-conditions"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">Terms & Conditions</span></Link></li>
              <li><Link href="/privacy-policy"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">Privacy Policy</span></Link></li>
              <li><Link href="/warranty-policy"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">Service Warranty Policy</span></Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Services</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/services"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">TV Repair</span></Link></li>
              <li><Link href="/support"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">Corporate Maintenance</span></Link></li>
              <li><Link href="/shop"><span className="hover:text-white cursor-pointer transition-colors text-slate-300">Parts Replacement</span></Link></li>
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
          &copy; {new Date().getFullYear()} Promise Electronics. All rights reserved.
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
    </CustomerLanguageProvider>
  );
}
