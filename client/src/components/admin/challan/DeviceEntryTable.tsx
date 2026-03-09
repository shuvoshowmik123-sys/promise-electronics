
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ChallanDevice } from "./types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Edit2, CheckCircle, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Added
import { Device, validateDevice } from "./validation"; // Modified from ChallanDevice to Device, added validateDevice
import { nanoid } from "nanoid";

interface Props {
    devices: Device[]; // Changed ChallanDevice to Device
    onAddDevice: (device: Device) => void; // Changed ChallanDevice to Device
    onRemoveDevice: (index: number) => void;
    onUpdateDevice: (index: number, device: Device) => void; // Changed ChallanDevice to Device
}

const DEVICE_BRANDS = ["Samsung", "Sony", "LG", "Walton", "Philips", "Panasonic", "Sharp", "Dell", "HP", "Other"];
const COMMON_MODELS = ["43\" Smart TV", "55\" LED TV", "32\" Basic", "OLED 65\"", "Monitor 24\""];

export function DeviceEntryTable({ devices, onAddDevice, onRemoveDevice, onUpdateDevice }: Props) {
    // New Device Form State
    const [currentDevice, setCurrentDevice] = useState<Partial<ChallanDevice>>({
        initialStatus: "NG",
        deviceBrand: "",
    });

    const handleAdd = () => {
        // Basic validation
        if (!currentDevice.corporateJobNumber || !currentDevice.deviceBrand || !currentDevice.serialNumber || !currentDevice.reportedDefect) {
            alert("Please fill in all required fields (Job #, Brand, Serial, Issue)");
            return;
        }

        onAddDevice({
            ...currentDevice as ChallanDevice,
            id: nanoid(),
            model: currentDevice.model || "Unknown Model"
        });

        // Reset form but keep some sticky fields likely to be same
        setCurrentDevice({
            initialStatus: "NG",
            deviceBrand: currentDevice.deviceBrand, // Keep brand sticky
            model: "",
            corporateJobNumber: "",
            serialNumber: "",
            reportedDefect: "",
        });
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    };

    return (
        <div className="space-y-4">
            {/* Device List Table */}
            <div className="border rounded-md max-h-[300px] overflow-auto bg-card">
                <Table>
                    <TableHeader className="bg-muted/50 sticky top-0">
                        <TableRow>
                            <TableHead>Job Ref</TableHead>
                            <TableHead>Brand & Model</TableHead>
                            <TableHead>Serial No</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {devices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No devices added yet. Use the form below or import from Excel.
                                </TableCell>
                            </TableRow>
                        ) : (
                            devices.map((device, idx) => {
                                const validation = validateDevice(device); // Added validation
                                return (
                                    <TableRow key={device.id || idx} className={!validation.isComplete ? "bg-destructive/5" : ""}> {/* Added conditional styling */}
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {!validation.isComplete && validation.missingFields.includes("Job Reference") && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <AlertCircle className="h-3 w-3 text-destructive cursor-help" />
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Missing Job Ref</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                                <Input
                                                    value={device.corporateJobNumber}
                                                    onChange={(e) => {
                                                        const updated = { ...device, corporateJobNumber: e.target.value };
                                                        onUpdateDevice(idx, updated);
                                                    }}
                                                    className={`h-8 w-full ${!device.corporateJobNumber ? "border-destructive/50 focus-visible:ring-destructive" : "border-transparent hover:border-input focus:border-input bg-transparent px-2"}`} // Updated styling
                                                    placeholder="Required" // Added placeholder
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <Input
                                                    value={device.deviceBrand}
                                                    onChange={e => onUpdateDevice(idx, { ...device, deviceBrand: e.target.value })}
                                                    className={`h-7 text-xs font-semibold ${!device.deviceBrand ? "border-destructive/50" : "border-transparent hover:border-input focus:border-input bg-transparent px-1"}`} // Updated styling
                                                    placeholder="Brand"
                                                />
                                                <Input
                                                    value={device.model}
                                                    onChange={e => onUpdateDevice(idx, { ...device, model: e.target.value })}
                                                    className="h-7 text-xs border-transparent hover:border-input focus:border-input bg-transparent px-1 text-muted-foreground"
                                                    placeholder="Model"
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={device.serialNumber}
                                                onChange={(e) => onUpdateDevice(idx, { ...device, serialNumber: e.target.value })}
                                                className="h-8 font-mono text-xs border-transparent hover:border-input focus:border-input bg-transparent px-2"
                                                placeholder="Serial" // Added placeholder
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                value={device.reportedDefect}
                                                onChange={(e) => onUpdateDevice(idx, { ...device, reportedDefect: e.target.value })}
                                                className="h-8 text-xs border-transparent hover:border-input focus:border-input bg-transparent px-2"
                                                title={device.reportedDefect} // Added title
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Badge // Changed div to Badge
                                                variant={device.initialStatus === 'OK' ? 'default' : 'destructive'} // Added variant prop
                                                className="text-xs cursor-pointer select-none" // Updated classNames
                                                onClick={() => onUpdateDevice(idx, { ...device, initialStatus: device.initialStatus === 'OK' ? 'NG' : 'OK' })}
                                            >
                                                {device.initialStatus}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => onRemoveDevice(idx)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Add Device Inline Form */}
            <div className="grid grid-cols-12 gap-2 items-end bg-muted/30 p-3 rounded-lg border" onKeyDown={handleKeyPress}>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Job Ref</label>
                    <Input
                        placeholder="TCI-..."
                        value={currentDevice.corporateJobNumber || ''}
                        onChange={e => setCurrentDevice({ ...currentDevice, corporateJobNumber: e.target.value })}
                        className="h-9 bg-background"
                    />
                </div>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Brand</label>
                    <Select
                        value={currentDevice.deviceBrand}
                        onValueChange={v => setCurrentDevice({ ...currentDevice, deviceBrand: v })}
                    >
                        <SelectTrigger className="h-9 bg-background">
                            <SelectValue placeholder="Brand" />
                        </SelectTrigger>
                        <SelectContent>
                            {DEVICE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Model</label>
                    <Input
                        placeholder="e.g. 55 inch"
                        value={currentDevice.model || ''}
                        onChange={e => setCurrentDevice({ ...currentDevice, model: e.target.value })}
                        className="h-9 bg-background"
                    />
                </div>
                <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block">Serial</label>
                    <Input
                        placeholder="Serial No"
                        value={currentDevice.serialNumber || ''}
                        onChange={e => setCurrentDevice({ ...currentDevice, serialNumber: e.target.value })}
                        className="h-9 bg-background"
                    />
                </div>
                <div className="col-span-3">
                    <label className="text-xs font-medium mb-1 block">Reported Issue</label>
                    <Input
                        placeholder="Describe issue..."
                        value={currentDevice.reportedDefect || ''}
                        onChange={e => setCurrentDevice({ ...currentDevice, reportedDefect: e.target.value })}
                        className="h-9 bg-background"
                    />
                </div>
                <div className="col-span-1">
                    <Button onClick={handleAdd} className="w-full h-9" size="sm">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
