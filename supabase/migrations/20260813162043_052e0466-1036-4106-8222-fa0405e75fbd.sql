CREATE TABLE public.rams_hazard_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT get_user_org_id(),
  slug text NOT NULL,
  name text NOT NULL,
  summary text,
  hazard_description text NOT NULL DEFAULT '',
  control_measures jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_additions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe_additions jsonb NOT NULL DEFAULT '[]'::jsonb,
  plant_additions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  is_seeded_template boolean NOT NULL DEFAULT true,
  review_note text,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rams_hazard_modules_status_chk CHECK (status IN ('draft','approved','archived')),
  CONSTRAINT rams_hazard_modules_org_slug_key UNIQUE (org_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rams_hazard_modules TO authenticated;
GRANT ALL ON public.rams_hazard_modules TO service_role;

ALTER TABLE public.rams_hazard_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view hazard modules"
  ON public.rams_hazard_modules FOR SELECT TO authenticated
  USING (org_id = get_user_org_id());

CREATE POLICY "Org admins manage hazard modules"
  ON public.rams_hazard_modules FOR ALL TO authenticated
  USING (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role))
  WITH CHECK (org_id = get_user_org_id() AND has_role_in_org(auth.uid(), get_user_org_id(), 'admin'::app_role));

CREATE POLICY "deny_when_org_suspended"
  ON public.rams_hazard_modules FOR ALL TO authenticated
  USING (is_org_active(get_user_org_id()))
  WITH CHECK (is_org_active(get_user_org_id()));

CREATE TRIGGER trg_rams_hazard_modules_updated_at
  BEFORE UPDATE ON public.rams_hazard_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rams_documents
  ADD COLUMN IF NOT EXISTS hazard_modules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Starter module content (UK HSE-aligned drafts; every org must approve its own copy)
CREATE OR REPLACE FUNCTION public.starter_hazard_modules()
RETURNS TABLE (
  slug text, name text, summary text, hazard_description text,
  control_measures jsonb, risk_rows jsonb, sequence_additions jsonb,
  ppe_additions jsonb, plant_additions jsonb, sort_order integer
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
SELECT * FROM (VALUES
  (
    'hot_works', 'Hot works',
    'Grinding, cutting, brazing, soldering or any work producing heat, sparks or flame.',
    'Hot works generate sparks, hot slag, open flame and hot surfaces capable of igniting combustible materials, insulation, dust or flammable atmospheres. Residual heat can cause a fire to develop long after the work has finished. Additional hazards include hot metal burns, arc eye, and fume/particulate inhalation. Works are controlled under a Hot Works Permit in line with the site fire safety plan.',
    '["Hot Works Permit obtained from the Principal Contractor / building management before any heat-producing activity begins.","Combustible materials removed to at least 10 metres, or protected with fire-retardant blankets/screens where removal is not possible.","Detection isolated only with written agreement, and reinstated immediately on completion; interim fire watch arrangements agreed in writing.","Suitable fire extinguishers (water and CO2/dry powder) sited within arm''s reach of the work position.","Continuous fire watch during works and a documented one-hour fire watch after works cease, with a final check before leaving site.","Gas cylinders secured upright, fitted with flashback arrestors, and removed from the work area at the end of each shift.","Local exhaust ventilation or forced ventilation where fume cannot disperse naturally.","Operatives trained and competent in hot works; permit signed off and closed with building management."]'::jsonb,
    '[["Hot works (grinding / cutting / brazing)","Ignition of combustible materials by sparks or hot slag","Fire and smoke affecting operatives, other trades and building occupants. Property and business loss.","3","5","15","Hot Works Permit in place. Combustibles cleared to 10m or protected with fire blankets. Extinguishers to hand. Continuous fire watch plus documented 1-hour post-works fire watch and final check.","1","5","5","Permit closed with building management before leaving site."],["Hot works","Burns from hot metal, slag and equipment","Burns to hands, arms, face and eyes of operatives and persons nearby.","3","4","12","Flame-retardant clothing, gauntlets and face/eye protection worn. Hot components segregated and marked while cooling. Exclusion zone maintained around work position.","1","4","4",""],["Hot works","Welding / cutting fume and arc radiation","Respiratory irritation, metal fume fever, arc eye to operatives and adjacent workers.","3","3","9","Local exhaust ventilation or forced ventilation. RPE (FFP3 minimum) where fume cannot be controlled at source. Welding screens erected to protect others from arc radiation.","1","3","3",""]]'::jsonb,
    '["Obtain and display a Hot Works Permit before any heat-producing activity; confirm detection isolation and fire watch arrangements with building management.","On completion, extinguish and cool all hot work, complete the one-hour fire watch, re-check the area and close the permit."]'::jsonb,
    '["Flame-retardant overalls","Welding gauntlets","Welding / grinding face shield and eye protection","FFP3 respiratory protection"]'::jsonb,
    '["Fire blankets / fire-retardant screens","Water and CO2 fire extinguishers","Flashback arrestors","Local exhaust ventilation unit"]'::jsonb,
    10
  ),
  (
    'working_at_height', 'Working at height',
    'Any work where a person could fall a distance liable to cause personal injury.',
    'Working at height covers ladders, steps, podiums, tower scaffolds, MEWPs and work adjacent to fragile surfaces or unprotected edges. Hazards include falls of persons, falling tools and materials striking those below, over-reaching, unstable or damaged access equipment, and adverse weather. Work is planned, supervised and carried out by competent persons in line with the Work at Height Regulations 2005 hierarchy: avoid, prevent, minimise.',
    '["Work at height avoided where the task can be completed from ground level; where unavoidable, the least hazardous access equipment suitable for the task is selected.","All access equipment inspected before use and formally inspected at statutory intervals; defective equipment quarantined and removed from site.","Tower scaffolds erected by PASMA-trained operatives and tagged; MEWPs operated only by IPAF card holders with a rescue plan in place.","Ladders and steps used only for short-duration, low-risk tasks, secured/footed, and on firm level ground at the correct angle.","Exclusion zone established beneath the work area with barriers and signage; tools tethered or carried in closed bags to prevent dropped objects.","Fragile surfaces identified before work and never accessed without staging and edge protection.","Work suspended in high winds, ice or other adverse conditions.","No lone working at height — a second operative is present at all times."]'::jsonb,
    '[["Working at height","Fall of person from access equipment or unprotected edge","Serious or fatal injury to operatives.","3","5","15","Correct access equipment selected and pre-use inspected. Tower scaffolds erected by PASMA-trained operatives; MEWPs by IPAF card holders with rescue plan. Guardrails/edge protection in place. Three points of contact on ladders.","1","5","5","Second operative present at all times."],["Working at height","Falling tools, materials or debris","Head and impact injuries to operatives, other trades and members of the public below.","3","4","12","Exclusion zone barriered and signed beneath the work area. Tools tethered and carried in closed bags. Toe boards / debris netting fitted where materials are stored at height. Hard hats worn.","1","4","4",""],["Working at height","Unstable, damaged or unsuitable access equipment","Collapse or overturn causing serious injury.","2","5","10","Documented pre-use checks and statutory inspections. Equipment set on firm level ground, outriggers deployed, load limits observed. Damaged equipment quarantined and reported.","1","5","5",""]]'::jsonb,
    '["Survey the work position and select the least hazardous suitable access equipment; record the pre-use inspection before work starts.","Establish and maintain a barriered exclusion zone beneath all work at height for the duration of the task."]'::jsonb,
    '["Safety helmet with chinstrap","Non-slip safety footwear","Harness and lanyard (MEWP work)"]'::jsonb,
    '["Class 1 industrial ladders / podium steps","Mobile tower scaffold (PASMA)","MEWP (IPAF)","Barriers, cones and warning signage","Tool tethers and closed tool bags"]'::jsonb,
    20
  ),
  (
    'confined_spaces', 'Confined spaces',
    'Entry into tanks, pits, risers, ducts, chambers or any substantially enclosed space with a foreseeable specified risk.',
    'Confined spaces present a risk of oxygen deficiency or enrichment, flammable or toxic atmospheres, ingress of liquids or free-flowing solids, excessive heat and difficulty of rescue. Entry is only made where the work genuinely cannot be done from outside, under a confined space entry permit, by trained operatives, with continuous atmospheric monitoring and a written rescue plan in accordance with the Confined Spaces Regulations 1997 and HSE guidance L101.',
    '["Entry avoided wherever the task can be completed from outside the space using tools, cameras or remote equipment.","Confined space entry permit issued and displayed; the space is identified, isolated, drained, purged and ventilated before entry.","All entrants and the top man hold current confined space training appropriate to the classification of the space.","Atmosphere tested before entry and monitored continuously during occupation with a calibrated multi-gas detector (O2, LEL, CO, H2S).","Written rescue plan in place with rescue equipment (tripod, winch, harness, resuscitator) rigged before entry; rescue never attempted by unprotected entry.","Dedicated top man remains outside the space at all times, maintaining communication and controlling entry/exit logging.","Escape breathing apparatus available to each entrant; forced ventilation maintained throughout.","Emergency services alerted where required by the permit; means of raising the alarm confirmed before entry."]'::jsonb,
    '[["Confined space entry","Oxygen deficiency / enrichment or toxic or flammable atmosphere","Asphyxiation, poisoning, fire or explosion causing fatal injury to entrants and rescuers.","3","5","15","Entry permit in place. Space isolated, drained, purged and force-ventilated. Calibrated multi-gas monitoring before and continuously during entry, with automatic evacuation on alarm. Escape breathing apparatus carried.","1","5","5",""],["Confined space entry","Entrapment or inability to rescue a casualty","Fatal injury to entrant and to untrained would-be rescuers.","2","5","10","Written rescue plan and trained rescue team. Tripod, winch and harness rigged before entry. Dedicated top man outside with continuous communication and entry log. No unprotected rescue entry under any circumstances.","1","5","5",""],["Confined space entry","Ingress of water, sewage or free-flowing material","Drowning, engulfment or contamination causing serious injury or infection.","2","5","10","Positive isolation and lock-off of all inlets. Level monitoring and weather check before entry. Works stopped and space evacuated on any sign of ingress. Washing facilities and hygiene controls provided.","1","5","5",""]]'::jsonb,
    '["Confirm whether the task can be completed without entry; only proceed to entry where it cannot.","Issue the confined space entry permit, isolate and ventilate the space, rig rescue equipment and complete pre-entry gas testing before any operative enters.","Log every entry and exit with the top man and close the permit on completion."]'::jsonb,
    '["Full body rescue harness","Escape breathing apparatus","Disposable coveralls and gloves (biological contamination)"]'::jsonb,
    '["Calibrated multi-gas detector (O2, LEL, CO, H2S)","Tripod, winch and rescue line","Forced ventilation / air mover","Intrinsically safe lighting and two-way radios"]'::jsonb,
    30
  ),
  (
    'asbestos_adjacent', 'Asbestos-adjacent work',
    'Work in or near buildings that may contain asbestos-containing materials (ACMs).',
    'Work in pre-2000 buildings may disturb asbestos-containing materials in pipe lagging, gaskets, rope seals, ceiling tiles, AIB panels and sprayed coatings. Disturbance releases respirable fibres which cause mesothelioma, lung cancer and asbestosis. No work proceeds without sight of the site asbestos register and refurbishment/demolition survey, in line with the Control of Asbestos Regulations 2012.',
    '["Site asbestos register and refurbishment/demolition survey obtained and reviewed with the client before works commence; works do not start without them.","All operatives hold current UKATA (or equivalent) asbestos awareness training, refreshed annually.","No drilling, cutting or breaking into any suspect material — assume ACM until proven otherwise by survey or sampling.","If suspect material is discovered or disturbed: stop work immediately, withdraw, prevent access, and report to the client and site management.","Only licensed contractors carry out any removal or remediation of ACMs; our operatives never remove or disturb ACMs.","Work positions checked against the register at the start of every visit, not just at project start.","Clearance certificate obtained before re-entering any area that has undergone asbestos removal."]'::jsonb,
    '[["Work in pre-2000 buildings","Disturbance of asbestos-containing materials","Inhalation of respirable fibres causing mesothelioma, lung cancer or asbestosis in operatives and building occupants.","3","5","15","Asbestos register and survey reviewed before works. Asbestos awareness training current for all operatives. No penetration of suspect materials. Work positions re-checked at every visit.","1","5","5","Licensed contractor engaged for any removal."],["Discovery of suspect material during works","Uncontrolled fibre release","Exposure of operatives, other trades and occupants.","2","5","10","Stop work, withdraw and prevent access immediately. Report to client and site management. Area sealed pending sampling. Work resumes only after written clearance.","1","5","5",""]]'::jsonb,
    '["Review the site asbestos register and refurbishment/demolition survey with the client before mobilising; do not start works without them.","Stop work and withdraw immediately on discovery of any suspect material, and report to the client before resuming."]'::jsonb,
    '["Disposable coveralls (Type 5/6) for withdrawal only"]'::jsonb,
    '["Copy of site asbestos register held on site","Warning signage and barrier tape"]'::jsonb,
    40
  ),
  (
    'live_water_supplies', 'Live water supplies',
    'Work on charged mains, wet risers, sprinkler systems and other pressurised water systems.',
    'Work on live or charged water systems presents risks of uncontrolled discharge, high-pressure water injury, flooding and consequential damage to property and electrical installations, slips on wet surfaces, and loss of fire protection cover while systems are isolated. Legionella risk arises where stagnant or aerosolised water is present.',
    '["System isolation agreed in writing with building management, with valves locked off and tagged, and the impairment recorded in the site fire log.","Water-supply impairment period kept to a minimum; interim fire safety measures (fire watch) agreed where protection is reduced.","System depressurised and drained down to a controlled point before any connection is broken; residual pressure verified at a gauge.","Drainage route, drip trays, wet vacuum and absorbent mats in place before work begins; nearby electrical equipment protected or isolated.","Aerosol generation minimised and RPE worn where legionella risk is identified; systems flushed before return to service.","Slip hazards signed and wet areas barriered; floors dried before areas are handed back.","System recharged slowly with all persons clear of joints; all connections proved leak-free before leaving site.","Building management notified in writing when the system is returned to full service."]'::jsonb,
    '[["Work on charged water systems","Uncontrolled discharge / flooding","Water damage to building fabric, contents and electrical installations; slip injuries to operatives and occupants.","3","4","12","Written isolation agreed and valves locked off/tagged. System drained to a controlled point and pressure proved at gauge. Drip trays, wet vacuum and absorbent mats in place. Electrical equipment protected or isolated.","1","4","4",""],["Breaking into pressurised pipework","High-pressure water release","Injection or impact injury to operatives; eye injury.","3","5","15","Depressurise and verify zero pressure before breaking any joint. Stand clear of joint lines when recharging. Face and eye protection worn. Recharge slowly with all persons clear.","1","5","5",""],["System isolation","Loss of fire protection cover while isolated","Increased fire risk to building occupants during the impairment.","3","5","15","Impairment agreed in writing and logged in the site fire log. Isolation period minimised. Interim fire watch arranged with building management. Written confirmation issued on return to service.","1","5","5",""],["Stagnant or aerosolised water","Legionella exposure","Respiratory infection in operatives and occupants.","2","4","8","Aerosol generation minimised. RPE worn where risk identified. Systems flushed before return to service in line with the site water safety plan.","1","4","4",""]]'::jsonb,
    '["Agree the isolation in writing with building management, lock off and tag the valves, and record the impairment in the site fire log.","Prove zero pressure at a gauge and drain to a controlled point before breaking into any pipework.","Recharge slowly, prove all joints leak-free, dry the area and confirm return to service in writing."]'::jsonb,
    '["Waterproof gloves and safety glasses","Non-slip safety footwear"]'::jsonb,
    '["Drip trays and absorbent mats","Wet vacuum","Lock-off kit and isolation tags","Wet floor signage and barriers"]'::jsonb,
    50
  ),
  (
    'night_working', 'Night working',
    'Works carried out outside normal hours, typically 21:00 to 06:00.',
    'Night working introduces reduced lighting, fatigue and reduced alertness, reduced site support and slower emergency response, lone-working exposure, and reduced visibility to vehicles and plant. Shift patterns are managed in line with the Working Time Regulations 1998 including health assessment for night workers.',
    '["Shift lengths, breaks and rest periods planned in line with the Working Time Regulations; consecutive night shifts limited and travel time accounted for.","Night workers offered a health assessment before assignment and at regular intervals thereafter.","Task lighting of appropriate lux level provided for the work area plus safe lit access and egress routes; emergency lighting confirmed operational.","No high-risk activity (hot works, confined space entry or work at height) undertaken alone at night — a second competent operative is present.","Out-of-hours contact established with building management/security before works begin, with an agreed check-in interval and escalation route.","Lone-working monitoring in place (scheduled check-ins or a lone-worker device) with a defined no-contact escalation procedure.","Emergency arrangements, escape routes and the location of the nearest A&E confirmed and briefed at the start of the shift.","Works reviewed for fatigue at each break; operatives instructed to stop and report if unfit to continue."]'::jsonb,
    '[["Night working","Fatigue and reduced alertness","Increased error rate and accident risk to operatives; driving incidents travelling to and from site.","3","4","12","Shift lengths and breaks planned to the Working Time Regulations. Health assessment offered to night workers. Fatigue reviewed at each break. Operatives instructed to stop and report if unfit to continue.","1","4","4",""],["Night working","Poor lighting to work area and access routes","Slips, trips, falls and struck-by injuries to operatives.","3","4","12","Task lighting to appropriate lux level provided. Lit access and egress routes confirmed and emergency lighting proved operational. High-visibility clothing worn.","1","4","4",""],["Night working","Reduced site support and delayed emergency response","Delayed treatment of an injured operative; lone-working exposure.","3","4","12","Out-of-hours contact with building management/security agreed before works. Scheduled check-ins or lone-worker device with no-contact escalation. No high-risk activity undertaken alone. Emergency arrangements briefed at shift start.","1","4","4",""]]'::jsonb,
    '["Confirm out-of-hours access, security contact and check-in intervals with building management before the shift begins.","Set up task lighting and confirm lit access/egress and emergency lighting before works commence.","Brief emergency arrangements and check-in procedure at the start of every night shift."]'::jsonb,
    '["High-visibility clothing (Class 3 where vehicles are present)","Head torch"]'::jsonb,
    '["Portable task lighting / lighting towers","Lone-worker device or scheduled check-in system"]'::jsonb,
    60
  )
) AS t(slug, name, summary, hazard_description, control_measures, risk_rows, sequence_additions, ppe_additions, plant_additions, sort_order);
$$;

-- Seed the starter set as DRAFTS for every existing organisation
INSERT INTO public.rams_hazard_modules
  (org_id, slug, name, summary, hazard_description, control_measures, risk_rows,
   sequence_additions, ppe_additions, plant_additions, status, is_seeded_template, sort_order)
SELECT o.id, m.slug, m.name, m.summary, m.hazard_description, m.control_measures, m.risk_rows,
       m.sequence_additions, m.ppe_additions, m.plant_additions, 'draft', true, m.sort_order
FROM public.organisations o
CROSS JOIN public.starter_hazard_modules() m
ON CONFLICT (org_id, slug) DO NOTHING;

-- New orgs get the same draft starter set
CREATE OR REPLACE FUNCTION public.seed_org_hazard_modules(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rams_hazard_modules
    (org_id, slug, name, summary, hazard_description, control_measures, risk_rows,
     sequence_additions, ppe_additions, plant_additions, status, is_seeded_template, sort_order)
  SELECT _org_id, m.slug, m.name, m.summary, m.hazard_description, m.control_measures, m.risk_rows,
         m.sequence_additions, m.ppe_additions, m.plant_additions, 'draft', true, m.sort_order
  FROM public.starter_hazard_modules() m
  ON CONFLICT (org_id, slug) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_org_created_seed_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.id <> '11111111-1111-1111-1111-111111111111'::uuid THEN
    PERFORM public.seed_org_reference_data(NEW.id);
  END IF;
  PERFORM public.seed_org_hazard_modules(NEW.id);
  RETURN NEW;
END;
$$;