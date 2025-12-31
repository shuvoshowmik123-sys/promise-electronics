import 'package:flutter/material.dart';

/// A flexible Bento Grid layout widget that arranges cards in an asymmetric grid.
/// Cards can span multiple columns and rows.
class BentoGrid extends StatelessWidget {
  final List<BentoGridItem> items;
  final int columns;
  final double gap;
  final EdgeInsets padding;

  const BentoGrid({
    super.key,
    required this.items,
    this.columns = 4,
    this.gap = 12,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth = constraints.maxWidth - padding.horizontal;
        final cellWidth = (availableWidth - gap * (columns - 1)) / columns;
        final cellHeight = cellWidth; // Square cells as base

        return Padding(
          padding: padding,
          child: Wrap(
            spacing: gap,
            runSpacing: gap,
            children: items.map((item) {
              final width =
                  cellWidth * item.columnSpan + gap * (item.columnSpan - 1);
              final height =
                  cellHeight * item.rowSpan + gap * (item.rowSpan - 1);

              return SizedBox(
                width: width,
                height: height,
                child: item.child,
              );
            }).toList(),
          ),
        );
      },
    );
  }
}

/// Represents a single item in the Bento Grid with span information.
class BentoGridItem {
  final Widget child;
  final int columnSpan;
  final int rowSpan;

  const BentoGridItem({
    required this.child,
    this.columnSpan = 1,
    this.rowSpan = 1,
  });
}
