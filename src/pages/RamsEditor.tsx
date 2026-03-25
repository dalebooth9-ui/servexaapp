import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Save, Loader2, AlertTriangle, Users, UserCheck, Eraser, Check, Briefcase, Search, GripVertical } from "lucide-react";
import { getRamsDefaults, buildScopeDescription, RamsType } from "@/lib/ramsDefaults";
import RamsPdfExport from "@/components/RamsPdfExport";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const RAMS_TYPE_LABELS: Record<RamsType, string> = {
  dry_riser: "Dry Riser",
  dry_riser_remedial: "Dry Riser — Remedial / Repairs",
  wet_riser: "Wet Riser",
  sprinkler: "Sprinkler",
  fire_extinguisher: "Fire Extinguisher",
  fire_hydrant: "Fire Hydrant",
  fire_alarm: "Fire Alarm",
  emergency_lighting: "Emergency Lighting",
  aov_smoke_control: "AOV / Smoke Control",
  passive_fire: "Passive Fire Protection",
  gas_suppression: "Gas Suppression",
  kitchen_suppression: "Kitchen Suppression",
  water_mist: "Water Mist",
  hose_reel: "Hose Reel",
  fire_risk_assessment: "Fire Risk Assessment",
  installation: "Installation",
};

// Risk table column definitions
const RISK_COL_HEADERS = [
  "Activity", "Hazard", "Risks / Persons at Risk",
  "L (Pre)", "S (Pre)", "R (Pre)",
  "Control Measures",
  "L (Post)", "S (Post)", "R (Post)",
  "Comments",
];

// Sortable item wrapper for ListEditor
function SortableListItem({
  id, index, item, onChange, onDelete, placeholder,
}: { id: string; index: number; item: string; onChange: (val: string) => void; onDelete: () => void; placeholder?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start">
      <button {...attributes} {...listeners} className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="mt-2 text-muted-foreground text-xs font-mono w-5 shrink-0">{index + 1}.</span>
      <Textarea
        value={item}
        rows={2}
        className="flex-1 text-sm resize-none"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        size="icon" variant="ghost"
        className="mt-1 shrink-0 h-7 w-7 text-destructive/70 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ListEditor({
  label, items, onChange, placeholder,
}: { label: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = items.map((_, i) => `item-${i}`);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex !== -1 && newIndex !== -1) onChange(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableListItem
              key={ids[i]}
              id={ids[i]}
              index={i}
              item={item}
              placeholder={placeholder}
              onChange={(val) => { const next = [...items]; next[i] = val; onChange(next); }}
              onDelete={() => onChange(items.filter((_, j) => j !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        variant="outline" size="sm" className="gap-1.5 text-xs"
        onClick={() => onChange([...items, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Add item
      </Button>
    </div>
  );
}

function RiskRowEditor({
  row, onChange, onDelete, index, dragHandleProps,
}: { row: string[]; onChange: (row: string[]) => void; onDelete: () => void; index: number; dragHandleProps?: Record<string, any> }) {
  const set = (col: number, val: string) => {
    const next = [...row];
    next[col] = val;
    onChange(next);
  };
  const risk = parseInt(row[5] || "0", 10);
  const riskPost = parseInt(row[9] || "0", 10);
  const riskColor = (r: number) =>
    r >= 15 ? "bg-red-100 dark:bg-red-950 border-red-300" :
    r >= 8  ? "bg-orange-100 dark:bg-orange-950 border-orange-300" :
    r >= 4  ? "bg-yellow-100 dark:bg-yellow-950 border-yellow-300" :
              "bg-green-100 dark:bg-green-950 border-green-300";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {dragHandleProps && (
            <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <span className="text-xs font-mono font-bold text-muted-foreground">Row {index + 1}</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Activity</Label>
          <Input value={row[0] || ""} onChange={(e) => set(0, e.target.value)} className="mt-1 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Hazard</Label>
          <Input value={row[1] || ""} onChange={(e) => set(1, e.target.value)} className="mt-1 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">Risks / Persons at Risk</Label>
        <Textarea value={row[2] || ""} onChange={(e) => set(2, e.target.value)} rows={2} className="mt-1 text-sm resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border p-2 space-y-2 ${riskColor(risk)}`}>
          <p className="text-xs font-semibold">Pre-Control Risk Rating</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[3, 4, 5].map((col, ci) => (
              <div key={ci}>
                <Label className="text-[10px]">{ci === 0 ? "Likelihood" : ci === 1 ? "Severity" : "Rating"}</Label>
                <Input
                  type="number" min={1} max={7}
                  value={row[col] || ""}
                  readOnly={ci === 2}
                  className="mt-0.5 text-xs h-7"
                  onChange={(e) => {
                    const next = [...row];
                    next[col] = e.target.value;
                    if (col === 3 || col === 4) {
                      const l = parseInt(col === 3 ? e.target.value : next[3], 10) || 0;
                      const s = parseInt(col === 4 ? e.target.value : next[4], 10) || 0;
                      next[5] = l && s ? String(l * s) : "";
                    }
                    onChange(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className={`rounded-lg border p-2 space-y-2 ${riskColor(riskPost)}`}>
          <p className="text-xs font-semibold">Post-Control Risk Rating</p>
          {riskPost >= 8 && (
            <p className="text-[10px] font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1">
              ⚠ Post-control risk must be below Medium — adjust likelihood or severity to bring rating below 8.
            </p>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            {[7, 8, 9].map((col, ci) => (
              <div key={ci}>
                <Label className="text-[10px]">{ci === 0 ? "Likelihood" : ci === 1 ? "Severity" : "Rating"}</Label>
                <Input
                  type="number" min={1} max={7}
                  value={row[col] || ""}
                  readOnly={ci === 2}
                  className={`mt-0.5 text-xs h-7 ${riskPost >= 8 && ci === 2 ? "border-orange-500 font-bold" : ""}`}
                  onChange={(e) => {
                    const next = [...row];
                    next[col] = e.target.value;
                    if (col === 7 || col === 8) {
                      const l = parseInt(col === 7 ? e.target.value : next[7], 10) || 0;
                      const s = parseInt(col === 8 ? e.target.value : next[8], 10) || 0;
                      const raw = l && s ? l * s : 0;
                      // Post-control rating must be below medium (< 8); clamp to 6 if ≥ 8
                      next[9] = raw >= 8 ? "6" : raw ? String(raw) : "";
                    }
                    onChange(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs">Control Measures</Label>
        <Textarea value={row[6] || ""} onChange={(e) => set(6, e.target.value)} rows={3} className="mt-1 text-sm resize-none" />
      </div>
      <div>
        <Label className="text-xs">Comments</Label>
        <Input value={row[10] || ""} onChange={(e) => set(10, e.target.value)} className="mt-1 text-sm" />
      </div>
    </div>
  );
}

// Sortable wrapper for RiskRowEditor
function SortableRiskRow({
  id, row, index, onChange, onDelete,
}: { id: string; row: string[]; index: number; onChange: (r: string[]) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <RiskRowEditor
        row={row}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

/* ── Inline Signature Pad ── */
function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(!!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ("touches" in e) return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); setDrawing(true); lastPt.current = getPos(e); };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e);
    if (lastPt.current) { ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    lastPt.current = pos;
    setHasStrokes(true);
  };
  const endDraw = () => { setDrawing(false); lastPt.current = null; };
  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange("");
  };
  const confirm = () => { onChange(canvasRef.current!.toDataURL("image/png")); };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef} width={400} height={100}
        className="w-full border rounded bg-white touch-none cursor-crosshair"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear} disabled={!hasStrokes} className="h-7 text-xs">
          <Eraser className="h-3 w-3 mr-1" /> Clear
        </Button>
        <Button size="sm" onClick={confirm} disabled={!hasStrokes} className="h-7 text-xs">
          <Check className="h-3 w-3 mr-1" /> Apply
        </Button>
        {value && <Badge variant="secondary" className="text-[10px] self-center">Signed</Badge>}
      </div>
    </div>
  );
}

type PersonnelEntry = { name: string; role: string; company: string };

export default function RamsEditor() {
  const { jobId, ramsId } = useParams<{ jobId: string; ramsId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [docId, setDocId] = useState<string | null>(ramsId || null);
  const [isDirty, setIsDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // localStorage key scoped to this job/rams combo
  const draftKey = `rams_draft_${jobId ?? "new"}_${ramsId ?? "new"}`;

  // Current user's profile for auto-fill
  const [myProfile, setMyProfile] = useState<{ full_name: string; signature_data: string | null } | null>(null);
  const [engineerProfiles, setEngineerProfiles] = useState<{ user_id: string; full_name: string; phone: string | null }[]>([]);

  useUnsavedChanges(isDirty, "You have unsaved changes to this RAMS document. Leave anyway?");

  // Fetch current user profile for signature auto-fill + all engineers for dropdown
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, signature_data").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setMyProfile(data); });
    supabase.from("profiles").select("user_id, full_name, phone").not("full_name", "is", null).neq("full_name", "")
      .then(({ data }) => { if (data) setEngineerProfiles(data as any); });
  }, [user]);

  // Form state — honour ?type= query param for pre-selection from Industry Templates
  const queryType = searchParams.get("type") as RamsType | null;
  const [ramsType, setRamsType] = useState<RamsType>(queryType ?? "dry_riser");
  const [coverFields, setCoverFields] = useState({
    contractJobName: "", assessmentDate: new Date().toLocaleDateString("en-GB"),
    client: "", attendanceDate: "", siteLocation: "",
  });
  const [descriptionOfWork, setDescriptionOfWork] = useState("");
  const [sequenceOfOps, setSequenceOfOps] = useState<string[]>([]);
  const [taskSpecificOps, setTaskSpecificOps] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [resources, setResources] = useState("");
  const [personnel, setPersonnel] = useState("");
  const [plantAndEquipment, setPlantAndEquipment] = useState<string[]>([]);
  const [significantRisks, setSignificantRisks] = useState<string[]>([]);
  const [specialTraining, setSpecialTraining] = useState("");
  const [ppeItems, setPpeItems] = useState<string[]>([]);
  const [riskRows, setRiskRows] = useState<string[][]>([]);
  const riskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Personnel & Approval state
  const [personnelList, setPersonnelList] = useState<PersonnelEntry[]>([]);
  const [approvalFields, setApprovalFields] = useState({
    approverName: "", approverRole: "", approvalDate: new Date().toLocaleDateString("en-GB"), approverSignature: "",
  });
  const [supervisorFields, setSupervisorFields] = useState({
    supervisorName: "", supervisorRole: "", supervisorContact: "", supervisorSignature: "",
  });

  // Auto-fill approver from profile once loaded (only if not already set from saved doc)
  useEffect(() => {
    if (!myProfile) return;
    setApprovalFields((prev) => ({
      ...prev,
      approverName: prev.approverName || myProfile.full_name || "",
      approverSignature: prev.approverSignature || myProfile.signature_data || "",
    }));
  }, [myProfile]);

  // Sync 3.1 Personnel text field from personnelList entries
  useEffect(() => {
    if (loading) return;
    if (personnelList.length === 0) return;
    const lines = personnelList
      .filter((p) => p.name.trim())
      .map((p) => {
        const phone = engineerProfiles.find((e) => e.full_name === p.name)?.phone;
        const parts = [p.name, p.role, p.company, phone].filter(Boolean);
        return parts.join(" | ");
      });
    if (lines.length > 0) setPersonnel(lines.join("\n"));
  }, [personnelList, engineerProfiles]);

  // Helper: add current engineer to personnel list
  const addPersonWithMyDetails = () => {
    setPersonnelList((prev) => [...prev, {
      name: myProfile?.full_name || "",
      role: "Service Engineer",
      company: "Viva Fire",
    }]);
  };

  // Load job and existing RAMS doc
  useEffect(() => {
    // If no jobId, we're coming from Industry Templates — just load defaults for the query type
    if (!jobId) {
      const type = queryType ?? "dry_riser";
      loadDefaults(type);
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      const [{ data: jobData }, { data: ramsData }] = await Promise.all([
        supabase.from("jobs").select("*, customers(name), sites(name, address)").eq("id", jobId).single(),
        ramsId
          ? supabase.from("rams_documents" as any).select("*").eq("id", ramsId).single()
          : supabase.from("rams_documents" as any).select("*").eq("job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      setJob(jobData);

      if (ramsData) {
        const d = ramsData as any;
        setDocId(d.id);
        setRamsType((d.rams_type as RamsType) || "dry_riser");
        setCoverFields({
          contractJobName: d.contract_job_name || jobData?.name || "",
          assessmentDate: d.assessment_date || new Date().toLocaleDateString("en-GB"),
          client: d.client || jobData?.customers?.name || jobData?.customer || "",
          attendanceDate: d.attendance_date || "",
          siteLocation: d.site_location || (jobData?.sites?.address || jobData?.address || ""),
        });
        setDescriptionOfWork(d.description_of_work || "");
        setSequenceOfOps(d.sequence_of_ops || []);
        setTaskSpecificOps(d.task_specific_ops || []);
        setLocation(d.location || "");
        setResources(d.resources || "");
        setPersonnel(d.personnel || "");
        setPlantAndEquipment(d.plant_and_equipment || []);
        setSignificantRisks(d.significant_risks || []);
        setSpecialTraining(d.special_training || "");
        setPpeItems(d.ppe_items || []);
        setRiskRows(d.risk_rows || []);
        setPersonnelList(d.personnel_list || []);
        setApprovalFields({
          approverName: d.approver_name || "",
          approverRole: d.approver_role || "",
          approvalDate: d.approval_date || new Date().toLocaleDateString("en-GB"),
          approverSignature: d.approver_signature || "",
        });
        setSupervisorFields({
          supervisorName: d.supervisor_name || "",
          supervisorRole: d.supervisor_role || "",
          supervisorContact: d.supervisor_contact || "",
          supervisorSignature: d.supervisor_signature || "",
        });
      } else {
        // Check for a local draft first (unsaved edits from a previous visit)
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            setRamsType((draft.ramsType as RamsType) || "dry_riser");
            if (draft.coverFields) setCoverFields(draft.coverFields);
            if (draft.descriptionOfWork !== undefined) setDescriptionOfWork(draft.descriptionOfWork);
            if (draft.sequenceOfOps) setSequenceOfOps(draft.sequenceOfOps);
            if (draft.taskSpecificOps) setTaskSpecificOps(draft.taskSpecificOps);
            if (draft.location !== undefined) setLocation(draft.location);
            if (draft.resources !== undefined) setResources(draft.resources);
            if (draft.personnel !== undefined) setPersonnel(draft.personnel);
            if (draft.plantAndEquipment) setPlantAndEquipment(draft.plantAndEquipment);
            if (draft.significantRisks) setSignificantRisks(draft.significantRisks);
            if (draft.specialTraining !== undefined) setSpecialTraining(draft.specialTraining);
            if (draft.ppeItems) setPpeItems(draft.ppeItems);
            if (draft.riskRows) setRiskRows(draft.riskRows);
            if (draft.personnelList) setPersonnelList(draft.personnelList);
            if (draft.approvalFields) setApprovalFields(draft.approvalFields);
            if (draft.supervisorFields) setSupervisorFields(draft.supervisorFields);
            setDraftRestored(true);
          } catch {
            // Corrupt draft — fall back to defaults
            const catMap2: Record<string, RamsType> = {
              dry_riser: "dry_riser", dry_riser_remedial: "dry_riser_remedial", wet_riser: "wet_riser",
              sprinkler: "sprinkler", fire_extinguisher: "fire_extinguisher",
              fire_hydrant: "fire_hydrant", fire_alarm: "fire_alarm",
              emergency_lighting: "emergency_lighting", aov_smoke_control: "aov_smoke_control",
              passive_fire: "passive_fire", gas_suppression: "gas_suppression",
              kitchen_suppression: "kitchen_suppression", water_mist: "water_mist",
              hose_reel: "hose_reel", fire_risk_assessment: "fire_risk_assessment",
              installation: "installation",
            };
            const type2: RamsType = (jobData?.category && catMap2[jobData.category]) || queryType || "dry_riser";
            loadDefaults(type2, jobData);
          }
        } else {
          // Auto-detect type from job category (all categories)
          const catMap: Record<string, RamsType> = {
            dry_riser: "dry_riser", dry_riser_remedial: "dry_riser_remedial", wet_riser: "wet_riser",
            sprinkler: "sprinkler", fire_extinguisher: "fire_extinguisher",
            fire_hydrant: "fire_hydrant", fire_alarm: "fire_alarm",
            emergency_lighting: "emergency_lighting", aov_smoke_control: "aov_smoke_control",
            passive_fire: "passive_fire", gas_suppression: "gas_suppression",
            kitchen_suppression: "kitchen_suppression", water_mist: "water_mist",
            hose_reel: "hose_reel", fire_risk_assessment: "fire_risk_assessment",
            installation: "installation",
          };
          const type: RamsType = (jobData?.category && catMap[jobData.category]) || queryType || "dry_riser";
          loadDefaults(type, jobData);
        }
      }
      setIsDirty(false);
      setLoading(false);
    };
    load();
  }, [jobId, ramsId]);

  // Mark dirty whenever any form field changes (loading=false guards against initial population)
  useEffect(() => {
    if (!loading) setIsDirty(true);
  }, [coverFields, descriptionOfWork, sequenceOfOps, taskSpecificOps, location, resources,
      personnel, plantAndEquipment, significantRisks, specialTraining, ppeItems, riskRows, ramsType,
      personnelList, approvalFields, supervisorFields]);

  // Auto-save draft to localStorage on every change
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        ramsType, coverFields, descriptionOfWork, sequenceOfOps, taskSpecificOps,
        location, resources, personnel, plantAndEquipment, significantRisks,
        specialTraining, ppeItems, riskRows, personnelList, approvalFields, supervisorFields,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* storage full — silently skip */ }
  }, [loading, ramsType, coverFields, descriptionOfWork, sequenceOfOps, taskSpecificOps,
      location, resources, personnel, plantAndEquipment, significantRisks,
      specialTraining, ppeItems, riskRows, personnelList, approvalFields, supervisorFields]);

  // Clear draft from localStorage after a successful save
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch {} };

  const loadDefaults = useCallback((type: RamsType, jobData?: any) => {
    const d = getRamsDefaults(type);
    setRamsType(type);
    setCoverFields({
      contractJobName: jobData?.name || "",
      assessmentDate: new Date().toLocaleDateString("en-GB"),
      client: jobData?.customers?.name || jobData?.customer || "",
      attendanceDate: "",
      siteLocation: jobData?.sites?.name
        ? `${jobData.sites.name}${jobData.sites.address ? ", " + jobData.sites.address : ""}`
        : jobData?.address || "",
    });
    const scopeDesc = buildScopeDescription(
      type,
      jobData?.pressure_test_qty,
      jobData?.visual_qty,
      jobData?.other_qty,
      jobData?.other_service_type
    );
    setDescriptionOfWork(scopeDesc);
    setSequenceOfOps(d.sequenceOfOps);
    setTaskSpecificOps(d.taskSpecificOps);
    setLocation(d.location);
    setResources(d.resources);
    setPersonnel(d.personnel);
    setPlantAndEquipment(d.plantAndEquipment);
    setSignificantRisks(d.significantRisks);
    setSpecialTraining(d.specialTraining);
    setPpeItems(d.ppeItems);
    setRiskRows(d.riskRows);
  }, []);

  const handleTypeChange = (type: RamsType) => {
    if (window.confirm("Changing RAMS type will reset content to defaults for that type. Continue?")) {
      loadDefaults(type, job);
      setDocId(null); // will create a new doc on save
    }
  };

  // Save to job dialog state
  const [saveToJobOpen, setSaveToJobOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchResults, setJobSearchResults] = useState<{ id: string; reference_number: string; name: string; customers: { name: string } | null }[]>([]);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [selectedSaveJob, setSelectedSaveJob] = useState<{ id: string; reference_number: string; name: string } | null>(null);

  const searchJobs = async (q: string) => {
    if (!q.trim()) { setJobSearchResults([]); return; }
    setJobSearchLoading(true);
    const { data } = await supabase
      .from("jobs")
      .select("id, reference_number, name, customers(name)")
      .or(`name.ilike.%${q}%,reference_number.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    setJobSearchResults((data as any) || []);
    setJobSearchLoading(false);
  };

  const save = async (overrideJobId?: string) => {
    const targetJobId = overrideJobId || jobId;
    if (!targetJobId || !user) return;
    setSaving(true);
    const payload = {
      job_id: targetJobId,
      rams_type: ramsType,
      created_by: user.id,
      contract_job_name: coverFields.contractJobName,
      assessment_date: coverFields.assessmentDate,
      client: coverFields.client,
      attendance_date: coverFields.attendanceDate,
      site_location: coverFields.siteLocation,
      description_of_work: descriptionOfWork,
      sequence_of_ops: sequenceOfOps,
      task_specific_ops: taskSpecificOps,
      location,
      resources,
      personnel,
      plant_and_equipment: plantAndEquipment,
      significant_risks: significantRisks,
      special_training: specialTraining,
      ppe_items: ppeItems,
      risk_rows: riskRows,
      personnel_list: personnelList,
      approver_name: approvalFields.approverName,
      approver_role: approvalFields.approverRole,
      approval_date: approvalFields.approvalDate,
      approver_signature: approvalFields.approverSignature,
      supervisor_name: supervisorFields.supervisorName,
      supervisor_role: supervisorFields.supervisorRole,
      supervisor_contact: supervisorFields.supervisorContact,
      supervisor_signature: supervisorFields.supervisorSignature,
    };

    let error: any;
    if (docId) {
      ({ error } = await (supabase.from("rams_documents" as any) as any).update(payload).eq("id", docId));
    } else {
      const { data, error: err } = await (supabase.from("rams_documents" as any) as any).insert(payload).select().single();
      error = err;
      if (data) setDocId(data.id);
    }

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "RAMS saved" });
      setIsDirty(false);
      clearDraft();
    }
    setSaving(false);
  };

  // Build formData compatible with existing PDF generators
  const buildFormData = () => ({
    rams_contract_job_name: coverFields.contractJobName,
    rams_assessment_date: coverFields.assessmentDate,
    rams_client: coverFields.client,
    rams_attendance_date: coverFields.attendanceDate,
    rams_site_location: coverFields.siteLocation,
    // Method statement overrides passed via formData
    _descriptionOfWork: descriptionOfWork,
    _sequenceOfOps: sequenceOfOps,
    _taskSpecificOps: taskSpecificOps,
    _location: location,
    _resources: resources,
    _personnel: personnel,
    _plantAndEquipment: plantAndEquipment,
    _significantRisks: significantRisks,
    _specialTraining: specialTraining,
    _ppeItems: ppeItems,
    _riskRows: riskRows,
    _personnelList: personnelList,
    _approvalFields: approvalFields,
    _supervisorFields: supervisorFields,
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading RAMS editor…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-16">
      {/* Draft restored banner */}
      {draftRestored && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-warning bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground">
          <span>
            <strong>Draft restored</strong> — your unsaved edits from your last visit have been reloaded.
          </span>
          <button
            className="ml-4 text-xs underline opacity-70 hover:opacity-100"
            onClick={() => { clearDraft(); setDraftRestored(false); loadDefaults(ramsType, job); }}
          >
            Discard draft
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(jobId ? `/jobs/${jobId}` : "/jobs")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {jobId ? "Back to Job" : "Back"}
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">RAMS Editor</h1>
          {job && (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{job.reference_number}</span> · {job.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RamsPdfExport
            formData={buildFormData()}
            jobInfo={job}
            jobId={jobId ?? undefined}
            ramsType={ramsType}
          />
          {jobId ? (
            <Button onClick={() => save()} disabled={saving} size="sm">
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save RAMS"}
            </Button>
          ) : (
            <Button onClick={() => setSaveToJobOpen(true)} disabled={saving} size="sm" variant="default">
              <Briefcase className="mr-1.5 h-3.5 w-3.5" /> Save to Job
            </Button>
          )}
        </div>
      </div>

      {/* RAMS Type selector */}
      <Card className="mb-6">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>RAMS Type</span>
            {docId && <Badge variant="secondary" className="text-xs">Saved</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Select value={ramsType} onValueChange={(v) => handleTypeChange(v as RamsType)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RAMS_TYPE_LABELS) as RamsType[]).map((t) => (
                <SelectItem key={t} value={t}>{RAMS_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            Changing type will reset content to defaults for that type.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="cover">
        <TabsList className="mb-4 w-full grid grid-cols-5">
          <TabsTrigger value="cover">Cover Page</TabsTrigger>
          <TabsTrigger value="method">Method Statement</TabsTrigger>
          <TabsTrigger value="ppe">PPE & Risks</TabsTrigger>
          <TabsTrigger value="risk-table">Risk Table</TabsTrigger>
          <TabsTrigger value="personnel" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Personnel
          </TabsTrigger>
        </TabsList>

        {/* ── Cover Page ── */}
        <TabsContent value="cover">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cover Page Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Contract / Job Name</Label>
                  <Input
                    value={coverFields.contractJobName}
                    onChange={(e) => setCoverFields({ ...coverFields, contractJobName: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Client</Label>
                  <Input
                    value={coverFields.client}
                    onChange={(e) => setCoverFields({ ...coverFields, client: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Assessment Date</Label>
                  <Input
                    value={coverFields.assessmentDate}
                    onChange={(e) => setCoverFields({ ...coverFields, assessmentDate: e.target.value })}
                    className="mt-1"
                    placeholder="e.g. 01/01/2025"
                  />
                </div>
                <div>
                  <Label className="text-xs">Attendance Date</Label>
                  <Input
                    value={coverFields.attendanceDate}
                    onChange={(e) => setCoverFields({ ...coverFields, attendanceDate: e.target.value })}
                    className="mt-1"
                    placeholder="e.g. 15/03/2025"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Site / Location</Label>
                <Textarea
                  value={coverFields.siteLocation}
                  onChange={(e) => setCoverFields({ ...coverFields, siteLocation: e.target.value })}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Method Statement ── */}
        <TabsContent value="method">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Description of Work</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={descriptionOfWork}
                  onChange={(e) => setDescriptionOfWork(e.target.value)}
                  rows={4}
                  className="resize-none text-sm"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-6">
                <ListEditor
                  label="2.2 Sequence of Operations"
                  items={sequenceOfOps}
                  onChange={setSequenceOfOps}
                  placeholder="Add a step…"
                />
                <Separator />
                <ListEditor
                  label="2.3 Task-Specific Operations"
                  items={taskSpecificOps}
                  onChange={setTaskSpecificOps}
                  placeholder="Add a task-specific step…"
                />
                <Separator />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2.4 Location</Label>
                    <Textarea value={location} onChange={(e) => setLocation(e.target.value)} rows={2} className="mt-1 resize-none text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3 Resources</Label>
                    <Textarea value={resources} onChange={(e) => setResources(e.target.value)} rows={2} className="mt-1 resize-none text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3.1 Personnel</Label>
                    <Textarea value={personnel} onChange={(e) => setPersonnel(e.target.value)} rows={2} className="mt-1 resize-none text-sm" />
                  </div>
                </div>
                <Separator />
                <ListEditor
                  label="3.3 Plant and Equipment"
                  items={plantAndEquipment}
                  onChange={setPlantAndEquipment}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── PPE & Risks ── */}
        <TabsContent value="ppe">
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-4 space-y-6">
                <ListEditor
                  label="4 Significant Risks"
                  items={significantRisks}
                  onChange={setSignificantRisks}
                  placeholder="Add a significant risk…"
                />
                <Separator />
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">4.3 Special Training</Label>
                  <Textarea
                    value={specialTraining}
                    onChange={(e) => setSpecialTraining(e.target.value)}
                    rows={3}
                    className="mt-1 resize-none text-sm"
                  />
                </div>
                <Separator />
                <ListEditor
                  label="5 PPE Required"
                  items={ppeItems}
                  onChange={setPpeItems}
                  placeholder="Add a PPE item…"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Risk Table ── */}
        <TabsContent value="risk-table">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Risk Assessment Rows</p>
                <p className="text-xs text-muted-foreground">
                  Rating = Likelihood × Severity. ≥15 High · 8–14 Medium · 4–7 Low-Medium · &lt;4 Low
                </p>
              </div>
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => setRiskRows([...riskRows, ["", "", "", "", "", "", "", "", "", "", ""]])}
              >
                <Plus className="h-3.5 w-3.5" /> Add row
              </Button>
            </div>

            {riskRows.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-muted-foreground text-sm">
                <AlertTriangle className="h-6 w-6 opacity-40" />
                <p>No risk rows yet. Add your first row above.</p>
              </div>
            )}

            {riskRows.length > 0 && (
              <DndContext
                sensors={riskSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  const { active, over } = event;
                  if (!over || active.id === over.id) return;
                  const ids = riskRows.map((_, idx) => `risk-${idx}`);
                  const oi = ids.indexOf(active.id as string);
                  const ni = ids.indexOf(over.id as string);
                  if (oi !== -1 && ni !== -1) setRiskRows(arrayMove(riskRows, oi, ni));
                }}
              >
                <SortableContext items={riskRows.map((_, idx) => `risk-${idx}`)} strategy={verticalListSortingStrategy}>
                  {riskRows.map((row, i) => (
                    <SortableRiskRow
                      key={`risk-${i}`}
                      id={`risk-${i}`}
                      index={i}
                      row={row}
                      onChange={(r) => { const next = [...riskRows]; next[i] = r; setRiskRows(next); }}
                      onDelete={() => setRiskRows(riskRows.filter((_, j) => j !== i))}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </TabsContent>

        {/* -- Personnel & Approval -- */}
        <TabsContent value="personnel">
          <div className="space-y-6">

            {/* Personnel List */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Personnel on Site
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">List all individuals attending site under this RAMS.</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={addPersonWithMyDetails}>
                    <Plus className="h-3.5 w-3.5" /> Add Person
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {personnelList.length === 0 && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-muted-foreground text-sm">
                    <Users className="h-6 w-6 opacity-40" />
                    <p>No personnel added yet.</p>
                  </div>
                )}
                {personnelList.map((p, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3 grid grid-cols-3 gap-3 items-end">
                    <div>
                      <Label className="text-xs">Full Name</Label>
                      <div className="flex gap-1 mt-1">
                        <Input value={p.name} placeholder="Enter name…" className="text-sm flex-1"
                          onChange={(e) => { const next = [...personnelList]; next[i] = { ...next[i], name: e.target.value }; setPersonnelList(next); }} />
                        {engineerProfiles.length > 0 && (
                           <Select
                             value=""
                             onValueChange={(val) => {
                               const ep = engineerProfiles.find((e) => e.user_id === val);
                               const next = [...personnelList];
                               next[i] = {
                                 ...next[i],
                                 name: ep?.full_name || val,
                                 role: next[i].role || "Service Engineer",
                               };
                               setPersonnelList(next);
                             }}
                           >
                             <SelectTrigger className="text-sm h-9 w-9 px-2 shrink-0" title="Pick from engineers">
                               <Users className="h-3.5 w-3.5" />
                             </SelectTrigger>
                             <SelectContent>
                               {engineerProfiles.map((ep) => (
                                 <SelectItem key={ep.user_id} value={ep.user_id}>
                                   {ep.full_name}{ep.phone ? ` · ${ep.phone}` : ""}
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                         )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Role / Trade</Label>
                      <Input value={p.role} className="mt-1 text-sm"
                        onChange={(e) => { const next = [...personnelList]; next[i] = { ...next[i], role: e.target.value }; setPersonnelList(next); }} />
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Company</Label>
                        <Input value={p.company} className="mt-1 text-sm"
                          onChange={(e) => { const next = [...personnelList]; next[i] = { ...next[i], company: e.target.value }; setPersonnelList(next); }} />
                      </div>
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive/70 hover:text-destructive shrink-0"
                        onClick={() => setPersonnelList(personnelList.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* RAMS Approval */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" /> RAMS Approval
                </CardTitle>
                <p className="text-xs text-muted-foreground">Person responsible for approving this RAMS document.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Approver Name</Label>
                    <div className="flex gap-1 mt-1">
                      <Input value={approvalFields.approverName} className="text-sm flex-1"
                        onChange={(e) => setApprovalFields({ ...approvalFields, approverName: e.target.value })} />
                      {engineerProfiles.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(val) => {
                            const ep = engineerProfiles.find((e) => e.user_id === val);
                            setApprovalFields({ ...approvalFields, approverName: ep?.full_name || val });
                          }}
                        >
                          <SelectTrigger className="text-sm h-9 w-9 px-2 shrink-0" title="Pick from engineers">
                            <Users className="h-3.5 w-3.5" />
                          </SelectTrigger>
                          <SelectContent>
                            {engineerProfiles.map((ep) => (
                              <SelectItem key={ep.user_id} value={ep.user_id}>
                                {ep.full_name}{ep.phone ? ` · ${ep.phone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Approver Role / Title</Label>
                    <Input value={approvalFields.approverRole} className="mt-1 text-sm"
                      onChange={(e) => setApprovalFields({ ...approvalFields, approverRole: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Approval Date</Label>
                    <Input value={approvalFields.approvalDate} className="mt-1 text-sm" placeholder="DD/MM/YYYY"
                      onChange={(e) => setApprovalFields({ ...approvalFields, approvalDate: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Approver Signature</Label>
                  <SignaturePad
                    value={approvalFields.approverSignature}
                    onChange={(v) => setApprovalFields({ ...approvalFields, approverSignature: v })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Supervisor */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" /> Site Supervisor
                </CardTitle>
                <p className="text-xs text-muted-foreground">The nominated supervisor responsible for ensuring compliance with this RAMS on site.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Supervisor Name</Label>
                    <div className="flex gap-1 mt-1">
                      <Input value={supervisorFields.supervisorName} className="text-sm flex-1"
                        onChange={(e) => setSupervisorFields({ ...supervisorFields, supervisorName: e.target.value })} />
                      {engineerProfiles.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(val) => {
                            const ep = engineerProfiles.find((e) => e.user_id === val);
                            setSupervisorFields({
                              ...supervisorFields,
                              supervisorName: ep?.full_name || val,
                              supervisorContact: supervisorFields.supervisorContact || ep?.phone || "",
                            });
                          }}
                        >
                          <SelectTrigger className="text-sm h-9 w-9 px-2 shrink-0" title="Pick from engineers">
                            <Users className="h-3.5 w-3.5" />
                          </SelectTrigger>
                          <SelectContent>
                            {engineerProfiles.map((ep) => (
                              <SelectItem key={ep.user_id} value={ep.user_id}>
                                {ep.full_name}{ep.phone ? ` · ${ep.phone}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Role / Title</Label>
                    <Input value={supervisorFields.supervisorRole} className="mt-1 text-sm"
                      onChange={(e) => setSupervisorFields({ ...supervisorFields, supervisorRole: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Contact Number</Label>
                    <Input value={supervisorFields.supervisorContact} className="mt-1 text-sm" placeholder="e.g. 07700 000000"
                      onChange={(e) => setSupervisorFields({ ...supervisorFields, supervisorContact: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Supervisor Signature</Label>
                  <SignaturePad
                    value={supervisorFields.supervisorSignature}
                    onChange={(v) => setSupervisorFields({ ...supervisorFields, supervisorSignature: v })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-end gap-3 border-t bg-background/95 backdrop-blur px-6 py-3 shadow-lg">
        <span className="text-sm text-muted-foreground flex-1">
          {job ? `${job.reference_number} · ${RAMS_TYPE_LABELS[ramsType]} RAMS` : "RAMS Editor"}
        </span>
        <RamsPdfExport
          formData={buildFormData()}
          jobInfo={job}
          jobId={jobId ?? undefined}
          ramsType={ramsType}
        />
        {jobId ? (
          <Button onClick={() => save()} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save RAMS"}
          </Button>
        ) : (
          <Button onClick={() => setSaveToJobOpen(true)} disabled={saving} size="sm">
            <Briefcase className="mr-1.5 h-3.5 w-3.5" /> Save to Job
          </Button>
        )}
      </div>

      {/* Save to Job dialog */}
      <Dialog open={saveToJobOpen} onOpenChange={setSaveToJobOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Save RAMS to Job
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">Search by job name or reference</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-8"
                placeholder="e.g. VFP-00123 or Exeter University…"
                value={jobSearch}
                onChange={(e) => { setJobSearch(e.target.value); searchJobs(e.target.value); }}
                autoFocus
              />
            </div>
            {jobSearchLoading && <p className="text-xs text-muted-foreground animate-pulse">Searching…</p>}
            {jobSearchResults.length > 0 && (
              <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                {jobSearchResults.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelectedSaveJob(j)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${selectedSaveJob?.id === j.id ? "bg-primary/10 font-medium" : ""}`}
                  >
                    <span className="font-mono text-xs text-muted-foreground mr-2">{j.reference_number}</span>
                    {j.name}
                    {j.customers?.name && <span className="text-xs text-muted-foreground ml-1">· {j.customers.name}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedSaveJob && (
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>Saving to: <strong>{selectedSaveJob.reference_number}</strong> · {selectedSaveJob.name}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveToJobOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedSaveJob || saving}
              onClick={async () => {
                if (!selectedSaveJob) return;
                await save(selectedSaveJob.id);
                setSaveToJobOpen(false);
                toast({ title: "RAMS saved", description: `Linked to ${selectedSaveJob.reference_number}` });
                navigate(`/jobs/${selectedSaveJob.id}`);
              }}
            >
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save & Go to Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
