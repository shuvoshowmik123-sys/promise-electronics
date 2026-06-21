import { Router, Request, Response } from "express";
import { requireAdminAuth, requirePermission } from "./middleware/auth.js";
import { repairJourneyService, JOURNEY_STAGES, type JourneyStage } from "../services/customer-repair-journey.service.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/customer-repair-journeys — list journeys with optional filters
 */
router.get(
  "/api/admin/customer-repair-journeys",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const { stage, status, limit } = req.query;
      const journeys = await repairJourneyService.getAdminJourneys({
        stage: stage as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
      res.json(journeys);
    } catch (error: any) {
      console.error("[RepairJourney] Admin list error:", (error as Error).message);
      res.status(500).json({ error: "Failed to fetch journeys" });
    }
  }
);

/**
 * GET /api/admin/customer-repair-journeys/:id — full detail with events, schedules, admin notes
 */
router.get(
  "/api/admin/customer-repair-journeys/:id",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const detail = await repairJourneyService.getAdminJourneyDetail(req.params.id);
      if (!detail) {
        return res.status(404).json({ error: "Journey not found" });
      }
      res.json(detail);
    } catch (error: any) {
      console.error("[RepairJourney] Admin detail error:", (error as Error).message);
      res.status(500).json({ error: "Failed to fetch journey detail" });
    }
  }
);

/**
 * POST /api/admin/customer-repair-journeys/:id/stage — update journey stage
 */
router.post(
  "/api/admin/customer-repair-journeys/:id/stage",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const { stage, adminNote, customerFriendlyStatus } = req.body;
      if (!stage || !JOURNEY_STAGES.includes(stage)) {
        return res.status(400).json({
          error: "Invalid stage",
          validStages: JOURNEY_STAGES,
        });
      }

      await repairJourneyService.updateJourneyStage(req.params.id, stage as JourneyStage, {
        adminNote,
        customerFriendlyStatus,
      });

      res.json({ status: "updated", stage });
    } catch (error: any) {
      console.error("[RepairJourney] Admin stage update error:", (error as Error).message);
      res.status(500).json({ error: "Failed to update stage" });
    }
  }
);

/**
 * POST /api/admin/customer-repair-journeys/:id/schedule/confirm — confirm a schedule
 */
router.post(
  "/api/admin/customer-repair-journeys/:id/schedule/confirm",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const { scheduleId, confirmedDate, confirmedTimeWindow, adminNote, assignedDriverId, zone, routeOrder } = req.body;
      if (!scheduleId || !confirmedDate || !confirmedTimeWindow) {
        return res.status(400).json({
          error: "scheduleId, confirmedDate, and confirmedTimeWindow are required",
        });
      }

      await repairJourneyService.confirmScheduleWithPickup(scheduleId, {
        confirmedDate,
        confirmedTimeWindow,
        adminNote,
        assignedDriverId,
        zone,
        routeOrder: routeOrder ? parseInt(routeOrder, 10) : undefined,
      });

      res.json({ status: "confirmed" });
    } catch (error: any) {
      console.error("[RepairJourney] Admin schedule confirm error:", (error as Error).message);
      res.status(500).json({ error: "Failed to confirm schedule" });
    }
  }
);

/**
 * POST /api/admin/customer-repair-journeys/:id/event — add admin event/note
 */
router.post(
  "/api/admin/customer-repair-journeys/:id/event",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const { eventType, title, message, isCustomerVisible, metadata } = req.body;
      if (!eventType || !title) {
        return res.status(400).json({ error: "eventType and title are required" });
      }

      const adminUser = (req as any).user;
      const eventId = await repairJourneyService.addJourneyEvent({
        journeyId: req.params.id,
        eventType,
        title,
        message,
        actorType: "admin",
        actorId: adminUser?.id,
        metadata,
        isCustomerVisible: isCustomerVisible !== false,
      });

      res.status(201).json({ eventId });
    } catch (error: any) {
      console.error("[RepairJourney] Admin event error:", (error as Error).message);
      res.status(500).json({ error: "Failed to add event" });
    }
  }
);

/**
 * GET /api/admin/customer-repair-schedules — list schedules with optional filters
 */
router.get(
  "/api/admin/customer-repair-schedules",
  requireAdminAuth,
  requirePermission("serviceRequests"),
  async (req: Request, res: Response) => {
    try {
      const statusFilter = (req.query.status as string) || null;
      const typeFilter = (req.query.scheduleType as string) || null;
      const maxRows = parseInt(req.query.limit as string) || 50;

      const rows = await db.execute(sql`
        SELECT s.*, j.customer_id, j.service_request_id
        FROM customer_repair_schedules s
        JOIN customer_repair_journeys j ON j.id = s.journey_id
        WHERE (${statusFilter}::text IS NULL OR s.status = ${statusFilter})
          AND (${typeFilter}::text IS NULL OR s.schedule_type = ${typeFilter})
        ORDER BY COALESCE(s.confirmed_date, s.requested_date) ASC NULLS LAST
        LIMIT ${maxRows}
      `);
      res.json(rows.rows);
    } catch (error: any) {
      console.error("[RepairJourney] Schedule list error:", (error as Error).message);
      res.status(500).json({ error: "Failed to fetch schedules" });
    }
  }
);

export default router;
