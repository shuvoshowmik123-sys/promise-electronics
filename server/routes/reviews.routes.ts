/**
 * Reviews Routes
 * 
 * Handles customer reviews.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { requireCustomerAuth, requireAdminAuth, getCustomerId } from './middleware/auth.js';

const router = Router();

// ============================================
// Customer Reviews API
// ============================================

/**
 * GET /api/reviews - Get approved reviews (public)
 */
router.get('/api/reviews', async (req: Request, res: Response) => {
    try {
        const reviews = await storage.getApprovedReviews();
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

/**
 * POST /api/reviews - Submit review (customer)
 */
router.post('/api/reviews', requireCustomerAuth, async (req: any, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Please login to submit a review' });
        }

        const user = await storage.getUser(customerId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { rating, title, content } = req.body;

        if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }
        if (!content || typeof content !== 'string' || content.trim().length < 10) {
            return res.status(400).json({ error: 'Review content must be at least 10 characters' });
        }

        const review = await storage.createCustomerReview({
            customerId,
            customerName: user.name,
            rating,
            title: title?.trim() || null,
            content: content.trim(),
        });

        res.status(201).json(review);
    } catch (error: any) {
        console.error('Failed to submit review:', error);
        res.status(500).json({ error: 'Failed to submit review' });
    }
});

/**
 * GET /api/admin/reviews - Get all reviews (admin)
 */
router.get('/api/admin/reviews', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const reviews = await storage.getAllReviews();
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

/**
 * PATCH /api/admin/reviews/:id/approval - Update review approval (admin)
 */
router.patch('/api/admin/reviews/:id/approval', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isApproved } = req.body;

        if (typeof isApproved !== 'boolean') {
            return res.status(400).json({ error: 'isApproved must be a boolean' });
        }

        const review = await storage.updateReviewApproval(id, isApproved);
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json(review);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update review approval' });
    }
});

/**
 * DELETE /api/admin/reviews/:id - Delete review (admin)
 */
router.delete('/api/admin/reviews/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteCustomerReview(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete review' });
    }
});

export default router;
