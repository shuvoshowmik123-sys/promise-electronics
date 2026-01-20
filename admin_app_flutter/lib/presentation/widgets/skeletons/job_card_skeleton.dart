import 'package:flutter/material.dart';
import '../common/shimmer_widget.dart';

class JobCardSkeleton extends StatelessWidget {
  const JobCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: ID and Status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const ShimmerWidget.rectangular(height: 16, width: 80),
                const ShimmerWidget.rectangular(height: 20, width: 60, shapeBorder: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(12)))),
              ],
            ),
            const SizedBox(height: 12),
            
            // Title
            const ShimmerWidget.rectangular(height: 16, width: double.infinity),
            const SizedBox(height: 8),
            const ShimmerWidget.rectangular(height: 16, width: 200),
            
            const SizedBox(height: 16),
             const Divider(height: 1),
            const SizedBox(height: 12),

            // Footer
            Row(
              children: [
                const ShimmerWidget.circular(width: 24, height: 24),
                const SizedBox(width: 8),
                const ShimmerWidget.rectangular(height: 14, width: 100),
                const Spacer(),
                const ShimmerWidget.rectangular(height: 14, width: 80),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
