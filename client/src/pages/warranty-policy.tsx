import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Loader2, ShieldCheck } from "lucide-react";
import { PillButton, SectionEyebrow } from "@/components/customer/mobile-kit";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

interface Policy {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  lastUpdated: string;
}

export default function WarrantyPolicyPage() {
  usePageTitle("Warranty Policy");
  const { t } = useCustomerLanguage();

  const { data: policy, isLoading, error } = useQuery<Policy>({
    queryKey: ["policy", "warranty"],
    queryFn: async () => {
      const response = await fetch("/api/policies/warranty");
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
    <>
      <div className="min-h-screen bg-emerald-50/40 pb-32 md:pb-0">
        <div className="mx-auto max-w-[520px] px-4 py-8 sm:max-w-[560px] md:max-w-4xl md:py-12">
          <div className="mx-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-20" data-testid="loading-warranty-policy">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="mx-auto max-w-md rounded-[2rem] bg-white border border-blue-100 p-6 text-center shadow-sm" data-testid="error-warranty-policy">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-600">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <SectionEyebrow>{t("policy.warranty")}</SectionEyebrow>
                <h1 className="mt-3 text-2xl font-black text-slate-950">{t("policy.warrantyErrorTitle")}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{t("policy.warrantyError")}</p>
                <a href="/support" className="mt-5 block">
                  <PillButton type="button">{t("common.support")}</PillButton>
                </a>
              </div>
            )}

            {policy && (
              <div data-testid="content-warranty-policy">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4" data-testid="title-warranty-policy">
                  {policy.title}
                </h1>
                <p className="text-muted-foreground mb-8" data-testid="date-warranty-policy">
                  {t("policy.lastUpdated")}: {formatDate(policy.lastUpdated)}
                </p>
                <div 
                  className="prose prose-slate max-w-none rounded-[1.75rem] border border-emerald-100 bg-white p-5 shadow-sm md:p-10"
                  data-testid="text-warranty-policy"
                >
                  <div className="whitespace-pre-wrap">{policy.content}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
