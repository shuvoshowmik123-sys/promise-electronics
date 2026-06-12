/**
 * ReminderBell — header icon that shows pending reminder count + popover list.
 * Phase 3: Reminders UI
 */
import { BellRing, Plus, Check, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { getApiUrl } from "@/lib/config";
import { useRemindersSSE } from "@/hooks/useRemindersSSE";

interface Reminder {
    id: string;
    title: string;
    body: string | null;
    remindAt: string;
    isSent: boolean;
    isDismissed: boolean;
    jobId: string | null;
}

async function fetchReminders(): Promise<Reminder[]> {
    const res = await fetch(getApiUrl("/api/reminders"), { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch reminders");
    return res.json();
}

export function ReminderBell() {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newAt, setNewAt] = useState("");
    useRemindersSSE();

    const { data: allReminders = [] } = useQuery<Reminder[]>({
        queryKey: ["reminders"],
        queryFn: fetchReminders,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const pending = allReminders.filter(r => !r.isDismissed && !r.isSent);
    const recent = allReminders.filter(r => r.isSent && !r.isDismissed).slice(0, 5);

    const dismissMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(getApiUrl(`/api/reminders/${id}/dismiss`), { method: "PATCH", credentials: "include" });
            if (!res.ok) throw new Error("Failed to dismiss");
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
    });

    const createMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(getApiUrl("/api/reminders"), {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newTitle, remindAt: newAt }),
            });
            if (!res.ok) throw new Error("Failed to create");
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["reminders"] });
            setNewTitle("");
            setNewAt("");
            setShowCreate(false);
            toast.success("Reminder set");
        },
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button className="h-9 w-9 md:h-10 md:w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer relative" aria-label="Reminders" title="Reminders">
                    <BellRing className="h-[18px] w-[18px]" />
                    {pending.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[1.2rem] rounded-full border-2 border-white bg-rose-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
                            {pending.length > 9 ? "9+" : pending.length}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <span className="font-semibold text-sm">Reminders</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setShowCreate(v => !v)}
                    >
                        <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                </div>

                {showCreate && (
                    <div className="px-4 py-3 border-b space-y-2 bg-muted/40">
                        <Input
                            placeholder="Reminder title"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            className="h-8 text-sm"
                        />
                        <Input
                            type="datetime-local"
                            value={newAt}
                            onChange={e => setNewAt(e.target.value)}
                            className="h-8 text-sm"
                        />
                        <Button
                            size="sm"
                            className="w-full h-8 text-xs"
                            disabled={!newTitle.trim() || !newAt || createMutation.isPending}
                            onClick={() => createMutation.mutate()}
                        >
                            Save Reminder
                        </Button>
                    </div>
                )}

                <div className="max-h-72 overflow-y-auto divide-y">
                    {pending.length === 0 && recent.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground py-6">No reminders</p>
                    )}

                    {pending.map(r => (
                        <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                            <Clock className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{r.title}</p>
                                <p className="text-xs text-muted-foreground">
                                    {format(new Date(r.remindAt), "d MMM, h:mm a")}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => dismissMutation.mutate(r.id)}
                            >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                        </div>
                    ))}

                    {recent.map(r => (
                        <div key={r.id} className="flex items-start gap-3 px-4 py-3 opacity-50">
                            <Check className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm truncate line-through">{r.title}</p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => dismissMutation.mutate(r.id)}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
