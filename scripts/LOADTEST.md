# Load Testing — safely, on a throwaway Neon branch

**Rule: never load-test the production database.** It pollutes real data, burns
free-tier quota, and can trip Neon limits. Use a Neon *branch* — an instant
copy-on-write clone you delete after.

## 1. Create a throwaway Neon branch

**Option A — Neon dashboard (easy):**
1. Neon Console → your project → **Branches** → **New Branch**.
2. Name it `loadtest`. Parent = `main`. Create.
3. Open the branch → **Connection string** → copy it (this is a *separate* DB,
   same schema + data snapshot, isolated from prod).

**Option B — Neon CLI:**
```bash
npx neonctl branches create --name loadtest
npx neonctl connection-string loadtest
```

## 2. Run the server against the branch

In a terminal (do NOT commit this URL anywhere):
```powershell
$env:DATABASE_URL = "<branch connection string>"
npm run dev
```
Server boots on :5083 wired to the branch. Prod DB is untouched.

## 3. (Optional) Get an admin cookie for authed endpoints

Log in at http://localhost:5083/admin in a browser → DevTools → Application →
Cookies → copy the `connect.sid` value. Without it, only public endpoints load-test.

## 4. Run the load test

```powershell
# defaults: 50 connections, 15s per endpoint
node scripts/loadtest.mjs

# heavier:
$env:CONNS = "200"; $env:DURATION = "30"
$env:COOKIE = "connect.sid=s%3A...your-value..."
node scripts/loadtest.mjs
```

`autocannon` is needed: `npm i -D autocannon` if not already present.

## 5. Read the results

- **req/sec** — throughput. Higher = better.
- **latency p50 / p97.5** — typical / tail response time. p97.5 is what slow users feel.
- **non-2xx / errors** — failures under load (pool exhaustion, timeouts).

Watch the **Neon branch dashboard** during the run: CPU %, active connections.
If connections pin at the pool `max` (10) and latency climbs → raise `DB_POOL_MAX`
or scale Render. If CPU pins → missing index or query cost (compare before/after
migration 0008).

## 6. Compare before/after the index migration

1. Run load test on the branch **before** applying `0008_perf_indexes.sql`.
2. Apply it:  `npm run db:push`  (with DATABASE_URL = branch).
3. Run again. The endpoints hitting newly-indexed columns
   (`/notifications`, drawer history, order/variant joins) should show lower
   p97.5 latency — proof the indexes matter at scale.

## 7. Clean up

Delete the branch when done (stops it counting against quota):
```bash
npx neonctl branches delete loadtest
```
Or dashboard → Branches → loadtest → Delete.
