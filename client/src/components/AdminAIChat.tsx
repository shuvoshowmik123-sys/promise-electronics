
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, X, Send, Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { aiApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";

interface VisualData {
    type: "bar" | "line" | "pie" | "stat_card";
    title?: string;
    description?: string;
    data: any[];
    xAxisKey?: string;
    dataKey?: string;
}

interface Message {
    role: "user" | "model";
    text: string;
    visual?: VisualData;
    settingsAction?: {
        type: "UPDATE_SETTINGS";
        changes: { key: string; oldValue: string; newValue: string; confidence: number }[];
        requiresApproval: boolean;
    };
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];

// Settings Preview Component
const SettingsPreview = ({ action, onApply, onReject }: {
    action: NonNullable<Message['settingsAction']>;
    onApply: () => void;
    onReject: () => void;
}) => {
    return (
        <div className="mt-3 w-full bg-amber-50 rounded-lg p-3 border border-amber-200">
            <h4 className="text-sm font-semibold mb-2 text-amber-800 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Proposed Settings Changes
            </h4>

            <div className="space-y-2 mb-3">
                {action.changes.map((change, idx) => (
                    <div key={idx} className="text-xs bg-white p-2 rounded border border-amber-100">
                        <div className="font-medium text-slate-500 mb-1">{change.key}</div>
                        <div className="flex items-center gap-2">
                            <span className="line-through text-red-400 opacity-70">{change.oldValue}</span>
                            <span className="text-slate-400">→</span>
                            <span className="font-bold text-green-600">{change.newValue}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100" onClick={onReject}>
                    Reject
                </Button>
                <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={onApply}>
                    Apply Changes
                </Button>
            </div>
        </div>
    );
};

const VisualRenderer = ({ visual }: { visual: VisualData }) => {
    if (!visual || !visual.data) return null;

    return (
        <div className="mt-3 w-full bg-slate-50 rounded-lg p-3 border border-slate-200">
            {visual.title && <h4 className="text-sm font-semibold mb-2 text-slate-700">{visual.title}</h4>}

            <div className="h-[200px] w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                    {visual.type === 'bar' ? (
                        <BarChart data={visual.data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={visual.xAxisKey || 'name'} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey={visual.dataKey || 'value'} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    ) : visual.type === 'line' ? (
                        <LineChart data={visual.data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey={visual.xAxisKey || 'name'} />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey={visual.dataKey || 'value'} stroke="#8b5cf6" strokeWidth={2} />
                        </LineChart>
                    ) : visual.type === 'pie' ? (
                        <PieChart>
                            <Pie
                                data={visual.data}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey={visual.dataKey || 'value'}
                            >
                                {visual.data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {visual.data.map((item, i) => (
                                <div key={i} className="flex justify-between items-center p-2 bg-white rounded border">
                                    <span className="text-slate-600">{item.name}</span>
                                    <span className="font-bold text-slate-900">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </ResponsiveContainer>
            </div>
            {visual.description && <p className="text-xs text-slate-500 mt-2 italic">{visual.description}</p>}
        </div>
    );
};

export function AdminAIChat({ initialOpen = false }: { initialOpen?: boolean }) {
    const [isOpen, setIsOpen] = useState(initialOpen);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    // Draggable state - supports snapping to 4 corners
    const [corner, setCorner] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>('bottom-right');
    const [tempPosition, setTempPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ clientX: 0, clientY: 0 });

    // Web Speech API
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = "en-US"; // Admin likely prefers English or mixed

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

    const handleApplySettings = async (changes: any[]) => {
        try {
            await aiApi.applySettings(changes);
            toast({ title: "Success", description: "Settings updated successfully" });

            // Add system message confirmation
            setMessages(prev => [...prev, {
                role: "model",
                text: "✅ Changes applied successfully!"
            }]);
        } catch (error) {
            console.error("Failed to apply settings:", error);
            toast({ title: "Error", description: "Failed to apply settings", variant: "destructive" });
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

            const response = await aiApi.chat(userMsg, history, undefined, 'admin');

            setMessages(prev => [...prev, {
                role: "model",
                text: response.text,
                visual: response.visual,
                settingsAction: response.settingsAction
            }]);

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

    // Drag handlers for floating button - snaps to corners
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { clientX: e.clientX, clientY: e.clientY };
        setTempPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        setTempPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (!isDragging) return;
        snapToCorner(e.clientX, e.clientY);
    };

    // Touch handlers for mobile devices
    const handleTouchStart = (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = e.touches[0];
        setIsDragging(true);
        dragStartRef.current = { clientX: touch.clientX, clientY: touch.clientY };
        setTempPosition({ x: touch.clientX, y: touch.clientY });
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        setTempPosition({ x: touch.clientX, y: touch.clientY });
    };

    const handleTouchEnd = (e: TouchEvent) => {
        if (!isDragging) return;
        const touch = e.changedTouches[0];
        snapToCorner(touch.clientX, touch.clientY);
    };

    // Common snap-to-corner logic
    const snapToCorner = (clientX: number, clientY: number) => {
        setIsDragging(false);
        setTempPosition(null);

        const midX = window.innerWidth / 2;
        const midY = window.innerHeight / 2;
        const isRight = clientX > midX;
        const isBottom = clientY > midY;

        if (isRight && isBottom) setCorner('bottom-right');
        else if (!isRight && isBottom) setCorner('bottom-left');
        else if (isRight && !isBottom) setCorner('top-right');
        else setCorner('top-left');
    };

    // Add/remove drag listeners (mouse + touch)
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleTouchMove, { passive: false });
            window.addEventListener('touchend', handleTouchEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging]);

    // Get button position style based on corner or temp position during drag
    const getButtonStyle = (): React.CSSProperties => {
        const offset = 24;
        if (isDragging && tempPosition) {
            return {
                left: tempPosition.x - 28,
                top: tempPosition.y - 28,
                transition: 'none',
            };
        }

        switch (corner) {
            case 'bottom-right':
                return { right: offset, bottom: offset };
            case 'bottom-left':
                return { left: offset, bottom: offset };
            case 'top-right':
                return { right: offset, top: offset };
            case 'top-left':
                return { left: offset, top: offset };
        }
    };

    // Get chat window position based on icon corner
    const getChatWindowStyle = (): React.CSSProperties => {
        const offset = 24;
        const buttonSize = 56; // h-14 = 56px
        const gap = 12; // Gap between button and chat

        switch (corner) {
            case 'bottom-right':
                return { right: offset, bottom: offset + buttonSize + gap };
            case 'bottom-left':
                return { left: offset, bottom: offset + buttonSize + gap };
            case 'top-right':
                return { right: offset, top: offset + buttonSize + gap };
            case 'top-left':
                return { left: offset, top: offset + buttonSize + gap };
        }
    };

    // Get animation class based on corner
    const getChatAnimationClass = () => {
        if (corner.includes('bottom')) {
            return 'animate-in slide-in-from-bottom-10 fade-in duration-300';
        }
        return 'animate-in slide-in-from-top-10 fade-in duration-300';
    };

    return (
        <>
            {/* Floating Button - Draggable, snaps to corners */}
            <Button
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onClick={() => !isDragging && setIsOpen(!isOpen)}
                className={cn(
                    "fixed h-14 w-14 rounded-full shadow-lg z-50 cursor-grab active:cursor-grabbing touch-none",
                    isDragging ? "transition-none" : "transition-all duration-300",
                    isOpen ? "rotate-90 bg-slate-800 hover:bg-slate-900" : "bg-violet-600 hover:bg-violet-700"
                )}
                style={getButtonStyle()}
            >
                {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
            </Button>

            {/* Chat Window - positions relative to button corner */}
            {isOpen && (
                <Card
                    className={cn(
                        "fixed w-[380px] h-[600px] shadow-2xl z-50 flex flex-col border-2 border-violet-100",
                        getChatAnimationClass()
                    )}
                    style={getChatWindowStyle()}
                >
                    <CardHeader className="bg-violet-600 text-white rounded-t-lg py-3 px-4">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Sparkles className="h-5 w-5" />
                            Admin Co-Pilot
                        </CardTitle>
                        <p className="text-xs text-violet-100">Business Intelligence & Support</p>
                    </CardHeader>

                    <ScrollArea className="flex-1 p-4 bg-slate-50" ref={scrollRef}>
                        <div className="space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground mt-10 px-4">
                                    <div className="bg-violet-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Sparkles className="h-6 w-6 text-violet-600" />
                                    </div>
                                    <p className="font-medium text-slate-900">Hello, Admin!</p>
                                    <p className="mt-1">I can help you analyze revenue, check inventory, or draft customer messages.</p>

                                    <div className="mt-6 grid grid-cols-1 gap-2 text-xs">
                                        <Button variant="outline" size="sm" className="justify-start h-auto py-2" onClick={() => setInput("Show me today's revenue summary")}>
                                            "Show me today's revenue"
                                        </Button>
                                        <Button variant="outline" size="sm" className="justify-start h-auto py-2" onClick={() => setInput("Update shop name to Promise Electronics BD")}>
                                            "Update shop name..."
                                        </Button>
                                        <Button variant="outline" size="sm" className="justify-start h-auto py-2" onClick={() => setInput("Draft a message for customers about Eid holiday")}>
                                            "Draft holiday announcement"
                                        </Button>
                                    </div>
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
                                                ? "bg-violet-600 text-white"
                                                : "bg-white border border-slate-200 text-slate-800 shadow-sm"
                                        )}
                                    >
                                        {m.text}
                                        {m.visual && <VisualRenderer visual={m.visual} />}
                                        {m.settingsAction && (
                                            <SettingsPreview
                                                action={m.settingsAction}
                                                onApply={() => handleApplySettings(m.settingsAction!.changes)}
                                                onReject={() => toast({ title: "Cancelled", description: "Changes rejected" })}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
                                        <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
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
                                placeholder="Ask about your shop..."
                                className="flex-1"
                            />
                            <Button size="icon" onClick={sendMessage} disabled={isLoading || !input.trim()} className="bg-violet-600 hover:bg-violet-700">
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardFooter>
                </Card>
            )}
        </>
    );
}
