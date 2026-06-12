import { cn } from "../../lib/utils.js";

export type PromiseMascotVariant =
  | "default"
  | "loading"
  | "welcome"
  | "notFound"
  | "empty"
  | "error"
  | "offline"
  | "success"
  | "cancelled"
  | "maintenance";

type PromiseMascotSize = "sm" | "md" | "lg" | "xl";

type PromiseMascotProps = {
  variant?: PromiseMascotVariant;
  size?: PromiseMascotSize;
  alt?: string;
  withShadow?: boolean;
  className?: string;
  imageClassName?: string;
};

const mascotAssets: Record<PromiseMascotVariant, { png: string; webp: string }> = {
  default: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  loading: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  welcome: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  notFound: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  empty: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  error: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  offline: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  success: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  cancelled: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
  maintenance: {
    png: "/mascots/promise/default.png",
    webp: "/mascots/promise/default.webp",
  },
};

const sizeClasses: Record<PromiseMascotSize, string> = {
  sm: "w-24",
  md: "w-36",
  lg: "w-52",
  xl: "w-72",
};

export function PromiseMascot({
  variant = "default",
  size = "md",
  alt = "Promise Electronics mascot",
  withShadow = true,
  className,
  imageClassName,
}: PromiseMascotProps) {
  const asset = mascotAssets[variant];

  return (
    <div className={cn("relative inline-flex items-end justify-center", sizeClasses[size], className)}>
      {withShadow && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-1/2 h-[11%] w-[62%] -translate-x-1/2 rounded-full bg-slate-950/24 blur-xl"
        />
      )}
      <picture className="relative z-10 block w-full">
        <source srcSet={asset.webp} type="image/webp" />
        <img
          src={asset.png}
          alt={alt}
          className={cn("block h-auto w-full select-none object-contain", imageClassName)}
          draggable={false}
          loading="lazy"
        />
      </picture>
    </div>
  );
}

export { mascotAssets as promiseMascotAssets };
