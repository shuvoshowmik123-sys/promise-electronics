import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/customer_provider.dart';
import '../../providers/service_request_provider.dart';

class CreateServiceRequestScreen extends StatefulWidget {
  const CreateServiceRequestScreen({super.key});

  @override
  State<CreateServiceRequestScreen> createState() => _CreateServiceRequestScreenState();
}

class _CreateServiceRequestScreenState extends State<CreateServiceRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Controllers
  final _phoneController = TextEditingController();
  final _nameController = TextEditingController();
  final _brandController = TextEditingController();
  final _modelController = TextEditingController();
  final _issueController = TextEditingController();
  final _descController = TextEditingController();
  final _addressController = TextEditingController();

  bool _isSearching = false;
  bool _foundCustomer = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _nameController.dispose();
    _brandController.dispose();
    _modelController.dispose();
    _issueController.dispose();
    _descController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _searchCustomer(String phone) async {
    if (phone.length < 10) return;
    
    setState(() => _isSearching = true);
    final customer = await context.read<CustomerProvider>().searchByPhone(phone);
    
    if (mounted) {
      setState(() {
        _isSearching = false;
        if (customer != null) {
          _foundCustomer = true;
          _nameController.text = customer['name'] ?? '';
          _addressController.text = customer['address'] ?? '';
          ScaffoldMessenger.of(context).showSnackBar(
             SnackBar(content: Text('Customer Found: ${_nameController.text}')),
          );
        } else {
           _foundCustomer = false;
           // Don't clear name/address if user manually typed them, but here we assume search first
        }
      });
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final data = {
      'customerName': _nameController.text,
      'phone': _phoneController.text,
      'address': _addressController.text,
      'brand': _brandController.text,
      'modelNumber': _modelController.text,
      'primaryIssue': _issueController.text,
      'description': _descController.text,
      'status': 'Pending',
      'trackingStatus': 'Request Received',
    };

    final success = await context.read<ServiceRequestProvider>().createRequest(data);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Ticket created successfully!')),
        );
        Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to create ticket'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New Service Ticket')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("Customer Information", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              
              // Phone Search
              TextFormField(
                controller: _phoneController,
                decoration: InputDecoration(
                  labelText: 'Phone Number',
                  border: const OutlineInputBorder(),
                  suffixIcon: _isSearching 
                    ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2))
                    : IconButton(
                        icon: const Icon(Icons.search),
                        onPressed: () => _searchCustomer(_phoneController.text),
                      ),
                ),
                keyboardType: TextInputType.phone,
                onFieldSubmitted: _searchCustomer,
                validator: (val) => val == null || val.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Customer Name', border: OutlineInputBorder()),
                validator: (val) => val == null || val.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              
              TextFormField(
                controller: _addressController,
                decoration: const InputDecoration(labelText: 'Address', border: OutlineInputBorder()),
                maxLines: 2,
              ),
              
              const SizedBox(height: 24),
              const Text("Device Details", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _brandController,
                      decoration: const InputDecoration(labelText: 'Brand', border: OutlineInputBorder()),
                      validator: (val) => val == null || val.isEmpty ? 'Required' : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _modelController,
                      decoration: const InputDecoration(labelText: 'Model (Optional)', border: OutlineInputBorder()),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              TextFormField(
                controller: _issueController,
                decoration: const InputDecoration(labelText: 'Primary Issue', border: OutlineInputBorder()),
                validator: (val) => val == null || val.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              
              TextFormField(
                controller: _descController,
                decoration: const InputDecoration(labelText: 'Detailed Description', border: OutlineInputBorder()),
                maxLines: 3,
              ),
              
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: Consumer<ServiceRequestProvider>(
                  builder: (context, provider, _) {
                    return ElevatedButton(
                      onPressed: provider.isLoading ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue.shade700,
                        foregroundColor: Colors.white,
                      ),
                      child: provider.isLoading 
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text('Create Ticket', style: TextStyle(fontSize: 18)),
                    );
                  }
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
