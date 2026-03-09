import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/auth_provider.dart';
import '../core/animations.dart';
import '../features/splash/splash_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/home/super_admin_home.dart';
import '../features/home/technician_home.dart';
import '../features/home/employee_home.dart';
import '../features/jobs/screens/job_list_screen.dart';
import '../features/jobs/screens/job_detail_screen.dart';
import '../features/notifications/notification_screen.dart';
import '../features/notifications/action_queue_screen.dart';

String normalizeRoleForRouting(String role) {
  return role.trim().toLowerCase().replaceAll('_', ' ');
}

String resolveHomeRouteForRole(String role) {
  final normalizedRole = normalizeRoleForRouting(role);
  if (normalizedRole == 'super admin' ||
      normalizedRole == 'manager' ||
      normalizedRole == 'admin') {
    return '/admin-home';
  }

  if (normalizedRole == 'technician') {
    return '/tech-home';
  }

  return '/employee-home';
}

class AppRouter {
  static final _rootNavigatorKey = GlobalKey<NavigatorState>();

  static GoRouter buildRouter(AuthProvider authProvider) {
    return GoRouter(
      navigatorKey: _rootNavigatorKey,
      initialLocation: '/',
      refreshListenable: authProvider,
      redirect: (context, state) {
        final status = authProvider.status;
        final isGoingToLogin = state.matchedLocation == '/login';

        switch (status) {
          case AuthStatus.initial:
          case AuthStatus.authenticating:
            return '/'; // Stay on splash while loading

          case AuthStatus.unauthenticated:
          case AuthStatus.error:
            if (!isGoingToLogin) return '/login';
            break;

          case AuthStatus.authenticated:
            if (isGoingToLogin || state.matchedLocation == '/') {
              // Read user role and route accordingly
              final role = authProvider.user?.role ?? '';
              return resolveHomeRouteForRole(role);
            }
            break;
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/', 
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(context: context, state: state, child: const SplashScreen()),
        ),
        GoRoute(
          path: '/login',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(context: context, state: state, child: const LoginScreen()),
        ),
        GoRoute(
          path: '/admin-home',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(context: context, state: state, child: const SuperAdminHome()),
        ),
        GoRoute(
          path: '/tech-home',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(context: context, state: state, child: const TechnicianHome()),
        ),
        GoRoute(
          path: '/employee-home',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(context: context, state: state, child: const EmployeeHome()),
        ),
        // Phase 4: Jobs Native Routes
        GoRoute(
          path: '/jobs',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(
            context: context,
            state: state,
            child: const JobListScreen(),
          ),
        ),
        GoRoute(
          path: '/jobs/:id',
          pageBuilder: (context, state) {
            final jobId = state.pathParameters['id']!;
            return OpusAnimations.buildPageTransition(
              context: context,
              state: state,
              child: JobDetailScreen(jobId: jobId),
            );
          },
        ),
        // Phase 5: Notifications & Action Queue
        GoRoute(
          path: '/notifications',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(
            context: context,
            state: state,
            child: const NotificationScreen(),
          ),
        ),
        GoRoute(
          path: '/action-queue',
          pageBuilder: (context, state) => OpusAnimations.buildPageTransition(
            context: context,
            state: state,
            child: const ActionQueueScreen(),
          ),
        ),
      ],
    );
  }
}
