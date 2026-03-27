-- Remove duplicate sites (same name + same parent within a customer folder, no children, no jobs) keeping the earliest
WITH dupes AS (
  SELECT cs.customer_id, s.name, s.parent_id, 
    array_agg(s.id ORDER BY s.created_at) as site_ids
  FROM customer_sites cs
  JOIN sites s ON s.id = cs.site_id
  GROUP BY cs.customer_id, s.name, s.parent_id
  HAVING count(*) > 1
),
removable_dupes AS (
  SELECT unnest(d.site_ids[2:]) as site_id
  FROM dupes d
),
dupe_ids AS (
  SELECT rd.site_id FROM removable_dupes rd
  WHERE NOT EXISTS (SELECT 1 FROM sites ch WHERE ch.parent_id = rd.site_id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.site_id = rd.site_id)
),
-- Also remove sites that match customer name exactly with no children/jobs
customer_name_matches AS (
  SELECT s.id as site_id
  FROM customer_sites cs
  JOIN sites s ON s.id = cs.site_id
  JOIN customers c ON c.id = cs.customer_id
  WHERE s.name = c.name
    AND NOT EXISTS (SELECT 1 FROM sites ch WHERE ch.parent_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.site_id = s.id)
),
all_removable AS (
  SELECT site_id FROM dupe_ids
  UNION
  SELECT site_id FROM customer_name_matches
)
DELETE FROM customer_sites WHERE site_id IN (SELECT site_id FROM all_removable);

-- Now delete the orphaned site records
WITH dupes AS (
  SELECT cs.customer_id, s.name, s.parent_id, 
    array_agg(s.id ORDER BY s.created_at) as site_ids
  FROM customer_sites cs
  JOIN sites s ON s.id = cs.site_id
  GROUP BY cs.customer_id, s.name, s.parent_id
  HAVING count(*) > 1
),
removable_dupes AS (
  SELECT unnest(d.site_ids[2:]) as site_id
  FROM dupes d
),
dupe_ids AS (
  SELECT rd.site_id FROM removable_dupes rd
  WHERE NOT EXISTS (SELECT 1 FROM sites ch WHERE ch.parent_id = rd.site_id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.site_id = rd.site_id)
),
customer_name_matches AS (
  SELECT s.id as site_id
  FROM customer_sites cs
  JOIN sites s ON s.id = cs.site_id
  JOIN customers c ON c.id = cs.customer_id
  WHERE s.name = c.name
    AND NOT EXISTS (SELECT 1 FROM sites ch WHERE ch.parent_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.site_id = s.id)
),
all_removable AS (
  SELECT site_id FROM dupe_ids
  UNION
  SELECT site_id FROM customer_name_matches
)
DELETE FROM sites WHERE id IN (SELECT site_id FROM all_removable)
  AND NOT EXISTS (SELECT 1 FROM customer_sites cs2 WHERE cs2.site_id = sites.id);