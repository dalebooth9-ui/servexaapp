/**
 * ramsBrand.ts
 *
 * Generating-org branding for RAMS PDF generators.
 *
 * The RAMS pipeline used to hard-code Viva Fire's company name, personal
 * contacts and phone numbers throughout every page. Every one of those is a
 * SAFETY-DOCUMENT claim — company identity, method-statement authorship,
 * supervisor contact. When another org opens the same generator the strings
 * must resolve to that org (or be blank if not yet configured), and Viva
 * personnel must never appear.
 *
 * Usage: call `primeRamsBrand()` once at the top of a generator, then
 * `rewriteRamsBrand(str)` / `getCachedRamsBrand()` from any sync render
 * function. The `para`/`bulletList`/`numberedList` helpers in ramsPdfBase.ts
 * auto-apply the rewrite so long-form paragraphs re-brand automatically.
 */
import {
  getGeneratingOrgBranding,
  getGeneratingOrgFallbackLogoUrl,
} from "@/lib/generatingOrgBranding";

export type RamsBrand = {
  isViva: boolean;
  logoUrl: string;          // "" means render text-only header
  companyUpper: string;     // "VIVA FIRE" for Viva; org name upper for others
  companyName: string;      // full styled company name; blank if org unconfigured
  companyTagLine: string;   // secondary line on cover ("Fire Protection Ltd") — Viva only
  operativesDefault: string;
  writerName: string;       // author of method statement
  writerPhone: string;
  writerEmail: string;
  supervisorName: string;
  supervisorPhone: string;
  supervisorEmail: string;
  rewrite: (s: string) => string;
};

let cached: RamsBrand | null = null;

function nameToken(orgName: string): string {
  return orgName || "the contractor";
}

async function build(): Promise<RamsBrand> {
  const g = await getGeneratingOrgBranding();
  const isViva = g.isViva;
  const orgName = (g.name ?? "").trim();
  const logoUrl = await getGeneratingOrgFallbackLogoUrl();

  const rewrite: (s: string) => string = isViva
    ? (s) => s
    : (s) => {
        const co = nameToken(orgName);
        return s
          // Company names (longest first)
          .replace(/VIVA FIRE PROTECTION LTD/g, co.toUpperCase())
          .replace(/Viva Fire Protection Ltd/g, co)
          .replace(/Viva Fire Protection/g, co)
          .replace(/VIVA FIRE/g, co.toUpperCase())
          .replace(/Viva Fire/g, co)
          .replace(/Viva/g, co)
          // Personal names — a new org's method statements were NOT written
          // or supervised by Viva staff. Replace with role-based placeholders.
          .replace(/Dale Booth/g, "the appointed supervisor")
          .replace(/Martin Whatmough/g, "the site supervisor")
          // Direct phone numbers / emails baked into paragraphs
          .replace(/07801269206/g, "[contact to be confirmed]")
          .replace(/07989436509/g, "[contact to be confirmed]")
          .replace(/sales@vivafire\.co\.uk/gi, "[email to be confirmed]")
          .replace(/martin\.whatmough@vivafire\.co\.uk/gi, "[email to be confirmed]");
      };

  return {
    isViva,
    logoUrl,
    companyUpper: isViva ? "VIVA FIRE" : orgName.toUpperCase(),
    companyName: isViva ? "VIVA Fire Protection Ltd" : orgName,
    companyTagLine: isViva ? "Fire Protection Ltd" : "",
    operativesDefault: isViva
      ? "Viva Fire Operatives"
      : orgName ? `${orgName} Operatives` : "Assigned Operatives",
    writerName: isViva ? "Dale Booth" : "",
    writerPhone: isViva ? "07801269206" : "",
    writerEmail: isViva ? "sales@vivafire.co.uk" : "",
    supervisorName: isViva ? "Martin Whatmough" : "",
    supervisorPhone: isViva ? "07989436509" : "",
    supervisorEmail: isViva ? "martin.whatmough@vivafire.co.uk" : "",
    rewrite,
  };
}

/** Populate the sync-access cache. Call once per generator run. */
export async function primeRamsBrand(): Promise<RamsBrand> {
  cached = await build();
  return cached;
}

/** Sync accessor — safe after primeRamsBrand(); falls back to Viva strings
 *  (unchanged legacy behaviour) if the generator forgot to prime. */
export function getCachedRamsBrand(): RamsBrand | null {
  return cached;
}

/** Apply the branded rewrite to any string. No-op if not primed or if the
 *  generating org is Viva. */
export function rewriteRamsBrand(s: string): string {
  if (!cached) return s;
  return cached.rewrite(s);
}

export function resetRamsBrandCache() { cached = null; }
