
## Full picture

The existing RAMS PDF is hardcoded for **Dry Riser pressure testing** in `src/lib/ramsPdf.ts` — a 1,118-line file with the title, method statement text, risk rows, and cover page all specific to dry riser work. The `generateRamsPdf` function is called from both `RamsPdfExport.tsx` and `JobDocuments.tsx`.

Job sheet templates for dry riser (Visual and Pressure Test) are stored in the `job_sheet_templates` table with `category = 'dry_riser'`. There are currently **no** sprinkler, fire extinguisher, or fire hydrant entries.

## Plan

### 1. Job categories — seed 3 new categories
Add `sprinkler`, `fire_extinguisher`, and `fire_hydrant` to the `job_categories` table via a database migration (data insert).

### 2. Job sheet templates — seed new templates
Via database insert, create inspection/service templates for:
- **Sprinkler** — Quarterly/Annual service fields (water supply check, pressure readings, control valve test, flow test, alarm test, etc.)
- **Fire Extinguisher** — Annual service fields (type, serial number, weight check, pressure indicator, discharge test, condition, certification)
- **Fire Hydrant** — Annual inspection fields (hydrant type, location, valve condition, flow test, pressure at outlet, obstruction check, marker post condition)

Each template will have `category` set to its respective slug and `job_category` linked accordingly so they auto-attach correctly.

### 3. RAMS PDFs — 3 new generator functions
Create a new file `src/lib/ramsPdfVariants.ts` exporting three functions:
- `generateSprinklerRamsPdf(formData, jobInfo, engineers)` — same 10-page structure, updated cover title ("Sprinkler System Inspection & Servicing"), updated method statement text (sections 2–12 tailored to sprinkler work: isolation of water supply, pressure checks, alarm bypass, re-commissioning), and 4 risk table pages with sprinkler-specific hazards (water damage, false alarms, electrical components, working at height on sprinkler heads)
- `generateExtinguisherRamsPdf(formData, jobInfo, engineers)` — updated for fire extinguisher servicing: CO2/powder/foam handling risks, pressurised containers, discharge testing
- `generateHydrantRamsPdf(formData, jobInfo, engineers)` — updated for fire hydrant work: working in public/road areas, traffic management, underground chambers, water main pressure

All three reuse the same helpers (page header/footer, risk table renderer, signature rows, watermark) which will be extracted into a shared `src/lib/ramsPdfBase.ts` to avoid duplication.

### 4. Wire up RAMS generation
Update `RamsPdfExport.tsx` to accept a `ramsType` prop (`'dry_riser' | 'sprinkler' | 'fire_extinguisher' | 'fire_hydrant'`) and call the correct generator. Update `JobDocuments.tsx` to detect the job's category and show the matching RAMS button.

### 5. Category document templates — auto-attach new templates
New category document template rules so the appropriate job sheet templates auto-attach when a job of each new category is created (matching the existing dry riser auto-attach behaviour).

---

## File changes summary

```text
NEW   src/lib/ramsPdfBase.ts           — shared helpers (header, footer, risk table, signatures)
NEW   src/lib/ramsPdfVariants.ts       — sprinkler, extinguisher, hydrant generators
MOD   src/lib/ramsPdf.ts               — refactored to use shared base helpers
MOD   src/components/RamsPdfExport.tsx — accept ramsType prop, dispatch to correct generator
MOD   src/components/JobDocuments.tsx  — detect category, show correct RAMS type
DB    job_categories                   — insert 3 new rows (data migration)
DB    job_sheet_templates              — insert ~6 new templates (2 per category)
```

This is a large but well-structured piece of work. The biggest effort is writing the three new RAMS method statement texts (sections 1–12 + risk rows) which are domain-specific and will be composed from standard fire industry content appropriate to each trade.
