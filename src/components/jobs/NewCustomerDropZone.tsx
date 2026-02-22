import { useDroppable } from "@dnd-kit/core";
import { FolderPlus } from "lucide-react";

export default function NewCustomerDropZone({ isOver, isDragging }: { isOver: boolean; isDragging: boolean }) {
  const { setNodeRef } = useDroppable({
    id: "folder-__new_customer__",
    data: { customerName: "__new_customer__" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`mt-3 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-all ${
        !isDragging
          ? "hidden"
          : isOver
            ? "border-primary bg-primary/10 text-primary"
            : "border-muted-foreground/30 text-muted-foreground"
      }`}
    >
      <FolderPlus className="mx-auto mb-2 h-6 w-6" />
      <p className="text-sm font-medium">Drop here to create a new customer folder</p>
    </div>
  );
}
