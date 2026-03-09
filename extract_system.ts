import * as fs from 'fs';

function main() {
    // Routes to wire
    const routes = [
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/settings.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/notifications.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/admin-notifications.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/audit.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/upload.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/quotes.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/refunds.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/warranty.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/leave.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/payroll.routes.ts'
    ];

    for (const route of routes) {
        if (!fs.existsSync(route)) continue;
        let c = fs.readFileSync(route, 'utf8');

        // Settings
        c = c.replace(/storage\.getAllSettings\(/g, 'settingsRepo.getAllSettings(');
        c = c.replace(/storage\.updateSettings\(/g, 'settingsRepo.updateSettings(');
        c = c.replace(/storage\.getSetting\(/g, 'settingsRepo.getSetting(');

        // Notifications
        c = c.replace(/storage\.getNotifications\(/g, 'notificationRepo.getNotifications(');
        c = c.replace(/storage\.markAllNotificationsAsRead\(/g, 'notificationRepo.markAllNotificationsAsRead(');
        c = c.replace(/storage\.markNotificationAsRead\(/g, 'notificationRepo.markNotificationAsRead(');
        c = c.replace(/storage\.createNotification\(/g, 'notificationRepo.createNotification(');
        c = c.replace(/storage\.getAllUsers\(/g, 'userRepo.getAllUsers(');

        // System
        c = c.replace(/storage\.getAuditLogs\(/g, 'systemRepo.getAuditLogs(');
        c = c.replace(/storage\.createAuditLog\(/g, 'systemRepo.createAuditLog(');
        c = c.replace(/storage\.getPendingRollbackRequests\(/g, 'systemRepo.getPendingRollbackRequests(');
        c = c.replace(/storage\.updateRollbackRequest\(/g, 'systemRepo.updateRollbackRequest(');

        c = c.replace(/storage\.getUser\(/g, 'userRepo.getUser(');

        // Quotes (uses jobRepo mostly)
        c = c.replace(/storage\.getQuoteRequests\(/g, 'serviceRequestRepo.getQuoteRequests(');
        c = c.replace(/storage\.getServiceRequest\(/g, 'serviceRequestRepo.getServiceRequest(');
        c = c.replace(/storage\.updateServiceRequest\(/g, 'serviceRequestRepo.updateServiceRequest(');
        c = c.replace(/storage\.createServiceRequestEvent\(/g, 'serviceRequestRepo.createServiceRequestEvent(');
        c = c.replace(/storage\.updateQuote\(/g, 'serviceRequestRepo.updateQuote(');
        c = c.replace(/storage\.acceptQuote\(/g, 'serviceRequestRepo.acceptQuote(');
        c = c.replace(/storage\.declineQuote\(/g, 'serviceRequestRepo.declineQuote(');
        c = c.replace(/storage\.getJobTicket\(/g, 'jobRepo.getJobTicket(');

        // Warranty & Refunds
        c = c.replace(/storage\.getAllWarrantyClaims\(/g, 'warrantyRepo.getAllWarrantyClaims(');
        c = c.replace(/storage\.getWarrantyClaim\(/g, 'warrantyRepo.getWarrantyClaim(');
        c = c.replace(/storage\.createWarrantyClaim\(/g, 'warrantyRepo.createWarrantyClaim(');
        c = c.replace(/storage\.updateWarrantyClaimStatus\(/g, 'warrantyRepo.updateWarrantyClaimStatus(');
        c = c.replace(/storage\.deleteWarrantyClaim\(/g, 'warrantyRepo.deleteWarrantyClaim(');

        c = c.replace(/storage\.getAllRefunds\(/g, 'warrantyRepo.getAllRefunds(');
        c = c.replace(/storage\.getRefund\(/g, 'warrantyRepo.getRefund(');
        c = c.replace(/storage\.createRefund\(/g, 'warrantyRepo.createRefund(');
        c = c.replace(/storage\.updateRefundStatus\(/g, 'warrantyRepo.updateRefundStatus(');
        c = c.replace(/storage\.deleteRefund\(/g, 'warrantyRepo.deleteRefund(');

        // HR (Leave, Payroll)
        c = c.replace(/storage\.getAllLeaveApplications\(/g, 'hrRepo.getAllLeaveApplications(');
        c = c.replace(/storage\.getLeaveApplication\(/g, 'hrRepo.getLeaveApplication(');
        c = c.replace(/storage\.getLeaveApplicationsByUser\(/g, 'hrRepo.getLeaveApplicationsByUser(');
        c = c.replace(/storage\.createLeaveApplication\(/g, 'hrRepo.createLeaveApplication(');
        c = c.replace(/storage\.updateLeaveStatus\(/g, 'hrRepo.updateLeaveStatus(');

        c = c.replace(/storage\.getAllPayrollRecords\(/g, 'hrRepo.getAllPayrollRecords(');
        c = c.replace(/storage\.getPayrollByMonth\(/g, 'hrRepo.getPayrollByMonth(');
        c = c.replace(/storage\.getPayrollByUser\(/g, 'hrRepo.getPayrollByUser(');
        c = c.replace(/storage\.createPayrollRecord\(/g, 'hrRepo.createPayrollRecord(');
        c = c.replace(/storage\.updatePayrollRecord\(/g, 'hrRepo.updatePayrollRecord(');
        c = c.replace(/storage\.getAllSalaryConfigs\(/g, 'hrRepo.getAllSalaryConfigs(');
        c = c.replace(/storage\.getSalaryConfig\(/g, 'hrRepo.getSalaryConfig(');

        const indexImportRegex = /import\s*\{\s*[^}]*\s*\}\s*from\s*'(\.\.\/repositories\/index\.js|\.\.\/repositories\/index)'\s*;/;
        const requiredRepos = ['settingsRepo', 'notificationRepo', 'systemRepo', 'userRepo', 'jobRepo', 'serviceRequestRepo', 'warrantyRepo', 'hrRepo'];

        if (indexImportRegex.test(c)) {
            let match = c.match(indexImportRegex)[0];
            let inner = match.substring(match.indexOf('{') + 1, match.indexOf('}')).split(',').map(s => s.trim());
            requiredRepos.forEach(r => { if (!inner.includes(r)) inner.push(r); });
            c = c.replace(indexImportRegex, 'import { ' + inner.join(', ') + ' } from \'../repositories/index.js\';');
        } else if (c.includes('storage')) {
            c = c.replace(/import \{ storage \} from '\.\.\/storage\.js';/, 'import { storage } from \'../storage.js\';\nimport { ' + requiredRepos.join(', ') + ' } from \'../repositories/index.js\';');
        }

        fs.writeFileSync(route, c, 'utf8');
    }
    console.log('System/Other routes wired successfully!');
}
main();
