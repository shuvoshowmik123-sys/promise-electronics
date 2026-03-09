
import { db } from "../server/db";
import { inventoryItems } from "../shared/schema";
import { nanoid } from "nanoid";

async function seedInventory() {
    console.log("🌱 Seeding demo inventory...");

    const products = [
        // Physical Products
        {
            name: "High-Speed HDMI Cable 2m",
            category: "Accessories",
            description: "Premium gold-plated 4K HDMI cable.",
            itemType: "product",
            stock: 50,
            price: 550,
            status: "In Stock"
        },
        {
            name: "Samsung 32-inch LED Panel",
            category: "Spare Parts",
            description: "Original replacement panel for Samsung 32-inch TVs.",
            itemType: "product",
            stock: 10,
            price: 4500,
            status: "In Stock"
        },
        {
            name: "Universal Power Cord",
            category: "Accessories",
            description: "Standard 3-pin power cord for TVs and Monitors.",
            itemType: "product",
            stock: 100,
            price: 150,
            status: "In Stock"
        },
        {
            name: "Screen Cleaning Kit",
            category: "Accessories",
            description: "Microfiber cloth and cleaning solution spray.",
            itemType: "product",
            stock: 30,
            price: 250,
            status: "In Stock"
        },
        // Service Products
        {
            name: "General Diagnostic Fee",
            category: "Services",
            description: "Basic diagnosis charge for non-warranty repairs.",
            itemType: "service",
            stock: 9999, // Unlimited stock for services
            price: 500,
            status: "In Stock"
        },
        {
            name: "Screen Replacement Labor",
            category: "Services",
            description: "Labor charge for LED/LCD panel replacement.",
            itemType: "service",
            stock: 9999,
            price: 1200,
            status: "In Stock"
        },
        {
            name: "Software Update & Reset",
            category: "Services",
            description: "Firmware update and factory reset service.",
            itemType: "service",
            stock: 9999,
            price: 800,
            status: "In Stock"
        }
    ];

    try {
        for (const item of products) {
            await db.insert(inventoryItems).values({
                id: nanoid(),
                ...item
            });
            console.log(`✅ Added: ${item.name}`);
        }
        console.log("✨ Inventory seeding complete!");
    } catch (error) {
        console.error("❌ Seeding failed:", error);
    } finally {
        process.exit(0);
    }
}

seedInventory();
