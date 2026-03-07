import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Briefcase, Users, FileText } from "lucide-react";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [engineers, setEngineers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const escapeLike = (str: string) => str.replace(/[%_\\]/g, "\\$&");

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
      setJobs([]);
      setEngineers([]);
      setReports([]);
      return;
    }
    const term = `%${escapeLike(trimmed)}%`;
    const [jobsRes, engRes, repRes] = await Promise.all([
      supabase.from("jobs").select("id, name, reference_number").or(`name.ilike.${term},reference_number.ilike.${term}`).limit(5),
      supabase.from("profile_names" as any).select("user_id, full_name").ilike("full_name", term).limit(5),
      supabase.from("field_reports").select("id, title, job_id").ilike("title", term).limit(5),
    ]);
    setJobs(jobsRes.data || []);
    setEngineers(engRes.data || []);
    setReports(repRes.data || []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search jobs, engineers, reports..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {jobs.length > 0 && (
          <CommandGroup heading="Jobs">
            {jobs.map((j) => (
              <CommandItem key={j.id} onSelect={() => handleSelect(`/jobs/${j.id}`)}>
                <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs mr-2">{j.reference_number}</span>
                {j.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {engineers.length > 0 && (
          <CommandGroup heading="Engineers">
            {engineers.map((e) => (
              <CommandItem key={e.user_id} onSelect={() => handleSelect("/engineers")}>
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                {e.full_name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {reports.length > 0 && (
          <CommandGroup heading="Servexa Reports">
            {reports.map((r) => (
              <CommandItem key={r.id} onSelect={() => handleSelect(`/jobs/${r.job_id}`)}>
                <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                {r.title}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
