
import { CorporateClient } from "@shared/schema";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, ExternalLink, Building2, ChevronRight, ChevronDown, MapPin, Plus } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ClientListProps {
    clients: CorporateClient[];
    isLoading: boolean;
    onEdit: (client: CorporateClient) => void;
}

export function ClientList({ clients, isLoading, onEdit }: ClientListProps) {
    if (isLoading) {
        return <div className="text-center py-12 text-muted-foreground">Loading clients...</div>;
    }

    if (clients.length === 0) {
        return <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">No clients found</div>;
    }

    // Group clients: Masters and their branches
    const masters = clients.filter(c => !c.parentClientId);
    const branchesMap = new Map<string, CorporateClient[]>();

    clients.filter(c => c.parentClientId).forEach(branch => {
        if (branch.parentClientId) {
            const existing = branchesMap.get(branch.parentClientId) || [];
            branchesMap.set(branch.parentClientId, [...existing, branch]);
        }
    });

    return (
        <div className="space-y-4">
            {masters.map(master => (
                <ClientGroup
                    key={master.id}
                    master={master}
                    branches={branchesMap.get(master.id) || []}
                    onEdit={onEdit}
                />
            ))}
        </div>
    );
}

function ClientGroup({
    master,
    branches,
    onEdit
}: {
    master: CorporateClient,
    branches: CorporateClient[],
    onEdit: (c: CorporateClient) => void
}) {
    const [isOpen, setIsOpen] = useState(false);
    const hasBranches = branches.length > 0;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-xl bg-card overflow-hidden transition-all hover:shadow-sm">
            {/* Master Client Row */}
            <div className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                {/* Expand Toggle */}
                {hasBranches ? (
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </CollapsibleTrigger>
                ) : (
                    <div className="w-8 shrink-0" />
                )}

                {/* Icon */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 grid gap-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{master.companyName}</h3>
                        <Badge variant="secondary" className="font-mono text-[10px]">{master.shortCode}</Badge>
                        {hasBranches && <Badge variant="outline" className="text-[10px]">{branches.length} Branches</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="truncate max-w-[200px]">{master.contactPerson || "No contact"}</span>
                        <span>•</span>
                        <span>{master.contactPhone || "No phone"}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(master)}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Link href={`/admin/corporate/${master.id}/repairs`}>
                        <Button variant="outline" size="sm" className="hidden sm:flex">
                            <ExternalLink className="mr-2 h-3 w-3" />
                            Portal
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Branches List */}
            <CollapsibleContent>
                <div className="border-t bg-muted/30 pl-16 pr-4 py-2 space-y-1">
                    {branches.map(branch => (
                        <div key={branch.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-background transition-colors group">
                            <div className="flex items-center gap-3">
                                <MapPin className="h-4 w-4 text-muted-foreground/70" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-foreground/80">{branch.branchName || branch.companyName}</p>
                                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 rounded">{branch.shortCode}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {branch.contactPerson !== master.contactPerson ? branch.contactPerson : "Same as HQ"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(branch)}>
                                    <Edit className="h-3 w-3" />
                                </Button>
                                <Link href={`/admin/corporate/${branch.id}/repairs`}>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <ExternalLink className="h-3 w-3" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                    <div className="py-2">
                        <Button variant="ghost" size="sm" className="ml-7 text-xs text-muted-foreground" onClick={() => onEdit(master)}>
                            <Plus className="mr-2 h-3 w-3" /> Add another branch
                        </Button>
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
