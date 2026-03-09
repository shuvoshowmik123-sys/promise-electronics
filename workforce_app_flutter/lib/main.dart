import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'app/theme.dart';
import 'app/routes.dart';
import 'core/api/api_client.dart';
import 'core/storage/secure_storage.dart';
import 'core/auth/auth_provider.dart';
import 'core/providers/bootstrap_provider.dart';
import 'core/providers/job_provider.dart';
import 'core/providers/notification_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Core Services
  final secureStorage = SecureStorage();
  final apiClient = ApiClient();
  await apiClient.init();
  
  // Run app with Providers
  runApp(
    MultiProvider(
      providers: [
        Provider.value(value: secureStorage),
        Provider.value(value: apiClient),
        ChangeNotifierProvider(
          create: (_) => AuthProvider(apiClient, secureStorage)..init(),
        ),
        ChangeNotifierProvider(
          create: (_) => BootstrapProvider(apiClient),
        ),
        ChangeNotifierProvider(
          create: (_) => JobProvider(apiClient),
        ),
        ChangeNotifierProvider(
          create: (_) => NotificationProvider(apiClient),
        ),
      ],
      child: const MobileCommandApp(),
    ),
  );
}

class MobileCommandApp extends StatefulWidget {
  const MobileCommandApp({super.key});

  @override
  State<MobileCommandApp> createState() => _MobileCommandAppState();
}

class _MobileCommandAppState extends State<MobileCommandApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    // Create the router ONCE — it stays alive for the lifetime of the app.
    // GoRouter's refreshListenable internally watches AuthProvider to trigger
    // redirects without rebuilding the router itself.
    final authProvider = context.read<AuthProvider>();
    _router = AppRouter.buildRouter(authProvider);
  }

  @override
  Widget build(BuildContext context) {
    // Watch auth purely to inherit GoRouter redirects — the router itself
    // is NOT recreated here. This is a deliberate StatefulWidget pattern.
    context.watch<AuthProvider>();

    return MaterialApp.router(
      title: 'Promise Mobile Command',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.themeData,
      routerConfig: _router,
    );
  }
}
