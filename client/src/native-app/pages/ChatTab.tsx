import { useState, useRef, useEffect } from "react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { aiApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import NativeLayout from "../NativeLayout";
import { useLocation } from "wouter";
import {
    Send,
    Mic,
    MicOff,
    Camera,
    Loader2,
    ChevronLeft,
    Plus,
    Settings,
    Bot,
    User,
    CheckCircle,
    X,
    ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/utils";
import NativeCameraLens from "./CameraLens";
import { AnalysisResult } from "@/hooks/useCameraLens";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    image?: string;
    timestamp: Date;
    booking?: any;
    quickReplies?: string[];
    partRecommendation?: PartRecommendation;
}

interface PartRecommendation {
    id: string;
    name: string;
    partNumber: string;
    price: string;
    image: string;
}

export default function ChatTab() {
    const { customer } = useCustomerAuth();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "assistant",
            content: "Assalamu Alaikum! Ami Daktar Vai. TV niye kono pera nicchen? 📺",
            timestamp: new Date(),
            quickReplies: ["Broken Screen", "Won't Turn On", "Need Spare Parts"]
        }
    ]);
    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingImage, setPendingImage] = useState<string | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Voice Input Hook - Auto-detection enabled
    const {
        isListening,
        isSupported: isVoiceSupported,
        transcript,
        toggleListening,
        error: voiceError
    } = useVoiceInput({
        onResult: (text) => {
            setInputText(text);
        },
        onError: (error) => {
            toast({
                title: "Voice Input Error",
                description: error,
                variant: "destructive"
            });
        }
    });

    // Update input text when transcript changes (real-time)
    useEffect(() => {
        if (transcript && isListening) {
            setInputText(transcript);
        }
    }, [transcript, isListening]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Convert messages to history format for API
    const getHistory = () => {
        return messages.slice(1).map(msg => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }]
        }));
    };

    const sendMessage = async (text?: string) => {
        const messageText = text || inputText.trim();
        if (!messageText && !pendingImage) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: messageText || "📷 Image sent",
            image: pendingImage || undefined,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText("");
        setIsLoading(true);

        try {
            const response = await aiApi.chat(
                messageText || "Please analyze this image",
                getHistory(),
                pendingImage || undefined
            );

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: response.text,
                timestamp: new Date(),
                booking: response.booking || response.ticketData
            };

            setMessages(prev => [...prev, assistantMessage]);

            // Show booking success toast
            if (response.ticketData) {
                toast({
                    title: "🎉 Booking Confirmed!",
                    description: `Ticket #${response.ticketData.ticketNumber || response.ticketData.id} created.`,
                });
            }

        } catch (error: any) {
            console.error("Chat error:", error);

            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "দুঃখিত, network e problem hocche. Abar try korun! 🔄",
                timestamp: new Date()
            };

            setMessages(prev => [...prev, errorMessage]);

            toast({
                title: "Connection Error",
                description: "Please check your internet connection.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
            setPendingImage(null);
            inputRef.current?.focus();
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleQuickReply = (reply: string) => {
        sendMessage(reply);
    };

    const handleImageCapture = () => {
        setShowCamera(true);
    };

    const handleCameraCapture = async (result: AnalysisResult, image: string) => {
        setShowCamera(false);

        // Construct message based on result
        let content = "📷 Image Analysis Request";
        if (result.mode === 'identify') {
            content = `Identify this component: ${result.label || 'Unknown'}`;
        } else if (result.mode === 'assess') {
            content = `Assess damage for this component.`;
        } else if (result.mode === 'barcode') {
            content = `Scanned Barcode: ${result.barcode || 'Unknown'}`;
        }

        // Add user message immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: content,
            image: image,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // We can pass the raw text from analysis as context to the chat
            const contextMessage = result.rawText ? `${content}\n\nAnalysis Context: ${result.rawText}` : content;

            const response = await aiApi.chat(
                contextMessage,
                getHistory(),
                image
            );

            // Add assistant response
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: response.text,
                timestamp: new Date(),
                booking: response.booking || response.ticketData
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Show booking success toast
            if (response.ticketData) {
                toast({
                    title: "🎉 Booking Confirmed!",
                    description: `Ticket #${response.ticketData.ticketNumber || response.ticketData.id} created.`,
                });
            }

        } catch (error: any) {
            console.error("Chat error:", error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: "দুঃখিত, network e problem hocche. Abar try korun! 🔄",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVoiceInput = async () => {
        if (!isVoiceSupported) {
            toast({
                title: "Not Supported",
                description: "Voice input is not supported on this device.",
                variant: "destructive"
            });
            return;
        }
        await toggleListening();
    };

    const handleAddAction = () => {
        toast({
            title: "Attachments",
            description: "Attachment options coming soon!"
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (showCamera) {
        return <NativeCameraLens onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />;
    }

    return (
        <NativeLayout className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between p-4 pb-2 bg-[var(--color-native-bg)] dark:bg-[#0f172a] sticky top-0 z-20 pt-[calc(0.5rem+env(safe-area-inset-top))]">
                {/* Back Button */}
                <button
                    onClick={() => setLocation("/native/home")}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-900 dark:text-white"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                {/* Center - Avatar & Title */}
                <div className="flex-1 flex items-center justify-center gap-3">
                    <div className="relative flex items-center justify-center size-9 rounded-full bg-[#006a4e] shadow-md dark:shadow-green-900/50 border-2 border-white dark:border-slate-700 shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                        <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-[2px] shadow-sm flex items-center justify-center z-10">
                            <Settings className="w-3 h-3 text-[#f42a41] animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                    </div>
                    <h2 className="text-slate-900 dark:text-white text-lg font-bold leading-tight">Daktar Vai</h2>
                </div>

                {/* Camera Button */}
                <div className="flex items-center justify-end">
                    <button
                        onClick={handleImageCapture}
                        className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-[#36e27b]/20 text-[#36e27b] hover:bg-[#36e27b]/30 transition-colors"
                    >
                        <Camera className="w-4 h-4" />
                        <span className="text-xs font-bold whitespace-nowrap">DAKTAR ER LENS</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto p-4 pb-24 flex flex-col gap-4 scrollbar-hide">
                {/* Date Separator */}
                <div className="flex justify-center my-2">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                        Today, {formatTime(new Date())}
                    </span>
                </div>

                {messages.map((msg) => (
                    <div key={msg.id}>
                        {msg.role === "assistant" ? (
                            /* Assistant Message */
                            <div className="flex items-end gap-3">
                                <div className="bg-white dark:bg-[#1e293b] flex items-center justify-center aspect-square rounded-full w-10 shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
                                    <Bot className="w-5 h-5 text-[#36e27b]" />
                                </div>
                                <div className="flex flex-1 flex-col gap-1 items-start max-w-[85%]">
                                    <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium ml-1">Daktar Vai</p>
                                    <div className="text-base font-normal leading-relaxed rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-[#1e293b] text-slate-800 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-700">
                                        {msg.image && (
                                            <img
                                                src={msg.image}
                                                alt="Uploaded"
                                                className="rounded-lg mb-2 max-w-full h-auto"
                                            />
                                        )}
                                        <p className="whitespace-pre-wrap">{msg.content}</p>

                                        {/* Part Recommendation Card */}
                                        {msg.partRecommendation && (
                                            <div className="mt-3 w-full">
                                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex gap-3 items-center border border-slate-200 dark:border-slate-700/50">
                                                    <div className="size-16 rounded-lg bg-white p-1 shrink-0 overflow-hidden border border-slate-100 dark:border-slate-700">
                                                        <img
                                                            src={msg.partRecommendation.image}
                                                            alt={msg.partRecommendation.name}
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                                                            {msg.partRecommendation.name}
                                                        </h4>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            {msg.partRecommendation.partNumber}
                                                        </p>
                                                        <p className="text-[#36e27b] font-bold text-sm mt-0.5">
                                                            {msg.partRecommendation.price}
                                                        </p>
                                                    </div>
                                                    <button className="size-8 rounded-full bg-[#36e27b] flex items-center justify-center text-slate-900 hover:scale-105 transition-transform shadow-sm">
                                                        <ShoppingCart className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="mt-3 flex gap-2">
                                                    <button className="flex-1 py-2 px-3 rounded-lg bg-[#36e27b]/10 text-[#36e27b] hover:bg-[#36e27b]/20 text-xs font-bold text-center transition-colors">
                                                        Book Technician
                                                    </button>
                                                    <button className="flex-1 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs font-bold text-center transition-colors">
                                                        View Details
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Booking confirmation card */}
                                        {msg.booking && (
                                            <div className="mt-3 p-3 bg-[#36e27b]/10 rounded-xl border border-[#36e27b]/20">
                                                <div className="flex items-center gap-2 text-[#36e27b] mb-2">
                                                    <CheckCircle className="w-5 h-5" />
                                                    <span className="font-bold text-sm">Ticket Booked!</span>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    #{msg.booking.ticketNumber || msg.booking.id}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-slate-400 text-[10px] ml-1">{formatTime(msg.timestamp)}</span>
                                </div>
                            </div>
                        ) : (
                            /* User Message */
                            <div className="flex items-end gap-3 justify-end mt-2">
                                <div className="flex flex-1 flex-col gap-1 items-end max-w-[85%]">
                                    {msg.image ? (
                                        <div className="flex flex-col gap-2 p-1 bg-[#36e27b] rounded-2xl rounded-br-sm shadow-md overflow-hidden">
                                            <div className="h-40 w-full bg-slate-800 rounded-xl overflow-hidden relative">
                                                <img
                                                    src={msg.image}
                                                    alt="Sent"
                                                    className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
                                                />
                                            </div>
                                            {msg.content !== "📷 Image sent" && (
                                                <p className="px-3 pb-2 pt-1 text-slate-900 text-base">{msg.content}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-base font-normal leading-relaxed rounded-2xl rounded-br-sm px-4 py-3 bg-[#36e27b] text-slate-900 shadow-md">
                                            {msg.content}
                                        </div>
                                    )}
                                    <span className="text-slate-400 text-[10px] mr-1">Sent {formatTime(msg.timestamp)}</span>
                                </div>
                            </div>
                        )}

                        {/* Quick Reply Chips */}
                        {msg.role === "assistant" && msg.quickReplies && msg.quickReplies.length > 0 && (
                            <div className="flex gap-2 pl-12 flex-wrap mt-2">
                                {msg.quickReplies.map((reply, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleQuickReply(reply)}
                                        className="flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 pl-4 pr-4 hover:border-[#36e27b] dark:hover:border-[#36e27b] transition-colors group"
                                    >
                                        <span className="text-slate-700 dark:text-slate-300 text-sm font-medium group-hover:text-[#36e27b] transition-colors">
                                            {reply}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex items-end gap-3">
                        <div className="bg-white dark:bg-[#1e293b] flex items-center justify-center aspect-square rounded-full w-10 shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
                            <Bot className="w-5 h-5 text-[#36e27b]" />
                        </div>
                        <div className="flex flex-1 flex-col gap-1 items-start max-w-[85%]">
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-medium ml-1">Daktar Vai</p>
                            <div className="text-base font-normal leading-relaxed rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-[#1e293b] text-slate-800 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-[#36e27b]" />
                                    <span className="text-sm text-slate-500">Typing...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} className="h-6" />
            </main>

            {/* Pending Image Preview */}
            {pendingImage && (
                <div className="px-4 py-2 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-700">
                    <div className="relative inline-block">
                        <img
                            src={pendingImage}
                            alt="To send"
                            className="h-20 rounded-lg"
                        />
                        <button
                            onClick={() => setPendingImage(null)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="absolute bottom-0 w-full p-4 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-700 z-30 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="flex items-end gap-2">
                    {/* Add Button */}
                    <button
                        onClick={handleAddAction}
                        disabled={isLoading}
                        className="size-12 shrink-0 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors disabled:opacity-50"
                    >
                        <Plus className="w-6 h-6" />
                    </button>

                    {/* Text Input */}
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-[2rem] flex items-center min-h-[3rem] px-1 py-1 focus-within:ring-2 focus-within:ring-[#36e27b]/50 transition-all">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder={isListening ? "Listening..." : "Describe your problem..."}
                            disabled={isLoading || isListening}
                            className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-slate-900 dark:text-white placeholder:text-slate-400 px-4 py-2 text-base"
                        />
                        {/* Voice Button */}
                        <button
                            onClick={handleVoiceInput}
                            disabled={isLoading}
                            className={cn(
                                "p-2 mr-1 rounded-full transition-all duration-300",
                                isListening
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 animate-pulse scale-110"
                                    : "text-slate-400 hover:text-[#36e27b]",
                                !isVoiceSupported && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* Send Button */}
                    <button
                        onClick={() => sendMessage()}
                        disabled={isLoading || (!inputText.trim() && !pendingImage)}
                        className="size-12 shrink-0 flex items-center justify-center rounded-full bg-[#36e27b] text-slate-900 shadow-lg shadow-[#36e27b]/30 hover:shadow-[#36e27b]/50 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>
        </NativeLayout>
    );
}
