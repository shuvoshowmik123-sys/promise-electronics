/**
 * Take a photo, get back a hosted URL.
 *
 * The handover sheet asked a driver standing at a customer's door to "paste
 * image URL from upload" — into a phone, from nowhere. A required field that
 * cannot be filled where it is asked is not a control; it is a reason to use
 * the other path, or to make something up. This replaces it with the camera
 * the driver is already holding.
 *
 * The file is downscaled before upload because a modern phone photograph is
 * four megabytes, the driver is on mobile data at somebody's gate, and a
 * handover that waits thirty seconds on an upload gets abandoned. A condition
 * photo needs to show a screen and a crack, not to be printable.
 */
import { useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";

import { fetchApi } from "@/lib/api/httpClient";
import { cn } from "@/lib/utils";

/** Long edge in pixels. Enough to show a cracked panel, small enough to send. */
const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.72;

async function downscale(file: File): Promise<string> {
    const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the photo"));
        reader.readAsDataURL(file);
    });

    const image: HTMLImageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not open the photo"));
        img.src = dataUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    // Already small enough — re-encoding would only lose detail for nothing.
    if (scale === 1 && file.size < 900_000) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function PhotoCapture({
    value,
    onChange,
    label = "Photo",
    hint,
    fileNamePrefix = "handover",
    className,
}: {
    value: string;
    onChange: (url: string) => void;
    label?: string;
    hint?: string;
    fileNamePrefix?: string;
    className?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const take = async (file: File) => {
        setBusy(true);
        setError(null);
        try {
            const base64 = await downscale(file);
            const result = await fetchApi<{ url: string }>("/imagekit/upload", {
                method: "POST",
                body: JSON.stringify({
                    file: base64,
                    fileName: `${fileNamePrefix}-${Date.now()}.jpg`,
                }),
            });
            if (!result?.url) throw new Error("Upload returned no address");
            onChange(result.url);
        } catch (e: any) {
            // Said plainly, because the driver has a customer waiting and needs
            // to know whether to retry or to use the other path.
            setError(e?.message?.includes("not configured")
                ? "Photo storage is not set up. Ask the office to configure ImageKit."
                : "Could not upload the photo. Check the signal and try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={className}>
            <label className="text-xs font-bold uppercase text-slate-500">{label}</label>

            {value ? (
                <div className="mt-1 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2">
                    <img src={value} alt="" className="h-16 w-16 rounded-xl object-cover" />
                    <p className="flex-1 text-xs font-bold text-emerald-800">
                        <Check className="mr-1 inline h-3.5 w-3.5" /> Photo attached
                    </p>
                    <button
                        type="button"
                        onClick={() => { onChange(""); setError(null); }}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-white"
                        aria-label="Remove photo"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className={cn(
                        "mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed",
                        "border-slate-300 text-sm font-bold text-slate-600 active:scale-[0.99]",
                        busy && "opacity-60",
                    )}
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {busy ? "Uploading…" : "Take photo"}
                </button>
            )}

            {/*
              * capture="environment" asks Android for the rear camera directly
              * rather than the gallery, which is what somebody standing in
              * front of a television actually wants.
              */}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Cleared so the same photo can be retaken after a failure.
                    e.target.value = "";
                    if (file) void take(file);
                }}
            />

            {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
            {error && <p className="mt-1 text-[11px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
