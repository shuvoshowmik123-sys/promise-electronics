/**
 * The links the shop pastes under a Facebook post or a YouTube video.
 *
 * Each service and product got its own page and its own share card before this
 * screen existed, which made them worth nothing: a page nobody can find the
 * address of is a page nobody shares. Services are loaded by CSV import and
 * have no per-row editor, so there was no screen anywhere in the panel that
 * showed a link beside a service name.
 *
 * Deliberately just a list and a copy button. The job here is one action —
 * "give me the link for that repair" — done in one tap, on a phone, while
 * someone is halfway through writing a post.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PublicLink = {
    type: "service" | "product";
    name: string;
    category: string | null;
    url: string;
};

export function ShareLinksPanel({ className }: { className?: string }) {
    const [query, setQuery] = useState("");
    const [copied, setCopied] = useState<string | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ["admin-public-links"],
        queryFn: () => fetchApi<{ links: PublicLink[] }>("/admin/public-links"),
    });

    const links = data?.links ?? [];

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return links;
        return links.filter(
            (l) =>
                l.name.toLowerCase().includes(q) ||
                (l.category ?? "").toLowerCase().includes(q),
        );
    }, [links, query]);

    const copy = async (link: PublicLink) => {
        try {
            await navigator.clipboard.writeText(link.url);
            setCopied(link.url);
            toast.success("Link copied");
            // Long enough to notice, short enough that the next copy is obvious.
            setTimeout(() => setCopied((c) => (c === link.url ? null : c)), 2000);
        } catch {
            /**
             * The clipboard needs a secure context, so it fails over plain
             * http on a phone on the shop's wifi. Selecting the text is a
             * worse experience than copying and a much better one than a
             * button that silently does nothing.
             */
            toast.error("Could not copy. Long-press the link to select it.");
        }
    };

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-blue-600" />
                <p className="text-[11px] font-black uppercase tracking-wide text-blue-600">
                    Share links
                </p>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
                Paste any of these under a Facebook post or a YouTube video. Each one opens
                its own page showing that service, its price, and a button to book it.
            </p>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a service or product"
                    className="h-10 rounded-xl pl-9"
                />
            </div>

            {isLoading && (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">
                    Loading links…
                </p>
            )}

            {isError && (
                <p className="py-6 text-center text-xs font-semibold text-red-600">
                    Could not load the links. Reload the page and try again.
                </p>
            )}

            {!isLoading && !isError && links.length === 0 && (
                /* Said plainly: the list is empty because nothing is published,
                   not because the screen is broken. */
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[11px] font-semibold leading-snug text-slate-500">
                    Nothing is published yet. A service appears here once it is active,
                    and a product once it is set to show on the website.
                </p>
            )}

            {!isLoading && !isError && links.length > 0 && filtered.length === 0 && (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">
                    Nothing matches “{query}”.
                </p>
            )}

            <div className="space-y-2">
                {filtered.map((link) => (
                    <div
                        key={link.url}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-slate-900">
                                    {link.name}
                                </p>
                                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {link.type === "service" ? "Service" : "Product"}
                                    {link.category ? ` · ${link.category}` : ""}
                                </p>
                            </div>
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                /* Seeing the page before posting it is the only way
                                   to catch a wrong price in front of customers. */
                                className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-blue-600"
                                title="Open this page"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </div>

                        <p className="mt-2 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-600">
                            {link.url}
                        </p>

                        <Button
                            size="sm"
                            onClick={() => copy(link)}
                            className={cn(
                                "mt-2 h-9 w-full rounded-lg text-[11px] font-bold",
                                copied === link.url && "bg-emerald-600 hover:bg-emerald-600",
                            )}
                        >
                            {copied === link.url ? (
                                <>
                                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                                </>
                            )}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
