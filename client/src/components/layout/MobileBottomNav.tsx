import { Link, useLocation } from "wouter";
import { Home, ShoppingBag, Wrench, Search, User } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

export function MobileBottomNav() {
  const [location] = useLocation();
  const { isAuthenticated } = useCustomerAuth();

  const navItems = [
    { label: "Home", href: "/home", icon: Home },
    { label: "Shop", href: "/shop", icon: ShoppingBag },
    { label: "Services", href: "/services", icon: Wrench },
    { label: "Track", href: "/track-order", icon: Search },
    { label: "Profile", href: isAuthenticated ? "/my-profile" : "/login", icon: User },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-100 border-t border-slate-200/50 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <nav className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex flex-col items-center justify-center w-16 h-full space-y-1 transition-all duration-200 ${isActive ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}>
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${isActive ? 'bg-white shadow-neumorph-inset translate-y-1' : 'shadow-none'}`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
