import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Mic, MicOff, Loader2, Bot, Camera, Image as ImageIcon, X } from "lucide-react";
import { aiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Message {
    role: "user" | "model";
    text: string;
}

interface AIBookingData {
    customer_name?: string;
    phone?: string;
    brand?: string;
    model?: string;
    screenSize?: string;
    issue?: string;
    description?: string;
    address?: string;
}

interface DaktarVaiChatIntakeProps {
    onBookingIntent: (data: AIBookingData) => void;
}

/**
 * Inline AI Chat for the Intake Wizard.
 * When booking data is extracted, it calls onBookingIntent callback.
 */
export function DaktarVaiChatIntake({ onBookingIntent }: DaktarVaiChatIntakeProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    // Web Speech API
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = "bn-BD";

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                if (transcript) {
                    setInput(prev => prev ? prev + " " + transcript : transcript);
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                if (event.error === 'no-speech' || event.error === 'aborted') {
                    setIsListening(false);
                    return;
                }
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            setInput("");
            try {
                recognitionRef.current?.start();
                setIsListening(true);
            } catch (e) {
                console.error("Speech recognition start error:", e);
                setIsListening(true);
            }
        }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSelectedImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setSelectedImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const sendMessage = async () => {
        if (!input.trim() && !selectedImage) return;

        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: "user", text: userMsg || "[Photo Sent]" }]);
        setIsLoading(true);

        try {
            const history = messages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            const response = await aiApi.chat(userMsg || "Please analyze this image", history, selectedImage || undefined, 'customer');
            setSelectedImage(null);

            setMessages(prev => [...prev, { role: "model", text: response.text }]);

            // Check for booking data from AI
            if (response.booking) {
                // AI has extracted booking intent - pass to parent
                const bookingData: AIBookingData = {
                    customer_name: response.booking.name,
                    phone: response.booking.phone,
                    brand: response.booking.brand,
                    model: response.booking.model,
                    screenSize: response.booking.screenSize,
                    issue: response.booking.issue,
                    description: response.booking.description,
                    address: response.booking.address,
                };

                toast({
                    title: "Booking Details Captured!",
                    description: "Daktar Vai has extracted your repair details.",
                });

                // Small delay to let user see the confirmation
                setTimeout(() => {
                    onBookingIntent(bookingData);
                }, 1500);
            }

        } catch (error) {
            console.error("Chat error:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to send message";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-scroll to bottom
    useEffect(() => {
        const scrollArea = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollArea) {
            scrollArea.scrollTop = scrollArea.scrollHeight;
        }
    }, [messages]);

    return (
        <Card className="bg-white shadow-neumorph-inset border-none rounded-xl overflow-hidden">
            <CardHeader className="bg-blue-600 text-white py-3 px-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="h-6 w-6" />
                    Daktar Vai
                </CardTitle>
                <p className="text-xs text-blue-100">AI TV Repair Expert</p>
            </CardHeader>

            <ScrollArea className="h-[300px] p-4 bg-slate-50" ref={scrollRef}>
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="text-center text-sm text-muted-foreground mt-10">
                            <p>👋 Hi! Ami Daktar Vai.</p>
                            <p>Apnar TV niye ki somossa? Bolun ba photo pathate paren.</p>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex w-full",
                                m.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            <div
                                className={cn(
                                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                                    m.role === "user"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                                )}
                            >
                                {m.text}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Image Preview */}
            {selectedImage && (
                <div className="px-4 py-2 bg-slate-100 border-t">
                    <div className="relative inline-block">
                        <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border" />
                        <button
                            onClick={removeImage}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            )}

            <CardFooter className="p-3 bg-white border-t">
                <div className="flex w-full gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageSelect}
                        className="hidden"
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Camera className="h-5 w-5 text-slate-600" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("shrink-0", isListening && "text-red-500 bg-red-50")}
                        onClick={toggleListening}
                    >
                        {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                        placeholder="Type or speak..."
                        className="flex-1"
                    />
                    <Button size="icon" onClick={sendMessage} disabled={isLoading || (!input.trim() && !selectedImage)}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
