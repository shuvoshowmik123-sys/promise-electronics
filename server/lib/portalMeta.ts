const PORTAL_META: Record<string, { manifest: string; theme: string; title: string }> = {
  admin: { manifest: "/manifest-admin.json", theme: "#0f172a", title: "Promise Admin" },
  corporate: { manifest: "/manifest-corporate.json", theme: "#1e40af", title: "Promise Corporate" },
};

function getPortal(url: string): string | null {
  if (url.startsWith("/admin") || url.startsWith("/tech")) return "admin";
  if (url.startsWith("/corporate")) return "corporate";
  return null;
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

  return html;
}
