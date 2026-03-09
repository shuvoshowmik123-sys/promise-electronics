import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, X } from "lucide-react";
import { shadowLedger, ShadowLedgerEntry } from "@/lib/shadowLedger";
import { useOffline } from "@/contexts/OfflineContext";

export function SyncConflictReview() {
    const { isOnline } = useOffline();
    const [conflicts, setConflicts] = useState<ShadowLedgerEntry[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const fetchConflicts = async () => {
            // Direct raw query of shadowLedger for specific state "conflict"
            // Wait, there is no direct "getConflict" function in class. 
            // I'll create a generic db read here or map from getPending:
            const db = await (shadowLedger as any)._dbPromise;
            if (!db) return;
            const allConflicts = await db.getAllFromIndex('transactions', 'syncStatus', 'conflict');
            if (allConflicts.length > 0) {
                setConflicts(allConflicts);
                setIsOpen(true);
            }
        };

        if (isOnline) {
            fetchConflicts();
            const interval = setInterval(fetchConflicts, 10000);
            return () => clearInterval(interval);
        }
    }, [isOnline]);

    const handleResolve = async (id: string, action: "keep-offline" | "discard") => {
        if (action === "discard") {
            // Simply mark as "failed" permanently, meaning we won't try again.
            await shadowLedger.markStatus(id, "failed");
            setConflicts(prev => prev.filter(c => c.id !== id));
        } else {
            // Keep offline state: Retry it blindly. The actual application logic for resolving 
            // negative stock (e.g. override limits) is complex, so "keep-offline" forces a retry 
            // which the server will reject again unless the server logic is changed,
            // OR it can be pushed as "failed" but applied locally...
            // For MVP, "discard" rejects the offline mutation.
            alert("Keep offline functionality requires explicit server override endpoint (Not included in MVP).");
        }

        if (conflicts.length <= 1) {
            setIsOpen(false);
        }
    };

    if (!isOpen || conflicts.length === 0) return null;

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[600px] border-red-500/20 bg-background/95 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-500">
                        <AlertCircle className="w-5 h-5" />
                        Offline Sync Conflicts Detected
                    </DialogTitle>
                    <DialogDescription>
                        {conflicts.length} action(s) performed offline could not be synchronized with the server due to conflicting stock or data.
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
                    {conflicts.map((entry) => (
                        <div key={entry.id} className="p-4 rounded-xl shadow-sm border border-red-500/10 bg-red-500/5">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-semibold text-sm">
                                    {entry.type === 'pos_sale' ? 'POS Sale' : 'Job Update'} - {new Date(entry.createdAt).toLocaleTimeString()}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                                    Target: {entry.endpoint}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">
                                <strong>Reason:</strong> {(entry.payload as any)?._conflictReason || 'Server rejected due to unresolvable conflict.'}
                            </p>

                            <div className="flex items-center gap-2 justify-end mt-4 pt-4 border-t border-red-500/10">
                                <Button variant="outline" size="sm" onClick={() => handleResolve(entry.id, "discard")}>
                                    <X className="w-4 h-4 mr-2" /> Discard Action
                                </Button>
                                <Button variant="default" size="sm" className="bg-red-500 hover:bg-red-600 text-white" onClick={() => handleResolve(entry.id, "keep-offline")}>
                                    <Check className="w-4 h-4 mr-2" /> Force Accept
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
