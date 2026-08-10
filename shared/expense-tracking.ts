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
  { id: "parts", label: "Parts", hint: "Panels, boards, cables — anything bought for a repair.", dot: "bg-blue-500" },
  { id: "conveyance", label: "Conveyance", hint: "Rickshaw, CNG, bus, fuel — including trips to collect a part.", dot: "bg-amber-500" },
  { id: "food", label: "Food", hint: "Tea, snacks, staff lunch, refreshments for a waiting customer.", dot: "bg-emerald-500" },
  { id: "official", label: "Official", hint: "Utilities, recharge, internet, courier, stationery, shop upkeep.", dot: "bg-violet-500" },
  { id: "other", label: "Other", hint: "Anything that fits nowhere above. Say what it was.", dot: "bg-slate-400" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];
export const EXPENSE_CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id) as ExpenseCategory[];

/** Only parts are counted by the piece; nothing else has a meaningful quantity. */
export const CATEGORY_TAKES_QUANTITY: ExpenseCategory = "parts";

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

export const categoryDot = (id: string): string =>
  EXPENSE_CATEGORIES.find((c) => c.id === id)?.dot ?? "bg-slate-300";

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
  // Official is tested first because its words are longer and more specific.
  // "electricity" contains "ic", and an unanchored "ic" in the parts pattern
  // filed the power bill as a component.
  if (/official|utility|electric|bill|clean|maintenance|rent|stationery|courier|recharge|mobile|phone|internet|wifi|data|sim|broadband/.test(s)) return "official";
  if (/part|panel|board|lvds|cable|backlight|capacitor|screen|component|spare|(^|[^a-z])ic([^a-z]|$)/.test(s)) return "parts";
  if (/transport|conveyance|rickshaw|cng|bus|fare|fuel|petrol|travel|trip|market/.test(s)) return "conveyance";
  if (/tea|food|snack|lunch|breakfast|dinner|refresh|water|biscuit/.test(s)) return "food";
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
