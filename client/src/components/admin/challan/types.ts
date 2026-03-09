
import { z } from "zod";

export const challanDeviceSchema = z.object({
    id: z.string().optional(), // For UI tracking
    corporateJobNumber: z.string().min(1, "Job Ref/Number is required"),
    deviceBrand: z.string().min(1, "Brand is required"),
    model: z.string().min(1, "Model is required"),
    serialNumber: z.string().min(1, "Serial Number is required"),
    reportedDefect: z.string().min(1, "Issue/Defect is required"),
    initialStatus: z.enum(["OK", "NG"]),
    physicalCondition: z.string().optional(),
    accessories: z.array(z.string()).optional(),
    technicianNotes: z.string().optional(),
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
