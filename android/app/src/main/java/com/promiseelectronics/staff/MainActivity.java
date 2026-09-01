package com.promiseelectronics.staff;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * The staff app's only activity.
 *
 * It exists to create the notification channel. Everything else is Capacitor's.
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
        super.onCreate(savedInstanceState);
        createNotificationChannel();
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
