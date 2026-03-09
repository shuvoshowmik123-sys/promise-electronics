import { userRepo, notificationRepo } from '../repositories/index.js';
import { notifyAdminUpdate, notifyCorporateClient } from '../routes/middleware/sse-broker.js';
import { InsertNotification } from '../../shared/schema.js';
import { nanoid } from 'nanoid';


export interface CorporateNotificationParams {
    corporateClientId: string;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'warning' | 'repair' | 'shop';
    jobId?: string;
    link?: string;
    data?: Record<string, any>;
}

export interface CorporateJobNotificationParams {
    corporateClientId: string;
    jobId: string;
    device: string;
    oldStatus?: string;
    newStatus: string;
    message?: string;
    link?: string;
}

export const corporateNotificationService = {
    /**
     * Create a notification for a corporate client
     */
    async createCorporateNotification(params: CorporateNotificationParams) {
        try {
            // Get the corporate client's user(s)
            const result = await userRepo.getAllUsers(1, 10000);
            const users = result.items;
            const corporateUsers = users.filter(user =>
                user.corporateClientId === params.corporateClientId
            );

            // If no specific corporate user, we can't send notification
            if (corporateUsers.length === 0) {
                console.warn(`[CorporateNotification] No users found for corporate client ${params.corporateClientId}`);
                return;
            }

            console.log(`[CorporateNotification] Creating notification for ${corporateUsers.length} users of client ${params.corporateClientId}`);

            const creationPromises = corporateUsers.map(user => {
                const notification: InsertNotification = {
                    userId: user.id,
                    title: params.title,
                    message: params.message,
                    type: params.type || 'info',
                    link: params.link || (params.jobId ? `/corporate/jobs/${params.jobId}` : undefined),
                    corporateClientId: params.corporateClientId,
                    jobId: params.jobId,
                    contextType: 'corporate'
                };
                return notificationRepo.createNotification(notification);
            });

            const results = await Promise.all(creationPromises);

            // Send real-time update to admin panel
            notifyAdminUpdate({
                type: 'corporate_notification',
                corporateClientId: params.corporateClientId,
                title: params.title,
                message: params.message,
                jobId: params.jobId,
                timestamp: new Date().toISOString()
            });

            // Send real-time update to the corporate client
            notifyCorporateClient(params.corporateClientId, {
                type: params.type || 'info',
                title: params.title,
                message: params.message,
                jobId: params.jobId,
                link: params.link || (params.jobId ? `/corporate/jobs/${params.jobId}` : undefined),
                timestamp: new Date().toISOString(),
                notificationId: results[0]?.id, // First notification ID for reference
            });

            return results;
        } catch (error) {
            console.error('[CorporateNotificationService] Failed to create notification:', error);
            throw error;
        }
    },


    /**
     * Create a job completion notification
     */
    async createCorporateJobNotification(params: CorporateJobNotificationParams) {
        const title = `Job Completed: ${params.jobId}`;
        const message = params.message || `${params.device} repair has been completed and passed quality control.`;
        const link = params.link || `/corporate/jobs/${params.jobId}`;

        return this.createCorporateNotification({
            corporateClientId: params.corporateClientId,
            title,
            message,
            type: 'repair',
            jobId: params.jobId,
            link
        });
    },

    /**
     * Get corporate notifications for a specific corporate client
     */
    async getCorporateNotifications(corporateClientId: string) {
        try {
            // Get all users for this corporate client
            const result = await userRepo.getAllUsers(1, 10000);
            const users = result.items;
            const corporateUsers = users.filter(user =>
                user.corporateClientId === corporateClientId
            );

            if (corporateUsers.length === 0) {
                return [];
            }

            // Get notifications for all users of this corporate client
            const userNotificationsPromises = corporateUsers.map(user =>
                notificationRepo.getNotifications(user.id)
            );

            const userNotificationsArrays = await Promise.all(userNotificationsPromises);

            // Flatten and filter only corporate notifications
            const allNotifications = userNotificationsArrays.flat();
            const corporateNotifications = allNotifications.filter(notification =>
                notification.corporateClientId === corporateClientId
            );

            // Sort by creation date (newest first)
            return corporateNotifications.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        } catch (error) {
            console.error('[CorporateNotificationService] Failed to get notifications:', error);
            throw error;
        }
    },

    /**
     * Get unread notification count for a corporate client
     */
    async getCorporateUnreadCount(corporateClientId: string) {
        try {
            const notifications = await this.getCorporateNotifications(corporateClientId);
            return notifications.filter(n => !n.read).length;
        } catch (error) {
            console.error('[CorporateNotificationService] Failed to get unread count:', error);
            throw error;
        }
    },

    /**
     * Mark all corporate notifications as read for a specific corporate client
     */
    async markAllCorporateNotificationsAsRead(corporateClientId: string) {
        try {
            // Get all users for this corporate client
            const result = await userRepo.getAllUsers(1, 10000);
            const users = result.items;
            const corporateUsers = users.filter(user =>
                user.corporateClientId === corporateClientId
            );

            const markPromises = corporateUsers.map(user =>
                notificationRepo.markAllNotificationsAsRead(user.id)
            );

            await Promise.all(markPromises);
            return { success: true };
        } catch (error) {
            console.error('[CorporateNotificationService] Failed to mark notifications as read:', error);
            throw error;
        }
    },

    /**
     * Create notification for job status change
     */
    async createJobStatusUpdateNotification(params: {
        corporateClientId: string;
        jobId: string;
        device: string;
        oldStatus: string;
        newStatus: string;
        link?: string;
    }) {
        const title = `Job Status Updated: ${params.jobId}`;
        const message = `${params.device} status changed from ${params.oldStatus} to ${params.newStatus}.`;

        return this.createCorporateNotification({
            corporateClientId: params.corporateClientId,
            title,
            message,
            type: 'info',
            jobId: params.jobId,
            link: params.link
        });
    },

    /**
     * Create notification for service request update
     */
    async createServiceRequestUpdateNotification(params: {
        corporateClientId: string;
        requestId: string;
        status: string;
        link?: string;
    }) {
        const title = `Service Request Updated: ${params.requestId}`;
        const message = `Service request status changed to ${params.status}.`;

        return this.createCorporateNotification({
            corporateClientId: params.corporateClientId,
            title,
            message,
            type: 'info',
            link: params.link
        });
    }
};