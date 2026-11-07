import { ArrowRight, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import job from "@/assets/landing/job.webp.asset.json";
import phone from "@/assets/landing/phone.webp.asset.json";
import history from "@/assets/landing/history.webp.asset.json";
import timesheets from "@/assets/landing/timesheets.webp.asset.json";
import outletScanner from "@/assets/landing/outlet-scanner.webp.asset.json";
import stickerSheet from "@/assets/landing/sticker-sheet.webp.asset.json";

export function ProductDevices() {
  return <div className="product-devices" aria-label="Real Servexa job page and engineer phone view">
    <div className="laptop-screen"><div className="device-camera" /><img src={job.url} alt="Real Servexa dry riser job page with Print reports and Print sticker pack" width="1440" height="1000" fetchPriority="high" decoding="async" /></div>
    <div className="laptop-base" />
    <div className="phone-screen"><div className="phone-speaker" /><img src={phone.url} alt="Real engineer phone view with clock-in and dry riser job" width="900" height="1800" decoding="async" loading="lazy" /></div>
  </div>;
}

export function WorkflowVisual({ type }: { type: string }) {
  if (type === "history" || type === "timesheets") return <img src={type === "history" ? history.url : timesheets.url} alt={type === "history" ? "Real Servexa remedial tracking screen using example records" : "Real Servexa weekly timesheet and payroll export controls"} width={type === "history" ? 1684 : 916} height={type === "history" ? 1231 : 438} loading="lazy" decoding="async" className="workflow-shot" />;
  if (type === "qr") return <figure className="qr-product-visual"><img src={outletScanner.url} alt="Real Servexa dry riser outlet-check screen showing Scan outlet and two of four outlets checked, with sample data" width="440" height="570" loading="lazy" decoding="async" className="workflow-shot outlet-screen" /><img src={stickerSheet.url} alt="Actual Viva Fire QR sticker sheet output with large unique codes and the tagline-free logo" width="712" height="170" loading="lazy" decoding="async" className="workflow-shot sticker-screen" /></figure>;
  if (type === "paper") return <div className="workflow-illustration" role="img" aria-label="Illustration of a paper inspection report becoming a digital report">
    <div className="illustration-eyebrow">PAPER TO DIGITAL</div><div className="paper-flow"><div className="paper-sheet"><FileText className="h-7 w-7 text-primary" /><strong>Dry riser inspection</strong><span className="handwritten">Site checked ✓</span><div className="paper-rule" /><div className="paper-rule" /><div className="paper-rule" /></div><ArrowRight className="h-7 w-7 shrink-0 text-accent" /><div className="paper-sheet"><ShieldCheck className="h-7 w-7 text-primary" /><strong>Digital report</strong><span className="text-xs text-muted-foreground">Review · file · share</span><div className="paper-rule" /><div className="paper-rule" /><CheckCircle2 className="h-5 w-5 text-primary" /></div></div>
  </div>;
  return <div className="workflow-illustration" role="img" aria-label="Illustration of customer portal documents and reports">
    <div className="illustration-eyebrow">CUSTOMER PORTAL</div><div className="portal-illustration"><div className="flex items-center justify-between border-b border-border pb-5"><strong className="text-lg">Your site documents</strong><ShieldCheck className="h-6 w-6 text-primary" /></div>{["Inspection reports", "Site documents", "Quotes & approvals"].map(text => <div className="portal-document" key={text}><FileText className="h-5 w-5 text-primary" /><span>{text}</span><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></div>)}</div>
  </div>;
}