
## What's already done
All code is in place from the previous implementation session:
- `src/lib/ramsPdfBase.ts` — shared PDF helpers ✓
- `src/lib/ramsPdfVariants.ts` — all 3 RAMS generators (sprinkler, extinguisher, hydrant) ✓  
- `src/components/RamsPdfExport.tsx` — `ramsType` prop and dispatch logic ✓
- `src/components/JobDocuments.tsx` — `ramsTypeForJob()` detection ✓

## What's missing — database seed data only

### Migration: Insert 3 job categories
```sql
INSERT INTO job_categories (name, slug, sort_order)
VALUES
  ('Sprinkler', 'sprinkler', 10),
  ('Fire Extinguisher', 'fire_extinguisher', 11),
  ('Fire Hydrant', 'fire_hydrant', 12)
ON CONFLICT DO NOTHING;
```

### Migration: Insert 6 job sheet templates
Two templates per category (matching dry riser pattern of Visual + Pressure/Service):

**Sprinkler** (2 templates):
- `Sprinkler System — Annual Service` (fields: system type, reference, number of heads, water supply check, pump test, alarm valve test, pressure readings, flow test, system restored, engineer comments, pass/fail)
- `Sprinkler System — Quarterly Inspection` (fields: system type, reference, visual inspection checks, control valve status, alarm test, overall condition, pass/fail)

**Fire Extinguisher** (2 templates):
- `Fire Extinguisher — Annual Service` (fields: location, extinguisher type, serial number, weight check, pressure indicator, safety pin, hose/horn, service label fitted, discharge test required, condition, pass/fail)
- `Fire Extinguisher — Extended Service` (fields: location, type, serial number, date last extended service, internal inspection, O-rings replaced, recharged weight, hydraulic test required, new label fitted, condemned/replaced, notes)

**Fire Hydrant** (2 templates):
- `Fire Hydrant — Annual Inspection` (fields: hydrant type, location/reference, valve condition, outlet cap condition, flow test result, outlet pressure, marker post condition, access clear, pass/fail, remedial action required)
- `Fire Hydrant — Quarterly Visual Check` (fields: hydrant reference, location, marker post visible, cover/lid condition, access obstruction, overall condition, pass/fail)

Each template: `category` = slug, `job_category` = slug, `fields` = JSON array.

## Implementation
Single migration file with:
1. `INSERT INTO job_categories` (3 rows)  
2. `INSERT INTO job_sheet_templates` (6 rows with full field JSON)

No code changes needed — everything is already wired up and waiting for this data.
