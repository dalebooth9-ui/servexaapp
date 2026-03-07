/**
 * Default RAMS content per type.
 * These are the same values hard-coded into the PDF generators,
 * exposed here so the editor can pre-populate new documents.
 */

export type RamsType = "dry_riser" | "sprinkler" | "fire_extinguisher" | "fire_hydrant" | "installation";

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
  "All working personnel must have received site induction from Principal Contractor and Viva Fire the first day of attending, and a RAMS briefing from the Viva Fire site supervisor before works commence.",
  "Personnel will sign in via main security and into the Viva Fire Daily Sign-In register.",
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
      "Inspection, testing and annual servicing of dry riser systems in accordance with BS 9990:2015.",
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
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      ...COMMON_PLANT,
      "Pressure test pump (manual or motorised)",
      "Dry riser test kit (hoses, adaptors)",
    ],
    significantRisks: [
      "Water discharge / flooding", "High pressure water", "Working at height",
      "Manual handling", "Slips/trips/falls (wet floors)", "Lone working",
    ],
    specialTraining: "SSSTS – Martin Whatmough. All operatives hold current CSCS cards.",
    ppeItems: COMMON_PPE,
    riskRows: [
      ["Pressure testing","High pressure water / burst connection","Injury from pressurised water. Water damage to building and contents.","3","5","15","Use calibrated gauges. Check all connections before pressurising. Operate pressure test from a safe distance.","2","3","6",""],
      ["Working at height (landing valves)","Falls from ladders","Falls causing injury. Falling tools/debris striking persons below.","3","5","15","Use correct access equipment. Inspect before use. Exclusion zone beneath. Wear hard hat.","2","3","6",""],
      ...COMMON_RISK_ROWS,
    ],
  },
  sprinkler: {
    descriptionOfWork:
      "Inspection, testing and annual/quarterly servicing of wet pipe and dry pipe sprinkler systems in accordance with BS EN 12845 and LPS 1048.",
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
      "Leave work area clean and tidy.",
    ],
    location: "Plant rooms, riser cupboards, ceiling voids, protected areas throughout the building.",
    resources: "Minimum of: 2 Operatives (FIA/BAFE SP203 trained).",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
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
      "Slips/trips/falls (wet floors)", "Lone working",
    ],
    specialTraining: "SSSTS – Martin Whatmough. FIA / BAFE SP203 trained operatives. All operatives hold current CSCS cards.",
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
      "Annual inspection, testing, and servicing of portable fire extinguishers in accordance with BS 5306-3:2017 and BAFE SP101 scheme requirements.",
    sequenceOfOps: [
      ...COMMON_SEQUENCE,
      "Notify building management before commencing any testing or replacement activity.",
    ],
    taskSpecificOps: [
      "Identify all extinguisher locations and access routes from building fire strategy drawings or local knowledge.",
      "Check each extinguisher for correct type, position, and accessibility as per BS 5306-3.",
      "Carry out a basic service: check pin/seal/tamper indicator, pressure gauge reading, hose and horn condition.",
      "Weigh CO2 extinguishers and replace if charge loss exceeds 10%.",
      "Check water/foam/powder extinguisher charge and refill/replace as required.",
      "Inspect mounting brackets and signage; replace any defective items.",
      "Attach an annual service label with date, engineer name, and next service date.",
      "Issue a written service report listing all extinguishers serviced, any defects found, and remedial actions taken.",
      "Leave work area clean and tidy.",
    ],
    location: "All areas of the building as per site fire strategy drawings.",
    resources: "Minimum of: 1 Operative (BAFE SP101 accredited).",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      "Service kit (cylinder scales, pressure gauge, re-fill equipment)",
      "Replacement seals, pins, and tamper indicators",
      "CO2 refill cylinder (if required)",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "High pressure discharge (CO2/powder)", "Manual handling (heavy cylinders)",
      "Slips/trips/falls", "Working at height (wall-mounted units)",
      "Inadvertent discharge", "Lone working",
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
      "Testing and maintenance of underground fire hydrants in accordance with BS EN 14339 and Water Industry specifications.",
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
      "Issue written service report to client.",
    ],
    location: "External grounds, footpaths, car parks, and roadways as per hydrant plan.",
    resources: "Minimum of: 2 Operatives. Traffic management team where road works required.",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      "Hydrant key and standpipe",
      "Pressure gauge (calibrated)",
      "Traffic management signage (if required)",
      "Hydrant cover-lifting tools",
      ...COMMON_PLANT,
    ],
    significantRisks: [
      "Traffic / vehicle collision", "Water discharge flooding",
      "Manual handling (heavy covers)", "Slips/trips on wet surfaces",
      "Struck by high pressure water", "Lone working",
    ],
    specialTraining: "SSSTS – Martin Whatmough. All operatives hold current CSCS cards.",
    ppeItems: [...COMMON_PPE, "Hi-vis vest to EN ISO 20471 Class 2/3 for roadside works"],
    riskRows: [
      ["Roadside hydrant testing","Traffic / vehicle collision","Serious injury or fatality from vehicle strike.","4","7","28","Traffic management scheme in place before works start. Operatives in Class 2 Hi-Vis. Designated lookout where required.","2","6","12",""],
      ["Opening/flushing hydrant","Struck by high pressure water","Injury from water jet. Flooding of work area.","3","5","15","Open hydrant slowly. Ensure drain/runoff is clear. Stand to the side during opening. Wear waterproof PPE.","2","3","6",""],
      ["Lifting heavy covers","Manual handling injury","Back/musculoskeletal injury.","3","4","12","Use hydrant cover lifting tools. Two-person lift for heavy covers. Manual handling training mandatory.","1","3","3",""],
      ...COMMON_RISK_ROWS,
    ],
  },
  installation: {
    descriptionOfWork:
      "Installation of dry riser systems (pipework, valves, cabinets, inlets and outlets) in accordance with BS 9990:2015 and the approved design drawings.",
    sequenceOfOps: [
      "All working personnel must have received site induction from Principal Contractor and Viva Fire the first day of attending, and a RAMS briefing from the Viva Fire site supervisor before works commence.",
      "Personnel will sign in via main security and into the Viva Fire Daily Sign-In register.",
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
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
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
      "Slips/trips/falls", "Lone working",
    ],
    specialTraining: "SSSTS – Martin Whatmough. Confined space awareness. Working at height (PASMA/IPAF). All operatives hold current CSCS cards.",
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
