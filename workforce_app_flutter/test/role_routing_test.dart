import 'package:flutter_test/flutter_test.dart';
import 'package:promise_mobile_command/app/routes.dart';

void main() {
  group('resolveHomeRouteForRole', () {
    test('routes admin roles to admin home', () {
      expect(resolveHomeRouteForRole('Super Admin'), '/admin-home');
      expect(resolveHomeRouteForRole('Manager'), '/admin-home');
      expect(resolveHomeRouteForRole('Admin'), '/admin-home');
      expect(resolveHomeRouteForRole('super_admin'), '/admin-home');
      expect(resolveHomeRouteForRole(' super admin '), '/admin-home');
    });

    test('routes technician role to tech home', () {
      expect(resolveHomeRouteForRole('Technician'), '/tech-home');
      expect(resolveHomeRouteForRole(' technician '), '/tech-home');
    });

    test('routes unknown roles to employee home', () {
      expect(resolveHomeRouteForRole('Cashier'), '/employee-home');
      expect(resolveHomeRouteForRole(''), '/employee-home');
    });
  });
}
