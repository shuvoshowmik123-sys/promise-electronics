import { useState, useEffect } from "react";
import {
    Globe, Settings, AlertTriangle, Building2, Clock, Percent,
    Phone, MapPin, Shield, Code2, Users, Loader2, Trash2,
    Check, X, Upload, RefreshCw, Database
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BentoCard } from "../../shared";
import { toast } from "sonner";
import { BackupDialog } from "@/components/admin/BackupDialog";
import { RestoreDialog } from "@/components/admin/RestoreDialog";
import { settingsApi, adminAuthApi } from "@/lib/api";

interface GeneralSectionProps {
    siteName: string;
    setSiteName: (v: string) => void;
    supportPhone: string;
    setSupportPhone: (v: string) => void;
    serviceCenterContact: string;
    setServiceCenterContact: (v: string) => void;
    businessHours: string;
    setBusinessHours: (v: string) => void;
    currencySymbol: string;
    setCurrencySymbol: (v: string) => void;
    vatPercentage: string;
    setVatPercentage: (v: string) => void;
    timezone: string;
    setTimezone: (v: string) => void;
    logoUrl: string;
    setLogoUrl: (v: string) => void;
    maintenanceMode: boolean;
    setMaintenanceMode: (v: boolean) => void;
    allowRegistrations: boolean;
    setAllowRegistrations: (v: boolean) => void;
    developerMode: boolean;
    setDeveloperMode: (v: boolean) => void;
}

export default function GeneralSection(props: GeneralSectionProps) {
    const {
        siteName, setSiteName,
        supportPhone, setSupportPhone,
        serviceCenterContact, setServiceCenterContact,
        businessHours, setBusinessHours,
        currencySymbol, setCurrencySymbol,
        vatPercentage, setVatPercentage,
        timezone, setTimezone,
        logoUrl, setLogoUrl,
        maintenanceMode, setMaintenanceMode,
        allowRegistrations, setAllowRegistrations,
        developerMode, setDeveloperMode,
    } = props;

    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);

    // Critical Settings Dialog State
    const [maintenanceDialog, setMaintenanceDialog] = useState(false);
    const [confirmSlider, setConfirmSlider] = useState(0);

    const [registrationDialog, setRegistrationDialog] = useState(false);
    const [regChecks, setRegChecks] = useState({ c1: false, c2: false, c3: false });

    const [developerDialog, setDeveloperDialog] = useState(false);
    const [devCountdown, setDevCountdown] = useState(5);
    const [isDevCountdownActive, setIsDevCountdownActive] = useState(false);

    // Data & Backup State
    const [dataDialog, setDataDialog] = useState(false);
    const [showBackupDialog, setShowBackupDialog] = useState(false);
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);

    // Reset states when dialogs close
    const handleCloseDialogs = () => {
        // Delay inner state reset to allow exit animations to finish smoothly
        // but close the actual dialog visibility flags immediately
        setMaintenanceDialog(false);
        setRegistrationDialog(false);
        setDeveloperDialog(false);
        setDataDialog(false);
        setTimeout(() => {
            setConfirmSlider(0);
            setRegChecks({ c1: false, c2: false, c3: false });
            setDevCountdown(5);
            setIsDevCountdownActive(false);
        }, 500);
    };

    // Countdown effect for Developer Mode
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isDevCountdownActive && devCountdown > 0) {
            timer = setTimeout(() => setDevCountdown(prev => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [isDevCountdownActive, devCountdown]);

    const handleDeleteAllData = async () => {
        if (deleteConfirmation !== "DELETE ALL") {
            toast.error("Please type 'DELETE ALL' to confirm");
            return;
        }
        setIsDeleting(true);
        try {
            await adminAuthApi.wipeData();
            toast.success("All data deleted successfully", {
                description: "The system has been restored to factory settings.",
                duration: 5000,
            });
            setShowDeleteDialog(false);
            setDeleteConfirmation("");
            // Force a hard reload to clear all states and caches
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error: any) {
            console.error("Failed to delete data:", error);
            toast.error("Failed to delete data", {
                description: error.message || "An unexpected error occurred. Please try again.",
                duration: 5000,
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            {/* ── ROW 1: Quick Status Cards (4 vibrant cards) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">

                {/* 1. Data & Backups */}
                <BentoCard
                    className="cursor-pointer group relative overflow-hidden bg-white border border-slate-200 hover:border-blue-500/50 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300"
                    title="Data & Backups"
                    icon={<Shield className="w-5 h-5 text-blue-500" />}
                    variant="glass"
                    layoutId="card-data"
                    onClick={() => setDataDialog(true)}
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-blue-100/50 transition-colors" />
                    <div className="flex flex-col gap-2 pt-2 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-3xl font-black tracking-tight text-slate-800 drop-shadow-sm group-hover:scale-[1.02] origin-left transition-transform">SECURE</span>
                            <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold px-3 py-1 border-none">LAST: 2:00 AM</Badge>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Auto-Backup</span>
                        </div>
                    </div>
                </BentoCard>

                {/* 2. Maintenance Mode */}
                <BentoCard
                    className={`cursor-pointer group relative overflow-hidden bg-white border ${maintenanceMode ? "border-red-400 shadow-md shadow-red-500/10" : "border-slate-200"} hover:border-red-500/50 hover:-translate-y-1 hover:shadow-md transition-all duration-300`}
                    title="Maintenance Mode"
                    icon={<AlertTriangle className={`w-5 h-5 ${maintenanceMode ? "text-red-600" : "text-slate-500"}`} />}
                    variant="glass"
                    layoutId="card-maintenance"
                    onClick={() => setMaintenanceDialog(true)}
                >
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 transition-colors ${maintenanceMode ? "bg-red-100/60" : "bg-slate-100/50 group-hover:bg-red-50"}`} />
                    <div className="flex flex-col gap-2 pt-2 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className={`text-3xl font-black tracking-tight drop-shadow-sm group-hover:scale-[1.02] origin-left transition-transform ${maintenanceMode ? "text-red-600" : "text-slate-800"}`}>{maintenanceMode ? "ACTIVE" : "OFF"}</span>
                            {maintenanceMode && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
                            {maintenanceMode ? "System is offline" : "System is live"}
                        </p>
                    </div>
                </BentoCard>

                {/* 3. Registrations */}
                <BentoCard
                    className={`cursor-pointer group relative overflow-hidden bg-white border ${allowRegistrations ? "border-emerald-400 shadow-md shadow-emerald-500/10" : "border-slate-200"} hover:border-emerald-500/50 hover:-translate-y-1 hover:shadow-md transition-all duration-300`}
                    title="User Registrations"
                    icon={<Users className={`w-5 h-5 ${allowRegistrations ? "text-emerald-600" : "text-slate-500"}`} />}
                    variant="glass"
                    layoutId="card-registration"
                    onClick={() => setRegistrationDialog(true)}
                >
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 transition-colors ${allowRegistrations ? "bg-emerald-100/60" : "bg-slate-100/50 group-hover:bg-emerald-50"}`} />
                    <div className="flex flex-col gap-2 pt-2 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className={`text-3xl font-black tracking-tight drop-shadow-sm group-hover:scale-[1.02] origin-left transition-transform ${allowRegistrations ? "text-emerald-600" : "text-slate-800"}`}>{allowRegistrations ? "OPEN" : "CLOSED"}</span>
                            {allowRegistrations && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
                            {allowRegistrations ? "New signups allowed" : "Signups blocked"}
                        </p>
                    </div>
                </BentoCard>

                {/* 4. Developer Mode */}
                <BentoCard
                    className={`cursor-pointer group relative overflow-hidden bg-white border ${developerMode ? "border-amber-400 shadow-md shadow-amber-500/10" : "border-slate-200"} hover:border-amber-500/50 hover:-translate-y-1 hover:shadow-md transition-all duration-300`}
                    title="Developer Mode"
                    icon={<Code2 className={`w-5 h-5 ${developerMode ? "text-amber-600" : "text-slate-500"}`} />}
                    variant="glass"
                    layoutId="card-developer"
                    onClick={() => { setDeveloperDialog(true); setIsDevCountdownActive(true); setDevCountdown(5); }}
                >
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 transition-colors ${developerMode ? "bg-amber-100/60" : "bg-slate-100/50 group-hover:bg-amber-50"}`} />
                    <div className="flex flex-col gap-2 pt-2 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className={`text-3xl font-black tracking-tight drop-shadow-sm group-hover:scale-[1.02] origin-left transition-transform ${developerMode ? "text-amber-600" : "text-slate-800"}`}>{developerMode ? "ENABLED" : "DISABLED"}</span>
                            {developerMode && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span></span>}
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
                            {developerMode ? "Debug logs exposed" : "Production limits"}
                        </p>
                    </div>
                </BentoCard>

            </div>

            {/* ── ROW 2: Business Config ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">

                {/* Business Details Widget */}
                <BentoCard
                    className="md:col-span-2 xl:col-span-2 cursor-pointer group"
                    title="Business Identity"
                    icon={<Building2 className="w-5 h-5 text-blue-500" />}
                    variant="glass"
                    onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'identity' }))}
                    layoutId="card-identity"
                >
                    <div className="flex flex-col md:flex-row gap-6 items-start h-full pb-2 mt-2">
                        {/* Logo Preview */}
                        <div className="w-24 h-24 rounded-2xl bg-white/50 backdrop-blur-sm border-2 border-slate-200/60 flex items-center justify-center overflow-hidden shrink-0 group-hover:border-blue-300 group-hover:shadow-lg group-hover:shadow-blue-500/10 transition-all relative">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-slate-400 flex flex-col items-center">
                                    <Globe className="w-8 h-8 mb-1 opacity-50" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">No Logo</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/40 to-white/0 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                        </div>

                        {/* Details */}
                        <div className="flex-1 space-y-4 w-full">
                            <div>
                                <h4 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                    {siteName || "Unnamed Business"}
                                </h4>
                                <div className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                                    <Phone className="w-3.5 h-3.5" />
                                    {supportPhone || "No support phone set"}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 group-hover:bg-blue-50/50 group-hover:border-blue-100 transition-colors">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Location</div>
                                    <div className="text-sm font-medium text-slate-700 truncate">{serviceCenterContact || "Not configured"}</div>
                                </div>
                                <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 group-hover:bg-blue-50/50 group-hover:border-blue-100 transition-colors">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Business Hours</div>
                                    <div className="text-sm font-medium text-slate-700 truncate">{businessHours || "Not configured"}</div>
                                </div>
                            </div>
                        </div>

                        {/* Edit Affordance */}
                        <div className="hidden xl:flex items-center text-blue-600 font-semibold text-sm opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all absolute right-6 top-1/2 -translate-y-1/2">
                            Edit Profile &rarr;
                        </div>
                    </div>
                </BentoCard>

                {/* Financial Config Widget */}
                <BentoCard
                    className="md:col-span-1 xl:col-span-1 cursor-pointer group"
                    title="Financial & Locale"
                    icon={<Percent className="w-5 h-5 text-amber-500" />}
                    variant="glass"
                    onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'finance' }))}
                    layoutId="card-finance"
                >
                    <div className="flex flex-col h-full justify-between pb-2 mt-2">
                        <div className="space-y-4">
                            {/* Currency & VAT Row */}
                            <div className="flex gap-3">
                                <div className="flex-1 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100/50 flex flex-col items-center justify-center group-hover:shadow-md group-hover:shadow-amber-500/10 transition-all">
                                    <span className="text-3xl font-black text-amber-600 mb-1">{currencySymbol || "—"}</span>
                                    <span className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">Currency</span>
                                </div>
                                <div className="flex-1 p-4 bg-white/50 rounded-2xl border border-slate-200/60 flex flex-col items-center justify-center group-hover:bg-amber-50/50 group-hover:border-amber-200/50 group-hover:shadow-sm transition-all h-full">
                                    <span className="text-2xl font-bold text-slate-700 mb-1">{vatPercentage}%</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global VAT</span>
                                </div>
                            </div>

                            {/* Timezone */}
                            <div className="p-3 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200/60 flex items-center gap-3 group-hover:bg-amber-50/50 group-hover:border-amber-200/50 transition-colors">
                                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="flex-1 truncate">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Timezone</div>
                                    <div className="text-sm font-medium text-slate-700 truncate">{timezone || "UTC"}</div>
                                </div>
                            </div>
                        </div>

                        <div className="text-amber-600 font-semibold text-sm text-center pt-4 opacity-0 group-hover:opacity-100 transition-all">
                            Configure Finance &rarr;
                        </div>
                    </div>
                </BentoCard>

                {/* ── Danger Zone ── */}
                <BentoCard
                    title="Danger Zone"
                    icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
                    variant="default"
                    disableHover
                    className="md:col-span-3 xl:col-span-1 border-red-200/60 bg-gradient-to-br from-red-50/40 to-orange-50/30 flex flex-col justify-between"
                >
                    <div className="space-y-4 pt-1 flex-1 flex flex-col justify-between">
                        <p className="text-sm text-red-600/80 leading-relaxed font-medium">
                            Permanently delete <strong className="text-red-700">all business data</strong> including jobs, invoices, customers, and inventory.
                        </p>
                        <Button
                            variant="destructive"
                            className="w-full gap-2 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-shadow mt-4"
                            onClick={() => setShowDeleteDialog(true)}
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete All Data
                        </Button>
                    </div>
                </BentoCard>
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Delete All Business Data
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete ALL jobs, invoices, customers, inventory, and service requests. This action <strong>cannot be undone</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label>Type <Badge variant="destructive" className="mx-1">DELETE ALL</Badge> to confirm:</Label>
                        <Input
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            placeholder="Type DELETE ALL..."
                            className="font-mono"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmation(""); }}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteAllData}
                            disabled={isDeleting || deleteConfirmation !== "DELETE ALL"}
                        >
                            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete Everything
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ── Data & Backups Dialog (Expanding Popup) ── */}
            <AnimatePresence>
                {dataDialog && (
                    <motion.div
                        key="dialog-data"
                        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
                        style={{ pointerEvents: 'auto' }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={handleCloseDialogs}
                        />
                        <motion.div
                            layoutId="card-data"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-xl max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                                <div className="flex items-center gap-3 text-blue-600">
                                    <div className="p-2 bg-blue-100 rounded-xl">
                                        <Database className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                                            Data Management
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">Manage system data and unified backups.</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200" onClick={handleCloseDialogs}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto w-full custom-scrollbar space-y-6">
                                <div className="flex flex-col gap-4">
                                    <div className="flex items-center justify-between p-4 border rounded-xl bg-blue-50/50 border-blue-100 transition-colors hover:bg-blue-50/80">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-800">Manual Backup</h4>
                                            <p className="text-sm text-slate-500">
                                                Create an immediate encrypted backup of the entire system.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button onClick={() => setShowBackupDialog(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20">
                                                <Upload className="w-4 h-4 mr-2" />
                                                Create Backup
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border rounded-xl bg-rose-50/50 border-rose-100 transition-colors hover:bg-rose-50/80">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-800">Restore System</h4>
                                            <p className="text-sm text-slate-500">
                                                Restore from a previously exported fully encrypted backup file.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="destructive" onClick={() => setShowRestoreDialog(true)} className="rounded-xl shadow-md shadow-red-500/20">
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                Restore Data
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-dashed rounded-xl bg-slate-50/50 opacity-60">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-slate-800">Automated Schedules</h4>
                                            <p className="text-sm text-slate-500">
                                                Configure daily/weekly automated backups. (Coming Soon)
                                            </p>
                                        </div>
                                        <Button variant="outline" disabled className="rounded-xl">Configure</Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── External Backup and Restore Dialogs ── */}
            <BackupDialog
                open={showBackupDialog}
                onOpenChange={setShowBackupDialog}
            />
            <RestoreDialog
                open={showRestoreDialog}
                onOpenChange={setShowRestoreDialog}
            />

            {/* ── Maintenance Mode Dialog (Expanding Popup) ── */}
            <AnimatePresence>
                {maintenanceDialog && (
                    <motion.div
                        key="dialog-main"
                        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
                        style={{ pointerEvents: 'auto' }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={handleCloseDialogs}
                        />
                        <motion.div
                            layoutId="card-maintenance"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-md max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                                <div className="flex items-center gap-3 text-red-600">
                                    <div className="p-2 bg-red-100 rounded-xl">
                                        <AlertTriangle className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                                            {maintenanceMode ? "Disable" : "Enable"} Maintenance
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">System offline status</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200" onClick={handleCloseDialogs}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto w-full custom-scrollbar space-y-6">
                                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
                                    <p className="font-semibold text-red-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        This will immediately:
                                    </p>
                                    <ul className="list-disc ml-5 mt-2 space-y-1 text-sm text-red-800">
                                        <li>Block ALL customer access to the website</li>
                                        <li>Show "Under Maintenance" page</li>
                                        <li>Cancel pending customer operations</li>
                                    </ul>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <Label className="text-center block text-slate-600">Drag slider to 100% to confirm action</Label>
                                        <Slider
                                            value={[confirmSlider]}
                                            onValueChange={(v) => setConfirmSlider(v[0])}
                                            max={100}
                                            step={1}
                                            className="w-full py-2 cursor-pointer"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <span className={`text-4xl font-black tracking-tight transition-colors ${confirmSlider === 100 ? 'text-red-600 scale-110' : 'text-slate-300'}`}>
                                            {confirmSlider}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 mt-auto">
                                <Button variant="outline" className="rounded-xl font-bold" onClick={handleCloseDialogs}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={confirmSlider !== 100 || isDeleting}
                                    onClick={async () => {
                                        setIsDeleting(true);
                                        const newValue = !maintenanceMode;
                                        try {
                                            await settingsApi.upsert({ key: "maintenance_mode", value: String(newValue) });
                                            setMaintenanceMode(newValue);
                                            handleCloseDialogs();
                                            toast.success(`Maintenance Mode ${newValue ? 'ENABLED' : 'DISABLED'}`, {
                                                description: "System access has been updated."
                                            });
                                        } catch (e: any) {
                                            toast.error("Failed to update maintenance mode", { description: e.message });
                                        } finally {
                                            setIsDeleting(false);
                                        }
                                    }}
                                    className="rounded-xl font-bold shadow-lg gap-2"
                                >
                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmSlider === 100 && <Check className="w-4 h-4" />}
                                    Confirm Change
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Registration Dialog (Expanding Popup) ── */}
            <AnimatePresence>
                {registrationDialog && (
                    <motion.div
                        key="dialog-reg"
                        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
                        style={{ pointerEvents: 'auto' }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={handleCloseDialogs}
                        />
                        <motion.div
                            layoutId="card-registration"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-md max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                                <div className="flex items-center gap-3 text-emerald-600">
                                    <div className="p-2 bg-emerald-100 rounded-xl">
                                        <Users className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                                            {allowRegistrations ? "Disable" : "Enable"} Registrations
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">Control user signups</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200" onClick={handleCloseDialogs}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto w-full custom-scrollbar space-y-6">
                                <p className="text-sm text-muted-foreground">
                                    {allowRegistrations
                                        ? "Disabling registration prevents new users from signing up."
                                        : "Enabling registration allows public user signups."}
                                </p>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100/80 transition-colors">
                                        <Checkbox
                                            id="c1"
                                            checked={regChecks.c1}
                                            onCheckedChange={(c) => setRegChecks({ ...regChecks, c1: c as boolean })}
                                        />
                                        <label htmlFor="c1" className="text-sm text-slate-700 cursor-pointer leading-none pt-0.5">
                                            I understand this will {allowRegistrations ? "block" : "allow"} new account creation
                                        </label>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100/80 transition-colors">
                                        <Checkbox
                                            id="c2"
                                            checked={regChecks.c2}
                                            onCheckedChange={(c) => setRegChecks({ ...regChecks, c2: c as boolean })}
                                        />
                                        <label htmlFor="c2" className="text-sm text-slate-700 cursor-pointer leading-none pt-0.5">
                                            Existing users can still log in
                                        </label>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg hover:bg-slate-100/80 transition-colors">
                                        <Checkbox
                                            id="c3"
                                            checked={regChecks.c3}
                                            onCheckedChange={(c) => setRegChecks({ ...regChecks, c3: c as boolean })}
                                        />
                                        <label htmlFor="c3" className="text-sm text-slate-700 cursor-pointer leading-none pt-0.5">
                                            I acknowledge this change is immediate
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 mt-auto">
                                <Button variant="outline" className="rounded-xl font-bold" onClick={handleCloseDialogs}>
                                    Cancel
                                </Button>
                                <Button
                                    disabled={!regChecks.c1 || !regChecks.c2 || !regChecks.c3 || isDeleting}
                                    onClick={async () => {
                                        setIsDeleting(true);
                                        const newValue = !allowRegistrations;
                                        try {
                                            await settingsApi.upsert({ key: "allow_registrations", value: String(newValue) });
                                            setAllowRegistrations(newValue);
                                            handleCloseDialogs();
                                            toast.success(`Registrations ${newValue ? 'ENABLED' : 'DISABLED'}`);
                                        } catch (e: any) {
                                            toast.error("Failed to update registration setting", { description: e.message });
                                        } finally {
                                            setIsDeleting(false);
                                        }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl font-bold shadow-lg shadow-emerald-500/20"
                                >
                                    {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Confirm Change
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Developer Mode Dialog (Expanding Popup) ── */}
            <AnimatePresence>
                {developerDialog && (
                    <motion.div
                        key="dialog-dev"
                        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
                        style={{ pointerEvents: 'auto' }}
                    >
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40"
                            onClick={handleCloseDialogs}
                        />
                        <motion.div
                            layoutId="card-developer"
                            className="bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col relative z-10 w-full sm:max-w-md max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                                <div className="flex items-center gap-3 text-amber-600">
                                    <div className="p-2 bg-amber-100 rounded-xl">
                                        <Code2 className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                                            {developerMode ? "Disable" : "Enable"} Developer Mode
                                        </h2>
                                        <p className="text-sm text-slate-500 mt-1">Advanced system features</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200" onClick={handleCloseDialogs}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto w-full custom-scrollbar space-y-6">
                                <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-md">
                                    <p className="font-semibold text-amber-900 mb-2">ℹ️ Developer Mode Impacts:</p>
                                    <ul className="list-disc ml-5 space-y-1 text-sm text-amber-800">
                                        <li>Exposes API responses in console</li>
                                        <li>Shows internal debug error messages</li>
                                        <li>Displays raw database query logs</li>
                                        <li>May slightly impact performance</li>
                                    </ul>
                                </div>

                                {devCountdown > 0 ? (
                                    <div className="text-center py-4">
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 border-4 border-amber-300 relative overflow-hidden">
                                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                <circle cx="50" cy="50" r="46" fill="none" stroke="#ddd" strokeWidth="8" />
                                                <circle
                                                    cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8"
                                                    className="text-amber-500 transition-[stroke-dashoffset] duration-1000 ease-linear"
                                                    strokeDasharray="289"
                                                    strokeDashoffset={289 - (289 * devCountdown) / 5}
                                                />
                                            </svg>
                                            <span className="text-3xl font-black tracking-tighter text-amber-700 drop-shadow-md font-mono relative z-10">{devCountdown}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-3 font-medium animate-pulse">
                                            Please wait to confirm...
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 animate-in zoom-in duration-300">
                                        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-100 border-4 border-green-500 text-green-600 mb-2">
                                            <Check className="w-12 h-12" />
                                        </div>
                                        <p className="text-sm text-green-700 font-bold mt-2">
                                            You may now confirm the change
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 mt-auto">
                                <Button variant="outline" className="rounded-xl font-bold" onClick={handleCloseDialogs}>
                                    Cancel
                                </Button>
                                <Button
                                    disabled={devCountdown > 0 || isDeleting}
                                    onClick={async () => {
                                        setIsDeleting(true);
                                        const newValue = !developerMode;
                                        try {
                                            await settingsApi.upsert({ key: "developer_mode", value: String(newValue) });
                                            setDeveloperMode(newValue);
                                            handleCloseDialogs();
                                            toast.success(`Developer Mode ${newValue ? 'ENABLED' : 'DISABLED'}`);
                                        } catch (e: any) {
                                            toast.error("Failed to update developer mode", { description: e.message });
                                        } finally {
                                            setIsDeleting(false);
                                        }
                                    }}
                                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2 rounded-xl font-bold shadow-lg shadow-amber-500/20"
                                >
                                    {isDeleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Confirm Change
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
