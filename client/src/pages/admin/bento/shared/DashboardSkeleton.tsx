export const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Row 1 */}
            <div className="col-span-1 md:col-span-2 h-[320px] bg-slate-200 rounded-3xl" />
            <div className="col-span-1 md:col-span-1 h-[320px] bg-slate-200 rounded-3xl" />
            <div className="col-span-1 md:col-span-1 h-[320px] bg-slate-200 rounded-3xl" />

            {/* Row 2: KPIs */}
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="col-span-1 h-[140px] bg-slate-200 rounded-3xl" />
            ))}

            {/* Row 3: Activity */}
            <div className="col-span-1 md:col-span-2 lg:col-span-4 h-[400px] bg-slate-200 rounded-3xl" />
        </div>
    </div>
);
