import 'package:flutter_test/flutter_test.dart';
import 'package:promise_mobile_command/app/routes.dart';

void main() {
  group('Role Routing Tests', () {
    test('Super Admin, Manager, Admin routes to /admin-home', () {
      expect(resolveHomeRouteForRole('SUPER_ADMIN'), '/admin-home');
      expect(resolveHomeRouteForRole('manager'), '/admin-home');
      expect(resolveHomeRouteForRole('Admin'), '/admin-home');
      expect(resolveHomeRouteForRole('  Super Admin  '), '/admin-home');
    });

    test('Technician routes to /tech-home', () {
      expect(resolveHomeRouteForRole('TECHNICIAN'), '/tech-home');
      expect(resolveHomeRouteForRole('technician'), '/tech-home');
      expect(resolveHomeRouteForRole(' Technician '), '/tech-home');
    });

    test('Employee and unknown roles route to /employee-home', () {
      expect(resolveHomeRouteForRole('EMPLOYEE'), '/employee-home');
      expect(resolveHomeRouteForRole('employee'), '/employee-home');
      expect(resolveHomeRouteForRole('Guest'), '/employee-home');
      expect(resolveHomeRouteForRole(''), '/employee-home');
    });
  });
}
