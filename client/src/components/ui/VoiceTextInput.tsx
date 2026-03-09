import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { aiApi } from '@/lib/api';

// Define types for Web Speech API since it might not be in standard TypeScript DOM lib yet
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

interface VoiceTextInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function VoiceTextInput({ value, onChange, placeholder, className }: VoiceTextInputProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const [language, setLanguage] = useState<'bn-BD' | 'en-US'>('bn-BD'); // Default to Banglish
    const [isTransliterating, setIsTransliterating] = useState(false);

    const recognitionRef = useRef<any>(null);
    const valueRef = useRef(value);

    // Keep value ref updated to avoid stale closures in speech callbacks
    useEffect(() => {
        valueRef.current = value;
    }, [value]);

    useEffect(() => {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setIsSupported(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onstart = () => {
            setIsRecording(true);
            toast.info(language === 'bn-BD' ? "বাংলায় বলুন (Banglish Output)..." : "Listening... Speak now.", { id: 'voice-toast' });
        };

        recognition.onresult = async (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // If we have final recognized text, append it
            if (finalTranscript) {
                try {
                    let processedText = finalTranscript.trim();
                    const punctuation = processedText.match(/[.!?]$/) ? '' : '. ';

                    if (language === 'bn-BD') {
                        setIsTransliterating(true);
                        toast.loading("Translating to Banglish...", { id: 'transliterate-toast' });
                        const res = await aiApi.transliterate(processedText);
                        processedText = res.text;
                        toast.success("Done!", { id: 'transliterate-toast', duration: 1000 });
                    }

                    // Use valueRef to get the most up-to-date value inside this async callback closure
                    const currentValue = valueRef.current;
                    const spacer = currentValue && !currentValue.endsWith(' ') && !currentValue.endsWith('\n') ? ' ' : '';

                    const newText = currentValue + spacer + processedText + punctuation;
                    onChange(newText);
                } catch (err) {
                    console.error("Transliteration error:", err);
                    toast.error("Failed to transliterate", { id: 'transliterate-toast' });
                } finally {
                    setIsTransliterating(false);
                }
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsRecording(false);

            if (event.error === 'not-allowed') {
                toast.error("Microphone access denied. Please allow microphone access in your browser.");
            } else if (event.error !== 'no-speech') {
                toast.error(`Recording paused: ${event.error}`);
            }

            toast.dismiss('voice-toast');
        };

        recognition.onend = () => {
            setIsRecording(false);
            toast.dismiss('voice-toast');
        };

        recognitionRef.current = recognition;

        return () => {
            if (recognitionRef.current && isRecording) {
                recognitionRef.current.stop();
            }
        };
    }, [language]); // Only re-bind when language changes to prevent interrupting speech

    const toggleRecording = () => {
        if (!isSupported) {
            toast.error("Speech recognition is not supported in this browser. Try Chrome or Edge.");
            return;
        }

        if (isRecording) {
            recognitionRef.current?.stop();
        } else {
            try {
                recognitionRef.current?.start();
            } catch (e) {
                // Handle case where it might already be started
                console.error(e);
                setIsRecording(false);
            }
        }
    };

    return (
        <div className="relative group">
            <Textarea
                placeholder={placeholder || "Type or dictate notes..."}
                className={`min-h-[120px] resize-none pr-12 focus-visible:ring-blue-500 bg-white ${isRecording ? 'border-red-400 ring-1 ring-red-400' : ''} ${className}`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />

            {isSupported && (
                <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                    {/* Language Toggle */}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`h-9 px-2.5 text-xs font-bold transition-colors ${language === 'bn-BD' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600'}`}
                        onClick={() => setLanguage(lang => lang === 'bn-BD' ? 'en-US' : 'bn-BD')}
                        disabled={isRecording || isTransliterating}
                        title={language === 'bn-BD' ? "Banglish Mode Active" : "English Mode Active"}
                    >
                        {language === 'bn-BD' ? 'BN-EN' : 'EN'}
                    </Button>

                    {/* Record Button */}
                    <Button
                        type="button"
                        size="icon"
                        variant={isRecording ? "destructive" : "secondary"}
                        className={`shadow-sm rounded-full h-10 w-10 transition-all ${isRecording ? 'animate-pulse shadow-red-500/30' : 'opacity-70 hover:opacity-100 group-hover:opacity-100'
                            }`}
                        onClick={toggleRecording}
                        disabled={isTransliterating}
                        title={isRecording ? "Stop Dictation" : "Start Voice Dictation"}
                    >
                        {isRecording || isTransliterating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                    </Button>
                </div>
            )}

            {isRecording && (
                <button
                    type="button"
                    onClick={toggleRecording}
                    className="absolute top-3 right-3 flex items-center justify-center p-2 rounded-full hover:bg-red-50 transition-colors"
                    title="Stop Dictation"
                >
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse ring-2 ring-red-200"></span>
                </button>
            )}
        </div>
    );
}
