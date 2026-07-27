/** ADMIN-WORKSPACE-ROUTING-01A — pure path/hash parse + normalize helpers. */

export const ADMIN_QUERY_KEYS = ["search", "target", "client", "type"] as const;
export type AdminQueryKey = (typeof ADMIN_QUERY_KEYS)[number];

export type AdminWorkspaceQuery = {
  search?: string;
  target?: string;
  client?: string;
  type?: string;
};

export type AdminStandaloneKind = "login" | "setup" | "workbench" | "print";

export type AdminLocationKind = "not-admin" | "standalone" | "workspace";

export type ParseAdminLocationInput = {
  pathname: string;
  /** `location.search` including leading `?` or empty */
  search?: string;
  /** `location.hash` including leading `#` or empty */
  hash?: string;
};

export type AdminWorkspaceIntent = {
  kind: AdminLocationKind;
  standalone?: AdminStandaloneKind;
  /** Workspace tab id after alias normalize; never forced to dashboard for unknown ids */
  tabId: string;
  query: AdminWorkspaceQuery;
  /** Canonical path+allowlisted query for replace normalization */
  canonicalPath: string;
  /** True when URL should be replace-normalized to canonicalPath */
  shouldReplace: boolean;
  /** Why replace (debug/tests) */
  replaceReasons: string[];
};

export function normalizeAdminTabId(tab: string | null | undefined): string {
  const raw = (tab ?? "").trim().replace(/^#/, "");
  if (!raw) return "dashboard";
  if (raw === "corp-repairs") return "b2b";
  return raw;
}

export function classifyAdminPathname(pathname: string): {
  kind: AdminLocationKind;
  standalone?: AdminStandaloneKind;
} {
  const path = normalizePathname(pathname);
  if (!path.startsWith("/admin")) {
    return { kind: "not-admin" };
  }
  if (path === "/admin/login" || path.startsWith("/admin/login/")) {
    return { kind: "standalone", standalone: "login" };
  }
  if (path.startsWith("/admin/setup/") || path === "/admin/setup") {
    return { kind: "standalone", standalone: "setup" };
  }
  if (path === "/admin/workbench" || path.startsWith("/admin/workbench/")) {
    return { kind: "standalone", standalone: "workbench" };
  }
  if (path.includes("/corporate/bills/") && path.includes("/print")) {
    return { kind: "standalone", standalone: "print" };
  }
  return { kind: "workspace" };
}

export function filterAdminWorkspaceQuery(
  tabId: string,
  params: URLSearchParams | Record<string, string | null | undefined>,
): AdminWorkspaceQuery {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) {
      const v = params.get(key);
      return v && v.length > 0 ? v : undefined;
    }
    const v = params[key];
    return v && String(v).length > 0 ? String(v) : undefined;
  };

  const query: AdminWorkspaceQuery = {};
  const search = get("search");
  const target = get("target");
  if (search) query.search = search;
  if (target) query.target = target;
  if (tabId === "b2b") {
    const client = get("client");
    if (client) query.client = client;
  }
  if (tabId === "finance") {
    const type = get("type");
    if (type) query.type = type;
  }
  return query;
}

export function buildAdminCanonicalPath(tabId: string, query: AdminWorkspaceQuery = {}): string {
  const tab = normalizeAdminTabId(tabId);
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.target) params.set("target", query.target);
  if (tab === "b2b" && query.client) params.set("client", query.client);
  if (tab === "finance" && query.type) params.set("type", query.type);
  const qs = params.toString();
  return qs ? `/admin/${tab}?${qs}` : `/admin/${tab}`;
}

export type NavigateAdminTabHistory = "push" | "replace";

/**
 * Pure path builder for shell navigation (Slice B).
 * Always re-filters through the allowlist; tab-scoped client/type only when tab matches.
 * Callers that switch tabs should omit prior target/client/type unless intentionally carrying them.
 */
export function buildNavigateAdminTabPath(
  tab: string,
  query?: AdminWorkspaceQuery | null,
): string {
  const tabId = normalizeAdminTabId(tab);
  const filtered = filterAdminWorkspaceQuery(tabId, {
    search: query?.search,
    target: query?.target,
    client: query?.client,
    type: query?.type,
  });
  return buildAdminCanonicalPath(tabId, filtered);
}

/** Map dashboard/system-health style (tab, search, optional client) into allowlisted query. */
export function adminQueryFromTabSearch(
  tab: string,
  searchQuery?: string | null,
  extras?: { targetId?: string | null; clientId?: string | null; recordType?: string | null },
): AdminWorkspaceQuery {
  const tabId = normalizeAdminTabId(tab);
  return filterAdminWorkspaceQuery(tabId, {
    search: searchQuery || undefined,
    target: extras?.targetId || undefined,
    client: extras?.clientId || undefined,
    type: extras?.recordType || undefined,
  });
}

/** Role landing after login / tech portal (canonical workspace paths). */
export function getAdminRoleLandingPath(role: string): string {
  switch (role) {
    case "Technician":
      return buildNavigateAdminTabPath("technician");
    case "Driver":
      return buildNavigateAdminTabPath("pickup");
    case "Cashier":
      return buildNavigateAdminTabPath("pos");
    default:
      return buildNavigateAdminTabPath("dashboard");
  }
}

/** Current workspace tab from path (preferred) or legacy hash. */
export function getCurrentAdminTabIdFromLocation(
  pathname: string,
  search?: string,
  hash?: string,
): string {
  const intent = resolveAdminWorkspaceIntent({ pathname, search, hash });
  if (intent.kind === "workspace") return intent.tabId;
  return "dashboard";
}

export function isAdminWorkspaceTabActive(
  tab: string,
  pathname: string,
  search?: string,
  hash?: string,
): boolean {
  return getCurrentAdminTabIdFromLocation(pathname, search, hash) === normalizeAdminTabId(tab);
}

/**
 * Classify admin notification link strings from known server writers.
 * Does not invent destinations for ambiguous or non-admin routes.
 */
export type AdminNotificationLinkParse =
  | {
      kind: "workspace";
      tabId: string;
      search?: string;
      target?: string;
      /** In-memory only — never put in URL */
      corpMsgThreadId?: string;
    }
  | { kind: "standalone"; path: string }
  | { kind: "unsupported"; reason: string; raw: string };

export function parseAdminNotificationLink(
  link: string,
  linkId?: string | null,
): AdminNotificationLinkParse {
  const raw = (link || "").trim();
  if (!raw) {
    return { kind: "workspace", tabId: "dashboard" };
  }
  if (raw.startsWith("{") || raw.startsWith("[")) {
    return { kind: "unsupported", reason: "json-payload-not-workspace-nav", raw: "{…}" };
  }
  if (raw.startsWith("/corporate") || raw.startsWith("http://") || raw.startsWith("https://")) {
    return { kind: "unsupported", reason: "non-admin-route", raw };
  }
  if (raw.startsWith("/track/") || raw === "/track") {
    return { kind: "unsupported", reason: "public-track-route", raw };
  }

  // /admin/workbench (standalone)
  if (raw === "/admin/workbench" || raw.startsWith("/admin/workbench/")) {
    return { kind: "standalone", path: "/admin/workbench" };
  }

  // /admin#tab or /admin#tab?…
  if (raw.startsWith("/admin#")) {
    const hashBody = raw.slice("/admin#".length);
    const tabPart = hashBody.split("?")[0] || "dashboard";
    return {
      kind: "workspace",
      tabId: normalizeAdminTabId(tabPart),
      search: linkId || undefined,
    };
  }

  // /admin?tab=jobs&job=…
  if (raw.startsWith("/admin?") || raw === "/admin") {
    if (raw === "/admin") {
      return { kind: "workspace", tabId: "dashboard" };
    }
    const qs = raw.slice(raw.indexOf("?") + 1);
    const params = new URLSearchParams(qs);
    const tab = params.get("tab");
    if (!tab) {
      return { kind: "unsupported", reason: "admin-query-missing-tab", raw };
    }
    const tabId = normalizeAdminTabId(tab);
    const job = params.get("job") || undefined;
    // Proven writers (job-ng-report, corporate.service): tab + job id.
    // Prefer allowlisted search for open (matches prior NotificationPanel search=linkId).
    const search = linkId || job;
    return {
      kind: "workspace",
      tabId,
      search: search || undefined,
      target: job || linkId || undefined,
    };
  }

  // /admin/attendance, /admin/salary, /admin/jobs, …
  if (raw.startsWith("/admin/")) {
    const rest = raw.slice("/admin/".length);
    const pathOnly = rest.split("?")[0] || "";
    const first = pathOnly.split("/").filter(Boolean)[0] || "dashboard";
    if (first === "workbench") {
      return { kind: "standalone", path: "/admin/workbench" };
    }
    if (first === "login" || first === "setup" || first === "corporate") {
      return { kind: "unsupported", reason: "non-workspace-admin-path", raw };
    }
    return {
      kind: "workspace",
      tabId: normalizeAdminTabId(first),
      search: linkId || undefined,
    };
  }

  // Plain tab id (service-requests, attendance, jobs, salary, …)
  if (!raw.includes("/") && !raw.includes("://")) {
    const tabPart = raw.split("?")[0];
    const tabId = normalizeAdminTabId(tabPart);
    if (tabId === "corp-msg") {
      return {
        kind: "workspace",
        tabId: "corp-msg",
        corpMsgThreadId: linkId || undefined,
      };
    }
    // Prior UI put linkId in search= (not target=) for notification deep links.
    return {
      kind: "workspace",
      tabId,
      search: linkId || undefined,
    };
  }

  return { kind: "unsupported", reason: "unrecognized-link", raw };
}

/**
 * Resolve workspace intent from browser location pieces.
 * Path tab wins over hash. Legacy hash applies only on bare `/admin`.
 */
export function resolveAdminWorkspaceIntent(input: ParseAdminLocationInput): AdminWorkspaceIntent {
  const pathname = normalizePathname(input.pathname || "/");
  const classification = classifyAdminPathname(pathname);

  if (classification.kind === "not-admin") {
    return {
      kind: "not-admin",
      tabId: "dashboard",
      query: {},
      canonicalPath: "/admin/dashboard",
      shouldReplace: false,
      replaceReasons: [],
    };
  }

  if (classification.kind === "standalone") {
    return {
      kind: "standalone",
      standalone: classification.standalone,
      tabId: "dashboard",
      query: {},
      canonicalPath: pathname,
      shouldReplace: false,
      replaceReasons: [],
    };
  }

  const pathSearch = parseSearchParams(input.search);
  const { tabFromPath, isBareAdmin, hasExtraSegments } = extractPathTab(pathname);
  const hashRaw = (input.hash || "").replace(/^#/, "");
  const hashTabPart = hashRaw.split("?")[0] || "";
  const hashQueryPart = hashRaw.includes("?") ? hashRaw.slice(hashRaw.indexOf("?") + 1) : "";
  const hashSearch = new URLSearchParams(hashQueryPart);
  const hasHash = hashRaw.length > 0;

  const replaceReasons: string[] = [];
  let tabId: string;
  let querySource: URLSearchParams;

  if (tabFromPath) {
    tabId = normalizeAdminTabId(tabFromPath);
    querySource = pathSearch;
    if (hasHash) replaceReasons.push("path-over-hash");
    if (hasExtraSegments) replaceReasons.push("strip-extra-path-segments");
  } else if (isBareAdmin && hasHash) {
    tabId = normalizeAdminTabId(hashTabPart);
    querySource = hashSearch;
    replaceReasons.push("legacy-hash-bridge");
    if (hashTabPart === "corp-repairs") replaceReasons.push("alias-corp-repairs");
  } else {
    tabId = "dashboard";
    querySource = pathSearch;
    replaceReasons.push("bare-admin-to-dashboard");
  }

  const query = filterAdminWorkspaceQuery(tabId, querySource);
  const droppedUnknown = hasDisallowedQueryKeys(querySource);
  if (droppedUnknown) replaceReasons.push("drop-unknown-query");
  if (querySource.has("client") && tabId !== "b2b") replaceReasons.push("drop-client-off-b2b");
  if (querySource.has("type") && tabId !== "finance") replaceReasons.push("drop-type-off-finance");

  const canonicalPath = buildAdminCanonicalPath(tabId, query);
  const currentComparable = `${pathname}${normalizeSearchString(input.search)}`;
  const canonicalComparable = canonicalPath;
  const hashWouldRemain = hasHash && tabFromPath;
  const shouldReplace =
    replaceReasons.length > 0 ||
    currentComparable !== canonicalComparable ||
    Boolean(hashWouldRemain);

  if (currentComparable !== canonicalComparable && !replaceReasons.includes("path-mismatch")) {
    if (!replaceReasons.length) replaceReasons.push("path-mismatch");
  }

  return {
    kind: "workspace",
    tabId,
    query,
    canonicalPath,
    shouldReplace,
    replaceReasons,
  };
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  let p = pathname.split("?")[0].split("#")[0];
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function normalizeSearchString(search?: string): string {
  if (!search) return "";
  const s = search.startsWith("?") ? search : `?${search}`;
  if (s === "?") return "";
  return s;
}

function parseSearchParams(search?: string): URLSearchParams {
  if (!search) return new URLSearchParams();
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function extractPathTab(pathname: string): {
  tabFromPath: string | null;
  isBareAdmin: boolean;
  hasExtraSegments: boolean;
} {
  const path = normalizePathname(pathname);
  if (path === "/admin") {
    return { tabFromPath: null, isBareAdmin: true, hasExtraSegments: false };
  }
  if (!path.startsWith("/admin/")) {
    return { tabFromPath: null, isBareAdmin: false, hasExtraSegments: false };
  }
  const rest = path.slice("/admin/".length);
  const segments = rest.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { tabFromPath: null, isBareAdmin: true, hasExtraSegments: false };
  }
  return {
    tabFromPath: segments[0],
    isBareAdmin: false,
    hasExtraSegments: segments.length > 1,
  };
}

function hasDisallowedQueryKeys(params: URLSearchParams): boolean {
  const keys = Array.from(params.keys());
  for (let i = 0; i < keys.length; i++) {
    if (!(ADMIN_QUERY_KEYS as readonly string[]).includes(keys[i])) return true;
  }
  return false;
}
