import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MaplibreTerradrawControl } from '@watergis/maplibre-gl-terradraw';
import '@watergis/maplibre-gl-terradraw/dist/maplibre-gl-terradraw.css';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
    BarChart3,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Expand,
    Layers3,
    LoaderCircle,
    Map,
    MapPin,
    Navigation,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    SlidersHorizontal,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AreaMapCanvas, type AreaMapMetric } from '@/components/maps/AreaMapCanvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useAdminMobileMode } from '@/hooks/useAdminMobileMode';
import {
    adminAreaMapApi,
    type AreaBoundaryFeature,
    type MapBoundaryCandidate,
    type MapPlaceSuggestion,
    type ServiceAreaMapItem,
    type ServiceAreaRecord,
    type ServiceAreaWritePayload,
    type ServiceCenterLocationRecord,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { MobileScrollContent, MobileTabHeader, MobileTabLayout } from '../shared';

const METRICS: Array<{ id: AreaMapMetric; label: string; icon: typeof BarChart3 }> = [
    { id: 'requests', label: 'Requests', icon: BarChart3 },
    { id: 'jobs', label: 'Jobs', icon: Layers3 },
    { id: 'completed', label: 'Completed', icon: CheckCircle2 },
    { id: 'completion', label: 'Completion', icon: Layers3 },
    { id: 'revenue', label: 'Revenue', icon: CircleDollarSign },
    { id: 'collected', label: 'Collected', icon: CircleDollarSign },
    { id: 'warranty', label: 'Warranty', icon: CheckCircle2 },
];

interface AreaFormState {
    city: string;
    areaName: string;
    subareaName: string;
    blockOrSector: string;
    centroidLatitude: string;
    centroidLongitude: string;
    boundaryText: string;
}

function areaLabel(area: Pick<ServiceAreaMapItem, 'city' | 'areaName' | 'subareaName' | 'blockOrSector'>) {
    return [area.blockOrSector, area.subareaName, area.areaName, area.city].filter(Boolean).join(', ');
}

function formatMoney(value: number) {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 }).format(value);
}

function MapSearchInput({
    value,
    onChange,
    localAreas,
    remoteResults,
    isSearching,
    isUnavailable,
    onSelectArea,
    onSelectPlace,
    onClear,
    className,
}: {
    value: string;
    onChange: (value: string) => void;
    localAreas: ServiceAreaMapItem[];
    remoteResults: MapPlaceSuggestion[];
    isSearching: boolean;
    isUnavailable: boolean;
    onSelectArea: (area: ServiceAreaMapItem) => void;
    onSelectPlace: (place: MapPlaceSuggestion) => void;
    onClear: () => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const query = value.trim();
    const showResults = open && query.length > 0;
    const hasResults = localAreas.length > 0 || remoteResults.length > 0;

    return (
        <div className={cn('relative', className)}>
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
                value={value}
                onFocus={() => setOpen(true)}
                onChange={(event) => {
                    onChange(event.target.value);
                    setOpen(true);
                }}
                placeholder="Search area, sector or place"
                className="h-11 pl-9 pr-10"
                aria-label="Search saved areas and Dhaka places"
            />
            {value && <button type="button" onClick={() => { onClear(); setOpen(false); }} className="absolute right-2 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear map search"><X className="h-4 w-4" /></button>}
            {showResults && <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {localAreas.length > 0 && <>
                    <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Your service areas</p>
                    {localAreas.slice(0, 4).map((area) => <button key={area.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectArea(area); setOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50"><Map className="h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{areaLabel(area)}</span><span className="block truncate text-xs capitalize text-slate-500">{area.demandLevel}</span></span></button>)}
                </>}
                {query.length >= 3 && <>
                    {localAreas.length > 0 && <div className="mx-2 my-1 border-t border-slate-100" />}
                    <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Places in Dhaka</p>
                    {isSearching && <p className="flex min-h-11 items-center gap-2 px-3 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Searching places…</p>}
                    {!isSearching && remoteResults.map((place) => <button key={place.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectPlace(place); setOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50"><MapPin className="h-4 w-4 shrink-0 text-blue-600" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{place.label}</span><span className="block truncate text-xs capitalize text-slate-500">{place.type}</span></span></button>)}
                    {!isSearching && isUnavailable && <p className="px-3 py-2 text-sm text-slate-500">Place suggestions are temporarily unavailable.</p>}
                </>}
                {!isSearching && !hasResults && !isUnavailable && <p className="px-3 py-3 text-sm text-slate-500">{query.length < 3 ? 'Type at least 3 characters for place suggestions.' : 'No saved area or Dhaka place found.'}</p>}
            </div>}
        </div>
    );
}

function formFromArea(area?: ServiceAreaRecord | null): AreaFormState {
    return {
        city: area?.city || 'Dhaka',
        areaName: area?.areaName || '',
        subareaName: area?.subareaName || '',
        blockOrSector: area?.blockOrSector || '',
        centroidLatitude: area?.centroidLatitude?.toString() || '',
        centroidLongitude: area?.centroidLongitude?.toString() || '',
        boundaryText: area?.boundaryGeoJson ? JSON.stringify(area.boundaryGeoJson, null, 2) : '',
    };
}

function parseBoundary(text: string): AreaBoundaryFeature | null {
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as AreaBoundaryFeature;
    if (parsed.type !== 'Feature' || !parsed.geometry || !['Polygon', 'MultiPolygon'].includes(parsed.geometry.type)) {
        throw new Error('Boundary must be a Polygon or MultiPolygon GeoJSON Feature');
    }
    return parsed;
}

function AreaEditor({
    open,
    area,
    onOpenChange,
}: {
    open: boolean;
    area: ServiceAreaRecord | null;
    onOpenChange: (open: boolean) => void;
}) {
    const queryClient = useQueryClient();
    const isMobile = useAdminMobileMode();
    const [form, setForm] = useState<AreaFormState>(() => formFromArea(area));
    const [placingCentroid, setPlacingCentroid] = useState(false);
    const [boundaryQuery, setBoundaryQuery] = useState(area?.areaName ?? '');
    const [previewCandidate, setPreviewCandidate] = useState<MapBoundaryCandidate | null>(null);
    const [mapRevision, setMapRevision] = useState(0);
    const drawControlRef = useRef<MaplibreTerradrawControl | null>(null);

    const boundarySearch = useQuery({
        queryKey: ['admin-map-boundary-search', boundaryQuery.trim().toLowerCase()],
        queryFn: () => adminAreaMapApi.searchBoundaries(boundaryQuery.trim()),
        enabled: false,
        retry: false,
        staleTime: 24 * 60 * 60_000,
    });

    const mutation = useMutation({
        mutationFn: (payload: ServiceAreaWritePayload) => area
            ? adminAreaMapApi.updateArea(area.id, payload)
            : adminAreaMapApi.createArea(payload),
        onSuccess: async (updated) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['area-map-admin'] }),
                queryClient.invalidateQueries({ queryKey: ['service-areas-admin'] }),
                queryClient.invalidateQueries({ queryKey: ['area-map-public'] }),
                queryClient.invalidateQueries({ queryKey: ['public-area-map'] }),
                queryClient.invalidateQueries({ queryKey: ['public-service-area-list'] }),
            ]);
            toast.success(
                area
                    ? area.isPublic && !updated.isPublic
                        ? 'Service area updated and unpublished. Review it before republishing.'
                        : 'Service area updated'
                    : 'Service area created',
            );
            onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const update = (key: keyof AreaFormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

    const runBoundarySearch = () => {
        if (boundaryQuery.trim().length < 3) {
            toast.error('Type at least 3 characters');
            return;
        }
        setPreviewCandidate(null);
        void boundarySearch.refetch();
    };

    const stageBoundaryCandidate = (candidate: MapBoundaryCandidate) => {
        if (candidate.confidence !== 'high') {
            toast.error('Only high-confidence outlines can be applied automatically. Trace the boundary manually below.');
            return;
        }
        if (!window.confirm(`Use the mapped outline for ${candidate.label}? Geometry changes will unpublish this area until you review and republish.`)) return;
        // Strip provider metadata from stored public-facing geometry properties
        const cleanBoundary: AreaBoundaryFeature = {
            type: 'Feature',
            properties: {},
            geometry: candidate.boundaryGeoJson.geometry,
        };
        setForm((current) => ({
            ...current,
            centroidLatitude: candidate.latitude.toFixed(6),
            centroidLongitude: candidate.longitude.toFixed(6),
            boundaryText: JSON.stringify(cleanBoundary, null, 2),
        }));
        drawControlRef.current = null;
        setMapRevision((value) => value + 1);
        toast.success('Boundary staged. Save area to apply it (area will unpublish until republished).');
    };

    const attachDrawControl = (map: MapLibreMap) => {
        if (drawControlRef.current) return;
        const control = new MaplibreTerradrawControl({
            modes: ['polygon', 'select', 'delete-selection', 'undo', 'redo'],
            open: true,
            showDeleteConfirmation: true,
        });
        map.addControl(control, 'top-left');
        control.activate();
        drawControlRef.current = control;
        let existingBoundary: AreaBoundaryFeature | null = null;
        try {
            existingBoundary = parseBoundary(form.boundaryText);
        } catch {
            existingBoundary = null;
        }
        if (existingBoundary) {
            const draw = control.getTerraDrawInstance();
            draw?.addFeatures([existingBoundary]);
        }
    };

    const applyDrawing = () => {
        const collection = drawControlRef.current?.getFeatures();
        const polygonFeatures = collection?.features.filter((feature) =>
            feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon',
        ) ?? [];
        if (polygonFeatures.length === 0) {
            toast.error('Draw or select a polygon first');
            return;
        }
        const first = polygonFeatures[0];
        const boundary: AreaBoundaryFeature = {
            type: 'Feature',
            properties: {},
            geometry: first.geometry as Polygon | MultiPolygon,
        };
        update('boundaryText', JSON.stringify(boundary, null, 2));
        toast.success('Drawing applied to the form');
    };

    const editorMapArea = useMemo<ServiceAreaMapItem>(() => {
        let boundaryGeoJson: AreaBoundaryFeature | null = null;
        try {
            boundaryGeoJson = parseBoundary(form.boundaryText);
        } catch {
            boundaryGeoJson = null;
        }
        const latitude = form.centroidLatitude.trim() ? Number(form.centroidLatitude) : null;
        const longitude = form.centroidLongitude.trim() ? Number(form.centroidLongitude) : null;
        return {
            id: area?.id ?? 'service-area-editor-preview',
            city: form.city.trim() || 'Dhaka',
            areaName: form.areaName.trim() || 'New service area',
            subareaName: form.subareaName.trim() || null,
            blockOrSector: form.blockOrSector.trim() || null,
            centroidLatitude: Number.isFinite(latitude) ? latitude : null,
            centroidLongitude: Number.isFinite(longitude) ? longitude : null,
            boundaryGeoJson,
            demandLevel: 'new',
            isActive: true,
        };
    }, [area?.id, form]);

    const save = () => {
        try {
            if (!form.areaName.trim()) throw new Error('Area name is required');
            const latitude = form.centroidLatitude.trim() ? Number(form.centroidLatitude) : null;
            const longitude = form.centroidLongitude.trim() ? Number(form.centroidLongitude) : null;
            if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))) {
                throw new Error('Latitude and longitude must be valid and provided together');
            }
            mutation.mutate({
                city: form.city.trim() || 'Dhaka',
                areaName: form.areaName.trim(),
                subareaName: form.subareaName.trim() || null,
                blockOrSector: form.blockOrSector.trim() || null,
                centroidLatitude: latitude,
                centroidLongitude: longitude,
                boundaryGeoJson: parseBoundary(form.boundaryText),
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Invalid service area');
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isMobile ? 'bottom' : 'right'}
                className={cn(
                    'flex flex-col overflow-hidden p-0',
                    isMobile ? 'h-[94dvh] rounded-t-[2rem]' : 'w-[min(720px,92vw)] max-w-none',
                )}
            >
                <SheetHeader className="shrink-0 border-b border-slate-200 px-5 py-4 text-left">
                    <SheetTitle>{area ? 'Edit service area' : 'Create service area'}</SheetTitle>
                    <SheetDescription>Define the hierarchy, centroid and operational boundary.</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="grid gap-4 p-5 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={(event) => update('city', event.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Area</Label><Input value={form.areaName} onChange={(event) => update('areaName', event.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Subarea</Label><Input value={form.subareaName} onChange={(event) => update('subareaName', event.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Block or sector</Label><Input value={form.blockOrSector} onChange={(event) => update('blockOrSector', event.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Latitude</Label><Input inputMode="decimal" value={form.centroidLatitude} onChange={(event) => update('centroidLatitude', event.target.value)} /></div>
                        <div className="space-y-1.5"><Label>Longitude</Label><Input inputMode="decimal" value={form.centroidLongitude} onChange={(event) => update('centroidLongitude', event.target.value)} /></div>
                    </div>

                    <div className="border-t border-slate-200 px-5 py-4">
                        <div>
                            <p className="text-sm font-bold text-slate-900">Find mapped boundary</p>
                            <p className="mt-0.5 text-xs text-slate-500">Search OpenStreetMap for a real Polygon or MultiPolygon. Point-only and rectangular viewport results are rejected.</p>
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Input
                                value={boundaryQuery}
                                onChange={(event) => setBoundaryQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        runBoundarySearch();
                                    }
                                }}
                                placeholder="Banani, Dhaka"
                                aria-label="Search mapped service-area boundaries"
                            />
                            <Button type="button" variant="outline" onClick={runBoundarySearch} disabled={boundarySearch.isFetching}>
                                {boundarySearch.isFetching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Search
                            </Button>
                        </div>
                        {boundarySearch.isError && <p className="mt-2 text-sm text-rose-600">Boundary lookup is temporarily unavailable. Trace the outline manually below.</p>}
                        {boundarySearch.data && boundarySearch.data.candidates.length === 0 && <p className="mt-2 text-sm text-slate-600">No mapped polygon was found (point-only places are rejected). Do not use a rectangular viewport; trace the actual area manually with TerraDraw below.</p>}
                        {boundarySearch.data && boundarySearch.data.candidates.length > 0 && <div className="mt-3 space-y-2">
                            {boundarySearch.data.candidates.map((candidate) => (
                                <div key={candidate.id} className={cn('flex items-start gap-3 rounded-lg border p-3', candidate.confidence === 'high' ? 'border-emerald-200 bg-emerald-50/40' : candidate.confidence === 'review' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50')}>
                                    <Map className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-900">{candidate.label}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            OSM {candidate.sourceType}/{candidate.sourceId} · {candidate.geometryType} · {candidate.vertexCount} verts · {candidate.areaSquareKm} km²
                                        </p>
                                        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                                            Confidence: {candidate.confidence}
                                            {candidate.qualityFlags?.length ? ` · ${candidate.qualityFlags.join(', ')}` : ''}
                                        </p>
                                    </div>
                                    <Button type="button" size="sm" variant="outline" onClick={() => setPreviewCandidate(candidate)}>Preview</Button>
                                </div>
                            ))}
                        </div>}
                        {previewCandidate && <div className="mt-3 overflow-hidden rounded-lg border border-blue-200 bg-blue-50">
                            <div className="h-48 bg-white">
                                <AreaMapCanvas
                                    areas={[{
                                        id: previewCandidate.id,
                                        city: form.city.trim() || 'Dhaka',
                                        areaName: form.areaName.trim() || previewCandidate.label,
                                        subareaName: null,
                                        blockOrSector: null,
                                        centroidLatitude: previewCandidate.latitude,
                                        centroidLongitude: previewCandidate.longitude,
                                        boundaryGeoJson: previewCandidate.boundaryGeoJson,
                                        demandLevel: 'new',
                                        isActive: true,
                                    }]}
                                    selectedAreaId={previewCandidate.id}
                                    ariaLabel="Mapped boundary candidate preview"
                                />
                            </div>
                            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-slate-600">
                                    {previewCandidate.confidence === 'high'
                                        ? 'High-confidence outline. Inspect, then apply. Saving unpublishes until you republish.'
                                        : 'Preview only. Review/rejected candidates require manual TerraDraw tracing — automatic “Use outline” is disabled.'}
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={previewCandidate.confidence !== 'high'}
                                    onClick={() => stageBoundaryCandidate(previewCandidate)}
                                >
                                    Use outline
                                </Button>
                            </div>
                        </div>}
                    </div>

                    <div className="border-y border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-bold text-slate-900">Draw boundary</p>
                                <p className="text-xs text-slate-500">Use Polygon, then apply the drawing before saving.</p>
                            </div>
                            <div className="flex gap-2">
                                <Button type="button" size="sm" variant={placingCentroid ? 'default' : 'outline'} onClick={() => setPlacingCentroid((value) => !value)}>
                                    <MapPin className="h-4 w-4" /> Set centroid
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={applyDrawing}>Apply drawing</Button>
                            </div>
                        </div>
                        <div className="h-[320px] overflow-hidden rounded-lg border border-slate-200 bg-white sm:h-[390px]">
                            <AreaMapCanvas
                                key={mapRevision}
                                areas={[editorMapArea]}
                                selectedAreaId={editorMapArea.id}
                                onMapReady={attachDrawControl}
                                onMapClick={placingCentroid ? ({ latitude, longitude }) => {
                                    update('centroidLatitude', latitude.toFixed(6));
                                    update('centroidLongitude', longitude.toFixed(6));
                                    setPlacingCentroid(false);
                                } : undefined}
                                ariaLabel="Service area geometry editor"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5 p-5">
                        <Label>GeoJSON boundary</Label>
                        <Textarea value={form.boundaryText} onChange={(event) => update('boundaryText', event.target.value)} className="min-h-40 font-mono text-xs" placeholder='{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[...]}}' />
                    </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" onClick={save} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save area'}</Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function canPublishArea(area: ServiceAreaMapItem | ServiceAreaRecord): boolean {
    const nameOk = (area.areaName?.trim().length ?? 0) >= 2;
    const centroidOk = area.centroidLatitude != null && area.centroidLongitude != null
        && Number.isFinite(area.centroidLatitude) && Number.isFinite(area.centroidLongitude);
    const geom = area.boundaryGeoJson;
    const geomOk = Boolean(
        geom
        && geom.type === 'Feature'
        && geom.geometry
        && (geom.geometry.type === 'Polygon' || geom.geometry.type === 'MultiPolygon'),
    );
    return nameOk && centroidOk && geomOk && area.isActive !== false;
}

function AreaDetails({ area }: { area: ServiceAreaMapItem }) {
    const requestCount = area.serviceRequestCount ?? 0;
    const completed = area.completedJobCount ?? 0;
    const completion = requestCount > 0 ? Math.round((completed / requestCount) * 100) : 0;
    const published = area.isPublic === true;
    return (
        <div className="space-y-4">
            <div>
                <p className="text-xs font-bold uppercase text-blue-600">Selected area</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{areaLabel(area)}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className={cn('rounded-lg px-3 py-2 text-sm', area.isActive === false ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800')}>
                    <p className="text-[11px] opacity-80">Operational</p>
                    <p className="font-bold">{area.isActive === false ? 'Inactive' : 'Active'}</p>
                </div>
                <div className={cn('rounded-lg px-3 py-2 text-sm', published ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
                    <p className="text-[11px] opacity-80">Customer map</p>
                    <p className="font-bold">{published ? 'Published' : 'Unpublished'}</p>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
                {[
                    ['Requests', requestCount.toLocaleString()],
                    ['Completed', completed.toLocaleString()],
                    ['Completion', `${completion}%`],
                    ['Billed', formatMoney(area.billedTotal ?? 0)],
                    ['Collected', formatMoney(area.collectedTotal ?? 0)],
                    ['Warranty claims', area.warrantyClaimCount ?? 0],
                ].map(([label, value]) => (
                    <div key={label} className="bg-white p-3">
                        <p className="text-[11px] text-slate-500">{label}</p>
                        <p className="mt-1 text-base font-black text-slate-900">{value}</p>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
                <span className="text-slate-500">Demand</span>
                <span className="font-bold capitalize text-slate-800">{area.demandLevel}</span>
            </div>
        </div>
    );
}

function ServiceCenterEditor({
    open,
    canManage,
    areas,
    initial,
    onOpenChange,
}: {
    open: boolean;
    canManage: boolean;
    areas: ServiceAreaMapItem[];
    initial: ServiceCenterLocationRecord;
    onOpenChange: (open: boolean) => void;
}) {
    const queryClient = useQueryClient();
    const isMobile = useAdminMobileMode();
    const [value, setValue] = useState(initial);
    const [placing, setPlacing] = useState(false);
    const mapLocation = value.latitude != null && value.longitude != null
        ? { latitude: value.latitude, longitude: value.longitude }
        : null;
    const dirty = JSON.stringify(value) !== JSON.stringify(initial);
    const setCoordinates = ({ latitude, longitude }: { latitude: number; longitude: number }) => {
        if (!canManage) return;
        setValue((current) => ({ ...current, latitude, longitude }));
        setPlacing(false);
    };
    const close = () => {
        if (dirty && !window.confirm('Discard unsaved service-center changes?')) return;
        onOpenChange(false);
    };
    const save = useMutation({
        mutationFn: () => adminAreaMapApi.updateServiceCenter(value),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['service-center-location'] });
            toast.success('Service-center pin saved');
            onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message),
    });
    const useCurrentLocation = () => navigator.geolocation.getCurrentPosition(
        ({ coords }) => setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }),
        () => toast.error('Current location is unavailable'),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );

    return (
        <Sheet open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
            <SheetContent side={isMobile ? 'bottom' : 'right'} className={cn('flex flex-col overflow-hidden p-0', isMobile ? 'h-[94dvh] rounded-t-2xl' : 'w-[min(760px,94vw)] max-w-none')}>
                <SheetHeader className="border-b border-slate-200 px-5 py-4 text-left">
                    <SheetTitle>Promise Electronics service center</SheetTitle>
                    <SheetDescription>{canManage ? 'Place the canonical shop pin used by customer routing.' : 'Canonical routing destination. Read-only for managers.'}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Input disabled={!canManage} value={value.address} onChange={(event) => setValue((current) => ({ ...current, address: event.target.value }))} /></div>
                        <div className="space-y-1.5"><Label>Latitude</Label><Input disabled={!canManage} inputMode="decimal" value={value.latitude ?? ''} onChange={(event) => setValue((current) => ({ ...current, latitude: event.target.value ? Number(event.target.value) : null }))} /></div>
                        <div className="space-y-1.5"><Label>Longitude</Label><Input disabled={!canManage} inputMode="decimal" value={value.longitude ?? ''} onChange={(event) => setValue((current) => ({ ...current, longitude: event.target.value ? Number(event.target.value) : null }))} /></div>
                        <div className="space-y-1.5 sm:col-span-2"><Label>Google Place ID</Label><Input disabled={!canManage} value={value.googlePlaceId} onChange={(event) => setValue((current) => ({ ...current, googlePlaceId: event.target.value }))} /></div>
                    </div>
                    {canManage && <div className="flex flex-wrap gap-2 px-4 pb-3"><Button type="button" variant={placing ? 'default' : 'outline'} onClick={() => setPlacing((current) => !current)}><MapPin className="h-4 w-4" /> Click map to place</Button><Button type="button" variant="outline" onClick={useCurrentLocation}><Navigation className="h-4 w-4" /> Use current location</Button><Button type="button" variant="outline" onClick={() => setValue(initial)}><RotateCcw className="h-4 w-4" /> Reset</Button></div>}
                    <div className="h-[420px] min-h-[45dvh] bg-slate-100">
                        <AreaMapCanvas areas={areas} serviceCenter={mapLocation} serviceCenterDraggable={canManage} onServiceCenterMove={setCoordinates} onMapClick={placing ? setCoordinates : undefined} ariaLabel="Service-center pin editor" />
                    </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"><Button type="button" variant="outline" onClick={close}>{canManage ? 'Cancel' : 'Close'}</Button>{canManage && <Button type="button" disabled={!dirty || save.isPending || value.latitude == null || value.longitude == null} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save location'}</Button>}</div>
            </SheetContent>
        </Sheet>
    );
}

export default function AreaIntelligenceTab() {
    const isMobile = useAdminMobileMode();
    const { user, permissions } = useAdminAuth();
    const queryClient = useQueryClient();
    const canManage = user?.role === 'Super Admin'
        || (permissions as Record<string, boolean | undefined>)['map.manageAreas'] === true;
    const [metric, setMetric] = useState<AreaMapMetric>('requests');
    const [search, setSearch] = useState('');
    const [debouncedPlaceSearch, setDebouncedPlaceSearch] = useState('');
    const [searchLocation, setSearchLocation] = useState<{ latitude: number; longitude: number; label: string } | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [threeDimensional, setThreeDimensional] = useState(!isMobile);
    const [presentation, setPresentation] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingArea, setEditingArea] = useState<ServiceAreaRecord | null>(null);
    const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
    const [serviceCenterOpen, setServiceCenterOpen] = useState(false);

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ['area-map-admin', startDate, endDate],
        queryFn: () => adminAreaMapApi.getMap({ startDate: startDate || undefined, endDate: endDate || undefined }),
        staleTime: 60_000,
    });
    const { data: records = [] } = useQuery({
        queryKey: ['service-areas-admin'],
        queryFn: adminAreaMapApi.getAreas,
        staleTime: 60_000,
        enabled: canManage,
    });
    const { data: serviceCenter = { address: '', latitude: null, longitude: null, googlePlaceId: '' } } = useQuery({
        queryKey: ['service-center-location'],
        queryFn: adminAreaMapApi.getServiceCenter,
        staleTime: 60_000,
    });
    const { data: health } = useQuery({
        queryKey: ['area-health'],
        queryFn: adminAreaMapApi.getHealth,
        staleTime: 60_000,
    });
    useEffect(() => {
        const timeout = window.setTimeout(() => setDebouncedPlaceSearch(search.trim()), 300);
        return () => window.clearTimeout(timeout);
    }, [search]);
    const placeSearch = useQuery({
        queryKey: ['admin-map-place-search', debouncedPlaceSearch],
        queryFn: () => adminAreaMapApi.searchPlaces(debouncedPlaceSearch),
        enabled: debouncedPlaceSearch.length >= 3,
        staleTime: 5 * 60_000,
        retry: false,
    });
    const healthWarnings = health ? [
        health.missingServiceCenterPin && 'Service-center pin is missing',
        health.activeAreaCount === 0 && 'No active service areas',
        health.areasMissingGeometry > 0 && `${health.areasMissingGeometry} area(s) have no map geometry`,
        health.retailRequestsWithoutArea > 0 && `${health.retailRequestsWithoutArea} retail request(s) need area attribution`,
        health.retailJobsWithoutArea > 0 && `${health.retailJobsWithoutArea} retail job(s) need area attribution`,
        health.retailPosWithoutArea > 0 && `${health.retailPosWithoutArea} retail POS transaction(s) need area attribution`,
        health.warrantyClaimsWithoutArea > 0 && `${health.warrantyClaimsWithoutArea} warranty claim(s) need area attribution`,
        health.legacyPosPendingAttribution > 0 && `${health.legacyPosPendingAttribution} legacy POS link(s) require review`,
    ].filter((warning): warning is string => Boolean(warning)) : [];
    const serviceCenterMapLocation = serviceCenter.latitude != null && serviceCenter.longitude != null
        ? { latitude: serviceCenter.latitude, longitude: serviceCenter.longitude }
        : null;

    const filteredAreas = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return data?.areas ?? [];
        return (data?.areas ?? []).filter((area) => areaLabel(area).toLowerCase().includes(query));
    }, [data?.areas, search]);
    const selectedArea = (data?.areas ?? []).find((area) => area.id === selectedId) ?? null;
    const totals = useMemo(() => filteredAreas.reduce((sum, area) => ({
        requests: sum.requests + (area.serviceRequestCount ?? 0),
        completed: sum.completed + (area.completedJobCount ?? 0),
        revenue: sum.revenue + (area.billedTotal ?? 0),
    }), { requests: 0, completed: 0, revenue: 0 }), [filteredAreas]);

    const invalidateAreaQueries = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['area-map-admin'] }),
            queryClient.invalidateQueries({ queryKey: ['service-areas-admin'] }),
            queryClient.invalidateQueries({ queryKey: ['area-map-public'] }),
            queryClient.invalidateQueries({ queryKey: ['public-area-map'] }),
            queryClient.invalidateQueries({ queryKey: ['public-service-area-list'] }),
        ]);
    };

    const deactivate = useMutation({
        mutationFn: adminAreaMapApi.deactivateArea,
        onSuccess: async () => {
            await invalidateAreaQueries();
            setSelectedId(null);
            toast.success('Service area deactivated and unpublished');
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const publish = useMutation({
        mutationFn: adminAreaMapApi.publishArea,
        onSuccess: async () => {
            await invalidateAreaQueries();
            toast.success('Service area published to customer map');
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const unpublish = useMutation({
        mutationFn: adminAreaMapApi.unpublishArea,
        onSuccess: async () => {
            await invalidateAreaQueries();
            toast.success('Service area unpublished from customer map');
        },
        onError: (error: Error) => toast.error(error.message),
    });

    const selectedRecord = selectedId
        ? records.find((record) => record.id === selectedId) ?? null
        : null;
    const selectedIsPublic = selectedArea?.isPublic === true || selectedRecord?.isPublic === true;
    const selectedPublishable = selectedArea
        ? canPublishArea({ ...selectedArea, ...(selectedRecord ?? {}) })
        : false;

    const selectArea = (area: ServiceAreaMapItem) => {
        setSelectedId(area.id);
        setSearchLocation(null);
        if (isMobile) setMobileDetailsOpen(true);
    };
    const selectPlace = (place: MapPlaceSuggestion) => {
        setSelectedId(null);
        setSearch(place.label);
        setSearchLocation({ latitude: place.latitude, longitude: place.longitude, label: place.label });
    };
    const clearSearch = () => {
        setSearch('');
        setSearchLocation(null);
    };
    const openEditor = (area?: ServiceAreaMapItem | null) => {
        setEditingArea(area ? records.find((record) => record.id === area.id) ?? null : null);
        setEditorOpen(true);
    };

    const map = (
        <AreaMapCanvas
            areas={data?.areas ?? []}
            selectedAreaId={selectedId}
            onSelectArea={selectArea}
            metric={metric}
            threeDimensional={!isMobile && threeDimensional}
            serviceCenter={serviceCenterMapLocation}
            searchLocation={searchLocation}
            ariaLabel="Area intelligence analytics map"
        />
    );

    if (isMobile) {
        return (
            <MobileTabLayout className="bg-[#f8fafc]">
                <MobileTabHeader className="space-y-2 border-b border-blue-100 bg-[#f8fafc] px-3 pb-2 pt-2">
                    <div className="flex items-center justify-between gap-2">
                        <div><p className="text-[10px] font-bold uppercase text-blue-600">Operations</p><h1 className="text-xl font-black text-slate-950">Area Intelligence</h1></div>
                        <div className="flex gap-2"><Button size="icon" variant="outline" className="h-10 w-10 rounded-xl" onClick={() => setServiceCenterOpen(true)} title="Service-center pin"><MapPin className="h-5 w-5" /></Button>{canManage && <Button size="icon" className="h-10 w-10 rounded-xl" onClick={() => openEditor()} title="Create area"><Plus className="h-5 w-5" /></Button>}</div>
                    </div>
                    <MapSearchInput value={search} onChange={setSearch} localAreas={filteredAreas} remoteResults={placeSearch.data?.results ?? []} isSearching={placeSearch.isFetching} isUnavailable={placeSearch.isError} onSelectArea={selectArea} onSelectPlace={selectPlace} onClear={clearSearch} />
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {METRICS.map((item) => <button key={item.id} type="button" onClick={() => setMetric(item.id)} className={cn('h-9 shrink-0 rounded-lg px-3 text-xs font-bold', metric === item.id ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-600')}>{item.label}</button>)}
                    </div>
                </MobileTabHeader>
                <MobileScrollContent className="space-y-2 px-3 pt-2">
                    {healthWarnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Area data needs attention</p>{healthWarnings.slice(0, 3).map((warning) => <p key={warning} className="mt-1 text-[11px] text-amber-800">{warning}</p>)}</div>}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[10px] text-slate-500">Requests</p><p className="font-black">{totals.requests}</p></div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[10px] text-slate-500">Completed</p><p className="font-black">{totals.completed}</p></div>
                        <div className="rounded-lg border border-slate-200 bg-white p-2"><p className="text-[10px] text-slate-500">Areas</p><p className="font-black">{filteredAreas.length}</p></div>
                    </div>
                    <div className="h-[clamp(220px,calc(52dvh-var(--admin-mobile-bottom-clearance)),420px)] overflow-hidden rounded-xl border border-slate-200 bg-white">{map}</div>
                    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
                        {filteredAreas.map((area) => <button key={area.id} type="button" onClick={() => selectArea(area)} className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left active:bg-slate-50"><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-900">{areaLabel(area)}</span><span className="text-xs capitalize text-slate-500">{area.demandLevel}</span></span><span className="text-sm font-black text-blue-700">{area.serviceRequestCount ?? 0}</span></button>)}
                    </div>
                </MobileScrollContent>
                <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
                    <SheetContent side="bottom" className="rounded-t-[2rem] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <SheetHeader className="text-left"><SheetTitle>Area details</SheetTitle><SheetDescription>Aggregate operational performance only.</SheetDescription></SheetHeader>
                        {selectedArea && <div className="mt-4"><AreaDetails area={{ ...selectedArea, isPublic: selectedIsPublic, isActive: selectedRecord?.isActive ?? selectedArea.isActive }} />{canManage && <div className="mt-4 space-y-2"><Button className="w-full" onClick={() => openEditor(selectedArea)}><Pencil className="h-4 w-4" /> Edit area</Button>{selectedIsPublic ? <Button variant="outline" className="w-full" disabled={unpublish.isPending} onClick={() => { if (window.confirm(`Unpublish ${areaLabel(selectedArea)} from the customer map?`)) unpublish.mutate(selectedArea.id); }}>Unpublish</Button> : <Button variant="outline" className="w-full" disabled={!selectedPublishable || publish.isPending} onClick={() => { if (!selectedPublishable) { toast.error('Name, centroid and boundary required to publish'); return; } if (window.confirm(`Publish ${areaLabel(selectedArea)} to the public customer map?`)) publish.mutate(selectedArea.id); }}>Publish to customers</Button>}<Button variant="outline" className="w-full text-rose-600" onClick={() => { if (window.confirm(`Deactivate ${areaLabel(selectedArea)}? It will also be unpublished.`)) deactivate.mutate(selectedArea.id); }}><Trash2 className="h-4 w-4" /> Deactivate</Button></div>}</div>}
                    </SheetContent>
                </Sheet>
                {editorOpen && <AreaEditor key={editingArea?.id ?? 'new'} open={editorOpen} area={editingArea} onOpenChange={setEditorOpen} />}
                {serviceCenterOpen && <ServiceCenterEditor open={serviceCenterOpen} canManage={canManage} areas={data?.areas ?? []} initial={serviceCenter} onOpenChange={setServiceCenterOpen} />}
            </MobileTabLayout>
        );
    }

    const desktopWorkspace = (
        <div className={cn('flex h-full min-h-[680px] overflow-hidden bg-slate-100', presentation && 'fixed inset-0 z-[250] min-h-0')}>
            <aside className="flex w-[310px] shrink-0 flex-col border-r border-slate-200 bg-white">
                <div className="border-b border-slate-200 p-4">
                    <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-blue-600">Operational map</p><h1 className="text-xl font-black text-slate-950">Area Intelligence</h1></div>{presentation && <Button size="icon" variant="outline" onClick={() => setPresentation(false)} title="Exit presentation"><X className="h-4 w-4" /></Button>}</div>
                    <MapSearchInput className="mt-4" value={search} onChange={setSearch} localAreas={filteredAreas} remoteResults={placeSearch.data?.results ?? []} isSearching={placeSearch.isFetching} isUnavailable={placeSearch.isError} onSelectArea={selectArea} onSelectPlace={selectPlace} onClear={clearSearch} />
                </div>
                <div className="space-y-4 border-b border-slate-200 p-4">
                    {healthWarnings.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-black text-amber-900">Data health</p>{healthWarnings.map((warning) => <p key={warning} className="mt-1 text-[11px] text-amber-800">{warning}</p>)}</div>}
                    <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">From</Label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
                        <div><Label className="text-xs">To</Label><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">{METRICS.map((item) => <button key={item.id} type="button" onClick={() => setMetric(item.id)} className={cn('flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold', metric === item.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600')}><item.icon className="h-4 w-4" />{item.label}</button>)}</div>
                    <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setThreeDimensional((value) => !value)}><Layers3 className="h-4 w-4" /> {threeDimensional ? '2D' : '2.5D'}</Button><Button variant="outline" size="icon" onClick={() => void refetch()} title="Refresh"><RotateCcw className="h-4 w-4" /></Button></div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {isLoading && <p className="p-4 text-sm text-slate-500">Loading map data…</p>}
                    {isError && <button type="button" onClick={() => void refetch()} className="w-full rounded-lg bg-rose-50 p-4 text-left text-sm text-rose-700">Map data failed. Click to retry.</button>}
                    {filteredAreas.map((area) => <button key={area.id} type="button" onClick={() => selectArea(area)} className={cn('mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left', selectedId === area.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50')}><span className="min-w-0"><span className="block truncate text-sm font-bold">{areaLabel(area)}</span><span className="text-[11px] capitalize text-slate-500">{area.demandLevel}</span></span><span className="text-sm font-black">{area.serviceRequestCount ?? 0}</span></button>)}
                </div>
                <div className="space-y-2 border-t border-slate-200 p-3"><Button variant="outline" className="w-full" onClick={() => setServiceCenterOpen(true)}><MapPin className="h-4 w-4" /> Service-center pin</Button>{canManage && <Button className="w-full" onClick={() => openEditor()}><Plus className="h-4 w-4" /> Add service area</Button>}</div>
            </aside>

            <main className="relative min-w-0 flex-1">
                {map}
                <div className="absolute left-4 top-4 flex gap-2"><Button variant="secondary" onClick={() => setPresentation(true)}><Expand className="h-4 w-4" /> Presentation</Button></div>
                <div className="absolute bottom-4 left-4 rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur"><span className="font-bold capitalize">{metric}</span> · taller areas indicate higher values</div>
            </main>

            <aside className="w-[330px] shrink-0 border-l border-slate-200 bg-white p-5">
                {selectedArea ? <><AreaDetails area={{ ...selectedArea, isPublic: selectedIsPublic, isActive: selectedRecord?.isActive ?? selectedArea.isActive }} />{canManage && <div className="mt-5 space-y-2"><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openEditor(selectedArea)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="outline" className="text-rose-600" onClick={() => { if (window.confirm(`Deactivate ${areaLabel(selectedArea)}? It will also be unpublished.`)) deactivate.mutate(selectedArea.id); }}><Trash2 className="h-4 w-4" /> Deactivate</Button></div>{selectedIsPublic ? <Button variant="outline" className="w-full" disabled={unpublish.isPending} onClick={() => { if (window.confirm(`Unpublish ${areaLabel(selectedArea)} from the customer map?`)) unpublish.mutate(selectedArea.id); }}>Unpublish from customers</Button> : <Button className="w-full" disabled={!selectedPublishable || publish.isPending} onClick={() => { if (!selectedPublishable) { toast.error('Name, centroid and boundary required to publish'); return; } if (window.confirm(`Publish ${areaLabel(selectedArea)} to the public customer map?`)) publish.mutate(selectedArea.id); }}>Publish to customers</Button>}</div>}</> : <div className="flex h-full flex-col items-center justify-center text-center text-slate-400"><Map className="mb-3 h-10 w-10" /><p className="font-bold text-slate-600">Select an area</p><p className="mt-1 text-sm">Inspect aggregate demand, completion and revenue.</p></div>}
            </aside>
        </div>
    );

    return <>{presentation ? createPortal(desktopWorkspace, document.body) : desktopWorkspace}{editorOpen && <AreaEditor key={editingArea?.id ?? 'new'} open={editorOpen} area={editingArea} onOpenChange={setEditorOpen} />}{serviceCenterOpen && <ServiceCenterEditor open={serviceCenterOpen} canManage={canManage} areas={data?.areas ?? []} initial={serviceCenter} onOpenChange={setServiceCenterOpen} />}</>;
}
