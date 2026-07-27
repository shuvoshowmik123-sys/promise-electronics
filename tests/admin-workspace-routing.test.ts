import { describe, expect, it } from "vitest";
import {
  adminQueryFromTabSearch,
  buildAdminCanonicalPath,
  buildNavigateAdminTabPath,
  classifyAdminPathname,
  filterAdminWorkspaceQuery,
  getAdminRoleLandingPath,
  getCurrentAdminTabIdFromLocation,
  isAdminWorkspaceTabActive,
  normalizeAdminTabId,
  parseAdminNotificationLink,
  resolveAdminWorkspaceIntent,
} from "../client/src/lib/admin-workspace-routing.js";

describe("admin-workspace-routing pure parser", () => {
  it("normalizes bare /admin to dashboard with replace", () => {
    const r = resolveAdminWorkspaceIntent({ pathname: "/admin", search: "", hash: "" });
    expect(r.kind).toBe("workspace");
    expect(r.tabId).toBe("dashboard");
    expect(r.canonicalPath).toBe("/admin/dashboard");
    expect(r.shouldReplace).toBe(true);
    expect(r.replaceReasons).toContain("bare-admin-to-dashboard");
  });

  it("reads /admin/jobs path tab", () => {
    const r = resolveAdminWorkspaceIntent({ pathname: "/admin/jobs", search: "", hash: "" });
    expect(r.tabId).toBe("jobs");
    expect(r.canonicalPath).toBe("/admin/jobs");
    expect(r.shouldReplace).toBe(false);
  });

  it("reads /admin/account as account tab", () => {
    const r = resolveAdminWorkspaceIntent({ pathname: "/admin/account", search: "", hash: "" });
    expect(r.tabId).toBe("account");
    expect(r.canonicalPath).toBe("/admin/account");
  });

  it("bridges legacy #jobs?search=... on bare /admin", () => {
    const r = resolveAdminWorkspaceIntent({
      pathname: "/admin",
      search: "",
      hash: "#jobs?search=ABC123",
    });
    expect(r.tabId).toBe("jobs");
    expect(r.query.search).toBe("ABC123");
    expect(r.canonicalPath).toBe("/admin/jobs?search=ABC123");
    expect(r.shouldReplace).toBe(true);
    expect(r.replaceReasons).toContain("legacy-hash-bridge");
  });

  it("maps legacy #corp-repairs to b2b", () => {
    const r = resolveAdminWorkspaceIntent({
      pathname: "/admin",
      hash: "#corp-repairs",
    });
    expect(r.tabId).toBe("b2b");
    expect(r.canonicalPath).toBe("/admin/b2b");
    expect(normalizeAdminTabId("corp-repairs")).toBe("b2b");
  });

  it("retains allowlisted query keys", () => {
    const r = resolveAdminWorkspaceIntent({
      pathname: "/admin/jobs",
      search: "?search=ref1&target=uuid-1",
    });
    expect(r.query).toEqual({ search: "ref1", target: "uuid-1" });
    expect(r.canonicalPath).toBe("/admin/jobs?search=ref1&target=uuid-1");
  });

  it("drops unknown query keys during normalize", () => {
    const r = resolveAdminWorkspaceIntent({
      pathname: "/admin/jobs",
      search: "?search=ok&phone=017&foo=bar",
    });
    expect(r.query).toEqual({ search: "ok" });
    expect(r.canonicalPath).toBe("/admin/jobs?search=ok");
    expect(r.shouldReplace).toBe(true);
    expect(r.replaceReasons).toContain("drop-unknown-query");
  });

  it("applies client only on b2b", () => {
    const b2b = resolveAdminWorkspaceIntent({
      pathname: "/admin/b2b",
      search: "?client=c1&target=j1",
    });
    expect(b2b.query.client).toBe("c1");
    expect(b2b.query.target).toBe("j1");

    const jobs = resolveAdminWorkspaceIntent({
      pathname: "/admin/jobs",
      search: "?client=c1&search=x",
    });
    expect(jobs.query.client).toBeUndefined();
    expect(jobs.query.search).toBe("x");
    expect(jobs.shouldReplace).toBe(true);
  });

  it("applies type only on finance", () => {
    const fin = resolveAdminWorkspaceIntent({
      pathname: "/admin/finance",
      search: "?type=refund&target=r1",
    });
    expect(fin.query.type).toBe("refund");
    expect(fin.query.target).toBe("r1");

    const pos = resolveAdminWorkspaceIntent({
      pathname: "/admin/pos",
      search: "?type=refund&search=x",
    });
    expect(pos.query.type).toBeUndefined();
    expect(pos.shouldReplace).toBe(true);
  });

  it("classifies standalone routes", () => {
    expect(classifyAdminPathname("/admin/login")).toEqual({
      kind: "standalone",
      standalone: "login",
    });
    expect(classifyAdminPathname("/admin/setup/tok")).toEqual({
      kind: "standalone",
      standalone: "setup",
    });
    expect(classifyAdminPathname("/admin/workbench")).toEqual({
      kind: "standalone",
      standalone: "workbench",
    });
    expect(classifyAdminPathname("/admin/corporate/bills/abc/print")).toEqual({
      kind: "standalone",
      standalone: "print",
    });
    expect(resolveAdminWorkspaceIntent({ pathname: "/admin/login" }).kind).toBe("standalone");
  });

  it("prefers path over simultaneous hash", () => {
    const r = resolveAdminWorkspaceIntent({
      pathname: "/admin/jobs",
      search: "?search=from-path",
      hash: "#finance?search=from-hash",
    });
    expect(r.tabId).toBe("jobs");
    expect(r.query.search).toBe("from-path");
    expect(r.shouldReplace).toBe(true);
    expect(r.replaceReasons).toContain("path-over-hash");
  });

  it("does not force unknown path tabs to dashboard", () => {
    const r = resolveAdminWorkspaceIntent({ pathname: "/admin/not-a-real-tab" });
    expect(r.tabId).toBe("not-a-real-tab");
    expect(r.canonicalPath).toBe("/admin/not-a-real-tab");
  });

  it("filterAdminWorkspaceQuery and buildAdminCanonicalPath stay consistent", () => {
    const q = filterAdminWorkspaceQuery("finance", {
      search: "a",
      target: "t",
      type: "due",
      client: "ignored",
    });
    expect(q).toEqual({ search: "a", target: "t", type: "due" });
    expect(buildAdminCanonicalPath("finance", q)).toBe("/admin/finance?search=a&target=t&type=due");
  });

  it("buildNavigateAdminTabPath builds push targets and clears scoped keys by default", () => {
    expect(buildNavigateAdminTabPath("jobs")).toBe("/admin/jobs");
    expect(buildNavigateAdminTabPath("jobs", { search: "REF1" })).toBe("/admin/jobs?search=REF1");
    // Switching to jobs with leftover client/type must not keep them
    expect(
      buildNavigateAdminTabPath("jobs", { search: "x", client: "c1", type: "refund", target: "t1" }),
    ).toBe("/admin/jobs?search=x&target=t1");
    expect(buildNavigateAdminTabPath("account")).toBe("/admin/account");
    expect(buildNavigateAdminTabPath("corp-repairs")).toBe("/admin/b2b");
  });

  it("adminQueryFromTabSearch maps shell search helpers", () => {
    expect(adminQueryFromTabSearch("jobs", "ABC")).toEqual({ search: "ABC" });
    expect(adminQueryFromTabSearch("b2b", "q", { clientId: "c9", targetId: "j9" })).toEqual({
      search: "q",
      target: "j9",
      client: "c9",
    });
    expect(adminQueryFromTabSearch("finance", null, { recordType: "due", targetId: "r1" })).toEqual({
      target: "r1",
      type: "due",
    });
  });

  it("getAdminRoleLandingPath returns canonical workspace paths", () => {
    expect(getAdminRoleLandingPath("Technician")).toBe("/admin/technician");
    expect(getAdminRoleLandingPath("Driver")).toBe("/admin/pickup");
    expect(getAdminRoleLandingPath("Cashier")).toBe("/admin/pos");
    expect(getAdminRoleLandingPath("Manager")).toBe("/admin/dashboard");
    expect(getAdminRoleLandingPath("Super Admin")).toBe("/admin/dashboard");
  });

  it("operational deep-link paths match allowlisted search form", () => {
    expect(buildNavigateAdminTabPath("disputes")).toBe("/admin/disputes");
    expect(buildNavigateAdminTabPath("attendance")).toBe("/admin/attendance");
    expect(buildNavigateAdminTabPath("inventory")).toBe("/admin/inventory");
    expect(buildNavigateAdminTabPath("jobs", { search: "JOB-1" })).toBe("/admin/jobs?search=JOB-1");
    expect(buildNavigateAdminTabPath("pos", { search: "JOB-1" })).toBe("/admin/pos?search=JOB-1");
    expect(buildNavigateAdminTabPath("pickup")).toBe("/admin/pickup");
    expect(buildNavigateAdminTabPath("service-requests", { search: "017" })).toBe(
      "/admin/service-requests?search=017",
    );
    expect(buildNavigateAdminTabPath("quotations", { search: "017" })).toBe(
      "/admin/quotations?search=017",
    );
    expect(buildNavigateAdminTabPath("orders", { search: "REF" })).toBe("/admin/orders?search=REF");
    expect(buildNavigateAdminTabPath("dashboard")).toBe("/admin/dashboard");
  });

  it("getCurrentAdminTabIdFromLocation prefers path over hash", () => {
    expect(getCurrentAdminTabIdFromLocation("/admin/disputes", "", "#jobs")).toBe("disputes");
    expect(getCurrentAdminTabIdFromLocation("/admin", "", "#pickup")).toBe("pickup");
    expect(isAdminWorkspaceTabActive("pos", "/admin/pos", "", "")).toBe(true);
    expect(isAdminWorkspaceTabActive("pos", "/admin/jobs", "", "#pos")).toBe(false);
  });

  it("parseAdminNotificationLink classifies known writers", () => {
    expect(parseAdminNotificationLink("service-requests", "sr-1")).toEqual({
      kind: "workspace",
      tabId: "service-requests",
      search: "sr-1",
    });
    expect(parseAdminNotificationLink("jobs", "job-1")).toEqual({
      kind: "workspace",
      tabId: "jobs",
      search: "job-1",
    });
    expect(parseAdminNotificationLink("attendance")).toEqual({
      kind: "workspace",
      tabId: "attendance",
    });
    expect(parseAdminNotificationLink("/admin/attendance")).toEqual({
      kind: "workspace",
      tabId: "attendance",
    });
    expect(parseAdminNotificationLink("/admin/salary")).toEqual({
      kind: "workspace",
      tabId: "salary",
    });
    expect(parseAdminNotificationLink("/admin#attendance?userId=x")).toEqual({
      kind: "workspace",
      tabId: "attendance",
    });
    expect(parseAdminNotificationLink("/admin?tab=jobs&job=j9", "j9")).toEqual({
      kind: "workspace",
      tabId: "jobs",
      search: "j9",
      target: "j9",
    });
    expect(parseAdminNotificationLink("/admin/workbench")).toEqual({
      kind: "standalone",
      path: "/admin/workbench",
    });
    expect(parseAdminNotificationLink("corp-msg", "thread-1")).toEqual({
      kind: "workspace",
      tabId: "corp-msg",
      corpMsgThreadId: "thread-1",
    });
    expect(parseAdminNotificationLink("/corporate/jobs/1").kind).toBe("unsupported");
    expect(parseAdminNotificationLink('{"reason":"x"}').kind).toBe("unsupported");
  });

  it("global-search style payloads map through adminQueryFromTabSearch", () => {
    expect(
      buildNavigateAdminTabPath(
        "b2b",
        adminQueryFromTabSearch("b2b", "CJ-1", { clientId: "c1", targetId: "j1" }),
      ),
    ).toBe("/admin/b2b?search=CJ-1&target=j1&client=c1");
    expect(
      buildNavigateAdminTabPath(
        "finance",
        adminQueryFromTabSearch("finance", "due", { targetId: "r1", recordType: "due" }),
      ),
    ).toBe("/admin/finance?search=due&target=r1&type=due");
    expect(
      buildNavigateAdminTabPath(
        "customers",
        adminQueryFromTabSearch("customers", "01700000000", { targetId: "cust-1" }),
      ),
    ).toBe("/admin/customers?search=01700000000&target=cust-1");
    expect(buildNavigateAdminTabPath("corp-msg")).toBe("/admin/corp-msg");
  });
});
