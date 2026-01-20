import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/challan_provider.dart';

class CreateChallanScreen extends StatefulWidget {
  const CreateChallanScreen({super.key});

  @override
  State<CreateChallanScreen> createState() => _CreateChallanScreenState();
}

class _CreateChallanScreenState extends State<CreateChallanScreen> {
  final _formKey = GlobalKey<FormState>();
  final _receiverController = TextEditingController();
  final _itemsController = TextEditingController();
  String _type = 'Delivery';

  final List<String> _types = ['Delivery', 'Return', 'Transfer'];

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final data = {
      'receiverName': _receiverController.text,
      'items': _itemsController.text, // Simple string for now, could be dynamic list
      'type': _type,
      'status': 'Pending',
      'date': DateTime.now().toIso8601String(),
    };

    final success = await context.read<ChallanProvider>().createChallan(data);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Challan created successfully!')),
        );
        Navigator.pop(context);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to create challan'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Challan')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _receiverController,
                decoration: const InputDecoration(labelText: 'Receiver / Client Name', border: OutlineInputBorder()),
                validator: (v) => v!.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 16),
              
              DropdownButtonFormField<String>(
                value: _type,
                decoration: const InputDecoration(labelText: 'Challan Type', border: OutlineInputBorder()),
                items: _types.map((t) => DropdownMenuItem(value: t, child: Text(t))).toList(),
                onChanged: (v) => setState(() => _type = v!),
              ),
              const SizedBox(height: 16),

              TextFormField(
                controller: _itemsController,
                decoration: const InputDecoration(
                  labelText: 'Items (Description)', 
                  border: OutlineInputBorder(),
                  hintText: 'e.g. 5x Samsung Display, 2x Glue',
                ),
                maxLines: 4,
                validator: (v) => v!.isEmpty ? 'Required' : null,
              ),
              
              const SizedBox(height: 32),
              
              Consumer<ChallanProvider>(
                builder: (context, provider, _) {
                  return ElevatedButton(
                    onPressed: provider.isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: provider.isLoading 
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Generate Challan', style: TextStyle(fontSize: 18)),
                  );
                }
              ),
            ],
          ),
        ),
      ),
    );
  }
}
