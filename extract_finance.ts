import * as fs from 'fs';

function main() {
    const posRepoPath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/repositories/pos.repository.ts';

    // 1. UPDATE POS REPO
    let posRepoContent = fs.readFileSync(posRepoPath, 'utf8');
    if (!posRepoContent.includes('import { and }')) {
        posRepoContent = posRepoContent.replace('like, count, schema', 'like, count, and, isNull, isNotNull, schema');
    }
    if (!posRepoContent.includes('type DrawerSession')) {
        posRepoContent = posRepoContent.replace('type InsertPosTransaction } from', 'type InsertPosTransaction, type DrawerSession, type InsertDrawerSession } from');
    }

    if (!posRepoContent.includes('getActiveDrawerSession')) {
        posRepoContent += `
// ============================================
// Drawer Sessions
// ============================================

export async function createDrawerSession(session: InsertDrawerSession): Promise<DrawerSession> {
    const [newSession] = await db.insert(schema.drawerSessions)
      .values({ ...session, id: nanoid() })
      .returning();
    return newSession;
}
export async function updateDrawerSession(id: string, updates: Partial<InsertDrawerSession>): Promise<DrawerSession | undefined> {
    const [updated] = await db.update(schema.drawerSessions)
      .set(updates)
      .where(eq(schema.drawerSessions.id, id))
      .returning();
    return updated;
}
export async function getActiveDrawerSession(userId: string): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
      .where(and(eq(schema.drawerSessions.userId, userId), isNull(schema.drawerSessions.closedAt)));
    return session;
}
export async function getClosedDrawerSessions(date: Date): Promise<DrawerSession[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
      
    const sessions = await db.select().from(schema.drawerSessions)
        .where(isNotNull(schema.drawerSessions.closedAt))
        .orderBy(desc(schema.drawerSessions.closedAt));

    return sessions.filter(s => {
        if (!s.closedAt) return false;
        const closed = new Date(s.closedAt);
        return closed >= startOfDay && closed <= endOfDay;
    });
}
`;
        fs.writeFileSync(posRepoPath, posRepoContent, 'utf8');
    }

    // 2. Wire the 4 routes
    const routes = [
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/finance.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/pos.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/challans.routes.ts',
        'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/drawer.routes.ts'
    ];

    for (const route of routes) {
        if (!fs.existsSync(route)) continue;
        let c = fs.readFileSync(route, 'utf8');

        // generic storage replacements
        c = c.replace(/storage\.getAllPettyCashRecords\(/g, 'financeRepo.getAllPettyCashRecords(');
        c = c.replace(/storage\.createPettyCashRecord\(/g, 'financeRepo.createPettyCashRecord(');
        c = c.replace(/storage\.deletePettyCashRecord\(/g, 'financeRepo.deletePettyCashRecord(');

        c = c.replace(/storage\.getAllDueRecords\(/g, 'financeRepo.getAllDueRecords(');
        c = c.replace(/storage\.getDueRecord\(/g, 'financeRepo.getDueRecord(');
        c = c.replace(/storage\.createDueRecord\(/g, 'financeRepo.createDueRecord(');
        c = c.replace(/storage\.updateDueRecord\(/g, 'financeRepo.updateDueRecord(');
        c = c.replace(/storage\.deleteDueRecord\(/g, 'financeRepo.deleteDueRecord(');

        c = c.replace(/storage\.getAllChallans\(/g, 'financeRepo.getAllChallans(');
        c = c.replace(/storage\.getChallan\(/g, 'financeRepo.getChallan(');
        c = c.replace(/storage\.createChallan\(/g, 'financeRepo.createChallan(');
        c = c.replace(/storage\.updateChallan\(/g, 'financeRepo.updateChallan(');
        c = c.replace(/storage\.deleteChallan\(/g, 'financeRepo.deleteChallan(');

        c = c.replace(/storage\.getAllPosTransactions\(/g, 'posRepo.getAllPosTransactions(');
        c = c.replace(/storage\.getPosTransaction\(/g, 'posRepo.getPosTransaction(');
        c = c.replace(/storage\.getPosTransactionByInvoice\(/g, 'posRepo.getPosTransactionByInvoice(');
        c = c.replace(/storage\.createPosTransaction\(/g, 'posRepo.createPosTransaction(');
        c = c.replace(/storage\.updatePosTransactionStatus\(/g, 'posRepo.updatePosTransactionStatus(');
        c = c.replace(/storage\.getPosTransactionsByDateRange\(/g, 'posRepo.getPosTransactionsByDateRange(');

        c = c.replace(/storage\.createDrawerSession\(/g, 'posRepo.createDrawerSession(');
        c = c.replace(/storage\.updateDrawerSession\(/g, 'posRepo.updateDrawerSession(');
        c = c.replace(/storage\.getActiveDrawerSession\(/g, 'posRepo.getActiveDrawerSession(');
        c = c.replace(/storage\.getClosedDrawerSessions\(/g, 'posRepo.getClosedDrawerSessions(');
        c = c.replace(/storage\.getUser\(/g, 'userRepo.getUser(');

        const indexImportRegex = /import\s*\{\s*[^}]*\s*\}\s*from\s*'(\.\.\/repositories\/index\.js|\.\.\/repositories\/index)'\s*;/;
        const requiredRepos = ['financeRepo', 'posRepo', 'userRepo'];

        if (indexImportRegex.test(c)) {
            let match = c.match(indexImportRegex)[0];
            let inner = match.substring(match.indexOf('{') + 1, match.indexOf('}')).split(',').map(s => s.trim());
            requiredRepos.forEach(r => { if (!inner.includes(r)) inner.push(r); });
            c = c.replace(indexImportRegex, 'import { ' + inner.join(', ') + ' } from \'../repositories/index.js\';');
        } else if (c.includes('storage')) {
            c = c.replace(/import \{ storage \} from '\.\.\/storage\.js';/, 'import { storage } from \'../storage.js\';\nimport { financeRepo, posRepo, userRepo } from \'../repositories/index.js\';');
        }

        fs.writeFileSync(route, c, 'utf8');
    }
    console.log('Finance/POS/Challans/Drawer routes wired successfully!');
}
main();
