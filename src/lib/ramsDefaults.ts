/**
 * Default RAMS content per service type.
 * Covers all UK fire protection categories with relevant British Standards.
 */

export type RamsType =
  | "dry_riser"
  | "dry_riser_remedial"
  | "wet_riser"
  | "sprinkler"
  | "fire_extinguisher"
  | "fire_hydrant"
  | "fire_alarm"
  | "emergency_lighting"
  | "aov_smoke_control"
  | "passive_fire"
  | "gas_suppression"
  | "kitchen_suppression"
  | "water_mist"
  | "hose_reel"
  | "fire_risk_assessment"
  | "installation";

export interface RamsDefaults {
  descriptionOfWork: string;
  sequenceOfOps: string[];
  taskSpecificOps: string[];
  location: string;
  resources: string;
  personnel: string;
  plantAndEquipment: string[];
  significantRisks: string[];
  specialTraining: string;
  ppeItems: string[];
  riskRows: string[][];
}

const COMMON_SEQUENCE = [
  "All working personnel must have received site induction from Principal Contractor and a RAMS briefing from the site supervisor before works commence.",
  "Personnel will sign in via main security and into the Daily Sign-In register.",
  "All working personnel must demonstrate they have the correct certification before works commence.",
  "All deliveries of materials must be pre-booked with Principal Contractor with 48 hours' notice.",
];

const COMMON_PLANT = [
  "Hand tools and pipe wrenches",
  "Pressure test gauge (calibrated)",
  "Multimeter / continuity tester",
  "PPE kit (hard hat, high-vis vest, steel toe cap boots, gloves, safety glasses)",
];

const COMMON_PPE = [
  "Hard Hat EN397", "High Visibility Vest EN471",
  "Steel Toe Cap/Mid Sole Boots EN20345", "Gloves CE4131",
  "Glasses EN166", "Goggles EN166",
];

const COMMON_RISK_ROWS: string[][] = [
  ["All tasks","Slips, trips and falls","Musculoskeletal injury, head injury, fractures.","4","5","20","Mop up water spills immediately. Use wet floor signs. Wear slip-resistant footwear. Good housekeeping throughout.","2","3","6",""],
  ["All tasks","Manual handling","Musculoskeletal disorders and other injuries.","1","2","2","All operatives must have manual handling training. Never lift beyond personal capability. Mechanical aids where required.","1","2","2",""],
  ["All tasks","Lone working","Inadequate first aid. No assistance in emergency.","2","4","8","Lone working not permitted without prior risk assessment. Regular check-in schedule. Emergency contact to be notified.","2","2","4",""],
];

const DEFAULTS: Record<RamsType, RamsDefaults> = {
  dry_riser: {
    descriptionOfWork:
      "Inspection, testing and annual servicing of dry riser systems in accordance with BS 9990:2015 — Code of Practice for the Use of Dry Riser Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Obtain a permit to work / hot work permit where required from the Principal Contractor.",
    ],
    taskSpecificOps: [
      "Notify building management before commencing any testing activity.",
      "Isolate the dry riser system at the breeching inlet.",
      "Conduct a visual inspection of all inlet/outlet valves, pipework, and cabinet condition.",
      "Carry out pressure test at 10 bar for 15 minutes using calibrated gauge.",
      "Check and lubricate all inlet and outlet valves.",
      "Inspect landing valves, outlet cap, and chains.",
      "Drain system completely after testing.",
      "Restore system to service and issue written service report.",
      "Leave work area clean and tidy.",
    ],
    location: "Riser cupboards, stairwells, landing areas throughout the building.",
    resources: "Minimum of: 2 Operatives.",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pressure test pump (manual or motorised)",
      "Dry riser test kit (hoses, adaptors)",
    ],
    significantRisks: [
      "Water discharge / flooding", "High pressure water", "Working at height",
      "Manual handling", "Slips/trips/falls (wet floors)", "Lone working",
    ],
    specialTraining: "All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Pressure testing","High pressure water / burst connection","Injury from pressurised water. Water damage to building and contents.","3","5","15","Use calibrated gauges. Check all connections before pressurising. Operate pressure test from a safe distance.","2","3","6",""],
      ["Working at height (landing valves)","Falls from ladders","Falls causing injury. Falling tools/debris striking persons below.","3","5","15","Use correct access equipment. Inspect before use. Exclusion zone beneath. Wear hard hat.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  dry_riser_remedial: {
    descriptionOfWork:
      "Remedial repair works to dry riser systems including valve replacement, pipework repairs, cabinet rectification, and system restoration in accordance with BS 9990:2015 — Code of Practice for the Use of Dry Riser Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Obtain a permit to work from building management before commencing any remedial works.",
      "Notify building management that the dry riser system will be temporarily out of service during works.",
    ],
    taskSpecificOps: [
      "Review the defect report / previous inspection certificate to confirm scope of remedial works.",
      "Notify building management and, where required, the local fire authority of any system isolation.",
      "Isolate the system at the breeching inlet and depressurise before any dismantling.",
      "Replace defective components as identified: inlet/outlet valves, landing valves, caps, chains, pipework, or cabinets.",
      "Re-test all repaired or replaced components on completion.",
      "Carry out a hydraulic pressure test at 10 bar for 15 minutes using a calibrated gauge to verify repair integrity.",
      "Drain the system fully after pressure testing.",
      "Inspect all signage; replace any missing or damaged identification signs.",
      "Restore the system to full operational service.",
      "Issue a written completion/remedial works certificate confirming system is fit for service.",
      "Leave work area clean and tidy.",
    ],
    location: "Riser cupboards, stairwells, landing areas, breeching inlet positions throughout the building.",
    resources: "Minimum of: 2 Operatives.",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pressure test pump (manual or motorised)",
      "Dry riser test kit (hoses, adaptors)",
      "Pipe cutting and threading equipment",
      "Replacement valves, caps, chains, and fittings",
    ],
    significantRisks: [
      "Water discharge / flooding", "High pressure water", "Working at height",
      "Manual handling (pipe and valves)", "Slips/trips/falls (wet floors)", "Lone working",
    ],
    specialTraining: "All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Pressure testing post-repair","High pressure water / burst connection","Injury from pressurised water. Water damage to building and contents.","3","5","15","Use calibrated gauges. Inspect all replaced connections before pressurising. Operate from a safe distance.","2","3","6",""],
      ["Component replacement (valves/pipework)","Manual handling of pipe and valve assemblies","Musculoskeletal injury from awkward lifts in confined riser cupboards.","3","4","12","Use correct manual handling techniques. Two-person lift for heavy assemblies. Plan lift route before commencing.","2","3","6",""],
      ["Working at height (upper floor landings)","Falls from ladders","Falls causing injury. Falling tools/debris striking persons below.","3","5","15","Use correct access equipment. Inspect before use. Exclusion zone beneath. Wear hard hat.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  wet_riser: {
    descriptionOfWork:
      "Inspection, testing and annual servicing of wet riser systems in accordance with BS 9990:2015 — Code of Practice for the Use of Fire-Fighting Water Systems (Wet Riser).",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management and ensure the water supply is available before commencing.",
    ],
    taskSpecificOps: [
      "Notify building management and confirm water supply pressure is available.",
      "Carry out visual inspection of all landing valves, pipework, pump sets, and cabinet condition.",
      "Check and lubricate all landing valves and outlet caps.",
      "Test pump auto-start and alarm systems where fitted.",
      "Carry out annual hydraulic flow test at the highest/most remote landing valve.",
      "Record static and running pressures at pump and at landing valve.",
      "Inspect header tank and pump set for condition, and check ball valve and float operation.",
      "Test any pressure switches and flow alarms for correct operation.",
      "Restore system to full service and issue written service report.",
      "Leave work area clean and tidy.",
    ],
    location: "Riser cupboards, plant rooms, stairwells, and landing areas throughout the building.",
    resources: "Minimum of: 2 Operatives.",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pressure gauges (calibrated)",
      "Wet riser test equipment (hoses, flow meter, adaptors)",
    ],
    significantRisks: [
      "High pressure water", "Water discharge / flooding", "Working at height",
      "Electrical systems (pump sets)", "Manual handling", "Slips/trips/falls",
    ],
    specialTraining: "All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Flow testing at landing valve","High pressure water","Injury from pressurised water. Flooding of landing area.","3","5","15","Control water at pump. Ensure drain routes are clear. Operatives to stand clear during initial pressurisation.","2","3","6",""],
      ["Pump set inspection","Electrical hazard","Electric shock from pump set or control panel.","3","6","18","Isolate power before inspecting wiring. Only qualified electricians to work on live electrical systems.","1","5","5",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  sprinkler: {
    descriptionOfWork:
      "Inspection, testing and annual/bi-annual servicing of wet pipe and dry pipe sprinkler systems in accordance with BS EN 12845:2015 — Fixed Firefighting Systems — Automatic Sprinkler Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify the monitoring centre and building occupants before any alarm bypass is put in place.",
    ],
    taskSpecificOps: [
      "Obtain written permission to isolate the alarm monitoring before starting work.",
      "Isolate the alarm system at the control panel and inform the monitoring centre. Affix 'System Isolated' labels at all key points.",
      "Verify the water supply is available and adequate: check tank levels, pump status and incoming mains pressure.",
      "Carry out a full visual inspection of all visible pipework, hangers, joints, sprinkler heads and control valves.",
      "Inspect sprinkler heads for paint, corrosion, physical damage or proximity to heat sources. Replace any defective heads.",
      "Check the alarm valve assembly, clapper and seat. Test the alarm valve drain.",
      "Operate the alarm test valve to test hydraulic alarm (gong/bell). Confirm the alarm activates.",
      "Test pressure switches and flow switches for correct operation and signal transmission.",
      "Record static and residual pressures at the alarm valve and at the test point.",
      "Test pump auto-start if a pump set is installed. Record start pressure and run time.",
      "Flush drain valves and check for sedimentation.",
      "Carry out a main drain test and record the pressure drop.",
      "Restore the system fully to service, reset alarm panel and confirm with monitoring centre that the system is operational.",
      "Issue a written service report and certificate to the client upon satisfactory completion.",
    ],
    location: "Plant rooms, riser cupboards, ceiling voids, protected areas throughout the building.",
    resources: "Minimum of: 2 Operatives (FIA/BAFE SP203 trained).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pitot tube and flow measuring equipment",
      "Replacement sprinkler heads and spanner",
      "Portable pressure pump (if required)",
      "PPE kit including face shield for head work",
    ],
    significantRisks: [
      "Water discharge / flooding", "High pressure water", "Working at height",
      "False alarm activation", "Electrical components", "Manual handling",
    ],
    specialTraining: "FIA / BAFE SP203 trained operatives. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["System isolation / alarm bypass","Inadvertent alarm activation","False alarm causing building evacuation; disruption; financial penalty.","4","5","20","Notify monitoring centre and building manager in writing before isolation. Affix 'System Isolated' warning signs. Confirm reset with monitoring centre at end of works.","2","3","6",""],
      ["Inspection of sprinkler heads and pipework","Working at height","Falls from ladders or mobile platforms. Falling tools/debris striking persons below.","4","6","24","Use correct access equipment. Inspect before use. Exclusion zone beneath. Operatives to wear hard hats and harness where required.","2","4","8",""],
      ["Water supply and pressure testing","High pressure water / burst connection","Injury from pressurised water. Water damage to building and contents.","3","5","15","Use calibrated gauges. Check all connections before pressurising. Ensure drain routes are clear. Mop up spills immediately.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  fire_extinguisher: {
    descriptionOfWork:
      "Annual inspection, testing, and servicing of portable fire extinguishers in accordance with BS 5306-3:2017 — Commissioning and Maintenance of Portable Fire Extinguishers.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management before commencing any testing or replacement activity.",
    ],
    taskSpecificOps: [
      "Identify all extinguisher locations and access routes from building fire strategy drawings or local knowledge.",
      "Check each extinguisher for correct type, position, and accessibility as per BS 5306-3:2017.",
      "Carry out a basic service: check pin/seal/tamper indicator, pressure gauge reading, hose and horn condition.",
      "Weigh CO2 extinguishers and replace if charge loss exceeds 10%.",
      "Check water/foam/powder extinguisher charge and refill/replace as required.",
      "Inspect mounting brackets and signage; replace any defective items.",
      "Attach an annual service label with date, engineer name, and next service date.",
      "Issue a written service report listing all extinguishers serviced, any defects found, and remedial actions taken.",
    ],
    location: "All areas of the building as per site fire strategy drawings.",
    resources: "Minimum of: 1 Operative (BAFE SP101 accredited).",
    personnel: "",
    plantAndEquipment: [
      "Service kit (cylinder scales, pressure gauge, re-fill equipment)",
      "Replacement seals, pins, and tamper indicators",
      "CO2 refill cylinder (if required)",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "High pressure discharge (CO2/powder)", "Manual handling (heavy cylinders)",
      "Slips/trips/falls", "Working at height (wall-mounted units)", "Inadvertent discharge",
    ],
    specialTraining: "BAFE SP101 accredited service engineer. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["CO2 extinguisher service","High pressure discharge","Injury from accidental discharge. Cold burn from CO2 liquid.","2","5","10","Check pin is in place before handling. Never direct at persons. Wear insulated gloves when handling CO2 cylinders.","1","4","4",""],
      ["All tasks","Manual handling of heavy cylinders","Musculoskeletal injury.","2","4","8","Use trolleys for heavy cylinders. Two-person lift for cylinders >10 kg. Training mandatory.","1","3","3",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  fire_hydrant: {
    descriptionOfWork:
      "Testing and maintenance of underground fire hydrants in accordance with BS 9990:2015 and BS 750:2006 — Underground Fire Hydrants.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Obtain any necessary road closure or traffic management permits before commencement.",
      "Notify local water company at least 48 hours before any testing that may affect supply.",
    ],
    taskSpecificOps: [
      "Locate all hydrants on site using plan drawings; clear any debris or overgrowth from covers.",
      "Open hydrant box lid and inspect chamber condition, steelwork, and ground conditions.",
      "Clean and lubricate hydrant spindle.",
      "Fit key and standpipe; slowly open hydrant to flush sediment to drain or runoff point.",
      "Record static and dynamic flow pressure using calibrated gauge.",
      "Inspect outlet coupling, blank cap, and chain. Replace if defective.",
      "Close hydrant fully and check for leakage.",
      "Record all findings on service record sheet and attach hydrant inspection label.",
      "Restore cover to safe condition and ensure hydrant is clearly visible and accessible.",
    ],
    location: "External grounds, footpaths, car parks, and roadways as per hydrant plan.",
    resources: "Minimum of: 2 Operatives. Traffic management team where road works required.",
    personnel: "",
    plantAndEquipment: [
      "Hydrant key and standpipe",
      "Pressure gauge (calibrated)",
      "Traffic management signage (if required)",
      "Hydrant cover-lifting tools",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "Traffic / vehicle collision", "Water discharge flooding",
      "Manual handling (heavy covers)", "Slips/trips on wet surfaces", "Struck by high pressure water",
    ],
    specialTraining: "All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Hi-vis vest to EN ISO 20471 Class 2/3 for roadside works"],
    riskRows: [
      ["Roadside hydrant testing","Traffic / vehicle collision","Serious injury or fatality from vehicle strike.","4","7","28","Traffic management scheme in place before works start. Operatives in Class 2 Hi-Vis. Designated lookout where required.","2","6","12",""],
      ["Opening/flushing hydrant","Struck by high pressure water","Injury from water jet. Flooding of work area.","3","5","15","Open hydrant slowly. Ensure drain/runoff is clear. Stand to the side during opening. Wear waterproof PPE.","2","3","6",""],
      ["Lifting heavy covers","Manual handling injury","Back/musculoskeletal injury.","3","4","12","Use hydrant cover lifting tools. Two-person lift for heavy covers. Manual handling training mandatory.","1","3","3",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  fire_alarm: {
    descriptionOfWork:
      "Inspection, testing and servicing of fire detection and alarm systems in accordance with BS 5839-1:2017 — Fire Detection and Fire Alarm Systems for Buildings.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify the alarm monitoring centre and building management before any isolation or test.",
      "Obtain written permission to isolate zones or panels before commencing.",
    ],
    taskSpecificOps: [
      "Confirm all occupants and monitoring centre are aware of the planned test — obtain written authorisation.",
      "Isolate the alarm monitoring (ARC / BMS link) and affix 'System Under Test' labels at each panel.",
      "Carry out a full visual inspection of all detectors, call points, sounders, beacons, and control panels.",
      "Test each detector type (smoke, heat, beam, multi-sensor) using approved test equipment — do not use naked flame.",
      "Test a sample of manual call points (at least one per zone) per BS 5839-1:2017 cl.45.",
      "Check all cables, conduit, and containment for visible damage.",
      "Test battery standby and full load test where applicable.",
      "Verify correct operation of all output devices (sounders, beacons, door releases, suppression interface, BMS signals).",
      "Check and update the logbook with all test results, defects, and remedial actions.",
      "Reset the system fully, restore monitoring link, and confirm with ARC that the system is operational.",
      "Issue a written service certificate to the client.",
    ],
    location: "All areas of the building including plant rooms, voids, and external AOVs.",
    resources: "Minimum of: 2 Operatives (FIA / BAFE SP203-4 trained).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Smoke detector test aerosol / heat gun",
      "Detector testing pole and head",
      "Programming laptop / access codes",
      "Replacement detectors and sounders (as required)",
    ],
    significantRisks: [
      "False alarm causing building evacuation", "Electrical hazard (control panel, PSU)",
      "Working at height (ceiling mounted devices)", "Slips/trips/falls",
    ],
    specialTraining: "FIA / BAFE SP203-4 trained operatives. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["System testing / zone isolation","Inadvertent full alarm activation","Building evacuation; disruption; financial/reputational damage; fines.","4","5","20","Obtain written authority before isolating. Notify all responsible persons and ARC. Affix 'Under Test' signs. Restore immediately after testing.","2","3","6",""],
      ["Working at height (ceiling detectors)","Falls from ladders / platforms","Falls causing injury. Falling tools striking persons below.","3","5","15","Use EN 131 ladders or PASMA-inspected towers. Exclusion zone beneath. Secure all tools.","2","3","6",""],
      ["Panel / PSU work","Electrical hazard","Electric shock, arc flash.","2","6","12","Isolate power before any wiring work. Only competent persons to work inside panels.","1","4","4",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  emergency_lighting: {
    descriptionOfWork:
      "Testing, inspection, and annual service of emergency lighting systems in accordance with BS 5266-1:2016 — Emergency Lighting — Code of Practice for the Emergency Lighting of Premises.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management before any emergency lighting tests to avoid unnecessary alarm.",
    ],
    taskSpecificOps: [
      "Notify building management and confirm no critical operations will be disrupted during the test.",
      "Carry out visual inspection of all maintained and non-maintained luminaires for damage, soiling, and obstruction.",
      "Perform monthly functional test (momentary test): inhibit auto-test if installed; simulate failure; confirm illumination.",
      "Perform annual full duration test: simulate mains failure; run luminaires on battery for full rated duration (1 or 3 hour).",
      "Record lux levels and battery discharge performance against design data.",
      "Inspect all exit and directional signage for correct legibility and positioning.",
      "Check central battery system (CBS) where fitted: battery condition, charger operation, distribution fuses.",
      "Replace any failed lamps, drivers, or batteries identified during test.",
      "Restore all luminaires to normal mode after testing.",
      "Update the logbook and issue a written service certificate to the client.",
    ],
    location: "All means of escape, exit routes, plant rooms, and areas without natural light.",
    resources: "Minimum of: 1 Operative (LIA / ILP trained recommended).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Lux meter (calibrated)",
      "Replacement lamps, drivers, and batteries",
      "Emergency lighting test kit / inhibit key",
    ],
    significantRisks: [
      "Working at height (luminaires on high ceilings)", "Electrical hazard",
      "Disruption to building operations during test", "Slips/trips/falls",
    ],
    specialTraining: "Electrical competency required. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Annual duration test","Building in darkness during test","Slips, trips, falls by building occupants.","3","4","12","Inform all occupants. Carry out test out of hours where practicable. Ensure access routes are safe before testing.","2","3","6",""],
      ["Working at height (high bay luminaires)","Falls from ladders/MEWP","Serious injury from falls.","3","5","15","Use IPAF-certified MEWP or PASMA tower. Exclusion zone beneath. Secure all tools.","2","3","6",""],
      ["Electrical work on CBS / luminaires","Electrical hazard","Electric shock.","2","6","12","Isolate circuits before replacing components. Test with voltage indicator before touching conductors.","1","4","4",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  aov_smoke_control: {
    descriptionOfWork:
      "Inspection, testing and annual service of automatic opening vent (AOV) and smoke control systems in accordance with BS 7346-8:2013 — Components for Smoke and Heat Control Systems and EN 12101.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management and BMS operator before any AOV or smoke control test.",
    ],
    taskSpecificOps: [
      "Notify building management, BMS and monitoring centre before testing — obtain written authority.",
      "Carry out visual inspection of all AOV panels, actuators, smoke detectors, and vent/louvre condition.",
      "Test panel power supply and battery backup.",
      "Test each AOV trigger (detector, manual override, call point) and verify vents open within design criteria.",
      "Measure vent travel time and confirm full open position.",
      "Test all manual override stations and remote reset functions.",
      "Inspect and test any mechanical smoke shaft systems, pressurisation fans, or extract fans.",
      "Verify interface signals to BMS, fire alarm, and lift control where applicable.",
      "Test all re-set functions and confirm system returns to normal mode.",
      "Update logbook and issue a written service certificate.",
    ],
    location: "Atria, stairwells, lobbies, smoke shafts, and roof level AOV positions.",
    resources: "Minimum of: 2 Operatives (one at panel, one at vent).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Smoke machine / test aerosol",
      "Anemometer (for extract systems)",
      "Pressure differential meter",
      "Access equipment for roof-level vents",
    ],
    significantRisks: [
      "Working at height (roof-level vents)", "Electrical hazard (actuators, panels)",
      "Mechanical entrapment (closing vents)", "Adverse weather (roof access)",
      "Slips/trips/falls",
    ],
    specialTraining: "BS 7346-8 competency. IPAF/PASMA where working at height. All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Safety harness EN361 (for roof work)"],
    riskRows: [
      ["Roof level AOV inspection / test","Working at height","Falls causing serious injury or fatality. Falling objects striking persons below.","4","6","24","IPAF/PASMA certification mandatory. Edge protection or harness required. Exclusion zone at ground level.","2","4","8",""],
      ["Vent actuation test","Mechanical entrapment by closing vent","Crush injury to hands or fingers.","2","6","12","Never place hands in vent aperture during actuation. Stand clear of moving parts. Test one vent at a time.","1","5","5",""],
      ["Panel and actuator work","Electrical hazard","Electric shock.","2","6","12","Isolate power before working on wiring. Only competent persons on live electrical systems.","1","4","4",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  passive_fire: {
    descriptionOfWork:
      "Inspection and survey of passive fire protection measures including fire doors, fire stopping, and compartmentation in accordance with BS 9999:2017 — Fire Safety in the Design, Management and Use of Buildings and BS 8214:2016.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Obtain access to all fire doors, risers, plant rooms, and ceiling voids to be inspected.",
    ],
    taskSpecificOps: [
      "Obtain site drawings identifying all fire-rated doors, walls, floors, and penetrations.",
      "Carry out a visual inspection of each fire door: leaf, frame, ironmongery, seals, closers, and gaps.",
      "Check that all fire door gaps comply with BS 8214 — leaf to frame ≤3 mm, leaf to floor ≤10 mm.",
      "Test door closer operation — door must self-close from any angle and latch fully.",
      "Test intumescent seals, smoke seals, and door drops for condition and continuity.",
      "Inspect all fire stopping in identified service penetrations through compartment walls and floors.",
      "Check compartment walls and ceilings for unsealed openings, damage, or alterations.",
      "Record all defects with photographic evidence and reference number.",
      "Provide a defect schedule report with risk rating and recommended remediation.",
      "Issue a written inspection certificate and schedule of works to the client.",
    ],
    location: "All fire-rated compartments, escape routes, plant rooms, and riser shafts.",
    resources: "Minimum of: 1 Operative (IFE / BRE / FDIS trained fire door inspector).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Gap gauge (leaf to frame / leaf to floor)",
      "Feeler gauges",
      "Torch and inspection mirror",
      "Camera / tablet for photo evidence",
    ],
    significantRisks: [
      "Working at height (void inspection)", "Dust/contaminants in voids",
      "Asbestos risk (older buildings)", "Slips/trips/falls",
    ],
    specialTraining: "FDIS / IFE / BRE fire door inspection competency. All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Dust mask FFP2 (for void access)", "Disposable overalls"],
    riskRows: [
      ["Ceiling void / riser inspection","Asbestos containing material (ACM)","Inhalation of asbestos fibres causing serious respiratory disease.","3","7","21","Check asbestos register before entering voids. If ACM suspected, stop work and report to client. Never disturb suspected ACM.","1","7","7",""],
      ["Void access / confined spaces","Slips, trips and falls in restricted space","Injury from falls or restricted movement.","3","5","15","Inspect void access before entry. Use torches. Communicate with colleague outside. Do not enter if unsafe to do so.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  gas_suppression: {
    descriptionOfWork:
      "Inspection, testing and annual service of gaseous fire extinguishing systems in accordance with ISO 14520 — Gaseous Fire Extinguishing Systems and BS EN 15004 — Fixed Firefighting Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Obtain written authority from building management and end-user before any isolation.",
      "Confirm gas suppression system is safe to isolate before any work commences.",
    ],
    taskSpecificOps: [
      "Notify all building occupants, monitoring centre, and IT/data centre operators before isolation.",
      "Place the suppression system into manual mode / abort before any work. Affix 'System Isolated' signs.",
      "Carry out visual inspection of all cylinders, pressure gauges, discharge nozzles, and pipework.",
      "Weigh all extinguishant cylinders and compare against certified charge weight — replace if >5% loss (CO2) or >10% loss (inert gas).",
      "Test all detection devices (smoke, heat, multi-sensor) using approved test equipment.",
      "Test manual abort and release stations for correct operation.",
      "Verify door-closing interfaces, ventilation shutdown sequences, and alarm outputs.",
      "Carry out a discharge simulation test (without discharge) using the control panel test functions.",
      "Inspect the protected enclosure for integrity — all penetrations, doors and dampers must be correctly sealed.",
      "Restore the system to fully automatic mode. Confirm with monitoring centre.",
      "Issue a written service certificate and re-weigh certificate to the client.",
    ],
    location: "Server rooms, plant rooms, electrical switchrooms, and other protected enclosures.",
    resources: "Minimum of: 2 Operatives (FIA / BAFE SP207 trained).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Cylinder weighing scales (calibrated)",
      "Gas detector (for CO2 / inert gas leaks)",
      "Programming laptop / access codes",
    ],
    significantRisks: [
      "Accidental gas discharge (asphyxiation)", "Oxygen depletion in protected enclosure",
      "High pressure cylinder handling", "Electrical hazard (server rooms)",
      "Working at height (nozzles in high ceilings)",
    ],
    specialTraining: "FIA / BAFE SP207 trained operatives. Gas safety awareness mandatory. All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "SCBA or airline breathing apparatus (for confined space / gas risk areas)"],
    riskRows: [
      ["System isolation / test","Accidental gas discharge","Asphyxiation from CO2 or inert gas discharge in enclosed space.","4","7","28","System must be in manual mode before any work. All occupants evacuated from protected zone before any test. Gas detector on standby.","2","6","12",""],
      ["Cylinder weighing and handling","Cylinder failure under pressure","Serious injury from cylinder projectile or sudden release.","2","7","14","Use calibrated scales. Never drop or impact cylinders. Inspect cylinder valve before handling. Follow manufacturer procedures.","1","5","5",""],
      ["Testing in server rooms","Electrical hazard in live data environments","Electric shock; damage to live equipment.","3","5","15","Coordinate with IT team. Avoid contact with live equipment. Insulate tools. Wear anti-static PPE where required.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  kitchen_suppression: {
    descriptionOfWork:
      "Annual inspection, testing and service of commercial kitchen fire suppression systems in accordance with BS EN 15493:2009 — Kitchen Fire Suppression Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify kitchen management and arrange for kitchen to be out of service during the test.",
    ],
    taskSpecificOps: [
      "Confirm the kitchen is not in use and cooking appliances are cool before commencing.",
      "Place the suppression system into manual mode before any work. Affix 'System Isolated' signs.",
      "Carry out visual inspection of all nozzles, pipework, cylinders, and cartridges.",
      "Check that all nozzles are correctly positioned over protected appliances and are not blocked.",
      "Weigh wet chemical cylinder and compare against certified charge weight.",
      "Test fuel shut-off valve for correct operation — must close within 1 second of activation.",
      "Test all manual pull stations for correct mechanical operation.",
      "Verify alarm output and interface with building fire alarm if fitted.",
      "Carry out a simulated activation test where practicable.",
      "Fit new service tag and restore system to operational mode.",
      "Issue a written service certificate to the client.",
    ],
    location: "Commercial kitchen cooking range, extraction canopy, and associated appliances.",
    resources: "Minimum of: 1 Operative (manufacturer-trained or BAFE accredited).",
    personnel: "",
    plantAndEquipment: [
      "Cylinder weighing scales (calibrated)",
      "Nozzle inspection kit and blow-through gauge",
      "Replacement cartridges and fusible links (as required)",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "Contact with hot surfaces / residual heat", "Chemical exposure (wet chemical agent)",
      "Accidental system discharge", "Slips/trips in kitchen environment",
    ],
    specialTraining: "Manufacturer-certified service training for the specific system brand. All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Chemical resistant gloves", "Face shield"],
    riskRows: [
      ["Inspection of nozzles above cooking range","Contact with hot surfaces","Burns from residual heat on appliances or canopy.","3","4","12","Confirm all appliances are cool before commencing. Use back of hand to sense heat before touching surfaces. Wear heat-resistant gloves.","2","3","6",""],
      ["Wet chemical cylinder handling","Chemical exposure","Skin / eye irritation from wet chemical agent.","2","4","8","Wear chemical resistant gloves and face shield. Do not open cylinder valve. If spillage occurs, flush with water and seek medical advice.","1","3","3",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  water_mist: {
    descriptionOfWork:
      "Inspection, testing and annual service of water mist fire suppression systems in accordance with BS 8489:2016 — Fixed Fire Protection Systems — Industry Standard for Water Mist Systems.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management and monitoring centre before any isolation.",
    ],
    taskSpecificOps: [
      "Notify building management and monitoring centre before commencement — obtain written authority.",
      "Place system into service/test mode. Affix 'System Under Test' labels.",
      "Carry out visual inspection of all nozzles, pipework, filters, and control panel.",
      "Check pump set and pressure vessel for correct pressure and condition.",
      "Test pump auto-start and standby pump changeover where applicable.",
      "Test all detection devices (smoke, heat, linear heat) using approved test equipment.",
      "Carry out full nozzle flush test if required by manufacturer maintenance schedule.",
      "Test manual activation and manual abort functions.",
      "Verify all alarm and interface outputs (fire alarm, BMS, door release).",
      "Restore system to fully operational mode and confirm with monitoring centre.",
      "Issue a written service certificate to the client.",
    ],
    location: "All areas of the building or specific zones covered by the water mist system.",
    resources: "Minimum of: 2 Operatives (BS 8489 trained / manufacturer certified).",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pressure gauge and test kit",
      "Filter cleaning kit",
      "Replacement nozzle strainers (as required)",
    ],
    significantRisks: [
      "High pressure water mist (eye / skin injury)", "Working at height (nozzle inspection)",
      "Water damage if uncontrolled discharge", "Slips/trips/falls",
    ],
    specialTraining: "BS 8489 competency / manufacturer system training. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Nozzle inspection / flush test","High pressure fine water mist","Eye and skin injury from pressurised fine water spray.","2","4","8","Wear safety glasses during any flush test. Ensure occupants are clear of test zone. Control discharge to drain.","1","3","3",""],
      ["Working at height (nozzle inspection)","Falls from access equipment","Falls causing injury.","3","5","15","Use correct access equipment. Inspect before use. Exclusion zone beneath.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  hose_reel: {
    descriptionOfWork:
      "Annual inspection, testing and service of fixed hose reel installations in accordance with BS 5306-1:2006 — Fire Extinguishing Installations and Equipment — Hose Systems and BS EN 671-1:2012.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management before carrying out any flow tests.",
    ],
    taskSpecificOps: [
      "Notify building management and confirm water supply is available.",
      "Carry out visual inspection of all hose reels — reel condition, hose condition, nozzle, and cabinet/recess.",
      "Check that hose has no perishing, cracks, or damage along its full length.",
      "Confirm reel swings freely through 180° and all fittings are correct.",
      "Test nozzle for jet, spray, and off positions.",
      "Operate stop valve and confirm it is fully open and operational.",
      "Carry out a flow test — run out hose and confirm adequate flow at nozzle.",
      "Check signage is present, legible, and correctly positioned.",
      "Replace any defective hose, nozzle, or fittings identified.",
      "Restore hose reel to operating position and re-rack hose.",
      "Issue a written service certificate to the client.",
    ],
    location: "All hose reel positions throughout the building as per fire strategy drawings.",
    resources: "Minimum of: 1 Operative.",
    personnel: "",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Replacement hose, couplings, and nozzles (as required)",
    ],
    significantRisks: [
      "Water discharge / wet floors", "Manual handling (unwinding/re-racking hose)",
      "Slips/trips/falls", "Working at height (high-level reels)",
    ],
    specialTraining: "All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Flow test","Water discharge / wet floors","Slips and falls from wet surfaces.","3","3","9","Lay absorbent mats or cordon off wet area. Mop up immediately after test. Warn building occupants.","2","2","4",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  fire_risk_assessment: {
    descriptionOfWork:
      "Fire risk assessment of premises in accordance with PAS 79:2020 — Fire Risk Assessments: Competency of Fire Risk Assessors and the Regulatory Reform (Fire Safety) Order 2005.",
    sequenceOfOps: [
      "Confirm scope and purpose of assessment with the responsible person before commencing.",
      "Review any previous fire risk assessments, fire safety certificates, and significant incidents.",
      "Obtain building drawings and fire strategy documentation where available.",
      "Carry out a structured site survey of all areas including plant rooms, voids, and escape routes.",
    ],
    taskSpecificOps: [
      "Identify all potential ignition sources, fuel sources, and oxygen sources.",
      "Identify all relevant persons including employees, contractors, residents, and people with disabilities.",
      "Evaluate existing fire safety measures: detection, suppression, compartmentation, means of escape.",
      "Assess the adequacy of fire doors and escape route widths for the occupancy level.",
      "Review emergency lighting coverage and testing records.",
      "Review fire extinguisher provision, type, and service records.",
      "Assess the fire alarm system — type, coverage, and maintenance records.",
      "Evaluate housekeeping and storage of flammable materials.",
      "Assess staff fire safety training, fire evacuation drills, and fire safety management arrangements.",
      "Identify significant findings and evaluate the level of risk for each.",
      "Compile the fire risk assessment report with prioritised action plan per PAS 79:2020.",
      "Issue the written fire risk assessment to the responsible person.",
    ],
    location: "All areas of the premises including external areas, plant rooms, and storage.",
    resources: "Minimum of: 1 Fire Risk Assessor (Level 3+ qualified, IFE / FPA / FIA registered).",
    personnel: "",
    plantAndEquipment: [
      "Camera / tablet for photographic evidence",
      "Lux meter (if required for emergency lighting assessment)",
      "Measuring tape",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "Asbestos in older premises", "Access to roof / plant areas",
      "Lone working on site survey", "Slips/trips/falls",
    ],
    specialTraining: "Level 3 Fire Risk Assessment qualification (IFE, FPA, or equivalent). All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Site survey in older premises","Asbestos containing materials","Inhalation of asbestos fibres causing serious respiratory disease.","3","7","21","Check asbestos register and management plan before survey. Do not disturb any suspected ACM. Withdraw if ACM found unmanaged.","1","7","7",""],
      ["Access to plant rooms / voids","Slips, trips, and falls in restricted areas","Injury from falls or restricted movement.","3","4","12","Inspect access before entry. Use torches. Do not enter unsafe areas. Communicate with colleague.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },

  installation: {
    descriptionOfWork:
      "Installation of dry riser systems (pipework, valves, cabinets, inlets and outlets) in accordance with BS 9990:2015 and the approved design drawings.",
    sequenceOfOps: [
      "All working personnel must have received site induction from Principal Contractor and a RAMS briefing from the site supervisor before works commence.",
      "Personnel will sign in via main security and into the Daily Sign-In register.",
      "All working personnel must demonstrate they have the correct certification before works commence.",
      "Obtain a permit to work / hot work permit where required from the Principal Contractor.",
      "All deliveries of materials must be pre-booked with Principal Contractor with 48 hours' notice.",
    ],
    taskSpecificOps: [
      "Review approved design drawings and survey site for pipe routing, valve positions, and cabinet locations.",
      "Mark out pipe routes, drilling positions, and penetration locations on walls and floors.",
      "Obtain core drilling / hot work permits from Principal Contractor before drilling.",
      "Drill penetrations and install sleeves; make good around penetrations after pipe installation.",
      "Install pipe hangers and supports at centres not exceeding BS 9990 requirements.",
      "Cut, deburr, and groove pipework to required dimensions.",
      "Assemble grooved couplings and fittings in accordance with manufacturer instructions.",
      "Install dry riser cabinet(s) in agreed locations.",
      "Connect inlets and outlets; install landing valves and caps.",
      "Carry out pneumatic pressure test at 7 bar for 1 hour before hydraulic testing.",
      "Carry out hydraulic pressure test at 12 bar for 15 minutes using calibrated gauge.",
      "Record all test results and issue test certificate.",
      "Install system labels and identification markers throughout the riser.",
      "Commission system and demonstrate to building management.",
      "Carry out final clean-up and remove all debris from site.",
      "Issue as-fitted drawings and operation & maintenance manual.",
    ],
    location: "Throughout the building as per approved installation drawings.",
    resources: "Minimum of: 2 Operatives (pipe fitters).",
    personnel: "",
    plantAndEquipment: [
      "Pipe grooving machine",
      "Core drill and diamond bits",
      "Pipe threading/cutting equipment",
      "Pressure test pump and calibrated gauge",
      "Pipe stands and vice",
      "Power tools (SDS drill, angle grinder)",
      "Hand tools and spanners",
      "Mobile scaffold / tower / MEWP",
      "PPE kit including face shield and hearing protection",
    ],
    significantRisks: [
      "Working at height", "Silica dust (core drilling)", "Manual handling (heavy pipes)",
      "HAVS (vibrating tools)", "High pressure testing", "Electrical hazards",
    ],
    specialTraining: "Confined space awareness. Working at height (PASMA/IPAF). All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Dust mask (FFP3)", "Hearing protection (EN352)", "Safety harness (EN361)"],
    riskRows: [
      ["Working at height (pipe installation)","Falls from mobile scaffold/MEWP","Serious injury or fatality from falling. Falling materials striking persons below.","4","6","24","PASMA/IPAF certification mandatory. Inspect equipment before use. Exclusion zone beneath. Secure all tools and materials.","2","4","8",""],
      ["Core drilling / penetrations","Silica dust inhalation","Respiratory disease (silicosis).","4","5","20","Wet drill method or dust suppression at all times. FFP3 dust mask mandatory. LEV where practicable.","2","3","6",""],
      ["Grooved pipe assembly / power tools","HAVS (hand-arm vibration)","Vibration white finger and nerve damage.","3","4","12","Use low-vibration tools where available. Rotate tasks to limit exposure. Monitor HAV exposure against EAV/ELV.","2","3","6",""],
      ["Hydraulic pressure testing","High pressure water / burst connection","Injury from pressurised water. Water damage to building contents.","3","5","15","Use calibrated gauges. All personnel clear of zone during pressurisation. Stand to the side of test connection.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },
};

export function getRamsDefaults(type: RamsType): RamsDefaults {
  return DEFAULTS[type] ?? DEFAULTS.dry_riser;
}

/**
 * Builds a context-aware "Description of Work" string based on job quantities.
 * Falls back to the default for the RAMS type if no quantities are provided.
 */
export function buildScopeDescription(
  type: RamsType,
  pressureTestQty?: number,
  visualQty?: number,
  otherQty?: number,
  otherServiceType?: string | null
): string {
  const pt = pressureTestQty ?? 0;
  const vis = visualQty ?? 0;
  const other = otherQty ?? 0;

  if (type === "installation") {
    return DEFAULTS.installation.descriptionOfWork;
  }

  const parts: string[] = [];
  if (pt > 0) parts.push(`pressure testing (${pt} system${pt > 1 ? "s" : ""})`);
  if (vis > 0) parts.push(`visual inspection (${vis} system${vis > 1 ? "s" : ""})`);
  if (other > 0 && otherServiceType) parts.push(`${otherServiceType} (${other} system${other > 1 ? "s" : ""})`);
  if (other > 0 && !otherServiceType) parts.push(`other service works (${other} item${other > 1 ? "s" : ""})`);

  if (parts.length === 0) return DEFAULTS[type]?.descriptionOfWork ?? DEFAULTS.dry_riser.descriptionOfWork;

  const baseDesc = DEFAULTS[type]?.descriptionOfWork ?? DEFAULTS.dry_riser.descriptionOfWork;
  const standard = baseDesc.match(/in accordance with (.+?)\.?$/)?.[1] ?? "relevant British Standards";

  return `Carrying out ${parts.join(" and ")} of fire protection systems in accordance with ${standard}.`;
}
