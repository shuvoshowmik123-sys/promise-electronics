import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../../providers/job_provider.dart';
import '../../data/models/job_ticket_model.dart';
import '../widgets/jobs/job_detail_sheet.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  bool _isScanned = false;
  final MobileScannerController controller = MobileScannerController();

  void _onDetect(BarcodeCapture capture) {
    if (_isScanned) return;
    
    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      if (barcode.rawValue != null) {
        _handleScan(barcode.rawValue!);
        break; 
      }
    }
  }

  void _handleScan(String code) async {
    setState(() {
      _isScanned = true;
    });

    // Validate logic: Check if job exists in provider
    final jobProvider = context.read<JobProvider>();
    JobTicketModel? job;
    
    try {
        // Search by ID or Ticket Number
        job = jobProvider.jobs.firstWhere((j) => j.id == code || j.ticketNumber == code);
    } catch (e) {
        job = null;
    }

    if (job != null) {
      // Valid! Show details
      if (mounted) {
         await showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (context) => JobDetailSheet(job: job!),
         );
         
         // Resume scanning after sheet closes
         if (mounted) {
            setState(() {
                _isScanned = false;
            });
         }
      }
    } else {
      // Invalid or Not Found
      if (mounted) {
        _showErrorDialog(code);
      }
    }
  }

  void _showErrorDialog(String code) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Invalid QR Code'),
        content: Text('The scanned code "$code" was not found in the loaded jobs.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context); // Close dialog
              setState(() {
                _isScanned = false; // Reset scan state to allow try again
              });
            },
            child: const Text('Try Again'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context); // Close dialog
              Navigator.pop(context); // Close scanner
            },
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan QR Code')),
      body: MobileScanner(
        controller: controller,
        onDetect: _onDetect,
        errorBuilder: (context, error, child) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text(
                  'Scanner Error: ${error.errorCode}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                if (error.errorDetails?.message != null)
                  Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: Text(error.errorDetails!.message!),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
  
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }
}
