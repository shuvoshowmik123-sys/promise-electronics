# Forward MAIN baseline — `v2026_07_20_corporate_declaration`

## Scope (strict)

This is a **forward-only** test baseline at MAIN registry head:

`REQUIRED_MAIN_SCHEMA_VERSION = 2026_07_20_corporate_declaration` (31 ledger rows).

**Use for:** `this baseline → next MAIN migration` proofs.

**Not evidence that:** the historical 31 incremental migrations can create the app schema from an empty database. Historical full-chain / genesis remains **NOT VERIFIED** (see `CORPORATE-JOB-STATUS-01A-HOTFIX-2`).

## Files

| File | Content |
|------|---------|
| `schema.sql` | Schema-only dump (`--no-owner --no-privileges`), no application data |
| `promise-schema-migrations.sql` | Data-only export of **only** `promise_schema_migrations` from the same capture |
| `manifest.json` | Version, hashes, migration id/checksum list (identity **A** = historic ledger checksums; no DB URL) |
| `frozen-source-identity.json` | Identity **B** = frozen *current source* checksums for adopted historic ids (Git-reviewed; not equal to A when bodies drifted) |
| `restore-and-verify.mjs` | Disposable local restore + dual release-CLI verify + drop |

### Two-identity disposable adoption

- **A** = `manifest.json` → `migrations[].checksum` (expected ledger values after restore)
- **B** = `frozen-source-identity.json` → `migrations[].sourceChecksum` (must match `computeMigrationChecksum` today)
- Adoption verifies B against current source and baseline SQL hashes; it does **not** require A === current source.
- Populate/refresh B only via reviewed operator command (never at acceptance time):

```bash
npm run schema:adoption:emit-frozen-identity
```

Disposable end-to-end proof (requires local PostgreSQL + opt-in env). **Must** run under project TSX — not plain Node:

```bash
MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true BASELINE_PGPASSWORD=... npm run schema:adoption:proof
# equivalent: npx tsx scripts/disposable-baseline-adoption-proof.ts
# thin launcher (also forces tsx): node scripts/disposable-baseline-adoption-proof.mjs
```

## Capture provenance

1. Local development DB only (not Aiven/Neon/production).
2. `verifyMainSchemaLedger()` **PASS** at exact registry head (31/31, no missing/mismatch/extra).
3. Schema and ledger exported from that verified state in one capture window.
4. SHA-256 of SQL files recorded in `manifest.json`.

## Restore / proof commands

```bash
# Requires local PostgreSQL and BASELINE_PGPASSWORD (or PGPASSWORD).
# Set BASELINE_PGHOST / BASELINE_PGPORT / BASELINE_PGUSER if not defaults.
npx tsx db-baselines/main-schema/v2026_07_20_corporate_declaration/restore-and-verify.mjs
```

What it does:

1. Verify SQL hashes vs `manifest.json`
2. `CREATE DATABASE promise_bl_v31_<stamp>_<hex>`
3. Restore `schema.sql` then `promise-schema-migrations.sql`
4. Assert ledger count 31, `users`/`job_tickets` empty, `corporate_declaration` column present
5. `MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main` twice (idempotent / already complete)
6. `verifyMainSchemaLedger()` → 31/31
7. Drop **only** that disposable database

## Forbidden uses

- Claiming historical genesis/full-chain migrate
- Hand-editing ledger SQL
- Shipping application/customer data in this baseline
- Cloud/production restore without separate authorization
