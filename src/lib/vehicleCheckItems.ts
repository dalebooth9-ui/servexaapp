import { supabase } from "@/integrations/supabase/client";

export type VehicleCheckItem = {
  key: string;
  label: string;
  allow_na?: boolean;
};

export const DEFAULT_VEHICLE_CHECK_ITEMS: VehicleCheckItem[] = [
  { key: "tyres", label: "Tyres (tread, pressure, condition)" },
  { key: "lights", label: "Lights (head, tail, indicators, brake)" },
  { key: "oil", label: "Oil level" },
  { key: "washer_fluid", label: "Washer fluid" },
  { key: "mirrors", label: "Mirrors clean & adjusted" },
  { key: "wipers", label: "Wipers working" },
  { key: "horn", label: "Horn" },
  { key: "brakes", label: "Brakes (feel, handbrake)" },
  { key: "fuel_charge", label: "Fuel / charge level" },
  { key: "cleanliness", label: "Vehicle clean (interior & exterior)" },
  { key: "ladder_secured", label: "Ladder secured", allow_na: true },
  { key: "tools_secured", label: "Tools secured" },
  { key: "fire_extinguisher", label: "Fire extinguisher in van", allow_na: true },
  { key: "first_aid_kit", label: "First aid kit present" },
];

const SETTINGS_KEY = "vehicle_check_items";

export async function loadVehicleCheckItems(): Promise<VehicleCheckItem[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const val = (data as any)?.value;
  if (Array.isArray(val) && val.length > 0) {
    return val.filter((i: any) => i && typeof i.key === "string" && typeof i.label === "string");
  }
  return DEFAULT_VEHICLE_CHECK_ITEMS;
}

export async function saveVehicleCheckItems(items: VehicleCheckItem[]) {
  const clean = items
    .map((i) => ({ key: i.key.trim(), label: i.label.trim(), allow_na: !!i.allow_na }))
    .filter((i) => i.key && i.label);
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: clean as any }, { onConflict: "key" });
  if (error) throw error;
}
