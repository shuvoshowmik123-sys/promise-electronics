import { Router, Request, Response } from "express";
import { requireCustomerAuth, getCustomerId } from "./middleware/auth.js";
import { repairJourneyService } from "../services/customer-repair-journey.service.js";

const router = Router();

/**
 * GET /api/customer/repair-journeys — list all journeys for logged-in customer
 */
router.get(
  "/api/customer/repair-journeys",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }
      const journeys = await repairJourneyService.getCustomerJourneys(customerId);
      res.json(journeys);
    } catch (error: any) {
      console.error("[RepairJourney] List error:", (error as Error).message);
      res.status(500).json({ error: "Failed to fetch repair journeys" });
    }
  }
);

/**
 * GET /api/customer/repair-journeys/:id — detail with events & schedules
 */
router.get(
  "/api/customer/repair-journeys/:id",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }
      const detail = await repairJourneyService.getJourneyDetail(req.params.id, customerId);
      if (!detail) {
        return res.status(404).json({ error: "Journey not found" });
      }
      res.json(detail);
    } catch (error: any) {
      console.error("[RepairJourney] Detail error:", (error as Error).message);
      res.status(500).json({ error: "Failed to fetch journey detail" });
    }
  }
);

/**
 * POST /api/customer/repair-journeys/:id/schedule — request a pickup/delivery schedule
 */
router.post(
  "/api/customer/repair-journeys/:id/schedule",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }

      const detail = await repairJourneyService.getJourneyDetail(req.params.id, customerId);
      if (!detail) {
        return res.status(404).json({ error: "Journey not found" });
      }

      const { scheduleType, requestedDate, requestedTimeWindow, customerNote } = req.body;
      if (!scheduleType || !["pickup", "drop_off", "home_visit", "delivery"].includes(scheduleType)) {
        return res.status(400).json({ error: "Invalid schedule type" });
      }

      const scheduleId = await repairJourneyService.requestSchedule({
        journeyId: req.params.id,
        scheduleType,
        requestedDate,
        requestedTimeWindow,
        customerNote,
      });

      res.status(201).json({ scheduleId, status: "requested" });
    } catch (error: any) {
      console.error("[RepairJourney] Schedule error:", (error as Error).message);
      res.status(500).json({ error: "Failed to request schedule" });
    }
  }
);

/**
 * POST /api/customer/repair-journeys/:id/reschedule — reschedule an existing schedule
 */
router.post(
  "/api/customer/repair-journeys/:id/reschedule",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }

      const detail = await repairJourneyService.getJourneyDetail(req.params.id, customerId);
      if (!detail) {
        return res.status(404).json({ error: "Journey not found" });
      }

      const { scheduleId, newDate, newTimeWindow, customerNote } = req.body;
      if (!scheduleId || !newDate) {
        return res.status(400).json({ error: "scheduleId and newDate are required" });
      }

      const rescheduled = await repairJourneyService.requestReschedule(req.params.id, scheduleId, newDate, newTimeWindow, customerNote);
      if (!rescheduled) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json({ status: "reschedule_requested" });
    } catch (error: any) {
      console.error("[RepairJourney] Reschedule error:", (error as Error).message);
      res.status(500).json({ error: "Failed to request reschedule" });
    }
  }
);

/**
 * POST /api/customer/repair-journeys/:id/accept-quote — accept the quote
 * Delegates to the same real quote acceptance logic as POST /api/quotes/:id/accept
 */
router.post(
  "/api/customer/repair-journeys/:id/accept-quote",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }

      const { servicePreference, pickupTier, address, scheduledVisitDate } = req.body;

      const result = await repairJourneyService.acceptQuoteForJourney(
        req.params.id,
        customerId,
        { servicePreference, pickupTier, address, scheduledVisitDate }
      );

      if (!result.success) {
        return res.status(result.status).json({ error: result.error });
      }

      res.json(result.data);
    } catch (error: any) {
      console.error("[RepairJourney] Accept quote error:", (error as Error).message);
      res.status(500).json({ error: "Failed to accept quote" });
    }
  }
);

/**
 * POST /api/customer/repair-journeys/:id/ask-question — customer posts a question
 */
router.post(
  "/api/customer/repair-journeys/:id/ask-question",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }

      const { question } = req.body;
      if (!question || typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({ error: "Question text is required" });
      }

      const eventId = await repairJourneyService.addCustomerQuestion(
        req.params.id,
        customerId,
        question.trim()
      );
      if (!eventId) {
        return res.status(404).json({ error: "Journey not found" });
      }

      res.status(201).json({ eventId });
    } catch (error: any) {
      console.error("[RepairJourney] Ask question error:", (error as Error).message);
      res.status(500).json({ error: "Failed to submit question" });
    }
  }
);

/**
 * POST /api/customer/warranties/:jobId/claim — submit a warranty claim
 */
router.post(
  "/api/customer/warranties/:jobId/claim",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
      }

      const { claimType, issueDescription } = req.body;
      if (!claimType || !["service", "parts"].includes(claimType)) {
        return res.status(400).json({ error: "Claim type must be 'service' or 'parts'" });
      }
      if (!issueDescription || typeof issueDescription !== "string" || issueDescription.trim().length === 0) {
        return res.status(400).json({ error: "Issue description is required" });
      }

      const result = await repairJourneyService.createWarrantyClaim({
        jobId: req.params.jobId,
        customerId,
        claimType,
        issueDescription: issueDescription.trim(),
      });

      if (!result.success) {
        return res.status(result.status).json({ error: result.error });
      }

      res.status(201).json({ claimId: result.claimId, message: "Warranty claim submitted successfully" });
    } catch (error: any) {
      console.error("[RepairJourney] Warranty claim error:", (error as Error).message);
      res.status(500).json({ error: "Failed to submit warranty claim" });
    }
  }
);

export default router;
