import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../providers/shuvo_mode_provider.dart';
import '../providers/repair_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/app_settings_provider.dart';
import '../services/diagnostic_service.dart';

/// Shuvo Mode Screen - Developer Diagnostic Dashboard
///
/// A terminal-style interface for:
/// - Running comprehensive app diagnostics
/// - Viewing diagnostic results with pass/fail indicators
/// - Submitting test requests with one click
/// - Getting AI-powered suggestions for issues
class ShuvoModeScreen extends StatefulWidget {
  const ShuvoModeScreen({super.key});

  @override
  State<ShuvoModeScreen> createState() => _ShuvoModeScreenState();
}

class _ShuvoModeScreenState extends State<ShuvoModeScreen> {
  final DiagnosticService _diagnosticService = DiagnosticService();
  String _statusMessage = 'Ready for diagnostics';
  Map<String, String> _deviceInfo = {};
  bool _isLoadingDeviceInfo = false;
  bool _isSubmittingTest = false;

  @override
  void initState() {
    super.initState();
    _loadDeviceInfo();
  }

  Future<void> _loadDeviceInfo() async {
    setState(() => _isLoadingDeviceInfo = true);
    try {
      _deviceInfo = await _diagnosticService.getDeviceInfo();
    } catch (e) {
      _deviceInfo = {'Error': e.toString()};
    }
    setState(() => _isLoadingDeviceInfo = false);
  }

  Future<void> _runDiagnostics() async {
    final provider = context.read<ShuvoModeProvider>();

    await _diagnosticService.runAllDiagnostics(
      provider: provider,
      onProgress: (message) {
        setState(() => _statusMessage = message);
      },
    );

    // Generate and show report
    final report = provider.generateReport();
    debugPrint(report);

    setState(() => _statusMessage = 'Diagnostics complete!');
  }

  Future<void> _submitTestRequest() async {
    setState(() => _isSubmittingTest = true);

    try {
      final shuvoProvider = context.read<ShuvoModeProvider>();
      final repairProvider = context.read<RepairProvider>();

      final testData = shuvoProvider.getTestRequestData();
      final success = await repairProvider.submitRequest(testData);

      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Test request submitted successfully!'),
            backgroundColor: Colors.green,
          ),
        );
        setState(() => _statusMessage = 'Test request submitted!');
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:
                Text('❌ Failed: ${repairProvider.error ?? "Unknown error"}'),
            backgroundColor: Colors.red,
          ),
        );
        setState(() => _statusMessage = 'Test request failed');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() => _isSubmittingTest = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D1117), // GitHub dark theme
      appBar: AppBar(
        backgroundColor: const Color(0xFF161B22),
        title: Row(
          children: [
            const Text(
              'SHUVO MODE',
              style: TextStyle(
                fontFamily: 'monospace',
                fontWeight: FontWeight.bold,
                color: Color(0xFF58A6FF),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF238636),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'ACTIVE',
                style: TextStyle(
                  fontSize: 10,
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          // Deactivate button
          TextButton.icon(
            onPressed: () {
              context.read<ShuvoModeProvider>().setEnabled(false);
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('🔒 Shuvo Mode Deactivated'),
                  backgroundColor: Colors.orange,
                ),
              );
            },
            icon: const Icon(Icons.power_settings_new,
                color: Colors.red, size: 18),
            label: const Text('EXIT',
                style: TextStyle(color: Colors.red, fontFamily: 'monospace')),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Status Banner
            _buildStatusBanner(),
            const SizedBox(height: 16),

            // Quick Actions
            _buildSectionTitle('⚡ QUICK ACTIONS'),
            const SizedBox(height: 8),
            _buildQuickActions(),
            const SizedBox(height: 24),

            // Diagnostics
            _buildSectionTitle('🔬 DIAGNOSTICS'),
            const SizedBox(height: 8),
            _buildDiagnosticsPanel(),
            const SizedBox(height: 24),

            // Suggestions
            Consumer<ShuvoModeProvider>(
              builder: (context, provider, _) {
                if (provider.suggestions.isEmpty) {
                  return const SizedBox.shrink();
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildSectionTitle('💡 SUGGESTIONS'),
                    const SizedBox(height: 8),
                    _buildSuggestionsPanel(provider.suggestions),
                    const SizedBox(height: 24),
                  ],
                );
              },
            ),

            // Device Info
            _buildSectionTitle('📱 DEVICE INFO'),
            const SizedBox(height: 8),
            _buildDeviceInfoPanel(),
            const SizedBox(height: 24),

            // App State
            _buildSectionTitle('🔧 APP STATE'),
            const SizedBox(height: 8),
            _buildAppStatePanel(),
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBanner() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF30363D)),
      ),
      child: Row(
        children: [
          Consumer<ShuvoModeProvider>(
            builder: (context, provider, _) {
              if (provider.isRunningDiagnostics) {
                return const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(Color(0xFF58A6FF)),
                  ),
                );
              }
              return const Icon(Icons.terminal,
                  color: Color(0xFF58A6FF), size: 18);
            },
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _statusMessage,
              style: const TextStyle(
                fontFamily: 'monospace',
                color: Color(0xFF8B949E),
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontFamily: 'monospace',
        fontWeight: FontWeight.bold,
        color: Color(0xFFC9D1D9),
        fontSize: 14,
        letterSpacing: 1,
      ),
    );
  }

  Widget _buildQuickActions() {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        // Run Diagnostics
        _buildActionButton(
          icon: Icons.play_arrow,
          label: 'RUN DIAGNOSTICS',
          color: const Color(0xFF238636),
          onTap: _runDiagnostics,
          isLoading: context.watch<ShuvoModeProvider>().isRunningDiagnostics,
        ),

        // Submit Test Request
        _buildActionButton(
          icon: Icons.send,
          label: 'TEST REQUEST',
          color: const Color(0xFF58A6FF),
          onTap: _submitTestRequest,
          isLoading: _isSubmittingTest,
        ),

        // Copy Report
        Consumer<ShuvoModeProvider>(
          builder: (context, provider, _) {
            return _buildActionButton(
              icon: Icons.copy,
              label: 'COPY REPORT',
              color: const Color(0xFF8B949E),
              onTap: provider.lastDiagnosticReport != null
                  ? () {
                      Clipboard.setData(
                          ClipboardData(text: provider.lastDiagnosticReport!));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('📋 Report copied to clipboard!')),
                      );
                    }
                  : null,
            );
          },
        ),

        // Clear
        _buildActionButton(
          icon: Icons.clear_all,
          label: 'CLEAR',
          color: const Color(0xFFF85149),
          onTap: () {
            context.read<ShuvoModeProvider>().clearDiagnostics();
            setState(() => _statusMessage = 'Ready for diagnostics');
          },
        ),
      ],
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required Color color,
    VoidCallback? onTap,
    bool isLoading = false,
  }) {
    return InkWell(
      onTap: isLoading ? null : onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(onTap == null ? 0.1 : 0.2),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
              color: color.withOpacity(onTap == null ? 0.2 : 0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isLoading)
              SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                    strokeWidth: 2, valueColor: AlwaysStoppedAnimation(color)),
              )
            else
              Icon(icon,
                  size: 14,
                  color: color.withOpacity(onTap == null ? 0.4 : 1)),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: color.withOpacity(onTap == null ? 0.4 : 1),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDiagnosticsPanel() {
    return Consumer<ShuvoModeProvider>(
      builder: (context, provider, _) {
        if (provider.diagnostics.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF161B22),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFF30363D)),
            ),
            child: const Center(
              child: Text(
                'Click "RUN DIAGNOSTICS" to start',
                style: TextStyle(
                  fontFamily: 'monospace',
                  color: Color(0xFF8B949E),
                  fontSize: 13,
                ),
              ),
            ),
          );
        }

        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF161B22),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF30363D)),
          ),
          child: Column(
            children: provider.diagnostics.map((diagnostic) {
              return _buildDiagnosticItem(diagnostic);
            }).toList(),
          ),
        );
      },
    );
  }

  Widget _buildDiagnosticItem(DiagnosticResult diagnostic) {
    final statusColor =
        diagnostic.passed ? const Color(0xFF238636) : const Color(0xFFF85149);
    final statusIcon = diagnostic.passed ? Icons.check_circle : Icons.error;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Color(0xFF30363D), width: 1),
        ),
      ),
      child: Row(
        children: [
          Icon(statusIcon, size: 18, color: statusColor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  diagnostic.name,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFC9D1D9),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  diagnostic.description,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    color: Color(0xFF8B949E),
                    fontSize: 11,
                  ),
                ),
                if (diagnostic.error != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    diagnostic.error!,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      color: Color(0xFFF85149),
                      fontSize: 10,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          if (diagnostic.responseTime != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF30363D),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '${diagnostic.responseTime!.inMilliseconds}ms',
                style: const TextStyle(
                  fontFamily: 'monospace',
                  color: Color(0xFF8B949E),
                  fontSize: 10,
                ),
              ),
            ),
        ],
      ),
    ).animate().fadeIn(duration: 200.ms).slideX(begin: -0.1, end: 0);
  }

  Widget _buildSuggestionsPanel(List<String> suggestions) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF30363D)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: suggestions.map((suggestion) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              suggestion,
              style: const TextStyle(
                fontFamily: 'monospace',
                color: Color(0xFFE6DB74),
                fontSize: 12,
              ),
            ),
          );
        }).toList(),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildDeviceInfoPanel() {
    if (_isLoadingDeviceInfo) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFF161B22),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFF30363D)),
        ),
        child: const Center(
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF161B22),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF30363D)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: _deviceInfo.entries.map((entry) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 120,
                  child: Text(
                    entry.key,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      color: Color(0xFF8B949E),
                      fontSize: 11,
                    ),
                  ),
                ),
                Expanded(
                  child: Text(
                    entry.value,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      color: Color(0xFFC9D1D9),
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildAppStatePanel() {
    return Consumer3<AuthProvider, AppSettingsProvider, ShuvoModeProvider>(
      builder: (context, auth, settings, shuvo, _) {
        final items = {
          'Authenticated': auth.isAuthenticated ? 'YES' : 'NO',
          'User': auth.user?.name ?? auth.user?.phone ?? 'N/A',
          'Maintenance Mode': settings.maintenanceMode ? 'YES' : 'NO',
          'Settings Loaded': settings.isLoading ? 'LOADING...' : 'YES',
          'Shuvo Mode': shuvo.isEnabled ? 'ACTIVE' : 'INACTIVE',
          'Diagnostics Run': shuvo.diagnostics.length.toString(),
        };

        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF161B22),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF30363D)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: items.entries.map((entry) {
              Color valueColor = const Color(0xFFC9D1D9);
              if (entry.value == 'YES' || entry.value == 'ACTIVE') {
                valueColor = const Color(0xFF238636);
              } else if (entry.value == 'NO' || entry.value == 'INACTIVE') {
                valueColor = const Color(0xFF8B949E);
              }

              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    SizedBox(
                      width: 140,
                      child: Text(
                        entry.key,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          color: Color(0xFF8B949E),
                          fontSize: 11,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: valueColor.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        entry.value,
                        style: TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                          color: valueColor,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }
}
