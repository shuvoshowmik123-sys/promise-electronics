import { useState, useRef } from "react";
import { Upload, X, Image, Film, Loader2 } from "lucide-react";

interface UploadedFile {
  name: string;
  type: string;
  url: string;
  preview?: string;
}

interface ObjectUploaderProps {
  maxFiles?: number;
  maxFileSize?: number;
  onFilesChange: (files: UploadedFile[]) => void;
  acceptedTypes?: string;
}

export function ObjectUploader({
  maxFiles = 5,
  maxFileSize = 5 * 1024 * 1024,
  onFilesChange,
  acceptedTypes = "image/*,video/*",
}: ObjectUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadToObjectStorage = async (file: File): Promise<string> => {
    const response = await fetch("/api/objects/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    
    if (!response.ok) {
      throw new Error("Failed to get upload URL");
    }
    
    const { uploadURL } = await response.json();
    
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });
    
    if (!uploadResponse.ok) {
      throw new Error("Failed to upload file to storage");
    }
    
    const url = new URL(uploadURL);
    const objectPath = `/objects${url.pathname.split("/uploads")[1] ? `/uploads${url.pathname.split("/uploads")[1].split("?")[0]}` : url.pathname}`;
    
    return objectPath;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (files.length + selectedFiles.length > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const oversizedFiles = selectedFiles.filter(f => f.size > maxFileSize);
    if (oversizedFiles.length > 0) {
      setError(`Files must be under ${maxFileSize / (1024 * 1024)}MB`);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const newFiles: UploadedFile[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(`Uploading ${i + 1} of ${selectedFiles.length}...`);
        
        const reader = new FileReader();
        const preview = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const objectUrl = await uploadToObjectStorage(file);

        newFiles.push({
          name: file.name,
          type: file.type,
          url: objectUrl,
          preview: preview,
        });
      }

      const updatedFiles = [...files, ...newFiles];
      setFiles(updatedFiles);
      onFilesChange(updatedFiles);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload files. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onFilesChange(updatedFiles);
  };

  const isImage = (type: string) => type.startsWith("image/");
  const isVideo = (type: string) => type.startsWith("video/");

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        data-testid="file-upload-area"
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />
        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin mb-2" />
            <p className="text-sm font-medium">{uploadProgress || "Processing files..."}</p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Click to upload images or video</p>
            <p className="text-xs text-muted-foreground">Max {maxFileSize / (1024 * 1024)}MB per file, up to {maxFiles} files</p>
          </>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500" data-testid="upload-error">{error}</p>
      )}

      {files.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {files.map((file, index) => (
            <div key={index} className="relative group rounded-lg overflow-hidden border bg-slate-100" data-testid={`uploaded-file-${index}`}>
              {isImage(file.type) && (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="w-full h-24 object-cover"
                />
              )}
              {isVideo(file.type) && (
                <div className="w-full h-24 flex items-center justify-center bg-slate-200">
                  <Film className="h-8 w-8 text-slate-500" />
                </div>
              )}
              {!isImage(file.type) && !isVideo(file.type) && (
                <div className="w-full h-24 flex items-center justify-center bg-slate-200">
                  <Image className="h-8 w-8 text-slate-500" />
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                data-testid={`remove-file-${index}`}
              >
                <X className="h-3 w-3" />
              </button>
              <p className="text-xs truncate px-2 py-1 bg-white/80">{file.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
