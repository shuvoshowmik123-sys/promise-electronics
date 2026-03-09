import re
import sys

filepath = 'd:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/payroll.routes.ts'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Update imports
if 'requirePermission' not in content:
    content = content.replace(
        "import { requireAdminAuth } from './middleware/auth.js';",
        "import { requireAdminAuth, requirePermission } from './middleware/auth.js';"
    )

# 2. Add `requirePermission('salary')` to all route definitions that use `requireAdminAuth`
# Search for `router.<method>('<path>', requireAdminAuth, async (req, res) => {`
# Or `router.<method>('<path>', requireAdminAuth, async (req: Request, res: Response) => {`
# Capture group 1: `router.<method>('<path>', requireAdminAuth`
# Capture group 2: `, async (req...`
content = re.sub(
    r"(router\.(?:get|post|patch|put|delete)\('[^']+', requireAdminAuth)(, async \(req)",
    r"\1, requirePermission('salary')\2",
    content
)

# Wait, `router.get('/api/admin/hr/salary-components', requireAdminAuth, async (req, res) => {`
content = re.sub(
    r"(router\.(?:get|post|patch|put|delete)\('[^']+', requireAdminAuth)(, async \(req)",
    r"\1, requirePermission('salary')\2",
    content
)

# 3. Remove legacy view role checks for Manager/Admin
view_role_check = r"""\s*const user = await userRepo\.getUser\(req\.session\.adminUserId!\);\n\s*if \(!user \|\| \(user\.role !== 'Super Admin' && user\.role !== 'Manager'\)\) \{\n\s*return res\.status\(403\)\.json\(\{ error: '(?:Access denied|Manager or Super Admin access required)' \}\);\n\s*\}"""
content = re.sub(view_role_check, r"", content)

with open(filepath, 'w') as f:
    f.write(content)

print('Updated successfully')
