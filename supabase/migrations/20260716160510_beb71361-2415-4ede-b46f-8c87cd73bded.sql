alter table public.help_articles
  add column if not exists source_paths text[] not null default '{}';

comment on column public.help_articles.source_paths is
  'Route(s) and component file paths this article documents. Update the article in the same edit as the UI change — a stale article is an incomplete change.';

-- Refresh existing articles that drifted after the UI declutter
update public.help_articles set
  purpose = 'Landing page after sign-in. Admins see the director overview with the "Needs me today" panel (unread emails, drafts pending review, defects, follow-ups). Engineers see only their own jobs for today.',
  steps = '[
    {"heading":"See what needs you today","items":[
      "Open the app — the Dashboard loads by default.",
      "Look at the Needs me today panel at the top: unread customer emails, pending-review PO drafts, open defects and due follow-ups.",
      "Click any row to jump straight to the item."
    ]},
    {"heading":"See today''s work","items":[
      "Look at Today''s Jobs for jobs scheduled today.",
      "Click any job card to open its detail page."
    ]},
    {"heading":"Get to other areas","items":[
      "Use the left sidebar to jump to Jobs, Planner, Customers, Reports.",
      "Press Cmd+K (Ctrl+K on Windows) for the command palette."
    ]}
  ]'::jsonb,
  source_paths = array['/', 'src/pages/Dashboard.tsx', 'src/components/DirectorDashboard.tsx', 'src/components/EngineerDashboard.tsx']
where slug = 'dashboard';

update public.help_articles set
  purpose = 'Everything about one job: assignments, visits, documents, sheets, parts, messages, sign-off and activity log. Most single-shot actions now live under the Actions menu (top right).',
  steps = '[
    {"heading":"Use the Actions menu","items":[
      "Open the job and click Actions (top right).",
      "From there: AI Brief, Print for site, Export PDF/Word, Create Quote, Create Invoice, Regenerate reports, Send customer email."
    ]},
    {"heading":"Assign an engineer","items":[
      "Open the Assignments section.",
      "Click Assign Engineer and pick from the list.",
      "Engineer sees the job on their dashboard and in Today''s Visits."
    ]},
    {"heading":"Print paper sheets","items":[
      "Actions → Print for site (or the printer icon on desktop).",
      "Choose templates. Use Edit before print to tweak header/prefill.",
      "Use Print all or per-template Print/Download."
    ]},
    {"heading":"Emails, messages, photos","items":[
      "Emails tab shows the full customer email chain for this job.",
      "Messages tab is for internal chat with the engineer.",
      "Photos tab: upload, drag-drop to reorder, click a photo to delete."
    ]},
    {"heading":"Complete the job","items":[
      "Engineer fills sheets on-site (or paper sheets are scanned back in).",
      "Customer signs off from the Sign-off tab (in person) or via a link/QR.",
      "Set status Completed or use Actions → Create Invoice."
    ]}
  ]'::jsonb,
  common_problems = '[
    {"problem":"I can''t find AI Brief / Export / Print","fix":"They moved under Actions (top right) during the declutter pass."},
    {"problem":"Sign-off link doesn''t work","fix":"Link expires after 7 days. Regenerate from the Sign-off tab."},
    {"problem":"Documents didn''t auto-attach","fix":"Check the customer has Auto-attach on their paperwork and the category has document templates."}
  ]'::jsonb,
  related_slugs = array['jobs','jobs.sheets','jobs.print-site-sheets','jobs.photos','jobs.email-chain','sign-off','rams'],
  source_paths = array['/jobs/:id', 'src/pages/JobDetail.tsx', 'src/components/jobs/JobEmailChain.tsx']
where slug = 'jobs.detail';

update public.help_articles set
  purpose = 'Workspace configuration split across five tabs: Team, Email, Documents, Integrations, Advanced. Rarely-used items now sit inside collapsible "Advanced …" sections at the bottom of the Documents and Integrations tabs.',
  steps = '[
    {"heading":"Tabs","items":[
      "Team — users, roles, engineer page access, engineer app install QR.",
      "Email — PO intake address, email branding, from-address, reminders, delivery test.",
      "Documents — job categories, asset categories, job-sheet templates, category document templates, RAMS templates, engineer signatures. Rarely-used items under Advanced document settings.",
      "Integrations — WhatsApp, Microsoft Graph, The Mellor. Xero / QuoteHound / customer merge / customer reassign / document reattach are inside Advanced integrations.",
      "Advanced — Storage migration, API key rotation, Weekly Report test, Help Articles."
    ]},
    {"heading":"Where did X go?","items":[
      "Filename format, Word export, Watermark, Vehicle checks, Fleet vehicles → Documents → Advanced document settings.",
      "Xero, QuoteHound, Merge customers, Reassign customers, Reattach job documents → Integrations → Advanced integrations.",
      "Storage migration is under the Advanced tab (hidden from casual users)."
    ]}
  ]'::jsonb,
  related_slugs = array['settings.branding','settings.documents','settings.vehicle-checks','settings.engineer-signatures','settings.import','settings.email-branding'],
  source_paths = array['/settings','src/pages/SettingsPage.tsx']
where slug = 'settings';

update public.help_articles set
  purpose = 'Documents tab of Settings. Top-level shows job categories, asset categories, job-sheet templates, category document templates, RAMS templates, engineer signatures. Advanced document settings (collapsible at the bottom) holds filename format, Word export, watermark, vehicle checks and fleet.',
  steps = '[
    {"heading":"Top-level items","items":[
      "Settings → Documents.",
      "Job Categories, Asset Categories, Job Sheet Templates, Category Document Templates, RAMS Templates, Engineer Signatures — all directly on the page."
    ]},
    {"heading":"Advanced document settings","items":[
      "Scroll to the Advanced document settings collapsible at the bottom of Documents.",
      "Inside: Filename format, Word export, Watermark, Vehicle checks, Fleet vehicles (button opens /fleet)."
    ]},
    {"heading":"Category document templates","items":[
      "Link default documents (RAMS, permits, cover sheets) per category so they auto-attach to new jobs."
    ]}
  ]'::jsonb,
  related_slugs = array['settings','settings.vehicle-checks','settings.engineer-signatures','industry-templates','fleet'],
  source_paths = array['/settings','src/pages/SettingsPage.tsx']
where slug = 'settings.documents';

update public.help_articles set
  purpose = 'Manage the reusable engineer signature library used on job PDFs and sign-off blocks. Each engineer''s saved signature is offered as "Use saved signature" wherever signing is required.',
  steps = '[
    {"heading":"Add or replace a signature","items":[
      "Settings → Documents → Engineer Signatures.",
      "Pick the engineer, draw or upload the signature, save.",
      "Saved as base64 on the engineer profile so it works offline and appears as an option in every sign-off dialog."
    ]}
  ]'::jsonb,
  source_paths = array['/settings','src/components/EngineerSignatureSettings.tsx','src/components/SignatureCapture.tsx']
where slug = 'settings.engineer-signatures';

update public.help_articles set
  purpose = 'Logo, colours, sender name and accreditations used on customer emails and PDFs.',
  steps = '[
    {"heading":"Update branding","items":[
      "Settings → Email tab → Email branding.",
      "Upload logo, set primary colour, add accreditation badges.",
      "Click Send preview to email a test to yourself before rolling out."
    ]}
  ]'::jsonb,
  source_paths = array['/settings','src/components/EmailBrandingSettings.tsx']
where slug = 'settings.branding';

-- New / previously-uncovered articles
insert into public.help_articles (slug, route_pattern, title, purpose, steps, common_problems, related_slugs, keywords, source_paths) values

('settings.vehicle-checks','/settings','Vehicle check list (settings)',
 'Edit the daily walk-around items engineers complete on their vehicle before starting work. Lives inside the Advanced document settings collapsible on the Documents tab.',
 '[{"heading":"Open the settings","items":[
    "Sidebar → Settings → Documents tab.",
    "Scroll to the bottom and expand Advanced document settings.",
    "The Vehicle Check List card is inside."
  ]},{"heading":"Edit items","items":[
    "Use the ▲/▼ arrows to reorder items.",
    "Toggle N/A on items that don''t apply to every vehicle (e.g. ladder, fire extinguisher).",
    "Add item / Reset to defaults / Save at the bottom."
  ]},{"heading":"Fleet vehicles","items":[
    "The fleet list engineers pick from lives in Documents → Advanced document settings → Fleet vehicles → Open fleet manager, or the /fleet page."
  ]}]'::jsonb,
 '[{"problem":"I can''t find Vehicle checks","fix":"Settings → Documents → expand Advanced document settings at the bottom."}]'::jsonb,
 array['vehicle-checks','fleet','settings.documents'],
 array['van check','walk around','daily check','vehicle','fleet','check sheet'],
 array['/settings','src/components/VehicleCheckSettings.tsx','src/lib/vehicleCheckItems.ts']),

('vehicle-checks','/my-profile','Daily vehicle check (engineer)',
 'Engineers complete a walk-around check on their assigned vehicle at the start of each day. Items are defined by admins under Settings → Documents → Advanced document settings → Vehicle Check List.',
 '[{"heading":"Run the check","items":[
    "Open the engineer app.",
    "From the dashboard or profile, tap Daily vehicle check.",
    "Pick the vehicle from the fleet list.",
    "Mark each item Pass / Fail / N/A, add photos of any faults, sign off."
  ]},{"heading":"Faults","items":[
    "Any Fail creates a defect visible to admins on Defects Review.",
    "Serious faults should be raised as a support ticket too."
  ]}]'::jsonb,
 '[{"problem":"My vehicle isn''t in the list","fix":"Ask admin to add it: Settings → Documents → Advanced document settings → Fleet vehicles."},{"problem":"An item doesn''t apply","fix":"If admin has enabled N/A on that item you can mark it N/A; otherwise ask admin to enable N/A in Vehicle Check List settings."}]'::jsonb,
 array['settings.vehicle-checks','fleet','defects'],
 array['van check','walk around','daily','pre-start','vehicle'],
 array['/my-profile','src/pages/MyProfile.tsx','src/lib/vehicleCheckItems.ts']),

('fleet','/fleet','Fleet vehicles',
 'The list of vehicles engineers can select for their daily vehicle check. Manage registrations, make/model and assignments here.',
 '[{"heading":"Open the fleet","items":[
    "Sidebar → Fleet, or Settings → Documents → Advanced document settings → Fleet vehicles → Open fleet manager."
  ]},{"heading":"Add / edit vehicles","items":[
    "Click Add Vehicle.",
    "Enter registration, make, model, assigned engineer.",
    "Save — it appears in the engineer''s vehicle picker."
  ]}]'::jsonb,
 '[]'::jsonb,
 array['settings.vehicle-checks','vehicle-checks','engineers'],
 array['van','vehicle','registration','fleet manager'],
 array['/fleet','src/pages/FleetVehicles.tsx']),

('jobs.remedial-checklist','/jobs/:id','Remedial works checklist',
 'Track outstanding remedial items raised from an inspection or defect and produce a Remedial Works Completion report when they''re done.',
 '[{"heading":"Add items","items":[
    "Open the job → Remedial tab.",
    "Click Add remedial item, describe the work, attach photos.",
    "Assign an engineer / due date if needed."
  ]},{"heading":"Complete","items":[
    "Engineer ticks each item complete on site with photos and notes.",
    "When all items are done, use Actions → Regenerate Remedial Works Completion PDF to produce the report."
  ]}]'::jsonb,
 '[{"problem":"Report has empty gaps between photos","fix":"Photo grid density was fixed — regenerate the report from Actions."}]'::jsonb,
 array['jobs.detail','jobs.photos','defects'],
 array['remedial','snag','follow up','completion'],
 array['/jobs/:id','src/components/JobPdfReport.tsx']),

('jobs.photos','/jobs/:id','Job photos',
 'Upload, reorder and delete photos attached to a job. Photos flow through to job sheets and reports.',
 '[{"heading":"Upload","items":[
    "Job → Photos tab (or Upload via Mobile for a QR to your phone).",
    "Drag-and-drop files onto the drop zone, or click Choose Files.",
    "Photos are EXIF-oriented and compressed automatically."
  ]},{"heading":"Reorder & delete","items":[
    "Drag a photo tile to reorder — order is used in reports.",
    "Click a photo to preview; the delete (bin) button removes it after confirmation."
  ]}]'::jsonb,
 '[{"problem":"Photos didn''t appear on the PDF","fix":"Check they are attached to this job (not just the sheet). Regenerate from Actions → Regenerate reports."}]'::jsonb,
 array['jobs.detail','jobs.sheets'],
 array['photos','images','upload','drag drop'],
 array['/jobs/:id','src/lib/jobPhotos.ts','src/hooks/useOfflinePhotoUpload.ts']),

('jobs.email-chain','/jobs/:id','Emails chain (per-job)',
 'Every inbound/outbound customer email for a job — from the original PO through follow-ups — appears on the Emails tab, so each job carries its full correspondence history.',
 '[{"heading":"View the chain","items":[
    "Open the job → Emails tab.",
    "Messages are shown newest-first; expand to see body and attachments.",
    "Viewing the tab clears the unread-email dot on the job header."
  ]},{"heading":"How matching works","items":[
    "Inbound email → matched to a job by (1) In-Reply-To/References headers, (2) PO number, (3) normalized subject+sender (14-day window).",
    "Emails matched to a completed job flag the job for admin review (red dot)."
  ]}]'::jsonb,
 '[{"problem":"A reply created a NEW draft instead of attaching","fix":"Should now be fixed — [EXTERNAL]/[EXT] tags and re:/fw:/fwd:/aw: prefixes are stripped before matching. Raise a support ticket with the two references if it happens again."}]'::jsonb,
 array['jobs.detail','po-email-intake','pending-review'],
 array['emails','chain','thread','po','reply'],
 array['/jobs/:id','src/components/jobs/JobEmailChain.tsx','supabase/functions/_shared/threadDedup.ts','supabase/functions/inbound-po-email/index.ts']),

('pending-review','/jobs','Pending Review (PO drafts)',
 'Inbox of PO emails that came in and are waiting for admin approval before becoming live jobs. Supports bulk actions.',
 '[{"heading":"Open the queue","items":[
    "Jobs page → filter chip Pending Review, or the Needs me today panel on the Dashboard."
  ]},{"heading":"Review a draft","items":[
    "Click a row to see the extracted PO, attached email/document and matched customer/site.",
    "Approve to convert to a live VFP- job, or Discard."
  ]},{"heading":"Bulk actions","items":[
    "Tick multiple drafts to Bulk approve, Bulk reassign customer, or Bulk discard."
  ]}]'::jsonb,
 '[{"problem":"Same PO appeared twice","fix":"Thread dedup normalisation now strips [EXTERNAL]/re:/fw: prefixes. Merge manually or raise a support ticket."}]'::jsonb,
 array['jobs','jobs.email-chain','po-email-intake'],
 array['pending','review','po','draft','bulk'],
 array['/jobs','src/pages/Jobs.tsx']),

('planner.show-toggle','/planner','Show on planner toggle',
 'Not every job needs a planner slot (e.g. office admin, quote follow-ups). Each job has a "Show on planner" toggle that controls whether it appears in the unscheduled column and calendar.',
 '[{"heading":"Toggle a job","items":[
    "Open the job → header or Actions menu → Show on planner.",
    "Off: the job is hidden from the Planner but still visible on Jobs.",
    "On: the job appears in Unscheduled until you drag it to an engineer/date."
  ]}]'::jsonb,
 '[{"problem":"A job I need to schedule isn''t on the planner","fix":"Open the job and switch Show on planner ON."}]'::jsonb,
 array['planner','jobs.detail'],
 array['planner','show','hide','toggle','unscheduled'],
 array['/planner','src/pages/WeeklyPlanner.tsx']),

('sign-off','/jobs/:id','Sign-off tab (engineer & customer)',
 'Capture engineer and customer signatures against a job. Signatures render as images in the Works Completion PDF, Word export and Remedial report.',
 '[{"heading":"Add a signature (desktop or mobile)","items":[
    "Open the job → Sign-off tab.",
    "Click Add signature (engineer or customer).",
    "Draw the signature, or pick Use saved signature if the signer has one in the engineer signature library.",
    "Save — name, date and drawn image are stored."
  ]},{"heading":"Remote customer sign-off","items":[
    "Click Send customer sign-off link — customer gets a 7-day link/QR to sign remotely.",
    "The remote signature appears in the same Sign-off tab once submitted."
  ]},{"heading":"Delete a signature (admin)","items":[
    "Admin sees a bin icon next to each signature — click to delete with confirmation.",
    "Removals are logged in the job activity feed."
  ]}]'::jsonb,
 '[{"problem":"Signature saved but the PDF shows just the name","fix":"Fixed — signatures now save the drawn image and render in the signature block. Regenerate the PDF from Actions."},{"problem":"Duplicate sign-off entries in the PDF","fix":"Admin can delete the extra entries from the Sign-off tab; the report also de-duplicates sensibly."}]'::jsonb,
 array['jobs.detail','settings.engineer-signatures','customer-portal'],
 array['sign off','signature','engineer','customer','remote'],
 array['/jobs/:id','src/components/SignatureCapture.tsx']),

('settings.email-branding','/settings','Email branding',
 'Logo, colours, sender name and accreditations applied to customer emails and PDF exports.',
 '[{"heading":"Configure","items":[
    "Sidebar → Settings → Email tab → Email branding.",
    "Upload logo, pick primary colour, add accreditations, set the display sender name.",
    "Click Send preview to email a test to yourself before rolling out to customers."
  ]}]'::jsonb,
 '[]'::jsonb,
 array['settings','settings.branding'],
 array['branding','logo','colours','email','header'],
 array['/settings','src/components/EmailBrandingSettings.tsx']),

('support-tickets','/admin/support-tickets','Support tickets',
 'Raise a support ticket when the in-app Help Assistant can''t answer a question or when something is broken. Admin-only page reached from the sidebar under the Admin section.',
 '[{"heading":"Raise a ticket","items":[
    "Sidebar → Support tickets (admin only, under the Admin section).",
    "Click New ticket, describe the issue with steps and screenshots.",
    "The Servexa team is notified by email."
  ]}]'::jsonb,
 '[]'::jsonb,
 array[]::text[],
 array['support','ticket','help','contact'],
 array['/admin/support-tickets','src/pages/SupportTickets.tsx'])

on conflict (slug) do update set
  route_pattern = excluded.route_pattern,
  title = excluded.title,
  purpose = excluded.purpose,
  steps = excluded.steps,
  common_problems = excluded.common_problems,
  related_slugs = excluded.related_slugs,
  keywords = excluded.keywords,
  source_paths = excluded.source_paths;