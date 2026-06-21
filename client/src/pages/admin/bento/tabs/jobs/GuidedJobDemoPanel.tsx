import { useMemo, useState, type ReactNode } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    ClipboardCheck,
    Hammer,
    Plus,
    ShieldCheck,
    UserCheck,
    X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    MobileMarqueeText,
    MobileScrollContent,
    MobileSegmentTabs,
    MobileTabHeader,
    MobileTabLayout,
} from "../../shared";

type DemoStage = "review" | "create" | "assign" | "status";

const stages: Array<{ value: DemoStage; label: string }> = [
    { value: "review", label: "Review" },
    { value: "create", label: "Create" },
    { value: "assign", label: "Assign" },
    { value: "status", label: "Status" },
];

const demoJob = {
    ticketNumber: "DEMO-JOB-2026-0001",
    customer: "Md Rahim",
    phone: "01700-111-222",
    device: 'Samsung 43" LED TV',
    model: "UA43T5400",
    issue: "Sound is working, screen has no backlight",
    priority: "High",
    status: "Pending",
    technician: "Aminul Technician",
    accessories: "Remote, power cable",
    intakeNote: "Customer says the TV went dark during load shedding.",
    estimate: "৳2,800 - ৳3,500",
    expectedDelivery: "Tomorrow, 7:00 PM",
};

export function GuidedJobDemoPanel({
    role,
    lesson,
    onExit,
    onBack,
}: {
    role: string;
    lesson: string;
    onExit: () => void;
    onBack: () => void;
}) {
    const [stage, setStage] = useState<DemoStage>("review");
    const [demoCreated, setDemoCreated] = useState(false);
    const [form, setForm] = useState({
        customer: demoJob.customer,
        phone: demoJob.phone,
        device: demoJob.device,
        model: demoJob.model,
        issue: demoJob.issue,
        technician: demoJob.technician,
    });

    const stageIndex = useMemo(() => stages.findIndex((item) => item.value === stage), [stage]);

    const updateForm = (key: keyof typeof form, value: string) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const createDemoJob = () => {
        setDemoCreated(true);
        setStage("assign");
    };

    return (
        <div className="h-full bg-[#f8fafc]">
            <MobileTabLayout className="md:hidden">
                <MobileTabHeader className="border-blue-100 bg-gradient-to-b from-blue-50 via-slate-50 to-[#f8fafc] pt-3">
                    <div className="flex items-start justify-between gap-2">
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-2xl" onClick={onBack}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="min-w-0 flex-1">
                            <MobileMarqueeText className="text-[20px] font-black leading-tight text-slate-950">
                                Jobs demo workspace
                            </MobileMarqueeText>
                            <MobileMarqueeText className="text-xs font-bold text-blue-700">
                                {role} training - {lesson.replaceAll("_", " ")}
                            </MobileMarqueeText>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-2xl" onClick={onExit}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
                        Demo only. These buttons teach the workflow and never save to PostgreSQL.
                    </div>

                    <MobileSegmentTabs
                        value={stage}
                        onChange={(value) => setStage(value as DemoStage)}
                        tone="blue"
                        items={stages}
                    />
                </MobileTabHeader>

                <MobileScrollContent className="space-y-3 pb-[calc(7rem+env(safe-area-inset-bottom))]">
                    <TrainingJobCard stage={stage} demoCreated={demoCreated} stageIndex={stageIndex} />

                    {stage === "review" && <ReviewLesson onNext={() => setStage("create")} />}
                    {stage === "create" && (
                        <CreateDemoJobForm
                            form={form}
                            onChange={updateForm}
                            onCreate={createDemoJob}
                            demoCreated={demoCreated}
                        />
                    )}
                    {stage === "assign" && <AssignLesson onNext={() => setStage("status")} />}
                    {stage === "status" && <StatusLesson onRestart={() => { setDemoCreated(false); setStage("review"); }} />}
                </MobileScrollContent>
            </MobileTabLayout>

            <div className="hidden h-full overflow-y-auto bg-slate-50 p-6 md:block">
                <div className="mx-auto max-w-6xl space-y-5">
                    <div className="flex items-start justify-between rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
                        <div>
                            <Badge className="mb-3 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">Safe Jobs Training</Badge>
                            <h1 className="text-3xl font-black text-slate-950">Jobs demo workspace</h1>
                            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
                                This is a fake job workflow for training. It shows the same data structure users see in Jobs, but no action writes to the database.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" className="rounded-2xl" onClick={onBack}>Back to guide</Button>
                            <Button type="button" className="rounded-2xl bg-slate-900 text-white" onClick={onExit}>Exit demo</Button>
                        </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
                        <TrainingJobCard stage={stage} demoCreated={demoCreated} stageIndex={stageIndex} desktop />
                        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                            <MobileSegmentTabs value={stage} onChange={(value) => setStage(value as DemoStage)} tone="blue" items={stages} />
                            <div className="mt-4">
                                {stage === "review" && <ReviewLesson onNext={() => setStage("create")} desktop />}
                                {stage === "create" && (
                                    <CreateDemoJobForm
                                        form={form}
                                        onChange={updateForm}
                                        onCreate={createDemoJob}
                                        demoCreated={demoCreated}
                                        desktop
                                    />
                                )}
                                {stage === "assign" && <AssignLesson onNext={() => setStage("status")} desktop />}
                                {stage === "status" && <StatusLesson onRestart={() => { setDemoCreated(false); setStage("review"); }} desktop />}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TrainingJobCard({
    stage,
    demoCreated,
    stageIndex,
    desktop = false,
}: {
    stage: DemoStage;
    demoCreated: boolean;
    stageIndex: number;
    desktop?: boolean;
}) {
    return (
        <div className={cn("rounded-3xl border border-slate-200 bg-white p-4 shadow-sm", desktop && "h-fit")}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <MobileMarqueeText className="font-mono text-sm font-black text-blue-700">
                        #{demoJob.ticketNumber}
                    </MobileMarqueeText>
                    <MobileMarqueeText className="mt-1 text-xl font-black text-slate-950">
                        {demoJob.device}
                    </MobileMarqueeText>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500">{demoJob.issue}</p>
                </div>
                <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">{demoJob.priority}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <InfoTile label="Customer" value={demoJob.customer} />
                <InfoTile label="Phone" value={demoJob.phone} />
                <InfoTile label="Model" value={demoJob.model} />
                <InfoTile label="Estimate" value={demoJob.estimate} />
                <InfoTile label="Technician" value={demoJob.technician} />
                <InfoTile label="Delivery" value={demoJob.expectedDelivery} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-slate-500">Intake note</div>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{demoJob.intakeNote}</p>
                <p className="mt-2 text-xs font-bold text-slate-500">Accessories: {demoJob.accessories}</p>
            </div>

            <div className="mt-4 space-y-2">
                {stages.map((item, index) => (
                    <div key={item.value} className="flex items-center gap-3">
                        <span className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                            index < stageIndex || (item.value === "create" && demoCreated)
                                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                : item.value === stage
                                    ? "border-blue-100 bg-blue-50 text-blue-700"
                                    : "border-slate-200 bg-white text-slate-400",
                        )}>
                            {index < stageIndex || (item.value === "create" && demoCreated) ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="text-sm font-black text-slate-700">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function InfoTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
            <MobileMarqueeText className="mt-0.5 text-xs font-black text-slate-800">{value}</MobileMarqueeText>
        </div>
    );
}

function ReviewLesson({ onNext, desktop = false }: { onNext: () => void; desktop?: boolean }) {
    return (
        <LessonShell
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="First, read the complete job card"
            body="A technician should confirm the ticket number, device, issue, accessories, customer note, estimate, and expected delivery before touching the TV."
            desktop={desktop}
        >
            <Checklist
                items={[
                    "Confirm ticket number and customer phone.",
                    "Read issue and intake note before diagnosis.",
                    "Check accessories so nothing is lost.",
                    "Only continue when the job information makes sense.",
                ]}
            />
            <Button type="button" className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-white" onClick={onNext}>
                Continue to demo create
            </Button>
        </LessonShell>
    );
}

function CreateDemoJobForm({
    form,
    onChange,
    onCreate,
    demoCreated,
    desktop = false,
}: {
    form: Record<"customer" | "phone" | "device" | "model" | "issue" | "technician", string>;
    onChange: (key: "customer" | "phone" | "device" | "model" | "issue" | "technician", value: string) => void;
    onCreate: () => void;
    demoCreated: boolean;
    desktop?: boolean;
}) {
    return (
        <LessonShell
            icon={<Plus className="h-5 w-5" />}
            title="Practice creating a job without saving"
            body="These fields behave like a training form. The button only moves the demo forward, so a new user can practice safely."
            desktop={desktop}
        >
            <div className="grid gap-2 md:grid-cols-2">
                <DemoInput label="Customer" value={form.customer} onChange={(value) => onChange("customer", value)} />
                <DemoInput label="Phone" value={form.phone} onChange={(value) => onChange("phone", value)} />
                <DemoInput label="Device" value={form.device} onChange={(value) => onChange("device", value)} />
                <DemoInput label="Model" value={form.model} onChange={(value) => onChange("model", value)} />
                <DemoInput label="Issue" value={form.issue} onChange={(value) => onChange("issue", value)} wide />
                <DemoInput label="Technician" value={form.technician} onChange={(value) => onChange("technician", value)} wide />
            </div>
            {demoCreated && (
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                    Demo job created locally. No database row was created.
                </div>
            )}
            <Button type="button" className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-white" onClick={onCreate}>
                Create demo job
            </Button>
        </LessonShell>
    );
}

function AssignLesson({ onNext, desktop = false }: { onNext: () => void; desktop?: boolean }) {
    return (
        <LessonShell
            icon={<UserCheck className="h-5 w-5" />}
            title="Then assign and check responsibility"
            body="The user learns that assignment means responsibility. The technician name, role, and next action must be clear before status changes."
            desktop={desktop}
        >
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">AT</span>
                    <div className="min-w-0 flex-1">
                        <MobileMarqueeText className="text-sm font-black text-slate-950">{demoJob.technician}</MobileMarqueeText>
                        <p className="text-xs font-bold text-blue-700">Primary technician - demo assignment</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                </div>
            </div>
            <Checklist
                items={[
                    "Assign the person who will actually diagnose the TV.",
                    "Use assistant technicians only when support is needed.",
                    "Do not change status before the assignment is clear.",
                ]}
            />
            <Button type="button" className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-white" onClick={onNext}>
                Continue to status update
            </Button>
        </LessonShell>
    );
}

function StatusLesson({ onRestart, desktop = false }: { onRestart: () => void; desktop?: boolean }) {
    return (
        <LessonShell
            icon={<Hammer className="h-5 w-5" />}
            title="Finally, change status only after real progress"
            body="This teaches the user what the status means. In live mode, status updates affect customer tracking and the admin dashboard."
            desktop={desktop}
        >
            <div className="grid grid-cols-2 gap-2">
                {["Pending", "Diagnosing", "In Progress", "Ready"].map((status, index) => (
                    <div
                        key={status}
                        className={cn(
                            "rounded-2xl border px-3 py-3 text-center text-xs font-black",
                            index === 2 ? "border-blue-100 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50 text-slate-500",
                        )}
                    >
                        {status}
                    </div>
                ))}
            </div>
            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                Never mark Ready until repair is tested. Never mark Delivered until handover/payment is complete.
            </div>
            <Button type="button" variant="outline" className="mt-4 h-12 w-full rounded-2xl border-slate-200 bg-white" onClick={onRestart}>
                Restart jobs lesson
            </Button>
        </LessonShell>
    );
}

function LessonShell({
    icon,
    title,
    body,
    children,
    desktop = false,
}: {
    icon: ReactNode;
    title: string;
    body: string;
    children: ReactNode;
    desktop?: boolean;
}) {
    return (
        <div className={cn("rounded-3xl border border-slate-200 bg-white p-4 shadow-sm", desktop && "rounded-2xl")}>
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
                    {icon}
                </span>
                <div className="min-w-0 flex-1">
                    <MobileMarqueeText className="text-lg font-black leading-tight text-slate-950">{title}</MobileMarqueeText>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{body}</p>
                </div>
            </div>
            <div className="mt-4">{children}</div>
        </div>
    );
}

function DemoInput({
    label,
    value,
    onChange,
    wide = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    wide?: boolean;
}) {
    return (
        <label className={cn("block", wide && "md:col-span-2")}>
            <span className="mb-1 block text-xs font-black uppercase text-slate-500">{label}</span>
            <Input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-11 rounded-2xl border-slate-200 bg-white text-sm font-bold"
            />
        </label>
    );
}

function Checklist({ items }: { items: string[] }) {
    return (
        <div className="mt-3 space-y-2">
            {items.map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="text-xs font-bold leading-5 text-slate-600">{item}</span>
                </div>
            ))}
        </div>
    );
}
