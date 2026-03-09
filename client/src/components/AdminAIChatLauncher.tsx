import { lazy, Suspense, startTransition, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AdminAIChat = lazy(() => import("@/components/AdminAIChat").then((module) => ({
    default: module.AdminAIChat,
})));

export function AdminAIChatLauncher() {
    const [shouldLoad, setShouldLoad] = useState(false);

    if (shouldLoad) {
        return (
            <Suspense fallback={null}>
                <AdminAIChat initialOpen />
            </Suspense>
        );
    }

    return (
        <Button
            onClick={() => {
                startTransition(() => {
                    setShouldLoad(true);
                });
            }}
            className={cn(
                "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-violet-600 shadow-lg transition-all duration-300 hover:bg-violet-700",
                "cursor-pointer"
            )}
            aria-label="Open admin AI chat"
        >
            <Sparkles className="h-6 w-6" />
        </Button>
    );
}
