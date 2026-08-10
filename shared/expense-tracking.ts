/**
 * What an expense is, in one place.
 *
 * The petty-cash table has held a free-text `category` since it was built, so
 * "tea", "Tea" and "Snacks" are three different things to a SUM and the one
 * question the shop actually wants answered — what do we spend money on — has
 * never had an answer. A fixed list is the whole fix. `other` exists so nobody
 * is ever stuck, and it demands a note precisely so it does not quietly become
 * the bucket everything lands in.
 *
 * Two dimensions, deliberately kept apart:
 *
 *   category — WHAT was bought. Tea, a rickshaw fare, a recharge.
 *   purpose  — WHOSE benefit it was. The same ৳50 tea is an office cost when
 *              it is for a waiting customer and a staff perk when it is the
 *              evening snack that sits against that person's own allowance.
 *
 * Collapsing them into one list was the obvious shortcut and is wrong: it makes
 * "how much do we spend on tea" and "how much of that is staff perk" the same
 * question, and they are not.
 */

export const EXPENSE_CATEGORIES = [
  { id: "food", label: "Tea, food & refreshments" },
  { id: "transport", label: "Transport & parts runs" },
  { id: "communication", label: "Mobile recharge & internet" },
  { id: "utilities", label: "Utilities & shop upkeep" },
  { id: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];
export const EXPENSE_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as ExpenseCategory[];

export const EXPENSE_PURPOSES = [
  {
    id: "office",
    label: "Office",
    hint: "A cost of running the shop.",
  },
  {
    id: "complementary",
    label: "Complementary",
    hint: "A staff perk that sits against that person's own allowance, like the evening snack.",
  },
  {
    id: "personal",
    label: "Personal",
    hint: "The owner's own money taken from the till, not a business cost.",
  },
] as const;

export type ExpensePurpose = (typeof EXPENSE_PURPOSES)[number]["id"];
export const EXPENSE_PURPOSE_IDS = EXPENSE_PURPOSES.map((p) => p.id) as ExpensePurpose[];

export const categoryLabel = (id: string): string =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const purposeLabel = (id: string): string =>
  EXPENSE_PURPOSES.find((p) => p.id === id)?.label ?? id;

/**
 * Old rows carry whatever somebody typed. Map what can be mapped and send the
 * rest to `other` rather than dropping them — a mis-bucketed historical expense
 * is a smaller lie than a total that silently omits it.
 */
export function normaliseLegacyCategory(raw: unknown): ExpenseCategory {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "other";
  if (/tea|food|snack|lunch|breakfast|dinner|refresh|water|biscuit/.test(s)) return "food";
  if (/transport|rickshaw|cng|bus|fare|fuel|petrol|travel|trip|market/.test(s)) return "transport";
  if (/recharge|mobile|phone|internet|wifi|data|sim|broadband/.test(s)) return "communication";
  if (/utility|electric|bill|water bill|clean|maintenance|repair|rent|stationery|courier/.test(s)) return "utilities";
  return "other";
}

/**
 * Whether this entry still counts toward a total.
 *
 * A reversed entry keeps its row — nothing is ever deleted — so every sum in
 * the system has to agree on how to skip it, and on skipping the reversal that
 * cancelled it too. Counting both would double-subtract; counting neither is
 * what the shop means by "that spend did not happen".
 */
export function isLiveExpense(row: { reversedAt?: Date | string | null; reversalOf?: string | null }): boolean {
  return !row.reversedAt && !row.reversalOf;
}

/**
 * A reversal must explain itself when it undoes somebody else's entry.
 *
 * Correcting your own typo minutes after making it should cost nothing, or
 * people stop correcting typos. Undoing another person's record is different:
 * without a reason the ledger cannot say why a spend vanished, which is exactly
 * the doubt this whole feature exists to remove.
 */
export function reversalNeedsReason(opts: {
  entrySpentBy: string | null | undefined;
  entryEnteredBy: string | null | undefined;
  actorId: string;
}): boolean {
  return opts.entrySpentBy !== opts.actorId && opts.entryEnteredBy !== opts.actorId;
}
