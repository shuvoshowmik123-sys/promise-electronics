/**
 * Parts customers asked for that the shop does not stock.
 *
 * A tab of its own rather than a panel inside Settings. It was built there
 * first and that was wrong: Settings is where the shop is configured, and this
 * is where somebody works. It gets opened on a Tuesday to decide an import
 * order and again on a Wednesday to ring the people waiting — daily work, not
 * configuration, and it carries the same permission layer as every other tab.
 *
 * The parts LIST stays in Settings, because that genuinely is configuration.
 */
import { PartDemandBoard } from "@/components/admin/PartDemandBoard";

export default function PartsDemandTab() {
    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6 md:py-6">
            <div className="mb-4">
                <h1 className="text-xl font-black text-slate-900 md:text-2xl">Parts Demand</h1>
                <p className="mt-1 text-xs font-medium text-slate-500 md:text-sm">
                    What customers asked for and could not get. The top of this list is what
                    to bring in next.
                </p>
            </div>
            <PartDemandBoard />
        </div>
    );
}
