
INSERT INTO storage.buckets (id, name, public) VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'templates');

CREATE POLICY "Admins can manage templates"
ON storage.objects FOR ALL
USING (bucket_id = 'templates' AND EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
));
