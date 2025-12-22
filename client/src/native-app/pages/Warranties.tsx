import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Shield, ShieldCheck, ShieldX, Wrench, Cpu, Calendar, Clock, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { customerWarrantiesApi, type WarrantyInfo } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NativeLayout from "../NativeLayout";

export default function NativeWarranties() {
    const [, setLocation] = useLocation();
    const { isAuthenticated } = useCustomerAuth();

    const { data: fetchedWarranties = [], isLoading } = useQuery({
        queryKey: ["customer-warranties"],
        queryFn: customerWarrantiesApi.getAll,
        enabled: isAuthenticated,
    });

    // Sample data for testing concept if no warranties exist
    const sampleWarranty: WarrantyInfo = {
        jobId: "SAMPLE-123",
        device: "Samsung 55\" 4K Smart TV",
        issue: "Backlight Replacement & Power Board Repair",
        completedAt: new Date().toISOString(),
        serviceWarranty: {
            days: 90,
            expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
            remainingDays: 89
        },
        partsWarranty: {
            days: 365,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: true,
            remainingDays: 364
        }
    };

    const warranties = fetchedWarranties.length > 0 ? fetchedWarranties : [sampleWarranty];

    const activeWarranties = warranties.filter(w => w.serviceWarranty.isActive || w.partsWarranty.isActive);
    const expiredWarranties = warranties.filter(w => !w.serviceWarranty.isActive && !w.partsWarranty.isActive);

    const WarrantyCard = ({ warranty }: { warranty: WarrantyInfo }) => {
        const hasServiceWarranty = warranty.serviceWarranty.days > 0;
        const hasPartsWarranty = warranty.partsWarranty.days > 0;

        return (
            <div className="bg-[var(--color-native-card)] p-5 rounded-2xl border border-[var(--color-native-border)] shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-[var(--color-native-text)]">{warranty.device}</h3>
                            <p className="text-xs text-[var(--color-native-text-muted)]">Job ID: {warranty.jobId}</p>
                        </div>
                    </div>
                    <button className="text-[10px] font-bold bg-[var(--color-native-text)] text-[var(--color-native-bg)] px-3 py-1.5 rounded-full shadow-sm active:scale-95 transition-transform">
                        Claim Warranty
                    </button>
                </div>

                <div className="text-sm text-[var(--color-native-text-muted)]">
                    <p className="line-clamp-2 mb-2 text-[var(--color-native-text)]">{warranty.issue}</p>
                    {warranty.completedAt && (
                        <p className="flex items-center gap-1 text-xs text-[var(--color-native-text-muted)]">
                            <Calendar className="w-3 h-3" />
                            Completed: {format(new Date(warranty.completedAt), "MMM d, yyyy")}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                    {hasServiceWarranty && (
                        <div className={cn(
                            "p-3 rounded-xl border",
                            warranty.serviceWarranty.isActive
                                ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800"
                                : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800"
                        )}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Wrench className={cn("w-4 h-4", warranty.serviceWarranty.isActive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")} />
                                    <span className="font-bold text-sm text-[var(--color-native-text)]">Service Warranty</span>
                                </div>
                                <Badge className={cn(
                                    "text-[10px] px-2 py-0.5 border-0",
                                    warranty.serviceWarranty.isActive ? "bg-green-600 dark:bg-green-500" : "bg-red-600 dark:bg-red-500"
                                )}>
                                    {warranty.serviceWarranty.isActive ? "Active" : "Expired"}
                                </Badge>
                            </div>

                            <div className="text-xs space-y-1">
                                <p className="text-[var(--color-native-text-muted)]">{warranty.serviceWarranty.days} days coverage</p>
                                {warranty.serviceWarranty.expiryDate && (
                                    <p className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-[var(--color-native-text-muted)]" />
                                        {warranty.serviceWarranty.isActive ? (
                                            <span className="text-green-700 dark:text-green-400 font-medium">
                                                {warranty.serviceWarranty.remainingDays} days remaining
                                            </span>
                                        ) : (
                                            <span className="text-red-600 dark:text-red-400">
                                                Expired on {format(new Date(warranty.serviceWarranty.expiryDate), "MMM d, yyyy")}
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {hasPartsWarranty && (
                        <div className={cn(
                            "p-3 rounded-xl border",
                            warranty.partsWarranty.isActive
                                ? "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800"
                                : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800"
                        )}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Cpu className={cn("w-4 h-4", warranty.partsWarranty.isActive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")} />
                                    <span className="font-bold text-sm text-[var(--color-native-text)]">Parts Warranty</span>
                                </div>
                                <Badge className={cn(
                                    "text-[10px] px-2 py-0.5 border-0",
                                    warranty.partsWarranty.isActive ? "bg-green-600 dark:bg-green-500" : "bg-red-600 dark:bg-red-500"
                                )}>
                                    {warranty.partsWarranty.isActive ? "Active" : "Expired"}
                                </Badge>
                            </div>

                            <div className="text-xs space-y-1">
                                <p className="text-[var(--color-native-text-muted)]">
                                    {warranty.partsWarranty.days >= 365
                                        ? `${Math.floor(warranty.partsWarranty.days / 365)} year coverage`
                                        : `${warranty.partsWarranty.days} days coverage`
                                    }
                                </p>
                                {warranty.partsWarranty.expiryDate && (
                                    <p className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-[var(--color-native-text-muted)]" />
                                        {warranty.partsWarranty.isActive ? (
                                            <span className="text-green-700 dark:text-green-400 font-medium">
                                                {warranty.partsWarranty.remainingDays} days remaining
                                            </span>
                                        ) : (
                                            <span className="text-red-600 dark:text-red-400">
                                                Expired on {format(new Date(warranty.partsWarranty.expiryDate), "MMM d, yyyy")}
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-20">
            {/* Header */}
            <div className="bg-[var(--color-native-surface)] px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3 border-b border-[var(--color-native-border)] transition-colors duration-200">
                <Link href="/native/profile">
                    <button className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)] transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-xl font-bold text-[var(--color-native-text)]">My Warranties</h1>
            </div>

            <main className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-6">
                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                ) : (
                    <>
                        {activeWarranties.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-bold text-[var(--color-native-text)] flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    Active Warranties ({activeWarranties.length})
                                </h2>
                                {activeWarranties.map((warranty) => (
                                    <WarrantyCard key={warranty.jobId} warranty={warranty} />
                                ))}
                            </div>
                        )}

                        {expiredWarranties.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-bold text-[var(--color-native-text)] flex items-center gap-2">
                                    <ShieldX className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    Expired Warranties ({expiredWarranties.length})
                                </h2>
                                <div className="opacity-75">
                                    {expiredWarranties.map((warranty) => (
                                        <WarrantyCard key={warranty.jobId} warranty={warranty} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {warranties.length === 0 && (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Shield className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Warranties Found</h3>
                                <p className="text-[var(--color-native-text-muted)]">Warranties will appear here after your repairs are completed.</p>
                            </div>
                        )}
                    </>
                )}

                {/* Warranty Terms Alert */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800 dark:text-blue-300">
                        <p className="font-bold mb-1">Warranty Terms</p>
                        <p>
                            Parts warranty is VOID if damage is caused by: Electrical Fluctuation (High Voltage/Thunder),
                            Water/Liquid Damage, or Physical Impact. Service warranty covers workmanship issues only.
                        </p>
                    </div>
                </div>
            </main>
        </NativeLayout>
    );
}
