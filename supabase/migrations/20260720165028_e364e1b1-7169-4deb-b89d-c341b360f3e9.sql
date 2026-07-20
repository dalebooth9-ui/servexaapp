INSERT INTO public.help_articles
  (slug, title, purpose, route_pattern, keywords, related_slugs, steps, common_problems, source_paths)
VALUES
  (
    'archive',
    'Archive (paper backlog)',
    'A library of historic paper reports that have been scanned and digitised for searching, but that do NOT create jobs, planner entries, or notifications. Use it for the "shoebox" of old completed sheets you just want on record.',
    '/archive',
    ARRAY['archive','archived','historic','backlog','scan','digitise','digitize','old paper','shoebox','where are archives'],
    ARRAY['jobs.paper-scan','paper-scan-queue','customers.detail'],
    $json$[
      {"heading":"Upload a paper backlog","items":[
        "Sidebar → Jobs → Archive Paper Backlog (button top-right of the Jobs list).",
        "Drop in one or many PDFs / photos. Multi-page PDFs are auto-split into one archive entry per sheet.",
        "Nothing gets scheduled — items land in the Paper Scan Queue on the Archive scans tab, ready to review."
      ]},
      {"heading":"Review and file","items":[
        "Paper Scan Queue → Archive scans tab shows every archived batch, newest first.",
        "Open an item to check the AI-detected customer, site, template type, and date, then Save to file.",
        "The system reads the letterhead / company logo at the top of the sheet — so subcontract paperwork on another company's branded form is filed to that company, not to yours."
      ]},
      {"heading":"Find a filed document","items":[
        "Open /archive from the sidebar (Archive).",
        "Filter by customer, site, template, or date; use the search box for keywords in extracted text.",
        "Every customer page also shows an Archived documents card with a count and a View all link that opens /archive pre-filtered to that customer."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"Archive item shows no pages in the preview","fix":"Open Paper Scan Queue and press Retry on the item — pages are re-fetched via the resilient submissions path resolver."},
      {"problem":"Wrong customer detected","fix":"On the review dialog, change the customer manually. Letterhead detection is a guess; the office staff always have the final say before filing."},
      {"problem":"I uploaded historic sheets but got a job scheduled","fix":"You used the standard Paper Scan intake instead of Archive Paper Backlog. Archive mode never creates jobs — always use the Archive Paper Backlog button on /jobs."}
    ]$json$::jsonb,
    ARRAY['src/pages/ArchivedDocuments.tsx','src/components/paper-scan/ArchiveReviewDialog.tsx','src/components/customers/CustomerArchivedDocumentsCard.tsx']
  ),
  (
    'industry-templates.import',
    'Import a template from a document',
    'Turn an existing Word (or PDF) form your team already uses into a draft template inside Servexa, without rebuilding it question by question.',
    '/industry-templates',
    ARRAY['import template','bring your own','word template','docx','upload form','existing form'],
    ARRAY['industry-templates'],
    $json$[
      {"heading":"Where to find it","items":[
        "Sidebar → Templates (Industry Templates).",
        "Top-right, next to + New blank template, click Import from document."
      ]},
      {"heading":"Upload the file","items":[
        "Drop in a .docx (best results) or PDF (rougher — you may need to tidy up).",
        "Servexa reads the form, guesses sections, questions, and answer types, and creates a Draft template in your organisation."
      ]},
      {"heading":"Review and publish","items":[
        "The draft opens in the template editor. Rename sections, fix any answer types, then Publish when you're happy.",
        "Drafts are only visible to your organisation until published."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"Some questions came in as plain text when they should be Yes/No","fix":"Open the question in the editor and change the answer type. Use the Quick presets for common ones (Yes/No, Pass/Fail)."},
      {"problem":"Import didn't recognise the layout","fix":"PDFs of scanned paper forms are hardest — try converting to Word first, or start from + New blank template and paste sections in."}
    ]$json$::jsonb,
    ARRAY['src/components/templates/ImportTemplateDialog.tsx','supabase/functions/parse-template-document/index.ts']
  ),
  (
    'jobs.today-hero',
    'Today on this job (engineer view)',
    'The big card at the top of a job for engineers — shows the job sheet report status, the main Fill in button, and (if the job has remedials) the remedial checklist beneath it. Office staff see the standard admin layout instead.',
    '/jobs/*',
    ARRAY['today on this job','fill in','engineer hero','report card','remedials','remedial checklist','where is fill in'],
    ARRAY['jobs.detail','jobs.sheets','jobs.remedial-checklist','sign-off'],
    $json$[
      {"heading":"What you see","items":[
        "A status chip (Not started / In progress / Submitted) plus a big Fill in button — the main way to fill the digital job sheet.",
        "If the job has remedial works, the checklist appears directly beneath the hero so nothing is missed.",
        "Once submitted, the button changes to View report and the sign-off step becomes prominent."
      ]},
      {"heading":"Signing off","items":[
        "The Fill in flow includes the engineer signature step inline.",
        "The customer signature is captured from the Sign-off tab (or the customer sign-off link)."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"I'm an office user and I don't see the hero","fix":"Correct — the hero is engineer-only. Office staff use the standard job detail tabs."},
      {"problem":"Two Fill in buttons","fix":"Fixed — the DocRow Fill In is suppressed for engineers so the hero is the single obvious path."}
    ]$json$::jsonb,
    ARRAY['src/components/engineer/EngineerJobHero.tsx','src/pages/JobDetail.tsx']
  ),
  (
    'jobs.completion-gate',
    'Soft completion gate (why am I being asked why I''m moving on?)',
    'A prompt engineers see when they try to open a new job while a previous one still looks unfinished. Prevents silent drift where reports get left half-done.',
    NULL,
    ARRAY['completion gate','why are you moving on','unfinished job','completion flag','soft gate'],
    ARRAY['jobs.detail','planner'],
    $json$[
      {"heading":"When it triggers","items":[
        "You start or open a job while another of your assigned jobs is still Active or In progress with no submitted report.",
        "It never triggers for jobs marked On hold, No access, or flagged as a Multi-day job."
      ]},
      {"heading":"What to pick","items":[
        "Choose the reason that matches: continuing tomorrow, waiting on parts, no access, customer stopped work, or Multi-day job (which suppresses the prompt for that job).",
        "Add a short note if it helps — it appears on the job for the office."
      ]},
      {"heading":"Where the office sees it","items":[
        "A Completion flags badge appears on jobs where an engineer left with a reason. Office can review reasons and clear or follow up.",
        "It's a soft gate — it does not block you, just records why."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"The prompt keeps appearing for the same job","fix":"Mark the job as Multi-day job on the prompt, or complete the report and submit it."}
    ]$json$::jsonb,
    ARRAY['src/components/engineer/EngineerCompletionGate.tsx','src/components/JobCompletionFlagsBadge.tsx']
  ),
  (
    'jobs.office-amendments',
    'Office amendments to submitted reports',
    'Admins can edit a submitted job sheet report before it goes to the customer. Every field change is logged, and if the report was already signed, the PDF shows an amended-after-sign-off note.',
    NULL,
    ARRAY['edit submitted report','amend report','office edit','fix report','change answer after submit','audit log report'],
    ARRAY['jobs.sheets','reports','sign-off'],
    $json$[
      {"heading":"How to amend","items":[
        "Open the job → Reports/Sheets tab → open the submitted report.",
        "Admins see an Edit toggle. Change answers, then Save."
      ]},
      {"heading":"What's logged","items":[
        "Every field change is stored (who, when, old value → new value) and shown in the job's history.",
        "If the customer or engineer signature was already captured, the exported PDF adds an amended-after-sign-off footnote against affected fields."
      ]},
      {"heading":"Engineer rule","items":[
        "Engineers cannot edit a report once they've submitted it. If a fix is needed, ask an admin to amend it."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"I'm an engineer and Edit is missing","fix":"That's intentional. Ask an admin to amend, or add a new visit if the whole report needs redoing."}
    ]$json$::jsonb,
    ARRAY['src/lib/logReportEdits.ts','src/components/JobPdfReport.tsx']
  ),
  (
    'billing',
    'Billing & subscription',
    'Where you activate, view, and manage your workspace subscription. Uses Stripe checkout in the background.',
    '/billing',
    ARRAY['billing','subscribe','subscription','stripe','plan','trial','trialing','past due','payment','user band'],
    ARRAY['settings'],
    $json$[
      {"heading":"Open Billing","items":[
        "Sidebar / user menu → Billing, or go to /billing.",
        "You'll see your workspace name, plan (10 / 25 / 50 users), price, and current status chip."
      ]},
      {"heading":"Subscribe","items":[
        "New workspaces show a Subscribe banner on the dashboard and on /billing.",
        "Click Subscribe — Stripe checkout opens in a new tab. On payment success the workspace unlocks automatically.",
        "Manage payment method, invoices, or cancel via the Billing portal button (also Stripe-hosted)."
      ]},
      {"heading":"What the status chips mean","items":[
        "trialing — free trial in progress, everything works.",
        "active — subscription is paid and current.",
        "past due — Stripe couldn't take payment. Open the Billing portal to update your card; workspace stays live for a grace period, then suspends.",
        "canceled / paused — access is limited to an Account paused screen until reactivated."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"Customer portal users being charged","fix":"They're not — external customer portal users are always free."},
      {"problem":"Founder rate not showing","fix":"Founder rate applies when a valid invite code was used at signup; it's shown as a green note on /billing when active."}
    ]$json$::jsonb,
    ARRAY['src/pages/BillingPage.tsx','src/components/billing/BillingCard.tsx','src/components/SubscriptionActivationBanner.tsx']
  ),
  (
    'customers.brand-colour',
    'Customer brand colour (auto-picked from logo)',
    'When you upload a customer logo, Servexa reads the dominant colour and uses it as the accent on that customer''s branded documents (reports, quotes, invoices). You can override it at any time.',
    '/customers/*',
    ARRAY['brand colour','brand color','accent colour','logo colour','swatch','customer branding'],
    ARRAY['customers.detail','settings.branding','reports'],
    $json$[
      {"heading":"How it's set","items":[
        "On the customer page, upload a logo — the swatch beside it auto-fills with the dominant colour.",
        "Existing customers with logos get their colour backfilled the first time a branded document is rendered."
      ]},
      {"heading":"Override","items":[
        "Tap the swatch to open the colour picker and choose your own. Manual overrides are always preserved — Servexa will never overwrite them from the logo again."
      ]},
      {"heading":"Where it appears","items":[
        "Header band, section titles, and accent lines on customer-branded PDFs (reports, quotes, invoices) when the customer branding profile is used.",
        "Neutral Servexa styling is used when no customer branding is selected."
      ]}
    ]$json$::jsonb,
    $json$[
      {"problem":"Colour looks wrong for a light/pastel logo","fix":"Tap the swatch and pick a darker shade manually — the auto-picker leans dominant, not necessarily readable on white."}
    ]$json$::jsonb,
    ARRAY['src/lib/extractLogoColors.ts','src/lib/documentBrandingProfile.ts','src/pages/CustomerDetail.tsx']
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  purpose = EXCLUDED.purpose,
  route_pattern = EXCLUDED.route_pattern,
  keywords = EXCLUDED.keywords,
  related_slugs = EXCLUDED.related_slugs,
  steps = EXCLUDED.steps,
  common_problems = EXCLUDED.common_problems,
  source_paths = EXCLUDED.source_paths,
  last_updated = now();

UPDATE public.help_articles
SET related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['archive'])),
    last_updated = now()
WHERE slug IN ('jobs','jobs.paper-scan','paper-scan-queue','customers.detail');

UPDATE public.help_articles
SET related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['industry-templates.import'])),
    last_updated = now()
WHERE slug = 'industry-templates';

UPDATE public.help_articles
SET related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['jobs.today-hero','jobs.completion-gate','jobs.office-amendments'])),
    last_updated = now()
WHERE slug = 'jobs.detail';

UPDATE public.help_articles
SET related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['billing'])),
    last_updated = now()
WHERE slug IN ('settings','dashboard');

UPDATE public.help_articles
SET related_slugs = ARRAY(SELECT DISTINCT unnest(related_slugs || ARRAY['customers.brand-colour'])),
    last_updated = now()
WHERE slug IN ('customers.detail','settings.branding');