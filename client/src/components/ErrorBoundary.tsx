import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { isStaleBuildError, recoverFromStaleBuild } from "@/lib/app-update-recovery";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        if (isStaleBuildError(error)) {
            void recoverFromStaleBuild();
            return;
        }

        console.error(`Uncaught error in component ${this.props.name || 'Unknown'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (isStaleBuildError(this.state.error)) {
                return (
                    <div className="absolute inset-0 z-50 flex min-h-[200px] flex-col items-center justify-center bg-white p-6 text-center text-slate-900">
                        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
                        <h2 className="mb-2 text-lg font-bold">Updating app</h2>
                        <p className="max-w-sm text-sm text-slate-600">
                            A new version is available. The app is refreshing once so you can continue safely.
                        </p>
                    </div>
                );
            }

            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-900 absolute inset-0 z-50 flex flex-col items-center justify-center min-h-[200px]">
                    <AlertTriangle className="w-10 h-10 mb-4 text-red-600" />
                    <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
                    <p className="text-sm font-mono bg-red-100 p-2 rounded mb-4 max-w-full overflow-auto text-wrap">
                        {this.state.error?.message}
                    </p>
                    <button
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                        onClick={() => this.setState({ hasError: false, error: null })}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
