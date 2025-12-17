import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface MediaViewerProps {
  urls: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MediaViewer({ urls, initialIndex = 0, isOpen, onClose }: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Reset to initialIndex whenever the modal opens or urls change
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex, urls]);

  // Clamp currentIndex if urls array shrinks
  useEffect(() => {
    if (urls.length > 0 && currentIndex >= urls.length) {
      setCurrentIndex(urls.length - 1);
    }
  }, [urls.length, currentIndex]);

  const isImage = (url: string) => {
    return url.startsWith("data:image/") || url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  };

  const isVideo = (url: string) => {
    return url.startsWith("data:video/") || url.match(/\.(mp4|webm|mov|avi)$/i);
  };

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : urls.length - 1));
  }, [urls.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < urls.length - 1 ? prev + 1 : 0));
  }, [urls.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, goToPrevious, goToNext]);

  if (!isOpen || urls.length === 0) return null;

  const currentUrl = urls[currentIndex];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      data-testid="media-viewer-overlay"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        data-testid="media-viewer-close"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {urls.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            data-testid="media-viewer-prev"
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            data-testid="media-viewer-next"
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
        </>
      )}

      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage(currentUrl) ? (
          <img
            src={currentUrl}
            alt={`Media ${currentIndex + 1}`}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            data-testid="media-viewer-image"
          />
        ) : isVideo(currentUrl) ? (
          <video
            src={currentUrl}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg"
            data-testid="media-viewer-video"
          />
        ) : (
          <div className="text-white text-center">
            <p>Unsupported media format</p>
          </div>
        )}
      </div>

      {urls.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {urls.map((_, index) => (
            <button
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(index);
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? "bg-white" : "bg-white/40 hover:bg-white/60"
              }`}
              data-testid={`media-viewer-dot-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
