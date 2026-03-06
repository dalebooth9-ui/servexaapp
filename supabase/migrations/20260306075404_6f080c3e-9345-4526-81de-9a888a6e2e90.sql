
CREATE TABLE public.ai_wizard_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_context text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_wizard_conversations_user_id_idx ON public.ai_wizard_conversations (user_id);

ALTER TABLE public.ai_wizard_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wizard conversation"
  ON public.ai_wizard_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wizard conversation"
  ON public.ai_wizard_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wizard conversation"
  ON public.ai_wizard_conversations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wizard conversation"
  ON public.ai_wizard_conversations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_wizard_conversations_updated_at
  BEFORE UPDATE ON public.ai_wizard_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
