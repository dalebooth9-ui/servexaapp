import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { UKDateInput } from "@/components/ui/uk-date-input";

// UK date input: stores ISO (yyyy-mm-dd) internally, always displays DD/MM/YYYY.
// Drop-in replacement for <UKDateInput  />: onChange receives an
// event-like object with `target.value` holding the ISO string.

export function isoToUk(iso?: string | null): string {
  if (!iso) return "";
  const m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function ukToIso(text: string): string | null {
  const cleaned = text.trim().replace(/[.\-\s]/g, "/");
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (m[3].length === 2) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface UKDateInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value?: string | null;
  onChange?: (e: { target: { value: string } }) => void;
}

export const UKDateInput = React.forwardRef<HTMLInputElement, UKDateInputProps>(
  ({ value, onChange, className, disabled, placeholder, ...rest }, ref) => {
    const [text, setText] = React.useState(() => isoToUk(value));
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
      setText(isoToUk(value));
    }, [value]);

    const emit = (iso: string) => onChange?.({ target: { value: iso } });

    const commit = (raw: string) => {
      if (!raw.trim()) {
        emit("");
        setText("");
        return;
      }
      const iso = ukToIso(raw);
      if (iso) {
        emit(iso);
        setText(isoToUk(iso));
      } else {
        setText(isoToUk(value));
      }
    };

    const selected = value && /^\d{4}-\d{2}-\d{2}/.test(String(value))
      ? new Date(`${String(value).slice(0, 10)}T00:00:00`)
      : undefined;

    return (
      <div className={cn("relative", className?.includes("w-") ? "" : "w-full")}>
        <Input
          ref={ref}
          inputMode="numeric"
          value={text}
          disabled={disabled}
          placeholder={placeholder || "DD/MM/YYYY"}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
          className={cn("pr-9", className)}
          {...rest}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Open calendar"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-50 bg-popover" align="end">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              weekStartsOn={1}
              onSelect={(d) => {
                if (d) {
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  emit(iso);
                  setText(isoToUk(iso));
                }
                setOpen(false);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);
UKDateInput.displayName = "UKDateInput";
