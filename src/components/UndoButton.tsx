import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGlobalUndo } from "@/hooks/useGlobalUndo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function UndoButton() {
  const { entry, undo } = useGlobalUndo();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!entry}
          onClick={undo}
          className="relative"
          aria-label="Undo last action"
        >
          <Undo2 className="h-5 w-5" />
          {entry && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {entry ? `Undo: ${entry.label}` : "Nothing to undo"}
      </TooltipContent>
    </Tooltip>
  );
}
