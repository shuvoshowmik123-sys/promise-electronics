import { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
    UserCheck, LogOut, Clock, MapPin, CheckCircle2, AlertCircle,
    Loader2, ShieldAlert, Navigation, WifiOff, Users, CalendarDays,
    Timer, Activity, ArrowRight, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { attendanceApi } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { AttendanceRecord } from "@shared/schema";

type GpsState = "idle" | "locating" | "ready" | "denied" | "error";
interface GpsLocation { lat: number; lng: number; accuracy: number }

const POOR_ACCURACY_M = 150;

function captureLocation(opts?: { timeout?: number; maximumAge?: number }): Promise<GpsLocation> {
    if (!navigator.geolocation) {
        return Promise.reject(Object.assign(new Error("Geolocation not supported"), { code: 1 }));
    }
    return new Promise<GpsLocation>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
            reject,
            { timeout: opts?.timeout ?? 12000, maximumAge: opts?.maximumAge ?? 5000, enableHighAccuracy: true },
        );
    });
}

function mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function formatT(t: string | Date | null | undefined) {
    return t ? format(new Date(t as string | Date), "h:mm a") : "-";
}

function durationText(checkIn: string | Date | null | undefined, checkOut?: string | Date | null, now = new Date()) {
    if (!checkIn) return "-";
    const start = new Date(checkIn as string | Date);
    const end = checkOut ? new Date(checkOut as string | Date) : now;
    const ms = Math.max(0, end.getTime() - start.getTime());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function GpsBar({ state, location }: { state: GpsState; location: GpsLocation | null }) {
    if (state === "idle" || state === "locating") {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                Acquiring GPS location...
            </div>
        );
    }
    if (state === "denied") {
        return (
            <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Location permission is required to check in. Enable it in your browser settings and reload the page.</span>
            </div>
        );
    }
    if (state === "error") {
        return (
            <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                <WifiOff className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                GPS signal weak. Move outdoors or near a window and try again.
            </div>
        );
    }
    if (state === "ready" && location) {
        const isPoor = location.accuracy > POOR_ACCURACY_M;
        return (
            <div className={`rounded-xl border px-3 py-2.5 text-xs ${isPoor ? "border-amber-100 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}>
                <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${isPoor ? "bg-amber-400" : "bg-emerald-500"}`} />
                    <span className={isPoor ? "text-amber-700" : "text-emerald-700"}>
                        {isPoor
                            ? `Weak GPS signal (+-${Math.round(location.accuracy)}m) - position may be approximate`
                            : `Location ready (+-${Math.round(location.accuracy)}m)`}
                    </span>
                </div>
                <a
                    href={mapsUrl(location.lat, location.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                >
                    <Navigation className="h-2.5 w-2.5" />
                    Open in Google Maps
                </a>
            </div>
        );
    }
    return null;
}

function GeofenceBadge({ status }: { status: string | null | undefined }) {
    if (!status) return null;
    if (status === "inside_office") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                <MapPin className="h-2.5 w-2.5" />In Office
            </span>
        );
    }
    if (status === "outside_office") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                <MapPin className="h-2.5 w-2.5" />Outside Office
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            <MapPin className="h-2.5 w-2.5" />Unverified
        </span>
    );
}

function HistoryCard({ record, now }: { record: AttendanceRecord; now: Date }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-black text-slate-900">{format(parseISO(record.date), "EEE, MMM d")}</div>
                    <div className="mt-0.5 flex items-center gap-2">
                        <GeofenceBadge status={record.checkInGeofenceStatus} />
                        {!record.checkOutTime && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Working</span>
                        )}
                    </div>
                </div>
                {record.checkInLat != null && record.checkInLng != null && (
                    <a
                        href={mapsUrl(record.checkInLat, record.checkInLng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
                        aria-label="Open shift location in Google Maps"
                    >
                        <Navigation className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">In</div>
                    <div className="text-xs font-black text-slate-800">{formatT(record.checkInTime)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Out</div>
                    <div className="text-xs font-black text-slate-800">{formatT(record.checkOutTime)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hours</div>
                    <div className="text-xs font-black text-slate-800">{durationText(record.checkInTime, record.checkOutTime, now)}</div>
                </div>
            </div>
        </div>
    );
}

function SuperAdminShiftMonitor({ now }: { now: Date }) {
    const [kpiOpen, setKpiOpen] = useState(false);

    const { data: allAttendance = [], isLoading } = useQuery({
        queryKey: ["allAttendance"],
        queryFn: attendanceApi.getAll,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    const todayKey = format(now, "yyyy-MM-dd");
    const todayRecords = useMemo(
        () => allAttendance.filter((record: AttendanceRecord) => record.date === todayKey),
        [allAttendance, todayKey],
    );

    const stats = useMemo(() => ({
        present: todayRecords.length,
        working: todayRecords.filter((record: AttendanceRecord) => record.checkInTime && !record.checkOutTime).length,
        outside: todayRecords.filter((record: AttendanceRecord) => record.checkInGeofenceStatus === "outside_office").length,
        complete: todayRecords.filter((record: AttendanceRecord) => record.checkOutTime).length,
    }), [todayRecords]);

    const kpiItems = [
        { label: "Present", value: stats.present, icon: Users, tone: "text-blue-700 bg-blue-50 border-blue-100" },
        { label: "Working", value: stats.working, icon: Activity, tone: "text-emerald-700 bg-emerald-50 border-emerald-100" },
        { label: "Outside", value: stats.outside, icon: ShieldAlert, tone: "text-amber-700 bg-amber-50 border-amber-100" },
        { label: "Complete", value: stats.complete, icon: CheckCircle2, tone: "text-slate-700 bg-white border-slate-200" },
    ];

    return (
        <div
            className="bg-[#f8fafc] px-3 pt-3 space-y-3"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
            <div className="pb-1">
                <h1 className="text-base font-black text-slate-900">Shift Monitor</h1>
                <p className="text-xs text-slate-500">{format(now, "EEEE, d MMM yyyy")} | {format(now, "h:mm a")}</p>
            </div>

            {/* Collapsible KPI block */}
            <button
                type="button"
                onClick={() => setKpiOpen(v => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm active:scale-[0.99] transition-transform"
                aria-expanded={kpiOpen}
            >
                <div className="flex items-center gap-3 text-[11px] font-black text-slate-600">
                    <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wide">Today</span>
                    <span className="text-blue-700">Present <span className="text-slate-950">{stats.present}</span></span>
                    <span className="text-emerald-700">Working <span className="text-slate-950">{stats.working}</span></span>
                    <span className="text-amber-700">Outside <span className="text-slate-950">{stats.outside}</span></span>
                    <span className="text-slate-500">Done <span className="text-slate-950">{stats.complete}</span></span>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${kpiOpen ? "rotate-180" : ""}`} />
            </button>
            {kpiOpen && (
                <div className="grid grid-cols-2 gap-2">
                    {kpiItems.map((item) => (
                        <div key={item.label} className={`rounded-2xl border p-3 ${item.tone}`}>
                            <div className="flex items-center justify-between">
                                <item.icon className="h-4 w-4" />
                                <span className="text-xl font-black">{item.value}</span>
                            </div>
                            <div className="mt-2 text-[10px] font-black uppercase tracking-wide">{item.label}</div>
                        </div>
                    ))}
                </div>
            )}

            <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl border-slate-200 bg-white text-sm font-black text-slate-700"
                onClick={() => { window.location.hash = "#attendance"; }}
            >
                Open Full Attendance Report
                <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Today&apos;s Duty</h2>
                    <span className="text-[10px] font-bold text-slate-400">{todayRecords.length} records</span>
                </div>
                {isLoading ? (
                    <div className="flex h-24 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-bold text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading shifts...
                    </div>
                ) : todayRecords.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                        <CalendarDays className="mx-auto h-6 w-6 text-slate-300" />
                        <div className="mt-2 text-sm font-black text-slate-700">No staff checked in yet</div>
                        <p className="mt-1 text-xs text-slate-500">Staff check-ins will appear here as they start duty.</p>
                    </div>
                ) : todayRecords.map((record: AttendanceRecord) => (
                    <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-900">{record.userName}</div>
                                <div className="text-xs font-semibold text-slate-500">{record.userRole}</div>
                            </div>
                            <GeofenceBadge status={record.checkInGeofenceStatus} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">In</div>
                                <div className="text-xs font-black text-slate-800">{formatT(record.checkInTime)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Out</div>
                                <div className="text-xs font-black text-slate-800">{formatT(record.checkOutTime)}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-2">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Hours</div>
                                <div className="text-xs font-black text-slate-800">{durationText(record.checkInTime, record.checkOutTime, now)}</div>
                            </div>
                        </div>
                        {record.checkInLat != null && record.checkInLng != null && (
                            <a
                                href={mapsUrl(record.checkInLat, record.checkInLng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-[10px] font-bold text-blue-600"
                            >
                                <Navigation className="h-2.5 w-2.5" />
                                Open in Google Maps
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ShiftTab() {
    const { user } = useAdminAuth();
    const qc = useQueryClient();
    const [gpsState, setGpsState] = useState<GpsState>("idle");
    const [location, setLocation] = useState<GpsLocation | null>(null);
    const [now, setNow] = useState(() => new Date());
    const isSuperAdmin = user?.role === "Super Admin";

    const { data: record, isLoading } = useQuery<AttendanceRecord | null>({
        queryKey: ["attendanceToday"],
        queryFn: attendanceApi.getToday,
        refetchInterval: 60_000,
        staleTime: 30_000,
        enabled: !isSuperAdmin,
    });

    const { data: history = [] } = useQuery<AttendanceRecord[]>({
        queryKey: ["attendanceMyHistory", 7],
        queryFn: () => attendanceApi.getMyHistory(7),
        staleTime: 60_000,
        enabled: !isSuperAdmin,
    });

    const isCheckedIn = !!record?.checkInTime;
    const isCheckedOut = !!record?.checkOutTime;
    const isActive = isCheckedIn && !isCheckedOut;

    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (isSuperAdmin || isLoading || isCheckedIn) return;
        setGpsState("locating");
        if (!navigator.geolocation) { setGpsState("denied"); return; }
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setLocation({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
                setGpsState("ready");
            },
            (err) => setGpsState(err.code === 1 ? "denied" : "error"),
            { timeout: 12000, maximumAge: 60000, enableHighAccuracy: true },
        );
    }, [isSuperAdmin, isLoading, isCheckedIn]);

    const checkIn = useMutation({
        mutationFn: async () => {
            let loc: GpsLocation;
            try {
                loc = await captureLocation({ timeout: 15000, maximumAge: 10000 });
                setLocation(loc);
                setGpsState("ready");
            } catch (err: any) {
                const code = err?.code ?? 0;
                if (code === 1) { setGpsState("denied"); throw new Error("Location permission is required to check in."); }
                setGpsState("error");
                throw new Error("Could not get GPS location. Move to a clearer area and try again.");
            }
            return attendanceApi.checkIn(undefined, loc.lat, loc.lng, loc.accuracy);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["attendanceToday"] });
            qc.invalidateQueries({ queryKey: ["attendanceMyHistory"] });
        },
    });

    const checkOut = useMutation({
        mutationFn: async () => {
            let loc: GpsLocation;
            try {
                loc = await captureLocation({ timeout: 15000, maximumAge: 10000 });
            } catch (err: any) {
                const code = err?.code ?? 0;
                if (code === 1) throw new Error("Location permission is required to check out. Enable it in your browser settings.");
                throw new Error("Could not get GPS for check-out. Move to a clearer area and try again.");
            }
            return attendanceApi.checkOut(loc.lat, loc.lng, loc.accuracy);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["attendanceToday"] });
            qc.invalidateQueries({ queryKey: ["attendanceMyHistory"] });
        },
    });

    const duration = useMemo(
        () => durationText(record?.checkInTime, record?.checkOutTime, now),
        [record, now],
    );

    if (isSuperAdmin) {
        return <SuperAdminShiftMonitor now={now} />;
    }

    const today = format(now, "EEEE, d MMM yyyy");
    const mutationError = (checkIn.error as any)?.message || (checkOut.error as any)?.message || null;
    const checkInDisabled = checkIn.isPending || gpsState === "denied" || gpsState === "locating" || gpsState === "idle";

    return (
        <div
            className="bg-[#f8fafc] px-3 pt-3 space-y-3"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
            <div className="pb-1">
                <h1 className="text-base font-black text-slate-900">My Shift</h1>
                <p className="text-xs text-slate-500">{today} | {format(now, "h:mm a")}</p>
            </div>

            <div className={`rounded-2xl p-4 border ${
                isActive ? "bg-emerald-50 border-emerald-200"
                : isCheckedOut ? "bg-blue-50 border-blue-200"
                : "bg-white border-slate-200"
            }`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isActive ? "bg-emerald-500" : isCheckedOut ? "bg-blue-500" : "bg-slate-100"
                        }`}>
                            {isActive
                                ? <CheckCircle2 className="h-5 w-5 text-white" />
                                : isCheckedOut
                                ? <LogOut className="h-5 w-5 text-white" />
                                : <Clock className="h-5 w-5 text-slate-400" />}
                        </div>
                        <div>
                            <div className={`text-sm font-black ${
                                isActive ? "text-emerald-800" : isCheckedOut ? "text-blue-800" : "text-slate-600"
                            }`}>
                                {isActive ? "Shift Active" : isCheckedOut ? "Shift Complete" : "Not Checked In"}
                            </div>
                            <div className="text-xs text-slate-500">{user?.name ?? "Staff"} | {user?.role}</div>
                        </div>
                    </div>
                    {isCheckedIn && <GeofenceBadge status={record?.checkInGeofenceStatus} />}
                </div>

                {isCheckedIn && (
                    <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-slate-200/60">
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Check In</div>
                            <div className="text-sm font-black text-slate-800">{formatT(record?.checkInTime)}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Duration</div>
                            <div className="text-sm font-black text-slate-800">{duration}</div>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Check Out</div>
                            <div className="text-sm font-black text-slate-800">{formatT(record?.checkOutTime)}</div>
                        </div>
                    </div>
                )}

                {isCheckedIn && record?.checkInLat != null && record?.checkInLng != null && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60">
                        <a
                            href={mapsUrl(record.checkInLat, record.checkInLng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                        >
                            <Navigation className="h-2.5 w-2.5" />
                            View check-in location in Google Maps
                        </a>
                    </div>
                )}
            </div>

            {!isCheckedIn && !isLoading && <GpsBar state={gpsState} location={location} />}

            {!isLoading && (
                <>
                    {!isCheckedIn && (
                        <Button
                            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm"
                            onClick={() => checkIn.mutate()}
                            disabled={checkInDisabled}
                        >
                            {checkIn.isPending ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking In...</>
                            ) : gpsState === "locating" || gpsState === "idle" ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Acquiring GPS...</>
                            ) : (
                                <><UserCheck className="h-5 w-5 mr-2" />Check In</>
                            )}
                        </Button>
                    )}
                    {isActive && (
                        <Button
                            className="w-full h-12 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm"
                            onClick={() => checkOut.mutate()}
                            disabled={checkOut.isPending}
                        >
                            {checkOut.isPending
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Getting location...</>
                                : <><LogOut className="h-5 w-5 mr-2" />Check Out</>}
                        </Button>
                    )}
                    {isCheckedOut && (
                        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white border border-slate-200 h-12 text-sm font-bold text-slate-500">
                            <CheckCircle2 className="h-4 w-4 text-blue-400" />
                            Shift recorded - see you tomorrow
                        </div>
                    )}
                </>
            )}

            {mutationError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-xs text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    {mutationError}
                </div>
            )}

            <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Last 7 Days</h2>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Timer className="h-3 w-3" />
                        {history.length} records
                    </span>
                </div>
                {history.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                        <CalendarDays className="mx-auto h-6 w-6 text-slate-300" />
                        <div className="mt-2 text-sm font-black text-slate-700">No shift history yet</div>
                        <p className="mt-1 text-xs text-slate-500">Your check-ins will appear here for quick review.</p>
                    </div>
                ) : history.map((item) => (
                    <HistoryCard key={item.id} record={item} now={now} />
                ))}
            </div>
        </div>
    );
}
