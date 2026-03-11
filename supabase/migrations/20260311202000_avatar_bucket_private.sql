-- Lock down avatars bucket (private, tenant-scoped read)
UPDATE storage.buckets
SET public = false
WHERE id = 'avatars';

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;

CREATE POLICY "Tenant users can view tenant avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id::text = (storage.foldername(name))[1]
        AND p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
