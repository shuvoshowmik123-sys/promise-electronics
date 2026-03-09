import 'dotenv/config';
import { db } from '../server/db';
import { settings } from '../shared/schema';
import { eq, or } from 'drizzle-orm';

async function main() {
    console.log('🔄 Starting CMS Hero Images repair script...');

    try {
        // Fetch the affected settings
        const affectedSettings = await db
            .select()
            .from(settings)
            .where(
                or(
                    eq(settings.key, 'hero_images'),
                    eq(settings.key, 'mobile_hero_images')
                )
            );

        let updateCount = 0;

        for (const setting of affectedSettings) {
            // Check if the value is explicitly the empty JSON array string '[]'
            // or an empty array string containing spaces like '[ ]'
            if (setting.value === '[]' || setting.value === '[ ]' || setting.value === '["","",""]') {
                console.log(`ℹ️ Skipping ${setting.key}, already repaired or default.`);
                continue;
            }

            try {
                const parsed = JSON.parse(setting.value);
                if (Array.isArray(parsed) && parsed.length === 0) {
                    console.log(`🛠️ Repairing ${setting.key} (current value: ${setting.value})`);

                    await db
                        .update(settings)
                        .set({ value: JSON.stringify(["", "", ""]) })
                        .where(eq(settings.id, setting.id));

                    updateCount++;
                } else if (Array.isArray(parsed) && parsed.length > 0) {
                    const trimmed = parsed.filter((u: string) => u && u.trim() !== "");
                    if (trimmed.length === 0) {
                        console.log(`🛠️ Repairing ${setting.key} (current value: ${setting.value})`);

                        await db
                            .update(settings)
                            .set({ value: JSON.stringify(["", "", ""]) })
                            .where(eq(settings.id, setting.id));

                        updateCount++;
                    }
                }
            } catch (e: any) {
                console.warn(`⚠️ Failed to parse setting ${setting.key}: ${e.message}`);
            }
        }

        console.log(`\n✅ Repair complete! Repaired ${updateCount} settings.`);
    } catch (err: any) {
        console.error('❌ Error during repair:', err.message);
    } finally {
        process.exit(0);
    }
}

main();
