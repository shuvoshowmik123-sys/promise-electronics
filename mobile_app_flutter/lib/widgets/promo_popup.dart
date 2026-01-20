import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/app_settings_provider.dart';

/// Promotional Popup Widget
/// Shows a full-screen promotional popup like Daraz
/// Controlled by admin settings
class PromoPopup extends StatefulWidget {
  final Widget child;

  const PromoPopup({super.key, required this.child});

  @override
  State<PromoPopup> createState() => _PromoPopupState();
}

class _PromoPopupState extends State<PromoPopup> {
  static const String _shownKey = 'promo_popup_shown_session';
  bool _hasShown = false;

  @override
  void initState() {
    super.initState();
    _checkIfShown();
  }

  Future<void> _checkIfShown() async {
    final prefs = await SharedPreferences.getInstance();
    final shownTime = prefs.getString(_shownKey);

    if (shownTime != null) {
      final shown = DateTime.tryParse(shownTime);
      if (shown != null) {
        // Check if shown in this session (within last 30 minutes)
        final difference = DateTime.now().difference(shown);
        _hasShown = difference.inMinutes < 30;
      }
    }

    if (mounted) {
      // Show popup after a short delay if needed
      if (!_hasShown) {
        Future.delayed(const Duration(milliseconds: 1500), () {
          _maybeShowPopup();
        });
      }
    }
  }

  void _maybeShowPopup() {
    final settings = Provider.of<AppSettingsProvider>(context, listen: false);

    if (!settings.popup.enabled || settings.popup.title.isEmpty) {
      return;
    }

    if (settings.popup.showOnce && _hasShown) {
      return;
    }

    _showPopupDialog(settings.popup);
  }

  Future<void> _markAsShown() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_shownKey, DateTime.now().toIso8601String());
    _hasShown = true;
  }

  void _showPopupDialog(PopupConfig popup) {
    _markAsShown();

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) => _PopupDialog(
        popup: popup,
        onAction: () => _handleAction(popup.buttonLink),
      ),
    );
  }

  void _handleAction(String link) {
    Navigator.of(context).pop(); // Close dialog

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
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}

class _PopupDialog extends StatelessWidget {
  final PopupConfig popup;
  final VoidCallback onAction;

  const _PopupDialog({required this.popup, required this.onAction});

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 20,
              spreadRadius: 5,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Close button
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: IconButton(
                  icon: const Icon(Icons.close, size: 24),
                  onPressed: () => Navigator.of(context).pop(),
                  color: Colors.grey[600],
                ),
              ),
            ),

            // Image
            if (popup.image.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(12),
                  topRight: Radius.circular(12),
                ),
                child: Image.network(
                  popup.image,
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stack) => Container(
                    height: 100,
                    color: const Color(0xFF36e27b).withOpacity(0.1),
                    child: const Icon(
                      Icons.image,
                      size: 48,
                      color: Color(0xFF36e27b),
                    ),
                  ),
                ),
              ),

            // Content
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    popup.title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1e293b),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  if (popup.description.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      popup.description,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey[600],
                        height: 1.5,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 20),

                  // Action button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: onAction,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF36e27b),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: Text(
                        popup.buttonText,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
