import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const dragRef = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = React.useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // Merge refs
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref],
  );

  // Reset position/size when dialog opens
  React.useEffect(() => {
    setPos(null);
    setSize(null);
  }, []);

  /* ── Drag handlers ── */
  const onDragMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // don't drag when clicking close
    e.preventDefault();
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = pos?.x ?? rect.left + rect.width / 2;
    const cy = pos?.y ?? rect.top + rect.height / 2;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: cx, origY: cy };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ── Resize handlers ── */
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: size?.w ?? rect.width,
      origH: size?.h ?? rect.height,
    };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setSize({
        w: Math.max(320, resizeRef.current.origW + dw),
        h: Math.max(200, resizeRef.current.origH + dh),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const isDragged = pos !== null;
  const isResized = size !== null;

  const style: React.CSSProperties = isDragged
    ? {
        position: "fixed",
        left: pos.x,
        top: pos.y,
        transform: "translate(-50%, -50%)",
        ...(isResized ? { width: size.w, height: size.h, maxWidth: "none", maxHeight: "none" } : {}),
      }
    : isResized
    ? { width: size.w, height: size.h, maxWidth: "none", maxHeight: "none" }
    : {};

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRef}
        style={style}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg overflow-hidden flex flex-col",
          className,
        )}
        {...props}
      >
        {/* Drag handle — top left, away from the close button */}
        <div
          onMouseDown={onDragMouseDown}
          className="absolute left-3 top-3 flex items-center gap-1 cursor-grab active:cursor-grabbing select-none opacity-30 hover:opacity-70 transition-opacity z-10"
          title="Drag to move"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Spacer so content starts below the handle row */}
        <div className="h-5 shrink-0" />

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
          {children}
        </div>

        {/* Close button */}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-10">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>

        {/* Resize handle — bottom-right corner */}
        <div
          onMouseDown={onResizeMouseDown}
          title="Drag to resize"
          className="absolute bottom-1 right-1 w-5 h-5 cursor-se-resize flex items-end justify-end p-0.5 opacity-40 hover:opacity-80 transition-opacity z-10"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-muted-foreground">
            <path d="M0 10L10 0V10H0Z" />
          </svg>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
