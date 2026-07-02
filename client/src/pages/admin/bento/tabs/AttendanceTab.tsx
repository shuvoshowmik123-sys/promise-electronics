import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO
} from "date-fns";
import {
    Calendar, Clock, Users, CheckCircle, Download, UserCheck,
    MapPin, Navigation, Loader2, Activity, ShieldAlert, CheckCircle2, Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants, tableRowVariants } from "../shared/animations";
import { attendanceApi, adminUsersApi } from "@/lib/api";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";
import type { AttendanceRecord } from "@shared/schema";

function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function GeofenceBadge({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    if (status === "inside_office") return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 shrink-0">
            <MapPin className="h-2 w-2" />In Office
        </span>
    );
    if (status === "outside_office") return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 shrink-0">
            <MapPin className="h-2 w-2" />Outside
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 shrink-0">
            <MapPin className="h-2 w-2" />Unverified
        </span>
    );
}

// Mobile-native attendance report

interface MobileAttendanceReportProps {
    allAttendance: AttendanceRecord[];
    isLoading: boolean;
    staffUsers: { id: string; name: string; role: string }[];
    selectedMonth: string;
    setSelectedMonth: (v: string) => void;
    selectedUser: string;
    setSelectedUser: (v: string) => void;
    filteredAttendance: AttendanceRecord[];
}

function MobileAttendanceRecord({ record }: { record: AttendanceRecord }) {
    const formatTime = (d: string | Date | null) =>
        d ? format(new Date(d), "h:mm a") : "—";

    const duration = (checkIn: string | Date, checkOut: string | Date | null) => {
        if (!checkOut) return "In Progress";
        const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
        if (ms <= 0) return "0m";
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-black text-slate-900">
                            {format(parseISO(record.date), "EEE, MMM d")}
                        </span>
                        {record.date === format(new Date(), "yyyy-MM-dd") && (
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">Today</span>
                        )}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-600">
                        {record.userName}
                        <span className="ml-1 text-slate-400 font-medium">· {record.userRole}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <GeofenceBadge status={record.checkInGeofenceStatus} />
                    {record.checkOutTime ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-2 w-2" />Complete
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                            <Clock className="h-2 w-2" />Working
                        </span>
                    )}
                </div>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">In</div>
                    <div className="text-xs font-black text-emerald-700">{formatTime(record.checkInTime)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Out</div>
                    <div className="text-xs font-black text-slate-700">{formatTime(record.checkOutTime)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hours</div>
                    <div className="text-xs font-black text-slate-700">
                        {record.checkInTime ? duration(record.checkInTime, record.checkOutTime) : "—"}
                    </div>
                </div>
            </div>
            {(record.checkInAccuracy != null || (record.checkInLat != null && record.checkInLng != null)) && (
                <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
                    {record.checkInAccuracy != null && (
                        <span className="text-[10px] text-slate-400">±{Math.round(record.checkInAccuracy as number)}m</span>
                    )}
                    {record.checkInLat != null && record.checkInLng != null && (
                        <a
                            href={mapsUrl(record.checkInLat, record.checkInLng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                        >
                            <Navigation className="h-2.5 w-2.5" />Maps
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

function MobileAttendanceReport({
    allAttendance,
    isLoading,
    staffUsers,
    selectedMonth,
    setSelectedMonth,
    selectedUser,
    setSelectedUser,
    filteredAttendance,
}: MobileAttendanceReportProps) {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayRecords = useMemo(
        () => allAttendance.filter((r) => r.date === today),
        [allAttendance, today],
    );

    const stats = useMemo(() => ({
        present: todayRecords.length,
        working: todayRecords.filter((r) => r.checkInTime && !r.checkOutTime).length,
        outside: todayRecords.filter((r) => r.checkInGeofenceStatus === "outside_office").length,
        complete: todayRecords.filter((r) => r.checkOutTime).length,
    }), [todayRecords]);

    const [showFilters, setShowFilters] = useState(false);

    return (
        <div
            className="bg-[#f8fafc] px-3 pt-3 space-y-3"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
            {/* Header */}
            <div className="pb-1 flex items-start justify-between">
                <div>
                    <h1 className="text-base font-black text-slate-900">Attendance Report</h1>
                    <p className="text-xs text-slate-500">{format(new Date(), "MMMM yyyy")} · {allAttendance.length} total records</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 rounded-xl p-0 text-slate-500"
                    onClick={() => setShowFilters(!showFilters)}
                    aria-label="Toggle filters"
                >
                    <Filter className="h-4 w-4" />
                </Button>
            </div>

            {/* Today summary chips */}
            <div className="grid grid-cols-4 gap-1.5">
                {[
                    { label: "Present", value: stats.present, tone: "text-blue-700 bg-blue-50 border-blue-100", icon: Users },
                    { label: "Working", value: stats.working, tone: "text-emerald-700 bg-emerald-50 border-emerald-100", icon: Activity },
                    { label: "Outside", value: stats.outside, tone: "text-amber-700 bg-amber-50 border-amber-100", icon: ShieldAlert },
                    { label: "Done", value: stats.complete, tone: "text-slate-700 bg-white border-slate-200", icon: CheckCircle2 },
                ].map((chip) => (
                    <div key={chip.label} className={`rounded-2xl border p-2.5 flex flex-col items-center gap-1 ${chip.tone}`}>
                        <span className="text-lg font-black leading-none">{chip.value}</span>
                        <span className="text-[8px] font-black uppercase tracking-wide">{chip.label}</span>
                    </div>
                ))}
            </div>

            {/* Filters (collapsible) */}
            {showFilters && (
                <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 block mb-1">Month</label>
                        <Input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="h-9 rounded-xl border-slate-200 bg-slate-50 text-xs"
                        />
                    </div>
                    <div>
                        <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 block mb-1">Staff Member</label>
                        <Select value={selectedUser} onValueChange={setSelectedUser}>
                            <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 text-xs">
                                <SelectValue placeholder="All Staff" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Staff</SelectItem>
                                {staffUsers.map((u) => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name} · {u.role}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* Record count */}
            <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Records</span>
                <span className="text-[10px] font-bold text-slate-500">{filteredAttendance.length} found</span>
            </div>

            {/* Attendance cards */}
            {isLoading ? (
                <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading records...
                </div>
            ) : filteredAttendance.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
                    <Calendar className="mx-auto h-7 w-7 text-slate-300" />
                    <div className="mt-2 text-sm font-black text-slate-700">No records found</div>
                    <p className="mt-1 text-xs text-slate-500">Try adjusting the month or staff filters.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredAttendance.map((record) => (
                        <MobileAttendanceRecord key={record.id} record={record} />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AttendanceTab() {
    const isMobile = useAdminMobileMode();
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
    const [selectedUser, setSelectedUser] = useState<string>("all");

    const { data: allAttendance = [], isLoading: attendanceLoading } = useQuery({
        queryKey: ["allAttendance"],
        queryFn: attendanceApi.getAll,
    });

    const { data: users = [] } = useQuery({
        queryKey: ["adminUsers"],
        queryFn: adminUsersApi.lookup,
    });

    const staffUsers = users.filter(u => ["Technician", "Cashier", "Manager", "Driver"].includes(u.role));

    const filteredAttendance = useMemo(() => {
        let filtered = allAttendance;
        if (selectedMonth) {
            const [year, month] = selectedMonth.split("-");
            filtered = filtered.filter((record: AttendanceRecord) => record.date.startsWith(`${year}-${month}`));
        }
        if (selectedUser !== "all") {
            filtered = filtered.filter((record: AttendanceRecord) => record.userId === selectedUser);
        }
        return filtered;
    }, [allAttendance, selectedMonth, selectedUser]);

    const stats = useMemo(() => {
        const today = format(new Date(), "yyyy-MM-dd");
        const todayRecords = allAttendance.filter((r: AttendanceRecord) => r.date === today);
        return {
            presentToday: todayRecords.length,
            checkedOut: todayRecords.filter((r: AttendanceRecord) => r.checkOutTime).length,
            totalStaff: staffUsers.length,
            monthlyRecords: filteredAttendance.length,
        };
    }, [allAttendance, staffUsers, filteredAttendance]);

    const daysInMonth = useMemo(() => {
        const [year, month] = selectedMonth.split("-");
        const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const end = endOfMonth(start);
        return eachDayOfInterval({ start, end });
    }, [selectedMonth]);

    const getAttendanceForDay = (userId: string, date: Date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        return allAttendance.find((r: AttendanceRecord) => r.userId === userId && r.date === dateStr);
    };

    const formatTime = (dateString: string | Date | null) => {
        if (!dateString) return "-";
        return format(new Date(dateString), "h:mm a");
    };

    const calculateDuration = (checkIn: string | Date, checkOut: string | Date | null) => {
        if (!checkOut) return "In Progress";
        const start = new Date(checkIn);
        const end = new Date(checkOut);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const hours = Math.floor(diffHours);
        const minutes = Math.floor((diffHours - hours) * 60);
        return `${hours}h ${minutes}m`;
    };

    if (isMobile) {
        return (
            <MobileAttendanceReport
                allAttendance={allAttendance}
                isLoading={attendanceLoading}
                staffUsers={staffUsers}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                selectedUser={selectedUser}
                setSelectedUser={setSelectedUser}
                filteredAttendance={filteredAttendance}
            />
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-0"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Staff Attendance</h2>
                    <p className="text-muted-foreground">Monitor check-ins, work hours, and monthly logs</p>
                </div>
                <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    Export Report
                </Button>
            </motion.div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Present Today"
                        icon={<UserCheck className="w-5 h-5" />}
                        variant="vibrant"
                        className="border-green-100 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent"
                    >
                        <div className="text-3xl font-black tracking-tighter text-green-900 drop-shadow-sm font-mono mt-8">{stats.presentToday.toString()}</div>
                        <div className="text-green-700/80 text-sm mt-2">Out of {stats.totalStaff} staff</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Checked Out"
                        icon={<Clock className="w-5 h-5" />}
                        variant="glass"
                        className="border-blue-100"
                    >
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono mt-8">{stats.checkedOut.toString()}</div>
                        <div className="text-slate-500 text-sm mt-2">Completed shift</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Total Staff"
                        icon={<Users className="w-5 h-5" />}
                        variant="glass"
                    >
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono mt-8">{stats.totalStaff.toString()}</div>
                        <div className="text-slate-500 text-sm mt-2">Registered employees</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Working Days"
                        icon={<Calendar className="w-5 h-5" />}
                        variant="glass"
                    >
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono mt-8">{daysInMonth.length.toString()}</div>
                        <div className="text-slate-500 text-sm mt-2">In selected month</div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Filter Bar */}
            <motion.div variants={itemVariants} className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="w-full sm:w-48">
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Month</label>
                    <Input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                    />
                </div>
                <div className="w-full sm:w-64">
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider">Staff Member</label>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                        <SelectTrigger className="bg-slate-50 border-slate-200">
                            <SelectValue placeholder="All Staff" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Staff</SelectItem>
                            {staffUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                    {user.name} <span className="text-muted-foreground text-xs ml-2">({user.role})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </motion.div>

            {/* Main Content: Split View or Full Table */}
            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                {/* Table Section */}
                <motion.div variants={itemVariants} className={selectedUser !== 'all' ? "lg:col-span-2" : "lg:col-span-3"}>
                    <Card className="h-full border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-500" />
                                Attendance Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[500px]">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Staff</TableHead>
                                            <TableHead>Check In</TableHead>
                                            <TableHead>Check Out</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Location</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <AnimatePresence>
                                            {filteredAttendance.map((record: AttendanceRecord, i: number) => (
                                                <motion.tr
                                                    key={record.id}
                                                    variants={tableRowVariants}
                                                    initial="hidden"
                                                    animate="visible"
                                                    exit="exit"
                                                    custom={i}
                                                    className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0"
                                                >
                                                    <TableCell className="font-medium whitespace-nowrap">
                                                        {format(parseISO(record.date), "MMM d")}
                                                        {record.date === format(new Date(), "yyyy-MM-dd") && (
                                                            <Badge variant="outline" className="ml-2 border-blue-200 bg-blue-50 text-blue-700 h-5 px-1.5 text-[10px]">Today</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium text-slate-700">{record.userName}</span>
                                                            <span className="text-[10px] text-slate-400">{record.userRole}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-green-600 font-mono text-xs">
                                                        {formatTime(record.checkInTime)}
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 font-mono text-xs">
                                                        {formatTime(record.checkOutTime)}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-600 font-medium">
                                                        {calculateDuration(record.checkInTime, record.checkOutTime)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {record.checkOutTime ? (
                                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 pl-1 pr-2">
                                                                <CheckCircle className="w-3 h-3" /> Complete
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1 pl-1 pr-2 animate-pulse">
                                                                <Clock className="w-3 h-3" /> Working
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1 min-w-[80px]">
                                                            <GeofenceBadge status={record.checkInGeofenceStatus} />
                                                            {record.checkInAccuracy != null && (
                                                                <span className="text-[10px] text-slate-400">+-{Math.round(record.checkInAccuracy as number)}m</span>
                                                            )}
                                                            {record.checkInLat != null && record.checkInLng != null && (
                                                                <a
                                                                    href={mapsUrl(record.checkInLat!, record.checkInLng!)}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                                                                >
                                                                    <Navigation className="h-2.5 w-2.5" />Maps
                                                                </a>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                        {filteredAttendance.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                    No records found for selected filters
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Calendar Section - Only visible when a user is selected */}
                <AnimatePresence>
                    {selectedUser !== "all" && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="lg:col-span-1"
                        >
                            <Card className="h-full border-none shadow-sm bg-gradient-to-b from-white to-slate-50/50">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold">Monthly View</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-7 gap-2 mb-2">
                                        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => (
                                            <div key={day} className="text-center text-xs font-bold text-slate-400 uppercase">{day}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-2">
                                        {Array.from({ length: daysInMonth[0]?.getDay() || 0 }).map((_, i) => (
                                            <div key={`empty-${i}`} />
                                        ))}
                                        {daysInMonth.map((day, i) => {
                                            const attendance = getAttendanceForDay(selectedUser, day);
                                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                                            return (
                                                <motion.div
                                                    key={day.toISOString()}
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ delay: i * 0.01 }}
                                                    className={`
                            aspect-square rounded-lg flex flex-col items-center justify-center text-xs border relative
                            ${isToday(day) ? "ring-2 ring-primary ring-offset-1 z-10" : ""}
                            ${attendance
                                                            ? "bg-green-100 border-green-200 text-green-700"
                                                            : isWeekend
                                                                ? "bg-slate-100 border-slate-200 text-slate-400"
                                                                : day > new Date()
                                                                    ? "bg-transparent border-transparent text-slate-300"
                                                                    : "bg-rose-50 border-rose-100 text-rose-400"
                                                        }
                          `}
                                                >
                                                    <span className="font-semibold">{format(day, "d")}</span>
                                                    {attendance && <div className="w-1 h-1 bg-green-500 rounded-full mt-1" />}
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-6 space-y-2">
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <div className="w-3 h-3 rounded bg-green-100 border border-green-200" /> Present
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <div className="w-3 h-3 rounded bg-rose-50 border border-rose-100" /> Absent
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" /> Weekend / Off
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
