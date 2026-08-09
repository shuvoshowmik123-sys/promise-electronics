/**
 * A list that failed to load must not look like a list with nothing in it.
 *
 * The Service Requests tab had no error branch. When the request failed — a
 * timed-out cold start, an expired session, a dropped connection — the data
 * stayed undefined and the tab fell through to "No service requests found".
 * Staff could not tell "nothing came in today" from "this screen is broken",
 * and the only way to retry was reloading the whole admin panel.
 *
 * Queries here run with retry: false, so nothing recovers on its own. Somebody
 * has to be told, and given a button.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TAB = readFileSync(
  join(process.cwd(), "client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx"),
  "utf8",
);

describe("service requests: a failed load says so", () => {
  it("reads the error state from the query at all", () => {
    expect(TAB).toMatch(/isError/);
    expect(TAB).toMatch(/refetch: refetchRequests/);
  });

  it("shows the failure before it can reach the empty state", () => {
    // The error branch has to return above the render, or the tab still shows
    // "No service requests found" on a failure.
    // Match the rendered element, not the sentence quoted in a comment above
    // the branch — the first version of this test found its own docstring.
    const errorAt = TAB.indexOf("if (isError)");
    const emptyAt = TAB.indexOf("<p>No service requests found</p>");
    expect(errorAt).toBeGreaterThan(-1);
    expect(errorAt).toBeLessThan(emptyAt);
  });

  it("says plainly that this is not an empty inbox", () => {
    expect(TAB).toMatch(/loading problem, not an empty inbox/i);
  });

  it("offers a retry rather than requiring a page reload", () => {
    const block = TAB.slice(TAB.indexOf("if (isError)"), TAB.indexOf("if (isError)") + 1800);
    expect(block).toMatch(/refetchRequests\(\)/);
    expect(block).toMatch(/Try again/);
    // and cannot be double-fired while it is already retrying
    expect(block).toMatch(/disabled=\{isFetching\}/);
  });

  it("shows what actually went wrong", () => {
    // "Something went wrong" tells whoever is on shift nothing they can act on
    // or repeat down the phone.
    const block = TAB.slice(TAB.indexOf("if (isError)"), TAB.indexOf("if (isError)") + 1800);
    expect(block).toMatch(/srError as Error\)\?\.message/);
  });
});
