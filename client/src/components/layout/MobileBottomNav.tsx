import { Link, useLocation } from "wouter";
import { Home, ShoppingBag, Wrench, Search, User, type LucideIcon } from "lucide-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

type DockKey = "dock.home" | "dock.shop" | "dock.repair" | "dock.track" | "dock.profile";

interface DockItem {
  labelKey: DockKey;
  href: string;
  icon: LucideIcon;
}

export function MobileBottomNav() {
  const [location] = useLocation();
  const { isAuthenticated } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const currentPath = location.split("?")[0].split("#")[0];

  const items: DockItem[] = [
    { labelKey: "dock.home", href: "/home", icon: Home },
    { labelKey: "dock.shop", href: "/shop", icon: ShoppingBag },
    { labelKey: "dock.repair", href: "/repair", icon: Wrench },
    { labelKey: "dock.track", href: "/track-order", icon: Search },
    {
      labelKey: "dock.profile",
      href: isAuthenticated ? "/my-profile" : "/login",
      icon: User,
    },
  ];

  const isActive = (href: string) =>
    currentPath === href || (href !== "/" && currentPath.startsWith(href));

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
    >
      <nav
        aria-label="Customer navigation"
        className="pointer-events-auto grid h-[82px] w-[calc(100%-0.5rem)] max-w-[520px] sm:max-w-[560px] grid-cols-5 items-center gap-1 rounded-[32px] border border-emerald-100/80 bg-white/95 p-2 shadow-[0_16px_42px_rgba(15,23,42,0.16)] backdrop-blur-xl"
      >
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const label = t(item.labelKey);
          const isRepair = item.href === "/repair";

          if (isRepair) {
            return (
              <Link key={item.href} href={item.href}>
                <button
                  type="button"
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className="group relative flex h-[70px] w-full min-w-0 items-center justify-center rounded-[26px] transition-transform duration-300 active:scale-95"
                >
                  <span className={`absolute h-[68px] w-[68px] rounded-full border bg-white transition-all duration-300 ${active ? "border-emerald-300 shadow-[0_0_0_8px_rgba(16,185,129,0.10)]" : "border-emerald-100 shadow-sm shadow-slate-200/80"}`} />
                  <span className={`relative flex h-[60px] w-[60px] flex-col items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 group-active:scale-95 ${active ? "bg-emerald-700 shadow-emerald-500/30" : "bg-slate-950 shadow-slate-300/80"}`}>
                    <Wrench className="h-6 w-6 stroke-[2.5px]" />
                    <span className="mt-0.5 text-[10px] font-black leading-none">
                      {label}
                    </span>
                  </span>
                </button>
              </Link>
            );
          }

          return (
            <Link key={item.href} href={item.href}>
              <button
                type="button"
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-[58px] w-full min-w-0 flex-col items-center justify-center rounded-[22px] border transition-all duration-300 active:scale-95 ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100" : "border-transparent text-slate-500 hover:bg-emerald-50/70"}`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.7px]" : "stroke-2"}`} />
                <span className={`mt-1 max-w-full truncate text-[10px] font-black leading-none ${active ? "text-emerald-700" : "text-slate-400"}`}>
                  {label}
                </span>
              </button>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
