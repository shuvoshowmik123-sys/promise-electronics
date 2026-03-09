import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'server', 'routes', 'payroll.routes.ts');
let content = fs.readFileSync(file, 'utf8');

// Ensure salaryStructureRepo and offboardingRepo are imported
if (!content.includes('salaryStructureRepo')) {
    content = content.replace(
        `import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo, employmentRepo } from '../repositories/index.js';`,
        `import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo, employmentRepo, salaryStructureRepo, offboardingRepo } from '../repositories/index.js';`
    );
}

const setupRoutes = `
// ============================================
// V2 HR Setup: Salary Components & Structures
// ============================================

router.get('/api/admin/hr/salary-components', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.getAllComponents();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary components' });
    }
});

router.post('/api/admin/hr/salary-components', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.createComponent({ ...req.body, id: \`comp_\${Date.now()}\` });
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create salary component' });
    }
});

router.get('/api/admin/hr/salary-structures', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.getAllStructures();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary structures' });
    }
});

router.post('/api/admin/hr/salary-structures', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        
        const { code, name, lines } = req.body;
        const structId = \`struct_\${Date.now()}\`;
        const mappedLines = lines.map((l: any, idx: number) => ({
            id: \`sl_\${Date.now()}_\${idx}\`,
            componentId: l.componentId,
            sequence: l.sequence ?? idx + 1,
            isMandatory: l.isMandatory ?? true
        }));

        const data = await salaryStructureRepo.createStructure({ id: structId, code, name }, mappedLines);
        res.status(201).json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create salary structure' });
    }
});

// ============================================
// V2 HR Setup: Salary Assignments & Profiles
// ============================================

router.get('/api/admin/hr/salary-assignments/:userId', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        
        const profile = await employmentRepo.getProfileByUserId(req.params.userId);
        const assignment = await employmentRepo.getActiveAssignment(req.params.userId);
        res.json({ profile, assignment });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary assignment' });
    }
});

router.post('/api/admin/hr/salary-assignments', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        
        const { userId, structureId, baseAmount, hraAmount, medicalAmount, conveyanceAmount, otherAmount, incomeTaxPercent, effectiveFrom, changeReason } = req.body;
        
        let profile = await employmentRepo.getProfileByUserId(userId);
        if (!profile) {
             const targetUser = await userRepo.getUser(userId);
             profile = await employmentRepo.updateProfile(userId, { 
                id: \`emp_\${userId}\`,
                userId, 
                employeeCode: \`PE-\${Date.now()}\`,
                employmentStatus: 'active',
                joinDate: targetUser?.joinedAt ? targetUser.joinedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
             }) as any;
        }

        const assignId = \`assign_\${Date.now()}_\${userId}\`;
        const data = await employmentRepo.createSalaryAssignment({
            id: assignId,
            userId,
            employmentProfileId: profile!.id,
            structureId,
            baseAmount,
            hraAmount,
            medicalAmount,
            conveyanceAmount,
            otherAmount,
            incomeTaxPercent,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            changeReason: changeReason || 'new_hire',
            approvedBy: user.id,
            approvedAt: new Date(),
            createdBy: user.id
        });

        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create salary assignment' });
    }
});

// ============================================
// V2 HR Offboarding
// ============================================

router.get('/api/admin/hr/offboarding', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await offboardingRepo.getAllCases();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch offboarding cases' });
    }
});

router.post('/api/admin/hr/offboarding', requireAdminAuth, async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        
        const { userId, offboardingType, noticeServedDays, lastWorkingDate, settlementDueDate } = req.body;
        const profile = await employmentRepo.getProfileByUserId(userId);
        if (!profile) return res.status(400).json({ error: 'Employment profile not found' });

        const data = await offboardingRepo.createCase({
             id: \`case_\${Date.now()}\`,
             userId,
             employmentProfileId: profile.id,
             offboardingType,
             noticeServedDays: noticeServedDays || 0,
             lastWorkingDate,
             settlementDueDate
        });
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to initiate offboarding' });
    }
});
`;

if (!content.includes('/api/admin/hr/salary-components')) {
    // Insert before "export default router;"
    content = content.replace(/export default router;/g, setupRoutes + '\n\nexport default router;');
    fs.writeFileSync(file, content, 'utf8');
    console.log('Successfully appended HR Setup routes.');
} else {
    console.log('Routes already exist.');
}
