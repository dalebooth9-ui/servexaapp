import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Search, Download, Plus, CheckCircle2, Flame, Droplets, Wrench, Shield, Zap, Wind, AlertTriangle, Eye, FileText, Pencil, Loader2, FileArchive } from "lucide-react";
import BlankTemplatePdfExport from "@/components/BlankTemplatePdfExport";
import BlankTemplateWordExport, { buildBlankTemplateDoc, blankTemplateFileSlug } from "@/components/BlankTemplateWordExport";
import EditTemplateDialog from "@/components/EditTemplateDialog";
import { Packer } from "docx";
import JSZip from "jszip";
import { RamsType } from "@/lib/ramsDefaults";

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
  category: string;
  job_category?: string;
  fields: FieldDef[];
};

const SITE_DETAIL_FIELDS: FieldDef[] = [
  { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
  { id: "site_address", label: "Site Address", type: "textarea", section: "Site Details", required: true },
  { id: "reference", label: "Reference / Job Number", type: "text", section: "Site Details", required: true },
  { id: "date", label: "Inspection Date", type: "date", section: "Site Details", required: true },
  { id: "engineer", label: "Engineer Name", type: "text", section: "Site Details", required: true },
];

const RESULT_FIELDS: FieldDef[] = [
  { id: "overall_result", label: "Overall Result", type: "pass_fail", section: "Result", required: true },
  { id: "remedial_required", label: "Remedial Action Required", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
  { id: "comments", label: "Comments / Defects", type: "textarea", section: "Result", required: false },
];

const INDUSTRY_TEMPLATES: IndustryTemplate[] = [

  // ══════════════════════════════════════════════════════════
  // DRY RISER
  // ══════════════════════════════════════════════════════════
  {
    id: "dr-pressure-test",
    name: "Dry Riser — Annual Pressure Test",
    standard: "BS 9990:2015",
    description: "Full 12-bar pressure test with flow and outlet checks, as required annually under BS 9990:2015.",
    category: "dry_riser",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "riser_location", label: "Riser Location", type: "text", section: "Site Details", required: false },
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
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9990:2015", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "dr-visual-live",
    name: "Dry Riser — Visual Inspection",
    standard: "BS 9990:2015",
    description: "Visual inspection of dry riser system covering external and internal equipment checks per BS 9990:2015.",
    category: "dry_riser",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "riser_location", label: "Riser Location", type: "text", section: "Site Details", required: false },
      { id: "cabinet_keys", label: "Cabinet Key Type", type: "text", section: "External Equipment", required: true },
      { id: "breeching_inlet_condition", label: "BS9990:2015 7.4.3.1 Breeching Inlet Condition", type: "select", section: "External Equipment", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "breeching_blank_plug", label: "Blank Plug & Chain Present", type: "select", section: "External Equipment", required: true, options: ["Yes", "No"] },
      { id: "breeching_glass", label: "Breeching Inlet Glass Condition", type: "select", section: "External Equipment", required: true, options: ["Satisfactory", "Broken", "N/A"] },
      { id: "signage_in_place", label: "BS9990:2015 8.1 All Relevant Signs in Place", type: "select", section: "External Equipment", required: true, options: ["Yes", "No"] },
      { id: "breeching_cabinet", label: "Breeching Inlet Cabinet Condition", type: "select", section: "External Equipment", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "inspection_records", label: "BS9990:2015 7.4.6 Inspection & Test Records Filled In", type: "select", section: "External Equipment", required: true, options: ["Yes", "No"] },
      { id: "external_result", label: "External Equipment Result", type: "pass_fail", section: "External Equipment", required: true },
      { id: "no_of_outlets", label: "Number of Outlets", type: "number", section: "Internal Equipment", required: true },
      { id: "landing_valve_condition", label: "Landing Valve Condition", type: "select", section: "Internal Equipment", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "landing_valve_cap", label: "Landing Valve Blank Cap & Chain", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No"] },
      { id: "washers_condition", label: "Instantaneous Washers Condition", type: "select", section: "Internal Equipment", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "padlock_strap", label: "BS9990:2015 4.1.5 Padlock & Strap", type: "select", section: "Internal Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "outlet_cabinets", label: "Outlet Cabinets Condition", type: "select", section: "Internal Equipment", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "internal_result", label: "Internal Equipment Result", type: "pass_fail", section: "Internal Equipment", required: true },
      { id: "air_release_valve", label: "Air Release Valve at Highest Point", type: "select", section: "Air Release Valve", required: true, options: ["Yes", "No", "N/A"] },
      { id: "air_release_condition", label: "Air Release Valve Condition", type: "select", section: "Air Release Valve", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      ...RESULT_FIELDS,
    ],
  },
  {
    id: "dr-commissioning",
    name: "Dry Riser — Commissioning Certificate",
    standard: "BS 9990:2015",
    description: "New installation commissioning record confirming system is fit for purpose before handover.",
    category: "dry_riser",
    job_category: "dry_riser_installation",
    fields: [
      ...SITE_DETAIL_FIELDS,
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
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This commissioning has been carried out in accordance with BS 9990:2015", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // DRY RISER REMEDIAL
  // ══════════════════════════════════════════════════════════
  {
    id: "dr-remedial",
    name: "Dry Riser — Remedial / Repair Works",
    standard: "BS 9990:2015",
    description: "Remedial and repair works to dry riser systems including valve replacement, pipework repairs, cabinet rectification and system re-commissioning in accordance with BS 9990:2015.",
    category: "dry_riser_remedial",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "defect_source", label: "Defect Source (e.g. previous inspection report)", type: "text", section: "Works Details", required: false },
      { id: "system_isolation_notified", label: "Building Management Notified of System Isolation", type: "select", section: "Works Details", required: true, options: ["Yes", "No"] },
      { id: "works_description", label: "Description of Remedial Works Carried Out", type: "textarea", section: "Works Details", required: true },
      { id: "components_replaced", label: "Components Replaced / Repaired", type: "textarea", section: "Works Details", required: true, },
      { id: "inlet_condition", label: "Breeching Inlet — Post-Repair Condition", type: "select", section: "Post-Works Checks", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "outlet_caps_ok", label: "All Outlet Caps & Chains Fitted", type: "select", section: "Post-Works Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "valves_operational", label: "All Valves Operational Post-Repair", type: "select", section: "Post-Works Checks", required: true, options: ["Yes", "No"] },
      { id: "signage_ok", label: "Signage Correct & Visible", type: "select", section: "Post-Works Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_test_carried_out", label: "Hydraulic Pressure Test Carried Out", type: "select", section: "Post-Works Pressure Test", required: true, options: ["Yes", "No"] },
      { id: "test_pressure", label: "Test Pressure (bar)", type: "number", section: "Post-Works Pressure Test", required: false },
      { id: "test_duration", label: "Duration (minutes)", type: "number", section: "Post-Works Pressure Test", required: false },
      { id: "pressure_drop", label: "Pressure Drop (bar)", type: "number", section: "Post-Works Pressure Test", required: false },
      { id: "test_result", label: "Pressure Test Result", type: "pass_fail", section: "Post-Works Pressure Test", required: false },
      { id: "system_restored", label: "System Restored to Full Operational Service", type: "select", section: "Completion", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "Remedial works have been carried out in accordance with BS 9990:2015", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // WET RISER
  // ══════════════════════════════════════════════════════════
  {
    id: "wr-annual",
    name: "Wet Riser — Annual Service & Test",
    standard: "BS 9990:2015",
    description: "Annual service and pressure test of wet riser systems including pump test and landing valve checks.",
    category: "wet_riser",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_ref", label: "System Reference", type: "text", section: "System Details", required: true },
      { id: "no_of_landing_valves", label: "Number of Landing Valves", type: "number", section: "System Details", required: true },
      { id: "pump_set", label: "Pump Set Manufacturer / Model", type: "text", section: "System Details", required: false },
      { id: "pump_start_test", label: "Pump Auto-Start Test", type: "pass_fail", section: "Pump Checks", required: true },
      { id: "pump_duty_pressure", label: "Pump Duty Pressure (bar)", type: "number", section: "Pump Checks", required: true },
      { id: "pump_standby_ok", label: "Standby Pump Operational", type: "select", section: "Pump Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "jockey_pump_ok", label: "Jockey Pump Operational", type: "select", section: "Pump Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "tank_level", label: "Break Tank Level Adequate", type: "select", section: "Pump Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "landing_valves_ok", label: "All Landing Valves Operational", type: "select", section: "Landing Valve Checks", required: true, options: ["Yes", "No"] },
      { id: "hose_reels_ok", label: "Hose Reels Present & Serviceable", type: "select", section: "Landing Valve Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "signage_ok", label: "Signage Correct & Visible", type: "select", section: "Landing Valve Checks", required: true, options: ["Yes", "No"] },
      { id: "test_pressure", label: "System Test Pressure (bar)", type: "number", section: "Pressure Test", required: true },
      { id: "test_duration", label: "Duration (minutes)", type: "number", section: "Pressure Test", required: true },
      { id: "pressure_drop", label: "Pressure Drop (bar)", type: "number", section: "Pressure Test", required: true },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This service has been carried out in accordance with BS 9990:2015 — Code of Practice for the Use of Fire-Fighting Water Systems (Wet Riser)", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "wr-visual",
    name: "Wet Riser — Visual Inspection",
    standard: "BS 9990:2015",
    description: "Routine visual check of wet riser components, valves, signage and pump room.",
    category: "wet_riser",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "pump_room_access", label: "Pump Room Access Clear", type: "select", section: "Pump Room", required: true, options: ["Yes", "No"] },
      { id: "pump_condition", label: "Pump Set Condition", type: "select", section: "Pump Room", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "no_leaks", label: "No Visible Leaks", type: "select", section: "Pump Room", required: true, options: ["Yes — no leaks", "No — leaks found"] },
      { id: "no_of_landing_valves", label: "Number of Landing Valves", type: "number", section: "Riser Checks", required: true },
      { id: "landing_valves_condition", label: "Landing Valves Condition", type: "select", section: "Riser Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "hose_reels_present", label: "Hose Reels Present & Undamaged", type: "select", section: "Riser Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "cabinets_condition", label: "Valve Cabinets Condition", type: "select", section: "Riser Checks", required: true, options: ["Satisfactory", "Damaged", "N/A"] },
      { id: "signage_ok", label: "Signage Visible & Correct", type: "select", section: "Riser Checks", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9990:2015 — Code of Practice for the Use of Fire-Fighting Water Systems (Wet Riser)", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FIRE EXTINGUISHER
  // ══════════════════════════════════════════════════════════
  {
    id: "fe-annual",
    name: "Fire Extinguisher — Annual Service",
    standard: "BS 5306-3:2017",
    description: "Comprehensive annual service record for all extinguisher types per BS 5306-3:2017.",
    category: "fire_extinguisher",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "location", label: "Extinguisher Location", type: "text", section: "Extinguisher Details", required: true },
      { id: "type", label: "Extinguisher Type", type: "select", section: "Extinguisher Details", required: true, options: ["Water", "Foam (AFFF)", "CO2", "Dry Powder", "Wet Chemical", "Water Mist", "Halon"] },
      { id: "serial_number", label: "Serial Number", type: "text", section: "Extinguisher Details", required: true },
      { id: "manufacture_date", label: "Manufacture Date", type: "text", section: "Extinguisher Details", required: false },
      { id: "capacity", label: "Capacity (kg / L)", type: "text", section: "Extinguisher Details", required: false },
      { id: "weight_check", label: "Weight / Pressure Correct", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_indicator", label: "Pressure Indicator in Green Zone", type: "select", section: "Service Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "safety_pin", label: "Safety Pin & Tamper Seal Present", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "hose_horn", label: "Hose / Horn Undamaged", type: "select", section: "Service Checks", required: true, options: ["Satisfactory", "Unsatisfactory", "N/A"] },
      { id: "body_condition", label: "Body Condition (no corrosion / damage)", type: "select", section: "Service Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "service_label", label: "New Service Label Fitted", type: "select", section: "Service Checks", required: true, options: ["Yes", "No"] },
      { id: "discharge_required", label: "Discharge / Extended Service Required", type: "select", section: "Service Checks", required: true, options: ["No", "Yes — next year", "Yes — now"] },
      ...RESULT_FIELDS,
      { id: "next_service_date", label: "Next Service Date", type: "date", section: "Result", required: false },
    ],
  },
  {
    id: "fe-extended",
    name: "Fire Extinguisher — Extended Service",
    standard: "BS 5306-3:2017",
    description: "5-year extended service / discharge and overhaul record per BS 5306-3:2017.",
    category: "fire_extinguisher",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "location", label: "Extinguisher Location", type: "text", section: "Extinguisher Details", required: true },
      { id: "type", label: "Extinguisher Type", type: "select", section: "Extinguisher Details", required: true, options: ["Water", "Foam (AFFF)", "CO2", "Dry Powder", "Wet Chemical", "Water Mist"] },
      { id: "serial_number", label: "Serial Number", type: "text", section: "Extinguisher Details", required: true },
      { id: "date_last_extended", label: "Date of Last Extended Service", type: "text", section: "Extinguisher Details", required: false },
      { id: "internal_inspection", label: "Internal Inspection Carried Out", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "orings_replaced", label: "O-Rings / Seals Replaced", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "recharged_weight", label: "Recharged to Correct Weight / Pressure", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "body_test", label: "Hydraulic Body Test Required", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "body_test_result", label: "Hydraulic Test Result", type: "pass_fail", section: "Extended Checks", required: false },
      { id: "new_label_fitted", label: "Extended Service Label Fitted", type: "select", section: "Extended Checks", required: true, options: ["Yes", "No"] },
      { id: "condemned", label: "Extinguisher Condemned / Replaced", type: "select", section: "Extended Checks", required: true, options: ["No", "Condemned", "Replaced"] },
      ...RESULT_FIELDS,
      { id: "next_extended_date", label: "Next Extended Service Due", type: "text", section: "Result", required: false },
    ],
  },
  {
    id: "fe-new-install",
    name: "Fire Extinguisher — Installation Record",
    standard: "BS 5306-3:2017 / BS 5306-8",
    description: "Record of new fire extinguisher installation including siting, type selection and commissioning.",
    category: "fire_extinguisher",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "risk_class", label: "Fire Risk Class", type: "select", section: "Risk & Selection", required: true, options: ["Class A", "Class B", "Class C", "Class D", "Class F", "Electrical"] },
      { id: "type_selected", label: "Extinguisher Type Selected", type: "select", section: "Risk & Selection", required: true, options: ["Water", "Foam (AFFF)", "CO2", "Dry Powder", "Wet Chemical", "Water Mist"] },
      { id: "capacity", label: "Capacity (kg / L)", type: "text", section: "Risk & Selection", required: true },
      { id: "quantity", label: "Quantity Installed", type: "number", section: "Risk & Selection", required: true },
      { id: "location_description", label: "Installation Location", type: "text", section: "Installation", required: true },
      { id: "height_installed", label: "Installed at Correct Height (max 1m handle)", type: "select", section: "Installation", required: true, options: ["Yes", "No"] },
      { id: "visible_accessible", label: "Visible & Accessible", type: "select", section: "Installation", required: true, options: ["Yes", "No"] },
      { id: "signage_fitted", label: "Identification Signage Fitted", type: "select", section: "Installation", required: true, options: ["Yes", "No"] },
      { id: "service_label", label: "Service Label Fitted", type: "select", section: "Installation", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FIRE HYDRANT
  // ══════════════════════════════════════════════════════════
  {
    id: "fh-annual",
    name: "Fire Hydrant — Annual Inspection & Flow Test",
    standard: "BS 9990:2015 / BS 750:2006",
    description: "Full annual inspection including flow test, pressure readings, and marker post check per BS 9990:2015 and BS 750:2006.",
    category: "fire_hydrant",
    fields: [
      ...SITE_DETAIL_FIELDS,
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
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9990:2015 and BS 750:2006 — Underground Fire Hydrants", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "fh-biannual",
    name: "Fire Hydrant — 6 Month Visual Check",
    standard: "BS 9990:2015 / NFCC",
    description: "6-month visual check confirming hydrant is accessible, signed, and undamaged.",
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
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9990:2015 — Code of Practice for the Use of Fire-Fighting Water Systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // SPRINKLER SYSTEM
  // ══════════════════════════════════════════════════════════
  {
    id: "sp-annual",
    name: "Sprinkler System — Annual Service",
    standard: "BS EN 12845:2015",
    description: "Full annual service including pump test, alarm valve checks, and flow test per BS EN 12845.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry", "Alternate", "Pre-Action", "Deluge", "ESFR"] },
      { id: "number_of_heads", label: "Approximate Number of Heads", type: "number", section: "System Details", required: false },
      { id: "water_supply", label: "Water Supply Type", type: "select", section: "System Details", required: true, options: ["Town Main", "Tank", "Reservoir", "Combined"] },
      { id: "control_valve", label: "Control Valve Status", type: "select", section: "Valve Checks", required: true, options: ["Open", "Closed", "Locked Open"] },
      { id: "alarm_valve", label: "Alarm Valve Test", type: "pass_fail", section: "Valve Checks", required: true },
      { id: "pressure_gauge_1", label: "Supply Pressure Gauge (bar)", type: "number", section: "Pressure Readings", required: true },
      { id: "pressure_gauge_2", label: "System Pressure Gauge (bar)", type: "number", section: "Pressure Readings", required: true },
      { id: "pump_test", label: "Pump Test Result", type: "pass_fail", section: "Pump / Flow", required: true },
      { id: "pump_pressure", label: "Pump Pressure at Test Flow (bar)", type: "number", section: "Pump / Flow", required: false },
      { id: "flow_test", label: "Flow Test Carried Out", type: "select", section: "Pump / Flow", required: true, options: ["Yes", "No"] },
      { id: "drain_test", label: "Drain Test Satisfactory", type: "select", section: "Pump / Flow", required: true, options: ["Yes", "No", "N/A"] },
      { id: "heads_visual", label: "Sprinkler Heads Visual Check", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Heads Obstructed", "Heads Corroded"] },
      { id: "pipework_condition", label: "Pipework Condition", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Corrosion Present", "Physical Damage"] },
      { id: "system_restored", label: "System Fully Restored After Test", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
    ],
  },
  {
    id: "sp-6month",
    name: "Sprinkler System — 6 Month Inspection",
    standard: "BS EN 12845:2015",
    description: "Routine 6-month inspection covering valve status, pressure gauges, and alarm test.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry", "Alternate", "Pre-Action", "Deluge"] },
      { id: "control_valve_status", label: "Control Valve — Open & Secured", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_gauges", label: "Pressure Gauges Within Range", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "alarm_test", label: "Alarm / Bell Test Satisfactory", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "water_supply", label: "Water Supply Confirmed Available", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "heads_clear", label: "Sprinkler Heads Unobstructed", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "overall_condition", label: "Overall System Condition", type: "select", section: "Result", required: true, options: ["Good", "Fair", "Poor"] },
      ...RESULT_FIELDS,
    ],
  },
  {
    id: "sp-commissioning",
    name: "Sprinkler System — Commissioning",
    standard: "BS EN 12845:2015",
    description: "Commissioning certificate for new or modified sprinkler installation.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "installer", label: "Installing Company", type: "text", section: "System Details", required: true },
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Wet", "Dry", "Pre-Action", "Deluge", "ESFR"] },
      { id: "hazard_class", label: "Hazard Classification", type: "select", section: "System Details", required: true, options: ["Light Hazard", "Ordinary Hazard Group 1", "Ordinary Hazard Group 2", "Extra Hazard Group 1", "Extra Hazard Group 2"] },
      { id: "no_of_heads", label: "Total Number of Sprinkler Heads", type: "number", section: "System Details", required: true },
      { id: "design_density", label: "Design Density (mm/min)", type: "number", section: "System Details", required: false },
      { id: "hydraulic_calc", label: "Hydraulic Calculations Approved", type: "select", section: "Design Verification", required: true, options: ["Yes", "No"] },
      { id: "third_party_cert", label: "Third Party Certification Provided", type: "select", section: "Design Verification", required: true, options: ["Yes", "No", "N/A"] },
      { id: "pump_test", label: "Pump Acceptance Test Satisfactory", type: "pass_fail", section: "Commissioning Tests", required: true },
      { id: "alarm_valve_test", label: "Alarm Valve Test Satisfactory", type: "pass_fail", section: "Commissioning Tests", required: true },
      { id: "flow_switch_test", label: "Flow Switch / Alarm Test", type: "pass_fail", section: "Commissioning Tests", required: true },
      { id: "pressure_test", label: "System Pressure Test (bar)", type: "number", section: "Commissioning Tests", required: true },
      { id: "system_flushed", label: "Pipework Flushed Before Commissioning", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This commissioning has been carried out in accordance with BS EN 12845:2015 — Fixed Firefighting Systems — Design, Installation and Maintenance of Automatic Sprinkler Systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ── Residential & Domestic Sprinklers (BS 9251:2021) ──
  {
    id: "sp-resi-annual",
    name: "Residential & Domestic Sprinkler — Annual Service",
    standard: "BS 9251:2021",
    description: "Annual service of a residential/domestic sprinkler system per BS 9251:2021 — covers categories 1, 2 and 3 dwellings.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "property_type", label: "Property Type", type: "select", section: "System Details", required: true, options: ["Single Dwelling (House/Flat)", "HMO", "Care Home / Sheltered", "Block of Flats", "Student Accommodation", "Other"] },
      { id: "system_category", label: "System Category (BS 9251)", type: "select", section: "System Details", required: true, options: ["Category 1 — Life Safety (low risk)", "Category 2 — Life Safety (HMO/care)", "Category 3 — Life & Property"] },
      { id: "water_supply", label: "Water Supply Type", type: "select", section: "System Details", required: true, options: ["Town Main (single)", "Town Main (boosted)", "Storage Tank & Pump", "Combined / Dual"] },
      { id: "stop_valve_accessible", label: "Main Stop Valve Accessible & Labelled", type: "select", section: "Valve Checks", required: true, options: ["Yes", "No"] },
      { id: "stop_valve_open", label: "Main Stop Valve Open & Secured", type: "select", section: "Valve Checks", required: true, options: ["Yes", "No"] },
      { id: "isolation_valve_status", label: "System Isolation Valve Status", type: "select", section: "Valve Checks", required: true, options: ["Open & Locked", "Open Unlocked", "Closed"] },
      { id: "static_pressure", label: "Static Inlet Pressure (bar)", type: "number", section: "Pressure & Flow", required: true },
      { id: "running_pressure", label: "Running Pressure at Test Outlet (bar)", type: "number", section: "Pressure & Flow", required: true },
      { id: "flow_rate", label: "Measured Flow Rate (L/min)", type: "number", section: "Pressure & Flow", required: true },
      { id: "test_outlet_used", label: "Flow Test Outlet Used", type: "text", section: "Pressure & Flow", required: false },
      { id: "pump_present", label: "Booster Pump Present", type: "select", section: "Pump (if fitted)", required: true, options: ["Yes", "No"] },
      { id: "pump_test", label: "Pump Test Result", type: "pass_fail", section: "Pump (if fitted)", required: false },
      { id: "tank_present", label: "Storage Tank Present", type: "select", section: "Storage Tank (if fitted)", required: true, options: ["Yes", "No"] },
      { id: "tank_volume_ok", label: "Tank Capacity Adequate & Topped Up", type: "select", section: "Storage Tank (if fitted)", required: false, options: ["Yes", "No", "N/A"] },
      { id: "heads_visual", label: "Sprinkler Heads — Visual Condition", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Painted Over", "Obstructed", "Damaged", "Corroded"] },
      { id: "heads_clearance", label: "Heads Have 500mm Clear Below", type: "select", section: "Visual Checks", required: true, options: ["Yes", "No"] },
      { id: "spare_heads_available", label: "Spare Heads & Spanner On Site", type: "select", section: "Visual Checks", required: true, options: ["Yes", "No"] },
      { id: "pipework_condition", label: "Concealed Pipework — Visible Areas Condition", type: "select", section: "Visual Checks", required: true, options: ["Satisfactory", "Leaks", "Corrosion", "Frost Risk"] },
      { id: "frost_protection", label: "Frost Protection Adequate (lofts/garages)", type: "select", section: "Visual Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "alarm_test", label: "Audible Flow Alarm Test (if fitted)", type: "select", section: "Alarms & Monitoring", required: true, options: ["Pass", "Fail", "N/A"] },
      { id: "monitoring_signal", label: "Remote Monitoring Signal Received (if fitted)", type: "select", section: "Alarms & Monitoring", required: true, options: ["Yes", "No", "N/A"] },
      { id: "occupier_log_completed", label: "Occupier/Owner Log Book Updated", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      { id: "system_restored", label: "System Fully Restored After Test", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This service has been carried out in accordance with BS 9251:2021 — Fire Sprinkler Systems for Domestic and Residential Occupancies", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "sp-resi-6month",
    name: "Residential & Domestic Sprinkler — 6 Month Inspection",
    standard: "BS 9251:2021",
    description: "Routine 6-month inspection of a residential/domestic sprinkler system per BS 9251:2021.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "property_type", label: "Property Type", type: "select", section: "System Details", required: true, options: ["Single Dwelling (House/Flat)", "HMO", "Care Home / Sheltered", "Block of Flats", "Student Accommodation", "Other"] },
      { id: "system_category", label: "System Category (BS 9251)", type: "select", section: "System Details", required: true, options: ["Category 1", "Category 2", "Category 3"] },
      { id: "stop_valve_open", label: "Main Stop Valve Open & Secured", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "pressure_gauges", label: "Pressure Gauges Within Range", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "heads_clear", label: "Sprinkler Heads Unobstructed & Undamaged", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "no_recent_painting", label: "No Heads Painted / Decorated Over", type: "select", section: "Checks", required: true, options: ["Yes", "No"] },
      { id: "frost_protection", label: "Frost Protection Adequate", type: "select", section: "Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "tank_topped_up", label: "Storage Tank Topped Up (if fitted)", type: "select", section: "Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "alarm_test", label: "Audible Flow Alarm Test (if fitted)", type: "select", section: "Checks", required: true, options: ["Pass", "Fail", "N/A"] },
      { id: "log_book_updated", label: "Occupier Log Book Updated", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      { id: "overall_condition", label: "Overall System Condition", type: "select", section: "Result", required: true, options: ["Good", "Fair", "Poor"] },
      ...RESULT_FIELDS,
    ],
  },
  {
    id: "sp-resi-commissioning",
    name: "Residential & Domestic Sprinkler — Commissioning",
    standard: "BS 9251:2021",
    description: "Commissioning certificate for a new or modified residential/domestic sprinkler installation.",
    category: "sprinkler",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "installer", label: "Installing Company", type: "text", section: "System Details", required: true },
      { id: "installer_third_party", label: "Installer Third-Party Certificated (e.g. LPS 1301 / FIRAS)", type: "select", section: "System Details", required: true, options: ["Yes", "No"] },
      { id: "property_type", label: "Property Type", type: "select", section: "System Details", required: true, options: ["Single Dwelling (House/Flat)", "HMO", "Care Home / Sheltered", "Block of Flats", "Student Accommodation", "Other"] },
      { id: "system_category", label: "System Category (BS 9251)", type: "select", section: "System Details", required: true, options: ["Category 1 — Life Safety (low risk)", "Category 2 — Life Safety (HMO/care)", "Category 3 — Life & Property"] },
      { id: "no_of_heads", label: "Total Number of Sprinkler Heads", type: "number", section: "System Details", required: true },
      { id: "head_type", label: "Head Type / K-Factor", type: "text", section: "System Details", required: false },
      { id: "design_density", label: "Design Density (mm/min)", type: "number", section: "Design Verification", required: false },
      { id: "design_flow", label: "Design Flow Rate (L/min)", type: "number", section: "Design Verification", required: true },
      { id: "design_duration", label: "Design Discharge Duration (mins)", type: "number", section: "Design Verification", required: true },
      { id: "water_supply", label: "Water Supply Type", type: "select", section: "Design Verification", required: true, options: ["Town Main (single)", "Town Main (boosted)", "Storage Tank & Pump", "Combined / Dual"] },
      { id: "hydraulic_calc", label: "Hydraulic Calculations Provided & Approved", type: "select", section: "Design Verification", required: true, options: ["Yes", "No"] },
      { id: "pressure_test", label: "System Pressure Test (bar)", type: "number", section: "Commissioning Tests", required: true },
      { id: "pressure_test_held", label: "Pressure Test Held for Required Duration", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      { id: "flow_test_pass", label: "Flow Test at Most Hydraulically Remote Head — Satisfactory", type: "pass_fail", section: "Commissioning Tests", required: true },
      { id: "alarm_valve_test", label: "Flow Alarm / Switch Test Satisfactory", type: "pass_fail", section: "Commissioning Tests", required: true },
      { id: "pump_test", label: "Pump Acceptance Test (if fitted)", type: "pass_fail", section: "Commissioning Tests", required: false },
      { id: "system_flushed", label: "Pipework Flushed Before Commissioning", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      { id: "occupier_handover", label: "Handover Pack & Log Book Issued to Occupier/Owner", type: "select", section: "Handover", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This commissioning has been carried out in accordance with BS 9251:2021 — Fire Sprinkler Systems for Domestic and Residential Occupancies", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FIRE ALARM
  // ══════════════════════════════════════════════════════════
  {
    id: "fa-periodic",
    name: "Fire Alarm — Periodic Inspection & Test",
    standard: "BS 5839-1:2017",
    description: "Periodic inspection and testing of fire detection and alarm systems per BS 5839-1:2017.",
    category: "fire_alarm",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Category", type: "select", section: "System Details", required: true, options: ["Category L1", "Category L2", "Category L3", "Category L4", "Category L5", "Category M", "Category P1", "Category P2"] },
      { id: "panel_manufacturer", label: "Control Panel Manufacturer", type: "text", section: "System Details", required: false },
      { id: "panel_model", label: "Panel Model / Serial", type: "text", section: "System Details", required: false },
      { id: "no_of_zones", label: "Number of Zones", type: "number", section: "System Details", required: true },
      { id: "no_of_detectors", label: "Number of Detectors", type: "number", section: "System Details", required: true },
      { id: "no_of_call_points", label: "Number of Manual Call Points", type: "number", section: "System Details", required: true },
      { id: "panel_fault_free", label: "Control Panel — No Faults or Disablements", type: "select", section: "Panel Checks", required: true, options: ["Yes", "No"] },
      { id: "battery_test", label: "Standby Battery Test Satisfactory", type: "select", section: "Panel Checks", required: true, options: ["Yes", "No"] },
      { id: "battery_voltage", label: "Battery Voltage (V)", type: "number", section: "Panel Checks", required: false },
      { id: "zones_tested", label: "All Zones Tested", type: "select", section: "Detector & Zone Tests", required: true, options: ["Yes", "No — partial"] },
      { id: "detector_types_tested", label: "Detector Types Tested", type: "select", section: "Detector & Zone Tests", required: true, options: ["Smoke only", "Heat only", "Both smoke & heat", "Multi-sensor", "Beam detectors included"] },
      { id: "call_points_tested", label: "Manual Call Points Tested", type: "select", section: "Detector & Zone Tests", required: true, options: ["All", "Sample", "None"] },
      { id: "sounder_test", label: "Sounders / Beacons Satisfactory", type: "select", section: "Detector & Zone Tests", required: true, options: ["Yes", "No"] },
      { id: "alarm_routing", label: "ARC / CIE Link Functional", type: "select", section: "Detector & Zone Tests", required: true, options: ["Yes", "No", "N/A"] },
      { id: "dirty_detectors", label: "Dirty / Defective Detectors Found", type: "select", section: "Detector & Zone Tests", required: true, options: ["None", "1–5", "6–10", "More than 10"] },
      { id: "log_updated", label: "System Log Book Updated", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 5839-1:2017", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "fa-weekly",
    name: "Fire Alarm — Weekly Test Record",
    standard: "BS 5839-1:2017",
    description: "Weekly call point test record as required by BS 5839-1:2017 clause 45.",
    category: "fire_alarm",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Test Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Person Carrying Out Test", type: "text", section: "Site Details", required: true },
      { id: "call_point_ref", label: "Call Point Reference Tested", type: "text", section: "Test Details", required: true },
      { id: "zone", label: "Zone", type: "text", section: "Test Details", required: true },
      { id: "alarm_activated", label: "Alarm Activated Throughout Building", type: "select", section: "Test Details", required: true, options: ["Yes", "No"] },
      { id: "panel_response", label: "Panel Indicated Correct Zone", type: "select", section: "Test Details", required: true, options: ["Yes", "No"] },
      { id: "arc_notified", label: "ARC / Monitoring Station Notified", type: "select", section: "Test Details", required: true, options: ["Yes", "No", "N/A"] },
      { id: "faults_found", label: "Any Faults Found", type: "select", section: "Test Details", required: true, options: ["No", "Yes — see comments"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This test has been carried out in accordance with BS 5839-1:2017 cl.45 — Weekly Test of Manual Call Points", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "fa-commissioning",
    name: "Fire Alarm — Commissioning Certificate",
    standard: "BS 5839-1:2017",
    description: "Commissioning record for new fire alarm installation including verification of all devices.",
    category: "fire_alarm",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "installer", label: "Installing Company", type: "text", section: "Installation Details", required: true },
      { id: "system_category", label: "System Category", type: "select", section: "Installation Details", required: true, options: ["L1", "L2", "L3", "L4", "L5", "M", "P1", "P2"] },
      { id: "panel_manufacturer", label: "Control Panel Manufacturer & Model", type: "text", section: "Installation Details", required: true },
      { id: "no_zones", label: "Number of Zones", type: "number", section: "Installation Details", required: true },
      { id: "no_detectors", label: "Total Detectors", type: "number", section: "Installation Details", required: true },
      { id: "no_call_points", label: "Total Manual Call Points", type: "number", section: "Installation Details", required: true },
      { id: "no_sounders", label: "Total Sounders / Beacons", type: "number", section: "Installation Details", required: true },
      { id: "all_devices_verified", label: "All Devices Verified on Commission", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      { id: "battery_backup", label: "Battery Backup Duration Tested (72hr standby)", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No", "N/A"] },
      { id: "arc_connected", label: "ARC / Monitoring Connected & Tested", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No", "N/A"] },
      { id: "cause_effect", label: "Cause & Effect Verified", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      { id: "log_book_issued", label: "Log Book Issued to Responsible Person", type: "select", section: "Commissioning Tests", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This commissioning has been carried out in accordance with BS 5839-1:2017", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // EMERGENCY LIGHTING
  // ══════════════════════════════════════════════════════════
  {
    id: "el-annual",
    name: "Emergency Lighting — Annual Full Duration Test",
    standard: "BS 5266-1:2016",
    description: "Annual 3-hour full duration test of emergency lighting installation per BS 5266-1:2016.",
    category: "emergency_lighting",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Maintained", "Non-maintained", "Sustained", "Combined"] },
      { id: "no_luminaires", label: "Total Number of Luminaires", type: "number", section: "System Details", required: true },
      { id: "central_battery", label: "Central Battery System", type: "select", section: "System Details", required: true, options: ["Yes", "No — self-contained units"] },
      { id: "test_duration", label: "Test Duration (hours)", type: "number", section: "Test Details", required: true },
      { id: "test_start_time", label: "Test Start Time", type: "text", section: "Test Details", required: true },
      { id: "all_luminaires_lit", label: "All Luminaires Illuminated During Test", type: "select", section: "Test Results", required: true, options: ["Yes", "No — see defects"] },
      { id: "no_failed", label: "Number of Failed / Defective Units", type: "number", section: "Test Results", required: true },
      { id: "failed_locations", label: "Failed Unit Locations", type: "textarea", section: "Test Results", required: false },
      { id: "exit_signs_illuminated", label: "All Exit / Escape Route Signs Illuminated", type: "select", section: "Test Results", required: true, options: ["Yes", "No"] },
      { id: "system_restored", label: "System Restored to Normal Mode After Test", type: "select", section: "Test Results", required: true, options: ["Yes", "No"] },
      { id: "log_updated", label: "Log Book / Certificate Updated", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This test has been carried out in accordance with BS 5266-1:2016", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "el-monthly",
    name: "Emergency Lighting — Monthly Flick Test",
    standard: "BS 5266-1:2016",
    description: "Monthly brief flick test to confirm emergency luminaires energise correctly.",
    category: "emergency_lighting",
    fields: [
      { id: "site_name", label: "Site Name", type: "text", section: "Site Details", required: true },
      { id: "date", label: "Test Date", type: "date", section: "Site Details", required: true },
      { id: "engineer", label: "Person Carrying Out Test", type: "text", section: "Site Details", required: true },
      { id: "no_luminaires", label: "Total Luminaires", type: "number", section: "Test Details", required: true },
      { id: "all_energised", label: "All Units Energised on Test", type: "select", section: "Test Details", required: true, options: ["Yes", "No — failures found"] },
      { id: "no_failed", label: "Number of Failures", type: "number", section: "Test Details", required: false },
      { id: "failed_locations", label: "Failure Locations (if any)", type: "textarea", section: "Test Details", required: false },
      ...RESULT_FIELDS,
    ],
  },

  // ══════════════════════════════════════════════════════════
  // AOV / SMOKE CONTROL
  // ══════════════════════════════════════════════════════════
  {
    id: "aov-annual",
    name: "AOV / Smoke Control — Annual Service",
    standard: "BS 7346-8:2013",
    description: "Annual service and functional test of automatic opening vent and smoke control systems per BS 7346-8.",
    category: "aov_smoke_control",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["Natural AOV", "Mechanical Extract", "Combined", "Pressure Differential"] },
      { id: "control_panel_make", label: "Control Panel Make / Model", type: "text", section: "System Details", required: false },
      { id: "no_of_vents", label: "Number of Vents / Dampers", type: "number", section: "System Details", required: true },
      { id: "panel_faults", label: "Control Panel — No Faults", type: "select", section: "Panel & Control Checks", required: true, options: ["Yes", "No"] },
      { id: "battery_ok", label: "Backup Battery / Power Supply OK", type: "select", section: "Panel & Control Checks", required: true, options: ["Yes", "No"] },
      { id: "manual_override", label: "Manual Override / Trigger Functional", type: "select", section: "Panel & Control Checks", required: true, options: ["Yes", "No"] },
      { id: "auto_trigger", label: "Automatic Trigger (detector / alarm input) Tested", type: "select", section: "Panel & Control Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "vents_open_correctly", label: "All Vents / Dampers Open Correctly", type: "select", section: "Vent / Damper Checks", required: true, options: ["Yes", "No"] },
      { id: "vents_close_correctly", label: "All Vents / Dampers Reset & Close Correctly", type: "select", section: "Vent / Damper Checks", required: true, options: ["Yes", "No"] },
      { id: "actuators_ok", label: "Actuators / Motors Condition", type: "select", section: "Vent / Damper Checks", required: true, options: ["Satisfactory", "Worn", "Failed"] },
      { id: "ductwork_clear", label: "Ductwork / Shafts Clear of Obstruction", type: "select", section: "Vent / Damper Checks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "system_reset", label: "System Reset to Normal After Test", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This service has been carried out in accordance with BS 7346-8:2013", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // PASSIVE FIRE PROTECTION
  // ══════════════════════════════════════════════════════════
  {
    id: "pfp-inspection",
    name: "Passive Fire Protection — Inspection",
    standard: "BS 9999:2017 / ASFP",
    description: "Inspection of passive fire protection measures including fire doors, compartmentation, and intumescent seals.",
    category: "passive_fire",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "area_inspected", label: "Area / Floor Inspected", type: "text", section: "Scope", required: true },
      { id: "no_fire_doors", label: "Number of Fire Doors Inspected", type: "number", section: "Scope", required: true },
      { id: "no_service_penetrations", label: "Number of Service Penetrations Inspected", type: "number", section: "Scope", required: true },
      { id: "door_closers_ok", label: "Door Closers Functioning on All Doors", type: "select", section: "Fire Doors", required: true, options: ["Yes", "No — failures", "N/A"] },
      { id: "door_seals_ok", label: "Intumescent Seals & Smoke Seals Intact", type: "select", section: "Fire Doors", required: true, options: ["Yes", "No — defects found"] },
      { id: "door_gaps_ok", label: "Gaps Within Tolerance (max 3mm sides/top, 8mm base)", type: "select", section: "Fire Doors", required: true, options: ["Yes", "No — excessive gaps"] },
      { id: "door_certification", label: "Door Certification / Labelling Present", type: "select", section: "Fire Doors", required: true, options: ["Yes", "No", "Partial"] },
      { id: "no_doors_failed", label: "Number of Doors with Defects", type: "number", section: "Fire Doors", required: false },
      { id: "service_seals_ok", label: "Service Penetration Seals Intact & Correctly Applied", type: "select", section: "Compartmentation", required: true, options: ["Yes", "No — defects found"] },
      { id: "bulkheads_ok", label: "Fire Walls / Bulkheads Unbreached", type: "select", section: "Compartmentation", required: true, options: ["Yes", "No — breaches found"] },
      { id: "cavity_barriers", label: "Cavity Barriers in Place (where required)", type: "select", section: "Compartmentation", required: true, options: ["Yes", "No", "N/A"] },
      { id: "defect_schedule", label: "Defect Schedule / Remediation Required", type: "textarea", section: "Result", required: false },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 9999:2017 — Fire Safety in the Design, Management and Use of Buildings", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  {
    id: "pfp-fire-door-survey",
    name: "Fire Door Survey",
    standard: "BS 8214:2016 / BS EN 1634-1",
    description: "Individual fire door survey and assessment in accordance with BS 8214:2016 and BS EN 1634-1.",
    category: "passive_fire",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "door_ref", label: "Door Reference / Number", type: "text", section: "Door Details", required: true },
      { id: "door_location", label: "Door Location", type: "text", section: "Door Details", required: true },
      { id: "fire_rating", label: "Required Fire Rating", type: "select", section: "Door Details", required: true, options: ["FD30", "FD30S", "FD60", "FD60S", "FD90", "FD120", "Unknown"] },
      { id: "door_type", label: "Door Type", type: "select", section: "Door Details", required: true, options: ["Single leaf", "Double leaf", "Sliding", "Roller shutter"] },
      { id: "label_present", label: "Certification Label / Third-Party Mark Present", type: "select", section: "Assessment", required: true, options: ["Yes", "No"] },
      { id: "frame_condition", label: "Frame Condition", type: "select", section: "Assessment", required: true, options: ["Satisfactory", "Minor defects", "Major defects"] },
      { id: "leaf_condition", label: "Leaf / Panel Condition", type: "select", section: "Assessment", required: true, options: ["Satisfactory", "Minor defects", "Major defects"] },
      { id: "intumescent_seal", label: "Intumescent Seal Present & Continuous", type: "select", section: "Assessment", required: true, options: ["Yes", "No", "Partial"] },
      { id: "smoke_seal", label: "Smoke Seal Present (FD_S rating)", type: "select", section: "Assessment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "closer_present", label: "Self-Closing Device Fitted", type: "select", section: "Assessment", required: true, options: ["Yes", "No"] },
      { id: "closer_functional", label: "Self-Closer Functional (door closes & latches)", type: "select", section: "Assessment", required: true, options: ["Yes", "No"] },
      { id: "gap_top", label: "Gap — Top (mm)", type: "number", section: "Gap Measurements", required: false },
      { id: "gap_hinge", label: "Gap — Hinge Side (mm)", type: "number", section: "Gap Measurements", required: false },
      { id: "gap_latch", label: "Gap — Latch Side (mm)", type: "number", section: "Gap Measurements", required: false },
      { id: "gap_threshold", label: "Gap — Threshold (mm)", type: "number", section: "Gap Measurements", required: false },
      { id: "hold_open_device", label: "Hold-Open Device Fitted (if applicable)", type: "select", section: "Hardware", required: true, options: ["No", "Yes — acoustic", "Yes — electromagnetic", "Yes — manual"] },
      { id: "hinges_ok", label: "Hinges — Minimum 3, Correctly Fitted", type: "select", section: "Hardware", required: true, options: ["Yes", "No"] },
      { id: "action_required", label: "Action Required", type: "select", section: "Result", required: true, options: ["None", "Maintenance", "Replace components", "Replace door"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This survey has been carried out in accordance with BS 8214:2016 — Timber-Based Fire Door Assemblies and BS EN 1634-1 — Fire Resistance and Smoke Control Tests", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // GAS SUPPRESSION
  // ══════════════════════════════════════════════════════════
  {
    id: "gas-annual",
    name: "Gas Suppression System — Annual Service",
    standard: "ISO 14520 / BS EN 15004",
    description: "Annual service of gaseous fire suppression systems (CO2, FM-200, Novec, Inergen, Argonite) per ISO 14520.",
    category: "gas_suppression",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "agent_type", label: "Suppression Agent", type: "select", section: "System Details", required: true, options: ["CO2", "FM-200 (HFC-227ea)", "Novec 1230 (FK-5-1-12)", "Inergen (IG-541)", "Argonite (IG-55)", "Other inert gas"] },
      { id: "protected_area", label: "Protected Area / Room", type: "text", section: "System Details", required: true },
      { id: "no_of_cylinders", label: "Number of Cylinders", type: "number", section: "System Details", required: true },
      { id: "cylinder_weights", label: "All Cylinder Weights / Pressures Within Tolerance (±5%)", type: "select", section: "Cylinder Checks", required: true, options: ["Yes", "No — low agent found"] },
      { id: "cylinder_condition", label: "Cylinder Condition — No Corrosion / Physical Damage", type: "select", section: "Cylinder Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "valve_condition", label: "Cylinder Valves & Actuators Condition", type: "select", section: "Cylinder Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "discharge_nozzles", label: "Discharge Nozzles Unobstructed", type: "select", section: "Distribution", required: true, options: ["Yes", "No"] },
      { id: "pipe_condition", label: "Pipework Condition — No Damage or Corrosion", type: "select", section: "Distribution", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "control_panel_faults", label: "Control Panel — No Faults", type: "select", section: "Control & Detection", required: true, options: ["Yes", "No"] },
      { id: "detectors_tested", label: "Detectors Tested Satisfactory", type: "select", section: "Control & Detection", required: true, options: ["Yes", "No"] },
      { id: "abort_override", label: "Abort / Manual Override Functional", type: "select", section: "Control & Detection", required: true, options: ["Yes", "No"] },
      { id: "room_integrity", label: "Room Integrity — Door / Damper Seals OK", type: "select", section: "Control & Detection", required: true, options: ["Satisfactory", "Compromised"] },
      { id: "pre_discharge_alarm", label: "Pre-Discharge Warning Devices Tested", type: "select", section: "Control & Detection", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "iso_declaration", label: "This service has been carried out in accordance with ISO 14520 / BS EN 15004", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // KITCHEN SUPPRESSION
  // ══════════════════════════════════════════════════════════
  {
    id: "kitchen-annual",
    name: "Kitchen Suppression — Annual Service",
    standard: "BS EN 15493:2009",
    description: "Annual service of commercial kitchen fire suppression system (wet chemical / CO2) per BS EN 15493:2009.",
    category: "kitchen_suppression",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_make", label: "System Make / Model", type: "text", section: "System Details", required: true },
      { id: "agent_type", label: "Suppression Agent", type: "select", section: "System Details", required: true, options: ["Wet Chemical (Class F)", "CO2", "Dry Chemical", "Water Mist"] },
      { id: "protected_appliances", label: "Protected Cooking Appliances", type: "textarea", section: "System Details", required: true },
      { id: "cylinder_weight", label: "Cylinder Weight / Charge Within Tolerance", type: "select", section: "Cylinder & Agent", required: true, options: ["Yes", "No"] },
      { id: "cylinder_condition", label: "Cylinder Condition", type: "select", section: "Cylinder & Agent", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "fusible_links", label: "Fusible Links Replaced / Within Date", type: "select", section: "Detection", required: true, options: ["Yes", "No", "N/A"] },
      { id: "detectors_ok", label: "Automatic Detectors Tested (if fitted)", type: "select", section: "Detection", required: true, options: ["Yes", "No", "N/A"] },
      { id: "manual_pull", label: "Manual Pull Station / Remote Actuator Tested", type: "select", section: "Detection", required: true, options: ["Yes", "No"] },
      { id: "nozzles_ok", label: "All Nozzles Unobstructed & Correct Position", type: "select", section: "Distribution", required: true, options: ["Yes", "No"] },
      { id: "nozzle_caps", label: "Nozzle Caps / Blow-Off Caps in Place", type: "select", section: "Distribution", required: true, options: ["Yes", "No"] },
      { id: "gas_isolation", label: "Fuel Gas Isolation Device Functional", type: "select", section: "Interlocks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "ventilation_interlock", label: "Ventilation Interlock Functional", type: "select", section: "Interlocks", required: true, options: ["Yes", "No", "N/A"] },
      { id: "ansul_tag", label: "New Service Tag Fitted", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This service has been carried out in accordance with BS EN 15493:2009 — Kitchen Fire Suppression Systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FIRE RISK ASSESSMENT
  // ══════════════════════════════════════════════════════════
  {
    id: "pas79-fra",
    name: "Fire Risk Assessment — PAS 79 Compliant",
    standard: "PAS 79:2020",
    description: "Full fire risk assessment structured to comply with PAS 79:2020, the UK code of practice.",
    category: "fire_risk_assessment",
    fields: [
      { id: "premises_name", label: "Premises Name", type: "text", section: "Premises Details", required: true },
      { id: "premises_address", label: "Premises Address", type: "textarea", section: "Premises Details", required: true },
      { id: "premises_type", label: "Premises Type", type: "select", section: "Premises Details", required: true, options: ["Office", "Retail", "Industrial / Warehouse", "Healthcare", "Educational", "Residential — HMO", "Residential — Purpose Built", "Hospitality", "Licensed Premises", "Other"] },
      { id: "floors", label: "Number of Storeys", type: "number", section: "Premises Details", required: true },
      { id: "approx_floor_area", label: "Approximate Floor Area (m²)", type: "number", section: "Premises Details", required: false },
      { id: "occupants_max", label: "Maximum Occupancy", type: "number", section: "Premises Details", required: true },
      { id: "sleeping_risk", label: "Sleeping Risk Present", type: "select", section: "Premises Details", required: true, options: ["Yes", "No"] },
      { id: "responsible_person", label: "Responsible Person (Name & Role)", type: "text", section: "Responsible Person", required: true },
      { id: "assessor_name", label: "Assessor Name", type: "text", section: "Assessment Details", required: true },
      { id: "assessor_company", label: "Assessor Company", type: "text", section: "Assessment Details", required: true },
      { id: "assessment_date", label: "Date of Assessment", type: "date", section: "Assessment Details", required: true },
      { id: "next_review_date", label: "Next Review Date", type: "date", section: "Assessment Details", required: true },
      { id: "ignition_sources", label: "Ignition Sources Identified", type: "textarea", section: "Fire Hazards", required: true },
      { id: "fuel_sources", label: "Fuel Sources Identified", type: "textarea", section: "Fire Hazards", required: true },
      { id: "escape_routes_adequate", label: "Escape Routes Adequate & Unobstructed", type: "select", section: "Means of Escape", required: true, options: ["Yes", "No", "Improvement Required"] },
      { id: "emergency_lighting", label: "Emergency Lighting Installed & Tested", type: "select", section: "Means of Escape", required: true, options: ["Yes", "No", "N/A"] },
      { id: "exit_signage", label: "Fire Exit Signage Correct & Visible", type: "select", section: "Means of Escape", required: true, options: ["Yes", "No", "Partially"] },
      { id: "assembly_point", label: "Assembly Point Designated & Signed", type: "select", section: "Means of Escape", required: true, options: ["Yes", "No"] },
      { id: "detection_system", label: "Fire Detection System Type", type: "select", section: "Fire Detection & Warning", required: true, options: ["Automatic — L1", "Automatic — L2", "Automatic — M", "Automatic — P1", "Automatic — P2", "Manual only", "None"] },
      { id: "detection_maintained", label: "Detection System Maintained (BS 5839-1)", type: "select", section: "Fire Detection & Warning", required: true, options: ["Yes", "No", "N/A"] },
      { id: "alarm_audible", label: "Alarm Audible Throughout Premises", type: "select", section: "Fire Detection & Warning", required: true, options: ["Yes", "No"] },
      { id: "extinguishers_present", label: "Portable Fire Extinguishers Present", type: "select", section: "Fire Fighting Equipment", required: true, options: ["Yes", "No"] },
      { id: "extinguishers_maintained", label: "Extinguishers Maintained (BS 5306-3)", type: "select", section: "Fire Fighting Equipment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "hose_reels", label: "Hose Reels / Risers Present", type: "select", section: "Fire Fighting Equipment", required: false, options: ["Yes", "No", "N/A"] },
      { id: "fire_policy_in_place", label: "Written Fire Safety Policy in Place", type: "select", section: "Fire Safety Management", required: true, options: ["Yes", "No"] },
      { id: "fire_drill_date", label: "Date of Last Fire Drill", type: "text", section: "Fire Safety Management", required: false },
      { id: "staff_training", label: "Staff Fire Safety Training Up to Date", type: "select", section: "Fire Safety Management", required: true, options: ["Yes", "No", "Partially"] },
      { id: "fire_log_maintained", label: "Fire Safety Log Book Maintained", type: "select", section: "Fire Safety Management", required: true, options: ["Yes", "No"] },
      { id: "overall_risk_rating", label: "Overall Risk Rating", type: "select", section: "Risk Rating & Outcome", required: true, options: ["Trivial", "Tolerable", "Moderate", "Substantial", "Intolerable"] },
      { id: "action_plan_required", label: "Action Plan Required", type: "select", section: "Risk Rating & Outcome", required: true, options: ["Yes — Immediate", "Yes — Within 1 month", "Yes — Within 3 months", "No"] },
      { id: "action_plan_details", label: "Action Plan / Recommendations", type: "textarea", section: "Risk Rating & Outcome", required: false },
      { id: "pas79_declaration", label: "This assessment has been carried out in accordance with PAS 79:2020", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // FIRE SUPPRESSION — WATER MIST
  // ══════════════════════════════════════════════════════════
  {
    id: "wm-annual",
    name: "Water Mist System — Annual Service",
    standard: "BS 8489:2016",
    description: "Annual service and test of water mist fire suppression systems per BS 8489:2016.",
    category: "water_mist",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "system_type", label: "System Type", type: "select", section: "System Details", required: true, options: ["High pressure", "Intermediate pressure", "Low pressure"] },
      { id: "protected_area", label: "Protected Area", type: "text", section: "System Details", required: true },
      { id: "no_nozzles", label: "Total Number of Nozzles", type: "number", section: "System Details", required: true },
      { id: "water_supply_ok", label: "Water Supply Adequate & Operational", type: "select", section: "Water Supply", required: true, options: ["Yes", "No"] },
      { id: "tank_level", label: "Storage Tank Level Satisfactory", type: "select", section: "Water Supply", required: true, options: ["Yes", "No", "N/A"] },
      { id: "pump_test", label: "Pump Test Satisfactory", type: "pass_fail", section: "Pump Checks", required: true },
      { id: "system_pressure", label: "System Operating Pressure (bar)", type: "number", section: "Pump Checks", required: true },
      { id: "nozzles_clear", label: "All Nozzles Unobstructed", type: "select", section: "Nozzle Checks", required: true, options: ["Yes", "No"] },
      { id: "nozzle_condition", label: "Nozzle Condition", type: "select", section: "Nozzle Checks", required: true, options: ["Satisfactory", "Corroded / damaged"] },
      { id: "control_panel_ok", label: "Control Panel — No Faults", type: "select", section: "Control", required: true, options: ["Yes", "No"] },
      { id: "system_restored", label: "System Fully Restored After Test", type: "select", section: "Result", required: true, options: ["Yes", "No"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This service has been carried out in accordance with BS 8489:2016 — Fixed Fire Protection Systems — Water Mist Systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════
  // HOSE REEL
  // ══════════════════════════════════════════════════════════
  {
    id: "hr-annual",
    name: "Hose Reel — Annual Inspection & Test",
    standard: "BS 5306-1:2006 / BS EN 671-1:2012",
    description: "Annual inspection and flow test of fixed hose reel installations per BS 5306-1:2006 and BS EN 671-1:2012.",
    category: "hose_reel",
    fields: [
      ...SITE_DETAIL_FIELDS,
      { id: "no_of_reels", label: "Number of Hose Reels Inspected", type: "number", section: "System Details", required: true },
      { id: "reel_location", label: "Reel Location(s)", type: "text", section: "System Details", required: true },
      { id: "hose_condition", label: "Hose Condition — No Perishing / Damage", type: "select", section: "Inspection Checks", required: true, options: ["Satisfactory", "Unsatisfactory"] },
      { id: "reel_swings_freely", label: "Reel Swings Freely Through 180°", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "nozzle_ok", label: "Nozzle — Jet / Spray / Off Positions Functional", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "shutoff_valve", label: "Stop Valve Open & Operational", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "flow_test", label: "Flow Test Carried Out", type: "select", section: "Flow Test", required: true, options: ["Yes", "No"] },
      { id: "flow_result", label: "Flow Test Result", type: "pass_fail", section: "Flow Test", required: true },
      { id: "signage_ok", label: "Signage Present & Correct", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No"] },
      { id: "cabinet_ok", label: "Cabinet / Recess in Good Condition", type: "select", section: "Inspection Checks", required: true, options: ["Yes", "No", "N/A"] },
      ...RESULT_FIELDS,
      { id: "bs_declaration", label: "This inspection has been carried out in accordance with BS 5306-1:2006 / BS EN 671-1:2012 — Fixed Firefighting Systems — Hose Systems", type: "checkbox", section: "Declaration", required: true },
    ],
  },
  // ══════════════════════════════════════════════════════════
  // INSTALLATION RAMS
  // ══════════════════════════════════════════════════════════
  {
    id: "inst-rams",
    name: "Dry Riser Installation — RAMS",
    standard: "BS 9990:2015",
    description: "Risk Assessment and Method Statement for dry riser system installation, covering working at height, silica dust/HAVS, and a 24-step task sequence in accordance with BS 9990:2015.",
    category: "installation",
    job_category: "dry_riser_installation",
    fields: [
      { id: "project_name", label: "Project / Contract Name", type: "text", section: "Project Details", required: true },
      { id: "site_address", label: "Site Address", type: "textarea", section: "Project Details", required: true },
      { id: "client_name", label: "Client Name", type: "text", section: "Project Details", required: true },
      { id: "contract_manager", label: "Contract Manager", type: "text", section: "Project Details", required: true },
      { id: "start_date", label: "Planned Start Date", type: "date", section: "Project Details", required: true },
      { id: "no_of_systems", label: "Number of Dry Riser Systems", type: "number", section: "Scope of Works", required: true },
      { id: "no_of_floors", label: "Number of Floors", type: "number", section: "Scope of Works", required: false },
      { id: "description_of_work", label: "Description of Work", type: "textarea", section: "Scope of Works", required: true },
      { id: "method_statement", label: "Method Statement", type: "textarea", section: "Method Statement", required: true },
      { id: "working_at_height", label: "Working at Height Risk — Controlled", type: "select", section: "Risk Assessment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "silica_dust", label: "Silica Dust / HAVS Risk — Controlled", type: "select", section: "Risk Assessment", required: true, options: ["Yes", "No", "N/A"] },
      { id: "ppe_required", label: "PPE Required", type: "textarea", section: "Risk Assessment", required: true },
      { id: "emergency_plan", label: "Emergency & Evacuation Plan in Place", type: "select", section: "Risk Assessment", required: true, options: ["Yes", "No"] },
      { id: "author_name", label: "Method Statement Written By", type: "text", section: "Authorisation", required: true },
      { id: "review_date", label: "Review Date", type: "date", section: "Authorisation", required: false },
      { id: "bs_declaration", label: "This RAMS has been prepared in accordance with BS 9990:2015", type: "checkbox", section: "Declaration", required: true },
    ],
  },
];

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  dry_riser:           { label: "Dry Riser",                    icon: Droplets,     color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  dry_riser_remedial:  { label: "Dry Riser Remedial",           icon: Wrench,       color: "bg-blue-600/10 text-blue-800 border-blue-300" },
  wet_riser:           { label: "Wet Riser",                    icon: Droplets,     color: "bg-cyan-500/10 text-cyan-700 border-cyan-200" },
  fire_extinguisher:   { label: "Fire Extinguisher",            icon: Flame,        color: "bg-destructive/10 text-destructive border-destructive/20" },
  fire_hydrant:        { label: "Fire Hydrant",                 icon: Wrench,       color: "bg-secondary text-secondary-foreground border-border" },
  sprinkler:           { label: "Sprinkler",                    icon: Droplets,     color: "bg-primary/10 text-primary border-primary/20" },
  fire_alarm:          { label: "Fire Alarm",                   icon: Zap,          color: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  emergency_lighting:  { label: "Emergency Lighting",           icon: Eye,          color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  aov_smoke_control:   { label: "AOV / Smoke Control",         icon: Wind,         color: "bg-teal-500/10 text-teal-700 border-teal-200" },
  passive_fire:        { label: "Passive Fire",                 icon: Shield,       color: "bg-orange-500/10 text-orange-700 border-orange-200" },
  gas_suppression:     { label: "Gas Suppression",              icon: AlertTriangle, color: "bg-purple-500/10 text-purple-700 border-purple-200" },
  kitchen_suppression: { label: "Kitchen Suppression",          icon: Flame,        color: "bg-red-500/10 text-red-700 border-red-200" },
  water_mist:          { label: "Water Mist",                   icon: Droplets,     color: "bg-sky-500/10 text-sky-700 border-sky-200" },
  hose_reel:           { label: "Hose Reel",                    icon: Wrench,       color: "bg-slate-500/10 text-slate-700 border-slate-200" },
  fire_risk_assessment:{ label: "Fire Risk Assessment",         icon: Shield,       color: "bg-rose-500/10 text-rose-700 border-rose-200" },
  installation:        { label: "Installation",                 icon: FileText,     color: "bg-indigo-500/10 text-indigo-700 border-indigo-200" },
};

const CATEGORY_ORDER = [
  "dry_riser", "dry_riser_remedial", "wet_riser", "fire_extinguisher", "fire_hydrant",
  "sprinkler", "fire_alarm", "emergency_lighting", "aov_smoke_control",
  "passive_fire", "gas_suppression", "kitchen_suppression", "water_mist",
  "hose_reel", "fire_risk_assessment", "installation",
];



export default function IndustryTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  // Maps industry template id → db record id (after import)
  const [importedDbIds, setImportedDbIds] = useState<Record<string, string>>({});
  const [editingTemplate, setEditingTemplate] = useState<{
    id: string; name: string; description: string | null;
    fields: FieldDef[]; category?: string | null;
    job_category?: string | null; branding?: Record<string, any>;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);

  /** Build a .docx for every visible template and download as a single .zip. */
  const handleExportAllToWord = async () => {
    if (!filtered.length) return;
    setBulkExporting(true);
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      for (const tpl of filtered) {
        const doc = await buildBlankTemplateDoc({
          name: tpl.name,
          description: tpl.description,
          standard: tpl.standard,
          fields: tpl.fields as any,
        });
        const blob = await Packer.toBlob(doc);
        let base = `${blankTemplateFileSlug(tpl.name)}-blank`;
        const count = usedNames.get(base) || 0;
        usedNames.set(base, count + 1);
        const fileName = count === 0 ? `${base}.docx` : `${base}-${count + 1}.docx`;
        // Group inside zip by category folder for tidiness
        const folder = (CATEGORY_META[tpl.category]?.label || "Other").replace(/[^a-z0-9]+/gi, "-");
        zip.file(`${folder}/${fileName}`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `industry-templates-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({
        title: "Bulk Word export complete",
        description: `${filtered.length} template${filtered.length === 1 ? "" : "s"} packaged as .docx`,
      });
    } catch (err: any) {
      toast({
        title: "Bulk export failed",
        description: err?.message || "Unable to generate Word archive",
        variant: "destructive",
      });
    } finally {
      setBulkExporting(false);
    }
  };

  // Map template category → RAMS type
  const CATEGORY_TO_RAMS_TYPE: Record<string, RamsType> = {
    dry_riser: "dry_riser",
    dry_riser_remedial: "dry_riser_remedial",
    wet_riser: "wet_riser",
    fire_extinguisher: "fire_extinguisher",
    fire_hydrant: "fire_hydrant",
    sprinkler: "sprinkler",
    fire_alarm: "fire_alarm",
    emergency_lighting: "emergency_lighting",
    aov_smoke_control: "aov_smoke_control",
    passive_fire: "passive_fire",
    gas_suppression: "gas_suppression",
    kitchen_suppression: "kitchen_suppression",
    water_mist: "water_mist",
    hose_reel: "hose_reel",
    fire_risk_assessment: "fire_risk_assessment",
    installation: "installation",
  };

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

  /** Import a template and return its DB id */
  const importTemplate = async (tpl: IndustryTemplate): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase.from("job_sheet_templates").insert({
      name: tpl.name,
      description: `${tpl.standard} — ${tpl.description}`,
      fields: tpl.fields as any,
      job_category: tpl.job_category ?? tpl.category,
      created_by: user.id,
      locked: false,
    } as any).select("id").single();
    if (error) throw error;
    return (data as any)?.id ?? null;
  };

  const handleImport = async (tpl: IndustryTemplate) => {
    if (!user) return;
    setImporting(tpl.id);
    try {
      const dbId = await importTemplate(tpl);
      if (dbId) {
        setImported((prev) => new Set(prev).add(tpl.id));
        setImportedDbIds((prev) => ({ ...prev, [tpl.id]: dbId }));
      }
      toast({ title: "Template imported", description: `"${tpl.name}" added to your Job Sheet Templates.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(null);
    }
  };

  const handleEdit = async (tpl: IndustryTemplate) => {
    if (!user) return;
    setImporting(tpl.id); // reuse spinner
    try {
      let dbId = importedDbIds[tpl.id];
      // If not yet imported this session, check DB or import now
      if (!dbId) {
        const { data: existing } = await supabase
          .from("job_sheet_templates")
          .select("id, name, description, fields, category, job_category, branding")
          .eq("name", tpl.name)
          .maybeSingle();
        if (existing) {
          dbId = existing.id;
          setImported((prev) => new Set(prev).add(tpl.id));
          setImportedDbIds((prev) => ({ ...prev, [tpl.id]: dbId }));
          setEditingTemplate({
            id: dbId,
            name: existing.name,
            description: existing.description,
            fields: (typeof existing.fields === "string" ? JSON.parse(existing.fields) : existing.fields) as FieldDef[],
            category: existing.category,
            job_category: existing.job_category,
            branding: (existing.branding as Record<string, any>) || {},
          });
          setEditOpen(true);
          return;
        }
        // Not in DB yet — import first
        dbId = await importTemplate(tpl) ?? "";
        if (dbId) {
          setImported((prev) => new Set(prev).add(tpl.id));
          setImportedDbIds((prev) => ({ ...prev, [tpl.id]: dbId }));
          toast({ title: "Template imported", description: `"${tpl.name}" saved. You can now edit it.` });
        }
      }
      if (!dbId) throw new Error("Could not obtain template record.");
      setEditingTemplate({
        id: dbId,
        name: tpl.name,
        description: `${tpl.standard} — ${tpl.description}`,
        fields: tpl.fields,
        category: tpl.category,
        job_category: tpl.job_category ?? tpl.category,
        branding: {},
      });
      setEditOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Industry Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-loaded industry-standard inspection &amp; service forms. Download as a blank PDF or import as an editable job sheet template.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportAllToWord}
          disabled={bulkExporting || filtered.length === 0}
          className="gap-1.5 shrink-0"
          title="Download every visible template as .docx in a single zip"
        >
          {bulkExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          {bulkExporting ? "Packaging…" : `Export all to Word (${filtered.length})`}
        </Button>
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
          <p className="text-sm font-medium">No templates match your search.</p>
          <p className="text-xs mt-1 opacity-70">Try a different keyword or clear the category filter.</p>
          <button
            onClick={() => { setSearch(""); setActiveCategory("all"); }}
            className="mt-4 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
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
                          <span title={tpl.standard} className="text-[10px] shrink-0 font-semibold border rounded px-1.5 py-0.5 bg-secondary text-muted-foreground border-border truncate max-w-[110px] cursor-default">{tpl.standard.split(" — ")[0]}</span>
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
                        {/* Blank PDF download + print */}
                        <BlankTemplatePdfExport template={mockTemplate} jobInfo={null} showPrint />
                        {/* Blank Word (.docx) download */}
                        <BlankTemplateWordExport template={mockTemplate} />
                        <span className="text-xs text-muted-foreground">Blank</span>

                        {/* Create RAMS */}
                        {CATEGORY_TO_RAMS_TYPE[tpl.category] && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => navigate(`/rams/new?type=${CATEGORY_TO_RAMS_TYPE[tpl.category]}`)}
                          >
                            <FileText className="h-3.5 w-3.5" /> RAMS
                          </Button>
                        )}

                        {/* Edit template */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          disabled={isImporting}
                          onClick={() => handleEdit(tpl)}
                          title="Edit & save this template"
                        >
                          {isImporting ? (
                            <span className="h-3.5 w-3.5 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />
                          ) : (
                            <Pencil className="h-3.5 w-3.5" />
                          )}
                          Edit
                        </Button>

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

      {/* Edit dialog — opened after import */}
      <EditTemplateDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        template={editingTemplate}
        onSaved={() => {
          toast({ title: "Template saved" });
          setEditOpen(false);
        }}
      />
    </div>
  );
}
