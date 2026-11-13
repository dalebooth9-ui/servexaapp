import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import SiteAccessCard from '@/components/sites/SiteAccessCard';
import {suggestVisitType,type VisitType} from '@/lib/riserVisits';
import {printInspectionType,printInspectionResult} from '@/lib/printText';
import {riserReportUrl,type ScanJobChoice} from '@/lib/riserScanFlow';
import {ToggleGroup,ToggleGroupItem} from '@/components/ui/toggle-group';
import {RISER_LOAD_ERROR} from '@/lib/riserScanFlow';
import {logError} from '@/lib/errorLogger';

type Found = {
  id: string; asset_tag: string; riser_location: string | null; outlets_count: number | null; status: string;
  last_inspection_at: string | null; last_inspection_type: string | null; last_inspection_result: string | null;
  label_status: string; site_id: string | null; site_name: string | null; site_address: string | null;
  customer_id: string | null; customer_name: string | null; open_defects: number;
};

const cleanTag = (t: string | undefined) => (t || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);

/** Sticker scan page. Signed out (or customer portal users) see only the ID. */
export default function RiserScan() {
  const { tag: rawTag } = useParams();
  const tag = cleanTag(rawTag);
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Found | null | undefined>(undefined);
  const [defects, setDefects] = useState<{ id: string; title: string; severity: string | null }[]>([]);
  const [wrongOpen, setWrongOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const starting=useRef(false);
  const [choices,setChoices]=useState<ScanJobChoice[]>([]);
  const [typeOpen,setTypeOpen]=useState(false);
  const [visitType,setVisitType]=useState<VisitType>('visual');
  const [chosenJob,setChosenJob]=useState<string|null>(null);
  const [outlet,setOutlet]=useState<number|null>(null);
  const [outletDraft,setOutletDraft]=useState('');
  const [lookupAttempt,setLookupAttempt]=useState(0);
  const [loadError,setLoadError]=useState(false);
  const [startError,setStartError]=useState(false);
  const isStaff = !!user && (userRole === "admin" || userRole === "engineer");

  useEffect(() => {
    if (!isStaff || !tag) return;
    setAsset(undefined);setLoadError(false);
    let cancelled = false;
    (async () => {
      try {
      let riserTag = tag;
      let { data, error } = await supabase.rpc("lookup_asset_by_tag", { _tag: tag });
      if(error)throw error;
      if (cancelled) return;
      let row = !error && Array.isArray(data) ? (data[0] as Found | undefined) : undefined;
      if (!row) {
        // Outlet (landing valve) sticker: log the attendance, then show its riser.
        const { data: o,error:outletError } = await supabase.rpc("record_outlet_scan", { _tag: tag });
        if(outletError)throw outletError;
        const hit = Array.isArray(o) ? o[0] : null;
        if (cancelled) return;
        if (hit?.asset_tag) {
          riserTag = hit.asset_tag;
          setOutlet(hit.outlet_number);
          ({ data, error } = await supabase.rpc("lookup_asset_by_tag", { _tag: riserTag }));
          if(error)throw error;
          row = !error && Array.isArray(data) ? (data[0] as Found | undefined) : undefined;
        }
      }
      if (row) {
        const { data: t } = await supabase.rpc("riser_type_by_tag" as any, { _tag: riserTag });
        if (cancelled) return;
        (row as any).riser_type = (t as unknown as string) || "Dry Riser";
      }
      if(!row)logError({message:`QR lookup refused or missing (${tag})`,context:{riserCode:tag,reason:'No riser available to this company'}});
      setAsset(row ?? null);
      if (row && row.open_defects > 0) {
        const { data: d } = await supabase.from("defects").select("id, title, severity")
          .eq("asset_id", row.id).neq("status", "resolved").order("created_at", { ascending: false }).limit(20);
        if (!cancelled) setDefects((d as any) || []);
      }
      }catch(error){if(!cancelled){setLoadError(true);setAsset(null);logError({error,message:`QR lookup failed (${tag})`,context:{riserCode:tag,reason:(error as any)?.message || String(error)}});}}
    })();
    return () => { cancelled = true; };
  }, [isStaff, tag,lookupAttempt]);

  if (loading) return <Shell><p className="text-muted-foreground">Loading…</p></Shell>;

  if (!isStaff) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground uppercase tracking-wide">Riser ID</p>
        <p className="text-4xl font-bold font-mono tracking-widest">{tag}</p>
        {!user && (
          <Button className="mt-6" onClick={() => navigate(`/auth?next=${encodeURIComponent(`/r/${tag}`)}`)}>Staff login</Button>
        )}
      </Shell>
    );
  }

  if (asset === undefined) return <Shell><p className="text-muted-foreground">Looking up sticker…</p></Shell>;

  if (asset === null) {
    return (
      <Shell>
        <p className="text-2xl font-bold">{loadError ? RISER_LOAD_ERROR : "Sticker unavailable to your account"}</p>
        <p className="text-sm text-muted-foreground mt-1 font-mono">{tag}</p>
        <Button variant="outline" className="mt-4" onClick={()=>setLookupAttempt(n=>n+1)}>Retry</Button>
        <Button asChild variant="outline" className="mt-6"><Link to="/">Go to dashboard</Link></Button>
      </Shell>
    );
  }

  const saveOutletCount = async () => {
    const n = Number(outletDraft);
    if (!Number.isInteger(n) || n < 1 || n > 200) { toast.error("Enter the number of outlets (1 to 200)"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_riser_outlet_count", { _asset_id: asset.id, _count: n, _confirmed: false });
    setBusy(false);
    if (error) { toast.error("Outlets not saved", { description: error.message }); return; }
    setAsset({ ...asset, outlets_count: n });
    toast.success(`${n} outlets saved`, { description: "Outlet codes created. The report now has a row for each outlet." });
  };

  const labelFitted = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("mark_asset_label_placed", { _asset_id: asset.id });
    setBusy(false);
    if (error) { toast.error("Couldn't save – label not marked as fitted"); return; }
    setAsset({ ...asset, label_status: "placed" });
    toast.success("Label fitted");
  };

  const wrongRiser = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("report_wrong_riser", { _asset_id: asset.id, _note: note });
    setBusy(false);
    if (error) { toast.error("Couldn't send – please try again"); return; }
    setWrongOpen(false); setNote("");
    toast.success("Office told – sent to Asset review");
  };

  const startService = async (jobId:string|null=null,type:VisitType|null=null) => {
    if (!asset.site_id) { toast.error("This riser isn't linked to a site"); return; }
    if(starting.current)return;
    starting.current=true;
    setStartError(false);
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc('start_riser_scan_service',{_asset_id:asset.id,_job_id:jobId,_type:type});
      if(error)throw error;
      const result=data as {choices?:ScanJobChoice[];needs_type?:boolean;job_id?:string;response_id?:string;template_id?:string};
      if(result.choices?.length){setChoices(result.choices);return;}
      if(result.needs_type){
        setChosenJob(jobId);setVisitType(suggestVisitType(asset,[])||'visual');setTypeOpen(true);return;
      }
      if(!result.job_id||!result.response_id||!result.template_id)throw new Error('No report was returned');
      setChoices([]);setTypeOpen(false);
      toast.success('On site — report ready');
      navigate(riserReportUrl(result.job_id,result.response_id,result.template_id));
    }catch(e:any){setStartError(true);logError({error:e,message:`QR report start failed (${asset.asset_tag})`,context:{riserCode:asset.asset_tag,jobId,reason:e.message}});toast.error(RISER_LOAD_ERROR,{description:e.message});}
    finally{starting.current=false;setBusy(false);}
  };

  return (
    <Shell wide>
      {outlet !== null && <p className="text-sm font-semibold">Outlet {outlet} sticker ({tag}) – attendance recorded</p>}
      <p className="text-xs text-muted-foreground font-mono">Riser ID {asset.asset_tag}</p>
      <h1 className="text-3xl font-bold leading-tight">{asset.riser_location || "Unnamed riser"}</h1>
      <p className="text-base mt-1">{asset.site_name || "No site"}</p>
      <div className="grid grid-cols-2 gap-3 mt-4 text-left text-sm">
        <Info label="Outlets" value={asset.outlets_count ?? "—"} />
        <Info label="Status" value={asset.status} />
        <Info label="Last inspection" value={asset.last_inspection_at
          ? `${format(new Date(asset.last_inspection_at), "dd/MM/yyyy")}${asset.last_inspection_type ? ` · ${printInspectionType(asset.last_inspection_type)}` : ""}${asset.last_inspection_result ? ` · ${printInspectionResult(asset.last_inspection_result)}` : ""}`
          : "None recorded"} />
        <Info label="Sticker" value={asset.label_status} />
      </div>
      {!asset.outlets_count && <div className="mt-4 rounded-md border p-3 text-left space-y-2">
        <p className="text-sm font-semibold">Number of outlets not recorded</p>
        <p className="text-xs text-muted-foreground">Count the outlets on site and enter the number. Each outlet gets its own code and a row on the report.</p>
        <div className="flex gap-2"><Input type="number" inputMode="numeric" min={1} max={200} aria-label="Number of outlets" value={outletDraft} onChange={e=>setOutletDraft(e.target.value)} /><Button onClick={()=>void saveOutletCount()} disabled={busy||!outletDraft}>Save</Button></div>
      </div>}
      <div className="mt-4 text-left">
        <p className="text-sm font-semibold">Open defects ({asset.open_defects})</p>
        {defects.length > 0 && (
          <ul className="mt-1 text-sm list-disc pl-5">
            {defects.map((d) => <li key={d.id}>{d.title}{d.severity ? ` (${d.severity})` : ""}</li>)}
          </ul>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {startError && <div role="alert"><p className="text-sm">{RISER_LOAD_ERROR}</p><Button variant="outline" onClick={()=>void startService(chosenJob,visitType)}>Retry</Button></div>}
        {userRole==='engineer'&&asset.site_id&&<SiteAccessCard siteId={asset.site_id}/>}
        {asset.label_status !== "placed" && <Button size="lg" onClick={labelFitted} disabled={busy}>Label fitted</Button>}
        <Button size="lg" variant="outline" onClick={() => setWrongOpen(true)} disabled={busy}>Wrong riser</Button>
        <Button size="lg" variant="secondary" onClick={()=>void startService()} disabled={busy}>Start service</Button>
      </div>
      <Dialog open={wrongOpen} onOpenChange={setWrongOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Wrong riser</DialogTitle></DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong? e.g. this sticker is on the east stairwell riser" />
          <DialogFooter><Button onClick={wrongRiser} disabled={busy}>Send to office</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={choices.length>0} onOpenChange={open=>{if(!open)setChoices([]);}}>
        <DialogContent><DialogHeader><DialogTitle>Choose the visit</DialogTitle></DialogHeader>
          <div className="space-y-2">{choices.map(choice=><Button key={choice.id} variant="outline" className="w-full h-auto py-3 text-left justify-start whitespace-normal" disabled={busy} onClick={()=>{setChoices([]);void startService(choice.id);}}>{choice.reference} · {choice.name}{choice.date?` · ${format(new Date(choice.date),'dd/MM/yyyy')}`:''}</Button>)}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={typeOpen} onOpenChange={setTypeOpen}>
        <DialogContent><DialogHeader><DialogTitle>Service type</DialogTitle></DialogHeader>
          <ToggleGroup type="single" value={visitType} onValueChange={value=>{if(value==='visual'||value==='pressure')setVisitType(value);}} className="flex-wrap">
            <ToggleGroupItem value="visual">Visual inspection</ToggleGroupItem><ToggleGroupItem value="pressure">Pressure test</ToggleGroupItem>
          </ToggleGroup>
          <DialogFooter><Button disabled={busy} onClick={()=>void startService(chosenJob,visitType)}>Open report</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className={`w-full ${wide ? "max-w-md" : "max-w-sm"}`}>
        <CardContent className="p-6 text-center">{children}</CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium capitalize-first">{value}</p>
    </div>
  );
}
