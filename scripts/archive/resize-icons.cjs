const sharp = require('sharp');
const path = require('path');

const inputPath = 'C:/Users/Promiss technology/.gemini/antigravity/brain/adbff521-2947-48a1-b14c-b85ed9546267/uploaded_image_1766703783040.jpg';
const baseDir = 'android/app/src/main/res';

const sizes = [
    { name: 'xxxhdpi', size: 192 },
    { name: 'xxhdpi', size: 144 },
    { name: 'xhdpi', size: 96 },
    { name: 'hdpi', size: 72 },
    { name: 'mdpi', size: 48 },
    { name: 'ldpi', size: 36 }
];

async function resizeIcons() {
    for (const s of sizes) {
        const dir = path.join(baseDir, `mipmap-${s.name}`);

        // Create all icon variants
        await sharp(inputPath)
            .resize(s.size, s.size)
            .png()
            .toFile(path.join(dir, 'ic_launcher.png'));

        await sharp(inputPath)
            .resize(s.size, s.size)
            .png()
            .toFile(path.join(dir, 'ic_launcher_round.png'));

        await sharp(inputPath)
            .resize(s.size, s.size)
            .png()
            .toFile(path.join(dir, 'ic_launcher_foreground.png'));

        console.log(`Created icons for ${s.name} (${s.size}x${s.size})`);
    }

    console.log('All icons created successfully!');
}

resizeIcons().catch(console.error);
