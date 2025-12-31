/**
 * Repository Index
 * 
 * Exports all domain repositories.
 * Import from this file for easy access to all repository functions.
 * 
 * @example
 * import { userRepo, inventoryRepo, jobRepo } from './repositories';
 * 
 * const user = await userRepo.getUser('123');
 * const items = await inventoryRepo.getAllInventoryItems();
 * const job = await jobRepo.getJobTicket('JOB-2024-0001');
 */

// Re-export base utilities for advanced usage
export * from './base.js';

// ============================================
// Domain Repositories (12 total)
// ============================================

// User & Auth Repository
export * as userRepo from './user.repository.js';

// Customer Repository (addresses, reviews, inquiries)
export * as customerRepo from './customer.repository.js';

// Job Repository (repair job tickets)
export * as jobRepo from './job.repository.js';

// Service Request Repository (customer repair requests, timeline)
export * as serviceRequestRepo from './service-request.repository.js';

// Attendance Repository (staff check-in/out)
export * as attendanceRepo from './attendance.repository.js';

// Finance Repository (petty cash, dues, challans)
export * as financeRepo from './finance.repository.js';

// Inventory Repository (products, services, stock)
export * as inventoryRepo from './inventory.repository.js';

// Settings Repository (settings, policies, service catalog)
export * as settingsRepo from './settings.repository.js';

// Notification Repository (notifications, device tokens)
export * as notificationRepo from './notification.repository.js';

// Order Repository (shop orders, product variants)
export * as orderRepo from './order.repository.js';

// POS Repository (point of sale transactions)
export * as posRepo from './pos.repository.js';

// Analytics Repository (dashboard, reports)
export * as analyticsRepo from './analytics.repository.js';

