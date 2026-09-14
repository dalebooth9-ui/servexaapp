import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CustomerMergeSuggestionsPanel from "@/components/CustomerMergeSuggestionsPanel";

/** Dedicated review screen for possible duplicate customers. */
export default function CustomerDuplicates() {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/customers">
            <ArrowLeft className="h-4 w-4 mr-1" /> Customers
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Duplicate customers</h1>
        <p className="text-sm text-muted-foreground">
          Merge duplicates created by imports and accounting syncs into the original customer record.
        </p>
      </div>
      <CustomerMergeSuggestionsPanel />
    </div>
  );
}
