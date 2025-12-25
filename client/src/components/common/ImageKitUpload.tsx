import { IKContext, IKUpload } from "imagekitio-react";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { getApiUrl } from "@/lib/config";

interface UploadResult {
    url: string;
    fileId: string;
    name: string;
    thumbnailUrl?: string;
}

interface ImageKitUploadProps {
    onUploadSuccess: (result: UploadResult) => void;
    onUploadError?: (error: Error) => void;
    folder?: string;
    className?: string;
    accept?: string;
    multiple?: boolean;
    children?: React.ReactNode;
}

const urlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "";
const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || "";

const authenticator = async () => {
    const response = await fetch(getApiUrl("/api/upload/imagekit-auth"), {
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error("ImageKit authentication failed");
    }
    return response.json();
};

export function ImageKitUpload({
    onUploadSuccess,
    onUploadError,
    folder = "/native-uploads",
    className,
    accept = "image/*,video/*",
    children,
}: ImageKitUploadProps) {
    const { toast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const uploadRef = useRef<HTMLInputElement>(null);

    const handleSuccess = (res: any) => {
        setIsUploading(false);
        onUploadSuccess({
            url: res.url,
            fileId: res.fileId,
            name: res.name,
            thumbnailUrl: res.thumbnailUrl,
        });
    };

    const handleError = (err: any) => {
        setIsUploading(false);
        const error = new Error(err?.message || "Upload failed");
        toast({
            title: "Upload Failed",
            description: error.message,
            variant: "destructive",
        });
        onUploadError?.(error);
    };

    if (!urlEndpoint || !publicKey) {
        return (
            <div className="text-red-500 text-sm p-4 border border-red-300 rounded-lg bg-red-50">
                ImageKit not configured. Please set VITE_IMAGEKIT_* environment variables.
            </div>
        );
    }

    return (
        <IKContext
            urlEndpoint={urlEndpoint}
            publicKey={publicKey}
            authenticator={authenticator}
        >
            <div className={cn("relative", className)}>
                <IKUpload
                    folder={folder}
                    onUploadStart={() => setIsUploading(true)}
                    onSuccess={handleSuccess}
                    onError={handleError}
                    ref={uploadRef}
                    accept={accept}
                    style={{ display: "none" }}
                />
                {children ? (
                    <div onClick={() => uploadRef.current?.click()}>
                        {children}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => uploadRef.current?.click()}
                        disabled={isUploading}
                        className="w-full aspect-square rounded-xl border-2 border-dashed border-[var(--color-native-border)] flex flex-col items-center justify-center gap-2 text-[var(--color-native-text-muted)] active:bg-[var(--color-native-input)] disabled:opacity-50"
                    >
                        {isUploading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <Camera className="w-6 h-6" />
                        )}
                        <span className="text-xs font-medium">
                            {isUploading ? "Uploading..." : "Add"}
                        </span>
                    </button>
                )}
            </div>
        </IKContext>
    );
}

export default ImageKitUpload;
