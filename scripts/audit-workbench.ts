import { db } from "../server/db";
import { systemModules } from "../shared/schema";
import { eq } from "drizzle-orm";

async function fullAudit() {
    console.log("=== FULL WORKBENCH AUDIT ===\n");

    // 1. Check all modules exist and have portalScope
    const modules = await db.select().from(systemModules);
    console.log(`✅ Total modules in DB: ${modules.length}`);

    let missingScope = 0;
    let scopeErrors: string[] = [];

    for (const mod of modules) {
        if (!mod.portalScope) {
            missingScope++;
            scopeErrors.push(`  ⚠️  ${mod.id} — missing portalScope (will default to "admin")`);
        }
    }

    if (missingScope > 0) {
        console.log(`\n⚠️  ${missingScope} modules missing portalScope:`);
        scopeErrors.forEach(e => console.log(e));
    } else {
        console.log(`✅ All modules have portalScope set`);
    }

    // 2. Check toggle fields are booleans
    let booleanErrors: string[] = [];
    for (const mod of modules) {
        if (typeof mod.enabledAdmin !== "boolean") booleanErrors.push(`${mod.id}.enabledAdmin = ${mod.enabledAdmin} (${typeof mod.enabledAdmin})`);
        if (typeof mod.enabledCustomer !== "boolean") booleanErrors.push(`${mod.id}.enabledCustomer = ${mod.enabledCustomer} (${typeof mod.enabledCustomer})`);
        if (typeof mod.enabledCorporate !== "boolean") booleanErrors.push(`${mod.id}.enabledCorporate = ${mod.enabledCorporate} (${typeof mod.enabledCorporate})`);
        if (typeof mod.enabledTechnician !== "boolean") booleanErrors.push(`${mod.id}.enabledTechnician = ${mod.enabledTechnician} (${typeof mod.enabledTechnician})`);
    }

    if (booleanErrors.length > 0) {
        console.log(`\n❌ ${booleanErrors.length} non-boolean toggle values:`);
        booleanErrors.forEach(e => console.log(`  ${e}`));
    } else {
        console.log(`✅ All toggle fields are proper booleans`);
    }

    // 3. Verify all portalScopes are valid
    const validPortals = ["admin", "customer", "corporate", "technician"];
    let invalidScopes: string[] = [];
    for (const mod of modules) {
        const scopes = (mod.portalScope || "admin").split(",").map(s => s.trim());
        for (const s of scopes) {
            if (!validPortals.includes(s)) {
                invalidScopes.push(`  ❌ ${mod.id} has invalid portal "${s}" in portalScope "${mod.portalScope}"`);
            }
        }
    }

    if (invalidScopes.length > 0) {
        console.log(`\n❌ Invalid portal scopes found:`);
        invalidScopes.forEach(e => console.log(e));
    } else {
        console.log(`✅ All portalScope values contain valid portal names`);
    }

    // 4. Test toggle write (toggle attendance admin ON, then back OFF)
    console.log(`\n--- Testing DB toggle write ---`);
    const testMod = modules.find(m => m.id === "attendance");
    if (testMod) {
        const originalState = testMod.enabledAdmin;
        console.log(`  attendance.enabledAdmin before: ${originalState}`);

        // Toggle ON
        await db.update(systemModules).set({ enabledAdmin: true, toggledAt: new Date() }).where(eq(systemModules.id, "attendance"));
        const [afterOn] = await db.select().from(systemModules).where(eq(systemModules.id, "attendance"));
        console.log(`  attendance.enabledAdmin after toggle ON: ${afterOn.enabledAdmin}`);

        // Toggle back
        await db.update(systemModules).set({ enabledAdmin: originalState, toggledAt: new Date() }).where(eq(systemModules.id, "attendance"));
        const [afterRestore] = await db.select().from(systemModules).where(eq(systemModules.id, "attendance"));
        console.log(`  attendance.enabledAdmin restored: ${afterRestore.enabledAdmin}`);
        console.log(`  ✅ DB toggle write works correctly`);
    }

    // 5. Print summary table
    console.log(`\n--- Module Summary ---`);
    console.log(`${"ID".padEnd(22)} ${"Scope".padEnd(30)} Admin  Cust   Corp   Tech`);
    console.log("-".repeat(90));
    for (const mod of modules) {
        console.log(`${mod.id.padEnd(22)} ${(mod.portalScope || "admin").padEnd(30)} ${mod.enabledAdmin ? "✅" : "❌"}      ${mod.enabledCustomer ? "✅" : "❌"}      ${mod.enabledCorporate ? "✅" : "❌"}      ${mod.enabledTechnician ? "✅" : "❌"}`);
    }

    console.log(`\n=== AUDIT COMPLETE ===`);
    process.exit(0);
}

fullAudit().catch(e => { console.error(e); process.exit(1); });
