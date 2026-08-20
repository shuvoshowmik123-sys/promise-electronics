import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The staff Android app.
 *
 * It runs the real admin UI rather than a rebuilt one. That is the only way to
 * get the design identical: 45 tabs and ~114,000 lines of interface redrawn by
 * hand would be a copy that is nearly right and permanently chasing the rest,
 * whereas the same CSS in the same rendering engine is not a copy at all. It
 * also means Super Admin is covered on day one, because nothing is per-screen
 * work.
 *
 * The complaint this exists to fix is that Chrome is slow to open. It is: the
 * admin shell is about 1 MB of JavaScript that has to come down the network
 * before anything is drawn. Here the same files sit inside the APK, so start-up
 * reads them off local storage and only data crosses the network.
 */
const config: CapacitorConfig = {
    appId: "com.promiseelectronics.staff",
    appName: "Promise Staff",

    /**
     * The Vite build output. `npx cap sync` copies this into the APK, so the
     * app must be rebuilt and re-synced whenever the UI changes — see
     * `npm run app:sync`.
     */
    webDir: "dist/public",

    android: {
        /**
         * HTTPS rather than the default http://localhost.
         *
         * The origin the WebView reports is the origin the API sees, and the
         * session cookie is configured secure + sameSite. An http origin would
         * have the cookie silently dropped and every request would arrive
         * unauthenticated with nothing explaining why.
         */
        androidScheme: "https",

        /**
         * Debuggable only in a debug build. This is an internal app distributed
         * by hand, not through Play review, so nothing else stops a release
         * build from being inspectable if this were left on.
         */
        webContentsDebuggingEnabled: false,
    },

    plugins: {
        /**
         * The server already sends FCM (server/services/fcm.service.ts), which
         * is the reason a native shell is worth building at all: web push on
         * Android is at the mercy of the battery optimiser, and a repair job
         * alert that arrives an hour late is not an alert.
         */
        PushNotifications: {
            presentationOptions: ["badge", "sound", "alert"],
        },

        /**
         * Held until the web layer says it is ready, rather than dismissed on a
         * timer. A timer either flashes the app's own blank page or lingers
         * after it is drawn; the app hides this itself once the shell mounts.
         */
        SplashScreen: {
            launchAutoHide: false,
            backgroundColor: "#ffffff",
            androidSpinnerStyle: "small",
            spinnerColor: "#0f172a",
        },
    },
};

export default config;
