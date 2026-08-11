/**
 * Every method on IStorage must actually exist on a repository.
 *
 * `storage` is a Proxy that forwards a property to whichever repository
 * exported a function of that name, and returns undefined when none did. The
 * IStorage interface it is cast to therefore promises things the proxy cannot
 * deliver: `storage.getLocalPurchases(...)` typechecked perfectly, resolved to
 * undefined at runtime, and threw a TypeError on every single call. The route
 * caught it and answered 500 with no log, so a method that had never once
 * worked read as an intermittent server fault — for as long as the feature had
 * existed.
 *
 * A type cast cannot catch that. This can.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STORAGE = readFileSync(join(ROOT, "server/storage.ts"), "utf8");

/** The method names IStorage promises. */
function interfaceMethods(source: string): string[] {
  const start = source.indexOf("interface IStorage");
  expect(start, "IStorage interface not found").toBeGreaterThan(-1);

  // Walk braces so a nested type literal cannot end the block early.
  let depth = 0;
  let end = start;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  const body = source.slice(start, end);
  const names = new Set<string>();
  // `name(args): ReturnType;` at the top level of the interface. Commented-out
  // lines are skipped, which is how a deliberately-removed member is recorded.
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    const match = /^([a-zA-Z_$][\w$]*)\s*(<[^>]*>)?\s*\(/.exec(trimmed);
    if (match) names.add(match[1]);
  }
  return [...names];
}

/** Every function name any repository exports or defines on a class. */
function repositoryMethods(): Set<string> {
  const dir = join(ROOT, "server/repositories");
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, file), "utf8");
    for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/g)) names.add(m[1]);
    // Includes plain aliases — `export const getCustomer = getUser;` is a real
    // implementation as far as the proxy is concerned.
    for (const m of source.matchAll(/export\s+const\s+([a-zA-Z_$][\w$]*)\s*=/g)) names.add(m[1]);
    // Class repos are collected off the prototype by the same proxy. Their
    // methods are indented by whatever the file happens to use, so match any
    // leading whitespace rather than assuming two spaces.
    for (const m of source.matchAll(/^\s+(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*:/gm)) names.add(m[1]);
  }
  return names;
}

/**
 * Declared on IStorage, implemented by no repository, as of 2026-08-10.
 *
 * Each of these resolves to undefined at runtime. The ones marked LIVE have
 * real `storage.<name>(...)` call sites, which means those endpoints throw a
 * TypeError and answer 500 on every request — they have never worked once.
 * The rest are dead declarations left behind when the logic moved onto a
 * service, and only need deleting.
 *
 * This list exists to stop the count growing, not to bless it. Fix an entry,
 * delete it from here; the test fails if a name is fixed and left behind.
 */
const KNOWN_UNIMPLEMENTED = [
  // LIVE — endpoint is broken in production
  "getInventorySerials",            // GET /api/inventory/:id/serials
  "createInventorySerials",         // POST /api/inventory/:id/serials
  "getWorkflowKPIs",                // GET workflow KPIs
  "getTechnicianWorkload",          // GET technician workload
  "deleteAllBusinessData",          // POST settings data wipe
  "markCorporateNotificationAsRead",// PATCH corporate notification read
  // Declared, unimplemented, and no longer reachable: the Purchasing tab and
  // its routes were deleted on 2026-08-11, so these two now describe nothing.
  "getPurchaseOrderItems",
  "updatePurchaseOrderStatus",
  // Dead declaration — logic lives on a service, nothing calls the proxy
  "syncJobParts",
  "updateInventorySerialStatus",
  "createWastageLog",
  "getJobTicketsByCustomerId",
  "verifyAndConvertServiceRequest",
  "transitionStage",
  "recordJobPayment",
].sort();

describe("the storage proxy can deliver what IStorage promises", () => {
  it("gains no new method that no repository implements", () => {
    const declared = interfaceMethods(STORAGE);
    expect(declared.length, "parsed no methods — the parser is broken, not the code").toBeGreaterThan(50);

    const implemented = repositoryMethods();
    const missing = declared.filter((name) => !implemented.has(name)).sort();

    expect(
      missing,
      "The set of unimplemented IStorage methods changed. A NEW name here means " +
      "an endpoint that will 500 on its first request while typechecking clean. " +
      "A name that DISAPPEARED means you fixed one — delete it from " +
      "KNOWN_UNIMPLEMENTED as well.",
    ).toEqual(KNOWN_UNIMPLEMENTED);
  });

  it("no longer claims the local-purchase methods it never had", () => {
    // These live on InventoryService, which the proxy never sees. Declaring
    // them made storage.getLocalPurchases(...) typecheck and then throw, and
    // the route swallowed the error as a bare 500 — for the life of the
    // feature. Callers use inventoryService directly now.
    const declared = interfaceMethods(STORAGE);
    expect(declared).not.toContain("getLocalPurchases");
    expect(declared).not.toContain("createLocalPurchase");
  });

  it("routes the local-purchase read at the service, not the proxy", () => {
    const route = readFileSync(join(ROOT, "server/routes/inventory.routes.ts"), "utf8");
    expect(route).toContain("inventoryService.getLocalPurchases");
    expect(route).not.toContain("storage.getLocalPurchases");
  });
});
