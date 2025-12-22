import 'dotenv/config';
import { db } from '../server/db.js';
import * as schema from '../shared/schema.js';

async function testNotifications() {
    console.log('Connecting to database...');
    try {
        console.log('Testing notifications table...');

        // Try to select from notifications
        const notifications = await db.select().from(schema.notifications).limit(5);
        console.log('SUCCESS! Notifications found:', notifications.length);
        console.log(JSON.stringify(notifications, null, 2));

    } catch (error: any) {
        console.error('ERROR:', error.message);
        if (error.message.includes('does not exist')) {
            console.log('The notifications table does not exist in the database!');
            console.log('Run: npx drizzle-kit push');
        }
    } finally {
        process.exit(0);
    }
}

testNotifications();
