/**
 * SortablePhotoGrid — drag-and-drop reordering for a grid of photo tiles.
 *
 * Used by the Site Photos section in the report editor for both the
 * "previously uploaded" and "pending" photo lists. Whole-tile drag with a
 * visible grip handle in the corner; touch-safe via TouchSensor. Consumers
 * render their own tile via `renderItem` so the remove button, caption
 * input, etc. stay under their control.
 */
import { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

type Props<T> = {
  items: T[];
  getId: (item: T, index: number) => string;
  onReorder: (nextItems: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
};

function SortableTile({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none",
  };
  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute top-1 left-1 z-10 rounded bg-background/90 p-1 cursor-grab active:cursor-grabbing shadow-sm"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}

export default function SortablePhotoGrid<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className = "grid grid-cols-2 gap-3",
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const ids = items.map((it, i) => getId(it, i));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((it, i) => (
            <SortableTile key={ids[i]} id={ids[i]}>
              {renderItem(it, i)}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
