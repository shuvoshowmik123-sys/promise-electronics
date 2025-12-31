import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_settings_provider.dart';

/// Announcement Banner Widget
/// Displays a customizable banner at the top of the screen
/// Based on admin settings: enabled, text, type, and link
class AnnouncementBanner extends StatelessWidget {
  final VoidCallback? onTap;

  const AnnouncementBanner({super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppSettingsProvider>(
      builder: (context, settings, child) {
        if (!settings.banner.enabled || settings.banner.text.isEmpty) {
          return const SizedBox.shrink();
        }

        final banner = settings.banner;
        final colors = _getBannerColors(banner.type);

        return GestureDetector(
          onTap: banner.link != 'none'
              ? () => _handleTap(context, banner.link)
              : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: colors.gradient,
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  colors.icon,
                  color: Colors.white,
                  size: 18,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    banner.text,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (banner.link != 'none') ...[
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.arrow_forward_ios,
                    color: Colors.white70,
                    size: 14,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  void _handleTap(BuildContext context, String link) {
    switch (link) {
      case 'shop':
        Navigator.pushNamed(context, '/shop');
        break;
      case 'repair':
        Navigator.pushNamed(context, '/repair-request');
        break;
      case 'chat':
        Navigator.pushNamed(context, '/chat');
        break;
    }
    onTap?.call();
  }

  _BannerColors _getBannerColors(String type) {
    switch (type) {
      case 'success':
        return _BannerColors(
          gradient: [const Color(0xFF22c55e), const Color(0xFF16a34a)],
          icon: Icons.check_circle_outline,
        );
      case 'warning':
        return _BannerColors(
          gradient: [const Color(0xFFf97316), const Color(0xFFea580c)],
          icon: Icons.warning_amber_outlined,
        );
      case 'urgent':
        return _BannerColors(
          gradient: [const Color(0xFFef4444), const Color(0xFFdc2626)],
          icon: Icons.priority_high,
        );
      case 'info':
      default:
        return _BannerColors(
          gradient: [const Color(0xFF3b82f6), const Color(0xFF2563eb)],
          icon: Icons.info_outline,
        );
    }
  }
}

class _BannerColors {
  final List<Color> gradient;
  final IconData icon;

  _BannerColors({required this.gradient, required this.icon});
}
