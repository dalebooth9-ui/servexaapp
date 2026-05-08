
create table if not exists public.email_from_settings (
  email_type text primary key,
  from_name text not null default 'Servexa',
  from_address text not null,
  updated_at timestamptz not null default now()
);

alter table public.email_from_settings enable row level security;

create policy "Admins can view email from settings"
  on public.email_from_settings for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert email from settings"
  on public.email_from_settings for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update email from settings"
  on public.email_from_settings for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can delete email from settings"
  on public.email_from_settings for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

insert into public.email_from_settings (email_type, from_name, from_address) values
  ('default',        'Servexa',            'service@vivafire.co.uk'),
  ('customer',       'Viva Fire',          'service@vivafire.co.uk'),
  ('invoice',        'Viva Fire Accounts', 'sales@vivafire.co.uk'),
  ('reminder',       'Viva Fire Service',  'service@vivafire.co.uk'),
  ('onboarding',     'Servexa',            'info@vivafire.co.uk'),
  ('password_reset', 'Servexa',            'info@vivafire.co.uk'),
  ('weekly_report',  'Servexa Reports',    'info@vivafire.co.uk'),
  ('auto_schedule',  'Viva Fire Service',  'service@vivafire.co.uk'),
  ('test',           'Servexa',            'info@vivafire.co.uk')
on conflict (email_type) do nothing;
