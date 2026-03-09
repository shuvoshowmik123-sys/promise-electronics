import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface FilterBarProps {
    statusFilter: string;
    setStatusFilter: (value: string) => void;
    billingFilter: string;
    setBillingFilter: (value: string) => void;
    technicianFilter: string;
    setTechnicianFilter: (value: string) => void;
    dateRange: DateRange | undefined;
    setDateRange: (range: DateRange | undefined) => void;
    technicians: any[];
    onReset: () => void;
}

export function FilterBar({
    statusFilter,
    setStatusFilter,
    billingFilter,
    setBillingFilter,
    technicianFilter,
    setTechnicianFilter,
    dateRange,
    setDateRange,
    technicians,
    onReset,
}: FilterBarProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex items-center h-10">
            <AnimatePresence mode="wait">
                {!isOpen ? (
                    <motion.div
                        key="collapsed"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsOpen(true)}
                            className="gap-2 bg-background border-dashed"
                        >
                            <Filter className="h-4 w-4" />
                            Filters
                        </Button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="expanded"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="flex items-start md:items-center gap-2 overflow-x-auto pb-2 md:pb-0 bg-background border rounded-md p-1 shadow-sm max-w-full"
                    >
                        {/* Close Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted text-muted-foreground mr-1 shrink-0 mt-0.5 md:mt-0"
                            onClick={() => setIsOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-2 px-1 flex-wrap md:flex-nowrap min-w-max md:min-w-0 pr-6 md:pr-1">
                            {/* Status Filter */}
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px] h-8 text-xs">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Approval Requested">Approval Requested</SelectItem>
                                    <SelectItem value="Diagnosing">Diagnosing</SelectItem>
                                    <SelectItem value="Pending Parts">Pending Parts</SelectItem>
                                    <SelectItem value="Repairing">Repairing</SelectItem>
                                    <SelectItem value="Ready">Ready</SelectItem>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="Delivered">Delivered</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Billing Filter */}
                            <Select value={billingFilter} onValueChange={setBillingFilter}>
                                <SelectTrigger className="w-[110px] h-8 text-xs">
                                    <SelectValue placeholder="Billing" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Billing: All</SelectItem>
                                    <SelectItem value="billed">Billed</SelectItem>
                                    <SelectItem value="unbilled">Unbilled</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Technician Filter */}
                            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                                <SelectTrigger className="w-[130px] h-8 text-xs">
                                    <SelectValue placeholder="Technician" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tech: All</SelectItem>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {technicians.map((tech) => (
                                        <SelectItem key={tech.id} value={tech.name}>
                                            {tech.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Date Range Picker */}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="date"
                                        variant={"outline"}
                                        size="sm"
                                        className={cn(
                                            "w-[200px] h-8 justify-start text-left font-normal text-xs",
                                            !dateRange && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-3 w-3" />
                                        {dateRange?.from ? (
                                            dateRange.to ? (
                                                <>
                                                    {format(dateRange.from, "LLL dd, y")} -{" "}
                                                    {format(dateRange.to, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(dateRange.from, "LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={dateRange?.from}
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>

                            {/* Reset Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                                onClick={onReset}
                                title="Reset Filters"
                            >
                                <RefreshCw className="h-3 w-3" />
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}
