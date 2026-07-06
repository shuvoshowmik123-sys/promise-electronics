import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, ShieldCheck, Wrench } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export type MobileHomeLanguage = "en" | "bn";

export function MobileHero({ heroImage }: { heroImage: string }) {
  const { t, toggleLanguage } = useCustomerLanguage();
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-6 pt-5">
      <div className="mx-auto w-full max-w-[520px] sm:max-w-[560px]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">{t("hero.eyebrow")}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-950">{t("hero.title")}</h1>
          </div>
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-11 rounded-full border border-emerald-100 bg-white px-4 text-xs font-bold text-emerald-700 shadow-sm transition active:scale-95"
            aria-label={t("hero.aria")}
            data-testid="button-mobile-language-toggle"
          >
            {t("hero.toggle")}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[28px] bg-slate-950 shadow-xl">
          <div className="aspect-[4/3]">
            {imgFailed ? (
              <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 flex items-center justify-center">
                <Wrench className="h-16 w-16 text-white/20" />
              </div>
            ) : (
              <img
                src={heroImage}
                alt="Technician working"
                className="h-full w-full object-cover opacity-80"
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="absolute bottom-0 left-0 right-0 p-5 text-white"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-bold">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("hero.badge")}
            </div>
            <p className="text-lg font-bold leading-snug">{t("hero.text")}</p>
            <p className="mt-1 text-sm leading-5 text-emerald-50">{t("hero.subtitle")}</p>
          </motion.div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href="/repair">
            <Button size="lg" className="h-[52px] min-h-[52px] w-full rounded-2xl bg-emerald-600 text-base font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700">
              <Wrench className="mr-2 h-5 w-5" />
              {t("hero.repair")}
            </Button>
          </Link>
          <Link href="/track-order">
            <Button size="lg" variant="outline" className="h-[52px] min-h-[52px] w-full rounded-2xl border-emerald-200 bg-white text-base font-bold text-emerald-700 shadow-sm">
              <Search className="mr-2 h-5 w-5" />
              {t("hero.track")}
            </Button>
          </Link>
        </div>

        <Link href="/get-quote" className="mt-3 flex min-h-[48px] items-center justify-center rounded-2xl bg-emerald-50 text-sm font-bold text-emerald-700">
          {t("hero.quote")} <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
