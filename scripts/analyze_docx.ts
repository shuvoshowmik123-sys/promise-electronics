
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

// Use raw string for Windows path to avoid escape issues
const filePath = String.raw`E:\Account\Documents\1000fix\1000fix\Challan\19. CHALLAN.docx`;

async function analyzeDocx() {
    console.log(`Attempting to read file from: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error("File does not exist at the specified path.");
        return;
    }

    try {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });

        console.log("\n--- EXTRACTED TEXT CONTENT ---\n");
        console.log(result.value);
        console.log("\n--- END OF CONTENT ---\n");

        // Also try to get some metadata if possible, but mammoth is mostly for text/html
        console.log(`File size: ${buffer.length} bytes`);

    } catch (error) {
        console.error("Error parsing DOCX:", error);
    }
}

analyzeDocx();
