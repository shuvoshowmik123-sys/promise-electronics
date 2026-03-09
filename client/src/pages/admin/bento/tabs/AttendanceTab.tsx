import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO
} from "date-fns";
import {
    Calendar, Clock, Users, CheckCircle, XCircle, Download, UserCheck,
    MapPin, AlertCircle
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
import type { AttendanceRecord } from "@shared/schema";

export default function AttendanceTab() {
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

    const staffUsers = users.filter(u => u.role === "Technician" || u.role === "Cashier" || u.role === "Manager");

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

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
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
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                        {filteredAttendance.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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
                                            const isWeekend = day.getDay() === 0 || day.getDay() === 6; // Sun=0, Fri=5 (wait, Bangladesh is Fri/Sat? Assuming standard logic for now, keeping prod logic: 0 & 6)

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
