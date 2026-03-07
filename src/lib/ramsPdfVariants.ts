/**
 * ramsPdfVariants.ts
 * RAMS PDF generators for Sprinkler, Fire Extinguisher, and Fire Hydrant.
 * Uses shared helpers from ramsPdfBase.ts.
 */
import jsPDF from "jspdf";
import {
  RamsFormData, RamsJobInfo,
  PAGE_H, ML, CONTENT_W,
  newPage, pageFooter,
  buildCoverPage, buildSharedMethodSections, buildRiskPage,
  buildSignOffPage, finaliseAndReturn,
  loadLogoImage, pageHeader, para, bulletList, numberedList,
  riskTableHeader, riskRow, riskColorLegend, labelValue,
  checkPageBreak,
} from "@/lib/ramsPdfBase";

/* ══════════════════════════════════════════════════════ SPRINKLER ══ */

export async function generateSprinklerRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers: { name: string; sig: string; date: string }[] = []
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoImg = await loadLogoImage(jobInfo?.customers?.logo_url);
      title2: "Sprinkler System Servicing",
      operationTask: "Inspection, testing and servicing of sprinkler systems.",
    }, assignedEngineers);

  const siteLocTrunc = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") +
    (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");

  // Method statement pages 1–5
  const pageRef = { num: 1 };
  await buildSharedMethodSections(doc, logoImg, {
    descriptionOfWork: "Inspection, testing and annual/quarterly servicing of wet pipe and dry pipe sprinkler systems in accordance with BS EN 12845 and LPS 1048.",
    sequenceOfOps: [
      "All working personnel must have received site induction from Principal Contractor and Viva Fire the first day of attending, and a RAMS briefing from the Viva Fire site supervisor before works commence.",
      "Personnel will sign in via main security and into the Viva Fire Daily Sign-In register.",
      "All working personnel must demonstrate they have the correct certification (e.g. FIA/BAFE SP203) before works commence.",
      "Notify the monitoring centre and building occupants before any alarm bypass is put in place.",
      "All deliveries of materials must be pre-booked with Principal Contractor with 48 hours' notice.",
    ],
    taskSpecificOps: [
      "Obtain written permission to isolate the alarm monitoring before starting work.",
      "Isolate the alarm system at the control panel and inform the monitoring centre. Affix 'System Isolated' labels at all key points.",
      "Verify the water supply is available and adequate: check tank levels, pump status and incoming mains pressure.",
      "Carry out a full visual inspection of all visible pipework, hangers, joints, sprinkler heads and control valves. Record any corrosion, damage or obstruction.",
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
      "Hand tools and pipe wrenches",
      "Pressure test gauge (calibrated)",
      "Pitot tube and flow measuring equipment",
      "Multimeter / continuity tester",
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
  }, pageRef, TOTAL_PAGES);

  // Risk table pages 6–9
  const riskTitle = "Risk Assessment for Sprinkler System Inspection & Servicing";
  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Sprinkler System Servicing",
    engineerNames, siteLocTrunc,
    rows: [
      ["System isolation / alarm bypass",
        "Inadvertent alarm activation",
        "False alarm causing building evacuation; disruption; financial penalty; relationship damage.",
        "4","5","20",
        "Notify monitoring centre and building manager in writing before isolation. Affix 'System Isolated' warning signs at control panel and all entry points. Confirm reset with monitoring centre at end of works.",
        "2","3","6", ""],
      ["Inspection of sprinkler heads and pipework",
        "Working at height",
        "Falls from ladders or mobile platforms. Falling tools/debris striking persons below.",
        "4","6","24",
        "Use correct access equipment (stepladders/tower/MEWP). Inspect before use. Exclusion zone beneath. Operatives to wear hard hats and harness where required. No overreaching.",
        "2","4","8", ""],
      ["Water supply and pressure testing",
        "High pressure water / burst connection",
        "Injury from pressurised water. Water damage to building and contents. Slipping hazard.",
        "3","5","15",
        "Use calibrated gauges. Check all connections before pressurising. Ensure drain routes are clear. Mop up spills immediately. Operate pressure test from a safe distance.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Sprinkler System Servicing",
    engineerNames, siteLocTrunc,
    rows: [
      ["Electrical alarm components (pressure switches, flow switches)",
        "Electric shock / short circuit",
        "Serious injury or fatality from contact with live electrical components.",
        "2","6","12",
        "Switch off and isolate electrical supply before working on any electrical component. Use insulated tools. Test before touch. Only competent persons to work on electrical equipment.",
        "1","5","5", "Confirm isolation with multimeter."],
      ["All tasks",
        "Incompetence / defective tools",
        "Eye injury, lacerations to hands, various.",
        "1","2","2",
        "Tools must be visually inspected prior to use and be fit for purpose. All power tools PAT tested.",
        "1","2","2", "Correct PPE must be worn: safety goggles and gloves."],
      ["All tasks",
        "Slips, trips and falls on wet floors",
        "Musculoskeletal injury, head injury, fractures.",
        "4","5","20",
        "Mop up water spills immediately. Use wet floor signs. Wear slip-resistant footwear. Good housekeeping throughout.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Sprinkler System Servicing",
    engineerNames, siteLocTrunc,
    rows: [
      ["All tasks",
        "Moving plant / traffic / pedestrians",
        "Collision with vehicles. Struck by moving materials.",
        "5","7","35",
        "Traffic and pedestrian routes to be clearly defined. Vehicles/plant should have Banksmen on site. Operatives to have received site induction.",
        "2","7","14", "All operatives to keep up to date with site changes."],
      ["All tasks",
        "Working adjacent other trades",
        "Contact with electrical operations, manual handling, vehicle movements.",
        "5","7","35",
        "Close liaison with other contractors. Daily project briefs between contractors. Adherence to site rules.",
        "2","5","10", ""],
      ["All tasks",
        "Manual handling",
        "Musculoskeletal disorders and other injuries.",
        "1","2","2",
        "All operatives must have manual handling training. Never lift beyond personal capability. Consider task, load, individual capability and environment.",
        "2","5","10", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  // Final risk page with detail block
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  let y = 39;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, 105, y, { align: "center" }); doc.setTextColor(0, 0, 0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Sprinkler System Servicing", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Building occupants / other trades", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;
  y = riskTableHeader(doc, rC, y);
  y = riskRow(doc, [
    "Human Factors",
    "Inappropriate behaviour / overconfidence",
    "Activity may exceed capability of personnel.",
    "1","2","2",
    "Site induction. Competent supervisor (SSSTS) to be highly visible. All personnel to embrace behavioural safety training.",
    "2","2","4",
    "All working personnel to have CSCS cards and relevant trade certificates."
  ], rC, y, 0, false);
  y = riskRow(doc, [
    "Manual handling / ergonomic operations",
    "Moving, pulling, pushing of tools, equipment and materials",
    "Musculoskeletal disorders and other injuries.",
    "1","2","2",
    "Manual handling training mandatory. Never lift beyond personal capability. Mechanical aids where required.",
    "2","5","10",
    "Additional info on HSE website www.hse.gov.uk/msd."
  ], rC, y, 0, false);
  y += 4;
  const fieldRowH = 8, labelColW = 55;
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  for (const [label, val] of [
    ["Assessment Date:", datePrepared], ["Review Date:", "12 monthly"],
    ["Client:", clientName], ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ] as [string, string][]) {
    doc.rect(ML, y, CONTENT_W, fieldRowH); doc.rect(ML, y, labelColW, fieldRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal"); doc.text(val, ML + labelColW + 2, y + 5);
    y += fieldRowH;
  }
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 58);
  pageFooter(doc, pageRef.num++, TOTAL_PAGES);

  // Sign-off page
  await buildSignOffPage(doc, logoImg, operatives, "Sprinkler System Specialist", pageRef.num, TOTAL_PAGES);

  return finaliseAndReturn(doc, jobInfo, "sprinkler-rams");
}

/* ══════════════════════════════════════════════════ FIRE EXTINGUISHER ══ */

export async function generateExtinguisherRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers: { name: string; sig: string; date: string }[] = []
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoImg = await loadLogoImage();
  const TOTAL_PAGES = 10;

  const { datePrepared, clientName, attendanceDate, siteLocation, engineerNames, operatives } =
    await buildCoverPage(doc, logoImg, formData, jobInfo, {
      title1: "Fire Extinguisher Servicing & Inspection",
      title2: "Fire Extinguisher Annual Service",
      operationTask: "Annual service, extended service and inspection of portable fire extinguishers.",
    }, assignedEngineers);

  const siteLocTrunc = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") +
    (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");

  const pageRef = { num: 1 };
  await buildSharedMethodSections(doc, logoImg, {
    descriptionOfWork: "Annual service and extended service of all portable fire extinguisher types (water, foam, CO2, dry powder, wet chemical, water mist) in accordance with BS 5306-3 and manufacturer's guidelines.",
    sequenceOfOps: [
      "All working personnel must have received site induction and a RAMS briefing before works commence.",
      "Personnel will sign in via main security and the Viva Fire Daily Sign-In register.",
      "All operatives must hold a current BAFE SP101 (or equivalent) fire extinguisher service qualification.",
      "Obtain a site plan or schedule of extinguisher locations before commencing.",
      "All deliveries of replacement extinguishers/charges must be pre-booked with 48 hours' notice.",
    ],
    taskSpecificOps: [
      "Check extinguisher location against the site plan. Record location reference.",
      "Inspect the extinguisher body for dents, corrosion, damage or discharge residue. Check the label is legible and the service history tag is present.",
      "Check the pressure indicator (if fitted) is in the correct zone. Weigh CO2 and powder extinguishers and compare to manufacturer's specification.",
      "Check the safety pin and tamper indicator seal are intact and in good order.",
      "Inspect the hose/horn and discharge nozzle for blockage or damage.",
      "For extended service (as per BS 5306-3 schedule): discharge the extinguisher, inspect internals, replace O-rings, seals and dip tubes, refill/recharge to manufacturer's specification.",
      "Carry out a hydraulic pressure test on extinguishers due (as per manufacturer's schedule). Condemn any unit that fails.",
      "Fit a new tamper indicator seal.",
      "Affix a new annual service label showing date, technician name, and next service due.",
      "Update the site service register.",
      "Dispose of old charges, cartridges and condemned extinguishers in accordance with COSHH and waste regulations.",
      "Issue a written service report to the client.",
      "Leave work area clean and tidy.",
    ],
    location: "Throughout the building — corridors, stairwells, plant rooms, car parks and all designated extinguisher mounting points.",
    resources: "Minimum of: 1 Operative (BAFE SP101 qualified). 2 operatives for large sites.",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      "Hand tools and extinguisher service kit",
      "Calibrated pressure gauge",
      "Weighing scales (±50g accuracy)",
      "Recharge cylinders (CO2, powder, foam, water)",
      "Hydraulic test pump and gauge (for 5-year tests)",
      "COSHH containers for safe discharge waste",
      "Service label printer / labels",
    ],
    significantRisks: [
      "Pressurised containers", "CO2 asphyxiation risk", "Dry powder inhalation",
      "Handling chemicals (foam/wet chemical)", "Manual handling", "Slips/trips/falls",
      "Working in confined spaces", "Burns from CO2 (cold discharge)",
    ],
    specialTraining: "BAFE SP101 Fire Extinguisher Technician – all servicing operatives. SSSTS – Martin Whatmough. All operatives hold current CSCS cards.",
  }, pageRef, TOTAL_PAGES);

  const riskTitle = "Risk Assessment for Fire Extinguisher Servicing & Inspection";
  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Extinguisher Annual Service",
    engineerNames, siteLocTrunc,
    rows: [
      ["Handling pressurised extinguishers",
        "Pressurised container failure",
        "Serious injury from sudden pressure release, flying debris or body rupture.",
        "2","6","12",
        "Inspect every extinguisher for damage before handling. Never service damaged or deformed cylinders. Condemn and quarantine any suspect unit. Only use approved charging equipment.",
        "1","5","5", "Report all condemned units to the client in writing."],
      ["Discharging CO2 extinguishers",
        "Asphyxiation / CO2 build-up",
        "Loss of consciousness or fatality if CO2 discharges in a confined space.",
        "4","6","24",
        "Only discharge CO2 in well-ventilated areas. Never discharge inside confined spaces. Wear appropriate RPE where ventilation is limited. Keep bystanders clear.",
        "2","4","8", "Monitor ventilation continuously."],
      ["Handling dry powder extinguishers",
        "Inhalation of powder agent",
        "Respiratory irritation, coughing, asthma attack. Severe reactions in susceptible individuals.",
        "3","4","12",
        "Discharge dry powder only in open or well-ventilated areas. Wear FFP2 dust mask and eye protection. Minimise airborne dust. Clean up spillage immediately.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Extinguisher Annual Service",
    engineerNames, siteLocTrunc,
    rows: [
      ["Handling foam and wet chemical agents",
        "Skin and eye contact with chemicals",
        "Chemical burns to skin and eyes. Irritation of mucous membranes.",
        "3","4","12",
        "Wear nitrile gloves and safety glasses/goggles. Avoid skin contact. Have eye wash station accessible. Refer to agent COSHH data sheet.",
        "2","3","6", ""],
      ["CO2 horn / discharge nozzle",
        "Cold burn / cryogenic contact",
        "Frostbite or cold burns to hands and skin from CO2 expansion.",
        "3","4","12",
        "Wear insulating gloves when handling CO2 discharge horn. Never place hand over horn during discharge. Brief all operatives before extended service discharge.",
        "1","3","3", ""],
      ["All tasks",
        "Manual handling",
        "Musculoskeletal disorders; back injury from lifting heavy extinguishers.",
        "3","5","15",
        "Use correct manual handling techniques. Two-person lift for units over 25 kg. Use trolleys where available. Brief operatives on team-lift procedures.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Extinguisher Annual Service",
    engineerNames, siteLocTrunc,
    rows: [
      ["All tasks",
        "Working in public areas (corridors, reception etc.)",
        "Injury to members of the public from equipment, extinguisher operation or slipping.",
        "4","5","20",
        "Cordon off work area where possible. Use wet floor signs. Keep equipment close together. Minimise discharge testing in occupied areas.",
        "2","3","6", ""],
      ["Hydraulic pressure testing",
        "High pressure water / vessel failure",
        "Injury from pressurised water or vessel rupture during pressure test.",
        "3","6","18",
        "Use calibrated test equipment. Inspect vessel before test. Operate from behind suitable protection. Do not leave vessel unattended under pressure.",
        "1","5","5", ""],
      ["All tasks",
        "Slips, trips and falls",
        "Injury from wet floors, trailing hoses, equipment left in walkways.",
        "4","4","16",
        "Keep work area tidy. Remove all equipment from walkways when not in use. Wear slip-resistant footwear.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  // Final risk page with detail block
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  let y = 39;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, 105, y, { align: "center" }); doc.setTextColor(0, 0, 0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Fire Extinguisher Annual Service", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Building occupants / public", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;
  y = riskTableHeader(doc, rC, y);
  y = riskRow(doc, [
    "Human Factors", "Complacency with familiar tasks",
    "Errors with pressurised equipment due to routine familiarity.",
    "2","4","8",
    "Toolbox talks reinforcing correct procedures. Supervisor spot-checks.",
    "1","3","3", ""
  ], rC, y, 0, false);
  y = riskRow(doc, [
    "Manual handling / ergonomic operations",
    "Moving, pulling, pushing of equipment",
    "Musculoskeletal disorders and other injuries.",
    "1","2","2",
    "Manual handling training mandatory. Never lift beyond capability.",
    "2","5","10",
    "HSE www.hse.gov.uk/msd."
  ], rC, y, 0, false);
  y += 4;
  const fRowH = 8, lColW = 55;
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  for (const [label, val] of [
    ["Assessment Date:", datePrepared], ["Review Date:", "12 monthly"],
    ["Client:", clientName], ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ] as [string, string][]) {
    doc.rect(ML, y, CONTENT_W, fRowH); doc.rect(ML, y, lColW, fRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal"); doc.text(val, ML + lColW + 2, y + 5);
    y += fRowH;
  }
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 58);
  pageFooter(doc, pageRef.num++, TOTAL_PAGES);

  await buildSignOffPage(doc, logoImg, operatives, "Fire Extinguisher Service Specialist", pageRef.num, TOTAL_PAGES);

  return finaliseAndReturn(doc, jobInfo, "extinguisher-rams");
}

/* ══════════════════════════════════════════════════════ FIRE HYDRANT ══ */

export async function generateHydrantRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers: { name: string; sig: string; date: string }[] = []
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoImg = await loadLogoImage();
  const TOTAL_PAGES = 10;

  const { datePrepared, clientName, attendanceDate, siteLocation, engineerNames, operatives } =
    await buildCoverPage(doc, logoImg, formData, jobInfo, {
      title1: "Fire Hydrant Inspection & Testing",
      title2: "Fire Hydrant Annual Inspection & Flow Test",
      operationTask: "Annual inspection, operational check and flow testing of underground fire hydrants.",
    }, assignedEngineers);

  const siteLocTrunc = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") +
    (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");

  const pageRef = { num: 1 };
  await buildSharedMethodSections(doc, logoImg, {
    descriptionOfWork: "Annual inspection, operational check and flow test of underground fire hydrants in accordance with BS 750, Water Industry Act 1991 and relevant water authority specifications.",
    sequenceOfOps: [
      "All working personnel must have received site induction and a RAMS briefing from the Viva Fire supervisor before works commence.",
      "Personnel will sign in via main security and the Viva Fire Daily Sign-In register.",
      "All operatives must be competent in hydrant operation and aware of water main locations.",
      "Notify the relevant water authority and site management before commencing work on any hydrant.",
      "Check for and comply with any Road Traffic Regulation Act requirements. Apply for a road opening notice if required.",
    ],
    taskSpecificOps: [
      "Set up appropriate traffic management: cones, signs and barriers as required by the highway authority.",
      "Locate the hydrant using the hydrant indicator plate and site drawings.",
      "Lift the surface box cover carefully. Check for confined space indicators (water/gas ingress, lack of ventilation).",
      "Carry out a full visual inspection: check surface box condition, depth to hydrant, condition of valve spindle/nut, marker post and signage.",
      "Check for obstruction within 3m of the hydrant.",
      "Attach a standpipe using a hydrant key. Open the valve slowly and check operation.",
      "Record static pressure before flow test.",
      "Open the hydrant to flow and record flowing pressure and flow rate using a pitot gauge.",
      "Monitor the surrounding area for surface water egress, signs of main leak or erosion during flow.",
      "Close the hydrant slowly. Check the self-draining mechanism operates correctly (where fitted).",
      "Replace surface box cover and ensure it is secure and flush.",
      "Update the hydrant record/plate and inform the water authority or highway authority of any defects.",
      "Issue a written inspection report and certificate to the client.",
      "Remove all traffic management. Leave the area clean and safe.",
    ],
    location: "Public highway, private road, car parks, estates and other locations as per the hydrant schedule.",
    resources: "Minimum of: 2 Operatives. 1 traffic management operative where road works are required.",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      "Hydrant standpipe and hydrant key",
      "Pitot gauge (calibrated)",
      "Pressure gauges (calibrated)",
      "Traffic management kit (cones, signs, barriers)",
      "Surface box key / cover lifter",
      "Confined space gas detector",
      "Camera / inspection torch",
    ],
    significantRisks: [
      "Traffic / moving vehicles", "Underground services (gas, electric, telecoms)",
      "Water main pressure", "Confined space / underground chamber",
      "Manual handling (heavy covers)", "Slips/trips/falls on wet road",
      "Flooding / surface water egress", "Lone working",
    ],
    specialTraining: "SSSTS – Martin Whatmough. Street Works (NRSWA) Unit 2 – relevant operatives. Confined space awareness. All operatives hold current CSCS cards.",
  }, pageRef, TOTAL_PAGES);

  const riskTitle = "Risk Assessment for Fire Hydrant Inspection & Flow Testing";
  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Hydrant Annual Inspection",
    engineerNames, siteLocTrunc,
    rows: [
      ["Working in or adjacent to the public highway",
        "Moving vehicles and traffic",
        "Operative struck by vehicle. Serious injury or fatality.",
        "5","7","35",
        "Implement correct traffic management before starting work (cones, signs, stop/go boards). Follow Chapter 8 Traffic Signs Manual. NRSWA Unit 2 required for operatives on the highway. Never work without traffic management in place.",
        "2","5","10", "Road opening notice required if applicable."],
      ["Lifting heavy surface box / cover",
        "Manual handling — heavy lid",
        "Back injury, musculoskeletal disorders, crush injury to hands.",
        "4","5","20",
        "Use purpose-built cover lifter or crowbar. Two-person lift if over 20 kg. Wear steel toe-capped boots. Do not place fingers under cover edge.",
        "2","4","8", ""],
      ["Underground services (gas, electricity, telecoms, water)",
        "Striking a buried service",
        "Electric shock, explosion, gas release, injury or fatality.",
        "3","7","21",
        "Check drawing records. Use CAT and Genny detection before any ground disturbance. Follow Permit to Dig requirements. Do not excavate within safe zone without manual potholing.",
        "2","6","12", "Call Before You Dig — 0800 023 2023."],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Hydrant Annual Inspection",
    engineerNames, siteLocTrunc,
    rows: [
      ["Flow testing — high pressure water main",
        "High pressure water discharge",
        "Injury from uncontrolled water jet. Water damage to surrounding property.",
        "3","5","15",
        "Open valve slowly and incrementally. Ensure flow outlet is directed safely away from the public and property. Stand to the side of the standpipe. Monitor for main bursts.",
        "2","3","6", "Stop flow test if signs of main burst or ground movement."],
      ["Underground chamber / confined space",
        "Confined space hazards (gas, lack of oxygen)",
        "Asphyxiation, explosion or toxic gas poisoning.",
        "3","6","18",
        "Carry out gas detection before and during entry. Only enter confined spaces with a permit to work. Buddy system — no lone working in chambers. Use appropriate RPE.",
        "1","5","5", "Confined space entry prohibited without permit."],
      ["Surface water / flooding",
        "Slipping on wet road surface",
        "Falls causing injury. Slip hazard to the public.",
        "4","4","16",
        "Wear slip-resistant safety boots. Use wet surface warning signs. Keep public away from work area. Mop up excess water.",
        "2","3","6", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Fire Hydrant Annual Inspection",
    engineerNames, siteLocTrunc,
    rows: [
      ["All tasks",
        "Moving plant / delivery vehicles",
        "Collision with vehicles. Struck by moving materials.",
        "5","7","35",
        "Traffic and pedestrian routes to be clearly defined. Follow site rules. Comply with traffic management plan at all times.",
        "2","7","14", ""],
      ["All tasks",
        "Working adjacent other trades / public",
        "Contact with or injury to public or other contractors.",
        "5","6","30",
        "Exclusion zones to be set up around work area. Signage in place. Liaise with other contractors and site management.",
        "2","5","10", ""],
      ["All tasks",
        "Manual handling",
        "Musculoskeletal disorders and other injuries.",
        "1","2","2",
        "All operatives to have manual handling training. Never lift beyond personal capability.",
        "2","5","10", ""],
    ]
  }, pageRef.num++, TOTAL_PAGES, rC);

  // Final risk page with detail block
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  let y = 39;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, 105, y, { align: "center" }); doc.setTextColor(0, 0, 0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Fire Hydrant Annual Inspection", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Public / highway users", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;
  y = riskTableHeader(doc, rC, y);
  y = riskRow(doc, [
    "Human Factors", "Complacency on familiar highway works",
    "Traffic management removed prematurely; injury to operative or public.",
    "3","6","18",
    "Toolbox talks on traffic management compliance. Supervisor to check TM in place before each task. Never remove TM without supervisor authorisation.",
    "1","5","5", ""
  ], rC, y, 0, false);
  y = riskRow(doc, [
    "Manual handling / ergonomic operations",
    "Moving, pulling, pushing of standpipes and equipment",
    "Musculoskeletal disorders and other injuries.",
    "1","2","2",
    "Manual handling training mandatory. Never lift beyond personal capability. Use mechanical aids.",
    "2","5","10",
    "HSE www.hse.gov.uk/msd."
  ], rC, y, 0, false);
  y += 4;
  const hRowH = 8, hColW = 55;
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  for (const [label, val] of [
    ["Assessment Date:", datePrepared], ["Review Date:", "12 monthly"],
    ["Client:", clientName], ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ] as [string, string][]) {
    doc.rect(ML, y, CONTENT_W, hRowH); doc.rect(ML, y, hColW, hRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal"); doc.text(val, ML + hColW + 2, y + 5);
    y += hRowH;
  }
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 58);
  pageFooter(doc, pageRef.num++, TOTAL_PAGES);

  await buildSignOffPage(doc, logoImg, operatives, "Fire Hydrant Specialist", pageRef.num, TOTAL_PAGES);

  return finaliseAndReturn(doc, jobInfo, "hydrant-rams");
}

/* ══════════════════════════════════════════ DRY RISER INSTALLATION ══ */

export async function generateInstallationRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null,
  assignedEngineers: { name: string; sig: string; date: string }[] = []
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoImg = await loadLogoImage();
  const TOTAL_PAGES = 10;

  // Cover page
  const { datePrepared, clientName, attendanceDate, siteLocation, engineerNames, operatives } =
    await buildCoverPage(doc, logoImg, formData, jobInfo, {
      title1: "Supply & Installation of Dry Riser System",
      title2: "Dry Riser Installation",
      operationTask: "Supply, installation, pressure testing and commissioning of dry riser systems.",
    }, assignedEngineers);

  const siteLocTrunc = doc.splitTextToSize(siteLocation, CONTENT_W - 30).slice(0, 1).join("") +
    (doc.splitTextToSize(siteLocation, CONTENT_W - 30).length > 1 ? "…" : "");

  // Method statement pages 1–5
  const pageRef = { num: 1 };
  await buildSharedMethodSections(doc, logoImg, {
    descriptionOfWork: `Supply, install and commission dry riser system(s) in accordance with BS 9990:2015 and the latest revision of the Viva Fire working drawings.`,
    sequenceOfOps: [
      "All working personnel must have received site induction from the Principal Contractor and a RAMS briefing from the Viva Fire site supervisor before works commence.",
      "Personnel will be required to sign in via main security following the Principal Contractor procedures in place, then into the daily sign-in register.",
      "All working personnel must be able to demonstrate they have the correct skill set and certification before works commence.",
      "A common appreciation of plant and pedestrians (who retain priority) must be observed and followed before moving about site.",
      "All deliveries of materials must be pre-booked with the Principal Contractor Zone Manager with 48 hours' notice given.",
      "Check available timeslots for deliveries in the site office. All deliveries will be supervised by a competent banksman; delivery drivers must remain in vehicle if they do not have suitable PPE.",
      "The delivery vehicle must deploy hazard lights/flashing beacon and any audible warning system if fitted.",
      "All personnel must be familiar with manual handling techniques and never lift beyond personal capability.",
      "Operatives will use Mobile Towers and Podiums (with fitted hand rails only) for access at high level. Towers must carry an EU mark, be inspected before use, and erected/dismantled by a PASMA trained operative. A scaff tag system will be deployed and signed off weekly.",
      "Proceed to the work area and carry out a site safety check. Remove any debris or obstructions with permission of the Principal Contractor.",
      "Set up working area in an agreed and safe position after consultation with the Principal Contractor supervisor/manager.",
    ],
    taskSpecificOps: [
      "Ensure that all drawings are to construction status prior to commencing with any site works.",
      "Viva Fire will have a storage area on site (location TBC). On a daily basis, pipework and materials shall be taken into the building and stored as close as practical to the work area on each floor.",
      "Erect the tower scaffold or 2-wheel podium platform for work at height.",
      "The holes through walls and floors shall be pre-drilled by others prior to installation of the pipework.",
      "The dry riser pipework, fittings, couplings and valves shall be installed in accordance with the latest revision of the Viva Fire working drawings.",
      "All pipework shall be installed in individual sections and connected using mechanical couplings and fittings.",
      "Each pipe shall be correctly connected and securely fixed into position with pipe brackets prior to the installation of the next pipe.",
      "All pipework shall be supported from structural floors/ceilings using brackets independent of other services unless otherwise agreed.",
      "The brackets for the riser pipework shall be fixed to floors/ceilings using concrete anchors or Hilti screws.",
      "The vertical pipework shall be installed connecting each floor level of the building using mechanical pipe couplings and fittings.",
      "Permits to work will be obtained when required before any work commences — hot works permits are required for cutting 100mm galvanised pipe.",
      "Pipework fabricated on site using a chop saw and grooving machine; machine to be secured when not in use and enclosed with barriers during use.",
      "Each section of vertical pipe shall be installed by two operatives — one supporting the pipework while the other securely clamps and connects.",
      "The dry riser pipework shall have a picture tee fitting on each floor for connection of a landing valve.",
      "An air release valve shall be installed at the highest point of each system's pipework.",
      "Each landing valve shall be housed in a cabinet securely fastened to the wall.",
      "Pipework that is to be concealed shall not be enclosed until after it has been pressure tested.",
      "Prior to testing, advise the Principal Contractor and obtain a Permit to Work. Inspect all pipework for open ends — plug or cap any open pipe ends.",
      "Using a test pump with all ends sealed, charge the pipework with water to 12 bar standing pressure for 15 minutes. Monitor pressure and inspect joints for leaks.",
      "Where leaks are detected, drain the system, rectify leaks, and repeat the pressure test.",
      "When testing is complete, fully drain the system, close drain valves, and remove hose.",
      "Issue the Viva Fire 'Pipework Test Report' sheet for each test. Certificate to be signed by the senior operative and the Principal Contractor's responsible person.",
      "Descend Mobile Tower/Podium on completion of each task.",
      "Leave work area clean and tidy on a progressive basis. Inspection check by supervisor.",
    ],
    location: "Ground floor and all levels stair lobbies / riser routes throughout the building.",
    resources: "Minimum of: 1 operative & 1 supervisor per working sequence. Some tasks (e.g. installing valves and boxes) can be carried out by 1 supervisor.",
    personnel: "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith",
    plantAndEquipment: [
      "Mobile Scaffold Tower, Podium platforms",
      "Chop saw (dry diamond tip)",
      "Hilti Battery hammer drill c/w vacuum",
      "Rigid 933 machine and 916 roll groover",
      "Hilti Ratchet gun and sockets",
      "Hand tools — various spanners, hammer, punch, hacksaw, tape measures",
      "Portable pressure test pump and calibrated gauge",
    ],
    significantRisks: [
      "Falls from height (tower/podium)",
      "Electric shock",
      "Potential collapse of tower/podium",
      "Eye injury from drilling/cutting",
      "Lacerations to hands",
      "Manual handling / ergonomics",
      "Slips, trips and falls",
      "Noise from drilling/cutting",
      "Hand arm vibration (HAVS)",
      "Dust (silica dust from drilling)",
      "Unloading/loading of vehicles",
      "Hazardous substances (COSHH)",
    ],
    specialTraining: "IOSH Managing Safely – Managers. SSSTS – Supervisors. PASMA – Mobile Tower Erectors. IPAF 1a 1b – Where applicable. CSCS – All operatives. Manual Handling – All operatives. Dale Booth: IOSH MSC, CSCS, IPAF. Martin Whatmough: SSSTS, IOSH passport to work, CSCS, IPAF.",
  }, pageRef, TOTAL_PAGES);

  // Risk assessment pages 6–9
  const riskTitle = "Risk Assessment for Dry Riser Installation";
  const rC = [22, 20, 28, 6, 6, 8, 42, 6, 6, 8, 30];

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Dry Riser Installation",
    engineerNames, siteLocTrunc,
    rows: [
      ["Working at height — Mobile Tower",
        "Falls from height during erection or use",
        "Falls from mobile tower by operatives. Falling tools or debris striking persons below.",
        "5","6","30",
        "Only PASMA trained operatives to erect/dismantle mobile tower. Scaff tag system deployed and signed if moved or every 7 days. Working area checked for obstacles; surface must be flat. Brakes applied at all times. Exclusion zone beneath tower. Hard hats worn by all in vicinity.",
        "2","6","12", ""],
      ["Working at height — Podium/Hop-Ups",
        "Operatives falling or being knocked from podium",
        "Falls from podium or hop-up causing serious injury.",
        "1","2","2",
        "Operatives must carry out a visual check of podium before every use. Deploy only on flat, even, clear surfaces. Podiums must be of industrial standard, fully extended. Only stand on working platform. Scaff-Tags completed weekly.",
        "1","2","2", ""],
      ["Working at height — Step Ladders",
        "Falls from stepladder",
        "Falls from stepladder causing serious injury.",
        "5","6","30",
        "Step ladders used only as last resort and under a daily permit issued by site foreman. Three points of contact required at all times. Ladders inspected before use, defects reported and quarantined. Heavy loads must not be carried up a ladder.",
        "2","6","12", ""],
    ],
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Dry Riser Installation",
    engineerNames, siteLocTrunc,
    rows: [
      ["Drilling / cutting operations",
        "Eye injury from flying debris, dust, or fragments",
        "Foreign bodies causing eye damage or loss of sight.",
        "1","2","2",
        "Safety goggles EN166 1F AS mandatory for all drilling and cutting operations. Dust kept to minimum. Toolbox talks to cover this topic. Adequate supervision.",
        "2","5","10", ""],
      ["Drilling / cutting operations",
        "Silica dust inhalation",
        "Respiratory disease and skin conditions. Silica dust is a significant health hazard.",
        "5","4","20",
        "FP3 dust masks mandatory for all drilling/cutting. Face-fit testing is mandatory for all operatives. Hilti vacuum used to capture dust at source. Good ventilation in work area maintained.",
        "2","4","8", ""],
      ["Drilling / cutting operations — HAVS",
        "Hand arm vibration from power tools",
        "HAVS — vibration white finger, carpal tunnel syndrome, permanent numbness, joint damage.",
        "5","5","25",
        "Power tools with lowest vibration selected. Hilti Drill EAV 37 mins, ELV 148 mins. Hilti Impact Drill EAV 750 mins, ELV 3000 mins. Job rotation to prevent over-exposure. Tools maintained and drill bits kept sharp. Operatives trained on risks of HAVS. Signs of injury to be reported immediately.",
        "2","5","10", ""],
    ],
  }, pageRef.num++, TOTAL_PAGES, rC);

  await buildRiskPage(doc, logoImg, {
    title: riskTitle, operationTask: "Dry Riser Installation",
    engineerNames, siteLocTrunc,
    rows: [
      ["Pressure testing pipework",
        "High pressure water / burst connection",
        "Injury from pressurised water. Water damage to building and contents.",
        "3","5","15",
        "Obtain Permit to Work before testing. Inspect all pipework and ensure no open ends. Check all drain valves closed. Use calibrated gauge (Certificate of Conformity issued). Charge to 12 bar for 15 minutes. Monitor pressure at test gauge. Inspect all joints for leaks. Principal Contractor representative to witness test.",
        "2","3","6", ""],
      ["Handling materials/tools with sharp edges",
        "Lacerations to hands and body",
        "Serious cuts from pipe ends, couplings, brackets and drill bits.",
        "5","7","35",
        "Gloves CE4131 to be worn at all times when handling pipework and materials. Attention paid to exposed sharp edges left by other contractors. Deploy correct manual handling techniques. All operatives to have had Manual Handling Training.",
        "2","7","14", "Never deviate from safe system of work."],
      ["Incompetence / defective tools",
        "Eye injury, lacerations, various",
        "Injuries from misuse or failure of tools.",
        "1","2","2",
        "All tools visually inspected prior to use and must be fit for purpose. Power tools PAT tested. All tools entered on PUWER register. Defective tools labelled and quarantined immediately.",
        "3","4","12", ""],
    ],
  }, pageRef.num++, TOTAL_PAGES, rC);

  // Final risk page with detail block
  newPage(doc);
  await pageHeader(doc, logoImg, "", 18);
  let y = 39;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(33, 61, 99);
  doc.text(riskTitle, 105, y, { align: "center" }); doc.setTextColor(0, 0, 0); y += 6;
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  labelValue(doc, "Operation/Task:", "Dry Riser Installation", ML, y, 28); y += 4.5;
  labelValue(doc, "Employees at Risk:", engineerNames, ML, y, 32); y += 4.5;
  labelValue(doc, "Location/Area:", siteLocTrunc, ML, y, 26); y += 4.5;
  labelValue(doc, "Other Persons at Risk:", "Other nearby contractors, public", ML, y, 36); y += 4.5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 18); y += 4.5;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 46); y += 6;
  y = riskTableHeader(doc, rC, y);
  y = riskRow(doc, [
    "Moving plant / traffic / pedestrians",
    "Collision with vehicles or moving materials",
    "Struck by moving plant. Injury or fatality.",
    "5","7","35",
    "Traffic and pedestrian routes clearly defined and followed. Vehicles and plant to have banksmen on site. Operatives to keep up to date with site changes. Short cuts must never be taken. Extra care at crossing points.",
    "2","7","14",
    "All operatives to keep up to date with site changes regarding pedestrian routes as project progresses."
  ], rC, y, 0, false);
  y = riskRow(doc, [
    "Working adjacent other trades",
    "Contact with electrical operations, manual handling, vehicle movements",
    "Injury from adjacent contractor activities.",
    "5","7","35",
    "Close liaison with other contractors. Daily project briefs between contractors. Adherence to site rules. Particular attention to noise, dust, delivery schedules and common PPE standards. Report dangerous activities by other contractors to site management.",
    "2","5","10",
    ""
  ], rC, y, 0, false);
  y = riskRow(doc, [
    "Human Factors: Capabilities and Behavioural Safety",
    "Inappropriate behaviour / overconfidence",
    "Activity exceeds capability of personnel.",
    "1","2","2",
    "Site induction. Competent supervisor (SSSTS) highly visible. All personnel to embrace behavioural safety training. Prior to commencement all employees to have CSCS cards, trade specific training and IOSH Working Safely. All PPE of appropriate size and fit for the individual.",
    "1","2","4",
    "All working personnel to re-evaluate working practices as per IOSH behavioural safety training."
  ], rC, y, 0, false);
  y += 4;
  const fieldRowH = 8, labelColW = 55;
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  for (const [label, val] of [
    ["Assessment Date:", datePrepared], ["Review Date:", "3 monthly"],
    ["Client:", clientName], ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ] as [string, string][]) {
    doc.rect(ML, y, CONTENT_W, fieldRowH); doc.rect(ML, y, labelColW, fieldRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal"); doc.text(val, ML + labelColW + 2, y + 5);
    y += fieldRowH;
  }
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  riskColorLegend(doc, PAGE_H - 58);
  pageFooter(doc, pageRef.num++, TOTAL_PAGES);

  // Sign-off page
  await buildSignOffPage(doc, logoImg, operatives, "Dry Riser Installation Specialist", pageRef.num, TOTAL_PAGES);

  return finaliseAndReturn(doc, jobInfo, "installation-rams");
}
