
import { db } from "../server/db";
import { jobTickets, insertJobTicketSchema, corporateClients } from "../shared/schema";
import { storage } from "../server/storage";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function testWarrantyWorkflow() {
    console.log("Starting Warranty Workflow Test...");

    // 1. Setup: Create a Corporate Client
    console.log("1. Creating Test Client...");
    const client = await storage.createCorporateClient({
        companyName: "Test Corp " + nanoid(4),
        shortCode: "TST" + nanoid(2),
        contactPerson: "Tester",
        contactPhone: "123",
        billingCycle: "monthly",
        paymentTerms: 30,
        pricingType: "standard"
    });
    console.log(`   Client created: ${client.id}`);

    // 2. Setup: Create a Job
    console.log("2. Creating Original Job...");
    const job = await storage.createJobTicket({
        customer: client.companyName,
        customerPhone: "123",
        device: "Test Device",
        issue: "Broken Screen",
        status: "Delivered", // Must be finished
        corporateClientId: client.id,
        corporateJobNumber: "JOB-TEST-" + nanoid(4),
        warrantyExpiryDate: new Date(Date.now() + 86400000), // Expires tomorrow
        createdAt: new Date(Date.now() - 1000000),
    } as any);
    console.log(`   Job created: ${job.id}`);

    // 3. Create Warranty Claim
    console.log("3. Creating Warranty Claim...");
    const claim = await storage.createWarrantyClaim({
        originalJobId: job.id,
        claimType: "general",
        claimReason: "Screen flickering",
        customer: client.companyName,
        customerPhone: "123",
        status: "pending",
        warrantyValid: true,
        claimedBy: "system-test",
        claimedByName: "System Test",
        claimedByRole: "System",
        claimedAt: new Date()
    });
    console.log(`   Claim created: ${claim.id}`);

    // 4. Approve Claim
    console.log("4. Approving Claim...");
    const approvedClaim = await storage.updateWarrantyClaim(claim.id, {
        status: 'approved',
        approvedBy: 'admin-test',
        approvedByName: 'Admin Test',
        approvedByRole: 'Super Admin',
        approvedAt: new Date()
    });
    console.log(`   Claim approved: ${approvedClaim.status}`);

    // 5. Create Warranty Job (Simulating API call or logic)
    // NOTE: In the route, there is a specific /create-job endpoint. 
    // We will simulate what that endpoint does by calling storage directly or constructing the job.
    // The route `POST /api/warranty-claims/:id/create-job` essentially does:
    console.log("5. Creating Linked Warranty Job...");

    // Copy details from original
    const originalInfo = await storage.getJobTicket(job.id);
    if (!originalInfo) throw new Error("Original job lost?");

    const newJob = await storage.createJobTicket({
        ...originalInfo,
        id: undefined,
        parentJobId: job.id,
        jobType: "warranty_claim",
        status: "Pending",
        corporateJobNumber: "WAR-" + nanoid(4), // Simulate new number
        problemStatement: `WARRANTY: ${claim.claimReason}`,
        createdAt: undefined
    } as any);

    // Update claim
    await storage.updateWarrantyClaim(claim.id, {
        newJobId: newJob.id,
        status: 'in_repair'
    });

    console.log(`   Warranty Job Created: ${newJob.id}`);
    console.log(`   Job Type: ${newJob.jobType}`);
    console.log(`   Parent Job: ${newJob.parentJobId}`);

    // 6. Verification
    if (newJob.parentJobId !== job.id) throw new Error("Parent linkage failed");
    if (newJob.jobType !== 'warranty_claim') throw new Error("Job type mismatch");

    console.log("SUCCESS: Warranty Workflow Verified!");
    process.exit(0);
}

testWarrantyWorkflow().catch(e => {
    console.error(e);
    process.exit(1);
});
