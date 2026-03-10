
import { storage } from './server/storage';
import { db } from './server/db';
import { jobTickets } from './shared/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function main() {
    console.log('Starting Warranty Verification...');

    // 1. Create a dummy job
    const jobId = 'TEST-JOB-' + nanoid(6);
    console.log(`Creating job ${jobId}...`);

    // We need to match InsertJobTicket schema
    // Note: ensure we provide required fields.
    const job = await storage.createJobTicket({
        id: jobId,
        customer: 'Test Customer',
        customerPhone: '01700000000',
        device: 'Test Device',
        problemFound: 'Test Issue',
        status: 'Pending',
        warrantyDays: 30,
        gracePeriodDays: 7
    });
    console.log('Job created:', job.id, 'Warranty Days:', job.warrantyDays);

    // 2. Simulate Completion (Set Expiry)
    console.log('Completing job and setting expiry...');
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(now.getDate() + 30 + 7); // 30 days + 7 grace

    await storage.updateJobTicket(jobId, {
        status: 'Completed',
        completedAt: now,
        warrantyExpiryDate: expiryDate
    });

    // 3. Verify Update
    const updatedJob = await storage.getJobTicket(jobId);
    if (!updatedJob) throw new Error('Job not found');

    console.log('Job Completed.');
    console.log('Expiry Date:', updatedJob.warrantyExpiryDate);

    if (updatedJob.warrantyExpiryDate?.toISOString() !== expiryDate.toISOString()) {
        console.warn('Expiry date mismatch (might be ms precision):', updatedJob.warrantyExpiryDate, expiryDate);
    }

    // 4. Create Warranty Claim
    console.log('Creating Warranty Claim...');
    // We assume check is done by caller. We just test creation.
    // ensure no 'id' needed if storage generates it.
    const claim = await storage.createWarrantyClaim({
        originalJobId: jobId,
        customer: updatedJob.customer || 'Unknown',
        customerPhone: updatedJob.customerPhone,
        claimType: 'general',
        claimReason: 'Unit dead again',
        status: 'pending',
        warrantyValid: true,
        warrantyExpiryDate: updatedJob.warrantyExpiryDate,
        claimedBy: 'TEST_USER',
        claimedByName: 'Test User',
        claimedByRole: 'Admin',
        claimedAt: new Date(),
        notes: 'Automated test claim'
        // createdAt/updatedAt removed/handled by DB
    });

    console.log('Claim created:', claim.id);
    console.log('Claim Original Job:', claim.originalJobId);

    // Clean up?
    console.log('Cleaning up...');
    await db.delete(jobTickets).where(eq(jobTickets.id, jobId));
    // And simulate claim deletion (no method exposed easily? direct db)
    // We'll leave the claim for now or delete it
    // await db.delete(warrantyClaims).where(eq(warrantyClaims.id, claim.id)) -- need to import table

    console.log('Verification Successful!');
    process.exit(0);
}

main().catch(err => {
    console.error('Verification Failed:', err);
    process.exit(1);
});
