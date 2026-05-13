-- Create organisation
INSERT INTO organisations (id, name, slug) VALUES ('11111111-1111-1111-1111-111111111111', 'Viva Fire', 'viva-fire');

-- Add engineer to org
INSERT INTO organisation_members (org_id, user_id, role, status) VALUES ('11111111-1111-1111-1111-111111111111', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'engineer', 'active');

-- Insert 6 test jobs
INSERT INTO jobs (id, reference_number, name, customer, address, status, priority, category, job_type, pressure_test_qty, visual_qty, other_qty, customer_id, site_id, org_id, source, created_at, updated_at, brief, due_date) VALUES
-- Job 1: Active PPM dry riser
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'VFP-00001', 'Monthly dry riser inspection', 'John Shepherd', '12 High Street, Manchester, M1 1AA', 'active', 'medium', 'dry_riser', 'one_off', 0, 0, 0, '3abbcede-aeb8-49c4-9e15-004ddda2320f', '2e3d203e-6c6b-4c84-b14d-6119cadc2c13', '11111111-1111-1111-1111-111111111111', 'manual', now(), now(), 'Inspect dry riser inlet and outlets. Check valves, caps and signage.', '2026-05-15'),
-- Job 2: In progress fire alarm test
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'VFP-00002', 'Fire alarm 6-monthly service', 'Kelida Solutions', 'Unit 4, Industrial Park, Leeds LS10 1RT', 'in_progress', 'high', 'fire_alarm', 'one_off', 0, 0, 0, 'a179aab8-c156-4404-bf30-80c135e54eba', '2d0ee4ef-a26e-4743-9f2a-54038f7d2c10', '11111111-1111-1111-1111-111111111111', 'manual', now(), now(), 'Full functional test of fire alarm panel, detectors and sounders.', '2026-05-14'),
-- Job 3: Completed extinguisher check
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'VFP-00003', 'Extinguisher annual service', 'Kingsley Health Care', 'Care Home Lane, Sheffield S1 2AB', 'completed', 'medium', 'extinguisher', 'one_off', 0, 0, 0, 'c873d471-fd3f-4b6e-bf51-a613e625a80c', '41bc59bb-16de-4ab5-9de6-f1086e894aeb', '11111111-1111-1111-1111-111111111111', 'manual', now() - interval '3 days', now() - interval '3 days', 'Service all portable extinguishers and update asset tags.', '2026-05-10'),
-- Job 4: Scheduled sprinkler PPM
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'VFP-00004', 'Sprinkler system quarterly check', 'John Shepherd', '12 High Street, Manchester, M1 1AA', 'scheduled', 'low', 'sprinkler', 'one_off', 0, 0, 0, '3abbcede-aeb8-49c4-9e15-004ddda2320f', '2e3d203e-6c6b-4c84-b14d-6119cadc2c13', '11111111-1111-1111-1111-111111111111', 'manual', now(), now(), 'Check sprinkler heads, flow switches and pump operation.', '2026-05-20'),
-- Job 5: Awaiting parts emergency lighting
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'VFP-00005', 'Emergency lighting 3-yearly test', 'Kelida Solutions', 'Unit 4, Industrial Park, Leeds LS10 1RT', 'awaiting_parts', 'high', 'emergency_lighting', 'one_off', 0, 0, 0, 'a179aab8-c156-4404-bf30-80c135e54eba', '2d0ee4ef-a26e-4743-9f2a-54038f7d2c10', '11111111-1111-1111-1111-111111111111', 'manual', now() - interval '1 day', now() - interval '1 day', 'Duration test all emergency luminaires and record lux readings.', '2026-05-12'),
-- Job 6: On hold - fire door repair
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'VFP-00006', 'Fire door survey and repair', 'Kingsley Health Care', 'Care Home Lane, Sheffield S1 2AB', 'on_hold', 'medium', 'passive_fire', 'one_off', 0, 0, 0, 'c873d471-fd3f-4b6e-bf51-a613e625a80c', '41bc59bb-16de-4ab5-9de6-f1086e894aeb', '11111111-1111-1111-1111-111111111111', 'manual', now(), now(), 'Survey 12 fire doors. Replacement seals ordered, awaiting delivery.', '2026-05-18');

-- Assign engineer to all jobs
INSERT INTO job_assignments (job_id, engineer_id, assigned_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now() - interval '5 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now() - interval '2 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'c18545e1-ee6b-4605-972a-d72b59a3e232', now());

-- Add visits for jobs
INSERT INTO job_visits (job_id, engineer_id, scheduled_date, scheduled_time, status, notes, completed_at, created_at, updated_at) VALUES
-- Job 1 visits (upcoming)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-15', '09:00', 'upcoming', 'Bring riser key', null, now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-20', '14:00', 'upcoming', 'Revisit if faults found', null, now(), now()),
-- Job 2 visits (overdue + upcoming)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-12', '08:30', 'overdue', 'Panel showing zone 4 fault', null, now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-14', '10:00', 'upcoming', 'Return visit to clear fault', null, now(), now()),
-- Job 3 visits (completed)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-10', '09:00', 'completed', 'All 18 extinguishers serviced. 2 need replacement.', '2026-05-10T15:30:00Z', now(), now()),
-- Job 4 visit (unscheduled)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-20', null, 'unscheduled', 'Coordinate with site manager', null, now(), now()),
-- Job 5 visits (completed + upcoming)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-12', '07:00', 'completed', '3 units failed duration test. Report submitted.', '2026-05-12T16:00:00Z', now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-19', '09:00', 'upcoming', 'Return to replace failed units', null, now(), now()),
-- Job 6 visit (cancelled)
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'c18545e1-ee6b-4605-972a-d72b59a3e232', '2026-05-13', '11:00', 'cancelled', 'Awaiting parts delivery - reschedule next week', null, now(), now());

-- Add activity log entries for visual interest
INSERT INTO job_activity_log (job_id, user_id, action, details, created_at) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'note', 'Called site contact — confirmed access for Friday.', now() - interval '1 day'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'status_change', 'Job created and assigned', now() - interval '2 days'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'visit_update', 'First visit on 2026-05-12 marked overdue — zone 4 fault persists.', now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'note', 'Ordered replacement detector head from supplier.', now() - interval '1 day'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'submission', 'Job sheet submitted with photos of damaged extinguishers.', '2026-05-10T16:00:00Z'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'status_change', 'Status changed from in_progress to completed', '2026-05-10T15:45:00Z'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'submission', 'Emergency lighting test report uploaded.', '2026-05-12T16:30:00Z'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'status_change', 'Status changed from in_progress to awaiting_parts', '2026-05-12T16:00:00Z'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'c18545e1-ee6b-4605-972a-d72b59a3e232', 'note', 'Fire door seals ordered — ETA 3 working days.', now() - interval '1 day');