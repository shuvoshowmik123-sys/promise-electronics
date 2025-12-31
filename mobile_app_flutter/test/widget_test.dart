// Basic widget test for TV Daktar app
import 'package:flutter_test/flutter_test.dart';
import 'package:tv_daktar/main.dart';
import 'package:tv_daktar/providers/theme_provider.dart';
import 'package:tv_daktar/providers/app_settings_provider.dart';
import 'package:tv_daktar/providers/auth_provider.dart';
import 'package:tv_daktar/providers/locale_provider.dart';

void main() {
  testWidgets('App loads successfully', (WidgetTester tester) async {
    // Create mock providers
    final themeProvider = ThemeProvider();
    final appSettingsProvider = AppSettingsProvider();
    final authProvider = AuthProvider();
    final localeProvider = LocaleProvider();

    // Build our app and trigger a frame.
    await tester.pumpWidget(TVDaktarApp(
      themeProvider: themeProvider,
      appSettingsProvider: appSettingsProvider,
      authProvider: authProvider,
      localeProvider: localeProvider,
    ));

    // Verify the app loads (splash screen or home)
    await tester.pump(const Duration(milliseconds: 100));

    // Basic smoke test - app should render without errors
    expect(find.byType(TVDaktarApp), findsOneWidget);
  });
}
