import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    ArrowLeft, ArrowRight, Building2, CheckCircle2, Cpu, Layers, Loader2,
    Monitor, Package, Plus, Trash2, User, UserCheck, Wrench,
} from "lucide-react";
import {
    ApiError,
    B2bAccountCard,
    B2bLaneType,
    ExternalIntakePartyCard,
    ExternalIntakeUnit,
    b2bAccountIntakeApi,
    jobIntakeApi,
    jobTicketsApi,
} from "@/lib/api";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { MISSING_PARTS_LIST } from "@shared/constants";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type Lane = "customer" | "technician" | "corporate" | "limited_company";
type TechnicianMode = "single" | "batch";
type TicketType = ExternalIntakeUnit["ticketType"];

type IntakeUnit = {
    ticketType: TicketType;
    device: string;
    modelNumber: string;
    serialNumber: string;
    issue: string;
    screenSize: string;
    externalRef: string;
};

interface CreateJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    technicianUsers: { id: string; name: string; role: string; skills?: string | null }[];
    tvInches: string[];
    canAssignTechnician?: boolean;
    lookupFailed?: boolean;
}

const CUSTOMER_STEPS = ["Choose lane", "Customer", "Full TV", "Review"];
const TECHNICIAN_STEPS = ["Choose lane", "Shop", "Units", "Review"];
const B2B_STEPS = ["Choose lane", "Account", "Units", "Review"];
const ACCESSORIES = ["Remote", "Stand", "Screws", "Wall Mount", "AC Cord", "Adapter"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const TICKET_OPTIONS: { value: TicketType; label: string; icon: typeof Monitor }[] = [
    { value: "full_device", label: "Full TV", icon: Monitor },
    { value: "panel_only", label: "Panel", icon: Layers },
    { value: "motherboard_only", label: "Motherboard", icon: Cpu },
    { value: "parts_only", label: "Parts", icon: Package },
];

function emptyUnit(): IntakeUnit {
    return { ticketType: "full_device", device: "", modelNumber: "", serialNumber: "", issue: "", screenSize: "", externalRef: "" };
}

function isB2bLane(lane: Lane): lane is "corporate" | "limited_company" {
    return lane === "corporate" || lane === "limited_company";
}

function laneToB2bType(lane: "corporate" | "limited_company"): B2bLaneType {
    return lane;
}

function compactAddress(address: string | null | undefined) {
    if (!address) return "No address saved";
    return address.length > 76 ? `${address.slice(0, 73)}...` : address;
}

function partyErrorData(error: unknown) {
    if (error instanceof ApiError && error.data && typeof error.data === "object") return error.data as { signals?: unknown[] };
    return null;
}

export function CreateJobDrawer({
    isOpen,
    onClose,
    technicianUsers,
    tvInches,
    canAssignTechnician = false,
    lookupFailed = false,
}: CreateJobDrawerProps) {
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();
    const [lane, setLane] = useState<Lane>("customer");
    const [step, setStep] = useState(0);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerAddress, setCustomerAddress] = useState("");
    const [customerDevice, setCustomerDevice] = useState("");
    const [customerModel, setCustomerModel] = useState("");
    const [customerSerial, setCustomerSerial] = useState("");
    const [customerIssue, setCustomerIssue] = useState("");
    const [customerScreenSize, setCustomerScreenSize] = useState("");
    const [missingParts, setMissingParts] = useState<string[]>([]);
    const [accessories, setAccessories] = useState<string[]>([]);
    const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Medium");
    const [assignedTechnicianId, setAssignedTechnicianId] = useState<string | undefined>();
    const [assignedTechnicianName, setAssignedTechnicianName] = useState("Unassigned");
    const [technicianMode, setTechnicianMode] = useState<TechnicianMode>("single");
    const [b2bMode, setB2bMode] = useState<TechnicianMode>("single");
    const [partySearch, setPartySearch] = useState("");
    const [selectedParty, setSelectedParty] = useState<ExternalIntakePartyCard | null>(null);
    const [creatingParty, setCreatingParty] = useState(false);
    const [newPartyName, setNewPartyName] = useState("");
    const [newPartyPhone, setNewPartyPhone] = useState("");
    const [newPartyAddress, setNewPartyAddress] = useState("");
    const [accountSearch, setAccountSearch] = useState("");
    const [selectedAccount, setSelectedAccount] = useState<B2bAccountCard | null>(null);
    const [units, setUnits] = useState<IntakeUnit[]>([emptyUnit()]);
    const [nextJobNumber, setNextJobNumber] = useState("");
    const [duplicateSignals, setDuplicateSignals] = useState<unknown[] | null>(null);

    const customerQuery = customerName.trim().length >= 2 ? customerName.trim() : customerPhone.trim();
    const partyQuery = partySearch.trim();
    const accountQuery = accountSearch.trim();
    const isCreatingTech = user?.role === "Technician";
    const forceUnassigned = isCreatingTech && !canAssignTechnician;
    const steps = lane === "customer" ? CUSTOMER_STEPS : isB2bLane(lane) ? B2B_STEPS : TECHNICIAN_STEPS;
    const isLastStep = step === steps.length - 1;
    const unitSkillType =
        lane === "technician" || isB2bLane(lane) ? units[0]?.ticketType || "full_device" : "full_device";

    const { data: customerLookup = { items: [] } } = useQuery({
        queryKey: ["job-intake-customer-lookup", customerQuery],
        queryFn: () => jobIntakeApi.searchCustomers(customerQuery),
        enabled: isOpen && lane === "customer" && customerQuery.length >= 2,
        staleTime: 30_000,
    });
    const { data: partyLookup = { items: [] } } = useQuery({
        queryKey: ["external-intake-party-lookup", partyQuery],
        queryFn: () => jobIntakeApi.searchExternalParties(partyQuery),
        enabled: isOpen && lane === "technician" && !creatingParty && partyQuery.length >= 2,
        staleTime: 30_000,
    });
    const { data: accountLookup = { items: [] } } = useQuery({
        queryKey: ["b2b-account-lookup", lane, accountQuery],
        queryFn: () => b2bAccountIntakeApi.searchAccounts(laneToB2bType(lane as "corporate" | "limited_company"), accountQuery),
        enabled: isOpen && isB2bLane(lane) && accountQuery.length >= 1,
        staleTime: 30_000,
    });

    useEffect(() => {
        if (!isOpen) return;
        if (lane === "customer" || isB2bLane(lane)) {
            jobTicketsApi.getNextNumber().then(({ nextNumber }) => setNextJobNumber(nextNumber)).catch(() => setNextJobNumber(""));
        } else {
            setNextJobNumber("");
        }
    }, [isOpen, lane]);

    useEffect(() => {
        if (isOpen) return;
        setLane("customer");
        setStep(0);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerAddress("");
        setCustomerDevice("");
        setCustomerModel("");
        setCustomerSerial("");
        setCustomerIssue("");
        setCustomerScreenSize("");
        setMissingParts([]);
        setAccessories([]);
        setPriority("Medium");
        setAssignedTechnicianId(undefined);
        setAssignedTechnicianName("Unassigned");
        setTechnicianMode("single");
        setB2bMode("single");
        setPartySearch("");
        setSelectedParty(null);
        setCreatingParty(false);
        setNewPartyName("");
        setNewPartyPhone("");
        setNewPartyAddress("");
        setAccountSearch("");
        setSelectedAccount(null);
        setUnits([emptyUnit()]);
        setDuplicateSignals(null);
    }, [isOpen]);

    const customerMutation = useMutation({
        mutationFn: () => jobTicketsApi.create({
            customer: customerName.trim(),
            customerPhone: customerPhone.trim() || undefined,
            customerAddress: customerAddress.trim() || undefined,
            device: customerDevice.trim(),
            modelNumber: customerModel.trim() || undefined,
            serialNumber: customerSerial.trim() || undefined,
            issue: customerIssue.trim(),
            screenSize: customerScreenSize.trim() || undefined,
            ticketType: "full_device",
            status: "Pending",
            priority,
            missingParts: missingParts.length ? missingParts : undefined,
            receivedAccessories: accessories.length ? accessories.join(", ") : undefined,
            ...(canAssignTechnician && assignedTechnicianId ? { assignedTechnicianId } : {}),
        }),
        onSuccess: async (job) => {
            await queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            toast.success(`Job ${job.id} created`);
            onClose();
        },
        onError: (error: Error) => toast.error(error.message || "Could not create job"),
    });

    const technicianMutation = useMutation({
        mutationFn: async (confirmDuplicates: boolean) => {
            const party = selectedParty
                ? { externalPartyId: selectedParty.id }
                : { newExternalParty: { name: newPartyName.trim(), phone: newPartyPhone.trim(), shortAddress: newPartyAddress.trim() || undefined } };
            const assignment = canAssignTechnician && assignedTechnicianId ? { assignedTechnicianId } : {};
            if (technicianMode === "single") {
                return jobIntakeApi.createExternalSingle({ ...party, ...assignment, confirmDuplicates, unit: toExternalUnit(units[0]) });
            }
            return jobIntakeApi.createExternalBatch({ ...party, ...assignment, confirmDuplicates, units: units.map(toExternalUnit) });
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            if ("jobs" in result) {
                toast.success(`${result.jobs.length} technician jobs created — print the batch QR from the job list`);
            } else {
                toast.success(`Job ${result.job.id} created — print slip for shop QR`);
            }
            onClose();
        },
        onError: (error: Error) => {
            if (error instanceof ApiError && error.code === "DUPLICATE_CONFIRMATION_REQUIRED") {
                setDuplicateSignals(partyErrorData(error)?.signals ?? []);
                return;
            }
            toast.error(error.message || "Could not create technician intake");
        },
    });

    const b2bMutation = useMutation({
        mutationFn: async () => {
            if (!isB2bLane(lane) || !selectedAccount) throw new Error("Select an existing account");
            const assignment = canAssignTechnician && assignedTechnicianId ? { assignedTechnicianId } : {};
            const payloadLane = laneToB2bType(lane);
            if (b2bMode === "single") {
                return b2bAccountIntakeApi.createSingle({
                    lane: payloadLane,
                    corporateClientId: selectedAccount.id,
                    unit: toB2bUnit(units[0]),
                    ...assignment,
                });
            }
            return b2bAccountIntakeApi.createBatch({
                lane: payloadLane,
                corporateClientId: selectedAccount.id,
                units: units.map(toB2bUnit),
                ...assignment,
            });
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            await queryClient.invalidateQueries({ queryKey: ["jobBatches"] });
            await queryClient.invalidateQueries({ queryKey: ["corporateClients"] });
            if (result.mode === "batch") {
                toast.success(`Batch ${result.batch.batchNumber || result.batch.id}: ${result.jobs.length} unit job(s) created`);
            } else {
                toast.success(`Job ${result.job.id} created for ${result.account.shortCode}`);
            }
            onClose();
        },
        onError: (error: Error) => toast.error(error.message || "Could not create B2B intake"),
    });

    const currentStepMessage = useMemo(() => {
        if (step === 0) return "";
        if (lane === "customer" && step === 1 && !customerName.trim()) return "Enter or select a customer.";
        if (lane === "customer" && step === 2 && (!customerDevice.trim() || !customerIssue.trim())) return "Enter the TV/device and the reported problem.";
        if (lane === "technician" && step === 1) {
            if (creatingParty && (!newPartyName.trim() || newPartyPhone.trim().length < 10)) return "Enter the shop name and phone.";
            if (!creatingParty && !selectedParty) return "Select an existing shop or create one.";
        }
        if (lane === "technician" && step === 2 && units.some((unit) => !unit.device.trim() || !unit.issue.trim())) return "Each unit needs a device and a reported problem.";
        if (isB2bLane(lane) && step === 1 && !selectedAccount) return "Select an existing account. Account creation is not available here.";
        if (isB2bLane(lane) && step === 2 && units.some((unit) => !unit.device.trim() || !unit.issue.trim())) return "Each unit needs a device and a reported problem.";
        return "";
    }, [creatingParty, customerDevice, customerIssue, customerName, lane, newPartyName, newPartyPhone, selectedAccount, selectedParty, step, units]);

    const selectCustomer = (item: { name: string; phone: string; shortAddress: string | null }) => {
        setCustomerName(item.name);
        setCustomerPhone(item.phone.replace(/^\+?880/, "").replace(/^0/, ""));
        setCustomerAddress(item.shortAddress || "");
    };

    const chooseParty = (party: ExternalIntakePartyCard) => {
        setSelectedParty(party);
        setCreatingParty(false);
        setPartySearch("");
    };

    const chooseAccount = (account: B2bAccountCard) => {
        setSelectedAccount(account);
        setAccountSearch("");
    };

    const updateUnit = (index: number, patch: Partial<IntakeUnit>) => {
        setUnits((current) => current.map((unit, unitIndex) => unitIndex === index ? { ...unit, ...patch } : unit));
    };

    const addUnit = () => setUnits((current) => [...current, emptyUnit()]);
    const removeUnit = (index: number) => setUnits((current) => current.length === 1 ? current : current.filter((_, unitIndex) => unitIndex !== index));

    const continueFlow = () => {
        if (currentStepMessage) {
            toast.error(currentStepMessage);
            return;
        }
        setStep((current) => Math.min(current + 1, steps.length - 1));
    };

    const create = () => {
        if (lane === "customer") customerMutation.mutate();
        else if (lane === "technician") technicianMutation.mutate(false);
        else b2bMutation.mutate();
    };
    const pending = customerMutation.isPending || technicianMutation.isPending || b2bMutation.isPending;

    return (
        <>
            <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <SheetContent className="z-[250] flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-slate-50 p-0 shadow-2xl sm:h-full sm:max-w-2xl sm:border-l sm:border-white/20 sm:bg-white/95 sm:p-6 sm:backdrop-blur-xl [&>button]:right-4 [&>button]:top-4 [&>button]:z-20 [&>button]:rounded-full [&>button]:bg-white/90 [&>button]:p-2 [&>button]:shadow-sm sm:[&>button]:bg-transparent sm:[&>button]:shadow-none">
                    <SheetHeader className="shrink-0 border-b border-slate-200/70 bg-slate-50/95 px-5 pb-3 pt-7 text-left backdrop-blur sm:mb-5 sm:mt-6 sm:border-slate-100 sm:bg-transparent sm:px-0 sm:pb-4 sm:pt-0">
                        <SheetTitle className="flex items-center gap-2 font-heading text-2xl font-bold text-slate-900 sm:text-slate-800"><Wrench className="h-6 w-6 text-blue-600" /> New Job</SheetTitle>
                        <SheetDescription className="text-sm text-slate-500">Step {step + 1} of {steps.length}: {steps[step]}</SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-32 pt-4 sm:space-y-5 sm:px-0 sm:pt-0">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:border-slate-100 sm:bg-slate-50/70 sm:shadow-none">
                            <div className="flex items-center justify-between gap-3">
                                <div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Current step</div><div className="font-bold text-slate-800">{steps[step]}</div></div>
                                {lane === "customer" && <div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Preview</div><div className="font-mono text-sm font-bold text-blue-700">{nextJobNumber || "Loading..."}</div></div>}
                            </div>
                            <div className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>{steps.map((item, index) => <button key={item} type="button" onClick={() => index <= step && setStep(index)} className={`h-2 rounded-full ${index <= step ? "bg-blue-600" : "bg-slate-200"}`} aria-label={item} />)}</div>
                        </div>

                        {step === 0 && <LanePicker lane={lane} onLane={(next) => {
                            setLane(next);
                            setStep(1);
                            setSelectedAccount(null);
                            setAccountSearch("");
                            setUnits([emptyUnit()]);
                            setB2bMode("single");
                        }} />}

                        {lane === "customer" && step === 1 && <section className="space-y-4">
                            <SectionTitle icon={<User className="h-4 w-4" />} title="Customer" copy="Search a saved customer or enter a first-time customer." />
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Customer name *"><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Type customer name" /></Field><Field label="Phone"><PhoneInput value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></Field></div>
                            <Field label="Short address"><Input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} placeholder="Area, road, or landmark" /></Field>
                            {customerQuery.length >= 2 && <CompactResults title="Suggested customers" empty="No saved customer matched. You can continue with a new customer." items={customerLookup.items} onChoose={selectCustomer} />}
                        </section>}

                        {lane === "customer" && step === 2 && <section className="space-y-4">
                            <SectionTitle icon={<Monitor className="h-4 w-4" />} title="Full TV intake" copy="Customer jobs in this flow are always a complete TV." />
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="TV / device *"><Input value={customerDevice} onChange={(event) => setCustomerDevice(event.target.value)} placeholder="e.g. 50 inch LED TV" /></Field><Field label="Model number"><Input value={customerModel} onChange={(event) => setCustomerModel(event.target.value)} placeholder="Model number" /></Field></div>
                            <div className="grid gap-4 sm:grid-cols-2"><Field label="Serial number"><Input value={customerSerial} onChange={(event) => setCustomerSerial(event.target.value)} placeholder="Optional serial" /></Field><Field label="Screen size"><Input value={customerScreenSize} onChange={(event) => setCustomerScreenSize(event.target.value)} placeholder="e.g. 43" list="customer-screen-sizes" /><datalist id="customer-screen-sizes">{tvInches.map((size) => <option key={size} value={size} />)}</datalist></Field></div>
                            <Field label="Reported problem *"><Textarea value={customerIssue} onChange={(event) => setCustomerIssue(event.target.value)} placeholder="What is wrong with the TV?" /></Field>
                            <ToggleGroup title="Missing parts" items={MISSING_PARTS_LIST} selected={missingParts} onChange={setMissingParts} />
                            <ToggleGroup title="Received accessories" items={ACCESSORIES} selected={accessories} onChange={setAccessories} />
                        </section>}

                        {lane === "technician" && step === 1 && <section className="space-y-4">
                            <SectionTitle icon={<Wrench className="h-4 w-4" />} title="Outside technician or shop" copy="This is not an internal staff technician and is never a customer profile." />
                            {!creatingParty && !selectedParty && <><Field label="Search saved shop"><Input value={partySearch} onChange={(event) => setPartySearch(event.target.value)} placeholder="Shop name or phone" /></Field>{partyQuery.length >= 2 && <CompactResults title="Saved shops" empty="No shop matched. Create a new shop below." items={partyLookup.items} onChoose={chooseParty} />}</>}
                            {selectedParty && <SelectedParty party={selectedParty} onChange={() => setSelectedParty(null)} />}
                            {!selectedParty && <button type="button" onClick={() => setCreatingParty((current) => !current)} className="text-sm font-semibold text-blue-700 hover:text-blue-800">{creatingParty ? "Use a saved shop" : "Create a new shop"}</button>}
                            {creatingParty && !selectedParty && <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3"><Field label="Shop name *"><Input value={newPartyName} onChange={(event) => setNewPartyName(event.target.value)} placeholder="Shop or outside technician name" /></Field><Field label="Shop phone *"><PhoneInput value={newPartyPhone} onChange={(event) => setNewPartyPhone(event.target.value)} /></Field><Field label="Short address"><Input value={newPartyAddress} onChange={(event) => setNewPartyAddress(event.target.value)} placeholder="Area, road, or landmark" /></Field></div>}
                            <div className="grid grid-cols-2 gap-2"><ModeButton active={technicianMode === "single"} icon={<Monitor className="h-4 w-4" />} label="Single" copy="One physical unit" onClick={() => { setTechnicianMode("single"); setUnits((current) => [current[0] || emptyUnit()]); }} /><ModeButton active={technicianMode === "batch"} icon={<Layers className="h-4 w-4" />} label="Batch" copy="One job per unit" onClick={() => setTechnicianMode("batch")} /></div>
                        </section>}

                        {lane === "technician" && step === 2 && <section className="space-y-4">
                            <SectionTitle icon={<Layers className="h-4 w-4" />} title={technicianMode === "batch" ? "Batch units" : "Unit details"} copy={technicianMode === "batch" ? "Every row creates one separate job number." : "Add the physical unit received from the shop."} />
                            <div className="space-y-3">{units.map((unit, index) => <UnitEditor key={index} unit={unit} index={index} removable={technicianMode === "batch" && units.length > 1} showExternalRef={false} onChange={(patch) => updateUnit(index, patch)} onRemove={() => removeUnit(index)} />)}</div>
                            {technicianMode === "batch" && <Button type="button" variant="outline" className="w-full" onClick={addUnit}><Plus className="mr-2 h-4 w-4" /> Add another unit</Button>}
                            <p className="text-xs text-slate-500">After create, print the job or batch slip — the QR opens only that shop job/batch status (no customer data).</p>
                        </section>}

                        {isB2bLane(lane) && step === 1 && <section className="space-y-4">
                            <SectionTitle
                                icon={<Building2 className="h-4 w-4" />}
                                title={lane === "corporate" ? "Corporate account" : "Corporate Ltd. account"}
                                copy="Select existing account. No account creation in this flow."
                            />
                            {!selectedAccount && (
                                <>
                                    <Field label="Search existing account">
                                        <Input
                                            value={accountSearch}
                                            onChange={(event) => setAccountSearch(event.target.value)}
                                            placeholder="Company name or short code"
                                        />
                                    </Field>
                                    {accountQuery.length >= 1 && (
                                        <B2bAccountResults
                                            empty={lane === "corporate" ? "No corporate account matched." : "No limited-company account matched."}
                                            items={accountLookup.items}
                                            onChoose={chooseAccount}
                                        />
                                    )}
                                </>
                            )}
                            {selectedAccount && (
                                <SelectedAccount account={selectedAccount} onChange={() => setSelectedAccount(null)} />
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <ModeButton active={b2bMode === "single"} icon={<Monitor className="h-4 w-4" />} label="Single" copy="One physical unit" onClick={() => { setB2bMode("single"); setUnits((current) => [current[0] || emptyUnit()]); }} />
                                <ModeButton active={b2bMode === "batch"} icon={<Layers className="h-4 w-4" />} label="Batch" copy="One job per unit" onClick={() => setB2bMode("batch")} />
                            </div>
                        </section>}

                        {isB2bLane(lane) && step === 2 && <section className="space-y-4">
                            <SectionTitle
                                icon={<Layers className="h-4 w-4" />}
                                title={b2bMode === "batch" ? "Batch units" : "Unit details"}
                                copy={b2bMode === "batch" ? `Every row creates one system job. Units: ${units.length}` : "One system job number is generated for this unit."}
                            />
                            <div className="space-y-3">
                                {units.map((unit, index) => (
                                    <UnitEditor
                                        key={index}
                                        unit={unit}
                                        index={index}
                                        removable={b2bMode === "batch" && units.length > 1}
                                        showExternalRef
                                        onChange={(patch) => updateUnit(index, patch)}
                                        onRemove={() => removeUnit(index)}
                                    />
                                ))}
                            </div>
                            {b2bMode === "batch" && (
                                <Button type="button" variant="outline" className="w-full" onClick={addUnit}>
                                    <Plus className="mr-2 h-4 w-4" /> Add another unit
                                </Button>
                            )}
                            <p className="text-xs text-slate-500">
                                Optional external reference must be unique on this account. System job numbers are assigned by the server.
                            </p>
                        </section>}

                        {step === 3 && <section className="space-y-4">
                            <SectionTitle icon={<CheckCircle2 className="h-4 w-4" />} title="Review and assign" copy="The job stays unassigned unless you have assignment permission." />
                            {lane === "customer" && <div className="grid grid-cols-2 gap-2">{PRIORITIES.map((item) => <ModeButton key={item} active={priority === item} label={item === "Medium" ? "Normal" : item} copy="" onClick={() => setPriority(item)} />)}</div>}
                            {forceUnassigned || !canAssignTechnician ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><div className="font-semibold text-slate-800">Unassigned</div><div className="mt-1">A manager can assign an internal technician later.</div></div> : lookupFailed ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Technician list could not be loaded. Retry after checking access.</div> : <TechnicianPicker users={technicianUsers} ticketType={unitSkillType} issue={lane === "customer" ? customerIssue : units[0]?.issue} assignedTechnicianId={assignedTechnicianId} onAssignedChange={(id, name) => { setAssignedTechnicianId(id || undefined); setAssignedTechnicianName(name); }} onAssistedChange={() => {}} />}
                            <ReviewCards
                                lane={lane}
                                customerName={customerName}
                                customerPhone={customerPhone}
                                customerDevice={customerDevice}
                                customerIssue={customerIssue}
                                selectedParty={selectedParty}
                                newPartyName={newPartyName}
                                selectedAccount={selectedAccount}
                                mode={isB2bLane(lane) ? b2bMode : technicianMode}
                                units={units}
                                assignedName={assignedTechnicianName}
                                priority={priority}
                                nextJobNumber={nextJobNumber}
                            />
                        </section>}

                        {currentStepMessage && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{currentStepMessage}</div>}
                    </div>

                    <SheetFooter className="absolute bottom-0 left-0 right-0 z-10 flex flex-row items-center justify-between gap-2 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_40px_rgba(0,0,0,0.06)] backdrop-blur sm:gap-3 sm:border-slate-100 sm:bg-white/90">
                        <Button variant="outline" onClick={onClose} className="hidden rounded-xl sm:inline-flex">Cancel</Button>
                        <div className="flex w-full gap-2 sm:w-auto">{step > 0 && <Button type="button" variant="outline" onClick={() => setStep((current) => Math.max(0, current - 1))} className="h-12 rounded-xl sm:h-10"><ArrowLeft className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Back</span></Button>}{!isLastStep ? <Button type="button" onClick={continueFlow} className="h-12 flex-1 rounded-xl bg-blue-600 px-7 font-bold hover:bg-blue-700 sm:h-10 sm:flex-none">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" onClick={create} disabled={pending} className="h-12 flex-1 rounded-xl bg-blue-600 px-7 font-bold hover:bg-blue-700 sm:h-10 sm:flex-none">{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Create job</Button>}</div>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
            <Dialog open={duplicateSignals !== null} onOpenChange={(open) => !open && setDuplicateSignals(null)}><DialogContent><DialogHeader><DialogTitle>Existing shop work found</DialogTitle><DialogDescription>This shop already has active work that may match this intake. Confirm only after checking the job references.</DialogDescription></DialogHeader>{duplicateSignals && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{duplicateSignals.length ? `${duplicateSignals.length} duplicate signal${duplicateSignals.length === 1 ? "" : "s"} found.` : "An existing-work signal was found."}</div>}<DialogFooter><Button variant="outline" onClick={() => setDuplicateSignals(null)}>Back</Button><Button onClick={() => { setDuplicateSignals(null); technicianMutation.mutate(true); }}>Confirm create</Button></DialogFooter></DialogContent></Dialog>
        </>
    );
}

function toExternalUnit(unit: IntakeUnit): ExternalIntakeUnit {
    return {
        ticketType: unit.ticketType,
        device: unit.device.trim(),
        modelNumber: unit.modelNumber.trim() || undefined,
        serialNumber: unit.serialNumber.trim() || undefined,
        issue: unit.issue.trim() || undefined,
        screenSize: unit.screenSize.trim() || undefined,
    };
}

function toB2bUnit(unit: IntakeUnit) {
    return {
        ...toExternalUnit(unit),
        externalRef: unit.externalRef.trim() || undefined,
    };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function SectionTitle({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
    return <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-800"><span className="mt-0.5">{icon}</span><div><div className="font-bold">{title}</div><p className="mt-0.5 text-xs text-blue-700">{copy}</p></div></div>;
}

function LanePicker({ lane, onLane }: { lane: Lane; onLane: (lane: Lane) => void }) {
    return (
        <section className="space-y-4">
            <SectionTitle icon={<Wrench className="h-4 w-4" />} title="Who brought the work?" copy="Choose the right owner first. Customer, shop, and B2B accounts stay separate." />
            <div className="grid grid-cols-2 gap-2">
                <ModeButton active={lane === "customer"} icon={<User className="h-4 w-4" />} label="Customer" copy="Full TV repair" onClick={() => onLane("customer")} />
                <ModeButton active={lane === "technician"} icon={<Wrench className="h-4 w-4" />} label="Technician" copy="Outside shop" onClick={() => onLane("technician")} />
                <ModeButton active={lane === "corporate"} icon={<Building2 className="h-4 w-4" />} label="Corporate" copy="Select existing account" onClick={() => onLane("corporate")} />
                <ModeButton active={lane === "limited_company"} icon={<Building2 className="h-4 w-4" />} label="Corporate Ltd." copy="Select existing account" onClick={() => onLane("limited_company")} />
            </div>
        </section>
    );
}

function ModeButton({ active = false, icon, label, copy, onClick }: { active?: boolean; icon?: React.ReactNode; label: string; copy: string; onClick: () => void }) {
    return <button type="button" onClick={onClick} className={`min-h-[76px] rounded-xl border p-3 text-left transition-colors ${active ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}><div className="flex items-center gap-2 font-bold">{icon}{label}</div>{copy && <div className="mt-1 text-xs text-slate-500">{copy}</div>}</button>;
}

function CompactResults({ title, empty, items, onChoose }: { title: string; empty: string; items: Array<{ id: string; name: string; phone: string; shortAddress: string | null }>; onChoose: (item: { id: string; name: string; phone: string; shortAddress: string | null }) => void }) {
    return <div className="rounded-xl border border-slate-200 bg-white p-2"><div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</div>{items.length ? <div className="space-y-1">{items.map((item) => <button key={item.id} type="button" onClick={() => onChoose(item)} className="w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-blue-50"><div className="font-semibold text-slate-800">{item.name}</div><div className="mt-0.5 text-xs text-slate-500">{item.phone} · {compactAddress(item.shortAddress)}</div></button>)}</div> : <div className="px-1 py-2 text-xs text-slate-500">{empty}</div>}</div>;
}

function SelectedParty({ party, onChange }: { party: ExternalIntakePartyCard; onChange: () => void }) {
    return <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div><div className="font-bold text-emerald-900">{party.name}</div><div className="mt-1 text-xs text-emerald-800">{party.phone} · {compactAddress(party.shortAddress)}</div></div><Button type="button" variant="ghost" size="sm" onClick={onChange}>Change</Button></div>;
}

function UnitEditor({
    unit,
    index,
    removable,
    showExternalRef = false,
    onChange,
    onRemove,
}: {
    unit: IntakeUnit;
    index: number;
    removable: boolean;
    showExternalRef?: boolean;
    onChange: (patch: Partial<IntakeUnit>) => void;
    onRemove: () => void;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Physical unit</div>
                    <div className="font-bold text-slate-800">Unit {index + 1}</div>
                </div>
                {removable && (
                    <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove unit ${index + 1}`}>
                        <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {TICKET_OPTIONS.map((option) => (
                    <ModeButton
                        key={option.value}
                        active={unit.ticketType === option.value}
                        icon={<option.icon className="h-4 w-4" />}
                        label={option.label}
                        copy=""
                        onClick={() => onChange({ ticketType: option.value })}
                    />
                ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Device *"><Input value={unit.device} onChange={(event) => onChange({ device: event.target.value })} placeholder="Device or item" /></Field>
                <Field label="Model number"><Input value={unit.modelNumber} onChange={(event) => onChange({ modelNumber: event.target.value })} placeholder="Optional model" /></Field>
                <Field label="Serial number"><Input value={unit.serialNumber} onChange={(event) => onChange({ serialNumber: event.target.value })} placeholder="Optional serial" /></Field>
                <Field label="Screen size"><Input value={unit.screenSize} onChange={(event) => onChange({ screenSize: event.target.value })} placeholder="Optional size" /></Field>
                {showExternalRef && (
                    <Field label="External ref (optional)">
                        <Input
                            value={unit.externalRef}
                            onChange={(event) => onChange({ externalRef: event.target.value })}
                            placeholder="Account unit / corporate ref"
                        />
                    </Field>
                )}
            </div>
            <div className="mt-3">
                <Field label="Reported problem *">
                    <Textarea value={unit.issue} onChange={(event) => onChange({ issue: event.target.value })} placeholder="Fault, repair request, or item condition" />
                </Field>
            </div>
        </div>
    );
}

function B2bAccountResults({
    empty,
    items,
    onChoose,
}: {
    empty: string;
    items: B2bAccountCard[];
    onChoose: (item: B2bAccountCard) => void;
}) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Existing accounts</div>
            {items.length ? (
                <div className="space-y-1">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onChoose(item)}
                            className="w-full rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-blue-50"
                        >
                            <div className="font-semibold text-slate-800">{item.companyName}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                                {item.shortCode} · {item.clientType === "limited_company" ? "Corporate Ltd." : "Corporate"}
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="px-1 py-2 text-xs text-slate-500">{empty}</div>
            )}
        </div>
    );
}

function SelectedAccount({ account, onChange }: { account: B2bAccountCard; onChange: () => void }) {
    return (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div>
                <div className="font-bold text-emerald-900">{account.companyName}</div>
                <div className="mt-1 text-xs text-emerald-800">
                    {account.shortCode} · {account.clientType === "limited_company" ? "Corporate Ltd." : "Corporate"}
                </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onChange}>Change</Button>
        </div>
    );
}

function ToggleGroup({ title, items, selected, onChange }: { title: string; items: readonly string[]; selected: string[]; onChange: (items: string[]) => void }) {
    return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="mb-2 text-sm font-semibold text-slate-800">{title}</div><div className="flex flex-wrap gap-2">{items.map((item) => { const active = selected.includes(item); return <button key={item} type="button" onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])} className={`rounded-lg border px-2 py-1 text-xs font-medium ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>{item}</button>; })}</div></div>;
}

function ReviewCards({
    lane,
    customerName,
    customerPhone,
    customerDevice,
    customerIssue,
    selectedParty,
    newPartyName,
    selectedAccount,
    mode,
    units,
    assignedName,
    priority,
    nextJobNumber,
}: {
    lane: Lane;
    customerName: string;
    customerPhone: string;
    customerDevice: string;
    customerIssue: string;
    selectedParty: ExternalIntakePartyCard | null;
    newPartyName: string;
    selectedAccount: B2bAccountCard | null;
    mode: TechnicianMode;
    units: IntakeUnit[];
    assignedName: string;
    priority: string;
    nextJobNumber?: string;
}) {
    if (isB2bLane(lane)) {
        const refs = units.map((u) => u.externalRef.trim()).filter(Boolean);
        return (
            <div className="grid gap-3 sm:grid-cols-2">
                <ReviewCard
                    label="Account"
                    value={selectedAccount ? `${selectedAccount.companyName} (${selectedAccount.shortCode})` : "Missing account"}
                    copy={lane === "limited_company" ? "Corporate Ltd. · existing account only" : "Corporate · existing account only"}
                />
                <ReviewCard
                    label="Mode"
                    value={mode === "batch" ? `Batch · ${units.length} unit(s)` : "Single unit"}
                    copy="Server assigns system job numbers"
                />
                <ReviewCard
                    label="Work"
                    value={units.map((unit) => unit.device || "Missing device").join(", ") || "Missing"}
                    copy={units.map((unit) => unit.issue).filter(Boolean).join(" · ") || "No problem note"}
                />
                <ReviewCard
                    label="References"
                    value={refs.length ? `${refs.length} external ref(s)` : "No external refs"}
                    copy={refs.length ? "Must be unique on this account" : "Optional; empty is allowed"}
                />
                <ReviewCard label="Assignment" value={assignedName || "Unassigned"} copy={nextJobNumber ? `Preview next: ${nextJobNumber}` : "No customer fields on this path"} />
            </div>
        );
    }
    const title = lane === "customer" ? customerName || "Customer" : selectedParty?.name || newPartyName || "Shop";
    const detail = lane === "customer" ? customerPhone || "No phone" : mode === "batch" ? `${units.length} physical units` : units[0]?.device || "One physical unit";
    const work = lane === "customer" ? customerDevice : units.map((unit) => unit.device || "Missing device").join(", ");
    const issue = lane === "customer" ? customerIssue : units.map((unit) => unit.issue).filter(Boolean).join(" · ");
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <ReviewCard label={lane === "customer" ? "Customer" : "Shop"} value={title} copy={detail} />
            <ReviewCard label="Work" value={work || "Missing"} copy={issue || "No problem note"} />
            <ReviewCard label="Assignment" value={assignedName || "Unassigned"} copy={lane === "customer" ? `Priority: ${priority}` : "External party stays separate from staff assignment"} />
        </div>
    );
}

function ReviewCard({ label, value, copy }: { label: string; value: string; copy: string }) {
    return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 font-semibold text-slate-800">{value}</div><div className="mt-1 text-xs text-slate-500">{copy}</div></div>;
}
