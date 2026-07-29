import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Library } from "lucide-react";

export interface SuggestedPart {
  id: string;
  name: string;
  unit_cost: number | null;
  sell_price: number | null;
  supplier: string | null;
  part_number: string | null;
}

/**
 * Free-text part name field with OPTIONAL price-book suggestions.
 *
 * Typing is always accepted as-is — the library is only an accelerator.
 * Tapping a suggestion fills the name and hands the caller the full record
 * so it can bring costs/part numbers along if it wants them.
 */
export default function PartNameSuggestInput({
  value,
  onChange,
  onPick,
  placeholder = "Part / material (type anything)",
  className,
  listType,
  onEnter,
  autoFocus,
  dictation = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (part: SuggestedPart) => void;
  placeholder?: string;
  className?: string;
  listType?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
  dictation?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedPart[]>([]);
  const [open, setOpen] = useState(false);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = supabase
        .from("parts_library")
        .select("id, name, unit_cost, sell_price, supplier, part_number")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(6);
      if (listType) query = query.eq("list_type", listType);
      const { data } = await query;
      if (cancelled) return;
      setSuggestions((data as any) || []);
      setOpen(((data as any) || []).length > 0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, listType]);

  const pick = (part: SuggestedPart) => {
    skipNext.current = true;
    onChange(part.name);
    onPick?.(part);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative w-full">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        dictation={dictation}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onEnter?.();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <p className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            From your price book — optional
          </p>
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent"
            >
              <Library className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.part_number && (
                <span className="shrink-0 text-xs text-muted-foreground">#{s.part_number}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
