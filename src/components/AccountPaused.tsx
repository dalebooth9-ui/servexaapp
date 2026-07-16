import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { AlertOctagon } from "lucide-react";
import { OrgStatus } from "@/hooks/useOrgStatus";

interface Props {
  orgStatus: OrgStatus;
}

export default function AccountPaused({ orgStatus }: Props) {
  const { signOut } = useAuth();
  const isCancelled = orgStatus.status === "cancelled";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-2xl border bg-card shadow-lg p-8 text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertOctagon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">
          {isCancelled ? "Account closed" : "Account paused"}
        </h1>
        <p className="text-muted-foreground">
          {orgStatus.org_name ? (
            <>
              Access to <strong>{orgStatus.org_name}</strong> is currently{" "}
              {isCancelled ? "closed" : "paused"}.
            </>
          ) : (
            <>Access to your organisation is currently {isCancelled ? "closed" : "paused"}.</>
          )}
        </p>

        {orgStatus.suspension_message ? (
          <div className="rounded-lg bg-muted p-4 text-sm text-left whitespace-pre-wrap">
            {orgStatus.suspension_message}
          </div>
        ) : (
          <div className="rounded-lg bg-muted p-4 text-sm">
            Please contact billing to restore service.
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Support:{" "}
          <a href="mailto:support@servexaapp.com" className="underline">
            support@servexaapp.com
          </a>
        </div>

        <div className="pt-2">
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-4">
          Your data is safe and unchanged. It will be available immediately when the account is reactivated.
        </p>
      </div>
    </div>
  );
}
