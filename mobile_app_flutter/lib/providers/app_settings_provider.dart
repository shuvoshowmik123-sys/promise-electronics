import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';

/// Hero slide model for the home screen carousel
class HeroSlide {
  final String title1;
  final String title2;
  final String subtitle;
  final String image;

  HeroSlide({
    required this.title1,
    required this.title2,
    required this.subtitle,
    required this.image,
  });

  factory HeroSlide.fromJson(Map<String, dynamic> json) {
    return HeroSlide(
      title1: json['title1'] ?? '',
      title2: json['title2'] ?? '',
      subtitle: json['subtitle'] ?? '',
      image: json['image'] ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'title1': title1,
        'title2': title2,
        'subtitle': subtitle,
        'image': image,
      };
}

/// Banner configuration
class BannerConfig {
  final bool enabled;
  final String text;
  final String type; // info, success, warning, urgent
  final String link; // none, shop, repair, chat

  const BannerConfig({
    this.enabled = false,
    this.text = '',
    this.type = 'info',
    this.link = 'none',
  });

  factory BannerConfig.fromJson(Map<String, dynamic> json) => BannerConfig(
        enabled:
            json['banner_enabled'] == 'true' || json['banner_enabled'] == true,
        text: json['banner_text']?.toString() ?? '',
        type: json['banner_type']?.toString() ?? 'info',
        link: json['banner_link']?.toString() ?? 'none',
      );

  static const BannerConfig empty = BannerConfig();
}

/// Popup configuration
class PopupConfig {
  final bool enabled;
  final String image;
  final String title;
  final String description;
  final String buttonText;
  final String buttonLink;
  final bool showOnce;

  const PopupConfig({
    this.enabled = false,
    this.image = '',
    this.title = '',
    this.description = '',
    this.buttonText = 'Learn More',
    this.buttonLink = 'none',
    this.showOnce = true,
  });

  factory PopupConfig.fromJson(Map<String, dynamic> json) => PopupConfig(
        enabled:
            json['popup_enabled'] == 'true' || json['popup_enabled'] == true,
        image: json['popup_image']?.toString() ?? '',
        title: json['popup_title']?.toString() ?? '',
        description: json['popup_description']?.toString() ?? '',
        buttonText: json['popup_button_text']?.toString() ?? 'Learn More',
        buttonLink: json['popup_button_link']?.toString() ?? 'none',
        showOnce: json['popup_show_once'] == 'true' ||
            json['popup_show_once'] == true,
      );

  static const PopupConfig empty = PopupConfig();
}

/// Contact information
class ContactInfo {
  final String phone;
  final String whatsapp;
  final String address;
  final String businessHours;

  const ContactInfo({
    this.phone = '',
    this.whatsapp = '',
    this.address = '',
    this.businessHours = '',
  });

  factory ContactInfo.fromJson(Map<String, dynamic> json) => ContactInfo(
        phone: json['contact_phone']?.toString() ?? '',
        whatsapp: json['contact_whatsapp']?.toString() ?? '',
        address: json['contact_address']?.toString() ?? '',
        businessHours: json['business_hours']?.toString() ?? '',
      );

  static const ContactInfo empty = ContactInfo();
}

/// App Settings Provider
/// Fetches and caches settings from the admin panel API
class AppSettingsProvider with ChangeNotifier {
  static const String _cacheKey = 'mobile_settings_cache';
  static const Duration _cacheDuration = Duration(hours: 1);

  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';
  DateTime? _lastFetch;

  // Settings
  List<HeroSlide> _heroSlides = [];
  BannerConfig _banner = BannerConfig.empty;
  PopupConfig _popup = PopupConfig.empty;
  bool _maintenanceMode = false;
  String _maintenanceMessage = '';
  String _minVersion = '1.0.0';
  ContactInfo _contact = ContactInfo.empty;

  // Getters
  bool get isLoading => _isLoading;
  bool get hasError => _hasError;
  String get errorMessage => _errorMessage;
  List<HeroSlide> get heroSlides => _heroSlides;
  BannerConfig get banner => _banner;
  PopupConfig get popup => _popup;
  bool get maintenanceMode => _maintenanceMode;
  String get maintenanceMessage => _maintenanceMessage;
  String get minVersion => _minVersion;
  ContactInfo get contact => _contact;

  /// Default hero slides when no API data is available
  static List<HeroSlide> get defaultHeroSlides => [
        HeroSlide(
          title1: 'Your TV,',
          title2: 'Our Care.',
          subtitle: 'Expert repairs at your doorstep.',
          image: '',
        ),
        HeroSlide(
          title1: 'Fast &',
          title2: 'Reliable.',
          subtitle: 'Same-day service available.',
          image: '',
        ),
        HeroSlide(
          title1: 'Quality',
          title2: 'Parts Only.',
          subtitle: 'Genuine components guaranteed.',
          image: '',
        ),
      ];

  /// Initialize and fetch settings
  Future<void> initialize() async {
    // Try to load from cache first
    await _loadFromCache();

    // Fetch fresh data from API
    await fetchSettings();
  }

  /// Clear cache and force refresh settings from server
  Future<void> clearCacheAndRefresh() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_cacheKey);
      _lastFetch = null;
      debugPrint('[Settings] Cache cleared, fetching fresh settings...');
      await fetchSettings(forceRefresh: true);
    } catch (e) {
      debugPrint('Failed to clear cache and refresh: $e');
    }
  }

  /// Load settings from local cache
  Future<void> _loadFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cached = prefs.getString(_cacheKey);

      if (cached != null) {
        final data = jsonDecode(cached);
        final cacheTime = DateTime.parse(data['cacheTime']);

        // Check if cache is still valid
        if (DateTime.now().difference(cacheTime) < _cacheDuration) {
          _parseSettings(data['settings']);
          _isLoading = false;
          notifyListeners();
        }
      }
    } catch (e) {
      debugPrint('Failed to load settings from cache: $e');
    }
  }

  /// Save settings to local cache
  Future<void> _saveToCache(Map<String, dynamic> settings) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cacheData = {
        'cacheTime': DateTime.now().toIso8601String(),
        'settings': settings,
      };
      await prefs.setString(_cacheKey, jsonEncode(cacheData));
    } catch (e) {
      debugPrint('Failed to save settings to cache: $e');
    }
  }

  /// Fetch settings from the API
  Future<void> fetchSettings({bool forceRefresh = false}) async {
    // Skip if recently fetched and not forcing
    if (!forceRefresh && _lastFetch != null) {
      final timeSinceLastFetch = DateTime.now().difference(_lastFetch!);
      if (timeSinceLastFetch < const Duration(minutes: 5)) {
        return;
      }
    }

    try {
      final url = ApiConfig.mobileSettingsEndpoint;
      debugPrint('[Settings] Fetching from: $url');

      final response = await http
          .get(
            Uri.parse(url),
            headers: ApiConfig.headers,
          )
          .timeout(const Duration(seconds: 10));

      debugPrint('[Settings] Response status: ${response.statusCode}');

      if (response.statusCode == 200) {
        final settings = jsonDecode(response.body) as Map<String, dynamic>;
        debugPrint('[Settings] Received settings: ${settings.keys.toList()}');
        _parseSettings(settings);
        await _saveToCache(settings);
        _lastFetch = DateTime.now();
        _hasError = false;
        _errorMessage = '';
      } else {
        throw Exception('Failed to fetch settings: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('[Settings] Failed to fetch mobile settings: $e');
      _hasError = true;
      _errorMessage = e.toString();

      // Use defaults if no cached data
      if (_heroSlides.isEmpty) {
        _heroSlides = defaultHeroSlides;
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Parse settings from API response
  void _parseSettings(Map<String, dynamic> settings) {
    // Debug: Print what we receive from the API
    debugPrint('[Settings] Parsing settings: ${settings.keys.toList()}');

    // Hero Slides - API returns 'hero_slides' not 'mobile_hero_slides'
    if (settings['hero_slides'] != null) {
      try {
        final slides = settings['hero_slides'];
        if (slides is List) {
          _heroSlides = slides
              .map((s) => HeroSlide.fromJson(s as Map<String, dynamic>))
              .toList();
        } else if (slides is String) {
          final parsed = jsonDecode(slides) as List;
          _heroSlides = parsed
              .map((s) => HeroSlide.fromJson(s as Map<String, dynamic>))
              .toList();
        }
        debugPrint('[Settings] Loaded ${_heroSlides.length} hero slides');
      } catch (e) {
        debugPrint('Failed to parse hero slides: $e');
        _heroSlides = defaultHeroSlides;
      }
    } else {
      _heroSlides = defaultHeroSlides;
    }

    // Banner - API returns keys without 'mobile_' prefix
    _banner = BannerConfig(
      enabled: settings['banner_enabled'] == 'true' ||
          settings['banner_enabled'] == true,
      text: settings['banner_text']?.toString() ?? '',
      type: settings['banner_type']?.toString() ?? 'info',
      link: settings['banner_link']?.toString() ?? 'none',
    );
    debugPrint(
        '[Settings] Banner enabled: ${_banner.enabled}, text: "${_banner.text}"');

    // Popup
    _popup = PopupConfig(
      enabled: settings['popup_enabled'] == 'true' ||
          settings['popup_enabled'] == true,
      image: settings['popup_image']?.toString() ?? '',
      title: settings['popup_title']?.toString() ?? '',
      description: settings['popup_description']?.toString() ?? '',
      buttonText: settings['popup_button_text']?.toString() ?? 'Learn More',
      buttonLink: settings['popup_button_link']?.toString() ?? 'none',
      showOnce: settings['popup_show_once'] == 'true' ||
          settings['popup_show_once'] == true,
    );

    // App Control
    _maintenanceMode = settings['maintenance_mode'] == 'true' ||
        settings['maintenance_mode'] == true;
    _maintenanceMessage = settings['maintenance_message']?.toString() ??
        'We\'re updating our systems. Please check back soon.';
    _minVersion = settings['min_version']?.toString() ?? '1.0.0';

    // Contact
    _contact = ContactInfo(
      phone: settings['contact_phone']?.toString() ?? '',
      whatsapp: settings['contact_whatsapp']?.toString() ?? '',
      address: settings['contact_address']?.toString() ?? '',
      businessHours: settings['business_hours']?.toString() ?? '',
    );
  }

  /// Check if app version requires update
  bool requiresUpdate(String currentVersion) {
    if (_minVersion.isEmpty) return false;

    try {
      final current = _parseVersion(currentVersion);
      final minimum = _parseVersion(_minVersion);

      // Compare major.minor.patch
      for (int i = 0; i < 3; i++) {
        if (current[i] < minimum[i]) return true;
        if (current[i] > minimum[i]) return false;
      }
      return false;
    } catch (e) {
      debugPrint('Failed to compare versions: $e');
      return false;
    }
  }

  List<int> _parseVersion(String version) {
    final parts = version.split('.');
    return [
      int.tryParse(parts.isNotEmpty ? parts[0] : '0') ?? 0,
      int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
      int.tryParse(parts.length > 2 ? parts[2] : '0') ?? 0,
    ];
  }
}
