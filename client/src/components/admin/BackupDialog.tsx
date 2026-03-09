import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Lock, CloudUpload } from "lucide-react";
import { toast } from "sonner";
// import { useAdminAuth } from "@/contexts/AdminAuthContext"; // Not needed for token, handled via cookies

interface BackupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
    const [password, setPassword] = useState("");
    const [description, setDescription] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleBackup = async () => {
        if (!password || password.length < 8) {
            toast.error("Password must be at least 8 characters long");
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch("/api/admin/backups", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // Authorization header removed as auth is handled via cookies
                },
                body: JSON.stringify({
                    password,
                    description: description || "Manual User Backup"
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Backup failed");
            }

            toast.success("Backup created successfully!");
            onOpenChange(false);
            setPassword("");
            setDescription("");
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CloudUpload className="w-5 h-5" />
                        Create Manual Backup
                    </DialogTitle>
                    <DialogDescription>
                        This will create a full system snapshot, encrypt it, and upload it to Google Drive.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Encryption Password <span className="text-red-500">*</span></Label>
                        <div className="relative">
                            <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter secure password"
                                className="pl-9"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            You will need this password to restore the backup. Do not lose it.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Textarea
                            id="description"
                            placeholder="e.g., Pre-deployment backup"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleBackup} disabled={isLoading || !password}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Start Backup
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
