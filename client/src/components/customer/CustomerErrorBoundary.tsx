import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class CustomerErrorBoundary extends Component<Props, State> {
    state: State = {
        hasError: false,
        error: null,
    };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[CustomerPortal] Error caught by boundary:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center min-h-[400px] p-6">
                    <Card className="max-w-md w-full border-red-200 bg-red-50/50 shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-red-100">
                                    <AlertTriangle className="w-6 h-6 text-red-600" />
                                </div>
                                <CardTitle className="text-red-900">
                                    {this.props.fallbackTitle || 'Something Went Wrong'}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-red-800">
                                An unexpected error occurred. Please try again or return to the home page.
                            </p>
                            {this.state.error && (
                                <details className="mt-2">
                                    <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                                        Technical details
                                    </summary>
                                    <pre className="mt-2 p-2 bg-red-100 rounded text-xs text-red-900 overflow-auto max-h-32">
                                        {this.state.error.message}
                                    </pre>
                                </details>
                            )}
                            <div className="flex gap-2 pt-2">
                                <Button onClick={this.handleReset} size="sm" className="flex-1 bg-primary hover:bg-primary/90">
                                    <RefreshCw className="w-4 h-4 mr-2" /> Try Again
                                </Button>
                                <Button onClick={() => window.location.href = '/'} variant="outline" size="sm" className="flex-1">
                                    <Home className="w-4 h-4 mr-2" /> Go Home
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }
        return this.props.children;
    }
}
