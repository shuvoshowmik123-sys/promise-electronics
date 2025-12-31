import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../models/chat_message.dart';

/// Chat Provider for Daktar Vai AI
/// Manages chat state and API communication
class ChatProvider extends ChangeNotifier {
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;
  String? _error;

  // Getters
  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get hasMessages => _messages.isNotEmpty;

  ChatProvider() {
    // Add welcome message
    _messages.add(ChatMessage.welcome());
  }

  /// Send a message to Daktar Vai AI
  Future<void> sendMessage(String text, {String? imageBase64}) async {
    if (text.trim().isEmpty && imageBase64 == null) return;

    _error = null;

    // Add user message immediately
    final userMessage = ChatMessage.user(
      text.isNotEmpty ? text : '📷 Image sent',
      imageUrl: imageBase64,
    );
    _messages.add(userMessage);
    notifyListeners();

    // Set loading state
    _isLoading = true;
    notifyListeners();

    try {
      // Prepare API request
      final history = _messages
          .where((m) => m.id != 'welcome')
          .map((m) => m.toHistoryFormat())
          .toList();

      final body = {
        'message': text.isNotEmpty ? text : 'Please analyze this image',
        'history': history,
        if (imageBase64 != null) 'image': imageBase64,
      };

      // Make API call
      final response = await http.post(
        Uri.parse(ApiConfig.aiChatEndpoint),
        headers: ApiConfig.headers,
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        // Parse booking data if present
        BookingData? booking;
        if (data['ticketData'] != null || data['booking'] != null) {
          booking = BookingData.fromJson(data['ticketData'] ?? data['booking']);
        }

        // Create assistant response
        final assistantMessage = ChatMessage.assistant(
          data['text'] ?? 'দুঃখিত, কোনো response পাওয়া যায়নি।',
          booking: booking,
        );
        _messages.add(assistantMessage);
      } else {
        throw Exception('API Error: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Chat Error: $e');
      _error = e.toString();
      
      // Add error message
      _messages.add(ChatMessage.assistant(
        'দুঃখিত, network e problem hocche. Abar try korun! 🔄',
      ));
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Send a quick reply
  Future<void> sendQuickReply(String reply) async {
    await sendMessage(reply);
  }

  /// Clear chat history
  void clearChat() {
    _messages.clear();
    _messages.add(ChatMessage.welcome());
    _error = null;
    notifyListeners();
  }

  /// Get chat history for API (excludes welcome message)
  List<Map<String, dynamic>> getHistory() {
    return _messages
        .where((m) => m.id != 'welcome')
        .map((m) => m.toHistoryFormat())
        .toList();
  }
}
