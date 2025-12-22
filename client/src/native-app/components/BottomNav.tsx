import { useLocation } from "wouter";
import { Home, Wrench, ShoppingCart, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function BottomNav() {
    const [location, setLocation] = useLocation();

    const navItems = [
        { icon: Home, label: "Home", path: "/native/home" },
        { icon: ShoppingCart, label: "Shop", path: "/native/shop" },
        { icon: Wrench, label: "Repairs", path: "/native/bookings" },
        { icon: User, label: "Profile", path: "/native/profile" },
    ];

    return (
        <nav className="fixed bottom-0 z-50 w-full border-t border-[var(--color-native-border)] bg-[var(--color-native-surface)]/80 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl">
            <div className="flex items-center justify-around px-2">
                {navItems.map((item) => {
                    const isActive = location === item.path;
                    return (
                        <button
                            key={item.label}
                            onClick={() => setLocation(item.path)}
                            className={cn(
                                "flex flex-col items-center gap-1 p-2",
                                isActive
                                    ? "text-[var(--color-native-primary)]"
                                    : "text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)]"
                            )}
                        >
                            <item.icon className={cn("w-6 h-6", isActive && "fill-current")} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

