import { useEffect } from "react";
import { useLocation } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { customerWarrantiesApi, type WarrantyInfo } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  Shield,
  ShieldCheck,
  ShieldX,
  Wrench,
  Cpu,
  Calendar,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

function WarrantyCard({ warranty }: { warranty: WarrantyInfo }) {
  const hasServiceWarranty = warranty.serviceWarranty.days > 0;
  const hasPartsWarranty = warranty.partsWarranty.days > 0;

  return (
    <Card className="hover:shadow-md transition-all" data-testid={`card-warranty-${warranty.jobId}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg" data-testid={`text-device-${warranty.jobId}`}>{warranty.device}</h3>
              <p className="text-sm text-muted-foreground">Job ID: {warranty.jobId}</p>
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          <p className="line-clamp-2">{warranty.issue}</p>
          {warranty.completedAt && (
            <p className="mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Completed: {format(new Date(warranty.completedAt), "dd MMM yyyy")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasServiceWarranty && (
            <div className={`p-4 rounded-lg border ${warranty.serviceWarranty.isActive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Wrench className={`w-4 h-4 ${warranty.serviceWarranty.isActive ? 'text-green-600' : 'text-red-600'}`} />
                <span className="font-medium">Service Warranty</span>
              </div>
              <div className="flex items-center gap-2">
                {warranty.serviceWarranty.isActive ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : (
                  <ShieldX className="w-5 h-5 text-red-600" />
                )}
                <Badge 
                  variant={warranty.serviceWarranty.isActive ? "default" : "destructive"}
                  className={warranty.serviceWarranty.isActive ? "bg-green-600" : ""}
                  data-testid={`badge-service-warranty-${warranty.jobId}`}
                >
                  {warranty.serviceWarranty.isActive ? "Active" : "Expired"}
                </Badge>
              </div>
              <div className="mt-2 text-sm">
                <p className="text-muted-foreground">
                  {warranty.serviceWarranty.days} days warranty
                </p>
                {warranty.serviceWarranty.expiryDate && (
                  <p className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {warranty.serviceWarranty.isActive ? (
                      <span className="text-green-700 font-medium">
                        {warranty.serviceWarranty.remainingDays} days remaining
                      </span>
                    ) : (
                      <span className="text-red-600">
                        Expired on {format(new Date(warranty.serviceWarranty.expiryDate), "dd MMM yyyy")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Covers technician workmanship</p>
            </div>
          )}

          {hasPartsWarranty && (
            <div className={`p-4 rounded-lg border ${warranty.partsWarranty.isActive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Cpu className={`w-4 h-4 ${warranty.partsWarranty.isActive ? 'text-green-600' : 'text-red-600'}`} />
                <span className="font-medium">Parts Warranty</span>
              </div>
              <div className="flex items-center gap-2">
                {warranty.partsWarranty.isActive ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : (
                  <ShieldX className="w-5 h-5 text-red-600" />
                )}
                <Badge 
                  variant={warranty.partsWarranty.isActive ? "default" : "destructive"}
                  className={warranty.partsWarranty.isActive ? "bg-green-600" : ""}
                  data-testid={`badge-parts-warranty-${warranty.jobId}`}
                >
                  {warranty.partsWarranty.isActive ? "Active" : "Expired"}
                </Badge>
              </div>
              <div className="mt-2 text-sm">
                <p className="text-muted-foreground">
                  {warranty.partsWarranty.days >= 365 
                    ? `${Math.floor(warranty.partsWarranty.days / 365)} year warranty`
                    : `${warranty.partsWarranty.days} days warranty`
                  }
                </p>
                {warranty.partsWarranty.expiryDate && (
                  <p className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {warranty.partsWarranty.isActive ? (
                      <span className="text-green-700 font-medium">
                        {warranty.partsWarranty.remainingDays} days remaining
                      </span>
                    ) : (
                      <span className="text-red-600">
                        Expired on {format(new Date(warranty.partsWarranty.expiryDate), "dd MMM yyyy")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Covers replaced hardware parts</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyWarrantiesPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, authLoading, setLocation]);

  const { data: warranties = [], isLoading } = useQuery({
    queryKey: ["customer-warranties"],
    queryFn: customerWarrantiesApi.getAll,
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <PublicLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const activeWarranties = warranties.filter(w => w.serviceWarranty.isActive || w.partsWarranty.isActive);
  const expiredWarranties = warranties.filter(w => !w.serviceWarranty.isActive && !w.partsWarranty.isActive);

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-6 md:py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">My Warranties</h1>
              <p className="text-muted-foreground">Track your service and parts warranties</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : warranties.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Shield className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No Warranties Found</h3>
                <p className="text-muted-foreground">
                  Warranties will appear here after your repairs are completed with warranty coverage.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {activeWarranties.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    Active Warranties ({activeWarranties.length})
                  </h2>
                  <div className="grid gap-4">
                    {activeWarranties.map((warranty) => (
                      <WarrantyCard key={warranty.jobId} warranty={warranty} />
                    ))}
                  </div>
                </div>
              )}

              {expiredWarranties.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShieldX className="w-5 h-5 text-red-600" />
                    Expired Warranties ({expiredWarranties.length})
                  </h2>
                  <div className="grid gap-4 opacity-75">
                    {expiredWarranties.map((warranty) => (
                      <WarrantyCard key={warranty.jobId} warranty={warranty} />
                    ))}
                  </div>
                </div>
              )}

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800 mb-1">Warranty Terms</p>
                      <p className="text-blue-700">
                        Parts warranty is VOID if damage is caused by: Electrical Fluctuation (High Voltage/Thunder), 
                        Water/Liquid Damage, or Physical Impact. Service warranty covers workmanship issues only.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </div>
    </PublicLayout>
  );
}
