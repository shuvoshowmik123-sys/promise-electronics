const PORTAL_META: Record<string, { manifest: string; theme: string; title: string }> = {
  admin: { manifest: "/manifest-admin.json", theme: "#0f172a", title: "Promise Admin" },
  corporate: { manifest: "/manifest-corporate.json", theme: "#1e40af", title: "Promise Corporate" },
};

/**
 * What the pre-hydration loader says, per portal.
 *
 * client/index.html ships one hardcoded loader — headline, the "Secure
 * customer sign-in / Google Sign-In" box, and "Preparing your customer
 * portal" — written for the customer site, because historically it was the
 * only site this loader ever needed to describe. It is shown on every route
 * while React boots, unconditionally, so a staff member opening /admin/login
 * saw customer marketing copy and a Google sign-in pitch that does not exist
 * on that screen, for however long the JS bundle took to arrive.
 *
 * In dev mode that window is not a flicker. Vite transforms each module on
 * request rather than serving a bundle, so admin's ten-plus lazy chunks boot
 * over several real network round trips — long enough to read the wrong
 * headline. A QA agent driving the browser by URL, one fresh navigation per
 * verification step, sees this on every single step: customer copy, then the
 * real screen, over and over across a long run. That is what "reloading
 * continuously" turned out to be — not a reload loop, a boot placeholder that
 * had never been told which site it was loading.
 *
 * Rewritten here, server-side, so the fix is in the first bytes sent rather
 * than a client-side patch racing the same boot it is trying to fix. Wording
 * mirrors each portal's own login screen, so the loader reads as the first
 * frame of that screen rather than a placeholder that changes its mind.
 */
const LOADER_COPY: Record<string, {
  eyebrow: string;
  headline: string;
  body: string;
  /** Replaces the "Secure customer sign-in / Google" box. */
  note: { title: string; body: string };
  preparing: string;
}> = {
  admin: {
    eyebrow: "Promise Electronics",
    headline: "Admin Control",
    body: "Jobs, POS, inventory, finance and staff tools for Promise Electronics.",
    note: { title: "Authorized staff only", body: "Sign in with your admin credentials to continue." },
    preparing: "Preparing the admin panel",
  },
  corporate: {
    eyebrow: "Promise Electronics",
    headline: "Corporate Portal",
    body: "Track repairs, statements and batches for your organisation.",
    note: { title: "Authorized account access only", body: "Sign in with your corporate credentials to continue." },
    preparing: "Preparing the corporate portal",
  },
};

function getPortal(url: string): string | null {
  if (url.startsWith("/admin") || url.startsWith("/tech")) return "admin";
  if (url.startsWith("/corporate")) return "corporate";
  return null;
}

/**
 * Swap one piece of loader markup for another, once.
 *
 * Throws nothing if the anchor is missing — an index.html rewrite by someone
 * else should not turn into a 500 for every admin login. It silently leaves
 * that one piece as the customer default, which is the same experience this
 * function exists to improve on, not a regression.
 */
function replaceOnce(html: string, needle: string, replacement: string): string {
  const i = html.indexOf(needle);
  if (i === -1) return html;
  return html.slice(0, i) + replacement + html.slice(i + needle.length);
}

export function applyPortalMeta(url: string, html: string): string {
  const portal = getPortal(url);
  if (!portal) return html;

  const meta = PORTAL_META[portal];

  html = html.replace(
    /href="\/manifest\.json"/,
    `href="${meta.manifest}"`,
  );
  html = html.replace(
    /id="pwa-theme-color" content="[^"]*"/,
    `id="pwa-theme-color" content="${meta.theme}"`,
  );
  html = html.replace(
    /id="pwa-app-title" content="[^"]*"/,
    `id="pwa-app-title" content="${meta.title}"`,
  );

  const copy = LOADER_COPY[portal];
  if (copy) {
    html = replaceOnce(html, "Your TV repair journey, in one place.", copy.headline);
    html = replaceOnce(
      html,
      "Use the Promise Electronics Customer Portal to book a repair, track repair status, receive service updates, and view your repair history.",
      copy.body,
    );
    html = replaceOnce(html, "Secure customer sign-in", copy.note.title);
    html = replaceOnce(
      html,
      "Google Sign-In is available to securely access your customer account. We use Google account information only as explained in our Privacy Policy.",
      copy.note.body,
    );
    html = replaceOnce(html, "Preparing your customer portal", copy.preparing);
  }

  return html;
}
