const TARGET_WIDTH = 512;
const TARGET_HEIGHT = 256;
const WHITE_THRESHOLD = 246;
const ALPHA_THRESHOLD = 20;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read logo image."));
        };
        image.src = url;
    });
}

function isBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
    return a <= ALPHA_THRESHOLD || (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD);
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Could not normalize logo image."));
                return;
            }
            resolve(new File([blob], name, { type: "image/png" }));
        }, "image/png");
    });
}

function getLogoFitBounds(cropWidth: number, cropHeight: number) {
    const aspect = cropWidth / cropHeight;

    if (aspect >= 3.2) {
        return { maxWidth: 456, maxHeight: 170 };
    }

    if (aspect <= 1.25) {
        return { maxWidth: 250, maxHeight: 206 };
    }

    return { maxWidth: 420, maxHeight: 190 };
}

function safeFilePart(value: string): string {
    return value
        .trim()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 60) || "brand-logo";
}

export async function normalizeBrandLogoFromUrl(url: string, brandName: string): Promise<File> {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        throw new Error("Could not download existing logo.");
    }

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
        throw new Error("Existing logo URL is not an image.");
    }

    return normalizeBrandLogoFile(new File([blob], `${safeFilePart(brandName)}.png`, { type: blob.type }));
}

export async function normalizeBrandLogoFile(file: File): Promise<File> {
    const image = await loadImageFromFile(file);
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.naturalWidth || image.width;
    sourceCanvas.height = image.naturalHeight || image.height;

    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return file;

    sourceContext.drawImage(image, 0, 0);

    const source = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = source.data;
    let minX = sourceCanvas.width;
    let minY = sourceCanvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < sourceCanvas.height; y += 1) {
        for (let x = 0; x < sourceCanvas.width; x += 1) {
            const index = (y * sourceCanvas.width + x) * 4;
            if (!isBackgroundPixel(data[index], data[index + 1], data[index + 2], data[index + 3])) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }

    if (maxX < minX || maxY < minY) return file;

    const cropPadding = 2;
    minX = Math.max(0, minX - cropPadding);
    minY = Math.max(0, minY - cropPadding);
    maxX = Math.min(sourceCanvas.width - 1, maxX + cropPadding);
    maxY = Math.min(sourceCanvas.height - 1, maxY + cropPadding);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
    if (!cropContext) return file;

    cropContext.drawImage(sourceCanvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const crop = cropContext.getImageData(0, 0, cropWidth, cropHeight);
    for (let i = 0; i < crop.data.length; i += 4) {
        if (isBackgroundPixel(crop.data[i], crop.data[i + 1], crop.data[i + 2], crop.data[i + 3])) {
            crop.data[i + 3] = 0;
        }
    }
    cropContext.putImageData(crop, 0, 0);

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = TARGET_WIDTH;
    outputCanvas.height = TARGET_HEIGHT;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) return file;

    const { maxWidth, maxHeight } = getLogoFitBounds(cropWidth, cropHeight);
    const scale = Math.min(maxWidth / cropWidth, maxHeight / cropHeight);
    const drawWidth = Math.max(1, cropWidth * scale);
    const drawHeight = Math.max(1, cropHeight * scale);
    const drawX = (TARGET_WIDTH - drawWidth) / 2;
    const drawY = (TARGET_HEIGHT - drawHeight) / 2;

    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(cropCanvas, drawX, drawY, drawWidth, drawHeight);

    const baseName = safeFilePart(file.name);
    return canvasToFile(outputCanvas, `${baseName}-normalized.png`);
}
