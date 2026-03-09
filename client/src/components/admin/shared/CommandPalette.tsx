import * as React from "react";
import { useLocation } from "wouter";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { User, Receipt, Wrench, LayoutDashboard, Settings, FileText, Package, ScrollText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api";
import { HighlightMatch } from "@/pages/admin/bento/shared/HighlightMatch";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [, setLocation] = useLocation();
    const { hasPermission } = useAdminAuth();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const { data: searchResults, isLoading } = useQuery({
        queryKey: ["global-search", searchQuery],
        queryFn: () => searchApi.global(searchQuery),
        enabled: searchQuery.length >= 2,
        staleTime: 1000 * 60, // 1 minute
    });

    const runCommand = React.useCallback(
        (command: () => unknown) => {
            setOpen(false);
            command();
        },
        []
    );

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput
                placeholder="Type a command or search..."
                value={searchQuery}
                onValueChange={setSearchQuery}
            />
            <CommandList>
                <CommandEmpty>
                    {isLoading ? "Searching..." : "No results found."}
                </CommandEmpty>

                {/* Navigation actions - cmdk will automatically filter these based on search query */}
                <CommandGroup heading="Suggestions">
                    {hasPermission("dashboard") && (
                        <CommandItem value="dashboard overview home" onSelect={() => runCommand(() => setLocation("/admin#dashboard"))}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Dashboard</span>
                        </CommandItem>
                    )}
                    {hasPermission("jobs") && (
                        <CommandItem value="jobs job tickets repairs" onSelect={() => runCommand(() => setLocation("/admin#jobs"))}>
                            <Wrench className="mr-2 h-4 w-4" />
                            <span>Job Tickets</span>
                        </CommandItem>
                    )}
                    {hasPermission("serviceRequests") && (
                        <CommandItem value="service requests" onSelect={() => runCommand(() => setLocation("/admin#service-requests"))}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Service Requests</span>
                        </CommandItem>
                    )}
                    {hasPermission("pos") && (
                        <CommandItem value="pos point of sale invoice" onSelect={() => runCommand(() => setLocation("/admin#pos"))}>
                            <Receipt className="mr-2 h-4 w-4" />
                            <span>Point of Sale</span>
                        </CommandItem>
                    )}
                    {hasPermission("settings") && (
                        <CommandItem value="settings configuration" onSelect={() => runCommand(() => setLocation("/admin#settings"))}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </CommandItem>
                    )}
                </CommandGroup>

                {/* Search Results */}
                {searchResults && (
                    <>
                        {searchResults.jobs.length > 0 && (
                            <CommandGroup heading="Job Tickets">
                                {searchResults.jobs.map((job) => (
                                    <CommandItem
                                        key={job.id}
                                        value={`${job.id} ${job.customer} ${job.device || ''} ${job.issue || ''}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#jobs?search=${job.id}`))}
                                    >
                                        <div className="flex flex-col gap-1 w-full">
                                            <div className="flex items-center">
                                                <Wrench className="mr-2 h-4 w-4 text-blue-500 shrink-0" />
                                                <span className="font-medium"><HighlightMatch text={job.id} query={searchQuery} /></span>
                                                <span className="text-muted-foreground ml-2">(<HighlightMatch text={job.customer} query={searchQuery} />)</span>
                                            </div>
                                            {(job.device || job.issue) && (
                                                <div className="text-xs text-muted-foreground ml-6 line-clamp-1">
                                                    {job.device && <><HighlightMatch text={job.device} query={searchQuery} /> • </>}
                                                    {job.issue && <HighlightMatch text={job.issue} query={searchQuery} />}
                                                </div>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {searchResults.serviceRequests.length > 0 && (
                            <CommandGroup heading="Service Requests">
                                {searchResults.serviceRequests.map((sr) => (
                                    <CommandItem
                                        key={sr.id}
                                        value={`${sr.ticketNumber} ${sr.customerName} ${sr.brand || ''} ${sr.modelNumber || ''} ${sr.primaryIssue || ''} ${sr.description || ''} ${sr.symptoms || ''}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#service-requests?search=${sr.ticketNumber}`))}
                                    >
                                        <div className="flex flex-col gap-1 w-full">
                                            <div className="flex items-center">
                                                <FileText className="mr-2 h-4 w-4 text-purple-500 shrink-0" />
                                                <span className="font-medium"><HighlightMatch text={sr.ticketNumber} query={searchQuery} /></span>
                                                <span className="text-muted-foreground ml-2">(<HighlightMatch text={sr.customerName} query={searchQuery} />)</span>
                                            </div>
                                            {(sr.brand || sr.modelNumber || sr.primaryIssue) && (
                                                <div className="text-xs text-muted-foreground ml-6 line-clamp-1">
                                                    {sr.brand && <><HighlightMatch text={sr.brand} query={searchQuery} /> </>}
                                                    {sr.modelNumber && <><HighlightMatch text={sr.modelNumber} query={searchQuery} /> • </>}
                                                    {sr.primaryIssue && <HighlightMatch text={sr.primaryIssue} query={searchQuery} />}
                                                </div>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {searchResults.customers.length > 0 && (
                            <CommandGroup heading="Customers">
                                {searchResults.customers.map((customer) => (
                                    <CommandItem
                                        key={customer.id}
                                        value={`${customer.name} ${customer.phone}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#customers?search=${customer.phone}`))}
                                    >
                                        <User className="mr-2 h-4 w-4 text-green-500" />
                                        <span><HighlightMatch text={customer.name} query={searchQuery} /></span>
                                        <span className="text-muted-foreground ml-2">(<HighlightMatch text={customer.phone} query={searchQuery} />)</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {searchResults.posTransactions.length > 0 && (
                            <CommandGroup heading="Invoices">
                                {searchResults.posTransactions.map((inv) => (
                                    <CommandItem
                                        key={inv.id}
                                        value={`${inv.invoiceNumber} ${inv.customer}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#pos?search=${inv.invoiceNumber}`))}
                                    >
                                        <Receipt className="mr-2 h-4 w-4 text-orange-500" />
                                        <span><HighlightMatch text={inv.invoiceNumber} query={searchQuery} /></span>
                                        <span className="text-muted-foreground ml-2">(<HighlightMatch text={inv.customer} query={searchQuery} />)</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {searchResults.inventory && searchResults.inventory.length > 0 && (
                            <CommandGroup heading="Inventory Items">
                                {searchResults.inventory.map((item) => (
                                    <CommandItem
                                        key={item.id}
                                        value={`${item.name} ${item.id} ${item.description || ''} ${item.sku || ''}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#inventory?search=${item.id}`))}
                                    >
                                        <div className="flex flex-col gap-1 w-full">
                                            <div className="flex items-center">
                                                <Package className="mr-2 h-4 w-4 text-teal-500 shrink-0" />
                                                <span className="font-medium"><HighlightMatch text={item.name} query={searchQuery} /></span>
                                                <span className="text-muted-foreground ml-2">(<HighlightMatch text={item.id} query={searchQuery} />)</span>
                                            </div>
                                            {(item.description || item.sku) && (
                                                <div className="text-xs text-muted-foreground ml-6 line-clamp-1">
                                                    {item.sku && <>SKU: <HighlightMatch text={item.sku} query={searchQuery} /> • </>}
                                                    {item.description && <HighlightMatch text={item.description} query={searchQuery} />}
                                                </div>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {searchResults.challans && searchResults.challans.length > 0 && (
                            <CommandGroup heading="Delivery Challans">
                                {searchResults.challans.map((challan) => (
                                    <CommandItem
                                        key={challan.id}
                                        value={`${challan.id} ${challan.receiver}`}
                                        onSelect={() => runCommand(() => setLocation(`/admin#challans?search=${challan.id}`))}
                                    >
                                        <ScrollText className="mr-2 h-4 w-4 text-indigo-500" />
                                        <span><HighlightMatch text={challan.id} query={searchQuery} /></span>
                                        <span className="text-muted-foreground ml-2">(<HighlightMatch text={challan.receiver} query={searchQuery} />)</span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
}
