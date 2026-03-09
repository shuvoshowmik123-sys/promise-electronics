import { db } from "../db";
import {
    salaryComponents,
    salaryStructures,
    salaryStructureLines,
    InsertSalaryComponent,
    InsertSalaryStructure,
    SalaryComponent,
    SalaryStructure,
    SalaryStructureLine
} from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

export class SalaryStructureRepository {
    // Components
    async getAllComponents(): Promise<SalaryComponent[]> {
        return db.select().from(salaryComponents).orderBy(salaryComponents.displayOrder);
    }

    async getComponent(id: string): Promise<SalaryComponent | undefined> {
        const [comp] = await db.select().from(salaryComponents).where(eq(salaryComponents.id, id)).limit(1);
        return comp;
    }

    async createComponent(comp: InsertSalaryComponent): Promise<SalaryComponent> {
        const [newComp] = await db.insert(salaryComponents).values({ id: `comp_${Date.now()}`, ...comp }).returning();
        return newComp;
    }

    async updateComponent(id: string, updates: Partial<InsertSalaryComponent>): Promise<SalaryComponent | undefined> {
        const [updatedComp] = await db.update(salaryComponents)
            .set(updates)
            .where(eq(salaryComponents.id, id))
            .returning();
        return updatedComp;
    }

    // Structures
    async getAllStructures(): Promise<SalaryStructure[]> {
        return db.select().from(salaryStructures).orderBy(desc(salaryStructures.createdAt));
    }

    async getStructureWithLines(id: string): Promise<{ structure: SalaryStructure; lines: SalaryStructureLine[] }> {
        const [structure] = await db.select().from(salaryStructures).where(eq(salaryStructures.id, id)).limit(1);
        if (!structure) throw new Error("Structure not found");

        const lines = await db.select().from(salaryStructureLines)
            .where(eq(salaryStructureLines.structureId, id))
            .orderBy(salaryStructureLines.sequence);

        return { structure, lines };
    }

    async createStructure(
        struct: InsertSalaryStructure,
        lines: { id: string; componentId: string; sequence: number; isMandatory: boolean }[]
    ): Promise<SalaryStructure> {
        return await db.transaction(async (tx) => {
            const [newStruct] = await tx.insert(salaryStructures).values({ id: `struct_${Date.now()}`, ...struct }).returning();

            if (lines.length > 0) {
                const linesToInsert = lines.map(l => ({
                    id: l.id,
                    structureId: newStruct.id,
                    componentId: l.componentId,
                    sequence: l.sequence,
                    isMandatory: l.isMandatory
                }));
                await tx.insert(salaryStructureLines).values(linesToInsert);
            }

            return newStruct;
        });
    }
}

export const salaryStructureRepo = new SalaryStructureRepository();
