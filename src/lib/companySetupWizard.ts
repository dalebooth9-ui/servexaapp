export const SETUP_STEPS = ["Company details", "Branding", "Reports and documents", "Team", "Check and finish"] as const;
export type SetupData = {
  company_name: string; address: string; phone: string; email: string; website: string;
  logo_url: string; primary_color: string; report_footer_text: string; accreditation_logo_urls: string[];
};
export const EMPTY_SETUP: SetupData = { company_name: "", address: "", phone: "", email: "", website: "", logo_url: "", primary_color: "", report_footer_text: "", accreditation_logo_urls: [] };
export const OPTIONAL_STEPS = new Set([1, 2, 3]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only company name, email and address block setup; other fields are checked only when filled in. */
export function stepErrors(step: number, d: SetupData): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!d.company_name.trim()) e.company_name = "Company name is needed";
    if (!d.address.trim()) e.address = "Address is needed";
    if (!d.email.trim()) e.email = "Email is needed";
    else if (!EMAIL.test(d.email.trim())) e.email = "Enter a valid email, like office@company.co.uk";
    if (d.phone.trim() && !/^[+\d][\d\s()-]{6,}$/.test(d.phone.trim())) e.phone = "Enter a valid phone number";
  }
  if (step === 1 && d.primary_color && !/^#[0-9a-f]{6}$/i.test(d.primary_color)) e.primary_color = "Use a colour like #1F4E79";
  return e;
}

export function fixLine(n: number) { return `${n} ${n === 1 ? "thing" : "things"} to fix before you can continue`; }
