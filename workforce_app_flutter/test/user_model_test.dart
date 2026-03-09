import 'package:flutter_test/flutter_test.dart';
import 'package:promise_mobile_command/shared/models/user_model.dart';

void main() {
  group('UserModel.fromJson', () {
    test('parses bootstrap payload with string id and name', () {
      final user = UserModel.fromJson({
        'id': 'usr_123',
        'name': 'Jane Doe',
        'role': 'Super Admin',
      });

      expect(user.id, 'usr_123');
      expect(user.name, 'Jane Doe');
      expect(user.username, 'Jane Doe');
      expect(user.role, 'Super Admin');
      expect(user.displayName, 'Jane Doe');
    });

    test('prefers username as fallback display name', () {
      final user = UserModel.fromJson({
        'id': 42,
        'username': 'ops_manager',
        'role': 'Manager',
      });

      expect(user.id, '42');
      expect(user.name, 'ops_manager');
      expect(user.username, 'ops_manager');
      expect(user.displayName, 'ops_manager');
    });
  });
}
