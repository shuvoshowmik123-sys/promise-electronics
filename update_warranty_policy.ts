
import { storage } from "./server/storage";
import { db } from "./server/db";

async function updateWarrantyPolicy() {
    console.log("Updating Warranty Policy...");
    try {
        const policyContent = `At Promise Electronics, we stand behind the quality of our work. This Warranty Policy outlines the coverage provided on television repairs performed at our service center in 116 Hossain Tower, Naya Paltan.

1. What is Covered?
Our warranty is limited strictly to the specific parts we replaced and the specific labor performed during the repair.

Spare Parts: If a part we replaced fails due to a manufacturing defect within the warranty period, we will replace it free of charge.

Labor: If the same fault reoccurs due to our workmanship within the warranty period, we will fix it at no extra cost.

2. Warranty Duration
The warranty period varies depending on the type of repair and parts used.

Standard Repair: Typically 30 days (unless stated otherwise).

Panel/Screen Bonding: Warranty periods for screen bonding are specified on the individual invoice.

Specific duration: The exact warranty expiration date is printed on your official Job Card / Invoice and can also be viewed digitally in the TV Daktar app.

3. What is NOT Covered?
This warranty does not cover:

Physical Damage: Cracks on the screen or body caused by dropping, pressure, or mishandling after delivery.

Water/Liquid Damage: Any damage caused by liquid spills or moisture.

Voltage Fluctuation: Damage caused by high voltage, lightning strikes, or unstable electricity (Thunder/Surge damage).

Unrelated Issues: If a different part of the TV fails (e.g., we fixed the backlight, but later the sound board fails), the new issue is not covered.

Screen Lines: Vertical or horizontal lines appearing on the screen after delivery are often due to panel degradation and are usually not covered unless specifically related to a bonding repair.

4. How to Claim Warranty
To claim a warranty, you must:

Present Proof: Bring the original Job Card/Invoice or show the digital record in your TV Daktar app.

Intact Seals: The warranty sticker/seal placed on the back of your TV must be intact.

5. Warranty Void
Your warranty will be immediately VOID if:

The warranty sticker/seal has been removed, broken, or tampered with.

The TV has been opened or serviced by another technician or repair shop.

The defect is found to be caused by misuse or accident.`;

        await storage.upsertPolicy({
            slug: "warranty",
            title: "Warranty Policy",
            content: policyContent,
            isPublished: true,
            isPublishedApp: true,
        });
        console.log("Warranty Policy updated successfully.");
    } catch (error) {
        console.error("Failed to update Warranty Policy:", error);
    } finally {
        process.exit(0);
    }
}

updateWarrantyPolicy();
