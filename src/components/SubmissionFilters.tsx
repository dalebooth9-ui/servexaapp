import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type Filters = {
  type: string;
  engineerId: string;
  dateFrom: string;
  dateTo: string;
};

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  engineers: { id: string; name: string }[];
};

const EMPTY: Filters = { type: "all", engineerId: "all", dateFrom: "", dateTo: "" };

export default function SubmissionFilters({ filters, onChange, engineers }: Props) {
  const hasFilters = filters.type !== "all" || filters.engineerId !== "all" || filters.dateFrom || filters.dateTo;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Select value={filters.type} onValueChange={(v) => onChange({ ...filters, type: v })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="photo">Photos</SelectItem>
            <SelectItem value="note">Notes</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="location">Locations</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {engineers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Engineer</Label>
          <Select value={filters.engineerId} onValueChange={(v) => onChange({ ...filters, engineerId: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All engineers</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          className="w-[150px]"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          className="w-[150px]"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY)}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}
