export const DashboardSkeleton = () => (
    <div className="space-y-2 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-pulse md:space-y-6 md:px-0 md:pb-0">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
            {/* Row 1 */}
            <div className="col-span-2 h-24 rounded-2xl bg-slate-200 md:h-[320px] md:rounded-3xl" />
            <div className="col-span-1 h-20 rounded-2xl bg-slate-200 md:col-span-1 md:h-[320px] md:rounded-3xl" />
            <div className="col-span-1 h-20 rounded-2xl bg-slate-200 md:col-span-1 md:h-[320px] md:rounded-3xl" />

            {/* Row 2: KPIs */}
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="col-span-1 h-14 rounded-2xl bg-slate-200 md:h-[140px] md:rounded-3xl" />
            ))}

            {/* Row 3: Activity */}
            <div className="col-span-2 h-32 rounded-2xl bg-slate-200 md:col-span-2 md:h-[400px] md:rounded-3xl lg:col-span-4" />
        </div>
    </div>
);
