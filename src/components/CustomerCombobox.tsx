import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fuzzyFilter } from "@/lib/fuzzyMatch";

export type CustomerOption = {
  id: string;
  name: string;
  email?: string | null;
};

interface Props {
  value: string;
  customers: CustomerOption[];
  onChange: (customerId: string) => void;
  placeholder?: string;
  className?: string;
}

export default function CustomerCombobox({ value, customers, onChange, placeholder = "Select customer", className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => customers.find((c) => c.id === value), [customers, value]);
  const filtered = useMemo(
    () => fuzzyFilter(customers, query, (c) => [c.name, c.email]),
    [customers, query]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">{selected?.name || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search customers…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No customers found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => { onChange(""); setOpen(false); setQuery(""); }}>
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                No customer
              </CommandItem>
              {filtered.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => { onChange(c.id); setOpen(false); setQuery(""); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{c.name}</div>
                    {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
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
