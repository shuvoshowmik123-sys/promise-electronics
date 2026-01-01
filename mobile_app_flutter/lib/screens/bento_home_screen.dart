import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'profile_screen.dart';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../config/app_theme.dart';
import '../providers/app_settings_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/repair_provider.dart';
import '../widgets/floating_nav_bar.dart';
import '../widgets/announcement_banner.dart';
import '../widgets/repair_status_popup.dart';
import '../providers/hot_deals_provider.dart';
import '../providers/cart_provider.dart';
import '../repositories/inventory_repository.dart';
import '../widgets/shop/product_details_sheet.dart';
import '../widgets/auth_guard.dart';

/// New Home Screen with edge-to-edge hero design
/// Supports light and dark mode
/// Features animated hero carousel with rotating images and sliding text
class BentoHomeScreen extends StatefulWidget {
  const BentoHomeScreen({super.key});

  @override
  State<BentoHomeScreen> createState() => _BentoHomeScreenState();
}

class _BentoHomeScreenState extends State<BentoHomeScreen> {
  // Hero carousel data
  int _currentHeroIndex = 0;
  late PageController _heroPageController;

  // Hero slides - will be populated from settings or use defaults
  List<HeroSlide> get _heroSlides {
    final settings = Provider.of<AppSettingsProvider>(context, listen: false);
    if (settings.heroSlides.isNotEmpty) {
      return settings.heroSlides;
    }
    return AppSettingsProvider.defaultHeroSlides;
  }

  @override
  void initState() {
    super.initState();
    _heroPageController = PageController();

    // Fetch active repairs and hot deals when screen loads
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      if (authProvider.isAuthenticated) {
        context.read<RepairProvider>().fetchUserRepairs();
      }
      // Fetch hot deals
      context.read<HotDealsProvider>().fetchHotDeals();
    });
  }

  void _onPageChanged(int index) {
    setState(() {
      _currentHeroIndex = index;
    });
  }

  @override
  void dispose() {
    _heroPageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Status bar padding - ensures content starts below status bar
                // while background color still extends to top edge
                SizedBox(height: MediaQuery.of(context).padding.top),

                // Announcement Banner (from admin settings)
                const AnnouncementBanner(),

                // Hero Section
                _buildHeroSection(context, isDark, size),

                // Quick Actions
                _buildQuickActions(context, isDark),

                // Active Repair Card
                _buildActiveRepairSection(context, isDark),

                // Hot Deals Section
                _buildHotDealsSection(context, isDark),

                // Bottom padding for nav bar
                const SizedBox(height: 100),
              ],
            ),
          ),
          // Floating Cart Button
          _buildFloatingCartButton(context, isDark),
        ],
      ),
      bottomNavigationBar: const FloatingNavBar(currentIndex: 0),
    );
  }

  Widget _buildFloatingCartButton(BuildContext context, bool isDark) {
    return Consumer<CartProvider>(
      builder: (context, cart, child) {
        // Only show if cart has items
        if (cart.itemCount == 0) {
          return const SizedBox.shrink();
        }

        final isBangla = Provider.of<LocaleProvider>(context).isBangla;

        return Positioned(
          bottom: 100, // Above the nav bar
          right: 20,
          child: GestureDetector(
            onTap: () {
              HapticFeedback.mediumImpact();
              Navigator.pushNamed(context, '/cart');
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, Color(0xFF2BC06A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(30),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.4),
                    blurRadius: 15,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Cart icon with badge
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      const Icon(
                        Icons.shopping_cart,
                        color: Colors.white,
                        size: 24,
                      ),
                      Positioned(
                        top: -8,
                        right: -8,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          child: Text(
                            '${cart.itemCount}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  // Total amount
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        isBangla ? 'কার্ট দেখুন' : 'View Cart',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Text(
                        '৳${cart.totalAmount.toStringAsFixed(0)}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 8),
                  const Icon(
                    Icons.arrow_forward_ios,
                    color: Colors.white,
                    size: 14,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildAvatarImage(String? avatarUrl, String name) {
    if (avatarUrl == null) {
      return Image.network(
        'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}&background=36e27b&color=fff&bold=true&size=200',
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          color: Colors.grey[800],
          child: const Icon(Icons.person, color: Colors.white),
        ),
      );
    }

    if (kIsWeb) {
      return Image.network(
        avatarUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
      );
    }

    if (avatarUrl.startsWith('http')) {
      return Image.network(
        avatarUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
      );
    }

    return Image.file(
      File(avatarUrl),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
    );
  }

  Widget _buildHeroSection(BuildContext context, bool isDark, Size size) {
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.user;
    final isAuthenticated = authProvider.isAuthenticated;
    final name = isAuthenticated ? (user?.name ?? 'User') : 'Guest';

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: isDark
              ? [AppColors.mintWashDark, AppColors.backgroundDark]
              : [AppColors.mintWashLight, AppColors.backgroundLight],
        ),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(40),
          bottomRight: Radius.circular(40),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Row
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Avatar and Greeting
                Row(
                  children: [
                    GestureDetector(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (context) => const ProfileScreen()),
                        );
                      },
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white,
                            width: 2,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.1),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: _buildAvatarImage(
                            isAuthenticated ? user?.avatar : null,
                            name,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Provider.of<LocaleProvider>(context).isBangla
                              ? 'স্বাগতম!'
                              : 'Welcome back!',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: isDark
                                ? AppColors.textSubDark
                                : AppColors.textSubLight,
                          ),
                        ),
                        Text(
                          Provider.of<LocaleProvider>(context).isBangla
                              ? 'হ্যালো, $name 👋'
                              : 'Hello, $name 👋',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: isDark
                                ? AppColors.textMainDark
                                : AppColors.textMainLight,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                // Notification Bell
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color:
                        isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: Stack(
                    children: [
                      Center(
                        child: Icon(
                          Icons.notifications_outlined,
                          color: isDark
                              ? AppColors.textMainDark
                              : AppColors.textMainLight,
                          size: 22,
                        ),
                      ),
                      Positioned(
                        right: 10,
                        top: 10,
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: AppColors.coralRed,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: isDark
                                  ? AppColors.surfaceDark
                                  : AppColors.surfaceLight,
                              width: 2,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),

            // Swipeable Hero Content
            SizedBox(
              height: 160,
              child: PageView.builder(
                controller: _heroPageController,
                onPageChanged: _onPageChanged,
                physics: const BouncingScrollPhysics(),
                itemCount: _heroSlides.length,
                itemBuilder: (context, index) {
                  final slide = _heroSlides[index];
                  return Row(
                    children: [
                      // Text content
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              slide.title1,
                              style: TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                height: 1.1,
                                color: isDark
                                    ? AppColors.textMainDark
                                    : AppColors.textMainLight,
                              ),
                            ),
                            Text(
                              slide.title2,
                              style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                height: 1.1,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              slide.subtitle,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: isDark
                                    ? AppColors.textSubDark
                                    : AppColors.textSubLight,
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Image
                      Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.15),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: slide.image.isNotEmpty
                              ? Image.network(
                                  slide.image,
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) {
                                    return Container(
                                      color: isDark
                                          ? AppColors.surfaceDark
                                          : AppColors.surfaceLight,
                                      child: const Icon(
                                        Icons.tv,
                                        size: 60,
                                        color: AppColors.primary,
                                      ),
                                    );
                                  },
                                )
                              : Container(
                                  color: isDark
                                      ? AppColors.surfaceDark
                                      : AppColors.surfaceLight,
                                  child: const Icon(
                                    Icons.tv,
                                    size: 60,
                                    color: AppColors.primary,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),

            // Carousel Indicators
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_heroSlides.length, (index) {
                final isActive = index == _currentHeroIndex;
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: isActive ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: isActive
                        ? AppColors.primary
                        : (isDark
                            ? AppColors.borderDark
                            : AppColors.borderLight),
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),

            const SizedBox(height: 20),

            // Search Bar
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(50),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 30,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: TextField(
                decoration: InputDecoration(
                  hintText: Provider.of<LocaleProvider>(context).isBangla
                      ? 'আপনার কি সাহায্য প্রয়োজন?'
                      : 'What do you need help with?',
                  hintStyle: TextStyle(
                    color: isDark
                        ? AppColors.textMutedDark
                        : AppColors.textMutedLight,
                    fontSize: 15,
                  ),
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(left: 16, right: 8),
                    child: Icon(
                      Icons.search,
                      color: AppColors.primary,
                      size: 24,
                    ),
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 16,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActions(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 0, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'দ্রুত অ্যাকশন'
                : 'Quick Actions',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 100,
            child: ListView(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              children: [
                _buildActionButton(
                  context,
                  isDark,
                  icon: Icons.add,
                  label: Provider.of<LocaleProvider>(context).isBangla
                      ? 'নতুন মেরামত'
                      : 'New Repair',
                  isHighlighted: true,
                  onTap: () => Navigator.pushNamed(context, '/repair-request'),
                ),
                _buildActionButton(
                  context,
                  isDark,
                  icon: Icons.person_outline,
                  label: Provider.of<LocaleProvider>(context).isBangla
                      ? 'ডাক্তার ভাই'
                      : 'Daktar Vai',
                  onTap: () => Navigator.pushNamed(context, '/chat'),
                ),
                _buildActionButton(
                  context,
                  isDark,
                  icon: Icons.map_outlined,
                  label: Provider.of<LocaleProvider>(context).isBangla
                      ? 'ট্র্যাক'
                      : 'Track',
                  onTap: () => AuthGuard.navigateWithAuth(
                    context,
                    '/history',
                    featureName: 'track your repairs',
                  ),
                ),
                _buildActionButton(
                  context,
                  isDark,
                  icon: Icons.storefront_outlined,
                  label: Provider.of<LocaleProvider>(context).isBangla
                      ? 'শপ'
                      : 'Shop',
                  onTap: () => Navigator.pushNamed(context, '/shop'),
                ),
                _buildActionButton(
                  context,
                  isDark,
                  icon: Icons.receipt_long_outlined,
                  label: Provider.of<LocaleProvider>(context).isBangla
                      ? 'অর্ডার'
                      : 'Orders',
                  onTap: () => AuthGuard.navigateWithAuth(
                    context,
                    '/order-history',
                    featureName: 'view your orders',
                  ),
                ),
                const SizedBox(width: 20),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(
    BuildContext context,
    bool isDark, {
    required IconData icon,
    required String label,
    bool isHighlighted = false,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.lightImpact();
          onTap?.call();
        },
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: isHighlighted
                    ? AppColors.primary
                    : (isDark ? AppColors.surfaceDark : AppColors.surfaceLight),
                borderRadius: BorderRadius.circular(20),
                border: isHighlighted
                    ? null
                    : Border.all(
                        color: isDark
                            ? AppColors.borderDark
                            : AppColors.borderLight,
                        width: 1,
                      ),
                boxShadow: isHighlighted
                    ? [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.3),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.04),
                          blurRadius: 8,
                        ),
                      ],
              ),
              child: Icon(
                icon,
                size: 28,
                color: isHighlighted
                    ? AppColors.textMainLight
                    : (isDark
                        ? AppColors.textMainDark
                        : AppColors.textMainLight),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isHighlighted ? FontWeight.w600 : FontWeight.w500,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveRepairSection(BuildContext context, bool isDark) {
    final authProvider = Provider.of<AuthProvider>(context);

    // Don't show if user is not logged in
    if (!authProvider.isAuthenticated) {
      return const SizedBox.shrink();
    }

    return Consumer<RepairProvider>(
      builder: (context, repairProvider, child) {
        final activeRepairs = repairProvider.activeRepairs;

        // Don't show if no active repairs
        if (activeRepairs.isEmpty) {
          return const SizedBox.shrink();
        }

        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'সক্রিয় মেরামত'
                    : 'Active Repairs',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color:
                      isDark ? AppColors.textMainDark : AppColors.textMainLight,
                ),
              ),
              const SizedBox(height: 16),
              // Show all active repairs
              ...activeRepairs.map((repair) => Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: _buildActiveRepairCard(context, isDark, repair),
                  )),
            ],
          ),
        );
      },
    );
  }

  Widget _buildActiveRepairCard(
      BuildContext context, bool isDark, Map<String, dynamic> repair) {
    // Extract data from repair
    final deviceName =
        '${repair['brand'] ?? 'TV'} ${repair['screenSize'] ?? ''}'.trim();
    final ticketNumber = repair['ticketNumber'] ?? 'N/A';
    final status = repair['trackingStatus'] ?? repair['status'] ?? 'Pending';
    final issue = repair['primaryIssue'] ?? repair['description'] ?? 'Repair';

    // Calculate progress based on status
    double progress = _getProgressFromStatus(status);
    String statusLabel = _getStatusLabel(status, context);
    Color statusColor = _getStatusColor(status);

    return GestureDetector(
      onTap: () {
        // Show the repair status popup
        RepairStatusPopup.show(context, repair);
      },
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Stack(
          children: [
            // Green accent line
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Container(
                width: 6,
                decoration: BoxDecoration(
                  color: statusColor,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(20),
                    bottomLeft: Radius.circular(20),
                  ),
                ),
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              deviceName.isNotEmpty ? deviceName : 'TV Repair',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: isDark
                                    ? AppColors.textMainDark
                                    : AppColors.textMainLight,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Ticket #$ticketNumber',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark
                                    ? AppColors.textSubDark
                                    : AppColors.textSubLight,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: statusColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          statusLabel,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: statusColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Progress Bar
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          issue,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: statusColor,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${(progress * 100).toInt()}%',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: isDark
                              ? AppColors.textSubDark
                              : AppColors.textSubLight,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 8,
                      backgroundColor:
                          isDark ? AppColors.borderDark : AppColors.borderLight,
                      valueColor: AlwaysStoppedAnimation<Color>(statusColor),
                    ),
                  ),

                  const SizedBox(height: 16),
                  Divider(
                    color:
                        isDark ? AppColors.borderDark : AppColors.borderLight,
                  ),
                  const SizedBox(height: 12),

                  // Footer
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      GestureDetector(
                        onTap: () {
                          Navigator.pushNamed(context, '/history');
                        },
                        child: Row(
                          children: [
                            Text(
                              Provider.of<LocaleProvider>(context).isBangla
                                  ? 'বিস্তারিত দেখুন'
                                  : 'View Details',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(width: 4),
                            const Icon(
                              Icons.arrow_forward,
                              size: 16,
                              color: AppColors.primary,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _getProgressFromStatus(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return 0.1;
      case 'received':
        return 0.2;
      case 'diagnosing':
        return 0.35;
      case 'waiting for parts':
      case 'waiting_parts':
        return 0.45;
      case 'repairing':
      case 'in repair':
        return 0.65;
      case 'testing':
        return 0.85;
      case 'completed':
        return 0.95;
      case 'delivered':
        return 1.0;
      default:
        return 0.1;
    }
  }

  String _getStatusLabel(String status, BuildContext context) {
    final isBangla =
        Provider.of<LocaleProvider>(context, listen: false).isBangla;
    switch (status.toLowerCase()) {
      case 'pending':
        return isBangla ? 'অপেক্ষমান' : 'Pending';
      case 'received':
        return isBangla ? 'গ্রহণ করা হয়েছে' : 'Received';
      case 'diagnosing':
        return isBangla ? 'পরীক্ষা করা হচ্ছে' : 'Diagnosing';
      case 'waiting for parts':
      case 'waiting_parts':
        return isBangla ? 'পার্টস অপেক্ষা' : 'Waiting Parts';
      case 'repairing':
      case 'in repair':
        return isBangla ? 'মেরামত চলছে' : 'Repairing';
      case 'testing':
        return isBangla ? 'টেস্ট করা হচ্ছে' : 'Testing';
      default:
        return isBangla ? 'চলছে' : 'In Progress';
    }
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'received':
        return Colors.blue;
      case 'diagnosing':
        return Colors.purple;
      case 'waiting for parts':
      case 'waiting_parts':
        return Colors.amber;
      case 'repairing':
      case 'in repair':
        return AppColors.primary;
      case 'testing':
        return Colors.teal;
      default:
        return AppColors.primary;
    }
  }

  Widget _buildHotDealsSection(BuildContext context, bool isDark) {
    return Consumer<HotDealsProvider>(
      builder: (context, hotDealsProvider, child) {
        // Show loading spinner while fetching
        if (hotDealsProvider.isLoading) {
          return const SizedBox(
            height: 200,
            child: Center(child: CircularProgressIndicator()),
          );
        }

        // Hide section if no hot deals
        if (hotDealsProvider.hotDeals.isEmpty) {
          return const SizedBox.shrink();
        }

        final deals = hotDealsProvider.hotDeals;

        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 32, 0, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    Provider.of<LocaleProvider>(context).isBangla
                        ? 'হট ডিলস 🔥'
                        : 'Hot Deals 🔥',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(right: 20),
                    child: GestureDetector(
                      onTap: () => Navigator.pushNamed(context, '/shop'),
                      child: Text(
                        Provider.of<LocaleProvider>(context).isBangla
                            ? 'সব দেখুন'
                            : 'See all',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 200,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  itemCount: deals.length,
                  itemBuilder: (context, index) {
                    final deal = deals[index];
                    final product = Product.fromJson(deal);
                    // Use product's parsed hot deal fields
                    final displayPrice = product.hotDealPrice ?? product.price;
                    final hasDiscount = product.hasDiscount;

                    return GestureDetector(
                      onTap: () {
                        showModalBottomSheet(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.transparent,
                          builder: (context) => ProductDetailsSheet(
                            product: product,
                            isFromHotDeal: true,
                          ),
                        );
                      },
                      child: Container(
                        width: 160,
                        margin: EdgeInsets.only(
                          right: index == deals.length - 1 ? 20 : 16,
                        ),
                        decoration: BoxDecoration(
                          color: isDark
                              ? AppColors.surfaceDark
                              : AppColors.surfaceLight,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isDark
                                ? AppColors.borderDark
                                : AppColors.cardBorderLight,
                            width: 1,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 8,
                            ),
                          ],
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Image with discount badge
                              Stack(
                                children: [
                                  Container(
                                    height: 100,
                                    width: double.infinity,
                                    decoration: BoxDecoration(
                                      color: isDark
                                          ? AppColors.backgroundDark
                                          : AppColors.backgroundLight,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: (product
                                                  .primaryImage?.isNotEmpty ??
                                              false)
                                          ? Image.network(
                                              product.primaryImage!,
                                              fit: BoxFit.cover,
                                              errorBuilder:
                                                  (context, error, stackTrace) {
                                                return const Icon(
                                                  Icons.memory,
                                                  size: 40,
                                                  color: AppColors.primary,
                                                );
                                              },
                                            )
                                          : const Icon(
                                              Icons.memory,
                                              size: 40,
                                              color: AppColors.primary,
                                            ),
                                    ),
                                  ),
                                  // Discount percentage badge
                                  if (product.discountPercent > 0)
                                    Positioned(
                                      top: 4,
                                      left: 4,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 6,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.red,
                                          borderRadius:
                                              BorderRadius.circular(8),
                                        ),
                                        child: Text(
                                          '-${product.discountPercent}%',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              // Name
                              Text(
                                product.name,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: isDark
                                      ? AppColors.textMainDark
                                      : AppColors.textMainLight,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const Spacer(),
                              // Price and Add button
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '৳${displayPrice.toStringAsFixed(0)}',
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: hasDiscount
                                              ? Colors.green
                                              : AppColors.primary,
                                        ),
                                      ),
                                      if (hasDiscount)
                                        Text(
                                          '৳${product.price.toStringAsFixed(0)}',
                                          style: TextStyle(
                                            fontSize: 11,
                                            decoration:
                                                TextDecoration.lineThrough,
                                            color: isDark
                                                ? AppColors.textMutedDark
                                                : AppColors.textMutedLight,
                                          ),
                                        ),
                                    ],
                                  ),
                                  // Add to cart button
                                  GestureDetector(
                                    onTap: () {
                                      context
                                          .read<CartProvider>()
                                          .addItemFromHotDeal(product);
                                      ScaffoldMessenger.of(context)
                                          .showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            Provider.of<LocaleProvider>(context,
                                                        listen: false)
                                                    .isBangla
                                                ? '${product.name} কার্টে যোগ করা হয়েছে'
                                                : '${product.name} added to cart',
                                          ),
                                          backgroundColor: AppColors.success,
                                          behavior: SnackBarBehavior.floating,
                                          duration: const Duration(seconds: 2),
                                        ),
                                      );
                                    },
                                    child: Container(
                                      width: 28,
                                      height: 28,
                                      decoration: const BoxDecoration(
                                        color: AppColors.primary,
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(
                                        Icons.add,
                                        size: 16,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
