import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Copy, Loader2, Link2 } from "lucide-react";

export default function CustomerSignOffLink({ jobId, customerName }: { jobId: string; customerName?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(customerName || "");
  const [email, setEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [link, setLink] = useState("");

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase
        .from("customer_sign_off_tokens" as any)
        .insert({
          job_id: jobId,
          customer_name: name,
          customer_email: email || null,
          created_by: user.id,
        } as any)
        .select("token")
        .single();

      if (error) throw error;

      const baseUrl = window.location.origin;
      setLink(`${baseUrl}/sign-off?token=${(data as any).token}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast({ title: "Copied!", description: "Sign-off link copied to clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="mr-1.5 h-4 w-4" /> Customer Sign-Off Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Customer Sign-Off Link</DialogTitle>
        </DialogHeader>
        {!link ? (
          <div className="space-y-3">
            <div>
              <Label>Customer Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <Label>Customer Email (optional)</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" type="email" />
            </div>
            <Button onClick={generate} disabled={generating || !name.trim()} className="w-full">
              {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
              {generating ? "Generating..." : "Generate Link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Share this link with the customer. It expires in 30 days.</p>
            <div className="flex gap-2">
              <Input readOnly value={link} className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setLink(""); setName(customerName || ""); setEmail(""); }}>
              Generate Another
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
