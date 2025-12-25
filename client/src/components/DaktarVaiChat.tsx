import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Mic, MicOff, Loader2, Bot } from "lucide-react";
import { aiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface Message {
    role: "user" | "model";
    text: string;
}

export function DaktarVaiChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    // Web Speech API
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = "bn-BD"; // Bengali (Bangladesh)

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
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
        } else {
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: "user", text: userMsg }]);
        setIsLoading(true);

        try {
            // Convert messages to history format for API
            const history = messages.map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

            const response = await aiApi.chat(userMsg, history);

            setMessages(prev => [...prev, { role: "model", text: response.text }]);

            if (response.booking) {
                toast({
                    title: "Booking Confirmed!",
                    description: "Daktar Vai has booked your ticket.",
                });
                // Optionally redirect to booking details or show a success card
            }

        } catch (error) {
            console.error("Chat error:", error);
            toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
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
    }, [messages, isOpen]);

    return (
        <>
            {/* Floating Button */}
            <Button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 transition-all duration-300",
                    isOpen ? "rotate-90 bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                )}
            >
                {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
            </Button>

            {/* Chat Window */}
            {isOpen && (
                <Card className="fixed bottom-24 right-6 w-[350px] h-[500px] shadow-xl z-50 flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-300 border-2 border-blue-100">
                    <CardHeader className="bg-blue-600 text-white rounded-t-lg py-3 px-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Bot className="h-6 w-6" />
                            Daktar Vai
                        </CardTitle>
                        <p className="text-xs text-blue-100">AI Assistant • Promise Electronics</p>
                    </CardHeader>

                    <ScrollArea className="flex-1 p-4 bg-slate-50" ref={scrollRef}>
                        <div className="space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground mt-10">
                                    <p>👋 Hi! Ami Daktar Vai.</p>
                                    <p>Apnar TV niye ki somossa?</p>
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
                                            "max-w-[80%] rounded-lg px-3 py-2 text-sm",
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

                    <CardFooter className="p-3 bg-white border-t">
                        <div className="flex w-full gap-2">
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
                            <Button size="icon" onClick={sendMessage} disabled={isLoading || !input.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            )}
        </>
    );
}
