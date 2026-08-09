/**
 * FIND YOUR FAULT — a television that performs the customer's problem.
 *
 * This replaces two blocks that used to sit one above the other: a grid of
 * symptom tiles that only linked to /repair, and a three-dropdown estimate
 * calculator. Both asked the customer to name their fault in our words before
 * anything happened. Showing the fault instead means someone who cannot say
 * "vertical lines" can still point at their problem, which matters a great
 * deal when half the people reading this are not reading in English.
 *
 * Three steps, one at a time, so the card stays short: pick the symptom and
 * watch it happen, describe the set, then see the estimate.
 *
 * The estimate is deliberately a range, and every path out of it says the same
 * thing — this is not a quote, the real price comes after a free inspection.
 * Nothing here should ever be argued about at the counter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { CarouselSelector, ScreenSizeGlyph } from "@/components/mobile/CarouselSelector";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { sizeFromModel, brandFromModel, looksLikeModel } from "@shared/tv-model";
import { cn } from "@/lib/utils";

type Bucket = "small" | "medium" | "large";
type PriceMatrix = Record<string, Record<Bucket, [number, number]>>;

export interface FaultSimulatorProps {
    brands: string[];
    sizes: string[];
    priceMatrix: PriceMatrix;
    sizeBucket: (size: string) => Bucket;
}

/**
 * Faults in the customer's words, each paired with the price row it reads from.
 *
 * `priceKey` points at the existing repair_price_matrix rows rather than
 * introducing a parallel price list — the shop already maintains those in
 * Settings and a second copy would drift within a month.
 */
type Fault = {
    id: string;
    priceKey: string;
    en: string; bn: string;
    capEn: string; capBn: string;
    causeEn: string; causeBn: string;
    noteEn: string; noteBn: string;
    days: string;
    /** Panel-level faults are usually bad news; the card says so in amber. */
    hard?: boolean;
    audio?: "dead" | "jitter";
};

const FAULTS: Fault[] = [
    {
        id: "no_power", priceKey: "No Power",
        en: "No Power", bn: "পাওয়ার নেই",
        capEn: "Dead — no light, no sound", capBn: "সম্পূর্ণ বন্ধ",
        causeEn: "Usually the power board", causeBn: "সাধারণত পাওয়ার বোর্ড",
        noteEn: "A blown fuse or a swollen capacitor. One of the quicker repairs.",
        noteBn: "ফিউজ বা ক্যাপাসিটর নষ্ট। দ্রুত মেরামতের একটি।",
        days: "1–2",
    },
    {
        id: "no_display", priceKey: "No Display",
        en: "No Picture", bn: "ছবি নেই",
        capEn: "Backlight on, no image", capBn: "ব্যাকলাইট জ্বলছে, ছবি নেই",
        causeEn: "Main board or T-Con", causeBn: "মেইন বোর্ড বা টি-কন",
        noteEn: "Sound usually still works. We test the T-Con first — it is the cheaper of the two.",
        noteBn: "শব্দ সাধারণত থাকে। আগে টি-কন পরীক্ষা করি — এটি সস্তা।",
        days: "2–3",
    },
    {
        id: "vlines", priceKey: "Lines on Screen",
        en: "Vertical Lines", bn: "খাড়া লাইন",
        capEn: "Lines running top to bottom", capBn: "উপর থেকে নিচে লাইন",
        causeEn: "T-Con board / source driver", causeBn: "টি-কন বোর্ড / সোর্স ড্রাইভার",
        noteEn: "Good news — vertical lines are driven by the T-Con and are usually repairable without a new panel.",
        noteBn: "সুখবর — খাড়া লাইন সাধারণত প্যানেল ছাড়াই ঠিক হয়।",
        days: "2–4",
    },
    {
        id: "hlines", priceKey: "Lines on Screen",
        en: "Horizontal Lines", bn: "আড়াআড়ি লাইন",
        capEn: "Bands running side to side", capBn: "পাশ থেকে পাশে দাগ",
        causeEn: "Gate driver on the panel", causeBn: "প্যানেলের গেট ড্রাইভার",
        noteEn: "Honest warning: horizontal lines come from the panel glass itself. Sometimes a bond can be re-flowed, but often the panel must be replaced.",
        noteBn: "সৎ কথা: আড়াআড়ি লাইন প্যানেলের নিজের সমস্যা। অনেক সময় প্যানেল বদলাতে হয়।",
        days: "3–6", hard: true,
    },
    {
        id: "backlight", priceKey: "Dim / No Backlight",
        en: "Dark Screen", bn: "অন্ধকার স্ক্রিন",
        capEn: "Image is there, but very dark", capBn: "ছবি আছে, কিন্তু খুব অন্ধকার",
        causeEn: "LED backlight strips", causeBn: "এলইডি ব্যাকলাইট স্ট্রিপ",
        noteEn: "Shine a torch at the screen — if a faint picture appears, this is it.",
        noteBn: "টর্চ ধরলে যদি হালকা ছবি দেখা যায়, তবে এটিই।",
        days: "2–3",
    },
    {
        id: "broken", priceKey: "Broken Screen",
        en: "Broken Screen", bn: "স্ক্রিন ভাঙা",
        capEn: "Dark patch spreading from the impact", capBn: "আঘাতের জায়গা থেকে কালো দাগ",
        causeEn: "Panel replacement", causeBn: "প্যানেল পরিবর্তন",
        noteEn: "The dark patch is liquid crystal leaking inside the glass, and it spreads. A cracked panel cannot be repaired, only replaced.",
        noteBn: "কালো দাগ ভিতরের লিকুইড ক্রিস্টাল, এটি ছড়ায়। ফাটা প্যানেল বদলাতেই হয়।",
        days: "3–7", hard: true,
    },
    {
        id: "hang", priceKey: "Software / Smart TV",
        en: "Hangs / Freezes", bn: "হ্যাং করে",
        capEn: "Picture freezes, remote stops responding", capBn: "ছবি আটকে যায়, রিমোট কাজ করে না",
        causeEn: "Smart TV software or memory", causeBn: "স্মার্ট টিভি সফটওয়্যার বা মেমরি",
        noteEn: "Usually firmware or storage, and usually the cheapest thing we do. If a reflash does not hold, the main board is next.",
        noteBn: "সাধারণত ফার্মওয়্যার বা স্টোরেজ, এবং সবচেয়ে কম খরচের কাজ। না সারলে মেইন বোর্ড দেখা হয়।",
        days: "1–2",
    },
    {
        id: "jitter", priceKey: "Sound Issue",
        en: "Sound Jitter", bn: "শব্দ কাঁপে",
        capEn: "Audio crackles and cuts in and out", capBn: "শব্দ কেটে কেটে আসে",
        causeEn: "Speaker lead or amplifier IC", causeBn: "স্পিকারের তার বা অ্যামপ্লিফায়ার",
        noteEn: "Crackling that comes and goes is usually a loose speaker lead or a failing amplifier — not the panel, and not expensive.",
        noteBn: "কেটে কেটে আসা শব্দ সাধারণত স্পিকারের তার বা অ্যামপ্লিফায়ার — প্যানেল নয়, খরচও কম।",
        days: "1–2", audio: "jitter",
    },
    {
        id: "sound", priceKey: "Sound Issue",
        en: "No Sound", bn: "শব্দ নেই",
        capEn: "Picture is fine, audio is dead", capBn: "ছবি ঠিক, শব্দ নেই",
        causeEn: "Speaker or amplifier IC", causeBn: "স্পিকার বা অ্যামপ্লিফায়ার",
        noteEn: "Often just a speaker lead. Among the cheapest repairs we do.",
        noteBn: "অনেক সময় শুধু স্পিকারের তার। আমাদের সবচেয়ে সস্তা মেরামতের একটি।",
        days: "1–2", audio: "dead",
    },
];

/** One ten-second test the customer can run, that genuinely splits the price. */
type Refine = { qEn: string; qBn: string; yesEn: string; yesBn: string; noEn: string; noBn: string; yesHigh?: boolean };
const REFINE: Record<string, Refine> = {
    no_power: {
        qEn: "Is there any small standby light on the TV?", qBn: "টিভিতে ছোট স্ট্যান্ডবাই আলো জ্বলে?",
        yesEn: "Power is reaching the board — main board suspected", yesBn: "বোর্ডে পাওয়ার যাচ্ছে — মেইন বোর্ড সন্দেহ",
        noEn: "No standby light — power board almost certain", noBn: "আলো নেই — পাওয়ার বোর্ড প্রায় নিশ্চিত",
        yesHigh: true,
    },
    no_display: {
        qEn: "Can you still hear the sound?", qBn: "শব্দ কি শোনা যায়?",
        yesEn: "Sound works — the fault is on the panel side, usually T-Con", yesBn: "শব্দ আছে — প্যানেলের দিকে, সাধারণত টি-কন",
        noEn: "No sound either — main board suspected", noBn: "শব্দও নেই — মেইন বোর্ড সন্দেহ",
    },
    vlines: {
        qEn: "Do the lines change if you press gently on the screen edge?", qBn: "স্ক্রিনের কিনারায় চাপ দিলে লাইন বদলায়?",
        yesEn: "A loose bond — often re-flowed without new parts", yesBn: "ঢিলা বন্ড — অনেক সময় নতুন পার্টস ছাড়াই ঠিক হয়",
        noEn: "A failed driver — the T-Con board is replaced", noBn: "ড্রাইভার নষ্ট — টি-কন বোর্ড বদলাতে হয়",
    },
    hlines: {
        qEn: "Do the bands change if you press gently on the screen edge?", qBn: "কিনারায় চাপ দিলে দাগ বদলায়?",
        yesEn: "A loose bond — there is a real chance we save the panel", yesBn: "ঢিলা বন্ড — প্যানেল বাঁচানোর সম্ভাবনা আছে",
        noEn: "The gate driver itself has failed — usually a panel replacement", noBn: "গেট ড্রাইভার নষ্ট — সাধারণত প্যানেল বদল",
    },
    backlight: {
        qEn: "Shine a torch at the screen — can you see a faint picture?", qBn: "টর্চ ধরলে হালকা ছবি দেখা যায়?",
        yesEn: "Picture is alive behind the dark — backlight strips confirmed", yesBn: "ছবি আছে — ব্যাকলাইট স্ট্রিপ নিশ্চিত",
        noEn: "Nothing behind the dark — the panel may also be involved", noBn: "কিছু নেই — প্যানেলও জড়িত থাকতে পারে",
    },
    hang: {
        qEn: "If you unplug it for a minute, does it work again for a while?", qBn: "এক মিনিট প্লাগ খুলে রাখলে কিছুক্ষণ চলে?",
        yesEn: "Recovers on a restart — software or storage, the cheapest case", yesBn: "রিস্টার্টে ঠিক হয় — সফটওয়্যার, সবচেয়ে কম খরচ",
        noEn: "Does not recover — the main board is likely involved", noBn: "ঠিক হয় না — মেইন বোর্ড জড়িত",
    },
    jitter: {
        qEn: "Does it crackle at every volume, even low?", qBn: "কম ভলিউমেও কি খরখর করে?",
        yesEn: "Crackles throughout — a loose lead or connector", yesBn: "সবসময় খরখর — ঢিলা তার বা কানেক্টর",
        noEn: "Only when loud — the amplifier IC is failing", noBn: "শুধু জোরে — অ্যামপ্লিফায়ার আইসি নষ্ট",
    },
    sound: {
        qEn: "Does sound work through headphones or a sound bar?", qBn: "হেডফোন বা সাউন্ডবারে শব্দ আসে?",
        yesEn: "Output works — the internal speakers are the fault", yesBn: "আউটপুট ঠিক — ভিতরের স্পিকার নষ্ট",
        noEn: "No output at all — the amplifier stage is suspected", noBn: "কোনো আউটপুট নেই — অ্যামপ্লিফায়ার সন্দেহ",
    },
};

const money = (n: number) => `৳${n.toLocaleString("en-US")}`;

export function FaultSimulator({ brands, sizes, priceMatrix, sizeBucket }: FaultSimulatorProps) {
    const { language } = useCustomerLanguage();
    const [, setLocation] = useLocation();
    const bn = language === "bn";

    const [step, setStep] = useState(1);
    const [fault, setFault] = useState<Fault | null>(null);
    const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
    const [brand, setBrand] = useState("");
    const [size, setSize] = useState("");
    const [model, setModel] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");

    /** What the server thinks of the typed model, and whether it was dismissed. */
    const [check, setCheck] = useState<null | { brand?: string; sizeInches?: number; status: string }>(null);
    const [dismissed, setDismissed] = useState(false);

    const L = <T extends string>(en: T, bnText: T) => (bn ? bnText : en);

    /**
     * Ask the server about the model, on a pause rather than per keystroke.
     *
     * The reader that answers most of these is pure client-side arithmetic, but
     * the learned encyclopedia lives on the server, so this is a request — and
     * a request per character typed on a homepage widget is exactly the kind of
     * thing that makes a site feel slow.
     */
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const typed = model.trim();
        if (!typed || !looksLikeModel(typed)) { setCheck(null); return; }

        // Answer instantly from the number itself where we can; the request
        // only ever adds what the pattern could not read.
        const local = { brand: brandFromModel(typed) ?? undefined, sizeInches: sizeFromModel(typed) ?? undefined };
        if (local.brand || local.sizeInches) setCheck({ ...local, status: "notice" });

        timer.current = setTimeout(() => {
            fetch("/api/tv-model/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: typed, brand, size }),
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (d && d.status !== "unreadable") setCheck(d); })
                // A courtesy check must never be the reason anything breaks.
                .catch(() => { /* keep whatever the local read gave us */ });
        }, 500);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [model, brand, size]);

    const mismatch = useMemo(() => {
        if (!check || dismissed) return null;
        const bClash = !!(check.brand && brand && check.brand.toLowerCase() !== brand.toLowerCase());
        const sClash = !!(check.sizeInches && size && parseInt(size, 10) !== check.sizeInches);
        if (!bClash && !sClash) return null;
        return { bClash, sClash, brand: check.brand, sizeInches: check.sizeInches };
    }, [check, brand, size, dismissed]);

    const sizeLabelFor = useCallback(
        (inches: number) => sizes.find((s) => parseInt(s, 10) === inches) ?? `${inches}"`,
        [sizes],
    );

    const estimate = useMemo(() => {
        if (!fault || !size) return null;
        const row = priceMatrix[fault.priceKey];
        const base = row?.[sizeBucket(size)];
        if (!base) return null;
        let [lo, hi] = base;
        const r = REFINE[fault.id];
        let extra = "";
        if (r && answer) {
            // Answering narrows the range — the visible reward for answering,
            // and what a real diagnosis actually does.
            const high = (answer === "yes") === !!r.yesHigh;
            if (high) lo = Math.round(lo + (hi - lo) * 0.4);
            else hi = Math.round(lo + (hi - lo) * 0.5);
            extra = ` — ${answer === "yes" ? L(r.yesEn, r.yesBn) : L(r.noEn, r.noBn)}`;
        }
        return { lo, hi, extra, confident: !!(r && answer) };
    }, [fault, size, answer, priceMatrix, sizeBucket, bn]);

    const go = (n: number) => setStep(n);

    const submit = () => {
        if (!fault) return;
        const params = new URLSearchParams({ issue: fault.en });
        if (brand) params.set("brand", brand);
        if (size) params.set("size", size);
        if (model.trim()) params.set("model", model.trim().toUpperCase());
        setLocation(`/repair?${params.toString()}`);
    };

    const filteredBrands = brands.filter((b) => b.toLowerCase().includes(query.toLowerCase()));

    return (
        <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-950 mb-1">{L("Find Your Fault", "সমস্যা খুঁজুন")}</h3>
            <p className="text-xs text-slate-500 mb-4">
                {L("Tap what you see. We will show it on screen and estimate the repair.",
                   "যা দেখছেন চাপ দিন। আমরা স্ক্রিনে দেখাবো এবং খরচের ধারণা দেবো।")}
            </p>

            <div className="rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden pb-4">
                {/* progress */}
                <div className="flex gap-1.5 px-4 pt-4">
                    {[1, 2, 3].map((n) => (
                        <span key={n} className={cn("h-1 flex-1 rounded-full transition-colors",
                            n <= step ? "bg-emerald-600" : "bg-slate-100")} />
                    ))}
                </div>

                <FaultScreen fault={fault} caption={fault ? L(fault.capEn, fault.capBn) : L("Working normally", "স্বাভাবিক চলছে")} size={size} />

                {step === 1 && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-200">
                        <p className="px-5 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {L("Tap what you see", "যা দেখছেন চাপ দিন")}
                        </p>
                        <div className="flex flex-wrap gap-2 px-5 pt-3">
                            {FAULTS.map((f) => (
                                <button
                                    key={f.id} type="button"
                                    onClick={() => { setFault(f); setAnswer(null); }}
                                    className={cn(
                                        "rounded-full border px-4 py-2 text-[12.5px] font-bold transition-colors active:scale-[0.97]",
                                        fault?.id === f.id
                                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-200"
                                            : "border-slate-200 bg-white text-slate-700",
                                    )}
                                >
                                    {L(f.en, f.bn)}
                                </button>
                            ))}
                        </div>

                        {fault && REFINE[fault.id] && (
                            <div className="mx-5 mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                                <p className="text-[12.5px] font-bold leading-snug text-slate-800">
                                    {L(REFINE[fault.id].qEn, REFINE[fault.id].qBn)}
                                </p>
                                <div className="mt-2.5 flex gap-2">
                                    {(["yes", "no"] as const).map((v) => (
                                        <button
                                            key={v} type="button" onClick={() => setAnswer(v)}
                                            className={cn(
                                                "flex-1 rounded-xl border py-2 text-[12.5px] font-bold transition-colors",
                                                answer === v
                                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                                    : "border-slate-200 bg-white text-slate-600",
                                            )}
                                        >
                                            {v === "yes" ? L("Yes", "হ্যাঁ") : L("No", "না")}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="px-5 pt-4">
                            <button
                                type="button" disabled={!fault} onClick={() => go(2)}
                                className="h-13 w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                            >
                                {L("Next", "পরবর্তী")}
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-200 px-1">
                        <div className="flex items-baseline justify-between gap-2 px-5 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{L("Brand", "ব্র্যান্ড")}</p>
                            {brand && <span className="truncate text-xs font-bold text-emerald-700">{brand}</span>}
                        </div>
                        <div className="px-5 pt-2">
                            <CarouselSelector
                                ariaLabel={L("Brand", "ব্র্যান্ড")}
                                options={brands.slice(0, 6)}
                                value={brand}
                                onSelect={setBrand}
                                cardClassName="h-[54px] w-[88px]"
                                trailing={
                                    <button
                                        type="button" onClick={() => { setSearchOpen(true); setQuery(""); }}
                                        className="flex h-[54px] w-[88px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 px-2 text-emerald-700"
                                    >
                                        <Search className="h-4 w-4" aria-hidden />
                                        <span className="text-[12px] font-bold leading-tight">{L("Search all", "সব")}</span>
                                    </button>
                                }
                            />
                        </div>

                        <div className="flex items-baseline justify-between gap-2 px-5 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{L("Screen size", "স্ক্রিন সাইজ")}</p>
                            {size && <span className="truncate text-xs font-bold text-emerald-700">{size}</span>}
                        </div>
                        <div className="px-5 pt-2">
                            <CarouselSelector
                                ariaLabel={L("Screen size", "স্ক্রিন সাইজ")}
                                options={sizes}
                                value={size}
                                onSelect={setSize}
                                cardClassName="h-[84px] w-[70px]"
                                formatLabel={(o) => o.replace(/\s*inch$/i, '"')}
                                renderVisual={(o, sel) => <ScreenSizeGlyph option={o} selected={sel} />}
                            />
                        </div>

                        <div className="px-5 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {L("Model number", "মডেল নম্বর")} <span className="text-slate-300">· {L("optional", "ঐচ্ছিক")}</span>
                            </p>
                            <input
                                value={model}
                                onChange={(e) => { setModel(e.target.value); setDismissed(false); }}
                                placeholder="UA55AU7700"
                                autoCapitalize="characters" autoComplete="off" spellCheck={false}
                                /* 16px, or iOS zooms the page on focus and leaves
                                   the customer scrolled sideways mid-form. */
                                className="mt-2 h-12 w-full rounded-2xl border border-emerald-100 bg-emerald-50/30 px-4 text-[16px] font-semibold uppercase text-slate-900 outline-none placeholder:normal-case placeholder:font-medium placeholder:text-slate-400 focus:border-emerald-400"
                            />
                            <p className="mt-1.5 text-[10.5px] leading-snug text-slate-400">
                                {L("Usually on a sticker at the back. It helps us check parts before we collect.",
                                   "সাধারণত পেছনে স্টিকারে থাকে। এতে আগেই পার্টস দেখে রাখতে পারি।")}
                            </p>

                            {/* A reminder, never a correction. Nothing changes unless they tap. */}
                            {mismatch && (
                                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                        {L("Just checking", "একটু দেখে নিন")}
                                    </p>
                                    <p className="mt-1.5 text-[12px] font-semibold leading-snug text-amber-900">
                                        {L("Your model number looks like a ", "আপনার মডেল নম্বর দেখে ")}
                                        <b>{[mismatch.brand, mismatch.sizeInches ? sizeLabelFor(mismatch.sizeInches) : null].filter(Boolean).join(" ")}</b>
                                        {L(", but you selected ", " মনে হচ্ছে, কিন্তু আপনি বেছেছেন ")}
                                        <b>{[mismatch.bClash ? brand : null, mismatch.sClash ? size : null].filter(Boolean).join(" ")}</b>.
                                    </p>
                                    <div className="mt-2.5 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (mismatch.brand && brands.includes(mismatch.brand)) setBrand(mismatch.brand);
                                                if (mismatch.sizeInches) {
                                                    const match = sizes.find((s) => parseInt(s, 10) === mismatch.sizeInches);
                                                    if (match) setSize(match);
                                                }
                                                setDismissed(true);
                                            }}
                                            className="flex-1 rounded-xl bg-amber-500 py-2 text-[12px] font-bold text-white"
                                        >
                                            {L("Use that", "সেটি ব্যবহার করুন")}
                                        </button>
                                        <button
                                            type="button" onClick={() => setDismissed(true)}
                                            className="flex-1 rounded-xl border border-amber-300 bg-white py-2 text-[12px] font-bold text-amber-800"
                                        >
                                            {L("Mine is correct", "আমারটাই ঠিক")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 px-5 pt-4">
                            <button type="button" onClick={() => go(1)}
                                className="w-[84px] rounded-2xl bg-slate-100 py-3.5 text-sm font-bold text-slate-600">
                                {L("Back", "পেছনে")}
                            </button>
                            <button
                                type="button" disabled={!brand || !size} onClick={() => go(3)}
                                className="flex-1 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                            >
                                {L("Next", "পরবর্তী")}
                            </button>
                        </div>

                        {searchOpen && (
                            <div className="fixed inset-0 z-50 flex items-end bg-slate-900/45" onClick={() => setSearchOpen(false)}>
                                <div className="max-h-[74%] w-full rounded-t-3xl bg-white p-4 pb-8" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                                        placeholder={L("Search brand…", "ব্র্যান্ড খুঁজুন…")}
                                        className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-[16px] outline-none focus:border-emerald-400"
                                    />
                                    <div className="mt-3 max-h-[52vh] space-y-1.5 overflow-y-auto">
                                        {filteredBrands.map((b) => (
                                            <button
                                                key={b} type="button"
                                                onClick={() => { setBrand(b); setSearchOpen(false); }}
                                                className="w-full rounded-xl bg-slate-50 px-4 py-3 text-left text-[13.5px] font-bold text-slate-700 active:bg-emerald-50"
                                            >
                                                {b}
                                            </button>
                                        ))}
                                        {filteredBrands.length === 0 && (
                                            <p className="px-2 py-4 text-[13px] text-slate-400">{L("No brand matches", "কোনো ব্র্যান্ড মেলেনি")}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {step === 3 && fault && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-200">
                        {estimate ? (
                            <div className={cn("mx-4 mt-4 rounded-2xl p-4 text-white shadow-lg",
                                fault.hard ? "bg-gradient-to-br from-orange-700 to-orange-600 shadow-orange-200"
                                           : "bg-gradient-to-br from-emerald-800 to-emerald-600 shadow-emerald-200")}>
                                <p className={cn("text-[9px] font-bold uppercase tracking-widest",
                                    fault.hard ? "text-orange-200" : "text-emerald-200")}>
                                    {L("Likely cause", "সম্ভাব্য কারণ")} · {brand} {size}
                                </p>
                                <p className="mt-1 text-base font-black">{L(fault.causeEn, fault.causeBn)}</p>
                                <p className={cn("mt-1.5 text-[11.5px] leading-relaxed",
                                    fault.hard ? "text-orange-100" : "text-emerald-50/90")}>
                                    {L(fault.noteEn, fault.noteBn)}{estimate.extra}
                                </p>
                                <p className="mt-3 border-t border-white/20 pt-3 text-2xl font-black tracking-tight">
                                    {money(estimate.lo)} – {money(estimate.hi)}
                                </p>
                                <p className={cn("mt-0.5 text-[9.5px]", fault.hard ? "text-orange-200" : "text-emerald-200")}>
                                    {L("Confirmed after free inspection", "ফ্রি পরীক্ষার পর নিশ্চিত")} ·{" "}
                                    {estimate.confident ? L("Confidence: High", "নিশ্চয়তা: বেশি") : L("Confidence: Medium", "নিশ্চয়তা: মাঝারি")}
                                </p>
                                <div className="mt-3 flex gap-1.5">
                                    {[[fault.days, L("Days", "দিন")], ["3 mo", L("Warranty", "ওয়ারেন্টি")], ["100%", L("Genuine", "জেনুইন")]].map(([v, k]) => (
                                        <div key={String(k)} className="flex-1 rounded-xl bg-white/10 px-1 py-1.5 text-center">
                                            <p className="text-[12px] font-black">{v}</p>
                                            <p className={cn("text-[8.5px]", fault.hard ? "text-orange-200" : "text-emerald-200")}>{k}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mx-4 mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-sm font-semibold text-slate-700">
                                    {L("We will price this after inspection.", "পরীক্ষার পর আমরা দাম জানাবো।")}
                                </p>
                            </div>
                        )}

                        <p className="mx-5 mt-4 text-center text-[13.5px] font-bold leading-snug text-slate-900">
                            {L("Would you like us to collect it and give you a firm price?",
                               "আমরা কি টিভিটি নিয়ে গিয়ে সঠিক দাম জানাবো?")}
                        </p>
                        <div className="px-5 pt-3">
                            <button type="button" onClick={submit}
                                className="w-full rounded-2xl bg-emerald-600 py-4 text-[15px] font-bold text-white shadow-lg shadow-emerald-200">
                                {L("Send a service request →", "সার্ভিস রিকোয়েস্ট পাঠান →")}
                            </button>
                            <button type="button" onClick={() => go(1)}
                                className="mt-1 w-full py-3 text-[12.5px] font-bold text-slate-500">
                                {L("← Change my answers", "← উত্তর বদলান")}
                            </button>
                        </div>
                        <p className="mx-6 mt-1 text-center text-[10px] leading-relaxed text-slate-400">
                            {L("This value may change when your TV reaches our store. After a full and final inspection you will receive your final quotation, and nothing is charged until you approve it.",
                               "আপনার টিভি আমাদের দোকানে আসার পর এই দাম পরিবর্তন হতে পারে। সম্পূর্ণ পরীক্ষার পর চূড়ান্ত কোটেশন পাবেন, এবং আপনি রাজি না হলে কোনো খরচ নেই।")}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * The television itself.
 *
 * The picture drifts slowly so the set looks alive — without motion there is
 * no way to show a picture FREEZING, because a still frame that stops is still
 * a still frame. Every fault is driven by one data attribute so a layer can
 * never be left switched on from a previous selection.
 */
function FaultScreen({ fault, caption, size }: { fault: Fault | null; caption: string; size: string }) {
    const inches = parseInt(size, 10);
    const scale = Number.isFinite(inches) ? Math.min(1.08, Math.max(0.88, 0.88 + (inches - 24) * 0.004)) : 1;

    return (
        <div className="flex flex-col items-center px-5 pt-4">
            <div
                data-fault={fault?.id ?? ""}
                className="fault-tv relative rounded-[9px] bg-slate-900 p-1.5 pb-2 shadow-lg shadow-slate-900/20"
                style={{ width: 238, height: 143, transform: `scale(${scale})`, transformOrigin: "bottom center", transition: "transform .35s ease" }}
            >
                <div className="relative h-full w-full overflow-hidden rounded-[4px] bg-black">
                    <div className="fault-pic absolute inset-0 bg-gradient-to-br from-sky-900 via-teal-700 to-amber-500" />
                    <div className="fault-glow absolute inset-0" />
                    <div className="fault-v absolute inset-0" />
                    <div className="fault-h absolute inset-0" />
                    <div className="fault-crack absolute inset-0" />
                    <div className="fault-buffer absolute inset-0 grid place-items-center">
                        <span className="block h-6 w-6 rounded-full border-[2.5px] border-white/30 border-t-white/95" />
                    </div>
                </div>
                <span className="fault-led absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-500" />
            </div>
            <span className="h-2.5 w-3.5 bg-slate-800" />
            <span className="h-1.5 w-14 rounded-b-md bg-slate-800" />

            {fault?.audio && (
                <div className="mt-2.5 flex h-5 items-end gap-[3px]">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className={cn("w-1 rounded-sm", fault.audio === "jitter" ? "fault-bar bg-amber-500" : "h-[3px] bg-slate-300")} />
                    ))}
                </div>
            )}
            <p className="mt-2.5 min-h-[16px] text-center text-[12px] font-bold text-emerald-700">{caption}</p>
        </div>
    );
}
