import { useMemo } from "react";
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight, TrendingUp, UserCheck, XCircle } from "lucide-react";
import type { AttendanceRecord } from "@shared/schema";
import { getAttendanceDateDhaka, hasAttendanceCorrection } from "@shared/attendance-utils";

export type AttendanceMonthSummary = {
    presentDays: number;
    absentDays: number;
    eligibleDays: number;
    daysInMonth: number;
    calendarDays: number;
    ratio: number;
};

interface StaffAttendanceCalendarProps {
    records: AttendanceRecord[];
    summary: AttendanceMonthSummary;
    userId: string;
    userName: string;
    selectedMonth: string;
    onMonthChange: (month: string) => void;
}

export function StaffAttendanceCalendar({
    records,
    summary,
    userName,
    selectedMonth,
    onMonthChange,
}: StaffAttendanceCalendarProps) {
    const todayDhaka = getAttendanceDateDhaka();

    const daysInMonth = useMemo(() => {
        const [year, month] = selectedMonth.split("-").map(Number);
        const start = startOfMonth(new Date(year, month - 1));
        const end = endOfMonth(start);
        return eachDayOfInterval({ start, end });
    }, [selectedMonth]);

    const recordByDate = useMemo(() => {
        const map = new Map<string, AttendanceRecord>();
        for (const r of records) map.set(r.date, r);
        return map;
    }, [records]);

    const shiftMonth = (delta: number) => {
        const [y, m] = selectedMonth.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        onMonthChange(format(d, "yyyy-MM"));
    };

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95 transition-transform"
                    aria-label="Previous month"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-center">
                    <div className="text-xs font-black text-slate-900">
                        {format(new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]) - 1), "MMMM yyyy")}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">{userName}</div>
                </div>
                <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:scale-95 transition-transform"
                    aria-label="Next month"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-center text-[9px] font-black uppercase tracking-wide text-slate-400 py-1">{d}</div>
                ))}
                {Array.from({ length: daysInMonth[0]?.getDay() || 0 }).map((_, i) => (
                    <div key={`e-${i}`} />
                ))}
                {daysInMonth.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const record = recordByDate.get(dateStr);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isTodayCell = dateStr === todayDhaka;
                    const isFutureDay = dateStr > todayDhaka;
                    const corrected = record ? hasAttendanceCorrection(record) : false;

                    let cellClass = "aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] border relative transition-colors";
                    if (isTodayCell) cellClass += " ring-2 ring-blue-400 ring-offset-1 z-10";
                    if (record) {
                        cellClass += " bg-emerald-50 border-emerald-200 text-emerald-700";
                    } else if (isFutureDay) {
                        cellClass += " bg-transparent border-transparent text-slate-300";
                    } else if (isWeekend) {
                        cellClass += " bg-slate-50 border-slate-100 text-slate-400";
                    } else {
                        cellClass += " bg-rose-50 border-rose-100 text-rose-400";
                    }

                    return (
                        <div key={dateStr} className={cellClass}>
                            <span className="font-bold">{format(day, "d")}</span>
                            {record && (
                                <div className={`w-1 h-1 rounded-full mt-0.5 ${corrected ? "bg-amber-400" : "bg-emerald-500"}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-2">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <div>
                        <div className="text-xs font-black text-emerald-700">{summary.presentDays}</div>
                        <div className="text-[8px] font-bold uppercase text-emerald-500">Present</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-2 py-2">
                    <XCircle className="h-3.5 w-3.5 text-rose-500" />
                    <div>
                        <div className="text-xs font-black text-rose-600">{summary.absentDays}</div>
                        <div className="text-[8px] font-bold uppercase text-rose-400">Absent</div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-2 py-2">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                    <div>
                        <div className="text-xs font-black text-blue-700">{summary.ratio}%</div>
                        <div className="text-[8px] font-bold uppercase text-blue-500">Ratio</div>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-100 border border-emerald-200" /> Present</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-50 border border-rose-100" /> Absent</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-50 border border-slate-200" /> Weekend</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Corrected</span>
            </div>
        </div>
    );
}
