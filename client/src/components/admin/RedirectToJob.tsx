import { useLocation, useRoute } from "wouter";
import { useEffect } from "react";

export function RedirectToJob() {
    const [, setLocation] = useLocation();
    const [match, params] = useRoute("/admin/repairs/:id");

    useEffect(() => {
        if (match && params?.id) {
            setLocation(`/admin#jobs?search=${encodeURIComponent(params.id)}`);
        } else {
            setLocation("/admin#jobs");
        }
    }, [match, params, setLocation]);

    return null;
}
