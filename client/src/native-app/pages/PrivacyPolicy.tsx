import NativeLayout from "../NativeLayout";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { getApiUrl } from "@/lib/config";

interface Policy {
    id: string;
    slug: string;
    title: string;
    content: string;
    isPublished: boolean;
    lastUpdated: string;
}

export default function PrivacyPolicy() {
    const { data: policy, isLoading, error } = useQuery<Policy>({
        queryKey: ["policy", "privacy"],
        queryFn: async () => {
            const response = await fetch(getApiUrl("/api/policies/privacy"));
            if (!response.ok) {
                throw new Error("Policy not found");
            }
            return response.json();
        },
    });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)]">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-[var(--color-native-surface)]/90 backdrop-blur-md px-4 py-4 shadow-sm flex items-center gap-3 border-b border-[var(--color-native-border)] transition-colors duration-200">
                <Link href="/native/profile">
                    <button className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)] transition-colors">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-lg font-bold text-[var(--color-native-text)]">Privacy Policy</h1>
            </header>

            <main className="flex-1 px-4 py-6 pb-24 overflow-y-auto scrollbar-hide">
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-native-primary)]" />
                    </div>
                )}

                {error && (
                    <div className="text-center py-20">
                        <h2 className="text-xl font-bold text-[var(--color-native-text)] mb-2">Policy not found</h2>
                        <p className="text-[var(--color-native-text-muted)]">The privacy policy is currently unavailable.</p>
                    </div>
                )}

                {policy && (
                    <div className="bg-[var(--color-native-card)] rounded-2xl p-5 shadow-sm border border-[var(--color-native-border)]">
                        <h2 className="text-xl font-bold text-[var(--color-native-text)] mb-2">
                            {policy.title}
                        </h2>
                        <p className="text-xs text-[var(--color-native-text-muted)] mb-6">
                            Last updated: {formatDate(policy.lastUpdated)}
                        </p>
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                            <div className="whitespace-pre-wrap text-[var(--color-native-text-muted)] leading-relaxed">
                                {policy.content}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </NativeLayout>
    );
}
