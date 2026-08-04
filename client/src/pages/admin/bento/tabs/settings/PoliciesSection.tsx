import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Save, ShieldCheck, Smartphone, Globe, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { policiesApi, type Policy } from "@/lib/api/adminApi";

/**
 * Editor for the three legal pages: Terms, Privacy, Warranty.
 *
 * The backend for this has existed since the policies API was written, and the
 * public pages have always queried it — but no admin screen ever called
 * policiesApi, so the only way to publish a policy was a direct API call. This
 * is that missing screen.
 *
 * The slugs are fixed. server/routes/settings.routes.ts validates against
 * ['privacy', 'warranty', 'terms'] and rejects anything else with a 400, so
 * offering a free-text slug field would only invite that error.
 */

const SLUGS = ["terms", "privacy", "warranty"] as const;
type Slug = (typeof SLUGS)[number];

const META: Record<Slug, { label: string; publicPath: string; hint: string }> = {
    terms: {
        label: "Terms & Conditions",
        publicPath: "/terms-and-conditions",
        hint: "Payment, cancellation, uncollected devices, liability.",
    },
    privacy: {
        label: "Privacy Policy",
        publicPath: "/privacy-policy",
        hint: "What you collect, who processes it, how long you keep it.",
    },
    warranty: {
        label: "Warranty Policy",
        publicPath: "/warranty-policy",
        hint: "What is covered, for how long, and how to claim.",
    },
};

interface Draft {
    title: string;
    content: string;
    isPublished: boolean;
    isPublishedApp: boolean;
}

const emptyDraft = (slug: Slug): Draft => ({
    title: META[slug].label,
    content: "",
    isPublished: true,
    isPublishedApp: true,
});

const toDraft = (policy: Policy): Draft => ({
    title: policy.title,
    content: policy.content,
    isPublished: policy.isPublished,
    isPublishedApp: policy.isPublishedApp,
});

const sameDraft = (a: Draft, b: Draft) =>
    a.title === b.title &&
    a.content === b.content &&
    a.isPublished === b.isPublished &&
    a.isPublishedApp === b.isPublishedApp;

export default function PoliciesSection() {
    const { toast } = useToast();
    const [activeSlug, setActiveSlug] = useState<Slug>("terms");
    const [loading, setLoading] = useState(true);
    const [savingSlug, setSavingSlug] = useState<Slug | null>(null);

    // Two copies per slug: what the server has, and what is being typed. The
    // difference is what makes the "unsaved" badge honest rather than decorative.
    const [saved, setSaved] = useState<Record<Slug, Draft>>(() => ({
        terms: emptyDraft("terms"),
        privacy: emptyDraft("privacy"),
        warranty: emptyDraft("warranty"),
    }));
    const [drafts, setDrafts] = useState<Record<Slug, Draft>>(saved);

    useEffect(() => {
        let cancelled = false;
        policiesApi
            .getAll()
            .then((policies) => {
                if (cancelled) return;
                const next = {
                    terms: emptyDraft("terms"),
                    privacy: emptyDraft("privacy"),
                    warranty: emptyDraft("warranty"),
                } as Record<Slug, Draft>;
                for (const policy of policies ?? []) {
                    if ((SLUGS as readonly string[]).includes(policy.slug)) {
                        next[policy.slug as Slug] = toDraft(policy);
                    }
                }
                setSaved(next);
                setDrafts(next);
            })
            .catch(() => {
                if (!cancelled) {
                    toast({
                        title: "Could not load policies",
                        description: "You can still type and save — saving will create the policy.",
                        variant: "destructive",
                    });
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [toast]);

    const draft = drafts[activeSlug];
    const dirty = useMemo(
        () => SLUGS.filter((slug) => !sameDraft(drafts[slug], saved[slug])),
        [drafts, saved],
    );

    const update = (patch: Partial<Draft>) =>
        setDrafts((prev) => ({ ...prev, [activeSlug]: { ...prev[activeSlug], ...patch } }));

    const save = async () => {
        const current = drafts[activeSlug];
        // The server returns 400 for a blank title or blank content. Catching it
        // here means the admin sees which field is empty instead of "400".
        if (!current.title.trim()) {
            toast({ title: "Title is required", variant: "destructive" });
            return;
        }
        if (!current.content.trim()) {
            toast({ title: "Content is required", variant: "destructive" });
            return;
        }
        setSavingSlug(activeSlug);
        try {
            await policiesApi.save({
                slug: activeSlug,
                title: current.title.trim(),
                content: current.content,
                isPublished: current.isPublished,
                isPublishedApp: current.isPublishedApp,
            });
            setSaved((prev) => ({ ...prev, [activeSlug]: { ...current, title: current.title.trim() } }));
            setDrafts((prev) => ({ ...prev, [activeSlug]: { ...prev[activeSlug], title: current.title.trim() } }));
            toast({ title: `${META[activeSlug].label} saved`, description: "The public page now shows this text." });
        } catch (error) {
            toast({
                title: "Save failed",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "destructive",
            });
        } finally {
            setSavingSlug(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    const words = draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0;

    return (
        <div className="space-y-4 py-2">
            {/* Slug switcher */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {SLUGS.map((slug) => {
                    const isActive = slug === activeSlug;
                    const isDirty = dirty.includes(slug);
                    const isEmpty = !saved[slug].content.trim();
                    return (
                        <button
                            key={slug}
                            type="button"
                            onClick={() => setActiveSlug(slug)}
                            className={`rounded-2xl border p-3 text-left transition-all ${
                                isActive
                                    ? "border-blue-300 bg-blue-50/70 shadow-sm"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <FileText className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                                <span className="text-sm font-bold text-slate-800">{META[slug].label}</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {isEmpty && (
                                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                        Empty
                                    </span>
                                )}
                                {isDirty && (
                                    <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                                        Unsaved
                                    </span>
                                )}
                                {!isEmpty && !isDirty && (
                                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                        Published
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* The public pages render content with `whitespace-pre-wrap`, not a
                markdown renderer. Saying so here prevents someone pasting a
                markdown table and finding pipe characters on the live site. */}
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs leading-relaxed text-amber-800">
                    This is <strong>plain text</strong>, not markdown. Line breaks and blank lines are
                    preserved exactly as you type them, but <code>#</code>, <code>**bold**</code> and
                    <code> | table |</code> characters will appear literally on the page.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Page title
                    </label>
                    <Input
                        value={draft.title}
                        onChange={(e) => update({ title: e.target.value })}
                        placeholder={META[activeSlug].label}
                        className="h-11 rounded-xl"
                    />
                    <p className="mt-1.5 text-xs text-slate-500">{META[activeSlug].hint}</p>
                </div>

                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Content</label>
                        <span className="text-[11px] font-semibold text-slate-400">{words} words</span>
                    </div>
                    <textarea
                        value={draft.content}
                        onChange={(e) => update({ content: e.target.value })}
                        placeholder={`Paste the ${META[activeSlug].label.toLowerCase()} here.`}
                        spellCheck={false}
                        className="custom-scrollbar min-h-[320px] w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-slate-500" />
                            <div>
                                <p className="text-sm font-bold text-slate-800">Show on website</p>
                                <p className="text-[11px] text-slate-500">{META[activeSlug].publicPath}</p>
                            </div>
                        </div>
                        <Switch
                            checked={draft.isPublished}
                            onCheckedChange={(v) => update({ isPublished: v })}
                        />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center gap-2">
                            <Smartphone className="h-4 w-4 text-slate-500" />
                            <div>
                                <p className="text-sm font-bold text-slate-800">Show in app</p>
                                <p className="text-[11px] text-slate-500">Mobile customer app</p>
                            </div>
                        </div>
                        <Switch
                            checked={draft.isPublishedApp}
                            onCheckedChange={(v) => update({ isPublishedApp: v })}
                        />
                    </div>
                </div>

                {/* Turning both off hides the page entirely — the public route
                    returns 404. Better to say that than let it be discovered. */}
                {!draft.isPublished && !draft.isPublishedApp && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                        Both switches are off — this page will show "not available" everywhere.
                    </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                    <a
                        href={META[activeSlug].publicPath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                        Preview the live page &rarr;
                    </a>
                    <Button
                        onClick={save}
                        disabled={savingSlug !== null || !dirty.includes(activeSlug)}
                        className="h-11 rounded-xl bg-blue-600 text-white hover:bg-blue-700 sm:w-auto"
                    >
                        {savingSlug === activeSlug ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        {dirty.includes(activeSlug) ? `Save ${META[activeSlug].label}` : "No changes"}
                    </Button>
                </div>
            </div>

            <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Each policy saves on its own — the Save button above only saves the page you are
                looking at. Draft text for all three is in <code>docs/legal/</code> in the repository.
            </p>
        </div>
    );
}
