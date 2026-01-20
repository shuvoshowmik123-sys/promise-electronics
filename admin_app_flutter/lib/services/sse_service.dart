import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

/// Service for maintaining SSE (Server-Sent Events) connection
/// to receive real-time notifications from the backend.
class SSEService {
  static SSEService? _instance;
  http.Client? _client;
  StreamController<Map<String, dynamic>>? _controller;
  bool _isConnected = false;
  String? _baseUrl;
  String? _sessionCookie;
  
  static SSEService get instance {
    _instance ??= SSEService._();
    return _instance!;
  }
  
  SSEService._();
  
  bool get isConnected => _isConnected;
  
  Stream<Map<String, dynamic>> get stream => 
      _controller?.stream ?? const Stream.empty();
  
  /// Connect to the SSE endpoint
  Future<void> connect({
    required String baseUrl,
    required String sessionCookie,
  }) async {
    if (_isConnected) return;
    
    _baseUrl = baseUrl;
    _sessionCookie = sessionCookie;
    _controller = StreamController<Map<String, dynamic>>.broadcast();
    _client = http.Client();
    
    _startConnection();
  }
  
  Future<void> _startConnection() async {
    try {
      final request = http.Request('GET', Uri.parse('$_baseUrl/api/admin/sse'));
      request.headers['Cookie'] = _sessionCookie ?? '';
      request.headers['Accept'] = 'text/event-stream';
      request.headers['Cache-Control'] = 'no-cache';
      
      final response = await _client!.send(request);
      
      if (response.statusCode == 200) {
        _isConnected = true;
        print('[SSE] Connected to admin notification stream');
        
        response.stream
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .listen(
              _handleLine,
              onError: _handleError,
              onDone: _handleDisconnect,
              cancelOnError: false,
            );
      } else {
        print('[SSE] Failed to connect: ${response.statusCode}');
        _scheduleReconnect();
      }
    } catch (e) {
      print('[SSE] Connection error: $e');
      _scheduleReconnect();
    }
  }
  
  void _handleLine(String line) {
    if (line.startsWith('data: ')) {
      try {
        final jsonStr = line.substring(6);
        final data = jsonDecode(jsonStr) as Map<String, dynamic>;
        _controller?.add(data);
      } catch (e) {
        print('[SSE] Parse error: $e');
      }
    }
    // Ignore ping/comment lines (starting with ':')
  }
  
  void _handleError(dynamic error) {
    print('[SSE] Stream error: $error');
    _isConnected = false;
    _scheduleReconnect();
  }
  
  void _handleDisconnect() {
    print('[SSE] Disconnected');
    _isConnected = false;
    _scheduleReconnect();
  }
  
  void _scheduleReconnect() {
    Future.delayed(const Duration(seconds: 5), () {
      if (!_isConnected && _baseUrl != null) {
        print('[SSE] Attempting reconnect...');
        _startConnection();
      }
    });
  }
  
  /// Disconnect and cleanup
  void disconnect() {
    _isConnected = false;
    _client?.close();
    _controller?.close();
    _client = null;
    _controller = null;
  }
}
