/**
 * Letting a customer into the account the shop made for them.
 *
 * When a repair is booked at the counter, intake creates a customer record with
 * customerAccountState 'unclaimed' and a placeholder where a password would be.
 * Every door the customer later tries is then shut, and each one blames
 * something different:
 *
 *   register  "This phone is already linked to a repair record."
 *   log in    "Invalid phone number or password."   — there is no password
 *   reset     files a support ticket a human must notice and act on
 *
 * So the customer concludes they have forgotten a password they never set. This
 * is the reported bug: not authentication failing, but an account nobody can
 * open without a staff member.
 *
 * The way through is a six-digit code a staff member issues in the admin panel
 * and reads to the customer they are already speaking to. The code never leaves
 * this system — admin panel to customer portal, no SMS, no email, no outside
 * provider — which is the rule the custody handover code in this codebase
 * already follows. A first attempt at this sent the code by SMS; that was
 * wrong, and these tests exist partly to keep it from coming back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SERVICE = read("server/services/account-activation.service.ts");
const ROUTES = read("server/routes/customer.routes.ts");
const ADMIN_ROUTES = read("server/routes/users.routes.ts");
const PANEL = read("client/src/components/customer/AccountSetupPanel.tsx");
const LOGIN = read("client/src/pages/login.tsx");
const CUSTOMER_API = read("client/src/lib/api/customerApi.ts");
const ADMIN_TAB = read("client/src/pages/admin/bento/tabs/CustomersTab.tsx");

describe("the code never leaves this system", () => {
    it("is not sent by SMS from anywhere on this path", () => {
        // The shop sends no SMS. A code that travels out through a provider is
        // a code in somebody else's logs, and the one place this system already
        // handles codes — custody handover — refuses to do that.
        for (const [name, source] of [
            ["account-activation.service.ts", SERVICE],
            ["AccountSetupPanel.tsx", PANEL],
        ] as const) {
            expect(source, `${name} still reaches for SMS`).not.toContain("smsService");
            expect(source, `${name} still reaches for SMS`).not.toContain("sms.service");
        }
    });

    it("has no phone-verification SMS endpoint left in the server", () => {
        // /api/otp/send existed, sent a code through a provider, and no screen
        // in this system ever called it.
        expect(existsSync(join(ROOT, "server/routes/otp.routes.ts"))).toBe(false);
        const index = read("server/routes/index.ts");
        expect(index).not.toContain("otpRoutes");
    });

    it("does not text the staff-issued reset link either", () => {
        // Same rule, same reason: staff copy the link and hand it over.
        expect(ADMIN_ROUTES).not.toContain("smsService");
        expect(ADMIN_ROUTES).not.toContain("expires in 24h): ${url}");
    });
});

describe("the shop issues it, the customer never asks for it", () => {
    it("has no customer-facing start endpoint", () => {
        /**
         * An endpoint that answers "send a code to this number" has to decide
         * whether the number has an account, and its answer — or its timing —
         * is then a way to ask which customers the shop holds. Issuing from the
         * admin panel removes the question rather than defending it.
         */
        expect(ROUTES).not.toContain("/api/customer/account-setup/start");
        expect(CUSTOMER_API).not.toContain("startAccountSetup");
        expect(SERVICE).not.toContain("startActivation");
        expect(PANEL).not.toContain("Send me a code");
    });

    it("issues from the admin panel, once, to the staff member who asked", () => {
        expect(SERVICE).toContain("export async function issueSetupCode");
        const route = ADMIN_ROUTES.slice(ADMIN_ROUTES.indexOf("/api/admin/customers/:id/account-setup-code"));
        const handler = route.slice(0, route.indexOf("\n});"));
        expect(handler).toContain("requireGranularPermission('customers.edit')");
        expect(handler).toContain("res.json({ code: issued.code");
    });

    it("writes down every issuance with a name against it", () => {
        // Staff can already read the customer record, so this grants nothing
        // new — but "nothing new" is not the same as "unwatched".
        const route = ADMIN_ROUTES.slice(ADMIN_ROUTES.indexOf("/api/admin/customers/:id/account-setup-code"));
        const handler = route.slice(0, route.indexOf("\n});"));
        expect(handler).toContain("auditLogger.log");
        expect(handler).toContain("CustomerSetupCode");
        expect(SERVICE).toContain("issued_by:");
    });

    it("gives staff a way to reach it without reading the API docs", () => {
        expect(ADMIN_TAB).toContain("issueAccountSetupCode");
        expect(ADMIN_TAB).toContain("Give Account Setup Code");
    });

    it("retires any code already outstanding for that number", () => {
        // Otherwise a code read out an hour ago still opens the account.
        const issue = SERVICE.slice(SERVICE.indexOf("export async function issueSetupCode"));
        const body = issue.slice(0, issue.indexOf("\n}\n"));
        expect(body).toContain("db.update(otpCodes)");
        expect(body).toContain("isNull(otpCodes.verifiedAt)");
    });
});

describe("the code cannot be guessed or reused", () => {
    it("comes from crypto randomness", () => {
        // Math.random is seeded from the clock; a predictable setup code hands
        // over an account.
        expect(SERVICE).toContain("crypto.randomInt");
        expect(SERVICE).not.toContain("Math.random");
    });

    it("is stored hashed, and returned to nobody but the issuer", () => {
        expect(SERVICE).toContain('createHash("sha256")');
        expect(SERVICE).toContain("codeHash: hashCode(code)");
        // The completion path must never echo it back.
        const complete = SERVICE.slice(SERVICE.indexOf("export async function completeActivation"));
        expect(complete).not.toMatch(/return\s*\{[^}]*\bcode\b/);
    });

    it("expires, and stops after three wrong tries", () => {
        expect(SERVICE).toContain("CODE_TTL_MINUTES = 10");
        expect(SERVICE).toContain("MAX_ATTEMPTS = 3");
        expect(SERVICE).toContain("too_many_attempts");
    });

    it("is spent exactly once, even under a race", () => {
        /**
         * The update that marks it verified also requires it to be unverified,
         * so two requests arriving together cannot both win — the second
         * updates no rows and is rejected.
         *
         * isNull, not eq(col, null): the latter renders "= NULL" in SQL, which
         * matches nothing, and would have made every activation fail.
         */
        expect(SERVICE).toContain("isNull(otpCodes.verifiedAt)");
        expect(SERVICE).not.toContain("eq(otpCodes.verifiedAt, null");
        expect(SERVICE).toContain("if (spent.length === 0)");
    });

    it("cannot be spent on a different kind of code", () => {
        // otp_codes is shared with the custody handover codes. Without the
        // purpose filter, a code issued for one thing would open the other.
        expect(SERVICE).toContain('ACTIVATION_PURPOSE = "account_setup"');
        expect(SERVICE).toContain("eq(otpCodes.purpose, ACTIVATION_PURPOSE)");
    });

    it("is rate limited where the public can reach it", () => {
        const line = ROUTES.split("\n").find((l) => l.includes("router.post('/api/customer/account-setup/complete'"));
        expect(line, "the complete endpoint is not registered").toBeTruthy();
        expect(line, "the complete endpoint is not rate limited").toContain("Limiter");
    });
});

describe("only an unclaimed account can be claimed", () => {
    it("refuses an account that already has a password", () => {
        // Otherwise this is a password reset for anybody who can talk a staff
        // member into a code, which is a different decision from opening an
        // account that was never opened.
        expect(SERVICE).toContain("isPlaceholderPassword(user.password)");
        expect(SERVICE).toContain('user.role !== "Customer"');
        const issue = SERVICE.slice(SERVICE.indexOf("export async function issueSetupCode"));
        expect(issue.slice(0, issue.indexOf("\n}\n"))).toContain("if (!claimable) return null");
    });

    it("uses the shop's own placeholder test, not a guessed literal", () => {
        // The placeholder is "!no-customer-password!". Guessing it wrong makes
        // every intake account look claimable, or none of them.
        expect(SERVICE).toContain('from "./customer-password.js"');
        expect(SERVICE).not.toContain('=== "NO_CUSTOMER_PASSWORD"');
    });

    it("re-checks after the code is spent", () => {
        // The account may have been activated by another route between the code
        // being issued and being used.
        const complete = SERVICE.slice(SERVICE.indexOf("export async function completeActivation"));
        const afterSpend = complete.slice(complete.indexOf("await spendCode("));
        expect(afterSpend).toContain("findUnclaimed");
        expect(afterSpend).toContain("not_claimable");
    });

    it("spends a code through one implementation, whatever it is for", () => {
        /**
         * Setup codes and link codes share spendCode. Two copies would
         * eventually disagree about attempt counting or about what "expired"
         * means, and the disagreement would be the way in.
         *
         * isNull, not eq(col, null): the latter renders "= NULL", matches
         * nothing, and would make every code fail at the last step.
         */
        const spend = SERVICE.slice(SERVICE.indexOf("async function spendCode"));
        const body = spend.slice(0, spend.indexOf("\n}\n"));
        expect(body).toContain("isNull(otpCodes.verifiedAt)");
        expect(body).toContain("if (spent.length === 0)");
        expect(body).toContain("attempts: record.attempts + 1");
        // The purpose is a parameter, so a setup code can never open the link
        // path or the other way round.
        expect(body).toContain("eq(otpCodes.purpose, purpose)");
    });
});

describe("what the customer sees", () => {
    it("offers the self-serve door before the support request", () => {
        // The form below it raises a ticket somebody must notice; until they do,
        // the customer is stuck on "invalid password" for an account with no
        // password.
        const setupAt = LOGIN.indexOf("AccountSetupPanel");
        const formAt = LOGIN.indexOf("form-recovery-request");
        expect(setupAt).toBeGreaterThan(-1);
        expect(setupAt).toBeLessThan(formAt);
    });

    it("explains why the account already exists, and where the code comes from", () => {
        // Whitespace-collapsed: the sentence wraps across source lines, and a
        // test that breaks on re-indentation is a test that gets deleted.
        const prose = PANEL.replace(/\s+/g, " ");
        expect(prose).toContain("your account already exists");
        expect(prose).toContain("it just has no password yet");
        expect(prose).toContain("we will give you a 6-digit setup code");
    });

    it("never promises a message the shop will not send", () => {
        const prose = (PANEL + ROUTES).replace(/\s+/g, " ");
        expect(prose).not.toContain("code we sent you");
        expect(prose).not.toContain("We can send you a code");
    });

    it("signs them in rather than returning them to the login form", () => {
        // They have just proved the code and chosen a password; sending them
        // back to type it again returns them to the screen they were stuck on.
        expect(PANEL).toContain("onDone ? onDone() : window.location.assign");
        const complete = ROUTES.slice(ROUTES.indexOf("/api/customer/account-setup/complete"));
        expect(complete.slice(0, complete.indexOf("\n});"))).toContain("establishCustomerSession");
    });

    it("attaches the repairs booked before the account was opened", () => {
        // Otherwise they sign in successfully to an empty history, which reads
        // as another failure.
        const complete = ROUTES.slice(ROUTES.indexOf("/api/customer/account-setup/complete"));
        expect(complete.slice(0, complete.indexOf("\n});"))).toContain("linkServiceRequestsByPhone");
    });

    it("stops telling people to contact support with no way to do it", () => {
        expect(ROUTES).not.toContain("Please contact support to activate online access");
        expect(ROUTES).toContain("Call the shop and we will give you a setup code");
    });
});
