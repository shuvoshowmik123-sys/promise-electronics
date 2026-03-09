import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface QueryErrorStateProps {
    title?: string;
    message?: string;
    onRetry?: () => void;
    showHomeLink?: boolean;
    compact?: boolean;
    actionButton?: React.ReactNode;
}

export function QueryErrorState({
    title = "Failed to Load",
    message = "Something went wrong while loading this content. Please try again.",
    onRetry,
    showHomeLink = true,
    compact = false,
    actionButton,
}: QueryErrorStateProps) {
    if (compact) {
        return (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">{message}</p>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="w-3 h-3 mr-2" /> Retry
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-[300px] p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
                    <p className="text-muted-foreground mb-6 text-sm">{message}</p>
                    <div className="flex flex-col gap-2">
                        {onRetry && (
                            <Button onClick={onRetry} className="w-full">
                                <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                            </Button>
                        )}
                        {actionButton ? actionButton : showHomeLink && (
                            <Link href="/">
                                <Button variant="outline" className="w-full">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Return to Home
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
