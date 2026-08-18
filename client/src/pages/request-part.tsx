/**
 * "We do not have it. Tell us what you need."
 *
 * The shop's hardest question is what to import before spending money on it,
 * and this is where the answer comes from: the customer who searched for a part,
 * did not find it, and would have bought one.
 *
 * Every field that gets counted is a dropdown, never a text box. That single
 * decision is what makes the demand board work — a customer who picks "Display"
 * cannot be counted apart from one who would have typed "screen", "panel" or
 * "স্ক্রিন". The free-text model number is kept as detail for whoever makes the
 * call, and nothing counted ever depends on it.
 *
 * Nothing is promised automatically. The customer is told a person will call,
 * because a person will. A shop that promises an automatic alert and fails to
 * send it has done worse than never offering one.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, PackageSearch, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { publicSettingsApi } from "@/lib/api/publicApi";
import { fetchApi } from "@/lib/api/httpClient";
import { usePageTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/utils";

type Setting = { key: string; value: string | null };

function readList(settings: Setting[], key: string): string[] {
    const row = settings.find((s) => s.key === key);
    if (!row?.value) return [];
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
        return [];
    }
}

export default function RequestPartPage() {
    usePageTitle("Request a TV Part - Promise Electronics");

    const { data: settings = [], isLoading: loadingSettings } = useQuery({
        queryKey: ["public-settings"],
        queryFn: publicSettingsApi.getAll,
    });

    const brands = useMemo(() => readList(settings as Setting[], "tv_brands"), [settings]);
    const sizes = useMemo(() => readList(settings as Setting[], "tv_sizes"), [settings]);
    const parts = useMemo(() => readList(settings as Setting[], "tv_parts"), [settings]);

    const [brand, setBrand] = useState("");
    const [screenSize, setScreenSize] = useState("");
    const [partName, setPartName] = useState("");
    const [modelNumber, setModelNumber] = useState("");
    const [panelModel, setPanelModel] = useState("");
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ready = brand && screenSize && partName && phone.trim().length >= 6;

    const submit = async () => {
        setError(null);
        setSending(true);
        try {
            await fetchApi("/public/part-requests", {
                method: "POST",
                body: JSON.stringify({
                    brand, screenSize, partName,
                    modelNumber, panelModel, customerName, phone, note,
                }),
            });
            setSent(true);
        } catch (e: any) {
            setError(e?.message || "Could not send your request. Please try again.");
        } finally {
            setSending(false);
        }
    };

    if (sent) {
        return (
            <div className="mx-auto max-w-lg px-4 py-16 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-7 w-7 text-emerald-600" />
                </div>
                <h1 className="mt-4 text-xl font-black text-slate-900">Request received</h1>
                {/*
                  * What actually happens next, in the words it happens in. No
                  * promise of an automatic message, because nothing sends one.
                  */}
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    We have written down the part you need. When we have it, someone from
                    Promise Electronics will call you on <strong>{phone}</strong>.
                </p>
                <p className="mt-3 text-xs text-slate-500">
                    We cannot promise a date. Parts are ordered when enough people need the
                    same one, and yours has been counted.
                </p>
                <Button
                    className="mt-6 h-11 w-full rounded-xl"
                    onClick={() => {
                        setSent(false);
                        setPartName("");
                        setModelNumber("");
                        setPanelModel("");
                        setNote("");
                    }}
                >
                    Request another part
                </Button>
            </div>
        );
    }

    /**
     * The lists come from the shop's own settings, so an empty list means the
     * shop has not filled them in — not that the page is broken. Said plainly,
     * with a way to reach a human, because the customer still needs the part.
     */
    const listsEmpty = !loadingSettings && (brands.length === 0 || sizes.length === 0 || parts.length === 0);

    return (
        <div className="mx-auto max-w-lg px-4 py-8">
            <div className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5 text-blue-600" />
                <h1 className="text-xl font-black text-slate-900">Cannot find your part?</h1>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tell us which part you need. If enough people need the same one we bring it
                in, and we call you when it arrives.
            </p>

            {loadingSettings && (
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
            )}

            {listsEmpty && (
                <div className="mt-6 rounded-xl bg-amber-50 px-4 py-5 text-center">
                    <p className="text-sm font-bold text-amber-900">Not ready yet</p>
                    <p className="mt-1 text-xs leading-snug text-amber-800">
                        We are still setting this up. Please call us and we will find your
                        part for you.
                    </p>
                </div>
            )}

            {!loadingSettings && !listsEmpty && (
                <div className="mt-6 space-y-4">
                    <Picker label="TV brand" required value={brand} onChange={setBrand} options={brands} />
                    <Picker label="Screen size (inches)" required value={screenSize} onChange={setScreenSize} options={sizes} />
                    <Picker label="Which part" required value={partName} onChange={setPartName} options={parts} />

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">TV model number</Label>
                        <Input
                            value={modelNumber}
                            onChange={(e) => setModelNumber(e.target.value)}
                            placeholder="e.g. UA43T8000"
                            className="h-11 rounded-xl"
                        />
                        {/* Said out loud, because most people do not know they can
                            look and the ones who do give us the best information. */}
                        <p className="text-[11px] text-slate-500">
                            Usually on a sticker at the back of the TV. Helps us find the exact part.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Panel model</Label>
                        <Input
                            value={panelModel}
                            onChange={(e) => setPanelModel(e.target.value)}
                            placeholder="Only if you know it"
                            className="h-11 rounded-xl"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Your name</Label>
                        <Input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="h-11 rounded-xl"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">
                            Phone number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            inputMode="tel"
                            placeholder="01XXXXXXXXX"
                            className="h-11 rounded-xl"
                        />
                        <p className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Phone className="h-3 w-3" /> We call you on this number when the part arrives.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-700">Anything else</Label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="rounded-xl"
                            placeholder="Optional"
                        />
                    </div>

                    {error && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            {error}
                        </p>
                    )}

                    <Button
                        onClick={submit}
                        disabled={!ready || sending}
                        className={cn("h-12 w-full rounded-xl text-sm font-bold")}
                    >
                        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Send request
                    </Button>

                    {!ready && (
                        /* Which field is missing, rather than a dead button the
                           customer has to reverse-engineer. */
                        <p className="text-center text-[11px] text-slate-500">
                            Please choose {[
                                !brand && "brand",
                                !screenSize && "size",
                                !partName && "part",
                                phone.trim().length < 6 && "phone number",
                            ].filter(Boolean).join(", ")}.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Buttons rather than a select element.
 *
 * On a phone a native select opens a wheel that hides the rest of the form, and
 * these lists are short. Seeing every option at once is also what stops someone
 * abandoning the form because they could not tell whether their part was there.
 */
function Picker({
    label, value, onChange, options, required,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    required?: boolean;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">
                {label} {required && <span className="text-red-500">*</span>}
            </Label>
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={cn(
                            "rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                            value === option
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                        )}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}
