import { userRepo, notificationRepo } from '../repositories/index.js';
import { notifyAdminUpdate } from '../routes/middleware/sse-broker.js';
import { InsertNotification } from '../../shared/schema.js';

export const notificationService = {
    /**
     * Broadcast a notification to authorized admins.
     * - Persists the notification to the DB for each authorized user.
     * - Sends a real-time SSE signal to update the UI.
     */
    async broadcastAdminNotification(params: {
        title: string;
        message: string;
        type?: string;
        link?: string;
        actionActor?: string; // Who performed the action
    }) {
        try {
            // 1. Fetch all users to determine recipients
            const result = await userRepo.getAllUsers(1, 10000); // Admin users typically
            const admins = result.items.filter(u => ['Super Admin', 'Manager'].includes(u.role));
            const technicians = result.items.filter((user: any) => user.role === 'Technician');
            const recipients = result.items.filter(user => {
                // Parse permissions if it's a string (legacy/schema definition mismatch handling)
                let perms: any = {};
                try {
                    if (typeof user.permissions === 'string') {
                        perms = JSON.parse(user.permissions);
                    } else {
                        perms = user.permissions;
                    }
                } catch (e) {
                    // Default to empty if parsing fails
                }

                const isSuperAdmin = user.role === 'Super Admin' || user.role === 'Admin'; // Include 'Admin' for safety based on existing logic
                const hasPermission = perms.receiveNotifications === true;

                if (isSuperAdmin) {
                    console.log(`[Notification] User ${user.id} (${user.name}) matched as ADMIN/SUPER_ADMIN`);
                }
                if (hasPermission) {
                    console.log(`[Notification] User ${user.id} (${user.name}) matched via Permission`);
                }

                return isSuperAdmin || hasPermission;
            });

            console.log(`[Notification] Broadcasting "${params.title}" to ${recipients.length} recipients.`);
            recipients.forEach(r => console.log(`[Notification] Target Recipient: ${r.id} (${r.name})`));

            // 3. Create persistent records for each recipient
            const creationPromises = recipients.map(user => {
                // Avoid sending notification to the actor themselves (optional, but requested logic "from staff to admin")
                // preventing spam if an admin edits something. 
                // For now, we notify ALL appropriate admins so Super Admin sees their own actions in history too.

                const notification: InsertNotification = {
                    userId: user.id,
                    title: params.title,
                    message: params.message,
                    type: params.type || 'info',
                    link: params.link,

                };
                return notificationRepo.createNotification(notification);
            });

            await Promise.all(creationPromises);

            // 4. Send Real-time Signal (The existing SSE broker broadcasts to ALL connected admins)
            // The frontend should ideally filter or just re-fetch notifications on this signal.
            notifyAdminUpdate({
                type: 'notification_broadcast',
                title: params.title,
                message: params.message,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('[NotificationService] Failed to broadcast:', error);
        }
    }
};
