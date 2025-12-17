import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Calendar, Clock, Users, CheckCircle, XCircle, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { attendanceApi, adminUsersApi } from "@/lib/api";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, parseISO } from "date-fns";
import { useState, useMemo } from "react";
import type { AttendanceRecord } from "@shared/schema";

export default function StaffAttendanceReport() {
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedUser, setSelectedUser] = useState<string>("all");

  // Get all attendance records
  const { data: allAttendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["allAttendance"],
    queryFn: attendanceApi.getAll,
  });

  // Get all users
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: adminUsersApi.getAll,
  });

  // Filter to technicians and other staff
  const staffUsers = users.filter(u => u.role === "Technician" || u.role === "Cashier" || u.role === "Manager");

  // Filter attendance by selected month and user
  const filteredAttendance = useMemo(() => {
    let filtered = allAttendance;
    
    // Filter by month
    if (selectedMonth) {
      const [year, month] = selectedMonth.split("-");
      filtered = filtered.filter((record: AttendanceRecord) => {
        const recordDate = record.date;
        return recordDate.startsWith(`${year}-${month}`);
      });
    }
    
    // Filter by user
    if (selectedUser !== "all") {
      filtered = filtered.filter((record: AttendanceRecord) => record.userId === selectedUser);
    }
    
    return filtered;
  }, [allAttendance, selectedMonth, selectedUser]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayRecords = allAttendance.filter((r: AttendanceRecord) => r.date === today);
    const presentToday = todayRecords.length;
    const checkedOutToday = todayRecords.filter((r: AttendanceRecord) => r.checkOutTime).length;
    
    // Monthly stats
    const [year, month] = selectedMonth.split("-");
    const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
    const monthEnd = endOfMonth(monthStart);
    const currentDate = new Date();
    
    // Safely calculate working days - handle future months
    let workingDays = 0;
    if (monthStart <= currentDate) {
      const endDate = currentDate > monthEnd ? monthEnd : currentDate;
      workingDays = eachDayOfInterval({ start: monthStart, end: endDate })
        .filter(day => day.getDay() !== 0 && day.getDay() !== 6).length;
    }
    
    return {
      presentToday,
      checkedOutToday,
      totalStaff: staffUsers.length,
      totalRecordsThisMonth: filteredAttendance.length,
      workingDays,
    };
  }, [allAttendance, staffUsers, filteredAttendance, selectedMonth]);

  // Generate days of the selected month for the calendar view
  const daysInMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-");
    const monthStart = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
    const monthEnd = endOfMonth(monthStart);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [selectedMonth]);

  // Get attendance status for a user on a specific day
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
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="page-title">Staff Attendance Report</h1>
            <p className="text-muted-foreground">Track daily attendance and work hours for all staff members</p>
          </div>
          <Button variant="outline" data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Present Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900" data-testid="stat-present-today">
                {stats.presentToday} / {stats.totalStaff}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Checked Out Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900" data-testid="stat-checked-out">
                {stats.checkedOutToday}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900" data-testid="stat-total-staff">
                {stats.totalStaff}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Records This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900" data-testid="stat-monthly-records">
                {stats.totalRecordsThisMonth}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Month</label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  data-testid="input-month-filter"
                />
              </div>
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">Staff Member</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger data-testid="select-staff-filter">
                    <SelectValue placeholder="All Staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Records Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Attendance Records</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading attendance records...</div>
            ) : filteredAttendance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No attendance records found for the selected filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Staff Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttendance.map((record: AttendanceRecord) => (
                      <TableRow key={record.id} data-testid={`row-attendance-${record.id}`}>
                        <TableCell className="font-medium">
                          {format(parseISO(record.date), "MMM d, yyyy")}
                          {record.date === format(new Date(), "yyyy-MM-dd") && (
                            <Badge className="ml-2 bg-blue-100 text-blue-700">Today</Badge>
                          )}
                        </TableCell>
                        <TableCell>{record.userName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.userRole}</Badge>
                        </TableCell>
                        <TableCell className="text-green-600 font-medium">
                          {formatTime(record.checkInTime)}
                        </TableCell>
                        <TableCell className={record.checkOutTime ? "text-blue-600 font-medium" : "text-muted-foreground"}>
                          {formatTime(record.checkOutTime)}
                        </TableCell>
                        <TableCell>
                          {calculateDuration(record.checkInTime, record.checkOutTime)}
                        </TableCell>
                        <TableCell>
                          {record.checkOutTime ? (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700">
                              <Clock className="w-3 h-3 mr-1" />
                              Working
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Calendar View */}
        {selectedUser !== "all" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Attendance Calendar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                {/* Empty cells for days before the first day of the month */}
                {Array.from({ length: daysInMonth[0]?.getDay() || 0 }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-2" />
                ))}
                {/* Days of the month */}
                {daysInMonth.map((day) => {
                  const attendance = getAttendanceForDay(selectedUser, day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const isFuture = day > new Date();
                  
                  return (
                    <div
                      key={day.toISOString()}
                      className={`p-2 text-center rounded-lg border ${
                        isToday(day) ? "border-primary border-2" : "border-slate-200"
                      } ${
                        isWeekend ? "bg-slate-100" : 
                        isFuture ? "bg-slate-50" :
                        attendance ? "bg-green-50" : "bg-red-50"
                      }`}
                    >
                      <div className="text-sm font-medium">{format(day, "d")}</div>
                      {!isFuture && !isWeekend && (
                        <div className="mt-1">
                          {attendance ? (
                            <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                  <span>Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
                  <span>Absent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-slate-100 border border-slate-200 rounded"></div>
                  <span>Weekend</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
