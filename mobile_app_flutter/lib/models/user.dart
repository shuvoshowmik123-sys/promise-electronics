import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

/// User model for authenticated users
/// Uses Freezed for immutability and JSON serialization
@freezed
class User with _$User {
  const factory User({
    required String id,
    required String email,
    String? name,
    String? phone,
    String? address,
    String? avatar,
    @Default(false) bool isVerified,
    @Default('customer') String role,
    DateTime? createdAt,
    DateTime? lastLoginAt,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

/// Auth token response from login/register
@freezed
class AuthTokens with _$AuthTokens {
  const factory AuthTokens({
    required String accessToken,
    String? refreshToken,
    int? expiresIn,
  }) = _AuthTokens;

  factory AuthTokens.fromJson(Map<String, dynamic> json) =>
      _$AuthTokensFromJson(json);
}

/// Login response containing both user and tokens
@freezed
class LoginResponse with _$LoginResponse {
  const factory LoginResponse({
    required User user,
    required AuthTokens tokens,
    String? message,
  }) = _LoginResponse;

  factory LoginResponse.fromJson(Map<String, dynamic> json) =>
      _$LoginResponseFromJson(json);
}

/// Google Sign-In response from native login endpoint
@freezed
class GoogleLoginResponse with _$GoogleLoginResponse {
  const factory GoogleLoginResponse({
    required String accessToken,
    required Map<String, dynamic> user,
    bool? isNewUser,
  }) = _GoogleLoginResponse;

  factory GoogleLoginResponse.fromJson(Map<String, dynamic> json) =>
      _$GoogleLoginResponseFromJson(json);
}
