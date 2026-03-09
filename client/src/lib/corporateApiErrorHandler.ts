import { useToast, toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ApiError {
    message: string;
    statusCode?: number;
}

export const handleCorporateError = (error: unknown, context?: string) => {
    console.error(`API Error [${context || "Corporate Portal"}]:`, error);

    let message = "An unexpected error occurred. Please try again.";

    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
        message = String((error as any).message);
    }

    // Network error specific handling
    if (message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch")) {
        message = "Connection lost. Please check your internet connection.";
    }

    toast({
        variant: "destructive",
        title: context ? `Error in ${context}` : "Request Failed",
        description: message,
    });
};

export function useCorporateApiErrorHandler() {
    return { handleError: handleCorporateError };
}

export const corporateQueryConfig = {
    retry: (failureCount: number, error: unknown) => {
        // Don't retry on 404s or 401s
        if (error && typeof error === 'object' && 'statusCode' in error) {
            const status = (error as any).statusCode;
            if (status === 404 || status === 401 || status === 403) return false;
        }
        return failureCount < 2;
    },
    refetchOnWindowFocus: false,
    meta: {
        scope: 'corporate'
    }
};
