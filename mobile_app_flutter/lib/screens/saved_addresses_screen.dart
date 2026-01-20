import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/address_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/auth_provider.dart';

/// Saved Addresses Screen
/// Allows users to view, add, edit, and delete their saved addresses
class SavedAddressesScreen extends StatefulWidget {
  const SavedAddressesScreen({super.key});

  @override
  State<SavedAddressesScreen> createState() => _SavedAddressesScreenState();
}

class _SavedAddressesScreenState extends State<SavedAddressesScreen> {
  @override
  void initState() {
    super.initState();
    // Fetch addresses when screen loads
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      if (authProvider.isAuthenticated) {
        context.read<AddressProvider>().fetchAddresses();
      }
    });
  }

  void _showAddEditDialog({Address? address}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla =
        Provider.of<LocaleProvider>(context, listen: false).isBangla;

    final labelController = TextEditingController(text: address?.label ?? '');
    final addressController =
        TextEditingController(text: address?.address ?? '');
    bool isDefault = address?.isDefault ?? false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) {
          return Container(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            decoration: BoxDecoration(
              color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Handle bar
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppColors.borderDark
                            : AppColors.borderLight,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),

                  // Title
                  Text(
                    address != null
                        ? (isBangla ? 'ঠিকানা সম্পাদনা' : 'Edit Address')
                        : (isBangla ? 'নতুন ঠিকানা' : 'Add New Address'),
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Label field
                  Text(
                    isBangla
                        ? 'লেবেল (যেমন: বাড়ি, অফিস)'
                        : 'Label (e.g., Home, Office)',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? AppColors.textSubDark
                          : AppColors.textSubLight,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: labelController,
                    decoration: InputDecoration(
                      hintText: isBangla ? 'বাড়ি' : 'Home',
                      hintStyle: TextStyle(
                        color: (isDark
                                ? AppColors.textSubDark
                                : AppColors.textSubLight)
                            .withOpacity(0.5),
                      ),
                      filled: true,
                      fillColor: isDark
                          ? AppColors.backgroundDark
                          : AppColors.backgroundLight,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                    ),
                    style: TextStyle(
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Address field
                  Text(
                    isBangla ? 'সম্পূর্ণ ঠিকানা' : 'Full Address',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? AppColors.textSubDark
                          : AppColors.textSubLight,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: addressController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: isBangla
                          ? 'বাড়ি #১২৩, রোড #৪, ব্লক বি...'
                          : 'House #123, Road #4, Block B...',
                      hintStyle: TextStyle(
                        color: (isDark
                                ? AppColors.textSubDark
                                : AppColors.textSubLight)
                            .withOpacity(0.5),
                      ),
                      filled: true,
                      fillColor: isDark
                          ? AppColors.backgroundDark
                          : AppColors.backgroundLight,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(
                          color: isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppColors.primary,
                          width: 2,
                        ),
                      ),
                    ),
                    style: TextStyle(
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Default checkbox
                  InkWell(
                    onTap: () {
                      setModalState(() {
                        isDefault = !isDefault;
                      });
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(
                        children: [
                          Container(
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: isDefault
                                  ? AppColors.primary
                                  : Colors.transparent,
                              border: Border.all(
                                color: isDefault
                                    ? AppColors.primary
                                    : (isDark
                                        ? AppColors.borderDark
                                        : AppColors.borderLight),
                                width: 2,
                              ),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: isDefault
                                ? const Icon(
                                    Icons.check,
                                    size: 16,
                                    color: Colors.white,
                                  )
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Text(
                            isBangla
                                ? 'ডিফল্ট ঠিকানা হিসেবে সেট করুন'
                                : 'Set as default address',
                            style: TextStyle(
                              fontSize: 14,
                              color: isDark
                                  ? AppColors.textMainDark
                                  : AppColors.textMainLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Save button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        final label = labelController.text.trim();
                        final addressText = addressController.text.trim();

                        if (label.isEmpty || addressText.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(isBangla
                                  ? 'সব ক্ষেত্র পূরণ করুন'
                                  : 'Please fill in all fields'),
                              backgroundColor: Colors.red,
                            ),
                          );
                          return;
                        }

                        final addressProvider = context.read<AddressProvider>();
                        bool success;

                        if (address != null) {
                          success = await addressProvider.updateAddress(
                            id: address.id,
                            label: label,
                            address: addressText,
                            isDefault: isDefault,
                          );
                        } else {
                          success = await addressProvider.createAddress(
                            label: label,
                            address: addressText,
                            isDefault: isDefault,
                          );
                        }

                        if (!context.mounted) return;

                        if (success) {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(address != null
                                  ? (isBangla
                                      ? 'ঠিকানা আপডেট হয়েছে'
                                      : 'Address updated')
                                  : (isBangla
                                      ? 'ঠিকানা যোগ হয়েছে'
                                      : 'Address added')),
                              backgroundColor: AppColors.success,
                            ),
                          );
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(isBangla
                                  ? 'ত্রুটি হয়েছে। আবার চেষ্টা করুন।'
                                  : 'An error occurred. Please try again.'),
                              backgroundColor: Colors.red,
                            ),
                          );
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        address != null
                            ? (isBangla ? 'আপডেট করুন' : 'Update Address')
                            : (isBangla ? 'সংরক্ষণ করুন' : 'Save Address'),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),

                  SizedBox(height: MediaQuery.of(context).padding.bottom),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _confirmDelete(Address address) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla =
        Provider.of<LocaleProvider>(context, listen: false).isBangla;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          isBangla ? 'ঠিকানা মুছুন?' : 'Delete Address?',
          style: TextStyle(
            color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          ),
        ),
        content: Text(
          isBangla
              ? 'আপনি কি এই ঠিকানা মুছে ফেলতে চান?'
              : 'Are you sure you want to delete this address?',
          style: TextStyle(
            color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              isBangla ? 'বাতিল' : 'Cancel',
              style: TextStyle(
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              final success = await context
                  .read<AddressProvider>()
                  .deleteAddress(address.id);
              if (!context.mounted) return;
              if (success) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(isBangla
                        ? 'ঠিকানা মুছে ফেলা হয়েছে'
                        : 'Address deleted'),
                    backgroundColor: AppColors.success,
                  ),
                );
              }
            },
            child: Text(
              isBangla ? 'মুছুন' : 'Delete',
              style: const TextStyle(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        backgroundColor:
            isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        elevation: 0,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back,
            color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          isBangla ? 'সংরক্ষিত ঠিকানা' : 'Saved Addresses',
          style: TextStyle(
            color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: Consumer<AddressProvider>(
        builder: (context, addressProvider, child) {
          if (addressProvider.isLoading) {
            return const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
              ),
            );
          }

          if (addressProvider.addresses.isEmpty) {
            return _buildEmptyState(isDark, isBangla);
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount:
                addressProvider.addresses.length + 1, // +1 for add button
            itemBuilder: (context, index) {
              if (index == addressProvider.addresses.length) {
                return _buildAddButton(isDark, isBangla);
              }
              return _buildAddressCard(
                  addressProvider.addresses[index], isDark, isBangla);
            },
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(bool isDark, bool isBangla) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.location_off_outlined,
            size: 64,
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
          const SizedBox(height: 16),
          Text(
            isBangla ? 'কোনো ঠিকানা নেই' : 'No addresses found',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            isBangla
                ? 'চেকআউট দ্রুত করতে একটি ঠিকানা যোগ করুন'
                : 'Add an address to speed up checkout',
            style: TextStyle(
              fontSize: 14,
              color:
                  isDark ? AppColors.textMutedDark : AppColors.textMutedLight,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: () => _showAddEditDialog(),
            icon: const Icon(Icons.add),
            label: Text(isBangla ? 'ঠিকানা যোগ করুন' : 'Add Address'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddressCard(Address address, bool isDark, bool isBangla) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppColors.borderDark : AppColors.borderLight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Label
              Text(
                address.label,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color:
                      isDark ? AppColors.textMainDark : AppColors.textMainLight,
                ),
              ),
              const SizedBox(width: 8),
              // Default badge
              if (address.isDefault)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    isBangla ? 'ডিফল্ট' : 'Default',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              const Spacer(),
              // Edit button
              IconButton(
                onPressed: () => _showAddEditDialog(address: address),
                icon: Icon(
                  Icons.edit_outlined,
                  size: 20,
                  color:
                      isDark ? AppColors.textSubDark : AppColors.textSubLight,
                ),
                style: IconButton.styleFrom(
                  backgroundColor: isDark
                      ? AppColors.backgroundDark
                      : AppColors.backgroundLight,
                ),
              ),
              const SizedBox(width: 4),
              // Delete button
              IconButton(
                onPressed: () => _confirmDelete(address),
                icon: const Icon(
                  Icons.delete_outline,
                  size: 20,
                  color: Colors.red,
                ),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.red.withOpacity(0.1),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Address text
          Text(
            address.address,
            style: TextStyle(
              fontSize: 14,
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddButton(bool isDark, bool isBangla) {
    return InkWell(
      onTap: () => _showAddEditDialog(),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 24),
        decoration: BoxDecoration(
          border: Border.all(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
            width: 2,
            style: BorderStyle.solid,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.add,
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
            ),
            const SizedBox(width: 8),
            Text(
              isBangla ? 'নতুন ঠিকানা যোগ করুন' : 'Add New Address',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
