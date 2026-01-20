import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../../providers/attendance_provider.dart';
import 'package:geolocator/geolocator.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  // Placeholder variables for Phase 1
  String _currentLocation = "Head Office"; // Placeholder for now

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadData();
      _determinePosition();
    });
  }

  void _loadData() {
    final auth = context.read<AuthProvider>();
    final attendance = context.read<AttendanceProvider>();
    final role = auth.user?.role;
    
    if (_isSuperAdmin(role)) {
      attendance.fetchAllRecords();
    } else {
      if (auth.user?.id != null) {
        attendance.fetchUserRecords(auth.user!.id);
        attendance.fetchTodayStatus();
      }
    }
  }

  bool _isSuperAdmin(String? role) {
    if (role == null) return false;
    // Check for Super Admin (and Admin if assumed same privilege)
    final r = role.toLowerCase().replaceAll('_', ' ');
    return r == 'super admin' || r == 'admin';
  }
  
  bool _canShowCheckIn(String? role) {
    if (role == null) return false;
    // Hide for Super Admin/Admin
    if (_isSuperAdmin(role)) return false;
    // Show for staff roles
    final lowerRole = role.toLowerCase();
    return ['technician', 'tech', 'manager', 'driver', 'cashier'].contains(lowerRole);
  }

  Future<Position?> _determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) setState(() => _currentLocation = "Location Services Disabled");
      return null;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        if (mounted) setState(() => _currentLocation = "Location Permission Denied");
        return null;
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      if (mounted) setState(() => _currentLocation = "Location Permission Denied Forever");
      return null;
    } 

    if (mounted) setState(() => _currentLocation = "Locating...");
    
    try {
      Position position = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() => _currentLocation = "${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}");
      }
      return position;
    } catch (e) {
       if (mounted) setState(() => _currentLocation = "Error getting location");
       return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<AuthProvider, AttendanceProvider>(
      builder: (context, auth, attendance, child) {
        final role = auth.user?.role;
        final isSuperAdmin = _isSuperAdmin(role);
        
        return Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Today's Attendance",
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              
              // Location Status Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.grey.withOpacity(0.1),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.blue.withOpacity(0.1),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.location_on, color: Colors.blue),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                "Current Location",
                                style: TextStyle(color: Colors.grey, fontSize: 12),
                              ),
                              Text(
                                _currentLocation,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    
                    // Location Logic
                    if (_canShowCheckIn(role)) ...[
                       if (attendance.isLoading)
                         const Center(child: CircularProgressIndicator())
                       else if (attendance.todayRecord != null && attendance.todayRecord['checkOutTime'] == null)
                          SizedBox(
                            width: double.infinity,
                            height: 50,
                            child: ElevatedButton(
                              onPressed: () async {
                                await attendance.checkOut();
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              child: const Text("Check Out", style: TextStyle(color: Colors.white, fontSize: 16)),
                            ),
                          )
                       else if (attendance.todayRecord != null && attendance.todayRecord['checkOutTime'] != null)
                          Container(
                             padding: const EdgeInsets.all(12),
                             alignment: Alignment.center,
                             decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                             child: const Text("Completed for Today", style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                          )
                       else
                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: () async {
                              final pos = await _determinePosition();
                              if (pos != null) {
                                final locString = "Location: ${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}";
                                await attendance.checkIn(locString);
                              } else {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text("Location required for check-in"))
                                );
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.blue,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            child: const Text("Check In (with Location)", style: TextStyle(color: Colors.white, fontSize: 16)),
                          ),
                        ),
                    ] else ...[
                       Padding(
                        padding: const EdgeInsets.only(top: 12.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.lock_outline, size: 16, color: Colors.grey),
                            const SizedBox(width: 4),
                            Text(
                              isSuperAdmin ? "Admin View Only" : "Role not authorized",
                              style: const TextStyle(color: Colors.grey, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ]
                  ],
                ),
              ),
              
              const SizedBox(height: 32),
              
              // Role-Based Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    isSuperAdmin ? "Staff Attendance Report" : "My Attendance Log",
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                     icon: const Icon(Icons.refresh),
                     onPressed: _loadData,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // Use Expanded ListView
              Expanded(
                child: attendance.isLoading && attendance.records.isEmpty
                 ? const Center(child: CircularProgressIndicator())
                 : attendance.records.isEmpty
                     ? Center(
                         child: Column(
                           mainAxisAlignment: MainAxisAlignment.center,
                           children: [
                             Icon(Icons.history, size: 48, color: Colors.grey.shade300),
                             const SizedBox(height: 16),
                             Text(
                               "No records found",
                               style: TextStyle(color: Colors.grey.shade500),
                             ),
                           ],
                         ),
                       )
                     : ListView.separated(
                        itemCount: attendance.records.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final record = attendance.records[index];
                          final date = record['date']?.toString().split('T')[0] ?? 'Unknown Date';
                          final name = record['userName'] ?? 'Unknown User';
                          final checkIn = record['checkInTime'] != null ? 
                              TimeOfDay.fromDateTime(DateTime.parse(record['checkInTime']).toLocal()).format(context) : '-';
                          final checkOut = record['checkOutTime'] != null ? 
                              TimeOfDay.fromDateTime(DateTime.parse(record['checkOutTime']).toLocal()).format(context) : 'Active';

                          return Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade200),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: Colors.blue.shade50,
                                  child: Text(name.substring(0, 1).toUpperCase()),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(isSuperAdmin ? name : date, style: const TextStyle(fontWeight: FontWeight.bold)),
                                      Text(isSuperAdmin ? date : "In: $checkIn - Out: $checkOut", 
                                        style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: checkOut == 'Active' ? Colors.green.shade50 : Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    checkOut == 'Active' ? 'Present' : 'Completed',
                                    style: TextStyle(
                                      color: checkOut == 'Active' ? Colors.green : Colors.grey.shade700, 
                                      fontWeight: FontWeight.bold, fontSize: 11
                                    ),
                                  ),
                                ),
                              ],
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
