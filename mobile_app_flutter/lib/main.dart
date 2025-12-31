import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'config/app_theme.dart';
import 'providers/theme_provider.dart';
import 'providers/chat_provider.dart';
import 'providers/app_settings_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/cart_provider.dart';
import 'providers/repair_provider.dart';
import 'providers/locale_provider.dart';
import 'providers/address_provider.dart';
import 'providers/hot_deals_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/bento_home_screen.dart';
import 'screens/daktar_vai_screen.dart';
import 'screens/repair_request_screen.dart';
import 'screens/shop_screen.dart';
import 'screens/repair_history_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/saved_addresses_screen.dart';
import 'screens/maintenance_screen.dart';
import 'screens/daktar_lens_screen.dart';
import 'screens/order_history_screen.dart';
import 'widgets/promo_popup.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize providers
  final themeProvider = ThemeProvider();
  await themeProvider.initialize();

  final localeProvider = LocaleProvider();
  await localeProvider.initialize();

  final appSettingsProvider = AppSettingsProvider();
  final authProvider = AuthProvider();

  // Don't await these - let splash screen handle them
  // This keeps app startup fast

  runApp(TVDaktarApp(
    themeProvider: themeProvider,
    localeProvider: localeProvider,
    appSettingsProvider: appSettingsProvider,
    authProvider: authProvider,
  ));
}

class TVDaktarApp extends StatelessWidget {
  final ThemeProvider themeProvider;
  final LocaleProvider localeProvider;
  final AppSettingsProvider appSettingsProvider;
  final AuthProvider authProvider;

  const TVDaktarApp({
    super.key,
    required this.themeProvider,
    required this.localeProvider,
    required this.appSettingsProvider,
    required this.authProvider,
  });

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: themeProvider),
        ChangeNotifierProvider.value(value: localeProvider),
        ChangeNotifierProvider.value(value: appSettingsProvider),
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
        ChangeNotifierProvider(create: (_) => CartProvider()),
        ChangeNotifierProvider(create: (_) => RepairProvider()),
        ChangeNotifierProvider(create: (_) => AddressProvider()),
        ChangeNotifierProvider(create: (_) => HotDealsProvider()),
      ],
      child: Consumer3<ThemeProvider, AppSettingsProvider, LocaleProvider>(
        builder: (context, themeProvider, appSettings, localeProvider, child) {
          // Update system UI overlay based on theme
          final isDark = themeProvider.themeMode == ThemeMode.dark ||
              (themeProvider.themeMode == ThemeMode.system &&
                  WidgetsBinding
                          .instance.platformDispatcher.platformBrightness ==
                      Brightness.dark);

          SystemChrome.setSystemUIOverlayStyle(
            SystemUiOverlayStyle(
              statusBarColor: Colors.transparent,
              statusBarIconBrightness:
                  isDark ? Brightness.light : Brightness.dark,
              systemNavigationBarColor: Colors.transparent,
              systemNavigationBarIconBrightness:
                  isDark ? Brightness.light : Brightness.dark,
            ),
          );

          // Check for maintenance mode (but allow splash to load first)
          if (appSettings.maintenanceMode &&
              !appSettings.isLoading &&
              ModalRoute.of(context)?.settings.name != '/') {
            return MaterialApp(
              title: 'TV ডাক্তার',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.darkTheme(),
              locale: Locale(localeProvider.locale),
              home: MaintenanceScreen(
                message: appSettings.maintenanceMessage,
                onRetry: () => appSettings.fetchSettings(forceRefresh: true),
              ),
            );
          }

          return MaterialApp(
            title: 'TV ডাক্তার',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.lightTheme(),
            darkTheme: AppTheme.darkTheme(),
            themeMode: themeProvider.themeMode,
            locale: Locale(localeProvider.locale),
            initialRoute: '/',
            routes: {
              '/': (context) => const SplashScreen(),
              '/login': (context) => const LoginScreen(),
              '/home': (context) => const PromoPopup(child: BentoHomeScreen()),
              '/home-old': (context) => const HomeScreen(),
              '/chat': (context) => const DaktarVaiScreen(),
              '/lens': (context) => const DaktarLensScreen(),
              '/repair-request': (context) => const RepairRequestScreen(),
              '/shop': (context) => const ShopScreen(),
              '/cart': (context) => const CartScreen(),
              '/history': (context) => const RepairHistoryScreen(),
              '/profile': (context) => const ProfileScreen(),
              '/saved-addresses': (context) => const SavedAddressesScreen(),
              '/order-history': (context) => const OrderHistoryScreen(),
            },
          );
        },
      ),
    );
  }
}
