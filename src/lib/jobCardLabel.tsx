import { Link } from "react-router-dom";

export function extractTownAndPostcode(address: string | null): string {
  if (!address) return "";
  const postcodeMatch = address.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  if (!postcodeMatch) return address.replace(/\s+/g, " ").trim();
  const postcode = postcodeMatch[0].toUpperCase();
  const before = address.slice(0, postcodeMatch.index).trim();
  const parts = before.split(/,|\n/).map((s) => s.trim()).filter(Boolean);
  const town = parts[parts.length - 1] || "";
  if (town && town.toUpperCase() !== postcode) return `${town}, ${postcode}`;
  return postcode;
}

export function jobCardSubtitle(job: {
  site?: { name?: string | null; postcode?: string | null } | null;
  address?: string | null;
  reference_number: string;
}): string {
  const siteName = job.site?.name;
  const sitePostcode = job.site?.postcode;
  const location = siteName
    ? sitePostcode
      ? `${siteName} · ${sitePostcode.toUpperCase()}`
      : siteName
    : extractTownAndPostcode(job.address ?? null);
  return location ? `${location} · ${job.reference_number}` : job.reference_number;
}

export function JobCardSubtitle({
  job,
  className = "truncate text-muted-foreground",
}: {
  job: {
    id: string;
    site?: { name?: string | null; postcode?: string | null } | null;
    address?: string | null;
    reference_number: string;
  };
  className?: string;
}) {
  const siteName = job.site?.name;
  const sitePostcode = job.site?.postcode;
  const location = siteName
    ? sitePostcode
      ? `${siteName} · ${sitePostcode.toUpperCase()}`
      : siteName
    : extractTownAndPostcode(job.address ?? null);
  return (
    <span className={className}>
      <Link
        to={`/jobs/${job.id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="font-mono font-medium text-primary hover:underline"
      >
        {job.reference_number}
      </Link>
      {location ? ` · ${location}` : ""}
    </span>
  );
}
