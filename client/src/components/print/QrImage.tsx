/**
 * A QR code made here, not fetched from somebody else's website.
 *
 * Every printed document in this system built its QR by loading an image from
 * api.qrserver.com. That means a shop with no internet, or a bad day at a
 * company nobody here has a contract with, prints a blank square on the job
 * slip — and the sticker on the back of a television is not something you can
 * reprint once the set has gone home.
 *
 * Rendered as an <img> with a data URL rather than a <canvas>, because print
 * paths in some browsers rasterise canvases badly or skip them entirely, and a
 * QR that survives the screen but not the printer is worse than none.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({
    value,
    size = 96,
    className,
    style,
}: {
    value: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        QRCode.toDataURL(value, {
            width: size * 3,          // oversampled so print stays crisp
            margin: 1,
            // Level H tolerates roughly 30% of the symbol being unreadable —
            // which a sticker on a workshop shelf will get, in dust and grease.
            errorCorrectionLevel: "H",
            color: { dark: "#000000", light: "#ffffff" },
        })
            .then((url) => { if (alive) setSrc(url); })
            .catch(() => { if (alive) setSrc(null); });
        return () => { alive = false; };
    }, [value, size]);

    if (!src) {
        // Holds the space so nothing reflows when the code arrives, and so a
        // failed render leaves an obvious blank rather than a collapsed layout.
        return <span className={className} style={{ display: "inline-block", width: size, height: size, ...style }} />;
    }

    return (
        <img
            src={src}
            alt=""
            width={size}
            height={size}
            className={className}
            style={{ width: size, height: size, imageRendering: "pixelated", ...style }}
        />
    );
}
