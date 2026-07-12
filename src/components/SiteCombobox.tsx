import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fuzzyMatch";

export type SiteOption = {
  id: string;
  name: string;
  address?: string | null;
  postcode?: string | null;
};

interface Props {
  value: string;
  sites: SiteOption[];
  onChange: (siteId: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SiteCombobox({ value, sites, onChange, placeholder = "Select site", className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => sites.find((s) => s.id === value), [sites, value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sites;
    return sites.filter((s) => fuzzyMatch(query, s.name, s.address, s.postcode));
  }, [sites, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("mt-1 w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">
            {selected ? `${selected.name}${selected.postcode ? ` (${selected.postcode})` : ""}` : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search sites…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No sites found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none"
                onSelect={() => { onChange(""); setOpen(false); setQuery(""); }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                No site
              </CommandItem>
              {filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{s.name}{s.postcode ? ` (${s.postcode})` : ""}</div>
                    {s.address && <div className="text-xs text-muted-foreground truncate">{s.address}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
