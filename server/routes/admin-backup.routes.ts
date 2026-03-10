import { Router } from 'express';
import { backupService } from '../services/backup.service.js';
import { requireSuperAdmin } from './middleware/auth.js';
import { restorationService } from '../services/restoration.service.js';
import { storageService } from '../services/storage.service.js';
import multer from 'multer';

// Configure Multer (Memory Storage)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const router = Router();

router.post('/backups', requireSuperAdmin, async (req, res) => {
    try {
        const { password, description } = req.body;

        // Validate password
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }

        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const backup = await backupService.createBackup(
            password,
            req.user.id,
            (req.user as any).name || 'Admin',
            'manual',
            description
        );

        res.status(201).json(backup);

    } catch (error: any) {
        console.error('Backup failed:', error);
        res.status(500).json({ error: error.message || 'Backup failed' });
    }
});

// --- Restoration Endpoints ---

/**
 * Validate a backup file before restoring
 */
router.post('/restore/validate', requireSuperAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No backup file provided' });
        }

        const password = req.body.password;
        if (!password) {
            return res.status(400).json({ error: 'Encryption password is required' });
        }

        const metadata = await restorationService.validateBackup(req.file.buffer, password);
        res.json({ valid: true, metadata });

    } catch (error: any) {
        console.error('Validation failed:', error);
        res.status(400).json({ valid: false, error: error.message });
    }
});

/**
 * Execute full system restore
 */
router.post('/restore/execute', requireSuperAdmin, upload.single('file'), async (req, res) => {
    try {
        const password = req.body.password;
        if (!req.file || !password) {
            return res.status(400).json({ error: 'File and password are required' });
        }

        // Double check admin privileges/permissions? 
        // requireAdminAuth handles basic auth, but this is destructive. 
        // We rely on the UI "Danger" confirmation and password requirement.

        const result = await restorationService.restoreBackup(req.file.buffer, password);
        res.json(result);

    } catch (error: any) {
        console.error('Restore failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * List backups from Google Drive
 */
router.get('/backups/list', requireSuperAdmin, async (req, res) => {
    try {
        const fileList = await storageService.listFiles();
        res.json(fileList);
    } catch (error: any) {
        console.error('List backups failed:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
