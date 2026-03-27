
-- Add templates for dry_riser_visual (currently only under 'visual' slug)
INSERT INTO category_document_templates (category_slug, document_type, label, sort_order, enabled)
SELECT 'dry_riser_visual', document_type, label, sort_order, enabled
FROM category_document_templates WHERE category_slug = 'visual'
ON CONFLICT DO NOTHING;

-- Add templates for wet_riser_visual  
INSERT INTO category_document_templates (category_slug, document_type, label, sort_order, enabled)
SELECT 'wet_riser_visual', document_type, label, sort_order, enabled
FROM category_document_templates WHERE category_slug = 'visual'
ON CONFLICT DO NOTHING;

-- Add templates for wet_riser_annual_service
INSERT INTO category_document_templates (category_slug, document_type, label, sort_order, enabled)
SELECT 'wet_riser_annual_service', document_type, label, sort_order, enabled
FROM category_document_templates WHERE category_slug = 'visual'
ON CONFLICT DO NOTHING;

-- Add templates for fire_hydrant_service (maps to hydrant_service)
INSERT INTO category_document_templates (category_slug, document_type, label, sort_order, enabled)
SELECT 'fire_hydrant_service', document_type, label, sort_order, enabled
FROM category_document_templates WHERE category_slug IN ('hydrant_service', 'fire_hydrant') 
ON CONFLICT DO NOTHING;
