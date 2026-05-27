/**
 * Knowledge Graph Admin Panel
 *
 * - View facts (search, paginate)
 * - Add fact (subject / predicate / value / tags)
 * - Delete fact
 * - CSV bulk import
 * - Test-extract (debug entity extraction)
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Brain, Plus, Trash2, Upload, Search, FlaskConical, RefreshCw } from 'lucide-react';

interface Fact {
    id: string;
    subject: string;
    predicate: string;
    value: string;
    tags: string[];
    confidence: number;
    source: string;
    created_by?: string;
    created_at: string;
    expires_at?: string;
}

export function KGPanel() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const limit = 25;

    // ── New fact form
    const [newFact, setNewFact] = useState({
        subject: '', predicate: 'STATUS', value: '', tags: '', confidence: 1.0,
    });

    // ── CSV import
    const [csvText, setCsvText] = useState('');
    const [showCsv, setShowCsv] = useState(false);

    // ── Test extract
    const [testText, setTestText] = useState('');
    const [testResult, setTestResult] = useState<any>(null);

    // ── Queries
    const { data: factsData, isLoading } = useQuery({
        queryKey: ['kg-facts', search, page],
        queryFn: async () => {
            const params = new URLSearchParams({
                limit: String(limit),
                offset: String(page * limit),
                ...(search ? { search } : {}),
            });
            const res = await fetch(`/api/kg/facts?${params}`, { credentials: 'include' });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
        },
    });

    const { data: statsData } = useQuery({
        queryKey: ['kg-stats'],
        queryFn: async () => {
            const res = await fetch('/api/kg/stats', { credentials: 'include' });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
        },
        refetchInterval: 30000,
    });

    const facts: Fact[] = factsData?.data ?? [];
    const totalFacts = statsData?.data?.totalFacts ?? 0;

    // ── Mutations
    const addMutation = useMutation({
        mutationFn: async () => {
            const tagsArr = newFact.tags
                ? newFact.tags.split(',').map(t => t.trim()).filter(Boolean)
                : undefined;
            const res = await fetch('/api/kg/facts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    subject: newFact.subject,
                    predicate: newFact.predicate,
                    value: newFact.value,
                    tags: tagsArr,
                    confidence: newFact.confidence,
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
            return res.json();
        },
        onSuccess: () => {
            toast({ title: 'Fact added', description: 'AI will use this on next chat.' });
            setNewFact({ subject: '', predicate: 'STATUS', value: '', tags: '', confidence: 1.0 });
            qc.invalidateQueries({ queryKey: ['kg-facts'] });
            qc.invalidateQueries({ queryKey: ['kg-stats'] });
        },
        onError: (e: any) => toast({ title: 'Failed to add', description: e.message, variant: 'destructive' }),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/kg/facts/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error('Failed');
        },
        onSuccess: () => {
            toast({ title: 'Removed' });
            qc.invalidateQueries({ queryKey: ['kg-facts'] });
            qc.invalidateQueries({ queryKey: ['kg-stats'] });
        },
    });

    const csvMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/kg/facts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ csv: csvText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Import failed');
            return data;
        },
        onSuccess: (data: any) => {
            toast({
                title: `Imported ${data.inserted} facts`,
                description: data.errors?.length ? `${data.errors.length} errors` : undefined,
            });
            setCsvText('');
            setShowCsv(false);
            qc.invalidateQueries({ queryKey: ['kg-facts'] });
            qc.invalidateQueries({ queryKey: ['kg-stats'] });
        },
        onError: (e: any) => toast({ title: 'Import failed', description: e.message, variant: 'destructive' }),
    });

    const testMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/kg/test-extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ text: testText }),
            });
            if (!res.ok) throw new Error('Failed');
            return res.json();
        },
        onSuccess: (data) => setTestResult(data.data),
    });

    return (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-semibold">Knowledge Graph</h3>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {totalFacts} facts
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => qc.invalidateQueries({ queryKey: ['kg-facts'] })}
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">
                Atomic shop facts. AI auto-injects these into every chat when relevant — no tokens wasted.
            </p>

            {/* Add fact form */}
            <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Plus className="h-4 w-4" /> Add Fact
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input
                        placeholder="Subject (e.g. Samsung Q70 2018)"
                        value={newFact.subject}
                        onChange={e => setNewFact({ ...newFact, subject: e.target.value })}
                    />
                    <Input
                        placeholder="Predicate (STATUS, VERDICT, PRICE...)"
                        value={newFact.predicate}
                        onChange={e => setNewFact({ ...newFact, predicate: e.target.value })}
                    />
                    <Input
                        placeholder="Value (BLACKLISTED, 8000-12000 BDT...)"
                        value={newFact.value}
                        onChange={e => setNewFact({ ...newFact, value: e.target.value })}
                    />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input
                        className="md:col-span-2"
                        placeholder="Tags (comma-separated, optional — auto-derived if empty)"
                        value={newFact.tags}
                        onChange={e => setNewFact({ ...newFact, tags: e.target.value })}
                    />
                    <Button
                        onClick={() => addMutation.mutate()}
                        disabled={!newFact.subject || !newFact.predicate || !newFact.value || addMutation.isPending}
                    >
                        {addMutation.isPending ? 'Adding...' : 'Add Fact'}
                    </Button>
                </div>
            </div>

            {/* CSV bulk import toggle */}
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCsv(s => !s)}>
                    <Upload className="mr-1 h-4 w-4" /> Bulk CSV
                </Button>
                <span className="text-xs text-muted-foreground">
                    Format: subject,predicate,value,tags(pipe-sep),confidence
                </span>
            </div>

            {showCsv && (
                <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
                    <Textarea
                        rows={6}
                        placeholder={`subject,predicate,value,tags,confidence\nSamsung Q70 2018,STATUS,OBSOLETE,samsung|q70|obsolete,1.0\nLG OLED B9,VERDICT,REPAIRABLE 15-25k BDT,lg|oled|b9,1.0`}
                        value={csvText}
                        onChange={e => setCsvText(e.target.value)}
                        className="font-mono text-xs"
                    />
                    <Button
                        size="sm"
                        onClick={() => csvMutation.mutate()}
                        disabled={!csvText.trim() || csvMutation.isPending}
                    >
                        {csvMutation.isPending ? 'Importing...' : 'Import'}
                    </Button>
                </div>
            )}

            {/* Test extract (debug) */}
            <details className="rounded-xl border border-dashed border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                    <FlaskConical className="mr-1 inline h-4 w-4" />
                    Test entity extraction (debug)
                </summary>
                <div className="mt-2 space-y-2">
                    <Input
                        placeholder="Type a customer message to see extracted tags + matching facts"
                        value={testText}
                        onChange={e => setTestText(e.target.value)}
                    />
                    <Button size="sm" onClick={() => testMutation.mutate()} disabled={!testText.trim()}>
                        Extract
                    </Button>
                    {testResult && (
                        <div className="space-y-1 rounded-md bg-muted p-2 text-xs">
                            <div>Tags: <code>[{testResult.tags.join(', ')}]</code></div>
                            <div>Matched: {testResult.matchedFacts.length} fact(s)</div>
                            {testResult.matchedFacts.map((f: any, i: number) => (
                                <div key={i} className="text-muted-foreground">
                                    • {f.subject} → {f.predicate}: {f.value}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </details>

            {/* Search + list */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Search facts by subject or value..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                    />
                </div>

                {isLoading ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
                ) : facts.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No facts yet. Add your first one above ↑
                    </div>
                ) : (
                    <div className="divide-y divide-border rounded-xl border border-border">
                        {facts.map(f => (
                            <div key={f.id} className="flex items-start justify-between gap-2 p-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <span className="font-medium">{f.subject}</span>
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{f.predicate}</span>
                                        <span className="text-sm text-foreground">→ {f.value}</span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {f.tags.slice(0, 8).map(t => (
                                            <span key={t} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                                {t}
                                            </span>
                                        ))}
                                        {f.confidence !== 1 && (
                                            <span className="text-[10px] text-muted-foreground">
                                                · conf {f.confidence.toFixed(2)}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground">· {f.source}</span>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteMutation.mutate(f.id)}
                                    className="text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {facts.length > 0 && (
                    <div className="flex justify-between text-xs">
                        <Button
                            variant="ghost" size="sm"
                            disabled={page === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                        >
                            ← Prev
                        </Button>
                        <span className="self-center text-muted-foreground">
                            Page {page + 1}
                        </span>
                        <Button
                            variant="ghost" size="sm"
                            disabled={facts.length < limit}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next →
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
