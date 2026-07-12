/**
 * Small subtle version stamp for support triage.
 * Shown in the Settings footer so we can confirm which build a user is on.
 */
export default function AppVersion({ className = "" }: { className?: string }) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const built = typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : "";
  const builtLabel = built
    ? new Date(built).toLocaleString("en-GB", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return (
    <p className={`text-[11px] text-muted-foreground ${className}`}>
      Servexa build <span className="font-mono">{version}</span>
      {builtLabel ? ` · ${builtLabel}` : ""}
    </p>
  );
}
