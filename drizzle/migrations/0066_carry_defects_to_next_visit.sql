ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS works_required text,
  ADD COLUMN IF NOT EXISTS materials_required text,
  ADD COLUMN IF NOT EXISTS scheduled_visit_id uuid REFERENCES public.job_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carry_outcome text,
  ADD COLUMN IF NOT EXISTS carry_comment text,
  ADD COLUMN IF NOT EXISTS carry_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS carry_recorded_by uuid;
CREATE INDEX IF NOT EXISTS defects_scheduled_job_idx ON public.defects(scheduled_job_id);

-- Next open upcoming visit for a site (prefers a job carrying the riser), skipping one visit if given.
CREATE OR REPLACE FUNCTION public.next_visit_for_defect(p_org uuid, p_site uuid, p_asset uuid, p_after_visit uuid DEFAULT NULL)
RETURNS TABLE(visit_id uuid, job_id uuid, visit_date date, job_ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, j.id, v.scheduled_date, j.reference_number
  FROM public.job_visits v JOIN public.jobs j ON j.id = v.job_id
  WHERE v.org_id = p_org AND j.org_id = p_org AND j.site_id = p_site
    AND v.scheduled_date >= current_date
    AND coalesce(v.status,'scheduled') NOT IN ('completed','cancelled')
    AND coalesce(j.status,'') NOT IN ('completed','cancelled','invoiced','archived')
    AND (p_after_visit IS NULL OR v.id <> p_after_visit)
  ORDER BY (p_asset IS NOT NULL AND EXISTS (SELECT 1 FROM public.job_risers r WHERE r.job_id = j.id AND r.asset_id = p_asset)) DESC,
           v.scheduled_date, v.scheduled_time NULLS LAST
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.next_visit_for_defect(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.schedule_defects_on_next_visit(p_defect_ids uuid[])
RETURNS TABLE(defect_id uuid, outcome text, visit_id uuid, job_id uuid, visit_date date, job_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o uuid := public.get_user_org_id(); d record; n record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only office staff can schedule defects'; END IF;
  FOR d IN SELECT * FROM public.defects WHERE id = ANY(p_defect_ids) AND org_id = o LOOP
    IF d.site_id IS NULL THEN
      defect_id := d.id; outcome := 'no_site'; visit_id := NULL; job_id := NULL; visit_date := NULL; job_ref := NULL; RETURN NEXT; CONTINUE;
    END IF;
    SELECT * INTO n FROM public.next_visit_for_defect(o, d.site_id, d.asset_id, NULL);
    IF n.visit_id IS NULL THEN
      defect_id := d.id; outcome := 'no_visit'; visit_id := NULL; job_id := NULL; visit_date := NULL; job_ref := NULL; RETURN NEXT; CONTINUE;
    END IF;
    UPDATE public.defects SET scheduled_visit_id = n.visit_id, scheduled_job_id = n.job_id, status = 'scheduled',
      carry_outcome = NULL, carry_comment = NULL, carry_recorded_at = NULL, carry_recorded_by = NULL, updated_at = now()
    WHERE id = d.id;
    defect_id := d.id; outcome := 'scheduled'; visit_id := n.visit_id; job_id := n.job_id; visit_date := n.visit_date; job_ref := n.job_ref; RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.schedule_defects_on_next_visit(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_defects_on_next_visit(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_act_on_job(p_job uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_job AND j.org_id = public.get_user_org_id())
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.job_assignments a WHERE a.job_id = p_job AND a.engineer_id = auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.can_act_on_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_act_on_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.job_carried_remedials(p_job uuid)
RETURNS TABLE(id uuid, title text, asset_id uuid, riser text, works_required text, materials_required text, visit_date date, carry_outcome text, carry_comment text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.title, d.asset_id, coalesce(a.riser_location, a.name), d.works_required, d.materials_required, v.scheduled_date, d.carry_outcome, d.carry_comment
  FROM public.defects d
  LEFT JOIN public.assets a ON a.id = d.asset_id
  LEFT JOIN public.job_visits v ON v.id = d.scheduled_visit_id
  WHERE d.scheduled_job_id = p_job AND public.can_act_on_job(p_job)
  ORDER BY coalesce(a.riser_location, a.name) NULLS LAST, d.created_at
$$;
REVOKE ALL ON FUNCTION public.job_carried_remedials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.job_carried_remedials(uuid) TO authenticated;

-- Done → resolved. Not done → stays open and moves to the following visit when one exists.
CREATE OR REPLACE FUNCTION public.record_carried_remedial(p_defect uuid, p_done boolean, p_comment text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; n record;
BEGIN
  SELECT * INTO d FROM public.defects WHERE id = p_defect AND org_id = public.get_user_org_id();
  IF d.id IS NULL OR d.scheduled_job_id IS NULL OR NOT public.can_act_on_job(d.scheduled_job_id) THEN
    RAISE EXCEPTION 'You cannot update this remedial';
  END IF;
  IF p_done THEN
    UPDATE public.defects SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(),
      resolution_notes = coalesce(nullif(trim(p_comment),''), resolution_notes),
      carry_outcome = 'done', carry_comment = p_comment, carry_recorded_at = now(), carry_recorded_by = auth.uid(), updated_at = now()
    WHERE id = d.id;
    RETURN 'completed';
  END IF;
  SELECT * INTO n FROM public.next_visit_for_defect(d.org_id, d.site_id, d.asset_id, d.scheduled_visit_id);
  IF n.visit_id IS NOT NULL AND n.job_id <> d.scheduled_job_id THEN
    UPDATE public.defects SET status = 'scheduled', scheduled_visit_id = n.visit_id, scheduled_job_id = n.job_id,
      carry_outcome = 'not_done', carry_comment = p_comment, carry_recorded_at = now(), carry_recorded_by = auth.uid(), updated_at = now()
    WHERE id = d.id;
    RETURN 'carried';
  END IF;
  UPDATE public.defects SET status = 'open',
    carry_outcome = 'not_done', carry_comment = p_comment, carry_recorded_at = now(), carry_recorded_by = auth.uid(), updated_at = now()
  WHERE id = d.id;
  RETURN 'open';
END $$;
REVOKE ALL ON FUNCTION public.record_carried_remedial(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_carried_remedial(uuid,boolean,text) TO authenticated;