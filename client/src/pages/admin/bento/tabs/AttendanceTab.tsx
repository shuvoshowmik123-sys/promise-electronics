import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO
} from "date-fns";
import {
    Calendar, Clock, Users, CheckCircle, Download, UserCheck,
    MapPin, Loader2, Activity, ShieldAlert, CheckCircle2, Filter,
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
import { attendanceApi } from "@/lib/api";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { canViewAttendanceReport } from "@/lib/attendance-capabilities";
import type { AttendanceRecord } from "@shared/schema";
import { getAttendanceDateDhaka, hasAttendanceCorrection } from "@shared/attendance-utils";
import {
    AttendanceLocationViewer,
    ViewLocationButton,
} from "@/components/admin/attendance/AttendanceLocationViewer";
import { StaffAttendanceCalendar } from "@/components/admin/attendance/StaffAttendanceCalendar";
import { presentGeofenceStatus } from "@/lib/attendance-location";

/**
 * Resolve the display-time pair for an attendance record.
 * When an approved correction overlay exists, the effective times replace the
 * raw GPS timestamps for report rendering. Raw fields remain untouched in data.
 */
function resolveDisplayAttendanceTimes(record: AttendanceRecord) {
    const checkIn = record.effectiveCheckInTime ?? record.checkInTime;
    const checkOut = record.effectiveCheckOutTime != null
        ? record.effectiveCheckOutTime
        : record.checkOutTime ?? null;
    return { checkIn, checkOut };
}

function GeofenceBadge({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    const p = presentGeofenceStatus(status);
    const cls =
        p.tone === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : p.tone === "warning"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : p.tone === "neutral"
                ? "bg-sky-50 border-sky-200 text-sky-800"
                : "bg-slate-100 border-slate-200 text-slate-500";
    const short =
        p.key === "inside" ? "In Office" : p.key === "outside" ? "Outside" : p.label;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${cls}`}>
            <MapPin className="h-2 w-2" />{short}
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
    onViewLocation: (record: AttendanceRecord) => void;
}

function MobileAttendanceRecord({
    record,
    onViewLocation,
}: {
    record: AttendanceRecord;
    onViewLocation: (record: AttendanceRecord) => void;
}) {
    const display = resolveDisplayAttendanceTimes(record);

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
                        {record.date === getAttendanceDateDhaka() && (
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
                    <div className="text-xs font-black text-emerald-700">{formatTime(display.checkIn)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Out</div>
                    <div className="text-xs font-black text-slate-700">{formatTime(display.checkOut)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hours</div>
                    <div className="text-xs font-black text-slate-700">
                        {display.checkIn ? duration(display.checkIn, display.checkOut) : "—"}
                    </div>
                </div>
            </div>
            <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
                {record.checkInAccuracy != null && (
                    <span className="text-[10px] text-slate-400">±{Math.round(record.checkInAccuracy as number)}m</span>
                )}
                {hasAttendanceCorrection(record) && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                        <CheckCircle className="h-2 w-2" />Corrected
                    </span>
                )}
                <ViewLocationButton compact onClick={() => onViewLocation(record)} />
            </div>
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
    onViewLocation,
}: MobileAttendanceReportProps) {
    const today = getAttendanceDateDhaka();
    const [staffSearch, setStaffSearch] = useState("");
    const [showFilters, setShowFilters] = useState(false);

    const todayRecords = useMemo(
        () => allAttendance.filter((r) => r.date === today),
        [allAttendance, today],
    );

    const todayStats = useMemo(() => ({
        present: todayRecords.length,
        working: todayRecords.filter((r) => r.checkInTime && !r.checkOutTime).length,
        outside: todayRecords.filter((r) => r.checkInGeofenceStatus === "outside_office").length,
        complete: todayRecords.filter((r) => r.checkOutTime).length,
    }), [todayRecords]);

    const monthlyAllStaff = useMemo(() => {
        const currentMonthStr = today.slice(0, 7);
        const [y, m] = selectedMonth.split("-").map(Number);
        const calendarDays = new Date(y, m, 0).getDate();
        let eligibleDays: number;
        if (selectedMonth > currentMonthStr) {
            eligibleDays = 0;
        } else if (selectedMonth === currentMonthStr) {
            eligibleDays = Math.min(parseInt(today.slice(8, 10), 10), calendarDays);
        } else {
            eligibleDays = calendarDays;
        }
        const monthRecords = eligibleDays > 0
            ? allAttendance.filter((r) => r.date.startsWith(selectedMonth) && r.date <= today)
            : [];
        const uniquePresent = new Set(monthRecords.map((r) => r.userId)).size;
        const totalStaff = staffUsers.length;
        const expectedSlots = totalStaff * eligibleDays;
        const ratio = expectedSlots > 0 ? Math.round((monthRecords.length / expectedSlots) * 100) : 0;
        return { presentDays: monthRecords.length, uniquePresent, totalStaff, eligibleDays, ratio };
    }, [allAttendance, selectedMonth, staffUsers, today]);

    const selectedStaffMember = useMemo(
        () => staffUsers.find((u) => u.id === selectedUser),
        [staffUsers, selectedUser],
    );

    const { data: selectedMonthData, isLoading: selectedMonthLoading } = useQuery({
        queryKey: ["attendanceUserMonth", selectedUser, selectedMonth],
        queryFn: () => attendanceApi.getByUserMonth(selectedUser, selectedMonth),
        enabled: selectedUser !== "all" && !!selectedStaffMember,
        retry: false,
    });

    const filteredStaff = useMemo(() => {
        if (!staffSearch.trim()) return staffUsers;
        const q = staffSearch.toLowerCase();
        return staffUsers.filter((u) => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
    }, [staffUsers, staffSearch]);

    return (
        <div
            className="bg-[#f8fafc] px-3 pt-3 space-y-3"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
            {/* Header */}
            <div className="pb-1 flex items-start justify-between">
                <div>
                    <h1 className="text-base font-black text-slate-900">Attendance Report</h1>
                    <p className="text-xs text-slate-500">{format(new Date(parseInt(getAttendanceDateDhaka().slice(0, 4)), parseInt(getAttendanceDateDhaka().slice(5, 7)) - 1), "MMMM yyyy")} · {allAttendance.length} total records</p>
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
                    { label: "Present", value: todayStats.present, tone: "text-blue-700 bg-blue-50 border-blue-100" },
                    { label: "Working", value: todayStats.working, tone: "text-emerald-700 bg-emerald-50 border-emerald-100" },
                    { label: "Outside", value: todayStats.outside, tone: "text-amber-700 bg-amber-50 border-amber-100" },
                    { label: "Done", value: todayStats.complete, tone: "text-slate-700 bg-white border-slate-200" },
                ].map((chip) => (
                    <div key={chip.label} className={`rounded-2xl border p-2.5 flex flex-col items-center gap-1 ${chip.tone}`}>
                        <span className="text-lg font-black leading-none">{chip.value}</span>
                        <span className="text-[8px] font-black uppercase tracking-wide">{chip.label}</span>
                    </div>
                ))}
            </div>

            {/* Monthly summary strip */}
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Monthly Summary</span>
                    <span className="text-[10px] font-bold text-slate-500">{selectedMonth}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <div>
                            <span className="text-sm font-black text-emerald-700">{monthlyAllStaff.presentDays}</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-1">days</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-blue-600" />
                        <div>
                            <span className="text-sm font-black text-blue-700">{monthlyAllStaff.uniquePresent}</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-1">staff</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Activity className="h-3.5 w-3.5 text-violet-600" />
                        <div>
                            <span className="text-sm font-black text-violet-700">{monthlyAllStaff.ratio}%</span>
                            <span className="text-[9px] font-bold text-slate-400 ml-1">ratio</span>
                        </div>
                    </div>
                </div>
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

            {/* Staff search */}
            <div className="relative">
                <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Search staff..."
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 pl-8 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            {/* Staff chips (horizontal scroll) */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                <button
                    type="button"
                    onClick={() => { setSelectedUser("all"); setStaffSearch(""); }}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                        selectedUser === "all"
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-500"
                    }`}
                >
                    All
                </button>
                {filteredStaff.map((u) => (
                    <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedUser(u.id); setStaffSearch(""); }}
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                            selectedUser === u.id
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-500"
                        }`}
                    >
                        {u.name}
                    </button>
                ))}
            </div>

            {/* Per-person calendar when a staff member is selected */}
            {selectedUser !== "all" && selectedStaffMember && selectedMonthData && (
                <StaffAttendanceCalendar
                    records={selectedMonthData.records}
                    summary={selectedMonthData.summary}
                    userId={selectedUser}
                    userName={selectedStaffMember.name}
                    selectedMonth={selectedMonth}
                    onMonthChange={setSelectedMonth}
                />
            )}
            {selectedUser !== "all" && selectedStaffMember && !selectedMonthData && selectedMonthLoading && (
                <div className="flex h-24 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading calendar...
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
                        <MobileAttendanceRecord
                            key={record.id}
                            record={record}
                            onViewLocation={onViewLocation}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function AttendanceTab() {
    const isMobile = useAdminMobileMode();
    const queryClient = useQueryClient();
    const { user, permissions } = useAdminAuth();
    // Exact capabilities — attendance.checkIn alone must NOT enable report queries.
    const canReport = canViewAttendanceReport(user, permissions as Record<string, boolean | undefined>);
    const [selectedMonth, setSelectedMonth] = useState(() => getAttendanceDateDhaka().slice(0, 7));
    const [selectedUser, setSelectedUser] = useState<string>("all");
    const [viewerRecord, setViewerRecord] = useState<AttendanceRecord | null>(null);

    const { data: allAttendance = [], isLoading: attendanceLoading } = useQuery({
        queryKey: ["allAttendance"],
        queryFn: attendanceApi.getAll,
        enabled: canReport,
        retry: false,
    });

    const { data: staffList = [] } = useQuery({
        queryKey: ["attendanceStaff"],
        queryFn: attendanceApi.getStaff,
        enabled: canReport,
        retry: false,
    });

    useEffect(() => {
        if (canReport) return;
        queryClient.cancelQueries({ queryKey: ["allAttendance"] });
        queryClient.removeQueries({ queryKey: ["allAttendance"] });
        queryClient.cancelQueries({ queryKey: ["attendanceStaff"] });
        queryClient.removeQueries({ queryKey: ["attendanceStaff"] });
    }, [canReport, queryClient]);

    const staffUsers = staffList.filter((u) =>
        ["Technician", "Cashier", "Manager", "Driver"].includes(u.role),
    );

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
        const today = getAttendanceDateDhaka();
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
        const ms = end.getTime() - start.getTime();
        if (ms <= 0) return "0m";
        const diffHours = ms / (1000 * 60 * 60);
        const hours = Math.floor(diffHours);
        const minutes = Math.floor((diffHours - hours) * 60);
        return `${hours}h ${minutes}m`;
    };

    const locationViewer = (
        <AttendanceLocationViewer
            open={Boolean(viewerRecord)}
            onOpenChange={(o) => { if (!o) setViewerRecord(null); }}
            recordId={viewerRecord?.id ?? null}
            employeeName={viewerRecord?.userName}
            recordDate={viewerRecord?.date}
        />
    );

    if (isMobile) {
        return (
            <>
                <MobileAttendanceReport
                    allAttendance={allAttendance}
                    isLoading={attendanceLoading}
                    staffUsers={staffUsers}
                    selectedMonth={selectedMonth}
                    setSelectedMonth={setSelectedMonth}
                    selectedUser={selectedUser}
                    setSelectedUser={setSelectedUser}
                    filteredAttendance={filteredAttendance}
                    onViewLocation={setViewerRecord}
                />
                {locationViewer}
            </>
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
                                                        {record.date === getAttendanceDateDhaka() && (
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
                                                        {formatTime(resolveDisplayAttendanceTimes(record).checkIn)}
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 font-mono text-xs">
                                                        {formatTime(resolveDisplayAttendanceTimes(record).checkOut)}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-600 font-medium">
                                                        {(() => { const d = resolveDisplayAttendanceTimes(record); return calculateDuration(d.checkIn, d.checkOut); })()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            {record.checkOutTime ? (
                                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 pl-1 pr-2">
                                                                    <CheckCircle className="w-3 h-3" /> Complete
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 gap-1 pl-1 pr-2 animate-pulse">
                                                                    <Clock className="w-3 h-3" /> Working
                                                                </Badge>
                                                            )}
                                                            {hasAttendanceCorrection(record) && (
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1 pl-1 pr-2 text-[10px]">
                                                                    <CheckCircle className="w-2.5 h-2.5" /> Corrected
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1 min-w-[80px]">
                                                            <GeofenceBadge status={record.checkInGeofenceStatus} />
                                                            {record.checkInAccuracy != null && (
                                                                <span className="text-[10px] text-slate-400">+-{Math.round(record.checkInAccuracy as number)}m</span>
                                                            )}
                                                            <ViewLocationButton
                                                                compact
                                                                onClick={() => setViewerRecord(record)}
                                                            />
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
                                            const dateStr = format(day, "yyyy-MM-dd");
                                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                            const isTodayCell = dateStr === getAttendanceDateDhaka();
                                            const isFutureDay = dateStr > getAttendanceDateDhaka();

                                            return (
                                                <motion.div
                                                    key={day.toISOString()}
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ delay: i * 0.01 }}
                                                    className={`
                            aspect-square rounded-lg flex flex-col items-center justify-center text-xs border relative
                            ${isTodayCell ? "ring-2 ring-primary ring-offset-1 z-10" : ""}
                            ${attendance
                                                            ? "bg-green-100 border-green-200 text-green-700"
                                                            : isWeekend
                                                                ? "bg-slate-100 border-slate-200 text-slate-400"
                                                                : isFutureDay
                                                                    ? "bg-transparent border-transparent text-slate-300"
                                                                    : "bg-rose-50 border-rose-100 text-rose-400"
                                                        }
                          `}
                                                >
                                                    <span className="font-semibold">{format(day, "d")}</span>
                                                    {attendance && (
                                                        <div className={`w-1 h-1 rounded-full mt-1 ${hasAttendanceCorrection(attendance) ? "bg-amber-400" : "bg-green-500"}`} />
                                                    )}
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
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <div className="w-2 h-2 rounded-full bg-amber-400" /> Corrected
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {locationViewer}
        </motion.div>
    );
}
