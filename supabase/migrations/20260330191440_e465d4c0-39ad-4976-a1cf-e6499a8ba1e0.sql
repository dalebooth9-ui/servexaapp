
-- Fix security definer view warning by setting security_invoker = true
ALTER VIEW public.organisations_safe SET (security_invoker = true);
