"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

function BottomSheetDragWrapper({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  const startY = React.useRef(0);
  const startX = React.useRef(0);
  const currentY = React.useRef(0);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const trackingPointerId = React.useRef<number | null>(null);
  const canDragFromScroll = React.useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const fromHandle = Boolean(target?.closest("[data-bottom-sheet-handle]"));
    const scrollTarget = target?.closest("[data-bottom-sheet-scroll]") as HTMLElement | null;
    canDragFromScroll.current = Boolean(scrollTarget && scrollTarget.scrollTop <= 0);
    if (!fromHandle && !canDragFromScroll.current) return;

    startY.current = e.clientY;
    startX.current = e.clientX;
    currentY.current = e.clientY;
    trackingPointerId.current = e.pointerId;
    dragging.current = fromHandle;
    if (fromHandle) {
      if (sheetRef.current) sheetRef.current.style.transition = "none";
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (trackingPointerId.current !== e.pointerId) return;
    currentY.current = e.clientY;
    const delta = Math.max(0, currentY.current - startY.current);
    const xDelta = Math.abs(e.clientX - startX.current);
    const yDelta = currentY.current - startY.current;
    if (!dragging.current) {
      if (!canDragFromScroll.current || yDelta <= 8 || yDelta <= xDelta) return;
      dragging.current = true;
      if (sheetRef.current) sheetRef.current.style.transition = "none";
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    const delta = currentY.current - startY.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    trackingPointerId.current = null;
    canDragFromScroll.current = false;
    if (!dragging.current) return;
    dragging.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 180ms ease-out";
      sheetRef.current.style.transform = delta > 80 ? "translateY(100%)" : "translateY(0)";
    }
    if (delta > 80) {
      window.setTimeout(onClose, 120);
      return;
    }
    window.setTimeout(() => {
      if (!sheetRef.current || dragging.current) return;
      sheetRef.current.style.transition = "";
      sheetRef.current.style.transform = "";
    }, 190);
  };

  return (
    <div
      ref={sheetRef}
      className="h-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        data-bottom-sheet-handle="true"
        className="flex justify-center pt-2 pb-3 touch-none cursor-grab active:cursor-grabbing"
      >
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>
      {children}
    </div>
  );
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        <SheetPrimitive.Close ref={closeRef} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
        {side === "bottom" ? (
          <BottomSheetDragWrapper onClose={() => closeRef.current?.click()}>
            {children}
          </BottomSheetDragWrapper>
        ) : (
          children
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
