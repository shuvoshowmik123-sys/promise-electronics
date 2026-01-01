import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:image_picker/image_picker.dart';

import '../config/app_theme.dart';
import '../providers/chat_provider.dart';
import '../providers/locale_provider.dart';
import '../models/chat_message.dart';
import 'chat_camera_screen.dart';

/// Daktar Vai AI Chat Screen
/// The hero feature - Premium AI assistant for TV repair
/// Supports light and dark themes
class DaktarVaiScreen extends StatefulWidget {
  const DaktarVaiScreen({super.key});

  @override
  State<DaktarVaiScreen> createState() => _DaktarVaiScreenState();
}

class _DaktarVaiScreenState extends State<DaktarVaiScreen>
    with TickerProviderStateMixin {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  // Voice input
  late stt.SpeechToText _speech;
  bool _isListening = false;
  bool _speechAvailable = false;
  bool _hasInitialMessage = false;

  // Animation controllers
  late AnimationController _pulseController;

  // Image picker
  final ImagePicker _imagePicker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _initSpeech();

    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_hasInitialMessage) {
      final args =
          ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      debugPrint('DaktarVaiScreen: args = $args');
      if (args != null && args['message'] != null) {
        _hasInitialMessage = true;
        final message = args['message'] as String;
        final imageUrl = args['imageUrl'] as String?;
        debugPrint(
            'DaktarVaiScreen: Sending message: $message, imageUrl: $imageUrl');

        // Add message to chat
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final chatProvider =
              Provider.of<ChatProvider>(context, listen: false);
          chatProvider.sendMessage(message, imageBase64: imageUrl);
        });
      }
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _initSpeech() async {
    _speech = stt.SpeechToText();
    _speechAvailable = await _speech.initialize(
      onStatus: (status) {
        if (status == 'done' || status == 'notListening') {
          setState(() => _isListening = false);
        }
      },
      onError: (error) {
        setState(() => _isListening = false);
        debugPrint('Speech error: $error');
      },
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _toggleListening() async {
    if (!_speechAvailable) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                Provider.of<LocaleProvider>(context, listen: false).isBangla
                    ? 'ভয়েস ইনপুট উপলব্ধ নয়'
                    : 'Voice input not available')),
      );
      return;
    }

    HapticFeedback.mediumImpact();

    if (_isListening) {
      await _speech.stop();
      setState(() => _isListening = false);
    } else {
      setState(() => _isListening = true);
      await _speech.listen(
        onResult: (result) {
          setState(() {
            _textController.text = result.recognizedWords;
          });
        },
        localeId: 'bn_BD', // Bengali (Bangladesh)
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 3),
      );
    }
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    HapticFeedback.lightImpact();

    final chatProvider = context.read<ChatProvider>();
    chatProvider.sendMessage(text);

    _textController.clear();
    _scrollToBottom();
  }

  void _sendQuickReply(String reply) {
    HapticFeedback.lightImpact();

    final chatProvider = context.read<ChatProvider>();
    chatProvider.sendQuickReply(reply);

    _scrollToBottom();
  }

  /// Show bottom sheet with image source options
  void _showImageSourceOptions(BuildContext context, bool isDark) {
    HapticFeedback.lightImpact();

    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppColors.surfaceDark : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? Colors.grey[700] : Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),

              // Title
              Text(
                Provider.of<LocaleProvider>(context, listen: false).isBangla
                    ? 'ছবি যোগ করুন'
                    : 'Add Image',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : Colors.black,
                ),
              ),
              const SizedBox(height: 20),

              // Camera option (only on mobile)
              if (!kIsWeb)
                ListTile(
                  leading: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child:
                        const Icon(Icons.camera_alt, color: AppColors.primary),
                  ),
                  title: Text(
                    Provider.of<LocaleProvider>(context, listen: false).isBangla
                        ? 'ক্যামেরা দিয়ে ছবি তুলুন'
                        : 'Take Photo',
                    style: TextStyle(
                      color: isDark ? Colors.white : Colors.black,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(
                    Provider.of<LocaleProvider>(context, listen: false).isBangla
                        ? 'ফ্ল্যাশলাইট ও অটোফোকাস সহ'
                        : 'With flashlight & autofocus',
                    style: TextStyle(
                      color: isDark ? Colors.grey[400] : Colors.grey[600],
                      fontSize: 12,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    _openCamera();
                  },
                ),

              // Gallery option
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.purple.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.photo_library, color: Colors.purple),
                ),
                title: Text(
                  Provider.of<LocaleProvider>(context, listen: false).isBangla
                      ? 'গ্যালারি থেকে নির্বাচন করুন'
                      : 'Choose from Gallery',
                  style: TextStyle(
                    color: isDark ? Colors.white : Colors.black,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _pickFromGallery();
                },
              ),

              const SizedBox(height: 10),
            ],
          ),
        ),
      ),
    );
  }

  /// Open custom camera screen
  Future<void> _openCamera() async {
    final imagePath = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (context) => const ChatCameraScreen(),
      ),
    );

    if (imagePath != null && mounted) {
      _handleSelectedImage(imagePath);
    }
  }

  /// Pick image from gallery
  Future<void> _pickFromGallery() async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
      );

      if (image != null && mounted) {
        _handleSelectedImage(image.path);
      }
    } catch (e) {
      debugPrint('Gallery pick error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              Provider.of<LocaleProvider>(context, listen: false).isBangla
                  ? 'ছবি নির্বাচন করতে ব্যর্থ'
                  : 'Failed to pick image',
            ),
          ),
        );
      }
    }
  }

  /// Handle selected image - send to chat
  void _handleSelectedImage(String imagePath) {
    final chatProvider = context.read<ChatProvider>();

    // Send message with image
    chatProvider.sendMessageWithImage(
      Provider.of<LocaleProvider>(context, listen: false).isBangla
          ? 'এই ছবিটি দেখুন'
          : 'Please look at this image',
      imagePath,
    );

    _scrollToBottom();

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          Provider.of<LocaleProvider>(context, listen: false).isBangla
              ? 'ছবি পাঠানো হয়েছে'
              : 'Image sent',
        ),
        backgroundColor: AppColors.primary,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildHeader(context, isDark),

            // Messages List
            Expanded(
              child: Consumer<ChatProvider>(
                builder: (context, chatProvider, child) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    _scrollToBottom();
                  });

                  return ListView.builder(
                    controller: _scrollController,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    itemCount: chatProvider.messages.length +
                        (chatProvider.isLoading ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == chatProvider.messages.length &&
                          chatProvider.isLoading) {
                        return _buildTypingIndicator(isDark);
                      }

                      final message = chatProvider.messages[index];
                      return Column(
                        children: [
                          _buildChatBubble(context, isDark, message),

                          // Quick replies
                          if (message.isAssistant &&
                              message.quickReplies != null &&
                              message.quickReplies!.isNotEmpty &&
                              index == chatProvider.messages.length - 1)
                            _buildQuickReplies(isDark, message.quickReplies!),
                        ],
                      );
                    },
                  );
                },
              ),
            ),

            // Input Area
            _buildInputArea(context, isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark
            ? AppColors.backgroundDark.withValues(alpha: 0.9)
            : AppColors.backgroundLight.withValues(alpha: 0.9),
        border: Border(
          bottom: BorderSide(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: [
          // Back button
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              Navigator.of(context).pop();
            },
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.arrow_back,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
                size: 22,
              ),
            ),
          ),

          const SizedBox(width: 12),

          // Avatar with status
          Stack(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF006a4e), Color(0xFF36e27b)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.smart_toy_outlined,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: isDark
                        ? AppColors.backgroundDark
                        : AppColors.backgroundLight,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark
                          ? AppColors.backgroundDark
                          : AppColors.backgroundLight,
                      width: 2,
                    ),
                  ),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Color(0xFF22c55e),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(width: 12),

          // Title
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ডাক্তার ভাই AI',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: isDark
                        ? AppColors.textMainDark
                        : AppColors.textMainLight,
                  ),
                ),
                Text(
                  Provider.of<LocaleProvider>(context).isBangla
                      ? 'সবসময় সাহায্যের জন্য প্রস্তুত'
                      : 'Always here to help',
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF22c55e),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // More button
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
            },
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.more_horiz,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
                size: 22,
              ),
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms)
        .slideY(begin: -0.1, end: 0, duration: 400.ms);
  }

  Widget _buildChatBubble(
      BuildContext context, bool isDark, ChatMessage message) {
    final isUser = !message.isAssistant;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isUser) ...[
            // AI Avatar
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color:
                    isDark ? AppColors.surfaceDark : AppColors.backgroundLight,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isDark ? AppColors.borderDark : AppColors.borderLight,
                ),
              ),
              child: const Icon(
                Icons.smart_toy_outlined,
                color: AppColors.primary,
                size: 18,
              ),
            ),
            const SizedBox(width: 8),
          ],

          // Message bubble
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isUser
                    ? AppColors.primary
                    : (isDark
                        ? AppColors.surfaceDark
                        : AppColors.chatAiBubbleLight),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft: Radius.circular(isUser ? 20 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 20),
                ),
                border: isUser
                    ? null
                    : Border.all(
                        color: isDark
                            ? AppColors.borderDark
                            : AppColors.borderLight,
                      ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.04),
                    blurRadius: 4,
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    message.content,
                    style: TextStyle(
                      fontSize: 15,
                      color: isUser
                          ? AppColors.textMainLight
                          : (isDark
                              ? AppColors.textMainDark
                              : AppColors.textMainLight),
                      height: 1.4,
                    ),
                  ),
                  if (message.imageUrl != null) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        message.imageUrl!,
                        fit: BoxFit.cover,
                        height: 180,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          if (isUser) const SizedBox(width: 40),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: isDark ? AppColors.surfaceDark : AppColors.backgroundLight,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isDark ? AppColors.borderDark : AppColors.borderLight,
              ),
            ),
            child: const Icon(
              Icons.smart_toy_outlined,
              color: AppColors.primary,
              size: 18,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color:
                  isDark ? AppColors.surfaceDark : AppColors.chatAiBubbleLight,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark ? AppColors.borderDark : AppColors.borderLight,
              ),
            ),
            child: Row(
              children: [
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(AppColors.primary),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  Provider.of<LocaleProvider>(context).isBangla
                      ? 'টাইপ করা হচ্ছে...'
                      : 'Typing...',
                  style: TextStyle(
                    color:
                        isDark ? AppColors.textSubDark : AppColors.textSubLight,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate(onPlay: (controller) => controller.repeat()).shimmer(
        duration: 1500.ms, color: AppColors.primary.withValues(alpha: 0.1));
  }

  Widget _buildQuickReplies(bool isDark, List<String> replies) {
    return Padding(
      padding: const EdgeInsets.only(left: 40, top: 8, bottom: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: replies.asMap().entries.map((entry) {
          final index = entry.key;
          final reply = entry.value;
          return GestureDetector(
            onTap: () => _sendQuickReply(reply),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? AppColors.borderDark : AppColors.borderLight,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    reply.contains('Book')
                        ? Icons.calendar_month
                        : Icons.shopping_bag_outlined,
                    size: 16,
                    color:
                        isDark ? AppColors.textSubDark : AppColors.textSubLight,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    reply,
                    style: TextStyle(
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          )
              .animate()
              .fadeIn(
                  delay: Duration(milliseconds: 100 * index), duration: 300.ms)
              .scale(
                begin: const Offset(0.9, 0.9),
                end: const Offset(1, 1),
                delay: Duration(milliseconds: 100 * index),
                curve: Curves.easeOutBack,
              );
        }).toList(),
      ),
    );
  }

  Widget _buildInputArea(BuildContext context, bool isDark) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.of(context).padding.bottom + 12,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
      ),
      child: Row(
        children: [
          // Camera button
          GestureDetector(
            onTap: () => _showImageSourceOptions(context, isDark),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.backgroundDark
                    : AppColors.backgroundLight,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(
                Icons.add_a_photo_outlined,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
                size: 22,
              ),
            ),
          ),

          const SizedBox(width: 12),

          // Text input
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.backgroundDark
                    : AppColors.backgroundLight,
                borderRadius: BorderRadius.circular(24),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      focusNode: _focusNode,
                      style: TextStyle(
                        color: isDark
                            ? AppColors.textMainDark
                            : AppColors.textMainLight,
                      ),
                      decoration: InputDecoration(
                        hintText: _isListening
                            ? (Provider.of<LocaleProvider>(context).isBangla
                                ? 'শোনা হচ্ছে...'
                                : 'Listening...')
                            : (Provider.of<LocaleProvider>(context).isBangla
                                ? 'আপনার টিভির সমস্যা বর্ণনা করুন...'
                                : 'Describe your TV problem...'),
                        hintStyle: TextStyle(
                          color: isDark
                              ? AppColors.textMutedDark
                              : AppColors.textMutedLight,
                        ),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),

                  // Voice button
                  GestureDetector(
                    onTap: _toggleListening,
                    child: AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, child) {
                        return Container(
                          width: 36,
                          height: 36,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(
                            color: _isListening
                                ? Color.lerp(
                                    AppColors.coralRed.withValues(alpha: 0.1),
                                    AppColors.coralRed.withValues(alpha: 0.3),
                                    _pulseController.value,
                                  )
                                : Colors.transparent,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _isListening ? Icons.mic_off : Icons.mic,
                            color: _isListening
                                ? AppColors.coralRed
                                : (isDark
                                    ? AppColors.textSubDark
                                    : AppColors.textSubLight),
                            size: 20,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(width: 12),

          // Send button
          GestureDetector(
            onTap: _sendMessage,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.3),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: const Icon(
                Icons.send_rounded,
                color: AppColors.textMainLight,
                size: 20,
              ),
            ),
          ).animate().scale(
                begin: const Offset(0.95, 0.95),
                end: const Offset(1, 1),
                duration: 200.ms,
              ),
        ],
      ),
    )
        .animate()
        .fadeIn(delay: 200.ms, duration: 400.ms)
        .slideY(begin: 0.1, end: 0, delay: 200.ms, duration: 400.ms);
  }
}
