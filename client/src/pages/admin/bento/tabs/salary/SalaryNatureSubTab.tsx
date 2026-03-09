import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BentoCard } from "../../shared/BentoCard";
import { LayoutTemplate, Layers, Plus, Loader2, Edit2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function SalaryNatureSubTab() {
    const { toast } = useToast();

    const { data: components, isLoading: isLoadingComps } = useQuery<any[]>({
        queryKey: ['/api/admin/hr/salary-components'],
    });

    const { data: structures, isLoading: isLoadingStructs } = useQuery<any[]>({
        queryKey: ['/api/admin/hr/salary-structures'],
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            {/* ── Component Library ── */}
            <BentoCard variant="ghost" className="bg-white border border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[500px]" disableHover>
                <div className="p-4 sm:p-5 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700 leading-tight">Component Library</h3>
                            <p className="text-[10px] text-slate-500">Manage all available salary components</p>
                        </div>
                    </div>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full h-8 text-xs font-medium px-4">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Component
                    </Button>
                </div>

                <div className="flex-1 overflow-auto p-0">
                    {isLoadingComps ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                    ) : !components || components.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-40">
                            <Layers className="w-8 h-8 text-slate-300 mb-3" />
                            <p className="text-sm font-medium text-slate-900">No components defined.</p>
                            <p className="text-xs text-slate-500 mt-1">Add components like Basic Salary, HRA, etc.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                    <TableHead className="text-xs font-semibold text-slate-500 h-10 w-[80px]">Code</TableHead>
                                    <TableHead className="text-xs font-semibold text-slate-500 h-10">Name</TableHead>
                                    <TableHead className="text-xs font-semibold text-slate-500 h-10">Type</TableHead>
                                    <TableHead className="text-xs font-semibold text-slate-500 h-10 text-right w-[80px]">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {components.map((comp) => (
                                    <TableRow key={comp.id} className="group hover:bg-blue-50/30 transition-colors">
                                        <TableCell>
                                            <span className="text-xs font-bold text-slate-700 font-mono tracking-tight bg-slate-100 px-1.5 py-0.5 rounded">
                                                {comp.code}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm font-semibold text-slate-700 truncate">{comp.name}</p>
                                            <p className="text-[10px] text-slate-500 capitalize">
                                                {comp.calcMode.replace(/_/g, " ")}
                                                {comp.defaultPercent ? ` (${comp.defaultPercent}%)` : ''}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] uppercase font-bold tracking-wider rounded-md border-0 h-5 px-1.5 ${comp.componentType === 'earning' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                {comp.componentType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full">
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>
            </BentoCard>

            {/* ── Structure Templates ── */}
            <BentoCard variant="ghost" className="bg-white border border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[500px]" disableHover>
                <div className="p-4 sm:p-5 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                            <LayoutTemplate className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-700 leading-tight">Structure Templates</h3>
                            <p className="text-[10px] text-slate-500">Group components into assignable templates</p>
                        </div>
                    </div>
                    <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full h-8 text-xs font-medium px-4">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Template
                    </Button>
                </div>

                <div className="flex-1 overflow-auto p-4 sm:p-5 flex flex-col gap-4">
                    {isLoadingStructs ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                    ) : !structures || structures.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-40">
                            <LayoutTemplate className="w-8 h-8 text-slate-300 mb-3" />
                            <p className="text-sm font-medium text-slate-900">No structure templates defined.</p>
                            <p className="text-xs text-slate-500 mt-1">Create templates like 'BD Standard' or 'Contractor'.</p>
                        </div>
                    ) : (
                        structures.map((struct) => (
                            <div key={struct.id} className="group relative border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 hover:shadow-sm transition-all bg-white">
                                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>

                                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-slate-900 leading-none">{struct.name}</h4>
                                            {struct.isActive && (
                                                <span className="flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                                    <CheckCircle2 className="w-3 h-3" /> Active
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-mono font-medium tracking-tight text-slate-500 bg-slate-200/50 px-1.5 py-0.5 rounded">
                                            {struct.code}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                        {struct.lines?.map((line: any) => {
                                            const comp = components?.find(c => c.id === line.componentId);
                                            if (!comp) return null;
                                            return (
                                                <Badge
                                                    key={line.id}
                                                    variant="outline"
                                                    className={`text-[10px] font-medium rounded-full bg-white border-slate-200 text-slate-600 flex items-center gap-1 px-2.5 py-0.5`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${comp.componentType === 'earning' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                                    {comp.code}
                                                </Badge>
                                            );
                                        })}
                                        {(!struct.lines || struct.lines.length === 0) && (
                                            <span className="text-xs text-slate-400 italic">No components linked</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </BentoCard>
        </div>
    );
}
