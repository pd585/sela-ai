CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  page_count integer NOT NULL DEFAULT 0,
  storage_path text,
  status text NOT NULL DEFAULT 'preparing',
  status_detail text NOT NULL DEFAULT 'Preparing your document',
  error_message text,
  overview jsonb,
  key_terms jsonb,
  clauses jsonb,
  issues jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own documents" ON public.documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own documents" ON public.documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  page_number integer NOT NULL DEFAULT 1,
  content text NOT NULL,
  embedding extensions.vector(3072),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_chunks_document_idx ON public.document_chunks (document_id, chunk_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_chunks TO authenticated;
GRANT ALL ON public.document_chunks TO service_role;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chunks" ON public.document_chunks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own chunks" ON public.document_chunks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own chunks" ON public.document_chunks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own chunks" ON public.document_chunks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.document_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  sufficient boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_questions_document_idx ON public.document_questions (document_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_questions TO authenticated;
GRANT ALL ON public.document_questions TO service_role;
ALTER TABLE public.document_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own questions" ON public.document_questions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own questions" ON public.document_questions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own questions" ON public.document_questions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own questions" ON public.document_questions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.match_document_chunks(
  p_document_id uuid,
  p_query_embedding extensions.vector(3072),
  p_match_count integer DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  chunk_index integer,
  page_number integer,
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT c.id, c.chunk_index, c.page_number, c.content,
         1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.document_id = p_document_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_document_chunks(uuid, extensions.vector, integer) TO authenticated, service_role;