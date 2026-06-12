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
                "fixed bottom-24 right-4 z-40 hidden h-12 w-12 rounded-full bg-violet-600 shadow-lg transition-all duration-300 hover:bg-violet-700 md:flex md:bottom-6 md:right-6 md:z-50 md:h-14 md:w-14",
                "cursor-pointer"
            )}
            aria-label="Open admin AI chat"
        >
            <Sparkles className="h-6 w-6" />
        </Button>
    );
}
