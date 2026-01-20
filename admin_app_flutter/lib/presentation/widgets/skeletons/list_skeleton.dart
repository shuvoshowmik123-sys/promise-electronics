import 'package:flutter/material.dart';
import '../common/shimmer_widget.dart';

class ListSkeleton extends StatelessWidget {
  final int itemCount;
  const ListSkeleton({super.key, this.itemCount = 8});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: itemCount,
      physics: const NeverScrollableScrollPhysics(),
      itemBuilder: (context, index) {
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Row(
            children: [
              const ShimmerWidget.circular(width: 48, height: 48),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const ShimmerWidget.rectangular(height: 16, width: 150),
                    const SizedBox(height: 8),
                    const ShimmerWidget.rectangular(height: 12, width: 100),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              const ShimmerWidget.rectangular(height: 12, width: 24),
            ],
          ),
        );
      },
    );
  }
}
