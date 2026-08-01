/**
 * Runs retail quote admin acceptance migration into an isolated schema.
 * Usage: npx tsx scripts/qa-run-isolated-rqaa-migrate.mjs <schemaName>
 */
import { readFileSync, existsSync } from "fs";

function loadEnv() {
  for (const f of [".env", ".env.qa"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const schemaName = process.argv[2];
if (!schemaName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
  console.error("Usage: tsx scripts/qa-run-isolated-rqaa-migrate.mjs <schemaName>");
  process.exit(1);
}

const { migrateRetailQuoteAdminAcceptanceTables } = await import(
  "../server/services/retail-quote-admin-acceptance-migration.service.ts"
);
await migrateRetailQuoteAdminAcceptanceTables({ schemaName });
console.log("OK", schemaName);
