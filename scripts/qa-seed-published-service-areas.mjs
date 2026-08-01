/**
 * QA-only: ensure named service areas exist with centroids.
 * MAP-BOUNDARY-02: does NOT fabricate viewport rectangles or auto-publish.
 * Boundaries must come from high-confidence OSM polygons or TerraDraw.
 */
import fs from "fs";
import pg from "pg";
import { randomUUID } from "crypto";

const env = fs.readFileSync(".env", "utf8");
const m = env.match(/DATABASE_URL="([^"]+)"/);
if (!m) throw new Error("DATABASE_URL missing");
const host = m[1];
if (/aiven|avns/i.test(host)) throw new Error("Refusing production/Aiven URL");

const c = new pg.Client({ connectionString: host, ssl: { rejectUnauthorized: false } });
await c.connect();
const info = await c.query("SELECT current_database() db, inet_server_addr()::text addr");
console.log("target", info.rows[0]);

const areas = [
  { city: "Dhaka", areaName: "Gulshan", subareaName: null, blockOrSector: null, lat: 23.7925, lon: 90.4078 },
  { city: "Dhaka", areaName: "Banani", subareaName: null, blockOrSector: null, lat: 23.7940, lon: 90.4043 },
  { city: "Dhaka", areaName: "Dhanmondi", subareaName: null, blockOrSector: null, lat: 23.7461, lon: 90.3742 },
];

const upserted = [];
for (const a of areas) {
  const key = [a.city, a.areaName, a.subareaName ?? "", a.blockOrSector ?? ""]
    .map((s) => s.toLowerCase().trim())
    .join(":");
  const existing = await c.query(
    "SELECT id FROM service_areas WHERE normalized_key = $1 LIMIT 1",
    [key],
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    // Keep existing real polygons; never re-inject seed boxes. Do not force is_public.
    await c.query(
      `UPDATE service_areas SET
        is_active = true,
        centroid_latitude = $2,
        centroid_longitude = $3,
        updated_at = NOW()
       WHERE id = $1`,
      [id, a.lat, a.lon],
    );
    upserted.push({ id, areaName: a.areaName, action: "centroid_upsert_active_unpublished_ok" });
  } else {
    const id = randomUUID();
    await c.query(
      `INSERT INTO service_areas (
        id, city, area_name, subarea_name, block_or_sector, normalized_key,
        is_active, is_public, centroid_latitude, centroid_longitude,
        boundary_geo_json, geometry_updated_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        true, false, $7, $8,
        NULL, NULL, NOW(), NOW()
      )`,
      [id, a.city, a.areaName, a.subareaName, a.blockOrSector, key, a.lat, a.lon],
    );
    upserted.push({ id, areaName: a.areaName, action: "created_active_unpublished_no_boundary" });
  }
}

await c.query(`
  UPDATE service_areas
  SET is_public = false, is_active = false, updated_at = NOW()
  WHERE area_name ILIKE 'QA%'
     OR area_name ILIKE '%Map03%'
     OR area_name ILIKE '%probe%'
`);

const pub = await c.query(`
  SELECT area_name, city, is_active, is_public, boundary_geo_json IS NOT NULL AS has_b
  FROM service_areas
  WHERE area_name IN ('Gulshan','Banani','Dhanmondi')
  ORDER BY area_name
`);
console.log("areas", pub.rows);
console.log("upserted", upserted);
console.log("NOTE: publish only after high-confidence OSM outline or TerraDraw — never seed boxes.");
await c.end();
