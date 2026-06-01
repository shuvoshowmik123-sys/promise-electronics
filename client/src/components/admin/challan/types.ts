
import { z } from "zod";

export const challanDeviceSchema = z.object({
    id: z.string().optional(), // For UI tracking
    corporateJobNumber: z.string().min(1, "Job Ref/Number is required"),
    deviceBrand: z.string().min(1, "Brand is required"),
    model: z.string().min(1, "Model is required"),
    serialNumber: z.string().min(1, "Serial Number is required"),
    reportedDefect: z.string().min(1, "Issue/Defect is required"),
    initialStatus: z.enum(["OK", "NG"]),
    status: z.enum(["Received", "Pending", "Declared OK", "Declared NG"]).optional(),
    physicalCondition: z.string().optional(),
    accessories: z.array(z.string()).optional(),
    technicianNotes: z.string().optional(),
    customerName: z.string().optional(),
    externalJobRef: z.string().optional(),
    challanNumber: z.string().optional(),
    itemType: z.string().optional(),
    batchNumber: z.string().optional(),
    receivedDate: z.string().optional(),
    duplicateHint: z.string().optional(),
    duplicateMatchJobId: z.string().optional(),
    reviewAction: z.enum(["new_job", "crr", "ignore", "super_admin_review"]).optional(),
    crrReason: z.string().optional(),
});

export type ChallanDevice = z.infer<typeof challanDeviceSchema>;

export const challanMetadataSchema = z.object({
    receivedDate: z.date(),
    receivedBy: z.string().min(1, "Receiver name is required"),
    notes: z.string().optional(),
    vehicleNo: z.string().optional(),
    driverName: z.string().optional(),
});

export type ChallanMetadata = z.infer<typeof challanMetadataSchema>;
