/**
 * Auto-assigning the sole driver.
 *
 * A four-person shop with one driver should not be asked which driver. But the
 * rule has to stop applying the moment that stops being obvious — with two
 * drivers, choosing between real people is a routing decision, not a default.
 *
 * These prove both halves, and that it never takes a task off someone.
 *
 * Skips when no local PostgreSQL is reachable. The database is created and
 * dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_autoassign_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

function probeLocalPostgres(): boolean {
  if (!/localhost|127\.0\.0\.1|::1/i.test(MAINT_URL)) return false;
  const script = `
    const pg = require(${JSON.stringify("pg")});
    const c = new pg.Client({
      connectionString: ${JSON.stringify(MAINT_URL)},
      connectionTimeoutMillis: 3000,
    });
    c.connect().then(() => { console.log("PG_OK"); return c.end(); }).catch(() => { process.exit(0); });
  `;
  const res = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(), timeout: 10_000, encoding: "utf8",
  });
  return /PG_OK/.test(res.stdout || "");
}

const LOCAL_PG_AVAILABLE = probeLocalPostgres();

const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT
  );
  CREATE TABLE logistics_tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT, source_type TEXT,
    service_request_id TEXT, job_ticket_id TEXT, customer_id TEXT,
    customer_name TEXT, customer_phone TEXT, customer_phone_normalized TEXT,
    pickup_address TEXT, delivery_address TEXT,
    scheduled_date TEXT, time_window TEXT,
    status TEXT, assigned_driver_id TEXT, assigned_driver_name TEXT,
    zone TEXT, route_order NUMERIC,
    latitude NUMERIC, longitude NUMERIC,
    notes TEXT, failure_reason TEXT, proof_photo_url TEXT,
    completed_at TIMESTAMP, legacy_pickup_schedule_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  );
`;

describe.skipIf(!LOCAL_PG_AVAILABLE)("auto-assign sole driver (disposable PostgreSQL)", () => {
  let admin: pg.Client;
  let dbClient: pg.Client;
  let autoAssignSoleDriver: (taskId: string) => Promise<any>;
  let resetDbPool: (reason: string) => Promise<void>;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    originalEnv.DATABASE_URL = process.env.DATABASE_URL;
    admin = new pg.Client({ connectionString: MAINT_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    dbClient = new pg.Client({ connectionString: DISPOSABLE_URL });
    await dbClient.connect();
    await dbClient.query(SCHEMA);

    process.env.DATABASE_URL = DISPOSABLE_URL;
    const svc = await import("../server/services/logistics-task.service.js");
    autoAssignSoleDriver = svc.autoAssignSoleDriver;
    resetDbPool = (await import("../server/db.js")).resetDbPool;
  }, 60_000);

  beforeEach(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    await dbClient.query(`DELETE FROM users`);
    await dbClient.query(`DELETE FROM logistics_tasks`);
    await dbClient.query(`
      INSERT INTO logistics_tasks (id, task_type, status, customer_name)
      VALUES ('LT-1', 'pickup', 'pending', 'A Customer')
    `);
  });

  afterAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    if (resetDbPool) await resetDbPool("auto-assign test teardown");
    if (dbClient) await dbClient.end();
    if (admin) {
      await admin.query(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()
      `).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => undefined);
      await admin.end();
    }
  }, 30_000);

  const task = async () =>
    (await dbClient.query(`SELECT * FROM logistics_tasks WHERE id = 'LT-1'`)).rows[0];

  it("assigns when there is exactly one active driver", async () => {
    await dbClient.query(`INSERT INTO users VALUES ('d1','Rahim','Driver','Active')`);

    const result = await autoAssignSoleDriver("LT-1");

    expect(result?.assignedDriverId).toBe("d1");
    const row = await task();
    expect(row.assigned_driver_id).toBe("d1");
    expect(row.assigned_driver_name).toBe("Rahim");
    // pending -> assigned, so the board shows it as someone's job.
    expect(row.status).toBe("assigned");
  });

  it("does nothing when two drivers exist — that is a routing decision", async () => {
    await dbClient.query(`
      INSERT INTO users VALUES ('d1','Rahim','Driver','Active'), ('d2','Karim','Driver','Active')
    `);

    expect(await autoAssignSoleDriver("LT-1")).toBeNull();
    const row = await task();
    expect(row.assigned_driver_id).toBeNull();
    expect(row.status).toBe("pending");
  });

  it("does nothing when there are no drivers", async () => {
    expect(await autoAssignSoleDriver("LT-1")).toBeNull();
    expect((await task()).assigned_driver_id).toBeNull();
  });

  it("ignores an inactive driver rather than assigning to them", async () => {
    await dbClient.query(`INSERT INTO users VALUES ('d1','Former Driver','Driver','Inactive')`);
    expect(await autoAssignSoleDriver("LT-1")).toBeNull();
    expect((await task()).assigned_driver_id).toBeNull();
  });

  it("does not count non-drivers toward the single-driver rule", async () => {
    await dbClient.query(`
      INSERT INTO users VALUES
        ('d1','Rahim','Driver','Active'),
        ('t1','A Technician','Technician','Active'),
        ('m1','A Manager','Manager','Active')
    `);
    const result = await autoAssignSoleDriver("LT-1");
    expect(result?.assignedDriverId).toBe("d1");
  });

  it("never takes a task off a driver who already has it", async () => {
    await dbClient.query(`INSERT INTO users VALUES ('d1','Rahim','Driver','Active')`);
    await dbClient.query(`
      UPDATE logistics_tasks
      SET assigned_driver_id = 'someone-else', assigned_driver_name = 'Karim', status = 'assigned'
      WHERE id = 'LT-1'
    `);

    expect(await autoAssignSoleDriver("LT-1")).toBeNull();
    const row = await task();
    expect(row.assigned_driver_id).toBe("someone-else");
    expect(row.assigned_driver_name).toBe("Karim");
  });

  it("returns null for a task that does not exist instead of throwing", async () => {
    await dbClient.query(`INSERT INTO users VALUES ('d1','Rahim','Driver','Active')`);
    await expect(autoAssignSoleDriver("LT-nope")).resolves.toBeNull();
  });

  it("createTask auto-assigns when exactly one active driver exists", async () => {
    await dbClient.query(`DELETE FROM logistics_tasks`);
    await dbClient.query(`INSERT INTO users VALUES ('d1','Rahim','Driver','Active')`);
    const { createTask } = await import("../server/services/logistics-task.service.js");
    const task = await createTask({
      taskType: "pickup",
      sourceType: "manual",
      customerName: "New Task Customer",
    } as any);
    expect(task.assignedDriverId).toBe("d1");
    const row = (await dbClient.query(`SELECT * FROM logistics_tasks WHERE id = $1`, [task.id])).rows[0];
    expect(row.assigned_driver_id).toBe("d1");
  });
});
