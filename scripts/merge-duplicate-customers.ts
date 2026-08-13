/**
 * Clean up the duplicate customer accounts the Google sign-in collision made.
 *
 *   npx tsx scripts/merge-duplicate-customers.ts --dry-run    # look only
 *   npx tsx scripts/merge-duplicate-customers.ts              # look, then merge
 *
 * Reads DATABASE_URL. It prints every pair it is about to touch before it
 * touches anything, and each merge is recorded row by row in audit_logs so it
 * can be reversed.
 *
 * Read this before running it, because it explains what the sweep CANNOT do:
 *
 * These duplicates exist precisely because nothing matched. A customer with a
 * phone account taps "Continue with Google"; the login looks for a Google id,
 * then for a matching email, and finding neither it makes a new account.
 * Registration does not require an email, so for most customers there was
 * nothing to match on in the first place.
 *
 * Which means the only pairs this can find on its own are the ones where an
 * email was filled in afterwards — where the two rows now share an address
 * that was not there at the time. Everything else has no evidence linking it,
 * and a query that guessed would move one customer's repair history onto
 * somebody else. Those are handled the other way: the customer signs in, the
 * shop reads them a join code, and the merge happens with them present.
 *
 * So expect this to find few or none. That is the honest result, not a failure.
 */
import { findAutoMergeableDuplicates, mergeCustomerAccounts } from "../server/services/account-merge.service.js";

const DRY_RUN = process.argv.includes("--dry-run");

function mask(phone: string | null): string {
    if (!phone) return "—";
    const digits = phone.replace(/\D/g, "");
    return digits.length > 4 ? `···${digits.slice(-4)}` : phone;
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is not set.");
        process.exit(1);
    }

    const candidates = await findAutoMergeableDuplicates();

    if (candidates.length === 0) {
        console.log("No duplicate pairs can be matched automatically.");
        console.log("");
        console.log("This is the expected result. A duplicate only exists because nothing");
        console.log("matched it to the real account, so there is usually nothing to match on");
        console.log("now either. Those customers are handled in the app: they sign in, and");
        console.log("Super Admin issues a join code from the customer's record.");
        return;
    }

    console.log(`${candidates.length} pair(s) can be matched on a shared email address:`);
    console.log("");
    for (const c of candidates) {
        console.log(`  ${c.email}`);
        console.log(`    duplicate : ${c.sourceId}  "${c.sourceName}"  (no phone)`);
        console.log(`    real      : ${c.targetId}  "${c.targetName}"  ${mask(c.targetPhone)}`);
    }
    console.log("");

    if (DRY_RUN) {
        console.log("--dry-run: nothing was changed.");
        return;
    }

    let merged = 0;
    let refused = 0;
    for (const c of candidates) {
        const result = await mergeCustomerAccounts({
            sourceId: c.sourceId,
            targetId: c.targetId,
            // Not a person: this ran as a sweep, and the record should say so
            // rather than name a staff member who was not there.
            actorId: "system:duplicate-sweep",
            reason: `Automatic sweep: duplicate Google account matched to the real account by shared email ${c.email}.`,
        });

        if ("ok" in result && result.ok) {
            merged += 1;
            console.log(`merged ${c.sourceId} → ${c.targetId}  (${result.plan.totalRows} row(s) moved, audit ${result.mergeId})`);
        } else {
            refused += 1;
            console.log(`refused ${c.sourceId} → ${c.targetId}: ${(result as any).reason}`);
        }
    }

    console.log("");
    console.log(`${merged} merged, ${refused} refused.`);
    console.log("Every merge is in audit_logs under entity 'CustomerAccountMerge', with the id of each row it moved.");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Sweep failed:", err?.message || err);
        process.exit(1);
    });
