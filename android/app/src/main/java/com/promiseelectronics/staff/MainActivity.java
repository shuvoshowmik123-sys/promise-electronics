package com.promiseelectronics.staff;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

/**
 * The staff app's only activity.
 *
 * It exists for two things Capacitor does not do on its own: create the
 * notification channel, and keep the session cookie.
 */
public class MainActivity extends BridgeActivity {

    /**
     * Must match the channelId the server sends with every push — see
     * server/services/fcm.service.ts. If the two ever drift apart, alerts stop
     * behaving like alerts and nothing reports an error.
     */
    private static final String CHANNEL_ID = "admin_notifications";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super, which is when Capacitor builds its bridge —
        // a plugin registered afterwards is not there when the web layer asks
        // for it, and the call fails with "plugin not implemented".
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        keepTheSession();
    }

    /**
     * Let the WebView keep the session cookie, and write it to disk.
     *
     * This is why the app asked people to sign in again every single time they
     * opened it.
     *
     * The app's WebView reports its origin as https://localhost, so every
     * request to promiseelectronics.com is *cross-site*, and its session cookie
     * is third-party by Android's reckoning. Android WebView refuses
     * third-party cookies by default and Capacitor never turns them on, so the
     * cookie the login response set was dropped on the floor. Signing in
     * appeared to work because the requests that mattered went out through
     * CapacitorHttp — Java's HTTP stack, which has no notion of first or third
     * party — while everything travelling through the WebView, including the
     * live event stream, arrived anonymous. On the next launch there was no
     * stored cookie at all, and the app asked for a password again.
     *
     * The server side of this is already right: the session cookie is sent with
     * SameSite=None and Secure, which is what makes it legal to send
     * cross-site. This is the other half of the same agreement.
     *
     * flush() is the second half of the bug. Cookies set through the WebView
     * live in memory and reach storage on the framework's own schedule; a
     * process killed before that — which is what closing an app usually is —
     * loses them. Flushing when the app goes to the background writes them
     * down while there is still something to write.
     */
    private void keepTheSession() {
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (getBridge() != null && getBridge().getWebView() != null) {
                cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
            }
        } catch (Exception ignored) {
            // A phone that refuses this is no worse off than before it was asked.
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Write cookies down before the process can be killed. Without this a
        // signed-in session can still be lost between one launch and the next.
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {}
    }

    /**
     * Create the channel the server's messages are addressed to.
     *
     * From Android 8 every notification must belong to a channel, and the app
     * has to create it — the server naming one in the message is not enough.
     * Ours named admin_notifications and nothing ever created it, so Firebase
     * fell back to its own "Miscellaneous" channel at default importance.
     *
     * That fallback still delivers, which is why this was easy to miss. What it
     * loses is everything that makes an alert an alert: no heads-up banner over
     * whatever is on screen, and no sound by default. A repair job alert that
     * slides silently into the shade is not an alert, and it is the reason a
     * native app was worth building over web push in the first place.
     *
     * It also gives people an honest switch. The channel appears in Settings as
     * "Job alerts" with its own controls, so someone can silence job alerts
     * without silencing the whole app — which is what they will otherwise do.
     *
     * Importance is fixed at creation. Android will not raise it later, so a
     * channel first created at default importance stays quiet for everyone who
     * already installed the app — which is why this needs to land before the
     * build is handed out widely, not after.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Job alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("New jobs, status changes, pickups and shop alerts.");
        channel.enableVibration(true);
        channel.setShowBadge(true);

        // Creating a channel that already exists updates its name and
        // description and leaves the person's own sound and importance choices
        // alone, so this is safe to run on every launch.
        manager.createNotificationChannel(channel);
    }
}
