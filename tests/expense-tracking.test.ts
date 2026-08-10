/**
 * Expense tracking: who spent it, what for, and how it is undone.
 *
 * Two faults sat under this before. The petty-cash table had no column saying
 * whose expense a row was, so the one question the shop wants answered had no
 * answer at all. And deleting an expense removed the row while leaving the
 * drawer's expected cash still reduced — so a mistyped and then deleted expense
 * made the next blind count report a surplus on a shift where nothing had gone
 * wrong, and escalated it to the owner as a discrepancy.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_IDS,
  EXPENSE_PURPOSE_IDS,
  categoryLabel,
  isLiveExpense,
  normaliseLegacyCategory,
  purposeLabel,
  reversalNeedsReason,
} from "../shared/expense-tracking.js";

const ROOT = process.cwd();
const ROUTES = readFileSync(join(ROOT, "server/routes/finance.routes.ts"), "utf8");
const REPO = readFileSync(join(ROOT, "server/repositories/finance.repository.ts"), "utf8");
const SCHEMA = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");
const MIGRATIONS = readFileSync(join(ROOT, "server/services/main-schema-migrate.service.ts"), "utf8");

describe("an expense says whose it was", () => {
  it("stores the person, the person who typed it, and what it was for", () => {
    // Without spent_by there is no per-person question to ask. entered_by is
    // separate because finance staff record on everybody's behalf, so the two
    // are routinely different people.
    for (const column of ["spent_by", "spent_by_name", "entered_by", "entered_by_name", "purpose", "occurred_at"]) {
      expect(SCHEMA, `${column} missing from the petty cash table`).toContain(column);
    }
  });

  it("never lets a client claim who entered a record", () => {
    // Attribution a caller can set is attribution worth nothing.
    const block = SCHEMA.slice(SCHEMA.indexOf("insertPettyCashRecordSchema"));
    const omitted = block.slice(0, block.indexOf(".extend("));
    for (const field of ["enteredBy", "enteredByName", "reversedBy", "reversalOf"]) {
      expect(omitted, `${field} must be omitted from the insert schema`).toContain(`${field}: true`);
    }
  });

  it("ships the migration that adds them", () => {
    // Assert the migration exists rather than pinning the required version —
    // pinning breaks on the next unrelated migration for no benefit.
    expect(MIGRATIONS).toContain('id: "2026_08_10_expense_attribution"');
    expect(MIGRATIONS).toContain("ADD COLUMN IF NOT EXISTS spent_by TEXT");
    // Old rows have no occurred_at; they are backfilled from created_at so one
    // column can answer every date question without losing its index.
    expect(MIGRATIONS).toContain("SET occurred_at = created_at");
  });
});

describe("categories can actually be summed", () => {
  it("is a fixed list, not a free-text box", () => {
    expect(EXPENSE_CATEGORY_IDS).toEqual(["food", "transport", "communication", "utilities", "other"]);
    expect(EXPENSE_PURPOSE_IDS).toEqual(["office", "complementary", "personal"]);
    expect(new Set(EXPENSE_CATEGORY_IDS).size).toBe(EXPENSE_CATEGORIES.length);
  });

  it("keeps purpose separate from category", () => {
    // The same ৳50 tea is an office cost for a waiting customer and a staff
    // perk as the evening snack. One list cannot say both.
    expect(EXPENSE_CATEGORY_IDS).not.toContain("personal");
    expect(EXPENSE_PURPOSE_IDS).not.toContain("food");
  });

  it("buckets what people already typed instead of dropping it", () => {
    expect(normaliseLegacyCategory("Tea")).toBe("food");
    expect(normaliseLegacyCategory("tea")).toBe("food");
    expect(normaliseLegacyCategory("Snacks for staff")).toBe("food");
    expect(normaliseLegacyCategory("CNG fare")).toBe("transport");
    expect(normaliseLegacyCategory("Stadium Market trip")).toBe("transport");
    expect(normaliseLegacyCategory("mobile recharge")).toBe("communication");
    expect(normaliseLegacyCategory("Electricity bill")).toBe("utilities");
    // A mis-bucketed historical row is a smaller lie than a total that omits it.
    for (const junk of ["", null, undefined, "qwerty"]) {
      expect(normaliseLegacyCategory(junk), String(junk)).toBe("other");
    }
  });

  it("has a readable label for everything it stores", () => {
    for (const id of EXPENSE_CATEGORY_IDS) expect(categoryLabel(id)).not.toBe(id);
    for (const id of EXPENSE_PURPOSE_IDS) expect(purposeLabel(id)).not.toBe(id);
  });
});

describe("undoing an expense", () => {
  it("never deletes the row", () => {
    // DELETE removed the record outright. A ledger that can be made to forget
    // cannot answer the question it exists to answer.
    expect(ROUTES).not.toContain("router.delete('/api/petty-cash/:id'");
    expect(REPO).not.toContain("deletePettyCashRecord");
    expect(ROUTES).toContain("/api/petty-cash/:id/reverse");
  });

  it("gives the drawer back what the expense took from it", () => {
    /**
     * The bug this closes. Creating an expense subtracts from the session's
     * expected cash; deleting never added it back, so the register expected
     * less cash than it held and the blind count reported a phantom surplus.
     */
    const reverse = ROUTES.slice(ROUTES.indexOf("/api/petty-cash/:id/reverse"));
    const handler = reverse.slice(0, reverse.indexOf("\n});"));
    expect(handler).toContain("updateDrawerExpectedCash");
    expect(handler).toContain("existing.amount");
    // Positive, not negative — this is a refund to the drawer.
    expect(handler).not.toMatch(/updateDrawerExpectedCash\([^)]*-\s*existing\.amount/);
  });

  it("refuses to reverse the same entry twice", () => {
    // Otherwise a double-tap subtracts the same money from the drawer twice.
    const reverse = ROUTES.slice(ROUTES.indexOf("/api/petty-cash/:id/reverse"));
    expect(reverse.slice(0, reverse.indexOf("\n});"))).toContain("already been reversed");
    expect(REPO).toContain("if (original.reversedAt || original.reversalOf) return null;");
  });

  it("locks the row while reversing it", () => {
    // Two requests reading the same unreversed row would both write a
    // cancelling entry.
    const fn = REPO.slice(REPO.indexOf("export async function reversePettyCashRecord"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("db.transaction");
    expect(body).toContain('.for("update")');
  });

  it("dates the cancelling entry today rather than backdating it", () => {
    // Backdating into a shift that was already counted and signed off would
    // rewrite a closed day's totals.
    const fn = REPO.slice(REPO.indexOf("export async function reversePettyCashRecord"));
    expect(fn.slice(0, fn.indexOf("\n}"))).toContain("occurredAt: now");
  });
});

describe("who has to explain themselves", () => {
  const actor = "u-finance";

  it("asks nothing when you undo your own entry", () => {
    // Correcting your own typo should cost nothing, or people stop correcting
    // typos.
    expect(reversalNeedsReason({ entrySpentBy: actor, entryEnteredBy: "u-other", actorId: actor })).toBe(false);
    expect(reversalNeedsReason({ entrySpentBy: "u-other", entryEnteredBy: actor, actorId: actor })).toBe(false);
  });

  it("requires a reason to undo somebody else's", () => {
    expect(reversalNeedsReason({ entrySpentBy: "u-tech", entryEnteredBy: "u-manager", actorId: actor })).toBe(true);
    // An unattributed legacy row belongs to nobody, so it belongs to everybody
    // else — it still needs a reason.
    expect(reversalNeedsReason({ entrySpentBy: null, entryEnteredBy: null, actorId: actor })).toBe(true);
  });

  it("enforces it in the route, not only in the helper", () => {
    const reverse = ROUTES.slice(ROUTES.indexOf("/api/petty-cash/:id/reverse"));
    const handler = reverse.slice(0, reverse.indexOf("\n});"));
    expect(handler).toContain("reversalNeedsReason");
    expect(handler).toContain("REASON_REQUIRED");
  });
});

describe("totals", () => {
  it("counts neither the reversed entry nor the entry that reversed it", () => {
    // Counting either misstates the total; counting both cancels twice.
    expect(isLiveExpense({ reversedAt: null, reversalOf: null })).toBe(true);
    expect(isLiveExpense({ reversedAt: new Date(), reversalOf: null })).toBe(false);
    expect(isLiveExpense({ reversedAt: null, reversalOf: "pc-1" })).toBe(false);
  });

  it("excludes both in SQL as well", () => {
    // The helper above is useless if the queries disagree with it.
    const rollup = REPO.slice(REPO.indexOf("export async function getExpenseRollup"));
    const byPerson = REPO.slice(REPO.indexOf("export async function getExpenseByPerson"));
    for (const [name, body] of [["rollup", rollup], ["by-person", byPerson]] as const) {
      const query = body.slice(0, body.indexOf("`);"));
      expect(query, `${name} counts reversed rows`).toContain("reversed_at IS NULL");
      expect(query, `${name} counts reversal rows`).toContain("reversal_of IS NULL");
      expect(query, `${name} counts income as spending`).toContain("type = 'Expense'");
    }
  });

  it("groups by when the money left, not when it was typed", () => {
    // A spend made at 11am and entered at 6pm belongs to 11am; one entered
    // after midnight belongs to the previous day.
    const rollup = REPO.slice(REPO.indexOf("export async function getExpenseRollup"));
    expect(rollup.slice(0, rollup.indexOf("`);"))).toContain("COALESCE(occurred_at, created_at)");
  });
});

describe("nothing leaks", () => {
  it("keeps every expense route behind the finance permission", () => {
    // The owner's personal spending is in this table.
    for (const route of ["/api/petty-cash/rollup", "/api/petty-cash/by-person"]) {
      const line = ROUTES.split("\n").find((l) => l.includes(`router.get('${route}'`));
      expect(line, `${route} is not registered`).toBeTruthy();
      expect(line, `${route} is not permission-gated`).toContain("requirePermission('finance')");
      expect(line).toContain("requireAdminAuth");
    }
    const reverseLine = ROUTES.split("\n").find((l) => l.includes("router.post('/api/petty-cash/:id/reverse'"));
    expect(reverseLine).toContain("requireGranularPermission('finance.deleteRecord')");
  });
});
