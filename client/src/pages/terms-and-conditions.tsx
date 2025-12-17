import { PublicLayout } from "@/components/layout/PublicLayout";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Loader2 } from "lucide-react";

interface Policy {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  lastUpdated: string;
}

export default function TermsAndConditionsPage() {
  usePageTitle("Terms & Conditions");

  const { data: policy, isLoading, error } = useQuery<Policy>({
    queryKey: ["policy", "terms"],
    queryFn: async () => {
      const response = await fetch("/api/policies/terms");
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
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-20" data-testid="loading-terms-conditions">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="text-center py-20" data-testid="error-terms-conditions">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Policy not found</h1>
                <p className="text-muted-foreground">The terms and conditions are currently unavailable.</p>
              </div>
            )}

            {policy && (
              <div data-testid="content-terms-conditions">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4" data-testid="title-terms-conditions">
                  {policy.title}
                </h1>
                <p className="text-muted-foreground mb-8" data-testid="date-terms-conditions">
                  Last updated: {formatDate(policy.lastUpdated)}
                </p>
                <div 
                  className="prose prose-slate max-w-none bg-white rounded-2xl shadow-neumorph p-6 md:p-10"
                  data-testid="text-terms-conditions"
                >
                  <div className="whitespace-pre-wrap">{policy.content}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
