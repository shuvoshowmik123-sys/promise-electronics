import { useState } from "react";
import { Wrench, Plus, X, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_PART_TYPES, MODEL_CRITICAL_PART_TYPES } from "@shared/part-types";

interface PartTypesCardProps {
    types: string[];
    setTypes: (next: string[]) => void;
    modelCritical: string[];
    setModelCritical: (next: string[]) => void;
}

/**
 * The repair vocabulary: what a part is, and whether a model number identifies
 * one.
 *
 * Not a TagListCard, because a part type carries two answers rather than one.
 * The model-number requirement used to be a hardcoded list beside the types,
 * which meant a shop that added "Soundbar board" could never say a model number
 * identifies it - the judgement was made in a source file by somebody who has
 * never seen the shelf.
 *
 * The flag lives on the row rather than in a second list of names. Two parallel
 * lists matched by string are a quiet trap: one typo and a part silently stops
 * requiring a model, with nothing on screen to show it. Here there is nothing to
 * mistype, and deleting a type takes its flag with it.
 */
export function PartTypesCard({ types, setTypes, modelCritical, setModelCritical }: PartTypesCardProps) {
    const [draft, setDraft] = useState("");

    const add = () => {
        const name = draft.trim();
        if (!name) return;
        // Case-insensitive, because "Panel" and "panel" are one part type and
        // two entries here become two entries on every declaration screen.
        if (types.some((t) => t.toLowerCase() === name.toLowerCase())) {
            setDraft("");
            return;
        }
        setTypes([...types, name]);
        setDraft("");
    };

    const remove = (name: string) => {
        setTypes(types.filter((t) => t !== name));
        setModelCritical(modelCritical.filter((t) => t !== name));
    };

    const toggleCritical = (name: string) => {
        setModelCritical(
            modelCritical.includes(name)
                ? modelCritical.filter((t) => t !== name)
                : [...modelCritical, name],
        );
    };

    /*
     * An unset list is not an empty one.
     *
     * Before anything is saved the stored value is absent, and the declaration
     * screen falls back to the shipped defaults. Showing an empty card here
     * would misreport that as "no part types configured" and invite somebody to
     * type the eleven they already have.
     */
    const isUnset = types.length === 0;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                    <Wrench className="h-5 w-5 text-violet-500" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900">Part Types</h3>
                    <p className="text-xs font-medium text-slate-500">
                        What a technician declares a fitted part as. Tick the ones a model number identifies.
                    </p>
                </div>
            </div>

            {isUnset && (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Using the built-in list until you save your own:{" "}
                    {DEFAULT_PART_TYPES.join(", ")}. Add a type below to take it over
                    {MODEL_CRITICAL_PART_TYPES.length > 0
                        ? " — the built-in list already requires a model number for "
                          + MODEL_CRITICAL_PART_TYPES.join(", ") + "."
                        : "."}
                </p>
            )}

            <div className="mt-3 flex gap-2">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                        }
                    }}
                    placeholder="e.g. Panel, Power board, Soundbar board"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
                <button
                    type="button"
                    onClick={add}
                    disabled={!draft.trim()}
                    className="flex h-10 shrink-0 items-center gap-1 rounded-xl bg-violet-600 px-3 text-sm font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                >
                    <Plus className="h-4 w-4" />
                    Add
                </button>
            </div>

            {types.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {types.map((t) => {
                        const critical = modelCritical.includes(t);
                        return (
                            <li
                                key={t}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
                            >
                                <Tag className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{t}</span>
                                <button
                                    type="button"
                                    onClick={() => toggleCritical(t)}
                                    aria-pressed={critical}
                                    title="Require a model number for this part type"
                                    className={cn(
                                        "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                                        critical
                                            ? "border-violet-200 bg-violet-100 text-violet-700"
                                            : "border-slate-200 bg-white text-slate-400",
                                    )}
                                >
                                    Model no.
                                </button>
                                <button
                                    type="button"
                                    onClick={() => remove(t)}
                                    aria-label={`Remove ${t}`}
                                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
