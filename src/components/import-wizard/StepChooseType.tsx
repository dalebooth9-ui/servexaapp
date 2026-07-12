import { Card, CardContent } from "@/components/ui/card";
import { Users, MapPin, Package } from "lucide-react";
import { ImportEntity, ENTITY_SCHEMAS } from "./schemas";

const OPTIONS: { key: ImportEntity; icon: any }[] = [
  { key: "customers", icon: Users },
  { key: "sites", icon: MapPin },
  { key: "assets", icon: Package },
];

export default function StepChooseType({ value, onChange }: { value: ImportEntity | null; onChange: (e: ImportEntity) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {OPTIONS.map(({ key, icon: Icon }) => {
        const schema = ENTITY_SCHEMAS[key];
        const active = value === key;
        return (
          <Card
            key={key}
            onClick={() => onChange(key)}
            className={`cursor-pointer transition hover:border-primary ${active ? "border-primary ring-2 ring-primary/20" : ""}`}
          >
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <div className="font-semibold">{schema.label}</div>
              </div>
              <div className="text-sm text-muted-foreground">{schema.description}</div>
              <div className="text-xs text-muted-foreground">
                Fields: {schema.fields.map((f) => f.label).slice(0, 4).join(", ")}
                {schema.fields.length > 4 ? "…" : ""}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
