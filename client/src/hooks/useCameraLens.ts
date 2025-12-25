import { useState, useCallback } from 'react';
import { lensApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export type CameraMode = 'identify' | 'assess' | 'barcode';

export interface AnalysisResult {
    mode: CameraMode;
    label?: string;
    confidence?: number;
    damage?: string[];
    barcode?: string;
    partInfo?: any;
    rawText?: string;
}

export function useCameraLens() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const { toast } = useToast();

    const analyzeImage = useCallback(async (imageBase64: string, mode: CameraMode): Promise<AnalysisResult | null> => {
        setIsAnalyzing(true);
        try {
            let result: AnalysisResult | null = null;

            if (mode === 'identify') {
                const data = await lensApi.identifyPart(imageBase64);
                result = {
                    mode,
                    label: data.label,
                    confidence: data.confidence,
                    partInfo: data.partInfo,
                    rawText: data.rawText
                };
            } else if (mode === 'assess') {
                const data = await lensApi.assessDamage(imageBase64);
                result = {
                    mode,
                    damage: data.damage,
                    rawText: data.rawText
                };
            } else if (mode === 'barcode') {
                // Barcode logic usually happens client-side with a library, 
                // but if we send image for barcode reading:
                const data = await lensApi.readBarcode(imageBase64);
                result = {
                    mode,
                    barcode: data.barcode,
                    partInfo: data.partInfo
                };
            }

            return result;
        } catch (error) {
            console.error("Lens analysis error:", error);
            toast({
                title: "Analysis Failed",
                description: "Could not analyze the image. Please try again.",
                variant: "destructive"
            });
            return null;
        } finally {
            setIsAnalyzing(false);
        }
    }, [toast]);

    return {
        analyzeImage,
        isAnalyzing
    };
}
