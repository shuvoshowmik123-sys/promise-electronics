import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Loader2 } from "lucide-react";

export function TechRouter() {
    const { user, isLoading } = useAdminAuth();
    const [, setLocation] = useLocation();

    useEffect(() => {
        if (!isLoading) {
            if (!user) {
                setLocation("/admin/login");
            } else {
                setLocation("/admin#technician");
            }
        }
    }, [user, isLoading, setLocation]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
    );
}
