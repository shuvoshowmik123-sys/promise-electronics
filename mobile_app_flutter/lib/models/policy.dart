class Policy {
  final String id;
  final String slug;
  final String title;
  final String content;
  final bool isPublished;
  final DateTime lastUpdated;

  Policy({
    required this.id,
    required this.slug,
    required this.title,
    required this.content,
    required this.isPublished,
    required this.lastUpdated,
  });

  factory Policy.fromJson(Map<String, dynamic> json) {
    return Policy(
      id: json['id']?.toString() ?? '',
      slug: json['slug']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      isPublished: json['isPublished'] == true,
      lastUpdated: DateTime.tryParse(json['lastUpdated']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}
