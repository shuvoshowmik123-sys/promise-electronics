import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_client.dart';
import '../providers/app_settings_provider.dart';

/// Result wrapper for repository operations
class Result<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  Result.success(this.data)
      : error = null,
        isSuccess = true;

  Result.failure(this.error)
      : data = null,
        isSuccess = false;
}

/// App settings loaded from backend
class AppSettings {
  final List<HeroSlide> heroSlides;
  final BannerConfig banner;
  final PopupConfig popup;
  final bool maintenanceMode;
  final String maintenanceMessage;
  final String? minAppVersion;
  final ContactInfo contact;
  final DateTime? lastFetched;

  AppSettings({
    this.heroSlides = const [],
    this.banner = const BannerConfig(),
    this.popup = const PopupConfig(),
    this.maintenanceMode = false,
    this.maintenanceMessage =
        'We are currently performing maintenance. Please try again later.',
    this.minAppVersion,
    this.contact = const ContactInfo(),
    this.lastFetched,
  });

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      heroSlides: _parseHeroSlides(json['hero_slides']),
      banner: BannerConfig.fromJson(json),
      popup: PopupConfig.fromJson(json),
      maintenanceMode: json['maintenance_mode'] == 'true' ||
          json['maintenance_mode'] == true,
      maintenanceMessage: json['maintenance_message']?.toString() ??
          'We are currently performing maintenance. Please try again later.',
      minAppVersion: json['min_version']?.toString(),
      contact: ContactInfo.fromJson(json),
      lastFetched: DateTime.now(),
    );
  }

  static List<HeroSlide> _parseHeroSlides(dynamic data) {
    if (data == null) return [];
    try {
      if (data is String && data.isNotEmpty) {
        // Parse JSON string - placeholder for future implementation
        // In production, use jsonDecode and map to HeroSlide.fromJson
        return [];
      }
      if (data is List) {
        return data.map((e) => HeroSlide.fromJson(e)).toList();
      }
    } catch (e) {
      debugPrint('Error parsing hero slides: $e');
    }
    return [];
  }
}

/// Settings Repository
/// Handles app configuration from backend
class SettingsRepository {
  final ApiClient _client = ApiClient();
  static const String _cacheKey = 'mobile_settings_cache';
  static const Duration _cacheDuration = Duration(hours: 1);

  AppSettings? _cachedSettings;
  DateTime? _lastFetch;

  /// Get mobile settings from backend or cache
  /// Backend: GET /api/mobile/settings
  Future<Result<AppSettings>> getSettings({bool forceRefresh = false}) async {
    // Check cache first
    if (!forceRefresh && _cachedSettings != null && _lastFetch != null) {
      final age = DateTime.now().difference(_lastFetch!);
      if (age < _cacheDuration) {
        return Result.success(_cachedSettings!);
      }
    }

    try {
      final response = await _client.get('/api/mobile/settings');

      if (response.statusCode == 200 && response.data != null) {
        final settings =
            AppSettings.fromJson(response.data as Map<String, dynamic>);
        _cachedSettings = settings;
        _lastFetch = DateTime.now();

        // Save to persistent cache
        await _saveToCache(response.data);

        return Result.success(settings);
      }

      return Result.failure('Failed to fetch settings.');
    } on DioException catch (e) {
      // On network error, try to load from cache
      final cached = await _loadFromCache();
      if (cached != null) {
        return Result.success(cached);
      }
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get settings error: $e');
      return Result.failure('Failed to load settings.');
    }
  }

  /// Check if maintenance mode is enabled
  Future<bool> isMaintenanceMode() async {
    final result = await getSettings();
    return result.data?.maintenanceMode ?? false;
  }

  /// Get maintenance message
  Future<String> getMaintenanceMessage() async {
    final result = await getSettings();
    return result.data?.maintenanceMessage ?? 'Please try again later.';
  }

  /// Clear settings cache
  Future<void> clearCache() async {
    _cachedSettings = null;
    _lastFetch = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cacheKey);
  }

  /// Save settings to persistent cache
  Future<void> _saveToCache(Map<String, dynamic> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      // In production, use jsonEncode
      await prefs.setString(_cacheKey, data.toString());
    } catch (e) {
      debugPrint('Error saving settings to cache: $e');
    }
  }

  /// Load settings from persistent cache
  Future<AppSettings?> _loadFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(_cacheKey);
      if (cached != null && cached.isNotEmpty) {
        // In production, use jsonDecode
        // For now, return null to force fresh fetch
        return null;
      }
    } catch (e) {
      debugPrint('Error loading settings from cache: $e');
    }
    return null;
  }

  /// Handle Dio errors
  Result<T> _handleDioError<T>(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return Result.failure('Connection timeout. Please try again.');
      case DioExceptionType.connectionError:
        return Result.failure('No internet connection.');
      default:
        return Result.failure('Failed to load settings.');
    }
  }
}
