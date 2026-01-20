import 'package:flutter/material.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import '../common/shimmer_widget.dart';

class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 2x2 Grid Key Stats
          StaggeredGrid.count(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            children: List.generate(4, (index) => 
              StaggeredGridTile.count(
                crossAxisCellCount: 1,
                mainAxisCellCount: 1,
                child: const ShimmerWidget.rectangular(
                  height: double.infinity, 
                  shapeBorder: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(24)))
                ),
              )
            ),
          ),
          
          const SizedBox(height: 32),
          
          // Quick Actions Heading
          const ShimmerWidget.rectangular(height: 20, width: 150),
          const SizedBox(height: 12),
          
          // Horizontal Pills
          SizedBox(
            height: 50,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: 4,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, __) => const ShimmerWidget.rectangular(
                height: 50, 
                width: 120, 
                shapeBorder: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(24)))
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Recent Requests Tile
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    ShimmerWidget.rectangular(height: 20, width: 150),
                    ShimmerWidget.rectangular(height: 20, width: 60),
                  ],
                ),
                const SizedBox(height: 16),
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: 3,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (_, __) => const Row(
                    children: [
                       ShimmerWidget.rectangular(height: 40, width: 40), // Icon placeholder
                       SizedBox(width: 12),
                       Expanded(
                         child: Column(
                           crossAxisAlignment: CrossAxisAlignment.start,
                           children: [
                             ShimmerWidget.rectangular(height: 14, width: double.infinity),
                             SizedBox(height: 6),
                             ShimmerWidget.rectangular(height: 12, width: 100),
                           ],
                         )
                       )
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
