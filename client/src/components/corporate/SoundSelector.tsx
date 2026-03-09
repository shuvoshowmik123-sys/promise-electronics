
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Play, Volume2 } from "lucide-react";
import {
    NOTIFICATION_TONES,
    playNotificationSound,
    type NotificationTone
} from "@/lib/notification-sound";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { useToast } from "@/hooks/use-toast";

interface SoundSelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SoundSelector({ open, onOpenChange }: SoundSelectorProps) {
    const { user, refreshUser } = useCorporateAuth();
    const { toast } = useToast();
    const [selectedTone, setSelectedTone] = useState<NotificationTone>(() => {
        try {
            const prefs = JSON.parse(user?.preferences || "{}");
            return (prefs.notificationSound as NotificationTone) || "default";
        } catch {
            return "default";
        }
    });

    const [isSaving, setIsSaving] = useState(false);

    const handlePlay = (tone: NotificationTone) => {
        playNotificationSound(tone);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/corporate/portal/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preferences: {
                        notificationSound: selectedTone
                    }
                })
            });

            if (!res.ok) throw new Error("Failed to save");

            await refreshUser();
            toast({
                title: "Settings Saved",
                description: "Your notification sound has been updated.",
            });
            onOpenChange(false);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save settings. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Volume2 className="h-5 w-5 text-[var(--corp-blue)]" />
                        Notification Sound
                    </DialogTitle>
                    <DialogDescription>
                        Choose a sound for new notifications.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <RadioGroup
                        value={selectedTone}
                        onValueChange={(val) => setSelectedTone(val as NotificationTone)}
                        className="gap-3"
                    >
                        {NOTIFICATION_TONES.map((tone) => (
                            <div
                                key={tone.value}
                                className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedTone === tone.value
                                        ? "border-[var(--corp-blue)] bg-blue-50/50"
                                        : "border-transparent hover:bg-slate-50"
                                    }`}
                                onClick={() => setSelectedTone(tone.value)}
                            >
                                <div className="flex items-center space-x-3">
                                    <RadioGroupItem value={tone.value} id={`tone-${tone.value}`} />
                                    <Label htmlFor={`tone-${tone.value}`} className="cursor-pointer font-medium text-slate-700">
                                        {tone.label}
                                    </Label>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 rounded-full text-[var(--corp-blue)] hover:bg-white hover:shadow-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlay(tone.value);
                                    }}
                                >
                                    <Play className="h-4 w-4 fill-current" />
                                </Button>
                            </div>
                        ))}
                    </RadioGroup>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving} className="bg-[var(--corp-blue)] font-bold">
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
