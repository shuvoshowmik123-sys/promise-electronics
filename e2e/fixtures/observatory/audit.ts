/**
 * The state audit: what is wrong with the screen as it stands right now.
 *
 * The recorder watches time. This watches a moment. Between them they cover
 * the two ways a mobile screen fails — it misbehaves while you use it, or it
 * is already wrong when it arrives.
 *
 * Every check here earned its place on a real defect in this system:
 *
 *   covered      the POS "Add to sale" button, unreachable under the dock and
 *                then under the install banner, so a sourced part could not be
 *                added at all
 *   offscreen    the "Due" payment chip, 35px past the right edge
 *   touchTarget  36px inputs across the sourced-part form
 *   overlap      the drawer count card riding over its own heading
 *   clipped      text cut off inside its own box
 *
 * The rule for adding a check: it must be something a screenshot would not
 * make obvious, or something an agent would have to spend tokens squinting at.
 */

import type { Page } from "@playwright/test";

export type Finding = {
    /** Machine-readable, so findings can be deduped across states. */
    rule: string;
    severity: "high" | "medium" | "low";
    element: string;
    detail: string;
};

/** Runs in the page — self-contained, no imports. */
function auditPage() {
    const findings: Array<{ rule: string; severity: string; element: string; detail: string }> = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const describe = (el: Element): string => {
        const tag = el.tagName.toLowerCase();
        const testId = el.getAttribute("data-testid");
        if (testId) return `${tag}[${testId}]`;
        const label = (el.getAttribute("aria-label") || (el as HTMLInputElement).placeholder || el.textContent || "")
            .trim().replace(/\s+/g, " ").slice(0, 30);
        return label ? `${tag} "${label}"` : (el.id ? `${tag}#${el.id}` : tag);
    };

    const visible = (el: Element, r: DOMRect): boolean => {
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
        // Off the top or bottom is scrolling, not a defect.
        return r.bottom > 0 && r.top < vh;
    };

    /**
     * When a sheet is open, only audit what is inside it.
     *
     * Everything behind a modal is legitimately covered — that is what a modal
     * is for — and reporting it produced eleven "covered" findings for one open
     * drawer, which buries the one real blocker under ten pieces of noise. The
     * topmost near-full-screen fixed layer is treated as the live surface.
     */
    const modal = Array.from(document.querySelectorAll("body *"))
        .map((el) => ({ el, cs: getComputedStyle(el), r: el.getBoundingClientRect() }))
        .filter(({ cs, r }) =>
            cs.position === "fixed" &&
            Number.isFinite(parseInt(cs.zIndex, 10)) && parseInt(cs.zIndex, 10) >= 40 &&
            r.width >= vw * 0.8 && r.height >= vh * 0.5 &&
            cs.visibility !== "hidden" && cs.opacity !== "0")
        .sort((a, b) => parseInt(b.cs.zIndex, 10) - parseInt(a.cs.zIndex, 10))[0]?.el ?? null;

    const root: ParentNode = modal ?? document;
    const controls = Array.from(root.querySelectorAll("button,[role=button],a,input,select,textarea"));

    for (const el of controls) {
        const r = el.getBoundingClientRect();
        if (!visible(el, r)) continue;
        const name = describe(el);

        // 44px is the smallest target a thumb hits reliably; below that people
        // miss and blame themselves.
        if (r.height < 44 || r.width < 44) {
            findings.push({
                rule: "touch-target",
                severity: r.height < 32 || r.width < 32 ? "high" : "medium",
                element: name,
                detail: `${Math.round(r.width)}x${Math.round(r.height)}px`,
            });
        }

        // Past the edge of the screen with no indication it is there.
        if (r.right > vw + 1 || r.left < -1) {
            findings.push({
                rule: "offscreen",
                severity: "high",
                element: name,
                detail: `x ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}px viewport`,
            });
        }

        /**
         * The check that found the unreachable button.
         *
         * An element can be perfectly visible and still untappable, because
         * something transparent or floating sits over it. Asking the browser
         * what is actually at that point is the only honest test — and it is
         * exactly what a screenshot cannot tell you.
         */
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        if (cx > 0 && cy > 0 && cx < vw && cy < vh) {
            const hit = document.elementFromPoint(cx, cy);
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
                findings.push({
                    rule: "covered",
                    severity: "high",
                    element: name,
                    detail: `covered at its centre by ${describe(hit)}`,
                });
            }
        }
    }

    // Text cut off inside its own box, which usually means a fixed width
    // somebody chose for English meeting a longer word.
    for (const el of Array.from(root.querySelectorAll("p,span,h1,h2,h3,h4,label,div"))) {
        const r = el.getBoundingClientRect();
        if (!visible(el, r) || r.width < 40) continue;
        if (el.children.length > 0) continue; // leaf nodes only
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible" && cs.textOverflow !== "ellipsis") continue;
        if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis") {
            findings.push({
                rule: "clipped-text",
                severity: "low",
                element: describe(el),
                detail: `content ${el.scrollWidth}px in a ${el.clientWidth}px box`,
            });
        }
    }

    // The page itself should never scroll sideways on a phone.
    if (document.documentElement.scrollWidth > vw + 1) {
        findings.push({
            rule: "page-overflow",
            severity: "high",
            element: "document",
            detail: `page is ${document.documentElement.scrollWidth}px wide on a ${vw}px screen`,
        });
    }

    /**
     * What is painted over what.
     *
     * Not a finding by itself — reported as context, because a stack of four
     * overlapping layers is how the Close Register sheet ended up translucent
     * over a bright cart, and no single element was at fault.
     */
    const layers = Array.from(document.querySelectorAll("body *"))
        .map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return { el, cs, z: parseInt(cs.zIndex, 10), r };
        })
        .filter(({ cs, z, r }) =>
            (cs.position === "fixed" || cs.position === "absolute") &&
            Number.isFinite(z) && z >= 40 && r.width > 150 && r.height > 100 &&
            cs.visibility !== "hidden" && cs.opacity !== "0")
        .sort((a, b) => b.z - a.z)
        .slice(0, 8)
        .map(({ el, cs, z, r }) => ({
            z,
            element: describe(el),
            box: `${Math.round(r.width)}x${Math.round(r.height)}`,
            background: cs.backgroundColor,
            // A translucent full-screen layer is nearly always a mistake.
            translucent: /rgba?\([^)]*0?\.\d+\)/.test(cs.backgroundColor) || cs.opacity !== "1",
        }));

    return {
        findings,
        layers,
        viewport: { width: vw, height: vh },
        surface: modal ? describe(modal) : "page",
    };
}

export type AuditResult = {
    findings: Finding[];
    /** Which surface was audited: the page, or the open sheet on top of it. */
    surface: string;
    layers: Array<{ z: number; element: string; box: string; background: string; translucent: boolean }>;
    viewport: { width: number; height: number };
};

export async function auditState(page: Page): Promise<AuditResult> {
    return page.evaluate(auditPage) as Promise<AuditResult>;
}
