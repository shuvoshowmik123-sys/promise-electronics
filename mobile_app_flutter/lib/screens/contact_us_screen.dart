import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_theme.dart';
import '../providers/app_settings_provider.dart';
import '../providers/locale_provider.dart';

class ContactUsScreen extends StatelessWidget {
  const ContactUsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final settings = Provider.of<AppSettingsProvider>(context);
    final contact = settings.contact;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        title: Text(
          Provider.of<LocaleProvider>(context).isBangla
              ? 'যোগাযোগ করুন'
              : 'Contact Us',
          style: TextStyle(
            color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(
          color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'সাহায্য ও সমর্থন'
                  : 'Help & Support',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'যেকোনো প্রশ্নের জন্য আমরা এখানে আছি'
                  : 'We\'re here to help you with any questions',
              style: TextStyle(
                fontSize: 14,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
            ),
            const SizedBox(height: 24),

            // Contact Actions
            Row(
              children: [
                Expanded(
                  child: _buildContactCard(
                    context,
                    isDark,
                    icon: Icons.phone,
                    label: 'Call Us',
                    color: Colors.blue,
                    onTap: () =>
                        _launchUrl('tel:${contact.phone.replaceAll(' ', '')}'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildContactCard(
                    context,
                    isDark,
                    icon: Icons.message,
                    label: 'WhatsApp',
                    color: Colors.green,
                    onTap: () =>
                        _launchUrl('https://wa.me/${contact.whatsapp}'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildContactCard(
                    context,
                    isDark,
                    icon: Icons.email,
                    label: 'Email',
                    color: Colors.orange,
                    onTap: () => _launchUrl(
                        'mailto:support@promiseelectronics.com'), // Fallback or from settings if available
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Address Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 10,
                  ),
                ],
              ),
              child: Column(
                children: [
                  _buildInfoRow(
                    isDark,
                    Icons.location_on,
                    'Visit Our Center',
                    contact.address.isNotEmpty
                        ? contact.address
                        : 'House 12, Road 5, Dhanmondi, Dhaka 1205',
                  ),
                  const SizedBox(height: 16),
                  _buildInfoRow(
                    isDark,
                    Icons.access_time,
                    'Business Hours',
                    contact.businessHours.isNotEmpty
                        ? contact.businessHours
                        : 'Sat - Thu: 9:00 AM - 8:00 PM',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // FAQs
            Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'সচরাচর জিজ্ঞাসিত প্রশ্ন'
                  : 'Frequently Asked Questions',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
            const SizedBox(height: 16),
            _buildFaqItem(
              isDark,
              'How do I track my repair?',
              'You can track your repair status by entering your Job Ticket ID in the \'Track Order\' section on the home page.',
            ),
            _buildFaqItem(
              isDark,
              'What is the warranty period?',
              'We offer a 90-day warranty on all repairs and replaced parts. If the same issue recurs within this period, we will fix it free of charge.',
            ),
            _buildFaqItem(
              isDark,
              'Do you offer home service?',
              'Yes, we offer home pickup and delivery services across Dhaka. Our technicians can also visit your home for minor repairs.',
            ),
            _buildFaqItem(
              isDark,
              'What payment methods do you accept?',
              'We accept Cash, bKash, Nagad, and all major Credit/Debit cards.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContactCard(
    BuildContext context,
    bool isDark, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(bool isDark, IconData icon, String title, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: AppColors.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color:
                      isDark ? AppColors.textMainDark : AppColors.textMainLight,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                style: TextStyle(
                  fontSize: 13,
                  color:
                      isDark ? AppColors.textSubDark : AppColors.textSubLight,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFaqItem(bool isDark, String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            question,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            answer,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _launchUrl(String urlString) async {
    final Uri url = Uri.parse(urlString);
    if (!await launchUrl(url)) {
      debugPrint('Could not launch $url');
    }
  }
}
