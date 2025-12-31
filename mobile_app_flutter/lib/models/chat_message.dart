/// Chat Message Model for Daktar Vai AI
library;

enum MessageRole { user, assistant }

class ChatMessage {
  final String id;
  final MessageRole role;
  final String content;
  final String? imageUrl;
  final DateTime timestamp;
  final List<String>? quickReplies;
  final BookingData? booking;
  final PartRecommendation? partRecommendation;

  ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    this.imageUrl,
    DateTime? timestamp,
    this.quickReplies,
    this.booking,
    this.partRecommendation,
  }) : timestamp = timestamp ?? DateTime.now();

  /// Create a user message
  factory ChatMessage.user(String content, {String? imageUrl}) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: MessageRole.user,
      content: content,
      imageUrl: imageUrl,
    );
  }

  /// Create an assistant message
  factory ChatMessage.assistant(
    String content, {
    List<String>? quickReplies,
    BookingData? booking,
    PartRecommendation? partRecommendation,
  }) {
    return ChatMessage(
      id: (DateTime.now().millisecondsSinceEpoch + 1).toString(),
      role: MessageRole.assistant,
      content: content,
      quickReplies: quickReplies,
      booking: booking,
      partRecommendation: partRecommendation,
    );
  }

  /// Create welcome message
  factory ChatMessage.welcome() {
    return ChatMessage(
      id: 'welcome',
      role: MessageRole.assistant,
      content: 'Assalamu Alaikum! Ami Daktar Vai. TV niye kono pera nicchen? 📺',
      quickReplies: ['Broken Screen', "Won't Turn On", 'Need Spare Parts'],
    );
  }

  /// Convert to API history format
  Map<String, dynamic> toHistoryFormat() {
    return {
      'role': role == MessageRole.user ? 'user' : 'model',
      'parts': [{'text': content}],
    };
  }

  bool get isUser => role == MessageRole.user;
  bool get isAssistant => role == MessageRole.assistant;
}

/// Booking data returned from AI
class BookingData {
  final String ticketNumber;
  final int id;

  BookingData({
    required this.ticketNumber,
    required this.id,
  });

  factory BookingData.fromJson(Map<String, dynamic> json) {
    return BookingData(
      ticketNumber: json['ticketNumber'] ?? '',
      id: json['id'] ?? 0,
    );
  }
}

/// Part recommendation from AI
class PartRecommendation {
  final String id;
  final String name;
  final String partNumber;
  final String price;
  final String imageUrl;

  PartRecommendation({
    required this.id,
    required this.name,
    required this.partNumber,
    required this.price,
    required this.imageUrl,
  });

  factory PartRecommendation.fromJson(Map<String, dynamic> json) {
    return PartRecommendation(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      partNumber: json['partNumber'] ?? '',
      price: json['price'] ?? '',
      imageUrl: json['image'] ?? '',
    );
  }
}
