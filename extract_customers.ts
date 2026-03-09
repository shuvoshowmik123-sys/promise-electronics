import * as fs from 'fs';

function main() {
    // Routes to wire
    const routes = [
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/customer.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/reviews.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/orders.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/corporate-auth.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/corporate-notifications.routes.ts'
    ];

    for (const route of routes) {
        if (!fs.existsSync(route)) continue;
        let c = fs.readFileSync(route, 'utf8');

        // generic storage replacements for users
        c = c.replace(/storage\.getUser\(/g, 'userRepo.getUser(');
        c = c.replace(/storage\.getByEmail\(/g, 'userRepo.getUserByEmail(');
        c = c.replace(/storage\.getUserByEmail\(/g, 'userRepo.getUserByEmail(');
        c = c.replace(/storage\.getUserByUsername\(/g, 'userRepo.getUserByUsername(');
        c = c.replace(/storage\.getUserByPhone\(/g, 'userRepo.getUserByPhone(');
        c = c.replace(/storage\.getUserByPhoneNormalized\(/g, 'userRepo.getUserByPhoneNormalized(');
        c = c.replace(/storage\.createUser\(/g, 'userRepo.createUser(');
        c = c.replace(/storage\.getAllUsers\(/g, 'userRepo.getAllUsers(');
        c = c.replace(/storage\.updateUser\(/g, 'userRepo.updateUser(');
        c = c.replace(/storage\.deleteUser\(/g, 'userRepo.deleteUser(');
        c = c.replace(/storage\.updateUserLastLogin\(/g, 'userRepo.updateUserLastLogin(');

        // Addresses
        c = c.replace(/storage\.getCustomerAddresses\(/g, 'userRepo.getCustomerAddresses(');
        c = c.replace(/storage\.createCustomerAddress\(/g, 'userRepo.createCustomerAddress(');
        c = c.replace(/storage\.updateCustomerAddress\(/g, 'userRepo.updateCustomerAddress(');
        c = c.replace(/storage\.deleteCustomerAddress\(/g, 'userRepo.deleteCustomerAddress(');

        // Reviews
        c = c.replace(/storage\.getAllCustomerReviews\(/g, 'customerRepo.getAllCustomerReviews(');
        c = c.replace(/storage\.getCustomerReviews\(/g, 'customerRepo.getCustomerReviews(');
        c = c.replace(/storage\.createCustomerReview\(/g, 'customerRepo.createCustomerReview(');
        c = c.replace(/storage\.updateCustomerReview\(/g, 'customerRepo.updateCustomerReview(');
        c = c.replace(/storage\.deleteCustomerReview\(/g, 'customerRepo.deleteCustomerReview(');

        // Orders
        c = c.replace(/storage\.getAllOrders\(/g, 'orderRepo.getAllOrders(');
        c = c.replace(/storage\.getOrder\(/g, 'orderRepo.getOrder(');
        c = c.replace(/storage\.getOrdersByCustomerId\(/g, 'orderRepo.getOrdersByCustomerId(');
        c = c.replace(/storage\.createOrder\(/g, 'orderRepo.createOrder(');
        c = c.replace(/storage\.updateOrderStatus\(/g, 'orderRepo.updateOrderStatus(');
        c = c.replace(/storage\.deleteOrder\(/g, 'orderRepo.deleteOrder(');
        c = c.replace(/storage\.getOrderItems\(/g, 'orderRepo.getOrderItems(');

        // Corporate auth
        c = c.replace(/storage\.getCorporateClient\(/g, 'corporateRepo.getCorporateClient(');
        c = c.replace(/storage\.getAllCorporateClients\(/g, 'corporateRepo.getAllCorporateClients(');
        c = c.replace(/storage\.createCorporateClient\(/g, 'corporateRepo.createCorporateClient(');
        c = c.replace(/storage\.updateCorporateClient\(/g, 'corporateRepo.updateCorporateClient(');
        c = c.replace(/storage\.deleteCorporateClient\(/g, 'corporateRepo.deleteCorporateClient(');

        // Corporate notifications
        c = c.replace(/storage\.createNotification\(/g, 'notificationRepo.createNotification(');
        c = c.replace(/storage\.getNotifications\(/g, 'notificationRepo.getNotifications(');
        c = c.replace(/storage\.markAllNotificationsAsRead\(/g, 'notificationRepo.markAllNotificationsAsRead(');

        const indexImportRegex = /import\s*\{\s*[^}]*\s*\}\s*from\s*'(\.\.\/repositories\/index\.js|\.\.\/repositories\/index)'\s*;/;
        const requiredRepos = ['userRepo', 'customerRepo', 'orderRepo', 'corporateRepo', 'notificationRepo'];

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
    console.log('Customer/Corporate routes wired successfully!');
}
main();
