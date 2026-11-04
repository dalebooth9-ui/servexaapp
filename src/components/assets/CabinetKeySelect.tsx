import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CABINET_KEY_OPTIONS } from "@/lib/siteAccessRules";
import { useState } from "react";

/** Cabinet / inlet box key type: a fixed pick list plus "Other (type it)". */
export default function CabinetKeySelect({ value, onChange, label = "Cabinet / inlet box key type" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const known = (CABINET_KEY_OPTIONS as readonly string[]).includes(value);
  const [other, setOther] = useState(!!value && !known);
  const sel = other ? "other" : known ? value : "";
  return (
    <div className="space-y-1">
      <Select value={sel || undefined} onValueChange={(v) => { if (v === "other") { setOther(true); onChange(""); } else if (v === "none") { setOther(false); onChange(""); } else { setOther(false); onChange(v); } }}>
        <SelectTrigger aria-label={label}><SelectValue placeholder="Not set" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not set</SelectItem>
          {CABINET_KEY_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value="other">Other (type it)</SelectItem>
        </SelectContent>
      </Select>
      {other && <Input aria-label={`${label} (other)`} placeholder="Type the key type, e.g. FB11" value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}
