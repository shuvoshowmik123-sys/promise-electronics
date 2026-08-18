/**
 * The return policy, required before Google will list the shop's products.
 *
 * Merchant Center refuses to verify a store without one, and it is also the
 * page a customer reads before spending eight thousand taka on a panel they
 * cannot test until it is fitted.
 *
 * Content lives in the policies table under the slug "returns", exactly like
 * the warranty and privacy pages, so the shop can reword it in the admin panel
 * without a deploy. That matters here more than elsewhere: Google holds a store
 * to whatever this page says, so it has to be changeable by the person who
 * decides the policy rather than by whoever last touched the code.
 */
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Loader2, PackageOpen } from "lucide-react";
import { PillButton, SectionEyebrow } from "@/components/customer/mobile-kit";

interface Policy {
    id: string;
    slug: string;
    title: string;
    content: string;
    isPublished: boolean;
    lastUpdated: string;
}

export default function ReturnPolicyPage() {
    usePageTitle("Return Policy");

    const { data: policy, isLoading, error } = useQuery<Policy>({
        queryKey: ["policy", "returns"],
        queryFn: async () => {
            const response = await fetch("/api/policies/returns");
            if (!response.ok) throw new Error("Policy not found");
            return response.json();
        },
    });

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });

    return (
        <div className="min-h-screen bg-emerald-50/40 pb-32 md:pb-0">
            <div className="mx-auto max-w-[520px] px-4 py-8 sm:max-w-[560px] md:max-w-4xl md:py-12">
                {isLoading && (
                    <div className="flex items-center justify-center py-20" data-testid="loading-return-policy">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {error && (
                    /*
                     * A customer who reached this page is deciding whether to
                     * trust the shop with money. "Policy not found" would be the
                     * worst possible answer, so the fallback offers a person.
                     */
                    <div className="mx-auto max-w-md rounded-[2rem] border border-blue-100 bg-white p-6 text-center shadow-sm" data-testid="error-return-policy">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-600">
                            <PackageOpen className="h-8 w-8" />
                        </div>
                        <SectionEyebrow>Returns</SectionEyebrow>
                        <h1 className="mt-3 text-2xl font-black text-slate-950">We could not load this page</h1>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            Please call us and we will tell you exactly where you stand.
                        </p>
                        <a href="/support" className="mt-5 block">
                            <PillButton type="button">Contact support</PillButton>
                        </a>
                    </div>
                )}

                {policy && (
                    <div data-testid="content-return-policy">
                        <h1 className="mb-4 text-3xl font-bold text-slate-800 md:text-4xl" data-testid="title-return-policy">
                            {policy.title}
                        </h1>
                        <p className="mb-8 text-muted-foreground" data-testid="date-return-policy">
                            Last updated: {formatDate(policy.lastUpdated)}
                        </p>
                        <div
                            className="prose prose-slate max-w-none rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-sm md:p-10"
                            data-testid="text-return-policy"
                        >
                            <div className="whitespace-pre-wrap">{policy.content}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
