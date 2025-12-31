/**
 * Over-the-Air (OTA) Update Service
 * 
 * Uses Capgo to enable instant updates without Google Play deployment.
 * Updates are downloaded in the background and applied on next app launch.
 */

import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater, BundleInfo } from '@capgo/capacitor-updater';

export interface UpdateInfo {
    version: string;
    url?: string;
    message?: string;
}

export interface UpdateProgress {
    percent: number;
    status: 'checking' | 'downloading' | 'installing' | 'ready' | 'error' | 'up-to-date';
    message: string;
}

type UpdateCallback = (progress: UpdateProgress) => void;
type UpdateAvailableCallback = (info: BundleInfo) => void;

let updateCallback: UpdateCallback | null = null;
let updateAvailableCallback: UpdateAvailableCallback | null = null;

/**
 * Initialize OTA update system
 * Should be called once when the app starts
 */
export async function initOTAUpdates(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        console.log('[OTA] Skipping - not on native platform');
        return;
    }

    try {
        // Defensive check: ensure plugin is properly loaded
        if (!CapacitorUpdater || typeof CapacitorUpdater.notifyAppReady !== 'function') {
            console.warn('[OTA] CapacitorUpdater plugin not properly initialized, skipping');
            return;
        }

        // Notify that the app is ready (required after an update)
        await CapacitorUpdater.notifyAppReady();
        console.log('[OTA] App marked as ready');

        // Listen for download progress
        CapacitorUpdater.addListener('download', (info) => {
            console.log(`[OTA] Download progress: ${info.percent}%`);
            if (updateCallback) {
                updateCallback({
                    percent: info.percent,
                    status: 'downloading',
                    message: `Downloading update: ${info.percent}%`
                });
            }
        });

        // Listen for update available
        CapacitorUpdater.addListener('updateAvailable', (info) => {
            console.log('[OTA] Update available:', info);
            if (updateAvailableCallback) {
                updateAvailableCallback(info);
            }
        });

        // Listen for update failed
        CapacitorUpdater.addListener('updateFailed', (info) => {
            console.error('[OTA] Update failed:', info);
            if (updateCallback) {
                updateCallback({
                    percent: 0,
                    status: 'error',
                    message: 'Update failed. Please try again later.'
                });
            }
        });

        // Listen for download complete
        CapacitorUpdater.addListener('downloadComplete', (bundle) => {
            console.log('[OTA] Download complete:', bundle);
            if (updateCallback) {
                updateCallback({
                    percent: 100,
                    status: 'ready',
                    message: 'Update ready! Restart to apply.'
                });
            }
        });

        console.log('[OTA] Listeners registered');
    } catch (error) {
        console.error('[OTA] Initialization error:', error);
    }
}

/**
 * Check for available updates
 */
export async function checkForUpdates(): Promise<BundleInfo | null> {
    if (!Capacitor.isNativePlatform()) {
        return null;
    }

    try {
        if (updateCallback) {
            updateCallback({
                percent: 0,
                status: 'checking',
                message: 'Checking for updates...'
            });
        }

        // Get current bundle
        const current = await CapacitorUpdater.current();
        console.log('[OTA] Current bundle:', current);

        // Check for new version
        // Note: This requires Capgo Cloud configuration
        // For self-hosted, you would implement your own version check
        const latest = await CapacitorUpdater.getLatest();

        if (latest.url) {
            console.log('[OTA] New version available:', latest);
            return latest;
        }

        if (updateCallback) {
            updateCallback({
                percent: 100,
                status: 'up-to-date',
                message: 'App is up to date!'
            });
        }

        return null;
    } catch (error) {
        console.error('[OTA] Check failed:', error);
        if (updateCallback) {
            updateCallback({
                percent: 0,
                status: 'error',
                message: 'Failed to check for updates'
            });
        }
        return null;
    }
}

/**
 * Download and prepare an update
 */
export async function downloadUpdate(bundle: BundleInfo): Promise<BundleInfo | null> {
    if (!Capacitor.isNativePlatform()) {
        return null;
    }

    try {
        if (updateCallback) {
            updateCallback({
                percent: 0,
                status: 'downloading',
                message: 'Downloading update...'
            });
        }

        // Download the update
        const downloaded = await CapacitorUpdater.download({
            url: bundle.url!,
            version: bundle.version
        });

        console.log('[OTA] Downloaded:', downloaded);

        if (updateCallback) {
            updateCallback({
                percent: 100,
                status: 'ready',
                message: 'Update ready! Restart to apply.'
            });
        }

        return downloaded;
    } catch (error) {
        console.error('[OTA] Download failed:', error);
        if (updateCallback) {
            updateCallback({
                percent: 0,
                status: 'error',
                message: 'Download failed. Please try again.'
            });
        }
        return null;
    }
}

/**
 * Apply a downloaded update (requires app restart)
 */
export async function applyUpdate(bundle: BundleInfo): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    try {
        if (updateCallback) {
            updateCallback({
                percent: 100,
                status: 'installing',
                message: 'Installing update...'
            });
        }

        // Set the bundle to be used on next launch
        await CapacitorUpdater.set(bundle);
        console.log('[OTA] Update set, will apply on next launch');

        // Optionally reload the app immediately
        // await CapacitorUpdater.reload();
    } catch (error) {
        console.error('[OTA] Apply failed:', error);
        if (updateCallback) {
            updateCallback({
                percent: 0,
                status: 'error',
                message: 'Failed to apply update'
            });
        }
    }
}

/**
 * Reload the app to apply pending update
 */
export async function reloadApp(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        window.location.reload();
        return;
    }

    try {
        await CapacitorUpdater.reload();
    } catch (error) {
        console.error('[OTA] Reload failed:', error);
        window.location.reload();
    }
}

/**
 * Get current bundle info
 */
export async function getCurrentBundle(): Promise<BundleInfo | null> {
    if (!Capacitor.isNativePlatform()) {
        return null;
    }

    try {
        return await CapacitorUpdater.current();
    } catch (error) {
        console.error('[OTA] Get current bundle failed:', error);
        return null;
    }
}

/**
 * Register callback for update progress
 */
export function onUpdateProgress(callback: UpdateCallback): void {
    updateCallback = callback;
}

/**
 * Register callback for when update is available
 */
export function onUpdateAvailable(callback: UpdateAvailableCallback): void {
    updateAvailableCallback = callback;
}

/**
 * Rollback to previous version (in case of issues)
 */
export async function rollbackUpdate(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
        return;
    }

    try {
        await CapacitorUpdater.reset();
        console.log('[OTA] Rolled back to built-in version');
        await CapacitorUpdater.reload();
    } catch (error) {
        console.error('[OTA] Rollback failed:', error);
    }
}
