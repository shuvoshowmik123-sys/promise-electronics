import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'server', 'routes', 'payroll.routes.ts');
let content = fs.readFileSync(file, 'utf8');

// 1. Remove manual saving loop in generate
content = content.replace(
    /\/\/ Generate payroll\s+const records = await payrollService\.generateMonthlySalary\(month, user\.id, activeHolidays\);\s+\/\/ Save all records\s+const saved = \[\];\s+for \(const record of records\) \{\s+const payroll = await hrRepo\.createPayrollRecord\(record\);\s+saved\.push\(payroll\);\s+\}/,
    `// Generate payroll (V2 engine handles saving to DB directly)\n        const saved = await payrollService.generateMonthlySalary(month, user.id, activeHolidays);`
);

// 2. Add New Imports at the top if needed
if (!content.includes('employmentRepo')) {
    content = content.replace(
        `import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';`,
        `import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo, employmentRepo } from '../repositories/index.js';`
    );
}

// 3. Append the new Advisory APIs
const advisoryRoutes = `
// ============================================
// V2 Advisory: Increment Suggestions (Super Admin ONLY)
// ============================================

router.get('/api/admin/hr/increment-suggestions', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getPendingIncrementSuggestions();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch increment suggestions' });
    }
});

router.post('/api/admin/hr/increment-suggestions/generate', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await payrollService.generateIncrementSuggestions();
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to generate increment suggestions' });
    }
});

router.patch('/api/admin/hr/increment-suggestions/:id', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const { status, adminDecisionAmount, adminNotes, effectiveFrom } = req.body;
        const result = await employmentRepo.processIncrementSuggestion(
            req.params.id, status, user.id, adminNotes, adminDecisionAmount, effectiveFrom ? new Date(effectiveFrom) : undefined
        );
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Failed to process increment suggestion' });
    }
});

// ============================================
// V2 Advisory: Deduction Proposals (Super Admin ONLY)
// ============================================

router.get('/api/admin/payroll/deduction-proposals', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getPendingDeductionProposals(req.query.month as string);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch deduction proposals' });
    }
});

router.get('/api/admin/payroll/deduction-proposals/:payrollId', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getDeductionProposalsForPayroll(req.params.payrollId);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch proposals for payroll' });
    }
});

router.patch('/api/admin/payroll/deduction-proposals/:id', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const { status, approvedAmount, adminNotes } = req.body;
        const result = await employmentRepo.decideDeductionProposal(req.params.id, status, user.id, adminNotes, approvedAmount);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Failed to process deduction proposal' });
    }
});

router.post('/api/admin/payroll/deduction-proposals/:payrollId/apply', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const result = await payrollService.applyApprovedDeductions(req.params.payrollId, user.id);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to apply approved deductions' });
    }
});
`;

if (!content.includes('/api/admin/hr/increment-suggestions')) {
    content += advisoryRoutes;
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated payroll.routes.ts');
