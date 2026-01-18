#Flutter Wrapper
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }
-keep class com.google.firebase.** { *; } --# if you are using firebase
-dontwarn io.flutter.embedding.**
-ignorewarnings

# Keep your own classes if they are accessed via reflection
# -keep class com.example.tv_daktar.** { *; }
