import jsPDF from "jspdf";
import { loadWatermarkImage, addWatermarkToAllPages } from "@/lib/pdfWatermark";

export type RamsFormData = Record<string, any>;

interface RamsJobInfo {
  reference_number?: string;
  name?: string | null;
  customer?: string | null;
  customers?: { name: string } | null;
  address?: string | null;
  site?: { name: string; address: string | null } | null;
}

/* ─────────────────────────────────────────────────────────── helpers ── */

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 14;
const MR = 14;
const CONTENT_W = PAGE_W - ML - MR;

/** Add a new page and return y=top-of-content */
function newPage(doc: jsPDF): number {
  doc.addPage();
  return 18;
}

/** Thin horizontal rule */
function hr(doc: jsPDF, y: number, color = 180): void {
  doc.setDrawColor(color);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PAGE_W - MR, y);
}

/** Bold label + normal value on same line */
function labelValue(doc: jsPDF, label: string, value: string, x: number, y: number, labelW = 52): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(label, x, y);
  doc.setFont("helvetica", "normal");
  doc.text(value, x + labelW, y);
}

/** Wrapped paragraph */
function para(doc: jsPDF, text: string, x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * (size * 0.352778 + 1.2);
}

/** Section heading – bold, slight colour */
function sectionHeading(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(33, 61, 99);
  doc.text(text, ML, y);
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 1.5, 100);
  return y + 6;
}

/** Numbered list */
function numberedList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  for (let i = 0; i < items.length; i++) {
    const num = `${i + 1}.`;
    doc.text(num, x, y);
    const lines = doc.splitTextToSize(items[i], maxW - 6);
    doc.text(lines, x + 6, y);
    y += lines.length * (size * 0.352778 + 1.2);
  }
  return y;
}

/** Bullet list */
function bulletList(doc: jsPDF, items: string[], x: number, y: number, maxW: number, size = 8.5): number {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  for (const item of items) {
    doc.text("•", x, y);
    const lines = doc.splitTextToSize(item, maxW - 5);
    doc.text(lines, x + 5, y);
    y += lines.length * (size * 0.352778 + 1.2);
  }
  return y;
}

/** Page footer – page number */
function pageFooter(doc: jsPDF, pageNum: number, total: number): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Page ${pageNum} of ${total}`, PAGE_W / 2, PAGE_H - 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

/** Render the Vivafire logo header used on every page */
async function pageHeader(doc: jsPDF, logoImg: HTMLImageElement | null, title: string, y: number): Promise<number> {
  if (logoImg) {
    const lh = 14;
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    const lw = Math.min(lh * aspect, 50);
    doc.addImage(logoImg, "JPEG", ML, y, lw, lh);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(33, 61, 99);
    doc.text("VIVA FIRE PROTECTION LTD", ML, y + 8);
    doc.setTextColor(0, 0, 0);
  }
  // right-side subtitle stack
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(33, 61, 99);
  doc.text("Pressure Testing Pipework and Associated Fittings", PAGE_W - MR, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Method Statement & Risk Assessment", PAGE_W - MR, y + 10, { align: "right" });
  doc.text("Fire Protection Ltd", PAGE_W - MR, y + 14, { align: "right" });
  doc.setTextColor(0, 0, 0);
  hr(doc, y + 17, 60);
  return y + 21;
}

/** Risk table row – with optional colour coding based on last column rating value */
function riskRow(doc: jsPDF, cols: string[], widths: number[], y: number, rowH: number, bold = false): number {
  let x = ML;
  doc.setFontSize(7.5);

  // Colour code by rating (last column) if not header row
  if (!bold) {
    const ratingRaw = cols[cols.length - 1];
    const rating = parseInt(ratingRaw, 10);
    if (!isNaN(rating)) {
      let fillR = 255, fillG = 255, fillB = 255;
      if (rating >= 15) { fillR = 255; fillG = 180; fillB = 180; }       // High – red tint
      else if (rating >= 8) { fillR = 255; fillG = 220; fillB = 160; }   // Medium – amber tint
      else if (rating >= 4) { fillR = 255; fillG = 245; fillB = 180; }   // Low-medium – yellow tint
      else { fillR = 210; fillG = 240; fillB = 210; }                     // Low – green tint
      doc.setFillColor(fillR, fillG, fillB);
      doc.rect(ML, y, widths.reduce((a, b) => a + b, 0), rowH, "F");
    }
  } else {
    // Header row – blue-grey background
    doc.setFillColor(33, 61, 99);
    doc.rect(ML, y, widths.reduce((a, b) => a + b, 0), rowH, "F");
    doc.setTextColor(255, 255, 255);
  }

  for (let i = 0; i < cols.length; i++) {
    doc.setDrawColor(150);
    doc.rect(x, y, widths[i], rowH);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(cols[i], widths[i] - 2);
    doc.text(lines, x + 1, y + 3);
    x += widths[i];
  }

  if (bold) doc.setTextColor(0, 0, 0);
  return y + rowH;
}

/** Signature line: name, sig image or blank line, date */
function signatureRow(
  doc: jsPDF,
  name: string,
  sigData: string | undefined,
  date: string,
  y: number
): number {
  const colW = CONTENT_W / 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  // Name cell
  doc.rect(ML, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Name:", ML + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(name || "____________________", ML + 12, y + 4);

  // Signature cell
  doc.rect(ML + colW, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Signature:", ML + colW + 1, y + 4); doc.setFont("helvetica", "normal");
  if (sigData && sigData.startsWith("data:image")) {
    try {
      doc.addImage(sigData, "PNG", ML + colW + 22, y + 1, 25, 9);
    } catch { /* skip */ }
  }

  // Date cell
  doc.rect(ML + colW * 2, y, colW, 12);
  doc.setFont("helvetica", "bold"); doc.text("Date:", ML + colW * 2 + 1, y + 4); doc.setFont("helvetica", "normal");
  doc.text(date || "____________________", ML + colW * 2 + 12, y + 4);

  return y + 14;
}

/* ══════════════════════════════════════════════════════════ main export ══ */

export async function generateRamsPdf(
  formData: RamsFormData,
  jobInfo: RamsJobInfo | null
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Load logo
  let logoImg: HTMLImageElement | null = null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej();
      img.src = "/images/vivafire-logo-new.jpg";
    });
    logoImg = img;
  } catch { /* no logo */ }

  // Extract variable fields from form data
  const contractName = formData["rams_contract_job_name"] || jobInfo?.name || "";
  const datePrepared = formData["rams_assessment_date"] || new Date().toLocaleDateString("en-GB");
  const clientName = formData["rams_client"] || jobInfo?.customers?.name || jobInfo?.customer || "";
  const attendanceDate = formData["rams_attendance_date"] || "";

  const operatives: { name: string; sig: string; date: string }[] = [];
  for (let i = 1; i <= 8; i++) {
    const n = formData[`rams_op${i}_name`] || "";
    const s = formData[`rams_op${i}_sig`] || "";
    const d = formData[`rams_op${i}_date`] || "";
    if (n || s || d) operatives.push({ name: n, sig: s, date: d });
  }

  /* ───────────────────────────────────────────── PAGE 1 – Cover ───── */
  let y = 20;

  // Big title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(33, 61, 99);
  doc.text("Pressure testing Pipework and associated fittings", PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(22);
  doc.text("VIVA", PAGE_W / 2, y, { align: "center" });
  y += 8;
  doc.setFontSize(13);
  doc.text("Method Statement & Risk Assessment", PAGE_W / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(14);
  doc.text("Fire Protection Ltd", PAGE_W / 2, y, { align: "center" });
  y += 7;
  doc.setFontSize(13);
  doc.text("Dry riser Pressure Testing", PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setTextColor(0, 0, 0);
  hr(doc, y, 60);
  y += 8;

  // Key details box
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  const detailBoxH = 50;
  doc.rect(ML, y, CONTENT_W, detailBoxH);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  labelValue(doc, "Operation / Task:", "Pressure testing Pipework and associated fittings.", ML + 3, y + 7);
  labelValue(doc, "Contract / Job Name:", contractName, ML + 3, y + 14);
  labelValue(doc, "Date Prepared / Revision:", datePrepared, ML + 3, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const reviewText = "Review date: This method statement and its associated risk assessments will be reviewed on an on-going basis for the duration of the works.";
  const reviewLines = doc.splitTextToSize(reviewText, CONTENT_W - 6);
  doc.text(reviewLines, ML + 3, y + 29);
  labelValue(doc, "Method Statement Written by:", "Martin Whatmough", ML + 3, y + 40);
  labelValue(doc, "Method Statement Approved by:", "Dale Booth", ML + 3, y + 47);
  y += detailBoxH + 8;

  y = await sectionH1(doc, y, logoImg, "1 Introduction");
  y = para(doc,
    "This Method Statement describes the specific safe working methods which will be used to carry out the work. It gives details of how the work will be carried out and what health and safety issues and controls are involved. The content of this Method Statement reflects the finding of the relevant Risk Assessment(s).",
    ML, y, CONTENT_W);
  y += 4;

  y = await sectionH1(doc, y, logoImg, "2 Description of Work");
  y = para(doc, "Commissioning tests of Dry Riser systems", ML, y, CONTENT_W);
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Time", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Site Working Hours:", ML, y); y += 4;
  y = bulletList(doc, [
    "Monday to Friday: 6:00am to 8:00pm",
    "Saturday: 8:00am to 12:30pm",
    "Sunday: None (Inc. Bank Holidays)"
  ], ML + 3, y, CONTENT_W - 3);
  y = para(doc, "Any additional hours will need to be approved by main contractor.", ML, y + 1, CONTENT_W);
  y += 3;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.1 Duration", ML, y); y += 5;
  y = para(doc,
    "All works will be supervised at every stage by a competent qualified supervisor. Martin Whatmough will be responsible for the day-to-day supervision of Viva Fire Protection personnel and sub-contractors on site.",
    ML, y, CONTENT_W);
  y += 2;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.text("Name: Dale Booth   Mob: 07801269206   Email: sales@vivafire.co.uk", ML, y); y += 4.5;
  doc.text("Name: Martin Whatmough   Mob: 07989436509   Email: martin.whatmough@vivafire.co.uk", ML, y); y += 6;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.2 Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, [
    "All working personnel must have received site Induction from Principal Contractor and Viva Fire the first day of attending, the operatives will also receive a RAMs briefing from the Viva Fire site supervisor following the site induction from Principal Contractor before works commence.",
    "Personnel will be required to sign in via main security. Then into the Viva Fire Daily Sign in register.",
    "All working personnel must be able to demonstrate they have the correct skill set/certification before works commence.",
    "A common appreciation of plant and pedestrians (who retain priority) must be observed and followed before moving about site.",
    "All deliveries of materials must be pre booked with Principal Contractor with 48 hours' notice given.",
  ], ML + 2, y, CONTENT_W - 2);

  pageFooter(doc, 1, 10);

  /* ───────────────────────────────────────────── PAGE 2 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.3 Task Specific Sequence of Operations", ML, y); y += 5;
  y = numberedList(doc, [
    "Check available timeslots for deliveries in the site office, with assessment of what is being delivered, what it weights, how will it be unloaded, what kind of materials are being delivered, how will it be stored, where will it be stored, do any special precautions need to be taken, will mechanical lifting aids need to be used. All deliveries will be supervised by main contractor Competent Banksman, and the delivery drivers must remain in vehicle if they do not have suitable PPE.",
    "The delivery vehicle must deploy hazard lights/flashing beacon and any audible warning system if fitted. Extra care must be taken at this time and a suitable safe zone placed around the delivery vehicle/delivery area.",
    "All personnel must be familiar and competent with manual handling techniques and never lift beyond personnel capability. If in doubt, ask and refer to risk assessment included on page 14/15. The materials being used on this job are not envisaged to require mechanical lifting assistance.",
    "Proceed to the work area and carry out a site safety check with regards the working area. Remove any debris or obstructions with the express permission of Viva Fire.",
    "Set up working area in an agreed and safe position after consultation with Viva Fire site supervisor/manager.",
    "Testing of the systems will be in accordance with BS9990 2006.",
    "Hydraulic testing/commissioning will be applied on all pipework for a period of 15 minutes at a pressure of 12 Bar, water to be made freely available by the main contractor.",
    "Access for a vehicle carrying tank and all testing equipment will be needed close to the dry riser inlet locations.",
    "Operative to agree with site supervisor testing parameters and testing durations before test begins.",
    "Operative and supervisor to check calibration certification of tester to be used.",
    "Operatives to visually check all pipework, joints and brackets before testing begins.",
    "Operative to monitor the test from a safe area.",
    "Pressure tests to be witnessed by client's representative and/or main contractors' representative and upon satisfactory completion, a test/commissioning report and certificate will be issued.",
    "Pressure to be removed from system after agreed time and witnessed by a third party.",
    "Test water to be drained off into suitable location determined by supervisor.",
    "Leave work area clean and tidy.",
    "Move to next area.",
    "Repeat Process.",
  ], ML + 2, y, CONTENT_W - 2);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.4 Location", ML, y); y += 4;
  y = para(doc, "Block's / Stair cores / Dry Risers", ML, y, CONTENT_W); y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("2.5 Access and Egress", ML, y); y += 4;
  y = para(doc,
    "Access and egress must be kept open to site at all times for authorised personnel. All Principal Contractor rules regarding access and egress must be followed by Viva Fire operatives and sub-contractors at all times whilst on site with no deviation being permitted. All Viva Fire personnel and sub-contractors must make themselves familiar with site rules and entrance/exit points at induction and ensure they sign in and out at all times, whilst always being vigilant and report any potential problems immediately to site management.",
    ML, y, CONTENT_W);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3 Resources", ML, y); y += 4;
  y = para(doc, "Minimum of: 2 Operatives", ML, y, CONTENT_W); y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.1 Personnel", ML, y); y += 4;
  y = para(doc, "Dale Booth, Martin Whatmough, Daniel Hall, Thomas Vernon, Devon Dunkerley, Calvin Whittaker, Mark Roberts, Wayne Smith, James Ogg", ML, y, CONTENT_W);
  pageFooter(doc, 2, 10);

  /* ───────────────────────────────────────────── PAGE 3 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.2 Supervision", ML, y); y += 4;
  y = para(doc, "NAME AND CONTACT: Mr Martin Whatmough (SSSTS), Tel: 07989436509", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("3.3 Plant and Equipment", ML, y); y += 4;
  y = bulletList(doc, [
    "Hand Tools",
    "65mm hoses.",
    "Portable ex-fire service pump, petrol.",
    "1000L water tank.",
    "Hydrant stand pipe and hydrant key.",
    "16 bar Pressure gauge test arrangement.",
  ], ML + 3, y, CONTENT_W - 3);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4 Assessment of Significant Risks for all Tasks", ML, y); y += 4;
  y = numberedList(doc, [
    "High Pressure", "Water", "Bursting", "Manual Handling", "Collisions",
    "Cuts to hands", "Noise", "Slips/trips/falls", "Other Trades", "Deliveries to site"
  ], ML + 2, y, CONTENT_W / 2 - 2);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.1 COSHH", ML, y); y += 4;
  y = para(doc, "N/A", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.2 Security", ML, y); y += 4;
  y = para(doc,
    "Site security will be Principal Contractor responsibility but all Viva Fire personnel and sub-contractors on site must play their part and cooperate fully. They must also keep all equipment/tools safe and secure.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.3 Special Training", ML, y); y += 4;
  y = para(doc, "SSSTS - Martin Whatmough", ML, y, CONTENT_W); y += 1;
  y = para(doc, "All operatives have current JIB (CSCS) working safely (inclusive of behavioural safety Module)", ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "All Viva Fire on site personnel and Sub-contractors have current CSCS cards and the necessary trade specific training to carry out their working tasks safely and professionally.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "When Viva Fire on site personnel have been allocated for the works, all operatives will produce CSCS card at the time of the induction on site.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("4.4 References to Environmental Aspects and Impacts Register control measures.", ML, y); y += 4;
  y = para(doc, "N/A.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("5 PPE", ML, y); y += 4;
  y = bulletList(doc, [
    "Hard Hat EN397",
    "High Visibility Vest EN471",
    "Steel Toe Cap/Mid Sole Boots EN20345",
    "Gloves CE4131",
    "Glasses EN166",
    "Goggles EN166",
  ], ML + 3, y, CONTENT_W - 3);
  pageFooter(doc, 3, 10);

  /* ───────────────────────────────────────────── PAGE 4 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6 Emergency Arrangements", ML, y); y += 4;
  y = para(doc,
    "All accidents must be recorded in the site accident book and reported to Principal Contractor and Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "Emergency arrangements will be as Principal Contractor site induction. In the event of an emergency, incident, or accident all employees must report it to Site manager of Principal Contractor management team along with Viva Fire senior management team.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.1 Special First Aid Requirements", ML, y); y += 4;
  y = para(doc,
    "No special first aid requirements are necessary, and the principal contractor will provide suitable first aid provision as per CDM regulations 2015. Information about this will be provided at induction.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("6.2 Rescue", ML, y); y += 4;
  y = para(doc,
    "In the event of an incident requiring emergency rescue, all operatives are reminded not to put themselves at risk of harm. Any incident occurring which requires emergency rescue must be judged on its individual risk conditions by the most senior person present.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc,
    "If a safe rescue cannot be completed by those in attendance, the emergency services must be informed. Note that whoever informs the emergency services must relay as much information as possible about the incident and site conditions.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc, "Please note all high-risk activities must be accompanied with an individual rescue plan.", ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("7 Temporary Amended Systems", ML, y); y += 4;
  y = para(doc,
    "No amendments are anticipated on site at this stage, but provisions will be made should this become necessary, and the possibility will be at the forefront of our onsite management teams thinking. Any changes to systems will be advised accordingly by Viva Fire in line with the CDM regulations 2015.",
    ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8 Responsibilities for Safety Control & Monitoring", ML, y); y += 4;
  y = para(doc, "Work activities will be monitored on a daily basis by site supervision and reviewed accordingly.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.1 Persons Responsible", ML, y); y += 4;
  y = para(doc, "Dale Booth & Martin Whatmough.", ML, y, CONTENT_W);
  y += 2;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("8.2 Duties", ML, y); y += 4;
  y = para(doc,
    "Dale Booth will be responsible for overseeing the safe implementation of all Viva Fireworks and as well as regular visits to site will provide ongoing assistance and support to Martin Whatmough, Viva Fire supervisor.",
    ML, y, CONTENT_W);
  y += 1;
  y = para(doc, "He will carry out safety inspections of Viva Fire on site activities and approve all safe systems of work if they need to change. To monitor work activities on a daily basis.", ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9 Environment Impacts", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.1 Waste Handling", ML, y); y += 4;
  y = para(doc, "All waste materials must be disposed of in the correct skips provided by Viva Fire.", ML, y, CONTENT_W); y += 1;
  y = para(doc, "Special care and attention must be taken regarding our environmental impact. If in doubt, ask.", ML, y, CONTENT_W); y += 1;
  y = para(doc,
    "Full cooperation with principal contractor on any environmental issue must be stringently followed at all times in line with Viva Fire environmental policy.",
    ML, y, CONTENT_W);
  pageFooter(doc, 4, 10);

  /* ───────────────────────────────────────────── PAGE 5 ───── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y = para(doc, "Viva Fire will manage Waste Streams of COSHH Materials and will complete Principal Contractor Waste Management Form.", ML, y, CONTENT_W);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.2 Water", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.3 Fuel Oils", ML, y); y += 4;
  y = para(doc, "None of our working actions are anticipated to have any impact.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("9.4 Risks of Environmental Contamination", ML, y); y += 4;
  y = para(doc, "None anticipated.", ML, y, CONTENT_W); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10 Briefing Arrangements", ML, y); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.1 Person Responsible", ML, y); y += 4;
  y = para(doc, "Name Dale Booth. Mob 07801269206.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("10.2 Acknowledgement", ML, y); y += 4;
  y = para(doc, "See signatures below.", ML, y, CONTENT_W); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("11 Interfaces with Others", ML, y); y += 4;
  y = para(doc, "Ensure co-ordination with other trades at all times to ensure work areas are not congested.", ML, y, CONTENT_W); y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("12. Coronavirus/COVID 19", ML, y); y += 4;
  const covidItems = [
    "Extra hygiene measures to be taken into consideration e.g. wash hands regularly throughout the working day for a minimum of 20 seconds at a time.",
    "RPE to be sourced/worn.",
    "Safety gloves to be either washed or disposed of after every working day.",
    "Isolated travel arrangements, if possible, to mitigate the risk of using public transport and potential spread of virus.",
    "Operatives to ensure they have recently signed up to company health declaration.",
    "If any operative shows coronavirus symptoms (dry persistent coughing, high temperature, sweating etc) then they must leave site immediately informing their supervisor via telephone, go home and self-isolate.",
    "Government enforced social distancing rule of 2 metres between all operatives must be adhered to by all.",
  ];
  for (let i = 0; i < covidItems.length; i++) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(`12.${i + 1}`, ML, y); y += 4;
    y = para(doc, covidItems[i], ML + 8, y - 1, CONTENT_W - 8);
    y += 1;
  }
  pageFooter(doc, 5, 10);

  /* ───────────────────────────────────────────── PAGE 6 – Risk Table 1 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const riskTitle = "VIVA FIRE – RISK ASSESSMENT FOR PRESSURE TESTING PIPEWORK AND ASSOCIATED FITTINGS";
  const riskTitleLines6 = doc.splitTextToSize(riskTitle, CONTENT_W);
  doc.text(riskTitleLines6, ML, y);
  y += riskTitleLines6.length * 4.5;
  y += 5;
  y = para(doc, "DALE BOOTH, MARTIN WHATMOUGH, DANIEL HALL, THOMAS VERNON", ML, y, CONTENT_W, 8); y += 2;
  labelValue(doc, "Operation/Task Location/Area:", "Dry Riser Pressure Testing / Stair Cores", ML, y, 60); y += 5;
  labelValue(doc, "Employees at Risk:", "DEVON DUNKERLEY, CALVIN WHITTAKER, MARK ROBERTS, WAYNE SMITH, JAMES OGG", ML, y, 36); y += 5;
  labelValue(doc, "Other nearby contractors:", "VIVA Fire Protection Ltd Wet and Dry Riser Specialist", ML, y, 46); y += 5;
  labelValue(doc, "Assessor Name & Date:", "Dale Booth", ML, y, 40); y += 4;
  labelValue(doc, "Review Date:", "(12 MONTHLY)", ML, y, 26); y += 4;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 52); y += 6;

  const rCols1 = [50, 50, 70, 12];
  y = riskRow(doc, ["Activity", "Hazard", "Risks", "Rating"], rCols1, y, 7, true);
  y = riskRow(doc, ["Pressure pipework testing", "Burst pipework", "Operatives being injured by flying materials and fixings. Operatives or bystanders being injured by pressure from water burst. Abrasive particles causing eye injuries. Health hazards arising from exposure to water and other associated particles.", "10"], rCols1, y, 22);
  y = riskRow(doc, ["Main BCW from riser to clusters", "High pressure water 16bar", "Operatives being injured by flying materials and fixings. Operatives or bystanders being injured by pressure from water burst. Abrasive particles causing eye injuries. Health hazards arising from exposure to water and other associated particles.", "10"], rCols1, y, 22);
  y = riskRow(doc, ["All tasks", "Lone Working", "Potential to suffer injury and be isolated/left unaided with injuries", "10"], rCols1, y, 10);
  y = riskRow(doc, ["All tasks", "Incompetence/Wrong use of tool/defective tool", "Eye Injury/Lacerations to hands/Various", "4"], rCols1, y, 10);
  y += 3;
  y = para(doc, "If tools have to be withdrawn, they must be labelled and quarantined.", ML, y, CONTENT_W);
  pageFooter(doc, 6, 10);

  /* ───────────────────────────────────────────── PAGE 7 – Risk Table 2 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const riskTitleLines7 = doc.splitTextToSize(riskTitle, CONTENT_W);
  doc.text(riskTitleLines7, ML, y);
  y += riskTitleLines7.length * 4.5;
  labelValue(doc, "Assessor Name & Date:", "Dale Booth", ML, y, 40); y += 4;
  labelValue(doc, "Review Date:", "(12 MONTHLY)", ML, y, 26); y += 4;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 52); y += 6;

  const rCols2 = [40, 40, 55, 14, 17, 16];
  y = riskRow(doc, ["Activity", "Hazard", "Risks", "Rating", "Post Ctrl", "Comments"], rCols2, y, 7, true);
  y = riskRow(doc, ["All tasks", "Noise from running portable fire engine.", "Damage to hearing, deafness, tinnitus.", "2", "***", "Lower 80dB(A), Upper 85dB(A), Limit 87dB(A)."], rCols2, y, 18);
  y = riskRow(doc, ["All tasks", "Incompetence/poor housekeeping", "Various including slips/trips/falls", "5", "", "Good housekeeping keeps safe sites. Never walk on by if you see materials in walkway."], rCols2, y, 18);
  y = riskRow(doc, ["All tasks", "Handling materials/tools with sharp edges", "Cuts/lacerations to hands and body and potential back injuries", "14", "", "Always read method statement and never deviate from safe system of work."], rCols2, y, 18);
  y = riskRow(doc, ["All tasks", "Moving plant/traffic/pedestrians", "Colliding with tower", "14", "", "All operatives to keep up to date with site changes regarding pedestrian routes."], rCols2, y, 18);
  y = riskRow(doc, ["All tasks", "Working adjacent other trades", "Contact with/being struck by electrical operations, manual handling, vehicle movements, working at height etc", "10", "", "Particular attention must be paid to noise, dust, delivery schedules, common PPE standards etc."], rCols2, y, 18);
  y = riskRow(doc, ["Human Factors", "Inappropriate behaviour", "Activity exceeds capability", "4", "", "All working personnel to embrace change and are encouraged to re-assess."], rCols2, y, 14);
  pageFooter(doc, 7, 10);

  /* ───────────────────────────────────────────── PAGE 8 – Risk Table 3 ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const riskTitleLines8 = doc.splitTextToSize(riskTitle, CONTENT_W);
  doc.text(riskTitleLines8, ML, y);
  y += riskTitleLines8.length * 4.5;
  y = para(doc, "DALE BOOTH, MARTIN WHATMOUGH, DANIEL HALL, THOMAS VERNON", ML, y, CONTENT_W, 8); y += 2;
  labelValue(doc, "Operation/Task Location/Area:", "Dry Riser Pressure Testing / Stair Cores", ML, y, 60); y += 5;
  labelValue(doc, "Employees at Risk:", "DEVON DUNKERLEY, CALVIN WHITTAKER, MARK ROBERTS, WAYNE SMITH, JAMES OGG", ML, y, 36); y += 5;
  labelValue(doc, "Assessor Name & Date:", "Dale Booth", ML, y, 40); y += 4;
  labelValue(doc, "Review Date:", "(12 MONTHLY)", ML, y, 26); y += 4;
  labelValue(doc, "Key Responsible Personnel:", "Dale Booth", ML, y, 52); y += 6;

  const rCols3 = [50, 55, 55, 22];
  y = riskRow(doc, ["Activity", "Hazard", "Risks", "Risk Ratings"], rCols3, y, 7, true);
  y = riskRow(doc, ["Manual handling / Ergonomic operations", "Moving, pulling, pushing of tools, equipment and materials", "Musculoskeletal disorders and other injuries", "5"], rCols3, y, 16);
  y += 3;
  y = para(doc, "Additional information can be found on Handling Assessment Charts (MAC) on the HSE website www.hse.gov.uk/msd.", ML, y, CONTENT_W);
  y += 3;
  y = para(doc,
    "Lack of competency of personnel. Inappropriate equipment for personnel, over familiarisation and complacency with working methods and tasks. Young workers being overconfident and lacking the correct perception of hazard and risk, along with older more experienced workers not embracing change regarding safe systems/methodology of work.",
    ML, y, CONTENT_W);
  pageFooter(doc, 8, 10);

  /* ───────────────────────────────────────────── PAGE 9 – Assessment Details ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);
  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const riskTitleLines9 = doc.splitTextToSize(riskTitle, CONTENT_W);
  doc.text(riskTitleLines9, ML, y);
  y += riskTitleLines9.length * 4.5;
  y = para(doc, "DALE BOOTH, MARTIN WHATMOUGH, DANIEL HALL, THOMAS VERNON", ML, y, CONTENT_W, 8); y += 2;
  labelValue(doc, "Location/Area:", "Dry Riser Pressure Testing / Stair Cores", ML, y, 28); y += 5;
  labelValue(doc, "Employees at Risk:", "DEVON DUNKERLEY, CALVIN WHITTAKER, MARK ROBERTS, WAYNE SMITH, JAMES OGG", ML, y, 36); y += 5;
  labelValue(doc, "Assessor:", "Dale Booth", ML, y, 22); y += 4;
  labelValue(doc, "Review Date:", "(12 MONTHLY)   Key Responsible Personnel: Dale Booth", ML, y, 26); y += 6;

  y = para(doc,
    "The person signing this assessment must check the information above to ensure it is relevant to this operation on this site. Additionally, any additional controls measures deemed necessary must be included.",
    ML, y, CONTENT_W);
  y += 3;
  y = para(doc, "Target Post-Control Rating = 10. Some Pre-Control ratings may be less than 10 but further controls are still to be considered.", ML, y, CONTENT_W);
  y += 5;

  // Variable fields (filled from form data)
  doc.setDrawColor(180); doc.setLineWidth(0.3);
  const fieldRowH = 8;
  const labelColW = 55;

  const detailFields: [string, string][] = [
    ["Assessment Date:", datePrepared],
    ["Review Date:", "12 monthly"],
    ["Client:", clientName],
    ["Attendance Date:", attendanceDate],
    ["Copies Issued To:", "(For Contract Specific Use)"],
  ];
  for (const [label, val] of detailFields) {
    doc.rect(ML, y, CONTENT_W, fieldRowH);
    doc.rect(ML, y, labelColW, fieldRowH);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(label, ML + 1, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(val, ML + labelColW + 2, y + 5);
    y += fieldRowH;
  }
  y += 5;

  // Approved
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Approved:", ML, y); y += 4;
  y = para(doc, "Dale Booth (Signature) D. Booth          Issue No: 001", ML, y, CONTENT_W); y += 5;

  // Exposure/Severity key
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Exposure Ratings:", ML, y); y += 4;
  y = para(doc, "1=Highly Unlikely, 2=Unlikely, 3=Possible, 4=Probable, 5=Common, 6=Regular, 7=Continuous", ML, y, CONTENT_W, 8); y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Severity Ratings:", ML, y); y += 4;
  y = para(doc, "1=Trivial, 2=Minor, 3=Under '7-day' Injury, 4=Over '7-day' Reportable Injury, 5=Major Injury, 6=Fatality (1 person), 7=Multiple Fatality (2+ persons)", ML, y, CONTENT_W, 8);
  pageFooter(doc, 9, 10);

  /* ───────────────────────────────────────────── PAGE 10 – Sign Off ── */
  y = newPage(doc);
  y = await pageHeader(doc, logoImg, "", y);

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(33, 61, 99);
  doc.text("Method Statement", PAGE_W / 2, y, { align: "center" }); y += 6;
  doc.setFontSize(10);
  doc.text("VIVA Fire Protection Ltd – Wet and Dry Riser Specialist", PAGE_W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0); y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("1.3 Confirmation of operatives briefing.", ML, y); y += 4;
  y = para(doc,
    "The following operatives have read and understood this method statement and risk assessment and are approved to work to this method statement.",
    ML, y, CONTENT_W);
  y += 4;

  // Table header
  const sigCols = [CONTENT_W / 3, CONTENT_W / 3, CONTENT_W / 3];
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  let hx = ML;
  for (const [lbl, w] of [["Operative Name", sigCols[0]], ["Signature", sigCols[1]], ["Date", sigCols[2]]] as [string, number][]) {
    doc.rect(hx, y, w, 7);
    doc.setFillColor(230, 230, 230); doc.rect(hx, y, w, 7, "F"); doc.rect(hx, y, w, 7);
    doc.text(lbl, hx + 2, y + 4.5);
    hx += w;
  }
  y += 7;

  // Filled operative rows or blank rows
  const minRows = 8;
  const numRows = Math.max(operatives.length, minRows);
  for (let i = 0; i < numRows; i++) {
    const op = operatives[i];
    y = signatureRow(doc, op?.name || "", op?.sig || "", op?.date || "", y);
  }

  y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.text("Checking, Reviewing and Updating:", ML, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  y = para(doc, "1.1 Work activities will be reviewed as programme.", ML, y, CONTENT_W); y += 2;
  y = para(doc, "1.2 Change requirements: Legislation, Work Area, Personnel, Task.", ML, y, CONTENT_W);
  pageFooter(doc, 10, 10);

  // Watermark
  const watermark = await loadWatermarkImage();
  if (watermark) addWatermarkToAllPages(doc, watermark);

  const ref = jobInfo?.reference_number || "rams";
  const fileName = `${ref}-rams-method-statement.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];
  return { base64, fileName };
}

/** Helper shim so pages can call a consistent "section heading" function */
async function sectionH1(doc: jsPDF, y: number, _logo: HTMLImageElement | null, text: string): Promise<number> {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, ML, y);
  y += 5;
  return y;
}
