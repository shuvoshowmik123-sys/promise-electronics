import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface UseVoiceInputOptions {
    onResult?: (transcript: string) => void;
    onError?: (error: string) => void;
    language?: string; // Leave empty for auto-detection
}

interface UseVoiceInputReturn {
    isListening: boolean;
    isSupported: boolean;
    transcript: string;
    startListening: () => Promise<void>;
    stopListening: () => Promise<void>;
    toggleListening: () => Promise<void>;
    error: string | null;
}

/**
 * Cross-platform voice input hook
 * - Uses Capacitor SpeechRecognition plugin on native (Android/iOS)
 * - Falls back to Web Speech API on web browsers
 * - Auto-detection enabled by default for Bangla/English/Banglish support
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
    const { onResult, onError, language } = options;

    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const webRecognitionRef = useRef<any>(null);
    const onResultRef = useRef(onResult);
    const onErrorRef = useRef(onError);
    const isNative = Capacitor.isNativePlatform();

    // Keep refs updated
    useEffect(() => {
        onResultRef.current = onResult;
        onErrorRef.current = onError;
    }, [onResult, onError]);

    // Initialize on mount
    useEffect(() => {
        const init = async () => {
            if (isNative) {
                // Check native plugin availability
                try {
                    const available = await SpeechRecognition.available();
                    setIsSupported(available.available);

                    if (available.available) {
                        // Request permissions upfront
                        const permission = await SpeechRecognition.requestPermissions();
                        if (permission.speechRecognition !== 'granted') {
                            setError('Microphone permission denied');
                            setIsSupported(false);
                        }
                    }
                } catch (err) {
                    console.error('Speech recognition init error:', err);
                    setIsSupported(false);
                }
            } else {
                // Web Speech API
                const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
                    (window as any).webkitSpeechRecognition;

                if (SpeechRecognitionAPI) {
                    setIsSupported(true);
                    const recognition = new SpeechRecognitionAPI();

                    // IMPORTANT: continuous = true keeps listening until manually stopped
                    recognition.continuous = true;
                    recognition.interimResults = true;

                    // Use a sensible default language (English) if not specified
                    // Auto-detect doesn't work well with empty string on all browsers
                    recognition.lang = language || 'en-US';

                    recognition.onstart = () => {
                        console.log('[VoiceInput] Started listening');
                        setIsListening(true);
                    };

                    recognition.onend = () => {
                        console.log('[VoiceInput] Stopped listening');
                        setIsListening(false);
                    };

                    recognition.onerror = (event: any) => {
                        console.error('[VoiceInput] Error:', event.error);

                        // Don't treat "aborted" as an error (happens when user stops manually)
                        if (event.error === 'aborted') {
                            setIsListening(false);
                            return;
                        }

                        // "no-speech" happens if user doesn't speak - restart listening
                        if (event.error === 'no-speech') {
                            console.log('[VoiceInput] No speech detected, continuing...');
                            return;
                        }

                        setIsListening(false);
                        const errorMessage = event.error || 'Speech recognition error';
                        setError(errorMessage);
                        onErrorRef.current?.(errorMessage);
                    };

                    recognition.onresult = (event: any) => {
                        // Get all results and concatenate
                        let finalTranscript = '';
                        let interimTranscript = '';

                        for (let i = 0; i < event.results.length; i++) {
                            const result = event.results[i];
                            if (result.isFinal) {
                                finalTranscript += result[0].transcript;
                            } else {
                                interimTranscript += result[0].transcript;
                            }
                        }

                        const currentText = finalTranscript || interimTranscript;
                        console.log('[VoiceInput] Transcript:', currentText);
                        setTranscript(currentText);

                        if (finalTranscript) {
                            onResultRef.current?.(finalTranscript);
                        }
                    };

                    webRecognitionRef.current = recognition;
                } else {
                    console.warn('[VoiceInput] Web Speech API not supported');
                    setIsSupported(false);
                }
            }
        };

        init();

        // Cleanup
        return () => {
            if (isNative) {
                SpeechRecognition.stop().catch(() => { });
            } else if (webRecognitionRef.current) {
                try {
                    webRecognitionRef.current.stop();
                } catch (e) {
                    // Ignore errors on cleanup
                }
            }
        };
    }, [isNative, language]); // Removed onResult/onError from deps - using refs instead

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript('');

        console.log('[VoiceInput] Starting...', { isNative });

        try {
            if (isNative) {
                // Native: Use Capacitor plugin
                setIsListening(true);

                // Add listener for partial results BEFORE starting
                SpeechRecognition.addListener('partialResults', (data: any) => {
                    console.log('[VoiceInput Native] Partial:', data);
                    if (data.matches && data.matches.length > 0) {
                        const text = data.matches[0];
                        setTranscript(text);
                    }
                });

                const result = await SpeechRecognition.start({
                    language: language || 'en-US', // Default to English, Android will still detect other languages
                    partialResults: true,
                    popup: false,
                });

                console.log('[VoiceInput Native] Final result:', result);

                // Final result
                if (result.matches && result.matches.length > 0) {
                    const finalText = result.matches[0];
                    setTranscript(finalText);
                    onResultRef.current?.(finalText);
                }

                setIsListening(false);
                SpeechRecognition.removeAllListeners();
            } else {
                // Web: Use browser API
                if (webRecognitionRef.current) {
                    try {
                        webRecognitionRef.current.start();
                        console.log('[VoiceInput Web] Started');
                    } catch (err: any) {
                        // If already started, stop and restart
                        if (err.message?.includes('already started')) {
                            webRecognitionRef.current.stop();
                            setTimeout(() => {
                                webRecognitionRef.current.start();
                            }, 100);
                        } else {
                            throw err;
                        }
                    }
                } else {
                    console.error('[VoiceInput] No recognition instance');
                }
            }
        } catch (err: any) {
            console.error('[VoiceInput] Start error:', err);
            setIsListening(false);
            const errorMessage = err.message || 'Failed to start listening';
            setError(errorMessage);
            onErrorRef.current?.(errorMessage);
        }
    }, [isNative, language]);

    const stopListening = useCallback(async () => {
        console.log('[VoiceInput] Stopping...');
        try {
            if (isNative) {
                await SpeechRecognition.stop();
                SpeechRecognition.removeAllListeners();
            } else if (webRecognitionRef.current) {
                webRecognitionRef.current.stop();
            }
        } catch (err) {
            console.error('[VoiceInput] Stop error:', err);
        }
        setIsListening(false);
    }, [isNative]);

    const toggleListening = useCallback(async () => {
        console.log('[VoiceInput] Toggle, currently listening:', isListening);
        if (isListening) {
            await stopListening();
        } else {
            await startListening();
        }
    }, [isListening, startListening, stopListening]);

    return {
        isListening,
        isSupported,
        transcript,
        startListening,
        stopListening,
        toggleListening,
        error,
    };
}
