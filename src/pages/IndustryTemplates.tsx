import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Search, Download, Plus, CheckCircle2, Flame, Droplets, Wrench, Shield } from "lucide-react";
import BlankTemplatePdfExport from "@/components/BlankTemplatePdfExport";

// ─── Industry-standard template definitions ──────────────────────────────────

type FieldDef = {
  id: string;
  label: string;
  type: string;
  section: string;
  required: boolean;
  options?: string[];
};

type IndustryTemplate = {
  id: string;
  name: string;
  standard: string;
  description: string;
  category: "dry_riser" | "fire_extinguisher" | "fire_hydrant" | "sprinkler";
  job_category?: string; // override for more specific job type matching
  fields: FieldDef[];
};

const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  // ── DRY RISER ───────────────────────────────────────────────────────────────
  {
    id: "dr-pressure-test",
    name: "Dry Riser — Annual Pressure Test",
    standard: "BS EN 9990",
    description: "Full 12-bar pressure test with flow and outlet checks, as required annually under BS EN 9990.",
    category: "dry_riser",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "site_address", label: "Site Address", type: "textarea", section: "Site Details", required: true },
      { id: "reference", label: "Reference / Job Number", type: "text", section: "Site Details", required: true },
      { id: "riser_location", label: "Riser Location", type: "text", section: "Site Details", required: false },
      { id: "date", label: "Inspection Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Engineer Name", type: "text", section: "Site Details", required: true },
      { id: "riser_type", label: "Riser Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry"] },
      { id: "no_of_outlets", label: "Number of Outlets", type: "number", section: "System Details", required: true },
      { id: "inlet_breeching", label: "Inlet Breeching Condition", type: "select", section: "Inlet Checks", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "inlet_caps", label: "Inlet Caps Present & Undamaged", type: "select", section: "Inlet Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "inlet_valve", label: "Inlet Valve Condition", type: "select", section: "Inlet Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "outlet_caps", label: "All Outlet Caps Present", type: "select", section: "Outlet Checks", required: true, options: ["Yes", "No"] },
      { id: "outlet_valves", label: "All Outlet Valves Operational", type: "select", section: "Outlet Checks", required: true, options: ["Yes", "No"] },
      { id: "landing_valves", label: "Landing Valve Condition", type: "select", section: "Outlet Checks", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "pump_pressure", label: "Pump Pressure (bar)", type: "number", section: "Pressure Test Results", required: true },
      { id: "static_pressure", label: "Static Test Pressure (bar)", type: "number", section: "Pressure Test Results", required: true },
      { id: "duration_mins", label: "Duration (minutes)", type: "number", section: "Pressure Test Results", required: true },
      { id: "pressure_drop", label: "Pressure Drop (bar)", type: "number", section: "Pressure Test Results", required: true },
      { id: "test_result", label: "Pressure Test Result", type: "pass_fail", section: "Pressure Test Results", required: true },
      { id: "signage_visible", label: "Signage Visible & Correct", type: "select", section: "General Checks", required: true, options: ["Yes", "No"] },
      { id: "access_clear", label: "Access / Clearance Adequate", type: "select", section: "General Checks", required: true, options: ["Yes", "No"] },
      { id: "remedial_required", label: "Remedial Action Required", type: "select", section: "General Checks", required: true, options: ["Yes", "No"] },
      { id: "remedial_details", label: "Remedial Action Details", type: "textarea", section: "General Checks", required: false },
      { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Comments / Observations", type: "textarea", section: "Result", required: false },
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9990:2015 — Dry Riser Systems — Code of Practice for the use of dry riser systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "dr-commissioning",
    name: "Dry Riser — Commissioning Certificate",
    standard: "BS EN 9990",
    description: "New installation commissioning record confirming system is fit for purpose before handover.",
    category: "dry_riser",
    job_category: "dry_riser_installation",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "site_address", label: "Site Address", type: "textarea", section: "Site Details", required: true },
      { id: "reference", label: "Job / Certificate Reference", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Commissioning Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Commissioning Engineer", type: "text", section: "Site Details", required: true },
      { id: "installer_company", label: "Installing Company", type: "text", section: "Installation Details", required: true },
      { id: "riser_type", label: "Riser Type", type: "select", section: "Installation Details", required: true, options: ["Wet", "Dry"] },
      { id: "number_of_floors", label: "Number of Floors", type: "number", section: "Installation Details", required: true },
      { id: "no_of_outlets", label: "Number of Outlets", type: "number", section: "Installation Details", required: true },
      { id: "pipe_material", label: "Pipe Material", type: "select", section: "Installation Details", required: true, options: ["Galvanised Steel", "Stainless Steel", "Other"] },
      { id: "inlet_breeching_check", label: "Inlet Breeching Installed Correctly", type: "select", section: "Commissioning Checks", required: true, options: ["Yes", "No"] },
      { id: "outlet_valves_check", label: "All Outlet Valves Operational", type: "select", section: "Commissioning Checks", required: true, options: ["Yes", "No"] },
      { id: "signage_check", label: "Signage Installed & Correct", type: "select", section: "Commissioning Checks", required: true, options: ["Yes", "No"] },
      { id: "flush_test", label: "System Flushed Prior to Test", type: "select", section: "Commissioning Checks", required: true, options: ["Yes", "No"] },
      { id: "test_pressure", label: "Test Pressure (bar)", type: "number", section: "Pressure Test", required: true },
      { id: "test_duration", label: "Duration (minutes)", type: "number", section: "Pressure Test", required: true },
      { id: "pressure_drop", label: "Pressure Drop (bar)", type: "number", section: "Pressure Test", required: true },
      { id: "test_result", label: "Pressure Test Result", type: "pass_fail", section: "Pressure Test", required: true },
      { id: "overall_result", label: "System Commissioned & Accepted", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Additional Notes", type: "textarea", section: "Result", required: false },
      { id: "bs_declaration", label: "This commissioning has been carried out in accordance with BS 9990:2015 — Dry Riser Systems — Code of Practice for the use of dry riser systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "dr-visual-live",
    name: "Dry Riser Visual",
    standard: "BS 9990:2015",
    description: "Visual inspection of dry riser system covering external and internal equipment checks per BS 9990:2015.",
    category: "dry_riser",
    fields: [
      { id: "scope_of_work", label: "Scope of works:", type: "select", section: "Site Details", required: true, options: ["Pressure Test", "Visual"] },
      { id: "customer_details", label: "Customer Details:", type: "text", section: "Site Details", required: true },
      { id: "site_details", label: "Site Details:", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Date:", type: "date", section: "Site Details", required: true },
      { id: "po_number", label: "PO Number:", type: "text", section: "Site Details", required: true },
      { id: "riser_location", label: "Riser Location:", type: "text", section: "Site Details", required: true },
      { id: "cabinet_keys", label: "Cabinet key type:", type: "text", section: "External Equipment", required: true },
      { id: "breeching_inlet_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_blank_plug_chain", label: "BS9990:2015 7.4.3.1 Does the breeching inlet have a blank plug & chain?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_glass_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet glass in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "relevant_signs_in_place", label: "BS9990:2015 8.1 Are all relevant signs in place?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_cabinet_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet cabinet in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "external_equipment_pass", label: "External equipment:", type: "pass_fail", section: "External Equipment", required: true },
      { id: "number_of_outlets", label: "Number of outlets:", type: "number", section: "Internal Equipment", required: true },
      { id: "landing_valve_good_condition", label: "BS9990:2015 7.4.3.1 Is the landing valve in good condition?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "landing_valve_blank_cap_chain", label: "BS9990:2015 7.4.3.1 Does the landing valve have a blank cap & chain?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "instantaneous_washers", label: "BS9990:2015 7.4.3.1 Are the instantaneous washers in good condition?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "landing_valve_padlock_strap", label: "BS9990:2015 4.1.5 Does the landing valve have a padlock & strap?", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "outlet_cabinets_condition", label: "BS9990:2015 4.1.5 Outlet cabinets in good condition?", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "internal_equipment_pass", label: "Internal equipment:", type: "pass_fail", section: "Internal Equipment", required: true },
      { id: "air_release_valve_vertical_point", label: "BS9990:2015 4.1.3.4 Is an air release valve installed at the most vertical point of the riser stack?", type: "checkbox", section: "Air Release Valve", required: true },
      { id: "air_release_valve_good_condition", label: "BS9990:2015 4.1.3.4 Is the air release valve in good condition?", type: "checkbox", section: "Air Release Valve", required: true },
      { id: "site_left_clean_tidy", label: "Site left clean & tidy?", type: "checkbox", section: "Result", required: true },
      { id: "customer_name", label: "Customer Name:", type: "text", section: "Result", required: true },
      { id: "comments", label: "Comments:", type: "textarea", section: "Result", required: true },
      { id: "materials_required", label: "Materials required:", type: "textarea", section: "Result", required: true },
    ],
  },
  {
    id: "dr-pressure-test-live",
    name: "Dry Riser Pressure Test",
    standard: "BS 9990:2015",
    description: "Pressure test of dry riser system with full internal and external equipment checks per BS 9990:2015.",
    category: "dry_riser",
    fields: [
      { id: "scope_of_work", label: "Scope of Work:", type: "select", section: "Site Details", required: true, options: ["Pressure Test", "Visual"] },
      { id: "customer_details", label: "Customer Details:", type: "text", section: "Site Details", required: true },
      { id: "site_details", label: "Site Details:", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Date:", type: "date", section: "Site Details", required: true },
      { id: "po_number", label: "PO Number:", type: "text", section: "Site Details", required: true },
      { id: "riser_location", label: "Riser Location:", type: "text", section: "Site Details", required: true },
      { id: "cabinet_keys", label: "Cabinet Keys:", type: "text", section: "External Equipment", required: true },
      { id: "breeching_inlet_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_blank_plug_chain", label: "BS9990:2015 7.4.3.1 Does the breeching inlet have a blank plug & chain?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_glass_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet glass in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "relevant_signs_in_place", label: "BS9990:2015 8.1 Are all relevant signs in place?", type: "checkbox", section: "External Equipment", required: true },
      { id: "breeching_inlet_cabinet_good_condition", label: "BS9990:2015 7.4.3.1 Is the Breeching Inlet cabinet in good condition?", type: "checkbox", section: "External Equipment", required: true },
      { id: "external_equipment_pass", label: "External equipment:", type: "pass_fail", section: "External Equipment", required: true },
      { id: "number_of_outlets", label: "Number of outlets:", type: "number", section: "Internal Equipment", required: true },
      { id: "landing_valve_good_condition", label: "BS9990:2015 7.4.3.1 Is the landing valve in good condition?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "landing_valve_blank_cap_chain", label: "BS9990:2015 7.4.3.1 Does the landing valve have a blank cap & chain?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "instantaneous_washers", label: "BS9990:2015 7.4.3.1 Are the instantaneous washers in good condition?", type: "checkbox", section: "Internal Equipment", required: true },
      { id: "landing_valve_padlock_strap", label: "BS9990:2015 4.1.5 Does the landing valve have a padlock & strap?", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "outlet_cabinets_condition", label: "BS9990:2015 4.1.5 Outlet cabinets in good condition?", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "internal_equipment_pass", label: "Internal equipment:", type: "pass_fail", section: "Internal Equipment", required: true },
      { id: "air_release_valve_vertical_point", label: "BS9990:2015 4.1.3.4 Is an air release valve installed at the most vertical point of the riser stack?", type: "checkbox", section: "Air Release Valve", required: true },
      { id: "air_release_valve_good_condition", label: "BS9990:2015 4.1.3.4 Is the air release valve in good condition?", type: "checkbox", section: "Air Release Valve", required: true },
      { id: "pump_pressure", label: "Pump Pressure (bar):", type: "number", section: "Pressure Test Results", required: true },
      { id: "static_pressure", label: "Static Test Pressure (bar):", type: "number", section: "Pressure Test Results", required: true },
      { id: "duration_mins", label: "Duration (minutes):", type: "number", section: "Pressure Test Results", required: true },
      { id: "pressure_drop", label: "Pressure Drop (bar):", type: "number", section: "Pressure Test Results", required: true },
      { id: "test_result", label: "Pressure Test Result:", type: "pass_fail", section: "Pressure Test Results", required: true },
      { id: "site_left_clean_tidy", label: "Site left clean & tidy?", type: "checkbox", section: "Result", required: true },
      { id: "customer_name", label: "Customer Name:", type: "text", section: "Result", required: true },
      { id: "comments", label: "Comments:", type: "textarea", section: "Result", required: true },
      { id: "materials_required", label: "Materials required:", type: "textarea", section: "Result", required: true },
    ],
  },
  // ── FIRE EXTINGUISHER ───────────────────────────────────────────────────────
  {
    id: "fe-annual",
    name: "Fire Extinguisher — Annual Service",
    standard: "BS 5306-3",
    description: "Comprehensive annual service record for all extinguisher types per BS 5306-3.",
    category: "fire_extinguisher",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "site_address", label: "Site Address", type: "textarea", section: "Site Details", required: true },
      { id: "reference", label: "Reference Number", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Service Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Technician Name", type: "text", section: "Site Details", required: true },
      { id: "location", label: "Extinguisher Location", type: "text", section: "Extinguisher Details", required: true },
      { id: "type", label: "Extinguisher Type", type: "select", section: "Extinguisher Details", required: true, options: ["Water", "Foam", "CO2", "Dry Powder", "Wet Chemical", "Halon"] },
      { id: "serial_number", label: "Serial Number", type: "text", section: "Extinguisher Details", required: true },
      { id: "manufacture_date", label: "Manufacture Date", type: "text", section: "Extinguisher Details", required: false },
      { id: "capacity", label: "Capacity (kg/L)", type: "text", section: "Extinguisher Details", required: false },
      { id: "weight_check", label: "Weight / Pressure Correct", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_indicator", label: "Pressure Indicator in Green Zone", type: "select", section: "Service Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "safety_pin", label: "Safety Pin & Tamper Seal Present", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "hose_horn", label: "Hose / Horn Undamaged", type: "select", section: "Service Checks", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "body_condition", label: "Body Condition (no corrosion/damage)", type: "select", section: "Service Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "service_label", label: "New Service Label Fitted", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "discharge_required", label: "Discharge / Extended Service Required", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
      { id: "next_service_date", label: "Next Service Date", type: "date", section: "Result", required: false },
      { id: "comments", label: "Comments", type: "textarea", section: "Result", required: false },
    ],
  },
  {
    id: "fe-extended",
    name: "Fire Extinguisher — Extended Service",
    standard: "BS 5306-3",
    description: "Extended service (5-year discharge/overhaul) record for water, foam, powder, and CO2 types.",
    category: "fire_extinguisher",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "reference", label: "Reference Number", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Service Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Technician Name", type: "text", section: "Site Details", required: true },
      { id: "location", label: "Extinguisher Location", type: "text", section: "Extinguisher Details", required: true },
      { id: "type", label: "Extinguisher Type", type: "select", section: "Extinguisher Details", required: true, options: ["Water", "Foam", "CO2", "Dry Powder", "Wet Chemical"] },
      { id: "serial_number", label: "Serial Number", type: "text", section: "Extinguisher Details", required: true },
      { id: "date_last_extended", label: "Date of Last Extended Service", type: "text", section: "Extinguisher Details", required: false },
      { id: "internal_inspection", label: "Internal Inspection Carried Out", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "orings_replaced", label: "O-Rings / Seals Replaced", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "recharged_weight", label: "Recharged to Correct Weight / Pressure", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "body_test", label: "Body / Hydraulic Test Required", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "body_test_result", label: "Hydraulic Test Result", type: "pass_fail", section: "Extended Checks", required: false },
      { id: "new_label_fitted", label: "Extended Service Label Fitted", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "condemned", label: "Extinguisher Condemned / Replaced", type: "select", section: "Extended Checks", required: true, options: ["No", "Condemned", "Replaced"] },
      { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
      { id: "next_extended_date", label: "Next Extended Service Due", type: "text", section: "Result", required: false },
      { id: "notes", label: "Notes", type: "textarea", section: "Result", required: false },
    ],
  },
  // ── FIRE HYDRANT ────────────────────────────────────────────────────────────
  {
    id: "fh-annual",
    name: "Fire Hydrant — Annual Inspection",
    standard: "BS 9990 / NFCC",
    description: "Full annual inspection including flow test, pressure readings, and marker post check.",
    category: "fire_hydrant",
    fields: [
      { id: "site_name", label: "Site Name / Location", type: "text", section: "Site Details", required: true },
      { id: "reference", label: "Hydrant Reference", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Inspection Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Inspector Name", type: "text", section: "Site Details", required: true },
      { id: "hydrant_type", label: "Hydrant Type", type: "select", section: "Hydrant Details", required: true, options: ["Surface Box", "Pillar", "Underground"] },
      { id: "hydrant_location", label: "Exact Location / Map Reference", type: "text", section: "Hydrant Details", required: true },
      { id: "valve_condition", label: "Main Valve Condition", type: "select", section: "Inspection Checks", required: true, options: ["Satisfactory", "Stiff", "Leaking", "Inoperable"] },
      { id: "outlet_cap", label: "Outlet Cap / Blank Present", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "marker_post", label: "Marker Post / Plate Visible", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No", "Damaged"] },
      { id: "access_clear", label: "Access Clear (no obstruction)", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "flow_test", label: "Flow Test Carried Out", type: "select", section: "Flow Test", required: true, options: ["Yes", "No"] },
      { id: "static_pressure", label: "Static Pressure (bar)", type: "number", section: "Flow Test", required: false },
      { id: "residual_pressure", label: "Residual Pressure at Flow (bar)", type: "number", section: "Flow Test", required: false },
      { id: "flow_rate", label: "Flow Rate (L/min)", type: "number", section: "Flow Test", required: false },
      { id: "flow_result", label: "Flow Test Result", type: "pass_fail", section: "Flow Test", required: true },
      { id: "remedial_required", label: "Remedial Action Required", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      { id: "overall_result", label: "Overall Inspection Result", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Comments / Remedial Details", type: "textarea", section: "Result", required: false },
    ],
  },
  {
    id: "fh-biannual",
    name: "Fire Hydrant — Bi-Annual Visual Check",
    standard: "BS 9990 / NFCC",
    description: "Bi-annual visual check confirming hydrant is accessible, signed, and undamaged.",
    category: "fire_hydrant",
    fields: [
      { id: "reference", label: "Hydrant Reference", type: "text", section: "Site Details", required: true },
      { id: "location", label: "Location", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Check Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Inspector", type: "text", section: "Site Details", required: true },
      { id: "marker_visible", label: "Marker Post / Plate Visible", type: "select", section: "Visual Checks", required: true, options: ["Yes", "No"] },
      { id: "cover_lid", label: "Cover / Lid Condition", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Damaged", "Missing"] },
      { id: "access_obstruction", label: "Access Obstruction Present", type: "select", section: "Visual Checks", required: true, options: ["No", "Yes — minor", "Yes — major"] },
      { id: "visible_damage", label: "Visible Physical Damage", type: "select", section: "Visual Checks", required: true, options: ["None", "Minor", "Significant"] },
      { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Comments", type: "textarea", section: "Result", required: false },
    ],
  },
  // ── SPRINKLER ───────────────────────────────────────────────────────────────
  {
    id: "sp-annual",
    name: "Sprinkler System — Annual Service",
    standard: "BS EN 12845",
    description: "Full annual service including pump test, alarm valve checks, and flow test per BS EN 12845.",
    category: "sprinkler",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "site_address", label: "Site Address", type: "textarea", section: "Site Details", required: true },
      { id: "reference", label: "System Reference", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Service Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Engineer Name", type: "text", section: "Site Details", required: true },
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry", "Alternate", "Pre-Action", "Deluge", "ESFR"] },
      { id: "number_of_heads", label: "Approximate Number of Heads", type: "number", section: "System Details", required: false },
      { id: "water_supply", label: "Water Supply Check", type: "select", section: "System Details", required: true, options: ["Town Main", "Tank", "Reservoir", "Combined"] },
      { id: "control_valve", label: "Control Valve Status", type: "select", section: "Valve Checks", required: true, options: ["Open", "Closed", "Locked Open"] },
      { id: "alarm_valve", label: "Alarm Valve Test", type: "pass_fail", section: "Valve Checks", required: true },
      { id: "pressure_gauge_1", label: "Supply Pressure Gauge (bar)", type: "number", section: "Pressure Readings", required: true },
      { id: "pressure_gauge_2", label: "System Pressure Gauge (bar)", type: "number", section: "Pressure Readings", required: true },
      { id: "pump_test", label: "Pump Test Result", type: "pass_fail", section: "Pump / Flow", required: true },
      { id: "pump_pressure", label: "Pump Pressure at Test Flow (bar)", type: "number", section: "Pump / Flow", required: false },
      { id: "flow_test", label: "Flow Test Carried Out", type: "select", section: "Pump / Flow", required: true, options: ["Yes", "No"] },
      { id: "drain_test", label: "Drain Test Satisfactory", type: "select", section: "Pump / Flow", required: true, options: ["Yes", "No", "N/A"] },
      { id: "heads_visual", label: "All Sprinkler Heads Visual Check", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Heads Obstructed", "Heads Corroded"] },
      { id: "pipework_condition", label: "Pipework Condition", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Corrosion Present", "Physical Damage"] },
      { id: "system_restored", label: "System Fully Restored", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Comments / Defects", type: "textarea", section: "Result", required: false },
    ],
  },
  {
    id: "sp-quarterly",
    name: "Sprinkler System — Quarterly Inspection",
    standard: "BS EN 12845",
    description: "Routine quarterly inspection covering valve status, pressure gauges, and alarm test.",
    category: "sprinkler",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "reference", label: "System Reference", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Inspection Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Engineer Name", type: "text", section: "Site Details", required: true },
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry", "Alternate", "Pre-Action", "Deluge"] },
      { id: "control_valve_status", label: "Control Valve — Open & Secured", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_gauges", label: "Pressure Gauges Within Range", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "alarm_test", label: "Alarm / Bell Test Satisfactory", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "water_supply", label: "Water Supply Confirmed Available", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "heads_clear", label: "Sprinkler Heads Unobstructed", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "overall_condition", label: "Overall System Condition", type: "select", section: "Result", required: true, options: ["Good", "Fair", "Poor"] },
      { id: "overall_result", label: "Inspection Result", type: "pass_fail", section: "Result", required: true },
      { id: "comments", label: "Comments", type: "textarea", section: "Result", required: false },
    ],
  },
];

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  dry_riser: { label: "Dry Riser", icon: Droplets, color: "bg-accent/20 text-accent-foreground border-accent/30" },
  fire_extinguisher: { label: "Fire Extinguisher", icon: Flame, color: "bg-destructive/10 text-destructive border-destructive/20" },
  fire_hydrant: { label: "Fire Hydrant", icon: Wrench, color: "bg-secondary text-secondary-foreground border-border" },
  sprinkler: { label: "Sprinkler", icon: Shield, color: "bg-primary/10 text-primary border-primary/20" },
};

const CATEGORY_ORDER = ["dry_riser", "fire_extinguisher", "fire_hydrant", "sprinkler"];

export default function IndustryTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const filtered = INDUSTRY_TEMPLATES.filter((t) => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.standard.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "all" || t.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  const grouped = CATEGORY_ORDER.reduce<Record<string, IndustryTemplate[]>>((acc, cat) => {
    const items = filtered.filter((t) => t.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const handleImport = async (tpl: IndustryTemplate) => {
    if (!user) return;
    setImporting(tpl.id);
    try {
      const { error } = await supabase.from("job_sheet_templates").insert({
        name: tpl.name,
        description: `${tpl.standard} — ${tpl.description}`,
        fields: tpl.fields as any,
        job_category: tpl.job_category ?? tpl.category,
        created_by: user.id,
        locked: false,
      } as any);
      if (error) throw error;
      setImported((prev) => new Set(prev).add(tpl.id));
      toast({ title: "Template imported", description: `"${tpl.name}" added to your Job Sheet Templates.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Industry Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pre-loaded industry-standard inspection &amp; service forms. Download as a blank PDF or import as an editable job sheet template.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates or standards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${activeCategory === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-accent"}`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-accent"}`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Template groups */}
      {Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <Search className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">No templates match your search.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, templates]) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold border ${meta.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((tpl) => {
                  const isImported = imported.has(tpl.id);
                  const isImporting = importing === tpl.id;
                  // Build a minimal mock template/jobInfo for BlankTemplatePdfExport
                  const mockTemplate = {
                    id: tpl.id,
                    name: tpl.name,
                    description: tpl.description,
                    standard: tpl.standard,
                    fields: tpl.fields,
                    branding: {},
                  };
                  return (
                    <div key={tpl.id} className="rounded-xl border bg-card p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground leading-snug">{tpl.name}</p>
                          <Badge variant="outline" className="text-xs shrink-0 font-bold">{tpl.standard}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {tpl.description.split(/(BS(?:\s+EN)?\s+[\d][\d\-.:]*(?::\d{4})?)/g).map((part, i) =>
                            /^BS(?:\s+EN)?\s+[\d]/.test(part)
                              ? <span key={i} className="font-bold text-foreground">{part}</span>
                              : part
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">{tpl.fields.length} fields</p>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-border">
                        {/* Blank PDF download */}
                        <BlankTemplatePdfExport template={mockTemplate} jobInfo={null} />
                        <span className="text-xs text-muted-foreground">Blank PDF</span>

                        {/* Import as editable template */}
                        <Button
                          size="sm"
                          variant={isImported ? "outline" : "default"}
                          className="ml-auto h-7 text-xs gap-1.5"
                          disabled={isImporting || isImported}
                          onClick={() => handleImport(tpl)}
                        >
                          {isImported ? (
                            <><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Imported</>
                          ) : isImporting ? (
                            <><span className="h-3.5 w-3.5 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" /> Importing…</>
                          ) : (
                            <><Plus className="h-3.5 w-3.5" /> Import</>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
