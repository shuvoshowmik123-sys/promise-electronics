import '../models/policy.dart';
import '../services/api_client.dart';

class PolicyRepository {
  final ApiClient _apiClient = ApiClient();

  /// Fetch privacy policy
  Future<Policy?> getPrivacyPolicy() async {
    try {
      final response = await _apiClient.get('/api/mobile/policies/privacy');
      if (response.statusCode == 200 && response.data != null) {
        return Policy.fromJson(response.data);
      }
    } catch (e) {
      // Handle error
    }
    return null;
  }

  /// Fetch terms and conditions
  Future<Policy?> getTermsAndConditions() async {
    try {
      final response = await _apiClient.get('/api/mobile/policies/terms');
      if (response.statusCode == 200 && response.data != null) {
        return Policy.fromJson(response.data);
      }
    } catch (e) {
      // Handle error
    }
    return null;
  }
}
