# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor ────────────────────────────────────────────────────────────────
# Plugins are found by name at runtime through reflection, so the shrinker sees
# no reference to them and would remove classes the bridge then fails to load.
# The symptom is not a build error: the app installs, starts, and every native
# call fails at the moment it is first used.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public <methods>; }

# Cordova plugins bridged through Capacitor are resolved the same way.
-keep class org.apache.cordova.** { *; }

# Firebase and Play Services read annotated members reflectively.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# JavaScript interfaces are called from the WebView by name.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Keep source line numbers so a crash report still points at a line.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
