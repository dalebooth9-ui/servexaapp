import { Packer } from "docx";
import JSZip from "jszip";
import { buildBlankTemplateDoc } from "../src/lib/wordTemplateBuilder";
const doc = await buildBlankTemplateDoc({ name: "Dry Riser Visual Inspection", fields: [
  { id: "f_customer", label: "Customer", type: "text", section: "Site Details" },
  { id: "f_sec_outlet", label: "Outlet hardware", type: "section", section: "Outlet hardware" },
  { id: "f_outlet_caps", label: "Caps fitted?", type: "yes_no", section: "Outlet hardware" },
]});
const buf = await Packer.toBuffer(doc);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml")!.async("string");
console.log("len:", xml.length);
console.log("body open:", /<w:body[\s>]/.test(xml), "close:", /<\/w:body>/.test(xml));
const m = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
console.log("bodyMatch?", !!m);
console.log("tbls:", (xml.match(/<w:tbl[\s>]/g)||[]).length);
const idx = xml.indexOf("<w:tbl");
console.log(xml.slice(idx, idx+400));
