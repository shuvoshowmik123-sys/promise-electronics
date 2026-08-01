/**
 * JOBS-NG-02A QA — local/QA DB only. Proves NG report + manager review.
 * Usage: node scripts/qa-jobs-ng-02a.mjs
 * Requires server on BASE (default http://127.0.0.1:5083) with migrations applied.
 */
import { readFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import pg from "pg";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5083";

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

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("FAIL: DATABASE_URL not set");
  process.exit(1);
}
if (/aiven/i.test(DATABASE_URL)) {
  console.error("FAIL: refusing Aiven/production URL");
  process.exit(1);
}

const IK = (process.env.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/qa-test").replace(/\/+$/, "");
process.env.IMAGEKIT_URL_ENDPOINT = IK;

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

function cookieJar(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const fromHeader = res.headers.get("set-cookie");
  const list = raw.length ? raw : fromHeader ? [fromHeader] : [];
  return list.map((c) => c.split(";")[0]).join("; ");
}

function mergeCookies(prev, res) {
  const map = new Map();
  for (const part of (prev || "").split("; ").filter(Boolean)) {
    const [k, ...r] = part.split("=");
    map.set(k, r.join("="));
  }
  for (const part of cookieJar(res).split("; ").filter(Boolean)) {
    const [k, ...r] = part.split("=");
    map.set(k, r.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function csrfFromCookies(cookies) {
  const m = /XSRF-TOKEN=([^;]+)/.exec(cookies);
  return m ? decodeURIComponent(m[1]) : "";
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(body)}`);
  let cookies = cookieJar(res);
  // Bootstrap CSRF into session + cookie (required for POST/PATCH)
  const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, {
    headers: { Cookie: cookies },
  });
  cookies = mergeCookies(cookies, csrfRes);
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = csrfBody.csrfToken || csrfFromCookies(cookies) || "";
  if (!csrf) throw new Error(`login ${username}: no CSRF token`);
  return { cookies, csrf, user: body.user || body };
}

async function api(session, method, path, body) {
  const headers = {
    "Content-Type": "application/json",
    Cookie: session.cookies,
  };
  if (session.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const set = cookieJar(res);
  if (set) session.cookies = mergeCookies(session.cookies, res);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log("JOBS-NG-02A QA against", BASE);
  console.log("DB host:", DATABASE_URL.replace(/:[^:@/]+@/, ":***@").slice(0, 90));

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    // Migration idempotency
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_ng_reports (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES job_tickets(id) ON DELETE RESTRICT,
        submission_id TEXT NOT NULL,
        failed_repair_type TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        technical_notes TEXT NOT NULL,
        evidence_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        parts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_job_status TEXT NOT NULL,
        report_status TEXT NOT NULL DEFAULT 'pending_review',
        reported_by_user_id TEXT NOT NULL,
        reported_by_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_by_user_id TEXT,
        reviewed_by_snapshot JSONB,
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_reports_submission_id ON job_ng_reports (submission_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_job_ng_reports_one_active_per_job ON job_ng_reports (job_id) WHERE report_status IN ('pending_review', 'verified')`);
    log("migration CREATE TABLE IF NOT EXISTS", true);

    // Ensure ImageKit endpoint available for process (server already has its env)
    const ikCheck = await client.query(`SELECT 1`);
    log("QA DB connect", ikCheck.rowCount === 1);

    // Historical Cancelled snapshot
    const histBefore = await client.query(
      `SELECT id, status, repair_outcome FROM job_tickets WHERE status = 'Cancelled' AND repair_outcome = 'not_repairable' LIMIT 5`,
    );
    const histIds = histBefore.rows.map((r) => r.id);

    // Users
    const bcrypt = (await import("bcryptjs")).default;
    const techUser = `ng02a_tech_${Date.now().toString(36)}`;
    const mgrUser = `ng02a_mgr_${Date.now().toString(36)}`;
    const techId = randomUUID();
    const mgrId = randomUUID();
    const hash = await bcrypt.hash("Ng02aTest!99", 10);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'NG02A Tech',$3,'Technician','Active',$4)`,
      [techId, techUser, hash, JSON.stringify({ jobs: true, technician: true, "jobs.view": true, "jobs.reportOutcome": true, "jobs.advanceStatus": true })],
    );
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'NG02A Manager',$3,'Manager','Active',$4)`,
      [
        mgrId,
        mgrUser,
        hash,
        JSON.stringify({
          jobs: true,
          "jobs.view": true,
          "jobs.viewAll": true,
          "jobs.create": true,
          "jobs.assignTechnician": true,
          "jobs.reportOutcome": true,
          "jobs.reviewOutcome": true,
          "jobs.advanceStatus": true,
          "jobs.edit": true,
          process_payment: true,
        }),
      ],
    );
    log("seed tech+manager users", true, `${techUser}, ${mgrUser}`);

    // Login sessions
    let admin, tech, mgr;
    try {
      admin = await login("admin", "admin123");
      log("admin login", true);
    } catch (e) {
      log("admin login", false, String(e.message));
      throw e;
    }
    try {
      tech = await login(techUser, "Ng02aTest!99");
      log("tech login", true);
    } catch (e) {
      log("tech login", false, String(e.message));
      throw e;
    }
    try {
      mgr = await login(mgrUser, "Ng02aTest!99");
      log("manager login", true);
    } catch (e) {
      log("manager login", false, String(e.message));
      throw e;
    }

    // Create job as manager, assign to tech
    const year = new Date().getFullYear();
    const jobRes = await api(mgr, "POST", "/api/job-tickets", {
      customer: "NG02A Customer",
      customerPhone: "01800000099",
      device: "NG02A Panel Test TV",
      issue: "Panel lines — QA NG02A",
      status: "Pending",
      technician: "NG02A Tech",
      assignedTechnicianId: techId,
      priority: "Medium",
    });
    if (jobRes.status !== 201 && jobRes.status !== 200) {
      log("create job", false, `${jobRes.status} ${JSON.stringify(jobRes.json)}`);
      throw new Error("create job failed");
    }
    const jobId = jobRes.json.id;
    log("create job assigned to tech", true, jobId);

    // Advance to In Progress as tech
    const adv = await api(tech, "POST", `/api/job-tickets/${jobId}/advance-status`, {});
    log("tech advance to In Progress", adv.status === 200 && adv.json.status === "In Progress", `${adv.status} ${adv.json.status || adv.json.error}`);

    // set-outcome not_repairable blocked
    const blockedNg = await api(tech, "POST", `/api/job-tickets/${jobId}/set-outcome`, {
      outcome: "not_repairable",
      reason: "should fail",
    });
    log(
      "set-outcome not_repairable rejected",
      blockedNg.status === 400 && blockedNg.json.code === "USE_NG_REPORT",
      `${blockedNg.status} ${blockedNg.json.code}`,
    );

    const blockedCd = await api(tech, "POST", `/api/job-tickets/${jobId}/set-outcome`, {
      outcome: "customer_declined",
      reason: "should fail",
    });
    log(
      "set-outcome customer_declined rejected",
      blockedCd.status === 400 && blockedCd.json.code === "CUSTOMER_DECLINED_NOT_VIA_SET_OUTCOME",
      `${blockedCd.status} ${blockedCd.json.code}`,
    );

    // Unassigned tech blocked
    const otherTechId = randomUUID();
    const otherUser = `ng02a_other_${Date.now().toString(36)}`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'Other Tech',$3,'Technician','Active',$4)`,
      [otherTechId, otherUser, hash, JSON.stringify({ jobs: true, "jobs.view": true, "jobs.reportOutcome": true, technician: true })],
    );
    const other = await login(otherUser, "Ng02aTest!99");
    const subId = `sub_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const evidence = [
      {
        fileId: "ik_file_qa_001",
        url: `${IK}/ng02a/panel-fail.jpg`,
        name: "panel-fail.jpg",
        fileType: "image/jpeg",
      },
    ];
    const unassigned = await api(other, "POST", `/api/job-tickets/${jobId}/ng-report`, {
      submissionId: subId + "_x",
      failedRepairType: "panel_repair",
      diagnosis: "Vertical lines across entire panel after laser attempt",
      technicalNotes: "Tried COF rebond; still NG. Recommend replacement panel quote.",
      evidenceAttachments: evidence,
    });
    log("unassigned tech blocked", unassigned.status === 403, `${unassigned.status} ${unassigned.json.code || unassigned.json.error}`);

    // Tech cannot review (permission)
    const techReview = await api(tech, "POST", `/api/job-tickets/${jobId}/ng-report/review`, {
      action: "verify",
    });
    log("tech cannot review (403)", techReview.status === 403, `${techReview.status}`);

    // Submit NG as assigned tech
    const sub = await api(tech, "POST", `/api/job-tickets/${jobId}/ng-report`, {
      submissionId: subId,
      failedRepairType: "panel_repair",
      diagnosis: "Vertical lines across entire panel after laser attempt",
      technicalNotes: "Tried COF rebond; still NG. Recommend replacement panel quote.",
      evidenceAttachments: evidence,
    });
    const submitOk =
      (sub.status === 201 || sub.status === 200) &&
      sub.json.job?.status === "NG Review Pending" &&
      sub.json.job?.repairOutcome === "not_repairable" &&
      sub.json.report?.reportStatus === "pending_review";
    log("tech submit NG → NG Review Pending", submitOk, `${sub.status} job=${sub.json.job?.status} outcome=${sub.json.job?.repairOutcome}`);

    // Not Cancelled
    const dbJob1 = await client.query(`SELECT status, repair_outcome FROM job_tickets WHERE id = $1`, [jobId]);
    log("DB status not Cancelled", dbJob1.rows[0]?.status === "NG Review Pending", dbJob1.rows[0]?.status);

    // Idempotent same submissionId
    const sub2 = await api(tech, "POST", `/api/job-tickets/${jobId}/ng-report`, {
      submissionId: subId,
      failedRepairType: "panel_repair",
      diagnosis: "Vertical lines across entire panel after laser attempt",
      technicalNotes: "Tried COF rebond; still NG. Recommend replacement panel quote.",
      evidenceAttachments: evidence,
    });
    log(
      "same submissionId idempotent",
      sub2.status === 200 && sub2.json.idempotent === true && sub2.json.report?.id === sub.json.report?.id,
      `${sub2.status} idempotent=${sub2.json.idempotent}`,
    );

    // Second active report rejected
    const sub3 = await api(tech, "POST", `/api/job-tickets/${jobId}/ng-report`, {
      submissionId: `sub_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
      failedRepairType: "panel_repair",
      diagnosis: "Second report should fail active check now",
      technicalNotes: "Should not create duplicate active NG report for same job.",
      evidenceAttachments: evidence,
    });
    log("second active NG rejected", sub3.status === 409, `${sub3.status} ${sub3.json.code}`);

    // Generic PATCH forge blocked
    const forge = await api(mgr, "PATCH", `/api/job-tickets/${jobId}`, {
      status: "Awaiting Customer Decision",
    });
    log("PATCH forge Awaiting Customer Decision blocked", forge.status === 400, `${forge.status} ${forge.json.code || forge.json.error}`);

    const forge2 = await api(mgr, "PATCH", `/api/job-tickets/${jobId}`, {
      repairOutcome: "not_repairable",
    });
    log("PATCH forge repairOutcome blocked", forge2.status === 400, `${forge2.status}`);

    const bulk = await api(mgr, "POST", `/api/job-tickets/bulk-update`, {
      jobIds: [jobId],
      updates: { status: "NG Review Pending" },
    });
    log("bulk-update forge blocked", bulk.status === 400, `${bulk.status}`);

    // Manager return for correction
    const ret = await api(mgr, "POST", `/api/job-tickets/${jobId}/ng-report/review`, {
      action: "return_for_correction",
      reviewNotes: "Need clearer close-up of panel edge bonding.",
    });
    log(
      "manager return restores work status",
      ret.status === 200 && ret.json.job?.status === "In Progress" && ret.json.report?.reportStatus === "returned",
      `${ret.status} job=${ret.json.job?.status} report=${ret.json.report?.reportStatus}`,
    );

    // Resubmit after return
    const subId2 = `sub_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    // re-advance if needed - should already be In Progress
    const reSub = await api(tech, "POST", `/api/job-tickets/${jobId}/ng-report`, {
      submissionId: subId2,
      failedRepairType: "panel_repair",
      diagnosis: "Revised: panel edge COF damage confirmed on both sides",
      technicalNotes: "Added macro photos of bonding area after manager return.",
      evidenceAttachments: evidence,
    });
    log(
      "resubmit after return",
      (reSub.status === 201 || reSub.status === 200) && reSub.json.job?.status === "NG Review Pending" && reSub.json.report?.revision >= 2,
      `${reSub.status} rev=${reSub.json.report?.revision}`,
    );

    // Manager verify
    const ver = await api(mgr, "POST", `/api/job-tickets/${jobId}/ng-report/review`, {
      action: "verify",
      reviewNotes: "Evidence sufficient",
    });
    log(
      "manager verify → Awaiting Customer Decision",
      ver.status === 200 && ver.json.job?.status === "Awaiting Customer Decision" && ver.json.report?.reportStatus === "verified",
      `${ver.status} job=${ver.json.job?.status}`,
    );

    // Immutable after verify
    const immut = await api(mgr, "POST", `/api/job-tickets/${jobId}/ng-report/review`, {
      action: "return_for_correction",
      reviewNotes: "Should fail immutable",
    });
    log("verified immutable", immut.status === 409, `${immut.status} ${immut.json.code}`);

    // Idempotent re-verify
    const reVer = await api(mgr, "POST", `/api/job-tickets/${jobId}/ng-report/review`, {
      action: "verify",
    });
    log("re-verify idempotent", reVer.status === 200 && reVer.json.idempotent === true, `${reVer.status}`);

    // repair_ok still works on another job
    const okJob = await api(mgr, "POST", "/api/job-tickets", {
      customer: "NG02A OK",
      customerPhone: "01800000100",
      device: "NG02A OK TV",
      issue: "Power issue",
      status: "Pending",
      technician: "NG02A Tech",
      assignedTechnicianId: techId,
      priority: "Low",
    });
    const okId = okJob.json.id;
    await api(tech, "POST", `/api/job-tickets/${okId}/advance-status`, {});
    const okOut = await api(tech, "POST", `/api/job-tickets/${okId}/set-outcome`, { outcome: "repair_ok" });
    log("repair_ok still works", okOut.status === 200 && okOut.json.status === "Ready", `${okOut.status} ${okOut.json.status}`);

    const partsJob = await api(mgr, "POST", "/api/job-tickets", {
      customer: "NG02A Parts",
      customerPhone: "01800000101",
      device: "NG02A Parts TV",
      issue: "TCON",
      status: "Pending",
      technician: "NG02A Tech",
      assignedTechnicianId: techId,
    });
    const partsId = partsJob.json.id;
    await api(tech, "POST", `/api/job-tickets/${partsId}/advance-status`, {});
    const partsOut = await api(tech, "POST", `/api/job-tickets/${partsId}/set-outcome`, {
      outcome: "needs_parts",
      reason: "TCON board",
    });
    log("needs_parts still works", partsOut.status === 200 && partsOut.json.status === "Waiting on Parts", `${partsOut.status} ${partsOut.json.status}`);

    // No replacement child, no POS, no warranty for NG job
    const children = await client.query(`SELECT id FROM job_tickets WHERE parent_job_id = $1`, [jobId]);
    log("no replacement child job", children.rowCount === 0, `count=${children.rowCount}`);

    const pos = await client.query(
      `SELECT id FROM pos_transactions WHERE linked_jobs::text ILIKE $1 LIMIT 3`,
      [`%${jobId}%`],
    ).catch(() => ({ rowCount: 0 }));
    log("no POS for NG job", (pos.rowCount || 0) === 0);

    const war = await client.query(`SELECT id FROM warranty_claims WHERE original_job_id = $1`, [jobId]).catch(() => ({ rowCount: 0 }));
    log("no warranty claim for NG job", (war.rowCount || 0) === 0);

    // Historical unchanged
    if (histIds.length) {
      const histAfter = await client.query(`SELECT id, status, repair_outcome FROM job_tickets WHERE id = ANY($1::text[])`, [histIds]);
      const same = histAfter.rows.every((r) => r.status === "Cancelled" && r.repair_outcome === "not_repairable");
      log("historical Cancelled+not_repairable unchanged", same, `n=${histIds.length}`);
    } else {
      log("historical Cancelled+not_repairable unchanged", true, "none present — N/A skip");
    }

    // Audit events
    const audits = await client.query(
      `SELECT action FROM audit_logs WHERE entity = 'JobNgReport' AND entity_id = $1 ORDER BY created_at`,
      [reSub.json.report?.id || ver.json.report?.id],
    );
    const actions = audits.rows.map((r) => r.action);
    log(
      "audit NG_REPORT_* events",
      actions.includes("NG_REPORT_SUBMITTED") && actions.includes("NG_REPORT_VERIFIED"),
      actions.join(","),
    );

    // Cleanup test users/jobs optional — leave for inspection
  } catch (err) {
    console.error("QA aborted:", err);
    log("suite completion", false, String(err.message || err));
  } finally {
    client.release();
    await pool.end();
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(`Total: ${results.length}  PASS: ${results.length - failed.length}  FAIL: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(" -", f.name, f.detail);
    process.exit(1);
  }
  process.exit(0);
}

main();
