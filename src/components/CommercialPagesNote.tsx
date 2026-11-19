import { Link } from "react-router-dom";

const PAGES = {
  agreements: { to: "/money?tab=agreements", label: "Agreements", text: "Agreements are the signed documents you send a customer for signature." },
  contracts: { to: "/money?tab=contracts", label: "Contracts", text: "Contracts record what you service for a customer, how often and at what price." },
  renewals: { to: "/money?tab=renewals", label: "Renewals", text: "Renewals track when each service is next due so you can book it in time." },
} as const;

/** One-line explanation of how Agreements, Contracts and Renewals differ, with links to the other two. */
export default function CommercialPagesNote({ current }: { current: keyof typeof PAGES }) {
  const others = (Object.keys(PAGES) as (keyof typeof PAGES)[]).filter((k) => k !== current);
  return (
    <p className="text-sm text-muted-foreground">
      {PAGES[current].text} See also{" "}
      <Link className="text-primary underline" to={PAGES[others[0]].to}>{PAGES[others[0]].label}</Link> and{" "}
      <Link className="text-primary underline" to={PAGES[others[1]].to}>{PAGES[others[1]].label}</Link>.
    </p>
  );
}
