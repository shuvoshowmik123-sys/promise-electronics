import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { isStaleBuildError, recoverFromStaleBuild } from '@/lib/app-update-recovery';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    reloading: boolean;
}

export class CustomerErrorBoundary extends Component<Props, State> {
    state: State = {
        hasError: false,
        error: null,
        reloading: false,
    };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, reloading: isStaleBuildError(error) };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[CustomerPortal] Error caught by boundary:', error, errorInfo);

        // A tab left open across a deploy is asking for chunk filenames that no
        // longer exist. Re-rendering requests the same dead URL, so the old
        // "Try Again" button could never succeed.
        //
        // installStaleBuildRecovery() already handles this for uncaught errors,
        // but React resolves a failed React.lazy import into THIS boundary — it
        // never reaches window 'error' or 'unhandledrejection', so the global
        // listeners were blind to the most common way it happens. Calling the
        // same recovery here closes that gap.
        if (isStaleBuildError(error)) {
            void recoverFromStaleBuild().then((started) => {
                // Cooldown already used: the reload did not help, so show the
                // error instead of pretending an update is on the way.
                if (!started) this.setState({ reloading: false });
            });
        }
    }

    handleReset = () => {
        // A stale chunk cannot be recovered in place: the file is gone from the
        // server, so only a full reload can fix it.
        if (isStaleBuildError(this.state.error)) {
            window.location.reload();
            return;
        }
        this.setState({ hasError: false, error: null, reloading: false });
    };

    render() {
        if (this.state.reloading) {
            return (
                <div className="flex min-h-[400px] items-center justify-center p-6">
                    <div className="flex items-center gap-3 text-slate-600">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Updating to the latest version…</span>
                    </div>
                </div>
            );
        }

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
                                    {isStaleBuildError(this.state.error)
                                        ? 'A New Version Is Available'
                                        : this.props.fallbackTitle || 'Something Went Wrong'}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-red-800">
                                {isStaleBuildError(this.state.error)
                                    ? 'This page was open while we released an update. Reload to continue — nothing you entered has been sent yet.'
                                    : 'An unexpected error occurred. Please try again or return to the home page.'}
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
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    {isStaleBuildError(this.state.error) ? 'Reload' : 'Try Again'}
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
