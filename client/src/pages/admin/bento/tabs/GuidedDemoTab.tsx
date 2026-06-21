import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    BadgeCheck,
    Banknote,
    ClipboardCheck,
    HardHat,
    PlayCircle,
    RotateCcw,
    ShieldCheck,
    Truck,
    UserRoundCog,
} from "lucide-react";
import { GuidedWalkthroughOverlay, type GuidedWalkthroughStep } from "@/components/admin/GuidedWalkthroughOverlay";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    MobileMarqueeText,
    MobileScrollContent,
    MobileSegmentTabs,
    MobileTabHeader,
    MobileTabLayout,
} from "../shared";
import {
    guidedDemoProgressStorageKey,
    makeGuidedDemoProgressKey,
    markGuidedDemoLessonComplete,
    parseGuidedDemoProgress,
    serializeGuidedDemoProgress,
} from "./guided-demo-progress.js";

type GuidedRole = "technician" | "driver" | "cashier" | "manager";

type Lesson = {
    key: string;
    title: string;
    body: string;
    action: string;
};

const roleTone: Record<GuidedRole, string> = {
    technician: "border-orange-100 bg-orange-50 text-orange-700",
    driver: "border-cyan-100 bg-cyan-50 text-cyan-700",
    cashier: "border-blue-100 bg-blue-50 text-blue-700",
    manager: "border-emerald-100 bg-emerald-50 text-emerald-700",
};

const roleIcon: Record<GuidedRole, typeof HardHat> = {
    technician: HardHat,
    driver: Truck,
    cashier: Banknote,
    manager: UserRoundCog,
};

const lessonKeys: Record<GuidedRole, string[]> = {
    technician: ["first_job", "diagnose_issue", "update_status", "request_parts", "complete_repair"],
    driver: ["first_route", "pickup_proof", "delivery_proof", "failed_delivery", "safety_notes"],
    cashier: ["first_sale", "add_customer", "review_cart", "hold_to_agree", "invoice_refund"],
    manager: ["review_dashboard", "assign_job", "approve_request", "check_finance", "team_performance"],
};

const roles: GuidedRole[] = ["technician", "driver", "cashier", "manager"];

export default function GuidedDemoTab() {
    const { t } = useTranslation();
    const [selectedRole, setSelectedRole] = useState<GuidedRole>("technician");
    const [selectedLessonKey, setSelectedLessonKey] = useState<string>(lessonKeys.technician[0]);
    const [walkthroughOpen, setWalkthroughOpen] = useState(false);
    const [walkthroughStep, setWalkthroughStep] = useState(0);
    const [completedLessons, setCompletedLessons] = useState<Set<string>>(() => {
        return parseGuidedDemoProgress(window.localStorage.getItem(guidedDemoProgressStorageKey));
    });

    const lessons = useMemo<Lesson[]>(() => {
        return lessonKeys[selectedRole].map((key) => ({
            key,
            title: t(`guided_demo.roles.${selectedRole}.lessons.${key}.title`),
            body: t(`guided_demo.roles.${selectedRole}.lessons.${key}.body`),
            action: t(`guided_demo.roles.${selectedRole}.lessons.${key}.action`),
        }));
    }, [selectedRole, t]);

    const selectedLesson = lessons.find((lesson) => lesson.key === selectedLessonKey) ?? lessons[0];
    const completedCount = lessonKeys[selectedRole].filter((key) => completedLessons.has(makeGuidedDemoProgressKey(selectedRole, key))).length;
    const totalLessons = lessonKeys[selectedRole].length;
    const walkthroughSteps = useMemo<GuidedWalkthroughStep[]>(() => {
        return [
            {
                title: t("guided_demo.walkthrough.start_title"),
                body: selectedLesson.body,
                targetLabel: t("guided_demo.walkthrough.target_work_area"),
                targetMeta: selectedLesson.title,
                placement: "top",
            },
            {
                title: t("guided_demo.walkthrough.review_title"),
                body: t("guided_demo.walkthrough.review_body"),
                targetLabel: t("guided_demo.walkthrough.target_review_area"),
                targetMeta: t(`guided_demo.roles.${selectedRole}.dashboard_title`),
                placement: "middle",
            },
            {
                title: t("guided_demo.walkthrough.confirm_title"),
                body: t("guided_demo.walkthrough.confirm_body"),
                targetLabel: t("guided_demo.walkthrough.target_confirm_area"),
                targetMeta: t("guided_demo.not_live_warning"),
                placement: "bottom",
            },
        ];
    }, [selectedLesson.body, selectedLesson.title, selectedRole, t]);

    const changeRole = (role: GuidedRole) => {
        setSelectedRole(role);
        setSelectedLessonKey(lessonKeys[role][0]);
        setWalkthroughOpen(false);
        setWalkthroughStep(0);
    };

    const openWalkthrough = () => {
        if (selectedRole === "technician") {
            window.location.hash = `#jobs?demo=guided&role=${selectedRole}&lesson=${selectedLesson.key}`;
            return;
        }

        setWalkthroughStep(0);
        setWalkthroughOpen(true);
    };

    const finishWalkthrough = () => {
        setCompletedLessons((current) => {
            return markGuidedDemoLessonComplete(current, selectedRole, selectedLesson.key);
        });
        setWalkthroughOpen(false);
    };

    useEffect(() => {
        window.localStorage.setItem(guidedDemoProgressStorageKey, serializeGuidedDemoProgress(completedLessons));
    }, [completedLessons]);

    return (
        <div className="h-full bg-[#f8fafc]">
            <MobileTabLayout className="md:hidden">
                <MobileTabHeader className="border-emerald-100/70 bg-gradient-to-b from-emerald-50 via-slate-50 to-[#f8fafc] pt-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <MobileMarqueeText className="text-[20px] font-black leading-tight text-slate-950">
                                {t("guided_demo.title")}
                            </MobileMarqueeText>
                            <MobileMarqueeText className="text-xs font-medium text-slate-500">
                                {t("guided_demo.subtitle")}
                            </MobileMarqueeText>
                        </div>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600 shadow-sm">
                            <PlayCircle className="h-5 w-5" />
                        </span>
                    </div>

                    <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                        {t("guided_demo.safe_data_notice")}
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                        {t("guided_demo.progress")}: {completedCount}/{totalLessons}
                    </div>

                    <MobileSegmentTabs
                        value={selectedRole}
                        onChange={changeRole}
                        tone="emerald"
                        items={roles.map((role) => ({
                            value: role,
                            label: t(`guided_demo.roles.${role}.dashboard_title`),
                        }))}
                    />
                </MobileTabHeader>

                <MobileScrollContent className="space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                    <RoleIntro role={selectedRole} />

                    <div className="space-y-2">
                        {lessons.map((lesson, index) => (
                            <LessonCard
                                key={lesson.key}
                                lesson={lesson}
                                index={index}
                                active={lesson.key === selectedLesson.key}
                                completed={completedLessons.has(makeGuidedDemoProgressKey(selectedRole, lesson.key))}
                                onClick={() => setSelectedLessonKey(lesson.key)}
                            />
                        ))}
                    </div>

                    <DemoPreview lesson={selectedLesson} onStart={openWalkthrough} />
                </MobileScrollContent>
            </MobileTabLayout>

            <div className="hidden h-full overflow-y-auto p-6 md:block">
                <div className="mx-auto max-w-6xl space-y-6">
                    <div className="flex items-start justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
                                <ShieldCheck className="h-4 w-4" />
                                {t("guided_demo.demo_mode")}
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-slate-950">{t("guided_demo.title")}</h1>
                            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">{t("guided_demo.subtitle")}</p>
                            <p className="mt-3 text-sm font-black text-emerald-700">{t("guided_demo.progress")}: {completedCount}/{totalLessons}</p>
                        </div>
                        <div className="max-w-sm rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                            {t("guided_demo.not_live_warning")}
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                        <div className="space-y-3">
                            {roles.map((role) => (
                                <RoleButton
                                    key={role}
                                    role={role}
                                    active={role === selectedRole}
                                    onClick={() => changeRole(role)}
                                />
                            ))}
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                            <RoleIntro role={selectedRole} desktop />
                            <div className="mt-5 grid gap-3 lg:grid-cols-2">
                                {lessons.map((lesson, index) => (
                                    <LessonCard
                                        key={lesson.key}
                                        lesson={lesson}
                                        index={index}
                                        active={lesson.key === selectedLesson.key}
                                        completed={completedLessons.has(makeGuidedDemoProgressKey(selectedRole, lesson.key))}
                                        onClick={() => setSelectedLessonKey(lesson.key)}
                                        desktop
                                    />
                                ))}
                            </div>
                            <div className="mt-5">
                                <DemoPreview lesson={selectedLesson} desktop onStart={openWalkthrough} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <GuidedWalkthroughOverlay
                open={walkthroughOpen}
                title={selectedLesson.title}
                safeLabel={t("guided_demo.walkthrough.safe_label")}
                steps={walkthroughSteps}
                activeStep={walkthroughStep}
                onStepChange={setWalkthroughStep}
                onClose={() => setWalkthroughOpen(false)}
                onFinish={finishWalkthrough}
                nextLabel={t("guided_demo.walkthrough.next")}
                backLabel={t("guided_demo.walkthrough.back")}
                closeLabel={t("guided_demo.walkthrough.close")}
                finishLabel={t("guided_demo.walkthrough.finish")}
                stepLabel={t("guided_demo.walkthrough.step")}
                ofLabel={t("guided_demo.walkthrough.of")}
            />
        </div>
    );
}

function RoleIntro({ role, desktop = false }: { role: GuidedRole; desktop?: boolean }) {
    const { t } = useTranslation();
    const Icon = roleIcon[role];

    return (
        <div className={cn(
            "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm",
            desktop && "rounded-2xl border-slate-100 bg-slate-50 shadow-none",
        )}>
            <div className="flex items-start gap-3">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border", roleTone[role])}>
                    <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <MobileMarqueeText className="text-lg font-black leading-tight text-slate-950">
                        {t(`guided_demo.roles.${role}.welcome_title`)}
                    </MobileMarqueeText>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
                        {t(`guided_demo.roles.${role}.welcome_body`)}
                    </p>
                </div>
            </div>
        </div>
    );
}

function RoleButton({ role, active, onClick }: { role: GuidedRole; active: boolean; onClick: () => void }) {
    const { t } = useTranslation();
    const Icon = roleIcon[role];

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition active:scale-[0.99]",
                active ? "border-emerald-200 ring-2 ring-emerald-100" : "border-slate-200 hover:border-slate-300",
            )}
        >
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", roleTone[role])}>
                <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-950">{t(`guided_demo.roles.${role}.dashboard_title`)}</span>
                <span className="mt-1 line-clamp-2 block text-xs font-medium text-slate-500">
                    {t(`guided_demo.roles.${role}.welcome_body`)}
                </span>
            </span>
            {active && <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" />}
        </button>
    );
}

function LessonCard({
    lesson,
    index,
    active,
    completed,
    onClick,
    desktop = false,
}: {
    lesson: Lesson;
    index: number;
    active: boolean;
    completed: boolean;
    onClick: () => void;
    desktop?: boolean;
}) {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99]",
                active ? "border-emerald-200 bg-emerald-50/50 ring-2 ring-emerald-100" : "border-slate-200",
                desktop && "min-h-[148px] p-4",
            )}
        >
            <div className="flex items-start gap-3">
                <span className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black",
                    active ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500",
                )}>
                    {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                    <MobileMarqueeText className="text-sm font-black text-slate-950">{lesson.title}</MobileMarqueeText>
                    <span className="mt-1 line-clamp-3 block text-xs font-medium leading-5 text-slate-500">{lesson.body}</span>
                    {completed && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                            <BadgeCheck className="h-3 w-3" />
                            {t("guided_demo.completed")}
                        </span>
                    )}
                </span>
            </div>
        </button>
    );
}

function DemoPreview({ lesson, onStart, desktop = false }: { lesson: Lesson; onStart: () => void; desktop?: boolean }) {
    const { t } = useTranslation();

    return (
        <div className={cn(
            "rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/60 to-blue-50 p-4 shadow-sm",
            desktop && "rounded-2xl p-5",
        )}>
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600 shadow-sm">
                    <ClipboardCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-xs font-black uppercase text-emerald-700">{t("guided_demo.demo_mode")}</div>
                    <MobileMarqueeText className="mt-1 text-lg font-black text-slate-950">{lesson.title}</MobileMarqueeText>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{lesson.body}</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" onClick={onStart} className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {lesson.action}
                </Button>
                <Button type="button" variant="outline" onClick={onStart} className="h-11 rounded-2xl border-slate-200 bg-white">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("guided_demo.replay")}
                </Button>
            </div>
            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                {t("guided_demo.not_live_warning")}
            </div>
        </div>
    );
}
