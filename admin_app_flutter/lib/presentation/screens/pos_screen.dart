import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart'; // Optional: Use standard fonts if package not available, but user wanted "Beautiful"
import '../../providers/inventory_provider.dart';
import '../../providers/pos_provider.dart';
import '../../providers/customer_provider.dart'; // Ensure this is available

class POSScreen extends StatefulWidget {
  const POSScreen({super.key});

  @override
  State<POSScreen> createState() => _POSScreenState();
}

class _POSScreenState extends State<POSScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<InventoryProvider>().fetchProducts();
      // context.read<CustomerProvider>().fetchCustomers(); // If available
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade100,
      body: LayoutBuilder(
        builder: (context, constraints) {
          if (constraints.maxWidth > 900) {
            return const _DesktopPosLayout();
          } else {
            return const _MobilePosLayout();
          }
        },
      ),
    );
  }
}

// ==========================================
// Desktop / Tablet Layout (Split View)
// ==========================================
class _DesktopPosLayout extends StatelessWidget {
  const _DesktopPosLayout();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Left: Product Catalog
        Expanded(
          flex: 7,
          child: _ProductCatalogSection(),
        ),
        // Right: Cart Panel
        Container(
          width: 1,
          color: Colors.grey.shade300,
        ),
        Expanded(
          flex: 4,
          child: _CartSection(),
        ),
      ],
    );
  }
}

// ==========================================
// Mobile Layout
// ==========================================
class _MobilePosLayout extends StatelessWidget {
  const _MobilePosLayout();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _ProductCatalogSection(isMobile: true),
      endDrawer: Drawer(
        width: MediaQuery.of(context).size.width * 0.85,
        child: _CartSection(isMobile: true),
      ),
      floatingActionButton: Consumer<POSProvider>(
        builder: (context, pos, child) {
          if (pos.cart.isEmpty) return const SizedBox.shrink();
          return FloatingActionButton.extended(
            onPressed: () {
              Scaffold.of(context).openEndDrawer();
            },
            label: Text('${pos.cart.length} Items'),
            icon: const Icon(Icons.shopping_cart),
            backgroundColor: Colors.blue.shade700,
          );
        },
      ),
    );
  }
}

// ==========================================
// Product Catalog Section
// ==========================================
class _ProductCatalogSection extends StatefulWidget {
  final bool isMobile;
  const _ProductCatalogSection({this.isMobile = false});

  @override
  State<_ProductCatalogSection> createState() => _ProductCatalogSectionState();
}

class _ProductCatalogSectionState extends State<_ProductCatalogSection> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  String _selectedCategory = 'All';

  @override
  Widget build(BuildContext context) {
    return Consumer<InventoryProvider>(
      builder: (context, inventory, child) {
        if (inventory.isLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        // 1. Data Processing
        final allProducts = inventory.products;
        
        // Extract Categories
        final categories = ['All', ...allProducts.map((p) => (p['category'] ?? 'Other').toString()).toSet().toList()];

        // Filter Products
        final filteredProducts = allProducts.where((p) {
          final name = (p['name'] ?? '').toString().toLowerCase();
          final category = (p['category'] ?? 'Other').toString();
          final matchesSearch = name.contains(_searchQuery);
          final matchesCategory = _selectedCategory == 'All' || category == _selectedCategory;
          return matchesSearch && matchesCategory;
        }).toList();

        return Column(
          children: [
            // Header: Search & Categories
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                   if (!widget.isMobile)
                    Text('Product Catalog', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                   if (!widget.isMobile)
                    const SizedBox(height: 16),
                  
                  // Search Bar
                  TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchQuery = val.toLowerCase()),
                    decoration: InputDecoration(
                      hintText: 'Search products...',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                      filled: true,
                      fillColor: Colors.grey.shade100,
                      contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
                    ),
                  ),
                  const SizedBox(height: 12),
                  
                  // Category Chips
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: categories.map((cat) {
                        final isSelected = _selectedCategory == cat;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(cat),
                            selected: isSelected,
                            onSelected: (selected) {
                              if (selected) setState(() => _selectedCategory = cat);
                            },
                            selectedColor: Colors.blue.shade100,
                            labelStyle: TextStyle(
                              color: isSelected ? Colors.blue.shade900 : Colors.grey.shade700,
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],
              ),
            ),
            
            // Grid
            Expanded(
              child: filteredProducts.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: Colors.grey.shade300),
                          const SizedBox(height: 16),
                          Text('No products found', style: TextStyle(color: Colors.grey.shade500)),
                        ],
                      ),
                    )
                  : GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: widget.isMobile ? 2 : 4, // More items on desktop
                        childAspectRatio: 0.8,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      itemCount: filteredProducts.length,
                      itemBuilder: (context, index) {
                        final product = filteredProducts[index];
                        return _ProductCard(product: product);
                      },
                    ),
            ),
          ],
        );
      },
    );
  }
}

// ==========================================
// Product Card
// ==========================================
class _ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;

  const _ProductCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final name = product['name'] ?? 'Unknown';
    final price = product['price']?.toString() ?? '0';
    final stock = int.tryParse(product['stock']?.toString() ?? '0') ?? 0;
    final isOutOfStock = stock <= 0;

    return Consumer<POSProvider>(
      builder: (context, pos, _) {
        // Check if in cart
        final cartItem = pos.cart.firstWhere(
          (item) => item.product['id'] == product['id'], 
          orElse: () => CartItem(product: product, quantity: 0),
        );
        final qty = cartItem.quantity;

        return Card(
          elevation: 2,
          shadowColor: Colors.black.withOpacity(0.1),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: InkWell(
            onTap: isOutOfStock ? null : () => context.read<POSProvider>().addToCart(product),
            borderRadius: BorderRadius.circular(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Image Placeholder
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: isOutOfStock ? Colors.grey.shade200 : Colors.blue.shade50,
                      borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                    ),
                    child: Stack(
                      children: [
                        Center(
                          child: Icon(
                            isOutOfStock ? Icons.production_quantity_limits : Icons.inventory_2_outlined,
                            size: 40,
                            color: isOutOfStock ? Colors.grey : Colors.blue.shade300,
                          ),
                        ),
                        if (qty > 0)
                          Positioned(
                            top: 8,
                            right: 8,
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: const BoxDecoration(
                                color: Colors.blue,
                                shape: BoxShape.circle,
                              ),
                              child: Text(
                                '$qty',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                
                // Info
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '৳ $price',
                            style: TextStyle(color: Colors.blue.shade800, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            isOutOfStock ? 'Out' : '$stock left',
                            style: TextStyle(
                              fontSize: 10,
                              color: isOutOfStock ? Colors.red : Colors.green,
                              fontWeight: FontWeight.w500,
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
    );
  }
}

// ==========================================
// Cart Section
// ==========================================
class _CartSection extends StatefulWidget {
  final bool isMobile;
  const _CartSection({this.isMobile = false});

  @override
  State<_CartSection> createState() => _CartSectionState();
}

class _CartSectionState extends State<_CartSection> {
  String _paymentMethod = 'Cash';

  @override
  Widget build(BuildContext context) {
    return Consumer<POSProvider>(
      builder: (context, pos, _) {
        return Container(
          color: Colors.white,
          child: Column(
            children: [
              // Header
              Container(
                padding: EdgeInsets.only(top: widget.isMobile ? 24 : 16, bottom: 16, left: 16, right: 16),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.shopping_cart_checkout, color: Colors.blue),
                    const SizedBox(width: 12),
                    const Text('Current Order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const Spacer(),
                    if (pos.cart.isNotEmpty)
                      IconButton(
                        onPressed: () => pos.clearCart(),
                        icon: const Icon(Icons.delete_outline, color: Colors.red),
                        tooltip: 'Clear Cart',
                      ),
                  ],
                ),
              ),

              // Customer Select (Placeholder for now)
              // Padding(
              //   padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              //   child: DropdownButtonFormField(
              //     decoration: const InputDecoration(
              //       labelText: 'Select Customer',
              //       border: OutlineInputBorder(),
              //       contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              //     ),
              //     items: const [], // TODO: Link with CustomerProvider
              //     onChanged: (val) {},
              //   ),
              // ),

              // Cart Items
              Expanded(
                child: pos.cart.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.shopping_basket_outlined, size: 64, color: Colors.grey.shade200),
                            const SizedBox(height: 16),
                            Text('Cart is empty', style: TextStyle(color: Colors.grey.shade400)),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: pos.cart.length,
                        separatorBuilder: (_, __) => const Divider(),
                        itemBuilder: (context, index) {
                          final item = pos.cart[index];
                          final name = item.product['name'] ?? 'Unknown';
                          final price = item.price;
                          
                          return Row(
                            children: [
                              // Quantity Controls
                              Container(
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.grey.shade300),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Column(
                                  children: [
                                    InkWell(
                                      onTap: () => pos.addToCart(item.product),
                                      child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.add, size: 16)),
                                    ),
                                    Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                    InkWell(
                                      onTap: () => pos.removeFromCart(item.product),
                                      child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.remove, size: 16)),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 16),
                              // Info
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                                    Text('৳ $price x ${item.quantity}', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                                  ],
                                ),
                              ),
                              // Total
                              Text(
                                '৳ ${item.total.toStringAsFixed(0)}',
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                            ],
                          );
                        },
                      ),
              ),

              // Summary Section
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.grey.shade50,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -4)),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Subtotal'),
                        Text('৳ ${pos.totalAmount.toStringAsFixed(0)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Discount'),
                        Text('৳ 0', style: TextStyle(color: Colors.grey.shade600)),
                      ],
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('TOTAL', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                        Text(
                          '৳ ${pos.totalAmount.toStringAsFixed(0)}',
                          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.blue.shade700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    
                    // Payment Method (Simple Row)
                    Row(
                      children: [
                        Expanded(child: _PaymentChip(label: 'Cash', isSelected: _paymentMethod == 'Cash', onTap: () => setState(() => _paymentMethod = 'Cash'))),
                        const SizedBox(width: 8),
                        Expanded(child: _PaymentChip(label: 'Card', isSelected: _paymentMethod == 'Card', onTap: () => setState(() => _paymentMethod = 'Card'))),
                        const SizedBox(width: 8),
                        Expanded(child: _PaymentChip(label: 'Due', isSelected: _paymentMethod == 'Due', onTap: () => setState(() => _paymentMethod = 'Due'))),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Process Button
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton(
                        onPressed: pos.cart.isEmpty || pos.isLoading 
                            ? null 
                            : () => _processPayment(context, pos, _paymentMethod),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue.shade700,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                        ),
                        child: pos.isLoading 
                            ? const CircularProgressIndicator(color: Colors.white)
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  Icon(Icons.check_circle_outline),
                                  SizedBox(width: 8),
                                  Text('Complete Sale', style: TextStyle(fontSize: 18, color: Colors.white)),
                                ],
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _processPayment(BuildContext context, POSProvider pos, String method) async {
    final success = await pos.submitTransaction(
      paymentMethod: method,
      discount: 0,
      // customerId: selectedCustomerId // TODO
    );

    if (context.mounted) {
      if (success) {
        if (widget.isMobile) Navigator.pop(context); // Close drawer
        _showSuccessDialog(context);
        context.read<InventoryProvider>().fetchProducts();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Transaction Failed'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showSuccessDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.green.shade50, shape: BoxShape.circle),
              child: const Icon(Icons.check, color: Colors.green, size: 48),
            ),
            const SizedBox(height: 24),
            const Text('Payment Successful!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Transaction has been recorded.', style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.grey.shade900,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Close'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _PaymentChip({required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? Colors.blue.shade50 : Colors.white,
          border: Border.all(color: isSelected ? Colors.blue : Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.blue.shade700 : Colors.grey.shade700,
            ),
          ),
        ),
      ),
    );
  }
}
