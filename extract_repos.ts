import * as fs from 'fs';
import * as path from 'path';

function main() {
    const storagePath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/storage.ts';
    const jobRepoPath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/repositories/job.repository.ts';
    const srRepoPath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/repositories/service-request.repository.ts';
    const inventoryRepoPath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/repositories/inventory.repository.ts';

    // 1. UPDATE JOB REPO
    let jobRepoContent = fs.readFileSync(jobRepoPath, 'utf8');
    if (!jobRepoContent.includes('import { or }')) {
        jobRepoContent = jobRepoContent.replace('like, schema', 'like, or, schema');
    }

    if (!jobRepoContent.includes('getJobTicketsList')) {
        jobRepoContent += `
export async function getJobTicketsList(page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;
    const items = await db.select().from(schema.jobTickets)
        .orderBy(desc(schema.jobTickets.createdAt))
        .limit(limit).offset(offset);
    
    return { items, pagination: { total: items.length, page, limit, pages: 1 } };
}

export async function searchJobTickets(query: string): Promise<JobTicket[]> {
    const searchPattern = \`%\${query}%\`;
    return db.select()
        .from(schema.jobTickets)
        .where(
            or(
                like(schema.jobTickets.id, searchPattern),
                like(schema.jobTickets.customer, searchPattern),
                like(schema.jobTickets.device, searchPattern)
            )
        )
        .orderBy(desc(schema.jobTickets.createdAt))
        .limit(20);
}
`;
        fs.writeFileSync(jobRepoPath, jobRepoContent, 'utf8');
        console.log('Job repo updated');
    }

    // 2. UPDATE SR REPO
    let srRepoContent = fs.readFileSync(srRepoPath, 'utf8');
    if (!srRepoContent.includes('import { and }')) {
        srRepoContent = srRepoContent.replace('like, isNull', 'like, isNull, and');
    }

    srRepoContent = srRepoContent.replace(
        'export async function getAllServiceRequests(): Promise<ServiceRequest[]> {\\n    return db.select().from(schema.serviceRequests).orderBy(desc(schema.serviceRequests.createdAt));\\n}',
        `export async function getAllServiceRequests(filter?: { status?: string, servicePreference?: string }, page: number = 1, limit: number = 50) {
    let query = db.select().from(schema.serviceRequests).$dynamic();
    
    if (filter?.status && filter?.servicePreference) {
        query = query.where(and(eq(schema.serviceRequests.status, filter.status), eq(schema.serviceRequests.servicePreference, filter.servicePreference)));
    } else if (filter?.status) {
        query = query.where(eq(schema.serviceRequests.status, filter.status));
    } else if (filter?.servicePreference) {
        query = query.where(eq(schema.serviceRequests.servicePreference, filter.servicePreference));
    }
    
    const offset = (page - 1) * limit;
    const items = await query.orderBy(desc(schema.serviceRequests.createdAt)).limit(limit).offset(offset);
    
    return { items, pagination: { total: items.length, page, limit, pages: 1 } };
}`
    );

    if (!srRepoContent.includes('getServiceRequestByConvertedJobId')) {
        srRepoContent += `
export async function getServiceRequestByConvertedJobId(jobId: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.convertedJobId, jobId));
    return request;
}

export async function getNextValidStages(id: string): Promise<string[]> {
    const request = await getServiceRequest(id);
    if (!request) return [];

    const stageFlow = schema.getStageFlow(request.requestIntent, request.serviceMode);
    const currentStageIndex = stageFlow.indexOf(request.stage || "intake");

    if (currentStageIndex === -1 || currentStageIndex >= stageFlow.length - 1) return [];

    return stageFlow.slice(currentStageIndex + 1);
}
`;
        fs.writeFileSync(srRepoPath, srRepoContent, 'utf8');
        console.log('SR repo updated');
    }

    // 3. UPDATE INVENTORY REPO (Purchase Orders & Serials from Storage)
    let invRepoContent = fs.readFileSync(inventoryRepoPath, 'utf8');
    if (!invRepoContent.includes('getPurchaseOrders')) {
        // Need to add related types
        invRepoContent = invRepoContent.replace(
            'type InsertProduct',
            'type InsertProduct, type PurchaseOrder, type InsertPurchaseOrder, type PurchaseOrderItem, type InsertPurchaseOrderItem'
        );
        invRepoContent += `
export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return db.select().from(schema.purchaseOrders).orderBy(desc(schema.purchaseOrders.createdAt));
}
export async function getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
    return getPurchaseOrders();
}
export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, id));
    return po;
}
export async function createPurchaseOrder(po: InsertPurchaseOrder, items: InsertPurchaseOrderItem[]): Promise<PurchaseOrder> {
    const [newPo] = await db.insert(schema.purchaseOrders).values({ ...po, id: nanoid() }).returning();
    for (const item of items) {
        await db.insert(schema.purchaseOrderItems).values({ ...item, id: nanoid(), purchaseOrderId: newPo.id });
    }
    return newPo;
}
export async function updatePurchaseOrder(id: string, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    const [updated] = await db.update(schema.purchaseOrders).set(updates).where(eq(schema.purchaseOrders.id, id)).returning();
    return updated;
}
`;
        fs.writeFileSync(inventoryRepoPath, invRepoContent, 'utf8');
        console.log('Inventory repo updated');
    }

    console.log('Extraction script finished');
}

main();
