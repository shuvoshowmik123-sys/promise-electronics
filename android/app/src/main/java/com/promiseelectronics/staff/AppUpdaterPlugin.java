package com.promiseelectronics.staff;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Fetches a new version of the app and offers to install it.
 *
 * Staff were being asked to do the work of a shop: open a browser, find a page,
 * start a download, then locate the file in a downloads tray and tap it. Most
 * people stopped at the first step, which is why phones were still on 1.0.2
 * weeks after 1.0.4 existed.
 *
 * So the download happens by itself, as soon as the app notices the server is
 * offering a newer build. All that is left for the person holding the phone is
 * one tap on Install.
 *
 * **That tap cannot be removed.** Android will not let an ordinary app install
 * another app without a human confirming it — only the Play Store, or a phone
 * enrolled as a managed device, can do that. Anyone claiming otherwise is
 * describing a rooted phone. So the goal here is not "no taps"; it is "one tap,
 * in front of you, with nothing to find".
 *
 * Android's own DownloadManager does the transfer rather than JavaScript. It
 * survives the screen locking and the app being backgrounded, resumes when the
 * connection returns, and shows progress in the notification shade where people
 * already look for downloads. Pulling ten megabytes through the WebView instead
 * gives up all three and stalls the moment the phone sleeps.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    /** Overwritten every time, so a half-finished download never accumulates. */
    private static final String FILE_NAME = "PromiseStaff-update.apk";

    private Long activeDownloadId = null;
    private BroadcastReceiver completionReceiver = null;

    /**
     * Start the download. Resolves as soon as it is queued, not when it lands.
     *
     * The transfer belongs to Android from here, so nothing has to stay open or
     * awake for it to finish. Completion arrives as an event instead.
     */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("A download url is required");
            return;
        }

        try {
            Context context = getContext();
            File target = new File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                FILE_NAME
            );
            // A previous attempt, complete or not, is never worth resuming: the
            // published build may have changed underneath it.
            if (target.exists() && !target.delete()) {
                call.reject("Could not clear the previous download");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Promise Staff update");
            request.setDescription("Downloading the new version");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
            request.setAllowedOverMetered(true);   // A shop on mobile data still needs the fix.
            request.setAllowedOverRoaming(false);

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("Downloads are unavailable on this device");
                return;
            }

            activeDownloadId = manager.enqueue(request);
            listenForCompletion(manager);

            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not start the download: " + e.getMessage());
        }
    }

    /** Whether a finished download is sitting on disk, and how big it is. */
    @PluginMethod
    public void getDownloadedUpdate(PluginCall call) {
        File file = downloadedFile();
        JSObject result = new JSObject();
        result.put("ready", file.exists() && file.length() > 0);
        result.put("size", file.exists() ? file.length() : 0);
        call.resolve(result);
    }

    /**
     * Hand the file to Android's installer.
     *
     * The person then sees the ordinary system install screen and confirms.
     * That confirmation is required and cannot be automated away.
     */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        File file = downloadedFile();
        if (!file.exists() || file.length() == 0) {
            call.reject("Nothing has been downloaded yet");
            return;
        }

        try {
            Context context = getContext();
            /**
             * A content:// URI from our own FileProvider, never a file:// path.
             *
             * Since Android 7 a file:// URI crossing to another app throws
             * FileUriExposedException, and the installer is another app. The
             * read permission is granted to whoever receives the intent, for
             * this file only, and lapses when they are done.
             */
            Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // Started from outside an activity stack, so it needs its own task.
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);

            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the installer: " + e.getMessage());
        }
    }

    /**
     * Whether this app is allowed to ask for an install at all.
     *
     * On Android 8 and above the permission is granted per app, by the person,
     * on a Settings screen. Asked for at the wrong moment it is simply refused,
     * so the UI checks first and explains before sending anyone there.
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        result.put("allowed", allowed);
        call.resolve(result);
    }

    /** Open the Settings screen where that permission is granted. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }

    private File downloadedFile() {
        return new File(
            getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            FILE_NAME
        );
    }

    /**
     * Tell the web layer when the transfer ends, success or failure.
     *
     * Registered only while a download is running and torn down afterwards: a
     * receiver left registered for the life of the app is a leak, and one
     * registered twice fires twice.
     */
    private void listenForCompletion(DownloadManager manager) {
        if (completionReceiver != null) return;

        completionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (activeDownloadId == null || id != activeDownloadId) return;

                JSObject event = new JSObject();
                event.put("success", false);

                DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                        int status = statusColumn >= 0 ? cursor.getInt(statusColumn) : -1;
                        event.put("success", status == DownloadManager.STATUS_SUCCESSFUL);
                        if (status != DownloadManager.STATUS_SUCCESSFUL) {
                            int reasonColumn = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                            event.put("reason", reasonColumn >= 0 ? cursor.getInt(reasonColumn) : -1);
                        }
                    }
                } catch (Exception ignored) {
                    // The event still fires, reporting failure — which is true.
                }

                notifyListeners("downloadComplete", event);
                cleanUpReceiver();
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13 requires every receiver to declare its exposure.
            // This one listens for a system broadcast, so it must be exported.
            getContext().registerReceiver(completionReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(completionReceiver, filter);
        }
    }

    private void cleanUpReceiver() {
        if (completionReceiver == null) return;
        try {
            getContext().unregisterReceiver(completionReceiver);
        } catch (Exception ignored) {
            // Already gone; nothing to undo.
        }
        completionReceiver = null;
        activeDownloadId = null;
    }

    @Override
    protected void handleOnDestroy() {
        cleanUpReceiver();
        super.handleOnDestroy();
    }
}
