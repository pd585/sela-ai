-- Defense in depth for private legal-document uploads.
-- The bucket is created during the setup flow before this migration is applied.
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
WHERE id = 'documents';

DROP POLICY IF EXISTS "Users upload own document files" ON storage.objects;

CREATE POLICY "Users upload own document files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND lower(storage.extension(name)) IN ('pdf', 'docx')
    AND COALESCE((metadata->>'size')::bigint, 0) <= 26214400
  );
