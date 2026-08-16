/**
 * The shop does not charge VAT, and no default may decide otherwise.
 *
 * Six places independently fell back to 5% when no rate was stored: the till's
 * `getVatPercentage`, the POS create route, the receipt and the invoice
 * templates, the transaction mapper and the sales list. None of them was a
 * decision anybody made — the settings screen has always defaulted its own VAT
 * field to 0, so the screen said one thing and every one of those fallbacks said
 * another. A customer's printed receipt read "VAT (5%)" for a tax the shop had
 * never levied.
 *
 * This is a source scan rather than a behaviour test on purpose. The fallbacks
 * are one-line literals scattered across templates and mappers, several of them
 * inside JSX that no unit test reaches, and the failure mode is somebody adding
 * a seventh in a new component. What needs defending is the absence of the
 * literal, so that is what is asserted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

/**
 * The comments explaining why the fallbacks are gone quote the code they
 * replaced, so a scan of the raw source finds its own explanation and fails.
 * Stripping comments first means the test reads what runs, which is what it was
 * ever meant to be checking.
 */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every file that used to invent a 5% rate. */
const FILES_THAT_FELL_BACK_TO_FIVE = [
  "client/src/pages/admin/bento/tabs/PosTab.tsx",
  "client/src/pages/admin/bento/tabs/pos/pos-types.ts",
  "client/src/pages/admin/bento/tabs/FinancesTabSales.tsx",
  "client/src/components/print/Receipt.tsx",
  "client/src/components/print/Invoice.tsx",
  "server/routes/pos.routes.ts",
];

describe("no VAT rate is invented by a fallback", () => {
  it.each(FILES_THAT_FELL_BACK_TO_FIVE)("%s does not fall back to 5%%", (file) => {
    const source = codeOnly(read(file));

    /**
     * Matches `taxRate || "5"`, `taxRate: 5` and
     * `getSettingValue("vat_percentage", "5")`, plus the spacing variations.
     */
    const inventedRate = [
      /taxRate\s*(\|\||\?\?)\s*["']5["']/,
      /taxRate\s*:\s*5\b/,
      /vat_percentage["']\s*,\s*["']5["']/,
    ];

    for (const pattern of inventedRate) {
      expect(source, `${file} still invents a 5% VAT rate: ${pattern}`).not.toMatch(pattern);
    }
  });

  it("the till reads zero when no rate has been set", () => {
    const source = read("client/src/pages/admin/bento/tabs/PosTab.tsx");
    expect(source).toMatch(/getSettingValue\(["']vat_percentage["'],\s*["']0["']\)/);
  });

  it("the POS route does not tax a caller that named no rate", () => {
    const source = read("server/routes/pos.routes.ts");
    expect(source).toMatch(/taxRate:\s*0\b/);
  });

  it("the column default was moved to zero too, by migration", () => {
    /**
     * The seventh fallback, and the only one outside the code: the DB column
     * default. Unreachable while every write path passes a rate explicitly, but
     * that is a property of today's callers rather than of the schema.
     *
     * The migration id is asserted, not the required version. Pinning the
     * version here makes every later migration fail this test for no reason.
     */
    expect(read("server/services/main-schema-migrate.service.ts"))
      .toContain("2026_08_16_pos_tax_rate_default_zero");
    expect(codeOnly(read("shared/schema.ts")))
      .toMatch(/taxRate:\s*real\(["']tax_rate["']\)\.default\(0\)/);
  });

  it("the receipt and invoice hide the VAT line when nothing was taxed", () => {
    /**
     * Not merely zero-rated. A permanent "VAT (0%): ৳0" row on every receipt is
     * honest but is noise, and it keeps inviting somebody to wire a rate back
     * into it.
     */
    for (const file of ["client/src/components/print/Receipt.tsx", "client/src/components/print/Invoice.tsx"]) {
      expect(read(file), file).toMatch(/parseFloat\(data\.tax\)\s*>\s*0/);
    }
  });
});
