import { useState } from "react";
import { useRamsLibrary, RamsLibraryItem } from "@/hooks/useRamsLibrary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Library, Sparkles, Loader2 } from "lucide-react";

interface Props {
  kind: "whole" | "block";
  workType?: string;
  triggerLabel?: string;
  onSelect: (item: RamsLibraryItem) => void;
}

/**
 * Popover picker over the org's RAMS Library. Used both for
 * "Start from library" (whole templates) and "Insert block" (content blocks)
 * from within the RAMS editors.
 */
export default function RamsLibraryPicker({ kind, workType, triggerLabel, onSelect }: Props) {
  const { items, loading } = useRamsLibrary({ kind, workType });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = items.filter((i) =>
    (i.name + " " + (i.description || "")).toLowerCase().includes(q.toLowerCase()),
  );

  const label = triggerLabel || (kind === "whole" ? "Start from library" : "Insert from library");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Library className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="border-b p-2">
          <Input placeholder="Search library…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
        </div>
        <ScrollArea className="max-h-72">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading library…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No {kind === "whole" ? "templates" : "blocks"} found.
            </div>
          )}
          {!loading &&
            filtered.map((item) => (
              <button
                key={item.id}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 border-b last:border-0"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  {item.work_types?.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {item.work_types[0]}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
        </ScrollArea>
        <div className="border-t p-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Library content is vetted &amp; reusable across jobs.
        </div>
      </PopoverContent>
    </Popover>
  );
}
